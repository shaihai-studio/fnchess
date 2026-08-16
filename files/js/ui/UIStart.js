// Auto-split from UIController.js — prototype-attached methods (UIStart)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIStart] UIController must be loaded before this file');
}

// initStartSelectors
    UIController.prototype.initStartSelectors = function() {
        this.roundOptions = [
            { value: 8, label: '8 回合（快速对战）', shortLabel: '8 回合' },
            { value: 12, label: '12 回合（深度对战）', shortLabel: '12 回合' },
            { value: 16, label: '16 回合（持久战）', shortLabel: '16 回合' },
            { value: 20, label: '20 回合（极限挑战）', shortLabel: '20 回合' },
            { value: 24, label: '24 回合（终极对决）', shortLabel: '24 回合' }
        ];
        this.difficultyOptions = [
            { value: 'easy', label: '简单 - 1个目标格', shortLabel: '简单' },
            { value: 'normal', label: '普通 - 2个目标格', shortLabel: '普通' },
            { value: 'expert', label: '专家 - 3个目标格', shortLabel: '专家' }
        ];
        this.timeLimitOptions = [
            { value: 'super_slow', label: '超慢棋', multiplier: 2.0 },
            { value: 'slow', label: '慢棋', multiplier: 1.5 },
            { value: 'normal', label: '普通棋', multiplier: 1.0 },
            { value: 'fast', label: '快棋', multiplier: 0.75 },
            { value: 'super_fast', label: '超快棋', multiplier: 0.5 }
        ];
        const currentRoundValue = this.roundSelect ? Number(this.roundSelect.value || 8) : 8;
        const currentDifficultyValue = this.difficultySelect ? this.difficultySelect.value : 'easy';
        this.currentRoundIndex = this.roundOptions.findIndex(o => o.value === currentRoundValue);
        this.currentDifficultyIndex = this.difficultyOptions.findIndex(o => o.value === currentDifficultyValue);
        this.currentTimeLimitIndex = 2;
        if (this.currentRoundIndex < 0) this.currentRoundIndex = 0;
        if (this.currentDifficultyIndex < 0) this.currentDifficultyIndex = 0;
        this.bindStepperButtons();
        if (!this._selectorLabelResizeBound) {
            this._selectorLabelResizeBound = true;
            window.addEventListener('resize', () => {
                this.refreshStartSelectorDisplay();
                if (typeof this._refreshP2PStepperDisplay === 'function') this._refreshP2PStepperDisplay();
            });
        }
        this.refreshStartSelectorDisplay();
        this.syncStartSelectionState();
    }
;

// bindStepperButtons
    UIController.prototype.bindStepperButtons = function() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        bind('round-prev', () => this.stepRound(-1));
        bind('round-next', () => this.stepRound(1));
        bind('time-limit-prev', () => this.stepTimeLimit(-1));
        bind('time-limit-next', () => this.stepTimeLimit(1));
        bind('difficulty-prev', () => this.stepDifficulty(-1));
        bind('difficulty-next', () => this.stepDifficulty(1));
    }
;

// applySelectedTimeLimitMode
    UIController.prototype.applySelectedTimeLimitMode = function() {
        const mode = this.timeLimitOptions[this.currentTimeLimitIndex ?? 2]?.value || 'normal';
        this.selectedTimeLimitMode = mode;
        if (this.gameController) {
            this.gameController.timeLimitMode = mode;
        }
    }
;

// playSelectorChangeFeedback
    UIController.prototype.playSelectorChangeFeedback = function(host) {
        if (window.audioManager) window.audioManager.playRaceAlert?.();
        if (!host) return;
        host.classList.remove('selector-change');
        void host.offsetWidth;
        host.classList.add('selector-change');
        clearTimeout(this._selectorChangeTimeout);
        this._selectorChangeTimeout = setTimeout(() => host.classList.remove('selector-change'), 220);
    }
;

// getSelectorLabel
    UIController.prototype.getSelectorLabel = function(option) {
        if (option && window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
            return option.shortLabel || option.label;
        }
        return option ? option.label : '';
    }
;

// refreshStartSelectorDisplay
    UIController.prototype.refreshStartSelectorDisplay = function() {
        if (this.roundValue && this.roundOptions && this.roundOptions.length) {
            const idx = Math.min(this.roundOptions.length - 1, Math.max(0, this.currentRoundIndex || 0));
            const option = this.roundOptions[idx];
            this.roundValue.textContent = this.getSelectorLabel(option);
            this.roundValue.dataset.value = String(option.value);
            this.roundValue.style.color = this.getRoundColor(option.value);
            this.applyStepperColors('round', option.value);
        }
        if (this.difficultyValue && this.difficultyOptions && this.difficultyOptions.length) {
            const idx = Math.min(this.difficultyOptions.length - 1, Math.max(0, this.currentDifficultyIndex || 0));
            const option = this.difficultyOptions[idx];
            this.difficultyValue.textContent = this.getSelectorLabel(option);
            this.difficultyValue.dataset.value = option.value;
            this.difficultyValue.style.color = this.getDifficultyColor(option.value);
            this.applyStepperColors('difficulty', option.value);
        }
        if (this.timeLimitValue && this.timeLimitOptions && this.timeLimitOptions.length) {
            const idx = Math.min(this.timeLimitOptions.length - 1, Math.max(0, this.currentTimeLimitIndex ?? 2));
            const option = this.timeLimitOptions[idx];
            this.timeLimitValue.textContent = this.getSelectorLabel(option);
            this.timeLimitValue.dataset.value = option.value;
            this.timeLimitValue.style.color = this.getTimeLimitColor(option.value);
            this.applyStepperColors('time', option.value);
        }
        if (this.difficultyHint) {
            this.difficultyHint.textContent = '';
        }
        this.applyStartModeLayout();
    }
;

// initModeConfigModal —— 本地/人机对战 配置确认弹窗事件绑定
    UIController.prototype.initModeConfigModal = function() {
        if (!this.modeConfigModal || this._modeConfigModalBound) return;
        this._modeConfigModalBound = true;
        this.modeConfigTitle = document.getElementById('mode-config-title');
        this.modeConfigDifficultyValue = document.getElementById('mode-config-difficulty-value');
        this.modeConfigRoundValue = document.getElementById('mode-config-round-value');
        this.modeConfigTimeValue = document.getElementById('mode-config-time-value');
        const cfgPrevDiff = document.getElementById('mode-config-difficulty-prev');
        const cfgNextDiff = document.getElementById('mode-config-difficulty-next');
        const cfgPrevRound = document.getElementById('mode-config-round-prev');
        const cfgNextRound = document.getElementById('mode-config-round-next');
        const cfgPrevTime = document.getElementById('mode-config-time-prev');
        const cfgNextTime = document.getElementById('mode-config-time-next');
        const cancelBtn = document.getElementById('mode-config-cancel');
        const confirmBtn = document.getElementById('mode-config-confirm');
        if (cfgPrevDiff) cfgPrevDiff.addEventListener('click', () => { this.stepDifficulty(-1); this._syncModeConfigDisplay(); });
        if (cfgNextDiff) cfgNextDiff.addEventListener('click', () => { this.stepDifficulty(1); this._syncModeConfigDisplay(); });
        if (cfgPrevRound) cfgPrevRound.addEventListener('click', () => { this.stepRound(-1); this._syncModeConfigDisplay(); });
        if (cfgNextRound) cfgNextRound.addEventListener('click', () => { this.stepRound(1); this._syncModeConfigDisplay(); });
        if (cfgPrevTime) cfgPrevTime.addEventListener('click', () => { this.stepTimeLimit(-1); this._syncModeConfigDisplay(); });
        if (cfgNextTime) cfgNextTime.addEventListener('click', () => { this.stepTimeLimit(1); this._syncModeConfigDisplay(); });
        if (cancelBtn) cancelBtn.addEventListener('click', () => this._cancelModeConfig());
        if (confirmBtn) confirmBtn.addEventListener('click', () => this._confirmModeConfig());
        // 点击遮罩（弹窗外部）→ 取消
        this.modeConfigModal.addEventListener('click', (e) => {
            if (e.target === this.modeConfigModal) this._cancelModeConfig();
        });
    }
;

// _openModeConfigModal —— 打开本地/人机对战配置确认弹窗
    UIController.prototype._openModeConfigModal = function(subMode) {
        if (!this.modeConfigModal) return;
        const isAi = subMode === 'ai';
        this._modeConfigTarget = subMode;
        if (this.modeConfigTitle) this.modeConfigTitle.textContent = isAi ? '人机对战' : '本地对战';
        this._syncModeConfigDisplay();
        this.showModal(this.modeConfigModal);
    }
;

// _syncModeConfigDisplay —— 同步配置确认弹窗内三个选择器的显示
    UIController.prototype._syncModeConfigDisplay = function() {
        if (!this.modeConfigModal) return;
        if (this.modeConfigRoundValue && this.roundOptions && this.roundOptions.length) {
            const idx = Math.min(this.roundOptions.length - 1, Math.max(0, this.currentRoundIndex || 0));
            const option = this.roundOptions[idx];
            this.modeConfigRoundValue.textContent = this.getSelectorLabel(option);
            this.modeConfigRoundValue.style.color = this.getRoundColor(option.value);
        }
        if (this.modeConfigDifficultyValue && this.difficultyOptions && this.difficultyOptions.length) {
            const idx = Math.min(this.difficultyOptions.length - 1, Math.max(0, this.currentDifficultyIndex || 0));
            const option = this.difficultyOptions[idx];
            this.modeConfigDifficultyValue.textContent = this.getSelectorLabel(option);
            this.modeConfigDifficultyValue.style.color = this.getDifficultyColor(option.value);
        }
        if (this.modeConfigTimeValue && this.timeLimitOptions && this.timeLimitOptions.length) {
            const idx = Math.min(this.timeLimitOptions.length - 1, Math.max(0, this.currentTimeLimitIndex ?? 2));
            const option = this.timeLimitOptions[idx];
            this.modeConfigTimeValue.textContent = this.getSelectorLabel(option);
            this.modeConfigTimeValue.style.color = this.getTimeLimitColor(option.value);
        }
    }
;

// _confirmModeConfig —— 配置确认：关闭弹窗并按当前配置开局
    UIController.prototype._confirmModeConfig = function() {
        if (window.audioManager) window.audioManager.playClick();
        if (this.modeConfigModal) this.hideModal(this.modeConfigModal);
        this.handleStart();
    }
;

// _cancelModeConfig —— 取消配置弹窗，返回主界面
    UIController.prototype._cancelModeConfig = function() {
        if (window.audioManager) window.audioManager.playClick();
        if (this.modeConfigModal) this.hideModal(this.modeConfigModal);
    }
;

// syncStartSelectionState
    UIController.prototype.syncStartSelectionState = function() {
        this.syncModeButtonsFromDifficulty();
        this.applySelectedTimeLimitMode();
        this.refreshStartSelectorDisplay();
        this.applyStartModeLayout();
    }
;

// syncModeButtonsFromDifficulty
    UIController.prototype.syncModeButtonsFromDifficulty = function() {
        if (!this.modeAiBtn || !this.modeLocalBtn || !this.modeCampaignBtn || !this.modeRaceBtn || !this.modeTestBtn) return;

        // 子模式按钮不做默认高亮（本地/人机/联机对战、经典闯关/编辑器、标准竞速/试炼场/联机竞速），仅 CSS :hover 悬停高亮
        const isBattle = this.selectedMode === 'battle';
        this.modeBattleBtn.classList.toggle('active', isBattle);
        this.modeCampaignBtn.classList.toggle('active', this.selectedMode === 'campaign');
        this.modeRaceBtn.classList.toggle('active', this.selectedMode === 'race');
        this.modeTestBtn.classList.toggle('active', this.selectedMode === 'test');
        const isCampaign = this.selectedMode === 'campaign';

        if (this.modeAiBtn) {
            this.modeAiBtn.disabled = false;
            this.modeAiBtn.style.opacity = '1';
            this.modeAiBtn.style.cursor = 'pointer';
            this.modeAiBtn.title = '';
        }

        const lockSelectors = isCampaign || this.selectedMode === 'test' || this.selectedMode === 'race' || (this.selectedMode === 'battle' && this._battleSubMode === 'p2p');
        this.setStartSelectorsEnabled(!lockSelectors);
        [this.roundStepper, this.difficultyStepper, this.timeLimitStepper].forEach(el => {
            if (!el) return;
            el.classList.toggle('disabled', lockSelectors);
        });
    }
;

// applyStartModeLayout
    UIController.prototype.applyStartModeLayout = function() {
        const layout = document.querySelector('.start-settings-layout');
        const left = document.querySelector('.start-modes-left');
        const right = document.querySelector('.start-selectors-right');
        if (!layout || !left || !right) return;
        const isNarrow = window.innerWidth < 720;
        layout.style.flexDirection = isNarrow ? 'column' : 'row';
        left.style.flexBasis = isNarrow ? 'auto' : '170px';
        right.style.flexBasis = isNarrow ? 'auto' : '1';
    }
;

// setStartSelectorsEnabled
    UIController.prototype.setStartSelectorsEnabled = function(enabled) {
        const controls = [this.roundStepper, this.difficultyStepper, this.timeLimitStepper, this.roundValue, this.difficultyValue, this.timeLimitValue];
        controls.forEach(el => {
            if (!el) return;
            el.style.pointerEvents = enabled ? '' : 'none';
            el.style.opacity = enabled ? '' : '0.55';
        });
        if (this.roundSelect) this.roundSelect.disabled = !enabled;
        if (this.difficultySelect) this.difficultySelect.disabled = !enabled;
        [this.roundStepper, this.difficultyStepper, this.timeLimitStepper].forEach(el => {
            if (!el) return;
            el.classList.toggle('disabled', !enabled);
        });
    }
;

// applyStepperColors
    UIController.prototype.applyStepperColors = function(kind, value) {
        let prev, next, valueEl, theme;
        if (kind === 'round') {
            prev = document.getElementById('round-prev');
            next = document.getElementById('round-next');
            valueEl = this.roundValue;
            theme = {
                8: { bg: 'rgba(96, 165, 250, 0.12)', fg: '#7a9bb5', shadow: 'rgba(96,165,250,0.10)' },
                12: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#6b9f8e', shadow: 'rgba(52,211,153,0.10)' },
                16: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#b8944a', shadow: 'rgba(251,191,36,0.10)' },
                20: { bg: 'rgba(249, 115, 22, 0.12)', fg: '#b87a4e', shadow: 'rgba(249,115,22,0.10)' },
                24: { bg: 'rgba(244, 63, 94, 0.12)', fg: '#b06e6e', shadow: 'rgba(244,63,94,0.10)' }
            };
        } else if (kind === 'time') {
            prev = document.getElementById('time-limit-prev');
            next = document.getElementById('time-limit-next');
            valueEl = this.timeLimitValue;
            theme = {
                super_slow: { bg: 'rgba(253, 186, 116, 0.12)', fg: '#d4a373', shadow: 'rgba(253,186,116,0.10)' },
                slow: { bg: 'rgba(250, 204, 21, 0.12)', fg: '#c9a227', shadow: 'rgba(250,204,21,0.10)' },
                normal: { bg: 'rgba(59, 130, 246, 0.12)', fg: '#6b84a8', shadow: 'rgba(59,130,246,0.10)' },
                fast: { bg: 'rgba(34, 197, 94, 0.12)', fg: '#6b9f6e', shadow: 'rgba(34,197,94,0.10)' },
                super_fast: { bg: 'rgba(168, 85, 247, 0.12)', fg: '#8b7bb0', shadow: 'rgba(168,85,247,0.10)' }
            };
        } else {
            prev = document.getElementById('difficulty-prev');
            next = document.getElementById('difficulty-next');
            valueEl = this.difficultyValue;
                theme = {
                    easy: { bg: 'rgba(34, 197, 94, 0.12)', fg: '#6b9f6e', shadow: 'rgba(34,197,94,0.10)' },
                    fraction: { bg: 'rgba(20, 184, 166, 0.12)', fg: '#14b8a6', shadow: 'rgba(20,184,166,0.25)' },
                    normal: { bg: 'rgba(59, 130, 246, 0.12)', fg: '#6b84a8', shadow: 'rgba(59,130,246,0.10)' },
                expert: { bg: 'rgba(245, 158, 11, 0.12)', fg: '#b8944a', shadow: 'rgba(245,158,11,0.10)' },
                test: { bg: 'rgba(168, 85, 247, 0.12)', fg: '#8b7bb0', shadow: 'rgba(168,85,247,0.10)' }
            };
        }
        const t = theme[value] || { bg: 'rgba(255,255,255,0.12)', fg: '#e5e7eb', shadow: 'rgba(255,255,255,0.12)' };
        [prev, next].forEach(btn => {
            if (!btn) return;
            btn.style.background = t.bg;
            btn.style.color = t.fg;
            btn.style.boxShadow = `0 0 14px ${t.shadow}`;
        });
        if (valueEl) {
            valueEl.style.transition = 'transform 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease';
            valueEl.style.color = t.fg;
            valueEl.style.borderColor = t.fg;
            valueEl.style.boxShadow = `0 0 18px ${t.shadow}`;
        }
    }
;

// selectMode
    UIController.prototype.selectMode = function(mode) {
        // Mode toggle might happen before user interacts, but if they click it we should play sound.
        // It's safe to just call playClick here.
        if (window.audioManager) {
            // Re-init audioContext on user interaction just in case
            if (window.audioManager.audioCtx && window.audioManager.audioCtx.state === 'suspended') {
                window.audioManager.audioCtx.resume();
            }
            window.audioManager.playClick();
            window.audioManager.startBgm();
        }
        
        this.selectedMode = mode;
        
        // 更新按钮状态
        const isCampaign = mode === 'campaign';
        const isTest = mode === 'test';
        const isRace = mode === 'race';
        if (this.roundStepper) this.roundStepper.classList.remove('selector-change');
        if (this.difficultyStepper) this.difficultyStepper.classList.remove('selector-change');
        // 闯关模式、测试模式、竞速模式、联机对战模式（关卡编辑器是闯关子模式，一并锁定）
        const lockSelectors = isCampaign || isTest || isRace || (mode === 'battle' && this._battleSubMode === 'p2p');
        if (this.roundStepper) {
            this.roundStepper.classList.toggle('disabled', lockSelectors);
        }
        if (this.difficultyStepper) {
            this.difficultyStepper.classList.toggle('disabled', lockSelectors);
        }
        this.setStartSelectorsEnabled(!lockSelectors);
        if (this.difficultyHint) {
            this.difficultyHint.style.display = 'none';
        }
        this.syncStartSelectionState();
        this.refreshStartSelectorDisplay();
        this.updateCampaignDrawDelayToggleVisibility();

        // 重置所有模式按钮的高亮（子菜单按钮由 syncModeButtonsFromDifficulty 维护）
        const allModeBtns = [this.modeBattleBtn, this.modeCampaignBtn, this.modeRaceBtn, this.modeTestBtn];
        allModeBtns.forEach(btn => { if (btn) btn.classList.remove('active'); });

        if (mode === 'battle') {
            this.modeBattleBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = '';
            if (this._campaignSubmenu) this._campaignSubmenu.style.display = 'none';
            if (this._raceSubmenu) this._raceSubmenu.style.display = 'none';
            this.modeHint.textContent = 
                this._battleSubMode === 'local' ? '本地对战：两位玩家轮流操作' :
                this._battleSubMode === 'ai' ? '人机对战：你将对抗AI Summa' :
                '联机对战：与远方好友同台竞技';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.restoreBattleUI();
        } else if (mode === 'campaign') {
            this.modeCampaignBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = 'none';
            if (this._campaignSubmenu) this._campaignSubmenu.style.display = '';
            if (this._raceSubmenu) this._raceSubmenu.style.display = 'none';
            // hint 按闯关子模式显示
            this.modeHint.textContent = this._campaignSubMode === 'editor'
                ? '关卡编辑器：创造属于你自己的关卡'
                : '经典闯关：通关解锁下一关';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            return;
        } else if (mode === 'race') {
            this.modeRaceBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = 'none';
            if (this._campaignSubmenu) this._campaignSubmenu.style.display = 'none';
            if (this._raceSubmenu) this._raceSubmenu.style.display = '';
            // hint 按竞速子模式显示
            this.modeHint.textContent = this._raceSubMode === 'custom'
                ? '竞速试炼场：自定义允许区/禁止区，打造专属竞速关卡'
                : this._raceSubMode === 'battle'
                    ? '联机竞速：2-4 人同场竞速，实时比拼速度与排名'
                    : '标准竞速：通过 30 个关卡，追求更快速度';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            return;
        } else if (mode === 'test') {
            this.modeTestBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = 'none';
            if (this._campaignSubmenu) this._campaignSubmenu.style.display = 'none';
            if (this._raceSubmenu) this._raceSubmenu.style.display = 'none';
            this.modeHint.textContent = '测试模式：自由绘图，已绘制函数会保留在画布上';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            this.restoreBattleUI();
        }
    }
;

// startNormalGame
    UIController.prototype.startNormalGame = function() {
        // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;
        const rounds = parseInt(this.roundValue?.textContent) || 8;
        const difficulty = this.getSelectedDifficulty();
        // 对战模式使用子模式名
        const effectiveMode = this.selectedMode === 'battle' ? this._battleSubMode : this.selectedMode;
        this._markGameActive();
        this.gameController.initGame(rounds, difficulty, effectiveMode);
        this.hideStartModal();
        this.showMessage(`开始${this.getModeName(effectiveMode)}模式`);
    }
;

// getModeName
    UIController.prototype.getModeName = function(mode) {
        const map = {
            'local': '本地对战',
            'ai': '人机对战',
            'campaign': '闯关',
            'race': '竞速',
            'test': '测试',
            'p2p': '联机对战'
        };
        return map[mode] || mode;
    }
;

// handleStartSelectorKeys
    UIController.prototype.handleStartSelectorKeys = function(e) {
        if (!this.startModal || this.startModal.style.display === 'none') return false;
        // 开始界面（标题页）没有选择器，方向键不响应（进入主界面才可用）
        const mainPage = document.getElementById('main-page');
        if (mainPage && mainPage.style.display === 'none') return false;
        const targetTag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (targetTag === 'input' || targetTag === 'textarea') return false;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const active = document.activeElement;
            if (this.roundStepper?.contains(active) || this.roundValue?.contains(active)) {
                this.stepRound(e.key === 'ArrowRight' ? 1 : -1);
                return true;
            }
            if (this.difficultyStepper?.contains(active) || this.difficultyValue?.contains(active)) {
                this.stepDifficulty(e.key === 'ArrowRight' ? 1 : -1);
                return true;
            }
            // 默认优先切换难度，方便在开始界面直接用左右键调整
            this.stepDifficulty(e.key === 'ArrowRight' ? 1 : -1);
            return true;
        }
        return false;
    }
;

// getTestModeColor
    UIController.prototype.getTestModeColor = function() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
        const functions = this.gameController.getTestModeFunctions();
        return colors[functions.length % colors.length];
    }
;

// exitTestMode
    UIController.prototype.exitTestMode = function() {
        // 隐藏消息面板
        if (this.messagePanel) this.messagePanel.classList.remove('visible');
        
        // 清空函数
        this.gameController.clearTestModeFunctions();
        this.gridSystem.clearAll();
        
        // 隐藏测试模式函数面板
        const testFunctionPanel = document.getElementById('test-function-panel');
        if (testFunctionPanel) testFunctionPanel.classList.remove('visible');
        
        // 恢复 header 样式
        if (this.header) this.header.classList.remove('test-mode');
                
        // 移除 Canvas 容器的测试模式类
        const canvasSection = document.querySelector('.canvas-section');
        if (canvasSection) {
            canvasSection.classList.remove('test-mode');
        }
        
        // 恢复标题（#23：用进入时保存的原始状态还原，不再硬编码属性清单）
        const gameTitle = document.querySelector('.game-title');
        if (gameTitle) {
            gameTitle.textContent = this._testModeTitleText || '函数棋';
            gameTitle.style.cssText = this._testModeTitleCss || '';
        }
        
        // 恢复UI显示
        this.timerElement.parentElement.style.display = '';
        this.currentPlayerElement.parentElement.style.display = '';
        document.querySelectorAll('.score-display').forEach(el => {
            el.style.display = '';
        });
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = '';
        
        // 移除缩放按钮
        const zoomControls = document.getElementById('zoom-controls');
        if (zoomControls) zoomControls.remove();
        
        // 移除滚轮事件监听
        if (this.wheelHandler) {
            this.gridSystem.canvas.removeEventListener('wheel', this.wheelHandler);
            this.wheelHandler = null;
        }
        
        // 恢复坐标系范围
        this.gridSystem.setRange(5);
        
        // 恢复退出按钮样式和文本
        if (this.exitBtn) {
            if (this.gameController.gameMode === 'campaign') {
                this.exitBtn.textContent = '返回难度';
                this.exitBtn.className = 'btn btn-exit';
            } else {
                this.exitBtn.textContent = '退出对局';
                this.exitBtn.className = 'btn btn-exit';
            }
        }
        
        // 返回开始界面
        this.showModal(this.startModal);
        this.showMessage('');
        
        // ★ 修复需求 13：退出测试模式后恢复主菜单布局。
        // 进入测试模式时 selectMode('test') 会把 selectedMode 置为 'test'、隐藏所有子菜单、
        // 禁用 steppers；此处必须全部复位，否则回到开始界面排版错乱。
        this.selectedMode = 'battle';
        this._battleSubMode = 'local';
        if (this._battleSubmenu) this._battleSubmenu.style.display = '';
        if (this._campaignSubmenu) this._campaignSubmenu.style.display = 'none';
        if (this._raceSubmenu) this._raceSubmenu.style.display = 'none';
        if (this.campaignPanel) this.campaignPanel.style.display = 'none';
        if (this.modeHint) this.modeHint.textContent = '本地对战：两位玩家轮流操作';
        this.syncStartSelectionState();
        this.refreshStartSelectorDisplay();
    }
;

// handleStart
    UIController.prototype.handleStart = async function() {
        if (window.audioManager) {
            // Re-init audioContext on user interaction just in case
            if (window.audioManager.audioCtx && window.audioManager.audioCtx.state === 'suspended') {
                window.audioManager.audioCtx.resume();
            }
            window.audioManager.playClick();
        }

        // 闯关模式子模式：经典闯关进入关卡选择界面；关卡编辑器就地打开
        if (this.selectedMode === 'campaign') {
            if (this._campaignSubMode === 'editor') {
                this.openEditor();
            } else {
                this.openCampaignUI();
            }
            return;
        }

        // 竞速子模式：标准竞速进入选关界面；竞速试炼场打开自定义弹窗；联机竞速打开房间弹窗
        if (this.selectedMode === 'race') {
            if (this._raceSubMode === 'custom') {
                this.openRaceCustomModal();
            } else if (this._raceSubMode === 'battle') {
                this.openRaceBattleModal();
            } else {
                this.openRaceUI();
            }
            return;
        }

        // 对战子模式：P2P 联机（不应直接初始化游戏）
        if (this.selectedMode === 'battle' && this._battleSubMode === 'p2p') {
            this.showP2PRoomModal();
            return;
        }

        // 统一守卫：进入任意本地/AI/测试对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;

        const rounds = parseInt(this.roundSelect?.value || this.roundOptions?.[this.currentRoundIndex || 0]?.value || 8);
        let gameMode = this.selectedMode;
        // 对战模式：用子模式名（local / ai），而非字面的 'battle'
        if (gameMode === 'battle') {
            gameMode = this._battleSubMode;
        }

        // 测试模式：难度设为 'test'，gameMode 用 local
        let difficulty;
        if (gameMode === 'test') {
            difficulty = 'test';
            gameMode = 'local';
        } else {
            difficulty = this.difficultySelect?.value || this.difficultyOptions?.[this.currentDifficultyIndex || 0]?.value || 'easy';
        }

        window.tutorialVoiceMode = false;
        if (this.selectedMode !== 'race') this.hideRaceUI();

        // AI 模式：先检查是否训练，未训练则训练
        if (gameMode === 'ai' && window.summaTrainer) {
            if (this.aiModeHint) this.aiModeHint.textContent = '正在检查 AI 训练状态...';
            
            let shouldTrain = false;
            let trainAmount = 50000;
            
            // 检查该难度是否已训练
            if (window.summaTrainer.isModelTrained(difficulty)) {
                // 检测到已有模型，询问用户是否继续升维训练
                const choice = await this.showGameDialog({
                    title: '检测到已有模型',
                    message: `检测到 [${difficulty}] 难度的神经网络模型。<br><br>若想给神经网络继续升维训练，请选择一个训练规模：`,
                    options: [
                        { label: '1,000,000', value: 1000000, desc: '快速训练' },
                        { label: '5,000,000', value: 5000000, desc: '标准训练' },
                        { label: '20,000,000', value: 20000000, desc: '深度训练' },
                        { label: '100,000,000', value: 100000000, desc: '极限训练' }
                    ],
                    showSkip: true,
                    skipText: '跳过，使用现有模型直接开始'
                });
                
                if (choice && choice > 0) {
                    trainAmount = choice;
                    shouldTrain = true;
                }
            } else {
                // 未训练，询问用户是否训练
                const wantTrain = await this.showGameDialog({
                    title: '唤醒 Summa',
                    message: `AI 尚未针对「${difficulty}」难度进行训练。<br><br>首次必须推演地图拓扑算力，请选择训练规模：`,
                    options: [
                        { label: '1,000,000', value: 1000000, desc: '快速入门' },
                        { label: '5,000,000', value: 5000000, desc: '标准训练' },
                        { label: '20,000,000', value: 20000000, desc: '深度学习' },
                        { label: '100,000,000', value: 100000000, desc: '极限挑战' }
                    ],
                    showSkip: true,
                    skipText: '暂不训练，取消开始'
                });
                
                if (wantTrain && wantTrain > 0) {
                    trainAmount = wantTrain;
                    shouldTrain = true;
                }
            }
            
            if (shouldTrain) {
                if (this.aiModeHint) this.aiModeHint.textContent = '正在训练 AI，请稍候...';
                this.hideModal(this.startModal);
                // 重新训练前删除旧模型
                localStorage.removeItem(`summa_model_v2_${difficulty}`);
                await window.summaTrainer.startTraining(difficulty, trainAmount);
            } else if (window.summaTrainer.isModelTrained(difficulty)) {
                // 用户跳过但已有模型，直接开始游戏
            } else {
                // 用户取消且未训练，返回
                this.showModal(this.startModal);
                return;
            }
            
            // 训练完成或已训练，开始游戏
            this.hideModal(this.startModal);
            this._markGameActive();
            this.gameController.initGame(rounds, difficulty, gameMode);
            if (this.aiModeHint) this.aiModeHint.textContent = 'AI 模式已启动，Summa 正在对战';
            
            // 测试模式特殊初始化
            if (this.gameController.isTestMode()) {
                this.initTestModeUI();
            }
            return;
        } else {
            this.hideModal(this.startModal);
        }

        this._markGameActive();
        this.gameController.initGame(rounds, difficulty, gameMode);

        if (this.aiModeHint && gameMode === 'ai') {
            this.aiModeHint.textContent = 'AI 模式已启动，Summa 正在对战';
        }

        // 测试模式特殊初始化
        if (this.gameController.isTestMode()) {
            this.initTestModeUI();
        }
    }
;

// initTestModeUI
    UIController.prototype.initTestModeUI = function() {
        // 显示消息面板
        if (this.messagePanel) this.messagePanel.classList.add('visible');
        
        // 添加测试模式样式到 header
        if (this.header) this.header.classList.add('test-mode');
            
        // 为 Canvas 容器添加测试模式类
        const canvasSection = document.querySelector('.canvas-section');
        if (canvasSection) {
            canvasSection.classList.add('test-mode');
        }
        
        // 修改标题为"测试模式"，显示在左上角
        const gameTitle = document.querySelector('.game-title');
        if (gameTitle) {
            // #23：进入前先保存原始文案与内联样式，退出时原样还原（避免还原清单与这里改动失配）
            this._testModeTitleText = gameTitle.textContent;
            this._testModeTitleCss = gameTitle.style.cssText;
            gameTitle.textContent = '测试模式';
            gameTitle.style.color = '#ffffff';
            gameTitle.style.position = 'absolute';
            gameTitle.style.left = '20px';
            gameTitle.style.top = '10px';
            gameTitle.style.margin = '0';
            gameTitle.style.transform = 'none';
        }
        
        // 隐藏游戏相关的UI元素
        this.timerElement.parentElement.style.display = 'none';
        this.currentPlayerElement.parentElement.style.display = 'none';
        
        // 隐藏分数显示
        document.querySelectorAll('.score-display').forEach(el => {
            el.style.display = 'none';
        });
        
        // 隐藏回合显示
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = 'none';
        
        // 修改提示
        this.showMessage('测试模式：自由构造函数，点击函数表达式可编辑或删除');
        
        // 重置编辑状态，避免上次会话残留
        this._editingTestFunctionIndex = null;
        
        // 添加缩放按钮
        this.addZoomButtons();
        
        // 显示测试模式函数面板并刷新列表
        const testFunctionPanel = document.getElementById('test-function-panel');
        if (testFunctionPanel) {
            testFunctionPanel.classList.add('visible');
            this.renderTestFunctionPanel();
        }


        
        // 添加鼠标滚轮缩放功能
        this.addWheelZoomSupport();
        
        // 修改退出按钮为结束测试（保持原样）
        if (this.exitBtn) {
            this.exitBtn.textContent = '结束测试';
            this.exitBtn.className = 'btn btn-danger';
        }
        
        // 初始化元素选择
        this.initDraggableElements();
    }
;

// handleRestart
    UIController.prototype.handleRestart = function() {
        if (window.audioManager) window.audioManager.playClick();
        // 房主建房等待中返回主页：房间保留（不销毁），状态条继续显示；
        // 退出函数棋（关闭页面）才由 beforeunload 弹确认提醒。
        this._doHandleRestart();
    }
;

// _doHandleRestart
    UIController.prototype._doHandleRestart = function() {
        // P2P 对局结束返回主页 = 离开联机模式：清理 P2P 连接并关闭匹配大厅
        if (this.isP2PMode && typeof this._cleanupP2P === 'function') {
            this._cleanupP2P();
        }
        // ★ 先强制停止游戏运行
        this.forceStopGame();
        // game-over 后重启不走 resetBattleGrid，需显式清空上一局残留的函数解析式
        // （input 区 + KaTeX 数学预览），避免"返回主菜单后历史解析式残留在主界面"。
        if (typeof this.clearExpression === 'function') {
            try { this.clearExpression(); } catch (e) { /* UI 未就绪时静默忽略 */ }
        }
        // 同步清理固定定位的 hover tooltip（fixed z-index:10000，不清会穿透显示在主菜单上）
        try { this.hideHistoryFunctionTooltip && this.hideHistoryFunctionTooltip(); } catch (e) {}
        try { this.hideLockCountTooltip && this.hideLockCountTooltip(); } catch (e) {}
        this.hideModal(this.gameOverModal, () => {
            // 如果在测试模式，先退出测试模式
            if (this.gameController.isTestMode()) {
                this.exitTestMode();
            }
            // 竞速模式：直接回到等级界面，不经过对局界面
            if (this.gameController.gameMode === 'race') {
                if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
                    this.gridSystem.setRaceFixedRange(false);
                }
                this.showRaceLevelList();
                return;
            }
            // 返回主页（若已重新进入观战，则不再弹回主页，避免覆盖观战界面）
            if (!this._isSpectating) this.showModal(this.startModal);
        });
    }
;

