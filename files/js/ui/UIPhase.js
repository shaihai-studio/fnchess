// Auto-split from UIController.js — prototype-attached methods (UIPhase)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIPhase] UIController must be loaded before this file');
}

// getRoundColor
    UIController.prototype.getRoundColor = function(value) {
        const map = {
            8: '#7a9bb5',
            12: '#6b9f8e',
            16: '#b8944a',
            20: '#b87a4e',
            24: '#b06e6e'
        };
        return map[value] || '#b0bdd0';
    }
;

// getDifficultyColor
    UIController.prototype.getDifficultyColor = function(value) {
        const map = {
            easy: '#6b9f6e',
            normal: '#6b84a8',
            expert: '#b8944a',
            test: '#8b7bb0'
        };
        return map[value] || '#b0bdd0';
    }
;

// getTimeLimitColor
    UIController.prototype.getTimeLimitColor = function(value) {
        const map = {
            super_slow: '#d4a373',
            slow: '#c9a227',
            normal: '#6b84a8',
            fast: '#6b9f6e',
            super_fast: '#8b7bb0'
        };
        return map[value] || '#b0bdd0';
    }
;

// handleConfirm
    UIController.prototype.handleConfirm = function() {
        if (this.gameController?.gameMode === 'race' && this._raceCountdownActive) return;
        if (window.audioManager) window.audioManager.playClick();
        const phase = this.gameController.currentPhase;
        const state = this.gameController.getGameState();
            
        // 人机模式下，如果是AI的回合，禁止玩家操作
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.showMessage('Summa 正在思考中...', 'info');
            return;
        }

        // P2P：非本方回合禁止确认
        if (this.isP2PMode && !this._isMyTurn()) {
            console.log(`[UI][Confirm] 非本方回合，已阻止 phase=${phase}`);
            this.showMessage('等待对手操作中…', 'info');
            return;
        }

        console.log(`[UI][Confirm] 确认 phase=${phase}`);

        if (phase === 'select_target') {
            this.gameController.confirmTargetSelection();
        } else if (phase === 'set_forbidden') {
            this.gameController.confirmForbiddenSelection();
        } else if (phase === 'set_locks') {
            this.gameController.confirmLockSelection();
        } else if (phase === 'input_function') {
            this.submitFunction();
        }
    }
;

// showEvaluationResult
    UIController.prototype.showEvaluationResult = function(data) {
        // 获取当前构建函数的玩家
        const state = this.gameController.getGameState();
        let constructorPlayer = state.currentPlayer;
        
        // 人机模式：玩家B显示为Summa；P2P模式：显示我/对方
        let playerDisplay = this.getPlayerDisplayName(constructorPlayer);
        
        let message = '';
        
        if (data.hitForbidden) {
            message = `❌ ${playerDisplay}的函数进入禁止区！扣1分`;
            this.flashGrid('forbidden');
            this.showScorePopup(constructorPlayer, -1);
        } else if (data.hitTarget) {
            // 多个目标格的情况
            if (data.targetCount > 1) {
                message = `✅ ${playerDisplay}命中全部 ${data.targetCount} 个目标！函数类型: ${data.functionType.type}，得分: ${data.score}`;
            } else {
                message = `✅ ${playerDisplay}命中目标！函数类型: ${data.functionType.type}，得分: ${data.score}`;
            }
            this.flashGrid('target');
            this.showScorePopup(constructorPlayer, data.score);
        } else {
            // 多个目标格但未全部命中的情况
            if (data.targetCount > 1 && data.hitCount > 0) {
                message = `❌ ${playerDisplay}只命中 ${data.hitCount}/${data.targetCount} 个目标，扣1分`;
            } else {
                message = `❌ ${playerDisplay}未命中目标！扣1分`;
            }
            this.showScorePopup(constructorPlayer, -1);
        }
        
        // Summa Reaction Hook
        if (state.gameMode === 'ai' && window.summaCharacter) {
            const isSuccess = data.hitTarget && !data.hitForbidden;
            const contextArgs = { 
                hitTarget: data.hitTarget, 
                hitForbidden: data.hitForbidden, 
                targetCount: data.targetCount || 1, 
                expression: data.expression 
            };
            
            if (constructorPlayer === 'B') {
                if (isSuccess) window.summaCharacter.reactAiSuccess(contextArgs);
                else window.summaCharacter.reactAiError(contextArgs);
            } else {
                if (isSuccess) window.summaCharacter.reactPlayerSuccess(contextArgs);
                else window.summaCharacter.reactPlayerError(contextArgs);
            }
        }
        
        this.showMessage(message, data.hitTarget && !data.hitForbidden ? 'success' : 'error');
        this.updateScoreboard();
    }
;

// showScorePopup
    UIController.prototype.showScorePopup = function(player, scoreChange) {
        if (this.gameController && this.gameController.gameMode === 'campaign') return;
        const scoreElement = player === 'A' ? this.scoreAElement : this.scoreBElement;
        if (!scoreElement) return;
        
        // 创建气泡元素
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = scoreChange >= 0 ? `+${scoreChange}` : `${scoreChange}`;
        // 非负数（包括+0）显示绿色，负数显示红色
        popup.style.color = scoreChange >= 0 ? '#5b9e6e' : '#ef4444';
        
        // 定位气泡
        const rect = scoreElement.getBoundingClientRect();
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top}px`;
        
        document.body.appendChild(popup);
        
        // 动画结束后移除
        setTimeout(() => {
            popup.remove();
        }, 1500);
    }
;

// updatePhaseUI
    UIController.prototype.updatePhaseUI = function(phase) {
        const state = this.gameController.getGameState();
        
        // 测试模式：简化UI显示
        if (state.isTestMode) {
            this.currentPlayerElement.textContent = '测试模式';
            this.phaseHintElement.textContent = '构造函数并点击确认，函数将持续显示在画布上';
            this.confirmBtn.textContent = '绘制函数';
            this.initDraggableElements();
            return;
        }
        
        // 人机模式：玩家B显示为Summa；P2P模式：显示我的回合/对方回合
        let playerName = this.getPlayerDisplayName(state.currentPlayer, true);
        this.currentPlayerElement.textContent = playerName;
        
        let hint = '';
        let confirmText = '确认';
        
        const notMyTurn = this.isP2PMode && !this._isMyTurn();
        switch (phase) {
            case 'select_target':
                if (state.targetCount > 1) {
                    hint = `请点击棋盘选择 ${state.targetCount} 个目标网格 (${state.roundState.targetCells.length}/${state.targetCount})`;
                } else {
                    hint = '请点击棋盘选择目标网格';
                }
                confirmText = '确认目标';
                this.confirmBtn.disabled = state.roundState.targetCells.length < state.targetCount;
                break;
            case 'set_forbidden':
                hint = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden})`;
                confirmText = '确认禁止区';
                this.confirmBtn.disabled = false;
                break;
            case 'set_locks':
                if (state.difficulty === 'easy') {
                    hint = `点击下方元素锁定对方 (${state.roundState.lockedElements.length}/${state.maxLocks})，四则运算无法被锁定`;
                } else {
                    hint = `点击下方元素锁定对方 (${state.roundState.lockedElements.length}/${state.maxLocks})`;
                }
                confirmText = '确认锁定';
                this.confirmBtn.disabled = false;
                this.initDraggableElements(); // 刷新为锁定视图
                break;
            case 'input_function':
                if (notMyTurn) {
                    hint = '等待对手构造函数…';
                } else {
                    hint = '点击下方元素构建函数表达式';
                }
                confirmText = '提交函数';
                this.confirmBtn.disabled = notMyTurn;
                this.initDraggableElements(); // 刷新为函数构建视图
                this.updateExpressionDisplay(); // 重绘已保留的解析式（开关开启时不清空）
                break;
            case 'evaluate':
            case 'init':
                hint = '正在评估...';
                this.confirmBtn.disabled = true;
                break;
            case 'switch_player':
                hint = '回合切换中...';
                this.confirmBtn.disabled = false;
                break;
        }
        
        this.phaseHintElement.textContent = hint;
        this.confirmBtn.textContent = confirmText;

        // AI 对手回合 / P2P 对手回合：禁用元素按钮，避免"看似可点"
        const blockInput = notMyTurn || (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B');
        if (this.elementsContainer) {
            this.elementsContainer.style.pointerEvents = blockInput ? 'none' : '';
            this.elementsContainer.style.opacity = blockInput ? '0.5' : '';
        }
        
        // 更新棋盘范围
        const rangeChanged = this.gridSystem.updateRange(state.currentRound);
        // 如果 range 发生了扩大，立即重新采样所有历史函数（只做一次，不在每帧 draw 里做）
        if (rangeChanged) {
            this.refreshHistoryFunctionPoints();
            // 采样完成后立即重绘，确保历史图像在回合开始时就可见，而不是等待下一次点击
            this.gridSystem.draw();
        }
    }
;

// updateTimer
    UIController.prototype.updateTimer = function(remainingTime) {
        this.timerElement.textContent = Math.max(0, Math.round(remainingTime));
        
        if (remainingTime <= 10) {
            this.timerElement.classList.add('warning');
        } else {
            this.timerElement.classList.remove('warning');
        }
        if (this.gameController?.gameMode === 'race') {
            this.updateRaceTimerStyle(remainingTime);
        }
    }
;

// updateScoreboard
    UIController.prototype.updateScoreboard = function() {
        const state = this.gameController.getGameState();
        this.scoreAElement.textContent = state.scores.A;
        this.scoreBElement.textContent = state.scores.B;
    }
;

