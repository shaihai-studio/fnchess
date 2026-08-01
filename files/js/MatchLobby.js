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
 *  - host_register  { options:{rounds,difficulty,timeLimitMode} } → host_registered { code }
 *  - cancel_register { code }                                     → 房主取消登记
 *  - list_rooms      {}                                           → rooms_list { rooms:[{code,options,createdAt}] }
 *  - join_request    { code }                                     → join_accepted { code } / join_rejected { code, reason }
 *  - join_cancel     { code }                                     → 访客取消加入
 *  - room_started    { code }                                     → 房间开局，从列表移除
 *  - guest_joining   { code }                                     → 服务器推送给房主：有人申请加入
 *
 * 角色约定：登记房间的 = 房主（前端调 createRoomWithCode 建房），
 *          申请加入的 = 访客（前端调 joinRoom）。开战后取房主配置，与现有 P2P 流程完全兼容。
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

    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.myRoomCode = null;   // 我作为房主登记的房间码
        this.myRoomExpiresAt = 0; // 房间到期时间戳（毫秒），状态条倒计时用
        this.rooms = [];          // 服务器推来的房间列表快照
        this._manualClose = false;
        this._reconnectTimer = null;
        this._refreshTimer = null;

        // ── 回调 ──────────────────────────────────────────────
        this.onConnectionChange = null; // (connected) => void
        this.onRoomsUpdate = null;      // (rooms) => void
        this.onHostRegistered = null;   // (code, expiresAt) => void
        this.onGuestJoining = null;     // (code) => void（房主收到：有人申请加入）
        this.onJoinAccepted = null;     // (code) => void（访客收到：服务器放行）
        this.onJoinRejected = null;     // (code, reason) => void
        this.onHostRoomExpired = null;  // (code) => void（房主收到：房间到期被服务器清理）
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
                if (this.onGuestJoining) this.onGuestJoining(String(data.code));
                break;
            case 'join_accepted':
                if (this.onJoinAccepted) this.onJoinAccepted(String(data.code));
                break;
            case 'join_rejected':
                if (this.onJoinRejected) this.onJoinRejected(String(data.code), data.reason);
                break;
        }
    }

    // ─── 发送 API ────────────────────────────────────────────

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
        }
    }

    /** 房主登记房间（options: {rounds,difficulty,timeLimitMode}） */
    hostRegister(options) {
        this._send({ type: 'host_register', options: options || {} });
    }

    /** 房主取消登记 */
    cancelHost(code) {
        this._send({ type: 'cancel_register', code: String(code || this.myRoomCode || '') });
        this.myRoomCode = null;
        this.myRoomExpiresAt = 0;
    }

    /** 拉取房间列表 */
    fetchRooms() {
        this._send({ type: 'list_rooms' });
    }

    /** 访客申请加入 */
    joinRoom(code) {
        this._send({ type: 'join_request', code: String(code) });
    }

    /** 访客取消加入 */
    cancelJoin(code) {
        this._send({ type: 'join_cancel', code: String(code) });
    }

    /** 上报房间开局，从列表移除 */
    notifyStarted(code) {
        this._send({ type: 'room_started', code: String(code || this.myRoomCode || '') });
        this.myRoomCode = null;
        this.myRoomExpiresAt = 0;
    }
}
