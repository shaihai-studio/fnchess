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
                this.selectTargets();
                await this.think(500);
                console.log('[AI] 确认目标格选择');
                this.gameController.confirmTargetSelection();
                // 等待阶段切换完成
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
                const expression = this.generateExpression();
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
    selectTargets() {
        const state = this.gameController.getGameState();
        const count = state.targetCount;
        const gridSize = this.gridSystem.gridSize;
        const strategy = this.strategies[this.gameController.difficulty] || this.strategies.normal;
        
        for (let i = 0; i < count; i++) {
            let x, y;
            let bestScore = -Infinity;
            let bestCell = null;
            
            // Generate multiple candidates and score them
            for (let c = 0; c < 20; c++) {
                let cx = Math.floor(Math.random() * gridSize) - gridSize / 2;
                let cy = Math.floor(Math.random() * gridSize) - gridSize / 2;
                
                if (this.isOccupied(cx, cy)) continue;
                
                // Smart placement score
                let score = 0;
                
                // Penalize if too close to center
                score += Math.abs(cx) + Math.abs(cy);
                
                // Penalize if linear alignment with existing targets
                for(let t of state.roundState.targetCells) {
                    let dx = Math.abs(cx - t.x);
                    let dy = Math.abs(cy - t.y);
                    if (dx === 0 || dy === 0 || dx === dy) {
                        score -= 5;
                    } else {
                        score += dx + dy; // reward dispersion
                    }
                }
                
                // Random variation based on difficulty
                if (Math.random() > strategy.targetAccuracy) {
                    score = Math.random() * 10;
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestCell = {x: cx, y: cy};
                }
            }
            
            if (bestCell) {
                this.gameController.selectTargetCell(bestCell);
            }
        }
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
        
        while (placedCount < maxForbidden) {
            let bestX = 0, bestY = 0, minDistance = Infinity;
            let found = false;
            
            // AI tries to block natural paths between origin and targets
            if (state.roundState.targetCells.length > 0) {
                let target = state.roundState.targetCells[placedCount % state.roundState.targetCells.length];
                
                // Let's sample points between origin (or other targets) and this target
                for(let i=0; i<30; i++) {
                    let tx = Math.floor(target.x * Math.random());
                    let ty = Math.floor(target.y * Math.random());
                    
                    // Add noise
                    tx += Math.floor(Math.random()*3 - 1);
                    ty += Math.floor(Math.random()*3 - 1);
                    
                    // Don't place out of bounds
                    if(tx < -gridSize/2 || tx >= gridSize/2) continue;
                    if(ty < -gridSize/2 || ty >= gridSize/2) continue;
                    
                    if (this.isValidForbiddenPosition(tx, ty)) {
                        bestX = tx;
                        bestY = ty;
                        found = true;
                        break;
                    }
                }
            }
            
            // Random block if smart block failed
            if (!found) {
                for(let attempt = 0; attempt < 100; attempt++) {
                    let rx = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    let ry = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    if (this.isValidForbiddenPosition(rx, ry)) {
                        bestX = rx;
                        bestY = ry;
                        found = true;
                        break;
                    }
                }
            }
            
            if (found) {
                this.gameController.addForbiddenCell({x: bestX, y: bestY});
                placedCount++;
            } else {
                break; // Board might be too full
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
        const isTarget = state.roundState.targetCells.some(c => c.x === x && c.y === y);
        if (isTarget) return false;
        
        // 不能是已有的禁区
        const isForbidden = state.roundState.forbiddenCells.some(c => c.x === x && c.y === y);
        if (isForbidden) return false;
        
        return true;
    }

    /**
     * 设置锁定元素
     */
    setLocks() {
        const state = this.gameController.getGameState();
        const maxLocks = state.maxLocks;
        const count = this.getDifficultyBasedCount(maxLocks);
        const strategy = this.strategies[this.gameController.difficulty] || this.strategies.normal;
        
        // 根据难度选择不同的锁定策略
        let elements;
        if (strategy.functionComplexity <= 2) {
            // 低难度：锁定基本运算符
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs'];
        } else {
            // 高难度：锁定高级函数
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log'];
        }
        
        // 简单模式下不锁定四则运算
        if (state.difficulty === 'easy') {
            elements = elements.filter(e => !['+', '-', '*', '/'].includes(e));
        }

        const shuffled = elements.sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
            this.gameController.addLockedElement(shuffled[i]);
        }
    }

    /**
     * 生成数学表达式
     */
    generateExpression() {
        const difficulty = this.gameController.difficulty;
        const state = this.gameController.getGameState();
        const strategy = this.strategies[difficulty] || this.strategies.normal;
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        const lockedElements = state.roundState.lockedElements;
        
        let bestExpr = 'x';
        this.lastThinkCount = 0;
                
        // 性能优化：将外层尝试次数从 1000 减少至 200
        // 原因：1000 次并进内部 500 次突变 = 最多 50万次函数求值，会卡顿主线程
        // 内层算法已经针对性足够负责，200 次幺次即可找到满意解
        for (let attempt = 0; attempt < 200; attempt++) {
            let expression = null;
            if (targetCells.length > 0) {
                expression = this.constructFunctionForTargets(targetCells, forbiddenCells, lockedElements, strategy);
            }
            
            // 如果没找到或目标为空，降级为模板
            if (!expression) {
                const templates = this.getTemplatesByDifficulty(difficulty);
                const template = templates[Math.floor(Math.random() * templates.length)];
                expression = template.replace(/\{n\}/g, () => Math.floor(Math.random() * 5) + 1)
                                           .replace(/\{c\}/g, () => Math.floor(Math.random() * 10) - 5);
            }
            
            bestExpr = expression;
            
            // 进行严格审查：这个函数是不是废品？
            let hitCount = this.countTargetHits(expression, targetCells, forbiddenCells);
            let fail = false;
            
            if (hitCount === 0 && targetCells.length > 0) {
                fail = true; // 一个目标都没打中
            }
            
            // 检查禁区连坐
            for (const forbidden of forbiddenCells) {
                const fx = forbidden.x + 0.5;
                const fy = this.evaluateFunction(expression, fx);
                if (fy !== Infinity && Math.abs(fy - (forbidden.y + 0.5)) < 0.5) {
                    fail = true; 
                    break;
                }
            }
            
            if (!fail) {
                console.log(`[AI] 第 ${attempt + 1} 次生成尝试即通过审查！准备递交:`, expression);
                return expression;
            } else {
                console.log(`[AI] 第 ${attempt + 1} 次尝试由于命中数不够或碰禁区，废除并重新生成...`);
            }
        }
        
        console.log('[AI] 连续200次全部失败，强制递交突变解:', bestExpr);
        return bestExpr;
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
            if(raw) memory = JSON.parse(raw);
            if(!memory.best_functions || memory.best_functions.length === 0) memory.best_functions = ['x'];
        } catch(e) {} // eslint-disable-line no-empty
        
        // 提取候选核心基因
        let candidateCores = [];
        // 从记忆池中抓取最多 20 个基因
        for(let j=0; j<20; j++) {
            candidateCores.push(memory.best_functions[Math.floor(Math.random() * memory.best_functions.length)]);
        }
        // 始终混入基础退火解（确保在极度恶劣的条件下有解）
        candidateCores.push('x', 'x^2', 'sin(x)');

        let bestExpr = 'x';
        let maxHits = -1;

        // 性能优化：将内层突变次数从 500 减少至 150
        // 结合外层 200 次幹次，最多 30000 次求值，效果并不减少但性能改善很大
        for (let j = 0; j < 150; j++) {
            this.lastThinkCount++;
            
            // 只保留允许使用的 Core
            let cores = candidateCores.filter(c => this.isValidExpression(c, lockedElements));
            if (cores.length === 0) break;
            
            let expr = this.buildExpression(cores, availableOps, canFloat, targetCells[0]);
            if (!expr || !this.isValidExpression(expr, lockedElements)) continue;
            
            const hitCount = this.countTargetHits(expr, targetCells, forbiddenCells);
            
            if (hitCount > maxHits) {
                maxHits = hitCount;
                bestExpr = expr;
            }
            
            if (hitCount === targetCells.length) {
                console.log(`[AI] 完美组合找到方程: ${expr}`);
                return expr;
            }
        }
        
        console.log(`[AI] 结束无限模拟搜索，使用次优解: ${bestExpr}，命中 ${maxHits} 个`);
        return bestExpr;
    }
    
    buildExpression(cores, availableOps, canFloat, target) {
        let core = cores[Math.floor(Math.random() * cores.length)];
        if(!target) return core;
        
        let tx = target.x + 0.5;
        let ty = target.y + 0.5;
        
        // 如果没有加减法
        if (!availableOps.includes('+') && !availableOps.includes('-')) {
            let evaluateCore = this.evaluateFunction(core, tx);
            if(Math.abs(evaluateCore) > 0.001 && evaluateCore !== Infinity) {
                let A = ty / evaluateCore;
                A = canFloat ? parseFloat(A.toFixed(1)) : Math.round(A);
                if(A === 0) A = 1;
                if(A === 1) return core;
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
        if(evaluateCore === Infinity || isNaN(evaluateCore)) return null;
        
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
        } catch(e) {
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
            
            switch(funcType) {
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
        
        switch(difficulty) {
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
            
            switch(funcType) {
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
        
        // 在 UI 测试泡泡上显示调试信息（推演了多少次）
        if (window.summaCharacter && this.lastThinkCount) {
            window.summaCharacter.messageBox.textContent = `[深度演算了 ${this.lastThinkCount} 次]`;
            window.summaCharacter.messageBox.classList.add('visible');
        }
        
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIController;
}
