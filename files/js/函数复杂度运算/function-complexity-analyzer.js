/**
 * 函数复杂度分析器 V2
 * 新规则：
 * - x → 1
 * - 常数 → 0
 * - sin/cos/tan/!/f(x) → 1 + y(内部)
 * - 乘法 → y(f) + y(g)
 * - 加法 → max(y(f), y(g))
 * - 未说明运算符（^, /等）→ 2
 */

class FunctionComplexityAnalyzer {
    constructor() {
        // 基本函数列表（sin, cos, tan, 阶乘等）
        this.basicFunctions = ['sin', 'cos', 'tan', 'abs', 'log', 'ln', 'exp'];
    }

    /**
     * 分析函数表达式的复杂度
     * @param {string} expression - 函数表达式
     * @returns {number} 复杂度值
     */
    analyze(expression) {
        // 清理表达式
        const expr = this.cleanExpression(expression);
        return this.parseExpression(expr);
    }

    /**
     * 清理表达式
     */
    cleanExpression(expr) {
        return expr.replace(/\s+/g, '').trim();
    }

    /**
     * 解析表达式
     */
    parseExpression(expr) {
        // 1. 检查是否为常数（不包含 x）
        if (!this.containsVariable(expr)) {
            return 0;
        }

        // 2. 去除外层括号
        expr = this.removeOuterParentheses(expr);

        // 3. 处理加法（取 max）
        const addTerms = this.splitByOperator(expr, '+', '-');
        if (addTerms.length > 1) {
            return Math.max(...addTerms.map(term => this.parseExpression(term)));
        }
        
        // 3.5 处理未说明的运算符（^, / 等）→ 返回 2
        // 必须在乘法之前检查，因为 / 不应该被当作乘法处理
        if (expr.includes('^') || expr.includes('/')) {
            return 2;
        }

        // 4. 处理乘法（累加）
        const mulTerms = this.splitByOperator(expr, '*', '×');
        if (mulTerms.length > 1) {
            return mulTerms.reduce((sum, term) => sum + this.parseExpression(term), 0);
        }

        // 5. 处理基本函数 sin, cos, tan 等
        for (const func of this.basicFunctions) {
            if (expr.startsWith(func + '(')) {
                const innerContent = this.extractInnerContent(expr);
                if (innerContent !== null) {
                    return 1 + this.parseExpression(innerContent);
                }
            }
        }

        // 6. 处理阶乘 x!
        if (expr.endsWith('!')) {
            const innerExpr = expr.slice(0, -1);
            return 1 + this.parseExpression(innerExpr);
        }

        // 7. 处理简单变量 x
        if (expr === 'x') {
            return 1;
        }

        // 8. 处理系数*x 或 系数x
        if (/^[0-9.]*\*?x$/.test(expr)) {
            return 1;
        }

        // 9. 默认返回 1
        return 1;
    }

    /**
     * 检查表达式是否包含变量 x
     */
    containsVariable(expr) {
        return expr.includes('x');
    }

    /**
     * 去除外层括号
     */
    removeOuterParentheses(expr) {
        if (expr.startsWith('(') && expr.endsWith(')')) {
            let parenDepth = 0;
            let isValid = true;
            
            for (let i = 0; i < expr.length - 1; i++) {
                if (expr[i] === '(') {
                    parenDepth++;
                } else if (expr[i] === ')') {
                    parenDepth--;
                }
                
                if (parenDepth === 0 && i < expr.length - 2) {
                    isValid = false;
                    break;
                }
            }
            
            if (isValid && parenDepth === 1) {
                return expr.slice(1, -1);
            }
        }
        return expr;
    }

    /**
     * 按运算符分割表达式
     */
    splitByOperator(expr, ...operators) {
        const terms = [];
        let current = '';
        let parenDepth = 0;

        for (let i = 0; i < expr.length; i++) {
            const char = expr[i];
            
            if (char === '(') {
                parenDepth++;
                current += char;
            } else if (char === ')') {
                parenDepth--;
                current += char;
            } else if (operators.includes(char) && parenDepth === 0) {
                if (current) {
                    terms.push(current);
                }
                current = '';
            } else {
                current += char;
            }
        }

        if (current) {
            terms.push(current);
        }

        return terms.length > 1 ? terms : [expr];
    }

    /**
     * 提取括号内的内容
     */
    extractInnerContent(expr) {
        const startIdx = expr.indexOf('(');
        if (startIdx === -1) {
            return null;
        }

        let parenDepth = 0;
        let endIdx = -1;

        for (let i = startIdx; i < expr.length; i++) {
            if (expr[i] === '(') {
                parenDepth++;
            } else if (expr[i] === ')') {
                parenDepth--;
                if (parenDepth === 0) {
                    endIdx = i;
                    break;
                }
            }
        }

        if (endIdx !== -1) {
            return expr.substring(startIdx + 1, endIdx);
        }

        return null;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionComplexityAnalyzer;
}

// 使用示例
if (typeof window !== 'undefined') {
    window.FunctionComplexityAnalyzer = FunctionComplexityAnalyzer;
}
