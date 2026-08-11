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

    this.raceBattleOverlay = document.getElementById('race-battle-overlay');
    this.raceBattleOverlayCard = document.getElementById('race-battle-overlay-card');
    this.raceBattleToastEl = document.getElementById('race-battle-toast');

    this.raceBattleResultModal = document.getElementById('race-battle-result-modal');
    this.raceBattleResultTitle = document.getElementById('race-battle-result-title');
    this.raceBattleResultRanklist = document.getElementById('race-battle-result-ranklist');
    this.raceBattleResultSelf = document.getElementById('race-battle-result-self');
    this.raceBattleExitModal = document.getElementById('race-battle-exit-modal');

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
    this._rbKeepHostWaiting = false;  // 房主等待阶段退出时保留房间（对齐 P2P keepHostWaiting）
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
    this._rbProgress = {};
    this._rbRanks = null;
    this._rbGameParams = null;
};

// ─── 入口：打开/关闭房间弹窗 ────────────────────────────────────

UIController.prototype.openRaceBattleModal = function() {
    this._ensureRaceBattleFields();
    // 竞速联机：先选排位/休闲模式
    const sel = document.getElementById('p2p-mode-select-modal');
    if (sel) {
        sel._dismissBound = true;
        sel._onEscDismiss = function() { this.hideModal(sel); }.bind(this);
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

    // [DBG] 临时诊断：确认竞速弹窗是否被 start-modal 遮挡
    try {
        const sm = document.getElementById('start-modal');
        const rb = this.raceBattleModal;
        const r = rb.getBoundingClientRect();
        const cx = Math.round(r.x + r.width / 2);
        const cy = Math.round(r.y + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        console.log('[DBG-RB] 弹窗打开：', {
            rbZ: getComputedStyle(rb).zIndex,
            rbDisplay: getComputedStyle(rb).display,
            smZ: sm ? getComputedStyle(sm).zIndex : '?',
            smDisplay: sm ? getComputedStyle(sm).display : '?',
            hitId: hit ? (hit.id || ('<' + hit.tagName + '.' + String(hit.className).slice(0, 20) + '>')) : 'null',
            hitText: hit ? (hit.textContent || '').trim().slice(0, 16) : '',
            rect: Math.round(r.width) + 'x' + Math.round(r.height),
        });
    } catch (e) {
        console.log('[DBG-RB] 诊断出错', e);
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
    // 2026-08-11 需求：加入房间 tab 隐藏「等待玩家/开始竞速」按钮
    const startBtn = this.raceBattleStartBtn;
    if (this._rbTab === 'join') {
        if (startBtn) startBtn.style.display = 'none';
    } else {
        if (startBtn) startBtn.style.display = '';
    }
};

UIController.prototype._raceBattleSetStatus = function(kind, msg) {
    if (!this._rbReady) return;
    this.raceBattleStatusText.textContent = msg;
    this.raceBattleStatusDot.classList.remove('idle', 'connected', 'waiting', 'error', 'creating', 'joining', 'disconnected');
    if (kind === 'connected') this.raceBattleStatusDot.classList.add('connected');
    else if (kind === 'error') this.raceBattleStatusDot.classList.add('error');
    else if (kind === 'connecting') this.raceBattleStatusDot.classList.add('waiting');
    else this.raceBattleStatusDot.classList.add('idle');
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
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = '';
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) return;
    const code = optCode || String(Math.floor(100000 + Math.random() * 900000));
    const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';
    this.raceBattleRoomCode.textContent = code;
    this._raceBattleSetStatus('connecting', '正在创建房间…');
    this._rbIsHost = true;
    this._rbMyId = 'racehost_' + code;

    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    return room.createRoom({ roomCode: code, maxPlayers: 4, playerId: this._rbMyId, nickname }).then((ok) => {
        if (!ok) {
            if (createBtn) createBtn.disabled = false;
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
            this._raceBattleSetStatus('error', '房间创建失败，请检查网络后重试');
        }
        return ok;
    });
};

UIController.prototype.raceBattleJoinRoom = function() {
    this._ensureRaceBattleFields();
    const code = (this.raceBattleJoinInput.value || '').trim().replace(/[^0-9]/g, '');
    if (code.length !== 6) {
        this.raceBattleJoinError.textContent = '请输入 6 位数字房间码';
        return;
    }
    this.raceBattleJoinError.textContent = '';
    this.raceBattleRoomCode.textContent = code;
    this._raceBattleSetStatus('connecting', '正在连接房间…');
    this._rbIsHost = false;
    this._rbMyId = 'raceguest_' + Math.random().toString(36).substr(2, 9);
    const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';

    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    room.joinRoom({ roomCode: code, playerId: this._rbMyId, nickname }).then((ok) => {
        if (!ok) this._raceBattleSetStatus('error', '加入失败，请确认房间码后重试');
    });
};

// ─── 房间回调绑定 ────────────────────────────────────────────────

UIController.prototype._bindRaceBattleRoomCallbacks = function(room) {
    room.onStatusChange = (status, msg) => {
        if (status === 'connected') {
            this._rbRoomOpen = true;
            this._raceBattleSetStatus('connected', msg || '已连接');
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
            }
        } else if (status === 'error') {
            this._raceBattleSetStatus('error', msg || '连接错误');
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
        if (this.playUIButtonSound) this.playUIButtonSound();
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
        if (!this._rbMatchStarted) this.raceBattleToast(member.nickname + ' 离开了房间');
    };
    room.onRoomClosed = (reason) => {
        this._rbRoomOpen = false;
        this._rbKeepHostWaiting = false;
        if (this._rbMatchStarted) {
            this._raceBattleHandleHostLost(reason);
        } else {
            this._raceBattleSetStatus('error', '房间已解散');
            this.raceBattleToast(reason === 'host_exit' ? '房主已解散房间' : '房间已关闭');
            this._raceBattleSwitchJoinButton('join');
        }
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

    const allReady = list.length >= 2 && list.every((m) => m.isHost || this._rbReadyMap[m.playerId]);
    this.raceBattleStartBtn.disabled = this._rbMatchStarted || !allReady;
    if (list.length < 2) this.raceBattleStartBtn.textContent = '等待玩家...';
    else if (!allReady) this.raceBattleStartBtn.textContent = '等待就绪...';
    else this.raceBattleStartBtn.textContent = '开始竞速';

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
        } else if (!this._rbIsHost && m.playerId === this._rbMyId) {
            const rd = document.createElement('button');
            rd.className = 'race-battle-ready-btn';
            rd.textContent = this._rbReadyMap[m.playerId] ? '取消就绪' : '就绪';
            rd.addEventListener('click', () => this.raceBattleToggleReady());
            row.appendChild(rd);
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
    }
    // RaceRoomController 负责关闭连接 + 广播 + 禁止重入
    this._rbRoom.kickMember(playerId);
    // onMemberLeft 回调会自动更新 _rbMembers 与 DOM，此处不需要手动操作
};

UIController.prototype.raceBattleStart = function() {
    if (!this._rbRoom || !this._rbIsHost) return;
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
    this._rbStopLobbyTtlTimer();
    this.raceBattleStartMatch(params);
};

/** 由难度与关数派生固定种子，保证全员拿到同一份关卡 */
UIController.prototype._raceBattleBuildSeeds = function(startLevel, levels) {
    const seeds = [];
    for (let i = 0; i < levels; i++) {
        seeds.push((startLevel + i) * 7919 + i * 104729 + 20260809);
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
    // [RB-EXIT] 调试日志（2026-08-11 排查弹窗不显示）
    console.log('[RB-EXIT] confirmLeave called: modal =', this.raceBattleExitModal, '| joinBtnMode =', this._rbJoinBtnMode, '| ranked =', this._rbRanked, '| matchStarted =', this._rbMatchStarted);
    if (!this.raceBattleExitModal) return;
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
    console.log('[RB-EXIT] modal display set: computed =', getComputedStyle(this.raceBattleExitModal).display, '| zIndex =', getComputedStyle(this.raceBattleExitModal).zIndex);
};

UIController.prototype.raceBattleCancelLeave = function() {
    if (this._rbReady) this.hideModal('race-battle-exit-modal');
};

UIController.prototype.raceBattleDoLeave = function() {
    this._ensureRaceBattleFields();
    // [RB-EXIT] 调试日志（2026-08-11 排查弹窗不显示）
    console.log('[RB-EXIT] doLeave called: room =', !!this._rbRoom, '| isHost =', this._rbIsHost, '| roomOpen =', this._rbRoomOpen, '| matchStarted =', this._rbMatchStarted, '| members =', this._rbMembers);
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
    }
    this._rbMatchStarted = false;
    this.raceIsMultiplayer = false; // 离开多人模式，恢复单人竞速记录
    this._closeRaceLobby(keep);
    if (!keep) {
        this.raceBattleStopMatchUI();
        this.raceBattleHidePanel();
    }
    this.hideModal('race-battle-modal');
    // 房主退出对战 → 必须返回主菜单，否则停留在棋盘界面卡死
    this.hideModal('race-mode-select-modal');
    this.showModal('start-modal');
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

UIController.prototype._startRaceBattleElapsedTimer = function() {
    this._stopRaceBattleElapsedTimer();
    this._rbElapsedStart = Date.now();
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
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    this.raceBattleResultModal.style.display = 'flex';

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
            return;
        }
        self.innerHTML = '';
        const rankline = document.createElement('div');
        rankline.className = 'rb-result-rankline';
        rankline.textContent = '我的名次：第 ' + result.myRank + ' 名 · ' + (result.myRankTitle || '');
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
    this.raceBattleResultModal.style.display = 'none';
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
    this.raceBattleResultModal.style.display = 'none';
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
    this.raceIsMultiplayer = false; // 返回主菜单，恢复单人竞速记录
    this._raceBattleSwitchJoinButton('join');
    this._closeRaceLobby();
    this.raceBattleHidePanel();
    // 返回主界面：先关闭竞速弹窗再打开主菜单（start-modal 常驻显示，showModal 对已显示弹窗会直接忽略）
    this.hideModal('race-battle-modal');
    this.hideModal('race-mode-select-modal');
    this.showModal('start-modal');
};

// ─── 对局开始（界面侧入口，ui-logic 负责播种与同步计时）────────

UIController.prototype.raceBattleStartMatch = function(params) {
    this._ensureRaceBattleFields();
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
    // 房主连接断开：本局不计成绩（ui-logic 阶段接入服务器结算）
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    this.raceBattleResultModal.style.display = 'flex';
    this.raceBattleResultTitle.textContent = '对局中断';
    this.raceBattleResultRanklist.innerHTML = '';
    const self = this.raceBattleResultSelf;
    self.style.display = '';
    self.textContent = (reason === 'reconnect_failed') ? '网络连接已断开，本局按弃权处理' : '房主连接断开，本局不计成绩';
    const backBtn = document.getElementById('race-battle-back-btn');
    const rematchBtn = document.getElementById('race-battle-rematch-btn');
    if (backBtn) backBtn.style.display = '';
    if (rematchBtn) rematchBtn.style.display = 'none';
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
    bind('mode-race-battle', () => {});
    bind('race-battle-copy-btn', () => this.raceBattleCopyCode());
    bind('race-battle-tab-create', () => this.raceBattleSwitchTab('create'));
    bind('race-battle-tab-join', () => this.raceBattleSwitchTab('join'));
    bind('race-battle-stamina-minus', () => this.raceBattleStepStamina(-1));
    bind('race-battle-stamina-plus', () => this.raceBattleStepStamina(1));
    bind('race-battle-difficulty-minus', () => this.raceBattleStepDifficulty(-1));
    bind('race-battle-difficulty-plus', () => this.raceBattleStepDifficulty(1));
    bind('race-battle-create-btn', () => this.raceBattleCreateRoom());
    bind('race-battle-delete-btn', () => this.raceBattleDeleteRoom());
    bind('race-battle-join-btn', () => {
        // [RB-EXIT] 调试日志（2026-08-11 排查弹窗不显示）
        console.log('[RB-EXIT] join btn clicked, mode =', this._rbJoinBtnMode);
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
    this._rbPuzzleSolved = data.solvedCount != null ? data.solvedCount : (this._rbPuzzleSolved + 1);
    this._rbUpdateSelfProgress();
    this._rbBroadcastProgress();
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
    // 换关 toast
    if (lvIdx + 1 < this._rbTotalLevels) {
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
    // 2026-08-11 需求：完成后给出"退出结算 / 继续观战"选择，不再强制傻等其他人
    this.raceBattleShowFinishChoice(true);
    if (this._rbRoom) this._rbRoom.send({ type: 'race_battle_finish', elapsed: elapsed }, false);
    if (this._rbIsHost) this._rbCheckResult();
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
    // 仅本地构建并展示当前进度下的结算；不广播、不上报。
    // 权威结算仍由房主在全员完成后广播，_rbHandleResultMsg 会刷新本端弹窗（含最终 ELO）。
    const result = this._rbBuildResult();
    this.raceBattleShowResult(this._raceBattleResultView(result));
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
    this.raceBattleRenderProgress();
};

UIController.prototype._rbBroadcastProgress = function() {
    if (!this._rbRoom || !this._rbProgress[this._rbMyId]) return;
    const p = this._rbProgress[this._rbMyId];
    this._rbRoom.send({
        type: 'race_battle_progress',
        level: p.level, puzzle: p.puzzle,
        times: p.times, elapsed: this._rbMyElapsed,
        finished: p.finished, disconnected: p.disconnected
    }, false);
};

UIController.prototype._rbBroadcastLevelDone = function(level, elapsed) {
    if (!this._rbRoom) return;
    this._rbRoom.send({ type: 'race_battle_level_done', level: level, elapsed: elapsed }, false);
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
    const allDone = alive.every((id) => this._rbProgress[id] && this._rbProgress[id].finished);
    if (!allDone) return;
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
        rank: i + 1, name: e.name, time: e.finished ? e.finishTime : null,
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
    const rank = result.list.find((item) => item.isMe);
    if (!rank) return;
    const roomCode = this.raceBattleRoomCode.textContent;
    if (!this._leaderboardService || !this._leaderboardService.submitRaceScore) return;
    this._leaderboardService.submitRaceScore({
        roomCode: roomCode,
        place: rank.rank,
        totalPlayers: result.list.length,
        nickname: rank.name
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
    rankline.textContent = '我的段位：' + r.tier;
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

/** 重连成功：恢复消息通道后重发最新进度 */
UIController.prototype._rbHandleReconnected = function() {
    this._rbBroadcastProgress();
    this.raceBattleToast('已重新连接');
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
            this.raceBattleJoinRoom();
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

/** 房主是否处于"等待阶段"（未开局、无访客已连上）→ 退出时可保留房间 */
UIController.prototype._rbShouldKeepHostWaiting = function() {
    return !!(this._rbRoom && this._rbRoomOpen && this._rbIsHost &&
        !this._rbMatchStarted && (!this._rbMembers || this._rbMembers.length <= 1));
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

/** 房主：删除登记的房间（从大厅移除） */
UIController.prototype._deleteRaceLobbyRoom = function() {
    if (!this._rbLobby || !this._rbLobbyOpen) return;
    this._rbLobby.cancelHost(this._rbLobby.myRoomCode);
    this._rbLobbyOpen = false;
    this._rbLobbyExpiresAt = 0;
    this._rbKeepHostWaiting = false;
    this._rbStopLobbyTtlTimer();
    if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
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

