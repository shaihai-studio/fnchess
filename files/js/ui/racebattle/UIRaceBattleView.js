/**
 * UIRaceBattleView —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 结算视图：视图数据、段位图标、积分提交与成员状态
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

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

/** 竞速段位图标：按段位名返回 9 级天体段位徽章的 <img>（tier-0~8 对应流星体~宇宙）
 * 贴图文件：files/images/rank_*.png（透明 PNG，按段位顺序 9 张） */
UIController.prototype._raceTierIconHtml = function(tierName) {
    const names = ['流星体', '小行星', '矮行星', '行星', '恒星', '矮星系', '星系', '星系团', '宇宙'];
    const files = [
        'rank_meteoroid.png',      // 流星体
        'rank_asteroid.png',       // 小行星
        'rank_dwarf_planet.png',   // 矮行星
        'rank_planet.png',         // 行星
        'rank_star.png',           // 恒星
        'rank_dwarf_galaxy.png',   // 矮星系
        'rank_galaxy.png',         // 星系
        'rank_galaxy_cluster.png', // 星系团
        'rank_universe.png'        // 宇宙
    ];
    const idx = names.indexOf(String(tierName || ''));
    // 未定段/未知段位：不显示段位图标（避免 fallback 成最低段「流星体」误导）
    if (idx < 0) return '';
    return '<img class="rb-tier-icon" src="files/images/' + files[idx] + '" alt="' + names[idx] + '" loading="lazy">';
};

/** 进度条分母：当前分数所在段位的下一档阈值（对齐服务端 RACE_TIERS 9 级天体，间隔 100/200 分段）
 * ⚠️ 2026-08-15 修复 #5：thresholds 必须与服务端 RACE_TIERS 的 min 值完全一致，改动需同步两处（见 server/index.js RACE_TIERS 注释） */
UIController.prototype._raceBattleRankTotal = function() {
    const score = (this._rbMyScoreResult && this._rbMyScoreResult.score) || 0;
    const thresholds = [0, 100, 200, 300, 400, 600, 800, 1000, 1600];
    let total = 1600;
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
    } else if (!this._rbIsHost) {
        // 重连成功（迁移已结束或普通闪断）：主动请求房主回发全员完整快照，
        // 立即补齐其他玩家的最新进度（访客间不互传，只有房主持有完整快照）
        try { this._rbRoom.send({ type: 'race_full_progress_request' }, false); } catch (e) {}
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
