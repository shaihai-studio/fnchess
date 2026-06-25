/**
 * GameController 模块
 * 控制游戏流程与规则
 * 管理回合、玩家、得分、时间
 */
class GameController {
    constructor() {
        // 游戏配置
        this.totalRounds = 8; // 默认8回合
        this.currentRound = 1;
        
        // 难度设置
        this.difficulty = 'normal'; // easy, normal, hard, expert, test
        this.targetCount = 1; // 根据难度设置目标格数量
        
        // 测试模式：保存绘制的函数
        this.testModeFunctions = []; // { expression: string, color: string, timestamp: number }
        
        // 玩家状态
        this.players = {
            A: { score: 0, role: 'constructor' }, // 构造函数者
            B: { score: 0, role: 'selector' }     // 选择目标者
        };
        this.currentPlayer = 'B'; // B 先开始选择目标
        
        // 游戏阶段
        this.phases = {
            INIT: 'init',
            SELECT_TARGET: 'select_target',
            SET_FORBIDDEN: 'set_forbidden',
            SET_LOCKS: 'set_locks',
            INPUT_FUNCTION: 'input_function',
            EVALUATE: 'evaluate',
            SETTLE: 'settle',
            SWITCH_PLAYER: 'switch_player',
            END: 'end'
        };
        this.currentPhase = this.phases.INIT;
        
        // 时间限制（秒）
        this.timeLimit = 40;
        this.remainingTime = 40;
        this.timerInterval = null;
        
        // 回合状态
        this.roundState = {
            targetCells: [], // 多个目标格数组
            targetCell: null, // 兼容旧代码，指向第一个目标格
            forbiddenCells: [],
            lockedElements: [],
            functionExpression: '',
            hitTargets: [], // 记录哪些目标格被穿过
            hitTarget: false, // 兼容旧代码，是否全部穿过
            hitForbidden: false,
            score: 0
        };
        
        // 回调函数
        this.callbacks = {};
        
        // 游戏历史记录（用于生成报告）
        this.gameHistory = [];
    }
    
    /**
     * 注册回调函数
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        this.callbacks[event] = callback;
    }
    
    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {*} data - 数据
     */
    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }
    
    /**
     * 初始化游戏
     * @param {number} rounds - 总回合数
     * @param {string} difficulty - 难度级别 (easy, normal, hard, expert, test)
     */
    initGame(rounds = 8, difficulty = 'normal') {
        this.totalRounds = Math.min(Math.max(rounds, 4), 24);
        this.difficulty = difficulty;
        this.targetCount = this.getTargetCountByDifficulty(difficulty);
        this.currentRound = 1;
        this.players.A.score = 0;
        this.players.B.score = 0;
        
        // 清空测试模式函数和游戏历史
        this.testModeFunctions = [];
        this.clearGameHistory();
        
        // 第1回合B选择目标，A构建函数
        this.currentPlayer = 'B';
        
        this.updateTimeLimit();
        this.resetRoundState();
        
        // 测试模式直接进入输入函数阶段，跳过目标选择等
        if (this.isTestMode()) {
            this.setPhase(this.phases.INPUT_FUNCTION);
        } else {
            this.setPhase(this.phases.SELECT_TARGET);
        }
        
        this.emit('gameInit', {
            totalRounds: this.totalRounds,
            currentRound: this.currentRound,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: this.isTestMode()
        });
    }
    
    /**
     * 检查是否为测试模式
     * @returns {boolean}
     */
    isTestMode() {
        return this.difficulty === 'test';
    }
    
    /**
     * 重置游戏状态
     */
    resetGame() {
        this.totalRounds = 8;
        this.difficulty = 'normal';
        this.targetCount = 1;
        this.currentRound = 1;
        this.players.A.score = 0;
        this.players.B.score = 0;
        this.testModeFunctions = [];
        this.clearGameHistory();
        this.resetRoundState();
        this.setPhase(this.phases.SELECT_TARGET);
        this.emit('gameReset');
    }
    
    /**
     * 添加测试模式函数
     * @param {string} expression - 函数表达式
     * @param {string} color - 函数颜色
     */
    addTestModeFunction(expression, color = null) {
        if (!this.isTestMode()) return;
        
        // 生成随机颜色（如果没有指定）
        if (!color) {
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
            color = colors[this.testModeFunctions.length % colors.length];
        }
        
        this.testModeFunctions.push({
            expression: expression,
            color: color,
            timestamp: Date.now()
        });
        
        this.emit('testModeFunctionAdded', { expression, color });
    }
    
    /**
     * 清空测试模式函数
     */
    clearTestModeFunctions() {
        this.testModeFunctions = [];
        this.emit('testModeFunctionsCleared');
    }
    
    /**
     * 获取测试模式函数列表
     * @returns {Array}
     */
    getTestModeFunctions() {
        return this.testModeFunctions;
    }
    
    /**
     * 根据难度获取目标格数量
     * @param {string} difficulty - 难度级别
     * @returns {number} 目标格数量
     */
    getTargetCountByDifficulty(difficulty) {
        switch (difficulty) {
            case 'test':
                return 0; // 测试模式无目标格
            case 'hard':
                return 2;
            case 'expert':
                return 3;
            case 'easy':
            case 'normal':
            default:
                return 1;
        }
    }
    
    /**
     * 检查是否为简单难度
     * @returns {boolean}
     */
    isEasyMode() {
        return this.difficulty === 'easy';
    }
    
    /**
     * 检查是否为测试模式
     * @returns {boolean}
     */
    isTestMode() {
        return this.difficulty === 'test';
    }
    
    /**
     * 检查元素是否可被锁定
     * @param {string} element - 元素
     * @returns {boolean}
     */
    canLockElement(element) {
        // 简单难度：四则运算无法被锁定
        if (this.isEasyMode()) {
            const basicOperators = ['+', '-', '*', '/'];
            if (basicOperators.includes(element)) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * 更新当前回合的时间限制
     * 新规则：
     * - 1-4回合: 40秒（简单难度+20秒）
     * - 5-8回合: 50秒（简单难度+20秒）
     * - 此后每4回合增加10秒，最高90秒（简单难度+20秒）
     */
    updateTimeLimit() {
        const group = Math.floor((this.currentRound - 1) / 4);
        
        if (group === 0) {
            // 1-4回合
            this.timeLimit = 40;
        } else if (group === 1) {
            // 5-8回合
            this.timeLimit = 50;
        } else {
            // 9-12回合: 60秒，13-16回合: 70秒，17-20回合: 80秒，21-24回合: 90秒
            // 从第3组开始，每增加1组增加10秒，最高90秒
            this.timeLimit = Math.min(50 + (group - 1) * 10, 90);
        }
        
        // 简单难度：每回合多20秒
        if (this.isEasyMode()) {
            this.timeLimit += 20;
        }
        
        this.remainingTime = this.timeLimit;
    }
    
    /**
     * 重置回合状态
     */
    resetRoundState() {
        this.roundState = {
            targetCells: [], // 多个目标格数组
            targetCell: null, // 兼容旧代码
            forbiddenCells: [],
            lockedElements: [],
            functionExpression: '',
            hitTargets: [], // 记录哪些目标格被穿过
            hitTarget: false, // 兼容旧代码
            hitForbidden: false,
            score: 0
        };
    }
    
    /**
     * 设置游戏阶段
     * @param {string} phase - 阶段
     */
    setPhase(phase) {
        this.currentPhase = phase;
        this.emit('phaseChange', {
            phase: phase,
            currentPlayer: this.currentPlayer,
            currentRound: this.currentRound
        });
        
        // 根据阶段执行相应逻辑
        switch (phase) {
            case this.phases.SELECT_TARGET:
                // 选择目标阶段不需要计时器
                this.stopTimer();
                this.remainingTime = this.timeLimit;
                this.emit('timerUpdate', { remainingTime: this.remainingTime });
                break;
            case this.phases.SET_FORBIDDEN:
                // 检查是否需要设置禁止区
                if (this.getMaxForbiddenCount() === 0) {
                    this.setPhase(this.phases.SET_LOCKS);
                }
                break;
            case this.phases.SET_LOCKS:
                const maxLocks = this.getMaxLockCount();
                // 检查是否需要设置锁定
                if (maxLocks === 0) {
                    this.switchToInputPhase();
                }
                break;
            case this.phases.INPUT_FUNCTION:
                this.startTimer();
                break;
            case this.phases.EVALUATE:
                this.stopTimer();
                break;
            case this.phases.SWITCH_PLAYER:
                this.switchPlayer();
                break;
            case this.phases.END:
                this.endGame();
                break;
        }
    }
    
    /**
     * 切换到输入阶段
     */
    switchToInputPhase() {
        // 切换到构建函数的玩家（与选择目标的玩家相反）
        this.currentPlayer = this.currentPlayer === 'A' ? 'B' : 'A';
        this.setPhase(this.phases.INPUT_FUNCTION);
    }
    
    /**
     * 开始计时
     */
    startTimer() {
        // 测试模式不启动计时器
        if (this.isTestMode()) return;
        
        this.stopTimer();
        this.remainingTime = this.timeLimit;
        
        this.emit('timerUpdate', { remainingTime: this.remainingTime });
        
        this.timerInterval = setInterval(() => {
            this.remainingTime--;
            this.emit('timerUpdate', { remainingTime: this.remainingTime });
            
            if (this.remainingTime <= 0) {
                this.handleTimeout();
            }
        }, 1000);
    }
    
    /**
     * 停止计时
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    /**
     * 处理超时
     */
    handleTimeout() {
        this.stopTimer();
        
        if (this.currentPhase === this.phases.INPUT_FUNCTION) {
            // 构造函数超时，扣1分
            this.roundState.score = -1;
            this.players[this.currentPlayer].score -= 1;
            this.emit('timeout', { player: this.currentPlayer });
            this.setPhase(this.phases.SWITCH_PLAYER);
        } else {
            // 其他阶段超时，自动进入下一阶段
            this.nextPhase();
        }
    }
    
    /**
     * 获取当前阶段允许的最大禁止区数量
     * @returns {number}
     */
    getMaxForbiddenCount() {
        if (this.currentRound <= 4) return 0;
        if (this.currentRound <= 8) return 1;
        if (this.currentRound <= 12) return 2;
        if (this.currentRound <= 16) return 3;
        return 4;
    }
    
    /**
     * 获取当前阶段允许的最大锁定数量
     * @returns {number}
     */
    getMaxLockCount() {
        if (this.currentRound <= 4) return 0;
        if (this.currentRound <= 8) return 1;
        if (this.currentRound <= 12) return 2;
        if (this.currentRound <= 16) return 3;
        return 4;
    }
    
    /**
     * 选择目标网格
     * @param {Object} cell - {x, y}
     * @returns {boolean}
     */
    selectTargetCell(cell) {
        if (this.currentPhase !== this.phases.SELECT_TARGET) return false;
        
        // 检查是否已选择此格子
        const existsIndex = this.roundState.targetCells.findIndex(
            c => c.x === cell.x && c.y === cell.y
        );
        
        if (existsIndex !== -1) {
            // 取消选择
            this.roundState.targetCells.splice(existsIndex, 1);
            this.emit('targetRemoved', { cell, count: this.roundState.targetCells.length });
            
            // 更新兼容字段
            this.roundState.targetCell = this.roundState.targetCells[0] || null;
            return true;
        }
        
        // 检查是否已达到最大目标数
        if (this.roundState.targetCells.length >= this.targetCount) {
            // 替换最后一个选择的目标
            const removedCell = this.roundState.targetCells.pop();
            this.emit('targetRemoved', { cell: removedCell, count: this.roundState.targetCells.length });
        }
        
        // 添加新目标
        this.roundState.targetCells.push(cell);
        this.roundState.targetCell = this.roundState.targetCells[0]; // 兼容旧代码
        this.emit('targetSelected', { cell, count: this.roundState.targetCells.length, total: this.targetCount });
        return true;
    }
    
    /**
     * 确认目标选择，进入下一阶段
     */
    confirmTargetSelection() {
        if (this.currentPhase !== this.phases.SELECT_TARGET) return false;
        
        // 检查是否已选择足够的目标格
        if (this.roundState.targetCells.length < this.targetCount) {
            return false;
        }
        
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 添加或切换禁止区
     * @param {Object} cell - {x, y}
     * @returns {boolean}
     */
    addForbiddenCell(cell) {
        if (this.currentPhase !== this.phases.SET_FORBIDDEN) return false;
        
        // 不能选择目标网格作为禁止区
        if (this.roundState.targetCell && 
            this.roundState.targetCell.x === cell.x && 
            this.roundState.targetCell.y === cell.y) {
            return false;
        }
        
        // 检查是否已存在
        const existsIndex = this.roundState.forbiddenCells.findIndex(
            c => c.x === cell.x && c.y === cell.y
        );
        if (existsIndex !== -1) {
            // 点击已存在的禁止区，取消选择
            const removedCell = this.roundState.forbiddenCells.splice(existsIndex, 1)[0];
            this.emit('forbiddenRemoved', { cell: removedCell, count: this.roundState.forbiddenCells.length });
            return true;
        }
        
        const maxCount = this.getMaxForbiddenCount();
        
        // 如果已达到最大数量，替换最后一个选择的禁止区（改选模式）
        if (this.roundState.forbiddenCells.length >= maxCount) {
            // 移除最后一个禁止区
            const removedCell = this.roundState.forbiddenCells.pop();
            this.emit('forbiddenRemoved', { cell: removedCell, count: this.roundState.forbiddenCells.length });
        }
        
        // 添加新的禁止区
        this.roundState.forbiddenCells.push(cell);
        this.emit('forbiddenAdded', { cell, count: this.roundState.forbiddenCells.length });
        
        return true;
    }
    
    /**
     * 确认禁止区设置
     */
    confirmForbiddenSelection() {
        if (this.currentPhase !== this.phases.SET_FORBIDDEN) {
            return false;
        }
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 添加锁定元素
     * @param {string} element - 元素
     * @returns {boolean}
     */
    addLockedElement(element) {
        if (this.currentPhase !== this.phases.SET_LOCKS) return false;
        
        const maxCount = this.getMaxLockCount();
        if (this.roundState.lockedElements.length >= maxCount) return false;
        
        // x 不能被锁定
        if (element === 'x') return false;
        
        // 检查元素是否可被锁定（简单难度保护）
        if (!this.canLockElement(element)) return false;
        
        // 检查是否已存在
        if (this.roundState.lockedElements.includes(element)) return false;
        
        this.roundState.lockedElements.push(element);
        this.emit('elementLocked', { element, count: this.roundState.lockedElements.length });
        
        // 不再自动进入下一阶段，需要点击确认按钮
        return true;
    }
    
    /**
     * 确认锁定设置
     */
    confirmLockSelection() {
        if (this.currentPhase !== this.phases.SET_LOCKS) {
            return false;
        }
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 提交函数表达式
     * @param {string} expression - 函数表达式
     * @returns {boolean}
     */
    submitFunction(expression) {
        if (this.currentPhase !== this.phases.INPUT_FUNCTION) return false;
        
        this.roundState.functionExpression = expression;
        
        // 测试模式：不进入评估阶段，保持在输入阶段
        if (this.isTestMode()) {
            return true;
        }
        
        this.setPhase(this.phases.EVALUATE);
        return true;
    }
    
    /**
     * 评估函数结果
     * @param {Array} hitTargets - 命中的目标格数组
     * @param {boolean} hitForbidden - 是否进入禁止区
     * @param {Object} functionType - 函数类型信息
     */
    evaluateResult(hitTargets, hitForbidden, functionType) {
        if (this.currentPhase !== this.phases.EVALUATE) return;
        
        // 兼容旧代码：如果 hitTargets 是布尔值，转换为数组
        if (typeof hitTargets === 'boolean') {
            this.roundState.hitTarget = hitTargets;
            this.roundState.hitTargets = hitTargets ? this.roundState.targetCells : [];
        } else {
            this.roundState.hitTargets = hitTargets || [];
            // 只有当所有目标格都被穿过时才算命中
            this.roundState.hitTarget = this.roundState.hitTargets.length >= this.targetCount;
        }
        
        this.roundState.hitForbidden = hitForbidden;
        
        let score = 0;
        
        // 如果进入禁止区，直接失败，扣1分
        if (hitForbidden) {
            score = -1;
        } else if (this.roundState.hitTarget) {
            // 命中所有目标，根据函数类型得分
            score = functionType.score;
        } else {
            // 未命中所有目标，扣1分
            score = -1;
        }
        
        this.roundState.score = score;
        this.players[this.currentPlayer].score += score;
        
        // 记录回合历史
        this.recordRoundHistory({
            round: this.currentRound,
            selector: this.currentPlayer,
            constructor: this.currentPlayer === 'A' ? 'B' : 'A',
            targetCells: this.roundState.targetCells,
            forbiddenCells: this.roundState.forbiddenCells,
            lockedElements: this.roundState.lockedElements,
            expression: this.roundState.functionExpression,
            functionType: functionType,
            hitTarget: this.roundState.hitTarget,
            hitForbidden: hitForbidden,
            score: score,
            totalScoreA: this.players.A.score,
            totalScoreB: this.players.B.score
        });
        
        this.emit('evaluationComplete', {
            hitTarget: this.roundState.hitTarget,
            hitTargets: this.roundState.hitTargets,
            hitForbidden,
            functionType,
            score,
            totalScore: this.players[this.currentPlayer].score,
            targetCount: this.targetCount,
            hitCount: this.roundState.hitTargets.length
        });
        
        this.setPhase(this.phases.SWITCH_PLAYER);
    }
    
    /**
     * 切换玩家
     */
    switchPlayer() {
        // 增加回合数
        this.currentRound++;
        
        // 检查游戏是否结束
        if (this.currentRound > this.totalRounds) {
            this.setPhase(this.phases.END);
            return;
        }
        
        // 设置下一回合选择目标的玩家
        // 1-4回合：B-A-B-A 循环（无禁止区/锁定）
        // 5回合及以上：奇数回合B，偶数回合A
        if (this.currentRound <= 4) {
            // 第2回合A，第3回合B，第4回合A
            this.currentPlayer = (this.currentRound % 2 === 0) ? 'A' : 'B';
        } else {
            // 5回合及以上：奇数回合B选择，偶数回合A选择
            this.currentPlayer = (this.currentRound % 2 === 1) ? 'B' : 'A';
        }
        this.updateTimeLimit();
        this.resetRoundState();
        
        this.emit('roundComplete', {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            }
        });
        
        this.setPhase(this.phases.SELECT_TARGET);
    }
    
    /**
     * 进入下一阶段
     */
    nextPhase() {
        const phaseOrder = [
            this.phases.SELECT_TARGET,
            this.phases.SET_FORBIDDEN,
            this.phases.SET_LOCKS,
            this.phases.INPUT_FUNCTION,
            this.phases.EVALUATE,
            this.phases.SWITCH_PLAYER
        ];
        
        const currentIndex = phaseOrder.indexOf(this.currentPhase);
        if (currentIndex < phaseOrder.length - 1) {
            const nextPhase = phaseOrder[currentIndex + 1];
            // 如果从SET_LOCKS进入INPUT_FUNCTION，需要切换玩家
            if (this.currentPhase === this.phases.SET_LOCKS && nextPhase === this.phases.INPUT_FUNCTION) {
                this.switchToInputPhase();
            } else {
                this.setPhase(nextPhase);
            }
        }
    }
    
    /**
     * 记录回合历史
     * @param {Object} roundData - 回合数据
     */
    recordRoundHistory(roundData) {
        this.gameHistory.push({
            round: roundData.round,
            selector: roundData.selector,
            constructor: roundData.constructor,
            targetCells: [...roundData.targetCells],
            forbiddenCells: [...roundData.forbiddenCells],
            lockedElements: [...roundData.lockedElements],
            expression: roundData.expression,
            functionType: roundData.functionType,
            hitTarget: roundData.hitTarget,
            hitForbidden: roundData.hitForbidden,
            score: roundData.score,
            totalScoreA: roundData.totalScoreA,
            totalScoreB: roundData.totalScoreB
        });
    }
    
    /**
     * 获取游戏报告
     * @returns {Object} 游戏报告数据
     */
    getGameReport() {
        return {
            difficulty: this.difficulty,
            totalRounds: this.totalRounds,
            winner: this.players.A.score > this.players.B.score ? 'A' :
                   this.players.B.score > this.players.A.score ? 'B' : 'draw',
            finalScores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            history: this.gameHistory
        };
    }
    
    /**
     * 清空游戏历史
     */
    clearGameHistory() {
        this.gameHistory = [];
    }
    
    /**
     * 结束游戏
     */
    endGame() {
        this.stopTimer();
        
        const winner = this.players.A.score > this.players.B.score ? 'A' :
                      this.players.B.score > this.players.A.score ? 'B' : 'draw';
        
        this.emit('gameEnd', {
            winner,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            report: this.getGameReport()
        });
    }
    
    /**
     * 获取当前游戏状态
     * @returns {Object}
     */
    getGameState() {
        return {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            currentPlayer: this.currentPlayer,
            currentPhase: this.currentPhase,
            remainingTime: this.remainingTime,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: this.isTestMode(),
            testModeFunctions: this.testModeFunctions,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            roundState: { ...this.roundState },
            maxForbidden: this.getMaxForbiddenCount(),
            maxLocks: this.getMaxLockCount()
        };
    }
    
    /**
     * 跳过当前阶段（用于快速测试）
     */
    skipPhase() {
        this.nextPhase();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameController;
}
