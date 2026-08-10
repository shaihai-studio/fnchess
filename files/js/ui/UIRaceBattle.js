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

// 耐力档位 → 连跑关数；难度开放上限联动
const RACE_BATTLE_STAMINA = [
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
    this.raceBattleIntensityFill = document.getElementById('race-battle-intensity-fill');
    this.raceBattleIntensityText = document.getElementById('race-battle-intensity-text');
    this.raceBattleMembers = document.getElementById('race-battle-members');
    this.raceBattleMembersCount = document.getElementById('race-battle-members-count');
    this.raceBattleStartBtn = document.getElementById('race-battle-start-btn');
    this.raceBattleLeaveBtn = document.getElementById('race-battle-leave-btn');
    this.raceBattleJoinInput = document.getElementById('race-battle-join-input');
    this.raceBattleJoinBtn = document.getElementById('race-battle-join-btn');
    this.raceBattleJoinError = document.getElementById('race-battle-join-error');
    this.raceBattleTabs = {
        create: document.getElementById('race-battle-tab-create'),
        join: document.getElementById('race-battle-tab-join')
    };

    this.raceBattlePanel = document.getElementById('race-battle-panel');
    this.raceBattlePanelCode = document.getElementById('race-battle-panel-code');
    this.raceBattlePanelTimer = document.getElementById('race-battle-panel-timer');
    this.raceBattleRows = document.getElementById('race-battle-rows');
    this.raceBattleWaitHint = document.getElementById('race-battle-wait-hint');
    this.raceBattleFeatureLine = document.getElementById('race-battle-feature-line');

    this.raceBattleOverlay = document.getElementById('race-battle-overlay');
    this.raceBattleOverlayCard = document.getElementById('race-battle-overlay-card');
    this.raceBattleToastEl = document.getElementById('race-battle-toast');

    this.raceBattleResultModal = document.getElementById('race-battle-result-modal');
    this.raceBattleResultTitle = document.getElementById('race-battle-result-title');
    this.raceBattleResultRanklist = document.getElementById('race-battle-result-ranklist');
    this.raceBattleResultSelf = document.getElementById('race-battle-result-self');
    this.raceBattleExitModal = document.getElementById('race-battle-exit-modal');

    // 参数状态（建房）
    this._rbStamina = 1;      // 1..3
    this._rbDifficulty = 1;   // 1..7（受耐力上限联动）
    this._rbRanked = true;
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
    this._rbTab = 'create';
    this._rbMatchStarted = false;
    this._rbMembers = [];
    this._rbReadyMap = {};
    if (this._rbRoom) { try { this._rbRoom.disconnect(); } catch (e) {} this._rbRoom = null; }

    this.hideRaceUI();
    if (this._raceSubmenu) this._raceSubmenu.style.display = '';
    this.raceBattleSwitchTab('create');
    this.raceBattleRenderParams();
    this.raceBattleRenderMembers();
    this._raceBattleSetStatus('idle', '请创建房间或输入房间码加入');

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
};

UIController.prototype.raceBattleSwitchTab = function(tab) {
    this._ensureRaceBattleFields();
    this._rbTab = (tab === 'join') ? 'join' : 'create';
    const params = document.getElementById('race-battle-params');
    const join = document.getElementById('race-battle-join');
    if (this._rbTab === 'create') {
        if (params) params.style.display = '';
        if (join) join.style.display = 'none';
        this.raceBattleTabs.create.classList.add('is-active');
        this.raceBattleTabs.join.classList.remove('is-active');
        this.raceBattleRoomCode.textContent = '------';
        this._raceBattleSetStatus('idle', '请创建房间或输入房间码加入');
    } else {
        if (params) params.style.display = 'none';
        if (join) join.style.display = '';
        this.raceBattleTabs.join.classList.add('is-active');
        this.raceBattleTabs.create.classList.remove('is-active');
        this._raceBattleSetStatus('idle', '输入 6 位房间码加入好友房间');
        if (this.raceBattleJoinInput) { this.raceBattleJoinInput.value = ''; this.raceBattleJoinInput.focus(); }
    }
};

UIController.prototype._raceBattleSetStatus = function(kind, msg) {
    if (!this._rbReady) return;
    this.raceBattleStatusText.textContent = msg;
    this.raceBattleStatusDot.classList.remove('is-connected', 'is-error');
    if (kind === 'connected') this.raceBattleStatusDot.classList.add('is-connected');
    if (kind === 'error') this.raceBattleStatusDot.classList.add('is-error');
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

UIController.prototype.raceBattleToggleRanked = function() {
    this._ensureRaceBattleFields();
    this._rbRanked = !!this.raceBattleRankedToggle.checked;
    this.raceBattleRenderParams();
};

UIController.prototype.raceBattleRenderParams = function() {
    this._ensureRaceBattleFields();
    const n = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    this.raceBattleStaminaDots.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const d = document.createElement('span');
        d.className = 'race-battle-dot' + (i < n ? ' is-on' : '');
        this.raceBattleStaminaDots.appendChild(d);
    }
    const df = RACE_BATTLE_DIFFICULTIES[this._rbDifficulty - 1];
    this.raceBattleDifficultyBadge.textContent = df.name;
    this.raceBattleDifficultyBadge.className = 'race-battle-difficulty-badge ' + df.cls;
    this.raceBattleRankedToggle.checked = this._rbRanked;
    this.raceBattleRankedHint.textContent = this._rbRanked ? '对局结束后增减积分' : '休闲对局，不增减积分';
    this.raceBattleRankTag.classList.toggle('is-ranked', this._rbRanked);
    this.raceBattleRankTag.textContent = this._rbRanked ? '排位局 · 增减积分' : '休闲局 · 不增减积分';
    // 访客只读：房间已开且非房主时禁用参数操作
    const params = document.getElementById('race-battle-params');
    if (params) params.classList.toggle('is-readonly', !this._rbIsHost && this._rbRoomOpen);
    this.raceBattleRenderIntensity();
};

UIController.prototype.raceBattleRenderIntensity = function() {
    if (!this._rbReady || !this.raceBattleIntensityText) return;
    const levels = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    const df = RACE_BATTLE_DIFFICULTIES[this._rbDifficulty - 1];
    this.raceBattleIntensityText.textContent = (levels * 10) + ' 题 · ' + df.name + '局';
    this.raceBattleIntensityFill.style.width = (this._rbDifficulty / 7 * 100) + '%';
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

UIController.prototype.raceBattleCreateRoom = function() {
    this._ensureRaceBattleFields();
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) return;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const nickname = (this.getPlayerNickname && this.getPlayerNickname()) || '玩家';
    this.raceBattleRoomCode.textContent = code;
    this._raceBattleSetStatus('connecting', '正在创建房间…');
    this._rbIsHost = true;
    this._rbMyId = 'racehost_' + code;

    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    room.createRoom({ roomCode: code, maxPlayers: 4, playerId: this._rbMyId, nickname }).then((ok) => {
        if (!ok) this._raceBattleSetStatus('error', '房间创建失败，请检查网络后重试');
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
    const nickname = (this.getPlayerNickname && this.getPlayerNickname()) || '玩家';

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
                this.raceBattleSwitchTab('create');
                this.raceBattleMembersCount.textContent = '1/4';
            }
        } else if (status === 'error') {
            this._raceBattleSetStatus('error', msg || '连接错误');
        } else {
            this._raceBattleSetStatus('connecting', msg || '连接中…');
        }
    };
    room.onMembersUpdate = (members) => {
        this._rbMembers = members.slice();
        this.raceBattleRenderMembers();
    };
    room.onMemberJoined = (member) => {
        this._rbMembers.push(member);
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
        if (this._rbMatchStarted) {
            this._raceBattleHandleHostLost(reason);
        } else {
            this._raceBattleSetStatus('error', '房间已解散');
            this.raceBattleToast(reason === 'host_exit' ? '房主已解散房间' : '房间已关闭');
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

    const allReady = list.length >= 2 && list.every((m) => this._rbReadyMap[m.playerId]);
    this.raceBattleStartBtn.disabled = this._rbMatchStarted || !allReady;
    if (list.length < 2) this.raceBattleStartBtn.textContent = '开始竞速（等待更多玩家）';
    else if (!allReady) this.raceBattleStartBtn.textContent = '开始竞速（等待全员就绪）';
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
    this._rbRoom.send({ type: 'race_battle_kick', targetId: playerId }, false);
    const member = this._rbMembers.find((m) => m.playerId === playerId);
    if (member) this.raceBattleToast(member.nickname + ' 已被移出房间');
};

UIController.prototype.raceBattleStart = function() {
    if (!this._rbRoom || !this._rbIsHost) return;
    const list = this._rbMembers;
    if (list.length < 2 || !list.every((m) => this._rbReadyMap[m.playerId])) return;
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

UIController.prototype.raceBattleConfirmLeave = function() {
    this._ensureRaceBattleFields();
    const isRanked = this._rbRanked && this._rbMatchStarted;
    const p = this.raceBattleExitModal.querySelector('p');
    p.textContent = isRanked
        ? '确定要退出当前竞速对局吗？退出后本局判负并扣除积分。'
        : '确定要离开房间吗？';
    this.raceBattleExitModal.style.display = 'flex';
};

UIController.prototype.raceBattleCancelLeave = function() {
    if (this._rbReady && this.raceBattleExitModal) this.raceBattleExitModal.style.display = 'none';
};

UIController.prototype.raceBattleDoLeave = function() {
    this._ensureRaceBattleFields();
    this.raceBattleExitModal.style.display = 'none';
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
    this.raceIsMultiplayer = false; // 离开多人模式，恢复单人竞速记录
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    this.hideModal('race-battle-modal');
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
    const bestPerLevel = [];
    for (let lv = 0; lv < 10; lv++) {
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
            const totalLevels = (this._rbGameParams && this._rbGameParams.levels) || d.totalLevels || 3;
            state.textContent = '第' + (d.level || 1) + '/' + totalLevels + '关 第' + (d.puzzle || 0) + '/10题';
            state.classList.add('is-green');
        }
        row.appendChild(state);

        // 10 关时间列
        const timesWrap = document.createElement('span');
        timesWrap.className = 'race-battle-times';
        const t = d.times || [];
        for (let lv = 0; lv < 10; lv++) {
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
        if (this.audioManager && this.audioManager.play) {
            try {
                if (v === 'GO!') this.audioManager.play('raceGo');
                else this.audioManager.play('raceCountdown');
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
    if (this.audioManager && this.audioManager.play) {
        try { this.audioManager.play('raceFeature'); } catch (e) {}
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

// ─── 对局背景：光带 + 速度线 ────────────────────────────────────

UIController.prototype.raceBattleShowBackground = function() {
    if (!this._rbReady) return;
    if (document.getElementById('race-battle-bg')) return;
    const bg = document.createElement('div');
    bg.className = 'race-battle-bg';
    bg.id = 'race-battle-bg';
    for (let i = 0; i < 7; i++) {
        const line = document.createElement('span');
        line.className = 'rb-speed-line';
        line.style.top = (8 + Math.random() * 84) + '%';
        line.style.animationDuration = (3 + Math.random() * 4) + 's';
        line.style.animationDelay = (Math.random() * 4) + 's';
        bg.appendChild(line);
    }
    document.body.appendChild(bg);
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
    this.raceBattleHidePanel();
    // 返回竞速主菜单（重新打开模式选择弹窗，落主界面）
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
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    bind('mode-race-battle', () => {});
    bind('race-battle-copy-btn', () => this.raceBattleCopyCode());
    bind('race-battle-tab-create', () => this.raceBattleSwitchTab('create'));
    bind('race-battle-tab-join', () => this.raceBattleSwitchTab('join'));
    bind('race-battle-stamina-minus', () => this.raceBattleStepStamina(-1));
    bind('race-battle-stamina-plus', () => this.raceBattleStepStamina(1));
    bind('race-battle-difficulty-minus', () => this.raceBattleStepDifficulty(-1));
    bind('race-battle-difficulty-plus', () => this.raceBattleStepDifficulty(1));
    bind('race-battle-ranked-toggle', () => this.raceBattleToggleRanked());
    bind('race-battle-create-btn', () => this.raceBattleCreateRoom());
    bind('race-battle-join-btn', () => this.raceBattleJoinRoom());
    bind('race-battle-start-btn', () => this.raceBattleStart());
    bind('race-battle-leave-btn', () => this.raceBattleConfirmLeave());
    bind('race-battle-exit-confirm-btn', () => this.raceBattleDoLeave());
    bind('race-battle-exit-cancel-btn', () => this.raceBattleCancelLeave());
    bind('race-battle-panel-exit', () => this.raceBattleConfirmLeave());
    bind('race-battle-rematch-btn', () => this.raceBattleRematch());
    bind('race-battle-back-btn', () => this.raceBattleBackToMenu());

    const joinInput = document.getElementById('race-battle-join-input');
    if (joinInput) {
        joinInput.addEventListener('input', () => {
            joinInput.value = joinInput.value.replace(/[^0-9]/g, '');
        });
        joinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.raceBattleJoinRoom();
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
                if (this.audioManager && this.audioManager.play) {
                    try { this.audioManager.play('raceLaunch'); } catch (e) {}
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
            if (this.audioManager && this.audioManager.play) {
                try { this.audioManager.play('raceCountdown'); } catch (e) {}
            }
        }
        this._rbCountdownTimer = setTimeout(tick, 50);
    };
    tick();
};

/** GO 后开始跑：播种第一关 + 统一计时 */
UIController.prototype._raceBattleBeginPlay = function(params) {
    this.raceIsMultiplayer = true;   // 屏蔽单人竞速榜与最佳记录
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
    this.raceBattleToast('你已完成全部关卡！等待其他玩家…');
    if (this._rbRoom) this._rbRoom.send({ type: 'race_battle_finish', elapsed: elapsed }, false);
    if (this._rbIsHost) this._rbCheckResult();
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
        nickname: (this.getPlayerNickname && this.getPlayerNickname()) || '玩家'
    };
    this.raceBattleRenderProgress();
};

UIController.prototype._rbBroadcastProgress = function() {
    if (!this._rbRoom || !this._rbProgress[this._rbMyId]) return;
    const p = this._rbProgress[this._rbMyId];
    this._rbRoom.send({
        type: 'race_battle_progress',
        level: p.level, puzzle: p.puzzle,
        times: p.times, elapsed: this._rbMyElapsed
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
    const alive = this._rbMembers.map((m) => m.playerId);
    const allDone = alive.every((id) => this._rbProgress[id] && this._rbProgress[id].finished);
    if (!allDone) return;
    this._rbBuildAndBroadcastResult();
};

UIController.prototype._rbBuildAndBroadcastResult = function() {
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
            abandoned: !!p.abandoned,
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
    const result = {
        type: 'race_battle_result',
        ranked: !!this._rbRanked,
        list: list,
        myRank: myRank,
        myId: this._rbMyId
    };
    // 房主：先展示本地结算，再上报自己的积分
    this.raceBattleShowResult(this._raceBattleResultView(result));
    this._rbSubmitSelfScore(result);
    if (this._rbRoom) this._rbRoom.send(result, true);
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

/** 进度条分母：当前分数所在段位的下一档阈值（对齐服务端 RACE_TIERS 0/400/800/1200/1600/2000） */
UIController.prototype._raceBattleRankTotal = function() {
    const score = (this._rbMyScoreResult && this._rbMyScoreResult.score) || 0;
    const thresholds = [0, 400, 800, 1200, 1600, 2000];
    let total = 2400;
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
        const p = this._rbProgress[member.playerId] || {};
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

