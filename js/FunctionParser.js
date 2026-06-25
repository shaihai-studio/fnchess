/**
 * FunctionParser 模块
 * 负责解析函数表达式，计算函数值
 * 支持：多项式、abs、sin/cos/tan、1/x、exp、复数运算
 *
 * 求值引擎与 geogebra-lite/parser.js 保持同步：
 * tokenize → insertImplicitMultiplication → parse(递归下降) → evalAst(复数运算)
 */
class FunctionParser {
    constructor() {
        // 支持的运算符和函数
        this.operators = ['+', '-', '*', '/', '^'];
        this.functions = ['sin', 'cos', 'tan', 'abs', 'ln', 'sqrt'];
        // 复数常量（与 geogebra-lite 一致）
        this.constants = { pi: { re: Math.PI, im: 0 }, e: { re: Math.E, im: 0 }, i: { re: 0, im: 1 } };

        // 锁定元素列表
        this.lockedElements = [];

        // 元素分类（用于构建拖拽元素）
        this.elementCategories = {
            variable: ['x'],
            numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'π', 'e', 'i'],
            basicOperators: ['+', '-', '*', '/'],
            operators: ['.', '^', '!', '(', ')'],
            functions: ['sin', 'cos', 'tan', 'abs', 'ln', 'sqrt']
        };

        // 初始化函数复杂度分析器
        if (typeof FunctionComplexityAnalyzer !== 'undefined') {
            this.complexityAnalyzer = new FunctionComplexityAnalyzer();
        }
    }

    // ========== 复数运算体系（与 geogebra-lite 同步） ==========

    toComplex(v) {
        if (v && typeof v === 'object' && 're' in v && 'im' in v) return v;
        return { re: Number(v), im: 0 };
    }

    cAdd(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re + b.re, im: a.im + b.im }; }
    cSub(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re - b.re, im: a.im - b.im }; }
    cMul(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
    cDiv(a, b) {
        a = this.toComplex(a); b = this.toComplex(b);
        const d = b.re * b.re + b.im * b.im;
        if (d === 0) return { re: NaN, im: NaN };
        return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    }
    cNeg(a) { a = this.toComplex(a); return { re: -a.re, im: -a.im }; }
    cPow(a, b) {
        a = this.toComplex(a); b = this.toComplex(b);
        const r = Math.hypot(a.re, a.im);
        const theta = Math.atan2(a.im, a.re);
        const lnR = Math.log(r);
        const x = Math.exp(lnR * b.re - b.im * theta);
        const y = lnR * b.im + b.re * theta;
        return { re: x * Math.cos(y), im: x * Math.sin(y) };
    }
    cAbs(a) { a = this.toComplex(a); return { re: Math.hypot(a.re, a.im), im: 0 }; }
    cLn(a) { a = this.toComplex(a); return { re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) }; }
    cSin(a) { a = this.toComplex(a); return { re: Math.sin(a.re) * Math.cosh(a.im), im: Math.cos(a.re) * Math.sinh(a.im) }; }
    cCos(a) { a = this.toComplex(a); return { re: Math.cos(a.re) * Math.cosh(a.im), im: -Math.sin(a.re) * Math.sinh(a.im) }; }
    cTan(a) { const s = this.cSin(a), c = this.cCos(a); return this.cDiv(s, c); }
    cSqrt(a) { return this.cPow(a, { re: 0.5, im: 0 }); }
    cFactorial(a) {
        a = this.toComplex(a);
        if (a.im !== 0) return { re: NaN, im: NaN };
        const n = a.re + 1; // gamma 参数 = x + 1
        // 负整数处的 gamma 是极点 → 返回 NaN
        if (n <= 0 && Math.abs(n - Math.round(n)) < 1e-10) return { re: NaN, im: NaN };
        // 距离负整数非常近（<0.005）→ 也是极点，值极大且视觉无用
        if (n <= 0 && Math.abs(n - Math.round(n)) < 0.005) return { re: NaN, im: NaN };
        return this.toComplex(this.gamma(n));
    }

    // ========== 伽马函数（与 geogebra-lite 同步） ==========

    gamma(z) {
        if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
        const p = [
            676.5203681218851, -1259.1392167224028, 771.32342877765313,
            -176.61502916214059, 12.507343278686905, -0.13857109526572012,
            9.9843695780195716e-6, 1.5056327351493117e-7
        ];
        z -= 1;
        let x = 0.99999999999980993;
        for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
        const t = z + p.length - 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    // ========== 复数 → 实数转换 ==========

    complexToNumber(v) {
        const c = this.toComplex(v);
        if (!Number.isFinite(c.re) || !Number.isFinite(c.im)) return null;
        // 虚部足够小 → 视为实数（处理 (-x)^n 整数幂的浮点精度问题）
        const imTolerance = Math.max(1e-10, Math.abs(c.re) * 1e-10);
        if (Math.abs(c.im) < imTolerance) return c.re;
        return null; // 有显著虚部 → 实数范围内无定义，返回 null
    }

    // ========== Tokenizer（与 geogebra-lite 同步） ==========

    tokenize(expr) {
        const tokens = [];
        let i = 0;
        const s = expr.replace(/\s+/g, '').replace(/π/g, 'pi');
        while (i < s.length) {
            const ch = s[i];
            if (/[0-9.]/.test(ch)) {
                let num = ch; i++;
                while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
                tokens.push({ type: 'number', value: parseFloat(num) });
                continue;
            }
            const fn = this.functions.find(f => s.slice(i).toLowerCase().startsWith(f));
            if (fn) { tokens.push({ type: 'fn', value: fn }); i += fn.length; continue; }
            if (s.slice(i, i + 2).toLowerCase() === 'pi') { tokens.push({ type: 'const', value: 'pi' }); i += 2; continue; }
            if (ch === 'e') { tokens.push({ type: 'const', value: 'e' }); i++; continue; }
            if (ch === 'i') { tokens.push({ type: 'const', value: 'i' }); i++; continue; }
            if (ch === 'x' || ch === 'X') { tokens.push({ type: 'var', value: 'x' }); i++; continue; }
            if ('+-*/^!()'.includes(ch)) { tokens.push({ type: ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : 'op', value: ch }); i++; continue; }
            throw new Error(`无法识别字符: ${ch}`);
        }
        return this.insertImplicitMultiplication(tokens);
    }

    // ========== 隐式乘法（与 geogebra-lite 同步） ==========

    insertImplicitMultiplication(tokens) {
        const out = [];
        const isLeft = t => ['number', 'var', 'const', 'rparen', 'fac'].includes(t.type) || (t.type === 'op' && t.value === '!');
        const isRight = t => ['number', 'var', 'const', 'fn', 'lparen'].includes(t.type);
        for (let i = 0; i < tokens.length; i++) {
            const a = out[out.length - 1], b = tokens[i];
            if (a && isLeft(a) && isRight(b)) out.push({ type: 'imult', value: '*' });
            out.push(b);
        }
        return out;
    }

    // ========== 递归下降解析器（与 geogebra-lite 同步） ==========

    parse(expr) {
        const tokens = this.tokenize(expr);
        let p = 0;
        const peek = () => tokens[p];
        const eat = () => tokens[p++];

        const primary = () => {
            const t = eat();
            if (!t) throw new Error('表达式不完整');
            if (t.type === 'number') return { t: 'num', v: t.value };
            if (t.type === 'var') return { t: 'x' };
            if (t.type === 'const') return { t: 'const', v: t.value };
            if (t.type === 'lparen') { const n = add(); if (!peek() || peek().type !== 'rparen') throw new Error('缺少右括号'); eat(); return n; }
            if (t.type === 'fn') {
                if (peek() && peek().type === 'lparen') {
                    eat(); // 吃掉 '('
                    const arg = add(); // 解析括号内表达式
                    if (!peek() || peek().type !== 'rparen') throw new Error('缺少右括号');
                    eat(); // 吃掉 ')'
                    return { t: 'fn', n: t.value, a: arg };
                }
                return { t: 'fn', n: t.value, a: primary() };
            }
            throw new Error('语法错误');
        };

        const postfix = () => {
            let n = primary();
            while (peek() && peek().type === 'op' && peek().value === '!') { eat(); n = { t: 'fac', a: n }; }
            return n;
        };

        const powerLeaf = () => {
            let n = postfix();
            if (peek() && peek().type === 'op' && peek().value === '^') { eat(); n = { t: '^', l: n, r: powerRight() }; }
            return n;
        };

        const powerRight = () => {
            let n = powerLeaf();
            while (peek() && peek().type === 'imult') {
                eat();
                const r = powerLeaf();
                n = { t: '*', l: n, r };
            }
            return n;
        };

        const unary = () => {
            if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
                const op = eat().value;
                const n = unary();
                return op === '-' ? { t: 'neg', a: n } : n;
            }
            return powerLeaf();
        };

        const implicitMul = () => {
            let n = unary();
            while (peek() && peek().type === 'imult') {
                eat();
                const r = unary();
                n = { t: '*', l: n, r };
            }
            return n;
        };

        const mul = () => {
            let n = implicitMul();
            while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
                const op = eat().value;
                const r = implicitMul();
                n = { t: op, l: n, r };
            }
            return n;
        };

        const add = () => {
            let n = mul();
            while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
                const op = eat().value;
                const r = mul();
                n = { t: op, l: n, r };
            }
            return n;
        };

        const ast = add();
        if (p !== tokens.length) throw new Error('表达式无法完整解析');
        return ast;
    }

    // ========== AST 求值器（与 geogebra-lite 同步） ==========

    evalAst(node, x) {
        switch (node.t) {
            case 'num': return node.v;
            case 'x': return x;
            case 'const': return this.constants[node.v];
            case 'neg': return this.cNeg(this.evalAst(node.a, x));
            case '+': return this.cAdd(this.evalAst(node.l, x), this.evalAst(node.r, x));
            case '-': return this.cSub(this.evalAst(node.l, x), this.evalAst(node.r, x));
            case '*': return this.cMul(this.evalAst(node.l, x), this.evalAst(node.r, x));
            case '/': return this.cDiv(this.evalAst(node.l, x), this.evalAst(node.r, x));
            case '^': {
                const left = this.evalAst(node.l, x);
                const right = this.evalAst(node.r, x);
                const a = this.toComplex(left);
                const b = this.toComplex(right);
                if (a.im === 0 && a.re === 0) {
                    if (b.im === 0 && b.re > 0) return 0;
                    return { re: NaN, im: NaN };
                }
                return this.cPow(left, right);
            }
            case 'fac': return this.cFactorial(this.evalAst(node.a, x));
            case 'fn': {
                const v = this.evalAst(node.a, x);
                switch (node.n) {
                    case 'sin': return this.cSin(v);
                    case 'cos': return this.cCos(v);
                    case 'tan': return this.cTan(v);
                    case 'abs': return this.cAbs(v);
                    case 'ln': return this.cLn(v);
                    case 'sqrt': {
                        const sv = this.evalAst(node.a, x);
                        const a = this.toComplex(sv);
                        if (a.im === 0 && a.re === 0) return 0;
                        return this.cSqrt(sv);
                    }
                    default: return { re: NaN, im: NaN };
                }
            }
            default: return NaN;
        }
    }

    // ========== 主求值方法 ==========

    evaluate(expression, x) {
        try {
            const v = this.evalAst(this.parse(expression), x);
            return this.complexToNumber(v);
        } catch {
            return null;
        }
    }

    /** 直接用预解析的 AST 求值，避免重复 parse 开销 */
    evaluateAst(ast, x) {
        try {
            const v = this.evalAst(ast, x);
            return this.complexToNumber(v);
        } catch {
            return null;
        }
    }

    clearCache() {
        // 预留给渲染器调用；当前解析器无持久缓存，保留接口用于统一清理
    }

    // ========== 锁定元素管理 ==========

    setLockedElements(elements) {
        this.lockedElements = [...elements];
    }

    clearLockedElements() {
        this.lockedElements = [];
    }

    isElementLocked(element) {
        return this.lockedElements.includes(element);
    }

    validateExpressionForLocks(expression) {
        const cleanExpr = expression.replace(/\s/g, '');
        for (const locked of this.lockedElements) {
            const pattern = new RegExp(`(^|[^a-zA-Z0-9])${locked}([^a-zA-Z0-9]|$)`);
            if (pattern.test(cleanExpr) || cleanExpr.includes(locked)) {
                if (this.containsElement(cleanExpr, locked)) {
                    return { valid: false, lockedElement: locked };
                }
            }
        }
        return { valid: true, lockedElement: null };
    }

    containsElement(expression, element) {
        if (/^\d+$/.test(element)) {
            return expression.includes(element);
        }
        const regex = new RegExp(`\\b${element}\\b`, 'i');
        return regex.test(expression);
    }

    // ========== 阶乘（兼容保留） ==========

    factorial(n) {
        if (n < 0 && Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 0 && Number.isInteger(n) && n <= 170) {
            let result = 1;
            for (let i = 2; i <= n; i++) result *= i;
            return result;
        }
        return this.gamma(n + 1);
    }

    // ========== 语法验证 ==========

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
            const result = this.evaluate(expression, x);
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

    // ========== 函数复杂度分析 ==========

    analyzeFunctionType(expression) {
        const cleanExpr = expression.replace(/\s+/g, '').replace(/[()（）]/g, '');
        let length = 0;
        const tokenRegex = /(sin|cos|tan|abs|exp|ln|log|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
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

    // ========== 多项式次数计算 ==========

    getPolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');

        const nonPolyPattern = /(sin|cos|tan|exp|ln|log|sqrt|abs)/;
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

    // ========== UI 辅助方法 ==========

    getAvailableElements() {
        const result = {};
        for (const [category, elements] of Object.entries(this.elementCategories)) {
            result[category] = elements.map(el => ({
                value: el,
                locked: this.isElementLocked(el)
            }));
        }
        return result;
    }

    formatExpression(expression) {
        let formatted = expression;
        formatted = formatted.replace(/([+\-*/^()])/g, ' $1 ');
        formatted = formatted.replace(/\s+/g, ' ').trim();
        return formatted;
    }

    // ========== 测试方法 ==========

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
            const result = this.evaluate(test.expr, 0);
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
            const result = this.evaluate(test.expr, x);
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
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionParser;
}
