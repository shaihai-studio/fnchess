/**
 * UICoreInit —— UICore 模块切片（UIController.prototype 挂载）
 *
 * 基础：文件头、initUI、难度/回合/时间限制参数步进与提示、选中难度
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

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
        this.playerNameAElement = document.getElementById('player-name-a');
        this.playerNameBElement = document.getElementById('player-name-b');
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
        this.skipBtn = document.getElementById('skip-btn');

        // 「提交失败后保留解析式」开关
        this.keepExprToggle = document.getElementById('keep-expr-toggle');
        
        // 「反三角函数」开关（开始界面，需通关全部分数关解锁）
        this.inverseTrigToggle = document.getElementById('inverse-trig-toggle');
        this.inverseTrigToggleWrap = document.getElementById('inverse-trig-toggle-wrap');
        if (this.inverseTrigToggle) {
            this.inverseTrigToggle.addEventListener('change', () => {
                this.setInverseTrigEnabled(this.inverseTrigToggle.checked);
            });
            // 未解锁时 checkbox 是 disabled（点击无任何反应），用户会困惑"勾了开关为什么没用"。
            // 拦截 label 点击：未解锁 → 阻止默认行为并弹出解锁提示，给出明确反馈。
            if (this.inverseTrigToggleWrap) {
                this.inverseTrigToggleWrap.addEventListener('click', (e) => {
                    if (this.inverseTrigToggle.disabled) {
                        e.preventDefault();
                        if (typeof this.showInverseTrigLockedDialog === 'function') {
                            this.showInverseTrigLockedDialog();
                        }
                    }
                });
            }
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
        // 本地/人机对战 配置确认弹窗
        this.modeConfigModal = document.getElementById('mode-config-modal');
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
        this.modeCampaignClassicBtn = document.getElementById('mode-campaign-classic');
        this.modeRaceStandardBtn = document.getElementById('mode-race-standard');
        this.modeRaceCustomBtn = document.getElementById('mode-race-custom');
        this.modeRaceBattleBtn = document.getElementById('mode-race-battle');
        this._battleSubmenu = document.getElementById('battle-submenu');
        this._campaignSubmenu = document.getElementById('campaign-submenu');
        this._raceSubmenu = document.getElementById('race-submenu');
        this.modeHint = document.getElementById('mode-hint');
        this.selectedMode = 'battle'; // 默认对战模式
        this._battleSubMode = 'local'; // 默认子模式：本地对战
        this._campaignSubMode = 'classic'; // 闯关子模式：经典闯关（classic）/ 关卡编辑器（editor）
        this._raceSubMode = 'standard'; // 竞速子模式：标准竞速（standard）/ 竞速试炼场（custom）/ 联机竞速（battle）

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
        this.initEditor();
        this.initCampaignImport();
        this.initFloatKeypad();
        // 「开始游戏」按钮（开始界面）→「进入主界面」；主界面左上角「返回」→ 回开始界面
        const startGoBtn = document.getElementById('start-go-btn');
        if (startGoBtn) startGoBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.showMainPage();
        });
        const mainBackBtn = document.getElementById('main-back-btn');
        if (mainBackBtn) mainBackBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.showStartPage();
        });
        this.refreshStartSelectorDisplay();
        this.initModeConfigModal();
        
        
        // 绑定模式切换按钮
        if (this.modeBattleBtn && this.modeCampaignBtn && this.modeRaceBtn) {
            this.modeBattleBtn.addEventListener('click', () => this.selectMode('battle'));
            this.modeCampaignBtn.addEventListener('click', () => this.selectMode('campaign'));
            this.modeRaceBtn.addEventListener('click', () => this.selectMode('race'));
        }
        // 测试模式：点击直接进入测试对局（无需开始游戏按钮）
        if (this.modeTestBtn) {
            this.modeTestBtn.addEventListener('click', () => {
                this.selectMode('test');
                this.handleStart();
            });
        }
        // 对战子菜单按钮：点击后直接进入对应流程
        // 本地对战 / 人机对战 → 弹配置确认弹窗；联机对战 → 直接打开房间弹窗
        if (this.modeLocalBtn) {
            this.modeLocalBtn.addEventListener('click', () => {
                this._battleSubMode = 'local';
                this.selectMode('battle');
                this.modeHint.textContent = '本地对战：两位玩家轮流操作';
                this._openModeConfigModal('local');
            });
        }
        if (this.modeAiBtn) {
            this.modeAiBtn.addEventListener('click', () => {
                this._battleSubMode = 'ai';
                this.selectMode('battle');
                this.modeHint.textContent = '人机对战：你将对抗AI Summa';
                this._openModeConfigModal('ai');
            });
        }
        if (this.modeP2PBtn) {
            this.modeP2PBtn.addEventListener('click', () => {
                this._battleSubMode = 'p2p';
                this.selectMode('battle');
                this.modeHint.textContent = '联机对战：与远方好友同台竞技';
                this.handleStart();
            });
        }
        // 闯关子菜单按钮：经典闯关 → 选关界面；关卡编辑器 → 直接打开编辑器
        if (this.modeCampaignClassicBtn) {
            this.modeCampaignClassicBtn.addEventListener('click', () => {
                this._campaignSubMode = 'classic';
                this.selectMode('campaign');
                this.modeHint.textContent = '经典闯关：通关解锁下一关';
                this.handleStart();
            });
        }
        if (this.modeEditorBtn) {
            this.modeEditorBtn.addEventListener('click', () => {
                this._campaignSubMode = 'editor';
                this.selectMode('campaign');
                this.modeHint.textContent = '关卡编辑器：创造属于你自己的关卡';
                this.handleStart();
            });
        }
        // 竞速子菜单按钮：标准竞速 → 选关界面；试炼场 → 自定义弹窗；联机竞速 → 房间弹窗
        if (this.modeRaceStandardBtn) {
            this.modeRaceStandardBtn.addEventListener('click', () => {
                this._raceSubMode = 'standard';
                this.selectMode('race');
                this.modeHint.textContent = '标准竞速：通过 30 个关卡，追求更快速度';
                this.handleStart();
            });
        }
        if (this.modeRaceCustomBtn) {
            this.modeRaceCustomBtn.addEventListener('click', () => {
                this._raceSubMode = 'custom';
                this.selectMode('race');
                this.modeHint.textContent = '竞速试炼场：自定义允许区/禁止区，打造专属竞速关卡';
                this.handleStart();
            });
        }
        if (this.modeRaceBattleBtn) {
            this.modeRaceBattleBtn.addEventListener('click', () => {
                this._raceSubMode = 'battle';
                this.selectMode('race');
                this.modeHint.textContent = '联机竞速：2-4 人同场竞速，实时比拼速度与排名';
                this.handleStart();
            });
        }
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
        this.initRaceCustom();
        this.initRaceBattleUI();
        this.bindBackgroundMusicControls();
        this.initBackgroundMusic();

        // 退出函数棋（关闭页面/标签页/刷新）前：房主有活跃房间或联机对局进行中时弹浏览器确认提醒。
        // ① 房主有房间：退出后房间失效；② 对局进行中：退出判负并扣 ELO。
        // 确认后页面才真正关闭；关闭时服务器因 WS 断开会自动清理房间。
        window.addEventListener('beforeunload', (e) => {
            if (this._lobby && this._lobby.myRoomCode) {
                e.preventDefault();
                e.returnValue = '退出后，您创建的房间将立即失效。是否确认退出？';
                return e.returnValue;
            }
            // 联机对局进行中（开局后、未结算）：关闭/刷新=中途退出，判负扣 ELO（仅排位模式）
            if (this.isP2PMode && this._p2pMatchMode === 'ranked' && this._p2pMatchStarted && !this._p2pEloSettled) {
                e.preventDefault();
                e.returnValue = '对局进行中，退出将判负并扣除 ELO 积分，是否确认离开？';
                return e.returnValue;
            }
        });
    }
;

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
        // 难度切换后刷新反三角函数开关的提示（简单难度会隐藏反三角按钮，需即时更新）
        if (typeof this.refreshInverseTrigToggle === 'function') this.refreshInverseTrigToggle();
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
