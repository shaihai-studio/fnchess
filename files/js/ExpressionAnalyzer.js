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

class ExpressionAnalyzer {
    constructor(parent) { this.parent = parent; }

    validateSyntax(expression) {
        if (!expression || expression.trim() === '') {
            return { valid: false, error: '表达式不能为空' };
        }

        // 检查括号匹配
        let bracketCount = 0;
        for (const char of expression) {
            if (char === '(') bracketCount++;
            if (char === ')') bracketCount--;
            if (bracketCount < 0) {
                return { valid: false, error: '括号不匹配' };
            }
        }
        if (bracketCount !== 0) {
            return { valid: false, error: '括号不匹配' };
        }

        // 尝试计算多个测试点（包括定义域外的复数情况）
        const testPoints = [0, 1, -1, 0.5, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -3, 5, -5, 10, -10];
        let validCount = 0;
        for (const x of testPoints) {
            const result = this.parent.evaluate(expression, x);
            // 正确处理复数：null表示NaN/无穷大，复数对象（虚部为0）表示有效实数值
            if (result !== null) {
                if (typeof result === 'object') {
                    // 复数结果：虚部为0才是有效实数，否则视为无效（定义域外）
                    if (result.im === 0 && isFinite(result.re)) {
                        validCount++;
                    }
                } else if (isFinite(result)) {
                    validCount++;
                }
            }
        }
        if (validCount === 0) {
            return { valid: false, error: '表达式计算错误，请检查语法' };
        }
        return { valid: true, error: null };
    }

    validateExpressionForLocks(expression) {
        const cleanExpr = expression.replace(/\s/g, '');
        for (const locked of this.parent.lockedElements) {
            const pattern = new RegExp(`(^|[^a-zA-Z0-9])${locked}([^a-zA-Z0-9]|$)`);
            if (pattern.test(cleanExpr) || cleanExpr.includes(locked)) {
                if (this.containsElement(cleanExpr, locked)) {
                    return { valid: false, lockedElement: locked };
                }
            }
        }
        return { valid: true, lockedElement: null };
    }

    getPolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');

        const nonPolyPattern = /(sin|cos|tan|arcsin|arccos|arctan|exp|ln|log|sqrt|abs)/;
        if (nonPolyPattern.test(cleanExpr)) return -1;
        if (cleanExpr.includes('!')) return -1;
        if (cleanExpr.includes('(-1)^(1/2)') || cleanExpr.includes('(-1)^0.5') || cleanExpr.includes('i')) return -1;

        let maxDegree = 0;

        const compositePattern = /\(([^()]+)\)\^(\d+)/g;
        let match;
        while ((match = compositePattern.exec(cleanExpr)) !== null) {
            const innerExpr = match[1];
            const outerPower = parseInt(match[2]);
            const innerDegree = this.getSimplePolynomialDegree(innerExpr);
            if (innerDegree > 0) {
                const totalDegree = innerDegree * outerPower;
                if (totalDegree > maxDegree) maxDegree = totalDegree;
            }
        }

        const caretPattern = /(?:^|[^\d.])([\d.]+)?\*?x\^(\d+)/g;
        while ((match = caretPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            const degree = parseInt(match[2]);
            if (coefficient !== 0 && degree > maxDegree) maxDegree = degree;
        }

        const powerPattern = /(?:^|[^\d.])([\d.]+)?\*?x\*\*(\d+)/g;
        while ((match = powerPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            const degree = parseInt(match[2]);
            if (coefficient !== 0 && degree > maxDegree) maxDegree = degree;
        }

        const xPattern = /(?:^|[^\d.])([\d.]+)?\*?x(?![\^\d*])/g;
        while ((match = xPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            if (coefficient !== 0 && maxDegree < 1) maxDegree = 1;
        }

        if (cleanExpr === 'x' && maxDegree < 1) maxDegree = 1;
        return maxDegree;
    }

    getSimplePolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        let maxDegree = 0;
        const caretPattern = /x\^(\d+)/g;
        let match;
        while ((match = caretPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) maxDegree = degree;
        }
        const powerPattern = /x\*\*(\d+)/g;
        while ((match = powerPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) maxDegree = degree;
        }
        if (cleanExpr.includes('x') && maxDegree < 1) maxDegree = 1;
        return maxDegree;
    }

    getNumeratorDegree(expression) {
        const slashIndex = expression.indexOf('/');
        if (slashIndex === -1) return 0;
        const numerator = expression.substring(0, slashIndex);
        return this.getPolynomialDegree(numerator);
    }

    getDenominatorDegree(expression) {
        const slashIndex = expression.indexOf('/');
        if (slashIndex === -1) return 0;
        let denominator = expression.substring(slashIndex + 1);
        if (denominator.startsWith('(')) {
            denominator = this.extractParenthesesContent(denominator);
        }
        const powerMatch = denominator.match(/\^\s*(\d+)$/);
        const powerMatch2 = denominator.match(/\*\*\s*(\d+)$/);
        if (powerMatch || powerMatch2) {
            const power = parseInt((powerMatch || powerMatch2)[1]);
            const baseExpr = denominator.replace(/[\^\*]+\s*\d+$/, '');
            const baseDegree = this.getPolynomialDegree(baseExpr);
            return baseDegree > 0 ? baseDegree * power : power;
        }
        return this.getPolynomialDegree(denominator);
    }

    extractParenthesesContent(str) {
        if (!str.startsWith('(')) return str;
        let depth = 0;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '(') depth++;
            else if (str[i] === ')') {
                depth--;
                if (depth === 0) return str.substring(0, i + 1);
            }
        }
        return str;
    }

    testEulerFormula() {
        const testCases = [
            { expr: 'e^(i*π)', expected: -1 },
            { expr: 'e^(π*i)', expected: -1 },
            { expr: 'e^(i*2*π)', expected: 1 },
            { expr: 'e^(2*i*π)', expected: 1 },
            { expr: 'e^(iπ)', expected: -1 },
            { expr: 'e^(πi)', expected: -1 },
            { expr: 'i^2', expected: -1 },
            { expr: 'ii', expected: -1 },
            { expr: 'i^3', expected: -1, isPureImag: true },
            { expr: 'i^4', expected: 1 },
        ];
        const results = [];
        for (const test of testCases) {
            const result = this.parent.evaluate(test.expr, 0);
            let passed;
            if (test.isPureImag) {
                // i^3 = -i，结果是复数对象 {re:0, im:-1}
                passed = result && typeof result === 'object' && Math.abs(result.im - test.expected) < 1e-10 && Math.abs(result.re) < 1e-10;
            } else {
                passed = Math.abs(result - test.expected) < 1e-10;
            }
            results.push({
                expression: test.expr,
                result: result,
                expected: test.expected,
                passed
            });
        }
        return results;
    }

    testLogWithoutParen() {
        const testCases = [
            { expr: 'ln(e)', expected: 1 },
            { expr: 'ln(1)', expected: 0 },
            { expr: 'sin(x)', x: 0, expected: 0 },
            { expr: 'cos(x)', x: 0, expected: 1 },
            { expr: 'tan(x)', x: 0, expected: 0 },
            { expr: 'abs(x)', x: -5, expected: 5 },
            { expr: 'sqrt(x)', x: 4, expected: 2 },
            { expr: 'e^x', x: 0, expected: 1 },
            { expr: 'e^x', x: 1, expected: Math.E },
            { expr: 'π^x', x: 0, expected: 1 },
            { expr: 'π^x', x: 1, expected: Math.PI },
            { expr: 'e^(2*x)', x: 1, expected: Math.E * Math.E },
            { expr: 'x^2', x: 3, expected: 9 },
            { expr: '2x', x: 3, expected: 6 },
            { expr: '2(x+1)', x: 3, expected: 8 },
            { expr: '3!', expected: 6 },
        ];
        const results = [];
        for (const test of testCases) {
            const x = test.x !== undefined ? test.x : 1;
            const result = this.parent.evaluate(test.expr, x);
            results.push({
                expression: test.expr,
                x,
                result: result,
                expected: test.expected,
                passed: Math.abs(result - test.expected) < 1e-10
            });
        }
        return results;
    }

    containsElement(expression, element) {
        if (/^\d+$/.test(element)) {
            return expression.includes(element);
        }
        const escaped = element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(expression);
    }

    analyzeFunctionType(expression) {
        const cleanExpr = expression.replace(/\s+/g, '').replace(/[()（）]/g, '');
        let length = 0;
        const tokenRegex = /(sin|cos|tan|arcsin|arccos|arctan|abs|exp|ln|log|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
        while (tokenRegex.exec(cleanExpr) !== null) {
            length++;
        }
        if (length === 0 && cleanExpr.length > 0) {
            length = cleanExpr.length;
        }
        let targetScore = 1;
        if (length === 1 || length === 2) targetScore = 5;
        else if (length >= 3 && length <= 5) targetScore = 4;
        else if (length >= 6 && length <= 9) targetScore = 3;
        else if (length >= 10 && length <= 15) targetScore = 2;
        else targetScore = 1;
        return { type: `len_${length}`, score: targetScore };
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=ExpressionAnalyzer;