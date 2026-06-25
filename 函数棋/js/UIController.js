/**
 * UIController 模块
 * 负责用户交互与界面更新
 * 管理拖拽、点击、显示等所有UI操作
 */
class UIController {
    constructor(gridSystem, gameController) {
        this.gridSystem = gridSystem;
        this.gameController = gameController;
        this.parser = new FunctionParser();
        this.detector = new CollisionDetector(gridSystem); // 传入gridSystem以支持自适应容差
        this.renderer = new FunctionRenderer(gridSystem);
        
        // 初始化AI控制器
        this.aiController = new AIController(gameController, gridSystem);
        this.aiController.uiController = this; // 设置UIController引用
        
        // 初始化 Summa 角色
        if (typeof SummaCharacter !== 'undefined') {
            window.summaCharacter = new SummaCharacter('summa-container');
        }
        
        // AI触发队列
        this.aiTriggerQueue = [];
        this.isProcessingAITrigger = false;
        
        // 当前表达式
        this.currentExpression = '';
        this.expressionElements = [];
        
        // 光标位置（索引）
        this.cursorIndex = 0;
        
        // 拖拽状态
        this.draggedElement = null;
        
        // 初始化UI
        this.initUI();
        this.bindEvents();
        this.bindGameEvents();
    }
    
    /**
     * 初始化UI元素引用
     */
    initUI() {
        // 顶部信息栏
        this.scoreAElement = document.getElementById('score-a');
        this.scoreBElement = document.getElementById('score-b');
        this.roundElement = document.getElementById('current-round');
        this.totalRoundsElement = document.getElementById('total-rounds');
        
        // 控制面板
        this.timerElement = document.getElementById('timer');
        this.currentPlayerElement = document.getElementById('current-player');
        this.phaseHintElement = document.getElementById('phase-hint');
        this.expressionDisplay = document.getElementById('expression-display');
        this.messageElement = document.getElementById('message');
        this.messagePanel = document.getElementById('message-panel');
        
        // 按钮
        this.confirmBtn = document.getElementById('confirm-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.exitBtn = document.getElementById('exit-btn');
        
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
        
        // 游戏报告弹窗
        this.reportModal = document.getElementById('report-modal');
        this.reportContentElement = document.getElementById('report-content');
        this.closeReportBtn = document.getElementById('close-report-btn');
        
        // 开始界面
        this.startModal = document.getElementById('start-modal');
        this.startBtn = document.getElementById('start-btn');
        this.roundSelect = document.getElementById('round-select');
        this.difficultySelect = document.getElementById('difficulty-select');
        this.difficultyHint = document.getElementById('difficulty-hint');
        this.header = document.getElementById('header');
        
        // 游戏模式切换按钮
        this.modeLocalBtn = document.getElementById('mode-local');
        this.modeAiBtn = document.getElementById('mode-ai');
        this.modeHint = document.getElementById('mode-hint');
        this.selectedMode = 'local'; // 默认本地对战
        
        // 绑定难度选择提示更新
        if (this.difficultySelect && this.difficultyHint) {
            this.difficultySelect.addEventListener('change', () => {
                this.updateDifficultyHint();
            });
        }
        
        // 绑定模式切换按钮
        if (this.modeLocalBtn && this.modeAiBtn) {
            this.modeLocalBtn.addEventListener('click', () => this.selectMode('local'));
            this.modeAiBtn.addEventListener('click', () => this.selectMode('ai'));
        }
    }
    
    /**
     * 更新难度选择提示
     */
    updateDifficultyHint() {
        const difficulty = this.difficultySelect.value;
        const hints = {
            'easy': '简单模式：1个目标格，四则运算无法被锁定，每回合+20秒',
            'normal': '普通模式：1个目标格，标准规则',
            'hard': '困难模式：2个目标格',
            'expert': '专家模式：3个目标格',
            'test': '测试模式：自由绘图，无目标格，函数持续显示'
        };
        this.difficultyHint.textContent = hints[difficulty] || hints['normal'];
        
        // 测试模式不支持AI对战
        if (this.modeAiBtn && this.modeLocalBtn) {
            if (difficulty === 'test') {
                // 禁用AI按钮
                this.modeAiBtn.disabled = true;
                this.modeAiBtn.style.opacity = '0.5';
                this.modeAiBtn.style.cursor = 'not-allowed';
                this.modeAiBtn.title = '测试模式不支持AI对战';
                
                // 如果当前是AI模式，切换到本地模式
                if (this.selectedMode === 'ai') {
                    this.selectMode('local');
                }
            } else {
                // 启用AI按钮
                this.modeAiBtn.disabled = false;
                this.modeAiBtn.style.opacity = '1';
                this.modeAiBtn.style.cursor = 'pointer';
                this.modeAiBtn.title = '';
            }
        }
    }
    
    /**
     * 选择游戏模式
     */
    selectMode(mode) {
        // Mode toggle might happen before user interacts, but if they click it we should play sound.
        // It's safe to just call playClick here.
        if (window.audioManager) {
            // Re-init audioContext on user interaction just in case
            if (window.audioManager.audioCtx && window.audioManager.audioCtx.state === 'suspended') {
                window.audioManager.audioCtx.resume();
            }
            window.audioManager.playClick();
        }
        
        this.selectedMode = mode;
        
        // 更新按钮状态
        if (mode === 'local') {
            this.modeLocalBtn.classList.add('active');
            this.modeAiBtn.classList.remove('active');
            this.modeHint.textContent = '本地对战：两位玩家轮流操作';
        } else {
            this.modeAiBtn.classList.add('active');
            this.modeLocalBtn.classList.remove('active');
            this.modeHint.textContent = '人机对战：你将对抗AI Summa';
        }
    }
    
    /**
     * 绑定游戏事件
     */
    bindGameEvents() {
        this.gameController.on('gameInit', (data) => {
            // 完全重置UI状态
            this.gridSystem.clearAll();
            this.clearExpression();
            this.updateScoreboard();
            this.roundElement.textContent = data.currentRound;
            this.totalRoundsElement.textContent = data.totalRounds;
            this.messageElement.textContent = '';
            
            // 测试模式特殊提示
            if (data.isTestMode) {
                this.showMessage('测试模式：自由构造函数，函数将持续显示在画布上');
            } else {
                this.showMessage('游戏开始！玩家B请选择目标网格');
            }
            
            // Summa: hook game start
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                window.summaCharacter.show('ai');
                window.summaCharacter.reactStart();
            } else if (window.summaCharacter) {
                window.summaCharacter.show('local'); // Hides summa
            }
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
            this.showMessage(`玩家${data.player}超时！扣1分`, 'error');
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
            if (data.expression && data.round) {
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
                this.clearExpression();
                
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
            this.showGameOver(data);
            
            // Summa Reaction Hook
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                if (data.winner === 'B') {
                    window.summaCharacter.reactWin();
                } else if (data.winner === 'A') {
                    window.summaCharacter.reactLose();
                }
            }
        });
    }
    
    /**
     * 绑定DOM事件
     */
    bindEvents() {
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
        
        // 键盘输入事件
        document.addEventListener('keydown', (e) => this.handleKeyboardInput(e));
        
        // 初始化拖拽元素
        this.initDraggableElements();
    }
    
    /**
     * 处理键盘输入
     */
    handleKeyboardInput(e) {
        const phase = this.gameController.currentPhase;
        const key = e.key;
        
        // 回车键确认：在 select_target / set_forbidden / set_locks / input_function 阶段都可用
        if (key === 'Enter') {
            e.preventDefault();
            if (['set_forbidden', 'set_locks', 'input_function'].includes(phase)) {
                // 这些阶段可以直接确认
                this.handleConfirm();
            } else if (phase === 'select_target') {
                // 选择目标阶段需要检查是否已选择目标
                const state = this.gameController.getGameState();
                if (state.roundState.targetCell) {
                    this.handleConfirm();
                } else {
                    this.showMessage('请先点击棋盘选择目标网格', 'error');
                }
            }
            return;
        }
        
        // 以下键盘输入只在 input_function 阶段响应
        if (phase !== 'input_function') {
            return;
        }
        
        // 允许的键：x, 0-9, +, -, *, /, ., !, (, ), ^, π, e, i
        if (key === 'x' || key === 'X') {
            e.preventDefault();
            this.addElementToExpression('x');
        } else if (/^[0-9]$/.test(key)) {
            e.preventDefault();
            this.addElementToExpression(key);
        } else if (['+', '-', '*', '/', '.', '!', '(', ')', '^'].includes(key)) {
            e.preventDefault();
            this.addElementToExpression(key);
        } else if (key === 'p' || key === 'P') {
            // p 键输入 π
            e.preventDefault();
            this.addElementToExpression('π');
        } else if (key === 'e' || key === 'E') {
            // e 键输入自然常数 e
            e.preventDefault();
            this.addElementToExpression('e');
        } else if (key === 'i' || key === 'I') {
            // i 键输入虚数单位 i
            e.preventDefault();
            this.addElementToExpression('i');
        } else if (key === 'Backspace') {
            e.preventDefault();
            // 删除光标前的一个元素
            if (this.cursorIndex > 0) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(this.cursorIndex - 1, 1);
                this.cursorIndex--;
                this.updateExpressionDisplay();
            }
        } else if (key === 'Delete') {
            e.preventDefault();
            // 删除光标后的一个元素
            if (this.cursorIndex < this.expressionElements.length) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(this.cursorIndex, 1);
                this.updateExpressionDisplay();
            }
        } else if (key === 'ArrowLeft') {
            e.preventDefault();
            if (this.cursorIndex > 0) {
                this.cursorIndex--;
                this.updateExpressionDisplay();
            }
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            if (this.cursorIndex < this.expressionElements.length) {
                this.cursorIndex++;
                this.updateExpressionDisplay();
            }
        } else if (key === 'Home') {
            e.preventDefault();
            this.cursorIndex = 0;
            this.updateExpressionDisplay();
        } else if (key === 'End') {
            e.preventDefault();
            this.cursorIndex = this.expressionElements.length;
            this.updateExpressionDisplay();
        } else if (key === 'Escape') {
            e.preventDefault();
            // 清除表达式
            this.handleClear();
        }
    }
    
    /**
     * 初始化可拖拽元素
     */
    initDraggableElements() {
        const phase = this.gameController.currentPhase;
        
        // 在锁定阶段使用特殊的锁定元素视图
        if (phase === 'set_locks') {
            this.initLockElementsView();
            return;
        }
        
        const elements = this.parser.getAvailableElements();
        
        // 获取当前回合被锁定的元素
        const state = this.gameController.getGameState();
        const roundLockedElements = state.roundState.lockedElements || [];
        
        this.elementsContainer.innerHTML = '';
        
        // 创建分类容器
        const categories = [
            { key: 'variable', label: '变量' },
            { key: 'numbers', label: '数字' },
            { key: 'basicOperators', label: '四则运算' },
            { key: 'operators', label: '其他运算符' },
            { key: 'functions', label: '函数' }
        ];
        
        // 函数显示名称映射
        const funcDisplayNames = {
            'sin': 'sin',
            'cos': 'cos',
            'tan': 'tan',
            'abs': 'abs',
            'exp': 'exp',
            'ln': 'ln',
            'log': 'log'
        };
        
        for (const cat of categories) {
            const catDiv = document.createElement('div');
            catDiv.className = 'element-category';
            
            const label = document.createElement('div');
            label.className = 'category-label';
            label.textContent = cat.label;
            catDiv.appendChild(label);
            
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'element-items';
            
            for (const item of elements[cat.key]) {
                const btn = document.createElement('button');
                btn.className = 'element-btn';
                // 使用数学符号显示，函数使用显示名称映射
                const displayValue = cat.key === 'functions' && funcDisplayNames[item.value] 
                    ? funcDisplayNames[item.value] 
                    : this.getDisplaySymbol(item.value);
                btn.textContent = displayValue;
                btn.dataset.value = item.value;
                
                // 检查是否被本回合锁定
                const isLockedThisRound = roundLockedElements.includes(item.value);
                // 检查是否被之前回合锁定（parser中的locked状态）
                const isLockedPreviously = item.locked;
                
                if (isLockedThisRound || isLockedPreviously) {
                    btn.classList.add('locked');
                    btn.disabled = true;
                    const lockedDisplayValue = cat.key === 'functions' && funcDisplayNames[item.value] 
                        ? funcDisplayNames[item.value] 
                        : this.getDisplaySymbol(item.value);
                    btn.innerHTML = `${lockedDisplayValue} <span class="lock-icon">🔒</span>`;
                    if (isLockedThisRound) {
                        btn.title = '本回合被锁定';
                    }
                } else {
                    btn.addEventListener('click', () => this.addElementToExpression(item.value));
                }
                
                itemsDiv.appendChild(btn);
            }
            
            catDiv.appendChild(itemsDiv);
            this.elementsContainer.appendChild(catDiv);
        }
    }
    
    /**
     * 初始化锁定元素视图（用于锁定阶段）
     */
    initLockElementsView() {
        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements;
        
        this.elementsContainer.innerHTML = '';
        
        const title = document.createElement('div');
        title.className = 'element-category';
        title.style.width = '100%';
        
        const label = document.createElement('div');
        label.className = 'category-label';
        label.textContent = `选择要锁定的元素 (${alreadyLocked.length}/${state.maxLocks})`;
        title.appendChild(label);
        
        // 同步更新阶段提示文本
        if (state.difficulty === 'easy') {
            this.phaseHintElement.textContent = `点击下方元素锁定对方 (${alreadyLocked.length}/${state.maxLocks})，四则运算无法被锁定`;
        } else {
            this.phaseHintElement.textContent = `点击下方元素锁定对方 (${alreadyLocked.length}/${state.maxLocks})`;
        }
        
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'element-items';
        
        // 收集所有可锁定的元素（除了x和括号）
        // 注意：简单难度下四则运算也会显示，但处于保护状态
        const allElements = [
            ...elements.numbers.map(e => e.value),  // 包含 π, e, i
            ...elements.basicOperators.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x' && e.value !== '(' && e.value !== ')').map(e => e.value),
            ...elements.functions.map(e => e.value)
        ];
        
        // 函数显示名称映射（用于锁定视图）
        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp',
            'ln': 'ln', 'log': 'log'
        };
        
        for (const element of allElements) {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            // 使用数学符号显示，函数使用显示名称映射
            btn.textContent = lockFuncDisplayNames[element] || this.getDisplaySymbol(element);
            btn.dataset.value = element;
            
            // 获取该元素的锁定次数
            const lockCount = state.getElementLockCount ? state.getElementLockCount(element) : 0;
            const isMaxLocked = lockCount >= 2;
            
            // 检查是否已被本回合锁定
            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            
            // 如果已经达到最大锁定次数，半透明化并禁用
            if (isMaxLocked) {
                btn.style.opacity = '0.4';
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.title = `${this.getDisplaySymbol(element)} 已达到最大锁定次数 (2/2)`;
            }
            
            // 添加鼠标悬停事件显示气泡框
            btn.addEventListener('mouseenter', (e) => {
                this.showLockCountTooltip(e, element, lockCount);
            });
            btn.addEventListener('mouseleave', () => {
                this.hideLockCountTooltip();
            });
            
            // 检查是否为简单难度的受保护元素（四则运算）
            const isProtectedInEasyMode = state.difficulty === 'easy' && 
                ['+', '-', '*', '/'].includes(element);
            
            if (isProtectedInEasyMode) {
                // 简单难度：四则运算显示为保护状态，无法点击
                btn.classList.add('protected');
                btn.disabled = true;
                btn.title = '四则运算无法被锁定';
            } else {
                btn.addEventListener('click', () => this.toggleLockElement(element, btn));
            }
            
            itemsDiv.appendChild(btn);
        }
        
        title.appendChild(itemsDiv);
        this.elementsContainer.appendChild(title);
    }
    
    /**
     * 切换锁定元素
     */
    toggleLockElement(element, btn) {
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements;
        
        if (alreadyLocked.includes(element)) {
            // 取消锁定（从数组中移除）
            const index = alreadyLocked.indexOf(element);
            if (index > -1) {
                alreadyLocked.splice(index, 1);
            }
            btn.classList.remove('selected');
            btn.style.background = '';
        } else {
            // x 和括号不能被锁定
            if (element === 'x') {
                this.showMessage('变量 x 不能被锁定', 'warning');
                return;
            }
            if (element === '(' || element === ')') {
                this.showMessage('括号不能被锁定', 'warning');
                return;
            }
            
            // 添加锁定
            if (this.gameController.addLockedElement(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
        }
        
        // 更新标签
        this.initLockElementsView();
    }
    
    /**
     * 显示锁定次数气泡框
     */
    showLockCountTooltip(event, element, count) {
        // 移除旧的气泡框
        this.hideLockCountTooltip();
        
        const btn = event.target;
        const displaySymbol = this.getDisplaySymbol(element);
        
        // 创建气泡框
        const tooltip = document.createElement('div');
        tooltip.id = 'lock-count-tooltip';
        tooltip.className = 'lock-count-tooltip';
        tooltip.textContent = `(${count}/2)`;
        
        // 定位气泡框
        const rect = btn.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${rect.right + 8}px`;
        tooltip.style.top = `${rect.top + rect.height / 2 - 15}px`;
        tooltip.style.zIndex = '10000';
        tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        
        document.body.appendChild(tooltip);
    }
    
    /**
     * 隐藏锁定次数气泡框
     */
    hideLockCountTooltip() {
        const tooltip = document.getElementById('lock-count-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
    
    /**
     * 检查鼠标是否悬停在历史函数上
     */
    checkHistoryFunctionHover(event) {
        const canvas = this.gridSystem.canvas;
        const rect = canvas.getBoundingClientRect();
        
        // 考虑CSS缩放
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const mouseX = (event.clientX - rect.left) * scaleX;
        const mouseY = (event.clientY - rect.top) * scaleY;
        
        // 隐藏旧的气泡框
        this.hideHistoryFunctionTooltip();
        
        const state = this.gameController.getGameState();
        if (!state.functionHistory || state.functionHistory.length === 0) return;
        
        const currentRound = state.currentRound;
        
        // 检查每个历史函数
        for (const func of state.functionHistory) {
            const roundDiff = currentRound - func.round;
            
            // 只检查上2回合的函数
            if (roundDiff < 1 || roundDiff > 2) continue;
            
            // 检查鼠标是否距离函数15px以内（更宽松的检测）
            if (this.isMouseNearFunction(mouseX, mouseY, func.points, 15)) {
                this.showHistoryFunctionTooltip(event, func.expression, func.round);
                return;
            }
        }
    }
    
    /**
     * 检查鼠标是否距离函数指定像素内
     */
    isMouseNearFunction(mouseX, mouseY, points, thresholdPx) {
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
    
    /**
     * 计算点到线段的距离
     */
    pointToLineDistance(px, py, x1, y1, x2, y2) {
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
    
    /**
     * 显示历史函数气泡框
     */
    showHistoryFunctionTooltip(event, expression, round) {
        this.hideHistoryFunctionTooltip();
        
        const tooltip = document.createElement('div');
        tooltip.id = 'history-function-tooltip';
        tooltip.className = 'history-function-tooltip';
        tooltip.innerHTML = `<div style="font-weight: bold;">第 ${round} 回合</div><div style="margin-top: 4px;">${expression}</div>`;
        
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${event.clientX + 15}px`;
        tooltip.style.top = `${event.clientY - 10}px`;
        tooltip.style.zIndex = '10000';
        tooltip.style.background = 'rgba(0, 0, 0, 0.85)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '13px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.maxWidth = '300px';
        tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        
        document.body.appendChild(tooltip);
    }
    
    /**
     * 隐藏历史函数气泡框
     */
    hideHistoryFunctionTooltip() {
        const tooltip = document.getElementById('history-function-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
    
    /**
     * 更新锁定元素显示
     */
    updateLockedElements() {
        const state = this.gameController.getGameState();
        const lockedElements = state.roundState.lockedElements;
        
        // 函数显示名称映射（用于锁定视图）
        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp',
            'ln': 'ln', 'log': 'log'
        };
        
        // 更新按钮状态
        const buttons = this.elementsContainer.querySelectorAll('.element-btn');
        buttons.forEach(btn => {
            const value = btn.dataset.value;
            
            // 先清除所有锁定状态
            btn.classList.remove('locked');
            btn.disabled = false;
            // 移除锁图标，恢复原始文本
            if (btn.querySelector('.lock-icon')) {
                const originalValue = lockFuncDisplayNames[value] || this.getDisplaySymbol(value);
                btn.textContent = originalValue;
            }
            
            // 如果元素在当前锁定列表中，添加锁定状态
            if (lockedElements.includes(value)) {
                btn.classList.add('locked');
                btn.disabled = true;
                if (!btn.querySelector('.lock-icon')) {
                    btn.innerHTML = `${value} <span class="lock-icon">🔒</span>`;
                }
            }
        });
    }
    
    /**
     * 触发 AI 回合
     */
    async triggerAITurn(phase) {
        // 测试模式不触发AI
        if (this.gameController.isTestMode()) return;
        
        // 检查当前是否是AI的回合
        const state = this.gameController.getGameState();
        if (state.currentPlayer !== 'B') {
            console.log('[UI] 当前不是AI的回合，跳过');
            return;
        }
        
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
    
    /**
     * 处理AI触发队列
     */
    async processAITriggerQueue() {
        if (this.aiTriggerQueue.length === 0 || this.isProcessingAITrigger) {
            return;
        }
        
        this.isProcessingAITrigger = true;
        
        while (this.aiTriggerQueue.length > 0) {
            const phase = this.aiTriggerQueue.shift();
            
            // 如果AI正在思考，等待
            if (this.aiController.isThinking) {
                console.log('[UI] AI正在思考，等待完成');
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
    
    /**
     * 处理 Canvas 点击
     */
    handleCanvasClick(e) {
        const canvas = this.gridSystem.canvas;
        const rect = canvas.getBoundingClientRect();
        
        // 考虑CSS缩放
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const cell = this.gridSystem.getCellFromCanvas(x, y);
        if (!cell) return;
        
        const phase = this.gameController.currentPhase;
        const state = this.gameController.getGameState();
        
        // 人机模式下，如果当前是AI的回合，阻止玩家操作
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            console.log('[UI] AI回合中，阻止玩家点击');
            return;
        }
        
        // 检查是否是历史使用过的格子
        const isUsedCell = state.usedCells && state.usedCells.some(c => c.x === cell.x && c.y === cell.y);
        if (isUsedCell) {
            this.showMessage('此格子已在之前的回合中使用过，无法再次选择', 'warning');
            return;
        }
        
        if (phase === 'select_target') {
            this.gameController.selectTargetCell(cell);
        } else if (phase === 'set_forbidden') {
            this.gameController.addForbiddenCell(cell);
        }
    }
    
    /**
     * 处理 Canvas 悬停
     */
    handleCanvasHover(e) {
        const canvas = this.gridSystem.canvas;
        const rect = canvas.getBoundingClientRect();
        
        // 考虑CSS缩放
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const cell = this.gridSystem.getCellFromCanvas(x, y);
        const state = this.gameController.getGameState();
        
        // 人机模式下，如果当前是AI的回合，禁用悬停效果
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.gridSystem.canvas.style.cursor = 'not-allowed';
            this.gridSystem.canvas.title = 'Summa 正在操作中...';
            return;
        }
        
        if (cell) {
            this.gridSystem.canvas.style.cursor = 'pointer';
            this.gridSystem.canvas.title = `(${cell.x}, ${cell.y})`;
        } else {
            this.gridSystem.canvas.style.cursor = 'default';
            this.gridSystem.canvas.title = '';
        }
    }
    
    /**
     * 添加元素到表达式
     */
    addElementToExpression(element) {
        const phase = this.gameController.currentPhase;
        if (phase !== 'input_function') {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage('当前阶段不能输入函数', 'error');
            return;
        }
        
        // 人机模式下，如果当前是AI的回合，禁止玩家操作
        const state = this.gameController.getGameState();
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.showMessage('Summa 正在思考中...', 'info');
            return;
        }
        
        // 检查元素是否被锁定
        if (state.roundState.lockedElements.includes(element)) {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage(`元素 "${element}" 已被锁定，无法使用`, 'error');
            return;
        }
        
        // 函数类元素自动添加括号
        const functionElements = ['sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log'];
        if (functionElements.includes(element)) {
            // 插入函数名和括号：[sin, (, )]
            this.expressionElements.splice(this.cursorIndex, 0, element, '(', ')');
            // 光标定位到括号中间（函数名和左括号后面，即+2位置）
            this.cursorIndex += 2;
        } else {
            // 其他元素正常插入
            this.expressionElements.splice(this.cursorIndex, 0, element);
            this.cursorIndex++;
        }
        
        if (window.audioManager) window.audioManager.playClick();
        this.updateExpressionDisplay();
    }
    
    /**
     * 将运算符转换为显示符号
     */
    getDisplaySymbol(element) {
        const symbolMap = {
            '*': '×',
            '/': '÷',
            '!': '!'
        };
        return symbolMap[element] || element;
    }
    
    /**
     * 更新表达式显示
     */
    updateExpressionDisplay() {
        this.currentExpression = this.expressionElements.join('');
        this.expressionDisplay.innerHTML = '';
        
        if (this.expressionElements.length === 0) {
            this.expressionDisplay.innerHTML = '<span class="placeholder">点击元素或键盘输入构建表达式...</span>';
            this.cursorIndex = 0;
            return;
        }
        
        // 确保光标位置合法
        if (this.cursorIndex > this.expressionElements.length) {
            this.cursorIndex = this.expressionElements.length;
        }
        
        for (let i = 0; i < this.expressionElements.length; i++) {
            // 在光标位置前插入光标元素
            if (i === this.cursorIndex) {
                const cursorSpan = document.createElement('span');
                cursorSpan.className = 'cursor';
                cursorSpan.textContent = '|';
                this.expressionDisplay.appendChild(cursorSpan);
            }
            
            const span = document.createElement('span');
            span.className = 'expression-element';
            // 使用数学符号显示
            span.textContent = this.getDisplaySymbol(this.expressionElements[i]);
            span.dataset.index = i;
            this.expressionDisplay.appendChild(span);
        }
        
        // 如果光标在末尾
        if (this.cursorIndex === this.expressionElements.length) {
            const cursorSpan = document.createElement('span');
            cursorSpan.className = 'cursor';
            cursorSpan.textContent = '|';
            this.expressionDisplay.appendChild(cursorSpan);
        }
    }
    
    /**
     * 处理表达式点击（删除元素或移动光标）
     */
    handleExpressionClick(e) {
        const phase = this.gameController.currentPhase;
        if (phase !== 'input_function') return;
        
        // 人机模式下，如果当前是AI的回合，阻止玩家操作
        const state = this.gameController.getGameState();
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            return;
        }
        
        // 如果点击的是某个具体的元素块，则删除该元素
        const elementSpan = e.target.closest('.expression-element');
        if (elementSpan) {
            const index = parseInt(elementSpan.dataset.index);
            if (!isNaN(index)) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(index, 1);
                // 调整光标位置：如果删除的元素在光标前，光标也要前移
                if (index < this.cursorIndex) {
                    this.cursorIndex--;
                }
                this.updateExpressionDisplay();
            }
            return;
        }
        
        // 如果点击的是空白区域，则将光标移动到点击位置
        // 计算点击位置相对于容器左边缘的偏移量
        const rect = this.expressionDisplay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        // 遍历所有子节点，找到点击位置对应的索引
        let totalWidth = 0;
        let newIndex = 0;
        
        for (let i = 0; i < this.expressionDisplay.children.length; i++) {
            const child = this.expressionDisplay.children[i];
            const childRect = child.getBoundingClientRect();
            const childCenter = childRect.left - rect.left + childRect.width / 2;
            
            // 如果点击位置在当前元素的中心左侧，则光标放在该元素之前
            if (clickX < childCenter) {
                newIndex = i;
                break;
            }
            newIndex = i + 1;
        }
        
        this.cursorIndex = newIndex;
        this.updateExpressionDisplay();
    }
    
    /**
     * 清除表达式
     */
    clearExpression() {
        if (window.audioManager && this.expressionElements && this.expressionElements.length > 0) {
            window.audioManager.playElementClick();
        }
        this.expressionElements = [];
        this.currentExpression = '';
        this.updateExpressionDisplay();
    }
    
    /**
     * 处理确认按钮
     */
    handleConfirm() {
        if (window.audioManager) window.audioManager.playClick();
        const phase = this.gameController.currentPhase;
        const state = this.gameController.getGameState();
            
        // 人机模式下，如果是AI的回合，禁止玩家操作
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.showMessage('Summa 正在思考中...', 'info');
            return;
        }
            
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
    
    /**
     * 提交函数
     */
    submitFunction() {
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
        
        // 绘制函数并检测碰撞
        this.renderAndEvaluate(expression);
    }
    
    /**
     * 绘制测试模式函数
     */
    async renderTestModeFunction(expression) {
        // 防止重复提交
        if (this.isRenderingTestFunction) {
            return;
        }
        this.isRenderingTestFunction = true;
        
        // 锁定缩放按钮
        this.lockZoomButtons();
        
        try {
            // 检查是否已存在相同的函数
            const existingFunctions = this.gameController.getTestModeFunctions();
            if (existingFunctions.some(f => f.expression === expression)) {
                this.showMessage('该函数已存在', 'error');
                this.isRenderingTestFunction = false;
                this.unlockZoomButtons();
                return;
            }
            
            // 绘制函数（使用不同颜色，测试模式无光晕）
            const color = this.getTestModeColor();
            const points = await this.renderer.drawFunction(expression, true, color, true);
            
            if (points && points.length > 0) {
                // 保存函数
                this.gameController.addTestModeFunction(expression, color);
                
                // 清空当前表达式
                this.clearExpression();
                
                // 更新函数列表
                this.updateFunctionList();
                
                this.showMessage(`函数已绘制: ${expression}`, 'success');
            } else {
                this.showMessage('函数绘制失败，请检查表达式', 'error');
            }
        } catch (error) {
            this.showMessage('函数计算错误: ' + error.message, 'error');
        } finally {
            // 重置提交标志并解锁缩放按钮
            this.isRenderingTestFunction = false;
            this.unlockZoomButtons();
        }
    }
    
    /**
     * 获取测试模式函数颜色
     */
    getTestModeColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
        const functions = this.gameController.getTestModeFunctions();
        return colors[functions.length % colors.length];
    }
    
    /**
     * 绘制函数并评估结果
     */
    async renderAndEvaluate(expression) {
        // 1. 渲染用采样（标准精度）- 等待绘制完成
        await this.renderer.drawFunction(expression, true);
        
        // 2. 碰撞检测用采样（高精度）
        const range = this.gridSystem.getRange();
        const collisionPoints = this.renderer.sampleFunction(expression, range.min, range.max, true);
        const polyline = this.renderer.convertToPolyline(collisionPoints);
        
        // 获取目标网格和禁止区
        const state = this.gameController.getGameState();
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        
        // 碰撞检测 - 检测所有目标格（视觉检测）
        const hitTargets = [];
        for (const targetCell of targetCells) {
            if (this.detector.checkHitTarget(polyline, targetCell, this.gridSystem)) {
                hitTargets.push(targetCell);
            }
        }
        
        // 检测禁止区（视觉检测）
        let hitForbidden = false;
        if (forbiddenCells.length > 0) {
            hitForbidden = this.detector.checkHitForbidden(polyline, forbiddenCells, this.gridSystem);
        }
        
        // 分析函数类型
        const functionType = this.parser.analyzeFunctionType(expression);
        
        // 评估结果
        this.gameController.evaluateResult(hitTargets, hitForbidden, functionType);
    }
    
    /**
     * 显示评估结果
     */
    showEvaluationResult(data) {
        // 获取当前构建函数的玩家
        const state = this.gameController.getGameState();
        let constructorPlayer = state.currentPlayer;
        
        // 人机模式：玩家B显示为Summa
        let playerDisplay = `玩家${constructorPlayer}`;
        if (state.gameMode === 'ai' && constructorPlayer === 'B') {
            playerDisplay = 'Summa';
        }
        
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
    
    /**
     * 显示分数变化气泡
     * @param {string} player - 'A' 或 'B'
     * @param {number} scoreChange - 分数变化（正数为加分，负数为扣分）
     */
    showScorePopup(player, scoreChange) {
        const scoreElement = player === 'A' ? this.scoreAElement : this.scoreBElement;
        
        // 创建气泡元素
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = scoreChange >= 0 ? `+${scoreChange}` : `${scoreChange}`;
        // 非负数（包括+0）显示绿色，负数显示红色
        popup.style.color = scoreChange >= 0 ? '#22c55e' : '#ef4444';
        
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
    
    /**
     * 闪烁网格效果
     */
    flashGrid(type) {
        const canvas = this.gridSystem.canvas;
        
        if (type === 'target') {
            canvas.style.boxShadow = '0 0 30px #22c55e';
        } else if (type === 'forbidden' || type === 'miss') {
            canvas.style.boxShadow = '0 0 30px #ef4444';
        }
        
        setTimeout(() => {
            canvas.style.boxShadow = 'none';
        }, 1000);
    }
    
    /**
     * 处理清除按钮
     */
    handleClear() {
        // 测试模式：只清除当前输入，不清除已绘制的函数
        if (this.gameController.isTestMode()) {
            this.clearExpression();
            this.showMessage('已清除当前输入');
            return;
        }
        
        this.clearExpression();
        this.gridSystem.draw();
    }
    
    /**
     * 处理跳过按钮（已废弃，改为退出功能）
     */
    handleSkip() {
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
    
    /**
     * 处理退出按钮点击（根据模式决定是否显示气泡框）
     */
    handleExitClick() {
        // 测试模式直接退出，不显示气泡框
        if (this.gameController.isTestMode()) {
            this.handleExit();
        } else {
            // 普通模式显示确认气泡框
            this.showExitConfirm();
        }
    }
    
    /**
     * 显示退出确认气泡框
     */
    showExitConfirm() {
        if (window.audioManager) window.audioManager.playClick();
        if (this.exitPopover) {
            this.exitPopover.classList.add('visible');
        }
    }
    
    /**
     * 隐藏退出确认气泡框
     */
    hideExitConfirm() {
        if (this.exitPopover) {
            this.exitPopover.classList.remove('visible');
        }
    }
    
    /**
     * 处理退出游戏
     */
    handleExit() {
        if (window.audioManager) window.audioManager.playClick();
        this.hideExitConfirm();
        
        // 如果是测试模式，执行退出测试逻辑
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
        } else {
            // 普通对战模式：返回开始界面
            this.gameController.resetGame();
            document.getElementById('start-modal').style.display = 'flex';
            if (this.gameOverModal) this.gameOverModal.style.display = 'none';
        }
    }
    
    /**
     * 退出测试模式
     */
    exitTestMode() {
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
            this.exitBtn.textContent = '退出对局';
            this.exitBtn.className = 'btn btn-exit';
        }
        
        // 返回开始界面
        this.startModal.style.display = 'flex';
        this.showMessage('');
    }
    
    /**
     * 处理开始游戏
     */
    async handleStart() {
        if (window.audioManager) {
            // Re-init audioContext on user interaction just in case
            if (window.audioManager.audioCtx && window.audioManager.audioCtx.state === 'suspended') {
                window.audioManager.audioCtx.resume();
            }
            window.audioManager.playClick();
        }
        
        const rounds = parseInt(this.roundSelect.value);
        const difficulty = this.difficultySelect.value;
        let gameMode = this.selectedMode;
        
        // 测试模式不支持AI对战，强制使用本地模式
        if (difficulty === 'test') {
            if (gameMode === 'ai') {
                console.log('[UI] 测试模式不支持AI对战，自动切换为本地模式');
                gameMode = 'local';
                this.selectMode('local'); // 更新UI
            }
        }
        
        if (gameMode === 'ai' && window.summaTrainer && difficulty !== 'test') {
            this.startModal.style.display = 'none';
            
            let shouldTrain = false;
            let trainAmount = 50000;
            
            if (window.summaTrainer.isModelTrained(difficulty)) {
                const choice = prompt(`检测到已有 [${difficulty}] 模型。\n若想给神经网络继续升维，请输入新一轮训练刻度：1000000, 5000000, 20000000, 100000000\n留空或点击取消则直接读取现有记忆进入游戏。`);
                if (choice && parseInt(choice) > 0) {
                    trainAmount = parseInt(choice);
                    shouldTrain = true;
                }
            } else {
                shouldTrain = true;
                const choice = prompt(`欢迎唤醒 Summa。首次必须推演地图拓扑算力。\n请设置神经网世代规模（选项：1000000, 5000000, 20000000, 100000000）：`, "1000000");
                if (choice && parseInt(choice) > 0) {
                    trainAmount = parseInt(choice);
                }
            }
            
            if (shouldTrain) {
                localStorage.removeItem(`summa_model_v2_${difficulty}`);
                await window.summaTrainer.startTraining(difficulty, trainAmount);
            }
        } else {
            this.startModal.style.display = 'none';
        }
        
        this.gameController.initGame(rounds, difficulty, gameMode);
        
        // 测试模式特殊初始化
        if (this.gameController.isTestMode()) {
            this.initTestModeUI();
        }
    }
    
    /**
     * 初始化测试模式 UI
     */
    initTestModeUI() {
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
    
    /**
     * 添加鼠标滚轮缩放功能
     */
    addWheelZoomSupport() {
        // 移除旧的滚轮事件（如果存在）
        if (this.wheelHandler) {
            this.gridSystem.canvas.removeEventListener('wheel', this.wheelHandler);
        }
        
        // 创建新的滚轮事件处理器
        this.wheelHandler = (e) => {
            e.preventDefault();
            
            // 如果正在绘制，不响应滚轮
            if (this.renderer.isDrawing) {
                return;
            }
            
            const delta = e.deltaY > 0 ? 1 : -1;
            const wheelStep = 1; // 滚轮步长为 1，比按钮的 5 更小
            let newRange;
            
            if (delta > 0) {
                // 向下滚动，放大坐标系（范围增加）
                newRange = this.adjustRange(wheelStep);
            } else {
                // 向上滚动，缩小坐标系（范围减小）
                newRange = this.adjustRange(-wheelStep);
            }
            
            // 更新显示
            this.updateZoomDisplay(newRange);
            
            // 重绘所有函数
            this.redrawAllTestFunctions();
        };
        
        // 绑定滚轮事件到 Canvas
        this.gridSystem.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
    }
    
    /**
     * 调整坐标系范围（支持任意步长）
     * @param {number} step - 步长（正数放大，负数缩小）
     * @returns {number} 新的范围值
     */
    adjustRange(step) {
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
    
    /**
     * 添加缩放按钮
     */
    addZoomButtons() {
        // 检查是否已存在
        if (document.getElementById('zoom-controls')) return;
        
        const container = document.createElement('div');
        container.id = 'zoom-controls';
        container.className = 'zoom-controls';
        container.innerHTML = `
            <button id="zoom-out-btn" class="zoom-btn" title="放大坐标系 (+)">+</button>
            <span id="zoom-range" class="zoom-range">±${this.gridSystem.range}</span>
            <button id="zoom-in-btn" class="zoom-btn" title="缩小坐标系 (-)">−</button>
        `;
        
        // 添加到 canvas 容器
        const canvasSection = document.querySelector('.canvas-section');
        if (canvasSection) {
            canvasSection.appendChild(container);
        }
        
        // 绑定事件
        document.getElementById('zoom-out-btn').addEventListener('click', () => {
            // 如果正在绘制，不响应
            if (this.renderer.isDrawing) return;
            
            const newRange = this.adjustRange(5); // 按钮步长为 5
            this.updateZoomDisplay(newRange);
            this.redrawAllTestFunctions();
        });
        
        document.getElementById('zoom-in-btn').addEventListener('click', () => {
            // 如果正在绘制，不响应
            if (this.renderer.isDrawing) return;
            
            const newRange = this.adjustRange(-5); // 按钮步长为 5
            this.updateZoomDisplay(newRange);
            this.redrawAllTestFunctions();
        });
    }
    
    /**
     * 更新缩放显示
     */
    updateZoomDisplay(range) {
        const display = document.getElementById('zoom-range');
        if (display) {
            display.textContent = `±${range}`;
        }
    }
    
    /**
     * 锁定缩放按钮
     */
    lockZoomButtons() {
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (zoomOutBtn) zoomOutBtn.disabled = true;
        if (zoomInBtn) zoomInBtn.disabled = true;
    }
    
    /**
     * 解锁缩放按钮
     */
    unlockZoomButtons() {
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (zoomOutBtn) zoomOutBtn.disabled = false;
        if (zoomInBtn) zoomInBtn.disabled = false;
    }
    
    /**
     * 添加函数列表容器
     */
    addFunctionListContainer() {
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
    
    /**
     * 更新函数列表显示
     */
    updateFunctionList() {
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
    
    /**
     * 将表达式字符串智能拆分为元素数组
     * @param {string} expr - 表达式字符串
     * @returns {Array} 元素数组
     */
    tokenizeExpression(expr) {
        const tokens = [];
        let i = 0;
        const len = expr.length;
        
        // 多字母函数名列表
        const multiCharFuncs = ['sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log', 'sqrt'];
        
        while (i < len) {
            let matched = false;
            
            // 尝试匹配多字母函数
            for (const func of multiCharFuncs) {
                if (expr.substring(i, i + func.length) === func) {
                    tokens.push(func);
                    i += func.length;
                    matched = true;
                    break;
                }
            }
            
            if (matched) continue;
            
            // 匹配单个字符（变量、数字、运算符、括号等）
            tokens.push(expr[i]);
            i++;
        }
        
        return tokens;
    }
    
    /**
     * 编辑测试模式函数
     */
    editTestFunction(index) {
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
    
    /**
     * 删除测试模式函数
     */
    deleteTestFunction(index) {
        const functions = this.gameController.getTestModeFunctions();
        functions.splice(index, 1);
        
        // 重新绘制所有函数
        this.redrawAllTestFunctions();
        this.updateFunctionList();
        
        this.showMessage('函数已删除');
    }
    
    /**
     * 重新绘制所有测试模式函数
     */
    redrawAllTestFunctions() {
        // 取消任何正在进行的绘制
        this.renderer.cancelDrawing();
        
        this.gridSystem.clearAll();
        const functions = this.gameController.getTestModeFunctions();
        
        // 使用 requestAnimationFrame 批量绘制，避免阻塞UI（测试模式无光晕）
        requestAnimationFrame(() => {
            for (const func of functions) {
                this.renderer.drawFunction(func.expression, false, func.color, true);
            }
        });
    }
    
    /**
     * 添加清空函数按钮
     */
    addClearFunctionsButton() {
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
    
    /**
     * 处理重新开始
     */
    handleRestart() {
        if (window.audioManager) window.audioManager.playClick();
        this.gameOverModal.style.display = 'none';
        
        // 如果在测试模式，先退出测试模式
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
        } else {
            this.startModal.style.display = 'flex';
        }
    }
    
    /**
     * 当棋盘 range 扩大时，用 FunctionRenderer 重新采样所有历史函数到新范围
     * 只在 range 发生变化时调用一次，不在每帧 draw 里重复计算
     */
    refreshHistoryFunctionPoints() {
        const state = this.gameController.getGameState();
        if (!state.functionHistory || state.functionHistory.length === 0) return;
        
        const newRange = this.gridSystem.range;
        
        for (const func of state.functionHistory) {
            // 只对采样范围小于当前 range 的函数重新采样
            if ((func.sampledRange || 0) < newRange) {
                try {
                    func.points = this.renderer.sampleFunction(func.expression, -newRange, newRange);
                    func.sampledRange = newRange;
                } catch (e) {
                    console.warn('[UI] 重采样历史函数失败:', func.expression, e);
                }
            }
        }
        
        // 同步到 GridSystem
        this.gridSystem.functionHistory = state.functionHistory;
    }
    
    /**
     * 更新阶段UI
     */
    updatePhaseUI(phase) {
        const state = this.gameController.getGameState();
        
        // 测试模式：简化UI显示
        if (state.isTestMode) {
            this.currentPlayerElement.textContent = '测试模式';
            this.phaseHintElement.textContent = '构造函数并点击确认，函数将持续显示在画布上';
            this.confirmBtn.textContent = '绘制函数';
            this.initDraggableElements();
            return;
        }
        
        // 人机模式：玩家B显示为Summa
        let playerName = `玩家 ${state.currentPlayer}`;
        if (state.gameMode === 'ai' && state.currentPlayer === 'B') {
            playerName = 'Summa';
        }
        this.currentPlayerElement.textContent = playerName;
        
        let hint = '';
        let confirmText = '确认';
        
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
                break;
            case 'set_locks':
                if (state.difficulty === 'easy') {
                    hint = `点击下方元素锁定对方 (${state.roundState.lockedElements.length}/${state.maxLocks})，四则运算无法被锁定`;
                } else {
                    hint = `点击下方元素锁定对方 (${state.roundState.lockedElements.length}/${state.maxLocks})`;
                }
                confirmText = '确认锁定';
                this.initDraggableElements(); // 刷新为锁定视图
                break;
            case 'input_function':
                hint = '点击下方元素构建函数表达式';
                confirmText = '提交函数';
                this.initDraggableElements(); // 刷新为函数构建视图
                break;
            case 'evaluate':
                hint = '正在评估...';
                this.confirmBtn.disabled = true;
                break;
            case 'switch_player':
                hint = '回合切换中...';
                break;
        }
        
        this.phaseHintElement.textContent = hint;
        this.confirmBtn.textContent = confirmText;
        this.confirmBtn.disabled = false;
        
        // 更新棋盘范围
        const rangeChanged = this.gridSystem.updateRange(state.currentRound);
        // 如果 range 发生了扩大，立即重新采样所有历史函数（只做一次，不在每帧 draw 里做）
        if (rangeChanged) {
            this.refreshHistoryFunctionPoints();
            // 采样完成后立即重绘，确保历史图像在回合开始时就可见，而不是等待下一次点击
            this.gridSystem.draw();
        }
    }
    
    /**
     * 更新计时器显示
     */
    updateTimer(remainingTime) {
        this.timerElement.textContent = remainingTime;
        
        if (remainingTime <= 10) {
            this.timerElement.classList.add('warning');
        } else {
            this.timerElement.classList.remove('warning');
        }
    }
    
    /**
     * 更新记分板
     */
    updateScoreboard() {
        const state = this.gameController.getGameState();
        this.scoreAElement.textContent = state.scores.A;
        this.scoreBElement.textContent = state.scores.B;
    }
    
    /**
     * 显示消息
     */
    showMessage(message, type = 'info') {
        // 清除之前的定时器
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        this.messageElement.textContent = message;
        this.messageElement.style.opacity = '1';
        
        // 测试模式下：显示容器并渐隐消息
        if (this.gameController.isTestMode()) {
            if (this.messagePanel) this.messagePanel.classList.add('visible');
            this.messageElement.className = 'message';
            
            if (type === 'error') {
                this.messageElement.classList.add('error');
            } else if (type === 'success') {
                this.messageElement.classList.add('success');
            }
            
            // 2秒后开始渐隐
            this.messageTimeout = setTimeout(() => {
                this.fadeOutMessage();
            }, 2000);
        } else {
            // 普通模式：隐藏整个消息容器
            if (this.messagePanel) this.messagePanel.classList.remove('visible');
        }
    }
    
    /**
     * 渐隐消息
     */
    fadeOutMessage() {
        let opacity = 1;
        const fadeInterval = setInterval(() => {
            opacity -= 0.05;
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                this.messageElement.textContent = '';
                this.messageElement.className = 'message';
                this.messageElement.style.opacity = '1';
            } else {
                this.messageElement.style.opacity = opacity.toString();
            }
        }, 50); // 每50ms减少0.05，总共1秒完成渐隐
    }
    
    /**
     * 显示游戏结束
     */
    showGameOver(data) {
        let winnerText = '';
        if (data.winner === 'draw') {
            winnerText = '平局！';
        } else {
            winnerText = `玩家 ${data.winner} 获胜！`;
        }
        
        this.winnerElement.textContent = winnerText;
        this.finalScoresElement.innerHTML = `
            <div>玩家A: ${data.scores.A} 分</div>
            <div>玩家B: ${data.scores.B} 分</div>
        `;
        
        this.gameOverModal.style.display = 'flex';
    }
    
    /**
     * 显示游戏报告
     */
    showGameReport() {
        if (window.audioManager) window.audioManager.playClick();
        const state = this.gameController.getGameState();
        const report = this.gameController.getGameReport();
        
        let html = `
            <div class="report-summary">
                <h3>比赛总结</h3>
                <p>难度: ${this.getDifficultyName(report.difficulty)}</p>
                <p>总回合: ${report.totalRounds}</p>
                <p>获胜者: ${report.winner === 'draw' ? '平局' : '玩家 ' + report.winner}</p>
                <p>最终比分: A ${report.finalScores.A} - ${report.finalScores.B} B</p>
            </div>
            <div class="report-history">
                <h3>回合详情</h3>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>回合</th>
                            <th>选择方</th>
                            <th>构建方</th>
                            <th>目标坐标</th>
                            <th>禁止区</th>
                            <th>锁定元素</th>
                            <th>函数表达式</th>
                            <th>类型</th>
                            <th>结果</th>
                            <th>得分</th>
                            <th>总分(A-B)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        for (const round of report.history) {
            const resultText = round.hitForbidden ? '进入禁区' : 
                              (round.hitTarget ? '命中目标' : '未命中');
            const scoreClass = round.score >= 0 ? 'score-positive' : 'score-negative';
            
            // 格式化坐标和元素显示
            const targetCoords = round.targetCells.map(c => `(${c.x},${c.y})`).join(', ');
            const forbiddenCoords = round.forbiddenCells.length > 0 ? round.forbiddenCells.map(c => `(${c.x},${c.y})`).join(', ') : '-';
            const lockedElems = round.lockedElements.length > 0 ? round.lockedElements.join(', ') : '-';
            
            html += `
                <tr>
                    <td>${round.round}</td>
                    <td>玩家 ${round.selector}</td>
                    <td>玩家 ${round.constructor}</td>
                    <td class="coord-cell">${targetCoords}</td>
                    <td class="coord-cell">${forbiddenCoords}</td>
                    <td class="elem-cell">${lockedElems}</td>
                    <td class="expr-cell">${round.expression || '-'}</td>
                    <td>${this.getFunctionTypeName(round.functionType.type)}</td>
                    <td>${resultText}</td>
                    <td class="${scoreClass}">${round.score >= 0 ? '+' : ''}${round.score}</td>
                    <td>${round.totalScoreA} - ${round.totalScoreB}</td>
                </tr>
            `;
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        this.reportContentElement.innerHTML = html;
        this.reportModal.style.display = 'flex';
    }
    
    /**
     * 隐藏游戏报告
     */
    hideGameReport() {
        if (window.audioManager) window.audioManager.playClick();
        this.reportModal.style.display = 'none';
    }
    
    /**
     * 获取难度名称
     */
    getDifficultyName(difficulty) {
        const names = {
            'easy': '简单',
            'normal': '普通',
            'hard': '困难',
            'expert': '专家',
            'test': '测试'
        };
        return names[difficulty] || difficulty;
    }
    
    /**
     * 获取函数类型名称
     */
    getFunctionTypeName(type) {
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
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
