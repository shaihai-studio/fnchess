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

class AIFunctionBuilderMulti {
    constructor(ai) { this.ai = ai; }

    constructMultiTargetFunction(targetCells, forbiddenCells, lockedElements, strategy) {
        const attempts = 100;  // 增加尝试次数从30到100
        const difficulty = this.ai.gameController.difficulty;
        const decimalLocked = lockedElements.includes('.');

        for (let i = 0; i < attempts; i++) {
            let expression = null;

            // 根据难度选择函数类型
            const funcType = this.ai.selectFunctionTypeByDifficulty(difficulty, strategy);

            // 随机选择2-3个目标格
            const numTargets = Math.min(Math.floor(Math.random() * 2) + 2, targetCells.length);
            const selectedTargets = this.ai.selectRandomTargets(targetCells, numTargets);

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

                    if (this.ai.isValidExpression(steepExpr, lockedElements)) {
                        // 验证是否穿过目标
                        const hitCount = this.ai.countTargetHits(steepExpr, targetCells, forbiddenCells);
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

                if (this.ai.isValidExpression(expression, lockedElements)) {
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
                            expression = this.ai.formatLinearExpression(slope.toString(), intercept.toString());
                        }
                    } else {
                        const slope = (y2 - y1) / (x2 - x1);
                        const intercept = y1 - slope * x1;
                        if (Math.abs(slope) <= 5 && Math.abs(intercept) <= 20) {
                            const a = slope.toFixed(1);
                            const b = intercept.toFixed(1);
                            expression = this.ai.formatLinearExpression(a, b);
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

                case 9: // ln函数 (不适合多目标)
                    // ln函数很难同时穿过两个点，跳过
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

            if (expression && this.ai.isValidExpression(expression, lockedElements)) {
                console.log(`[AI] 尝试多目标函数: ${expression}`);
                const hitCount = this.ai.countTargetHits(expression, targetCells, forbiddenCells);
                if (hitCount >= 2) {
                    console.log(`[AI] 找到有效多目标函数: ${expression}，穿过 ${hitCount} 个目标格`);
                    return expression;
                }
            }
        }

        return null;
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AIFunctionBuilderMulti;