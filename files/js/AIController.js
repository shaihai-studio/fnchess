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

        console.log('[AI] ========== 开始执行阶段 ==========');
        console.log('[AI] 阶段:', phase);
        console.log('[AI] 当前玩家:', this.gameController.currentPlayer);

        // 模拟思考时间
        await this.think(1000 + Math.random() * 1000);

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
    async selectTargets() {
        this.pendingRevengePuzzle = null;

        const state = this.gameController.getGameState();
        const count = state.targetCount;
        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        const strategy = this.strategies[this.gameController.difficulty] || this.strategies.normal;

        console.log(`[AI] selectTargets 开始: 需要 ${count} 个目标格, 当前阶段: ${state.currentPhase}`);

        // 检查当前阶段是否正确
        if (state.currentPhase !== 'select_target') {
            console.error(`[AI] ❌ 当前阶段不是 select_target，而是 ${state.currentPhase}，无法选择目标格`);
            return;
        }

        // ── 挑衅反转模式：先训练再出题 ────────────────────────────────────────
        if (this.revengeMode && this.failedPuzzle) {
            console.log('[AI] 进入复仇模式，先进行100000局现场训练...');
            // 对失败局面及其变体进行100000局训练
            await this.trainOnFailedPuzzle(this.failedPuzzle);

            console.log('[AI] 复仇训练完成，开始选择目标格');
            const revengeSuccess = this._tryRevengeTargetSelection(half, count);
            this.revengeMode = false;
            if (!revengeSuccess) {
                // 找不到可平移位置，放弃复仇，继续普通选题
                this.failedPuzzle = null;
                console.log('[AI] 挑衅反转：棋盘无空位，放弃');
            } else {
                // 复仇成功，清空 failedPuzzle 避免下次重复触发
                this.failedPuzzle = null;
                const placedCount = this.gameController.roundState.targetCells.length;
                console.log(`[AI] 复仇模式完成，已放置 ${placedCount}/${count} 个目标格`);
                // 如果复仇模式已经放置了足够的目标格，直接返回
                if (placedCount >= count) {
                    console.log(`[AI] 复仇模式已放置足够目标格，跳过普通选题`);
                    return;
                }
            }
            // 复仇目标格不足时，继续向下执行普通选题循环补齐
        }

        // ── 普通选题：while 循环确保准确计数，避免 for 循环 bestCell=null 时少选 ──────
        let placed = this.gameController.roundState.targetCells.length; // 直接读 live 数组长度
        let safetyLimit = count * 3 + 10; // 防无限循环

        console.log(`[AI] 普通选题开始: 已有 ${placed}/${count} 个目标格`);

        while (placed < count && safetyLimit-- > 0) {
            let bestScore = -Infinity;
            let bestCell = null;

            // 采样 40 个候选，降低全部被占用的概率
            for (let c = 0; c < 40; c++) {
                let cx = Math.floor(Math.random() * gridSize) - half;
                let cy = Math.floor(Math.random() * gridSize) - half;

                if (this.isOccupied(cx, cy)) continue;

                let score = Math.abs(cx) + Math.abs(cy);
                for (const t of this.gameController.roundState.targetCells) {
                    const dx = Math.abs(cx - t.x), dy = Math.abs(cy - t.y);
                    if (dx === 0 || dy === 0 || dx === dy) score -= 5;
                    else score += dx + dy;
                }
                if (Math.random() > strategy.targetAccuracy) score = Math.random() * 10;

                if (score > bestScore) { bestScore = score; bestCell = { x: cx, y: cy }; }
            }

            // 底安：随机采样全部失败时穷举找最佳空位
            if (!bestCell) {
                bestCell = this._findFallbackCell(half, this.gameController.roundState.targetCells);
            }

            if (bestCell) {
                const ok = this.gameController.selectTargetCell(bestCell);
                if (ok !== false) {
                    placed++; // 放置成功才计数
                    console.log(`[AI] 普通选题放置成功: ${placed}/${count}`);
                } else {
                    console.warn('[AI] selectTargetCell 返回 false，阶段可能已变更，中止选题');
                    break;
                }
            } else {
                console.warn('[AI] 无法找到候选格子，棋盘可能已满');
                break;
            }
        }

        console.log(`[AI] 普通选题结束: 最终 ${placed}/${count} 个目标格`);
    }

    /**
     * 检查位置是否离已选目标太近
     */
    isTooCloseToExisting(x, y) {
        const state = this.gameController.getGameState();
        const minDistance = 3; // 最小距离

        for (const cell of state.roundState.targetCells) {
            const distance = Math.abs(cell.x - x) + Math.abs(cell.y - y);
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    /**
     * 设置禁区
     */
    setForbiddenZones() {
        const state = this.gameController.getGameState();
        const maxForbidden = state.maxForbidden;
        const gridSize = this.gridSystem.gridSize;

        console.log(`[AI] 设置禁区: maxForbidden=${maxForbidden}`);

        if (maxForbidden === 0) return;

        let placedCount = 0;

        // ── 挑衅反转模式：优先放置平移后的复仇禁区 ────────────────────────
        if (this.pendingRevengePuzzle && this.pendingRevengePuzzle.forbiddenCells.length > 0) {
            for (const cell of this.pendingRevengePuzzle.forbiddenCells) {
                if (placedCount >= maxForbidden) break;
                if (this.isValidForbiddenPosition(cell.x, cell.y)) {
                    this.gameController.addForbiddenCell({ x: cell.x, y: cell.y });
                    placedCount++;
                }
            }
            if (placedCount >= maxForbidden) {
                console.log(`[AI] 复仇禁区放置完毕，共 ${placedCount} 个`);
                return;
            }
            // 复仇禁区部分不可用，用普通逻辑补准
        }

        // ── 普通禁区放置：靠近目标格路径 + 随机底安 ──────────────────────
        while (placedCount < maxForbidden) {
            let bestX = 0, bestY = 0;
            let found = false;

            if (state.roundState.targetCells.length > 0) {
                const target = state.roundState.targetCells[placedCount % state.roundState.targetCells.length];
                for (let i = 0; i < 30; i++) {
                    let tx = Math.floor(target.x * Math.random()) + Math.floor(Math.random() * 3 - 1);
                    let ty = Math.floor(target.y * Math.random()) + Math.floor(Math.random() * 3 - 1);
                    if (tx < -gridSize / 2 || tx >= gridSize / 2) continue;
                    if (ty < -gridSize / 2 || ty >= gridSize / 2) continue;
                    if (this.isValidForbiddenPosition(tx, ty)) {
                        bestX = tx; bestY = ty; found = true; break;
                    }
                }
            }

            if (!found) {
                for (let attempt = 0; attempt < 150; attempt++) {
                    let rx = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    let ry = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    if (this.isValidForbiddenPosition(rx, ry)) {
                        bestX = rx; bestY = ry; found = true; break;
                    }
                }
            }

            if (found) {
                this.gameController.addForbiddenCell({ x: bestX, y: bestY });
                placedCount++;
            } else {
                break; // 棋盘已满，无法继续
            }
        }

        console.log(`[AI] 禁区设置完成，共设置 ${placedCount} 个禁区`);
    }

    /**
     * 检查是否为有效的禁区位置
     */
    isValidForbiddenPosition(x, y) {
        const state = this.gameController.getGameState();

        // 不能是目标格
        if (state.roundState.targetCells.some(c => c.x === x && c.y === y)) return false;
        // 不能是已有禁区
        if (state.roundState.forbiddenCells.some(c => c.x === x && c.y === y)) return false;
        // 不能是历史使用过的格子（规避灰色历史格）
        if (state.usedCells && state.usedCells.some(c => c.x === x && c.y === y)) return false;

        return true;
    }

    /**
     * 设置锁定元素
     */
    setLocks() {
        const state = this.gameController.getGameState();
        const maxLocks = state.maxLocks;
        if (maxLocks === 0) return;

        const count = this.getDifficultyBasedCount(maxLocks);
        const strategy = this.strategies[this.gameController.difficulty] || this.strategies.normal;

        // 根据难度选择策略元素池
        let elements;
        if (strategy.functionComplexity <= 2) {
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs'];
        } else {
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'tan', 'abs', 'ln', 'sqrt'];
        }

        // 简单模式不锁定四则运算
        if (state.difficulty === 'easy') {
            elements = elements.filter(e => !['+', '-', '*', '/'].includes(e));
        }

        // ── 关键修复：过滤掉已被锁定2次（达到上限）的元素 ─────────────────
        elements = elements.filter(e => this.gameController.canLockElement(e));
        if (elements.length === 0) return;

        // 洗牌后循环锁定，保证选满 count 个
        const shuffled = [...elements].sort(() => 0.5 - Math.random());
        let locked = 0, idx = 0;
        while (locked < count && shuffled.length > 0) {
            if (idx >= shuffled.length) idx = 0;
            this.gameController.addLockedElement(shuffled[idx]);
            locked++;
            idx++;
        }
    }

    /**
     * 生成数学表达式
     */
    async generateExpression() {
        const difficulty = this.gameController.difficulty;
        const state = this.gameController.getGameState();
        const strategy = this.strategies[difficulty] || this.strategies.normal;
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        const lockedElements = state.roundState.lockedElements;

        let bestExpr = 'x';
        this.lastThinkCount = 0;

        // ── 优先尝试精确匹配的已学习解法 ──────────────────────────────────────
        if (this.learnedSolutions.length > 0 && this.uiController && this.uiController.renderer) {
            for (const solution of this.learnedSolutions) {
                if (this.solutionMatchesPuzzle(solution, targetCells)) {
                    if (this.isExpressionActuallySuccessful(solution.expression, targetCells, forbiddenCells)) {
                        // 检查是否包含被锁定的元素
                        if (!this.isValidExpression(solution.expression, lockedElements)) {
                            console.log('[AI] 精确学习解法包含被锁定元素，跳过:', solution.expression);
                            continue;
                        }
                        console.log('[AI] 精确学习解法通过验证！直接使用:', solution.expression);
                        return solution.expression;
                    }
                }
            }
        }

        // ── 时间切片：每批计算超过 8ms 则通过 requestAnimationFrame 让出主线程 ──
        const SLICE_MS = 8;
        let sliceStart = performance.now();

        for (let attempt = 0; attempt < 2000; attempt++) {
            const now = performance.now();
            if (now - sliceStart >= SLICE_MS) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                sliceStart = performance.now();
            }

            let expression = null;

            // ── 每轮都尝试模板自适应（学习计入算法） ─────────────────────
            if (this.learnedTemplates.length > 0 && targetCells.length > 0) {
                const tmpl = this.learnedTemplates[Math.floor(Math.random() * this.learnedTemplates.length)];
                expression = this.adaptTemplateToTargets(tmpl, targetCells, lockedElements);
            }

            if (!expression && targetCells.length > 0) {
                expression = this.constructFunctionForTargets(targetCells, forbiddenCells, lockedElements, strategy);
            }

            if (!expression) {
                const templates = this.getTemplatesByDifficulty(difficulty);
                const template = templates[Math.floor(Math.random() * templates.length)];
                expression = template.replace(/\{n\}/g, () => Math.floor(Math.random() * 5) + 1)
                    .replace(/\{c\}/g, () => Math.floor(Math.random() * 10) - 5);
            }

            // ── 锁定合规检查：确保表达式不包含被锁定的元素 ──────────────────
            if (expression && !this.isValidExpression(expression, lockedElements)) {
                expression = null;
            }

            bestExpr = expression;

            let fail = false;
            let hitCount = 0;

            if (!expression) {
                fail = true;
            } else if (this.uiController && this.uiController.renderer) {
                if (!this.isExpressionActuallySuccessful(expression, targetCells, forbiddenCells)) {
                    fail = true;
                } else {
                    hitCount = targetCells.length;
                }
            } else {
                hitCount = this.countTargetHits(expression, targetCells, forbiddenCells);
                if (hitCount < targetCells.length) fail = true;
                for (const forbidden of forbiddenCells) {
                    const fx = forbidden.x + 0.5;
                    const fy = this.evaluateFunction(expression, fx);
                    if (fy !== Infinity && Math.abs(fy - (forbidden.y + 0.5)) < 0.5) {
                        fail = true; break;
                    }
                }
            }

            if (!fail) {
                console.log(`[AI] 第 ${attempt + 1} 次尝试通过真实物理检查！准备递交:`, expression);
                return expression;
            } else {
                console.log(`[AI] 第 ${attempt + 1} 次尝试假命中或碰禁区，废除并重新生成...`);
            }
        }

        // ── 500 次全败：记录无法破解的局面，下回合反出给玩家 ───────────────
        if (targetCells.length > 0) {
            this.failedPuzzle = {
                targetCells: targetCells.map(c => ({ ...c })),
                forbiddenCells: forbiddenCells.map(c => ({ ...c }))
            };
            this.revengeMode = true;
            console.log('[AI] 局面记录完毕，下回合将反出给玩家');
        }

        console.log('[AI] 连续 2000 大轮搜寻全部失败，强制递交次优突变解:', bestExpr);
        return bestExpr;
    }

    /**
     * 使用与正式结算一致的高精度碰撞检测，判断表达式是否真正成功。
     */
    isExpressionActuallySuccessful(expression, targetCells, forbiddenCells) {
        if (!expression || !this.uiController || !this.uiController.renderer || !this.uiController.detector) {
            return false;
        }

        const range = this.gridSystem.getRange();
        // 与 UIController.renderAndEvaluate 保持一致：碰撞检测使用高精度采样
        const collisionPoints = this.uiController.renderer.sampleFunction(expression, range.min, range.max, true);
        const polyline = this.uiController.renderer.convertToPolyline(collisionPoints);
        if (!polyline || polyline.length === 0) return false;

        let hitCount = 0;
        for (const target of targetCells) {
            if (this.uiController.detector.checkHitTarget(polyline, target, this.gridSystem)) {
                hitCount++;
            }
        }
        if (hitCount < targetCells.length) return false;

        if (forbiddenCells.length > 0 &&
            this.uiController.detector.checkHitForbidden(polyline, forbiddenCells, this.gridSystem)) {
            return false;
        }

        return true;
    }

    /**
     * 智能构造函数穿过目标格
     */
    /**
     * 智能构造函数穿过目标格
     */
    constructFunctionForTargets(targetCells, forbiddenCells, lockedElements, strategy) {

        // 强大的神经元生成器：基于锁定系统分层递进搜索
        const availableOps = ['+', '-', '*', '/', '^', 'sin', 'cos', 'tan', 'abs', 'ln', 'e', 'sqrt'].filter(op => !lockedElements.includes(op));
        const canFloat = !lockedElements.includes('.');
        const canAdd = availableOps.includes('+');
        const canSub = availableOps.includes('-');

        console.log("[AI] 可用运算符:", availableOps);

        // 读取训练好的神经记忆池作为突变起点
        const state = this.gameController.getGameState();
        const diff = state.difficulty;
        let memory = { best_functions: ['x', 'x^2', 'sin(x)'] };
        try {
            const raw = localStorage.getItem(`summa_model_v2_${diff}`);
            if (raw) memory = JSON.parse(raw);
            if (!memory.best_functions || memory.best_functions.length === 0) memory.best_functions = ['x'];
        } catch (e) { } // eslint-disable-line no-empty

        // 提取候选核心基因
        let candidateCores = [];
        // 从记忆池中抓取最多 20 个基因
        for (let j = 0; j < 20; j++) {
            candidateCores.push(memory.best_functions[Math.floor(Math.random() * memory.best_functions.length)]);
        }
        // 始终混入基础退火解（确保在极度恶劣的条件下有解）
        candidateCores.push('x', 'x^2', 'sin(x)');

        let bestExpr = 'x';
        let maxHits = -1;

        // 内层突变20次（与外层共同构成 10000 次求值）
        for (let j = 0; j < 20; j++) {
            this.lastThinkCount++;

            // 只保留允许使用的 Core
            let cores = candidateCores.filter(c => this.isValidExpression(c, lockedElements));
            if (cores.length === 0) break;

            let expr = this.buildExpression(cores, availableOps, canFloat, targetCells[0]);
            if (!expr || !this.isValidExpression(expr, lockedElements)) continue;

            const hitCount = this.countTargetHits(expr, targetCells, forbiddenCells);

            // 优先选择命中数高的，如果命中数一样，优先选择字符更短的（更简单的公式）
            if (hitCount > maxHits || (hitCount === maxHits && expr.length < bestExpr.length)) {
                maxHits = hitCount;
                bestExpr = expr;
            }

            // 这里我们不再提前 return expr，因为我们需要靠外层的“真实物理引擎”来做绝对检查！
            // 提前返回可能会返回一个过长或者撞禁区的假阳性结果。我们让其跑完 20 次，筛选出短且命中的。
        }

        return bestExpr;
    }

    buildExpression(cores, availableOps, canFloat, target) {
        let core = cores[Math.floor(Math.random() * cores.length)];
        if (!target) return core;

        let tx = target.x + 0.5;
        let ty = target.y + 0.5;

        // 如果没有加减法
        if (!availableOps.includes('+') && !availableOps.includes('-')) {
            let evaluateCore = this.evaluateFunction(core, tx);
            if (Math.abs(evaluateCore) > 0.001 && evaluateCore !== Infinity) {
                let A = ty / evaluateCore;
                A = canFloat ? parseFloat(A.toFixed(1)) : Math.round(A);
                if (A === 0) A = 1;
                if (A === 1) return core;
                return `${A}*(${core})`;
            }
            return core;
        }

        // 正常平移运算 y = A * core(x - B) + C
        let A = canFloat ? parseFloat((Math.random() * 4 - 2).toFixed(1)) : Math.round(Math.random() * 4 - 2);
        if (A === 0) A = 1;

        let B = Math.round(tx);
        let x_replacement = 'x';

        // 我们只在可用相应的运算符时偏移中心点
        if (B > 0 && availableOps.includes('-')) x_replacement = `x-${B}`;
        else if (B < 0 && availableOps.includes('+')) x_replacement = `x+${-B}`;

        let modCore = core;
        if (x_replacement !== 'x') {
            // 安全匹配：不仅避免双重括号 ((x-B)) 的崩溃，也替换所有的 x
            if (core === 'x') modCore = `(${x_replacement})`;
            else {
                modCore = core.replace(/x/g, `(${x_replacement})`)
                    .replace(/\(\(/g, '(')
                    .replace(/\)\)/g, ')');
            }
        }

        let evaluateCore = this.evaluateFunction(modCore, tx);
        if (evaluateCore === Infinity || isNaN(evaluateCore)) return null;

        let C = ty - A * evaluateCore;
        C = canFloat ? parseFloat(C.toFixed(1)) : Math.round(C);

        if (Math.abs(C) > 50) return null; // 截距如果太夸张就算了

        let finalExpr = modCore;
        if (A !== 1) {
            finalExpr = `${A}*${modCore.startsWith('(') ? modCore : `(${modCore})`}`;
            finalExpr = finalExpr.replace(/\(\(/g, '(').replace(/\)\)/g, ')');
        }

        if (C > 0 && availableOps.includes('+')) return `${finalExpr}+${C}`;
        else if (C < 0 && availableOps.includes('-')) return `${finalExpr}${C}`;

        return finalExpr;
    }

    evaluateFunction(expr_str, x_val) {
        try {
            return this.parser.evaluate(expr_str, x_val);
            // eslint-disable-next-line no-unused-vars
        } catch (e) {
            return Infinity;
        }
    }

    /**
     * 构造穿过单个目标格的函数
     */
    constructSingleTargetFunction(tx, ty, targetCells, forbiddenCells, lockedElements, strategy) {
        const attempts = 20;
        const difficulty = this.gameController.difficulty;
        const decimalLocked = lockedElements.includes('.');

        for (let i = 0; i < attempts; i++) {
            let expression = null;

            // 根据难度选择不同的函数类型概率
            const funcType = this.selectFunctionTypeByDifficulty(difficulty, strategy);

            switch (funcType) {
                case 0: // 常值函数 y = c
                    expression = `${Math.round(ty)}`;
                    break;

                case 1: // 一次函数 y = ax + b
                    if (decimalLocked) {
                        // 小数点被锁定：使用整数斜率和截距
                        // 先尝试精确计算
                        const a1 = Math.round((Math.random() * 4 - 2));
                        const b1 = Math.round(ty - a1 * tx);

                        // 检查截距是否合理
                        if (Math.abs(b1) <= 20) {
                            expression = this.formatLinearExpression(a1.toString(), b1.toString());
                        } else {
                            // 截距太大，使用随机整数
                            const a_rand = Math.round(Math.random() * 2 - 1);
                            const b_rand = Math.round(ty - a_rand * tx);
                            expression = this.formatLinearExpression(a_rand.toString(), b_rand.toString());
                        }
                    } else {
                        const a1 = (Math.random() * 4 - 2).toFixed(1);
                        const b1 = (ty - parseFloat(a1) * tx).toFixed(1);
                        expression = this.formatLinearExpression(a1, b1);
                    }
                    break;

                case 2: // 二次函数 y = a(x-h)^2 + k
                    if (decimalLocked) {
                        // 小数点被锁定：使用整数参数，精确计算
                        const h = Math.round(tx + Math.random() * 4 - 2);
                        const k = Math.round(ty);
                        const dx = tx - h;
                        let a;

                        if (Math.abs(dx) > 0.1) {
                            // 精确计算a
                            a = Math.round((ty - k) / Math.pow(dx, 2));
                            if (Math.abs(a) < 0.1 || isNaN(a) || a === 0) {
                                a = Math.round(Math.random() * 2 - 1);
                                if (a === 0) a = 1;
                            }
                            if (Math.abs(a) > 5) {
                                a = a > 0 ? 5 : -5;
                            }
                        } else {
                            a = Math.round(Math.random() * 2 - 1);
                            if (a === 0) a = 1;
                        }

                        expression = `${a}*(x-${h})^2+${k}`;
                    } else {
                        const h = (tx + Math.random() * 4 - 2).toFixed(1);
                        const k = (ty - Math.random() * 2).toFixed(1);
                        const a2 = (Math.random() * 2 - 1).toFixed(1);
                        expression = `${a2}*(x-${h})^2+${k}`;
                    }
                    break;

                case 3: // 三次函数 y = a(x-h)^3 + k
                    if (decimalLocked) {
                        // 小数点被锁定：使用整数参数，精确计算
                        const h3 = Math.round(tx + Math.random() * 2 - 1);
                        const k3 = Math.round(ty);
                        const dx = tx - h3;
                        let a3;

                        if (Math.abs(dx) > 0.1) {
                            // 精确计算a3使得函数穿过目标点
                            a3 = Math.round((ty - k3) / Math.pow(dx, 3));
                            // 如果a3太小或为0，调整
                            if (Math.abs(a3) < 0.1 || isNaN(a3) || a3 === 0) {
                                a3 = Math.round(Math.random() * 2 - 1);
                                if (a3 === 0) a3 = 1;
                            }
                            // 如果a3太大，限制范围
                            if (Math.abs(a3) > 5) {
                                a3 = a3 > 0 ? 5 : -5;
                            }
                        } else {
                            // dx太小，使用随机整数
                            a3 = Math.round(Math.random() * 2 - 1);
                            if (a3 === 0) a3 = 1;
                        }

                        expression = `${a3}*(x-${h3})^3+${k3}`;
                    } else {
                        const h3 = (tx + Math.random() * 2 - 1).toFixed(1);
                        const k3 = (ty - Math.random()).toFixed(1);
                        const a3 = (Math.random() * 1 - 0.5).toFixed(2);
                        expression = `${a3}*(x-${h3})^3+${k3}`;
                    }
                    break;

                case 4: // 高次函数 y = a*sin(bx) + c 或 a*|x-h|^n + k
                    if (decimalLocked) {
                        if (Math.random() < 0.5) {
                            // 三角函数，使用整数参数
                            const a4 = Math.round(Math.random() * 3 + 1);
                            const b4 = Math.round(Math.random() * 2 + 1);
                            const c4 = Math.round(ty);
                            expression = `${a4}*sin(${b4}*x)+${c4}`;
                        } else {
                            // 高次绝对值，使用整数
                            const h5 = Math.round(tx);
                            const k5 = Math.round(ty);
                            const a5 = Math.round(Math.random() * 2 + 1);
                            const n5 = difficulty === 'expert' ? '3' : '2';
                            expression = `${a5}*abs(x-${h5})^${n5}+${k5}`;
                        }
                    } else {
                        if (Math.random() < 0.5) {
                            // 三角函数
                            const a4 = (Math.random() * 3 + 1).toFixed(1);
                            const b4 = (Math.random() * 2 + 0.5).toFixed(1);
                            const c4 = ty.toFixed(1);
                            expression = `${a4}*sin(${b4}*x)+${c4}`;
                        } else {
                            // 高次绝对值
                            const h5 = tx.toFixed(1);
                            const k5 = ty.toFixed(1);
                            const a5 = (Math.random() * 2 + 0.5).toFixed(1);
                            const n5 = difficulty === 'expert' ? '3' : '2';
                            expression = `${a5}*abs(x-${h5})^${n5}+${k5}`;
                        }
                    }
                    break;

                case 5: // 分式函数 y = a/x + b
                    if (decimalLocked) {
                        const a = Math.round(Math.random() * 4 + 1);
                        const b = Math.round(ty - a / tx);
                        expression = `${a}/x+${b}`;
                    } else {
                        const a = (Math.random() * 4 + 1).toFixed(1);
                        const b = (ty - parseFloat(a) / tx).toFixed(1);
                        expression = `${a}/x+${b}`;
                    }
                    break;

                case 6: // 绝对值函数 y = a*|x-h| + k
                    if (decimalLocked) {
                        // 小数点被锁定：使用整数参数，精确计算
                        const h = Math.round(tx);
                        const k = Math.round(ty);
                        const dx = Math.abs(tx - h);
                        let a;

                        if (dx > 0.1) {
                            // 精确计算a
                            a = Math.round((ty - k) / dx);
                            if (Math.abs(a) < 0.1 || isNaN(a) || a === 0) {
                                a = Math.round(Math.random() * 4 - 2);
                                if (a === 0) a = 1;
                            }
                            if (Math.abs(a) > 5) {
                                a = a > 0 ? 5 : -5;
                            }
                        } else {
                            a = Math.round(Math.random() * 4 - 2);
                            if (a === 0) a = 1;
                        }

                        expression = `${a}*abs(x-${h})+${k}`;
                    } else {
                        const h = tx.toFixed(1);
                        const k = ty.toFixed(1);
                        const a = (Math.random() * 4 - 2).toFixed(1);
                        expression = `${a}*abs(x-${h})+${k}`;
                    }
                    break;

                case 7: // 三角函数 y = a*sin(bx) + c 或 a*cos(bx) + c 或 tan
                    if (decimalLocked) {
                        const a = Math.round(Math.random() * 3 + 1);
                        const b = Math.round(Math.random() * 2 + 1);
                        const c = Math.round(ty);
                        const funcs = ['sin', 'cos', 'tan'];
                        const trigFunc = funcs[Math.floor(Math.random() * funcs.length)];
                        expression = `${a}*${trigFunc}(${b}*x)+${c}`;
                    } else {
                        const a = (Math.random() * 3 + 1).toFixed(1);
                        const b = (Math.random() * 2 + 0.5).toFixed(1);
                        const c = ty.toFixed(1);
                        const funcs = ['sin', 'cos', 'tan'];
                        const trigFunc = funcs[Math.floor(Math.random() * funcs.length)];
                        expression = `${a}*${trigFunc}(${b}*x)+${c}`;
                    }
                    break;

                case 8: // 四次函数 y = a(x-h)^4 + k
                    if (decimalLocked) {
                        // 将h设置在tx附近，确保穿过目标
                        const h = Math.round(tx);
                        // k设置为ty，确保当x=h时y=k
                        const k = Math.round(ty);
                        // 计算a使得函数在tx处穿过ty
                        const dx = tx - h;
                        let a;
                        if (Math.abs(dx) > 0.1) {
                            a = Math.round((ty - k) / Math.pow(dx, 4));
                            // 如果a太小或太大，调整k
                            if (Math.abs(a) > 3 || Math.abs(a) < 0.1 || isNaN(a)) {
                                a = Math.round(Math.random() * 2 - 1);
                                if (a === 0) a = 1;
                            }
                        } else {
                            a = Math.round(Math.random() * 2 - 1);
                            if (a === 0) a = 1;
                        }
                        expression = `${a}*(x-${h})^4+${k}`;
                    } else {
                        const h = (tx + (Math.random() * 2 - 1)).toFixed(1);
                        const k = ty.toFixed(1);
                        const dx = tx - parseFloat(h);
                        let a;
                        if (Math.abs(dx) > 0.1) {
                            a = (ty - parseFloat(k)) / Math.pow(dx, 4);
                            if (Math.abs(a) > 3 || Math.abs(a) < 0.1 || isNaN(a)) {
                                a = (Math.random() * 2 - 1);
                                if (Math.abs(a) < 0.1) a = a > 0 ? 0.5 : -0.5;
                            } else {
                                a = a.toFixed(2);
                            }
                        } else {
                            a = (Math.random() * 2 - 1).toFixed(2);
                            if (Math.abs(parseFloat(a)) < 0.1) a = '0.5';
                        }
                        expression = `${a}*(x-${h})^4+${k}`;
                    }
                    break;

                case 9: // log/ln函数 y = a*ln(bx) + c 或 a*log(bx) + c
                    if (decimalLocked) {
                        const a = Math.round(Math.random() * 2 + 1);
                        const b = Math.round(Math.random() + 1);
                        const c = Math.round(ty - a * Math.log(b * Math.abs(tx)));
                        const logFunc = Math.random() < 0.5 ? 'ln' : 'log';
                        if (Math.abs(c) <= 20) {
                            expression = `${a}*${logFunc}(${b}*x)+${c}`;
                        }
                    } else {
                        const a = (Math.random() * 2 + 1).toFixed(1);
                        const b = (Math.random() + 0.5).toFixed(1);
                        const c = (ty - parseFloat(a) * Math.log(parseFloat(b) * Math.abs(tx))).toFixed(1);
                        const logFunc = Math.random() < 0.5 ? 'ln' : 'log';
                        if (Math.abs(parseFloat(c)) <= 20) {
                            expression = `${a}*${logFunc}(${b}*x)+${c}`;
                        }
                    }
                    break;

                case 10: // 指数函数 y = a*e^(bx) + c
                    if (decimalLocked) {
                        const a = Math.round(Math.random() * 2 + 1);
                        const b = Math.round(Math.random() * 2 - 1);
                        const c = Math.round(ty - a * Math.exp(b * tx));
                        if (Math.abs(c) <= 20 && Math.abs(b) <= 2) {
                            expression = `${a}*exp(${b}*x)+${c}`;
                        }
                    } else {
                        const a = (Math.random() * 2 + 1).toFixed(1);
                        const b = (Math.random() * 2 - 1).toFixed(1);
                        const c = (ty - parseFloat(a) * Math.exp(parseFloat(b) * tx)).toFixed(1);
                        if (Math.abs(parseFloat(c)) <= 20) {
                            expression = `${a}*exp(${b}*x)+${c}`;
                        }
                    }
                    break;

                case 11: // 高次绝对值 y = a*|x-h|^n + k (n>=4)
                    if (decimalLocked) {
                        const h = Math.round(tx);
                        const k = Math.round(ty);
                        const n = difficulty === 'expert' ? 4 : 3;
                        const dx = Math.abs(tx - h);
                        let a;
                        if (dx > 0.1) {
                            a = Math.round(Math.abs(ty - k) / Math.pow(dx, n));
                            if (a > 3 || a < 0.1 || isNaN(a) || a === 0) {
                                a = Math.round(Math.random() * 2 + 1);
                            }
                        } else {
                            a = Math.round(Math.random() * 2 + 1);
                        }
                        expression = `${a}*abs(x-${h})^${n}+${k}`;
                    } else {
                        const h = tx.toFixed(1);
                        const k = ty.toFixed(1);
                        const n = difficulty === 'expert' ? 4 : 3;
                        const dx = Math.abs(tx - parseFloat(h));
                        let a;
                        if (dx > 0.1) {
                            a = Math.abs(ty - parseFloat(k)) / Math.pow(dx, n);
                            if (a > 3 || a < 0.1 || isNaN(a)) {
                                a = (Math.random() * 2 + 1).toFixed(1);
                            } else {
                                a = a.toFixed(2);
                            }
                        } else {
                            a = (Math.random() * 2 + 1).toFixed(1);
                        }
                        expression = `${a}*abs(x-${h})^${n}+${k}`;
                    }
                    break;

                case 12: // 五次函数 y = a(x-h)^5 + k
                    if (decimalLocked) {
                        const h = Math.round(tx);
                        const k = Math.round(ty);
                        const dx = tx - h;
                        let a;
                        if (Math.abs(dx) > 0.1) {
                            a = Math.round((ty - k) / Math.pow(dx, 5));
                            if (Math.abs(a) > 2 || Math.abs(a) < 0.05 || isNaN(a) || a === 0) {
                                a = Math.round(Math.random() * 2 - 1);
                                if (a === 0) a = 1;
                            }
                        } else {
                            a = Math.round(Math.random() * 2 - 1);
                            if (a === 0) a = 1;
                        }
                        expression = `${a}*(x-${h})^5+${k}`;
                    } else {
                        const h = (tx + (Math.random() * 2 - 1)).toFixed(1);
                        const k = ty.toFixed(1);
                        const dx = tx - parseFloat(h);
                        let a;
                        if (Math.abs(dx) > 0.1) {
                            a = (ty - parseFloat(k)) / Math.pow(dx, 5);
                            if (Math.abs(a) > 2 || Math.abs(a) < 0.05 || isNaN(a)) {
                                a = (Math.random() * 2 - 1);
                                if (Math.abs(a) < 0.05) a = a > 0 ? 0.5 : -0.5;
                            } else {
                                a = a.toFixed(3);
                            }
                        } else {
                            a = (Math.random() * 2 - 1).toFixed(3);
                            if (Math.abs(parseFloat(a)) < 0.05) a = '0.5';
                        }
                        expression = `${a}*(x-${h})^5+${k}`;
                    }
                    break;
            }

            if (expression && this.isValidExpression(expression, lockedElements)) {
                console.log(`[AI] 尝试函数: ${expression}`);
                if (this.checkFunctionHitsTarget(expression, targetCells, forbiddenCells)) {
                    console.log(`[AI] 找到有效函数: ${expression}`);
                    return expression;
                }
            }
        }

        return null;
    }

    /**
     * 根据难度选择函数类型
     */
    selectFunctionTypeByDifficulty(difficulty, strategy) {
        const rand = Math.random();

        switch (difficulty) {
            case 'easy':
                // 简单模式：70%一次函数，20%常值，10%二次
                if (rand < 0.7) return 1; // 一次函数
                if (rand < 0.9) return 0; // 常值函数
                return 2; // 二次函数

            case 'normal':
                // 普通模式：优先2次函数、分式函数、绝对值函数
                // 30%二次函数，25%分式函数(1/x)，25%绝对值函数，20%一次函数
                if (rand < 0.30) return 2; // 二次函数
                if (rand < 0.55) return 5; // 分式函数 (1/x类型)
                if (rand < 0.80) return 6; // 绝对值函数
                return 1; // 一次函数

            case 'hard':
                // 困难模式：优先3次函数、三角函数
                // 45%三次函数，25%三角函数，15%二次函数，10%绝对值函数，5%高次绝对值
                if (rand < 0.45) return 3; // 三次函数
                if (rand < 0.70) return 7; // 三角函数 (sin/cos/tan)
                if (rand < 0.85) return 2; // 二次函数
                if (rand < 0.95) return 6; // 绝对值函数
                return 11; // 高次绝对值 (3次)

            case 'expert':
                // 专家模式：优先4次+函数、!、log、ln等特殊函数
                // 25%四次函数，20%log/ln函数，20%三角函数，15%指数函数，10%高次绝对值，10%五次函数
                if (rand < 0.25) return 8; // 四次函数
                if (rand < 0.45) return 9; // log/ln函数
                if (rand < 0.65) return 7; // 三角函数
                if (rand < 0.80) return 10; // 指数函数 (exp)
                if (rand < 0.90) return 11; // 高次绝对值 (4次+)
                return 12; // 五次函数

            default:
                return Math.floor(Math.random() * Math.min(strategy.functionComplexity + 1, 5));
        }
    }

    /**
     * 构造穿过多个目标格的函数（困难/专家模式）
     */
    constructMultiTargetFunction(targetCells, forbiddenCells, lockedElements, strategy) {
        const attempts = 100;  // 增加尝试次数从30到100
        const difficulty = this.gameController.difficulty;
        const decimalLocked = lockedElements.includes('.');

        for (let i = 0; i < attempts; i++) {
            let expression = null;

            // 根据难度选择函数类型
            const funcType = this.selectFunctionTypeByDifficulty(difficulty, strategy);

            // 随机选择2-3个目标格
            const numTargets = Math.min(Math.floor(Math.random() * 2) + 2, targetCells.length);
            const selectedTargets = this.selectRandomTargets(targetCells, numTargets);

            if (selectedTargets.length < 2) continue;

            const t1 = selectedTargets[0];
            const t2 = selectedTargets[1];
            const x1 = t1.x + 0.5;
            const y1 = t1.y + 0.5;
            const x2 = t2.x + 0.5;
            const y2 = t2.y + 0.5;

            console.log(`[AI] 尝试穿过 ${numTargets} 个目标格`);

            // 检测是否在同一列（x坐标相同或非常接近）
            const isSameColumn = Math.abs(x2 - x1) < 0.1;

            if (isSameColumn) {
                console.log('[AI] 检测到目标格在同一列，使用陡坡函数');
                // 同一列：使用高次陡坡函数，如 x^n * 大系数
                // 这样可以穿过同一列的多个格子
                const x = x1;
                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);

                // 尝试不同的陡坡函数
                for (let attempt = 0; attempt < 5; attempt++) {
                    let steepExpr = null;

                    if (decimalLocked) {
                        // 小数点锁定：使用整数
                        const n = 4 + Math.floor(Math.random() * 2); // 4次或5次
                        const a = Math.round(Math.random() * 20 + 10); // 大系数 10-30
                        const sign = Math.random() < 0.5 ? 1 : -1;
                        const finalA = a * sign;

                        steepExpr = `${finalA}*(x-${Math.round(x)})^${n}`;
                    } else {
                        // 可以使用小数
                        const n = 4 + Math.floor(Math.random() * 2); // 4次或5次
                        const a = (Math.random() * 20 + 10).toFixed(1); // 10.0-30.0
                        const sign = Math.random() < 0.5 ? '' : '-';

                        steepExpr = `${sign}${a}*(x-${x.toFixed(1)})^${n}`;
                    }

                    if (this.isValidExpression(steepExpr, lockedElements)) {
                        // 验证是否穿过目标
                        const hitCount = this.countTargetHits(steepExpr, targetCells, forbiddenCells);
                        if (hitCount >= 2) {
                            console.log(`[AI] 找到陡坡函数: ${steepExpr}，穿过 ${hitCount} 个目标格`);
                            return steepExpr;
                        }
                    }
                }

                // 如果陡坡函数失败，尝试简单的x = 常数的近似
                // 由于函数不能表示x=c，我们用一个非常陡的一次函数
                if (decimalLocked) {
                    const steepSlope = 100; // 非常大的斜率
                    const intercept = Math.round(y1 - steepSlope * x1);
                    expression = `${steepSlope}*x+${intercept}`;
                } else {
                    const steepSlope = 100;
                    const intercept = (y1 - steepSlope * x1).toFixed(1);
                    expression = `${steepSlope}*x+${intercept}`;
                }

                if (this.isValidExpression(expression, lockedElements)) {
                    console.log(`[AI] 使用陡坡一次函数: ${expression}`);
                    return expression;
                }

                // 如果都失败，继续尝试普通函数
                console.log('[AI] 陡坡函数失败，尝试普通函数');
            }

            switch (funcType) {
                case 0: // 常值函数：只适合同一水平线的目标
                    if (Math.abs(y1 - y2) < 0.5) {
                        expression = `${Math.round((y1 + y2) / 2)}`;
                    }
                    break;

                case 1: // 一次函数：穿过两点
                    if (decimalLocked) {
                        // 使用整数斜率
                        const slope = Math.round((y2 - y1) / (x2 - x1));
                        const intercept = Math.round(y1 - slope * x1);
                        if (Math.abs(slope) <= 5 && Math.abs(intercept) <= 20) {
                            expression = this.formatLinearExpression(slope.toString(), intercept.toString());
                        }
                    } else {
                        const slope = (y2 - y1) / (x2 - x1);
                        const intercept = y1 - slope * x1;
                        if (Math.abs(slope) <= 5 && Math.abs(intercept) <= 20) {
                            const a = slope.toFixed(1);
                            const b = intercept.toFixed(1);
                            expression = this.formatLinearExpression(a, b);
                        }
                    }
                    break;

                case 2: // 二次函数
                    if (decimalLocked) {
                        const h = Math.round((x1 + x2) / 2);
                        const k = Math.round(Math.min(y1, y2) - 1);
                        const a = Math.round((y1 - k) / Math.pow(x1 - h, 2));
                        if (Math.abs(a) <= 3 && !isNaN(a) && a !== 0) {
                            expression = `${a}*(x-${h})^2+${k}`;
                        }
                    } else {
                        const h = (x1 + x2) / 2;
                        const k = Math.min(y1, y2) - Math.random();
                        const a = (y1 - k) / Math.pow(x1 - h, 2);
                        if (Math.abs(a) <= 3 && !isNaN(a)) {
                            expression = `${a.toFixed(1)}*(x-${h.toFixed(1)})^2+${k.toFixed(1)}`;
                        }
                    }
                    break;

                case 3: // 三次函数
                    if (decimalLocked) {
                        const h3 = Math.round((x1 + x2) / 2);
                        const k3 = Math.round(y1);
                        const a3 = Math.round((y2 - y1) / Math.pow(x2 - x1, 3));
                        if (Math.abs(a3) <= 2 && !isNaN(a3) && a3 !== 0) {
                            expression = `${a3}*(x-${h3})^3+${k3}`;
                        }
                    } else {
                        const h3 = (x1 + x2) / 2;
                        const k3 = y1;
                        const a3 = (y2 - y1) / Math.pow(x2 - x1, 3);
                        if (Math.abs(a3) <= 2 && !isNaN(a3)) {
                            expression = `${a3.toFixed(2)}*(x-${h3.toFixed(1)})^3+${k3.toFixed(1)}`;
                        }
                    }
                    break;

                case 4: // 高次函数
                    if (decimalLocked) {
                        if (Math.random() < 0.5) {
                            // 三角函数，使用整数
                            const avgY = Math.round((y1 + y2) / 2);
                            const amplitude = Math.round(Math.abs(y2 - y1) / 2 + 1);
                            const freq = Math.round(Math.random() + 1);
                            expression = `${amplitude}*sin(${freq}*x)+${avgY}`;
                        } else {
                            // 高次绝对值，使用整数
                            const hv = Math.round((x1 + x2) / 2);
                            const kv = Math.round(Math.min(y1, y2) - 1);
                            const av = Math.round(Math.abs(y1 - kv) / Math.pow(Math.abs(x1 - hv), difficulty === 'expert' ? 3 : 2));
                            if (av <= 2 && !isNaN(av) && av !== 0) {
                                const n = difficulty === 'expert' ? '3' : '2';
                                expression = `${av}*abs(x-${hv})^${n}+${kv}`;
                            }
                        }
                    } else {
                        if (Math.random() < 0.5) {
                            // 三角函数
                            const avgY = (y1 + y2) / 2;
                            const amplitude = Math.abs(y2 - y1) / 2 + 1;
                            const freq = (Math.random() + 0.5).toFixed(1);
                            expression = `${amplitude.toFixed(1)}*sin(${freq}*x)+${avgY.toFixed(1)}`;
                        } else {
                            // 高次绝对值
                            const hv = (x1 + x2) / 2;
                            const kv = Math.min(y1, y2) - 0.5;
                            const av = Math.abs(y1 - kv) / Math.pow(Math.abs(x1 - hv), difficulty === 'expert' ? 3 : 2);
                            if (av <= 2 && !isNaN(av)) {
                                const n = difficulty === 'expert' ? 3 : 2;
                                expression = `${av.toFixed(1)}*abs(x-${hv.toFixed(1)})^${n}+${kv.toFixed(1)}`;
                            }
                        }
                    }
                    break;

                case 5: // 分式函数 y = a/x + b (不适合多目标)
                    // 分式函数很难同时穿过两个点，跳过
                    break;

                case 6: // 绝对值函数 y = a*|x-h| + k
                    if (decimalLocked) {
                        const h = Math.round((x1 + x2) / 2);
                        const k = Math.round(Math.min(y1, y2));
                        const a = Math.round((y1 - k) / Math.abs(x1 - h));
                        if (Math.abs(a) <= 5 && !isNaN(a) && a !== 0) {
                            expression = `${a}*abs(x-${h})+${k}`;
                        }
                    } else {
                        const h = (x1 + x2) / 2;
                        const k = Math.min(y1, y2);
                        const a = (y1 - k) / Math.abs(x1 - h);
                        if (Math.abs(a) <= 5 && !isNaN(a)) {
                            expression = `${a.toFixed(1)}*abs(x-${h.toFixed(1)})+${k.toFixed(1)}`;
                        }
                    }
                    break;

                case 7: // 三角函数
                    if (decimalLocked) {
                        const avgY = Math.round((y1 + y2) / 2);
                        const amplitude = Math.round(Math.abs(y2 - y1) / 2 + 1);
                        const freq = Math.round(Math.random() + 1);
                        const trigFunc = Math.random() < 0.5 ? 'sin' : 'cos';
                        expression = `${amplitude}*${trigFunc}(${freq}*x)+${avgY}`;
                    } else {
                        const avgY = (y1 + y2) / 2;
                        const amplitude = Math.abs(y2 - y1) / 2 + 1;
                        const freq = (Math.random() + 0.5).toFixed(1);
                        const trigFunc = Math.random() < 0.5 ? 'sin' : 'cos';
                        expression = `${amplitude.toFixed(1)}*${trigFunc}(${freq}*x)+${avgY.toFixed(1)}`;
                    }
                    break;

                case 8: // 四次函数
                    if (decimalLocked) {
                        const h = Math.round((x1 + x2) / 2);
                        const k = Math.round(Math.min(y1, y2) - 1);
                        const a = Math.round((y1 - k) / Math.pow(x1 - h, 4));
                        if (Math.abs(a) <= 2 && !isNaN(a) && a !== 0) {
                            expression = `${a}*(x-${h})^4+${k}`;
                        }
                    } else {
                        const h = (x1 + x2) / 2;
                        const k = Math.min(y1, y2) - Math.random();
                        const a = (y1 - k) / Math.pow(x1 - h, 4);
                        if (Math.abs(a) <= 2 && !isNaN(a)) {
                            expression = `${a.toFixed(2)}*(x-${h.toFixed(1)})^4+${k.toFixed(1)}`;
                        }
                    }
                    break;

                case 9: // log/ln函数 (不适合多目标)
                    // log函数很难同时穿过两个点，跳过
                    break;

                case 10: // 指数函数 (不适合多目标)
                    // 指数函数很难同时穿过两个点，跳过
                    break;

                case 11: // 高次绝对值 y = a*|x-h|^n + k (n>=4)
                    if (decimalLocked) {
                        const h = Math.round((x1 + x2) / 2);
                        const k = Math.round(Math.min(y1, y2) - 1);
                        const n = difficulty === 'expert' ? 4 : 3;
                        const a = Math.round(Math.abs(y1 - k) / Math.pow(Math.abs(x1 - h), n));
                        if (a <= 2 && !isNaN(a) && a !== 0) {
                            expression = `${a}*abs(x-${h})^${n}+${k}`;
                        }
                    } else {
                        const h = (x1 + x2) / 2;
                        const k = Math.min(y1, y2) - 0.5;
                        const n = difficulty === 'expert' ? 4 : 3;
                        const a = Math.abs(y1 - k) / Math.pow(Math.abs(x1 - h), n);
                        if (a <= 2 && !isNaN(a)) {
                            expression = `${a.toFixed(2)}*abs(x-${h.toFixed(1)})^${n}+${k.toFixed(1)}`;
                        }
                    }
                    break;

                case 12: // 五次函数
                    if (decimalLocked) {
                        const h = Math.round((x1 + x2) / 2);
                        const k = Math.round((y1 + y2) / 2);
                        const a = Math.round((y1 - y2) / Math.pow(x1 - x2, 5));
                        if (Math.abs(a) <= 1 && !isNaN(a) && a !== 0) {
                            expression = `${a}*(x-${h})^5+${k}`;
                        }
                    } else {
                        const h = (x1 + x2) / 2;
                        const k = (y1 + y2) / 2;
                        const a = (y1 - y2) / Math.pow(x1 - x2, 5);
                        if (Math.abs(a) <= 1 && !isNaN(a)) {
                            expression = `${a.toFixed(3)}*(x-${h.toFixed(1)})^5+${k.toFixed(1)}`;
                        }
                    }
                    break;
            }

            if (expression && this.isValidExpression(expression, lockedElements)) {
                console.log(`[AI] 尝试多目标函数: ${expression}`);
                const hitCount = this.countTargetHits(expression, targetCells, forbiddenCells);
                if (hitCount >= 2) {
                    console.log(`[AI] 找到有效多目标函数: ${expression}，穿过 ${hitCount} 个目标格`);
                    return expression;
                }
            }
        }

        return null;
    }

    /**
     * 随机选择N个目标格
     */
    selectRandomTargets(targetCells, count) {
        const shuffled = [...targetCells].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    /**
     * 计算函数穿过多少个目标格
     */
    countTargetHits(expression, targetCells, forbiddenCells) {
        let hitCount = 0;

        for (const target of targetCells) {
            const tx = target.x + 0.5;
            const ty = target.y + 0.5;
            const y = this.parser.evaluate(expression, tx);

            if (y === null) continue;

            const distanceToCenter = Math.abs(y - ty);
            if (distanceToCenter < 0.5) {
                hitCount++;
            }
        }

        return hitCount;
    }

    /**
     * 格式化一次函数表达式
     */
    formatLinearExpression(a, b) {
        const aNum = parseFloat(a);
        const bNum = parseFloat(b);

        // 简化表达式
        if (aNum === 1 && bNum === 0) return 'x';
        if (aNum === 1) return `x+${b}`;
        if (aNum === -1) return `-x+${b}`;
        if (bNum === 0) return `${a}*x`;
        if (bNum > 0) return `${a}*x+${b}`;
        return `${a}*x-${Math.abs(bNum)}`;
    }

    /**
     * 验证表达式是否包含被锁定的元素
     */
    isValidExpression(expression, lockedElements) {
        for (const locked of lockedElements) {
            if (expression.includes(locked)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 检查函数是否穿过目标格且不进入禁区
     * 注意：擦边（仅接触边界）是无效的，必须真正进入目标格内部
     */
    checkFunctionHitsTarget(expression, targetCells, forbiddenCells) {
        try {
            // 严格检查：必须穿过目标格的中心区域（不是边缘）
            for (const target of targetCells) {
                const tx = target.x + 0.5; // 目标格中心x
                const ty = target.y + 0.5; // 目标格中心y
                const y = this.parser.evaluate(expression, tx);

                if (y === null) return false;

                // 严格检查：函数值必须接近目标格中心（误差 < 0.5）
                // 这确保函数真正穿过目标格内部，而不是擦边
                const distanceToCenter = Math.abs(y - ty);
                if (distanceToCenter < 0.5) {
                    console.log(`[AI] 函数穿过目标格 (${target.x}, ${target.y}) 中心，距离=${distanceToCenter.toFixed(2)}`);

                    // 检查是否进入禁区
                    for (const forbidden of forbiddenCells) {
                        const fx = forbidden.x + 0.5;
                        const fy = this.parser.evaluate(expression, fx);
                        if (fy !== null && Math.abs(fy - (forbidden.y + 0.5)) < 0.5) {
                            console.log(`[AI] 函数进入禁区 (${forbidden.x}, ${forbidden.y})`);
                            return false; // 进入禁区
                        }
                    }
                    return true; // 穿过目标格且未进入禁区
                } else {
                    console.log(`[AI] 函数未穿过目标格 (${target.x}, ${target.y})，距离=${distanceToCenter.toFixed(2)} (>=0.5)`);
                }
            }
        } catch (error) {
            console.error('[AI] 检查函数时出错:', error);
            return false;
        }

        return false;
    }

    /**
     * 提交表达式（逐个元素显示，体现思考过程）
     */
    async submitExpression(expression) {
        console.log('[AI] 准备提交表达式:', expression);

        // 验证表达式不为空
        if (!expression || expression.trim() === '') {
            console.error('[AI] 表达式为空！');
            expression = 'x';
        }

        if (!this.uiController) {
            console.error('[AI] 没有 UIController 引用！');
            this.gameController.submitFunction(expression);
            return;
        }

        console.log('[AI] 通过 UIController 提交，逐个元素显示');

        // 将表达式拆分为元素
        const tokens = this.tokenizeExpression(expression);

        // 先清空输入框，防止上一回合残留内容
        this.uiController.expressionElements = [];
        this.uiController.cursorIndex = 0;
        this.uiController.updateExpressionDisplay();

        /*
        // 在 UI 测试泡泡上显示调试信息（推演了多少次）
        if (window.summaCharacter && this.lastThinkCount) {
            window.summaCharacter.messageBox.textContent = `[深度演算了 ${this.lastThinkCount} 次]`;
            window.summaCharacter.messageBox.classList.add('visible');
        }
        */

        // 逐个添加元素，模拟思考过程
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // 添加当前元素
            this.uiController.expressionElements.push(token);
            this.uiController.cursorIndex = this.uiController.expressionElements.length;
            this.uiController.updateExpressionDisplay();

            console.log(`[AI] 输入元素 ${i + 1}/${tokens.length}: ${token}`);

            // 每个元素之间延迟，体现思考过程
            const delay = 200 + Math.random() * 300; // 200-500ms
            await this.think(delay);
        }

        console.log('[AI] 表达式输入完成，等待确认...');

        // 输入完成后稍微等待，然后提交
        await this.think(500);

        // 通过UIController提交
        await this.uiController.submitFunction();
    }

    /**
     * 将表达式字符串智能拆分为元素数组
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
    _tryRevengeTargetSelection(half, targetCount) {
        // 构建螺旋平移列表（从 0 向外逻层扩展）
        const offsets = [{ dx: 0, dy: 0 }];
        for (let r = 1; r <= 4; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) === r || Math.abs(dy) === r) {
                        offsets.push({ dx, dy });
                    }
                }
            }
        }

        for (const { dx, dy } of offsets) {
            const transTargets = this.failedPuzzle.targetCells.map(c => ({ x: c.x + dx, y: c.y + dy }));
            const transForbidden = this.failedPuzzle.forbiddenCells.map(c => ({ x: c.x + dx, y: c.y + dy }));

            // 所有目标格必须在棋盘内且未被占用
            const allValid = transTargets.every(c =>
                c.x >= -half && c.x < half &&
                c.y >= -half && c.y < half &&
                !this.isOccupied(c.x, c.y)
            );
            if (!allValid) continue;

            // 找到合法平移！
            // 根据当前 targetCount 截取或补齐目标格数量
            let finalTargets = transTargets.slice(0, targetCount);
            // 如果复仇局面目标格少于当前需要，后面会由普通选题补齐
            this.pendingRevengePuzzle = { targetCells: finalTargets, forbiddenCells: transForbidden };

            console.log(`[AI] 复仇模式: 准备放置 ${finalTargets.length} 个目标格`);
            let placedCount = 0;
            for (const cell of finalTargets) {
                const ok = this.gameController.selectTargetCell({ ...cell });
                if (ok) {
                    placedCount++;
                } else {
                    console.warn(`[AI] 复仇模式: 放置目标格 (${cell.x}, ${cell.y}) 失败`);
                }
            }
            console.log(`[AI] 复仇模式: 成功放置 ${placedCount}/${finalTargets.length} 个目标格`);

            if (window.summaCharacter) {
                const msg = (dx === 0 && dy === 0)
                    ? '这个局面让我很困惑……你来帮帮我吧？'
                    : '换个方向，同样的难题……你能找到解法吗？';
                window.summaCharacter.say(msg, 'neutral');
            }
            console.log(`[AI] 挑衅反转成功，平移 (${dx}, ${dy})，放置 ${finalTargets.length}/${targetCount} 个目标格`);
            return true;
        }
        return false;
    }

    /**
     * 底安选择：随机采样全部被占用时穷举找最佳空位
     * @param {number} half - 棋盘半径
     * @param {Array} alreadyChosen - 本回合已选目标格
     * @returns {{x,y}|null}
     */
    _findFallbackCell(half, alreadyChosen) {
        const candidates = [];
        for (let gx = -half; gx < half; gx++) {
            for (let gy = -half; gy < half; gy++) {
                if (this.isOccupied(gx, gy)) continue;
                let score = Math.abs(gx) + Math.abs(gy);
                for (const t of alreadyChosen) {
                    const ddx = Math.abs(gx - t.x), ddy = Math.abs(gy - t.y);
                    if (ddx === 0 || ddy === 0 || ddx === ddy) score -= 5;
                    else score += ddx + ddy;
                }
                candidates.push({ x: gx, y: gy, score });
            }
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score);
        // 从最优的前 5 个中随机选一个，增加变化性
        return candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
    }

    /**
     * 检查已学习解法是否与当前目标格完全匹配
     */
    solutionMatchesPuzzle(solution, targetCells) {
        if (solution.targetCells.length !== targetCells.length) return false;
        return solution.targetCells.every(sc =>
            targetCells.some(tc => tc.x === sc.x && tc.y === sc.y)
        );
    }

    /**
     * 从玩家解法中学习
     * — 存入精确解法库（完全相同局面时直接使用）
     * — 提取函数结构模板计入生成算法（类似局面自动适配常数）
     */
    learnFromPlayer(expression) {
        if (!this.pendingRevengePuzzle) return;

        // 存入精确解法
        this.learnedSolutions.push({
            targetCells: this.pendingRevengePuzzle.targetCells.map(c => ({ ...c })),
            forbiddenCells: this.pendingRevengePuzzle.forbiddenCells.map(c => ({ ...c })),
            expression,
            archiveId: this.activeArchiveId || null
        });

        // 提取结构模板并计入算法
        const template = this._extractTemplate(expression);
        if (template) {
            const alreadyHave = this.learnedTemplates.some(t => t.core === template.core);
            if (!alreadyHave) {
                this.learnedTemplates.push(template);
                console.log('[AI] 学习到新算法模板:', template.core);
            }
        }

        this.failedPuzzle = null;
        this.pendingRevengePuzzle = null;
        this._saveLearnedData();
        this._saveArchiveRevengeTraining();

        if (window.summaCharacter) {
            window.summaCharacter.say(`"${expression}"……这个解法我记下了，下次就不会再被难倒了！`, 'determined');
        }
    }

    /**
     * 玩家也未能解出复仇局面
     */
    notifyPlayerFailedRevenge() {
        this.pendingRevengePuzzle = null;
        if (window.summaCharacter) {
            window.summaCharacter.say('看来这个局面确实有难度……我们一起加油吧！', 'neutral');
        }
    }

    /**
     * 提取表达式的结构模板（去除末尾常数项）
     * 示例："2*x+3" → {core:"2*x"}, "sin(x)-1.5" → {core:"sin(x)"}
     */
    _extractTemplate(expression) {
        // 匹配末尾 +/- 整数或小数
        const match = expression.match(/^(.+?)([+-]\d+\.?\d*)$/);
        if (match && match[1] && match[1].includes('x')) {
            return { core: match[1], original: expression };
        }
        // 表达式本身就是核心
        if (expression.includes('x')) {
            return { core: expression, original: expression };
        }
        return null;
    }

    normalizeExpressionInput(expression) {
        if (!expression) return '';
        return String(expression)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/\bxx\b/g, 'x*x')
            .replace(/\[(.*?)\]/g, '($1)');
    }

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
    async trainOnPlayerExpression(expression, currentTargets, currentForbidden) {
        if (!expression || !expression.includes('x') || currentTargets.length === 0) return;

        const TOTAL_SIMS = 10000;
        const SLICE_MS = 8;
        let sliceStart = performance.now();

        // 提取玩家表达式的核心模板
        const playerTemplate = this._extractTemplate(expression);
        if (!playerTemplate) return;

        // 将玩家模板加入库（去重）
        if (!this.learnedTemplates.some(t => t.core === playerTemplate.core)) {
            this.learnedTemplates.push(playerTemplate);
        }

        // 生成变形模板集：基于玩家表达式进行缩放、翻转、变形
        const variants = this._generateTemplateVariants(playerTemplate.core);

        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        let newSolutions = 0;
        let newTemplates = 0;

        console.log(`[AI-Train] 开始训练: 基于 "${expression}" 生成 ${TOTAL_SIMS} 局模拟`);

        for (let sim = 0; sim < TOTAL_SIMS; sim++) {
            // 时间切片：每 8ms 让出主线程
            if (performance.now() - sliceStart >= SLICE_MS) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                sliceStart = performance.now();
            }

            // 生成随机偏移的类似局面
            const simTargets = currentTargets.map(t => ({
                x: t.x + Math.floor(Math.random() * 7) - 3,  // 偏移 -3 ~ +3
                y: t.y + Math.floor(Math.random() * 7) - 3
            })).filter(t =>
                t.x >= -half && t.x < half && t.y >= -half && t.y < half
            );
            if (simTargets.length !== currentTargets.length) continue;

            // 随机生成 0~2 个禁止区
            const simForbidden = [];
            const forbiddenCount = Math.floor(Math.random() * 3);
            for (let f = 0; f < forbiddenCount; f++) {
                const fx = Math.floor(Math.random() * gridSize) - half;
                const fy = Math.floor(Math.random() * gridSize) - half;
                const isTarget = simTargets.some(t => t.x === fx && t.y === fy);
                if (!isTarget) simForbidden.push({ x: fx, y: fy });
            }

            // 尝试用所有变形模板求解
            for (const tmplCore of variants) {
                const adapted = this._adaptCoreToTargets(tmplCore, simTargets);
                if (!adapted) continue;

                // 纯数学验证：检查是否穿过所有目标格且避开禁止区
                if (this._verifyExpressionPure(adapted, simTargets, simForbidden)) {
                    // 存入精确解法库（去重）
                    const exists = this.learnedSolutions.some(s =>
                        this.solutionMatchesPuzzle(s, simTargets) && s.expression === adapted
                    );
                    if (!exists) {
                        this.learnedSolutions.push({
                            targetCells: simTargets.map(c => ({ ...c })),
                            forbiddenCells: simForbidden.map(c => ({ ...c })),
                            expression: adapted,
                            archiveId: this.activeArchiveId || null
                        });
                        newSolutions++;
                    }

                    // 提取新模板
                    const tmpl = this._extractTemplate(adapted);
                    if (tmpl && !this.learnedTemplates.some(t => t.core === tmpl.core)) {
                        this.learnedTemplates.push(tmpl);
                        newTemplates++;
                    }
                    break; // 这个局面已解决，进入下一局
                }
            }
        }

        // 限制解法库大小，避免内存膨胀
        if (this.learnedSolutions.length > 500) {
            this.learnedSolutions = this.learnedSolutions.slice(-500);
        }
        if (this.learnedTemplates.length > 100) {
            this.learnedTemplates = this.learnedTemplates.slice(-100);
        }

        console.log(`[AI-Train] 训练完成: 新增 ${newSolutions} 个解法，${newTemplates} 个模板。解法库总计: ${this.learnedSolutions.length}，模板库总计: ${this.learnedTemplates.length}`);
    }

    /**
     * 基于核心模板生成变形集（缩放、翻转、复合）
     * @param {string} core - 原始核心表达式
     * @returns {string[]} 变形模板数组
     */
    _generateTemplateVariants(core) {
        const variants = [core];
        // 缩放变形
        for (const a of [0.5, 2, -1, -0.5, 3, 0.25]) {
            if (core === 'x') {
                variants.push(`${a}*x`);
            } else {
                variants.push(`${a}*(${core})`);
            }
        }
        // 翻转变形
        if (core === 'x') {
            variants.push('-x');
        } else {
            variants.push(`-(${core})`);
        }
        // 平移变形 (x → x±1, x±2)
        for (const shift of [1, -1, 2, -2]) {
            const shiftStr = shift > 0 ? `x-${shift}` : `x+${-shift}`;
            if (core === 'x') {
                variants.push(`(${shiftStr})`);
            } else {
                variants.push(core.replace(/x/g, `(${shiftStr})`));
            }
        }
        return variants;
    }

    /**
     * 将核心模板自适应到目标格（求常数偏移 C）
     * @param {string} core - 核心表达式
     * @param {Array} targets - 目标格数组
     * @returns {string|null} 自适应后的完整表达式
     */
    _adaptCoreToTargets(core, targets) {
        if (!targets || targets.length === 0) return null;
        try {
            const t = targets[0];
            const tx = t.x + 0.5, ty = t.y + 0.5;
            const coreVal = this.evaluateFunction(core, tx);
            if (!isFinite(coreVal) || isNaN(coreVal)) return null;
            const c = ty - coreVal;
            if (Math.abs(c) > 50) return null;
            const cR = Math.round(c * 2) / 2; // 精确到 0.5
            if (cR === 0) return core;
            const sign = cR > 0 ? '+' : '';
            return `${core}${sign}${cR}`;
        } catch (e) {
            return null;
        }
    }

    /**
     * 纯数学验证：检查表达式是否穿过所有目标格且避开禁止区
     * @param {string} expr - 要验证的表达式
     * @param {Array} targets - 目标格
     * @param {Array} forbidden - 禁止区
     * @returns {boolean}
     */
    _verifyExpressionPure(expr, targets, forbidden) {
        // 检查是否穿过所有目标格
        for (const t of targets) {
            const tx = t.x + 0.5, ty = t.y + 0.5;
            const y = this.evaluateFunction(expr, tx);
            if (!isFinite(y) || Math.abs(y - ty) >= 0.5) return false;
        }
        // 检查是否碰禁止区
        for (const f of forbidden) {
            const fx = f.x + 0.5, fy = f.y + 0.5;
            const y = this.evaluateFunction(expr, fx);
            if (isFinite(y) && Math.abs(y - fy) < 0.5) return false;
        }
        return true;
    }

    /**
     * 将已学模板适配到当前目标格（计入算法）
     * 原理：求 C 使得 core(tx) + C = ty，然后返回 core+C
     * @param {Object} template - 模板对象 {core, original}
     * @param {Array} targetCells - 目标格数组
     * @param {Array} lockedElements - 被锁定的元素（可选）
     */
    adaptTemplateToTargets(template, targetCells, lockedElements = []) {
        if (!targetCells || targetCells.length === 0) return null;
        try {
            const target = targetCells[0];
            const tx = target.x + 0.5, ty = target.y + 0.5;
            const coreVal = this.evaluateFunction(template.core, tx);
            if (!isFinite(coreVal) || isNaN(coreVal)) return null;
            const c = ty - coreVal;
            if (Math.abs(c) > 50) return null;

            // 如果小数点被锁定，常数取整；否则精确到0.5
            const canFloat = !lockedElements.includes('.');
            const cRounded = canFloat ? Math.round(c * 2) / 2 : Math.round(c);
            const sign = cRounded >= 0 ? '+' : '';
            const cStr = cRounded === 0 ? '' : `${sign}${cRounded}`;
            return `${template.core}${cStr}`;
        } catch (e) {
            return null;
        }
    }

    isOccupied(x, y) {
        const state = this.gameController.getGameState();
        const isTarget = state.roundState.targetCells.some(c => c.x === x && c.y === y);
        const isForbidden = state.roundState.forbiddenCells.some(c => c.x === x && c.y === y);
        // 也检查历史使用过的格子
        const isUsed = state.usedCells && state.usedCells.some(c => c.x === x && c.y === y);
        return isTarget || isForbidden || isUsed;
    }

    /**
     * 辅助：根据难度获取数量
     */
    getDifficultyBasedCount(max) {
        const difficulty = this.gameController.difficulty;
        let count;

        if (difficulty === 'easy') {
            count = Math.floor(max * 0.3);
        } else if (difficulty === 'hard') {
            count = Math.ceil(max * 0.8);
        } else if (difficulty === 'expert') {
            count = max;
        } else { // normal
            count = Math.floor(max * 0.6);
        }

        // 如果max>0但至少应该设置1个
        if (max > 0 && count === 0) {
            count = 1;
        }

        return count;
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

    // ═══════════════════════════════════════════════════════════════════════════════
    //  持久化与复仇训练系统
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * 从 localStorage 加载已学习的数据
     */
    _loadLearnedData() {
        try {
            const saved = localStorage.getItem('summa_learned_data_v1');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.learnedSolutions && Array.isArray(data.learnedSolutions)) {
                    this.learnedSolutions = data.learnedSolutions;
                }
                if (data.learnedTemplates && Array.isArray(data.learnedTemplates)) {
                    this.learnedTemplates = data.learnedTemplates;
                }
                console.log(`[AI-Persist] 加载学习数据: ${this.learnedSolutions.length} 个解法, ${this.learnedTemplates.length} 个模板`);
            }
        } catch (e) {
            console.warn('[AI-Persist] 加载学习数据失败:', e);
        }
    }

    /**
     * 保存学习数据到 localStorage
     */
    _saveLearnedData() {
        try {
            const data = {
                learnedSolutions: this.learnedSolutions,
                learnedTemplates: this.learnedTemplates,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem('summa_learned_data_v1', JSON.stringify(data));
            console.log(`[AI-Persist] 保存学习数据: ${this.learnedSolutions.length} 个解法, ${this.learnedTemplates.length} 个模板`);
        } catch (e) {
            console.warn('[AI-Persist] 保存学习数据失败:', e);
        }
    }

    _saveArchiveRevengeTraining(archiveId, stats = {}) {
        if (!archiveId) return;
        try {
            const key = `summa_archive_${archiveId}`;
            const raw = localStorage.getItem(key);
            const archive = raw ? JSON.parse(raw) : null;
            if (!archive) return;
            archive.revengeTraining = {
                lastTrainedAt: new Date().toISOString(),
                stats,
            };
            localStorage.setItem(key, JSON.stringify(archive));
        } catch (e) {}
    }

    /**
     * 复仇前现场训练：对失败局面及其变体进行100000局训练
     * @param {Object} puzzle - 失败的局面 {targetCells, forbiddenCells}
     */
    async trainOnFailedPuzzle(puzzle) {
        if (!puzzle || !puzzle.targetCells || puzzle.targetCells.length === 0) return;
        const archiveId = this.activeArchiveId || null;

        const TOTAL_SIMS = 100000;
        const TIME_BUDGET_MS = 100;
        const startTime = performance.now();

        const gridSize = this.gridSystem.gridSize;
        const half = gridSize / 2;
        let newSolutions = 0;
        let newTemplates = 0;
        let validVariants = 0;

        console.log(`[AI-RevengeTrain] 开始复仇训练: 失败局面及平移变体 ${TOTAL_SIMS} 轮（预算 ${TIME_BUDGET_MS}ms）`);

        // 轻量核心模板池：优先已学模板，限制池大小确保 10000 轮可在短时完成
        const learnedCores = this.learnedTemplates.length > 0
            ? this.learnedTemplates.map(t => t.core).slice(-24)
            : [];
        const baseTemplates = [...new Set([
            ...learnedCores,
            'x', 'x^2', 'x^3', 'sin(x)', 'cos(x)', 'abs(x)', 'x/2', '2*x'
        ])];

        // 平移偏移池（优先小位移，确保更可能落在棋盘范围内）
        const offsets = [];
        for (let r = 0; r <= 4; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
                        offsets.push({ dx, dy });
                    }
                }
            }
        }

        const isInsideBoard = (c) => c.x >= -half && c.x < half && c.y >= -half && c.y < half;
        const sameCell = (a, b) => a.x === b.x && a.y === b.y;
        const addSolutionIfNew = (targets, forbidden, expr) => {
            const exists = this.learnedSolutions.some(s =>
                this.solutionMatchesPuzzle(s, targets) && s.expression === expr && s.archiveId === archiveId
            );
            if (!exists) {
                this.learnedSolutions.push({
                    targetCells: targets.map(c => ({ ...c })),
                    forbiddenCells: forbidden.map(c => ({ ...c })),
                    expression: expr,
                    archiveId
                });
                newSolutions++;
            }
            const tmpl = this._extractTemplate(expr);
            if (tmpl && !this.learnedTemplates.some(t => t.core === tmpl.core)) {
                this.learnedTemplates.push(tmpl);
                newTemplates++;
            }
        };

        for (let sim = 0; sim < TOTAL_SIMS; sim++) {
            const offset = offsets[sim % offsets.length];
            const simTargets = puzzle.targetCells.map(t => ({ x: t.x + offset.dx, y: t.y + offset.dy }));
            const simForbiddenRaw = (puzzle.forbiddenCells || []).map(f => ({ x: f.x + offset.dx, y: f.y + offset.dy }));

            if (!simTargets.every(isInsideBoard)) continue;
            const simForbidden = simForbiddenRaw.filter(c =>
                isInsideBoard(c) && !simTargets.some(t => sameCell(t, c))
            );
            validVariants++;

            // 每轮仅测 1 个核心模板，避免 O(10000 * 模板数) 的爆炸耗时
            const core = baseTemplates[sim % baseTemplates.length];
            const adapted = this._adaptCoreToTargets(core, simTargets);
            if (!adapted) continue;
            if (!this._verifyExpressionPure(adapted, simTargets, simForbidden)) continue;
            addSolutionIfNew(simTargets, simForbidden, adapted);
        }

        // 限制库大小
        if (this.learnedSolutions.length > 500) {
            this.learnedSolutions = this.learnedSolutions.slice(-500);
        }
        if (this.learnedTemplates.length > 100) {
            this.learnedTemplates = this.learnedTemplates.slice(-100);
        }

        // 保存到 localStorage
        this._saveLearnedData();
        this._saveArchiveRevengeTraining(archiveId, { newSolutions, newTemplates, elapsed: performance.now() - startTime });

        const elapsed = performance.now() - startTime;
        const budgetState = elapsed <= TIME_BUDGET_MS ? '达标' : '超预算';
        console.log(`[AI-RevengeTrain] 完成 ${TOTAL_SIMS} 轮，合法变体 ${validVariants}，新增 ${newSolutions} 解法/${newTemplates} 模板，耗时 ${elapsed.toFixed(1)}ms（${budgetState}）`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIController;
}
