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
    this._rbRanks = null;
    this._rbGameParams = null;
    // 房主迁移（host migration，2026-08-11）
    this._rbMigrationActive = false;    // 是否处于迁移流程
    this._rbMigrationDone = false;      // 迁移是否已结束（防重复收尾）
    this._rbMigrationTimer = null;      // 选举延迟定时器
    this._rbMigrationAbortTimer = null; // 总超时兜底定时器（60s）
    this._rbMigrationSyncTimer = null;  // 新房主进度收集窗口定时器（8s）
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
    if (this._raceSubmenu) this._raceSubmenu.style.display = '';
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

UIController.prototype.raceBattleStepStamina = function(delta) {
    this._ensureRaceBattleFields();
    const max = RACE_BATTLE_STAMINA.length;
    this._rbStamina = Math.max(1, Math.min(max, this._rbStamina + delta));
    const allowed = RACE_BATTLE_STAMINA[this._rbStamina - 1].maxDiff;
    if (this._rbDifficulty > allowed) this._rbDifficulty = allowed;
    this.raceBattleRenderParams();
};

UIController.prototype.raceBattleStepDifficulty = function(delta) {
    this._ensureRaceBattleFields();
    const allowed = RACE_BATTLE_STAMINA[this._rbStamina - 1].maxDiff;
    this._rbDifficulty = Math.max(1, Math.min(allowed, this._rbDifficulty + delta));
    this.raceBattleRenderParams();
};

UIController.prototype.raceBattleRenderParams = function() {
    this._ensureRaceBattleFields();
    const n = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    this.raceBattleStaminaDots.textContent = n + ' 关';
    const df = RACE_BATTLE_DIFFICULTIES[this._rbDifficulty - 1];
    this.raceBattleDifficultyBadge.textContent = df.name;
    this.raceBattleDifficultyBadge.className = 'stepper-value';
    // 竞速排位/休闲局：段位标签按选中模式动态显示
    if (this.raceBattleRankTag) {
        if (this._rbRanked) {
            this.raceBattleRankTag.classList.add('is-ranked');
            this.raceBattleRankTag.textContent = '排位局 · 计竞速积分';
        } else {
            this.raceBattleRankTag.classList.remove('is-ranked');
            this.raceBattleRankTag.textContent = '休闲局 · 不增减积分';
        }
    }
    // 访客只读：房间已开且非房主时禁用参数操作
    const params = document.querySelector('.p2p-selectors-left');
    if (params) params.classList.toggle('is-readonly', !this._rbIsHost && this._rbRoomOpen);
};

UIController.prototype.raceBattleCopyCode = function() {
    this._ensureRaceBattleFields();
    const code = this.raceBattleRoomCode.textContent || '';
    if (code.length !== 6) return;
    const done = () => {
        this.raceBattleCopyBtn.textContent = '已复制';
        this.raceBattleCopyBtn.classList.add('copied');
        setTimeout(() => {
            this.raceBattleCopyBtn.textContent = '复制';
            this.raceBattleCopyBtn.classList.remove('copied');
        }, 1200);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => {});
    else done();
};
// ─── 建房 / 加入 ────────────────────────────────────────────────

UIController.prototype.raceBattleCreateRoom = function(optCode) {
    this._ensureRaceBattleFields();
    // 已在房间中：明确提示，避免用户重复创建导致状态错乱（2026-08-13）
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) {
        this.raceBattleToast('你已在该房间中（房间码 ' + this._rbRoom.roomCode + '），无需重复创建');
        return;
    }
    // U5: UI 层互斥——创建/加入任一进行中直接返回，避免连点重复建房
    if (this._rbBusy) return;
    this._rbBusy = true;
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = '';
    // 创建tab建房：固定随机 6 位普通房间码（长效模式仅大厅 tab 提供）
    let code = optCode;
    if (!code) {
        code = String(Math.floor(100000 + Math.random() * 900000));
    }
    const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';
    this.raceBattleRoomCode.textContent = code;
    this._raceBattleSetStatus('connecting', '正在创建房间…');
    this._rbIsHost = true;
    this._rbMyId = 'racehost_' + code;

    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    return room.createRoom({ roomCode: code, maxPlayers: 4, playerId: this._rbMyId, nickname, mode: this._rbRanked ? 'ranked' : 'casual' }).then((ok) => {
        if (!ok) {
            // U5: 创建被拒/失败立即复位；成功时 _rbBusy 保持 true 直到 onStatusChange(connected/error)，
            // 覆盖「Peer 信令连接中」的挂起窗口，防止切 tab 加入互相覆盖状态
            this._rbBusy = false;
            if (createBtn) createBtn.disabled = false;
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
            this._raceBattleSetStatus('error', '房间创建失败，请检查网络后重试');
        }
        return ok;
    });
};

/** 竞速访客加入房间。skipLookup=true 表示来源为大厅列表 onJoinAccepted（房间已由服务器确认是竞速房），跳过类型查询 */
UIController.prototype.raceBattleJoinRoom = function(skipLookup) {
    this._ensureRaceBattleFields();
    // 已在房间中：明确提示，避免访客重复加入覆盖当前连接状态（2026-08-13）
    if (this._rbRoom && this._rbRoomOpen) {
        this.raceBattleToast('你已在该房间中（房间码 ' + (this._rbRoom.roomCode || this.raceBattleRoomCode.textContent || '') + '），无需重复加入');
        return;
    }
    // U5: UI 层互斥——创建/加入任一进行中直接返回，避免创建挂起时切 tab 加入互相覆盖状态
    if (this._rbBusy) return;
    const code = (this.raceBattleJoinInput.value || '').trim().replace(/[^0-9]/g, '');
    if (code.length !== 6) {
        this.raceBattleJoinError.textContent = '请输入 6 位数字房间码';
        return;
    }
    const doJoin = () => {
        this._rbBusy = true; // U5: 置位互斥标志（doJoin 内部是真正的异步连接）
        this.raceBattleJoinError.textContent = '';
        this.raceBattleRoomCode.textContent = code;
        this._raceBattleSetStatus('connecting', '正在连接房间…');
        this._rbIsHost = false;
        this._rbMyId = 'raceguest_' + Math.random().toString(36).substr(2, 9);
        const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';

        if (!this._rbRoom) this._rbRoom = new RaceRoomController();
        const room = this._rbRoom;
        this._bindRaceBattleRoomCallbacks(room);
        room.joinRoom({ roomCode: code, playerId: this._rbMyId, nickname, mode: this._rbRanked ? 'ranked' : 'casual' }).then((ok) => {
            if (!ok) {
                // U5: 加入被拒/失败立即复位；成功时保持 true 直到 onStatusChange(connected/error)
                this._rbBusy = false;
                this._raceBattleSetStatus('error', '加入失败，请确认房间码后重试');
            }
        });
    };
    if (skipLookup) { doJoin(); return; }
    // 先向服务器查询房间码类型：若为 1v1 联机对战房间（isRace=false 且 isP2P=true），提示模式不对，不发连接
    const doLookup = () => {
        if (!this._rbLobby || typeof this._rbLobby.lookupRoom !== 'function') { doJoin(); return; }
        let settled = false;
        const fallback = () => { if (!settled) { settled = true; doJoin(); } };
        this._rbLobby.onRoomLookupResult = (data) => {
            if (settled) return;
            if (String(data.code) !== code) return;
            settled = true;
            if (data.found && !data.isRace) {
                this.raceBattleJoinError.textContent = '该房间为联机对战房间，请到联机对战中进入';
                this._raceBattleSetStatus('error', '该房间为联机对战房间，请到联机对战中进入');
                return;
            }
            doJoin();
        };
        this._rbLobby.lookupRoom(code);
        setTimeout(fallback, 2500); // 查询超时兜底：正常走 PeerJS 连接（原有报错提示）
    };
    if (this._rbLobby && this._rbLobby.isConnected) {
        doLookup();
    } else if (this._rbLobby) {
        // 大厅 WS 尚未连好：确保连接，等连接成功后补发查询
        const lobby = this._rbLobby;
        const prev = lobby.onConnectionChange;
        let timer = null;
        const wait = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            doLookup();
        };
        lobby.onConnectionChange = (connected) => {
            if (connected) wait();
            if (prev) prev(connected);
        };
        if (!lobby.isConnected) lobby.connect();
        if (!timer) timer = setTimeout(() => { doJoin(); }, 3000); // 3s 连不上兜底
    } else {
        doJoin();
    }
};

// ─── 房间回调绑定 ────────────────────────────────────────────────

UIController.prototype._bindRaceBattleRoomCallbacks = function(room) {
    room.onStatusChange = (status, msg) => {
        // U5: 建房/加入的异步挂起窗口在此关闭（createRoom/joinRoom 返回 resolve 后 peer.open 才真正连接完成）
        if (status === 'connected' || status === 'error') this._rbBusy = false;
        if (status === 'connected') {
            this._rbRoomOpen = true;
            this._raceBattleSetStatus('connected', msg || '已连接');
            // 竞速排位断线恢复：joinRoom 成功后用已持久化的上下文恢复对局 UI
            if (this._rbResuming && this._rbResumeCtx) {
                const ctx = this._rbResumeCtx;
                this._rbRestoreMatchFromCtx(ctx);
            }
            if (this._rbIsHost) {
                if (this._rbCreateViaLobby) {
                    // 从大厅创建：留在大厅 tab（可立即看到"删除"按钮）
                    this._rbCreateViaLobby = false;
                } else {
                    this.raceBattleSwitchTab('create');
                }
                // 始终显示六位房间码
                const disp = document.getElementById('race-battle-room-code-display');
                if (disp) disp.style.display = '';
                this.raceBattleMembersCount.textContent = '1/4';
            } else {
                // 2026-08-11：访客连接成功后将加入按钮变为离开按钮
                this._raceBattleSwitchJoinButton('leave');
                // 访客加入成功：底部「开始竞速」按钮复用为「就绪」按钮，需显示
                if (this.raceBattleStartBtn) this.raceBattleStartBtn.style.display = '';
            }
        } else if (status === 'error') {
            this._raceBattleSetStatus('error', msg || '连接错误');
            // 恢复流程中连接失败（如房主已超时移除/房间关闭）：清恢复上下文并回主菜单。
            // 关键修复：仅"尚未真正进入对局"时才回主页；已在对局中（含恢复后继续比赛）的连接抖动
            // 只提示，走正常断线/迁移流程，绝不把正在对局的玩家弹回主页面。
            if (this._rbResuming && !this._rbMatchStarted) {
                this._rbClearResumeContext();
                this.raceBattleToast('恢复失败，本局已结束');
                this.showSplash();
            }
        } else {
            this._raceBattleSetStatus('connecting', msg || '连接中…');
        }
    };
    room.onMembersUpdate = (members) => {
        this._rbMembers = members.slice();
        // 同步 _rbReadyMap：继承已有就绪状态，新增成员默认 false
        const prev = this._rbReadyMap || {};
        this._rbReadyMap = {};
        members.forEach((m) => {
            this._rbReadyMap[m.playerId] = m.isHost ? true : !!prev[m.playerId];
        });
        this.raceBattleRenderMembers();
    };
    room.onMemberJoined = (member) => {
        this._rbMembers.push(member);
        this._rbReadyMap[member.playerId] = false;
        this.raceBattleRenderMembers();
        // 2026-08-12 修复重复音效：移除 click（playUIButtonSound），只保留加入成功音
        if (window.audioManager) { try { window.audioManager.playSuccess(); } catch (e) {} }
        this.raceBattleToast(member.nickname + ' 加入了房间');
    };
    room.onMemberState = (member) => {
        this._rbHandleMemberState(member);
        this.raceBattleRenderMembers();
    };
    room.onReconnected = () => {
        this._rbHandleReconnected();
    };
    room.onMemberLeft = (member) => {
        if (this._rbMatchStarted) this._rbHandleMemberLeftInMatch(member);
        this._rbMembers = this._rbMembers.filter((m) => m.playerId !== member.playerId);
        delete this._rbReadyMap[member.playerId];
        if (this._rbMatchStarted) {
            // 对局中：掉线成员标记弃权并保留进度记录，结算时排名垫底而非被遗忘
            const p = this._rbProgress[member.playerId] || (this._rbProgress[member.playerId] = {});
            p.abandoned = true;
            p.disconnected = true;
            if (!p.nickname) p.nickname = member.nickname;
        } else {
            delete this._rbProgress[member.playerId];
        }
        this.raceBattleRenderMembers();
        if (!this._rbMatchStarted) {
            this.raceBattleToast(member.nickname + ' 离开了房间');
            if (window.audioManager) { try { window.audioManager.playTick(); } catch (e) {} }
        } else if (window.audioManager) {
            // 对局中成员掉线弃权
            try { window.audioManager.playRaceAlert(); } catch (e) {}
        }
    };
    room.onRoomClosed = (reason) => {
        this._rbRoomOpen = false;
        this._rbKeepHostWaiting = false;
        if (this._rbMatchStarted) {
            // 对局中房主主动解散：迁移流程由 onHostLost 统一接管，不在这里中断
            if (reason !== 'host_dissolved') this._raceBattleHandleHostLost(reason);
        } else {
            this._raceBattleSetStatus('error', '房间已解散');
            this.raceBattleToast(reason === 'host_exit' ? '房主已解散房间' : '房间已关闭');
            this._raceBattleSwitchJoinButton('join');
            this.raceBattleRenderMembers(); // 房间关闭：隐藏底部按钮
        }
    };
    room.onHostLost = (reason) => {
        // 对局中房主退出（掉线/主动解散）→ 立即进入迁移流程，不再傻等 60s
        if (this._rbMatchStarted && !this._rbMigrationActive) this._rbStartHostMigration(reason);
    };
    room.onReconnectingChange = (reconnecting) => {
        this.raceBattleWaitHint.style.display = reconnecting ? '' : 'none';
        if (reconnecting) {
            this._raceBattleSetStatus('connecting', '连接不稳定，正在重连…');
            if (this._rbMatchStarted) this.raceBattleRenderProgress();
        }
    };
    room.onReconnectFailed = () => {
        this.raceBattleWaitHint.style.display = 'none';
        // 对局中重连失败：提示中断本局（房主端 60s 超时后会将本方判负结算）
        if (this._rbMatchStarted) this._raceBattleHandleHostLost('reconnect_failed');
    };
    room.onMessage = (payload, fromPlayerId) => {
        this._raceBattleHandleMessage(payload, fromPlayerId);
    };
};

// ─── 成员列表渲染 ───────────────────────────────────────────────

UIController.prototype.raceBattleRenderMembers = function() {
    if (!this._rbReady) return;
    this.raceBattleMembers.innerHTML = '';
    const list = this._rbMembers;
    this.raceBattleMembersCount.textContent = list.length + '/4';

    // 未创建/未加入房间前隐藏底部按钮（房主=开始竞速，访客=就绪/取消就绪），入房后才显示
    if (this.raceBattleStartBtn) this.raceBattleStartBtn.style.display = this._rbRoomOpen ? '' : 'none';

    const allReady = list.length >= 2 && list.every((m) => m.isHost || this._rbReadyMap[m.playerId]);
    if (this._rbIsHost) {
        this.raceBattleStartBtn.disabled = this._rbMatchStarted || !allReady;
        if (list.length < 2) this.raceBattleStartBtn.textContent = '等待玩家...';
        else if (!allReady) this.raceBattleStartBtn.textContent = '等待就绪...';
        else this.raceBattleStartBtn.textContent = '开始竞速';
    } else {
        // 访客端：底部按钮复用为「就绪/取消就绪」
        this.raceBattleStartBtn.disabled = this._rbMatchStarted;
        this.raceBattleStartBtn.textContent = this._rbReadyMap[this._rbMyId] ? '取消就绪' : '就绪';
    }

    if (list.length === 0) return;
    list.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'race-battle-member';
        if (m.playerId === this._rbMyId) row.classList.add('is-me');

        const nick = document.createElement('span');
        nick.className = 'race-battle-member-nick';
        nick.textContent = m.nickname;
        nick.title = m.nickname;
        row.appendChild(nick);

        const badge = document.createElement('span');
        badge.className = 'race-battle-member-badge';
        badge.textContent = this._raceBattleGetRankBadge(m.playerId);
        row.appendChild(badge);

        const role = document.createElement('span');
        role.className = 'race-battle-member-role';
        role.textContent = m.isHost ? '房主' : '访客';
        row.appendChild(role);

        if (m.connected === false) {
            const dc = document.createElement('span');
            dc.className = 'race-battle-member-disconnected';
            dc.textContent = '重连中';
            row.appendChild(dc);
        } else if (!m.isHost) {
            const ready = !!this._rbReadyMap[m.playerId];
            const rd = document.createElement('span');
            rd.className = 'race-battle-member-ready' + (ready ? ' is-ready' : '');
            rd.textContent = ready ? '已就绪' : '未就绪';
            row.appendChild(rd);
        }

        if (this._rbIsHost && !m.isHost) {
            const kick = document.createElement('button');
            kick.className = 'race-battle-kick-btn';
            kick.textContent = '踢出';
            kick.addEventListener('click', () => this.raceBattleKickMember(m.playerId));
            row.appendChild(kick);
        }

        this.raceBattleMembers.appendChild(row);
    });
};

UIController.prototype._raceBattleGetRankBadge = function(playerId) {
    const ranks = this._rbRanks || {};
    if (ranks[playerId]) return ranks[playerId];
    return '未定段';
};

UIController.prototype.raceBattleToggleReady = function() {
    if (!this._rbRoom) return;
    const ready = !this._rbReadyMap[this._rbMyId];
    this._rbReadyMap[this._rbMyId] = ready;
    this.raceBattleRenderMembers();
    this._rbRoom.send({ type: 'race_battle_ready', ready: !!ready }, false);
    if (this.playUIButtonSound) this.playUIButtonSound();
};

UIController.prototype.raceBattleKickMember = function(playerId) {
    if (!this._rbRoom || !this._rbIsHost) return;
    var member = this._rbMembers.find(function(m) { return m.playerId === playerId; });
    if (member) {
        this.raceBattleToast(member.nickname + ' 已被移出房间');
        // 2026-08-12 修复重复音效：反馈音由 onMemberLeft 统一播放（等待期 tick / 对局中 alert），这里不再重复
    }
    // RaceRoomController 负责关闭连接 + 广播 + 禁止重入
    this._rbRoom.kickMember(playerId);
    // onMemberLeft 回调会自动更新 _rbMembers 与 DOM，此处不需要手动操作
};

UIController.prototype.raceBattleStart = function() {
    if (!this._rbRoom) return;
    if (!this._rbIsHost) {
        // 访客端：底部按钮已复用为就绪按钮，点击即切换就绪状态
        this.raceBattleToggleReady();
        return;
    }
    const list = this._rbMembers;
    if (list.length < 2 || !list.every((m) => m.isHost || this._rbReadyMap[m.playerId])) return;
    const levels = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    const params = {
        type: 'race_battle_params',
        stamina: this._rbStamina,
        difficulty: this._rbDifficulty,
        ranked: this._rbRanked,
        levels: levels,
        startLevel: this._rbDifficulty,
        seeds: this._raceBattleBuildSeeds(this._rbDifficulty, levels),
        goAt: Date.now() + 4500   // 统一起跑时间戳：3s 倒计时 + 0.5s 缓冲
    };
    this._rbGameParams = params;
    this._rbRoom.send(params, true);
    // 竞速房开局：通知大厅移除房间（竞速房暂不支持观战，不保留在大厅）
    if (this._rbLobby && this._rbLobbyOpen) {
        try { this._rbLobby.notifyStarted(this._rbLobby.myRoomCode, false); } catch (e) {}
        this._rbLobbyOpen = false;
        this._rbLobbyExpiresAt = 0;
        if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.style.display = '';
        if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    }
    this._rbKeepHostWaiting = false;
    this._stopHostRoomBanner(); // 开局后竞速有进度面板，顶部胶囊隐藏
    this._rbStopLobbyTtlTimer();
    this.raceBattleStartMatch(params);
};

/** 房主随机出题：生成 levels 个随机种子（不再固定派生），保证每局关卡各不相同。
 *  仅房主调用一次；访客经 race_battle_params.seeds 接收，全员拿到同一份卷子。 */
UIController.prototype._raceBattleBuildSeeds = function(startLevel, levels) {
    const seeds = [];
    const base = (Date.now() % 1000000) + (Number(startLevel) || 0) * 131;  // 时间基底 + 难度扰动，配合随机数避免重复
    for (let i = 0; i < levels; i++) {
        seeds.push(base + Math.floor(Math.random() * 1000000) + i * 7919);
    }
    return seeds;
};

// ─── 离开 / 解散确认 ────────────────────────────────────────────

/** 将加入房间按钮切换为「加入」或「离开」模式 */
UIController.prototype._raceBattleSwitchJoinButton = function(mode) {
    const btn = document.getElementById('race-battle-join-btn');
    if (!btn) return;
    this._rbJoinBtnMode = mode;
    if (mode === 'leave') {
        btn.textContent = '离开房间';
        // 2026-08-11 修复：改用 p2p-action-btn 保持全宽，避免按钮缩成内容宽度（原 p2p-back-btn 无 width:100%）
        btn.className = 'btn btn-secondary p2p-action-btn';
    } else {
        btn.textContent = '加入房间';
        btn.className = 'btn btn-primary p2p-action-btn';
    }
};

UIController.prototype.raceBattleConfirmLeave = function() {
    this._ensureRaceBattleFields();
    if (!this.raceBattleExitModal) return;
    // U3: 注册 ESC/遮罩关闭（等价"取消"，保持 2026-08-11 修复的 showModal 动态 z-index 行为）
    this.bindModalDismiss(this.raceBattleExitModal, () => this.raceBattleCancelLeave());
    const isRanked = this._rbRanked && this._rbMatchStarted;
    const p = this.raceBattleExitModal.querySelector('p');
    if (p) {
        p.textContent = isRanked
            ? '确定要退出当前竞速对局吗？退出后本局判负并扣除积分。'
            : '确定要离开房间吗？';
    }
    // 2026-08-11 修复弹窗不显示：必须走 showModal() 获得动态 z-index（10000 + 栈深*2），
    // 直接 style.display='flex' 只有 CSS 的 1000，会被 start-modal(10000)/race-battle-modal(10004) 盖住
    this.showModal('race-battle-exit-modal');
};

UIController.prototype.raceBattleCancelLeave = function() {
    if (this._rbReady) this.hideModal('race-battle-exit-modal');
};

UIController.prototype.raceBattleDoLeave = function() {
    this._ensureRaceBattleFields();
    // 离开/解散即清理断线恢复上下文（对局已放弃）
    this._rbClearResumeContext();
    this.hideModal('race-battle-exit-modal');
    // 房主等待阶段（未开局、无访客已连上）退出 → 保留房间，返回主菜单后仍可恢复加入
    const keep = this._rbShouldKeepHostWaiting();
    this._rbKeepHostWaiting = keep;
    if (this._rbRoom) {
        try {
            if (this._rbIsHost && !keep) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            if (!keep) this._rbRoom.disconnect();
        } catch (e) {}
        if (!keep) this._rbRoom = null;
    }
    if (!keep) {
        this._rbRoomOpen = false;
        this._rbMembers = [];
        this._rbReadyMap = {};
        this._raceBattleSwitchJoinButton('join');
        this._stopHostRoomBanner(); // 创建tab建房退出即删除 → 隐藏顶部胶囊
    }
    this._rbMatchStarted = false;
    this.raceIsMultiplayer = false; // 离开多人模式，恢复单人竞速记录
    this._closeRaceLobby(keep);
    if (!keep) {
        this.raceBattleStopMatchUI();
        this.raceBattleHidePanel();
    }
    // 2026-08-12 需求：退出后回到联机竞速房间弹窗（keep 时 _proceedRaceBattleModal 会恢复原保留房间）
    this.hideModal('race-mode-select-modal');
    this._proceedRaceBattleModal();
    if (!keep) {
        const createBtn = document.getElementById('race-battle-create-btn');
        const deleteBtn = document.getElementById('race-battle-delete-btn');
        if (createBtn) createBtn.disabled = false;
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
};
/** 创建tab上的"删除房间"按钮：只清理房间连接 + 恢复UI，不离屏不回主页 */
UIController.prototype.raceBattleDeleteRoom = function() {
    this._ensureRaceBattleFields();
    this._rbClearResumeContext(); // 删除房间即清理恢复上下文
    if (this._rbRoom) {
        try {
            if (this._rbIsHost) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            this._rbRoom.disconnect();
        } catch (e) {}
        this._rbRoom = null;
    }
    this._rbRoomOpen = false;
    this._rbMatchStarted = false;
    this._rbMembers = [];
    this._rbReadyMap = {};
    this._rbKeepHostWaiting = false;
    this._stopHostRoomBanner(); // 删除房间即隐藏顶部胶囊
    this.raceIsMultiplayer = false;
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    // 2026-08-11 修复：清空 _rbMembers 后必须重渲染成员列表 DOM，
    // 否则删除房间后成员列表仍残留"房主自己"的行
    this.raceBattleRenderMembers();
    // 恢复状态提示
    this._raceBattleSetStatus('idle', '未连接');
    // 恢复创建/删除按钮
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = false;
    if (deleteBtn) deleteBtn.style.display = 'none';
    this._raceBattleSwitchJoinButton('join');
    // 隐藏房间码展示区（如果可见）
    const codeDisplay = document.getElementById('race-battle-room-code-display');
    if (codeDisplay) codeDisplay.style.display = 'none';
    // 如果同时在大厅也创建了房间，也给清理掉
    this._closeRaceLobby();
};
// ─── 对局进度面板 ───────────────────────────────────────────────

UIController.prototype.raceBattleShowPanel = function(code) {
    this._ensureRaceBattleFields();
    this.hideModal('race-battle-modal');
    this.hideStartModal();
    if (this.raceBattlePanelCode) this.raceBattlePanelCode.textContent = code || this.raceBattleRoomCode.textContent;
    this.raceBattlePanel.style.display = '';
    this.raceBattleShowBackground();
};

UIController.prototype.raceBattleHidePanel = function() {
    if (!this._rbReady) return;
    this.raceBattlePanel.style.display = 'none';
    this.raceBattleHideBackground();
    this._stopRaceBattleElapsedTimer();
};

UIController.prototype.raceBattleStopMatchUI = function() {
    if (!this._rbReady) return;
    if (this._rbCountdownTimer) { clearTimeout(this._rbCountdownTimer); this._rbCountdownTimer = null; }
    if (this._rbFeatureTimer) { clearTimeout(this._rbFeatureTimer); this._rbFeatureTimer = null; }
    this._stopRaceBattleElapsedTimer();
    if (this.raceBattleOverlay) this.raceBattleOverlay.style.display = 'none';
    this.raceBattleWaitHint.style.display = 'none';
};

/**
 * 渲染进度面板。progressMap: playerId -> {level, puzzle, times:[10], finished, disconnected, nickname}
 */
UIController.prototype.raceBattleRenderProgress = function(progressMap) {
    this._ensureRaceBattleFields();
    this._rbProgress = progressMap || this._rbProgress;
    const rows = this.raceBattleRows;
    rows.innerHTML = '';

    const list = Object.keys(this._rbProgress).map((id) => ({ id: id, data: this._rbProgress[id] }));
    // 排序：完成者按总用时在前；进行中按已过关数+题数；断线置底
    list.sort((a, b) => {
        const da = a.data, db = b.data;
        const fa = da.finished ? 1 : 0, fb = db.finished ? 1 : 0;
        if (fa !== fb) return fb - fa;
        if (fa === 1) return (da.finishTime || 0) - (db.finishTime || 0);
        if (da.disconnected !== db.disconnected) return da.disconnected ? 1 : -1;
        const pa = (da.level || 1) * 10 + (da.puzzle || 0);
        const pb = (db.level || 1) * 10 + (db.puzzle || 0);
        return pb - pa;
    });

    const times = list.map((item) => item.data.times || []);
    // 时间列数 = 耐力对应关卡数（耐力1级=3、2级=5、3级=10），不写死 10
    const totalLevels = (this._rbGameParams && this._rbGameParams.levels) || 3;
    const bestPerLevel = [];
    for (let lv = 0; lv < totalLevels; lv++) {
        let best = Infinity;
        times.forEach((t) => { if (t[lv] && t[lv] < best) best = t[lv]; });
        bestPerLevel.push(best);
    }

    list.forEach((item, idx) => {
        const d = item.data;
        const row = document.createElement('div');
        row.className = 'race-battle-row';
        if (idx === 0 && !d.disconnected) row.classList.add('is-leader');
        if (item.id === this._rbMyId) row.classList.add('is-self');
        if (d.disconnected) row.classList.add('is-waiting');
        if (d.finished) row.classList.add('is-done');

        const rank = document.createElement('span');
        rank.className = 'race-battle-rank';
        rank.textContent = String(idx + 1);
        row.appendChild(rank);

        const nick = document.createElement('span');
        nick.className = 'race-battle-nick';
        nick.textContent = d.nickname || '玩家';
        if (item.id === this._rbMyId) {
            const me = document.createElement('span');
            me.className = 'rb-me-tag';
            me.textContent = '我';
            nick.appendChild(me);
        }
        row.appendChild(nick);

        const state = document.createElement('span');
        state.className = 'race-battle-state';
        if (d.disconnected) {
            state.textContent = '等待重连…';
            state.classList.add('is-amber');
        } else if (d.finished) {
            state.textContent = '已完成 · ' + this._raceBattleFmtTime(d.finishTime);
            state.classList.add('is-green');
        } else {
            state.textContent = '第' + (d.level || 1) + '/' + totalLevels + '关 第' + (d.puzzle || 0) + '/10题';
            state.classList.add('is-green');
        }
        row.appendChild(state);

        // 时间列（按耐力关卡数）
        const timesWrap = document.createElement('span');
        timesWrap.className = 'race-battle-times';
        const t = d.times || [];
        for (let lv = 0; lv < totalLevels; lv++) {
            const cell = document.createElement('span');
            cell.className = 'race-battle-time';
            const v = t[lv];
            if (v != null) {
                const best = bestPerLevel[lv];
                if (v === best) { cell.classList.add('is-blue'); cell.textContent = this._raceBattleFmtTime(v); }
                else { cell.classList.add('is-red'); cell.textContent = '+' + this._raceBattleFmtTime(v - best); }
            } else {
                cell.classList.add('is-gray');
                cell.textContent = (lv + 1 === (d.level || 1)) ? '--' : '-';
            }
            timesWrap.appendChild(cell);
        }
        row.appendChild(timesWrap);

        // 连续粗百分比条
        const progWrap = document.createElement('span');
        progWrap.className = 'race-battle-progress-wrap';
        const bar = document.createElement('span');
        bar.className = 'race-battle-progress-bar';
        const fill = document.createElement('span');
        fill.className = 'race-battle-progress-fill';
        const totalLevels2 = (this._rbGameParams && this._rbGameParams.levels) || d.totalLevels || 3;
        const donePuzzles = (d.finished ? totalLevels2 : ((d.level || 1) - 1) + ((d.puzzle || 0) / 10)) / totalLevels2;
        fill.style.width = Math.round(donePuzzles * 100) + '%';
        const pct = document.createElement('span');
        pct.className = 'race-battle-progress-pct';
        pct.textContent = Math.round(donePuzzles * 100) + '%';
        bar.appendChild(fill);
        bar.appendChild(pct);
        progWrap.appendChild(bar);
        row.appendChild(progWrap);

        rows.appendChild(row);
    });

    // 折叠态窄进度线：显示本人当前进度（2px 细线，不挡棋盘）
    const thin = this.raceBattleProgressThin;
    if (thin) {
        const me = this._rbProgress[this._rbMyId];
        const totalLv = (this._rbGameParams && this._rbGameParams.levels) || 3;
        let pct = 0;
        if (me) {
            pct = (me.finished ? totalLv : ((me.level || 1) - 1) + ((me.puzzle || 0) / 10)) / totalLv;
        }
        thin.style.width = Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%';
    }
};

UIController.prototype.raceBattleSetFeatureLine = function(text) {
    if (!this._rbReady) return;
    this.raceBattleFeatureLine.textContent = text || '';
};

UIController.prototype._raceBattleFmtTime = function(seconds) {
    if (seconds == null || isNaN(seconds)) return '--s';
    return seconds.toFixed(1) + 's';
};

// ─── 顶部正计时（本端，独立于对局同步计时） ─────────────────────

UIController.prototype._startRaceBattleElapsedTimer = function(baseTs) {
    this._stopRaceBattleElapsedTimer();
    this._rbElapsedStart = baseTs || Date.now();
    const tick = () => {
        const sec = (Date.now() - this._rbElapsedStart) / 1000;
        this.raceBattlePanelTimer.textContent = sec.toFixed(2) + 's';
    };
    tick();
    this._rbElapsedTimer = setInterval(tick, 50);
};

UIController.prototype._stopRaceBattleElapsedTimer = function() {
    if (this._rbElapsedTimer) { clearInterval(this._rbElapsedTimer); this._rbElapsedTimer = null; }
};

// ─── 全屏倒计时 / 特性卡 overlay ─────────────────────────────────

UIController.prototype.raceBattleShowOverlay = function() {
    this._ensureRaceBattleFields();
    this.raceBattleOverlay.style.display = 'flex';
};

UIController.prototype.raceBattleHideOverlay = function() {
    if (!this._rbReady) return;
    this.raceBattleOverlay.style.display = 'none';
    this.raceBattleOverlayCard.className = 'race-battle-overlay-card';
};

/** 3-2-1 起跑倒计时。onGo 在 GO! 时调用（此时开始统一计时）。 */
UIController.prototype.raceBattleShowCountdown = function(onGo) {
    this._ensureRaceBattleFields();
    this.raceBattleShowOverlay();
    const card = this.raceBattleOverlayCard;
    const steps = [3, 2, 1, 'GO!'];
    let i = 0;
    const run = () => {
        if (i >= steps.length) {
            this.raceBattleHideOverlay();
            if (onGo) onGo();
            return;
        }
        const v = steps[i];
        card.className = 'race-battle-overlay-card is-count' + (v === 'GO!' ? ' is-go' : '');
        card.textContent = String(v);
        if (window.audioManager) {
            try {
                if (v === 'GO!') window.audioManager.playRaceLaunch();
                else window.audioManager.playRaceCountdown();
            } catch (e) {}
        }
        i++;
        this._rbCountdownTimer = setTimeout(run, 1000);
    };
    run();
};

/** 关卡特性卡：显示本关特性徽章，1.8s 后自动淡出。feature: {title, chips:[{text,type}]} */
UIController.prototype.raceBattleShowFeatureCard = function(feature) {
    this._ensureRaceBattleFields();
    if (this._rbFeatureTimer) { clearTimeout(this._rbFeatureTimer); this._rbFeatureTimer = null; }
    this.raceBattleShowOverlay();
    const card = this.raceBattleOverlayCard;
    card.className = 'race-battle-overlay-card is-feature';
    card.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'rb-feature-title';
    title.textContent = feature.title || '本关特性';
    card.appendChild(title);
    const chips = document.createElement('div');
    chips.className = 'rb-feature-chips';
    (feature.chips || []).forEach((c) => {
        const chip = document.createElement('span');
        chip.className = 'rb-feature-chip ' + (c.type || 'symbol');
        chip.textContent = c.text;
        chips.appendChild(chip);
    });
    card.appendChild(chips);
    if (window.audioManager) {
        try { window.audioManager.playPhaseChange(); } catch (e) {}
    }
    this._rbFeatureTimer = setTimeout(() => {
        this.raceBattleHideOverlay();
        this._rbFeatureTimer = null;
    }, 1800);
};

// ─── toast ───────────────────────────────────────────────────────

UIController.prototype.raceBattleToast = function(text) {
    this._ensureRaceBattleFields();
    if (this._rbToastTimer) { clearTimeout(this._rbToastTimer); this._rbToastTimer = null; }
    const el = this.raceBattleToastEl;
    el.textContent = text;
    el.classList.remove('is-hiding');
    el.style.display = '';
    this._rbToastTimer = setTimeout(() => {
        el.classList.add('is-hiding');
        setTimeout(() => { el.style.display = 'none'; el.classList.remove('is-hiding'); }, 320);
    }, 2200);
};

// ─── 对局背景：光带 + 速度线（2026-08-11 用户要求移除：全屏特效遮挡棋盘视线）──

UIController.prototype.raceBattleShowBackground = function() {
    // 已按用户要求移除全屏场地特效（深色渐变光带 + 速度线），不再创建。
};

UIController.prototype.raceBattleHideBackground = function() {
    if (!this._rbReady) return;
    const bg = document.getElementById('race-battle-bg');
    if (bg) bg.remove();
};
// ─── 结算弹窗 ───────────────────────────────────────────────────

/**
 * result: {
 *   ranked,            bool
 *   list: [{rank, name, time, delta, isMe}]
 *   myRank, myEloDelta, myRankBefore, myRankAfter, myRankTitle
 * }
 */
UIController.prototype.raceBattleShowResult = function(result) {
    this._ensureRaceBattleFields();
    // 结算展示 = 对局已结束，清理断线恢复上下文
    this._rbClearResumeContext();
    // 2026-08-12 修复重复音效：结算弹窗可能被「本地提前结算」与「房主广播刷新」先后触发，
    // 4s 内只播一次庆祝音
    const _now = Date.now();
    if (!this._rbResultSfxAt || _now - this._rbResultSfxAt > 4000) {
        this._rbResultSfxAt = _now;
        if (window.audioManager) { try { window.audioManager.playRaceFanfare(); } catch (e) {} }
    }
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    // U1: 走 showModal 获取动态 z-index（10000+），否则 z-index:1000 会被悬浮键盘(5000)盖住。
    // 注意：showModal 对已 visible/entering 的弹窗会直接 return（防重入守卫），而本方法会被
    // 「本地提前结算」与「房主广播刷新」先后触发，第二次仍需刷新排行榜/最终 ELO——所以仅在未显示时才 showModal。
    const _st = this._getModalState(this.raceBattleResultModal);
    if (_st !== 'visible' && _st !== 'entering') this.showModal(this.raceBattleResultModal);

    const medals = ['🥇', '🥈', '🥉'];
    const rl = this.raceBattleResultRanklist;
    rl.innerHTML = '';
    (result.list || []).forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'rb-result-item' + (item.isMe ? ' is-self' : '');
        const medal = document.createElement('span');
        medal.className = 'rb-result-medal';
        medal.textContent = medals[i] || '';
        row.appendChild(medal);
        const name = document.createElement('span');
        name.className = 'rb-result-name';
        name.textContent = (i + 1) + '. ' + item.name;
        row.appendChild(name);
        if (!result.ranked) {
            const casual = document.createElement('span');
            casual.className = 'rb-result-casual';
            casual.textContent = '休闲局';
            row.appendChild(casual);
        } else {
            const time = document.createElement('span');
            time.className = 'rb-result-time';
            time.textContent = item.abandoned ? '弃权' : this._raceBattleFmtTime(item.time);
            row.appendChild(time);
            const delta = document.createElement('span');
            delta.className = 'rb-result-delta' + ((item.delta || 0) < 0 ? ' neg' : '');
            delta.textContent = (item.delta > 0 ? '+' : '') + (item.delta || 0) + ' 分';
            row.appendChild(delta);
        }
        rl.appendChild(row);
    });

    const self = this.raceBattleResultSelf;
    if (result.ranked) {
        self.style.display = '';
        if (result.myEloDelta == null) {
            self.textContent = '积分结算中…';
            // 兜底：5s 内积分未返回（如上报失败/网络异常）→ 改显"积分暂不可用"，避免无限转圈
            if (this._rbResultScoreTimer) clearTimeout(this._rbResultScoreTimer);
            this._rbResultScoreTimer = setTimeout(() => {
                const cur = this.raceBattleResultSelf;
                if (cur && cur.textContent === '积分结算中…') cur.textContent = '积分暂不可用';
                this._rbResultScoreTimer = null;
            }, 5000);
            return;
        }
        if (this._rbResultScoreTimer) { clearTimeout(this._rbResultScoreTimer); this._rbResultScoreTimer = null; }
        self.innerHTML = '';
        const rankline = document.createElement('div');
        rankline.className = 'rb-result-rankline';
        rankline.innerHTML = '我的名次：第 ' + result.myRank + ' 名 · ' + (result.myRankTitle ? this._raceTierIconHtml(result.myRankTitle) + ' ' + this._escapeHtml(result.myRankTitle) : '');
        self.appendChild(rankline);
        const eloline = document.createElement('div');
        eloline.className = 'rb-result-eloline';
        const delta = result.myEloDelta || 0;
        eloline.innerHTML = '竞速积分：<span class="rb-result-elo' + (delta < 0 ? ' neg' : '') + '">' + (delta > 0 ? '+' : '') + delta + '</span>';
        self.appendChild(eloline);
        const barWrap = document.createElement('div');
        barWrap.className = 'rb-result-rankbar-wrap';
        const bar = document.createElement('div');
        bar.className = 'rb-result-rankbar';
        const rp = Math.max(4, Math.min(100, (result.myRankAfter / result.myRankTotal || 0.5) * 100));
        bar.style.setProperty('--rb-bar-w', rp + '%');
        barWrap.appendChild(bar);
        self.appendChild(barWrap);
    } else {
        self.style.display = '';
        self.textContent = '休闲局 · 不增减积分';
    }
};

UIController.prototype.raceBattleRematch = function() {
    this._ensureRaceBattleFields();
    this._rbClearResumeContext(); // 再来一局：旧对局上下文作废，新对局开局时重新保存
    this.hideModal(this.raceBattleResultModal);
    // 保留房间连接，回建房窗口保留参数，就绪状态清零需重新确认
    this._rbMatchStarted = false;
    this._rbProgress = {};
    this._rbReadyMap = {};
    this.raceBattleSwitchTab('create');
    this.raceBattleRenderParams();
    this.raceBattleRenderMembers();
    this.showModal('race-battle-modal');
    if (this._rbIsHost && this._rbRoom) {
        this._rbRoom.send({ type: 'race_battle_rematch' }, true);
    }
};

UIController.prototype.raceBattleBackToMenu = function() {
    this._ensureRaceBattleFields();
    // 返回主菜单（无论是否保留等待房间）均清理断线恢复上下文
    this._rbClearResumeContext();
    this.hideModal(this.raceBattleResultModal);
    // 2026-08-12 需求：等待阶段退出也保留房间（普通5min/长效30min），并回到联机竞速弹窗
    const keep = this._rbShouldKeepHostWaiting();
    this._rbKeepHostWaiting = keep;
    if (this._rbRoom) {
        try {
            if (this._rbIsHost && !keep) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            if (!keep) this._rbRoom.disconnect();
        } catch (e) {}
        if (!keep) this._rbRoom = null;
    }
    if (!keep) {
        this._rbRoomOpen = false;
        this._rbMembers = [];
        this._rbReadyMap = {};
        this._stopHostRoomBanner(); // 创建tab建房退出即删除 → 隐藏顶部胶囊
    }
    this._rbMatchStarted = false;
    this.raceIsMultiplayer = false; // 返回主菜单，恢复单人竞速记录
    this._raceBattleSwitchJoinButton('join');
    this._closeRaceLobby(keep);
    if (!keep) {
        this.raceBattleStopMatchUI();
        this.raceBattleHidePanel();
    }
    // 真正返回主菜单（keep 时房间与大厅登记保留，下次进入联机竞速 _proceedRaceBattleModal 自动恢复）
    this.hideModal('race-battle-modal');
    this.hideModal('race-mode-select-modal');
    this.showModal('start-modal');
};

// ─── 竞速排位断线恢复（对齐 P2P 访客大退恢复）───────────────────
// 刷新/重开页面后，通过 localStorage 中的未完成排位对局上下文弹窗询问是否恢复。
// 关键：持久化 _rbMyId，刷新后用同一 playerId 重入，房主 race_hello 才能命中已有成员分支认回。

UIController.prototype._rbSaveResumeContext = function() {
    try {
        if (!this._rbRanked || !this._rbMatchStarted) return;
        if (!this._rbRoom || !this._rbRoom.roomCode) return;
        const p = this._rbGameParams || {};
        const ctx = {
            roomCode: this._rbRoom.roomCode,
            myId: this._rbMyId,
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
    try {
        const raw = localStorage.getItem('function_chess_rb_resume');
        if (!raw) return null;
        const ctx = JSON.parse(raw);
        if (!ctx || !ctx.roomCode || !ctx.myId) return null;
        return ctx;
    } catch (e) { return null; }
};

UIController.prototype._rbClearResumeContext = function() {
    try { localStorage.removeItem('function_chess_rb_resume'); } catch (e) {}
    this._rbResumeCtx = null;
    this._rbResuming = false;
};

/** 启动检测：有未结束的竞速排位对局 → 弹恢复询问 */
UIController.prototype._checkRaceBattleResume = function() {
    const ctx = this._rbLoadResumeContext();
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
};

/** 确认恢复：以原 playerId 重新加入房间（访客续局；原房主以普通成员身份续局） */
UIController.prototype.confirmRaceBattleResume = function() {
    const ctx = this._rbLoadResumeContext();
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
    room.joinRoom({ roomCode: ctx.roomCode, playerId: this._rbMyId, nickname, mode: 'ranked' }).then((ok) => {
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

// ─── 对局开始（界面侧入口，ui-logic 负责播种与同步计时）────────

UIController.prototype.raceBattleStartMatch = function(params) {
    this._ensureRaceBattleFields();
    // U10: 防重入——消息重复投递时忽略第二次（新对局由 rematch/doLeave 复位 _rbMatchStarted）
    if (this._rbMatchStarted) return;
    this._rbMatchStarted = true;
    this._rbGameParams = params;
    this._rbGoAt = params.goAt || (Date.now() + 4500);
    this.raceBattleRenderMembers();
    this.raceBattleShowPanel(this.raceBattleRoomCode.textContent);
    // 新对局重置"退出结算/继续观战"选择条
    this.raceBattleShowFinishChoice(false);
    // 进度初始化：先显示全员等待起跑
    const list = this._rbMembers;
    const progress = {};
    list.forEach((m) => {
        progress[m.playerId] = {
            level: 1, puzzle: 0, times: [], finished: false,
            disconnected: false, nickname: m.nickname
        };
    });
    this._rbProgress = progress;
    this.raceBattleRenderProgress(progress);
    this.raceBattleSetFeatureLine(this._raceBattleDefaultFeatureLine(params));
    // 排位对局开局即保存恢复上下文（覆盖起跑前刷新场景；字段未就绪的由 _rbUpdateSelfProgress 补齐）
    if (params.ranked) this._rbSaveResumeContext();
    // 第 1 关直接 3-2-1 起跑（基于统一时间戳，杜绝抢先）
    this.raceBattleShowCountdownAt(this._rbGoAt, () => {
        this._raceBattleBeginPlay(params);
    });
};

UIController.prototype._raceBattleDefaultFeatureLine = function(params) {
    const df = RACE_BATTLE_DIFFICULTIES[(params.startLevel || params.difficulty) - 1];
    const levels = params.levels || 3;
    return '难度' + df.name + ' · 连跑 ' + levels + ' 关 · 每关 10 题';
};

// ─── 消息处理（协议层占位，ui-logic 填充具体分支）──────────────

UIController.prototype._raceBattleHandleMessage = function(payload, fromPlayerId) {
    if (!payload || !payload.type) return;
    switch (payload.type) {
        case 'race_battle_params':
            this._rbGameParams = payload;
            this._rbRanked = !!payload.ranked;
            this._rbStamina = payload.stamina || 1;
            this._rbDifficulty = payload.difficulty || 1;
            this.raceBattleStartMatch(payload);
            break;
        case 'race_battle_ready':
            if (payload.ready != null) {
                // 就绪消息由 RoomController.send 注入发送者身份，统一用 fromPlayerId
                this._rbReadyMap[fromPlayerId] = !!payload.ready;
                this.raceBattleRenderMembers();
                if (window.audioManager) { try { window.audioManager.playTick(); } catch (e) {} }
            }
            break;
        case 'race_battle_kick':
            // kick 仅由房主发起并广播给全员，各端自行判断：
            // 房主本地移除目标；被踢访客自识别后退出；其余访客忽略
            if (this._rbIsHost) {
                this._rbMembers = this._rbMembers.filter((m) => m.playerId !== payload.targetId);
                delete this._rbReadyMap[payload.targetId];
                this.raceBattleRenderMembers();
            } else if (payload.targetId === this._rbMyId) {
                this.raceBattleToast('你已被房主移出房间');
                this.raceBattleDoLeave();
            }
            break;
        case 'race_battle_dissolve':
            if (this._rbMatchStarted) {
                // 对局中：房主解散 → 本局不计成绩
                this._raceBattleHandleHostLost('host_exit');
            } else {
                // 未开局：房主解散房间，仅提示不弹结算
                this._rbRoomOpen = false;
                this._raceBattleSetStatus('error', '房间已解散');
                this.raceBattleToast('房主已解散房间');
                this._raceBattleSwitchJoinButton('join');
                this.raceBattleRenderMembers(); // 房间解散：隐藏底部按钮
            }
            break;
        case 'race_battle_rematch':
            if (!this._rbIsHost) {
                this._rbMatchStarted = false;
                this._rbProgress = {};
                this._rbReadyMap = {};
                this.raceBattleSwitchTab('create');
                this.raceBattleRenderParams();
                this.raceBattleRenderMembers();
                this.showModal('race-battle-modal');
            }
            break;
        case 'race_battle_progress':
            this._rbHandleProgressMsg(payload, fromPlayerId);
            break;
        case 'race_battle_level_done':
            this._rbHandleLevelDoneMsg(payload, fromPlayerId);
            break;
        case 'race_battle_finish':
            this._rbHandleFinishMsg(payload, fromPlayerId);
            break;
        case 'race_battle_result':
            this._rbHandleResultMsg(payload);
            break;
        // ── 房主迁移（host migration）协议 ──
        case 'race_progress_request':
            // 新房主请求进度快照 → 回传本人条目（各跑各的，按 playerId 分区）
            if (!this._rbIsHost && this._rbMigrationActive && !this._rbMigrationDone) this._rbSendMigrationSync();
            break;
        case 'race_progress_sync':
            this._rbHandleProgressSyncMsg(payload, fromPlayerId);
            break;
        case 'race_migration_done':
            this._rbHandleMigrationDoneMsg(payload);
            break;
        case 'race_migration_query':
            // 新房主收到访客的补发请求：若迁移已完成则立即重发 migration_done（幂等）
            if (this._rbIsHost && this._rbMigrationDone) this._rbResendMigrationDone();
            break;
        // ── 重连恢复后的完整进度快照同步（不触发迁移收尾，避免污染 _rbMigrationDone）──
        case 'race_full_progress_request':
            // 新房主收到（旧房主/晚连访客）的完整快照请求 → 回发全员进度
            if (this._rbIsHost && this._rbProgress) {
                try { this._rbRoom.send({ type: 'race_full_progress', progress: this._rbProgress }, true); } catch (e) {}
            }
            break;
        case 'race_full_progress':
            // 收到完整快照 → 仅更新进度并重绘，不进入迁移收尾（保持 _rbMigrationDone 不变）
            if (payload && payload.progress && typeof payload.progress === 'object') {
                this._rbProgress = payload.progress;
                this.raceBattleRenderProgress();
            }
            break;
        default:
            if (this._rbOnMessage) {
                try { this._rbOnMessage(payload, fromPlayerId); } catch (e) { console.error(e); }
            }
            break;
    }
};

/** 远端完赛：更新其 finished 状态，房主触发结算检查 */
UIController.prototype._rbHandleFinishMsg = function(payload, fromPlayerId) {
    const p = this._rbProgress[fromPlayerId] || (this._rbProgress[fromPlayerId] = {});
    p.finished = true;
    p.finishTime = payload.elapsed || 0;
    p.puzzle = 10;
    const member = this._rbMembers.find((m) => m.playerId === fromPlayerId);
    if (member) p.nickname = member.nickname;
    this.raceBattleRenderProgress();
    if (this._rbIsHost) this._rbCheckResult();
};

UIController.prototype._raceBattleHandleHostLost = function(reason) {
    // 对局中断（迁移失败/断线弃权）：清理断线恢复上下文，不再提供恢复入口
    this._rbClearResumeContext();
    // 对局已中断：终止迁移状态机（清选举/60s 兜底/同步窗口定时器，置 done），
    // 防止 onReconnectFailed 先弹「对局中断」后，60s 兜底定时器仍触发 _rbAbortMigration、
    // 或 _rbTryPromote 在已中断的对局上继续尝试接管
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    // 房主连接断开：迁移超时兜底（已完成玩家成绩已直连上报，不白打）
    if (window.audioManager) { try { window.audioManager.playError(); } catch (e) {} }
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    // U1: 与 raceBattleShowResult 一致，走 showModal 获取动态 z-index，避免被悬浮键盘盖住
    this.showModal(this.raceBattleResultModal);
    this.raceBattleResultTitle.textContent = '对局中断';
    this.raceBattleResultRanklist.innerHTML = '';
    const self = this.raceBattleResultSelf;
    self.style.display = '';
    if (reason === 'self_finished') self.textContent = '对局中断，你已完成全部关卡，成绩已上报';
    else if (reason === 'reconnect_failed') self.textContent = '网络连接已断开，本局按弃权处理';
    else if (reason === 'user_abort') self.textContent = '你已放弃等待迁移，本局不计成绩';
    else self.textContent = '房主连接断开，迁移失败，本局不计成绩';
    const backBtn = document.getElementById('race-battle-back-btn');
    const rematchBtn = document.getElementById('race-battle-rematch-btn');
    if (backBtn) backBtn.style.display = '';
    if (rematchBtn) rematchBtn.style.display = 'none';
};

// ─── 房主迁移（host migration）状态机 ────────────────────────
// 触发：访客端感知房主退出（掉线 conn_closed / 主动解散 host_dissolved）→ 立即弹窗
// 选举：各访客按 slot×1.5s 错开尝试 promote，PeerJS id 唯一性天然仲裁
// 同步：新房主收集各访客本人进度条目 → 分区组合 → 广播 migration_done 关闭弹窗继续对局

/** 启动迁移：弹窗并调度选举 */
UIController.prototype._rbStartHostMigration = function(reason) {
    this._ensureRaceBattleFields();
    if (!this._rbMatchStarted || this._rbMigrationActive) return;
    if (this._rbIsHost) return; // 房主自己不掉线，无需迁移
    this._rbMigrationActive = true;
    this._rbMigrationDone = false; // 第二次迁移：重置 done，允许重新选举
    this._rbMigrationNewHostName = '';
    this.raceBattleShowMigrationModal(true, '正在重新安排新房主并进行重连与同步…');
    // 按成员序号错开尝试升级：序号越小越先，PeerJS id 唯一性仲裁
    const me = this._rbMembers.find(m => m.playerId === this._rbMyId);
    const slot = (me && me.slot != null) ? me.slot : 1;
    if (this._rbMigrationTimer) clearTimeout(this._rbMigrationTimer);
    this._rbMigrationTimer = setTimeout(() => this._rbTryPromote(), Math.min(slot, 4) * 1500);
    // 总超时兜底：60s 内无法完成迁移 → 回落对局中断
    if (this._rbMigrationAbortTimer) clearTimeout(this._rbMigrationAbortTimer);
    this._rbMigrationAbortTimer = setTimeout(() => this._rbAbortMigration('timeout'), 60000);
};

/** 选举到点：若已重连成功则按目标判断（闪断恢复/新主接管），否则尝试升级为新房主 */
UIController.prototype._rbTryPromote = function() {
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (!this._rbRoom) { this._rbAbortMigration('room_gone'); return; }
    if (this._rbRoom.isConnected && !this._rbRoom._promoting) {
        if (this._rbIsOldHostBack()) this._rbCancelMigration();
        return; // 已连上新房主 → 等 migration_done
    }
    this._rbPromoteAsHost();
};

/** 执行升级；成功则成为新房主并开启进度收集窗口，失败（有人抢先）则保持访客等同步 */
UIController.prototype._rbPromoteAsHost = async function() {
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (!this._rbRoom) { this._rbAbortMigration('room_gone'); return; }
    let ok = false;
    try {
        ok = await this._rbRoom.promoteToHost();
    } catch (e) {
        console.error('[RB-MIGRATE] promoteToHost error', e);
        ok = false;
    }
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (ok) {
        // 自己成为新房主：本地进度即本人权威，等待其他访客重连并回传进度
        this._rbIsHost = true;
        this._rbMigrationNewHostName = (window.PlayerProfile && PlayerProfile.getNickname()) || '我';
        // 通知服务端移交房间 hostWs，防止旧房主断开时误删房间
        if (this._rbLobby && this._rbLobbyConnected) {
            try {
                this._rbLobby.notifyHostTransfer(this._rbRoom.roomCode, this._rbMyId, this._rbMigrationNewHostName);
            } catch (e) { console.error(e); }
        }
        this.raceBattleShowMigrationModal(true, '已接管房间，正在同步其他玩家的进度…');
        if (this._rbMigrationSyncTimer) clearTimeout(this._rbMigrationSyncTimer);
        this._rbMigrationSyncTimer = setTimeout(() => this._rbAbortMigration('sync_timeout'), 8000);
        this._rbRequestProgress();
    } else {
        // 已有其他访客抢先成为新房主：保持访客，等重连成功或 migration_done
        this.raceBattleShowMigrationModal(true, '新房主已确定，正在重连并同步进度…');
        // 兜底：新房主广播 migration_done 时本端可能尚未重连成功而错过消息，
        // 周期主动 query 请求新房主重发，直到收到或超时，避免弹窗永久挂死
        this._rbStartMigrationQuery();
    }
};

/** 访客侧：迁移待确认时周期向新房主请求重发 migration_done（错过广播的兜底） */
UIController.prototype._rbStartMigrationQuery = function() {
    if (this._rbMigrationQueryTimer) return;
    let tries = 0;
    const self = this;
    const step = () => {
        if (self._rbMigrationDone || !self._rbMigrationActive) {
            self._rbMigrationQueryTimer = null;
            return;
        }
        if (self._rbRoom && !self._rbIsHost) {
            try { self._rbRoom.send({ type: 'race_migration_query' }, false); } catch (e) {}
        }
        tries++;
        if (tries >= 8) { // 约 16s 内新房主未响应 → 交由总超时兜底收尾
            self._rbMigrationQueryTimer = null;
            return;
        }
        self._rbMigrationQueryTimer = setTimeout(step, 2000);
    };
    this._rbMigrationQueryTimer = setTimeout(step, 2000);
};

/** 新房主：向所有已连接访客请求进度快照 */
UIController.prototype._rbRequestProgress = function() {
    if (!this._rbRoom || !this._rbIsHost || this._rbMigrationDone) return;
    this._rbRoom.send({ type: 'race_progress_request' }, true);
};

/** 访客：回传本人进度条目给新房主（各跑各的，按 playerId 分区） */
UIController.prototype._rbSendMigrationSync = function() {
    if (!this._rbRoom || this._rbIsHost) return;
    if (!this._rbProgress || !this._rbProgress[this._rbMyId]) return;
    this._rbRoom.send({ type: 'race_progress_sync', progress: { [this._rbMyId]: this._rbProgress[this._rbMyId] } }, false);
};

/** 新房主：收集各端本人条目，分区组合进本地快照（只信本人自报，未回复者保留迁移前最后快照） */
UIController.prototype._rbHandleProgressSyncMsg = function(payload, fromPlayerId) {
    // 兜底：迁移已完成但收到晚到的进度回传（说明某访客刚连上新房主、正等 migration_done）→ 重发
    if (this._rbIsHost && this._rbMigrationDone) {
        this._rbResendMigrationDone();
        return;
    }
    if (!this._rbIsHost || !this._rbMigrationActive || this._rbMigrationDone) return;
    const pg = payload && payload.progress;
    if (!pg || typeof pg !== 'object') return;
    Object.keys(pg).forEach((id) => {
        if (id !== fromPlayerId) return; // 仅采纳本人自报的条目
        const p = pg[id];
        if (!p || typeof p !== 'object') return;
        const cur = this._rbProgress[id] || {};
        this._rbProgress[id] = {
            level: (p.level != null) ? p.level : (cur.level != null ? cur.level : 1),
            puzzle: (p.puzzle != null) ? p.puzzle : (cur.puzzle != null ? cur.puzzle : 0),
            times: Array.isArray(p.times) ? p.times.slice() : (Array.isArray(cur.times) ? cur.times.slice() : []),
            finished: !!p.finished,
            finishTime: p.finishTime || 0,
            disconnected: !!p.disconnected,
            nickname: (p.nickname || cur.nickname || '玩家'),
            _synced: true
        };
        const member = this._rbMembers.find(m => m.playerId === id);
        if (member && member.nickname) this._rbProgress[id].nickname = member.nickname;
    });
    this.raceBattleRenderProgress();
    // 若全部在线成员均已回传 → 提前广播迁移完成
    if (this._rbAllOnlineSynced()) {
        if (this._rbMigrationSyncTimer) { clearTimeout(this._rbMigrationSyncTimer); this._rbMigrationSyncTimer = null; }
        this._rbBroadcastMigrationDone();
    }
};

/** 新房主：检查除自己外的在线成员是否都已回传进度 */
UIController.prototype._rbAllOnlineSynced = function() {
    const online = this._rbMembers.filter(m => m.playerId !== this._rbMyId && m.connected);
    if (!online.length) return true; // 没有其他在线成员，无需等待
    return online.every(m => this._rbProgress[m.playerId] && this._rbProgress[m.playerId]._synced);
};

/** 新房主：广播迁移完成（合并后完整快照）并收尾 */
UIController.prototype._rbBroadcastMigrationDone = function() {
    if (!this._rbIsHost || !this._rbMigrationActive) return;
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true; // 防重入
    try {
        this._rbRoom.send({ type: 'race_migration_done', newHost: this._rbMigrationNewHostName, progress: this._rbProgress }, true);
    } catch (e) { console.error(e); }
    this._rbFinishMigration();
};

/** 新房主：重发迁移完成通知（无 Active/Done 守卫）。
 *  用于兜底「晚于 migration_done 才连上新房主的访客」——对方只缺这一条消息，
 *  重发是幂等的（访客 _rbHandleMigrationDoneMsg 已处理过则直接 return）。 */
UIController.prototype._rbResendMigrationDone = function() {
    if (!this._rbIsHost || !this._rbRoom || !this._rbProgress) return;
    try {
        this._rbRoom.send({ type: 'race_migration_done', newHost: this._rbMigrationNewHostName, progress: this._rbProgress }, true);
    } catch (e) {}
};

/** 访客：收到新房主广播，覆盖本地快照并收尾 */
UIController.prototype._rbHandleMigrationDoneMsg = function(payload) {
    if (this._rbMigrationDone) return;
    const pg = payload && payload.progress;
    if (pg && typeof pg === 'object') this._rbProgress = pg; // 新房主合并后的完整快照
    this._rbMigrationNewHostName = (payload && payload.newHost) || '新房主';
    this._rbFinishMigration();
};

/** 迁移收尾（两端通用）：关弹窗、清定时器、渲染进度、提示继续 */
UIController.prototype._rbFinishMigration = function() {
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    this.raceBattleRenderProgress();
    this.raceBattleToast('房主已转移为 ' + this._rbMigrationNewHostName + '，对局继续');
    // 新房主侧：若已有玩家全部完成 → 触发结算检查
    if (this._rbIsHost) this._rbCheckResult();
};

/** 房主闪断重连成功：取消迁移直接继续 */
UIController.prototype._rbCancelMigration = function() {
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    this.raceBattleToast('房主连接已恢复，对局继续');
};

/** 迁移超时兜底：新房主侧强制广播继续；访客侧回落对局中断 */
UIController.prototype._rbAbortMigration = function(reason) {
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    if (this._rbIsHost) {
        // 部分成员未在窗口内回传：保留其迁移前最后快照，直接广播迁移完成继续对局
        this._rbMigrationDone = false;
        this._rbBroadcastMigrationDone();
        return;
    }
    const me = this._rbProgress[this._rbMyId];
    if (me && me.finished) {
        this._raceBattleHandleHostLost('self_finished'); // 成绩已直连上报，不白打
    } else {
        this._raceBattleHandleHostLost('reconnect_failed');
    }
};

/** 清理迁移定时器 */
UIController.prototype._rbClearMigrationTimers = function() {
    if (this._rbMigrationTimer) { clearTimeout(this._rbMigrationTimer); this._rbMigrationTimer = null; }
    if (this._rbMigrationAbortTimer) { clearTimeout(this._rbMigrationAbortTimer); this._rbMigrationAbortTimer = null; }
    if (this._rbMigrationSyncTimer) { clearTimeout(this._rbMigrationSyncTimer); this._rbMigrationSyncTimer = null; }
    if (this._rbMigrationAbortBtnTimer) { clearTimeout(this._rbMigrationAbortBtnTimer); this._rbMigrationAbortBtnTimer = null; } // U7: 10s 放弃按钮计时器
    if (this._rbMigrationQueryTimer) { clearTimeout(this._rbMigrationQueryTimer); this._rbMigrationQueryTimer = null; }
};

/** 迁移弹窗开关（遮罩拦截点击，关闭按钮由 10s 后出现的「放弃对局」承担，迁移完成/兜底两条路径关闭） */
UIController.prototype.raceBattleShowMigrationModal = function(show, statusText) {
    this._ensureRaceBattleFields();
    const modal = this.raceBattleMigrationModal;
    if (!modal) return;
    const wasHidden = modal.style.display !== 'flex';
    modal.style.display = show ? 'flex' : 'none';
    const abortBtn = this.raceBattleMigrationAbortBtn;
    if (!show) {
        // 关闭弹窗：清除 10s 放弃按钮计时器并隐藏按钮
        if (this._rbMigrationAbortBtnTimer) { clearTimeout(this._rbMigrationAbortBtnTimer); this._rbMigrationAbortBtnTimer = null; }
        if (abortBtn) abortBtn.style.display = 'none';
    } else if (wasHidden && abortBtn) {
        // 首次显示：重置 10s 计时（后续状态文字更新不重置，保证从打开起算）
        if (this._rbMigrationAbortBtnTimer) clearTimeout(this._rbMigrationAbortBtnTimer);
        abortBtn.style.display = 'none';
        this._rbMigrationAbortBtnTimer = setTimeout(() => {
            this._rbMigrationAbortBtnTimer = null;
            // 弹窗仍打开时再显示，否则忽略
            if (modal.style.display === 'flex') abortBtn.style.display = 'inline-block';
        }, 10000);
    }
    if (show && statusText && this.raceBattleMigrationStatus) {
        this.raceBattleMigrationStatus.textContent = statusText;
    }
    if (show && window.audioManager) { try { window.audioManager.playRaceAlert(); } catch (e) {} }
};

/** U7: 玩家主动放弃迁移——关闭迁移弹窗并回落对局中断（已通关则保留成绩） */
UIController.prototype.raceBattleAbortMigration = function() {
    this._ensureRaceBattleFields();
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    // 若已成功接管成为新房主（弹窗状态"已接管房间"）：走原 timeout 兜底逻辑——
    // 广播 migration_done 继续对局，避免误把本可继续的对局中断
    if (this._rbIsHost) { this._rbAbortMigration('user_abort'); return; }
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    const me = this._rbProgress[this._rbMyId];
    if (me && me.finished) {
        this._raceBattleHandleHostLost('self_finished'); // 成绩已直连上报，不白打
    } else {
        this._raceBattleHandleHostLost('user_abort');
    }
};

// ─── DOM 事件绑定（在 UICore 初始化时调用一次）─────────────────

UIController.prototype.initRaceBattleUI = function() {
    this._ensureRaceBattleFields();
    // 2026-08-11 统一补齐点击音效：所有按钮先播 playClick 再执行行为
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            fn();
        });
    };
    // 2026-08-12 修复重复音效：mode-race-battle 已有 UICore 绑定的 selectMode('race')
    // （selectMode 内部已播放 playClick），此处不再重复绑定
    bind('race-battle-copy-btn', () => this.raceBattleCopyCode());
    bind('race-battle-tab-create', () => this.raceBattleSwitchTab('create'));
    bind('race-battle-tab-join', () => this.raceBattleSwitchTab('join'));
    bind('race-battle-stamina-minus', () => this.raceBattleStepStamina(-1));
    bind('race-battle-stamina-plus', () => this.raceBattleStepStamina(1));
    bind('race-battle-difficulty-minus', () => this.raceBattleStepDifficulty(-1));
    bind('race-battle-difficulty-plus', () => this.raceBattleStepDifficulty(1));
    bind('race-battle-create-btn', () => this.raceBattleCreateRoom());
    bind('race-battle-delete-btn', () => this.raceBattleDeleteRoom());
    bind('race-migration-abort-btn', () => this.raceBattleAbortMigration());
    bind('race-battle-join-btn', () => {
        if (this._rbJoinBtnMode === 'leave') {
            this.raceBattleConfirmLeave();
        } else {
            this.raceBattleJoinRoom();
        }
    });
    bind('race-battle-start-btn', () => this.raceBattleStart());
    bind('race-battle-exit-confirm-btn', () => this.raceBattleDoLeave());
    bind('race-battle-exit-cancel-btn', () => this.raceBattleCancelLeave());
    bind('race-battle-panel-exit', () => this.raceBattleConfirmLeave());
    bind('race-battle-panel-collapse', () => {
        const panel = this.raceBattlePanel;
        const collapsed = panel.classList.toggle('is-collapsed');
        if (this.raceBattlePanelCollapse) this.raceBattlePanelCollapse.textContent = collapsed ? '▸' : '▾';
    });
    bind('race-battle-finish-exit-btn', () => this.raceBattleDoEarlySettle());
    bind('race-battle-finish-watch-btn', () => this.raceBattleDoKeepWatching());
    bind('race-battle-rematch-btn', () => this.raceBattleRematch());
    bind('race-battle-back-btn', () => this.raceBattleBackToMenu());
    bind('race-battle-tab-lobby', () => this.raceBattleSwitchTab('lobby'));
    bind('race-lobby-create-btn', () => this._createRaceLobbyRoom());
    bind('race-lobby-delete-btn', () => this._deleteRaceLobbyRoom());
    bind('race-battle-home-btn', () => this.raceBattleBackToMenu());

    const joinInput = document.getElementById('race-battle-join-input');
    if (joinInput) {
        joinInput.addEventListener('input', () => {
            joinInput.value = joinInput.value.replace(/[^0-9]/g, '');
        });
        joinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (window.audioManager) window.audioManager.playClick();
                if (this._rbJoinBtnMode === 'leave') {
                    this.raceBattleConfirmLeave();
                } else {
                    this.raceBattleJoinRoom();
                }
            }
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 对局核心逻辑（ui-logic）
// ═══════════════════════════════════════════════════════════════

/** 基于统一时间戳的 3-2-1 起跑倒计时（全员同一 goAt） */
UIController.prototype.raceBattleShowCountdownAt = function(goAt, onGo) {
    this._ensureRaceBattleFields();
    this._rbGoAt = goAt;
    this.raceBattleShowOverlay();
    const card = this.raceBattleOverlayCard;
    let lastShown = -1;
    const tick = () => {
        const remain = goAt - Date.now();
        if (remain <= 0) {
            card.className = 'race-battle-overlay-card is-count is-go';
            card.textContent = 'GO!';
            if (lastShown !== 0) {
                lastShown = 0;
                if (window.audioManager) {
                    try { window.audioManager.playRaceLaunch(); } catch (e) {}
                }
            }
            this._rbCountdownTimer = setTimeout(() => {
                this.raceBattleHideOverlay();
                if (onGo) onGo();
            }, 450);
            return;
        }
        const secs = Math.ceil(remain / 1000);
        card.className = 'race-battle-overlay-card is-count';
        card.textContent = String(secs);
        if (secs !== lastShown) {
            lastShown = secs;
            if (window.audioManager) {
                try { window.audioManager.playRaceCountdown(); } catch (e) {}
            }
        }
        this._rbCountdownTimer = setTimeout(tick, 50);
    };
    tick();
};

/** GO 后开始跑：播种第一关 + 统一计时 */
UIController.prototype._raceBattleBeginPlay = function(params) {
    this.raceIsMultiplayer = true;   // 屏蔽单人竞速榜与最佳记录
    // 2026-08-11 需求：开局后恢复按钮显示
    if (this.raceBattleStartBtn) this.raceBattleStartBtn.style.display = '';
    this._rbSeeds = params.seeds || [];
    this._rbTotalLevels = params.levels || 3;
    this._rbStartLevel = params.startLevel || 1;
    this._rbGoAt = params.goAt || Date.now();
    this._rbLevelIndex = 0;
    this._rbPuzzleSolved = 0;
    this._rbMyTimes = [];
    this._rbMyElapsed = 0;
    this._rbFinished = false;
    this._rbFinishTime = 0;
    this._startRaceBattleElapsedTimer();
    this._rbLoadLevel(0);
};

UIController.prototype._rbLoadLevel = function(idx) {
    const gc = this.gameController;
    this._rbLevelIndex = idx;
    // 2026-08-11 修复：换关前清理旧 overlay 定时器，防止上一关的起跑倒计时/特性卡定时器
    // 在新关特性卡播放期间误触发 hideOverlay，导致特性卡 overlay 残留挡住输入
    if (this._rbFeatureTimer) { clearTimeout(this._rbFeatureTimer); this._rbFeatureTimer = null; }
    if (this._rbCountdownTimer) { clearTimeout(this._rbCountdownTimer); this._rbCountdownTimer = null; }
    const lv = this._rbStartLevel + idx;
    const seed = this._rbSeeds[idx];
    this._rbPuzzleSolved = 0;
    if (gc) {
        gc.initRace(lv, { roundSeed: seed, isMultiplayer: true });
        // 统一计时基准：全员以 goAt 为起点
        if (gc.raceState) {
            gc.raceState.startedAt = this._rbGoAt;
            gc.raceState.countdownPending = false;
        }
        // 重置输入态：换关后输入区清空（多人分支 raceLevelLoaded 也会清，此处防御性确保）
        if (typeof this.clearExpression === 'function') {
            try { this.clearExpression(); } catch (e) {}
        }
    }
    // 进度面板：本端已进入新关卡
    this._rbUpdateSelfProgress();
    this._rbBroadcastProgress();
};

/** 关卡特性卡（第一关用 3-2-1 起跑，后续每关前插播） */
UIController.prototype._rbShowLevelFeature = function(levelId, raceLevel) {
    const chips = [];
    if (raceLevel) {
        if (raceLevel.targetCells) chips.push({ type: 'goal', text: '目标格 ' + raceLevel.targetCells.length + ' 个' });
        if (raceLevel.forbiddenCells) chips.push({ type: 'forbidden', text: '禁格 ' + raceLevel.forbiddenCells.length + ' 个' });
        if (raceLevel.lockedElements && raceLevel.lockedElements.length) chips.push({ type: 'lock', text: '锁定 ' + raceLevel.lockedElements.length + ' 类元素' });
    }
    if (raceLevel && raceLevel.disabledSymbols && raceLevel.disabledSymbols.length) {
        chips.push({ type: 'symbol', text: '禁用符号：' + raceLevel.disabledSymbols.join(' / ') });
    }
    this.raceBattleShowFeatureCard({ title: '第 ' + levelId + ' 关', chips: chips });
};

// ─── GameController 事件接入（由 UICore 事件流在多人分支调用）───

UIController.prototype._rbOnGameInit = function(data) {
    this._lastRaceLevel = data.raceLevel || null;
    this._rbUpdateSelfProgress();
    this._rbBroadcastProgress();
    if (this._rbLevelIndex > 0) {
        this._rbShowLevelFeature(data.levelId || (this._rbStartLevel + this._rbLevelIndex), this._lastRaceLevel);
    }
};

UIController.prototype._rbOnPuzzleCleared = function(data) {
    try {
        this._rbPuzzleSolved = data.solvedCount != null ? data.solvedCount : (this._rbPuzzleSolved + 1);
        this._rbUpdateSelfProgress();
        this._rbBroadcastProgress();
    } catch (e) { console.error('[RB] onPuzzleCleared 错误:', e); }
};

UIController.prototype._rbOnLevelResult = function(data) {
    const elapsed = data.elapsed != null
        ? data.elapsed
        : (this.gameController && this.gameController.getRaceElapsedSeconds ? this.gameController.getRaceElapsedSeconds() : 0);
    const lvIdx = this._rbLevelIndex;
    this._rbMyTimes[lvIdx] = elapsed;
    this._rbMyElapsed = elapsed;
    this._rbUpdateSelfProgress();
    this._rbBroadcastLevelDone(lvIdx + 1, elapsed);
    // 2026-08-12 修复重复音效：成功音只在"非最后一关"播（换关）；最后一关由 _rbCompleteRace 播 raceFinish，避免两下
    if (lvIdx + 1 < this._rbTotalLevels) {
        if (window.audioManager) { try { window.audioManager.playSuccess(); } catch (e) {} }
        this.raceBattleToast('通过第 ' + (lvIdx + 1) + ' 关，目前 ' + (lvIdx + 1) + '/' + this._rbTotalLevels + ' 关');
    }
    if (lvIdx + 1 < this._rbTotalLevels) {
        this._rbLoadLevel(lvIdx + 1);
    } else {
        this._rbCompleteRace(elapsed);
    }
};

UIController.prototype._rbCompleteRace = function(elapsed) {
    this._rbFinished = true;
    this._rbFinishTime = elapsed;
    this._rbUpdateSelfProgress();
    // 2026-08-11 需求：第一名（全场第一个完成）直接进入结算并直连服务器上报，
    // 不再显示"退出结算 / 继续观战"选择；其余玩家完成后仍保留选择条自行决定。
    if (this._rbIsFirstFinisher()) {
        this.raceBattleDoEarlySettle();
    } else {
        // 2026-08-12 修复重复音效：完成庆祝音只在非第一名分支播
        //（第一名走 raceBattleDoEarlySettle → raceBattleShowResult 播 fanfare，避免两下）
        if (window.audioManager) { try { window.audioManager.playRaceFinish(); } catch (e) {} }
        this.raceBattleShowFinishChoice(true);
    }
    if (this._rbRoom) this._rbRoom.send({ type: 'race_battle_finish', elapsed: elapsed }, false);
    if (this._rbIsHost) this._rbCheckResult();
};

/** 判断本端是否全场第一个完成（第一名）：进度表中除自己外无任何已完赛成员 */
UIController.prototype._rbIsFirstFinisher = function() {
    if (!this._rbProgress || !this._rbMyId) return false;
    return !Object.keys(this._rbProgress)
        .some((id) => id !== this._rbMyId && this._rbProgress[id] && this._rbProgress[id].finished);
};

// ─── 完成后选择：退出结算 / 继续观战（2026-08-11 新增） ───────────────────

UIController.prototype.raceBattleShowFinishChoice = function(show) {
    this._ensureRaceBattleFields();
    const d = show ? '' : 'none';
    if (this.raceBattleFinishExitBtn) this.raceBattleFinishExitBtn.style.display = d;
    if (this.raceBattleFinishWatchBtn) this.raceBattleFinishWatchBtn.style.display = d;
    // 选择条出现时隐藏原"退出"按钮，避免与"退出结算"混淆
    if (this.raceBattlePanelExitBtn) this.raceBattlePanelExitBtn.style.display = show ? 'none' : '';
};

/** 退出结算：第一名完成全部关卡后立即进入等级结算（本端立即查看排名） */
UIController.prototype.raceBattleDoEarlySettle = function() {
    this._ensureRaceBattleFields();
    this.raceBattleShowFinishChoice(false);
    // 本地构建并展示当前进度下的结算，排位局本端立即上报自己的名次拿到积分，
    // 避免弹窗一直停在"积分结算中…"（服务端按 roomKey+playerId 去重，房主后续广播重复上报不会重复计分）。
    // 权威结算仍由房主在全员完成后广播，_rbHandleResultMsg 会刷新本端弹窗（含最终 ELO）。
    const result = this._rbBuildResult();
    this.raceBattleShowResult(this._raceBattleResultView(result));
    this._rbSubmitSelfScore(result);
};

/** 继续观战：隐藏选择条，回到等待其他玩家完成的状态 */
UIController.prototype.raceBattleDoKeepWatching = function() {
    this._ensureRaceBattleFields();
    this.raceBattleShowFinishChoice(false);
    this.raceBattleToast('继续等待其他玩家完成…');
};

// ─── 进度维护与广播 ─────────────────────────────────────────────

UIController.prototype._rbUpdateSelfProgress = function() {
    const id = this._rbMyId;
    if (!id) return;
    this._rbProgress[id] = {
        level: this._rbLevelIndex + 1,
        puzzle: this._rbFinished ? 10 : this._rbPuzzleSolved,
        times: (this._rbMyTimes || []).slice(),
        finished: this._rbFinished,
        finishTime: this._rbFinishTime,
        disconnected: false,
        nickname: (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家'
    };
    // 防御：进度渲染/上下文持久化异常不应打断提交与换关链路
    try { this.raceBattleRenderProgress(); } catch (e) { console.error('[RB] renderProgress 错误:', e); }
    try { this._rbSaveResumeContext(); } catch (e) { console.error('[RB] saveResume 错误:', e); }
};

UIController.prototype._rbBroadcastProgress = function() {
    // 防御：_rbRoom 可能已置空（断线/解散清理），send 失败仅静默，绝不触发断线流程
    if (!this._rbRoom || !this._rbProgress || !this._rbProgress[this._rbMyId]) return;
    const p = this._rbProgress[this._rbMyId];
    try {
        this._rbRoom.send({
            type: 'race_battle_progress',
            level: p.level, puzzle: p.puzzle,
            times: p.times, elapsed: this._rbMyElapsed,
            finished: p.finished, disconnected: p.disconnected
        }, false);
    } catch (e) { /* 忽略：断线时进度广播失败不应抛异常打断提交链 */ }
};

UIController.prototype._rbBroadcastLevelDone = function(level, elapsed) {
    if (!this._rbRoom) return;
    try { this._rbRoom.send({ type: 'race_battle_level_done', level: level, elapsed: elapsed }, false); } catch (e) { /* 忽略 */ }
};

/** 处理远端进度消息 */
UIController.prototype._rbHandleProgressMsg = function(payload, fromPlayerId) {
    const p = this._rbProgress[fromPlayerId] || (this._rbProgress[fromPlayerId] = {});
    if (payload.level != null) p.level = payload.level;
    if (payload.puzzle != null) p.puzzle = payload.puzzle;
    if (payload.times) p.times = payload.times.slice();
    if (payload.elapsed != null) p.elapsed = payload.elapsed;
    if (payload.finished != null) p.finished = payload.finished;
    if (payload.disconnected != null) p.disconnected = payload.disconnected;
    const member = this._rbMembers.find((m) => m.playerId === fromPlayerId);
    if (member) p.nickname = member.nickname;
    this.raceBattleRenderProgress();
};

UIController.prototype._rbHandleLevelDoneMsg = function(payload, fromPlayerId) {
    const p = this._rbProgress[fromPlayerId] || (this._rbProgress[fromPlayerId] = {});
    const idx = (payload.level | 0) - 1;
    if (idx >= 0) {
        p.times = p.times || [];
        p.times[idx] = payload.elapsed;
    }
    const member = this._rbMembers.find((m) => m.playerId === fromPlayerId);
    if (member) p.nickname = member.nickname;
    this.raceBattleRenderProgress();
};

// ─── 结算（房主权威判定 + 全员展示） ────────────────────────────

UIController.prototype._rbCheckResult = function() {
    if (!this._rbIsHost) return;
    // 掉线/弃权者不再阻塞结算：仅需所有"在线活跃"成员完成即结算，掉线者自动垫底
    const alive = this._rbMembers
        .filter((m) => {
            const p = this._rbProgress[m.playerId];
            return !(p && (p.disconnected || p.abandoned));
        })
        .map((m) => m.playerId);
    // 2026-08-12 需求：n-1 名在线玩家已完成 → 剩余 1 名必为最后一名，直接结算，无需再等
    const done = alive.filter((id) => this._rbProgress[id] && this._rbProgress[id].finished).length;
    if (alive.length - done > 1) return;
    this._rbBuildAndBroadcastResult();
};

UIController.prototype._rbBuildAndBroadcastResult = function() {
    const result = this._rbBuildResult();
    // 房主：先展示本地结算，再上报自己的积分
    this.raceBattleShowResult(this._raceBattleResultView(result));
    this._rbSubmitSelfScore(result);
    if (this._rbRoom) this._rbRoom.send(result, true);
    return result;
};

// 纯构建结算数据（不展示/不上报/不广播）：供"退出结算"提前查看与房主广播复用
UIController.prototype._rbBuildResult = function() {
    // 全员（含对局中掉线弃权者）都纳入结算，保证 totalPlayers 与判负准确
    const ids = Object.keys(this._rbProgress);
    if (ids.indexOf(this._rbMyId) === -1) ids.push(this._rbMyId);
    const entries = ids.map((id) => {
        const p = this._rbProgress[id] || {};
        const member = this._rbMembers.find((m) => m.playerId === id);
        return {
            id: id,
            name: (member && member.nickname) || (p.nickname) || '玩家',
            finished: !!p.finished,
            finishTime: p.finishTime || 0,
            level: p.level || 1,
            puzzle: p.puzzle || 0,
            abandoned: !!(p.abandoned || p.disconnected),
            isMe: id === this._rbMyId
        };
    });
    entries.sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.finishTime - b.finishTime;
        // 未完成者：弃权者垫底，其余按已解进度排序
        if (a.abandoned !== b.abandoned) return a.abandoned ? 1 : -1;
        const pa = a.level * 10 + a.puzzle, pb = b.level * 10 + b.puzzle;
        return pb - pa;
    });
    const list = entries.map((e, i) => ({
        rank: i + 1, id: e.id, name: e.name, time: e.finished ? e.finishTime : null,
        delta: null, isMe: e.isMe, abandoned: e.abandoned
    }));
    const myRank = entries.findIndex((e) => e.isMe) + 1;
    return {
        type: 'race_battle_result',
        ranked: !!this._rbRanked,
        list: list,
        myRank: myRank,
        myId: this._rbMyId
    };
};

/** 生成结算弹窗视图数据 */
UIController.prototype._raceBattleResultView = function(result) {
    return {
        ranked: result.ranked,
        list: result.list,
        myRank: result.myRank,
        myEloDelta: (this._rbMyScoreResult && this._rbMyScoreResult.delta) || null,
        myRankTitle: (this._rbMyScoreResult && this._rbMyScoreResult.tier) || '',
        myRankAfter: (this._rbMyScoreResult && this._rbMyScoreResult.score) || 0,
        myRankTotal: this._raceBattleRankTotal()
    };
};

/** 竞速段位图标：按段位名返回 10 级天体段位徽章的内联 HTML（tier-0~9 对应流星体~宇宙） */
UIController.prototype._raceTierIconHtml = function(tierName) {
    // SVG 描边小星球 + 轨道环（10 级天体段位，段位越高轨道环越多、天体规模越大）
    const names = ['流星体', '小行星', '矮行星', '行星', '恒星', '星团', '星系', '星系团', '超星系团', '宇宙'];
    const idx = names.indexOf(String(tierName || ''));
    const T = [
        { c: '#94a3b8', d: '#64748b', n: 0, ray: false, glow: false }, // 流星体
        { c: '#22d3ee', d: '#0891b2', n: 1, ray: false, glow: false }, // 小行星
        { c: '#a78bfa', d: '#7c3aed', n: 1, ray: false, glow: false }, // 矮行星
        { c: '#f59e0b', d: '#d97706', n: 1, ray: false, glow: false }, // 行星
        { c: '#f87171', d: '#ef4444', n: 1, ray: true,  glow: false }, // 恒星
        { c: '#ec4899', d: '#db2777', n: 2, ray: false, glow: false }, // 星团
        { c: '#818cf8', d: '#4f46e5', n: 2, ray: false, glow: false }, // 星系
        { c: '#34d399', d: '#059669', n: 3, ray: false, glow: false }, // 星系团
        { c: '#e2e8f0', d: '#94a3b8', n: 3, ray: false, glow: false }, // 超星系团
        { c: '#fbbf24', d: '#f59e0b', n: 4, ray: false, glow: true  }, // 宇宙
    ];
    const t = T[idx >= 0 ? idx : 0];
    const ringStroke = ['rgba(255,255,255,.55)', 'rgba(255,255,255,.4)', 'rgba(255,255,255,.3)', 'rgba(255,255,255,.24)'];
    let parts = '';
    // 轨道环：描边椭圆，不同倾斜角度交错，环越多代表天体规模越大
    for (let i = 0; i < t.n; i++) {
        const rx = 7 + i * 1.1;
        const ry = 2.4 + i * 0.4;
        const rot = (i % 2 === 0 ? -20 : 20) + i * 4;
        parts += '<ellipse cx="12" cy="12" rx="' + rx.toFixed(2) + '" ry="' + ry.toFixed(2) + '" fill="none" stroke="' + ringStroke[i] + '" stroke-width="0.9" transform="rotate(' + rot + ' 12 12)"/>';
    }
    // 宇宙：外圈金色光晕环
    if (t.glow) parts += '<circle cx="12" cy="12" r="6.6" fill="none" stroke="rgba(251,191,36,.55)" stroke-width="1.6"/>';
    // 恒星：四向放射光芒
    if (t.ray) {
        parts += '<g stroke="rgba(248,113,113,.7)" stroke-width="1" stroke-linecap="round">' +
            '<line x1="12" y1="4.2" x2="12" y2="7.4"/><line x1="12" y1="16.6" x2="12" y2="19.8"/>' +
            '<line x1="4.2" y1="12" x2="7.4" y2="12"/><line x1="16.6" y1="12" x2="19.8" y2="12"/></g>';
    }
    // 中心星球：主色填充 + 深色描边 + 左上高光
    parts += '<circle cx="12" cy="12" r="5.2" fill="' + t.c + '" stroke="' + t.d + '" stroke-width="1.3"/>';
    parts += '<circle cx="9.9" cy="9.6" r="1.5" fill="rgba(255,255,255,.6)"/>';
    return '<svg class="rb-tier-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' + parts + '</svg>';
};

/** 进度条分母：当前分数所在段位的下一档阈值（对齐服务端 RACE_TIERS 10 级天体 0/300/600/900/1200/1500/1800/2100/2400/2700） */
UIController.prototype._raceBattleRankTotal = function() {
    const score = (this._rbMyScoreResult && this._rbMyScoreResult.score) || 0;
    const thresholds = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];
    let total = 2700;
    for (let i = 0; i < thresholds.length; i++) {
        if (score < thresholds[i]) { total = thresholds[i]; break; }
    }
    return total;
};

/** 上报自己的竞速积分（仅排位局）。res: {ok, code, score, delta, tier, games, wins} */
UIController.prototype._rbSubmitSelfScore = function(result) {
    if (!result.ranked) return;
    // 优先按自身 playerId 查找（房主构建的 list 中 isMe 按房主视角计算，
    // 访客必须用自身 id 才能找到自己的名次，否则 n-1 结算时找不到 → 卡"积分结算中…"）
    const rank = result.list.find((item) => item.id && item.id === this._rbMyId) ||
                 result.list.find((item) => item.isMe);
    if (!rank) return;
    const roomCode = this.raceBattleRoomCode.textContent;
    if (!this._leaderboardService || !this._leaderboardService.submitRaceScore) return;
    this._leaderboardService.submitRaceScore({
        roomCode: roomCode,
        place: rank.rank,
        totalPlayers: result.list.length,
        nickname: rank.name,
        difficulty: this._rbDifficulty,
        stamina: this._rbStamina,
        abandoned: !!rank.abandoned
    }).then((res) => {
        if (res && res.ok) {
            this._rbMyScoreResult = {
                delta: res.delta, tier: res.tier,
                score: res.score, games: res.games, wins: res.wins
            };
            this.raceBattleUpdateSelfResult();
        }
    }).catch(() => {});
};

/** 上报返回后刷新结算弹窗的段位动画 */
UIController.prototype.raceBattleUpdateSelfResult = function() {
    if (!this._rbReady || !this._rbMyScoreResult) return;
    const r = this._rbMyScoreResult;
    const self = this.raceBattleResultSelf;
    self.innerHTML = '';
    const rankline = document.createElement('div');
    rankline.className = 'rb-result-rankline';
    rankline.innerHTML = '我的段位：' + this._raceTierIconHtml(r.tier) + ' ' + this._escapeHtml(r.tier || '');
    self.appendChild(rankline);
    const eloline = document.createElement('div');
    eloline.className = 'rb-result-eloline';
    const delta = r.delta || 0;
    eloline.innerHTML = '竞速积分：<span class="rb-result-elo' + (delta < 0 ? ' neg' : '') + '">' + (delta > 0 ? '+' : '') + delta + '</span>';
    self.appendChild(eloline);
    const barWrap = document.createElement('div');
    barWrap.className = 'rb-result-rankbar-wrap';
    const bar = document.createElement('div');
    bar.className = 'rb-result-rankbar';
    const pct = Math.max(4, Math.min(100, (r.score / this._raceBattleRankTotal()) * 100));
    bar.style.setProperty('--rb-bar-w', pct + '%');
    barWrap.appendChild(bar);
    self.appendChild(barWrap);
};

/** 访客端收到结算广播 */
UIController.prototype._rbHandleResultMsg = function(result) {
    this.raceBattleShowResult(this._raceBattleResultView(result));
    this._rbSubmitSelfScore(result);
};

// ─── 断线处理（对局中） ─────────────────────────────────────────

/** 成员连接状态变化（对局中：进度面板标等待重连） */
UIController.prototype._rbHandleMemberState = function(member) {
    if (this._rbMatchStarted && this._rbProgress[member.playerId]) {
        this._rbProgress[member.playerId].disconnected = member.connected === false;
        this.raceBattleRenderProgress();
        this.raceBattleToast(member.nickname + (member.connected === false ? ' 连接中断，等待重连…' : ' 已恢复连接'));
        // 迁移期间新房主：对重连成功的成员请求进度，便于提前完成迁移
        if (this._rbMigrationActive && !this._rbMigrationDone && this._rbIsHost && member.connected) {
            this._rbRequestProgress();
        }
    }
    // 迁移已完成的新房主：刚重连上来的访客（晚连者）缺 migration_done → 重发兜底
    // 放在外层：晚连访客可能没有 _rbProgress 条目（新会话），但仍需收到 migration_done 才能继续
    if (this._rbIsHost && this._rbMigrationDone && member.connected) {
        this._rbResendMigrationDone();
    }
};

/** 对局中成员被移除（60s 未重连，房主端）→ 弃权结算检查 */
UIController.prototype._rbHandleMemberLeftInMatch = function(member) {
    if (!this._rbMatchStarted) return;
    if (this._rbIsHost) {
        const p = this._rbProgress[member.playerId] || (this._rbProgress[member.playerId] = {});
        p.disconnected = true;
        if (!p.finished) { p.level = p.level || 1; p.puzzle = p.puzzle || 0; }
        this._rbCheckResult();
    }
};

/** 重连成功：恢复消息通道后重发最新进度；迁移期间判断连回原房主（闪断恢复）还是新房主 */
UIController.prototype._rbHandleReconnected = function() {
    this._rbBroadcastProgress();
    this.raceBattleToast('已重新连接');
    if (this._rbMigrationActive && !this._rbMigrationDone) {
        if (this._rbIsOldHostBack()) {
            this._rbCancelMigration(); // 原房主只是闪断，已恢复 → 取消迁移继续对局
        } else {
            this._rbSendMigrationSync(); // 已连上新房主 → 回传本人进度快照
        }
    }
};

/** 判断当前连接的房间宿主是否为原房主（racehost_<房间码>），用于区分闪断恢复与新房主接管 */
UIController.prototype._rbIsOldHostBack = function() {
    if (!this._rbRoom || !this._rbRoom.roomCode) return false;
    const hostMember = this._rbMembers.find(m => m.isHost);
    return !!(hostMember && hostMember.playerId === 'racehost_' + this._rbRoom.roomCode);
};

// ═══════════════ 匹配大厅（竞速房大厅列表）════════════════════════

/** 确保 MatchLobbyController 存在并绑定回调（竞速房按排位/休闲子模式过滤） */
UIController.prototype._ensureRaceLobby = function() {
    if (this._rbLobby) {
        // 实例复用时也同步当前排位/休闲子模式（用户可能在排位/休闲间切换）
        this._rbLobby.currentLobbyMode = this._rbRanked ? 'race_ranked' : 'race_casual';
        return this._rbLobby;
    }
    const lobby = new MatchLobbyController({
        onConnectionChange: (connected) => {
            this._rbLobbyConnected = connected;
            if (connected) {
                this._raceLobbySetStatus('connected', '已连接大厅');
                // 处理挂起的大厅登记请求（WS 刚连上时补发）
                if (this._rbPendingLobbyHost) {
                    const pending = this._rbPendingLobbyHost;
                    this._rbPendingLobbyHost = null;
                    pending.lobby.hostRegister(pending.opts);
                }
            } else {
                this._raceLobbySetStatus('idle', '未连接');
            }
        },
        onRoomsUpdate: (rooms) => {
            this._rbLobbyRooms = Array.isArray(rooms) ? rooms.filter((r) => r && r.isRace) : [];
            this._renderRaceLobbyRooms();
        },
        onHostRegistered: (code, expiresAt) => {
            this._rbLobbyOpen = true;
            this._rbLobbyExpiresAt = Number(expiresAt) || 0;
            this._rbLobbyUpdateTtl();
            this._rbStartLobbyTtlTimer();
            // 常驻顶部胶囊：[房间号] 等待玩家加入 剩余时间（对齐联机对战）
            if (typeof this._showHostRoomBanner === 'function') this._showHostRoomBanner(code, this._rbLobbyExpiresAt);
            if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
            if (this.raceBattleRoomCode) this.raceBattleRoomCode.textContent = code;
            const disp = document.getElementById('race-battle-room-code-display');
            if (disp) disp.style.display = '';
            this._renderRaceLobbyRooms();
        },
        onGuestJoining: (code, info) => {
            if (info && info.nickname) {
                this._raceLobbySetStatus('connected', `${info.nickname} 加入房间（${info.currentPlayers}/${info.maxPlayers}）`);
            }
        },
        onGuestLeft: (code, info) => {
            if (info && info.nickname) this._raceLobbySetStatus('connected', `${info.nickname} 离开房间`);
        },
        onJoinAccepted: (code) => {
            // 竞速房先到先得：服务器已放行 → 走常规加入流程建立 PeerJS 连接
            this._raceLobbySetStatus('connected', '已获准加入，正在建立连接…');
            if (this.raceBattleJoinInput) this.raceBattleJoinInput.value = String(code);
            this.raceBattleJoinRoom(true); // skipLookup：大厅列表已确认是竞速房
        },
        onJoinRejected: (code, reason) => {
            this._raceLobbySetStatus('error', this._raceLobbyReasonText(reason));
            this._renderRaceLobbyRooms();
        },
        onHostRoomExpired: () => {
            this._rbLobbyOpen = false;
            this._rbLobbyExpiresAt = 0;
            this._rbKeepHostWaiting = false;
            this._rbStopLobbyTtlTimer();
            if (typeof this._stopHostRoomBanner === 'function') this._stopHostRoomBanner();
            if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
            this._raceLobbySetStatus('idle', '房间已到期，请重新创建');
            this._renderRaceLobbyRooms();
        }
    });
    // 竞速房区分排位/休闲子模式（race_ranked / race_casual），大厅列表按子模式精确过滤
    lobby.currentLobbyMode = this._rbRanked ? 'race_ranked' : 'race_casual';
    this._rbLobby = lobby;
    return lobby;
};

/** 打开大厅 tab：连接大厅并刷新房间列表 */
UIController.prototype._openRaceLobby = function() {
    this._ensureRaceBattleFields();
    const lobby = this._ensureRaceLobby();
    if (this._rbLobbyOpen) {
        if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
        if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
    }
    if (!this._rbLobbyConnected) {
        this._raceLobbySetStatus('connecting', '连接大厅中…');
        lobby.connect();
    } else {
        lobby.fetchRooms();
    }
};

/** 关闭大厅：取消登记并断开连接 */
UIController.prototype._closeRaceLobby = function(keep) {
    if (!this._rbLobby) return;
    try {
        if (this._rbLobbyOpen) {
            if (keep) {
                // 保留房间：仅暂停列表刷新，WS 与大厅登记保持，返回主菜单后房间仍可加入
                this._rbLobby.pauseRefresh();
            } else {
                this._rbLobby.cancelHost(this._rbLobby.myRoomCode);
                this._rbLobby.disconnect();
            }
        } else if (!keep) {
            this._rbLobby.disconnect();
        }
    } catch (e) {}
    if (keep) return;
    this._rbLobby = null;
    this._rbLobbyConnected = false;
    this._rbLobbyOpen = false;
    this._rbLobbyExpiresAt = 0;
    this._rbLobbyRooms = [];
    this._rbStopLobbyTtlTimer();
    this._renderRaceLobbyRooms();
    if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    this._raceLobbySetStatus('idle', '未连接');
};

/** 房主是否处于"等待阶段"（未开局、无访客已连上）且已登记大厅 → 退出时保留房间；
 *  创建tab直建房（未登记大厅）不满足 → 退出即删除房间（对齐联机对战） */
UIController.prototype._rbShouldKeepHostWaiting = function() {
    return !!(this._rbRoom && this._rbRoomOpen && this._rbIsHost &&
        !this._rbMatchStarted && this._rbLobbyOpen &&
        (!this._rbMembers || this._rbMembers.length <= 1));
};

/** 刷新大厅房间 TTL 倒计时文案 */
UIController.prototype._rbLobbyUpdateTtl = function() {
    if (!this._rbLobbyOpen || !this._rbLobbyExpiresAt) return;
    const remain = Math.max(1, Math.ceil((this._rbLobbyExpiresAt - Date.now()) / 60000));
    this._raceLobbySetStatus('connected', '房间已创建，等待玩家加入 · 约 ' + remain + ' 分钟后到期');
};

UIController.prototype._rbStartLobbyTtlTimer = function() {
    this._rbStopLobbyTtlTimer();
    this._rbLobbyTtlTimer = setInterval(() => {
        if (!this._rbLobbyOpen || !this._rbLobbyExpiresAt) { this._rbStopLobbyTtlTimer(); return; }
        if (Date.now() >= this._rbLobbyExpiresAt) { this._rbStopLobbyTtlTimer(); return; }
        this._rbLobbyUpdateTtl();
    }, 15000);
};

UIController.prototype._rbStopLobbyTtlTimer = function() {
    if (this._rbLobbyTtlTimer) { clearInterval(this._rbLobbyTtlTimer); this._rbLobbyTtlTimer = null; }
};

/** 状态条（颜色用内联样式，不依赖外部 CSS 类） */
UIController.prototype._raceLobbySetStatus = function(kind, text) {
    if (!this.raceLobbyStatus) return;
    const txt = this.raceLobbyStatus.querySelector('.lobby-status-text');
    if (!txt) return;
    txt.textContent = text || '';
    const colors = { connected: '#2ecc71', connecting: '#f1c40f', error: '#e74c3c' };
    txt.style.color = colors[kind] || '';
};

/** 拒绝原因文案 */
UIController.prototype._raceLobbyReasonText = function(reason) {
    const map = {
        room_not_available: '房间不可用或已开局',
        room_expired: '房间已过期',
        room_full: '房间已满员',
        already_joined: '你已在该房间中',
        mode_mismatch: '模式不匹配',
        elo_range: '段位差距超出房间限制'
    };
    return map[reason] || ('加入失败：' + (reason || '未知原因'));
};

/** HTML 转义 */
UIController.prototype._rbEscapeHtml = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
};

/** 渲染大厅房间列表 */
UIController.prototype._renderRaceLobbyRooms = function() {
    const el = this.raceLobbyList;
    if (!el) return;
    const rooms = this._rbLobbyRooms || [];
    if (!this._rbLobbyConnected) {
        el.innerHTML = '<div class="lobby-empty">大厅未连接</div>';
        return;
    }
    if (!rooms.length) {
        el.innerHTML = '<div class="lobby-empty">暂无等待中的竞速房间<br>点击上方「创建房间（进大厅）」登记你的房间</div>';
        return;
    }
    const diffNames = ['简单', '普通', '困难', '极难', '地狱', '噩梦', '深渊'];
    const items = rooms.map((r) => {
        const opts = r.options || {};
        const st = opts.stamina || 1;
        const df = opts.difficulty || 1;
        const diffName = diffNames[df - 1] || ('Lv.' + df);
        const players = `${r.currentPlayers}/${r.maxPlayers}`;
        const host = this._rbEscapeHtml(r.hostNickname || '房主');
        // 竞速房子模式：race_ranked=排位 / race_casual=休闲（旧 race 视为休闲）
        const modeTag = (opts.mode === 'race_ranked')
            ? '<span class="lobby-room-mode lobby-room-mode-ranked">排位</span>'
            : '<span class="lobby-room-mode lobby-room-mode-casual">休闲</span>';
        return `<div class="lobby-room-row">
            <div class="lobby-room-info">
                <span class="lobby-room-code">${r.code}</span>
                <span class="lobby-room-desc">${modeTag}${players} 人 · 耐力 ${st} · ${diffName}</span>
                <span class="lobby-room-host">${host}</span>
            </div>
            <button class="btn btn-small lobby-join-btn" data-code="${r.code}">加入</button>
        </div>`;
    }).join('');
    el.innerHTML = items;
    el.querySelectorAll('.lobby-join-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            const code = btn.getAttribute('data-code');
            if (code) this._joinRaceLobbyRoom(code);
        });
    });
};

/** 房主：创建房间并登记进大厅 */
UIController.prototype._createRaceLobbyRoom = function() {
    this._ensureRaceBattleFields();
    if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
    var self = this;
    var doRegister = function(roomCode) {
        var lobby = self._ensureRaceLobby();
        var opts = {
            // 排位/休闲竞速房用不同子模式，大厅列表按子模式精确隔离
            mode: self._rbRanked ? 'race_ranked' : 'race_casual',
            maxPlayers: 4,
            roomCode: roomCode,
            longLived: !!(self.raceLobbyLongLivedToggle && self.raceLobbyLongLivedToggle.checked),
            stamina: self._rbStamina,
            difficulty: self._rbDifficulty
        };
        if (lobby.isConnected) {
            lobby.hostRegister(opts);
        } else {
            self._raceLobbySetStatus('connecting', '等待大厅连接…');
            self._rbPendingLobbyHost = { lobby: lobby, opts: opts };
            lobby.connect(); // 主动发起大厅 WS 连接，避免登记请求永久挂起
        }
    };
    var roomCode;
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) {
        this._raceLobbySetStatus('connecting', '已在房间中，正在登记大厅…');
        doRegister(this._rbRoom.roomCode);
    } else {
        this._rbCreateViaLobby = true;
        // 长效模式：房间码以 00 开头（对齐服务端 genRoomCode 的 00 前缀约定），30 分钟有效
        var longLived = !!(this.raceLobbyLongLivedToggle && this.raceLobbyLongLivedToggle.checked);
        roomCode = longLived
            ? '00' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
            : String(Math.floor(100000 + Math.random() * 900000));
        var ready = this.raceBattleCreateRoom(roomCode);
        if (ready && ready.then) {
            ready.then(function(ok) {
                if (ok) doRegister(roomCode);
            });
        }
    }
};

/** 房主：删除登记的房间（从大厅移除，并断开 PeerJS 房间、隐藏胶囊与底部按钮） */
UIController.prototype._deleteRaceLobbyRoom = function() {
    if (!this._rbLobby || !this._rbLobbyOpen) return;
    this._rbLobby.cancelHost(this._rbLobby.myRoomCode);
    this._rbLobbyOpen = false;
    this._rbLobbyExpiresAt = 0;
    this._rbKeepHostWaiting = false;
    this._rbStopLobbyTtlTimer();
    this._rbClearResumeContext(); // 删除房间即清理恢复上下文
    // 大厅建房时同时创建了 PeerJS 房间（_rbRoom），删除时一并断开
    if (this._rbRoom) {
        try {
            if (this._rbIsHost) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            this._rbRoom.disconnect();
        } catch (e) {}
        this._rbRoom = null;
    }
    this._rbRoomOpen = false;
    this._rbMatchStarted = false;
    this._rbMembers = [];
    this._rbReadyMap = {};
    this.raceIsMultiplayer = false;
    this._stopHostRoomBanner();      // 隐藏顶部等待时间胶囊
    this.raceBattleRenderMembers();  // 重渲染：_rbRoomOpen=false 驱动隐藏底部按钮
    this._raceBattleSwitchJoinButton('join');
    if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    // 恢复创建tab的创建/删除按钮与房间码展示
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = false;
    if (deleteBtn) deleteBtn.style.display = 'none';
    const codeDisplay = document.getElementById('race-battle-room-code-display');
    if (codeDisplay) codeDisplay.style.display = 'none';
    this._raceLobbySetStatus('idle', '已从大厅移除房间');
    this._renderRaceLobbyRooms();
};

/** 访客：从大厅列表加入房间 */
UIController.prototype._joinRaceLobbyRoom = function(code) {
    this._ensureRaceBattleFields();
    if (!this._rbLobby) return;
    this._raceLobbySetStatus('connecting', '正在申请加入…');
    this._rbLobby.joinRoom(code);
};

