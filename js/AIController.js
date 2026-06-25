/**
 * AIController 模块
 * 负责管理 AI (Summa) 的行为逻辑
 */
class AIController {
    constructor(gameController, gridSystem) {
        this.gameController = gameController;
        this.gridSystem = gridSystem;
        this.parser = new FunctionParser();
        this.name = "Summa";
        this.isThinking = false;
    }

    /**
     * 执行 AI 回合
     */
    async playTurn() {
        if (this.isThinking) return;
        this.isThinking = true;

        const phase = this.gameController.currentPhase;
        
        // 模拟思考时间
        await this.think(1000 + Math.random() * 1000);

        if (phase === 'select_target') {
            this.selectTargets();
            setTimeout(() => this.gameController.confirmTargetSelection(), 500);
        } else if (phase === 'set_forbidden') {
            this.setForbiddenZones();
            setTimeout(() => this.gameController.confirmForbiddenSelection(), 500);
        } else if (phase === 'set_locks') {
            this.setLocks();
            setTimeout(() => this.gameController.confirmLockSelection(), 500);
        } else if (phase === 'input_function') {
            const expression = this.generateExpression();
            this.submitExpression(expression);
        }

        this.isThinking = false;
    }

    /**
     * 模拟思考延迟
     */
    think(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 选择目标点
     */
    selectTargets() {
        const state = this.gameController.getGameState();
        const count = state.targetCount;
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        
        for (let i = 0; i < count; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * gridSize) - half;
                y = Math.floor(Math.random() * gridSize) - half;
            } while (this.isOccupied(x, y));
            
            this.gameController.selectTargetCell({x, y});
        }
    }

    /**
     * 设置禁区
     */
    setForbiddenZones() {
        const state = this.gameController.getGameState();
        const maxForbidden = state.maxForbidden;
        const count = this.getDifficultyBasedCount(maxForbidden);
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;

        for (let i = 0; i < count; i++) {
            let x, y;
            do {
                x = Math.floor(Math.random() * gridSize) - half;
                y = Math.floor(Math.random() * gridSize) - half;
            } while (this.isOccupied(x, y));
            
            this.gameController.addForbiddenCell({x, y});
        }
    }

    /**
     * 设置锁定元素
     */
    setLocks() {
        const state = this.gameController.getGameState();
        const maxLocks = state.maxLocks;
        const count = this.getDifficultyBasedCount(maxLocks);
        const elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs', 'exp', 'ln'];
        
        // 简单模式下不锁定四则运算
        const available = state.difficulty === 'easy' 
            ? elements.filter(e => !['+', '-', '*', '/'].includes(e))
            : elements;

        const shuffled = available.sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
            this.gameController.addLockedElement(shuffled[i]);
        }
    }

    /**
     * 生成数学表达式
     */
    generateExpression() {
        const difficulty = this.gameController.difficulty;
        const templates = this.getTemplatesByDifficulty(difficulty);
        const template = templates[Math.floor(Math.random() * templates.length)];
        
        // 简单的参数替换
        return template.replace(/\{n\}/g, () => Math.floor(Math.random() * 5) + 1)
                       .replace(/\{c\}/g, () => Math.floor(Math.random() * 10) - 5);
    }

    /**
     * 提交表达式
     */
    submitExpression(expression) {
        this.gameController.submitFunction(expression);
        // 这里的评估由 GameController 触发，UIController 会处理渲染和碰撞检测
    }

    /**
     * 辅助：检查位置是否已被占用（目标或禁区）
     */
    isOccupied(x, y) {
        const state = this.gameController.getGameState();
        const isTarget = state.roundState.targetCells.some(c => c.x === x && c.y === y);
        const isForbidden = state.roundState.forbiddenCells.some(c => c.x === x && c.y === y);
        return isTarget || isForbidden;
    }

    /**
     * 辅助：根据难度获取数量
     */
    getDifficultyBasedCount(max) {
        const difficulty = this.gameController.difficulty;
        if (difficulty === 'easy') return Math.floor(max * 0.3);
        if (difficulty === 'hard') return Math.ceil(max * 0.8);
        if (difficulty === 'expert') return max;
        return Math.floor(max * 0.6); // normal
    }

    /**
     * 获取不同难度的表达式模板
     */
    getTemplatesByDifficulty(difficulty) {
        switch (difficulty) {
            case 'easy':
                return ['x+{c}', 'x-{c}', '{n}*x', 'x/{n}'];
            case 'normal':
                return ['x^2+{c}', '{n}*x+{c}', 'abs(x-{c})', 'sin(x)+{c}'];
            case 'hard':
                return ['x^2-{n}*x+{c}', 'sin({n}*x)', 'exp(x/{n})', 'abs(x^2-{c})'];
            case 'expert':
                return ['x^3-{n}*x', 'sin(x)*cos(x)', 'exp(-x^2)+{c}', 'ln(abs(x)+1)*{n}'];
            default:
                return ['x'];
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIController;
}
