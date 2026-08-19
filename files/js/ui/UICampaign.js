// Auto-split from UIController.js — prototype-attached methods (UICampaign)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UICampaign] UIController must be loaded before this file');
}

// getCampaignDrawDelaySetting
    UIController.prototype.getCampaignDrawDelaySetting = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_draw_delay');
            const value = Number(raw);
            return this.campaignDrawDelayOptions.includes(value) ? value : 0;
        } catch (e) {
            return 0;
        }
    }
;

// setCampaignDrawDelaySetting
    UIController.prototype.setCampaignDrawDelaySetting = function(value) {
        const next = this.campaignDrawDelayOptions.includes(Number(value)) ? Number(value) : 0;
        this.campaignDrawDelay = next;
        try {
            localStorage.setItem('function_chess_campaign_draw_delay', String(next));
        } catch (e) { }
        this.updateCampaignDrawDelayToggle();
    }
;

// addCampaignDrawDelayToggle
    UIController.prototype.addCampaignDrawDelayToggle = function() {
        if (document.getElementById('campaign-draw-delay-toggle')) return;
        // 画布右下固定药丸：挂在 Canvas 区域内（与 ✓确认/←返回 圆形按钮同容器），
        // 定位到这两个按钮上方（bottom 78px > FAB 顶部 68px），不依赖键盘，键盘收起也可见。
        const host = document.querySelector('.canvas-section');
        if (!host) return;
        const wrap = document.createElement('div');
        wrap.id = 'campaign-draw-delay-toggle';
        wrap.className = 'campaign-draw-delay-pill';
        wrap.style.display = 'none';
        wrap.innerHTML = `
            <span class="campaign-delay-label">绘制后等待</span>
            <button class="campaign-delay-btn" data-delay="0">0s</button>
            <button class="campaign-delay-btn" data-delay="1000">1s</button>
            <button class="campaign-delay-btn" data-delay="5000">5s</button>
        `;
        wrap.querySelectorAll('.campaign-delay-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this.setCampaignDrawDelaySetting(btn.dataset.delay);
            });
        });
        host.appendChild(wrap);
        this.updateCampaignDrawDelayToggle();
    }
;

// updateCampaignDrawDelayToggleVisibility
    UIController.prototype.updateCampaignDrawDelayToggleVisibility = function() {
        const wrap = document.getElementById('campaign-draw-delay-toggle');
        if (!wrap) return;
        wrap.style.display = (this.gameController?.gameMode === 'campaign') ? 'flex' : 'none';
    }
;

// updateCampaignDrawDelayToggle
    UIController.prototype.updateCampaignDrawDelayToggle = function() {
        const wrap = document.getElementById('campaign-draw-delay-toggle');
        if (!wrap) return;
        wrap.querySelectorAll('.campaign-delay-btn').forEach(btn => {
            const active = Number(btn.dataset.delay) === this.campaignDrawDelay;
            btn.classList.toggle('active', active);
        });
    }
;

// loadCampaignPack
    UIController.prototype.loadCampaignPack = async function() {
        if (this.campaignPack) return this.campaignPack;
        this.campaignPack = window.CAMPAIGN_LEVEL_PACK || null;
        return this.campaignPack;
    }
;

// getCampaignClearedMax
    UIController.prototype.getCampaignClearedMax = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_cleared');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }
;

// getCampaignCollectedStars
    UIController.prototype.getCampaignCollectedStars = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_stars');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }
;

// getCampaignLevelBestStars
    UIController.prototype.getCampaignLevelBestStars = function(levelId) {
        try {
            const raw = localStorage.getItem(`function_chess_campaign_best_stars_${levelId}`);
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }
;

// setCampaignLevelBestStars
    UIController.prototype.setCampaignLevelBestStars = function(levelId, stars) {
        try {
            localStorage.setItem(`function_chess_campaign_best_stars_${levelId}`, String(Math.max(0, Number(stars) || 0)));
        } catch (e) { }
    }
;

// setCampaignCollectedStars
    UIController.prototype.setCampaignCollectedStars = function(stars) {
        try {
            localStorage.setItem('function_chess_campaign_stars', String(Math.max(0, Number(stars) || 0)));
        } catch (e) { }
    }
;

// refreshCampaignStartUI
    UIController.prototype.refreshCampaignStartUI = async function() {
        if (!this.campaignLevelSelect || !this.campaignProgressText) return;
        try {
            const pack = await this.loadCampaignPack();
            if (!pack) throw new Error('no-pack');
            const total = Array.isArray(pack.levels) ? pack.levels.length : 0;
            const cleared = this.getCampaignClearedMax();
            const unlockedMax = Math.min(total, cleared + 1);
            const stars = this.getCampaignCollectedStars();
            this.campaignProgressText.textContent = `已通关：${cleared} / ${total}`;
            this.refreshUnsovableDifficultyVisibility();
            this.updateCampaignGlobalProgressText(stars);

            const current = Number(this.campaignLevelSelect.value || 1);
            this.campaignLevelSelect.innerHTML = '';
            for (let i = 1; i <= total; i++) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = i <= unlockedMax ? `关卡 ${i}` : `关卡 ${i}（未解锁）`;
                opt.disabled = i > unlockedMax;
                this.campaignLevelSelect.appendChild(opt);
            }
            const fixed = Math.min(Math.max(1, current), unlockedMax || 1);
            this.campaignLevelSelect.value = String(fixed);
        } catch (e) {
            this.campaignProgressText.textContent = '关卡加载失败，请确认关卡数据已内置。';
        }
    }
;

// startCampaign
    UIController.prototype.startCampaign = async function(startLevelId) {
        // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;
        const isCustom = !!this.campaignIsCustom;
        const pack = isCustom ? this.importedCampaignPack : (await this.loadCampaignPack());
        if (!pack) {
            this.showMessage('关卡未加载：请先加载内置关卡数据', 'error');
            this.openCampaignUI();
            return;
        }
        // 自定义包：保留原始关卡 id（可能是任意字符串，如 "adg"），不强制转数字
        let safeStart;
        if (isCustom) {
            safeStart = String(startLevelId);
        } else {
            const isFractionLevel = typeof startLevelId === 'string' && String(startLevelId).includes('/');
            safeStart = isFractionLevel ? String(startLevelId) : (Number(startLevelId) || 1);
        }
        this.campaignCurrentLevelId = safeStart;
        // 自定义关卡包：不记录 best（通关不写任何进度）
        this.campaignCurrentLevelBestRecord = isCustom ? null : this.getCampaignLevelBestRecord(safeStart);
        this._markGameActive();
        // 第三个参数 isCustom：由 initCampaign 在加载首关前写入 campaignState.customPack，
        // 供 loadCampaignLevel 区分官方关卡与导入的自定义关卡
        this.gameController.initCampaign(pack, safeStart, isCustom);
        // 兜底标记：自定义包不写内置 cleared / LR∑
        if (this.gameController.campaignState) this.gameController.campaignState.customPack = isCustom;
        if (this.gridSystem && this.gridSystem.setCampaignFixedRange) {
            this.gridSystem.setCampaignFixedRange(true);
        }
    }
;

// showCampaignVictory
    UIController.prototype.showCampaignVictory = function(data) {
        if (!this.campaignVictoryModal) return;
        this.campaignCurrentLevelId = data.levelId || this.campaignCurrentLevelId;
        const rawLevelId = this.campaignCurrentLevelId || data.levelId || 1;
        const isCustom = !!this.campaignIsCustom;
        const isFraction = typeof rawLevelId === 'string' && String(rawLevelId).includes('/');
        let levelId;
        if (isCustom) levelId = String(rawLevelId);
        else if (isFraction) levelId = String(rawLevelId);
        else levelId = Number(rawLevelId || 1);
        // 自定义包：彻底隔离，不读取/不显示官方 best
        const hasBest = !isCustom && this.campaignCurrentLevelBestRecord !== null && Number.isFinite(Number(this.campaignCurrentLevelBestRecord));
        const bestRecord = hasBest ? Number(this.campaignCurrentLevelBestRecord) : null;
        const length = Number.isFinite(Number(data.expressionLength)) ? Number(data.expressionLength) : this.getCurrentExpressionLength();
        const levelText = isCustom ? `关卡 ${levelId}` : (isFraction ? `分数关 ${levelId}` : `第 ${levelId} 关`);
        if (this.campaignVictoryText) {
            // 排行榜最佳：该关全服最短 token（彗星缓存，pl 榜查询时回传 + 本地存）
            let lbBest = null;
            if (!isCustom) {
                try {
                    const n = Number(localStorage.getItem('function_chess_comet_best_' + levelId));
                    if (Number.isFinite(n) && n > 0) lbBest = n;
                } catch (e3) { /* 忽略 */ }
            }
            const lines = [];
            const curLine = `本次：${length} token`;
            const hasBest = bestRecord !== null && Number.isFinite(bestRecord);
            if (data.unlockedPlay) {
                // 解锁通关：不保存最佳、不上榜、无彗星，LRΣ 扣 10 分
                lines.push(curLine);
                lines.push('<span style="color:#facc15;">解锁通关：LRΣ -10</span>');
                lines.push('<span style="color:#f59e0b;">未保存最佳纪录 · 未上榜 · 无彗星</span>');
            } else if (hasBest && data.isNewRecord) {
                const prevBest = Number(data.previousBest);
                if (prevBest > 0) lines.push(`你的最佳：${prevBest} token`);
                lines.push(curLine + ' <span style="color:#22c55e;">（新纪录）</span>');
            } else if (hasBest) {
                const diff = length - bestRecord;
                lines.push(`你的最佳：${bestRecord} token`);
                lines.push(diff > 0 ? curLine + ` <span style="color:#ef4444;">(+${diff})</span>` : curLine);
            } else {
                lines.push(curLine);
            }
            if (lbBest !== null && !data.unlockedPlay) lines.push(`排行榜最佳：${lbBest} token`);
            if (data.unlockRestored) {
                lines.push('<span style="color:#22c55e;">已正常通关，LRΣ 已恢复（+10）</span>');
            }
            this.campaignVictoryText.innerHTML = `${levelText}<br>` + lines.join('<br>');
        }
        // 彗星结算（满分 10 颗，缓存全服最优 → 本地算 plv；首次通关缓存为空则取 10）
        // 解锁通关：无彗星
        if (!isCustom && !data.unlockedPlay) this.renderCampaignVictoryComet(levelId, Number(length) || 0);
        this.campaignVictoryModal.dataset.levelId = String(levelId);
        this.campaignVictoryModal.dataset.totalLevels = String(data.totalLevels || (this.campaignPack && this.campaignPack.levels ? this.campaignPack.levels.length : 0));
        this.campaignVictoryModal.dataset.difficulty = data.difficulty || this.campaignDifficulty || '';
        this.campaignVictoryModal.dataset.length = String(length);
        this.campaignVictoryModal.dataset.isFraction = isFraction ? '1' : '0';
        // 保存该关最短表达式（供方案B核验 / 彗星）：仅当本次长度 ≤ 历史最佳；解锁通关不保存
        if (!isCustom && !data.unlockedPlay) {
            try {
                const prevBestNum = (this.campaignCurrentLevelBestRecord !== null && Number.isFinite(Number(this.campaignCurrentLevelBestRecord)))
                    ? Number(this.campaignCurrentLevelBestRecord) : null;
                const curExpr = String(this.currentExpression || '').trim();
                if (curExpr && (prevBestNum === null || length <= prevBestNum)) {
                    localStorage.setItem('function_chess_campaign_best_expr_' + levelId, curExpr);
                }
            } catch (e2) { /* 忽略 */ }
        }
        // 排行榜：闯关 LR∑ 积分变化时自动上报（官方关卡；自制关卡不参与官方排行榜）
        // 记录上次已上报值，仅当积分高于它才上报，避免重复请求（排行榜保留历史最高分）。
        // 解锁通关：LRΣ 应同步扣 10 分到排行榜（提交扣分后的值，即使低于已上报值也强制上报）；
        // 但不提交分关最佳纪录（minTokens/levels 载荷传空，避免把解锁关的纪录写进榜单）。
        if (!isCustom && data.unlockedPlay && this._leaderboardService && typeof PlayerProfile !== 'undefined') {
            // 解锁通关：强制同步被扣 10 分后的 LRΣ，不提交分关纪录
            try {
                const lrSigma = this.calculateLRSigma(this.getCampaignClearedMax());
                if (Number.isFinite(lrSigma) && lrSigma >= 0) {
                    const profile = PlayerProfile.getProfile();
                    console.log(`[LB] 解锁通关同步 LRΣ=${lrSigma}（已扣解锁惩罚，不提交分关纪录）`);
                    this._leaderboardService.submitLRSigma(lrSigma, profile.nickname, {}, []);
                    this.refreshLeaderboardIfOpen();
                }
            } catch (e) { /* 上报失败静默降级，不影响结算界面 */ console.error('[LB] 解锁通关 LRΣ 同步异常:', e); }
        } else if (!isCustom && !data.unlockedPlay && this._leaderboardService && typeof PlayerProfile !== 'undefined') {
            try {
                const lrSigma = this.calculateLRSigma(this.getCampaignClearedMax());
                if (Number.isFinite(lrSigma) && lrSigma > 0) {
                    let last = Number(localStorage.getItem('function_chess_lr_last_upload') || 0);
                    // 自愈：last 是上报失败残留的虚高值（服务端并没收到），清掉后本轮重新上报
                    if (last > lrSigma + 1e-6) {
                        console.warn(`[LB] 检测到 last(${last}) > lrSigma(${lrSigma})，疑似上报失败残留，清掉 last 自愈`);
                        try { localStorage.removeItem('function_chess_lr_last_upload'); } catch (e3) { /* 忽略 */ }
                        last = 0;
                    }
                    console.log(`[LB] 通关上报判定: lrSigma=${lrSigma} last=${last} → ${lrSigma > last ? '上报' : '跳过(未超过已上报值)'}`);
                    if (lrSigma > last) {
                        // 注意：不在此处 setItem！由 LeaderboardService.onSubmitResult 在服务器
                        // 真正接受后才写 last（避免上报失败时 last 虚高导致永远不报）
                        const profile = PlayerProfile.getProfile();
                        const sub = this.buildLRSubmissionPayload();
                        console.log(`[LB] 已提交 LRΣ=${lrSigma}, minTokens=${Object.keys(sub.minTokens).length} 关, levels=${sub.levels.length} 关`);
                        this._leaderboardService.submitLRSigma(lrSigma, profile.nickname, sub.minTokens, sub.levels);
                        this.refreshLeaderboardIfOpen();
                    }
                } else {
                    console.warn(`[LB] 通关上报跳过: lrSigma=${lrSigma} 无效`);
                }
            } catch (e) { /* 上报失败静默降级，不影响结算界面 */ console.error('[LB] 通关上报异常:', e); }
        }
        this.showModal(this.campaignVictoryModal);
    }
;

// hideCampaignVictory
    UIController.prototype.hideCampaignVictory = function() {
        if (this.campaignVictoryModal) this.hideModal(this.campaignVictoryModal);
    }
;

// getCampaignLevelBestRecord
    UIController.prototype.getCampaignLevelBestRecord = function(levelId) {
        try {
            const raw = localStorage.getItem(`function_chess_campaign_best_${levelId}`);
            const n = raw ? Number(raw) : null;
            return Number.isFinite(n) ? n : null;
        } catch (e) {
            return null;
        }
    }
;

// syncCampaignRecordsOnLoad — 页面加载时自动同步已通关的闯关记录（老玩家版本升级后首次同步）
//   与通关胜利上报同口径：lrSigma 高于上次已上报值才发（避免重复请求），只同步闯关。
    UIController.prototype.syncCampaignRecordsOnLoad = function() {
        if (typeof PlayerProfile === 'undefined') return;
        if (!this._leaderboardService) return;
        try {
            const cleared = this.getCampaignClearedMax();
            if (!cleared || cleared <= 0) return;
            const lrSigma = this.calculateLRSigma(cleared);
            if (!Number.isFinite(lrSigma) || lrSigma <= 0) return;
            // 每次打开游戏都自动同步一次（服务器对同分忽略、不刷新更新时间，无害）
            // 这样即使之前被清分 / 服务器重启 / 老版本升级，都能重新对齐到服务器。
            const profile = PlayerProfile.getProfile();
            const sub = this.buildLRSubmissionPayload();
            this._leaderboardService.submitLRSigma(lrSigma, profile.nickname, sub.minTokens, sub.levels);
        } catch (e) { /* 静默降级，不影响游戏 */ }
    }
;

// renderCampaignVictoryComet — 胜利弹窗内的彗星结算（10 颗制，白色五角星，支持非整数显示）
//   彗星等级 plv = 本关服务器最优 ÷ 本次解 × 10（即本次解相对全服最短的达成度）。
//   serverBest 为该关全服最短 token（服务器 pl 榜查询时回传 + 本地存），curTokens 为本次解 token 数；
//   无缓存（首次通关/未查榜）时视为"服务器最优 = 自己"，plv = 10 颗。
//   显示在原先星星结算的位置（胜利文本上方），并同时显示具体数量（如 8.5/10）。
    UIController.prototype.renderCampaignVictoryComet = function(levelId, curTokens) {
        if (!this.campaignVictoryModal) return;
        let serverBest = null;
        try { const v = localStorage.getItem('function_chess_comet_best_' + levelId); serverBest = Number(v) || null; } catch (e) { /* 忽略 */ }
        // plv = 服务器最优 ÷ 本次解 × 10（非整数保留一位小数）
        const plv = (!serverBest || serverBest <= 0 || !Number.isFinite(Number(curTokens)) || Number(curTokens) <= 0)
            ? 10
            : Math.round(10 * serverBest / Number(curTokens) * 10) / 10;
        const clamped = Math.max(0, Math.min(10, plv));
        const whole = Math.floor(clamped);
        const frac = clamped - whole;
        const starPath = 'M60 14c3.1 0 5.6 1.6 6.9 4.3l11.3 22.9 25.3 3.7c3 .5 5.5 2.5 6.5 5.4 1 2.9.3 6-1.9 8.2L90 74.5l4.5 25.1c.5 3.1-.7 6.2-3.1 8-2.5 1.8-5.8 2.1-8.5.7L60 96.1 37.1 108.3c-2.7 1.4-6 .1-8.5-.7-2.4-1.8-3.6-4.9-3.1-8L30 74.5 12.9 54.5c-2.2-2.2-2.9-5.3-1.9-8.2 1-2.9 3.5-4.9 6.5-5.4l25.3-3.7L54.1 18.3C55.4 15.6 57.9 14 61 14Z"';
        let cometEl = this.campaignVictoryModal.querySelector('.campaign-victory-comet');
        if (!cometEl) {
            cometEl = document.createElement('div');
            cometEl.className = 'campaign-victory-comet';
            const content = this.campaignVictoryModal.querySelector('.campaign-victory-content');
            if (content) {
                // 显示在胜利文本上方（原先星星结算的位置）
                const text = this.campaignVictoryModal.querySelector('#campaign-victory-text') || this.campaignVictoryText;
                if (text && text.parentNode === content) content.insertBefore(cometEl, text);
                else content.appendChild(cometEl);
            }
        }
        cometEl.innerHTML = '';
        for (let i = 1; i <= 10; i++) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 120 120');
            svg.setAttribute('aria-hidden', 'true');
            svg.classList.add('comet');
            if (i <= whole) svg.classList.add('filled');
            else if (i === whole + 1 && frac >= 0.5) svg.classList.add('half');
            svg.innerHTML = '<path d="' + starPath + '"/>';
            cometEl.appendChild(svg);
        }
        // 具体数量显示（如 8.5/10）
        const count = document.createElement('span');
        count.className = 'comet-count';
        count.textContent = `${clamped.toFixed(1)}/10`;
        cometEl.appendChild(count);
    }
;

// setCampaignLevelBestRecord
    UIController.prototype.setCampaignLevelBestRecord = function(levelId, length) {
        try {
            localStorage.setItem(`function_chess_campaign_best_${levelId}`, String(length));
        } catch (e) { }
    }
;

// ─── 解锁通关（忽略本关锁定元素）相关 ─────────────────────────────

// getCampaignUnlockedPlaySet — 读取通过"解锁通关"的关卡集合（JSON 数组）
    UIController.prototype.getCampaignUnlockedPlaySet = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_unlocked_play');
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }
;

// addCampaignUnlockedPlay — 记录某关通过解锁通关
    UIController.prototype.addCampaignUnlockedPlay = function(levelId) {
        try {
            const key = String(levelId);
            const arr = this.getCampaignUnlockedPlaySet();
            if (!arr.includes(key)) {
                arr.push(key);
                localStorage.setItem('function_chess_campaign_unlocked_play', JSON.stringify(arr));
            }
        } catch (e) { /* 忽略 */ }
    }
;

// removeCampaignUnlockedPlay — 某关恢复正常通关后移除（LRΣ 扣分随之恢复）
    UIController.prototype.removeCampaignUnlockedPlay = function(levelId) {
        try {
            const key = String(levelId);
            const arr = this.getCampaignUnlockedPlaySet().filter(x => x !== key);
            localStorage.setItem('function_chess_campaign_unlocked_play', JSON.stringify(arr));
        } catch (e) { /* 忽略 */ }
    }
;

// handleCampaignUnlock — 点击解锁按钮：忽略本关锁定元素（如 +、* 等）
//   反三角函数（asin/acos/atan）未解锁导致的禁用不属于本关锁定，不在 lockedElements 中，不受影响。
//   之后通关将按"解锁通关"处理（LRΣ 扣10、不存最佳、不上榜、无彗星、下一关解锁）。
    UIController.prototype.handleCampaignUnlock = function() {
        const gc = this.gameController;
        if (!gc) return;
        const locked = gc.roundState && gc.roundState.lockedElements;
        if (!locked || locked.length === 0) {
            this.showMessage('本关没有锁定的元素', 'info');
            return;
        }
        // 忽略本关所有锁定元素
        gc.roundState.lockedElements = [];
        if (gc.parser && typeof gc.parser.clearLockedElements === 'function') {
            gc.parser.clearLockedElements();
        }
        // 重新渲染输入栏，使被锁元素解锁可用
        if (typeof this.initDraggableElements === 'function') this.initDraggableElements();
        this._campaignUnlockUsed = true;
        if (window.audioManager) window.audioManager.playClick();
        this.showMessage('已忽略本关锁定元素（此关通关将按解锁通关处理）', 'warning');
    }
;
// buildLRSubmissionPayload — 组装防作弊上报载荷（遍历逻辑与 calculateLRSigma 完全一致）
// levels 覆盖全部 minTokens 关；老玩家（旧版本通关）无 best_expr 的关以 expr:'' 占位，
// 服务器对其做"已验证最优"边界检查（≥ 全服最优即接受），实现 1.0.0→2.0.0 升级无感、历史关卡保留。
    UIController.prototype.buildLRSubmissionPayload = function() {
        const minTokens = {};
        const levels = [];
        const addLevel = (lv, key) => {
            const best = this.getCampaignLevelBestRecord(key);
            if (best !== null && best > 0) {
                minTokens[String(key)] = best;
                let expr = '';
                try { expr = localStorage.getItem('function_chess_campaign_best_expr_' + key) || ''; } catch (e) { /* 忽略 */ }
                levels.push({ level: String(key), expr, minToken: best }); // 缺 expr 占位（老玩家历史数据）
            }
        };
        const cleared = this.getCampaignClearedMax();
        for (let i = 1; i <= cleared; i++) addLevel(i, i);
        const fracMax = (typeof this.getCampaignFractionClearedMax === 'function') ? this.getCampaignFractionClearedMax() : 0;
        for (let denom = 2; denom <= fracMax && denom <= 20; denom++) addLevel(`1/${denom}`, `1/${denom}`);
        return { minTokens, levels };
    }
;

// retryCampaignLevel
    UIController.prototype.retryCampaignLevel = function() {
        if (!this.campaignPack && !this.importedCampaignPack) return;
        const rawId = this.campaignCurrentLevelId || this.campaignVictoryModal?.dataset.levelId || 1;
        const levelId = this.campaignIsCustom
            ? String(rawId)
            : (typeof rawId === 'string' && String(rawId).includes('/') ? String(rawId) : (Number(rawId || 1)));
        this.hideCampaignVictory();
        this.startCampaign(levelId);
    }
;

// goToNextCampaignLevel
    UIController.prototype.goToNextCampaignLevel = async function() {
        if (!this.campaignPack && !this.importedCampaignPack) return;
        const rawId = this.campaignCurrentLevelId || this.campaignVictoryModal?.dataset.levelId || 1;
        const isFraction = typeof rawId === 'string' && String(rawId).includes('/');
        const total = this.campaignPack && Array.isArray(this.campaignPack.levels) ? this.campaignPack.levels.length : 0;
        // 自定义关卡包：按 js 原始顺序进入下一位；末关提示完成
        if (this.campaignIsCustom && this.importedCampaignPack) {
            const levels = this.importedCampaignPack.levels;
            const idx = levels.findIndex(l => String(l.id) === String(rawId));
            this.hideCampaignVictory();
            if (idx >= 0 && idx + 1 < levels.length) {
                this.startCampaign(String(levels[idx + 1].id));
            } else {
                this.showMessage('已完成所有自制关卡', 'success');
                this.openCampaignLevels('custom');
            }
            return;
        }
        this.hideCampaignVictory();
        if (isFraction) {
            const currentDenom = parseInt(String(rawId).split('/')[1]) || 2;
            if (currentDenom >= 20) {
                this.showMessage('已完成所有分数关卡', 'success');
                this.openCampaignUI();
                return;
            }
            this.startCampaign(`1/${currentDenom + 1}`);
        } else {
            const current = Number(rawId || 1);
            const nextId = current + 1;
            if (nextId > total) {
                this.showMessage('已经是最后一关', 'success');
                this.openCampaignUI();
                return;
            }
            this.startCampaign(nextId);
        }
    }
;

// returnToCampaignLevelSelect
    UIController.prototype.returnToCampaignLevelSelect = function() {
        this.hideCampaignVictory();
        if (this.campaignModal) this.showModal(this.campaignModal);
        // 自定义关卡包：返回自制选关网格
        if (this.campaignIsCustom) {
            this.openCampaignLevels('custom');
            return;
        }
        this.showCampaignDifficulty();
        this.refreshCampaignStartUI();
    }
;

// returnCampaignToDifficulty
    UIController.prototype.returnCampaignToDifficulty = function() {
        // ★ 强制停止当前对局
        this.forceStopGame();
        this.hideCampaignVictory();
        this.resetBattleGrid();
        this.gameController.resetGame();
        this.campaignCurrentLevelId = null;
        this.campaignCurrentLevelBestRecord = null;
        if (this.campaignModal) this.showModal(this.campaignModal);
        this.showCampaignDifficulty();
        this.updateCampaignDrawDelayToggleVisibility();
        this.restoreBattleUI();
        const badge = document.getElementById('campaign-level-badge');
        if (badge) badge.style.display = 'none';
    }
;

// openCampaignUI
    UIController.prototype.openCampaignUI = function() {
        // ESC：选关列表 → 返回难度选择；难度选择 → 返回主界面
        if (this.campaignModal) {
            this.campaignModal._dismissBound = true;
            this.campaignModal._onEscDismiss = () => {
                if (this.campaignStepLevels && this.campaignStepLevels.style.display !== 'none') {
                    this.showCampaignDifficulty();
                } else {
                    this.closeCampaignUI();
                }
            };
        }
        this.hideModal(this.startModal, () => {
            this.showModal(this.campaignModal);
        });
        this.showCampaignDifficulty();
        this.hideBattleUI();
        this.updateCampaignDrawDelayToggleVisibility();
        // 尝试静默加载一次（服务器环境可直接成功）
        this.loadCampaignPack().then(() => this.updateCampaignGlobalProgressText());
    }
;

// closeCampaignUI
    UIController.prototype.closeCampaignUI = function() {
        // ★ 强制停止当前对局（闯关中退出时）
        this.forceStopGame();
        // ★ 退出闯关对局立即取消所有锁定（不影响文本框输入）
        this.clearAllLocks();
        this.hideModal(this.campaignModal, () => {
            this.showModal(this.startModal);
        });
        this.hideCampaignVictory();
        this.resetBattleGrid();
        this.restoreBattleUI();
        const badge = document.getElementById('campaign-level-badge');
        if (badge) badge.style.display = 'none';
        this.campaignDifficulty = null;
        this.campaignCurrentLevelId = null;
        this.campaignCurrentLevelBestRecord = null;
    }
;

// showCampaignDifficulty
    UIController.prototype.showCampaignDifficulty = function() {
        if (this.campaignStepLevels) this.campaignStepLevels.style.display = 'none';
        if (this.campaignStepDifficulty) this.campaignStepDifficulty.style.display = 'block';
        const badge = document.getElementById('campaign-level-badge');
        if (badge) badge.style.display = 'none';
        this.campaignDifficulty = null;
        this.updateCampaignGlobalProgressText();
    }
;

// updateCampaignGlobalProgressText
    UIController.prototype.updateCampaignGlobalProgressText = function(stars = null) {
        if (!this.campaignGlobalProgress) return;
        const cleared = this.getCampaignClearedMax();
        const total = this.campaignPack && Array.isArray(this.campaignPack.levels) ? this.campaignPack.levels.length : 0;
        const visibleTotal = cleared >= 81 ? total : Math.min(total, 81);
        this.campaignGlobalProgress.textContent = total > 0
            ? `已通关 ${cleared}/${visibleTotal}`
            : '未加载关卡：请导入 levels.json（本地打开HTML时浏览器可能拦截自动读取）';
        // 更新LRΣ显示
        this.updateCampaignLRSigmaDisplay(cleared);
    }
;

// updateCampaignLRSigmaDisplay
    UIController.prototype.updateCampaignLRSigmaDisplay = function(cleared = null) {
        const container = document.getElementById('campaign-lrsigma-container');
        const display = document.getElementById('campaign-lrsigma-display');
        if (!container || !display) return;
        
        if (cleared === null) {
            cleared = this.getCampaignClearedMax();
        }
        
        if (cleared <= 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';
        const lrSigma = this.calculateLRSigma(cleared);
        // 显示格式：LRΣ = 整数部分大，小数部分靠上与整数底部齐平，精确到6位小数
        const intPart = Math.floor(lrSigma);
        const decPart = (lrSigma - intPart).toFixed(6).substring(1); // 去掉前导0
        display.innerHTML = `<span class="lrsigma-label">LRΣ =</span> <span class="lrsigma-int">${intPart}</span><span class="lrsigma-dec">${decPart}</span>`;
    }
;

// resetCampaignProgress
    UIController.prototype.resetCampaignProgress = async function() {
        try {
            const firstConfirm = await this.showGameDialog({
                title: '重置闯关进度',
                message: '你确定要重置所有闯关进度吗？\n此操作会清空已解锁关卡、星星和最佳记录。',
                options: [
                    { label: '取消', value: false },
                    { label: '重置', value: true }
                ],
                showSkip: false
            });
            if (!firstConfirm) return;

            // 等待 200ms 间隙，让第一次弹窗退场动画完成
            await new Promise(r => setTimeout(r, 200));

            const secondConfirm = await this.showGameDialog({
                title: '再次确认',
                message: '请再次确认：重置后将无法恢复已保存的闯关数据。\n是否同时在排行榜中保留你的成绩？',
                options: [
                    { label: '取消', value: 'cancel' },
                    { label: '重置并保留排行榜成绩', value: 'keep' },
                    { label: '重置并清除排行榜成绩', value: 'wipe' }
                ],
                showSkip: false
            });
            if (!secondConfirm || secondConfirm === 'cancel') return;

            localStorage.removeItem('function_chess_campaign_cleared');
            localStorage.removeItem('function_chess_campaign_fraction_cleared');
            localStorage.removeItem('function_chess_campaign_stars');
            localStorage.removeItem('function_chess_campaign_unlocked_play');
            for (let i = 1; i <= 90; i++) {
                localStorage.removeItem(`function_chess_campaign_best_${i}`);
                localStorage.removeItem(`function_chess_campaign_best_stars_${i}`);
                localStorage.removeItem(`function_chess_campaign_best_expr_${i}`);
            }
            for (let d = 2; d <= 20; d++) {
                localStorage.removeItem(`function_chess_campaign_best_1/${d}`);
                localStorage.removeItem(`function_chess_campaign_best_stars_1/${d}`);
                localStorage.removeItem(`function_chess_campaign_best_expr_1/${d}`);
            }
            this.campaignCurrentLevelBestRecord = null;
            this.showMessage('✅ 闯关进度已重置', 'success');
            this.updateCampaignGlobalProgressText(0);
            this.refreshUnsovableDifficultyVisibility();

            // 排行榜：仅当玩家选择"清除"时才删除自己在 lr / pl* 榜上的记录
            if (secondConfirm === 'wipe' && this._leaderboardService) {
                try {
                    const res = await this._leaderboardService.deleteMyScores('campaign');
                    // 清除本地"已上报 LRΣ 记录"，避免清榜后 last 残留导致不再上报
                    try { localStorage.removeItem('function_chess_lr_last_upload'); } catch (e3) { /* 忽略 */ }
                    if (typeof this.refreshLeaderboardIfOpen === 'function') this.refreshLeaderboardIfOpen();
                    if (res && res.ok) {
                        this.showMessage('🏆 已清除排行榜中的闯关成绩', 'success');
                    } else {
                        this.showMessage('⚠️ 排行榜成绩清除失败（服务器未连接？），本地进度已重置', 'error');
                    }
                } catch (e) { console.error('[LB] 清除闯关排行榜成绩失败:', e); }
            }
        } catch (e) {
            this.showMessage('❌ 重置失败', 'error');
        }
    }
;

// openCampaignLevels
    UIController.prototype.openCampaignLevels = function(diff) {
        this.campaignDifficulty = diff;
        this.campaignIsCustom = (diff === 'custom');
        if (this.campaignStepDifficulty) this.campaignStepDifficulty.style.display = 'none';
        if (this.campaignStepLevels) this.campaignStepLevels.style.display = 'block';
        this.renderCampaignLevelGrid();
    }
;

// updateCampaignLevelBadge
    UIController.prototype.updateCampaignLevelBadge = function(levelId = null, totalLevels = null, difficulty = null) {
        const badge = document.getElementById('campaign-level-badge');
        const value = document.getElementById('campaign-level-value');
        if (!badge || !value) return;

        const diff = difficulty || this.campaignDifficulty;
        if (!diff) {
            badge.style.display = 'none';
            return;
        }

        const isCustom = (diff === 'custom') || !!this.campaignIsCustom;
        const range = this.getDifficultyRange(diff);
        const rawLevelId = levelId ?? this.campaignCurrentLevelId ?? range.start;
        const isFraction = typeof rawLevelId === 'string' && String(rawLevelId).includes('/');
        let currentLevelId;
        if (isCustom) currentLevelId = String(rawLevelId);
        else if (isFraction) currentLevelId = String(rawLevelId);
        else currentLevelId = Number(rawLevelId || range.start);
        // 自定义包：隔离命名空间，绝不读取官方 best
        const bestRecord = isCustom ? null : this.getCampaignLevelBestRecord(currentLevelId);

        // 根据关卡号确定颜色，而不是根据 difficulty
        let color, bgColor, borderColor;
        if (isCustom) {
            color = '#22c55e';
            bgColor = 'rgba(34,197,94,0.12)';
            borderColor = 'rgba(34,197,94,0.4)';
        } else if (isFraction) {
            color = '#14b8a6';
            bgColor = 'rgba(20, 184, 166, 0.15)';
            borderColor = 'rgba(20, 184, 166, 0.5)';
        } else if (Number(currentLevelId) >= 82) { // 无解（82-90）
            color = '#ef4444';
            bgColor = 'rgba(239, 68, 68, 0.15)';
            borderColor = 'rgba(239, 68, 68, 0.5)';
        } else if (currentLevelId >= 70) { // 专家（70-81）
            color = '#b87a4e';
            bgColor = 'rgba(249, 115, 22, 0.10)';
            borderColor = 'rgba(249, 115, 22, 0.3)';
        } else if (currentLevelId >= 54) { // 困难（54-69）
            color = '#b8944a';
            bgColor = 'rgba(234, 179, 8, 0.10)';
            borderColor = 'rgba(234, 179, 8, 0.3)';
        } else if (currentLevelId >= 30) { // 普通（30-53）
            color = '#7a9e3a';
            bgColor = 'rgba(132, 204, 22, 0.10)';
            borderColor = 'rgba(132, 204, 22, 0.3)';
        } else { // 简单（1-29）
            color = '#5b9e6e';
            bgColor = 'rgba(34, 197, 94, 0.10)';
            borderColor = 'rgba(34, 197, 94, 0.3)';
        }

        badge.className = `campaign-level-badge`;
        value.style.setProperty('color', color, 'important');
        badge.style.setProperty('color', color, 'important');
        badge.style.setProperty('border-color', borderColor, 'important');
        badge.style.setProperty('background', bgColor, 'important');
        if (bestRecord !== null && Number.isFinite(bestRecord)) {
            value.textContent = `Lv. ${currentLevelId} (best record:${bestRecord})`;
        } else {
            value.textContent = `Lv. ${currentLevelId}`;
        }
        badge.style.display = 'inline-flex';
    }
;

// renderCampaignLevelGrid
    UIController.prototype.renderCampaignLevelGrid = function() {
        if (!this.campaignLevelGrid || !this.campaignLevelTitle || !this.campaignLevelProgress) return;
        // 自定义关卡包：按 js 原始顺序渲染，全部可玩，无解锁机制
        if (this.campaignDifficulty === 'custom') { this.renderCustomCampaignLevelGrid(); return; }
        const range = this.getDifficultyRange(this.campaignDifficulty);
        this.campaignLevelTitle.textContent = `选择关卡：${range.label}`;

        const cleared = this.getCampaignClearedMax();
        const total = this.campaignPack && Array.isArray(this.campaignPack.levels) ? this.campaignPack.levels.length : 0;
        const isFraction = this.campaignDifficulty === 'fraction';

        // 分数关用独立进度，但仅在通关全部"简单"难度（1-29，cleared>=29）后才解锁入口；
        // 否则仅看分数关自身进度——避免"整数关打通了分数关却因分数关自身零进度而整页锁死"。
        const easyEnd = (typeof this.getDifficultyRange === 'function') ? this.getDifficultyRange('easy').end : 29;
        const fracCleared = isFraction
            ? (typeof this.getCampaignFractionClearedMax === 'function' ? this.getCampaignFractionClearedMax() : 0)
            : 0;
        const fracOwnUnlocked = typeof this.getCampaignFractionUnlockedMax === 'function'
            ? this.getCampaignFractionUnlockedMax() : 2;
        const fracUnlocked = isFraction
            ? Math.max(fracOwnUnlocked, cleared >= easyEnd ? 2 : 1)
            : 2;

        if (isFraction) {
            const enterHint = fracCleared >= 1
                ? `当前可进入 1/${fracUnlocked}`
                : (cleared >= easyEnd ? `当前可进入 1/2（通关全部简单难度解锁）` : `当前可进入 1/${fracUnlocked}`);
            // fracCleared 存的是已通关的最大分母（2~20），换算成已通关数量（共 19 关）
            const fracDone = fracCleared >= 2 ? fracCleared - 1 : 0;
            this.campaignLevelProgress.textContent = `已通关 ${fracDone}/19，${enterHint}`;
        } else {
            const unlockedMax = Math.min(total, cleared + 1);
            this.campaignLevelProgress.textContent = `已通关 ${cleared}/${total}，当前可进入 ≤ ${unlockedMax}`;
        }

        const makeCell = (id, locked, isCleared, label, level) => {
            const cell = document.createElement('div');
            cell.className = `campaign-level-cell ${range.cls}`;
            if (locked) cell.classList.add('locked');
            if (isCleared) cell.classList.add('cleared');

            // 最佳纪录（替代原星星系统）：显示该关最短表达式长度，样式同经典竞速
            const bestRecord = this.getCampaignLevelBestRecord(id);
            const hasBestRecord = isCleared && bestRecord !== null && Number.isFinite(Number(bestRecord)) && Number(bestRecord) > 0;
            if (hasBestRecord) {
                const bestEl = document.createElement('div');
                bestEl.className = 'race-level-best-record';
                bestEl.textContent = `最佳 ${Number(bestRecord)} token`;
                cell.appendChild(bestEl);
            }

            const numberSpan = document.createElement('span');
            numberSpan.className = 'campaign-cell-number';
            numberSpan.textContent = label;
            cell.appendChild(numberSpan);

            cell.addEventListener('click', async () => {
                if (locked) return;
                if (window.audioManager) window.audioManager.playClick();
                if (this.campaignModal) this.hideModal(this.campaignModal);
                this.startCampaign(id).catch(err => console.error('[Campaign] startCampaign failed:', err));
            });
            this.campaignLevelGrid.appendChild(cell);
        };

        this.campaignLevelGrid.innerHTML = '';

        if (isFraction) {
            // 渲染分数关卡 1/2 ~ 1/20
            for (let denom = 2; denom <= 20; denom++) {
                const id = `1/${denom}`;
                const locked = denom > fracUnlocked;
                const isCleared = denom <= fracCleared;
                const level = this.campaignPack && Array.isArray(this.campaignPack.levels)
                    ? this.campaignPack.levels.find(l => String(l.id) === id) : null;
                makeCell(id, locked, isCleared, `1/${denom}`, level);
            }
        } else {
            // 整数关卡
            const unlockedMax = Math.min(total, cleared + 1);
            for (let id = range.start; id <= range.end; id++) {
                const locked = id > unlockedMax;
                const isCleared = id <= cleared;
                makeCell(id, locked, isCleared, String(id), null);
            }
        }
    }

// ─── 分数关辅助函数 ────────────────────────────────────

// getCampaignFractionClearedMax — 读取已通过的最大分数关分母（localStorage）
    UIController.prototype.getCampaignFractionClearedMax = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_fraction_cleared');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }

// setCampaignFractionClearedMax
    UIController.prototype.setCampaignFractionClearedMax = function(n) {
        try {
            const v = Number(n);
            if (!Number.isFinite(v) || v <= 0) return;
            localStorage.setItem('function_chess_campaign_fraction_cleared', String(v));
        } catch (e) { }
    }

// getCampaignFractionUnlockedMax — 已通过的最大分母 + 1，上限 20
    UIController.prototype.getCampaignFractionUnlockedMax = function() {
        const cleared = this.getCampaignFractionClearedMax();
        return Math.min(20, cleared + 1);
    }

// _getFractionLevelNumber — 从 id "1/n" 提取 n
    UIController.prototype._getFractionLevelNumber = function(id) {
        const s = String(id || '');
        const parts = s.split('/');
        if (parts.length === 2) {
            const n = Number(parts[1]);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return null;
    }

// ─── 反三角函数解锁机制 ─────────────────────────────────────────

// 反三角函数元素集合（解锁后可在普通及以上难度/对战中使用）
    UIController.prototype.inverseTrigElements = ['asin', 'acos', 'atan'];

// isInverseTrigUnlocked — 是否解锁：分数关全部通关（1/2~1/20，即 fracCleared >= 20）
    UIController.prototype.isInverseTrigUnlocked = function() {
        return (typeof this.getCampaignFractionClearedMax === 'function')
            && this.getCampaignFractionClearedMax() >= 20;
    }

// getInverseTrigEnabled — 反三角是否启用（兼容旧接口：以面板中 asin 的启停为准）
    UIController.prototype.getInverseTrigEnabled = function() {
        return this.getFunctionEnabled('asin');
    }

// setInverseTrigEnabled — 兼容旧接口：写入 asin/acos/atan 三个函数的启停
    UIController.prototype.setInverseTrigEnabled = function(v) {
        ['asin', 'acos', 'atan'].forEach(n => this.setFunctionEnabled(n, v));
    }

// isInverseTrigHideContext — 简单难度不显示这三个按钮。
// 分数关不再隐藏：反三角函数（未解锁显示锁定态、已解锁允许使用）与普通难度行为一致。
    UIController.prototype.isInverseTrigHideContext = function() {
        const gc = this.gameController;
        if (!gc) return true;
        if (typeof gc.isEasyMode === 'function' && gc.isEasyMode()) return true;
        return false;
    }

// shouldHideInverseTrigElement — 输入面板是否隐藏反三角按钮
// 简单 → 隐藏；未解锁 → 显示锁定态；已解锁 → 仅面板中启用时显示
    UIController.prototype.shouldHideInverseTrigElement = function(name) {
        if (this.isInverseTrigHideContext()) return true;
        if (!this.isInverseTrigUnlocked()) return false;
        return !this.getFunctionEnabled(name || 'asin');
    }

// _shouldSkipInverseTrigInLockView — 锁定阶段（set_locks）是否跳过反三角
// 简单、面板中禁用均跳过（未解锁元素不可被锁定）
    UIController.prototype._shouldSkipInverseTrigInLockView = function(name) {
        if (this.isInverseTrigHideContext()) return true;
        if (!this.isInverseTrigUnlocked()) return true;
        return !this.getFunctionEnabled(name || 'asin');
    }

// showInverseTrigModal — 反三角函数提示弹窗（未解锁提示 / 解锁通知共用）
    UIController.prototype.showInverseTrigModal = function(title, html) {
        const modal = document.getElementById('inverse-trig-modal');
        if (!modal) return;
        const titleEl = document.getElementById('inverse-trig-modal-title');
        const bodyEl = document.getElementById('inverse-trig-modal-body');
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = html;
        this.showModal(modal);
    }

// showInverseTrigLockedDialog — 点击未解锁反三角按钮时的提示弹窗
    UIController.prototype.showInverseTrigLockedDialog = function() {
        if (window.audioManager) window.audioManager.playError();
        const fracCleared = (typeof this.getCampaignFractionClearedMax === 'function')
            ? this.getCampaignFractionClearedMax() : 0;
        // fracCleared 是最大分母（2~20），换算成已通关数量（共 19 关）
        const fracDone = fracCleared >= 2 ? fracCleared - 1 : 0;
        const progress = Math.min(100, Math.round((fracDone / 19) * 100));
        this.showInverseTrigModal(
            '反三角函数未解锁',
            'asin / acos / atan 需要通关<b>全部分数关</b>（1/2 ~ 1/20）后解锁。<br><br>'
            + `当前分数关进度：${fracDone} / 19（${progress}%）`
        );
    }

// showInverseTrigUnlockModal — 首次通关全部分数关时的解锁提示页面
    UIController.prototype.showInverseTrigUnlockModal = function() {
        this.showInverseTrigModal(
            '🎉 反三角函数已解锁',
            '恭喜你通关了全部分数关！<br><br>'
            + 'asin / acos / atan 现已在<b>普通及以上难度</b>与<b>对战模式</b>中解锁。<br>'
            + '可前往开始界面选择是否在面板中使用。'
        );
    }

// ─── sgn / floor 分难度解锁机制 ─────────────────────────────────

// sgn 解锁条件：通关专家难度（专家末关 81 已通关）
    UIController.prototype.isSgnUnlocked = function() {
        const expertEnd = (typeof this.getDifficultyRange === 'function')
            ? this.getDifficultyRange('expert').end : 81;
        return this.getCampaignClearedMax() >= expertEnd;
    }

// floor 解锁条件：通关无解难度（无解末关 90 已通关）
    UIController.prototype.isFloorUnlocked = function() {
        const unsolvableEnd = (typeof this.getDifficultyRange === 'function')
            ? this.getDifficultyRange('unsolvable').end : 90;
        return this.getCampaignClearedMax() >= unsolvableEnd;
    }

// isSgnAllowedInContext — 当前模式/难度是否允许使用 sgn
//   闯关：困难/专家/无解；对战（local/ai/p2p）：专家。test 模式始终允许。
//   分数难度不在其中，因此分数关禁用。
    UIController.prototype.isSgnAllowedInContext = function() {
        const gc = this.gameController;
        if (!gc) return false;
        if (typeof gc.isTestMode === 'function' && gc.isTestMode()) return true;
        if (gc.gameMode === 'campaign') {
            return gc.difficulty === 'hard' || gc.difficulty === 'expert' || gc.difficulty === 'unsolvable';
        }
        return gc.difficulty === 'expert';
    }

// isFloorAllowedInContext — 当前模式/难度是否允许使用 floor（规则同 sgn）
    UIController.prototype.isFloorAllowedInContext = function() {
        const gc = this.gameController;
        if (!gc) return false;
        if (typeof gc.isTestMode === 'function' && gc.isTestMode()) return true;
        if (gc.gameMode === 'campaign') {
            return gc.difficulty === 'hard' || gc.difficulty === 'expert' || gc.difficulty === 'unsolvable';
        }
        return gc.difficulty === 'expert';
    }

// shouldHideSgnElement — 当前难度太低/模式不适用、或在面板中禁用则直接隐藏
    UIController.prototype.shouldHideSgnElement = function() {
        if (!this.isSgnAllowedInContext()) return true;
        return !this.getFunctionEnabled('sgn');
    }

// shouldHideFloorElement — 当前难度太低/模式不适用、或在面板中禁用则直接隐藏
    UIController.prototype.shouldHideFloorElement = function() {
        if (!this.isFloorAllowedInContext()) return true;
        return !this.getFunctionEnabled('floor');
    }

// _shouldSkipSgnInLockView — 锁定阶段是否跳过 sgn（未解锁或当前不适用时不可锁定）
    UIController.prototype._shouldSkipSgnInLockView = function() {
        if (!this.isSgnAllowedInContext()) return true;
        return !this.isSgnUnlocked();
    }

// _shouldSkipFloorInLockView — 锁定阶段是否跳过 floor
    UIController.prototype._shouldSkipFloorInLockView = function() {
        if (!this.isFloorAllowedInContext()) return true;
        return !this.isFloorUnlocked();
    }

// showSgnLockedDialog — 点击未解锁 sgn 的提示
    UIController.prototype.showSgnLockedDialog = function() {
        if (window.audioManager) window.audioManager.playError();
        const expertEnd = (typeof this.getDifficultyRange === 'function')
            ? this.getDifficultyRange('expert').end : 81;
        const cleared = this.getCampaignClearedMax();
        this.showInverseTrigModal(
            'sgn 未解锁',
            '函数 <b>sgn</b>（符号函数）需要通关<b>专家难度</b>后解锁。<br><br>'
            + `当前最大通关：第 ${cleared} 关（需通关第 ${expertEnd} 关）`
        );
    }

// showFloorLockedDialog — 点击未解锁 floor 的提示
    UIController.prototype.showFloorLockedDialog = function() {
        if (window.audioManager) window.audioManager.playError();
        const unsolvableEnd = (typeof this.getDifficultyRange === 'function')
            ? this.getDifficultyRange('unsolvable').end : 90;
        const cleared = this.getCampaignClearedMax();
        this.showInverseTrigModal(
            'floor 未解锁',
            '函数 <b>floor</b>（向下取整）需要通关<b>无解难度</b>才解锁。<br><br>'
            + `当前最大通关：第 ${cleared} 关（需通关第 ${unsolvableEnd} 关）`
        );
    }

// _checkSgnFloorUnlockBlock — 提交校验：表达式若使用了 sgn/floor，检查其在当前模式/难度是否可用且已解锁
//   返回错误提示字符串（阻止提交），否则返回 null。
    UIController.prototype._checkSgnFloorUnlockBlock = function(expression) {
        if (typeof expression !== 'string' || !expression) return null;
        const gc = this.gameController;
        if (!gc) return null;
        // 测试模式始终允许
        if (typeof gc.isTestMode === 'function' && gc.isTestMode()) return null;
        const lower = expression.toLowerCase();
        const usesSgn = /\bsgn\b/.test(lower);
        const usesFloor = /\bfloor\b/.test(lower);
        if (usesSgn) {
            const allowed = typeof this.isSgnAllowedInContext === 'function' && this.isSgnAllowedInContext();
            const unlocked = typeof this.isSgnUnlocked === 'function' && this.isSgnUnlocked();
            if (!allowed || !unlocked) return '当前模式/难度下无法使用 sgn（需通关专家难度，且仅困难及以上/对战专家难度可用）';
        }
        if (usesFloor) {
            const allowed = typeof this.isFloorAllowedInContext === 'function' && this.isFloorAllowedInContext();
            const unlocked = typeof this.isFloorUnlocked === 'function' && this.isFloorUnlocked();
            if (!allowed || !unlocked) return '当前模式/难度下无法使用 floor（需通关无解难度，且仅困难及以上/对战专家难度可用）';
        }
        return null;
    }

// _updateFractionClearedAndNotify — 更新分数关进度，并在首次全通时弹出解锁提示
    UIController.prototype._updateFractionClearedAndNotify = function(denom) {
        const before = (typeof this.getCampaignFractionClearedMax === 'function')
            ? this.getCampaignFractionClearedMax() : 0;
        this.setCampaignFractionClearedMax(Math.max(before, Number(denom) || 2));
        const after = (typeof this.getCampaignFractionClearedMax === 'function')
            ? this.getCampaignFractionClearedMax() : before;
        if (after >= 20 && before < 20) {
            setTimeout(() => this.showInverseTrigUnlockModal(), 300);
        }
    }

// ─── 对战函数启用设置 ─────────────────────────────────────────

// refreshInverseTrigHint — 已解锁反三角但当前难度为"简单"时，对战函数面板中反三角按钮会被隐藏
// （isInverseTrigHideContext → isEasyMode() true → shouldHideInverseTrigElement true）。
// 玩家看不到反三角按钮会困惑，所以在「对战函数设置」按钮下方追加一行黄字提示。
    UIController.prototype.refreshInverseTrigHint = function() {
        const unlocked = this.isInverseTrigUnlocked();
        const _diffVal = (this.difficultySelect && this.difficultySelect.value)
            || (this.difficultyOptions && this.difficultyOptions[this.currentDifficultyIndex]
                && this.difficultyOptions[this.currentDifficultyIndex].value);
        const _isEasyNow = unlocked && _diffVal === 'easy';
        const anchor = this.functionPanelBtn || document.getElementById('function-panel-btn');
        let _hint = document.getElementById('inverse-trig-difficulty-hint');
        if (_isEasyNow && anchor && anchor.parentNode) {
            if (!_hint) {
                _hint = document.createElement('div');
                _hint.id = 'inverse-trig-difficulty-hint';
                _hint.style.cssText = 'font-size:12px;color:#ffffff;text-align:left;margin-top:6px;line-height:1.4;';
                anchor.parentNode.insertBefore(_hint, anchor.nextSibling);
            }
            _hint.textContent = '当前为简单难度，不显示反三角函数。请切换至普通或专家难度。';
        } else if (_hint) {
            _hint.remove();
        }
    }
;

// getFunctionEnabled — 读取某个函数是否启用（默认开启）
    UIController.prototype.getFunctionEnabled = function(name) {
        try {
            const raw = localStorage.getItem('function_chess_function_enabled_' + name);
            if (raw === null) return true;
            return raw === '1';
        } catch (e) {
            return true;
        }
    }
;

// setFunctionEnabled — 写入某个函数是否启用
    UIController.prototype.setFunctionEnabled = function(name, v) {
        try {
            localStorage.setItem('function_chess_function_enabled_' + name, v ? '1' : '0');
        } catch (e) { }
    }
;

// getFunctionSettingList — 对战可选函数列表（仅需解锁的函数：反三角 / sgn / floor）
    UIController.prototype.getFunctionSettingList = function() {
        return [
            { name: 'asin', display: 'asin', desc: '反正弦（通关全部分数关解锁）' },
            { name: 'acos', display: 'acos', desc: '反余弦（通关全部分数关解锁）' },
            { name: 'atan', display: 'atan', desc: '反正切（通关全部分数关解锁）' },
            { name: 'sgn', display: 'sgn', desc: '符号函数（专家难度通关解锁）' },
            { name: 'floor', display: 'floor', desc: '向下取整（无解难度通关解锁）' }
        ];
    }
;

// isFunctionSettingLocked — 该函数在当前是否未解锁（未解锁则即使勾选也无法使用）
    UIController.prototype.isFunctionSettingLocked = function(name) {
        if (name === 'asin' || name === 'acos' || name === 'atan') return !this.isInverseTrigUnlocked();
        if (name === 'sgn') return !this.isSgnUnlocked();
        if (name === 'floor') return !this.isFloorUnlocked();
        return false; // 其余基础函数始终可用
    }
;

// refreshFunctionPanelBtn — 同步开始界面「对战函数设置」按钮文案（显示禁用数量）
    UIController.prototype.refreshFunctionPanelBtn = function() {
        const btn = this.functionPanelBtn || document.getElementById('function-panel-btn');
        if (!btn) return;
        const list = this.getFunctionSettingList();
        const disabledCount = list.filter(f => !this.getFunctionEnabled(f.name)).length;
        const label = btn.querySelector('span') || btn;
        // 按钮已有 svg 图标，直接更新文字
        if (!btn.querySelector('span')) {
            const icon = btn.querySelector('svg');
            const span = document.createElement('span');
            if (icon) btn.insertBefore(span, icon.nextSibling);
            else btn.appendChild(span);
        }
        const span = btn.querySelector('span');
        if (span) {
            span.textContent = disabledCount > 0
                ? `对战函数设置（${disabledCount} 个已禁用）`
                : '对战函数设置';
        }
    }
;

// showFunctionSettingsModal — 打开对战函数设置面板（按钮式：点击切换启用/禁用）
    UIController.prototype.showFunctionSettingsModal = function() {
        const modal = document.getElementById('function-settings-modal');
        if (!modal) return;
        const listEl = document.getElementById('function-settings-list');
        if (listEl) {
            listEl.innerHTML = '';
            this.getFunctionSettingList().forEach(f => {
                const locked = this.isFunctionSettingLocked(f.name);
                const enabled = !locked && this.getFunctionEnabled(f.name);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'function-setting-item' + (enabled ? ' active' : '') + (locked ? ' locked' : '');
                btn.disabled = locked;
                btn.innerHTML =
                    `<span class="fs-text"><span class="fs-name">${f.display}</span><span class="fs-desc">${f.desc}</span></span>` +
                    `<span class="fs-state">${locked ? '未解锁' : (enabled ? '已启用' : '已禁用')}</span>`;
                btn.addEventListener('click', () => {
                    if (window.audioManager) window.audioManager.playClick();
                    this.setFunctionEnabled(f.name, !this.getFunctionEnabled(f.name));
                    const nEn = this.getFunctionEnabled(f.name);
                    btn.classList.toggle('active', nEn);
                    const st = btn.querySelector('.fs-state');
                    if (st) st.textContent = nEn ? '已启用' : '已禁用';
                    this.refreshFunctionPanelBtn();
                });
                listEl.appendChild(btn);
            });
        }
        const closeBtn = document.getElementById('function-settings-close');
        if (closeBtn) {
            const onClose = () => {
                if (window.audioManager) window.audioManager.playClick();
                this.hideModal(modal);
                this.refreshFunctionPanelBtn();
            };
            closeBtn.onclick = onClose;
        }
        if (typeof this.bindModalDismiss === 'function') this.bindModalDismiss(modal);
        this.showModal(modal);
    }
;

