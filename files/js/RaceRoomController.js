/**
 * 函数棋 - Function Chess
 * Copyright (C) 2024 shaihai-studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * RaceRoomController - 竞速对战多人房间控制器（2-4 人）
 *
 * 与 1v1 的 P2PController 完全隔离、互不影响。拓扑为「星型」：
 *   - 房主：创建 Peer（id 固定为 race_<房间码>），接受最多 3 个访客连接；
 *   - 访客：创建随机 Peer，主动连接房主；
 *   - 消息互通：访客 → 房主直连；访客 → 其他访客 由房主转发。
 *
 * 断线重连（方案 A，60 秒宽限）：
 *   - 任意一端 PeerJS 信令丢失 → 对局不暂停，其余玩家继续；
 *   - 访客断线：房主端把该访客标记为 disconnected 并广播给其他访客，
 *     访客在 60s 内重连（重新建立 DataChannel + 身份握手）即恢复；
 *   - 房主断线：房主 Peer 仍保留（重连信令），访客端在 60s 内重连房主；
 *   - 超过 60s 仍未恢复的连接将被移除（访客判弃权由上层决定）。
 *
 * 协议（DataChannel 消息，与 MatchLobby 大厅协议完全独立）：
 *   - race_hello    { playerId, nickname }             访客 → 房主（连接建立后身份握手）
 *   - race_welcome  { myPlayerId, members }            房主 → 访客（握手回执，含成员快照）
 *   - race_msg      { from, payload, broadcast }       任意 → 房主/房主 → 访客（通用消息）
 *   - race_member_joined { member }                    房主 → 全部访客（新成员加入）
 *   - race_member_left   { member }                    房主 → 全部访客（成员被移除）
 *   - race_member_state  { member }                    房主 → 全部访客（成员连接状态变化）
 *   - race_close    { reason }                         房主 → 全部访客（房间解散）
 *   - race_hello_ack { ok, reason }                    房主 → 访客（满员等拒绝）
 *
 * 成员模型：members 数组 [{ playerId, nickname, isHost, connected, slot }]
 *   slot 由房主分配：0=房主，1..N=访客序号。
 */
class RaceRoomController {
    // ─── 静态配置（与 P2PController 共用同一信令服务器） ─────────────

    static get signaling() {
        if (typeof P2PController !== 'undefined' && P2PController.signaling) {
            return P2PController.signaling;
        }
        return { host: 'localhost', port: 9000, path: '/peerjs', secure: false, debug: 0 };
    }

    /** 懒加载 PeerJS：优先用本地 vendor，失败回退 CDN */
    static ensurePeerJs() {
        return new Promise((resolve, reject) => {
            if (typeof Peer !== 'undefined') { resolve(); return; }
            const base = (window.location.protocol === 'https:') ? 'https' : 'http';
            const cdn = `${base}://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js`;
            const vendor = `${base}://${RaceRoomController.signaling.host}:${RaceRoomController.signaling.port}/peerjs/peerjs.min.js`;
            let tried = 0;
            const load = (url) => {
                if (tried >= 3) { reject(new Error('PeerJS 加载失败')); return; }
                tried++;
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => resolve();
                s.onerror = () => load(tried === 1 ? cdn : vendor);
                document.head.appendChild(s);
            };
            load(vendor);
        });
    }

    /** 拉取 STUN/TURN 配置（复用 P2PController 的 HTTP 端点，失败则用公共 STUN） */
    static async _fetchIceServers() {
        try {
            if (typeof P2PController !== 'undefined' && P2PController._fetchIceServers) {
                return await P2PController._fetchIceServers();
            }
        } catch (e) { /* 忽略，走回退 */ }
        return [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    constructor() {
        this.peer = null;
        this.role = null;             // 'host' | 'guest'
        this.isHost = false;
        this.roomCode = '';
        this.roomMode = 'casual';     // 'ranked' | 'casual'（房主建房/访客加入时确定，握手校验）
        this.myPlayerId = '';
        this.myNickname = '';
        this.maxPlayers = 4;          // 2-4
        this.members = [];            // [{playerId,nickname,isHost,connected,slot}]

        // ── 连接管理 ─────────────────────────────────────────
        this._guestConns = new Map(); // host: peerId -> DataConnection
        this._guestPlayerId = new Map(); // host: peerId -> playerId
        this._hostConn = null;        // guest: 与房主的连接
        this.isConnected = false;
        this.isConnecting = false;
        this._disconnecting = false;
        this._selfSignalLost = false;
        this._creating = false;       // createRoom 进行中（U5 防重入）
        this._joining = false;        // joinRoom 进行中（U5 防重入）

        // ── 断线重连（60s 宽限） ─────────────────────────────
        this._reconnecting = false;
        this._reconnectTimer = null;
        this._reconnectAttempts = 0;
        this._reconnectTimeoutMs = 3000;
        this._maxReconnectAttempts = 20; // 20 × 3s ≈ 60s
        this._reconnectPaused = false;
        this._guestReconnectTimers = new Map(); // host: playerId -> timer（60s 后移除）

        // ── 心跳（2026-08-12 房主大退检测：互发 ping/pong 确认在线） ──
        this._hbTimer = null;            // 3s 发送定时器
        this._hostLastSeen = 0;          // guest: 房主最后活跃时间戳
        this._guestLastSeen = new Map(); // host: peerId -> 最后活跃时间戳
        this._hbIntervalMs = 3000;       // 每 3s 互发一次 ping（更快感知掉线）
        this._hbStaleMs = 9000;          // 9s 无响应视为失联（3 个 ping 周期）

        // ── 房间解散标记 ─────────────────────────────────────
        this._roomClosed = false;

        // ── 房主迁移（host migration） ────────────────────────
        this._promoting = false;          // 访客正在尝试升级为新房主
        this._oldHostPlayerId = null;     // host: 迁移前的旧房主 playerId（拒绝其重入）

        // ── 已踢出玩家 ID 集合（host only，防止重入） ──────────
        this._kickedPlayerIds = new Set();

        // ── 回调（由上层 UI 注入） ───────────────────────────
        this.onStatusChange = null;        // (status, msg) => void  status: connecting/connected/disconnected/error
        this.onConnected = null;           // () => void 握手完成、members 就绪
        this.onMembersUpdate = null;       // (members) => void 成员列表变化（含连接状态）
        this.onMemberJoined = null;        // (member) => void
        this.onMemberLeft = null;          // (member) => void
        this.onMemberState = null;         // (member) => void 连接状态变化
        this.onMessage = null;             // (payload, fromPlayerId) => void 通用消息
        this.onRoomClosed = null;          // (reason) => void
        this.onReconnectingChange = null;  // (bool) => void
        this.onReconnected = null;         // () => void 重连成功
        this.onReconnectFailed = null;     // () => void 60s 重连失败
        this.onHostLost = null;            // (reason) => void 访客感知房主退出（'conn_closed'掉线 | 'host_dissolved'主动解散），迁移由上层处理
    }

    // ─── 状态通知 ────────────────────────────────────────────

    _notifyStatus(status, msg) {
        if (this.onStatusChange) {
            try { this.onStatusChange(status, msg); } catch (e) { console.error(e); }
        }
    }

    // ─── 公开 API ────────────────────────────────────────────

    /** 房主建房。options: { roomCode, maxPlayers, playerId, nickname, mode } */
    async createRoom(options = {}) {
        // U5: 防重入——创建/加入任一异步进行中时拒绝重复调用，避免重复 new Peer/回调互相覆盖。
        // 注意：_creating 由 _doCreateRoom 在 peer.open/error/同步异常路径统一释放（见下），
        // 不能放 finally——因为 _doCreateRoom 在 new Peer 后立即 resolve（peer.open 是异步回调），
        // finally 过早释放会让「建房中」整个窗口失去防护。
        if (this._creating || this._joining) return false;
        this._creating = true;
        return await this._doCreateRoom(options);
    }

    async _doCreateRoom(options = {}) {
        await RaceRoomController.ensurePeerJs();
        const normalized = String(options.roomCode || '').trim().replace(/[^0-9]/g, '');
        if (normalized.length !== 6) {
            this._creating = false; // U5: 提前失败也要释放锁
            this._notifyStatus('error', '房间码必须是6位数字');
            return false;
        }
        this._resetState();
        this._creating = true; // U5: _resetState() 会清 _creating，重新加锁以覆盖整个建房期（直到 peer.open/error）
        this.role = 'host';
        this.isHost = true;
        this.roomCode = normalized;
        this.roomMode = (options.mode === 'ranked') ? 'ranked' : 'casual';
        this.maxPlayers = Math.min(4, Math.max(2, Number(options.maxPlayers) || 4));
        this.myPlayerId = String(options.playerId || 'host_' + normalized);
        this.myNickname = String(options.nickname || '房主');
        this.members = [{
            playerId: this.myPlayerId,
            nickname: this.myNickname,
            isHost: true,
            connected: true,
            slot: 0
        }];
        this.isConnecting = true;
        this._notifyStatus('connecting', '正在创建房间...');

        try {
            const iceServers = await RaceRoomController._fetchIceServers();
            if (!this.isConnecting) { this._creating = false; return false; } // U5: 取消路径释放锁
            const sig = RaceRoomController.signaling;
            const hostId = 'race_' + normalized;
            this.peer = new Peer(hostId, {
                debug: sig.debug,
                host: sig.host,
                port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer.on('open', () => {
                this._creating = false; // U5: 建房完成，释放锁
                this.isConnecting = false;
                this._notifyStatus('connected', '房间已创建，等待玩家加入...');
                this._handleReconnectSuccess();
                this._startHeartbeat();
                // 房主创建房间成功即同步成员快照（与访客端 joinRoom 收到 welcome 后一致），
                // 否则房主端成员列表永远为空、看不到自己也看不到昵称
                if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                if (this.onConnected) this.onConnected();
            });
            this.peer.on('connection', (conn) => this._setupGuestConn(conn));
            this.peer.on('error', (err) => {
                this._creating = false; // U5: 建房失败，释放锁（error 后不会再 open）
                this._handlePeerError(err);
            });
            this.peer.on('disconnected', () => {
                if (this._disconnecting) return;
                this._selfSignalLost = true;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
            return true;
        } catch (err) {
            this._creating = false; // U5: 同步异常也释放锁
            this._handlePeerError(err);
            return false;
        }
    }

    /** 访客加入。options: { roomCode, playerId, nickname, mode } */
    async joinRoom(options = {}) {
        // U5: 防重入——与 createRoom 互斥，避免创建/加入并发互相覆盖 _rbIsHost/_rbMyId。
        // _joining 由 _doJoinRoom 在 peer.open/error/同步异常路径统一释放（覆盖整个加入期）。
        if (this._creating || this._joining) return false;
        this._joining = true;
        return await this._doJoinRoom(options);
    }

    async _doJoinRoom(options = {}) {
        await RaceRoomController.ensurePeerJs();
        const normalized = String(options.roomCode || '').trim().replace(/[^0-9]/g, '');
        if (normalized.length !== 6) {
            this._joining = false; // U5: 提前失败也要释放锁
            this._notifyStatus('error', '房间码必须是6位数字');
            return false;
        }
        this._resetState();
        this._joining = true; // U5: _resetState() 会清 _joining，重新加锁覆盖整个加入期
        this.role = 'guest';
        this.isHost = false;
        this.roomCode = normalized;
        this.roomMode = (options.mode === 'ranked') ? 'ranked' : 'casual';
        this.myPlayerId = String(options.playerId || 'guest_' + Math.random().toString(36).substr(2, 9));
        this.myNickname = String(options.nickname || '玩家');
        this.members = [];
        this.isConnecting = true;
        this._notifyStatus('connecting', '正在连接房间...');

        try {
            const iceServers = await RaceRoomController._fetchIceServers();
            if (!this.isConnecting) { this._joining = false; return false; } // U5: 取消路径释放锁
            const sig = RaceRoomController.signaling;
            const guestId = 'rg_' + Math.random().toString(36).substr(2, 9);
            this.peer = new Peer(guestId, {
                debug: sig.debug,
                host: sig.host,
                port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer.on('open', () => {
                this._joining = false; // U5: 加入完成，释放锁
                this._startHeartbeat();
                const conn = this.peer.connect('race_' + normalized, { reliable: true });
                this._setupHostConn(conn);
            });
            this.peer.on('error', (err) => {
                this._joining = false; // U5: 加入失败，释放锁
                this._handlePeerError(err);
            });
            this.peer.on('disconnected', () => {
                if (this._disconnecting) return;
                this._selfSignalLost = true;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
            return true;
        } catch (err) {
            this._joining = false; // U5: 同步异常也释放锁
            this._handlePeerError(err);
            return false;
        }
    }

    // ─── 房主迁移（host migration）────────────────────────────

    /**
     * 访客侧：升级为新房主。销毁旧访客 Peer → 重建 Peer 'race_<房间码>' → 恢复成员快照。
     * 其他访客通过现有重连循环自动连上来（_setupGuestConn → race_hello 握手）。
     * @returns {Promise<boolean>} 成功接管返回 true；已有新房主（unavailable-id）或失败返回 false。
     */
    async promoteToHost() {
        if (this.isHost || this._disconnecting || this._promoting) return false;
        if (!this.roomCode) return false;
        await RaceRoomController.ensurePeerJs();
        // 停止访客重连循环，进入升级流程
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._reconnecting = false;
        if (this.onReconnectingChange) this.onReconnectingChange(false);
        this._promoting = true;
        this._disconnecting = true;
        // 记住旧房主（迁移后拒绝其重入）
        const oldHost = this.members.find(m => m.isHost);
        this._oldHostPlayerId = oldHost ? oldHost.playerId : null;
        // 关闭旧访客连接并销毁旧 Peer
        if (this._hostConn) { try { this._hostConn.close(); } catch (e) {} }
        this._hostConn = null;
        this.isConnected = false;
        if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch (e) {} }
        this.peer = null;
        this._disconnecting = false;
        // 成员快照：自己升级为房主(slot 0)，其余成员标记待重连
        const myId = this.myPlayerId;
        const myNick = this.myNickname;
        let me = this.members.find(m => m.playerId === myId);
        if (me) {
            me.isHost = true; me.connected = true; me.slot = 0;
        } else {
            this.members.unshift({ playerId: myId, nickname: myNick, isHost: true, connected: true, slot: 0 });
        }
        for (const m of this.members) {
            if (m.playerId !== myId) { m.isHost = false; m.connected = false; }
        }
        // 重建房主 Peer（id 唯一性天然仲裁：多个访客同时 promote 只会有一个成功）
        const iceServers = await RaceRoomController._fetchIceServers();
        const sig = RaceRoomController.signaling;
        const hostId = 'race_' + this.roomCode;
        const self = this;
        return await new Promise((resolve) => {
            let settled = false;
            const done = (ok) => { if (settled) return; settled = true; self._promoting = false; resolve(ok); };
            const p = new Peer(hostId, {
                debug: sig.debug,
                host: sig.host,
                port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer = p;
            this.isConnecting = true;
            this._notifyStatus('connecting', '正在接管房间...');
            p.on('open', () => {
                this.isConnecting = false;
                this.role = 'host';
                this.isHost = true;
                this.isConnected = true;
                this._notifyStatus('connected', '已接管房间，等待其他玩家重连...');
                this._handleReconnectSuccess();
                this._startHeartbeat();
                if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                if (this.onConnected) this.onConnected();
                done(true);
            });
            p.on('connection', (conn) => this._setupGuestConn(conn));
            p.on('disconnected', () => {
                if (this._disconnecting) return;
                this._selfSignalLost = true;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
            p.on('error', (err) => {
                console.error('[RaceRoom] promoteToHost error', err);
                if (err && err.type === 'unavailable-id') {
                    // 已有其他访客抢先接管 → 降级为访客，继续重连新房主
                    this.isConnecting = false;
                    this.role = 'guest';
                    this.isHost = false;
                    this.isConnected = false;
                    if (me) { me.isHost = false; me.connected = false; }
                    if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch (e) {} }
                    this.peer = null;
                    // 关键修复：重建随机访客 Peer，否则 _scheduleReconnectAttempt 因 peer 为 null
                    // 第一步就 _giveUpReconnect，导致本访客永远连不回新房主（迁移"有时卡死"根因）
                    this._rebuildGuestPeer(iceServers);
                    this._startReconnect();
                    done(false);
                } else {
                    this._handlePeerError(err);
                    done(false);
                }
            });
        });
    }

    /** 访客 promote 失败后重建随机访客 Peer（供 _scheduleReconnectAttempt 重连新房主）。
     *  promoteToHost 已把 peer 销毁置 null，若不重建，重连循环会在第一步就放弃。
     *  @param {Array} iceServers 复用 promoteToHost 已获取的 ICE 服务器列表 */
    _rebuildGuestPeer(iceServers) {
        const sig = RaceRoomController.signaling;
        const guestId = 'rg_' + Math.random().toString(36).substr(2, 9);
        const self = this;
        this.peer = new Peer(guestId, {
            debug: sig.debug,
            host: sig.host,
            port: sig.port,
            path: sig.path,
            secure: sig.secure,
            config: { iceServers }
        });
        this.peer.on('open', () => {
            self._startHeartbeat();
            // 不主动 connect：交给 _scheduleReconnectAttempt 周期连接新房主
        });
        this.peer.on('error', (err) => self._handlePeerError(err));
        this.peer.on('disconnected', () => {
            if (self._disconnecting) return;
            self._selfSignalLost = true;
            if (self.peer && !self.peer.destroyed) self.peer.reconnect();
        });
    }

    // ─── 连接建立 ────────────────────────────────────────────

    /** 房主侧：处理访客的连接 */
    _setupGuestConn(conn) {
        const peerId = conn.peer;
        // 满员检查：已连接的访客数 >= maxPlayers-1 时拒绝
        if (this.members.filter(m => !m.isHost && m.connected).length >= this.maxPlayers - 1) {
            conn.on('open', () => {
                try { conn.send({ type: 'race_hello_ack', ok: false, reason: 'room_full' }); } catch (e) {}
                setTimeout(() => { try { conn.close(); } catch (e) {} }, 300);
            });
            return;
        }
        this._guestConns.set(peerId, conn);
        conn.on('open', () => {
            this._guestLastSeen.set(peerId, Date.now());
            /* 等待 race_hello 完成身份握手 */
        });
        conn.on('data', (data) => this._handleHostSideMessage(conn, data));
        conn.on('close', () => this._handleGuestConnClosed(conn));
        conn.on('error', () => this._handleGuestConnClosed(conn));
    }

    /** 房主侧：处理访客发来的消息 */
    _handleHostSideMessage(conn, data) {
        if (!data || !data.type) return;
        // 心跳：任意消息到达都视为该访客在线（更新最后活跃时间）
        if (conn && conn.peer) this._guestLastSeen.set(conn.peer, Date.now());
        if (this._reconnecting && data.type === 'race_hello') {
            // 重连期间收到握手 → 视为重连成功，解除房主端重连状态
            this._handleReconnectSuccess();
        }
        switch (data.type) {
            case 'race_ping':
                // 访客 ping → 回 pong（心跳确认在线）
                try { conn.send({ type: 'race_pong' }); } catch (e) {}
                break;
            case 'race_pong':
                break;
            case 'race_hello': {
                const playerId = String(data.playerId || '');
                // 已被踢出的玩家禁止重入
                if (this._kickedPlayerIds && this._kickedPlayerIds.has(playerId)) {
                    try {
                        conn.send({ type: 'race_hello_ack', ok: false, reason: 'kicked' });
                    } catch (e) {}
                    setTimeout(function() { try { conn.close(); } catch (e) {} }, 300);
                    return;
                }
                // 房主迁移后，旧房主尝试重入：
                // - 仍保留在成员列表（60s 宽限内）→ 放行，降为普通成员续局（_oldHostPlayerId 置空后走下方 member 分支）
                // - 已被移除（超时）→ 拒绝并提示恢复失败
                if (this._oldHostPlayerId && playerId === this._oldHostPlayerId) {
                    const oldMember = this.members.find(m => m.playerId === playerId);
                    if (!oldMember) {
                        try {
                            conn.send({ type: 'race_hello_ack', ok: false, reason: 'host_migrated' });
                        } catch (e) {}
                        setTimeout(function() { try { conn.close(); } catch (e) {} }, 300);
                        return;
                    }
                    // 放行：旧房主以普通成员身份重入
                    this._oldHostPlayerId = null;
                }
                // 排位/休闲模式隔离：访客选择的模式与房间不符 → 拒绝加入并提示
                const guestMode = String(data.mode || 'casual');
                if (guestMode !== this.roomMode) {
                    try {
                        conn.send({ type: 'race_hello_ack', ok: false, reason: 'mode_mismatch' });
                    } catch (e) {}
                    setTimeout(function() { try { conn.close(); } catch (e) {} }, 300);
                    return;
                }
                const nickname = String(data.nickname || '玩家');
                if (!playerId) return;
                const peerId = conn.peer;
                this._guestPlayerId.set(peerId, playerId);
                // 若该玩家已在成员列表（断线重连）→ 更新连接状态
                let member = this.members.find(m => m.playerId === playerId);
                if (member) {
                    member.connected = true;
                    member.nickname = nickname;
                    this._clearGuestReconnectTimer(playerId);
                    // race_hello 能到达说明 DataChannel 已 open，直接发送回执
                    try {
                        conn.send({
                            type: 'race_welcome',
                            myPlayerId: playerId,
                            members: this._membersSnapshot()
                        });
                    } catch (e) {}
                    this._broadcast({ type: 'race_member_state', member }, playerId);
                    if (this.onMemberState) this.onMemberState(member);
                    if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                } else {
                    // 新访客加入
                    if (this.members.filter(m => !m.isHost && m.connected).length >= this.maxPlayers - 1) {
                        try {
                            conn.send({ type: 'race_hello_ack', ok: false, reason: 'room_full' });
                        } catch (e) {}
                        setTimeout(() => { try { conn.close(); } catch (e) {} }, 300);
                        return;
                    }
                    const slot = this.members.length;
                    member = { playerId, nickname, isHost: false, connected: true, slot };
                    this.members.push(member);
                    try {
                        conn.send({
                            type: 'race_welcome',
                            myPlayerId: playerId,
                            members: this._membersSnapshot()
                        });
                    } catch (e) {}
                    this._broadcast({ type: 'race_member_joined', member }, playerId);
                    if (this.onMemberJoined) this.onMemberJoined(member);
                    if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                }
                break;
            }
            case 'race_msg':
                if (this.onMessage) {
                    const from = this._guestPlayerId.get(conn.peer) || '';
                    try { this.onMessage(data.payload || {}, from); } catch (e) { console.error(e); }
                }
                // 需要广播的消息转发给其他访客
                if (data.broadcast) {
                    this._broadcast({ type: 'race_msg', from: this._guestPlayerId.get(conn.peer) || '', payload: data.payload }, conn.peer);
                }
                break;
            default:
                break;
        }
    }

    /** 房主侧：访客连接关闭 */
    _handleGuestConnClosed(conn) {
        const peerId = conn.peer;
        if (this._disconnecting) return;
        if (!this._guestConns.has(peerId)) return;
        this._guestConns.delete(peerId);
        const playerId = this._guestPlayerId.get(peerId);
        this._guestPlayerId.delete(peerId);
        if (!playerId) return;
        const member = this.members.find(m => m.playerId === playerId);
        if (!member) return;
        member.connected = false;
        // 广播断线状态（对局不暂停），并启动 60s 宽限定时器
        this._broadcast({ type: 'race_member_state', member }, playerId);
        if (this.onMemberState) this.onMemberState(member);
        if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
        this._scheduleGuestReconnectTimer(playerId);
    }

    /** 房主踢出指定玩家（彻底关闭连接 + 广播 member_left + 禁止重入） */
    kickMember(playerId) {
        if (!this.isHost) return;
        var member = this.members.find(function(m) { return m.playerId === playerId; });
        if (!member) return;
        this._kickedPlayerIds.add(playerId);
        // 找到对应连接，先发踢出通知再关闭
        var kickConn = null;
        this._guestPlayerId.forEach(function(pid, peerId) {
            if (pid === playerId) {
                kickConn = this._guestConns.get(peerId);
                this._guestConns.delete(peerId);
                this._guestPlayerId.delete(peerId);
            }
        }, this);
        if (kickConn) {
            try { kickConn.send({ type: 'race_member_left', member: member, kicked: true }); } catch (e) {}
            var connRef = kickConn;
            setTimeout(function() { try { connRef.close(); } catch (e) {} }, 100);
        }
        // 从成员列表移除
        var idx = this.members.indexOf(member);
        if (idx !== -1) this.members.splice(idx, 1);
        this._clearGuestReconnectTimer(playerId);
        // 广播给剩余成员
        this._broadcast({ type: 'race_member_left', member: member }, null);
        if (this.onMemberLeft) this.onMemberLeft(member);
        if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
    }

    /** 访客侧：连接到房主 */
    _setupHostConn(conn) {
        this._hostConn = conn;
        conn.on('open', () => {
            this._hostLastSeen = Date.now();
            // 身份握手（携带模式，房主侧校验排位/休闲一致）
            try {
                conn.send({
                    type: 'race_hello',
                    playerId: this.myPlayerId,
                    nickname: this.myNickname,
                    mode: this.roomMode
                });
            } catch (e) {}
        });
        conn.on('data', (data) => this._handleGuestSideMessage(data));
        conn.on('close', () => this._handleHostConnClosed());
        conn.on('error', () => this._handleHostConnClosed());
    }

    /** 访客侧：处理房主发来的消息 */
    _handleGuestSideMessage(data) {
        if (!data || !data.type) return;
        // 心跳：任意消息到达都视为房主在线（更新最后活跃时间）
        this._hostLastSeen = Date.now();
        if (this._reconnecting && data.type === 'race_welcome') {
            this._handleReconnectSuccess();
        }
        switch (data.type) {
            case 'race_ping':
                // 房主 ping → 回 pong（心跳确认在线）
                if (this._hostConn && this._hostConn.open) {
                    try { this._hostConn.send({ type: 'race_pong' }); } catch (e) {}
                }
                break;
            case 'race_pong':
                break;
            case 'race_welcome': {
                this.isConnecting = false;
                this.isConnected = true;
                const list = Array.isArray(data.members) ? data.members : [];
                this.members = list.map((m, i) => ({
                    playerId: String(m.playerId || ''),
                    nickname: String(m.nickname || ''),
                    isHost: !!m.isHost,
                    connected: m.connected !== false,
                    slot: (typeof m.slot === 'number') ? m.slot : i
                }));
                this.myPlayerId = String(data.myPlayerId || this.myPlayerId);
                this._notifyStatus('connected', '已加入房间！');
                if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                if (this.onConnected) this.onConnected();
                break;
            }
            case 'race_hello_ack':
                if (data.ok === false) {
                    var reason = data.reason || '';
                    var ackMsg = '加入失败';
                    if (reason === 'room_full') ackMsg = '房间已满员';
                    else if (reason === 'kicked') ackMsg = '你已被房主移出房间';
                    else if (reason === 'host_migrated') ackMsg = '房间已由新房主接管';
                    else if (reason === 'mode_mismatch') ackMsg = '该房间为排位/休闲房，与你的选择不符';
                    this._notifyStatus('error', ackMsg);
                    var self = this;
                    setTimeout(function() { self.disconnect(); }, 100);
                }
                break;
            case 'race_msg':
                if (this.onMessage) {
                    try { this.onMessage(data.payload || {}, data.from || ''); } catch (e) { console.error(e); }
                }
                break;
            case 'race_member_joined':
                if (Array.isArray(data.member)) break;
                this.members.push({
                    playerId: String(data.member.playerId || ''),
                    nickname: String(data.member.nickname || ''),
                    isHost: !!data.member.isHost,
                    connected: data.member.connected !== false,
                    slot: (typeof data.member.slot === 'number') ? data.member.slot : this.members.length
                });
                if (this.onMemberJoined) this.onMemberJoined(this.members[this.members.length - 1]);
                if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                break;
            case 'race_member_left':
                {
                    const pid = String(data.member && data.member.playerId || '');
                    const idx = this.members.findIndex(m => m.playerId === pid);
                    if (idx !== -1) {
                        const removed = this.members.splice(idx, 1)[0];
                        if (this.onMemberLeft) this.onMemberLeft(removed);
                        if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                    }
                }
                break;
            case 'race_member_state':
                {
                    const st = data.member || {};
                    const m = this.members.find(x => x.playerId === st.playerId);
                    if (m) {
                        m.connected = st.connected !== false;
                        if (this.onMemberState) this.onMemberState(m);
                        if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
                    }
                }
                break;
            case 'race_hello_ack':
                if (data.ok === false) {
                    var r2 = data.reason || '';
                    var ack2 = (r2 === 'room_full') ? '房间已满员' : '加入被拒绝';
                    if (r2 === 'mode_mismatch') ack2 = '该房间为排位/休闲房，与你的选择不符';
                    this._notifyStatus('error', ack2);
                    this.disconnect();
                }
                break;
            case 'race_close':
                if (data.reason === 'host_dissolved') {
                    // 房主主动解散：同样触发迁移，访客保持重连等新房主接管
                    if (this.onHostLost) {
                        try { this.onHostLost('host_dissolved'); } catch (e) { console.error(e); }
                    }
                    if (!this._roomClosed) this._startReconnect();
                } else {
                    this._roomClosed = true;
                    if (this.onRoomClosed) this.onRoomClosed(data.reason || 'host_closed');
                }
                break;
            default:
                break;
        }
    }

    /** 访客侧：房主连接关闭 → 立即通知上层（迁移）并进入 60s 重连兜底 */
    _handleHostConnClosed() {
        if (this._disconnecting || this._promoting) return;
        this._hostConn = null;
        this.isConnected = false;
        if (this._roomClosed) return;
        if (!this.roomCode) return;
        // 房主掉线：立即让上层感知，触发迁移流程（不再傻等 60s）
        if (this.onHostLost) {
            try { this.onHostLost('conn_closed'); } catch (e) { console.error(e); }
        }
        this._startReconnect();
    }

    // ─── 消息发送 ────────────────────────────────────────────

    /** 发送消息：房主→全部访客；访客→房主（broadcast=true 时房主会转发给其他访客） */
    send(payload, broadcast = true) {
        if (this.isHost) {
            this._broadcast({ type: 'race_msg', from: this.myPlayerId, payload }, null);
        } else {
            if (this._hostConn && this._hostConn.open) {
                try {
                    this._hostConn.send({ type: 'race_msg', from: this.myPlayerId, payload, broadcast });
                    return true;
                } catch (e) { return false; }
            }
            return false;
        }
        return true;
    }

    /** 房主：广播消息给全部访客（不含发送者 fromPeerId，支持 peerId 或 playerId 排除） */
    _broadcast(obj, fromPeerId) {
        for (const [peerId, conn] of this._guestConns) {
            if (fromPeerId) {
                if (peerId === fromPeerId) continue;
                // 调用方可能传的是 playerId：同时也按 playerId 排除
                if (this._guestPlayerId.get(peerId) === fromPeerId) continue;
            }
            if (!conn.open) continue;
            try { conn.send(obj); } catch (e) { /* 忽略 */ }
        }
    }

    // ─── 成员快照 ────────────────────────────────────────────

    _membersSnapshot() {
        return this.members.map(m => ({
            playerId: m.playerId,
            nickname: m.nickname,
            isHost: m.isHost,
            connected: m.connected !== false,
            slot: m.slot
        }));
    }

    // ─── 断线重连（60s 宽限，方案 A） ─────────────────────────

    _startReconnect() {
        if (this._reconnecting || this._disconnecting) return;
        this._reconnecting = true;
        this._reconnectAttempts = 0;
        if (this.onReconnectingChange) this.onReconnectingChange(true);
        this._scheduleReconnectAttempt();
    }

    _scheduleReconnectAttempt() {
        if (this._disconnecting) return;
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            this._giveUpReconnect();
            return;
        }
        this._reconnectTimer = setTimeout(() => {
            if (this._disconnecting) return;
            this._reconnectAttempts++;
            if (!this.peer || this.peer.destroyed) {
                this._giveUpReconnect();
                return;
            }
            // 访客：重新连接房主；房主：信令已由 peer.reconnect() 恢复，等待访客重连
            if (!this.isHost && this.roomCode) {
                try {
                    const conn = this.peer.connect('race_' + this.roomCode, { reliable: true });
                    this._setupHostConn(conn);
                } catch (e) {
                    // 继续调度
                }
            }
            this._scheduleReconnectAttempt();
        }, this._reconnectTimeoutMs);
    }

    _giveUpReconnect() {
        if (!this._reconnecting) return;
        this._reconnecting = false;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        if (this.onReconnectingChange) this.onReconnectingChange(false);
        if (this.onReconnectFailed) this.onReconnectFailed();
        this._notifyStatus('disconnected', '连接已断开，无法重连');
    }

    _handleReconnectSuccess() {
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        if (this._reconnecting) {
            this._reconnecting = false;
            if (this.onReconnectingChange) this.onReconnectingChange(false);
            if (this.onReconnected) this.onReconnected();
        }
        this._selfSignalLost = false;
    }

    /** 房主：访客断线后的 60s 宽限定时器 */
    _scheduleGuestReconnectTimer(playerId) {
        this._clearGuestReconnectTimer(playerId);
        const timer = setTimeout(() => {
            this._guestReconnectTimers.delete(playerId);
            const member = this.members.find(m => m.playerId === playerId);
            if (!member) return;
            if (!member.connected) {
                // 60s 未重连 → 从成员列表移除并广播
                const idx = this.members.indexOf(member);
                if (idx !== -1) this.members.splice(idx, 1);
                this._broadcast({ type: 'race_member_left', member }, null);
                if (this.onMemberLeft) this.onMemberLeft(member);
                if (this.onMembersUpdate) this.onMembersUpdate(this._membersSnapshot());
            }
        }, 60000);
        this._guestReconnectTimers.set(playerId, timer);
    }

    _clearGuestReconnectTimer(playerId) {
        if (this._guestReconnectTimers.has(playerId)) {
            clearTimeout(this._guestReconnectTimers.get(playerId));
            this._guestReconnectTimers.delete(playerId);
        }
    }

    // ─── 心跳（ping/pong，2026-08-12） ──────────────────────
    // 目的：房主直接关浏览器大退时，DataChannel 不会立刻触发 close 事件，
    //       访客通过心跳超时（15s 无响应）感知房主失联并立即触发迁移。
    // 双方每 5s 互发 race_ping；收到任意消息（含 race_pong）都刷新 lastSeen；
    // 15s 无响应 → 房主侧把该访客走断线宽限流程；访客侧触发 onHostLost('conn_timeout')。

    _startHeartbeat() {
        this._stopHeartbeat();
        this._hbTimer = setInterval(() => this._heartbeatTick(), this._hbIntervalMs);
    }

    _stopHeartbeat() {
        if (this._hbTimer) { clearInterval(this._hbTimer); this._hbTimer = null; }
        this._guestLastSeen.clear();
    }

    _heartbeatTick() {
        if (this._disconnecting) return;
        const now = Date.now();
        if (this.isHost) {
            // 房主：向全部访客广播 ping；15s 无响应的访客 → 触发断线宽限流程
            for (const [peerId, conn] of this._guestConns) {
                if (conn.open) {
                    try { conn.send({ type: 'race_ping' }); } catch (e) {}
                }
                const lastSeen = this._guestLastSeen.get(peerId) || 0;
                if (lastSeen && now - lastSeen > this._hbStaleMs) {
                    this._guestLastSeen.delete(peerId);
                    try { conn.close(); } catch (e) {}
                }
            }
        } else {
            // 访客：向房主发 ping；15s 无响应 → 触发房主迁移 + 60s 重连兜底
            if (this._hostConn && this._hostConn.open) {
                try { this._hostConn.send({ type: 'race_ping' }); } catch (e) {}
            }
            if (this._hostLastSeen && now - this._hostLastSeen > this._hbStaleMs) {
                if (this._disconnecting || this._promoting || this._reconnecting || this._roomClosed) return;
                this._hostLastSeen = 0; // 防重复触发
                if (this.onHostLost) {
                    try { this.onHostLost('conn_timeout'); } catch (e) { console.error(e); }
                }
                this._startReconnect();
            }
        }
    }

    // ─── 清理 ────────────────────────────────────────────────

    _handlePeerError(err) {
        console.error('[RaceRoom] Peer 错误:', err);
        // PeerJS 常见错误：unavailable-id（房间码冲突）
        const type = err && err.type;
        if (type === 'unavailable-id') {
            this._notifyStatus('error', '房间码已被占用，请重试');
        } else if (type === 'peer-unavailable') {
            this._notifyStatus('error', '找不到该房间，请确认房间码');
        } else if (type === 'network') {
            this._notifyStatus('error', '网络连接异常');
        } else {
            this._notifyStatus('error', '连接失败：' + (err.message || '未知错误'));
        }
        this.isConnecting = false;
    }

    /** 主动离开/解散房间。reason: 'self'（主动离开）| 'host'（房主解散） */
    disconnect(reason = 'self') {
        this._disconnecting = true;
        this._roomClosed = true;
        this._stopHeartbeat();
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        for (const t of this._guestReconnectTimers.values()) clearTimeout(t);
        this._guestReconnectTimers.clear();
        // 房主解散：通知所有访客
        if (this.isHost && reason === 'host') {
            this._broadcast({ type: 'race_close', reason: 'host_dissolved' }, null);
        }
        if (this._hostConn) {
            try { this._hostConn.close(); } catch (e) {}
            this._hostConn = null;
        }
        for (const conn of this._guestConns.values()) {
            try { conn.close(); } catch (e) {}
        }
        this._guestConns.clear();
        this._guestPlayerId.clear();
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.members = [];
        this._selfSignalLost = false;
        this._reconnecting = false;
    }

    _resetState() {
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {}
        }
        this.peer = null;
        this._stopHeartbeat();
        this._guestConns.clear();
        this._guestPlayerId.clear();
        this._hostConn = null;
        this.isConnected = false;
        this.isConnecting = false;
        this._disconnecting = false;
        this._selfSignalLost = false;
        this._creating = false;
        this._joining = false;
        this._reconnecting = false;
        this._roomClosed = false;
        this._promoting = false;
        this._oldHostPlayerId = null;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        for (const t of this._guestReconnectTimers.values()) clearTimeout(t);
        this._guestReconnectTimers.clear();
    }
}
