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
    };

// setCampaignDrawDelaySetting
    UIController.prototype.setCampaignDrawDelaySetting = function(value) {
        const next = this.campaignDrawDelayOptions.includes(Number(value)) ? Number(value) : 0;
        this.campaignDrawDelay = next;
        try {
            localStorage.setItem('function_chess_campaign_draw_delay', String(next));
        } catch (e) { }
        this.updateCampaignDrawDelayToggle();
    };

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
    };

// updateCampaignDrawDelayToggleVisibility
    UIController.prototype.updateCampaignDrawDelayToggleVisibility = function() {
        const wrap = document.getElementById('campaign-draw-delay-toggle');
        if (!wrap) return;
        wrap.style.display = (this.gameController?.gameMode === 'campaign') ? 'inline-flex' : 'none';
    };

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
    };

// loadCampaignPack
    UIController.prototype.loadCampaignPack = async function() {
        if (this.campaignPack) return this.campaignPack;
        this.campaignPack = window.CAMPAIGN_LEVEL_PACK || null;
        return this.campaignPack;
    };

// getCampaignClearedMax
    UIController.prototype.getCampaignClearedMax = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_cleared');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    };

// getCampaignCollectedStars
    UIController.prototype.getCampaignCollectedStars = function() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_stars');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    };

// getCampaignLevelBestStars
    UIController.prototype.getCampaignLevelBestStars = function(levelId) {
        try {
            const raw = localStorage.getItem(`function_chess_campaign_best_stars_${levelId}`);
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    };

// setCampaignLevelBestStars
    UIController.prototype.setCampaignLevelBestStars = function(levelId, stars) {
        try {
            localStorage.setItem(`function_chess_campaign_best_stars_${levelId}`, String(Math.max(0, Number(stars) || 0)));
        } catch (e) { }
    };

// setCampaignCollectedStars
    UIController.prototype.setCampaignCollectedStars = function(stars) {
        try {
            localStorage.setItem('function_chess_campaign_stars', String(Math.max(0, Number(stars) || 0)));
        } catch (e) { }
    };

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
    };

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
    };

// startCampaign
    UIController.prototype.startCampaign = async function(startLevelId) {
        const pack = await this.loadCampaignPack();
        if (!pack) {
            this.showMessage('关卡未加载：请先加载内置关卡数据', 'error');
            this.openCampaignUI();
            return;
        }
        const safeStart = Number(startLevelId) || 1;
        this.campaignCurrentLevelId = safeStart;
        this.campaignCurrentLevelBestRecord = this.getCampaignLevelBestRecord(safeStart);
        this._markGameActive();
        this.gameController.initCampaign(pack, safeStart);
        if (this.gridSystem && this.gridSystem.setCampaignFixedRange) {
            this.gridSystem.setCampaignFixedRange(true);
        }
    };

// showCampaignVictory
    UIController.prototype.showCampaignVictory = function(data) {
        if (!this.campaignVictoryModal) return;
        this.campaignCurrentLevelId = data.levelId || this.campaignCurrentLevelId;
        const levelId = Number(this.campaignCurrentLevelId || data.levelId || 1);
        const bestRecord = Number.isFinite(Number(this.campaignCurrentLevelBestRecord)) ? Number(this.campaignCurrentLevelBestRecord) : null;
        const length = Number.isFinite(Number(data.expressionLength)) ? Number(data.expressionLength) : this.getCurrentExpressionLength();
        const levelText = `第 ${levelId} 关`;
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
        this.showModal(this.campaignVictoryModal);
    };

// hideCampaignVictory
    UIController.prototype.hideCampaignVictory = function() {
        if (this.campaignVictoryModal) this.hideModal(this.campaignVictoryModal);
    };

// getCampaignLevelBestRecord
    UIController.prototype.getCampaignLevelBestRecord = function(levelId) {
        try {
            const raw = localStorage.getItem(`function_chess_campaign_best_${levelId}`);
            const n = raw ? Number(raw) : null;
            return Number.isFinite(n) ? n : null;
        } catch (e) {
            return null;
        }
    };

// setCampaignLevelBestRecord
    UIController.prototype.setCampaignLevelBestRecord = function(levelId, length) {
        try {
            localStorage.setItem(`function_chess_campaign_best_${levelId}`, String(length));
        } catch (e) { }
    };

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
    };

// retryCampaignLevel
    UIController.prototype.retryCampaignLevel = function() {
        if (!this.campaignPack) return;
        const levelId = Number(this.campaignCurrentLevelId || this.campaignVictoryModal?.dataset.levelId || 1);
        this.hideCampaignVictory();
        this.startCampaign(levelId);
    };

// goToNextCampaignLevel
    UIController.prototype.goToNextCampaignLevel = async function() {
        if (!this.campaignPack) return;
        const current = Number(this.campaignCurrentLevelId || this.campaignVictoryModal?.dataset.levelId || 1);
        const nextId = current + 1;
        const total = this.campaignPack && Array.isArray(this.campaignPack.levels) ? this.campaignPack.levels.length : 0;
        this.hideCampaignVictory();
        if (nextId > total) {
            this.showMessage('✅ 已经是最后一关', 'success');
            this.openCampaignUI();
            return;
        }
        this.startCampaign(nextId);
    };

// returnToCampaignLevelSelect
    UIController.prototype.returnToCampaignLevelSelect = function() {
        this.hideCampaignVictory();
        if (this.campaignModal) this.showModal(this.campaignModal);
        this.showCampaignDifficulty();
        this.refreshCampaignStartUI();
    };

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
    };

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
    };

// closeCampaignUI
    UIController.prototype.closeCampaignUI = function() {
        // ★ 强制停止当前对局（闯关中退出时）
        this.forceStopGame();
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
    };

// showCampaignDifficulty
    UIController.prototype.showCampaignDifficulty = function() {
        if (this.campaignStepLevels) this.campaignStepLevels.style.display = 'none';
        if (this.campaignStepDifficulty) this.campaignStepDifficulty.style.display = 'block';
        const badge = document.getElementById('campaign-level-badge');
        if (badge) badge.style.display = 'none';
        this.campaignDifficulty = null;
        this.updateCampaignGlobalProgressText();
    };

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
    };

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
    };

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
            localStorage.removeItem('function_chess_campaign_stars');
            for (let i = 1; i <= 90; i++) {
                localStorage.removeItem(`function_chess_campaign_best_${i}`);
                localStorage.removeItem(`function_chess_campaign_best_stars_${i}`);
            }
            this.campaignCurrentLevelBestRecord = null;
            this.showMessage('✅ 闯关进度已重置', 'success');
            this.updateCampaignGlobalProgressText(0);
            this.refreshUnsovableDifficultyVisibility();
        } catch (e) {
            this.showMessage('❌ 重置失败', 'error');
        }
    };

// openCampaignLevels
    UIController.prototype.openCampaignLevels = function(diff) {
        this.campaignDifficulty = diff;
        if (this.campaignStepDifficulty) this.campaignStepDifficulty.style.display = 'none';
        if (this.campaignStepLevels) this.campaignStepLevels.style.display = 'block';
        this.renderCampaignLevelGrid();
    };

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

        const range = this.getDifficultyRange(diff);
        const currentLevelId = Number(levelId ?? this.campaignCurrentLevelId ?? range.start);
        const bestRecord = this.getCampaignLevelBestRecord(currentLevelId);

        // 根据关卡号确定颜色，而不是根据 difficulty
        let color, bgColor, borderColor;
        if (currentLevelId >= 82) { // 无解（82-90）
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
    };

// renderCampaignLevelGrid
    UIController.prototype.renderCampaignLevelGrid = function() {
        if (!this.campaignLevelGrid || !this.campaignLevelTitle || !this.campaignLevelProgress) return;
        const range = this.getDifficultyRange(this.campaignDifficulty);
        this.campaignLevelTitle.textContent = `选择关卡：${range.label}`;

        const cleared = this.getCampaignClearedMax();
        const total = this.campaignPack && Array.isArray(this.campaignPack.levels) ? this.campaignPack.levels.length : 0;
        const unlockedMax = Math.min(total, cleared + 1);
        this.campaignLevelProgress.textContent = `已通关 ${cleared}/${total}，当前可进入 ≤ ${unlockedMax}`;

        this.campaignLevelGrid.innerHTML = '';
        for (let id = range.start; id <= range.end; id++) {
            const cell = document.createElement('div');
            cell.className = `campaign-level-cell ${range.cls}`;

            const locked = id > unlockedMax;
            if (locked) cell.classList.add('locked');
            if (id <= cleared) cell.classList.add('cleared');

            // 检查通关后获得的星星
            const stars = this.getCampaignLevelBestStars(id);
            const hasStars = id <= cleared && stars > 0;

            // 创建星星显示区
            {
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
            }

            // 创建关卡数字
            const numberSpan = document.createElement('span');
            numberSpan.className = 'campaign-cell-number';
            numberSpan.textContent = String(id);
            cell.appendChild(numberSpan);

            cell.addEventListener('click', async () => {
                if (locked) return;
                if (window.audioManager) window.audioManager.playClick();
                // 进入游戏界面
                if (this.campaignModal) this.hideModal(this.campaignModal);
                this.startCampaign(id).catch(err => console.error('[Campaign] startCampaign failed:', err));
            });
            this.campaignLevelGrid.appendChild(cell);
        }
    };

