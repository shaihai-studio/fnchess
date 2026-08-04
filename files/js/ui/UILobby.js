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
        // 每次进入大厅先重置状态文本，避免残留上一局的"正在连接房间 xxx"
        this._updateLobbyStatus('idle', '正在连接大厅...');
        // 大厅按对局模式过滤：休闲玩家看不到排位房间（反之亦然）
        lobby.currentLobbyMode = this._getP2PMode();
        lobby.onConnectionChange = (connected) => this._renderLobbyStatus(connected);
        lobby.onRoomsUpdate = (rooms) => this._renderLobbyRooms(rooms);
        lobby.onHostRegistered = (code, expiresAt) => this._onLobbyHostRegistered(code, expiresAt);
        lobby.onJoinAccepted = (code) => this._onLobbyJoinAccepted(code);
        lobby.onGuestJoining = (code) => this._onLobbyGuestJoining(code);
        lobby.onJoinRejected = (code, reason) => {
            this._updateLobbyStatus('error', '加入失败：房间不可用，请刷新列表');
            this.showMessage('该房间已被占用或已关闭，请刷新后重试', 'error');
        };
        lobby.onHostRoomExpired = (code) => this._onLobbyHostRoomExpired(code);
        // 若房主已有活跃房间（离开联机界面时保留的），恢复状态条与删除按钮
        if (lobby.myRoomCode) {
            this._showHostRoomBanner(lobby.myRoomCode, lobby.myRoomExpiresAt);
            this._refreshHostDeleteBtn();
        }
        // connect() 在已连接时是幂等跳过；记录是否本就已连接，用于立即刷新状态显示
        const alreadyConnected = lobby.isConnected && lobby.ws && lobby.ws.readyState === WebSocket.OPEN;
        lobby.connect();
        lobby.resumeRefresh();
        lobby.fetchRooms();
        if (alreadyConnected) this._renderLobbyStatus(true);
    }
;

// _closeLobby
    // 离开联机界面。房主有活跃房间时不断开大厅连接（房间存活、状态条常驻），
    // 仅暂停列表刷新；无活跃房间才真正断开连接。
    UIController.prototype._closeLobby = function() {
        if (!this._lobby) return;
        if (this._lobby.myRoomCode) {
            this._lobby.pauseRefresh();
            return;
        }
        this._lobby.disconnect();
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
    // 房间列表两种状态：
    //  - waiting：等待加入 → 「加入」按钮
    //  - playing（开启观战）：对战中 → 「观战」按钮
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
            const playing = room.status === 'playing';
            const row = document.createElement('div');
            row.className = 'lobby-room-row' + (playing ? ' lobby-room-playing' : '');
            const desc = playing
                ? `对战中 · 观众 ${room.spectatorCount || 0} 人 · ${this._escapeHtml(this._formatLobbyRoomDesc(room.options))}`
                : this._escapeHtml(this._formatLobbyRoomDesc(room.options));
            row.innerHTML = `
                <div class="lobby-room-info">
                    <span class="lobby-room-code">${this._escapeHtml(String(room.code))}</span>
                    <span class="lobby-room-desc">${desc}</span>
                </div>
                <button type="button" class="btn btn-small lobby-join-btn">${playing ? '观战' : '加入'}</button>
            `;
            const btn = row.querySelector('.lobby-join-btn');
            if (playing) {
                btn.onclick = () => this._lobbySpectate(room.code);
            } else {
                btn.onclick = () => this._lobbyJoin(room.code);
            }
            list.appendChild(row);
        });
    }
;

// _lobbySpectate
    // 观众从大厅列表点击「观战」按钮：关闭联机弹窗 → 进入观战模式
    UIController.prototype._lobbySpectate = function(code) {
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected) {
            this.showMessage('大厅未连接，请稍候再试', 'error');
            return;
        }
        if (this.p2pController && (this.p2pController.isConnecting || this.p2pController.isConnected)) {
            this.showMessage('你正在对局中，无法观战', 'error');
            return;
        }
        if (typeof this.enterSpectatorMode !== 'function') {
            this.showMessage('观战模块未加载', 'error');
            return;
        }
        const p2pModal = document.getElementById('p2p-room-modal');
        if (p2pModal) this.hideModal(p2pModal);
        this.enterSpectatorMode(String(code));
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
        // 长效模式：有效期 30 分钟、房间号以 00 开头
        const longLived = !!(document.getElementById('lobby-long-lived-toggle') || {}).checked;
        // 允许观战：默认开启（未显式取消勾选即为开启）
        const allowSpectate = (document.getElementById('lobby-allow-spectate-toggle') || {}).checked !== false;
        this._spectateEnabled = allowSpectate;
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = true;
        this._updateLobbyStatus('creating', '正在向大厅登记房间...');
        lobby.hostRegister({ rounds, difficulty, timeLimitMode, longLived, allowSpectate, mode: this._getP2PMode() });
    }
;

// _onLobbyHostRegistered
    UIController.prototype._onLobbyHostRegistered = function(code, expiresAt) {
        // 用大厅分配的房间码创建 P2P 房间（复用预留钩子 createRoomWithCode）。
        // 关键：PeerJS 等待对手加入的超时对齐服务器房间有效期——长效模式 30 分钟，
        // 普通模式 5 分钟。否则 PeerJS 默认 60s 超时会提前 disconnect() 销毁房间
        // （服务器房间仍存活，访客却无法加入 → "等几分钟就被提示没连接到对手"）。
        // 服务器到期会发 room_expired → _onLobbyHostRoomExpired 正常收尾。
        let waitTimeout = 60000;
        const exp = Number(expiresAt) || 0;
        if (exp > 0) waitTimeout = Math.max(0, exp - Date.now());
        if (this.p2pController) this.p2pController.createRoomWithCode(code, waitTimeout);
        this._updateLobbyStatus('waiting', `房间 ${code} 已登记，等待对手加入...`);
        this.showMessage(`房间 ${code} 已创建，等待对手加入`);
        // 常驻顶部状态条 + 显示删除房间按钮
        this._showHostRoomBanner(code, expiresAt);
        this._refreshHostDeleteBtn();
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
        // 有人加入 → 隐藏常驻状态条，准备切入对战
        this._stopHostRoomBanner();
        this._refreshHostDeleteBtn();
        this._updateLobbyStatus('connecting', `有对手加入你的房间（${code}），正在建立连接...`);
    }
;

// _lobbyCancelHost
    UIController.prototype._lobbyCancelHost = function() {
        const lobby = this._lobby;
        if (lobby) lobby.cancelHost();
        this._stopHostRoomBanner();
        this._refreshHostDeleteBtn();
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = false;
    }
;

// _bindLobbyEvents
    UIController.prototype._bindLobbyEvents = function() {
        const $ = id => document.getElementById(id);
        const createBtn = $('lobby-create-btn');
        if (createBtn) createBtn.onclick = () => this._lobbyHostRegister();
        // 「删除房间」按钮（仅房主可见）：销毁房间并关闭建房等待
        const deleteBtn = $('lobby-delete-btn');
        if (deleteBtn) deleteBtn.onclick = () => this._lobbyDeleteRoom();
        // 长效模式开关（30 分钟，房间号以 00 开头）
        const longToggle = $('lobby-long-lived-toggle');
        if (longToggle) longToggle.onchange = () => {};
        // 对局中观战开关（开局后状态条显示；关闭 → 立即隐藏房间并踢观众）
        const spectateToggle = $('lobby-spectate-toggle');
        if (spectateToggle) spectateToggle.onchange = () => this._toggleSpectate(spectateToggle.checked);
    }
;

// _onLobbyHostRoomExpired
    UIController.prototype._onLobbyHostRoomExpired = function(code) {
        this._stopHostRoomBanner();
        this._refreshHostDeleteBtn();
        this._cleanupHostWaiting();
        this._updateLobbyStatus('idle', '房间已过期，请重新创建');
        this.showMessage('房间已过期，请重新创建', 'warning');
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = false;
    }
;

// _cleanupHostWaiting
    // 房主建房等待但尚未开局时，关闭 PeerJS 等待连接（房间被删除/过期后调用）
    UIController.prototype._cleanupHostWaiting = function() {
        if (this.p2pController && this.p2pController.isHost && !this.p2pController.isConnected) {
            this.p2pController.disconnect();
        }
    }
;

// _showHostRoomBanner
    // 常驻顶部状态条：[房间ID] 等待玩家加入 剩余时间：[MM:SS]
    // 房主关闭联机弹窗/返回主菜单后仍保持显示（大厅连接常驻，房间存活）
    UIController.prototype._showHostRoomBanner = function(code, expiresAt) {
        const banner = document.getElementById('lobby-host-banner');
        if (!banner) return;
        const codeEl = document.getElementById('lobby-banner-code');
        if (codeEl) codeEl.textContent = String(code || '------');
        this._hostRoomExpiresAt = Number(expiresAt) || (Date.now() + 300000);
        banner.style.display = 'flex';
        this._startHostRoomBannerTimer();
        this._updateHostRoomBannerTime();
    }
;

// _startHostRoomBannerTimer
    UIController.prototype._startHostRoomBannerTimer = function() {
        this._stopHostRoomBannerTimer();
        this._hostRoomBannerTimer = setInterval(() => {
            if (!this._updateHostRoomBannerTime()) this._stopHostRoomBannerTimer();
        }, 1000);
    }
;

// _stopHostRoomBannerTimer
    UIController.prototype._stopHostRoomBannerTimer = function() {
        if (this._hostRoomBannerTimer) {
            clearInterval(this._hostRoomBannerTimer);
            this._hostRoomBannerTimer = null;
        }
    }
;

// _updateHostRoomBannerTime
    UIController.prototype._updateHostRoomBannerTime = function() {
        const timeEl = document.getElementById('lobby-banner-time');
        const remaining = Math.max(0, Math.floor((this._hostRoomExpiresAt - Date.now()) / 1000));
        if (timeEl) timeEl.textContent = this._formatMMSS(remaining);
        if (remaining <= 0) {
            // 房间到期：隐藏状态条、清理建房等待
            this._stopHostRoomBanner();
            this._cleanupHostWaiting();
            this.showMessage('房间已过期，请重新创建', 'warning');
            return false;
        }
        return true;
    }
;

// _stopHostRoomBanner
    UIController.prototype._stopHostRoomBanner = function() {
        this._stopHostRoomBannerTimer();
        const banner = document.getElementById('lobby-host-banner');
        if (banner) {
            banner.style.display = 'none';
            banner.classList.remove('lobby-host-banner-playing');
        }
        const waitingEl = document.getElementById('lobby-banner-waiting');
        if (waitingEl) waitingEl.style.display = '';
        const statusEl = document.getElementById('lobby-banner-status');
        if (statusEl) statusEl.textContent = '等待玩家加入';
        const toggleWrap = document.getElementById('lobby-spectate-toggle-wrap');
        if (toggleWrap) toggleWrap.style.display = 'none';
        this._hostRoomExpiresAt = 0;
    }
;

// _showHostGameBanner
    // 开局后房主状态条切换为"对战中"，并显示观战开关（对局中随时切换）
    UIController.prototype._showHostGameBanner = function(code) {
        const banner = document.getElementById('lobby-host-banner');
        if (!banner) return;
        const codeEl = document.getElementById('lobby-banner-code');
        if (codeEl) codeEl.textContent = String(code || '------');
        const statusEl = document.getElementById('lobby-banner-status');
        if (statusEl) statusEl.textContent = '对战中';
        const waitingEl = document.getElementById('lobby-banner-waiting');
        if (waitingEl) waitingEl.style.display = 'none';
        const toggleWrap = document.getElementById('lobby-spectate-toggle-wrap');
        if (toggleWrap) toggleWrap.style.display = 'inline-flex';
        this._stopHostRoomBannerTimer(); // 对局中无等待倒计时
        banner.style.display = 'flex';
        banner.classList.add('lobby-host-banner-playing');
        this._updateSpectateBar();
    }
;

// _formatMMSS
    UIController.prototype._formatMMSS = function(totalSeconds) {
        const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const s = String(totalSeconds % 60).padStart(2, '0');
        return `${m}:${s}`;
    }
;

// _refreshHostDeleteBtn
    // 「删除房间」按钮仅房主（有活跃房间）可见
    UIController.prototype._refreshHostDeleteBtn = function() {
        const btn = document.getElementById('lobby-delete-btn');
        if (!btn) return;
        const active = !!(this._lobby && this._lobby.myRoomCode);
        btn.style.display = active ? '' : 'none';
    }
;

// _lobbyDeleteRoom
    // 房主主动删除房间（大厅「删除房间」按钮）
    UIController.prototype._lobbyDeleteRoom = function() {
        const lobby = this._lobby;
        if (!lobby || !lobby.myRoomCode) return;
        const code = lobby.myRoomCode;
        this._destroyHostRoom();
        this._updateLobbyStatus('idle', `房间 ${code} 已删除`);
        this.showMessage(`房间 ${code} 已删除`);
        const btn = document.getElementById('lobby-create-btn');
        if (btn) btn.disabled = false;
    }
;

// _destroyHostRoom
    // 销毁房主房间（删除房间按钮 / 退出确认框确认后调用）
    UIController.prototype._destroyHostRoom = function() {
        const lobby = this._lobby;
        if (lobby && lobby.myRoomCode) {
            lobby.cancelHost(lobby.myRoomCode);
        }
        this._stopHostRoomBanner();
        this._cleanupHostWaiting();
        this._refreshHostDeleteBtn();
    }
;

// _confirmP2PExit
    // 退出拦截：房主有活跃房间时弹二次确认
    // 确认 = 销毁房间并退出；取消 = 返回界面
    UIController.prototype._confirmP2PExit = function(onConfirm) {
        const modal = document.getElementById('p2p-exit-confirm-modal');
        if (!modal || !this._lobby || !this._lobby.myRoomCode) {
            if (onConfirm) onConfirm();
            return;
        }
        this._p2pExitConfirmCb = onConfirm;
        this.showModal(modal);
        const ok = document.getElementById('p2p-exit-confirm-ok');
        const cancel = document.getElementById('p2p-exit-confirm-cancel');
        if (ok) ok.onclick = () => {
            this._destroyHostRoom();
            this.hideModal(modal);
            const cb = this._p2pExitConfirmCb;
            this._p2pExitConfirmCb = null;
            if (cb) cb();
        };
        if (cancel) cancel.onclick = () => {
            this.hideModal(modal);
            this._p2pExitConfirmCb = null;
        };
        // ESC / 点遮罩 = 取消
        this.bindModalDismiss(modal, () => {
            this.hideModal(modal);
            this._p2pExitConfirmCb = null;
        });
    }
;

// _p2pCloseRoomModal
    // 关闭联机房间弹窗（返回按钮 / ESC / 遮罩）：
    // 房主退出联机界面不再销毁房间 —— 房间保留（大厅 WS 常驻 + PeerJS 建房连接保留 +
    // 顶部状态条继续显示），有对手加入仍会自动切入对战。
    // 只有「退出函数棋」（关闭页面）才由 beforeunload 弹确认提醒。
    UIController.prototype._p2pCloseRoomModal = function() {
        const p2pModal = document.getElementById('p2p-room-modal');
        if (p2pModal) this.hideModal(p2pModal);
        // 对局中（PeerJS 已连接）该弹窗本不可见，保险起见不得清理对局连接与观战同步
        if (this.p2pController && this.p2pController.isConnected) return;
        this._cleanupP2P();
    }
;
