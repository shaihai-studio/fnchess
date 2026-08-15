/**
 * UIP2PResume —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 断点续战：上下文存取、检查、按钮绑定、确认/取消
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._saveP2PResumeContext = function(extra) {
        try {
            const existing = this._loadP2PResumeContext() || {};
            const ctx = Object.assign(existing, extra || {}, { timestamp: Date.now() });
            if (!ctx.roomCode) return;
            localStorage.setItem('function_chess_p2p_resume', JSON.stringify(ctx));
        } catch (e) { /* localStorage 不可用（隐私模式等）时静默忽略 */ }
    };

    UIController.prototype._loadP2PResumeContext = function() {
        try {
            const raw = localStorage.getItem('function_chess_p2p_resume');
            if (!raw) return null;
            const ctx = JSON.parse(raw);
            if (!ctx || !ctx.roomCode) return null;
            return ctx;
        } catch (e) { return null; }
    };

    UIController.prototype._clearP2PResumeContext = function() {
        try { localStorage.removeItem('function_chess_p2p_resume'); } catch (e) {}
        this._p2pResumeCtx = null;
    };

    // 启动检测：若有未结束的排位对局，弹出恢复询问
    UIController.prototype._checkP2PResume = function() {
        const ctx = this._loadP2PResumeContext();
        // 仅排位对局支持断线恢复（休闲模式房主不等待重连，无法续局）
        if (!ctx || !ctx.roomCode || ctx.mode !== 'ranked') {
            this._clearP2PResumeContext();
            return;
        }
        // 隐藏封面，直接弹出恢复询问
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('splash-exit');
            splash.style.display = 'none';
            // 关键修复：解绑 splash 的 document 级 keydown 监听器，避免恢复后答题按 Enter 误触 _enterFromSplash 跳回主菜单
            this._unbindSplashEnter(splash);
        }
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.showModal(modal);
        this._bindP2PResumeButtons(); // #13：用 addEventListener 替代内联 onclick 对全局 uiController 的依赖
    };

    // #13：将恢复弹窗按钮绑定改为 JS 事件监听（仅绑定一次），消除内联 onclick 对全局 uiController 的强依赖
    UIController.prototype._bindP2PResumeButtons = function() {
        if (this._p2pResumeBtnsBound) return;
        this._p2pResumeBtnsBound = true;
        const confirm = document.getElementById('p2p-resume-btn');
        const cancel = document.getElementById('p2p-resume-cancel-btn');
        if (confirm) confirm.addEventListener('click', () => this.confirmP2PResume());
        if (cancel) cancel.addEventListener('click', () => this.cancelP2PResume());
    };

    // 用户确认恢复：以存储的 roomCode 重新加入房主房间，并走快照续局链路
    UIController.prototype.confirmP2PResume = function() {
        const ctx = this._loadP2PResumeContext();
        if (!ctx || !ctx.roomCode) { this._clearP2PResumeContext(); return; }
        this.hideStartModal();
        this._p2pRole = 'guest';
        this._p2pRoomCode = ctx.roomCode;
        this._p2pResumeCtx = ctx;
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.hideModal(modal);
        this.showMessage('正在重连恢复对局…');
        // 直接建立 P2PController 并绑定回调（不弹房间选择弹窗），
        // 再以存储的 roomCode 加入房主房间（房主端处于 60s 重连等待，走快照续局，不会重开）。
        if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
        if (!this.p2pController) this.p2pController = new P2PController();
        this._p2pMatchMode = ctx.mode || 'ranked';
        if (typeof this._setupP2PCallbacks === 'function') this._setupP2PCallbacks();
        // 必须在连接打开前把房主当前 gen 设回：访客大退后是全新会话，_gen 重置为 0，
        // 否则后续 action/timer_sync 会被房主按 gen 拒绝，且 request_sync 也会被房主过滤。
        // 房主主动推送的 state_sync 虽不过滤 gen，但续局后的交互必须 gen 匹配。
        if (this.p2pController && ctx.gen != null) this.p2pController._gen = ctx.gen;
        if (this.p2pController && typeof this.p2pController.joinRoom === 'function') {
            this.p2pController.joinRoom(ctx.roomCode, (ctx.mode === 'casual') ? 'casual' : 'ranked');
        }
        // 标记恢复中：在 onConnected 中据此走快照续局而非等待 game_init
        this._p2pResuming = true;
    };

    // 用户放弃恢复：清除上下文并返回主菜单
    UIController.prototype.cancelP2PResume = function() {
        this._clearP2PResumeContext();
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.hideModal(modal);
        // 守卫可能从主菜单触发（startModal 仍显示）：取消后留在主菜单；
        // 启动时序触发（splash 场景）：回封面按 Enter 进主菜单
        if (this.startModal && this.startModal.style.display !== 'none') return;
        this.showSplash();
    };


