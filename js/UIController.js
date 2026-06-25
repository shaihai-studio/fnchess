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
        this.detector = new CollisionDetector();
        this.renderer = new FunctionRenderer(gridSystem);
        
        // 当前表达式
        this.currentExpression = '';
        this.expressionElements = [];
        
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
        
        // 按钮
        this.confirmBtn = document.getElementById('confirm-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.skipBtn = document.getElementById('skip-btn');
        
        // 元素拖拽区
        this.elementsContainer = document.getElementById('elements-container');
        
        // 游戏结束弹窗
        this.gameOverModal = document.getElementById('game-over-modal');
        this.winnerElement = document.getElementById('winner');
        this.finalScoresElement = document.getElementById('final-scores');
        this.restartBtn = document.getElementById('restart-btn');
        
        // 开始界面
        this.startModal = document.getElementById('start-modal');
        this.startBtn = document.getElementById('start-btn');
        this.roundSelect = document.getElementById('round-select');
        this.difficultySelect = document.getElementById('difficulty-select');
        this.difficultyHint = document.getElementById('difficulty-hint');
        this.header = document.getElementById('header');
        
        // 绑定难度选择提示更新
        if (this.difficultySelect && this.difficultyHint) {
            this.difficultySelect.addEventListener('change', () => {
                this.updateDifficultyHint();
            });
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
        });
        
        this.gameController.on('phaseChange', (data) => {
            this.updatePhaseUI(data.phase);
        });
        
        this.gameController.on('timerUpdate', (data) => {
            this.updateTimer(data.remainingTime);
        });
        
        this.gameController.on('timeout', (data) => {
            this.showMessage(`玩家${data.player}超时！扣1分`, 'error');
        });
        
        this.gameController.on('targetSelected', (data) => {
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
            this.gridSystem.addForbiddenCell(data.cell);
            this.showMessage(`禁止区已设置: (${data.cell.x}, ${data.cell.y})`);
            // 更新阶段提示中的计数
            const state = this.gameController.getGameState();
            this.phaseHintElement.textContent = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;
        });
        
        this.gameController.on('forbiddenRemoved', (data) => {
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
            this.showEvaluationResult(data);
        });
        
        this.gameController.on('roundComplete', (data) => {
            this.updateScoreboard();
            this.roundElement.textContent = data.currentRound;
            this.gridSystem.clearAll();
            this.clearExpression();
            this.showMessage(`第 ${data.currentRound - 1} 回合结束`);
        });
        
        this.gameController.on('gameEnd', (data) => {
            this.showGameOver(data);
        });
    }
    
    /**
     * 绑定DOM事件
     */
    bindEvents() {
        // Canvas 点击事件
        this.gridSystem.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.gridSystem.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        
        // 按钮事件
        this.confirmBtn.addEventListener('click', () => this.handleConfirm());
        this.clearBtn.addEventListener('click', () => this.handleClear());
        this.skipBtn.addEventListener('click', () => this.handleSkip());
        this.restartBtn.addEventListener('click', () => this.handleRestart());
        this.startBtn.addEventListener('click', () => this.handleStart());
        
        // 表达式显示区点击删除
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
            // 删除最后一个元素
            if (this.expressionElements.length > 0) {
                this.expressionElements.pop();
                this.updateExpressionDisplay();
            }
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
        
        // 收集所有可锁定的元素（除了x, π, e, i）
        // 注意：简单难度下四则运算也会显示，但处于保护状态
        const allElements = [
            ...elements.numbers.filter(e => e.value !== 'π' && e.value !== 'e' && e.value !== 'i').map(e => e.value),
            ...elements.basicOperators.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x').map(e => e.value),
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
            
            // 检查是否已被本回合锁定
            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            
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
     * 更新锁定元素显示
     */
    updateLockedElements() {
        const state = this.gameController.getGameState();
        const lockedElements = state.roundState.lockedElements;
        
        // 更新按钮状态
        const buttons = this.elementsContainer.querySelectorAll('.element-btn');
        buttons.forEach(btn => {
            const value = btn.dataset.value;
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
     * 处理 Canvas 点击
     */
    handleCanvasClick(e) {
        const rect = this.gridSystem.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const cell = this.gridSystem.getCellFromCanvas(x, y);
        if (!cell) return;
        
        const phase = this.gameController.currentPhase;
        
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
        const rect = this.gridSystem.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const cell = this.gridSystem.getCellFromCanvas(x, y);
        
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
            this.showMessage('当前阶段不能输入函数', 'error');
            return;
        }
        
        // 检查元素是否被锁定
        const state = this.gameController.getGameState();
        if (state.roundState.lockedElements.includes(element)) {
            this.showMessage(`元素 "${element}" 已被锁定，无法使用`, 'error');
            return;
        }
        
        this.expressionElements.push(element);
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
            return;
        }
        
        for (let i = 0; i < this.expressionElements.length; i++) {
            const span = document.createElement('span');
            span.className = 'expression-element';
            // 使用数学符号显示
            span.textContent = this.getDisplaySymbol(this.expressionElements[i]);
            span.dataset.index = i;
            this.expressionDisplay.appendChild(span);
        }
    }
    
    /**
     * 处理表达式点击（删除元素）
     */
    handleExpressionClick(e) {
        if (e.target.classList.contains('expression-element')) {
            const index = parseInt(e.target.dataset.index);
            this.expressionElements.splice(index, 1);
            this.updateExpressionDisplay();
        }
    }
    
    /**
     * 清除表达式
     */
    clearExpression() {
        this.expressionElements = [];
        this.currentExpression = '';
        this.updateExpressionDisplay();
    }
    
    /**
     * 处理确认按钮
     */
    handleConfirm() {
        const phase = this.gameController.currentPhase;
        console.log(`[DEBUG] handleConfirm: phase=${phase}`);
        
        if (phase === 'select_target') {
            this.gameController.confirmTargetSelection();
        } else if (phase === 'set_forbidden') {
            this.gameController.confirmForbiddenSelection();
        } else if (phase === 'set_locks') {
            console.log(`[DEBUG] handleConfirm: 调用confirmLockSelection`);
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
        // 绘制函数
        const points = await this.renderer.drawFunction(expression, true);
        const polyline = this.renderer.convertToPolyline(points);
        
        // 获取目标网格和禁止区
        const state = this.gameController.getGameState();
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        
        // 碰撞检测 - 检测所有目标格
        const hitTargets = [];
        for (const targetCell of targetCells) {
            const targetRect = this.gridSystem.getCellRect(targetCell);
            if (this.detector.polylineIntersectsRect(polyline, targetRect)) {
                hitTargets.push(targetCell);
            }
        }
        
        // 检测禁止区
        let hitForbidden = false;
        if (forbiddenCells.length > 0) {
            hitForbidden = this.detector.checkHitForbidden(polyline, forbiddenCells);
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
        const constructorPlayer = state.currentPlayer;
        
        let message = '';
        
        if (data.hitForbidden) {
            message = `❌ 玩家${constructorPlayer}的函数进入禁止区！扣1分`;
            this.flashGrid('forbidden');
            this.showScorePopup(constructorPlayer, -1);
        } else if (data.hitTarget) {
            // 多个目标格的情况
            if (data.targetCount > 1) {
                message = `✅ 玩家${constructorPlayer}命中全部 ${data.targetCount} 个目标！函数类型: ${data.functionType.type}，得分: ${data.score}`;
            } else {
                message = `✅ 玩家${constructorPlayer}命中目标！函数类型: ${data.functionType.type}，得分: ${data.score}`;
            }
            this.flashGrid('target');
            this.showScorePopup(constructorPlayer, data.score);
        } else {
            // 多个目标格但未全部命中的情况
            if (data.targetCount > 1 && data.hitCount > 0) {
                message = `❌ 玩家${constructorPlayer}只命中 ${data.hitCount}/${data.targetCount} 个目标，扣1分`;
            } else {
                message = `❌ 玩家${constructorPlayer}未命中目标！扣1分`;
            }
            this.flashGrid('miss');
            this.showScorePopup(constructorPlayer, -1);
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
     * 处理跳过按钮
     */
    handleSkip() {
        // 测试模式：结束测试返回开始界面
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
            return;
        }
        this.gameController.skipPhase();
    }
    
    /**
     * 退出测试模式
     */
    exitTestMode() {
        // 清空函数
        this.gameController.clearTestModeFunctions();
        this.gridSystem.clearAll();
        
        // 恢复header样式
        if (this.header) this.header.classList.remove('test-mode');
        
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
        
        // 恢复坐标系范围
        this.gridSystem.setRange(5);
        
        // 恢复跳过按钮
        this.skipBtn.textContent = '跳过';
        this.skipBtn.className = 'btn btn-secondary';
        
        // 恢复确认按钮
        this.confirmBtn.textContent = '确认';
        
        // 返回开始界面
        this.startModal.style.display = 'flex';
        this.showMessage('');
    }
    
    /**
     * 处理开始游戏
     */
    handleStart() {
        const rounds = parseInt(this.roundSelect.value);
        const difficulty = this.difficultySelect.value;
        
        this.startModal.style.display = 'none';
        this.gameController.initGame(rounds, difficulty);
        
        // 测试模式特殊初始化
        if (this.gameController.isTestMode()) {
            this.initTestModeUI();
        }
    }
    
    /**
     * 初始化测试模式UI
     */
    initTestModeUI() {
        // 添加测试模式样式到header
        if (this.header) this.header.classList.add('test-mode');
        
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
        
        // 修改跳过按钮为结束按钮
        this.skipBtn.textContent = '结束测试';
        this.skipBtn.className = 'btn btn-danger';
        
        // 初始化元素选择
        this.initDraggableElements();
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
            // 取消正在进行的绘制
            this.renderer.cancelDrawing();
            const newRange = this.gridSystem.zoomOut();
            this.updateZoomDisplay(newRange);
            this.redrawAllTestFunctions();
        });
        
        document.getElementById('zoom-in-btn').addEventListener('click', () => {
            // 取消正在进行的绘制
            this.renderer.cancelDrawing();
            const newRange = this.gridSystem.zoomIn();
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
     * 编辑测试模式函数
     */
    editTestFunction(index) {
        const functions = this.gameController.getTestModeFunctions();
        const func = functions[index];
        if (!func) return;
        
        // 将函数表达式加载到输入区
        this.expressionElements = func.expression.split('');
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
        this.gameOverModal.style.display = 'none';
        
        // 如果在测试模式，先退出测试模式
        if (this.gameController.isTestMode()) {
            this.exitTestMode();
        } else {
            this.startModal.style.display = 'flex';
        }
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
        
        this.currentPlayerElement.textContent = `玩家 ${state.currentPlayer}`;
        
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
        this.gridSystem.updateRange(state.currentRound);
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
        this.messageElement.className = 'message';
        this.messageElement.style.opacity = '1';
        
        if (type === 'error') {
            this.messageElement.classList.add('error');
        } else if (type === 'success') {
            this.messageElement.classList.add('success');
        }
        
        // 测试模式下消息渐隐消失
        if (this.gameController.isTestMode()) {
            // 2秒后开始渐隐
            this.messageTimeout = setTimeout(() => {
                this.fadeOutMessage();
            }, 2000);
        } else {
            // 普通模式5秒后清除
            this.messageTimeout = setTimeout(() => {
                this.messageElement.textContent = '';
                this.messageElement.className = 'message';
            }, 5000);
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
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
