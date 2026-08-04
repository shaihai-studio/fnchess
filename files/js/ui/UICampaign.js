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
        const host = this.confirmBtn?.parentElement;
        if (!host) return;
        const wrap = document.createElement('div');
        wrap.id = 'campaign-draw-delay-toggle';
        wrap.style.display = 'none';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '4px';
        wrap.style.marginLeft = '8px';
        wrap.style.padding = '2px 4px';
        wrap.style.borderRadius = '999px';
        wrap.style.background = 'rgba(255,255,255,0.08)';
        wrap.style.border = '1px solid rgba(255,255,255,0.12)';
        wrap.style.userSelect = 'none';
        wrap.innerHTML = `
            <span style="font-size:11px;color:#e5e7eb;opacity:.85;">延迟</span>
            <button class="campaign-delay-btn" data-delay="0">0s</button>
            <button class="campaign-delay-btn" data-delay="1000">1s</button>
            <button class="campaign-delay-btn" data-delay="5000">5s</button>
        `;
        const styleBtn = (btn) => {
            btn.style.minWidth = '30px';
            btn.style.height = '22px';
            btn.style.padding = '0 6px';
            btn.style.borderRadius = '999px';
            btn.style.border = 'none';
            btn.style.fontSize = '11px';
            btn.style.cursor = 'pointer';
        };
        wrap.querySelectorAll('.campaign-delay-btn').forEach(btn => {
            styleBtn(btn);
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
        wrap.style.display = (this.gameController?.gameMode === 'campaign') ? 'inline-flex' : 'none';
    }
;

// updateCampaignDrawDelayToggle
    UIController.prototype.updateCampaignDrawDelayToggle = function() {
        const wrap = document.getElementById('campaign-draw-delay-toggle');
        if (!wrap) return;
        wrap.querySelectorAll('.campaign-delay-btn').forEach(btn => {
            const active = Number(btn.dataset.delay) === this.campaignDrawDelay;
            btn.style.background = active ? '#4d8c5e' : 'rgba(255,255,255,0.12)';
            btn.style.color = active ? '#fff' : '#e5e7eb';
            btn.style.boxShadow = active ? '0 0 0 1px rgba(255,255,255,0.18) inset' : 'none';
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

// renderCampaignStarProgress
    UIController.prototype.renderCampaignStarProgress = function(starCount) {
        if (!this.campaignStarProgress) return;
        const totalSlots = 500;
        const filled = Math.max(0, Math.min(totalSlots, Number(starCount) || 0));
        const pct = Math.max(0, Math.min(100, (filled / totalSlots) * 100));
        const starSvg = `<svg class="star filled race-star" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 10l14.5 27.7L102 43l-20 19.5L86.7 90 60 75.8 33.3 90 38 62.5 18 43l27.5-5.3L60 10Z"/></svg>`;
        this.campaignStarProgress.innerHTML = `
            <div class="campaign-star-bar">
                <div class="campaign-star-bar-fill" style="width:${pct}%;"></div>
                <div class="campaign-star-bar-glow" style="width:${pct}%;"></div>
            </div>
            <span class="star-count">${filled}/${totalSlots}${starSvg}</span>
        `;
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
            if (bestRecord === null || !Number.isFinite(bestRecord)) {
                this.campaignVictoryText.innerHTML = `${levelText} 记录：<span style="color:#fff">${length}</span>`;
            } else if (data.isNewRecord) {
                const previousBest = Number(data.previousBest);
                const diff = previousBest > 0 ? previousBest - length : null;
                this.campaignVictoryText.innerHTML = Number.isFinite(diff)
                    ? `new record：${length} <span style="color:#22c55e;">（-${diff}）</span>`
                    : `new record：${length}`;
            } else {
                const diff = length - bestRecord;
                this.campaignVictoryText.innerHTML = `best record：${bestRecord} &nbsp;&nbsp;&nbsp; score：${length} <span style="color:#ef4444;">(+${diff})</span>`;
            }
        }
        const starCount = Math.max(1, Math.min(5, Number(data.score) || 1));
        this.renderCampaignVictoryStars(starCount);
        this.campaignVictoryModal.dataset.levelId = String(levelId);
        this.campaignVictoryModal.dataset.totalLevels = String(data.totalLevels || (this.campaignPack && this.campaignPack.levels ? this.campaignPack.levels.length : 0));
        this.campaignVictoryModal.dataset.difficulty = data.difficulty || this.campaignDifficulty || '';
        this.campaignVictoryModal.dataset.stars = String(starCount);
        this.campaignVictoryModal.dataset.length = String(length);
        this.campaignVictoryModal.dataset.isFraction = isFraction ? '1' : '0';
        // 排行榜：闯关 LR∑ 积分变化时自动上报（官方关卡；自制关卡不参与官方排行榜）
        // 记录上次已上报值，仅当积分高于它才上报，避免重复请求（排行榜保留历史最高分）
        if (!isCustom && this._leaderboardService && typeof PlayerProfile !== 'undefined') {
            try {
                const lrSigma = this.calculateLRSigma(this.getCampaignClearedMax());
                if (Number.isFinite(lrSigma) && lrSigma > 0) {
                    const last = Number(localStorage.getItem('function_chess_lr_last_upload') || 0);
                    if (lrSigma > last) {
                        try { localStorage.setItem('function_chess_lr_last_upload', String(lrSigma)); } catch (e2) { /* 忽略 */ }
                        const profile = PlayerProfile.getProfile();
                        this._leaderboardService.submitLRSigma(lrSigma, profile.nickname);
                    }
                }
            } catch (e) { /* 上报失败静默降级，不影响结算界面 */ }
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

// setCampaignLevelBestRecord
    UIController.prototype.setCampaignLevelBestRecord = function(levelId, length) {
        try {
            localStorage.setItem(`function_chess_campaign_best_${levelId}`, String(length));
        } catch (e) { }
    }
;

// renderCampaignVictoryStars
    UIController.prototype.renderCampaignVictoryStars = function(count) {
        if (!this.campaignVictoryModal) return;
        let stars = this.campaignVictoryModal.querySelector('.campaign-victory-stars');
        if (!stars) {
            stars = document.createElement('div');
            stars.className = 'campaign-victory-stars';
            this.campaignVictoryModal.querySelector('.campaign-victory-content')?.insertBefore(stars, this.campaignVictoryText || null);
        }
        const filled = Math.max(1, Math.min(5, count));
        stars.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 120 120');
            svg.setAttribute('aria-hidden', 'true');
            svg.classList.add('star');
            if (i <= filled) svg.classList.add('filled');
            svg.innerHTML = '<path d="M60 14c3.1 0 5.6 1.6 6.9 4.3l11.3 22.9 25.3 3.7c3 .5 5.5 2.5 6.5 5.4 1 2.9.3 6-1.9 8.2L90 74.5l4.5 25.1c.5 3.1-.7 6.2-3.1 8-2.5 1.8-5.8 2.1-8.5.7L60 96.1 37.1 108.3c-2.7 1.4-6 .1-8.5-.7-2.4-1.8-3.6-4.9-3.1-8L30 74.5 12.9 54.5c-2.2-2.2-2.9-5.3-1.9-8.2 1-2.9 3.5-4.9 6.5-5.4l25.3-3.7L54.1 18.3C55.4 15.6 57.9 14 61 14Z"/>';
            stars.appendChild(svg);
        }
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
        const starCount = stars === null ? this.getCampaignCollectedStars() : stars;
        this.campaignGlobalProgress.textContent = total > 0
            ? `已通关 ${cleared}/${visibleTotal}`
            : '未加载关卡：请导入 levels.json（本地打开HTML时浏览器可能拦截自动读取）';
        if (this.campaignStarProgress) {
            this.renderCampaignStarProgress(starCount);
        }
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
                message: '请再次确认：重置后将无法恢复已保存的闯关数据。\n真的要继续吗？',
                options: [
                    { label: '取消', value: false },
                    { label: '确认重置', value: true }
                ],
                showSkip: false
            });
            if (!secondConfirm) return;

            localStorage.removeItem('function_chess_campaign_cleared');
            localStorage.removeItem('function_chess_campaign_fraction_cleared');
            localStorage.removeItem('function_chess_campaign_stars');
            for (let i = 1; i <= 90; i++) {
                localStorage.removeItem(`function_chess_campaign_best_${i}`);
                localStorage.removeItem(`function_chess_campaign_best_stars_${i}`);
            }
            for (let d = 2; d <= 20; d++) {
                localStorage.removeItem(`function_chess_campaign_best_1/${d}`);
                localStorage.removeItem(`function_chess_campaign_best_stars_1/${d}`);
            }
            this.campaignCurrentLevelBestRecord = null;
            this.showMessage('✅ 闯关进度已重置', 'success');
            this.updateCampaignGlobalProgressText(0);
            this.refreshUnsovableDifficultyVisibility();
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
            this.campaignLevelProgress.textContent = `已通关 ${fracCleared}/19，${enterHint}`;
        } else {
            const unlockedMax = Math.min(total, cleared + 1);
            this.campaignLevelProgress.textContent = `已通关 ${cleared}/${total}，当前可进入 ≤ ${unlockedMax}`;
        }

        const makeCell = (id, locked, isCleared, label, level) => {
            const cell = document.createElement('div');
            cell.className = `campaign-level-cell ${range.cls}`;
            if (locked) cell.classList.add('locked');
            if (isCleared) cell.classList.add('cleared');

            // 星星
            const stars = isFraction ? 0 : this.getCampaignLevelBestStars(id);
            const hasStars = isCleared && stars > 0;
            const starsContainer = document.createElement('div');
            starsContainer.className = 'campaign-cell-stars';
            for (let i = 1; i <= 5; i++) {
                const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                star.setAttribute('viewBox', '0 0 120 120');
                star.setAttribute('aria-hidden', 'true');
                star.classList.add('star');
                if (hasStars && i <= stars) star.classList.add('filled');
                star.innerHTML = '<path d="M60 14c3.1 0 5.6 1.6 6.9 4.3l11.3 22.9 25.3 3.7c3 .5 5.5 2.5 6.5 5.4 1 2.9.3 6-1.9 8.2L90 74.5l4.5 25.1c.5 3.1-.7 6.2-3.1 8-2.5 1.8-5.8 2.1-8.5.7L60 96.1 37.1 108.3c-2.7 1.4-6 .1-8.5-.7-2.4-1.8-3.6-4.9-3.1-8L30 74.5 12.9 54.5c-2.2-2.2-2.9-5.3-1.9-8.2 1-2.9 3.5-4.9 6.5-5.4l25.3-3.7L54.1 18.3C55.4 15.6 57.9 14 61 14Z"/>';
                starsContainer.appendChild(star);
            }
            cell.appendChild(starsContainer);

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

// _isFractionLevelUnlocked
    UIController.prototype._isFractionLevelUnlocked = function(id) {
        const n = this._getFractionLevelNumber(id);
        if (n === null) return false;
        return n <= this.getCampaignFractionUnlockedMax();
    }

// _renderCampaignBranchTree — 分数关分支树（预留）
    UIController.prototype._renderCampaignBranchTree = function(parentDiv) {
        // 占位：目前分数关为线性 1/2 → 1/3 → ... → 1/20，无需分支树
    }
;

// ─── 反三角函数解锁机制 ─────────────────────────────────────────

// 反三角函数元素集合（解锁后可在普通及以上难度/对战中使用）
    UIController.prototype.inverseTrigElements = ['arcsin', 'arccos', 'arctan'];

// isInverseTrigUnlocked — 是否解锁：分数关全部通关（1/2~1/20，即 fracCleared >= 20）
    UIController.prototype.isInverseTrigUnlocked = function() {
        return (typeof this.getCampaignFractionClearedMax === 'function')
            && this.getCampaignFractionClearedMax() >= 20;
    }

// getInverseTrigEnabled — 显式开关（解锁后默认开启，可手动关闭）
    UIController.prototype.getInverseTrigEnabled = function() {
        try {
            const raw = localStorage.getItem('function_chess_inverse_trig_enabled');
            if (raw === null) return true;
            return raw !== '0' && raw !== 'false';
        } catch (e) {
            return true;
        }
    }

// setInverseTrigEnabled — 写入显式开关
    UIController.prototype.setInverseTrigEnabled = function(v) {
        try {
            localStorage.setItem('function_chess_inverse_trig_enabled', v ? '1' : '0');
        } catch (e) { }
    }

// isInverseTrigHideContext — 简单难度 或 分数关模式：不显示这三个按钮
    UIController.prototype.isInverseTrigHideContext = function() {
        const gc = this.gameController;
        if (!gc) return true;
        if (gc.difficulty === 'fraction') return true;
        if (typeof gc.isEasyMode === 'function' && gc.isEasyMode()) return true;
        return false;
    }

// shouldHideInverseTrigElement — 输入面板是否隐藏反三角按钮
// 简单/分数关 → 隐藏；未解锁 → 显示锁定态；已解锁 → 仅开关开启时显示
    UIController.prototype.shouldHideInverseTrigElement = function() {
        if (this.isInverseTrigHideContext()) return true;
        if (!this.isInverseTrigUnlocked()) return false;
        return !this.getInverseTrigEnabled();
    }

// _shouldSkipInverseTrigInLockView — 锁定阶段（set_locks）是否跳过反三角
// 简单/分数关、未解锁、开关关闭均跳过（未解锁元素不可被锁定）
    UIController.prototype._shouldSkipInverseTrigInLockView = function() {
        if (this.isInverseTrigHideContext()) return true;
        if (!this.isInverseTrigUnlocked()) return true;
        return !this.getInverseTrigEnabled();
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
        const progress = Math.min(100, Math.round((fracCleared / 20) * 100));
        this.showInverseTrigModal(
            '反三角函数未解锁',
            'arcsin / arccos / arctan 需要通关<b>全部分数关</b>（1/2 ~ 1/20）后解锁。<br><br>'
            + `当前分数关进度：${fracCleared} / 19（${progress}%）`
        );
    }

// showInverseTrigUnlockModal — 首次通关全部分数关时的解锁提示页面
    UIController.prototype.showInverseTrigUnlockModal = function() {
        this.showInverseTrigModal(
            '🎉 反三角函数已解锁',
            '恭喜你通关了全部分数关！<br><br>'
            + 'arcsin / arccos / arctan 现已在<b>普通及以上难度</b>与<b>对战模式</b>中解锁。<br>'
            + '可前往开始界面选择是否在面板中使用。'
        );
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

// refreshInverseTrigToggle — 同步开始界面「反三角函数」开关状态与可用性
    UIController.prototype.refreshInverseTrigToggle = function() {
        const toggle = this.inverseTrigToggle;
        if (!toggle) return;
        const unlocked = this.isInverseTrigUnlocked();
        toggle.checked = unlocked && this.getInverseTrigEnabled();
        toggle.disabled = !unlocked;
        if (this.inverseTrigToggleWrap) {
            this.inverseTrigToggleWrap.classList.toggle('disabled', !unlocked);
        }

        // 已解锁但当前难度是"简单"时，对战元素面板的反三角按钮会被隐藏
        // （isInverseTrigHideContext → isEasyMode() true → shouldHideInverseTrigElement true）。
        // 玩家勾了开关却看不到按钮会困惑，所以在开关下方追加一行黄字提示。
        const _diffVal = (this.difficultySelect && this.difficultySelect.value)
            || (this.difficultyOptions && this.difficultyOptions[this.currentDifficultyIndex]
                && this.difficultyOptions[this.currentDifficultyIndex].value);
        const _isEasyNow = unlocked && _diffVal === 'easy';
        let _hint = document.getElementById('inverse-trig-difficulty-hint');
        if (_isEasyNow && this.inverseTrigToggleWrap && this.inverseTrigToggleWrap.parentNode) {
            if (!_hint) {
                _hint = document.createElement('div');
                _hint.id = 'inverse-trig-difficulty-hint';
                _hint.style.cssText = 'font-size:12px;color:#f59e0b;margin-top:6px;line-height:1.4;';
                this.inverseTrigToggleWrap.parentNode.insertBefore(_hint, this.inverseTrigToggleWrap.nextSibling);
            }
            _hint.textContent = '⚠️ 当前为简单难度，不显示反三角函数。请切换至普通或专家难度。';
        } else if (_hint) {
            _hint.remove();
        }
    }
;

