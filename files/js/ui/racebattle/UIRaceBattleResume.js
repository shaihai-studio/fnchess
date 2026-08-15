/**
 * UIRaceBattleResume —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 断点续战：窗口归属、续战上下文存取与恢复
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

UIController.prototype._ensureRbWindowOwner = function() {
    if (this._rbWindowOwner) return;
    try { this._rbWindowOwner = sessionStorage.getItem('function_chess_rb_owner') || ''; } catch (e) {}
    if (!this._rbWindowOwner) {
        this._rbWindowOwner = 'rbw_' + Math.random().toString(36).substr(2, 9);
        try { sessionStorage.setItem('function_chess_rb_owner', this._rbWindowOwner); } catch (e) {}
    }
    // 注册 BroadcastChannel 存活监听：收到同 owner 的 ping 回 pong，供其他标签页判断本窗口是否存活
    this._rbRegisterOwnerAliveListener();
};

/**
 * BroadcastChannel 存活监听：仅响应与自己 owner 相同的 ping。
 * 旧窗口存活 → 新标签页探测恢复键 owner 会收到 pong → 判定"他人对局"拦截，不弹恢复；
 * 旧窗口已关闭/崩溃（channel 随窗口销毁）→ 新窗口收不到 pong → 判定可接管恢复键。
 */
UIController.prototype._rbRegisterOwnerAliveListener = function() {
    if (this._rbOwnerChannel || typeof BroadcastChannel === 'undefined') return;
    try {
        this._rbOwnerChannel = new BroadcastChannel('function_chess_rb_owner_alive');
        this._rbOwnerChannel.onmessage = (ev) => {
            const d = ev.data;
            if (!d || d.type !== 'ping' || d.owner !== this._rbWindowOwner) return;
            try { this._rbOwnerChannel.postMessage({ type: 'pong', owner: this._rbWindowOwner }); } catch (e) {}
        };
    } catch (e) { this._rbOwnerChannel = null; }
};

UIController.prototype._rbSaveResumeContext = function() {
    try {
        if (!this._rbRanked || !this._rbMatchStarted) return;
        if (!this._rbRoom || !this._rbRoom.roomCode) return;
        // 窗口归属标记：防止同源多标签页互相覆盖同一 localStorage 恢复键后串号
        this._ensureRbWindowOwner();
        const p = this._rbGameParams || {};
        const ctx = {
            roomCode: this._rbRoom.roomCode,
            myId: this._rbMyId,
            owner: this._rbWindowOwner,
            isHost: !!this._rbIsHost,
            mode: 'ranked',
            goAt: this._rbGoAt || p.goAt || 0,
            levels: this._rbTotalLevels || p.levels || 3,
            startLevel: this._rbStartLevel || p.startLevel || 1,
            seeds: (this._rbSeeds && this._rbSeeds.length) ? this._rbSeeds : (p.seeds || []),
            stamina: this._rbStamina || p.stamina || 1,
            difficulty: this._rbDifficulty || p.difficulty || 1,
            myTimes: (this._rbMyTimes || []).slice(),
            levelIndex: this._rbLevelIndex || 0,
            puzzleSolved: this._rbPuzzleSolved || 0,
            myElapsed: this._rbMyElapsed || 0,
            finished: !!this._rbFinished,
            finishTime: this._rbFinishTime || 0,
            elapsedStart: this._rbElapsedStart || Date.now(),
            timestamp: Date.now()
        };
        localStorage.setItem('function_chess_rb_resume', JSON.stringify(ctx));
    } catch (e) {}
};

UIController.prototype._rbLoadResumeContext = function() {
    this._rbForeignResume = false;
    this._rbForeignCtx = null;
    try {
        const raw = localStorage.getItem('function_chess_rb_resume');
        if (!raw) return null;
        const ctx = JSON.parse(raw);
        if (!ctx || !ctx.roomCode || !ctx.myId) return null;
        // 恢复上下文可能属于其他同源标签页：暂存并探测其 owner 是否仍存活（活着=他人对局拦截，已死=接管恢复）
        this._ensureRbWindowOwner();
        if (ctx.owner && this._rbWindowOwner && ctx.owner !== this._rbWindowOwner) {
            this._rbForeignCtx = ctx;
            this._rbForeignResume = true;
            return null;
        }
        return ctx;
    } catch (e) { return null; }
};

/**
 * 探测恢复键 owner 是否仍存活（BroadcastChannel ping/pong）。
 * 存活 → 保持 _rbForeignResume=true（他人对局，拦截）；
 * 已死（关标签/浏览器重开/崩溃）→ 接管恢复键（owner 更新为本窗口）并放行恢复。
 */
UIController.prototype._rbProbeResumeOwner = function(cb) {
    const ctx = this._rbForeignCtx;
    const doCb = () => { if (typeof cb === 'function') cb(); };
    // 无 owner 的旧键或已接管：直接放行
    if (!ctx || !ctx.owner) { this._rbForeignResume = false; doCb(); return; }
    // 浏览器不支持 BroadcastChannel：保守视为他人对局（维持拦截，不接管）
    if (typeof BroadcastChannel === 'undefined') { doCb(); return; }
    let channel = null;
    try { channel = new BroadcastChannel('function_chess_rb_owner_alive'); } catch (e) {}
    if (!channel) { doCb(); return; }
    let done = false;
    const finish = (alive) => {
        if (done) return;
        done = true;
        try { channel.close(); } catch (e) {}
        if (!alive) {
            // 旧窗口已死：接管恢复键（owner 改为本窗口），放行恢复
            this._rbForeignResume = false;
            try {
                ctx.owner = this._rbWindowOwner;
                localStorage.setItem('function_chess_rb_resume', JSON.stringify(ctx));
            } catch (e) {}
        }
        doCb();
    };
    channel.onmessage = (ev) => {
        const d = ev.data;
        if (d && d.type === 'pong' && d.owner === ctx.owner) finish(true);
    };
    try { channel.postMessage({ type: 'ping', owner: ctx.owner }); } catch (e) {}
    setTimeout(() => finish(false), 200);
};

UIController.prototype._rbClearResumeContext = function() {
    try { localStorage.removeItem('function_chess_rb_resume'); } catch (e) {}
    this._rbResumeCtx = null;
    this._rbResuming = false;
};

/** 启动检测：有未结束的竞速排位对局 → 弹恢复询问 */
UIController.prototype._checkRaceBattleResume = function() {
    const ctx = this._rbLoadResumeContext();
    // 恢复上下文可能属于其他标签页：先探测 owner 是否仍存活——存活则本窗口拦截；
    // 已死（关标签/重开浏览器/崩溃，sessionStorage 清空导致 owner 失配）则接管后重新执行恢复检测
    if (this._rbForeignResume) {
        this._rbProbeResumeOwner(() => {
            if (this._rbForeignResume) return; // 旧窗口仍存活 → 本窗口保持拦截，不弹恢复
            this._checkRaceBattleResume();     // 已接管 → 重新走恢复流程
        });
        return;
    }
    if (!ctx || !ctx.roomCode || ctx.mode !== 'ranked') {
        this._rbClearResumeContext();
        return;
    }
    // 若 P2P 恢复弹窗已先显示（对应对战排位对局），避免叠弹
    const p2pResume = document.getElementById('p2p-resume-modal');
    if (p2pResume && p2pResume.style.display !== 'none') return;
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('splash-exit');
        splash.style.display = 'none';
        // 关键修复：恢复对局后必须解绑 splash 的 document 级 keydown 监听器，
        // 否则答题按 Enter/Space 提交时事件冒泡命中残留监听 → _enterFromSplash → 900ms 后跳回主菜单
        this._unbindSplashEnter(splash);
    }
    const modal = document.getElementById('race-resume-modal');
    if (modal) this.showModal(modal);
    this._bindRaceBattleResumeButtons(); // #13：用 addEventListener 替代内联 onclick 对全局 uiController 的依赖
};

// #13：将竞速恢复弹窗按钮绑定改为 JS 事件监听（仅绑定一次），消除内联 onclick 对全局 uiController 的强依赖
UIController.prototype._bindRaceBattleResumeButtons = function() {
    if (this._rbResumeBtnsBound) return;
    this._rbResumeBtnsBound = true;
    const confirm = document.getElementById('race-resume-btn');
    const cancel = document.getElementById('race-resume-cancel-btn');
    if (confirm) confirm.addEventListener('click', () => this.confirmRaceBattleResume());
    if (cancel) cancel.addEventListener('click', () => this.cancelRaceBattleResume());
};

/** 确认恢复：以原 playerId 重新加入房间（访客续局；原房主以普通成员身份续局） */
UIController.prototype.confirmRaceBattleResume = function() {
    const ctx = this._rbLoadResumeContext();
    // 弹窗期间恢复键可能被其他窗口覆盖：探测 owner 存活——存活则放弃，已死则接管后继续恢复
    if (this._rbForeignResume) {
        this._rbProbeResumeOwner(() => {
            if (this._rbForeignResume) return;
            this.confirmRaceBattleResume();
        });
        return;
    }
    if (!ctx || !ctx.roomCode) { this._rbClearResumeContext(); return; }
    this.hideStartModal();
    this._rbResumeCtx = ctx;
    this._rbResuming = true;
    this._rbRanked = true;
    this._rbMyId = ctx.myId || ('raceguest_' + Math.random().toString(36).substr(2, 9));
    this._rbIsHost = false; // 恢复一律以普通成员身份加入（房主已被迁移/仍在位）
    if (this.raceBattleRoomCode) this.raceBattleRoomCode.textContent = ctx.roomCode;
    this._raceBattleSetStatus('connecting', '正在恢复对局…');
    const modal = document.getElementById('race-resume-modal');
    if (modal) this.hideModal(modal);
    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';
    room.joinRoom({ roomCode: ctx.roomCode, playerId: this._rbMyId, nickname, profileId: this._rbProfileId(), mode: 'ranked' }).then((ok) => {
        if (!ok) {
            // 对齐 P2P 恢复失败处理：房间已关闭/无法连接 → 清上下文、复位互斥并回主菜单提示
            this._rbBusy = false;
            this._rbResumeCtx = null;
            this._rbResuming = false;
            this._rbClearResumeContext();
            this.raceBattleToast('恢复失败，本局已结束');
            this.showSplash();
        }
    });
};

/** 放弃恢复：清除上下文返回主菜单 */
UIController.prototype.cancelRaceBattleResume = function() {
    this._rbClearResumeContext();
    const modal = document.getElementById('race-resume-modal');
    if (modal) this.hideModal(modal);
    // 守卫可能从主菜单触发（startModal 仍显示）：取消后留在主菜单；
    // 启动时序触发（splash 场景）：回封面按 Enter 进主菜单
    if (this.startModal && this.startModal.style.display !== 'none') return;
    this.showSplash();
};

/** 恢复对局 UI：从上下文重建竞速状态并重新加载当前关（同种子，从当前关继续） */
UIController.prototype._rbRestoreMatchFromCtx = function(ctx) {
    if (!ctx) return;
    this._rbMatchStarted = true;
    this.raceIsMultiplayer = true;
    this._rbRanked = true;
    this._rbStamina = ctx.stamina || 1;
    this._rbDifficulty = ctx.difficulty || 1;
    this._rbSeeds = ctx.seeds || [];
    this._rbTotalLevels = ctx.levels || 3;
    this._rbStartLevel = ctx.startLevel || 1;
    this._rbGoAt = ctx.goAt || Date.now();
    this._rbLevelIndex = ctx.levelIndex || 0;
    this._rbPuzzleSolved = ctx.puzzleSolved || 0;
    this._rbMyTimes = (ctx.myTimes || []).slice();
    this._rbMyElapsed = ctx.myElapsed || 0;
    this._rbFinished = !!ctx.finished;
    this._rbFinishTime = ctx.finishTime || 0;
    this._rbGameParams = {
        type: 'race_battle_params',
        stamina: this._rbStamina,
        difficulty: this._rbDifficulty,
        ranked: true,
        levels: this._rbTotalLevels,
        startLevel: this._rbStartLevel,
        seeds: this._rbSeeds,
        goAt: this._rbGoAt
    };
    try {
        // 恢复进度面板与计时（基于原 elapsedStart，保证已用时间连续）
        this.raceBattleShowPanel(this.raceBattleRoomCode.textContent || ctx.roomCode);
        this.raceBattleShowFinishChoice(false);
        this._startRaceBattleElapsedTimer(ctx.elapsedStart || Date.now());
        if (this._rbFinished) {
            this._rbUpdateSelfProgress();
            this.raceBattleShowFinishChoice(true);
        } else {
            this._rbLoadLevel(this._rbLevelIndex);
        }
        // 把自己的最新进度广播给房主，房主据此更新快照（走 race_battle_progress）
        this._rbBroadcastProgress();
        // 旧房主重连恢复后：本地进度只有自己，主动请求新房主回发全员完整快照
        //（新房主收到 race_full_progress_request 后回发 race_full_progress 完整快照，本端仅更新进度、不触发迁移收尾）
        if (!this._rbIsHost) {
            try { this._rbRoom.send({ type: 'race_full_progress_request' }, false); } catch (e) {}
        }
        this.raceBattleToast('已恢复对局，继续比赛');
    } catch (e) {
        console.error('[RB] 恢复对局 UI 错误:', e);
    } finally {
        // 关键修复：无论恢复过程是否抛异常，都必须清掉恢复标记，
        // 否则 _rbResuming 残留会导致后续任意连接 error 误判为"恢复失败"而把玩家弹回主页面
        this._rbResumeCtx = null;
        this._rbResuming = false;
    }
};

/**
 * 统一入口守卫：进入任意对局（本地/AI/闯关/竞速/联机）之前，
 * 检查是否存在未完成的联机排位对局（P2P 对战 / 竞速联机）。
 * 有 → 弹对应恢复询问并返回 true（拦截本次进入）；
 * 无 → 返回 false（放行）。
 * 正在恢复中或恢复弹窗已显示时不重复拦截。
 */
UIController.prototype._guardPendingOnlineMatch = function() {
    // 正在恢复中：放行，避免拦截恢复流程自身
    if (this._p2pResuming || this._rbResuming) return false;
    // 恢复弹窗已显示：不重复拦截
    const p2pModal = document.getElementById('p2p-resume-modal');
    if (p2pModal && p2pModal.style.display !== 'none') return false;
    const rbModal = document.getElementById('race-resume-modal');
    if (rbModal && rbModal.style.display !== 'none') return false;

    // 1) P2P 排位对局：同步判定，有有效恢复键则弹询问
    const p2pCtx = this._loadP2PResumeContext();
    if (p2pCtx && p2pCtx.roomCode) {
        if (p2pCtx.mode === 'ranked') {
            this._checkP2PResume();
            return true;
        }
        this._clearP2PResumeContext(); // 非排位残留键：清除后放行
    }
    // 2) 竞速排位对局：含跨窗口 owner 探测链（_checkRaceBattleResume 内部异步处理）
    const rbCtx = this._rbLoadResumeContext();
    if (this._rbForeignResume) {
        this._checkRaceBattleResume(); // 探测存活→维持拦截不弹；已死→接管后弹窗
        return true;
    }
    if (rbCtx && rbCtx.roomCode) {
        if (rbCtx.mode === 'ranked') {
            this._checkRaceBattleResume();
            return true;
        }
        this._rbClearResumeContext(); // 非排位残留键：清除后放行
    }
    return false;
};

// ─── 对局开始（界面侧入口，ui-logic 负责播种与同步计时）────────

