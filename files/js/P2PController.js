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
    // 默认使用自托管服务器 http://p2p.shaihai.cn/（server/index.js）
    // 可通过 window.P2P_SIGNALING 覆盖，例如：
    //   window.P2P_SIGNALING = { host: 'localhost', port: 9000, secure: false };
    // 若服务器启用了 HTTPS/TLS，需将 secure 改为 true
    static signaling = (typeof window !== 'undefined' && window.P2P_SIGNALING)
        ? { host: 'p2p.shaihai.cn', port: 80, path: '/', secure: false, debug: 0, ...window.P2P_SIGNALING }
        : {
            host: 'p2p.shaihai.cn',
            port: 80,
            path: '/',
            secure: false,
            debug: 0
        };

    // ─── 懒加载 PeerJS（仅首次联机时拉取，避免阻塞开局加载） ───
    // 优先加载本地 vendor 副本（离线/CDN 被墙环境可用），失败才回退 CDN
    static ensurePeerJs() {
        if (typeof window.Peer !== 'undefined') return Promise.resolve();
        if (P2PController._peerJsPromise) return P2PController._peerJsPromise;
        P2PController._peerJsPromise = new Promise((resolve, reject) => {
            const sources = [
                'files/vendor/peerjs/peerjs.min.js',
                'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
            ];
            let idx = 0;
            const tryLoad = () => {
                if (idx >= sources.length) {
                    reject(new Error('无法加载 PeerJS（请检查网络）'));
                    return;
                }
                const s = document.createElement('script');
                s.src = sources[idx++];
                s.async = true;
                s.onload = () => {
                    if (typeof window.Peer !== 'undefined') resolve();
                    else tryLoad(); // 加载完成但全局未定义（可能是坏文件），尝试下一个源
                };
                s.onerror = () => tryLoad();
                document.head.appendChild(s);
            };
            tryLoad();
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

        // game_init 确认重发（开局同步消息不丢包：Host 持续重发直到 Guest 回执）
        this._gameInitRetry = null;   // { gen, config, timer, attempts }
        this._gameInitConfig = null;  // 最近一次 init 的原始配置（供重发/重建）
        this._handledInitGen = 0;     // Guest 已处理过的 init gen（去重，避免重复重置对局）

        // sync_verify 周期验证（固定频率核对双方状态，发现不同步即重发/补发）
        this._syncVerifyInterval = null;
        this._lastRemoteVerify = null;   // 对方最近一次 verify 报告
        this._lastFullSyncRequestAt = 0; // 请求全量快照的节流时间戳
        this._lastFullSyncPushAt = 0;    // 主动推送全量快照的节流时间戳

        // 阶段切换确认重发（state_sync 带 confirm 标识，直到对方回 state_sync_ack）
        this._syncConfirmSeq = 0;
        this._pendingSyncConfirm = null; // { key, attempts, timer }

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
        // 对手身份（排行榜 ELO 上报用）：(payload) => void，payload={playerId, nickname}
        this.onPlayerInfo   = null;  // (payload) => void
        // 返回当前状态指纹 { version, round, player, phase }，未初始化返回 null（用于 sync_verify）
        this.onGetVerifyState = null;
        // 健康探测回执（收到即认为对方进程/连接仍在）
        this.onHealthCheckAck = null;  // (ts) => void
        // 阶段确认重发时回调（重新构建最新状态并携带原确认 key 重发）
        this.onSyncConfirmResend = null; // (key) => void
        // 等待对方回执计数（>0 = 有同步机制在等待对方回复，UI 提示"连接不稳定，正在等待"）
        this._awaitCount = 0;
        this._awaitTokens = new Set();   // 按 token 精确配对等待机制，杜绝跨机制交叉抵消泄漏
        this._reqSyncSeq = 0;            // request_sync 等待 token 序号
        this._healthSeq = 0;             // health_check 等待 token 序号
        this._healthCheckTimer = null;   // health_check 超时释放定时器
        this._awaitingPeer = false;
        this.onAwaitChange = null; // (awaiting) => void

        // send 连续失败计数（DataChannel 半开/拥塞检测）
        this._sendFailStreak = 0;
        // 断线清理已执行标志（DataChannel close/error 可能连续触发，防重复清理/重复弹窗）
        this._disconnectHandled = false;

        this.iceServers = [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.qq.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' }
        ];
        this._codeChars = '0123456789';
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
        this._disconnectHandled = false;
        this._sendFailStreak = 0;
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

    /**
     * 用大厅分配的 roomCode 创建房间（跳过随机生成）
     * @param {string} code - 大厅分配的房间码
     * @param {number} waitTimeout - 等待对手加入的超时毫秒数。
     *        默认 60s；长效模式（服务器房间 30 分钟 TTL）由调用方传入剩余有效期，
     *        避免 PeerJS 默认 60s 超时提前销毁房间（服务器房间仍存活，访客却无法加入）。
     */
    async createRoomWithCode(code, waitTimeout = 60000) {
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
        this._disconnectHandled = false;
        this._sendFailStreak = 0;
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
                // 长效模式传入的 waitTimeout 为服务器房间剩余有效期（最长 30 分钟）；
                // 普通模式保持 60s 默认。服务器到期会发 room_expired，由大厅侧正常收尾。
                this._startTimeout('等待对手超时', waitTimeout);
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
        // 过滤掉非数字字符
        const normalized = roomCode.trim().replace(/[^0-9]/g, '');
        if (normalized.length !== 6) {
            this._notifyStatus('error', '房间码必须是6位数字');
            return;
        }
        this._disconnecting = false;
        this._disconnectHandled = false;
        this._sendFailStreak = 0;
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
        // DataChannel 打开超时：15 秒内未 open 则视为失败。
        // 对称 NAT / 企业防火墙下 WebRTC 打洞失败是常见原因，给出明确提示。
        this._startTimeout('连接超时：双方可能无法穿透 NAT（对称型网络/防火墙限制），请检查网络或更换网络环境后重试', 15000);
        conn.on('open', () => {
            this._clearTimeout();
            this.isConnected = true;
            this.isConnecting = false;
            this._guestConnecting = false;
            this._disconnectHandled = false; // 新连接生命周期开始，允许后续断线清理
            this._sendFailStreak = 0;
            this._resetWatchdog();
            // 后台标签页定时器（setInterval/setTimeout）会被浏览器节流甚至暂停，
            // 切回前台时立即重置 watchdog 并向对方刷新存在感，避免误判断线（BUG-12）。
            this._visibilityHandler = () => {
                if (document.visibilityState === 'visible' && this.isConnected) {
                    this._resetWatchdog();
                    this.sendHealthCheck();
                }
            };
            document.addEventListener('visibilitychange', this._visibilityHandler);
            this._pingInterval = setInterval(() => { if (this.isConnected) this.send({ type: 'ping' }); }, 5000);
            // 周期验证：固定频率向对手报告当前状态指纹，双方据此发现并自愈同步丢失。
            // 每 3s 一次（state_sync 事件驱动 + confirm 重发已覆盖实时性；
            // verify 只需兜底"两端长时间无快照但状态漂移"的罕见情况，频率放宽减少拥塞）。
            this._syncVerifyInterval = setInterval(() => this._sendSyncVerify(), 3000);
            console.log(`[P2P] DataChannel 已打开，isHost=${this.isHost}, myPlayerId=${this.myPlayerId}`);
            this._notifyStatus('connected', this.isHost ? '对手已加入！游戏即将开始...' : '已连接到房间！游戏即将开始...');
            if (this.onConnected) this.onConnected();
        });
        conn.on('data', (data) => {
            this._resetWatchdog();
            try { this._handleMessage(data); }
            catch (err) { console.error('[P2P] 消息处理异常（已防御，不影响连接）', err); }
        });
        conn.on('close', () => { console.log('[P2P] DataChannel 已关闭'); this._handleDisconnect(); });
        conn.on('error', (err) => { console.error('[P2P] DataChannel 错误:', err); this._handleDisconnect(); });
    }

    // ─── 消息处理 ────────────────────────────────────────────

    _handleMessage(data) {
        if (!data || !data.type) return;
        console.log(`[P2P] 收到消息 type=${data.type}, gen=${data.gen ?? '-'}, seqno=${data.seqno ?? '-'}, myGen=${this._gen}`);
        // 收到任何消息 = 对方进程/连接在线 → 释放健康探测等待并清零发送失败计数
        this._clearAwaitByPrefix('health:');
        this._sendFailStreak = 0;
        switch (data.type) {
            case 'ping': this.send({ type: 'pong' }); break;
            case 'pong': break;

            case 'game_init': {
                const initGen = data.config?.gen;
                if (initGen !== undefined) {
                    // 始终回执，让 Host 立即停止重发
                    this.send({ type: 'game_init_ack', gen: initGen });
                    // 同 gen 的重复 init（Host 重发）直接忽略，避免重复重置对局
                    if (initGen === this._handledInitGen) break;
                    this._gen = initGen;
                    this._handledInitGen = initGen;
                }
                if (this.onGameInit) this.onGameInit(data.config);
                break;
            }

            case 'game_init_ack':
                console.log(`[P2P] 收到 game_init_ack gen=${data.gen}`);
                if (this._gameInitRetry && data.gen === this._gameInitRetry.gen) {
                    this._stopGameInitRetry(); // 内部按 token 释放等待计数
                }
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
                    this._setAwaiting(false, this._ackToken(data.seqno));
                }
                break;

            case 'nack':
                console.warn(`[P2P] 收到 nack seqno=${data.seqno}, reason=${data.reason}`);
                if (this._pendingAck && data.seqno === this._pendingAck.seqno) {
                    clearTimeout(this._pendingAck.timer);
                    const { action, rollback } = this._pendingAck;
                    this._pendingAck = null;
                    this._actionPending = false;
                    this._setAwaiting(false, this._ackToken(data.seqno));
                    if (this.onNack) this.onNack(action, rollback, data.reason);
                }
                break;

            case 'state_sync':
                // 状态快照为完整状态，不依赖 gen 过滤（即便越过回合边界也以最新快照为准）
                // 带 confirm 标识的阶段切换快照：立即回执（即使版本旧也回），让发送方停止重发
                if (data.confirm) this.send({ type: 'state_sync_ack', confirm: data.confirm });
                if (this.onStateSync) this.onStateSync(data.state);
                // 收到全量快照 = request_sync 已得到响应、确认推送已到达对方。
                // 按前缀释放对应等待 token；不动 ack/init/health token，杜绝交叉抵消泄漏。
                this._clearAwaitByPrefix('req:');
                this._clearAwaitByPrefix('confirm:');
                break;

            case 'state_sync_ack':
                if (this._pendingSyncConfirm && data.confirm === this._pendingSyncConfirm.key) {
                    console.log(`[P2P] 收到阶段确认 ack ${data.confirm}`);
                    this._stopSyncConfirm(); // 内部按 token 释放等待计数
                }
                break;

            case 'request_sync':
                // 对手请求重同步：由 UIController 注入的 _syncHook 发送当前完整快照
                if (data.gen === this._gen && this.onSyncRequest) this.onSyncRequest();
                break;

            case 'sync_verify':
                // 周期验证消息：核对 gen 与状态版本号，发现不同步则重发/补发
                this._handleSyncVerify(data);
                break;

            case 'health_check':
                // 健康探测：立即回执（带回原 token，让对方精确释放等待计数）
                this.send({ type: 'health_check_ack', ts: data.ts, token: data.token });
                break;

            case 'health_check_ack':
                if (this.onHealthCheckAck) this.onHealthCheckAck(data.ts);
                this._setAwaiting(false, this._healthToken(data.token));
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

            case 'player_info':
                // 对手身份交换（排行榜 ELO 上报用）：访客收到 game_init 后回传自己的身份
                if (this.onPlayerInfo) this.onPlayerInfo(data.payload || {});
                break;

            default:
                // 未知消息类型，静默忽略
                break;
        }
    }

    // ─── 发送 API ────────────────────────────────────────────

    send(data) {
        if (!this.conn || !this.isConnected) return false;
        try {
            this.conn.send(data);
            this._sendFailStreak = 0;
            return true;
        } catch (err) {
            this._sendFailStreak = (this._sendFailStreak || 0) + 1;
            if (this._sendFailStreak === 3) {
                // 回合切换等消息峰值瞬间，WebRTC 缓冲拥塞时 DataChannel.send 可能抛错。
                // 此时【绝不主动断线】，否则会出现"第一回合结束双方同时误报断开"。
                // 真正的断线由 watchdog(15s 无消息) 与 DataChannel close/error 兜底。
                console.warn('[P2P] 连续 3 次发送失败（可能为瞬时拥塞），等待 watchdog/close 兜底');
            }
            return false;
        }
    }

    /** Host 发送游戏初始化（每局开始，_gen 递增；持续重发直到 Guest 回执，防止开局同步消息丢失卡死） */
    sendGameInit(config) {
        if (this._gameInitRetry) {
            clearTimeout(this._gameInitRetry.timer);
            this._setAwaiting(false, this._initToken(this._gameInitRetry.gen)); // 抵消旧 retry 的 +1
            this._gameInitRetry = null;
        }
        this._gameInitConfig = config;
        this._gen++;
        this._gameInitRetry = {
            gen: this._gen,
            config: { ...config, gen: this._gen },
            timer: null,
            attempts: 0
        };
        this._setAwaiting(true, this._initToken(this._gen)); // 新建 retry +1（_sendGameInitNow 不再加）
        this._sendGameInitNow();
    }

    _sendGameInitNow() {
        if (!this._gameInitRetry || !this.isConnected) return;
        // 重发不再 +1（仅首次/新建 retry 时在 sendGameInit 中 +1），
        // 否则指数退避最多 8 次净泄漏 7+，"连接不稳定"提示常驻
        this.send({ type: 'game_init', config: this._gameInitRetry.config });
        this._gameInitRetry.attempts++;
        // 指数退避重发：初始 800ms，封顶 3s（消息体极小，重发成本可忽略）
        const delay = Math.min(800 * Math.pow(2, Math.floor(this._gameInitRetry.attempts / 3)), 3000);
        clearTimeout(this._gameInitRetry.timer);
        this._gameInitRetry.timer = setTimeout(() => {
            if (this._gameInitRetry) this._sendGameInitNow();
        }, delay);
    }

    _stopGameInitRetry() {
        if (this._gameInitRetry) {
            clearTimeout(this._gameInitRetry.timer);
            this._setAwaiting(false, this._initToken(this._gameInitRetry.gen));
            this._gameInitRetry = null;
        }
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
            this._setAwaiting(false, this._ackToken(this._pendingAck.seqno)); // 覆盖旧 _pendingAck：精确释放其 token
            this._pendingAck = null;
        }
        this._actionPending = true;
        const seqno = ++this._seqno;
        console.log(`[P2P] 发送动作 action=${action}, seqno=${seqno}, gen=${this._gen}`);
        const timer = setTimeout(() => {
            // ack 超时不立即断线：对方可能只是网络抖动导致 ack 丢失。
            // 释放 pending 并请求全量重同步；若连接真断，由 watchdog(15s 无消息)
            // / DataChannel close 兜底。避免"每回合 function_result 等动作丢一个 ack
            // 就误判断线"导致回合越多稳定率越低。
            console.warn(`[P2P] ack 超时，action=${action}, seqno=${seqno}，请求重同步（不再直接断线）`);
            this._pendingAck = null;
            this._actionPending = false;
            this._setAwaiting(false, this._ackToken(seqno));  // 释放等待提示（请求重同步后等快照解除）
            if (this.sendSyncRequest) this.sendSyncRequest();
        }, 8000);
        this._pendingAck = { seqno, action, rollback, timer };
        this._setAwaiting(true, this._ackToken(seqno));
        this.send({ type: 'action', action, payload, seqno, gen: this._gen });
    }

    /**
     * 标记正在等待对方回执。
     * 带 token 时按 token 精确配对（同一机制 +1 后必在同一位置 -1），
     * 杜绝"请求/确认/健康探测"等机制因回执交叉而互相抵消的计数泄漏。
     * 无 token 时退化为全局计数（兼容）。
     * 状态变化时通知 UI 显示/隐藏"连接不稳定，正在等待"提示。
     */
    _setAwaiting(awaiting, token = null) {
        if (token) {
            if (awaiting) this._awaitTokens.add(token);
            else this._awaitTokens.delete(token);
        } else {
            if (awaiting) this._awaitCount = (this._awaitCount || 0) + 1;
            else this._awaitCount = Math.max(0, (this._awaitCount || 0) - 1);
        }
        this._refreshAwaiting();
    }

    _refreshAwaiting() {
        const nowAwaiting = this._awaitTokens.size > 0 || (this._awaitCount || 0) > 0;
        if (nowAwaiting !== this._awaitingPeer) {
            this._awaitingPeer = nowAwaiting;
            if (this.onAwaitChange) this.onAwaitChange(nowAwaiting);
        }
    }

    /** 清除指定前缀的所有等待 token（如收到对方快照 = request_sync 已得到响应） */
    _clearAwaitByPrefix(prefix) {
        let changed = false;
        for (const t of [...this._awaitTokens]) {
            if (t.startsWith(prefix)) { this._awaitTokens.delete(t); changed = true; }
        }
        if (changed) this._refreshAwaiting();
    }

    _ackToken(seqno)      { return 'ack:' + seqno; }
    _initToken(gen)       { return 'init:' + gen; }
    _confirmToken(key)    { return 'confirm:' + key; }
    _reqToken(seq)        { return 'req:' + seq; }
    _healthToken(seq)     { return seq != null ? 'health:' + seq : null; }

    /** 生成一次阶段确认的标识 key（带 gen 隔离，防跨局/旧确认混淆） */
    nextSyncConfirmKey() {
        this._syncConfirmSeq = (this._syncConfirmSeq || 0) + 1;
        return `${this._gen}_${this._syncConfirmSeq}`;
    }

    /**
     * 发送全量快照。confirmKey 非空时为"阶段切换确认推送"：
     * 发送后每 0.5s 重发最新状态（带同一确认 key），直到收到对方 state_sync_ack，
     * 保证阶段切换这类关键快照在网络抖动时也必达（上限 8 次 ≈ 4s）。
     */
    sendStateSync(state, confirmKey = null) {
        // 版本号机制已能避免旧快照覆盖新状态，因此即使动作确认期间也允许发送 state_sync，
        // 防止发送方在 actionPending 时无法把阶段推进同步给对端。
        if (this._actionPending) {
            console.log('[P2P] 动作确认中，仍发送 state_sync');
        }
        console.log(`[P2P] 发送 state_sync${confirmKey ? `（确认:${confirmKey}）` : ''}`);
        this.send({ type: 'state_sync', state, gen: this._gen, confirm: confirmKey || undefined });
        if (confirmKey) {
            // 仅"新建确认"时初始化 pending 并 +1 等待计数。
            // 重发（onSyncConfirmResend 触发、同一 key）必须复用同一 pending 且【绝不能重置
            // attempts】，否则 8 次上限永远到不了 → 无限重发 → 全量快照消息风暴。
            // 新 key（新的阶段切换）覆盖旧 key：旧 pending 的 token 必须先释放，
            // 否则"前一个 confirm 没收到 ack + 新 confirm 覆盖"会净泄漏（多个连续未达
            // 会累积，"连接不稳定"提示常驻）。旧 ack 因 key 不匹配被忽略。
            const isNewKey = !this._pendingSyncConfirm || this._pendingSyncConfirm.key !== confirmKey;
            if (isNewKey) {
                if (this._pendingSyncConfirm) this._setAwaiting(false, this._confirmToken(this._pendingSyncConfirm.key));
                this._pendingSyncConfirm = { key: confirmKey, attempts: 0, timer: null };
                this._scheduleSyncConfirm();
                this._setAwaiting(true, this._confirmToken(confirmKey));
            }
        }
    }

    _scheduleSyncConfirm() {
        if (!this._pendingSyncConfirm) return;
        clearTimeout(this._pendingSyncConfirm.timer);
        this._pendingSyncConfirm.timer = setTimeout(() => {
            if (!this._pendingSyncConfirm) return;
            this._pendingSyncConfirm.attempts++;
            if (this._pendingSyncConfirm.attempts >= 8) {
                // 高频重发结束（约 4s）→ 降级为低频重发（每 2s），
                // 确保持续到对方回执或连接断开，避免关键阶段快照永久丢失。
                console.warn('[P2P] 阶段确认高频重发结束，降级为低频重发');
                this._setAwaiting(false, this._confirmToken(this._pendingSyncConfirm.key)); // 释放等待提示
                this._scheduleSyncConfirmLowFreq();
                return;
            }
            // 用最新状态重发（版本号机制保证接收方只应用更新的）
            if (this.onSyncConfirmResend) this.onSyncConfirmResend(this._pendingSyncConfirm.key);
            this._scheduleSyncConfirm();
        }, 500);
    }

    /** 确认高频重发达上限后的低频兜底：每 2s 重发一次，直到对方回执或连接断开 */
    _scheduleSyncConfirmLowFreq() {
        if (!this._pendingSyncConfirm) return;
        clearTimeout(this._pendingSyncConfirm.timer);
        this._pendingSyncConfirm.timer = setTimeout(() => {
            if (!this._pendingSyncConfirm) return;
            if (this.onSyncConfirmResend) this.onSyncConfirmResend(this._pendingSyncConfirm.key);
            this._scheduleSyncConfirmLowFreq();
        }, 2000);
    }

    _stopSyncConfirm() {
        if (this._pendingSyncConfirm) {
            clearTimeout(this._pendingSyncConfirm.timer);
            this._setAwaiting(false, this._confirmToken(this._pendingSyncConfirm.key));
            this._pendingSyncConfirm = null;
        }
    }
    sendTimerSync(remainingTime)     { this.send({ type: 'timer_sync', remainingTime, gen: this._gen }); }
    sendTimeout(player)              { this.send({ type: 'timeout', player, gen: this._gen }); }
    sendRematchRequest()             { this.send({ type: 'rematch_request' }); }
    sendSyncRequest()                {
        console.log('[P2P] 发送 request_sync');
        const token = this._reqToken(++this._reqSyncSeq);
        this._setAwaiting(true, token);
        this.send({ type: 'request_sync', gen: this._gen });
        // 10s 超时释放等待提示（由 watchdog 或收到快照兜底），避免永久显示"正在等待"。
        // 不 clear 旧 timer：每个 token 独立释放，避免连续请求时旧 token 的释放定时器被覆盖而泄漏。
        this._syncRequestTimer = setTimeout(() => this._setAwaiting(false, token), 10000);
    }
    sendHealthCheck() {
        const token = this._healthToken(++this._healthSeq);
        this._setAwaiting(true, token);
        this.send({ type: 'health_check', ts: Date.now(), token });
        // 8s 超时释放（对方可能以其他消息回应而非 health_check_ack），避免等待计数泄漏。
        // 不 clear 旧 timer：每个 token 独立释放，避免连续探测时旧 token 的释放定时器被覆盖。
        this._healthCheckTimer = setTimeout(() => this._setAwaiting(false, token), 8000);
    }

    // ─── 周期验证（sync_verify）────────────────────────────

    /** 以固定频率发送当前状态指纹，供对方检测同步状态 */
    _sendSyncVerify() {
        if (!this.isConnected) return;
        const st = (typeof this.onGetVerifyState === 'function') ? this.onGetVerifyState() : null;
        this.send({ type: 'sync_verify', gen: this._gen, st: st || null });
    }

    /**
     * 处理对手的 sync_verify：
     * - 对方未初始化 / gen 落后 → Host 补发 game_init（直到确认收到）
     * - 对方版本领先较多 → 请求对方补发全量快照
     * - 对方版本落后较多 → 主动向对方推送全量快照
     */
    _handleSyncVerify(data) {
        this._lastRemoteVerify = { gen: data.gen, st: data.st || null, ts: Date.now() };
        const r = data.st;
        if (!r) {
            // 对方尚未初始化对局（Guest 未 initGame）→ Host 补发 game_init
            if (this.isHost && data.gen < this._gen) this._ensureGameInitResend();
            return;
        }
        if (data.gen !== this._gen) {
            if (this.isHost && data.gen < this._gen) {
                // 对方仍停留在旧局/未收到本局 init → 补发 game_init
                this._ensureGameInitResend();
            } else if (!this.isHost && data.gen > this._gen) {
                // 我方（Guest）落后：Host 在收到我方 verify 后会重发 game_init，此处等待即可
                console.warn(`[P2P] 我方 gen=${this._gen} 落后于对方 gen=${data.gen}，等待 game_init 重发`);
            }
            return;
        }
        // gen 一致：比较状态版本号，判断谁落后。
        // 以"操作方权威"为原则判定方向：当前操作方（local.player 是自己）版本落后 → 主动推送
        // 自己的权威状态；被动方版本落后 → 请求操作方补发快照。即使双方版本基数漂移
        // （被动方版本虚高），方向也始终正确，避免"操作方不 push 且被动方不 request"的双向死锁。
        const local = (typeof this.onGetVerifyState === 'function') ? this.onGetVerifyState() : null;
        if (!local) { this._maybeRequestFullSync(); return; }
        const diff = r.version - local.version;
        if (Math.abs(diff) > 3) {
            if (local.player === this.myPlayerId) this._maybePushFullSync();
            else this._maybeRequestFullSync();
        }
    }

    /** 确保存在 game_init 重发任务（若已确认停止则用保留的配置重建） */
    _ensureGameInitResend() {
        if (!this.isHost || this._gen <= 0) return;
        if (!this._gameInitRetry && this._gameInitConfig) {
            this._gameInitRetry = {
                gen: this._gen,
                config: { ...this._gameInitConfig, gen: this._gen },
                timer: null,
                attempts: 0
            };
        }
        this._sendGameInitNow();
    }

    /** 节流请求对方补发全量快照（2s 一次；让落后方更频繁触发自愈，覆盖网络拥塞丢包） */
    _maybeRequestFullSync() {
        const now = Date.now();
        if (now - this._lastFullSyncRequestAt < 2000) return;
        this._lastFullSyncRequestAt = now;
        console.warn('[P2P] 检测到对方状态领先，请求全量快照重同步');
        this.sendSyncRequest();
    }

    /** 节流主动向对方推送全量快照（2s 一次；操作方 0.5s 周期兜底，push 缩短让落后方更易追上） */
    _maybePushFullSync() {
        const now = Date.now();
        if (now - this._lastFullSyncPushAt < 2000) return;
        this._lastFullSyncPushAt = now;
        console.warn('[P2P] 检测到对方状态落后，主动推送全量快照');
        if (this.onSyncRequest) this.onSyncRequest();
    }

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
        // 主动断开（disconnect() 已设置 _disconnecting = true），跳过 UI 弹窗
        if (this._disconnecting) { this._disconnecting = false; return; }
        // 断线清理已执行（DataChannel 的 close/error 可能连续触发），防重复清理与重复弹窗
        if (this._disconnectHandled) return;
        this._disconnectHandled = true;
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isConnecting = false;
        this._guestConnecting = false;
        this.conn = null;
        clearTimeout(this._watchdogId);  this._watchdogId = null;
        clearInterval(this._pingInterval); this._pingInterval = null;
        clearInterval(this._syncVerifyInterval); this._syncVerifyInterval = null;
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        this._stopGameInitRetry();
        this._stopSyncConfirm();
        clearTimeout(this._syncRequestTimer); this._syncRequestTimer = null;
        clearTimeout(this._healthCheckTimer); this._healthCheckTimer = null;
        this._sendFailStreak = 0;
        this._awaitCount = 0;
        this._awaitTokens.clear();
        if (this._awaitingPeer) {
            this._awaitingPeer = false;
            if (this.onAwaitChange) this.onAwaitChange(false);
        }
        this._gameInitConfig = null;
        this._handledInitGen = 0;
        this._lastRemoteVerify = null;
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
        this._disconnectHandled = true; // 主动断开后，DataChannel close/error 回调不得再重复清理
        this._clearTimeout();
        clearTimeout(this._watchdogId);  this._watchdogId = null;
        clearInterval(this._pingInterval); this._pingInterval = null;
        clearInterval(this._syncVerifyInterval); this._syncVerifyInterval = null;
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        this._stopGameInitRetry();
        this._stopSyncConfirm();
        clearTimeout(this._syncRequestTimer); this._syncRequestTimer = null;
        clearTimeout(this._healthCheckTimer); this._healthCheckTimer = null;
        this._sendFailStreak = 0;
        this._awaitCount = 0;
        this._awaitTokens.clear();
        if (this._awaitingPeer) {
            this._awaitingPeer = false;
            if (this.onAwaitChange) this.onAwaitChange(false);
        }
        this._gameInitConfig = null;
        this._handledInitGen = 0;
        this._lastRemoteVerify = null;
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
