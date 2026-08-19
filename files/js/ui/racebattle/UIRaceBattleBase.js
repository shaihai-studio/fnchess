/**
 * UIRaceBattleBase —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 基础：顶层常量、字段懒初始化、房间弹窗开关、状态设置、参数步进与共享辅助
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

/**
 * UIRaceBattle - 竞速对战（2-4 人联机竞速）界面模块
 *
 * 以 UIController.prototype 挂载，负责联机竞速的整套 UI：
 *   - 房间弹窗：建房/加入、耐力难度排位参数、成员列表、就绪/踢人/开始
 *   - 对局进度面板：实时排名、10 关时间列、进度条、领先光晕、特性提示行
 *   - 全屏起跑倒计时 / 关卡特性卡、toast、退出确认
 *   - 结算弹窗：名次奖牌、积分增减、段位动画、再来一局
 *
 * 与 RaceRoomController 的连接（协议收发）在 ui-logic 阶段注入，
 * 本模块提供全部界面方法供其调用。
 */

// 难度等级元数据：名字 / 颜色类
const RACE_BATTLE_DIFFICULTIES = [
    { name: '入门', cls: 'rb-diff-1' },
    { name: '进阶', cls: 'rb-diff-2' },
    { name: '熟练', cls: 'rb-diff-3' },
    { name: '挑战', cls: 'rb-diff-4' },
    { name: '困难', cls: 'rb-diff-5' },
    { name: '极限', cls: 'rb-diff-6' },
    { name: '传说', cls: 'rb-diff-7' }
];

// 耐力档位 → 连跑关数；难度开放上限联动（2026-08-11 新增 1 关档位）
const RACE_BATTLE_STAMINA = [
    { levels: 1, maxDiff: 7 },
    { levels: 3, maxDiff: 7 },
    { levels: 5, maxDiff: 5 },
    { levels: 10, maxDiff: 3 }
];

// ─── 字段懒初始化 ────────────────────────────────────────────────

UIController.prototype._ensureRaceBattleFields = function() {
    if (this._rbReady) return;
    this._rbReady = true;
    this._rbBusy = false; // U5: 创建/加入异步互斥标志
    this._rbClockOffset = 0; // 访客端时钟校准偏移（房主=0，仅开局时按 goAt 估算一次）

    this.raceBattleModal = document.getElementById('race-battle-modal');
    this.raceBattleRankTag = document.getElementById('race-battle-rank-tag');
    this.raceBattleStatusDot = document.getElementById('race-battle-status-dot');
    this.raceBattleStatusText = document.getElementById('race-battle-status-text');
    this.raceBattleRoomCode = document.getElementById('race-battle-roomcode');
    this.raceBattleCopyBtn = document.getElementById('race-battle-copy-btn');
    this.raceBattleStaminaDots = document.getElementById('race-battle-stamina-dots');
    this.raceBattleDifficultyBadge = document.getElementById('race-battle-difficulty-badge');
    this.raceBattleRankedToggle = document.getElementById('race-battle-ranked-toggle');
    this.raceBattleRankedHint = document.getElementById('race-battle-ranked-hint');
    this.raceBattleMembers = document.getElementById('race-battle-members');
    this.raceBattleMembersCount = document.getElementById('race-battle-members-count');
    this.raceBattleStartBtn = document.getElementById('race-battle-start-btn');
    this._rbJoinBtnMode = this._rbJoinBtnMode || 'join';
    this.raceBattleJoinInput = document.getElementById('race-battle-join-input');
    this.raceBattleJoinBtn = document.getElementById('race-battle-join-btn');
    this.raceBattleJoinError = document.getElementById('race-battle-join-error');
    this.raceBattleTabs = {
        create: document.getElementById('race-battle-tab-create'),
        join: document.getElementById('race-battle-tab-join'),
        lobby: document.getElementById('race-battle-tab-lobby')
    };

    // 匹配大厅字段
    this.raceLobbyStatus = document.getElementById('race-lobby-status');
    this.raceLobbyStatusText = document.getElementById('race-lobby-status');
    this.raceLobbyList = document.getElementById('race-lobby-list');
    this.raceLobbyCreateBtn = document.getElementById('race-lobby-create-btn');
    this.raceLobbyDeleteBtn = document.getElementById('race-lobby-delete-btn');
    this.raceLobbyLongLivedToggle = document.getElementById('race-lobby-long-lived-toggle');
    this.raceLobbySpectateToggle = document.getElementById('race-lobby-spectate-toggle');
    this.raceLobbyEloRangeWrap = document.getElementById('race-lobby-elo-range-wrap');
    this.raceLobbyEloRangeToggle = document.getElementById('race-lobby-elo-range-toggle');
    this.raceLobbyEloRangeInput = document.getElementById('race-lobby-elo-range-input');
    this.raceLobbyTierToggle = document.getElementById('race-lobby-tier-toggle');

    this.raceBattlePanel = document.getElementById('race-battle-panel');
    this.raceBattlePanelCode = document.getElementById('race-battle-panel-code');
    this.raceBattlePanelTimer = document.getElementById('race-battle-panel-timer');
    this.raceBattleRows = document.getElementById('race-battle-rows');
    this.raceBattleWaitHint = document.getElementById('race-battle-wait-hint');
    this.raceBattleFeatureLine = document.getElementById('race-battle-feature-line');
    this.raceBattlePanelExitBtn = document.getElementById('race-battle-panel-exit');
    this.raceBattleFinishExitBtn = document.getElementById('race-battle-finish-exit-btn');
    this.raceBattleFinishWatchBtn = document.getElementById('race-battle-finish-watch-btn');
    this.raceBattlePanelCollapse = document.getElementById('race-battle-panel-collapse');
    this.raceBattleProgressThin = document.getElementById('race-battle-progress-thin');

    this.raceBattleOverlay = document.getElementById('race-battle-overlay');
    this.raceBattleOverlayCard = document.getElementById('race-battle-overlay-card');
    this.raceBattleToastEl = document.getElementById('race-battle-toast');

    this.raceBattleResultModal = document.getElementById('race-battle-result-modal');
    this.raceBattleResultTitle = document.getElementById('race-battle-result-title');
    this.raceBattleResultRanklist = document.getElementById('race-battle-result-ranklist');
    this.raceBattleResultSelf = document.getElementById('race-battle-result-self');
    this.raceBattleExitModal = document.getElementById('race-battle-exit-modal');
    this.raceBattleMigrationModal = document.getElementById('race-migration-modal');
    this.raceBattleMigrationStatus = document.getElementById('race-migration-status');
    this.raceBattleMigrationAbortBtn = document.getElementById('race-migration-abort-btn');

    // 参数状态（建房）
    this._rbStamina = 1;      // 1..4（1关/3关/5关/10关）
    this._rbDifficulty = 1;   // 1..7（受耐力上限联动）
    this._rbRanked = false;   // 竞速排位/休闲局（由打开弹窗前的模式选择决定）
    // 大厅状态（竞速房大厅）
    this._rbLobby = null;          // MatchLobbyController 实例
    this._rbLobbyConnected = false;
    this._rbLobbyRooms = [];
    this._rbLobbyOpen = false;     // 本端是否在大厅登记了房间
    this._rbCreateViaLobby = false; // 从大厅 tab 创建房间的标记（创建后停留在大厅 tab）
    this._rbPendingLobbyHost = null; // 大厅 WS 未连接时暂存登记请求
    this._rbKeepHostWaiting = false;  // 房主等待阶段退出时保留房间（仅大厅登记房；创建tab建房退出即删除）
    this._rbLobbyExpiresAt = 0;       // 大厅房间到期时间戳
    this._rbLobbyTtlTimer = null;     // 大厅 TTL 倒计时定时器
    // 房间状态
    this._rbTab = 'create';
    this._rbMembers = [];
    this._rbReadyMap = {};
    this._rbRoom = null;      // RaceRoomController 实例
    this._rbMyId = '';
    this._rbIsHost = false;
    this._rbRoomOpen = false;
    this._rbMatchStarted = false;
    this._rbCountdownTimer = null;
    this._rbFeatureTimer = null;
    this._rbToastTimer = null;
    this._rbElapsedTimer = null;
    this._rbElapsedStart = 0;
    // 竞速排位断线恢复（对齐 P2P 访客大退恢复）
    this._rbResuming = false;      // 是否正在执行恢复重连
    this._rbResumeCtx = null;      // 待恢复的对局上下文（localStorage function_chess_rb_resume）
    this._rbWarningShown = false;  // 竞速排位「勿消极比赛」提示（每会话一次）
    this._rbResultScoreTimer = null; // 结算"积分结算中"兜底定时器（5s 后改显"积分暂不可用"）
    this._rbProgress = {};
    this._rbRanks = {};              // playerId → 竞速段位名（查询未开始返回"未定段"）
    this._rbRanksPending = {};       // playerId → true（段位查询进行中，徽章显示"加载中…"）
    this._rbRanksTimeout = {};       // playerId → 超时定时器（查询丢包时从"加载中…"回退"未定段"，后续渲染会重查）
    this._rbGameParams = null;
    // 房主迁移（host migration，2026-08-11）
    this._rbMigrationActive = false;    // 是否处于迁移流程
    this._rbMigrationDone = false;      // 迁移是否已结束（防重复收尾）
    this._rbMigrationTimer = null;      // 选举延迟定时器
    this._rbMigrationAbortTimer = null; // 总超时兜底定时器（60s）
    this._rbMigrationSyncTimer = null;  // 新房主进度收集窗口定时器（8s）
    this._rbMigrationProgressTimer = null; // 新房主周期重发进度请求的 interval（晚连访客也能回传）
    this._rbMigrationNewHostName = '';  // 新房主昵称（toast 用）
    this._rbMigrationAbortBtnTimer = null; // U7: 弹窗显示 10s 后出现「放弃对局」按钮的定时器
    this._rbMigrationQueryTimer = null;  // 访客侧：迁移待确认时周期请求新房主重发 migration_done 的兜底定时器
};

// ─── 入口：打开/关闭房间弹窗 ────────────────────────────────────

UIController.prototype.openRaceBattleModal = function() {
    this._ensureRaceBattleFields();
    // 竞速联机：先选排位/休闲模式
    const sel = document.getElementById('p2p-mode-select-modal');
    if (sel) {
        // 复用 P2P 的模式选择弹窗，但竞速联机是「段位」而非 ELO，动态改写文案
        const _t = sel.querySelector('h2');
        const _d = sel.querySelector('.p2p-mode-select-desc');
        const _rSub = sel.querySelector('#p2p-mode-select-ranked .p2p-mode-select-sub');
        const _cSub = sel.querySelector('#p2p-mode-select-casual .p2p-mode-select-sub');
        if (_t) _t.textContent = '选择竞速模式';
        if (_d) _d.textContent = '排位模式计入竞速段位并参与排行榜；休闲模式不增减段位。';
        if (_rSub) _rSub.textContent = '计竞速段位 · 可上排行榜';
        if (_cSub) _cSub.textContent = '不增减段位 · 娱乐对局';
        // U3: 用 bindModalDismiss 统一注册 ESC + 遮罩关闭（原先手动设 _dismissBound 只有 ESC 生效，遮罩点击无 handler）
        this.bindModalDismiss(sel, function() { this.hideModal(sel); }.bind(this));
        const pick = (mode) => {
            this._rbRanked = (mode === 'ranked');
            this.hideModal(sel);
            this._proceedRaceBattleModal();
        };
        const btnR = document.getElementById('p2p-mode-select-ranked');
        const btnC = document.getElementById('p2p-mode-select-casual');
        if (btnR) btnR.onclick = function() { if (window.audioManager) window.audioManager.playClick(); pick('ranked'); };
        if (btnC) btnC.onclick = function() { if (window.audioManager) window.audioManager.playClick(); pick('casual'); };
        // 2026-08-11 修复：从竞速联机入口进入时未绑定返回按钮导致"返回主菜单"偶发无效
        const btnBack = document.getElementById('p2p-mode-select-back');
        if (btnBack) btnBack.onclick = function() { if (window.audioManager) window.audioManager.playClick(); this.hideModal(sel); }.bind(this);
        this.showModal(sel);
        return;
    }
    // fallback：弹窗不存在则跳过直接进
    this._rbRanked = false;
    this._proceedRaceBattleModal();
};

UIController.prototype._proceedRaceBattleModal = function() {
    this._ensureRaceBattleFields();
    this._rbTab = 'create';
    // 重新打开弹窗：若此前"保留等待房间"，则恢复原房间与大厅刷新
    const keepHost = this._rbKeepHostWaiting;
    if (!keepHost) {
        this._rbMatchStarted = false;
        this._rbMembers = [];
        this._rbReadyMap = {};
        if (this._rbRoom) { try { this._rbRoom.disconnect(); } catch (e) {} this._rbRoom = null; }
        this._raceBattleSwitchJoinButton('join');
    } else {
        this._rbKeepHostWaiting = false;
        if (this._rbLobby) this._rbLobby.resumeRefresh();
        if (this._rbRoom && this.raceBattleRoomCode) this.raceBattleRoomCode.textContent = this._rbRoom.roomCode;
        const codeDisp = document.getElementById('race-battle-room-code-display');
        if (codeDisp) codeDisp.style.display = '';
    }
    // 重置创建/删除按钮：未保留时旧房间已断开，创建按钮恢复可点、删除按钮隐藏
    const rbCreateBtn = document.getElementById('race-battle-create-btn');
    const rbDeleteBtn = document.getElementById('race-battle-delete-btn');
    if (keepHost && this._rbRoom && this._rbRoomOpen) {
        if (rbCreateBtn) rbCreateBtn.disabled = true;
        if (rbDeleteBtn) rbDeleteBtn.style.display = '';
    } else {
        if (rbCreateBtn) rbCreateBtn.disabled = false;
        if (rbDeleteBtn) rbDeleteBtn.style.display = 'none';
    }

    this.hideRaceUI();
    this.raceBattleSwitchTab('create');
    this.raceBattleRenderParams();
    this.raceBattleRenderMembers();
    if (!(keepHost && this._rbRoom && this._rbRoomOpen)) {
        this._raceBattleSetStatus('idle', '请创建房间或输入房间码加入');
    }

    this.showModal('race-battle-modal');

    // 竞速排位「勿消极比赛」提示（复用 p2p-warning-modal，换竞速文案；每会话一次，非对局中）
    if (this._rbRanked && !this._rbWarningShown && !this._rbMatchStarted) {
        this._rbWarningShown = true;
        const wm = document.getElementById('p2p-warning-modal');
        const wmVisible = wm && wm.style.display !== 'none';
        if (wm && !wmVisible) {
            const wTitle = wm.querySelector('h2');
            const wText = wm.querySelector('.p2p-warning-text');
            if (wTitle) wTitle.textContent = '联机竞速排位模式';
            if (wText) wText.textContent = '请勿消极比赛，对局中途退出（包括关闭标签页）将判负并扣除竞速积分。';
            this.showModal(wm);
            const wc = document.getElementById('p2p-warning-confirm-btn');
            if (wc) {
                const close = () => { if (window.audioManager) window.audioManager.playClick(); this.hideModal(wm); };
                wc.addEventListener('click', close, { once: true });
                this.bindModalDismiss(wm, close);
            }
        }
    }
};

UIController.prototype.closeRaceBattleModal = function() {
    if (!this._rbReady) return;
    if (this._rbRoom && this._rbRoomOpen && !this._rbMatchStarted) {
        this.raceBattleConfirmLeave();
        return;
    }
    this.hideModal('race-battle-modal');
    this._closeRaceLobby();
};

UIController.prototype.raceBattleSwitchTab = function(tab) {
    this._ensureRaceBattleFields();
    if (tab === 'lobby') this._rbTab = 'lobby';
    else if (tab === 'join') this._rbTab = 'join';
    else this._rbTab = 'create';
    const createContent = document.getElementById('race-battle-tab-create-content');
    const joinContent = document.getElementById('race-battle-tab-join-content');
    const lobbyContent = document.getElementById('race-battle-tab-lobby-content');
    if (createContent) createContent.style.display = (this._rbTab === 'create') ? '' : 'none';
    if (joinContent) joinContent.style.display = (this._rbTab === 'join') ? '' : 'none';
    if (lobbyContent) lobbyContent.style.display = (this._rbTab === 'lobby') ? '' : 'none';
    for (const key of ['create', 'join', 'lobby']) {
        const b = this.raceBattleTabs[key];
        if (b) b.classList.toggle('active', this._rbTab === key);
    }
    if (this._rbTab === 'create') {
        if (!this._rbRoomOpen) {
            this.raceBattleRoomCode.textContent = '------';
            this._raceBattleSetStatus('idle', '请创建房间或输入房间码加入');
        } else {
            this._raceBattleSetStatus('connected', '房间已创建，等待其他玩家加入');
        }
    } else if (this._rbTab === 'join') {
        this._raceBattleSetStatus('idle', '输入 6 位房间码加入好友房间');
        if (this.raceBattleJoinInput) { this.raceBattleJoinInput.value = ''; this.raceBattleJoinInput.focus(); }
    } else {
        this._raceBattleSetStatus('idle', '匹配大厅：创建房间或从列表加入');
        this._openRaceLobby();
    }
    // 未创建/未加入房间前隐藏底部按钮（房主=开始竞速，访客=就绪/取消就绪），入房后才显示
    const startBtn = this.raceBattleStartBtn;
    if (startBtn) startBtn.style.display = this._rbRoomOpen ? '' : 'none';
    // 加入房间 tab 隐藏左侧参数栏（耐力/难度不适用于加入他人房间，对齐联机对战）
    const selectorsLeft = document.getElementById('race-battle-selectors-left');
    if (selectorsLeft) selectorsLeft.style.display = (this._rbTab === 'join') ? 'none' : 'flex';
};

UIController.prototype._raceBattleSetStatus = function(kind, msg) {
    if (!this._rbReady) return;
    this.raceBattleStatusText.textContent = msg;
    this.raceBattleStatusDot.classList.remove('idle', 'connected', 'waiting', 'error', 'creating', 'joining', 'disconnected');
    if (kind === 'connected') this.raceBattleStatusDot.classList.add('connected');
    else if (kind === 'error') this.raceBattleStatusDot.classList.add('error');
    else if (kind === 'connecting') this.raceBattleStatusDot.classList.add('waiting');
    else this.raceBattleStatusDot.classList.add('idle');
    // 错误态边框随状态切换更新（kind==='error' 时高亮，其余清除）
    const st = document.getElementById('race-battle-statusbar');
    if (st) st.classList.toggle('error-state', kind === 'error');
};

// ─── 参数：耐力 / 难度 / 排位 / 强度预览 ────────────────────────

