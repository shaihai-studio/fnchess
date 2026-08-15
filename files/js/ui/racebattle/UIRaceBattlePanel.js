/**
 * UIRaceBattlePanel —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 对局面板：进度渲染、计时、全屏覆盖、起跑倒计时、特性卡、toast、背景
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

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

    // 折叠态窄进度线：全员各一段并排（本人绿色、他人白色），段内填充 = 各人进度（2px 细线，不挡棋盘）
    const thin = this.raceBattleProgressThin;
    if (thin) {
        thin.innerHTML = '';
        const totalLv = (this._rbGameParams && this._rbGameParams.levels) || 3;
        list.forEach((item) => {
            const d = item.data;
            const seg = document.createElement('span');
            seg.className = 'rb-progress-thin-seg' + (item.id === this._rbMyId ? ' is-me' : '');
            if (d.disconnected) seg.classList.add('is-offline');
            const fill = document.createElement('span');
            fill.className = 'rb-progress-thin-fill';
            const pct = d.finished ? totalLv : ((d.level || 1) - 1) + ((d.puzzle || 0) / 10);
            fill.style.width = Math.round(Math.max(0, Math.min(1, pct / totalLv)) * 100) + '%';
            seg.appendChild(fill);
            thin.appendChild(seg);
        });
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
