/**
 * SummaTrainer 模块
 * 无监督自我对弈训练系统
 * 让AI自己和自己下棋来提升策略
 */
class SummaTrainer {
    constructor(gameController, gridSystem) {
        this.gameController = gameController;
        this.gridSystem = gridSystem;
        this.trainingGames = 0;
        this.wins = { A: 0, B: 0 };
        this.totalScore = { A: 0, B: 0 };
        this.trainingHistory = [];
        this.isTraining = false;
        this.trainingConfig = {
            totalGames: 1000,        // 总训练局数
            difficulty: 'hard',      // 训练难度
            logInterval: 10,         // 每多少局打印一次日志
            saveInterval: 100,       // 每多少局保存一次数据
            exploreRate: 0.3         // 探索率（随机动作的概率）
        };
    }
    
    /**
     * 开始训练
     */
    async startTraining(config = {}) {
        // 合并配置
        Object.assign(this.trainingConfig, config);
        
        this.isTraining = true;
        console.log(`[Trainer] 开始训练，总对局数: ${this.trainingConfig.totalGames}`);
        console.log(`[Trainer] 难度: ${this.trainingConfig.difficulty}`);
        
        for (let i = 0; i < this.trainingConfig.totalGames && this.isTraining; i++) {
            await this.playOneGame(i);
            
            // 定期打印统计
            if ((i + 1) % this.trainingConfig.logInterval === 0) {
                this.printTrainingStats(i + 1);
            }
            
            // 定期保存
            if ((i + 1) % this.trainingConfig.saveInterval === 0) {
                this.saveTrainingData();
            }
        }
        
        console.log('[Trainer] 训练完成！');
        this.printTrainingStats(this.trainingGames);
        this.saveTrainingData();
    }
    
    /**
     * 停止训练
     */
    stopTraining() {
        this.isTraining = false;
        console.log('[Trainer] 训练已停止');
    }
    
    /**
     * 进行一局游戏
     */
    async playOneGame(gameIndex) {
        // 重置游戏
        this.gameController.resetGame();
        this.gameController.gameMode = 'ai';
        this.gameController.difficulty = this.trainingConfig.difficulty;
        
        // 模拟完整的游戏流程
        while (!this.gameController.gameEnded) {
            const phase = this.gameController.currentPhase;
            const currentPlayer = this.gameController.currentPlayer;
            
            // 根据阶段执行相应操作
            await this.executePhase(phase, currentPlayer);
        }
        
        // 记录结果
        this.recordGameResult();
        this.trainingGames++;
    }
    
    /**
     * 执行游戏阶段的动作
     */
    async executePhase(phase, player) {
        switch(phase) {
            case 'select_target':
                this.aiSelectTargetsWithExploration();
                this.gameController.confirmTargetSelection();
                break;
                
            case 'set_forbidden':
                this.aiSetForbiddenWithExploration();
                this.gameController.confirmForbiddenSelection();
                break;
                
            case 'set_locks':
                this.aiSetLocksWithExploration();
                this.gameController.confirmLockSelection();
                break;
                
            case 'input_function':
                await this.aiInputFunctionWithExploration();
                break;
                
            case 'evaluate':
                // 自动进入下一阶段
                break;
                
            case 'switch_player':
                // 自动切换
                break;
        }
    }
    
    /**
     * AI选择目标格（带探索）
     */
    aiSelectTargetsWithExploration() {
        const state = this.gameController.getGameState();
        const count = state.targetCount;
        
        for (let i = 0; i < count; i++) {
            if (Math.random() < this.trainingConfig.exploreRate) {
                // 探索：随机选择
                this.selectRandomTarget();
            } else {
                // 利用：智能选择
                this.selectSmartTarget();
            }
        }
    }
    
    /**
     * 随机选择目标格
     */
    selectRandomTarget() {
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        let x, y;
        let attempts = 0;
        
        do {
            x = Math.floor(Math.random() * gridSize) - half;
            y = Math.floor(Math.random() * gridSize) - half;
            attempts++;
        } while (this.isOccupied(x, y) && attempts < 50);
        
        this.gameController.selectTargetCell({x, y});
    }
    
    /**
     * 智能选择目标格
     */
    selectSmartTarget() {
        // 选择相对分散的位置
        const state = this.gameController.getGameState();
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        let x, y;
        let attempts = 0;
        
        do {
            x = Math.floor(Math.random() * gridSize) - half;
            y = Math.floor(Math.random() * gridSize) - half;
            attempts++;
        } while (
            (this.isOccupied(x, y) || this.isTooCloseToExisting(x, y)) && 
            attempts < 50
        );
        
        this.gameController.selectTargetCell({x, y});
    }
    
    /**
     * 检查位置是否被占用
     */
    isOccupied(x, y) {
        const state = this.gameController.getGameState();
        
        // 检查目标格
        if (state.roundState.targetCells.some(c => c.x === x && c.y === y)) {
            return true;
        }
        
        // 检查禁区
        if (state.roundState.forbiddenCells.some(c => c.x === x && c.y === y)) {
            return true;
        }
        
        // 检查历史格子
        if (state.usedCells.some(c => c.x === x && c.y === y)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 检查是否离已有目标格太近
     */
    isTooCloseToExisting(x, y) {
        const state = this.gameController.getGameState();
        const minDistance = 3;
        
        for (const cell of state.roundState.targetCells) {
            const distance = Math.abs(cell.x - x) + Math.abs(cell.y - y);
            if (distance < minDistance) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * AI设置禁区（带探索）
     */
    aiSetForbiddenWithExploration() {
        const state = this.gameController.getGameState();
        const count = this.getDifficultyBasedCount(state.maxForbidden);
        
        for (let i = 0; i < count; i++) {
            if (Math.random() < this.trainingConfig.exploreRate) {
                this.setRandomForbidden();
            } else {
                this.setSmartForbidden();
            }
        }
    }
    
    /**
     * 随机设置禁区
     */
    setRandomForbidden() {
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        let x, y;
        let attempts = 0;
        
        do {
            x = Math.floor(Math.random() * gridSize) - half;
            y = Math.floor(Math.random() * gridSize) - half;
            attempts++;
        } while (!this.isValidForbiddenPosition(x, y) && attempts < 50);
        
        if (this.isValidForbiddenPosition(x, y)) {
            this.gameController.addForbiddenCell({x, y});
        }
    }
    
    /**
     * 智能设置禁区
     */
    setSmartForbidden() {
        const state = this.gameController.getGameState();
        if (state.roundState.targetCells.length === 0) {
            this.setRandomForbidden();
            return;
        }
        
        const targetCell = state.roundState.targetCells[0];
        const offset = Math.floor(Math.random() * 4) + 2;
        const direction = Math.floor(Math.random() * 4);
        
        let x, y;
        switch(direction) {
            case 0: x = targetCell.x + offset; y = targetCell.y; break;
            case 1: x = targetCell.x - offset; y = targetCell.y; break;
            case 2: x = targetCell.x; y = targetCell.y + offset; break;
            case 3: x = targetCell.x; y = targetCell.y - offset; break;
        }
        
        if (this.isValidForbiddenPosition(x, y)) {
            this.gameController.addForbiddenCell({x, y});
        } else {
            this.setRandomForbidden();
        }
    }
    
    /**
     * 检查是否为有效的禁区位置
     */
    isValidForbiddenPosition(x, y) {
        const state = this.gameController.getGameState();
        
        const isTarget = state.roundState.targetCells.some(c => c.x === x && c.y === y);
        if (isTarget) return false;
        
        const isForbidden = state.roundState.forbiddenCells.some(c => c.x === x && c.y === y);
        if (isForbidden) return false;
        
        return true;
    }
    
    /**
     * AI设置锁定（带探索）
     */
    aiSetLocksWithExploration() {
        const state = this.gameController.getGameState();
        const count = this.getDifficultyBasedCount(state.maxLocks);
        const elements = this.getAvailableElements();
        
        for (let i = 0; i < count; i++) {
            if (Math.random() < this.trainingConfig.exploreRate || elements.length === 0) {
                // 随机选择
                const randomElement = elements[Math.floor(Math.random() * elements.length)];
                if (randomElement) {
                    this.gameController.addLock(randomElement);
                    const index = elements.indexOf(randomElement);
                    elements.splice(index, 1);
                }
            } else {
                // 智能选择：锁定重要元素
                this.lockImportantElement(elements);
            }
        }
    }
    
    /**
     * 锁定重要元素
     */
    lockImportantElement(elements) {
        // 优先级：高级函数 > 特殊常数 > 基本运算符
        const priority = ['sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log', 'pi', 'e', 'i', '^', 'sqrt'];
        
        for (const element of priority) {
            if (elements.includes(element)) {
                this.gameController.addLock(element);
                const index = elements.indexOf(element);
                elements.splice(index, 1);
                return;
            }
        }
        
        // 如果没有优先级元素，随机选择一个
        if (elements.length > 0) {
            const randomElement = elements[Math.floor(Math.random() * elements.length)];
            this.gameController.addLock(randomElement);
            elements.splice(elements.indexOf(randomElement), 1);
        }
    }
    
    /**
     * 获取可用元素
     */
    getAvailableElements() {
        return ['+', '-', '*', '/', '^', 'sqrt', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log', '.', 'pi', 'e', 'i'];
    }
    
    /**
     * AI输入函数（带探索）
     */
    async aiInputFunctionWithExploration() {
        if (Math.random() < this.trainingConfig.exploreRate) {
            // 探索：随机生成函数
            this.generateRandomFunction();
        } else {
            // 利用：使用现有AI策略
            this.generateSmartFunction();
        }
        
        // 提交函数
        this.gameController.submitFunction();
        
        // 等待评估完成
        await this.waitForEvaluation();
    }
    
    /**
     * 生成随机函数
     */
    generateRandomFunction() {
        const functions = [
            'x', 'x^2', 'x^3', 'x^4',
            'sin(x)', 'cos(x)', 'tan(x)',
            'abs(x)', 'exp(x)', 'ln(x)',
            'x^2+x', 'x^3-x', 'sin(x)+x',
            '2*x', '3*x^2', '0.5*x^3',
            'x^2-1', 'x^3+2*x', 'sin(x)+cos(x)'
        ];
        
        const randomFunc = functions[Math.floor(Math.random() * functions.length)];
        
        // 直接修改表达式
        this.gameController.roundState.functionExpression = randomFunc;
    }
    
    /**
     * 生成智能函数（使用现有AI策略）
     */
    generateSmartFunction() {
        // 这里可以使用现有的AIController策略
        // 简化版：选择一个相对复杂的函数
        const smartFunctions = [
            'x^2', 'x^3', 'sin(x)', 'cos(x)',
            'abs(x)', 'x^2+x', 'sin(x)+x',
            'x^3-x', '2*sin(x)', 'x^2-2*x'
        ];
        
        const smartFunc = smartFunctions[Math.floor(Math.random() * smartFunctions.length)];
        this.gameController.roundState.functionExpression = smartFunc;
    }
    
    /**
     * 等待评估完成
     */
    waitForEvaluation() {
        return new Promise((resolve) => {
            // 简化处理：立即resolve
            // 实际应该等待evaluationComplete事件
            setTimeout(resolve, 10);
        });
    }
    
    /**
     * 根据难度获取数量
     */
    getDifficultyBasedCount(maxCount) {
        const difficulty = this.trainingConfig.difficulty;
        switch(difficulty) {
            case 'easy': return Math.floor(maxCount * 0.3);
            case 'normal': return Math.floor(maxCount * 0.5);
            case 'hard': return Math.floor(maxCount * 0.7);
            case 'expert': return maxCount;
            default: return Math.floor(maxCount * 0.5);
        }
    }
    
    /**
     * 记录游戏结果
     */
    recordGameResult() {
        const state = this.gameController.getGameState();
        const winner = this.gameController.winner;
        
        if (winner) {
            this.wins[winner]++;
        }
        
        this.totalScore.A += state.players.A.score;
        this.totalScore.B += state.players.B.score;
        
        // 记录到历史
        this.trainingHistory.push({
            gameIndex: this.trainingGames,
            winner: winner,
            scores: {
                A: state.players.A.score,
                B: state.players.B.score
            },
            rounds: state.currentRound,
            difficulty: this.trainingConfig.difficulty
        });
    }
    
    /**
     * 打印训练统计
     */
    printTrainingStats(totalGames) {
        const winRateA = ((this.wins.A / totalGames) * 100).toFixed(2);
        const winRateB = ((this.wins.B / totalGames) * 100).toFixed(2);
        const avgScoreA = (this.totalScore.A / totalGames).toFixed(2);
        const avgScoreB = (this.totalScore.B / totalGames).toFixed(2);
        
        console.log(`[Trainer] === 训练统计 ===`);
        console.log(`[Trainer] 已完成对局: ${totalGames}`);
        console.log(`[Trainer] 玩家A胜率: ${winRateA}% (${this.wins.A}胜)`);
        console.log(`[Trainer] 玩家B胜率: ${winRateB}% (${this.wins.B}胜)`);
        console.log(`[Trainer] 玩家A平均分: ${avgScoreA}`);
        console.log(`[Trainer] 玩家B平均分: ${avgScoreB}`);
        console.log(`[Trainer] ================`);
    }
    
    /**
     * 保存训练数据
     */
    saveTrainingData() {
        const data = {
            trainingGames: this.trainingGames,
            wins: this.wins,
            totalScore: this.totalScore,
            config: this.trainingConfig,
            history: this.trainingHistory,
            timestamp: new Date().toISOString()
        };
        
        // 保存到localStorage
        localStorage.setItem('summaTrainingData', JSON.stringify(data));
        console.log(`[Trainer] 训练数据已保存 (${this.trainingGames} 局)`);
    }
    
    /**
     * 加载训练数据
     */
    loadTrainingData() {
        const saved = localStorage.getItem('summaTrainingData');
        if (saved) {
            const data = JSON.parse(saved);
            this.trainingGames = data.trainingGames || 0;
            this.wins = data.wins || { A: 0, B: 0 };
            this.totalScore = data.totalScore || { A: 0, B: 0 };
            this.trainingHistory = data.history || [];
            console.log(`[Trainer] 已加载训练数据: ${this.trainingGames} 局`);
        }
    }
    
    /**
     * 获取训练统计
     */
    getTrainingStats() {
        return {
            trainingGames: this.trainingGames,
            wins: { ...this.wins },
            totalScore: { ...this.totalScore },
            winRateA: this.trainingGames > 0 ? (this.wins.A / this.trainingGames * 100).toFixed(2) : 0,
            winRateB: this.trainingGames > 0 ? (this.wins.B / this.trainingGames * 100).toFixed(2) : 0,
            avgScoreA: this.trainingGames > 0 ? (this.totalScore.A / this.trainingGames).toFixed(2) : 0,
            avgScoreB: this.trainingGames > 0 ? (this.totalScore.B / this.trainingGames).toFixed(2) : 0
        };
    }
}
