/**
 * UIP2PSync —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 计时恢复、周期同步、观战同步与开关、观战条
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._resumeP2PTimer = function() {
        const gc = this.gameController;
        if (!gc || gc.gameMode !== 'p2p') return;
        if (gc.currentPhase === gc.phases.INPUT_FUNCTION) {
            if (typeof gc.resumeTimer === 'function') gc.resumeTimer();
        } else if (gc.currentPhase === gc.phases.SELECT_TARGET ||
                   gc.currentPhase === gc.phases.SET_FORBIDDEN ||
                   gc.currentPhase === gc.phases.SET_LOCKS) {
            if (typeof gc.resumeTargetTimer === 'function') gc.resumeTargetTimer();
        }
    }
;

// _p2pReturnToMenu
    UIController.prototype._p2pReturnToMenu = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.hideModal(disc);
        if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
        // 速览浮窗「确认退出进入大厅」：判负弹窗点「返回主菜单」后自动打开目标大厅
        if (this._lwPendingLobby) {
            const target = this._lwPendingLobby;
            this._lwPendingLobby = null;
            if (typeof this._lwGo === 'function') {
                // 先收拢所有残留界面回到主界面，再进入目标大厅
                if (typeof this._lwCloseAllScreens === 'function') this._lwCloseAllScreens();
                if (this.startModal && this.startModal.style.display === 'none') this.showModal(this.startModal);
                this._lwGo(target);
            }
            return;
        }
        this.handleRestart();
    }
;

// _startP2PPeriodicSync
    // 在事件驱动同步基础上，增加周期同步兜底：仅「当前玩家方」（操作方）主动推送完整状态快照，
    // 被动方只接收。事件驱动（选格/输入/锁定/阶段切换）已实时强制推送，周期推送只是兜底。
    // 频率 0.8s（放宽以减少 WebRTC 拥塞风险；操作方事件驱动仍实时，不影响同步即时性）。
    UIController.prototype._startP2PPeriodicSync = function() {
        this._stopP2PPeriodicSync();
        this._p2pSyncInterval = setInterval(() => {
            if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
            // 仅当前玩家方（操作方）主动推送
            if (!this.gameController ||
                this.gameController.currentPlayer !== this.p2pController.myPlayerId) return;
            this._syncToPeer();
        }, 800);
    }
;

// _stopP2PPeriodicSync
    UIController.prototype._stopP2PPeriodicSync = function() {
        if (this._p2pSyncInterval) {
            clearInterval(this._p2pSyncInterval);
            this._p2pSyncInterval = null;
        }
    }
;

// _startSpectateSync
    // 观战同步：仅「大厅登记的房主 + 开启观战 + 大厅连接在线」时生效，
    // 每 500ms 将 buildSyncSnapshot() 经 Lobby WS 推给服务器，由其广播给观众。
    // 复用 WebRTC 的 P2P 快照构建逻辑，观众端无需任何 WebRTC 连接。
    UIController.prototype._startSpectateSync = function() {
        this._stopSpectateSync();
        if (!this._spectateEnabled || !this._p2pRoomCode) return;
        this._spectateSyncTimer = setInterval(() => {
            if (!this.isP2PMode) return;
            const lobby = this._lobby;
            if (!lobby || !lobby.isConnected || !this._spectateEnabled) return;
            try {
                lobby.sendSpectateSync(this.buildSyncSnapshot());
            } catch (e) { /* 快照构建失败时静默跳过本次推送 */ }
        }, 500);
    }
;

// _stopSpectateSync
    UIController.prototype._stopSpectateSync = function() {
        if (this._spectateSyncTimer) {
            clearInterval(this._spectateSyncTimer);
            this._spectateSyncTimer = null;
        }
    }
;

// _toggleSpectate
    // 房主对局中切换观战开关：开启 → 恢复大厅展示；关闭 → 立即隐藏房间并踢掉观众
    UIController.prototype._toggleSpectate = function(enabled) {
        this._spectateEnabled = !!enabled;
        const lobby = this._lobby;
        if (lobby && this._p2pRoomCode) {
            lobby.setSpectateEnabled(this._p2pRoomCode, this._spectateEnabled);
        }
        this._startSpectateSync();
        this._updateSpectateBar();
    }
;

// _updateSpectateBar
    // 对局中房主顶部的观战开关指示（lobby-host-banner 内嵌）
    UIController.prototype._updateSpectateBar = function() {
        const bar = document.getElementById('lobby-host-banner');
        const toggle = document.getElementById('lobby-spectate-toggle');
        const label = document.getElementById('lobby-spectate-label');
        if (!bar) return;
        if (!this._spectateEnabled) {
            if (toggle) toggle.checked = false;
            if (label) label.textContent = '观战关闭';
            bar.classList.remove('lobby-host-banner-playing');
        } else {
            if (toggle) toggle.checked = true;
            if (label) label.textContent = '观战开启';
            bar.classList.add('lobby-host-banner-playing');
        }
    }
;

// _startP2PHealthMonitor
// 被动方健康监测：每 0.5s 检查一次。当「对方回合」期间 5s 内无推进
        // （倒计时未刷新 = 未收到 timer_sync；进入对方回合超 5s = 未收到选格/推进）时，
        // 强制发起健康探测（health_check + request_sync 补救）；对方 2s 未回执则
        // 提醒「连接较差，请耐心等待」，并持续多次补救直到对方回应或连接断开。
        // 阈值放宽：操作方（选目标格/想函数）正常思考可能 3-5s，避免误报"连接不稳定"。
