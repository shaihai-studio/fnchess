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
 * MatchLobbyController - 匹配大厅控制器（房间列表式大厅）
 * 通过 WebSocket 连接服务器的 /lobby 端点，与 PeerJS 信令同一端口。
 *
 * 协议（JSON，字符串收发）：
 *  - host_register  { options:{rounds,difficulty,timeLimitMode,longLived,allowSpectate,eloRange}, playerId } → host_registered { code }
 *    eloRange>0 = 开启 ELO 距离过滤（以房主 ELO 为基准，距房主超过该分差的玩家不可见/不可加入）
 *  - cancel_register { code }                                     → 房主取消登记
 *  - list_rooms      { mode, playerId }                           → rooms_list { rooms:[{code,options,createdAt,status,spectatorCount,hostElo}] }
 *    （排位模式服务端按房主 hostElo 与访客 playerId 做 ELO 距离过滤；hostElo 用于前端"距我最近"排序）
 *  - join_request    { code, mode, playerId }                     → join_accepted { code } / join_rejected { code, reason }
 *    reason='elo_range' = 距房主 ELO 超过房间过滤阈值
 *  - join_cancel     { code }                                     → 访客取消加入
 *  - room_started    { code, spectate }                           → 房间开局；spectate=true 保留在大厅，否则移除
 *  - guest_joining   { code }                                     → 服务器推送给房主：有人申请加入
 *  - spectate_enable / spectate_disable { code }                  → 房主切换观战开关（对局中随时可切）
 *  - spectate_join   { code, playerId }                           → 观众加入观战 → spectate_joined / spectate_join_rejected
 *    （房间开启 ELO 过滤时，距房主太远的观众同样被拒，reason='elo_range'）
 *  - spectate_leave  { code }                                     → 观众退出观战
 *  - spectate_sync   { payload }                                  → 房主推送快照 → 服务器广播 spectate_state 给观众
 *
 * 角色约定：登记房间的 = 房主（前端调 createRoomWithCode 建房），
 *          申请加入的 = 访客（前端调 joinRoom）。开战后取房主配置，与现有 P2P 流程完全兼容。
 *          观战的 = 观众（前端调 joinSpectate，仅走 Lobby WS，不涉及 PeerJS）。
 */
class MatchLobbyController {
    static get lobbyUrl() {
        const sig = (typeof P2PController !== 'undefined' && P2PController.signaling)
            ? P2PController.signaling
            : { host: 'localhost', port: 9000, secure: false };
        const scheme = sig.secure ? 'wss' : 'ws';
        const portStr = sig.port && sig.port !== 80 ? ':' + sig.port : '';
        return `${scheme}://${sig.host}${portStr}/lobby`;
    }

    constructor(callbacks) {
        this.ws = null;
        this.isConnected = false;
        this.myRoomCode = null;   // 我作为房主登记的房间码
        this.myRoomExpiresAt = 0; // 房间到期时间戳（毫秒），状态条倒计时用
        this.rooms = [];          // 服务器推来的房间列表快照
        this._manualClose = false;
        this._reconnectTimer = null;
        this._refreshTimer = null;

        // ── 回调 ──────────────────────────────────────────────
        // 2026-08-11 修复：构造函数原本不接受参数，调用方传入的回调配置被静默丢弃，
        // 导致 onConnectionChange 永远为 null → UI 一直显示"连接大厅中…"。
        // 现在支持 new MatchLobbyController({ onConnectionChange: fn, ... })，无参时保持 null。
        this.onConnectionChange = null;   // (connected) => void
        this.onRoomsUpdate = null;        // (rooms) => void
        this.onHostRegistered = null;     // (code, expiresAt) => void
        this.onGuestJoining = null;       // (code, info) => void（房主收到：有人申请加入；info={playerId,nickname,currentPlayers,maxPlayers}）
        this.onGuestLeft = null;          // (code, info) => void（房主收到：竞速访客离开/断开）
        this.onJoinAccepted = null;       // (code, maxPlayers) => void（访客收到：服务器放行）
        this.onJoinRejected = null;       // (code, reason) => void
        this.onHostRoomExpired = null;    // (code) => void（房主收到：房间到期被服务器清理）
        // ── 观战回调 ─────────────────────────────────────────
        this.onSpectateState = null;      // (payload, code) => void（观众收到状态快照）
        this.onSpectateEnded = null;      // (code, reason) => void（观战结束：房主关闭/断线）
        this.onSpectateJoined = null;     // (code) => void（观众加入成功）
        this.onSpectateJoinRejected = null;// (code, reason) => void（观众加入被拒）
        this.onSpectateEmoji = null;      // (code, mood) => void（收到观众发表情：对战双方与其他观众）
        // ── 排行榜回调 ─────────────────────────────────────────
        this.onLeaderboardResult = null;  // (data) => void（收到排行榜查询结果）
        this.onPlayerEloResult = null;    // (data) => void（收到批量 ELO 查询结果）
        this.onChallenge = null;          // (data) => void（收到签名一次性 nonce）
        this.onSubmitResult = null;       // (data) => void（收到上报结果 verify_failed / rate_limited 等）

        // ── 房间解散回调 ───────────────────────────────────────
        this.onRoomDissolved = null;      // (data) => void（对战方收到房主解散房间）

        // ── 大厅模式过滤 ──────────────────────────────────────
        this.currentLobbyMode = null;     // 'ranked' | 'casual' | null（拉取/加入房间时按此过滤）

        // 将调用方传入的回调配置合并到本实例
        if (callbacks && typeof callbacks === 'object') {
            const CALLBACK_KEYS = [
                'onConnectionChange', 'onRoomsUpdate', 'onHostRegistered',
                'onGuestJoining', 'onGuestLeft', 'onJoinAccepted', 'onJoinRejected',
                'onHostRoomExpired', 'onSpectateState', 'onSpectateEnded',
                'onSpectateJoined', 'onSpectateJoinRejected', 'onSpectateEmoji',
                'onLeaderboardResult', 'onPlayerEloResult', 'onChallenge',
                'onSubmitResult', 'onRoomDissolved'
            ];
            for (const k of CALLBACK_KEYS) {
                if (typeof callbacks[k] === 'function') this[k] = callbacks[k];
            }
        }
    }

    // ─── 连接管理 ────────────────────────────────────────────

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        this._manualClose = false;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        let ws;
        try {
            ws = new WebSocket(this.constructor.lobbyUrl);
        } catch (e) {
            this.isConnected = false;
            this._notifyConnection(false);
            this._scheduleReconnect();
            return;
        }
        this.ws = ws;
        ws.onopen = () => {
            this.isConnected = true;
            this._notifyConnection(true);
            this.fetchRooms();
            this._startRefresh();
        };
        ws.onmessage = (ev) => {
            let data;
            try { data = JSON.parse(ev.data); } catch (e) { return; }
            if (data && data.type) this._handleMessage(data);
        };
        ws.onclose = () => {
            this.ws = null;
            this.isConnected = false;
            this._stopRefresh();
            this._notifyConnection(false);
            if (!this._manualClose) this._scheduleReconnect();
        };
        ws.onerror = () => { /* 由 onclose 统一处理 */ };
    }

    disconnect() {
        this._manualClose = true;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._stopRefresh();
        if (this.ws) {
            try { this.ws.close(); } catch (e) { /* 忽略 */ }
            this.ws = null;
        }
        this.isConnected = false;
        this.myRoomCode = null;
        this.myRoomExpiresAt = 0;
        this.rooms = [];
        this._notifyConnection(false);
    }

    _scheduleReconnect() {
        if (this._manualClose) return;
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (!this._manualClose) this.connect();
        }, 3000);
    }

    _startRefresh() {
        this._stopRefresh();
        this._refreshTimer = setInterval(() => {
            if (this.isConnected) this.fetchRooms();
        }, 2500);
    }

    _stopRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    /** 暂停房间列表自动刷新（对局进行中调用，节省流量） */
    pauseRefresh() {
        this._stopRefresh();
    }

    /** 恢复房间列表自动刷新（已连接时生效） */
    resumeRefresh() {
        if (!this.isConnected) return;
        this._startRefresh();
    }

    _notifyConnection(connected) {
        if (this.onConnectionChange) this.onConnectionChange(connected);
    }

    // ─── 消息处理 ────────────────────────────────────────────

    _handleMessage(data) {
        switch (data.type) {
            case 'rooms_list':
                this.rooms = Array.isArray(data.rooms) ? data.rooms : [];
                if (this.onRoomsUpdate) this.onRoomsUpdate(this.rooms);
                break;
            case 'host_registered':
                this.myRoomCode = String(data.code);
                this.myRoomExpiresAt = Number(data.expiresAt) || 0;
                if (this.onHostRegistered) this.onHostRegistered(this.myRoomCode, this.myRoomExpiresAt);
                break;
            case 'room_expired':
                this.myRoomCode = null;
                this.myRoomExpiresAt = 0;
                if (this.onHostRoomExpired) this.onHostRoomExpired(String(data.code));
                break;
            case 'guest_joining':
                if (this.onGuestJoining) this.onGuestJoining(String(data.code), {
                    playerId: data.playerId || '',
                    nickname: data.nickname || '',
                    currentPlayers: data.currentPlayers,
                    maxPlayers: data.maxPlayers
                });
                break;
            case 'guest_left':
                if (this.onGuestLeft) this.onGuestLeft(String(data.code), {
                    playerId: data.playerId || '',
                    nickname: data.nickname || '',
                    currentPlayers: data.currentPlayers,
                    maxPlayers: data.maxPlayers
                });
                break;
            case 'join_accepted':
                if (this.onJoinAccepted) this.onJoinAccepted(String(data.code), data.maxPlayers || 2);
                break;
            case 'join_rejected':
                if (this.onJoinRejected) this.onJoinRejected(String(data.code), data.reason);
                break;
            case 'spectate_state':
                if (this.onSpectateState) this.onSpectateState(data.payload, String(data.code));
                break;
            case 'spectate_ended':
                if (this.onSpectateEnded) this.onSpectateEnded(String(data.code), data.reason);
                break;
            case 'spectate_joined':
                if (this.onSpectateJoined) this.onSpectateJoined(String(data.code));
                break;
            case 'spectate_join_rejected':
                if (this.onSpectateJoinRejected) this.onSpectateJoinRejected(String(data.code), data.reason);
                break;
            case 'spectate_emoji_from_viewer':
                if (this.onSpectateEmoji) this.onSpectateEmoji(String(data.code), data.mood);
                break;
            case 'leaderboard_result':
                if (this.onLeaderboardResult) this.onLeaderboardResult(data);
                break;
            case 'player_elo_result':
                if (this.onPlayerEloResult) this.onPlayerEloResult(data);
                break;
            case 'challenge':
                if (this.onChallenge) this.onChallenge(data);
                break;
            case 'submit_result':
                if (this.onSubmitResult) this.onSubmitResult(data);
                break;
            case 'room_dissolved':
                if (this.onRoomDissolved) this.onRoomDissolved(data);
                break;
        }
    }

    // ─── 发送 API ────────────────────────────────────────────

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
        }
    }

    _getPlayerId() {
        return (typeof PlayerProfile !== 'undefined' && PlayerProfile.getPlayerId)
            ? PlayerProfile.getPlayerId()
            : '';
    }

    _getNickname() {
        return (typeof PlayerProfile !== 'undefined' && PlayerProfile.getProfile)
            ? (PlayerProfile.getProfile().nickname || '')
            : '';
    }

    /** 房主登记房间（options: {rounds,difficulty,timeLimitMode,mode,eloRange}；mode=排位/休闲）
     *  eloRange>0 时开启 ELO 距离过滤（以房主 ELO 为基准，超出该分差的玩家不可见/不可加入） */
    hostRegister(options) {
        const opts = options || {};
        if (this.currentLobbyMode && !opts.mode) opts.mode = this.currentLobbyMode;
        // eloRange 是过滤开关配置，抽离为顶层字段（服务器入 room.eloRange），不混入 options 配置描述
        const rawRange = Number(opts.eloRange);
        const eloRange = isFinite(rawRange) && rawRange > 0 ? rawRange : null;
        delete opts.eloRange;
        this._send({
            type: 'host_register',
            options: opts,
            playerId: this._getPlayerId(),
            eloRange,
            nickname: this._getNickname()
        });
    }

    /** 房主取消登记 */
    cancelHost(code) {
        this._send({ type: 'cancel_register', code: String(code || this.myRoomCode || '') });
        this.myRoomCode = null;
        this.myRoomExpiresAt = 0;
    }

    /** 拉取房间列表（按当前大厅模式过滤：休闲看不到排位房间，反之亦然；
     *  携带本机 playerId 供服务器做 ELO 距离过滤与房主 ELO 下发） */
    fetchRooms() {
        this._send({
            type: 'list_rooms',
            mode: this.currentLobbyMode || null,
            playerId: this._getPlayerId()
        });
    }

    /** 访客申请加入（带模式与身份，服务器校验匹配及 ELO 距离过滤；竞速房昵称用于成员列表） */
    joinRoom(code) {
        this._send({
            type: 'join_request',
            code: String(code),
            mode: this.currentLobbyMode || null,
            playerId: this._getPlayerId(),
            nickname: this._getNickname()
        });
    }

    /** 访客取消加入 */
    cancelJoin(code) {
        this._send({ type: 'join_cancel', code: String(code) });
    }

    /** 上报房间开局。spectate=true 时房间保留在大厅（可被观战），false 时从大厅移除 */
    notifyStarted(code, spectate) {
        this._send({
            type: 'room_started',
            code: String(code || this.myRoomCode || ''),
            spectate: spectate !== false
        });
        this.myRoomCode = null;
        this.myRoomExpiresAt = 0;
    }

    // ─── 观战 API ────────────────────────────────────────────

    /** 房主切换观战开关（对局中随时可切；关闭会立即踢掉观众并隐藏房间） */
    setSpectateEnabled(code, enabled) {
        this._send({
            type: enabled ? 'spectate_enable' : 'spectate_disable',
            code: String(code || this.myRoomCode || '')
        });
    }

    /** 房主推送状态快照 → 服务器广播给该房间所有观众 */
    sendSpectateSync(snapshot) {
        this._send({ type: 'spectate_sync', payload: snapshot });
    }

    /** 观众加入观战（仅需房间码，不涉及 PeerJS；携带 playerId 供 ELO 距离过滤校验） */
    joinSpectate(code) {
        this._send({ type: 'spectate_join', code: String(code), playerId: this._getPlayerId() });
    }

    /** 观众退出观战 */
    leaveSpectate(code) {
        this._send({ type: 'spectate_leave', code: String(code) });
    }

    /** 观众发表情 → 服务器转发给该房间对战双方与其他观众 */
    sendSpectateEmoji(code, mood) {
        this._send({ type: 'spectate_emoji', code: String(code), mood: String(mood) });
    }

    // ─── 排行榜 API ────────────────────────────────────────────

    /** 上报成绩（boardType: 'lr' | 'tt' | 'elo'，其余字段由调用方提供） */
    submitScore(payload) {
        this._send(Object.assign({ type: 'submit_score' }, payload || {}));
    }

    /** 查询榜单 → 服务器回 leaderboard_result */
    queryLeaderboard(boardType, playerId, id) {
        this._send({ type: 'query_leaderboard', boardType: String(boardType), playerId: String(playerId), id: String(id) });
    }

    /** 批量查询玩家 ELO → 服务器回 player_elo_result */
    queryPlayerElo(playerIds, id) {
        this._send({ type: 'query_player_elo', playerIds: Array.isArray(playerIds) ? playerIds : [], id: String(id) });
    }

    /** 房主主动解散房间（对局中/等待中退出），服务器会通知对战方与观众 */
    notifyRoomDissolve() {
        this._send({ type: 'room_dissolve' });
    }
}
