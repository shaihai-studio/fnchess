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

class AIFunctionBuilder {
    constructor(ai) { this.ai = ai; }

    constructFunctionForTargets(targetCells, forbiddenCells, lockedElements, strategy) {

        // 强大的神经元生成器：基于锁定系统分层递进搜索
        const availableOps = ['+', '-', '*', '/', '^', 'sin', 'cos', 'tan', 'abs', 'ln', 'e', 'sqrt'].filter(op => !lockedElements.includes(op));
        const canFloat = !lockedElements.includes('.');
        const canAdd = availableOps.includes('+');
        const canSub = availableOps.includes('-');

        console.log("[AI] 可用运算符:", availableOps);

        // 读取训练好的神经记忆池作为突变起点
        const state = this.ai.gameController.getGameState();
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
            this.ai.lastThinkCount++;

            // 只保留允许使用的 Core
            let cores = candidateCores.filter(c => this.ai.isValidExpression(c, lockedElements));
            if (cores.length === 0) break;

            let expr = this.ai.buildExpression(cores, availableOps, canFloat, targetCells[0]);
            if (!expr || !this.ai.isValidExpression(expr, lockedElements)) continue;

            const hitCount = this.ai.countTargetHits(expr, targetCells, forbiddenCells);

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
            let evaluateCore = this.ai.evaluateFunction(core, tx);
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

        let evaluateCore = this.ai.evaluateFunction(modCore, tx);
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

    async generateExpression() {
        const difficulty = this.ai.gameController.difficulty;
        const state = this.ai.gameController.getGameState();
        const strategy = this.ai.strategies[difficulty] || this.ai.strategies.normal;
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        const lockedElements = state.roundState.lockedElements;

        let bestExpr = 'x';
        this.ai.lastThinkCount = 0;

        // ── 优先尝试精确匹配的已学习解法 ──────────────────────────────────────
        if (this.ai.learnedSolutions.length > 0 && this.ai.uiController && this.ai.uiController.renderer) {
            for (const solution of this.ai.learnedSolutions) {
                if (this.ai.solutionMatchesPuzzle(solution, targetCells)) {
                    if (this.ai.isExpressionActuallySuccessful(solution.expression, targetCells, forbiddenCells)) {
                        // 检查是否包含被锁定的元素
                        if (!this.ai.isValidExpression(solution.expression, lockedElements)) {
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
            if (this.ai.learnedTemplates.length > 0 && targetCells.length > 0) {
                const tmpl = this.ai.learnedTemplates[Math.floor(Math.random() * this.ai.learnedTemplates.length)];
                expression = this.ai.adaptTemplateToTargets(tmpl, targetCells, lockedElements);
            }

            if (!expression && targetCells.length > 0) {
                expression = this.ai.constructFunctionForTargets(targetCells, forbiddenCells, lockedElements, strategy);
            }

            if (!expression) {
                const templates = this.ai.getTemplatesByDifficulty(difficulty);
                const template = templates[Math.floor(Math.random() * templates.length)];
                expression = template.replace(/\{n\}/g, () => Math.floor(Math.random() * 5) + 1)
                    .replace(/\{c\}/g, () => Math.floor(Math.random() * 10) - 5);
            }

            // ── 锁定合规检查：确保表达式不包含被锁定的元素 ──────────────────
            if (expression && !this.ai.isValidExpression(expression, lockedElements)) {
                expression = null;
            }

            bestExpr = expression;

            let fail = false;
            let hitCount = 0;

            if (!expression) {
                fail = true;
            } else if (this.ai.uiController && this.ai.uiController.renderer) {
                if (!this.ai.isExpressionActuallySuccessful(expression, targetCells, forbiddenCells)) {
                    fail = true;
                } else {
                    hitCount = targetCells.length;
                }
            } else {
                hitCount = this.ai.countTargetHits(expression, targetCells, forbiddenCells);
                if (hitCount < targetCells.length) fail = true;
                for (const forbidden of forbiddenCells) {
                    const fx = forbidden.x + 0.5;
                    const fy = this.ai.evaluateFunction(expression, fx);
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
            this.ai.failedPuzzle = {
                targetCells: targetCells.map(c => ({ ...c })),
                forbiddenCells: forbiddenCells.map(c => ({ ...c }))
            };
            this.ai.revengeMode = true;
            console.log('[AI] 局面记录完毕，下回合将反出给玩家');
        }

        console.log('[AI] 连续 2000 大轮搜寻全部失败，强制递交次优突变解:', bestExpr);
        return bestExpr;
    }

    isExpressionActuallySuccessful(expression, targetCells, forbiddenCells) {
        if (!expression || !this.ai.uiController || !this.ai.uiController.renderer || !this.ai.uiController.detector) {
            return false;
        }

        const range = this.ai.gridSystem.getRange();
        // 与 UIController.renderAndEvaluate 保持一致：碰撞检测使用高精度采样
        const collisionPoints = this.ai.uiController.renderer.sampleFunction(expression, range.min, range.max, true);
        const polyline = this.ai.uiController.renderer.convertToPolyline(collisionPoints);
        if (!polyline || polyline.length === 0) return false;

        let hitCount = 0;
        for (const target of targetCells) {
            if (this.ai.uiController.detector.checkHitTarget(polyline, target, this.ai.gridSystem)) {
                hitCount++;
            }
        }
        if (hitCount < targetCells.length) return false;

        if (forbiddenCells.length > 0 &&
            this.ai.uiController.detector.checkHitForbidden(polyline, forbiddenCells, this.ai.gridSystem)) {
            return false;
        }

        return true;
    }

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
                // 专家模式：优先4次+函数、!、ln等特殊函数
                // 25%四次函数，30%ln函数，25%三角函数，10%高次绝对值，10%五次函数
                if (rand < 0.25) return 8; // 四次函数
                if (rand < 0.55) return 9; // ln函数
                if (rand < 0.80) return 7; // 三角函数
                if (rand < 0.90) return 11; // 高次绝对值 (4次+)
                return 12; // 五次函数

            default:
                return Math.floor(Math.random() * Math.min(strategy.functionComplexity + 1, 5));
        }
    }

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

    checkFunctionHitsTarget(expression, targetCells, forbiddenCells) {
        try {
            // 严格检查：必须穿过目标格的中心区域（不是边缘）
            for (const target of targetCells) {
                const tx = target.x + 0.5; // 目标格中心x
                const ty = target.y + 0.5; // 目标格中心y
                const y = this.ai.parser.evaluate(expression, tx);

                if (y === null) return false;

                // 严格检查：函数值必须接近目标格中心（误差 < 0.5）
                // 这确保函数真正穿过目标格内部，而不是擦边
                const distanceToCenter = Math.abs(y - ty);
                if (distanceToCenter < 0.5) {
                    console.log(`[AI] 函数穿过目标格 (${target.x}, ${target.y}) 中心，距离=${distanceToCenter.toFixed(2)}`);

                    // 检查是否进入禁区
                    for (const forbidden of forbiddenCells) {
                        const fx = forbidden.x + 0.5;
                        const fy = this.ai.parser.evaluate(expression, fx);
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

    evaluateFunction(expr_str, x_val) {
        try {
            return this.ai.parser.evaluate(expr_str, x_val);
            // eslint-disable-next-line no-unused-vars
        } catch (e) {
            return Infinity;
        }
    }

    countTargetHits(expression, targetCells, forbiddenCells) {
        let hitCount = 0;

        for (const target of targetCells) {
            const tx = target.x + 0.5;
            const ty = target.y + 0.5;
            const y = this.ai.parser.evaluate(expression, tx);

            if (y === null) continue;

            const distanceToCenter = Math.abs(y - ty);
            if (distanceToCenter < 0.5) {
                hitCount++;
            }
        }

        return hitCount;
    }

    isValidExpression(expression, lockedElements) {
        // 2026-08-15 修复 #55：改用边界匹配（复用 FunctionParser.containsElement，#43 已转义+分类），
        // 原 expression.includes(locked) 子串匹配会把 arcsin 误判为含 sin、把 'e' 误杀 'exp' 等，
        // 导致锁定元素子串误杀合法表达式。
        const parser = this.ai && this.ai.parser;
        for (const locked of lockedElements) {
            if (parser && typeof parser.containsElement === 'function') {
                if (parser.containsElement(expression, locked)) return false;
            } else if (expression.includes(locked)) {
                return false;
            }
        }
        return true;
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AIFunctionBuilder;