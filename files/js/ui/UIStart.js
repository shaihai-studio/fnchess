// Auto-split from UIController.js — prototype-attached methods (UIStart)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIStart] UIController must be loaded before this file');
}

// initStartSelectors
    UIController.prototype.initStartSelectors = function() {
        this.roundOptions = [
            { value: 8, label: '8 回合（快速对战）' },
            { value: 12, label: '12 回合（深度对战）' },
            { value: 16, label: '16 回合（持久战）' },
            { value: 20, label: '20 回合（极限挑战）' },
            { value: 24, label: '24 回合（终极对决）' }
        ];
        this.difficultyOptions = [
            { value: 'easy', label: '简单 - 1个目标格' },
            { value: 'normal', label: '普通 - 2个目标格' },
            { value: 'expert', label: '专家 - 3个目标格' }
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

// refreshStartSelectorDisplay
    UIController.prototype.refreshStartSelectorDisplay = function() {
        if (this.roundValue && this.roundOptions && this.roundOptions.length) {
            const idx = Math.min(this.roundOptions.length - 1, Math.max(0, this.currentRoundIndex || 0));
            const option = this.roundOptions[idx];
            this.roundValue.textContent = option.label;
            this.roundValue.dataset.value = String(option.value);
            this.roundValue.style.color = this.getRoundColor(option.value);
            this.applyStepperColors('round', option.value);
        }
        if (this.difficultyValue && this.difficultyOptions && this.difficultyOptions.length) {
            const idx = Math.min(this.difficultyOptions.length - 1, Math.max(0, this.currentDifficultyIndex || 0));
            const option = this.difficultyOptions[idx];
            this.difficultyValue.textContent = option.label;
            this.difficultyValue.dataset.value = option.value;
            this.difficultyValue.style.color = this.getDifficultyColor(option.value);
            this.applyStepperColors('difficulty', option.value);
        }
        if (this.timeLimitValue && this.timeLimitOptions && this.timeLimitOptions.length) {
            const idx = Math.min(this.timeLimitOptions.length - 1, Math.max(0, this.currentTimeLimitIndex ?? 2));
            const option = this.timeLimitOptions[idx];
            this.timeLimitValue.textContent = option.label;
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
        const difficulty = this.difficultySelect ? this.difficultySelect.value : 'easy';
        if (!this.modeAiBtn || !this.modeLocalBtn || !this.modeCampaignBtn || !this.modeRaceBtn || !this.modeTestBtn) return;

        // 修复 #23：selectedMode 恒为 'battle'，子模式高亮应依据 _battleSubMode
        const isBattle = this.selectedMode === 'battle';
        this.modeBattleBtn.classList.toggle('active', isBattle);
        this.modeLocalBtn.classList.toggle('active', isBattle && this._battleSubMode === 'local');
        this.modeAiBtn.classList.toggle('active', isBattle && this._battleSubMode === 'ai');
        if (this.modeP2PBtn) this.modeP2PBtn.classList.toggle('active', isBattle && this._battleSubMode === 'p2p');
        this.modeCampaignBtn.classList.toggle('active', this.selectedMode === 'campaign');
        this.modeRaceBtn.classList.toggle('active', this.selectedMode === 'race');
        this.modeTestBtn.classList.toggle('active', this.selectedMode === 'test');

        if (this.modeAiBtn) {
            this.modeAiBtn.disabled = false;
            this.modeAiBtn.style.opacity = '1';
            this.modeAiBtn.style.cursor = 'pointer';
            this.modeAiBtn.title = '';
        }

        const lockSelectors = this.selectedMode === 'campaign' || this.selectedMode === 'test' || this.selectedMode === 'race' || (this.selectedMode === 'battle' && this._battleSubMode === 'p2p');
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
        // 闯关模式、测试模式、竞速模式、联机对战模式禁用回合数/难度/时间选择
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

        // 重置所有模式按钮的高亮
        const allModeBtns = [this.modeBattleBtn, this.modeCampaignBtn, this.modeRaceBtn, this.modeTestBtn];
        allModeBtns.forEach(btn => { if (btn) btn.classList.remove('active'); });

        if (mode === 'battle') {
            this.modeBattleBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = '';
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
            this.modeHint.textContent = '闯关模式：通关解锁下一关';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            return;
        } else if (mode === 'race') {
            this.modeRaceBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = 'none';
            this.modeHint.textContent = '竞速模式：快一点，再快一点！';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            return;
        } else if (mode === 'test') {
            this.modeTestBtn.classList.add('active');
            if (this._battleSubmenu) this._battleSubmenu.style.display = 'none';
            this.modeHint.textContent = '测试模式：自由绘图，已绘制函数会保留在画布上';
            if (this.campaignPanel) this.campaignPanel.style.display = 'none';
            this.hideRaceUI();
            this.setStartSelectorsEnabled(false);
            this.restoreBattleUI();
        }
    }
;

// getSelectedTimeLimitMode
    UIController.prototype.getSelectedTimeLimitMode = function() {
        const timeLimitText = this.timeLimitValue?.textContent || '普通棋';
        const map = {
            '超慢棋': 'super_slow',
            '慢棋': 'slow',
            '普通棋': 'normal',
            '快棋': 'fast',
            '超快棋': 'super_fast'
        };
        return map[timeLimitText] || 'normal';
    }
;

// handleStartButtonClick
    UIController.prototype.handleStartButtonClick = function() {
        const mode = this.selectedMode;
        // 对战模式：提取子模式
        const battleMode = mode === 'battle' ? this._battleSubMode : mode;
        switch (battleMode) {
            case 'p2p':
                // P2P触发房间弹窗
                this.showP2PRoomModal();
                break;
            case 'campaign':
                // 闯关模式：显示闯关难度选择
                this.showCampaignDifficulty();
                break;
            case 'race':
                // 竞速模式：显示等级选择
                this.showRaceLevelList();
                break;
            default:
                // 本地、AI、测试模式：直接开始游戏
                this.startNormalGame();
                break;
        }
    }
;

// startNormalGame
    UIController.prototype.startNormalGame = function() {
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
        
        // 恢复 header 样式
        if (this.header) this.header.classList.remove('test-mode');
                
        // 移除 Canvas 容器的测试模式类
        const canvasSection = document.querySelector('.canvas-section');
        if (canvasSection) {
            canvasSection.classList.remove('test-mode');
        }
        
        // 恢复标题
        const gameTitle = document.querySelector('.game-title');
        if (gameTitle) {
            gameTitle.textContent = '函数棋';
            gameTitle.style.color = '';
            gameTitle.style.position = '';
            gameTitle.style.left = '';
            gameTitle.style.top = '';
            gameTitle.style.margin = '';
            gameTitle.style.transform = '';
        }
        
        // 恢复UI显示
        this.timerElement.parentElement.style.display = '';
        this.currentPlayerElement.parentElement.style.display = '';
        document.querySelectorAll('.score-display').forEach(el => {
            el.style.display = '';
        });
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = '';
        
        // 移除函数列表
        const functionList = document.getElementById('function-list');
        if (functionList) functionList.remove();
        
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
        
        // 闯关模式：进入关卡选择界面（难度选择）
        if (this.selectedMode === 'campaign') {
            this.openCampaignUI();
            return;
        }

        // 竞速模式：与闯关逻辑一致，先等开始按钮/Enter 再进入等级界面
        if (this.selectedMode === 'race') {
            this.openRaceUI();
            return;
        }

        // 对战子模式：P2P 联机（不应直接初始化游戏）
        if (this.selectedMode === 'battle' && this._battleSubMode === 'p2p') {
            this.showP2PRoomModal();
            return;
        }

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
        
        // 添加函数列表容器
        this.addFunctionListContainer();
        
        // 添加缩放按钮
        this.addZoomButtons();


        
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
        // P2P 对局结束返回主页 = 离开联机模式：清理 P2P 连接并关闭匹配大厅
        if (this.isP2PMode && typeof this._cleanupP2P === 'function') {
            this._cleanupP2P();
        }
        // ★ 先强制停止游戏运行
        this.forceStopGame();
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
            // 返回主页
            this.showModal(this.startModal);
        });
    }
;

