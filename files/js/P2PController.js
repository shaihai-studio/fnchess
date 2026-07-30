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
 * P2PController - P2P 联机对战控制器
 * 基于 PeerJS (WebRTC DataChannel) 实现跨网络 P2P 连接
 *
 * 架构：
 * - Host（房主）创建房间 → 获得房间码 → 等待 Guest 加入
 * - Guest（访客）输入房间码 → 连接到 Host
 * - Host = 玩家A, Guest = 玩家B（全局固定，rematch 不变）
 * - isHost 决定谁发 game_init、谁驱动计时；rematch 时 isHost 翻转
 *
 * 同步协议（ack/nack）：
 * - 操作方预执行 → 发 action(seqno) → 接收方预执行 → 回 ack/nack
 * - nack / ack 超时(8s) → 视为断线，游戏结束
 * - 非游戏消息（timer_sync / state_sync / timeout）携带 gen 字段，跨局消息自动丢弃
 */
class P2PController {
    // ═══ 静态信令服务器配置（全局生效） ═══
    // 默认使用官方公共 PeerJS 服务器（免费、无需自托管）
    // 可通过 window.P2P_SIGNALING 覆盖，例如：
    //   window.P2P_SIGNALING = { host: 'localhost', port: 9000, secure: false };
    // 长期稳定运营建议改回自托管服务器（server/index.js）
    static signaling = (typeof window !== 'undefined' && window.P2P_SIGNALING)
        ? { host: '0.peerjs.com', port: 443, path: '/', secure: true, debug: 0, ...window.P2P_SIGNALING }
        : {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            debug: 0
        };

    // ─── 懒加载 PeerJS（仅首次联机时拉取，避免阻塞开局加载） ───
    static ensurePeerJs() {
        if (typeof window.Peer !== 'undefined') return Promise.resolve();
        if (P2PController._peerJsPromise) return P2PController._peerJsPromise;
        P2PController._peerJsPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
            s.async = true;
            s.onload = () => (typeof window.Peer !== 'undefined'
                ? resolve()
                : reject(new Error('PeerJS 加载完成但全局 Peer 未定义')));
            s.onerror = () => reject(new Error('无法加载 PeerJS（请检查网络）'));
            document.head.appendChild(s);
        });
        return P2PController._peerJsPromise;
    }

    constructor() {
        // 连接状态
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomCode = '';
        this.isConnected = false;
        this.isConnecting = false;
        this._disconnecting = false;
        this._guestConnecting = false;
        this._timeoutId = null;

        // 玩家身份（全局固定，rematch 不改变）
        this.myPlayerId = '';
        this.opponentPlayerId = '';

        // 游戏代数（每局递增，用于过滤跨局消息）
        this._gen = 0;

        // ack 协议
        this._seqno = 0;
        this._pendingAck = null; // { seqno, action, rollback, timer }
        this._actionPending = false; // 动作等待 ack 期间暂停 state_sync

        // 心跳
        this._watchdogId = null;
        this._pingInterval = null;

        // ── 回调 ──────────────────────────────────────────────
        this.onStatusChange = null;  // (status, message) => void
        this.onConnected    = null;  // () => void
        this.onDisconnected = null;  // () => void
        this.onError        = null;  // (err) => void
        // 收到对方游戏动作；返回 true = 执行成功(回 ack)，false = 失败(回 nack)
        this.onGameAction   = null;  // (action, payload) => boolean
        this.onNack         = null;  // (action, rollback, reason) => void
        this.onGameInit     = null;  // (config) => void
        this.onStateSync    = null;  // (state) => void
        this.onTimerSync    = null;  // (remainingTime) => void
        this.onTimeout      = null;  // (player) => void
        this.onRematch      = null;  // () => void
        this.onSyncRequest  = null;  // () => void

        this.iceServers = [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.qq.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' }
        ];
        this._codeChars = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';
        this._cachedIceServers = null;  // 服务端拉取的完整 ICE 配置缓存
    }

    // ─── 获取 ICE 配置（STUN 兜底，公共信令服务器无 TURN） ───

    async _fetchIceServers() {
        if (this._cachedIceServers) return this._cachedIceServers;
        // 公共 PeerJS 服务器不支持动态 TURN 配置，直接使用 STUN
        this._cachedIceServers = this.iceServers;
        return this._cachedIceServers;
    }

    // ─── 房间码 ──────────────────────────────────────────────

    _generateRoomCode() {
        let code = '';
        const len = this._codeChars.length;
        for (let i = 0; i < 6; i++) code += this._codeChars[Math.floor(Math.random() * len)];
        return code;
    }

    // ─── 连接 ────────────────────────────────────────────────

    async createRoom() {
        try {
            await P2PController.ensurePeerJs();
        } catch (err) {
            this._notifyStatus('error', '联机模块加载失败，请检查网络后刷新重试');
            return;
        }
        if (this.isConnecting || this.isConnected) {
            this._notifyStatus('error', '已有进行中的连接');
            return;
        }
        this._disconnecting = false;
        this.roomCode = this._generateRoomCode();
        this.isHost = true;
        this.myPlayerId = 'A';
        this.opponentPlayerId = 'B';
        this.isConnecting = true;
        this._notifyStatus('connecting', '正在创建房间...');
        this._startTimeout('创建房间超时，请检查网络后重试', 45000);

        const iceServers = await this._fetchIceServers();
        if (!this.isConnecting) return; // 超时或用户取消
        try {
            const sig = P2PController.signaling;
            this.peer = new Peer(this.roomCode, {
                debug: sig.debug,
                host: sig.host,
                port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer.on('open', () => {
                this._clearTimeout();
                this._notifyStatus('waiting', '等待对手加入...');
                this._startTimeout('等待对手超时，请确认房间码已分享给对方', 60000);
            });
            this.peer.on('connection', (conn) => {
                if (this.isConnected || this._guestConnecting) { conn.close(); return; }
                this._guestConnecting = true;
                this._clearTimeout();
                this._setupConnection(conn);
            });
            this.peer.on('error', (err) => this._handleError(err));
            this.peer.on('disconnected', () => {
                if (this._disconnecting) return;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
        } catch (err) { this._handleError(err); }
    }

    /** 用大厅分配的 roomCode 创建房间（跳过随机生成） */
    async createRoomWithCode(code) {
        try {
            await P2PController.ensurePeerJs();
        } catch (err) {
            this._notifyStatus('error', '联机模块加载失败，请检查网络后刷新重试');
            return;
        }
        if (this.isConnecting || this.isConnected) {
            this._notifyStatus('error', '已有进行中的连接');
            return;
        }
        this._disconnecting = false;
        this.roomCode = code;
        this.isHost = true;
        this.myPlayerId = 'A';
        this.opponentPlayerId = 'B';
        this.isConnecting = true;
        this._notifyStatus('connecting', '正在创建房间...');
        this._startTimeout('创建房间超时，请检查网络后重试', 45000);
        const iceServers = await this._fetchIceServers();
        if (!this.isConnecting) return;
        try {
            const sig = P2PController.signaling;
            this.peer = new Peer(code, {
                debug: sig.debug, host: sig.host, port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer.on('open', () => {
                this._clearTimeout();
                this._notifyStatus('waiting', '等待对手加入...');
                this._startTimeout('等待对手超时', 60000);
            });
            this.peer.on('connection', (conn) => {
                if (this.isConnected || this._guestConnecting) { conn.close(); return; }
                this._guestConnecting = true;
                this._clearTimeout();
                this._setupConnection(conn);
            });
            this.peer.on('error', (err) => this._handleError(err));
            this.peer.on('disconnected', () => {
                if (this._disconnecting) return;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
        } catch (err) { this._handleError(err); }
    }

    async joinRoom(roomCode) {
        try {
            await P2PController.ensurePeerJs();
        } catch (err) {
            this._notifyStatus('error', '联机模块加载失败，请检查网络后刷新重试');
            return;
        }
        if (this.isConnecting || this.isConnected) {
            this._notifyStatus('error', '已有进行中的连接');
            return;
        }
        // 过滤掉生成时排除的易混淆字符
        const normalized = roomCode.trim().toUpperCase().replace(/[^ABCDEFGHJKMNPRSTUVWXYZ23456789]/g, '');
        if (normalized.length !== 6) {
            this._notifyStatus('error', '房间码必须是6位有效字符（不含 0/1/I/L/O）');
            return;
        }
        this._disconnecting = false;
        this.roomCode = normalized;
        this.isHost = false;
        this.myPlayerId = 'B';
        this.opponentPlayerId = 'A';
        this.isConnecting = true;
        this._notifyStatus('connecting', '正在连接房间...');
        this._startTimeout('连接房间超时，请检查房间码和网络后重试', 45000);

        const iceServers = await this._fetchIceServers();
        if (!this.isConnecting) return;
        try {
            const guestId = 'g_' + Math.random().toString(36).substr(2, 9);
            const sig = P2PController.signaling;
            this.peer = new Peer(guestId, {
                debug: sig.debug,
                host: sig.host,
                port: sig.port,
                path: sig.path,
                secure: sig.secure,
                config: { iceServers }
            });
            this.peer.on('open', () => {
                const conn = this.peer.connect(normalized, { reliable: true });
                this._setupConnection(conn);
            });
            this.peer.on('error', (err) => this._handleError(err));
            this.peer.on('disconnected', () => {
                if (this._disconnecting) return;
                if (this.peer && !this.peer.destroyed) this.peer.reconnect();
            });
        } catch (err) { this._handleError(err); }
    }

    _setupConnection(conn) {
        this._clearTimeout();
        this.conn = conn;
        // DataChannel 打开超时：15 秒内未 open 则视为失败
        this._startTimeout('连接超时，请确认房间码正确且对方在线', 15000);
        conn.on('open', () => {
            this._clearTimeout();
            this.isConnected = true;
            this.isConnecting = false;
            this._guestConnecting = false;
            this._resetWatchdog();
            this._pingInterval = setInterval(() => { if (this.isConnected) this.send({ type: 'ping' }); }, 5000);
            console.log(`[P2P] DataChannel 已打开，isHost=${this.isHost}, myPlayerId=${this.myPlayerId}`);
            this._notifyStatus('connected', this.isHost ? '对手已加入！游戏即将开始...' : '已连接到房间！游戏即将开始...');
            if (this.onConnected) this.onConnected();
        });
        conn.on('data', (data) => { this._resetWatchdog(); this._handleMessage(data); });
        conn.on('close', () => { console.log('[P2P] DataChannel 已关闭'); this._handleDisconnect(); });
        conn.on('error', (err) => { console.error('[P2P] DataChannel 错误:', err); this._handleDisconnect(); });
    }

    // ─── 消息处理 ────────────────────────────────────────────

    _handleMessage(data) {
        if (!data || !data.type) return;
        console.log(`[P2P] 收到消息 type=${data.type}, gen=${data.gen ?? '-'}, seqno=${data.seqno ?? '-'}, myGen=${this._gen}`);
        switch (data.type) {
            case 'ping': this.send({ type: 'pong' }); break;
            case 'pong': break;

            case 'game_init':
                // Guest 同步 gen，确保后续 gen 过滤正确
                if (data.config?.gen !== undefined) this._gen = data.config.gen;
                if (this.onGameInit) this.onGameInit(data.config);
                break;

            case 'action': {
                // 跨局消息过滤（gen 不匹配时拒绝并静默 nack）
                if (data.gen !== undefined && data.gen !== this._gen) {
                    this.send({ type: 'nack', seqno: data.seqno, action: data.action, reason: 'stale_gen' });
                    break;
                }
                // 接收方：预执行，回 ack 或 nack
                const ok = this.onGameAction ? this.onGameAction(data.action, data.payload || {}) : true;
                this.send(ok
                    ? { type: 'ack', seqno: data.seqno }
                    : { type: 'nack', seqno: data.seqno, action: data.action, reason: 'execution_failed' }
                );
                break;
            }

            case 'ack':
                console.log(`[P2P] 收到 ack seqno=${data.seqno}`);
                if (this._pendingAck && data.seqno === this._pendingAck.seqno) {
                    clearTimeout(this._pendingAck.timer);
                    this._pendingAck = null;
                    this._actionPending = false;
                }
                break;

            case 'nack':
                console.warn(`[P2P] 收到 nack seqno=${data.seqno}, reason=${data.reason}`);
                if (this._pendingAck && data.seqno === this._pendingAck.seqno) {
                    clearTimeout(this._pendingAck.timer);
                    const { action, rollback } = this._pendingAck;
                    this._pendingAck = null;
                    this._actionPending = false;
                    if (this.onNack) this.onNack(action, rollback, data.reason);
                }
                break;

            case 'state_sync':
                // 状态快照为完整状态，不依赖 gen 过滤（即便越过回合边界也以最新快照为准）
                if (this.onStateSync) this.onStateSync(data.state);
                break;

            case 'request_sync':
                // 对手请求重同步：由 UIController 注入的 _syncHook 发送当前完整快照
                if (data.gen === this._gen && this.onSyncRequest) this.onSyncRequest();
                break;

            case 'timer_sync':
                if (data.gen === this._gen && this.onTimerSync) this.onTimerSync(data.remainingTime);
                break;

            case 'timeout':
                if (data.gen === this._gen && this.onTimeout) this.onTimeout(data.player);
                break;

            case 'rematch_request':
                if (this.onRematch) this.onRematch();
                break;

            default:
                // 未知消息类型，静默忽略
                break;
        }
    }

    // ─── 发送 API ────────────────────────────────────────────

    send(data) {
        if (!this.conn || !this.isConnected) return false;
        try { this.conn.send(data); return true; }
        catch (err) { return false; }
    }

    /** Host 发送游戏初始化（每局开始，_gen 递增） */
    sendGameInit(config) {
        this._gen++;
        this.send({ type: 'game_init', config: { ...config, gen: this._gen } });
    }

    /**
     * 发送带 ack 的游戏动作
     * @param {string} action
     * @param {object} payload
     * @param {Function|null} rollback - nack 时调用的回滚函数
     */
    sendGameAction(action, payload, rollback = null) {
        // 清理上一个未完成的 ack（防止旧 timer 误触发断线）
        if (this._pendingAck) {
            clearTimeout(this._pendingAck.timer);
            this._pendingAck = null;
        }
        this._actionPending = true;
        const seqno = ++this._seqno;
        console.log(`[P2P] 发送动作 action=${action}, seqno=${seqno}, gen=${this._gen}`);
        const timer = setTimeout(() => {
            console.warn(`[P2P] ack 超时，action=${action}, seqno=${seqno}`);
            this._pendingAck = null;
            this._actionPending = false;
            this._handleDisconnect();
        }, 8000);
        this._pendingAck = { seqno, action, rollback, timer };
        this.send({ type: 'action', action, payload, seqno, gen: this._gen });
    }

    sendStateSync(state) {
        // 版本号机制已能避免旧快照覆盖新状态，因此即使动作确认期间也允许发送 state_sync，
        // 防止发送方在 actionPending 时无法把阶段推进同步给对端。
        if (this._actionPending) {
            console.log('[P2P] 动作确认中，仍发送 state_sync');
        }
        console.log('[P2P] 发送 state_sync');
        this.send({ type: 'state_sync', state, gen: this._gen });
    }
    sendTimerSync(remainingTime)     { this.send({ type: 'timer_sync', remainingTime, gen: this._gen }); }
    sendTimeout(player)              { this.send({ type: 'timeout', player, gen: this._gen }); }
    sendRematchRequest()             { this.send({ type: 'rematch_request' }); }
    sendSyncRequest()                { console.log('[P2P] 发送 request_sync'); this.send({ type: 'request_sync', gen: this._gen }); }

    /** Rematch 时翻转 isHost（myPlayerId 不变） */
    flipRoleForRematch() { this.isHost = !this.isHost; }

    // ─── 查询 ────────────────────────────────────────────────

    isMyTurn(currentPlayer)  { return currentPlayer === this.myPlayerId; }
    getMyPlayerId()          { return this.myPlayerId; }
    getOpponentPlayerId()    { return this.opponentPlayerId; }

    // ─── 错误 / 断线 ─────────────────────────────────────────

    _handleError(err) {
        this.isConnecting = false;
        this.isConnected = false;
        this._guestConnecting = false;
        const sig = P2PController.signaling;
        const isLocalhost = sig.host === 'localhost' || sig.host === '127.0.0.1';
        let message = '连接失败';
        if (err?.type === 'unavailable-id') {
            message = '房间码已被占用，请重新创建房间';
            this.disconnect();
            // disconnect 已销毁 peer/conn，直接通知后返回
            this._notifyStatus('error', message);
            if (this.onError) this.onError(err || new Error(message));
            return;
        } else if (err?.type === 'peer-unavailable') {
            message = '无法连接到房间，请检查房间码是否正确';
        } else if (err?.type === 'network') {
            message = `网络连接失败，请检查网络后重试（信令：${sig.host}:${sig.port}）`;
        } else if (err?.type === 'server-error') {
            message = `信令服务器异常，请稍后重试（${sig.host}:${sig.port}）`;
        } else if (err?.type === 'timeout') {
            message = err.message || '连接超时，请重试';
        } else if (err?.message) {
            message = err.message;
        }
        if ((err?.type === 'network' || err?.type === 'server-error' || err?.type === 'timeout') && isLocalhost) {
            message += '；若使用本地信令，请先在 server/ 目录运行 node index.js';
        }
        this._notifyStatus('error', message);
        if (this.onError) this.onError(err || new Error(message));
    }

    _handleDisconnect() {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isConnecting = false;
        this._guestConnecting = false;
        this.conn = null;
        clearTimeout(this._watchdogId);  this._watchdogId = null;
        clearInterval(this._pingInterval); this._pingInterval = null;
        if (this._pendingAck) { clearTimeout(this._pendingAck.timer); this._pendingAck = null; }
        if (this.peer) { this.peer.destroy(); this.peer = null; }
        this.roomCode = '';
        if (wasConnected) {
            this._notifyStatus('disconnected', '对手已断开连接');
            if (this.onDisconnected) this.onDisconnected();
        } else if (!this._disconnecting) {
            // 尚未建立连接就断开（DataChannel error / 超时）→ 通知用户
            this._handleError({ type: 'network', message: '连接失败，请确认房间码正确且对方在线' });
        }
    }

    disconnect() {
        this._disconnecting = true;
        this._clearTimeout();
        clearTimeout(this._watchdogId);  this._watchdogId = null;
        clearInterval(this._pingInterval); this._pingInterval = null;
        if (this._pendingAck) { clearTimeout(this._pendingAck.timer); this._pendingAck = null; }
        if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
        if (this.peer) { this.peer.destroy(); this.peer = null; }
        this.isConnected = false;
        this.isConnecting = false;
        this._guestConnecting = false;
        this.isHost = false;
        this.roomCode = '';
    }

    // ─── 心跳 / 超时 ─────────────────────────────────────────

    _resetWatchdog() {
        clearTimeout(this._watchdogId);
        this._watchdogId = setTimeout(() => {
            this._handleDisconnect();
        }, 15000);
    }

    _startTimeout(message, duration = 30000) {
        this._clearTimeout();
        this._timeoutId = setTimeout(() => {
            this._handleError({ type: 'timeout', message });
            this.disconnect();
        }, duration);
    }

    _clearTimeout() {
        if (this._timeoutId) { clearTimeout(this._timeoutId); this._timeoutId = null; }
    }

    _notifyStatus(status, message) {
        if (this.onStatusChange) this.onStatusChange(status, message);
    }
}
