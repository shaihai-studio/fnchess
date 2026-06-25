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
            this.showMessage('游戏开始！玩家B请选择目标网格');
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
            this.gridSystem.setTargetCell(data.cell);
            this.showMessage(`目标网格已选择: (${data.cell.x}, ${data.cell.y})`);
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
        
        // 初始化拖拽元素
        this.initDraggableElements();
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
            { key: 'operators', label: '运算符' },
            { key: 'functions', label: '函数' }
        ];
        
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
                btn.textContent = item.value;
                btn.dataset.value = item.value;
                
                // 检查是否被本回合锁定
                const isLockedThisRound = roundLockedElements.includes(item.value);
                // 检查是否被之前回合锁定（parser中的locked状态）
                const isLockedPreviously = item.locked;
                
                if (isLockedThisRound || isLockedPreviously) {
                    btn.classList.add('locked');
                    btn.disabled = true;
                    btn.innerHTML = `${item.value} <span class="lock-icon">🔒</span>`;
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
        
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'element-items';
        
        // 收集所有可锁定的元素（除了x）
        const allElements = [
            ...elements.numbers.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x').map(e => e.value),
            ...elements.functions.map(e => e.value)
        ];
        
        for (const element of allElements) {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = element;
            btn.dataset.value = element;
            
            // 检查是否已被本回合锁定
            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            
            btn.addEventListener('click', () => this.toggleLockElement(element, btn));
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
     * 更新表达式显示
     */
    updateExpressionDisplay() {
        this.currentExpression = this.expressionElements.join('');
        this.expressionDisplay.innerHTML = '';
        
        if (this.expressionElements.length === 0) {
            this.expressionDisplay.innerHTML = '<span class="placeholder">点击元素构建表达式...</span>';
            return;
        }
        
        for (let i = 0; i < this.expressionElements.length; i++) {
            const span = document.createElement('span');
            span.className = 'expression-element';
            span.textContent = this.expressionElements[i];
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
     * 绘制函数并评估结果
     */
    async renderAndEvaluate(expression) {
        // 绘制函数
        const points = await this.renderer.drawFunction(expression, true);
        const polyline = this.renderer.convertToPolyline(points);
        
        // 获取目标网格和禁止区
        const state = this.gameController.getGameState();
        const targetCell = state.roundState.targetCell;
        const forbiddenCells = state.roundState.forbiddenCells;
        
        // 碰撞检测
        let hitTarget = false;
        let hitForbidden = false;
        
        if (targetCell) {
            const targetRect = this.gridSystem.getCellRect(targetCell);
            hitTarget = this.detector.polylineIntersectsRect(polyline, targetRect);
        }
        
        if (forbiddenCells.length > 0) {
            hitForbidden = this.detector.checkHitForbidden(polyline, forbiddenCells);
        }
        
        // 分析函数类型
        const functionType = this.parser.analyzeFunctionType(expression);
        
        // 评估结果
        this.gameController.evaluateResult(hitTarget, hitForbidden, functionType);
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
        } else if (data.hitTarget) {
            message = `✅ 玩家${constructorPlayer}命中目标！函数类型: ${data.functionType.type}，得分: ${data.score}`;
            this.flashGrid('target');
        } else {
            message = `❌ 玩家${constructorPlayer}未命中目标！扣1分`;
            this.flashGrid('miss');
        }
        
        this.showMessage(message, data.hitTarget && !data.hitForbidden ? 'success' : 'error');
        this.updateScoreboard();
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
        this.clearExpression();
        this.gridSystem.draw();
    }
    
    /**
     * 处理跳过按钮
     */
    handleSkip() {
        this.gameController.skipPhase();
    }
    
    /**
     * 处理开始游戏
     */
    handleStart() {
        const rounds = parseInt(this.roundSelect.value);
        this.startModal.style.display = 'none';
        this.gameController.initGame(rounds);
    }
    
    /**
     * 处理重新开始
     */
    handleRestart() {
        this.gameOverModal.style.display = 'none';
        this.startModal.style.display = 'flex';
    }
    
    /**
     * 更新阶段UI
     */
    updatePhaseUI(phase) {
        const state = this.gameController.getGameState();
        
        this.currentPlayerElement.textContent = `玩家 ${state.currentPlayer}`;
        
        let hint = '';
        let confirmText = '确认';
        
        switch (phase) {
            case 'select_target':
                hint = '请点击棋盘选择目标网格';
                confirmText = '确认目标';
                this.confirmBtn.disabled = !state.roundState.targetCell;
                break;
            case 'set_forbidden':
                hint = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;
                confirmText = '确认禁止区';
                break;
            case 'set_locks':
                hint = `点击下方元素锁定对方 (${state.roundState.lockedElements.length}/${state.maxLocks})`;
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
        this.messageElement.textContent = message;
        this.messageElement.className = 'message';
        
        if (type === 'error') {
            this.messageElement.classList.add('error');
        } else if (type === 'success') {
            this.messageElement.classList.add('success');
        }
        
        // 3秒后清除消息
        setTimeout(() => {
            this.messageElement.textContent = '';
            this.messageElement.className = 'message';
        }, 5000);
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
