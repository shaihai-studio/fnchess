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
            fraction: '#14b8a6',
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
        // 观战模式：只读，禁止提交
        if (this._isSpectating) return;
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
        // 观战模式：只读展示，禁止一切操作控件
        const spectating = !!this._isSpectating;
        if (spectating) {
            this.currentPlayerElement.textContent = this.getPlayerDisplayName(state.currentPlayer, true);
            this.confirmBtn.disabled = true;
            this.confirmBtn.textContent = '确认';
            if (this.elementsContainer) {
                this.elementsContainer.style.pointerEvents = 'none';
                this.elementsContainer.style.opacity = '0.5';
            }
            if (this.floatKeypadBody) {
                this.floatKeypadBody.style.pointerEvents = 'none';
                this.floatKeypadBody.style.opacity = '0.5';
            }
            // 棋盘范围更新仍需进行（历史函数重新采样）
            const rangeChanged = this.gridSystem.updateRange(state.currentRound);
            if (rangeChanged) {
                this.refreshHistoryFunctionPoints();
                this.gridSystem.draw();
            }
            this.phaseHintElement.textContent = `[观战·只读] ${this._phaseHintFor(state, phase)}`;
            return;
        }
        
        // 测试模式：简化UI显示
        if (state.isTestMode) {
            this.currentPlayerElement.textContent = '测试模式';
            this.phaseHintElement.textContent = '构造函数并点击确认，函数将持续显示在画布上';
            this.confirmBtn.textContent = '绘制函数';
            // 测试模式：提交按钮保持可用（与勾按钮同功能，不走 P2P 回合禁用）
            this.confirmBtn.disabled = false;
            if (this.floatKeypadSubmit) this.floatKeypadSubmit.disabled = false;
            this.initDraggableElements();
            // 测试模式下也同步悬浮输入栏/圆形按钮的可见性与边界（与对战模式一致）
            if (typeof this._applyFloatKeypadVisibility === 'function') {
                this._applyFloatKeypadVisibility();
            }
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

        // 悬浮计算器栏的「提交」按钮可用态与主确认按钮保持一致
        if (this.floatKeypadSubmit) this.floatKeypadSubmit.disabled = this.confirmBtn.disabled;

        // 跳过本阶段按钮（P8）：仅 set_forbidden / set_locks 且轮到本地操作时显示；SELECT_TARGET 永不显示
        if (this.skipBtn) {
            const isHumanTurn = this.isP2PMode
                ? this._isMyTurn()
                : (this.gameController.gameMode === 'ai' ? this.gameController.currentPlayer === 'A' : true);
            const canSkip = (phase === 'set_forbidden' || phase === 'set_locks') && isHumanTurn;
            this.skipBtn.style.display = canSkip ? '' : 'none';
        }

        // AI 对手回合 / P2P 对手回合：禁用元素按钮，避免"看似可点"
        const blockInput = notMyTurn || (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B');
        if (this.elementsContainer) {
            this.elementsContainer.style.pointerEvents = blockInput ? 'none' : '';
            this.elementsContainer.style.opacity = blockInput ? '0.5' : '';
        }
        if (this.floatKeypadBody) {
            this.floatKeypadBody.style.pointerEvents = blockInput ? 'none' : '';
            this.floatKeypadBody.style.opacity = blockInput ? '0.5' : '';
        }

        // 悬浮计算器式输入栏：按阶段相关性显示/隐藏（input_function / set_locks 才显示）
        if (typeof this._applyFloatKeypadVisibility === 'function') {
            this._applyFloatKeypadVisibility();
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

// _phaseHintFor
    // 观战模式下的阶段提示（不依赖本地可操作性，仅展示当前回合进行到哪一步）
    UIController.prototype._phaseHintFor = function(state, phase) {
        const n = state.roundState && state.roundState.targetCells ? state.roundState.targetCells.length : 0;
        const forb = state.roundState && state.roundState.forbiddenCells ? state.roundState.forbiddenCells.length : 0;
        const locks = state.roundState && state.roundState.lockedElements ? state.roundState.lockedElements.length : 0;
        switch (phase) {
            case 'select_target': return `选择目标格 (${n}/${state.targetCount})`;
            case 'set_forbidden': return `设置禁止区 (${forb}/${state.maxForbidden})`;
            case 'set_locks': return `锁定元素 (${locks}/${state.maxLocks})`;
            case 'input_function': return state.roundState && state.roundState.functionExpression ? '已提交函数，等待结算…' : '构造方输入函数中…';
            case 'evaluate': case 'init': return '正在评估…';
            case 'switch_player': return '回合切换中…';
            case 'end': return '对局结束';
            default: return phase;
        }
    }
;

// updateTimer — 更新剩余时间：左上角饼图倒计时（扇形按剩余占比），中心显示剩余秒数
    UIController.prototype.updateTimer = function(remainingTime) {
        const remain = Math.max(0, remainingTime);
        this.timerElement.textContent = Math.round(remain);

        // 饼图倒计时：填充占比 = 剩余 / 总时长（总时长 <= 0 时保持满饼）
        const pie = document.getElementById('timer-pie');
        const total = this.gameController?.timeLimit;
        if (pie && total > 0) {
            const pct = Math.max(0, Math.min(1, remain / total)) * 100;
            const warn = remain <= 10;
            const color = warn ? '#ef4444' : '#5b9e6e';
            pie.style.background = `conic-gradient(${color} ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
            pie.classList.toggle('warning', warn);
        }

        if (remain <= 10) {
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

