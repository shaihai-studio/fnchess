/**
 * UIRaceBattleResult —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 结算：名次奖牌、积分/段位、再来一局、返回主菜单
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
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

/** 生成/复用本窗口归属标记（sessionStorage per-tab 独立：刷新保留、跨标签页隔离） */
