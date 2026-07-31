// Auto-split from UIController.js — prototype-attached methods (UILobby)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UILobby] UIController must be loaded before this file');
}

// _openLobby
    UIController.prototype._openLobby = function() {
        if (typeof MatchLobbyController === 'undefined') {
            this.showMessage('大厅模块未加载', 'error');
            return;
        }
        if (!this._lobby) this._lobby = new MatchLobbyController();
        const lobby = this._lobby;
        lobby.onConnectionChange = (connected) => this._renderLobbyStatus(connected);
        lobby.onRoomsUpdate = (rooms) => this._renderLobbyRooms(rooms);
        lobby.onHostRegistered = (code) => this._onLobbyHostRegistered(code);
        lobby.onJoinAccepted = (code) => this._onLobbyJoinAccepted(code);
        lobby.onGuestJoining = (code) => this._onLobbyGuestJoining(code);
        lobby.onJoinRejected = (code, reason) => {
            this._updateLobbyStatus('error', '加入失败：房间不可用，请刷新列表');
            this.showMessage('该房间已被占用或已关闭，请刷新后重试', 'error');
        };
        lobby.connect();
    }
;

// _closeLobby
    UIController.prototype._closeLobby = function() {
        if (this._lobby) this._lobby.disconnect();
    }
;

// _updateLobbyStatus
    UIController.prototype._updateLobbyStatus = function(state, message) {
        const status = document.getElementById('lobby-status');
        if (!status) return;
        const dot = status.querySelector('.p2p-status-dot');
        const text = status.querySelector('.lobby-status-text');
        if (dot) dot.className = 'p2p-status-dot ' + (state || 'idle');
        if (text) text.textContent = message;
    }
;

// _renderLobbyStatus
    UIController.prototype._renderLobbyStatus = function(connected) {
        this._updateLobbyStatus(
            connected ? 'connected' : 'error',
            connected ? '大厅已连接，正在刷新房间列表...' : '大厅未连接（正在自动重连...）'
        );
        // 断线时恢复建房按钮，避免按钮永久禁用
        if (!connected) {
            const btn = document.getElementById('lobby-create-btn');
            if (btn) btn.disabled = false;
        }
    }
;

// _renderLobbyRooms
    UIController.prototype._renderLobbyRooms = function(rooms) {
        const list = document.getElementById('lobby-list');
        if (!list) return;
        if (!rooms || !rooms.length) {
            list.innerHTML = '<div class="lobby-empty">暂无等待中的房间<br>点击「创建房间（进大厅）」等待其他玩家加入</div>';
            return;
        }
        list.innerHTML = '';
        rooms.forEach((room) => {
            if (!room || !room.code) return;
            const row = document.createElement('div');
            row.className = 'lobby-room-row';
            row.innerHTML = `
                <div class="lobby-room-info">
                    <span class="lobby-room-code">${this._escapeHtml(String(room.code))}</span>
                    <span class="lobby-room-desc">${this._escapeHtml(this._formatLobbyRoomDesc(room.options))}</span>
                </div>
                <button type="button" class="btn btn-small lobby-join-btn">加入</button>
            `;
            const btn = row.querySelector('.lobby-join-btn');
            btn.onclick = () => this._lobbyJoin(room.code);
            list.appendChild(row);
        });
    }
;

// _formatLobbyRoomDesc
    UIController.prototype._formatLobbyRoomDesc = function(options) {
        const rounds = options && options.rounds != null ? `${options.rounds}回合` : '?回合';
        const diff = options && options.difficulty ? this.getDifficultyName(options.difficulty) : '?难度';
        let timeLabel = '?';
        if (options && options.timeLimitMode && this.timeLimitOptions && this.timeLimitOptions.length) {
            const o = this.timeLimitOptions.find(t => t.value === options.timeLimitMode);
            if (o) timeLabel = o.label;
        }
        return `${diff} · ${rounds} · ${timeLabel}`;
    }
;

// _escapeHtml
    UIController.prototype._escapeHtml = function(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
;

// _lobbyHostRegister
    UIController.prototype._lobbyHostRegister = function() {
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected) {
            this.showMessage('大厅未连接，请稍候再试', 'error');
            return;
        }
        if (this.p2pController && (this.p2pController.isConnecting || this.p2pController.isConnected)) {
            this.showMessage('已有进行中的联机连接，请先返回再操作', 'error');
            return;
        }
        const rounds = this._getP2PRounds();
        const difficulty = this._getP2PDifficulty();
        const timeLimitMode = this._getP2PTimeLimitMode();
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = true;
        this._updateLobbyStatus('creating', '正在向大厅登记房间...');
        lobby.hostRegister({ rounds, difficulty, timeLimitMode });
    }
;

// _onLobbyHostRegistered
    UIController.prototype._onLobbyHostRegistered = function(code) {
        // 用大厅分配的房间码创建 P2P 房间（复用预留钩子 createRoomWithCode）
        if (this.p2pController) this.p2pController.createRoomWithCode(code);
        this._updateLobbyStatus('waiting', `房间 ${code} 已登记，等待对手加入...`);
        this.showMessage(`房间 ${code} 已创建，等待对手加入`);
    }
;

// _lobbyJoin
    UIController.prototype._lobbyJoin = function(code) {
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected) {
            this.showMessage('大厅未连接，请稍候再试', 'error');
            return;
        }
        if (this.p2pController && (this.p2pController.isConnecting || this.p2pController.isConnected)) {
            this.showMessage('已有进行中的联机连接，请先返回再操作', 'error');
            return;
        }
        this._joiningRoomCode = String(code);
        this._updateLobbyStatus('joining', `正在申请加入房间 ${code}...`);
        lobby.joinRoom(code);
    }
;

// _onLobbyJoinAccepted
    UIController.prototype._onLobbyJoinAccepted = function(code) {
        // 服务器放行：用房间码加入房主创建的 P2P 房间
        if (this.p2pController) this.p2pController.joinRoom(code);
        this._updateLobbyStatus('joining', `加入请求已通过，正在连接房间 ${code}...`);
    }
;

// _onLobbyGuestJoining
    UIController.prototype._onLobbyGuestJoining = function(code) {
        this._updateLobbyStatus('connecting', `有对手加入你的房间（${code}），正在建立连接...`);
    }
;

// _lobbyCancelHost
    UIController.prototype._lobbyCancelHost = function() {
        const lobby = this._lobby;
        if (lobby) lobby.cancelHost();
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = false;
    }
;

// _bindLobbyEvents
    UIController.prototype._bindLobbyEvents = function() {
        const $ = id => document.getElementById(id);
        const createBtn = $('lobby-create-btn');
        if (createBtn) createBtn.onclick = () => this._lobbyHostRegister();
        const refreshBtn = $('lobby-refresh-btn');
        if (refreshBtn) refreshBtn.onclick = () => {
            if (this._lobby) this._lobby.fetchRooms();
            this.showMessage('已刷新房间列表');
        };
        const backBtn = $('lobby-back-btn');
        if (backBtn) backBtn.onclick = () => {
            this.hideModal(document.getElementById('p2p-room-modal'));
            this._cleanupP2P();
        };
    }
;
