/**
 * 函数棋 - Function Chess
 * Copyright (C) 2024 shaihai-studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
        this.activeArchiveId = null;

        // ── 挑衅反转学习系统 ────────────────────────────────────────────
        this.failedPuzzle = null;         // Summa 无法破解的局面快照
        this.revengeMode = false;          // 下次选题时出同类题
        this.pendingRevengePuzzle = null;  // 当前回合反出给玩家的局面
        this.learnedSolutions = [];        // 精确解法库 [{targetCells, forbiddenCells, expression}]
        this.learnedTemplates = [];        // 算法模板库 [{core, original}]（计入生成算法）

        // ── 加载持久化的学习数据 ─────────────────────────────────────────
        this.functionBuilderSingle=new AIFunctionBuilderSingle(this);
        this.functionBuilderMulti=new AIFunctionBuilderMulti(this);
        this.functionBuilder=new AIFunctionBuilder(this);
        this.targetSelector=new AITargetSelector(this);
        this.constraintManager=new AIConstraintManager(this);
        this.learningSystem=new AILearningSystem(this);
        this.expressionHandler=new AIExpressionHandler(this);
        this.persistence=new AIPersistence(this);
        this._loadLearnedData();

        // AI策略配置
        this.strategies = {
            easy: {
                targetAccuracy: 0.4,    // 选择目标格的随机性
                forbiddenAccuracy: 0.3,  // 设置禁止区的策略性
                lockAccuracy: 0.3,       // 锁定的策略性
                functionComplexity: 1    // 函数复杂度 (1-4)
            },
            normal: {
                targetAccuracy: 0.6,
                forbiddenAccuracy: 0.5,
                lockAccuracy: 0.5,
                functionComplexity: 2
            },
            hard: {
                targetAccuracy: 0.8,
                forbiddenAccuracy: 0.7,
                lockAccuracy: 0.7,
                functionComplexity: 3
            },
            expert: {
                targetAccuracy: 0.95,
                forbiddenAccuracy: 0.85,
                lockAccuracy: 0.85,
                functionComplexity: 4
            }
        };
    }

    /**
     * 执行 AI 回合（单个阶段）
     */
    async playTurn(phase) {
        if (this.isThinking) {
            console.log('[AI] 正在思考中，跳过');
            return;
        }
        this.isThinking = true;

        // 如果没有传入phase，使用当前阶段
        if (!phase) {
            phase = this.gameController.currentPhase;
        }

        // ── 阶段守卫：执行前确认当前阶段仍是请求的阶段，且轮到 AI（B） ──
        // 防止 AI 因触发延迟/思考超时，把上一阶段的动作（尤其构造表达式）执行到
        // 玩家当前回合（玩家选格子时 AI 抢跑输入表达式的 bug）。
        const gc = this.gameController;
        if (gc && gc.currentPhase !== phase) {
            console.warn(`[AI] playTurn(${phase}) 但当前阶段已变为 ${gc.currentPhase}，丢弃本次执行`);
            this.isThinking = false;
            return;
        }

        console.log('[AI] ========== 开始执行阶段 ==========');
        console.log('[AI] 阶段:', phase);
        console.log('[AI] 当前玩家:', this.gameController.currentPlayer);

        // 模拟思考时间
        await this.think(1000 + Math.random() * 1000);

        // 思考后再校验一次（思考期间阶段可能被超时/玩家操作推进）
        if (gc.currentPhase !== phase) {
            console.warn(`[AI] playTurn(${phase}) 思考后阶段已变为 ${gc.currentPhase}，丢弃本次执行`);
            this.isThinking = false;
            return;
        }

        try {
            if (phase === 'select_target') {
                console.log('[AI] >> 选择目标格');
                await this.selectTargets();
                await this.think(500);

                // 检查目标格数量
                const currentCount = this.gameController.roundState.targetCells.length;
                const requiredCount = this.gameController.targetCount;
                console.log(`[AI] 目标格选择完成: ${currentCount}/${requiredCount}`);

                console.log('[AI] 确认目标格选择');
                const confirmResult = this.gameController.confirmTargetSelection();
                console.log(`[AI] 确认结果: ${confirmResult}`);

                if (!confirmResult) {
                    // 如果确认失败（格子不够），补齐缺少的格子再次尝试
                    console.warn('[AI] 确认目标格失败，尝试补齐缺少格子');
                    const half = this.gridSystem.gridSize / 2;
                    const targetCount = this.gameController.targetCount;
                    while (this.gameController.roundState.targetCells.length < targetCount) {
                        const cell = this._findFallbackCell(half, this.gameController.roundState.targetCells);
                        if (cell) {
                            this.gameController.selectTargetCell(cell);
                        } else break;
                    }
                    const retryResult = this.gameController.confirmTargetSelection();
                    console.log(`[AI] 重试确认结果: ${retryResult}`);
                    if (!retryResult) {
                        console.error('[AI] ❌ 重试确认仍然失败，游戏可能卡住');
                    }
                }
                await this.think(200);
            } else if (phase === 'set_forbidden') {
                console.log('[AI] >> 设置禁区');
                this.setForbiddenZones();
                await this.think(500);
                console.log('[AI] 确认禁区设置');
                this.gameController.confirmForbiddenSelection();
                // 等待阶段切换完成
                await this.think(200);
            } else if (phase === 'set_locks') {
                console.log('[AI] >> 设置锁定');
                this.setLocks();
                await this.think(500);
                console.log('[AI] 确认锁定设置');
                this.gameController.confirmLockSelection();
                // 等待阶段切换完成
                await this.think(200);
            } else if (phase === 'input_function') {
                console.log('[AI] >> 构造函数');
                const expression = await this.generateExpression();
                await this.submitExpression(expression);
            } else {
                console.log('[AI] 未知阶段:', phase);
            }
        } catch (error) {
            console.error('[AI] ❌ 执行阶段时出错:', error);
            console.error('[AI] 错误堆栈:', error.stack);
        } finally {
            this.isThinking = false;
            console.log('[AI] ========== 阶段执行完毕 ==========');
        }
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
    async selectTargets(...args){return await this.targetSelector.selectTargets(...args);}

    /**
     * 检查位置是否离已选目标太近
     */
    isTooCloseToExisting(...args){return this.targetSelector.isTooCloseToExisting(...args);}

    /**
     * 设置禁区
     */
    setForbiddenZones(...args){return this.constraintManager.setForbiddenZones(...args);}

    /**
     * 检查是否为有效的禁区位置
     */
    isValidForbiddenPosition(...args){return this.constraintManager.isValidForbiddenPosition(...args);}

    /**
     * 设置锁定元素
     */
    setLocks(...args){return this.constraintManager.setLocks(...args);}

    /**
     * 生成数学表达式
     */
    async generateExpression(...args){return await this.functionBuilder.generateExpression(...args);}

    /**
     * 使用与正式结算一致的高精度碰撞检测，判断表达式是否真正成功。
     */
    isExpressionActuallySuccessful(...args){return this.functionBuilder.isExpressionActuallySuccessful(...args);}

    /**
     * 智能构造函数穿过目标格
     */
    /**
     * 智能构造函数穿过目标格
     */
    constructFunctionForTargets(...args){return this.functionBuilder.constructFunctionForTargets(...args);}

    buildExpression(...args){return this.functionBuilder.buildExpression(...args);}

    evaluateFunction(...args){return this.functionBuilder.evaluateFunction(...args);}

    /**
     * 构造穿过单个目标格的函数
     */
    constructSingleTargetFunction(...args){return this.functionBuilderSingle.constructSingleTargetFunction(...args);}

    /**
     * 根据难度选择函数类型
     */
    selectFunctionTypeByDifficulty(...args){return this.functionBuilder.selectFunctionTypeByDifficulty(...args);}

    /**
     * 构造穿过多个目标格的函数（困难/专家模式）
     */
    constructMultiTargetFunction(...args){return this.functionBuilderMulti.constructMultiTargetFunction(...args);}

    /**
     * 随机选择N个目标格
     */
    selectRandomTargets(...args){return this.targetSelector.selectRandomTargets(...args);}

    /**
     * 计算函数穿过多少个目标格
     */
    countTargetHits(...args){return this.functionBuilder.countTargetHits(...args);}

    /**
     * 格式化一次函数表达式
     */
    formatLinearExpression(...args){return this.functionBuilder.formatLinearExpression(...args);}

    /**
     * 验证表达式是否包含被锁定的元素
     */
    isValidExpression(...args){return this.functionBuilder.isValidExpression(...args);}

    /**
     * 检查函数是否穿过目标格且不进入禁区
     * 注意：擦边（仅接触边界）是无效的，必须真正进入目标格内部
     */
    checkFunctionHitsTarget(...args){return this.functionBuilder.checkFunctionHitsTarget(...args);}

    /**
     * 提交表达式（逐个元素显示，体现思考过程）
     */
    async submitExpression(...args){return await this.expressionHandler.submitExpression(...args);}

    /**
     * 将表达式字符串智能拆分为元素数组
     */
    tokenizeExpression(...args){return this.expressionHandler.tokenizeExpression(...args);}

    /**
     * 辅助：检查位置是否已被占用（目标或禁区）
     */
    // ═══════════════════════════════════════════════════════════════
    //  挑衅反转学习系统——辅助方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 挑衅反转：尝试将失败局面平移到合法位置
     * 从原位置 (0,0) 出发，螺旋向外逐层搜索
     * @param {number} half - 棋盘半径
     * @returns {boolean} 是否成功放置
     */
    _tryRevengeTargetSelection(...args){return this.targetSelector._tryRevengeTargetSelection(...args);}

    /**
     * 底安选择：随机采样全部被占用时穷举找最佳空位
     * @param {number} half - 棋盘半径
     * @param {Array} alreadyChosen - 本回合已选目标格
     * @returns {{x,y}|null}
     */
    _findFallbackCell(...args){return this.targetSelector._findFallbackCell(...args);}

    /**
     * 检查已学习解法是否与当前目标格完全匹配
     */
    solutionMatchesPuzzle(...args){return this.learningSystem.solutionMatchesPuzzle(...args);}

    /**
     * 从玩家解法中学习
     * — 存入精确解法库（完全相同局面时直接使用）
     * — 提取函数结构模板计入生成算法（类似局面自动适配常数）
     */
    learnFromPlayer(...args){return this.learningSystem.learnFromPlayer(...args);}

    /**
     * 玩家也未能解出复仇局面
     */
    notifyPlayerFailedRevenge(...args){return this.learningSystem.notifyPlayerFailedRevenge(...args);}

    /**
     * 提取表达式的结构模板（去除末尾常数项）
     * 示例："2*x+3" → {core:"2*x"}, "sin(x)-1.5" → {core:"sin(x)"}
     */
    _extractTemplate(...args){return this.learningSystem._extractTemplate(...args);}

    normalizeExpressionInput(...args){return this.expressionHandler.normalizeExpressionInput(...args);}

    // ────────────────────────────────────────────────────────────
    // ──  玩家解析式深度训练系统（10000局类似局面无声模拟）  ──────────────────
    // ────────────────────────────────────────────────────────────

    /**
     * 玩家提交解析式后，对 Summa 进行 10000 局类似局面的静默训练
     * ─ 提取玩家表达式模板，生成大量随机偏移局面，尝试自适应求解
     * ─ 成功的解法存入精确解法库 + 模板库
     * ─ 同时尝试变形拓展（缩放、翻转、复合）以发现新策略
     * ─ 使用时间切片（8ms）不阻塞 UI
     *
     * @param {string} expression - 玩家提交的解析式
     * @param {Array} currentTargets - 当前目标格
     * @param {Array} currentForbidden - 当前禁止区
     */
    async trainOnPlayerExpression(...args){return await this.learningSystem.trainOnPlayerExpression(...args);}

    /**
     * 基于核心模板生成变形集（缩放、翻转、复合）
     * @param {string} core - 原始核心表达式
     * @returns {string[]} 变形模板数组
     */
    _generateTemplateVariants(...args){return this.learningSystem._generateTemplateVariants(...args);}

    /**
     * 将核心模板自适应到目标格（求常数偏移 C）
     * @param {string} core - 核心表达式
     * @param {Array} targets - 目标格数组
     * @returns {string|null} 自适应后的完整表达式
     */
    _adaptCoreToTargets(...args){return this.learningSystem._adaptCoreToTargets(...args);}

    /**
     * 纯数学验证：检查表达式是否穿过所有目标格且避开禁止区
     * @param {string} expr - 要验证的表达式
     * @param {Array} targets - 目标格
     * @param {Array} forbidden - 禁止区
     * @returns {boolean}
     */
    _verifyExpressionPure(...args){return this.learningSystem._verifyExpressionPure(...args);}

    /**
     * 将已学模板适配到当前目标格（计入算法）
     * 原理：求 C 使得 core(tx) + C = ty，然后返回 core+C
     * @param {Object} template - 模板对象 {core, original}
     * @param {Array} targetCells - 目标格数组
     * @param {Array} lockedElements - 被锁定的元素（可选）
     */
    adaptTemplateToTargets(...args){return this.learningSystem.adaptTemplateToTargets(...args);}

    isOccupied(...args){return this.constraintManager.isOccupied(...args);}

    /**
     * 辅助：根据难度获取数量
     */
    getDifficultyBasedCount(...args){return this.constraintManager.getDifficultyBasedCount(...args);}

    /**
     * 获取不同难度的表达式模板
     */
    getTemplatesByDifficulty(...args){return this.persistence.getTemplatesByDifficulty(...args);}

    // ═══════════════════════════════════════════════════════════════════════════════
    //  持久化与复仇训练系统
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * 从 localStorage 加载已学习的数据
     */
    _loadLearnedData(...args){return this.persistence._loadLearnedData(...args);}

    /**
     * 保存学习数据到 localStorage
     */
    _saveLearnedData(...args){return this.persistence._saveLearnedData(...args);}

    _saveArchiveRevengeTraining(...args){return this.persistence._saveArchiveRevengeTraining(...args);}

    /**
     * 复仇前现场训练：对失败局面及其变体进行100000局训练
     * @param {Object} puzzle - 失败的局面 {targetCells, forbiddenCells}
     */
    async trainOnFailedPuzzle(...args){return await this.learningSystem.trainOnFailedPuzzle(...args);}
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIController;
}
