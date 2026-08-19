/**
 * UICoreBattle —— UICore 模块切片（UIController.prototype 挂载）
 *
 * 提交函数、清盘、强制停、退出、ESC、战斗 UI 显隐与重置
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype.submitFunction = function() {
        // V7 修复：phase 前置守卫——第一次提交后 phase 已切 EVALUATE，
        // 连点时后续调用直接 return，避免 GameController 拒绝后 UI 层仍重复
        // 执行 renderAndEvaluate 造成两条 async 绘制链并发闪帧。
        // 测试模式 phase 恒为 INPUT_FUNCTION（提交不推进阶段），不受影响。
        const gc = this.gameController;
        if (gc && !gc.isTestMode() && gc.currentPhase !== gc.phases.INPUT_FUNCTION) return;

        if (this.expressionElements.length === 0) {
            this.showMessage('请输入函数表达式', 'error');
            if (window.audioManager) window.audioManager.playError();
            return;
        }
        
        const expression = this.currentExpression;
        
        // 验证语法
        const validation = this.parser.validateSyntax(expression);
        if (!validation.valid) {
            this.showMessage(validation.error, 'error');
            if (window.audioManager) window.audioManager.playError();
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
            if (window.audioManager) window.audioManager.playError();
            return;
        }
        
        // sgn / floor 分难度解锁拦截（防止绕过 UI 直接输入）
        const unlockBlocked = this._checkSgnFloorUnlockBlock(expression);
        if (unlockBlocked) {
            this.showMessage(unlockBlocked, 'error');
            if (window.audioManager) window.audioManager.playError();
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
        // 观战模式：只读，禁止清除
        if (this._isSpectating) return;
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

// forceStopGame
    UIController.prototype.forceStopGame = function() {
        // 1. 停止计时器（阶段倒计时 + 选格子倒计时，两者相互独立，退出时必须都停）
        if (this.gameController && typeof this.gameController.stopTimer === 'function') {
            this.gameController.stopTimer();
        }
        if (this.gameController && typeof this.gameController.stopTargetTimer === 'function') {
            this.gameController.stopTargetTimer();
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

// clearAllLocks — 退出对局后立即取消所有锁定，且锁定逻辑永不作用于文本框输入
    UIController.prototype.clearAllLocks = function() {
        const gc = this.gameController;
        if (!gc) return;
        if (gc.roundState) gc.roundState.lockedElements = [];
        if (gc.elementLockCounts && typeof gc.elementLockCounts.clear === 'function') gc.elementLockCounts.clear();
        if (gc.parser && typeof gc.parser.clearLockedElements === 'function') gc.parser.clearLockedElements();
    }
;

// handleExit
    UIController.prototype.handleExit = function() {
        if (window.audioManager) window.audioManager.playClick();
        this.hideExitConfirm();

        // ★ 观战兜底：观战中任何"退出对局"入口都应走观战退出，
        //   否则 gameMode==='p2p' 会触发 _cleanupP2P（断开大厅连接）而观战状态残留，
        //   导致第二次进入观战空白/失败
        if (this._isSpectating) {
            this.exitSpectatorMode();
            return;
        }

        // ★ 先强制停止游戏运行（停计时器、清AI队列、标记非活跃）
        this.forceStopGame();

        // ★ 退出对局立即取消所有锁定（覆盖所有模式），且不影响任何文本框输入
        this.clearAllLocks();

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
            // 对局中主动退出：_cleanupP2P 已弹 disconnect-modal（"你已中途退出判负"/
            // "房主已解散该房间"），让用户先看完再点"返回主菜单"按钮 → 不弹主菜单；
            // 非对局中（等待/已结算）正常弹主菜单。
            if (this._p2pShowDisconnectReturnToMenu) {
                this._p2pShowDisconnectReturnToMenu = false;
                return;
            }
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
            // 竞速联机（含对战联机竞速房）：对局中退出走竞速退出确认框，回联机竞速弹窗；
            // 未开局直接离开（房主等待阶段退出会保留房间）。绝不落到标准竞速选关页。
            if (this.raceIsMultiplayer || (this._rbRoom && this._rbRoomOpen)) {
                if (this._rbMatchStarted) {
                    this.raceBattleConfirmLeave();
                } else {
                    this.raceBattleDoLeave();
                }
                return;
            }
            if (this.gameController && typeof this.gameController.cleanupRaceState === 'function') {
                this.gameController.cleanupRaceState();
            }
            if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
                this.gridSystem.setRaceFixedRange(false);
            }
            this.resetBattleGrid();
            this.hideModal(this.gameOverModal);
            this.hideModal(this.startModal);
            if (this.raceIsCustom) {
                // 试炼场（自定义关）：对局中退出返回试炼场自定义弹窗（保留上次配置）
                this.closeRaceUI(true);
            } else {
                this.showRaceUI();
            }
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
            // 关卡编辑器：ESC 退出编辑器返回主界面（编辑器是 #editor-view 就地显示，不属于 modal 栈）
            if (this.editorView && this.editorView.style.display === 'flex') {
                e.preventDefault();
                this.closeEditor();
                return;
            }
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

        // 退出对局：隐藏闯关解锁按钮并清除解锁标记
        if (this.unlockFabBtn) this.unlockFabBtn.style.display = 'none';
        this._campaignUnlockUsed = false;

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

        // 统一清理表达式（input 区 + KaTeX 数学预览），避免"返回主菜单后残留上一局
        // 函数解析式（如 ln(sin(x)^2)+1）"透过透明主菜单 modal 显示在 logo 附近。
        // 覆盖 P2P / AI / 本地 / race / campaign 的 handleExit 与 returnCampaignToDifficulty
        // 等所有走 resetBattleGrid 的路径。_doHandleRestart（game-over 重启，不走这里）
        // 需单独显式调用 clearExpression。
        if (typeof this.clearExpression === 'function') {
            try { this.clearExpression(); } catch (e) { /* UI 未就绪时静默忽略 */ }
        }

        // 清理历史函数曲线 hover tooltip（fixed z-index:10000，比主菜单 .modal 高，
        // 若不清理会穿透显示在主菜单按钮附近："第 X 回合 + 解析式" 黑色小标签）。
        // 同理清理锁定格数 tooltip（也是 fixed z-index:10000）。
        // 鼠标从棋盘快速移动到外部元素/键盘进主菜单时，mouseleave 不触发，需显式清理。
        try { this.hideHistoryFunctionTooltip && this.hideHistoryFunctionTooltip(); } catch (e) {}
        try { this.hideLockCountTooltip && this.hideLockCountTooltip(); } catch (e) {}
    }
;

// calculateLRSigma
