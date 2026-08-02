// Auto-split from UIController.js — prototype-attached methods (UICore)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UICore] UIController must be loaded before this file');
}

// initUI
    UIController.prototype.initUI = function() {
        // 顶部信息栏
        this.scoreAElement = document.getElementById('score-a');
        this.scoreBElement = document.getElementById('score-b');
        this.scoreDisplays = document.querySelectorAll('.score-display');
        this.roundElement = document.getElementById('current-round');
        this.totalRoundsElement = document.getElementById('total-rounds');
        
        // 控制面板
        this.timerElement = document.getElementById('timer');
        this.currentPlayerElement = document.getElementById('current-player');
        this.phaseHintElement = document.getElementById('phase-hint');
        this.expressionDisplay = document.getElementById('expression-display');
        this.messageElement = document.getElementById('message');
        this.messagePanel = document.getElementById('message-panel');
        this.bgmEnabledCheckbox = document.getElementById('bgm-enabled');
        this.bgmVolumeSlider = document.getElementById('bgm-volume');
        this.bgmVolumeValue = document.getElementById('bgm-volume-value');
        this.sfxVolumeSlider = document.getElementById('sfx-volume');
        this.sfxVolumeValue = document.getElementById('sfx-volume-value');
        this.bgmOpenBtn = document.getElementById('bgm-open-btn');
        this.startBgmOpenBtn = document.getElementById('start-bgm-open-btn');
        this.bgmModal = document.getElementById('bgm-modal');
        this.bgmCloseBtn = document.getElementById('bgm-close-btn');
        
        // 按钮
        this.confirmBtn = document.getElementById('confirm-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.exitBtn = document.getElementById('exit-btn');

        // 「提交失败后保留解析式」开关
        this.keepExprToggle = document.getElementById('keep-expr-toggle');
        
        // 「反三角函数」开关（开始界面，需通关全部分数关解锁）
        this.inverseTrigToggle = document.getElementById('inverse-trig-toggle');
        this.inverseTrigToggleWrap = document.getElementById('inverse-trig-toggle-wrap');
        if (this.inverseTrigToggle) {
            this.inverseTrigToggle.addEventListener('change', () => {
                this.setInverseTrigEnabled(this.inverseTrigToggle.checked);
            });
        }
        this.refreshInverseTrigToggle();
        
        // 退出气泡框元素
        this.exitPopover = document.getElementById('exit-confirm-popover');
        this.cancelExitBtn = document.getElementById('cancel-exit-btn');
        this.confirmExitBtn = document.getElementById('confirm-exit-btn');
        
        // 元素拖拽区
        this.elementsContainer = document.getElementById('elements-container');
        
        // 游戏结束弹窗
        this.gameOverModal = document.getElementById('game-over-modal');
        this.winnerElement = document.getElementById('winner');
        this.finalScoresElement = document.getElementById('final-scores');
        this.restartBtn = document.getElementById('restart-btn');
        this.viewReportBtn = document.getElementById('view-report-btn');
        this.campaignVictoryModal = document.getElementById('campaign-victory-modal');
        this.campaignVictoryText = document.getElementById('campaign-victory-text');
        this.campaignHomeBtn = document.getElementById('campaign-home-btn');
        this.campaignRetryBtn = document.getElementById('campaign-retry-btn');
        this.campaignNextBtn = document.getElementById('campaign-next-btn');
        this.raceVictoryModal = document.getElementById('race-victory-modal');
        this.raceVictoryLevel = document.getElementById('race-victory-level');
        this.raceVictoryTime = document.getElementById('race-victory-time');
        this.raceVictoryDiff = document.getElementById('race-victory-diff');
        this.raceVictoryBest = document.getElementById('race-victory-best');
        this.raceVictoryLevelSelectBtn = document.getElementById('race-victory-level-select-btn');
        this.raceVictoryRetryBtn = document.getElementById('race-victory-retry-btn');
        this.raceVictoryNextBtn = document.getElementById('race-victory-next-btn');
        
        // 游戏报告弹窗
        this.reportModal = document.getElementById('report-modal');
        this.reportContentElement = document.getElementById('report-content');
        this.closeReportBtn = document.getElementById('close-report-btn');
        
        // 开始界面
        this.startModal = document.getElementById('start-modal');
        this.startBtn = document.getElementById('start-btn');
        this.roundSelect = document.getElementById('round-select');
        this.difficultySelect = document.getElementById('difficulty-select');
        this.roundStepper = document.getElementById('round-stepper');
        this.roundValue = document.getElementById('round-value');
        this.timeLimitStepper = document.getElementById('time-limit-stepper');
        this.timeLimitValue = document.getElementById('time-limit-value');
        this.difficultyStepper = document.getElementById('difficulty-stepper');
        this.difficultyValue = document.getElementById('difficulty-value');
        this.difficultyHint = document.getElementById('difficulty-hint');
        this.header = document.getElementById('header');
        
        // 游戏模式切换按钮
        this.modeBattleBtn = document.getElementById('mode-battle');
        this.modeCampaignBtn = document.getElementById('mode-campaign');
        this.modeRaceBtn = document.getElementById('mode-race');
        this.modeTestBtn = document.getElementById('mode-test');
        // 对战子模式
        this.modeLocalBtn = document.getElementById('mode-local');
        this.modeAiBtn = document.getElementById('mode-ai');
        this.modeP2PBtn = document.getElementById('mode-p2p');
        this.modeEditorBtn = document.getElementById('mode-editor');
        this._battleSubmenu = document.getElementById('battle-submenu');
        this.modeHint = document.getElementById('mode-hint');
        this.selectedMode = 'battle'; // 默认对战模式
        this._battleSubMode = 'local'; // 默认子模式：本地对战

        // 闯关面板
        this.campaignPanel = document.getElementById('campaign-panel');
        this.campaignLevelSelect = document.getElementById('campaign-level-select');
        this.campaignProgressText = document.getElementById('campaign-progress');
        this.campaignPack = null;

        // 竞速模式独立UI
        this.raceModal = document.getElementById('race-modal');
        this.raceLevelTitle = document.getElementById('race-level-title');
        this.raceLevelProgress = document.getElementById('race-level-progress');
        this.raceLevelGrid = document.getElementById('race-level-grid');
        this.raceCloseBtn = document.getElementById('race-close-btn');
        this.raceResetBtn = document.getElementById('race-reset-btn');
        this.raceLivePanel = document.getElementById('race-live-panel');
        this.raceLiveTimeValue = document.getElementById('race-live-time-value');

        this.campaignModal = document.getElementById('campaign-modal');
        this.campaignStepDifficulty = document.getElementById('campaign-step-difficulty');
        this.campaignStepLevels = document.getElementById('campaign-step-levels');
        this.campaignGlobalProgress = document.getElementById('campaign-global-progress');
        this.campaignStarProgress = document.getElementById('campaign-star-progress');
        
        // Summa训练弹窗
        this.summaDialog = document.getElementById('summa-train-dialog');
        this.summaDialogTitle = document.getElementById('summa-dialog-title');
        this.summaDialogMessage = document.getElementById('summa-dialog-message');
        this.summaDialogOptions = document.getElementById('summa-dialog-options');
        this.summaDialogInputArea = document.getElementById('summa-dialog-input-area');
        this.summaDialogInput = document.getElementById('summa-dialog-input');
        
        // 绑定弹窗内部按钮事件
        this.bindSummaDialogEvents();
        this.campaignLevelTitle = document.getElementById('campaign-level-title');
        this.campaignLevelProgress = document.getElementById('campaign-level-progress');
        this.campaignLevelGrid = document.getElementById('campaign-level-grid');
        this.campaignFileInput = document.getElementById('campaign-file-input');

        this.campaignDifficulty = null; // easy/normal/hard/expert/unsolvable
        this.campaignCurrentLevelId = null;
        this.campaignCurrentLevelBestRecord = null;
        this.battleUiHidden = false;
        this.campaignDrawDelayOptions = [0, 1000, 5000];
        this.campaignDrawDelay = this.getCampaignDrawDelaySetting();

        this.raceLevels = this.getRaceLevels();
        this.raceCurrentLevelId = null;
        this._raceCountdownActive = false;
        this._raceCountdownTimer = null;
        this._raceCountdownOverlay = null;
        this._raceCountdownLockReason = '';
        this._raceThresholds = [30, 60, 120, 180, 300, 600, 900, 1200, 1500];
        
        this.raceBoardMode = 'race';
        this.raceModeManager = window.RaceModeManager ? new window.RaceModeManager() : null;
        this.raceModeController = window.RaceModeController ? new window.RaceModeController(this.gridSystem) : null;

        // AI 存档管理面板
        this.aiModeHint = document.getElementById('ai-mode-hint');
        this.aiManageBtn = document.getElementById('ai-manage-btn');

        // 绑定难度选择提示更新
        if (this.difficultySelect && this.difficultyHint) {
            this.difficultySelect.addEventListener('change', () => {
                this.updateDifficultyHint();
            });
        }
        this.initStartSelectors();
        this.refreshStartSelectorDisplay();
        
        
        // 绑定模式切换按钮
        if (this.modeBattleBtn && this.modeCampaignBtn && this.modeRaceBtn && this.modeTestBtn) {
            this.modeBattleBtn.addEventListener('click', () => this.selectMode('battle'));
            this.modeCampaignBtn.addEventListener('click', () => this.selectMode('campaign'));
            this.modeRaceBtn.addEventListener('click', () => this.selectMode('race'));
            this.modeTestBtn.addEventListener('click', () => this.selectMode('test'));
        }
        // 对战子菜单按钮
        if (this.modeLocalBtn) {
            this.modeLocalBtn.addEventListener('click', () => {
                this._battleSubMode = 'local';
                this.selectMode('battle');
                this.modeHint.textContent = '本地对战：两位玩家轮流操作';
            });
        }
        if (this.modeAiBtn) {
            this.modeAiBtn.addEventListener('click', () => {
                this._battleSubMode = 'ai';
                this.selectMode('battle');
                this.modeHint.textContent = '人机对战：你将对抗AI Summa';
            });
        }
        if (this.modeP2PBtn) {
            this.modeP2PBtn.addEventListener('click', () => {
                this._battleSubMode = 'p2p';
                this.selectMode('battle');
                this.modeHint.textContent = '联机对战：与远方好友同台竞技';
            });
        }
        // modeEditorBtn 现为指向 level-editor.html 的 <a> 链接，不需要 JS 事件绑定
        if (this.raceBackBtn) this.raceBackBtn.addEventListener('click', () => this.showRaceLevelList());
        if (this.raceCloseBtn) this.raceCloseBtn.addEventListener('click', () => this.closeRaceUI());

        // AI 管理面板按钮
        if (this.aiManageBtn) {
            this.aiManageBtn.addEventListener('click', () => {
                if (window.summaTrainer) window.summaTrainer.showPanel();
            });
        }

        // 闯关UI按钮
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        bind('campaign-close-btn', () => this.closeCampaignUI());
        bind('campaign-close-btn2', () => this.closeCampaignUI());
        bind('campaign-back-btn', () => this.playUIButtonSound(() => this.showCampaignDifficulty()));
        bind('campaign-reset-btn', () => this.playUIButtonSound(() => this.resetCampaignProgress()));
        bind('race-reset-btn', () => this.playUIButtonSound(() => this.resetRaceProgress()));
        bind('campaign-diff-fraction', () => this.playUIButtonSound(() => this.openCampaignLevels('fraction')));
        bind('campaign-diff-easy', () => this.playUIButtonSound(() => this.openCampaignLevels('easy')));
        bind('campaign-return-difficulty-btn', () => this.playUIButtonSound(() => this.returnCampaignToDifficulty()));
        bind('campaign-home-btn', () => this.playUIButtonSound(() => this.returnToCampaignLevelSelect()));
        bind('campaign-retry-btn', () => this.playUIButtonSound(() => this.retryCampaignLevel()));
        bind('campaign-next-btn', () => this.playUIButtonSound(() => this.goToNextCampaignLevel()));
        bind('race-victory-level-select-btn', () => this.playUIButtonSound(() => this.backToRaceLevelListFromVictory()));
        bind('race-victory-retry-btn', () => this.playUIButtonSound(() => this.retryRaceLevel()));
        bind('race-victory-next-btn', () => this.playUIButtonSound(() => this.goToNextRaceLevel()));
        bind('campaign-diff-normal', () => this.playUIButtonSound(() => this.openCampaignLevels('normal')));
        bind('campaign-diff-hard', () => this.playUIButtonSound(() => this.openCampaignLevels('hard')));
        bind('campaign-diff-expert', () => this.playUIButtonSound(() => this.openCampaignLevels('expert')));
        bind('campaign-diff-unsolvable', () => this.playUIButtonSound(() => this.openCampaignLevels('unsolvable')));
        this.refreshUnsovableDifficultyVisibility();
        this.addCampaignDrawDelayToggle();
        this.updateCampaignDrawDelayToggleVisibility();
        this.bindBackgroundMusicControls();
        this.initBackgroundMusic();

        // 控制面板：在内容不溢出时不显示滚动条，溢出时自动出现滚动条
        // 修复 #45：原本 overflow-y: auto 在不超高时也会渲染出空滚动条（Windows 上尤其明显）
        this.initControlPanelAutoScroll();

        // 退出函数棋（关闭页面/标签页/刷新）前：房主有活跃房间时弹浏览器确认提醒
        // （房间将失效）。确认后页面才真正关闭；关闭时服务器因 WS 断开会自动清理房间。
        window.addEventListener('beforeunload', (e) => {
            if (this._lobby && this._lobby.myRoomCode) {
                e.preventDefault();
                e.returnValue = '退出后，您创建的房间将立即失效。是否确认退出？';
                return e.returnValue;
            }
        });
    }
;

// initControlPanelAutoScroll
    UIController.prototype.initControlPanelAutoScroll = function() {
        const evaluateScroll = (el) => {
            if (!el) return;
            // 纵向溢出检测（>1px 容差，避免亚像素误差造成的装饰性滚动条）
            const overY = el.scrollHeight - el.clientHeight;
            el.classList.toggle('is-scrollable', overY > 1);
            // 横向溢出检测（极长的无空格 token 才会触发，正常表达式不会）
            const overX = el.scrollWidth - el.clientWidth;
            el.classList.toggle('is-scrollable-x', overX > 1);
        };
        const bind = (el) => {
            if (!el) return;
            evaluateScroll(el);
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(() => evaluateScroll(el)).observe(el);
            } else if (typeof MutationObserver !== 'undefined') {
                new MutationObserver(() => evaluateScroll(el))
                    .observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
            }
        };
        // 控制面板：内容不多时不显示滚动条，溢出时才出现
        bind(document.querySelector('.control-panel'));
        // 表达式显示区的滚动状态由 UIInput.updateExpressionScrollState() 在每次
        // updateExpressionDisplay 时驱动（更精确，随内容变化即时刷新）；这里仅
        // 在窗口缩放时兜底同步一次，避免类残留
        window.addEventListener('resize', () => {
            evaluateScroll(document.querySelector('.control-panel'));
            if (this.updateExpressionScrollState) this.updateExpressionScrollState();
        });
    }

// updateDifficultyHint
    UIController.prototype.updateDifficultyHint = function() {
        const difficulty = this.difficultySelect ? this.difficultySelect.value : (this.difficultyOptions?.[this.currentDifficultyIndex || 0]?.value || 'easy');
        if (this.difficultyHint) {
            this.difficultyHint.textContent = '';
        }

        this.syncModeButtonsFromDifficulty();
        this.refreshStartSelectorDisplay();
    }
;

// stepRound
    UIController.prototype.stepRound = function(direction) {
        if (this.selectedMode === 'campaign') return;
        const len = this.roundOptions.length;
        const current = this.currentRoundIndex ?? 0;
        const next = (current + direction + len) % len;
        this.currentRoundIndex = next;
        if (this.roundSelect) this.roundSelect.value = String(this.roundOptions[next].value);
        this.playSelectorChangeFeedback(this.roundStepper || this.roundValue);
        this.refreshStartSelectorDisplay();
        this.syncStartSelectionState();
    }
;

// stepDifficulty
    UIController.prototype.stepDifficulty = function(direction) {
        if (this.selectedMode === 'campaign') return;
        const len = this.difficultyOptions.length;
        const current = this.currentDifficultyIndex ?? 0;
        const next = (current + direction + len) % len;
        this.currentDifficultyIndex = next;
        const nextValue = this.difficultyOptions[next].value;
        if (this.difficultySelect) {
            this.difficultySelect.value = nextValue;
            this.difficultySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.playSelectorChangeFeedback(this.difficultyStepper || this.difficultyValue);
        this.refreshStartSelectorDisplay();
        this.updateDifficultyHint();
        this.syncStartSelectionState();
    }
;

// stepTimeLimit
    UIController.prototype.stepTimeLimit = function(direction) {
        if (this.selectedMode === 'campaign') return;
        const len = this.timeLimitOptions.length;
        const current = this.currentTimeLimitIndex ?? 2;
        const next = (current + direction + len) % len;
        this.currentTimeLimitIndex = next;
        this.applySelectedTimeLimitMode();
        this.playSelectorChangeFeedback(this.timeLimitStepper || this.timeLimitValue);
        this.refreshStartSelectorDisplay();
        this.syncStartSelectionState();
    }
;

// getTimeLimitValue
    UIController.prototype.getTimeLimitValue = function() {
        const timeLimitText = this.timeLimitValue?.textContent || '普通棋';
        const map = {
            '超慢棋': 120,
            '慢棋': 60,
            '普通棋': 40,
            '快棋': 20,
            '超快棋': 10
        };
        return map[timeLimitText] || 40;
    }
;

// getSelectedDifficulty
    UIController.prototype.getSelectedDifficulty = function() {
        const difficultyText = this.difficultyValue?.textContent || '简单 - 1个目标格';
        if (difficultyText.includes('简单')) return 'easy';
        if (difficultyText.includes('普通')) return 'normal';
        if (difficultyText.includes('专家')) return 'expert';
        return 'normal';
    }
;

// bindGameEvents
    UIController.prototype.bindGameEvents = function() {
        this.gameController.on('gameInit', (data) => {
            // 完全重置UI状态
            this.gridSystem.clearAll();
            this.gridSystem.functionHistory = [];
            this.gridSystem.usedCells = [];
            this._lastRemoteExpr = null;
            this.clearExpression();
            this._syncKeepExprToggleVisibility();
            this.updateScoreboard();
            this.roundElement.textContent = data.currentRound;
            this.totalRoundsElement.textContent = data.totalRounds;
            this.messageElement.textContent = '';
            const badge = document.getElementById('campaign-level-badge');
            if (badge) badge.style.display = 'none';
            this.campaignDifficulty = null;
            this.campaignCurrentLevelId = null;
            this.campaignCurrentLevelBestRecord = null;
            
            // 测试模式特殊提示
            if (data.isTestMode) {
                this.hideBattleUI();
                this.showMessage('测试模式：自由构造函数，函数将持续显示在画布上');
            } else if (data.gameMode === 'campaign') {
                this.hideBattleUI();
                this.showMessage('闯关模式：请直接构造函数作答');
            } else if (data.gameMode === 'race') {
                this.hideBattleUI();
                this.showRaceBattleUI(data);
                this.showMessage(`竞速模式：第 ${data.currentRound} 关开始`);
            } else {
                this.restoreBattleUI();
                const state = this.gameController.getGameState();
                let starterLabel = '玩家B';
                if (state.gameMode === 'p2p' && this.p2pController) {
                    starterLabel = this.p2pController.myPlayerId === 'B' ? '你的回合，' : '对方回合，';
                }
                this.showMessage(`游戏开始！${starterLabel}请选择目标网格`);
            }
            
            // Summa: hook game start
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                window.summaCharacter.show('ai');
                window.summaCharacter.reactStart();
            } else if (window.summaCharacter) {
                window.summaCharacter.show('local'); // Hides summa
            }

            // 按当前难度重渲染元素面板（简单难度/分数关隐藏反三角函数）
            this.initDraggableElements();
        });
        
        this.gameController.on('phaseChange', (data) => {
            if (window.audioManager) window.audioManager.playPhaseChange();
            this.updatePhaseUI(data.phase);
            
            // Summa Reaction Hook for Phase Change
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                if (data.phase === 'input_function') {
                    if (data.currentPlayer === 'B') {
                        window.summaCharacter.reactAiThink();
                    } else {
                        window.summaCharacter.reactPlayerAction();
                    }
                    // 玩家输入函数时，Summa 看向公式输入区
                    window.summaCharacter.setLookMode('expression');
                } else if (data.phase === 'evaluate') {
                    if (data.currentPlayer === 'B') {
                        window.summaCharacter.reactAiPlay();
                    }
                    window.summaCharacter.setLookMode('mouse');
                } else if (data.phase === 'select_target' || data.phase === 'set_forbidden' || data.phase === 'set_locks') {
                    // 选择目标格/禁止区/锁定：Summa 跟随鼠标在棋盘上的位置
                    window.summaCharacter.setLookMode('canvas');
                } else {
                    window.summaCharacter.setLookMode('mouse');
                }
            }
            
            // 同步历史使用过的格子到 GridSystem（不启动动画）
            const state = this.gameController.getGameState();
            if (state.usedCells) {
                this.gridSystem.usedCells = state.usedCells;
                // 只更新数据，不重绘（等待函数绘制完成后再绘制和播放动画）
            }
            
            // 同步历史函数和当前回合数（确保在updateRange后能正确显示）
            if (state.functionHistory) {
                this.gridSystem.functionHistory = state.functionHistory;
                this.gridSystem.currentRound = state.currentRound;
            }
            
            // 如果是人机模式且当前是AI的回合，触发AI行动
            if (this.gameController.gameMode === 'ai' && data.currentPlayer === 'B') {
                this.triggerAITurn(data.phase);
            }

        });
        
        this.gameController.on('timerUpdate', (data) => {
            if (window.audioManager && data.remainingTime > 0 && data.remainingTime <= 5) {
                window.audioManager.playTick();
            }
            this.updateTimer(data.remainingTime);
        });
        
        this.gameController.on('timeout', (data) => {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage(`${this.getPlayerDisplayName(data.player)}超时！扣1分`, 'error');
        });

        // 统一的输入阶段准备：只做 UI 侧清理（模型清理由 GameController.prepareInputPhase() 负责）
        this.gameController.on('prepareInputPhase', (data) => {
            // 「提交失败后保留解析式」开关——仅闯关/竞速模式生效
            const isCampaignOrRace = this.gameController.gameMode === 'campaign' ||
                                     this.gameController.gameMode === 'race';
            const keepExpr = (data && data.clearExpression === false) ||
                             (isCampaignOrRace && this.keepExprToggle && this.keepExprToggle.checked);
            if (!keepExpr) {
                this.clearExpression();
            }
        });
        
        this.gameController.on('targetSelected', (data) => {
            if (window.audioManager) window.audioManager.playClick();
            // 更新所有目标格的显示
            this.gridSystem.setTargetCells(this.gameController.roundState.targetCells);
            const progress = data.count && data.total ? ` (${data.count}/${data.total})` : '';
            this.showMessage(`目标网格 ${data.count} 已选择: (${data.cell.x}, ${data.cell.y})${progress}`);
            
            // 更新阶段提示
            const state = this.gameController.getGameState();
            if (state.targetCount > 1) {
                this.phaseHintElement.textContent = `请点击棋盘选择 ${state.targetCount} 个目标网格 (${this.gameController.roundState.targetCells.length}/${state.targetCount})`;
            }
            // 重新计算确认按钮禁用态（选够/取消目标格后及时刷新）
            this.updatePhaseUI(this.gameController.currentPhase);

        });
        
        this.gameController.on('targetRemoved', (data) => {
            if (window.audioManager) window.audioManager.playElementClick();
            // 更新所有目标格的显示
            this.gridSystem.setTargetCells(this.gameController.roundState.targetCells);
            this.showMessage(`目标网格已取消: (${data.cell.x}, ${data.cell.y})`);
            
            // 更新阶段提示
            const state = this.gameController.getGameState();
            if (state.targetCount > 1) {
                this.phaseHintElement.textContent = `请点击棋盘选择 ${state.targetCount} 个目标网格 (${this.gameController.roundState.targetCells.length}/${state.targetCount})`;
            }
            // 重新计算确认按钮禁用态（选够/取消目标格后及时刷新）
            this.updatePhaseUI(this.gameController.currentPhase);

        });
        
        this.gameController.on('forbiddenAdded', (data) => {
            if (window.audioManager) window.audioManager.playClick();
            this.gridSystem.addForbiddenCell(data.cell);
            this.showMessage(`禁止区已设置: (${data.cell.x}, ${data.cell.y})`);
            // 更新阶段提示中的计数
            const state = this.gameController.getGameState();
            this.phaseHintElement.textContent = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;

        });
        
        this.gameController.on('forbiddenRemoved', (data) => {
            if (window.audioManager) window.audioManager.playElementClick();
            this.gridSystem.removeForbiddenCell(data.cell);
            this.showMessage(`禁止区已取消: (${data.cell.x}, ${data.cell.y})`);
            // 更新阶段提示中的计数
            const state = this.gameController.getGameState();
            this.phaseHintElement.textContent = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;

        });
        
        this.gameController.on('elementLocked', (data) => {
            this.updateLockedElements();
            this.showMessage(`已锁定元素: ${data.element}`);
        });

        // P2P：用户点"确认目标/禁止/锁定"时 currentPhase 已被对端快照覆盖（非预期阶段），
        // 请求同步自愈并提示用户稍候，避免按钮无反应造成困惑。
        this.gameController.on('phaseMismatchHint', (data) => {
            this.showMessage('正在与对手同步状态，请稍候…', 'warning');
        });
        
        this.gameController.on('evaluationComplete', (data) => {
            if (window.audioManager) {
                if (data.hitTarget && !data.hitForbidden) {
                    window.audioManager.playSuccess();
                } else {
                    window.audioManager.playError();
                }
            }
            this.showEvaluationResult(data);
            
            // 保存函数到历史记录（用于淡化显示）
            // 闯关模式下不记录历史函数
            if (data.expression && data.round && !this.gameController.campaignState.active) {
                // 确保functionHistory存在
                if (!this.gameController.functionHistory) {
                    this.gameController.functionHistory = [];
                }
                
                // 获取当前函数的采样点
                const range = this.gridSystem.getRange();
                const points = this.renderer.sampleFunction(data.expression, range.min, range.max);
                
                // 直接添加到GameController的functionHistory
                this.gameController.functionHistory.push({
                    expression: data.expression,
                    round: data.round,
                    points: points,
                    color: '#00d4ff', // 默认颜色
                    sampledRange: this.gridSystem.range  // 记录采样时的 range，用于 range 扩大后的重采样判断
                });
                // 历史淡化绘制只用最近 2 回合（GridSystem.drawHistoryFunctions 只画 roundDiff 1~2），
                // 裁剪更早的函数，防止 functionHistory 无限增长 → 每个函数数千~上万个采样点，
                // 导致 P2P 同步序列化/重绘越到后面越卡。
                const _histCutoff = this.gameController.currentRound - 2;
                if (_histCutoff > 0) {
                    this.gameController.functionHistory =
                        this.gameController.functionHistory.filter(f => f.round >= _histCutoff);
                }
            }

            // ── 挑衅反转学习钉子 ────────────────────────────────────────────────
            // 当 AI 模式下玩家 A 正在解答 Summa 的挑衅题目，需要让 Summa 学习或反馈
            if (this.gameController.gameMode === 'ai'
                && this.gameController.currentPlayer === 'A'
                && this.aiController.pendingRevengePuzzle !== null) {
                if (data.hitTarget && !data.hitForbidden) {
                    // 玩家成功解题：Summa 学习该解法
                    this.aiController.learnFromPlayer(data.expression);
                } else {
                    // 玩家也失败：Summa 得意
                    this.aiController.notifyPlayerFailedRevenge();
                }
            }

            // ── 玩家解析式深度训练 ─────────────────────────────────────────────────
            // AI 模式下，无论玩家成功与否，都对玩家的解析式进行 10000 局类似局面训练
            if (this.gameController.gameMode === 'ai'
                && this.gameController.currentPlayer === 'A'
                && data.expression) {
                const trainState = this.gameController.getGameState();
                // 静默后台训练，不阻塞游戏流程
                this.aiController.trainOnPlayerExpression(
                    data.expression,
                    trainState.roundState.targetCells,
                    trainState.roundState.forbiddenCells
                );
            }
        });

        // 闯关：关卡结果与自动进入下一关/重试
        this.gameController.on('campaignLevelResult', (data) => {
            this.refreshCampaignStartUI();
            const rawLevelId = data.levelId || this.campaignCurrentLevelId || 1;
            const isFraction = typeof rawLevelId === 'string' && String(rawLevelId).includes('/');
            const levelId = isFraction ? String(rawLevelId) : Number(rawLevelId || 1);
            let isNewRecord = false;
            let previousBest = this.getCampaignLevelBestRecord(levelId);
            if (data.pass) {
                const length = this.getCurrentExpressionLength();
                if (previousBest === null || length < previousBest) {
                    isNewRecord = true;
                    this.campaignCurrentLevelBestRecord = previousBest;
                } else {
                    this.campaignCurrentLevelBestRecord = previousBest;
                }
                data.expressionLength = length;
                data.isNewRecord = isNewRecord;
                data.previousBest = previousBest;
                if (isNewRecord) {
                    const gainedStars = Math.max(1, Math.min(5, Number(data.score) || 1));
                    const previousStars = this.getCampaignLevelBestStars(levelId);
                    if (gainedStars > previousStars) {
                        const currentStars = this.getCampaignCollectedStars();
                        this.setCampaignCollectedStars(currentStars + (gainedStars - previousStars));
                        this.setCampaignLevelBestStars(levelId, gainedStars);
                    }
                    this.setCampaignLevelBestRecord(levelId, length);
                    // 分数关：更新独立进度（首次全通时弹出解锁提示）
                    if (isFraction) {
                        const denom = parseInt(String(rawLevelId).split('/')[1]) || 2;
                        if (typeof this._updateFractionClearedAndNotify === 'function') {
                            this._updateFractionClearedAndNotify(denom);
                        }
                    }
                    setTimeout(() => {
                        if (this.campaignCurrentLevelId === levelId || String(this.campaignCurrentLevelId) === String(levelId)) {
                            this.campaignCurrentLevelBestRecord = length;
                            this.updateCampaignGlobalProgressText(this.getCampaignCollectedStars());
                        }
                    }, 0);
                } else if (data.pass && typeof previousBest === 'number' && previousBest > 0) {
                    // 非新记录但通关了：也更新分数关进度（首次全通时弹出解锁提示）
                    if (isFraction) {
                        const denom = parseInt(String(rawLevelId).split('/')[1]) || 2;
                        if (typeof this._updateFractionClearedAndNotify === 'function') {
                            this._updateFractionClearedAndNotify(denom);
                        }
                    }
                }
            }
            setTimeout(() => {
                try {
                    if (data.pass) {
                        this.showCampaignVictory(data);
                    } else {
                        this.gameController.prepareInputPhase();
                    }
                } catch (e) {
                    console.error('[Campaign] 处理关卡结果失败:', e);
                }
            }, 900);
        });

        this.gameController.on('campaignLevelLoaded', (data) => {
            try {
                this.updateCampaignDrawDelayToggleVisibility();
                // 闯关：隐藏计时器与回合数显示
                if (this.timerElement && this.timerElement.parentElement) {
                    this.timerElement.parentElement.style.display = 'none';
                }
                if (this.currentPlayerElement && this.currentPlayerElement.parentElement) {
                    this.currentPlayerElement.parentElement.style.display = 'none';
                }
                document.querySelectorAll('.score-display').forEach(el => {
                    el.style.display = 'none';
                });
                const roundDisplay = document.getElementById('round-display');
                if (roundDisplay) roundDisplay.style.display = 'none';

                // 更新顶部回合显示为关卡编号
                this.roundElement.textContent = data.levelId;
                this.totalRoundsElement.textContent = data.totalLevels;

                // 清空画布标记与表达式
                this.gridSystem.clearAll();
                this.clearExpression();

                // 设置目标与禁区
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                // 闯关模式每关独立，清空上一关遗留的历史函数与历史格子
                this.gridSystem.functionHistory = [];
                this.gridSystem.usedCells = [];
                this.gridSystem.draw();

                // 初始化可拖拽元素（会根据 lockedElements 上锁）
                this.initDraggableElements();

                // 提示
                const diffName = {
                    easy: '简单',
                    normal: '普通',
                    hard: '困难',
                    expert: '专家',
                    unsolvable: '无解'
                }[data.difficulty] || data.difficulty;
                this.updateCampaignLevelBadge(data.levelId, data.totalLevels, data.difficulty);
                this.showMessage(`闯关：关卡 ${data.levelId}（${diffName}）`, 'info');
            } catch (e) {
                console.error('[Campaign] campaignLevelLoaded 错误:', e);
            }
        });

        this.gameController.on('raceLevelLoaded', (data) => {
            try {
                this.updateCampaignDrawDelayToggleVisibility();
                this.roundElement.textContent = data.levelId;
                this.totalRoundsElement.textContent = data.totalLevels || 30;
                this.updateRaceBattleUI(data.levelId, data.elapsed || 0);
                this.gridSystem.setRaceFixedRange(true);
                this.gridSystem.clearAll();
                this.clearExpression();
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                // 竞速每关独立，清空历史函数
                this.gridSystem.functionHistory = [];
                this.raceLivePanel && (this.raceLivePanel.style.display = 'block');
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.gridSystem.draw();
                this.initDraggableElements();
                this.startRaceCountdown();
                this.showMessage(`竞速：第 ${data.levelId} 关`, 'info');
            } catch (e) {
                console.error('[Race] raceLevelLoaded 错误:', e);
            }
        });

        this.gameController.on('racePuzzleLoaded', (data) => {
            try {
                this.gridSystem.clearAll();
                this.clearExpression();
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.gridSystem.draw();
                this.initDraggableElements();
            } catch (e) {
                console.error('[Race] racePuzzleLoaded 错误:', e);
            }
        });

        this.gameController.on('racePuzzleCleared', (data) => {
            try {
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.updateRaceBattleUI(data.levelId, data.elapsed || 0);
                this.showMessage(`已完成 ${data.solvedCount}/${data.totalSolved} 个谜题`, 'info');
            } catch (e) {
                console.error('[Race] racePuzzleCleared 错误:', e);
            }
        });

        this.gameController.on('raceLevelResult', (data) => {
            try {
                if (data.pass) {
                    this.clearRaceCountdown();
                    this.stopRaceElapsedTimer();
                    if (data.isNewBest) this.playRaceNewRecordIntro(() => { if (window.audioManager) window.audioManager.playRaceFanfare?.(); this.unlockNextRaceLevel(data.levelId); this.showRaceVictory(data); });
                    else { if (window.audioManager) window.audioManager.playRaceFinish?.(); this.unlockNextRaceLevel(data.levelId); this.showRaceVictory(data); }
                } else {
                    this.showMessage('挑战失败，请重试本关', 'error');
                    this.gameController.prepareInputPhase();
                }
            } catch (e) {
                console.error('[Race] raceLevelResult 错误:', e);
            }
        });
        
        // 回合结束时的处理
        this.gameController.on('roundComplete', (data) => {
            try {
                // 1. 更新UI
                this.updateScoreboard();
                this.roundElement.textContent = data.currentRound;
                
                // 2. 清空当前回合的目标格和禁区（但保留usedCells）
                this.gridSystem.clearAll();
                // 保留解析式开关——仅闯关/竞速模式生效，对战/P2P/AI 模式始终清空
                const isCampaignOrRace = this.gameController.gameMode === 'campaign' ||
                                         this.gameController.gameMode === 'race';
                if (!(isCampaignOrRace && this.keepExprToggle && this.keepExprToggle.checked)) {
                    this.clearExpression();
                }
                
                // 3. 显示消息
                this.showMessage(`第 ${data.currentRound - 1} 回合结束`);
                
                // 4. 重新初始化元素视图
                this.initDraggableElements();
                
                // 5. 更新usedCells并重绘
                const state = this.gameController.getGameState();
                if (state.usedCells && state.usedCells.length > 0) {
                    this.gridSystem.usedCells = state.usedCells;
                }
                
                // 6. 更新历史函数
                if (state.functionHistory && state.functionHistory.length > 0) {
                    this.gridSystem.functionHistory = state.functionHistory;
                    this.gridSystem.currentRound = data.currentRound;
                }
                
                this.gridSystem.draw();
            } catch (error) {
                console.error('[UI] roundComplete 错误:', error);
            }
        });
        
        this.gameController.on('gameEnd', (data) => {
            if (window.audioManager) window.audioManager.playGameWin();
            const finishGameOver = () => this.showGameOver(data);

            // Summa Reaction Hook
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                const summa = window.summaCharacter;
                const prevHandler = summa.onSpeechQueueEmpty;
                summa.onSpeechQueueEmpty = () => {
                    summa.onSpeechQueueEmpty = prevHandler || null;
                    finishGameOver();
                    if (typeof prevHandler === 'function') prevHandler();
                };
                if (data.winner === 'B') {
                    summa.reactWin();
                    return;
                } else if (data.winner === 'A') {
                    summa.reactLose();
                    return;
                }
            }
            finishGameOver();
        });
    }
;

// bindEvents
    UIController.prototype.bindEvents = function() {
        // Canvas 点击事件
        this.gridSystem.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.gridSystem.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.gridSystem.canvas.addEventListener('mousemove', (e) => this.checkHistoryFunctionHover(e));
        
        // 按钮事件
        this.confirmBtn.addEventListener('click', () => this.handleConfirm());
        this.clearBtn.addEventListener('click', () => this.handleClear());
        this.exitBtn.addEventListener('click', () => this.handleExitClick());
        this.restartBtn.addEventListener('click', () => this.handleRestart());
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.bindStartKeyboardSupport();
        this._bindModalDismissals();
        this._bindP2PDisconnectButtons();
        this.bindGlobalEsc();
        if (this.viewReportBtn) {
            this.viewReportBtn.addEventListener('click', () => this.showGameReport());
        }
        if (this.closeReportBtn) {
            this.closeReportBtn.addEventListener('click', () => this.hideGameReport());
        }
        
        // 退出气泡框事件
        if (this.cancelExitBtn) {
            this.cancelExitBtn.addEventListener('click', () => this.hideExitConfirm());
        }
        if (this.confirmExitBtn) {
            this.confirmExitBtn.addEventListener('click', () => this.handleExit());
        }
        
        // 表达式显示区点击删除与光标移动
        this.expressionDisplay.addEventListener('click', (e) => this.handleExpressionClick(e));
        this.bindExpressionScrollSupport();
        
        // 键盘输入事件
        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e), true);

        // 设备切换/旋转时重建元素面板（桌面网格 ↔ 移动端内联布局不同）
        window.addEventListener('devicechange', () => {
            if (this.gameController && this.gameController.currentPhase) {
                this.initDraggableElements();
            }
        });
        
        // 初始化拖拽元素
        this.initDraggableElements();
    }
;

// isMouseNearFunction
    UIController.prototype.isMouseNearFunction = function(mouseX, mouseY, points, thresholdPx) {
        const validPoints = points.filter(p => p.y !== null);
        
        for (let i = 0; i < validPoints.length - 1; i++) {
            const p1 = this.gridSystem.mathToCanvas(validPoints[i].x, validPoints[i].y);
            const p2 = this.gridSystem.mathToCanvas(validPoints[i + 1].x, validPoints[i + 1].y);
            
            // 计算点到线段的距离
            const distance = this.pointToLineDistance(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y);
            if (distance <= thresholdPx) {
                return true;
            }
        }
        
        return false;
    }
;

// pointToLineDistance
    UIController.prototype.pointToLineDistance = function(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            return Math.sqrt(A * A + B * B);
        }
        
        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param));
        
        const xx = x1 + param * C;
        const yy = y1 + param * D;
        
        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }
;

// triggerAITurn
    UIController.prototype.triggerAITurn = async function(phase) {
        // 测试模式不触发AI
        if (this.gameController.isTestMode()) return;

        // ★ 游戏已停止（退出后），不再触发AI
        if (!this._gameActive) return;

        // 只处理AI可以操作的阶段，忽略evaluate/switch_player等中间阶段
        const aiActionablePhases = ['select_target', 'set_forbidden', 'set_locks', 'input_function'];
        if (!aiActionablePhases.includes(phase)) {
            console.log(`[UI] 阶段 ${phase} 无需AI操作，跳过`);
            return;
        }

        // 检查当前是否是AI的回合
        const state = this.gameController.getGameState();
        if (state.currentPlayer !== 'B') {
            console.log('[UI] 当前不是AI的回合，跳过');
            return;
        }

        // 再次检查（异步期间可能已退出）
        if (!this._gameActive) return;

        // 添加到队列
        this.aiTriggerQueue.push(phase);
        console.log(`[UI] AI触发请求入队: ${phase}, 队列长度: ${this.aiTriggerQueue.length}`);
        
        // 如果正在处理，直接返回
        if (this.isProcessingAITrigger) {
            console.log('[UI] 正在处理AI触发，等待');
            return;
        }
        
        // 处理队列
        await this.processAITriggerQueue();
    }
;

// processAITriggerQueue
    UIController.prototype.processAITriggerQueue = async function() {
        if (this.aiTriggerQueue.length === 0 || this.isProcessingAITrigger) {
            return;
        }

        this.isProcessingAITrigger = true;

        while (this.aiTriggerQueue.length > 0) {
            // ★ 游戏已停止，立即清空队列退出
            if (!this._gameActive) {
                this.aiTriggerQueue = [];
                break;
            }

            const phase = this.aiTriggerQueue.shift();

            // 如果AI正在思考，将阶段放回队首并等待，避免phase丢失
            if (this.aiController.isThinking) {
                console.log('[UI] AI正在思考，等待完成');
                this.aiTriggerQueue.unshift(phase); // 放回队首，不丢弃
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            
            console.log(`[UI] 处理AI触发，阶段: ${phase}`);
            this.showMessage(`Summa 正在思考...`, 'info');
            
            try {
                await this.aiController.playTurn(phase);
                console.log('[UI] AI阶段完成');
            } catch (error) {
                console.error('[UI] AI阶段出错:', error);
            }
            
            // 等待一小段时间，让phaseChange事件有机会触发
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        this.isProcessingAITrigger = false;
        console.log('[UI] AI触发队列处理完毕');
    }
;

// _isMyTurn
    UIController.prototype._isMyTurn = function() {
        if (!this.isP2PMode || !this.p2pController) return true;
        const phase = this.gameController.currentPhase;
        const me = this.p2pController.myPlayerId;            // 'A' | 'B'
        const curr = this.gameController.currentPlayer;      // 当前应操作的玩家
        const isMine = (phase === 'select_target' || phase === 'set_forbidden' || phase === 'set_locks' || phase === 'input_function') && curr === me;
        console.log(`[UI][Turn] phase=${phase}, me=${me}, currentPlayer=${curr}, isMyTurn=${isMine}`);
        return isMine;
    }
;

// getPlayerDisplayName
    UIController.prototype.getPlayerDisplayName = function(playerId, turn = false) {
        if (!playerId) return '未知';

        const state = this.gameController?.getGameState();
        const gameMode = state?.gameMode;

        if (gameMode === 'p2p' && this.p2pController) {
            if (playerId === this.p2pController.myPlayerId) {
                return turn ? '我的回合' : '我';
            }
            return turn ? '对方回合' : '对方';
        }

        if (gameMode === 'ai' && playerId === 'B') {
            return 'Summa';
        }

        return `玩家 ${playerId}`;
    }
;

// _syncToPeer
    // confirmKey 非空 = 阶段切换确认推送（要求对方回 state_sync_ack，并带重发），不节流；
    // 否则为普通推送（有 50ms 节流）。
    UIController.prototype._syncToPeer = function(confirmKey = null) {
        if (this._applyingRemote) return;
        if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
        const now = Date.now();
        if (!confirmKey && this._lastSyncTime && now - this._lastSyncTime < 50) return; // 简单节流
        this._lastSyncTime = now;
        this.p2pController.sendStateSync(this.buildSyncSnapshot(), confirmKey);
    }
;

// _p2pSyncNow
    // 绕过节流立即同步一次：用于棋盘点选/锁定等低频但要求"每点击一次同步一次"的操作。
    // confirm=true 时生成阶段确认 key（触发对方回执 + 重发，用于阶段切换）。
    // 关键：300ms 内复用同一 confirm key。evaluateResult 内 setPhase(SWITCH_PLAYER) +
    // switchPlayer 内 setPhase(SELECT_TARGET) 会连续两次调用本函数（确认 push），
    // 若都生成新 key → 两次独立的高频重发（8 次 × 2 = 16 条消息）；复用同一 key 只 8 次。
    UIController.prototype._p2pSyncNow = function(confirm = false) {
        if (this._applyingRemote) return;
        if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
        this._lastSyncTime = 0;
        let key = null;
        if (confirm) {
            const now = Date.now();
            if (this._lastConfirmTime && this._lastConfirmKey &&
                now - this._lastConfirmTime < 300) {
                key = this._lastConfirmKey;
            } else {
                key = this.p2pController.nextSyncConfirmKey();
                this._lastConfirmKey = key;
                this._lastConfirmTime = now;
            }
        }
        this._syncToPeer(key);
    }
;

// buildSyncSnapshot
    UIController.prototype.buildSyncSnapshot = function() {
        return {
            gc: this.gameController.getStateSnapshot(),
            expr: this.expressionElements.slice(),
            cursorIndex: this.cursorIndex
        };
    }
;

// applySyncSnapshot
    UIController.prototype.applySyncSnapshot = function(s) {
        if (!s || !s.gc) return;
        this._applyingRemote = true;
        try {
            const gc = this.gameController;
            const prevRound = gc.currentRound;
            const prevPhase = gc.currentPhase;
            // 应用前记录本地"未提交操作"，用于检测本地操作被远端快照覆盖/回滚并提示用户
            const hadLocalExpr = this.expressionElements.length > 0;
            const prevExprStr = this.expressionElements.join('|');
            const prevTargets = (gc.roundState && gc.roundState.targetCells) ? gc.roundState.targetCells.length : 0;
            const prevForbidden = (gc.roundState && gc.roundState.forbiddenCells) ? gc.roundState.forbiddenCells.length : 0;
            const applied = gc.loadStateSnapshot(s.gc);
            // 以操作方为基准：轮到本方的回合内，不覆盖本方的表达式输入（避免吞字符）。
            // 用远端快照里的 currentPlayer 判断而非应用后的本地值：若快照因版本过滤被拒绝，
            // 本地 currentPlayer 未更新，用本地值判断会误判"轮到对方"而吞掉本方正在输入的表达式。
            const myId = this.p2pController && this.p2pController.myPlayerId;
            const isMyTurn = !!(myId && s.gc && s.gc.currentPlayer === myId);
            const newRound = gc.currentRound;
            const newPhase = gc.currentPhase;
            // 回合推进（进入新回合）：清空表达式与棋盘残留。
            // 操作方本地由 switchPlayer→roundComplete 清理；被动方靠快照推进时也必须清理，
            // 否则上一回合构造的表达式/目标格会残留到新回合（如构造方 y=1 残留、目标/禁止格残留）。
            // 此时刻意不采用 s.expr（操作方快照里可能仍带其本地输入残留），强制置空。
            const roundAdvanced = applied && newRound !== prevRound;
            // 兜底：只要进入 SELECT_TARGET（新回合开始，不允许输入表达式），就强制清空表达式残留。
            // 覆盖（applied=false 本地维持 SELECT_TARGET）或（roundAdvanced=false 应对端也推进过了）
            // 等场景，避免 y=1 等残留。
            const enteredSelectTarget = applied && newPhase === this.gameController.phases.SELECT_TARGET &&
                prevPhase !== this.gameController.phases.SELECT_TARGET;
            if (roundAdvanced || enteredSelectTarget) {
                this.expressionElements = [];
                this.cursorIndex = 0;
                this.gridSystem.clearAll();
            } else if (!isMyTurn) {
                this.expressionElements = (s.expr || []).slice();
                this.cursorIndex = (typeof s.cursorIndex === 'number') ? s.cursorIndex : this.expressionElements.length;
            }
            // ── 回滚提示：本地未提交操作被远端快照覆盖/清空时，明确告知用户 ──
            // 仅在同一回合内（非正常回合推进清理）检测，避免新回合清空被误报为"回滚"。
            if (applied && !roundAdvanced && !enteredSelectTarget) {
                const nowExprStr = this.expressionElements.join('|');
                const nowTargets = (gc.roundState && gc.roundState.targetCells) ? gc.roundState.targetCells.length : 0;
                const nowForbidden = (gc.roundState && gc.roundState.forbiddenCells) ? gc.roundState.forbiddenCells.length : 0;
                const exprReset = hadLocalExpr && nowExprStr !== prevExprStr;
                const targetsReset = prevTargets > 0 && nowTargets < prevTargets;
                const forbiddenReset = prevForbidden > 0 && nowForbidden < prevForbidden;
                if (exprReset || targetsReset || forbiddenReset) {
                    this.showMessage('状态已与对手同步：你未提交的操作已被重置', 'warning');
                }
            }
            // 只有真正应用了新的状态才执行完整重绘，避免旧/重复快照触发不必要的重绘
            if (applied) this._renderFromState();
        } finally {
            this._applyingRemote = false;
        }
    }
;

// submitFunction
    UIController.prototype.submitFunction = function() {
        if (this.expressionElements.length === 0) {
            this.showMessage('请输入函数表达式', 'error');
            return;
        }
        
        const expression = this.currentExpression;
        
        // 验证语法
        const validation = this.parser.validateSyntax(expression);
        if (!validation.valid) {
            this.showMessage(validation.error, 'error');
            return;
        }
        
        // 测试模式：不需要验证锁定元素，直接绘制
        if (this.gameController.isTestMode()) {
            this.renderTestModeFunction(expression);
            return;
        }
        
        // 验证锁定元素
        const lockCheck = this.parser.validateExpressionForLocks(expression);
        if (!lockCheck.valid) {
            this.showMessage(`表达式包含被锁定的元素: ${lockCheck.lockedElement}`, 'error');
            return;
        }
        
        // 提交函数
        this.gameController.submitFunction(expression);
        
        // P2P：突破 50ms 节流，立刻推送表达式给对手（让对手同步绘制）
        if (this.isP2PMode && this.p2pController && this.p2pController.isConnected) {
            this._lastSyncTime = 0;  // 清除节流
            this._syncToPeer();
        }
        
        // 绘制函数并检测碰撞
        this.renderAndEvaluate(expression);
    }
;

// forceSubmitFunction
    UIController.prototype.forceSubmitFunction = async function(expression) {
        const finalExpression = String(expression || '').trim();
        if (!finalExpression) return false;

        // 同步界面表达式，确保报告/显示一致
        this.currentExpression = finalExpression;
        this.expressionElements = this.tokenizeExpression(finalExpression);
        this.cursorIndex = this.expressionElements.length;
        this.updateExpressionDisplay();

        if (this.gameController.isTestMode()) {
            await this.renderTestModeFunction(finalExpression);
            return true;
        }

        this.gameController.submitFunction(finalExpression);
        await this.renderAndEvaluate(finalExpression);
        return true;
    }
;

// flashGrid
    UIController.prototype.flashGrid = function(type) {
        const canvas = this.gridSystem.canvas;
        
        if (type === 'target') {
            canvas.style.boxShadow = '0 0 30px #5b9e6e';
        } else if (type === 'forbidden' || type === 'miss') {
            canvas.style.boxShadow = '0 0 30px #ef4444';
        }
        
        setTimeout(() => {
            canvas.style.boxShadow = 'none';
        }, 1000);
    }
;

// handleClear
    UIController.prototype.handleClear = function() {
        const state = this.gameController.getGameState();

        // AI 正在输入时，禁止清除 Summa 的表达式，避免误删 AI 当前回合输入
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B' && this.gameController.currentPhase === 'input_function') {
            this.showMessage('Summa 正在输入表达式，无法清除', 'info');
            return;
        }

        // P2P：非本方（构造方）回合，禁止清空表达式，避免误删对手正在构建的函数
        if (this.isP2PMode && !this._isMyTurn()) {
            this.showMessage('等待对手构造函数…', 'info');
            return;
        }

        // 测试模式：只清除当前输入，不清除已绘制的函数
        if (this.gameController.isTestMode()) {
            this.clearExpression();
            this.showMessage('已清除当前输入');
            return;
        }
        
        this.clearExpression();
        this.gridSystem.draw();
    }
;

// handleSkip
    UIController.prototype.handleSkip = function() {
        // 测试模式：结束测试返回开始界面
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
            return;
        }
        
        // 人机模式下，如果当前是AI的回合，禁止玩家操作
        const state = this.gameController.getGameState();
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.showMessage('Summa 正在思考中...', 'info');
            return;
        }
        
        this.gameController.skipPhase();
    }
;

// forceStopGame
    UIController.prototype.forceStopGame = function() {
        // 1. 停止计时器
        if (this.gameController && typeof this.gameController.stopTimer === 'function') {
            this.gameController.stopTimer();
        }

        // 2. 清空 AI 触发队列，防止退出后 AI 继续行动
        this.aiTriggerQueue = [];
        this.isProcessingAITrigger = false;

        // 3. 如果 AI 正在思考，标记为已取消（aiController 检查此标志）
        this._gameActive = false;

        // 4. 清除消息提示
        this.showMessage('');
    }
;

// _markGameActive
    UIController.prototype._markGameActive = function() {
        this._gameActive = true;
    }
;

// handleExitClick
    UIController.prototype.handleExitClick = function() {
        // 测试模式直接退出，不显示气泡框
        if (this.gameController.isTestMode()) {
            this.handleExit();
        } else {
            // 普通模式显示确认气泡框
            this.showExitConfirm();
        }
    }
;

// playUIButtonSound
    UIController.prototype.playUIButtonSound = function(action) {
        if (window.audioManager) window.audioManager.playClick();
        if (typeof action === 'function') action();
    }
;

// handleExit
    UIController.prototype.handleExit = function() {
        if (window.audioManager) window.audioManager.playClick();
        this.hideExitConfirm();

        // ★ 先强制停止游戏运行（停计时器、清AI队列、标记非活跃）
        this.forceStopGame();

        // P2P 联机模式：断开连接并返回开始界面
        if (this.isP2PMode || this.gameController.gameMode === 'p2p') {
            this._cleanupP2P();
            this.isP2PMode = false;
            // 清理上一局残留的历史函数与格子
            if (this.gridSystem) {
                this.gridSystem.functionHistory = [];
                this.gridSystem.usedCells = [];
            }
            this._lastRemoteExpr = null;
            this.resetBattleGrid();
            this.hideModal(this.gameOverModal);
            const p2pModal = document.getElementById('p2p-room-modal');
            if (p2pModal) this.hideModal(p2pModal);
            this.showModal(this.startModal);
            return;
        }

        // 闯关模式：返回难度选择界面
        if (this.gameController.gameMode === 'campaign') {
            this.returnCampaignToDifficulty();
            return;
        }

        // 竞速模式：返回等级列表界面
        if (this.gameController.gameMode === 'race') {
            if (this.gameController && typeof this.gameController.cleanupRaceState === 'function') {
                this.gameController.cleanupRaceState();
            }
            if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
                this.gridSystem.setRaceFixedRange(false);
            }
            this.resetBattleGrid();
            this.hideModal(this.gameOverModal);
            this.hideModal(this.startModal);
            this.showRaceUI();
            return;
        }

        // 如果是测试模式，执行退出测试逻辑
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
        } else {
            // 普通对战模式：返回开始界面
            this.gameController.resetGame();
            this.resetBattleGrid();
            this.hideModal(this.gameOverModal);
            this.showModal(this.startModal);
        }
    }
;

// bindGlobalEsc
    UIController.prototype.bindGlobalEsc = function() {
        if (this._globalEscBound) return;
        this._globalEscBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const top = this._modalStackTopVisible();
            if (!top || top === this.startModal) return;
            // 仅处理显式注册为「可关闭」的弹窗，避免误关未注册弹窗（如关卡选择）
            if (!top._dismissBound) return;
            e.preventDefault();
            if (typeof top._onEscDismiss === 'function') {
                top._onEscDismiss();
            } else if (typeof top._onMaskDismiss === 'function') {
                top._onMaskDismiss();
            } else {
                this.hideModal(top);
            }
        });
    }
;

// hideBattleUI
    UIController.prototype.hideBattleUI = function() {
        this.battleUiHidden = true;
        if (this.header) {
            this.header.classList.add('campaign-mode');
        }
        document.querySelectorAll('.score-display').forEach(el => el.style.display = 'none');
        if (this.currentPlayerElement && this.currentPlayerElement.parentElement) {
            this.currentPlayerElement.parentElement.style.display = 'none';
        }
        if (this.timerElement && this.timerElement.parentElement) {
            this.timerElement.parentElement.style.display = 'none';
        }
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = 'none';
        this._syncKeepExprToggleVisibility();
    }
;

// restoreBattleUI
    UIController.prototype._syncKeepExprToggleVisibility = function() {
        const toggleWrap = document.getElementById('keep-expr-toggle-wrap');
        if (!toggleWrap) return;
        const mode = this.gameController && this.gameController.gameMode;
        toggleWrap.style.display = (mode === 'campaign' || mode === 'race') ? '' : 'none';
    };

    UIController.prototype.restoreBattleUI = function() {
        this.battleUiHidden = false;
        this.updateCampaignDrawDelayToggleVisibility();
        if (this.header) {
            this.header.classList.remove('campaign-mode');
        }
        document.querySelectorAll('.score-display').forEach(el => el.style.display = '');
        if (this.currentPlayerElement && this.currentPlayerElement.parentElement) {
            this.currentPlayerElement.parentElement.style.display = '';
        }
        if (this.timerElement && this.timerElement.parentElement) {
            this.timerElement.parentElement.style.display = '';
        }
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = '';
        const badge = document.getElementById('campaign-level-badge');
        if (badge) badge.style.display = 'none';
        this._syncKeepExprToggleVisibility();
    }
;

// resetBattleGrid
    UIController.prototype.resetBattleGrid = function() {
        if (!this.gridSystem) return;

        if (typeof this.gridSystem.setCampaignFixedRange === 'function') {
            this.gridSystem.setCampaignFixedRange(false);
        }
        if (typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(false);
        }

        if (typeof this.gridSystem.clearAll === 'function') {
            this.gridSystem.clearAll();
        }

        if (typeof this.gridSystem.setRange === 'function') {
            this.gridSystem.setRange(5);
        }

        if (typeof this.gridSystem.draw === 'function') {
            this.gridSystem.draw();
        }
    }
;

// calculateLRSigma
    UIController.prototype.calculateLRSigma = function(cleared, difficulty) {
        if (!cleared || cleared <= 0) return 0;
        let sum = 0;
        // 整数关卡 1..cleared
        for (let i = 1; i <= cleared; i++) {
            const best = this.getCampaignLevelBestRecord(i);
            if (best !== null && best > 0) {
                sum += 100 / (10 + best);
            }
        }
        // 分数关卡（1/2..1/20）
        if (difficulty === 'fraction' || (typeof this.getCampaignFractionClearedMax === 'function')) {
            const fracMax = typeof this.getCampaignFractionClearedMax === 'function'
                ? this.getCampaignFractionClearedMax() : 0;
            for (let denom = 2; denom <= fracMax && denom <= 20; denom++) {
                const best = this.getCampaignLevelBestRecord(`1/${denom}`);
                if (best !== null && best > 0) {
                    sum += 100 / (10 + best);
                }
            }
        }
        return sum;
    }
;

// getDifficultyRange
    UIController.prototype.getDifficultyRange = function(diff) {
        if (diff === 'easy') return { start: 1, end: 29, cls: 'easy', label: '简单（1-29）' };
        if (diff === 'normal') return { start: 30, end: 53, cls: 'normal', label: '普通（30-53）' };
        if (diff === 'hard') return { start: 54, end: 69, cls: 'hard', label: '困难（54-69）' };
        if (diff === 'fraction') return { start: 2, end: 20, cls: 'fraction', label: '分数关（1/2-1/20）' };
        if (diff === 'expert') return { start: 70, end: 81, cls: 'expert', label: '专家（70-81）' };
        return { start: 82, end: 90, cls: 'unsolvable', label: '无解（82-90）' };
    }
;

// refreshUnsovableDifficultyVisibility
    UIController.prototype.refreshUnsovableDifficultyVisibility = function() {
        const grid = document.getElementById('campaign-difficulty-grid');
        if (!grid) return;
        const cleared = this.getCampaignClearedMax();
        const fractionCleared = (typeof this.getCampaignFractionClearedMax === 'function')
            ? this.getCampaignFractionClearedMax() : 0;
        const fractionBtn = document.getElementById('campaign-diff-fraction');
        const unsolvableBtn = document.getElementById('campaign-diff-unsolvable');
        const showFraction = fractionCleared >= 1 || cleared >= 1;
        const showUnsolvable = cleared >= 81;
        if (fractionBtn) fractionBtn.style.display = showFraction ? '' : 'none';
        if (unsolvableBtn) unsolvableBtn.style.display = showUnsolvable ? '' : 'none';
        let visibleCount = 4; // easy / normal / hard / expert 始终可见
        if (showFraction) visibleCount++;
        if (showUnsolvable) visibleCount++;
        grid.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;
    }
;

// adjustRange
    UIController.prototype.adjustRange = function(step) {
        const newRange = this.gridSystem.range + step;
        // 严格限制在最小值和最大值之间
        const clampedRange = Math.max(
            this.gridSystem.minRange,
            Math.min(newRange, this.gridSystem.maxRange)
        );
        
        if (clampedRange !== this.gridSystem.range) {
            this.gridSystem.range = clampedRange;
            this.gridSystem.gridSize = clampedRange * 2;
            requestAnimationFrame(() => this.gridSystem.resize());
        }
        return this.gridSystem.range;
    }
;

// addFunctionListContainer
    UIController.prototype.addFunctionListContainer = function() {
        // 检查是否已存在
        if (document.getElementById('function-list')) return;
        
        const container = document.createElement('div');
        container.id = 'function-list';
        container.className = 'function-list';
        container.innerHTML = '<div class="function-list-title">已绘制函数（点击编辑或删除）</div>';
        
        // 插入到按钮区域之后
        const buttonArea = this.confirmBtn.parentElement;
        buttonArea.parentElement.insertBefore(container, buttonArea.nextSibling);
    }
;

// updateFunctionList
    UIController.prototype.updateFunctionList = function() {
        const container = document.getElementById('function-list');
        if (!container) return;
        
        const functions = this.gameController.getTestModeFunctions();
        
        // 清除旧的列表项（保留标题）
        const title = container.querySelector('.function-list-title');
        container.innerHTML = '';
        container.appendChild(title);
        
        // 添加每个函数的条目
        functions.forEach((func, index) => {
            const item = document.createElement('div');
            item.className = 'function-item';
            item.style.borderLeftColor = func.color;
            item.innerHTML = `
                <span class="function-expr">${func.expression}</span>
                <div class="function-actions">
                    <button class="btn-edit" data-index="${index}" title="编辑">✎</button>
                    <button class="btn-delete" data-index="${index}" title="删除">✕</button>
                </div>
            `;
            
            // 绑定编辑事件
            item.querySelector('.btn-edit').addEventListener('click', () => {
                this.editTestFunction(index);
            });
            
            // 绑定删除事件
            item.querySelector('.btn-delete').addEventListener('click', () => {
                this.deleteTestFunction(index);
            });
            
            container.appendChild(item);
        });
    }
;

// editTestFunction
    UIController.prototype.editTestFunction = function(index) {
        const functions = this.gameController.getTestModeFunctions();
        const func = functions[index];
        if (!func) return;
        
        // 使用智能分词加载函数表达式
        this.expressionElements = this.tokenizeExpression(func.expression);
        // 设置光标到末尾
        this.cursorIndex = this.expressionElements.length;
        this.updateExpressionDisplay();
        
        // 删除原函数（重新绘制时会添加新的）
        this.deleteTestFunction(index);
        
        this.showMessage(`正在编辑: ${func.expression}`);
    }
;

// deleteTestFunction
    UIController.prototype.deleteTestFunction = function(index) {
        const functions = this.gameController.getTestModeFunctions();
        functions.splice(index, 1);
        
        // 重新绘制所有函数
        this.redrawAllTestFunctions();
        this.updateFunctionList();
        
        this.showMessage('函数已删除');
    }
;

// addClearFunctionsButton
    UIController.prototype.addClearFunctionsButton = function() {
        // 检查是否已存在
        if (document.getElementById('clear-functions-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'clear-functions-btn';
        btn.className = 'btn btn-secondary';
        btn.textContent = '清空所有函数';
        btn.addEventListener('click', () => {
            this.gameController.clearTestModeFunctions();
            this.gridSystem.clearAll();
            this.showMessage('已清空所有函数');
        });
        
        // 插入到确认按钮之前
        this.confirmBtn.parentElement.insertBefore(btn, this.confirmBtn);
    }
;

// showMessage
    UIController.prototype.showMessage = function(message, type = 'info') {
        // 清除之前的定时器（含上一条消息的渐隐动画 interval，避免连续提示互相干扰，修复 #33）
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        if (this._fadeInterval) {
            clearInterval(this._fadeInterval);
            this._fadeInterval = null;
        }

        this.messageElement.textContent = message;
        this.messageElement.style.opacity = '1';
        
        // 显示消息容器并设置样式
        if (this.messagePanel) this.messagePanel.classList.add('visible');
        this.messageElement.className = 'message';
        
        if (type === 'error') {
            this.messageElement.classList.add('error');
        } else if (type === 'success') {
            this.messageElement.classList.add('success');
        }
        
        // 错误/警告类消息停留更久（便于用户读完），普通信息 2 秒后渐隐
        const duration = (type === 'error' || type === 'warning') ? 5000 : 2000;
        this.messageTimeout = setTimeout(() => {
            this.fadeOutMessage();
        }, duration);
    }
;

// fadeOutMessage
    UIController.prototype.fadeOutMessage = function() {
        let opacity = 1;
        this._fadeInterval = setInterval(() => {
            opacity -= 0.05;
            if (opacity <= 0) {
                clearInterval(this._fadeInterval);
                this._fadeInterval = null;
                this.messageElement.textContent = '';
                this.messageElement.className = 'message';
                this.messageElement.style.opacity = '1';
                if (this.messagePanel) this.messagePanel.classList.remove('visible');
            } else {
                this.messageElement.style.opacity = opacity.toString();
            }
        }, 50); // 每50ms减少0.05，总共1秒完成渐隐
    }
;

// getDifficultyName
    UIController.prototype.getDifficultyName = function(difficulty) {
        const names = {
            'easy': '简单',
            'normal': '普通',
            'hard': '困难',
            'fraction': '分数关',
            'expert': '专家',
            'unsolvable': '无解',
            'test': '测试'
        };
        return names[difficulty] || difficulty;
    }
;

// getFunctionTypeName
    UIController.prototype.getFunctionTypeName = function(type) {
        const names = {
            'constant': '常值函数',
            'degree_1': '一次函数',
            'degree_2': '二次函数',
            'degree_3': '三次函数',
            'degree_4': '四次及以上',
            'fraction': '分式函数',
            'abs': '绝对值函数',
            'sin': '正弦函数',
            'cos': '余弦函数',
            'tan': '正切函数',
            'exp': '指数函数',
            'ln': '自然对数',
            'log': '常用对数',
            'sqrt': '根号函数',
            'factorial': '阶乘函数',
            'euler': '欧拉公式'
        };
        return names[type] || type;
    }
;

