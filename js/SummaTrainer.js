/**
 * SummaTrainer 模块
 * 真实的自监督训练系统设计：
 * 在开启指定难度的 AI 对战前进行大规模探索式学习，记录特征图谱和算子的成功率。
 */
class SummaTrainer {
    constructor() {
        this.progressModal = null;
        this.progressBar = null;
        this.progressText = null;
        this.progressLog = null;
        this.isTraining = false;
        
        // 我们会针对不同难度存储模型
        this.models = {};
    }
    
    initUI() {
        if(this.progressModal) return;
        
        const modalHtml = `
            <div id="summa-train-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; justify-content:center; align-items:center; flex-direction:column; color:white; font-family:monospace;">
                <h2 style="margin-bottom: 20px; font-size: 24px; text-shadow: 0 0 10px #00d4ff;">Summa 神经网络深度训练中...</h2>
                <div style="width: 60%; max-width: 600px; height: 20px; background: #333; border-radius: 10px; overflow: hidden; border: 1px solid #00d4ff; box-shadow: 0 0 15px rgba(0,212,255,0.4);">
                    <div id="summa-train-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00d4ff, #00ff88); transition: width 0.1s ease-out;"></div>
                </div>
                <div id="summa-train-text" style="margin-top: 15px; font-size: 16px; color: #aaa;">0 / 初始化中...</div>
                <div id="summa-train-log" style="margin-top: 10px; font-size: 12px; color: #555; background: #111; padding: 10px; border-radius: 5px; width: 60%; max-width: 600px; height: 80px; overflow: hidden;">准备注入初始拓扑网数据...</div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        this.progressModal = document.getElementById('summa-train-modal');
        this.progressBar = document.getElementById('summa-train-bar');
        this.progressText = document.getElementById('summa-train-text');
        this.progressLog = document.getElementById('summa-train-log');
    }
    
    updateUI(iterations, total, logs) {
        const percent = (iterations / total) * 100;
        this.progressBar.style.width = percent + '%';
        this.progressText.innerText = `${iterations} / ${total} 批次训练完成`;
        if(logs) {
            this.progressLog.innerHTML = logs.map(l => `<div>> ${l}</div>`).join('');
        }
    }
    
    // 返回该难度下是否已经训练完成
    isModelTrained(difficulty) {
        return !!localStorage.getItem(`summa_model_v2_${difficulty}`);
    }
    
    async startTraining(difficulty, trainAmount = 50000) {
        return new Promise((resolve) => {
            if(this.isModelTrained(difficulty)) {
                resolve();
                return;
            }
            
            this.initUI();
            this.progressModal.style.display = 'flex';
            this.isTraining = true;
            
            const TOTAL_ITERATIONS = trainAmount;
            const FIRST_PHASE = Math.floor(TOTAL_ITERATIONS * 0.95);
            const REVIEW_PHASE = TOTAL_ITERATIONS - FIRST_PHASE;
            const WRONG_COLLECT_START = Math.floor(FIRST_PHASE * 0.7); // 95%训练的最后30%
            const chunk = Math.min(1500, Math.max(100, Math.floor(TOTAL_ITERATIONS / 600)));

            let i = 0;
            let logsArray = [];
            let wrongLogged = 0;
            let reviewSolved = 0;

            let modelWeights = {
                best_functions: []
            };

            const opsCollection = ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs', 'e', 'ln', 'tan', 'sqrt'];

            const wrongQuestions = [];
            const MAX_WRONG_QUESTIONS = 1200;

            const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const chance = (p) => Math.random() < p;
            const randomCell = (half) => ({ x: randInt(-half, half - 1), y: randInt(-half, half - 1) });
            const sameCell = (a, b) => a.x === b.x && a.y === b.y;
            const uniquePushCell = (arr, cell) => {
                if (!arr.some(c => sameCell(c, cell))) arr.push(cell);
            };

            // 构建真实的AST节点并快速计算
            const generateASTNode = (depth, availableOps) => {
                if (depth <= 0) {
                    const r = Math.random();
                    if(r < 0.5) return { t: 'var' };
                    if(r < 0.8) return { t: 'num', v: Math.floor(Math.random() * 9 + 1) };
                    return { t: 'e' };
                }
                const activeOps = availableOps.filter(o => ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs', 'e', 'ln', 'tan', 'sqrt'].includes(o));
                if (activeOps.length === 0) return { t: 'var' };
                let op = activeOps[Math.floor(Math.random() * activeOps.length)];
                if (['+', '-', '*', '/', '^'].includes(op)) {
                    if (op === '^') return { t: 'op', op: '^', l: generateASTNode(depth - 1, availableOps), r: { t: 'var' } };
                    return { t: 'op', op: op, l: generateASTNode(depth - 1, availableOps), r: generateASTNode(depth - 1, availableOps) };
                } else if (['sin', 'cos', 'tan', 'abs', 'ln', 'sqrt'].includes(op)) {
                    return { t: 'func', op: op, arg: generateASTNode(depth - 1, availableOps) };
                } else if (op === 'e') {
                    return { t: 'op', op: '^', l: { t: 'e' }, r: generateASTNode(depth - 1, availableOps) };
                }
                return { t: 'var' };
            };

            const evalAST = (node, x) => {
                if(node.t === 'var') return x;
                if(node.t === 'num') return node.v;
                if(node.t === 'e') return Math.E;
                if(node.t === 'op') {
                    let left = evalAST(node.l, x);
                    let right = evalAST(node.r, x);
                    if(node.op === '+') return left + right;
                    if(node.op === '-') return left - right;
                    if(node.op === '*') return left * right;
                    if(node.op === '/') return left / right;
                    if(node.op === '^') return Math.pow(left, right);
                }
                if(node.t === 'func') {
                    let arg = evalAST(node.arg, x);
                    if(node.op === 'sin') return Math.sin(arg);
                    if(node.op === 'cos') return Math.cos(arg);
                    if(node.op === 'tan') return Math.tan(arg);
                    if(node.op === 'abs') return Math.abs(arg);
                    if(node.op === 'ln') return Math.log(arg);
                    if(node.op === 'sqrt') return Math.sqrt(arg);
                }
                return 0;
            };

            const astToString = (node) => {
                if(node.t === 'var') return 'x';
                if(node.t === 'num') return node.v.toString();
                if(node.t === 'e') return 'e';
                if(node.t === 'op') {
                    if (node.op === '^') return `(${astToString(node.l)}^(${astToString(node.r)}))`;
                    return `(${astToString(node.l)}${node.op}${astToString(node.r)})`;
                }
                if(node.t === 'func') {
                    return `${node.op}(${astToString(node.arg)})`;
                }
                return 'x';
            };

            const evalExprAt = (astNode, x) => {
                const y = evalAST(astNode, x);
                return Number.isFinite(y) ? y : null;
            };

            const verifyCase = (astNode, targets, forbidden) => {
                for (const t of targets) {
                    const tx = t.x + 0.5;
                    const ty = t.y + 0.5;
                    const y = evalExprAt(astNode, tx);
                    if (y === null || Math.abs(y - ty) >= 0.5) return false;
                }
                for (const f of forbidden) {
                    const fx = f.x + 0.5;
                    const fy = f.y + 0.5;
                    const y = evalExprAt(astNode, fx);
                    if (y !== null && Math.abs(y - fy) < 0.5) return false;
                }
                return true;
            };

            const buildCase = (simRound, useSpecial, presetQuestion = null) => {
                const half = 5;
                let targetCount = 1;
                if(difficulty === 'normal' || difficulty === 'hard') targetCount = 2;
                if(difficulty === 'expert') targetCount = 3;

                if (presetQuestion) {
                    return {
                        simRound: presetQuestion.simRound,
                        targets: presetQuestion.targets.map(c => ({ ...c })),
                        forbidden: presetQuestion.forbidden.map(c => ({ ...c })),
                        lockedOps: [...presetQuestion.lockedOps],
                        lockedDigits: [...presetQuestion.lockedDigits],
                        lockDecimal: presetQuestion.lockDecimal
                    };
                }

                const targets = [];
                const forbidden = [];
                const lockedOps = [];
                const lockedDigits = [];
                let lockDecimal = false;

                for (let t = 0; t < targetCount; t++) uniquePushCell(targets, randomCell(half));
                while (targets.length < targetCount) uniquePushCell(targets, randomCell(half));

                let maxForbidden = 3;
                if (simRound <= 8) maxForbidden = 1;
                else if (simRound <= 16) maxForbidden = 2;
                const forbiddenCount = randInt(0, maxForbidden);
                for (let f = 0; f < forbiddenCount; f++) {
                    const c = randomCell(half);
                    if (!targets.some(t => sameCell(t, c))) uniquePushCell(forbidden, c);
                }

                if (useSpecial) {
                    // 加强：绿格同列（在原 1/20 基础上叠加一次增强采样）
                    if (targets.length >= 2 && (chance(1 / 20) || chance(1 / 12))) {
                        const colX = randInt(-half, half - 1);
                        for (let idx = 0; idx < targets.length; idx++) {
                            targets[idx].x = colX;
                        }
                    }

                    // 1/20：第一绿格周围8格内有不同数量红格
                    if (chance(1 / 20) && targets.length > 0) {
                        const c = targets[0];
                        const around = [];
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = c.x + dx, ny = c.y + dy;
                                if (nx >= -half && nx < half && ny >= -half && ny < half) {
                                    around.push({ x: nx, y: ny });
                                }
                            }
                        }
                        const pick = Math.min(around.length, randInt(1, 5));
                        for (let p = 0; p < pick; p++) {
                            uniquePushCell(forbidden, around[p]);
                        }
                    }

                    // 1/40：红格在两个绿格连线上
                    if (chance(1 / 40) && targets.length >= 2) {
                        const a = targets[0], b = targets[1];
                        const mx = (a.x + b.x) / 2;
                        const my = (a.y + b.y) / 2;
                        if (Number.isInteger(mx) && Number.isInteger(my)) {
                            const mid = { x: mx, y: my };
                            if (!targets.some(t => sameCell(t, mid))) uniquePushCell(forbidden, mid);
                        }
                    }

                    // 1/40：红格在两绿格作坐标轴平行线交点
                    if (chance(1 / 40) && targets.length >= 2) {
                        const a = targets[0], b = targets[1];
                        const cross1 = { x: a.x, y: b.y };
                        const cross2 = { x: b.x, y: a.y };
                        if (!targets.some(t => sameCell(t, cross1))) uniquePushCell(forbidden, cross1);
                        if (!targets.some(t => sameCell(t, cross2)) && chance(0.5)) uniquePushCell(forbidden, cross2);
                    }

                    // 1/40：四则运算+乘方+小数点被锁（简单模式仅 ^ 和 .）
                    if (chance(1 / 40)) {
                        if (difficulty === 'easy') {
                            if (chance(0.8)) lockedOps.push('^');
                            lockDecimal = true;
                        } else {
                            const candidates = ['+', '-', '*', '/', '^'];
                            for (const op of candidates) {
                                if (chance(0.5)) lockedOps.push(op);
                            }
                            if (lockedOps.length === 0) lockedOps.push('^');
                            lockDecimal = chance(0.7);
                        }
                    }

                    // 1/40：数字被锁
                    if (chance(1 / 40)) {
                        const lockCount = randInt(1, 3);
                        while (lockedDigits.length < lockCount) {
                            const d = String(randInt(0, 9));
                            if (!lockedDigits.includes(d)) lockedDigits.push(d);
                        }
                    }
                }

                return { simRound, targets, forbidden, lockedOps, lockedDigits, lockDecimal };
            };

            const isExpressionAllowed = (expr, qaCase) => {
                for (const op of qaCase.lockedOps) {
                    if (expr.includes(op)) return false;
                }
                if (qaCase.lockDecimal && expr.includes('.')) return false;
                for (const d of qaCase.lockedDigits) {
                    if (expr.includes(d)) return false;
                }
                return true;
            };

            const batchProcess = () => {
                const loopCount = Math.min(chunk, TOTAL_ITERATIONS - i);

                for (let k = 0; k < loopCount; k++) {
                    const globalIndex = i + k;
                    const inFirstPhase = globalIndex < FIRST_PHASE;
                    const inWrongCollectWindow = inFirstPhase && globalIndex >= WRONG_COLLECT_START;
                    const inReviewPhase = !inFirstPhase;

                    let qaCase = null;
                    let reviewPickIndex = -1;
                    if (inReviewPhase && wrongQuestions.length > 0) {
                        reviewPickIndex = Math.floor(Math.random() * wrongQuestions.length);
                        qaCase = buildCase(1, false, wrongQuestions[reviewPickIndex]);
                    } else {
                        const simRound = randInt(1, 24);
                        qaCase = buildCase(simRound, inFirstPhase);
                    }

                    // 基础锁定规则 + 特殊规则叠加（特殊规则可能与普通规则同时出现）
                    let maxLock = 2;
                    if (qaCase.simRound <= 4) maxLock = 0;
                    else if (qaCase.simRound <= 12) maxLock = 1;
                    const randomLocks = [];
                    let lockableOps = opsCollection.filter(op => op !== 'x');
                    for (let l = 0; l < maxLock; l++) {
                        if (lockableOps.length === 0) break;
                        const idx = Math.floor(Math.random() * lockableOps.length);
                        randomLocks.push(lockableOps[idx]);
                        lockableOps.splice(idx, 1);
                    }
                    const lockedOps = [...new Set([...randomLocks, ...qaCase.lockedOps])];
                    const availableOps = opsCollection.filter(op => !lockedOps.includes(op));

                    const depth = randInt(1, 3);
                    const astNode = generateASTNode(depth, availableOps);
                    const rndFunc = astToString(astNode);
                    if (!isExpressionAllowed(rndFunc, qaCase)) continue;

                    const v1 = evalExprAt(astNode, -2);
                    const v2 = evalExprAt(astNode, 0);
                    const v3 = evalExprAt(astNode, 3);
                    const basicValid = v1 !== null && v2 !== null && v3 !== null &&
                        v1 !== v3 && Math.abs(v1) < 1000 && Math.abs(v3) < 1000;
                    if (!basicValid || rndFunc.length >= 60 || rndFunc.includes('NaN')) {
                        continue;
                    }

                    const passCase = verifyCase(astNode, qaCase.targets, qaCase.forbidden);
                    if (passCase) {
                        modelWeights.best_functions.push(rndFunc);
                        if (modelWeights.best_functions.length > 5000) modelWeights.best_functions.shift();

                        if (inReviewPhase && wrongQuestions.length > 0) {
                            reviewSolved++;
                            if (reviewPickIndex >= 0 && reviewPickIndex < wrongQuestions.length) {
                                wrongQuestions.splice(reviewPickIndex, 1);
                            }
                        }
                    } else if (inWrongCollectWindow && chance(0.18) && wrongQuestions.length < MAX_WRONG_QUESTIONS) {
                        wrongQuestions.push({
                            simRound: qaCase.simRound,
                            targets: qaCase.targets.map(c => ({ ...c })),
                            forbidden: qaCase.forbidden.map(c => ({ ...c })),
                            lockedOps: [...qaCase.lockedOps],
                            lockedDigits: [...qaCase.lockedDigits],
                            lockDecimal: qaCase.lockDecimal
                        });
                        wrongLogged++;
                    }
                }

                i += loopCount;

                if (i % (chunk * 4) === 0 || i <= chunk) {
                    let op = opsCollection[Math.floor(Math.random() * opsCollection.length)];
                    let type = [
                        '目标区捕捉场优化', 
                        '禁区引力规避矩阵', 
                        '常数锁定权重分配', 
                        '算子拓扑剪枝', 
                        '高维空间漫步', 
                        '符号允许域穷举'
                    ][Math.floor(Math.random()*6)];

                    logsArray.push(
                        `Epoch ${i}: ${type} [抓取组合=${op}, 记忆池=${modelWeights.best_functions.length}, 错题池=${wrongQuestions.length}]`
                    );
                    if(logsArray.length > 4) logsArray.shift();
                }

                this.updateUI(i, TOTAL_ITERATIONS, logsArray);

                if (i >= TOTAL_ITERATIONS) {
                    this.isTraining = false;
                    setTimeout(() => {
                        this.progressModal.style.display = 'none';
                        // 记录训练成功标志与参数权重，保证实打实的提升
                        localStorage.setItem(`summa_model_v2_${difficulty}`, JSON.stringify(modelWeights));
                        window.summaCharacter && window.summaCharacter.speak("startGame", "smug");
                        const msgBox = document.getElementById('summa-message');
                        if(msgBox) {
                            msgBox.textContent = `训练完毕[${difficulty}] 记忆池:${modelWeights.best_functions.length} 错题记录:${wrongLogged} 复练命中:${reviewSolved}`;
                            msgBox.classList.add('visible');
                            setTimeout(() => msgBox.classList.remove('visible'), 5000);
                        }
                        resolve();
                    }, 500);
                    return;
                }
                
                // 极致性能：跳出宏任务序列
                setTimeout(batchProcess, 0);
            };
            
            batchProcess();
        });
    }
}

window.SummaTrainer = SummaTrainer;
