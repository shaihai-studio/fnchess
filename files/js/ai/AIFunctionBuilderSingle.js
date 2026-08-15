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

class AIFunctionBuilderSingle {
    constructor(ai) { this.ai = ai; }

    constructSingleTargetFunction(tx, ty, targetCells, forbiddenCells, lockedElements, strategy) {
        const attempts = 20;
        const difficulty = this.ai.gameController.difficulty;
        const decimalLocked = lockedElements.includes('.');

        for (let i = 0; i < attempts; i++) {
            let expression = null;

            // 根据难度选择不同的函数类型概率
            const funcType = this.ai.selectFunctionTypeByDifficulty(difficulty, strategy);

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
                            expression = this.ai.formatLinearExpression(a1.toString(), b1.toString());
                        } else {
                            // 截距太大，使用随机整数
                            const a_rand = Math.round(Math.random() * 2 - 1);
                            const b_rand = Math.round(ty - a_rand * tx);
                            expression = this.ai.formatLinearExpression(a_rand.toString(), b_rand.toString());
                        }
                    } else {
                        const a1 = (Math.random() * 4 - 2).toFixed(1);
                        const b1 = (ty - parseFloat(a1) * tx).toFixed(1);
                        expression = this.ai.formatLinearExpression(a1, b1);
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

                case 9: // ln函数 y = a*ln(bx) + c
                    if (decimalLocked) {
                        const a = Math.round(Math.random() * 2 + 1);
                        const b = Math.round(Math.random() + 1);
                        const c = Math.round(ty - a * Math.log(b * Math.abs(tx)));
                        if (Math.abs(c) <= 20) {
                            expression = `${a}*ln(${b}*x)+${c}`;
                        }
                    } else {
                        const a = (Math.random() * 2 + 1).toFixed(1);
                        const b = (Math.random() + 0.5).toFixed(1);
                        const c = (ty - parseFloat(a) * Math.log(parseFloat(b) * Math.abs(tx))).toFixed(1);
                        if (Math.abs(parseFloat(c)) <= 20) {
                            expression = `${a}*ln(${b}*x)+${c}`;
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

            if (expression && this.ai.isValidExpression(expression, lockedElements)) {
                console.log(`[AI] 尝试函数: ${expression}`);
                if (this.ai.checkFunctionHitsTarget(expression, targetCells, forbiddenCells)) {
                    console.log(`[AI] 找到有效函数: ${expression}`);
                    return expression;
                }
            }
        }

        return null;
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AIFunctionBuilderSingle;