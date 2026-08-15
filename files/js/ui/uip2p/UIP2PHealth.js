/**
 * UIP2PHealth —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * Peer 健康监控：启动/停止/心跳/活动重置/等待横幅
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

        UIController.prototype._startP2PHealthMonitor = function() {
        this._stopP2PHealthMonitor();
        this._p2pHealthChecking = false;
        this._p2pHealthRetryCount = 0;
        this._p2pWaitStartAt = null;
        this._p2pLastTimerVal = null;
        this._p2pStallWarnedAt = 0;
        this._p2pHealthCheckAt = 0;
        this._p2pHealthTimer = setInterval(() => this._tickP2PHealth(), 500);
    }
;

// _stopP2PHealthMonitor
    UIController.prototype._stopP2PHealthMonitor = function() {
        if (this._p2pHealthTimer) {
            clearInterval(this._p2pHealthTimer);
            this._p2pHealthTimer = null;
        }
        this._p2pHealthChecking = false;
        this._p2pHealthRetryCount = 0;
        this._p2pWaitStartAt = null;
        this._p2pLastTimerVal = null;
    }
;

// _tickP2PHealth
    UIController.prototype._tickP2PHealth = function() {
        const p2p = this.p2pController;
        if (!p2p || !p2p.isConnected || !this.isP2PMode) return;
        const gc = this.gameController;
        if (!gc) return;
        const now = Date.now();
        // 我方操作：无需监测对方
        if (gc.currentPlayer === p2p.myPlayerId) {
            this._p2pWaitStartAt = null;
            this._p2pHealthChecking = false;
            this._p2pHealthRetryCount = 0;
            return;
        }
        // 对方回合：记录进入等待的起点
        if (this._p2pWaitStartAt == null) this._p2pWaitStartAt = now;
        // 倒计时刷新（timer_sync 持续到达）= 对方有推进，重置计时
        if (this._p2pLastTimerVal === null || gc.remainingTime !== this._p2pLastTimerVal) {
            this._p2pLastTimerVal = gc.remainingTime;
            this._p2pWaitStartAt = now;
            this._p2pHealthChecking = false;
            return;
        }
        // 等待超时（进入对方回合 5s 无推进 / 倒计时 5s 卡住）→ 强制检查一次
        if (!this._p2pHealthChecking && now - this._p2pWaitStartAt > 5000) {
            this._p2pHealthChecking = true;
            this._p2pHealthRetryCount = 0;
            this._fireP2PHealthCheck();
            return;
        }
        // 检查中且 2s 无回应 → 再次发动补救，并节流提醒用户
        if (this._p2pHealthChecking && now - this._p2pHealthCheckAt > 2000) {
            this._p2pHealthRetryCount++;
            this._fireP2PHealthCheck();
            if (now - this._p2pStallWarnedAt > 10000) {
                this._p2pStallWarnedAt = now;
                console.warn('[P2P] 对方无回应，连接较差，进入补救循环');
                this.showMessage('连接较差，请耐心等待', 'warning');
            }
        }
    }
;

// _fireP2PHealthCheck
    // 强制检查：首次只发轻量健康探测（对方回 ack 即视为在线，不打扰不刷消息）；
    // 仅当确认对方 2s 无回应（补救阶段）才发 request_sync 请求全量快照恢复同步。
    // 避免在 SELECT_TARGET 等无计时阶段的正常等待中持续 request_sync 造成消息风暴
    // （全量快照体积随回合增长，风暴会引发丢包→版本落后→更多请求的恶性循环）。
    UIController.prototype._fireP2PHealthCheck = function() {
        const p2p = this.p2pController;
        if (!p2p || !p2p.isConnected) return;
        this._p2pHealthCheckAt = Date.now();
        // 轻量健康探测：要求对方立即回执（确认连接/进程是否仍在）
        if (p2p.sendHealthCheck) p2p.sendHealthCheck();
        // 补救阶段：前 2 次无回执仍只发轻量探测（轻微网络波动不应触发全量快照风暴），
        // 连续 ≥3 次无回执才请求全量快照帮助恢复同步。
        if (this._p2pHealthRetryCount >= 2) {
            console.warn(`[P2P] 对方持续无回应，第 ${this._p2pHealthRetryCount} 次补救，请求全量重同步`);
            if (p2p.sendSyncRequest) p2p.sendSyncRequest();
        } else if (this._p2pHealthRetryCount > 0) {
            console.warn(`[P2P] 对方暂未回执，第 ${this._p2pHealthRetryCount} 次轻量探测`);
        }
    }
;

// _p2pPeerActivityReset
    // 收到对方推进（state_sync / action / health_check_ack）时重置健康监测计时
    UIController.prototype._p2pPeerActivityReset = function() {
        if (this._p2pHealthChecking || this._p2pWaitStartAt != null) {
            this._p2pHealthChecking = false;
            this._p2pWaitStartAt = Date.now();
        }
    }
;

// _p2pSetAwaitBanner
    // 任何同步机制（action ack / 阶段确认 / game_init / 全量快照请求 / health_check）
    // 在等待对方回执期间显示常驻提示"连接不稳定，正在等待对手客户端响应…"；收到回执后隐藏。
    UIController.prototype._p2pSetAwaitBanner = function(awaiting) {
        const banner = document.getElementById('p2p-await-banner');
        if (!banner) return;
        if (awaiting) {
            banner.style.display = 'flex';
            this._makeDraggable(banner);
        } else {
            banner.style.display = 'none';
        }
    }
;

// ===== 访客大退后重开页面恢复对局 =====
// 仅访客侧需要：房主始终在线等待，访客关闭页面后重新打开可通过存储的 roomCode 重连，
// 由房主端快照续局（房主在断开后 60s 宽限内等待重连；休闲模式房主不等待，故不支持恢复）。

