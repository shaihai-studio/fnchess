/**
 * UIRaceBattlePlay —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 关卡对战：倒计时、加载关卡、进度上报/广播、结算数据构建
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

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
    bind('race-battle-kicked-confirm-btn', () => this.hideModal('race-battle-kicked-modal'));
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
    if (this._rbRoom) this._rbRoom.send({ type: 'race_battle_finish', elapsed: elapsed }, true); // 广播：其他访客也能看到本人完赛
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
        }, true); // 广播：房主转发给其他访客，全员可见彼此进度
    } catch (e) { /* 忽略：断线时进度广播失败不应抛异常打断提交链 */ }
};

UIController.prototype._rbBroadcastLevelDone = function(level, elapsed) {
    if (!this._rbRoom) return;
    try { this._rbRoom.send({ type: 'race_battle_level_done', level: level, elapsed: elapsed }, true); } catch (e) { /* 忽略 */ } // 广播：其他访客也能看到本人换关
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

