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
        this.functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'floor', 'sgn', 'abs', 'ln', 'sqrt'];
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
            functions: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'floor', 'sgn', 'abs', 'ln', 'sqrt']
        };
    }

    // ========== 复数运算体系（与 geogebra-lite 同步） ==========

    toComplex(v) {
        if (v && typeof v === 'object' && 're' in v && 'im' in v) {
            // 归一化 -0 → 0，避免 atan2(-0, neg) = -π 污染辐角分支
            return { re: Object.is(v.re, -0) ? 0 : v.re, im: Object.is(v.im, -0) ? 0 : v.im };
        }
        const n = Number(v);
        return { re: Object.is(n, -0) ? 0 : n, im: 0 };
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
        // 实数整数次幂走精确路径：主值分支算 (-2)^3 会留下 2.9e-15 的虚部残差，
        // 一旦下游用精确比较（旧 validateSyntax 的 im===0）就会把 -8 判成「计算错误」。
        if (a.im === 0 && b.im === 0 && a.re !== 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 1e6) {
            return { re: Math.pow(a.re, b.re), im: 0 };
        }
        // 负实底数 + 分母为奇数的有理指数 → 取实数根（与 GeoGebra 同口径）：
        // (-8)^(1/3) = -2、(-8)^(2/3) = 4，而不是复数主根 1±1.732i。
        const realRoot = this._negativeBaseRealPower(a, b);
        if (realRoot) return realRoot;
        const r = Math.hypot(a.re, a.im);
        const theta = Math.atan2(a.im, a.re);
        const lnR = Math.log(r);
        const x = Math.exp(lnR * b.re - b.im * theta);
        const y = lnR * b.im + b.re * theta;
        return { re: x * Math.cos(y), im: x * Math.sin(y) };
    }

    /**
     * 负实底数的实数根：(-m)^(p/q)，要求 q 为奇数（分母偶数时实数域无定义，仍是复根）。
     * 命中返回 {re, im:0}；未命中返回 null（交回主值分支处理）。
     */
    _negativeBaseRealPower(a, b) {
        if (a.im !== 0 || b.im !== 0) return null;
        if (!(a.re < 0)) return null;
        if (!Number.isFinite(b.re) || Number.isInteger(b.re)) return null;
        const frac = this._toRational(b.re);
        if (!frac || frac.d % 2 === 0) return null;    // 分母偶数 → 复根，如 (-4)^(1/2) = 2i
        const mag = Math.pow(-a.re, b.re);
        if (!Number.isFinite(mag)) return null;
        // 分子奇偶决定符号：(-8)^(1/3) = -(8^(1/3)) = -2；(-8)^(2/3) = +4；(-8)^(-1/3) = -0.5
        const even = Math.abs(frac.n) % 2 === 0;
        return { re: even ? mag : -mag, im: 0 };
    }

    /** 浮点数 → 最简分数 p/q（q ≤ maxDen）；最大分母内逼近不到（如 π）则返回 null */
    _toRational(x, maxDen = 100) {
        if (!Number.isFinite(x)) return null;
        const sign = x < 0 ? -1 : 1;
        const v = Math.abs(x);
        let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = v;
        for (let i = 0; i < 32; i++) {
            const a = Math.floor(b);
            const h2 = a * h1 + h0;
            const k2 = a * k1 + k0;
            if (k2 > maxDen) break;
            h0 = h1; h1 = h2; k0 = k1; k1 = k2;
            const fracPart = b - a;
            if (fracPart < 1e-12) break;
            b = 1 / fracPart;
        }
        if (k1 === 0) return null;
        if (Math.abs(v - h1 / k1) > Math.max(1e-12, v * 1e-10)) return null;
        return { n: sign * h1, d: k1 };
    }
    cAbs(a) { a = this.toComplex(a); return { re: Math.hypot(a.re, a.im), im: 0 }; }
    cLn(a) { a = this.toComplex(a); return { re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) }; }
    cSin(a) { a = this.toComplex(a); return { re: Math.sin(a.re) * Math.cosh(a.im), im: Math.cos(a.re) * Math.sinh(a.im) }; }
    cCos(a) { a = this.toComplex(a); return { re: Math.cos(a.re) * Math.cosh(a.im), im: -Math.sin(a.re) * Math.sinh(a.im) }; }
    cTan(a) { const s = this.cSin(a), c = this.cCos(a); return this.cDiv(s, c); }
    cAsin(a) {
        a = this.toComplex(a);
        // asin(z) = -i * ln(i*z + sqrt(1 - z^2))
        const iz = { re: -a.im, im: a.re };
        const z2 = this.cMul(a, a);
        const inner = this.cAdd(iz, this.cSqrt({ re: 1 - z2.re, im: -z2.im }));
        const ln = this.cLn(inner);
        return { re: ln.im, im: -ln.re };
    }
    cAcos(a) {
        a = this.toComplex(a);
        // acos(z) = π/2 - asin(z)
        const asin = this.cAsin(a);
        return { re: Math.PI / 2 - asin.re, im: -asin.im };
    }
    cAtan(a) {
        a = this.toComplex(a);
        // atan(z) = (i/2) * ln((i+z)/(i-z))
        const iPlusZ = { re: a.re, im: a.im + 1 };
        const iMinusZ = { re: -a.re, im: 1 - a.im };
        const ln = this.cLn(this.cDiv(iPlusZ, iMinusZ));
        return { re: -ln.im / 2, im: ln.re / 2 };
    }
    cFloor(a) {
        a = this.toComplex(a);
        // 虚部只是浮点残差（如 floor(e^(iπ))）→ 按实数取整；
        // 真有虚部时复数取整无标准定义 → NaN（此前会静默丢掉虚部返回实数，得出错误结果）
        if (!this.isRealValue(a)) return { re: NaN, im: NaN };
        return { re: Math.floor(a.re), im: 0 };
    }
    cSgn(a) {
        a = this.toComplex(a);
        // 符号函数：实数 sgn(x)；复数取其模的符号（x=0 → 0）
        const re = a.re, im = a.im;
        if (re === 0 && im === 0) return { re: 0, im: 0 };
        // 虚部在容差内 → 按实数符号（否则残留的 1e-16 会把 sgn(-1) 变成 -1+1e-16i）
        if (Math.abs(im) < this._imTolerance(re)) return { re: Math.sign(re), im: 0 };
        const mag = Math.hypot(re, im);
        return { re: re / mag, im: im / mag };
    }
    cSqrt(a) {
        a = this.toComplex(a);
        // 0 特判：cPow 对 r=0 时 ln(r)=-Inf 会产生 NaN，0^0.5 应为 0
        if (a.re === 0 && a.im === 0) return { re: 0, im: 0 };
        return this.cPow(a, { re: 0.5, im: 0 });
    }
    cFactorial(a) {
        a = this.toComplex(a);
        // 虚部只当浮点残差时按实数阶乘处理；真有虚部 → 复数阶乘无标准定义 → NaN
        if (Math.abs(a.im) >= this._imTolerance(a.re)) return { re: NaN, im: NaN };
        a = { re: a.re, im: 0 };
        const n = a.re + 1; // gamma 参数 = x + 1
        // 非负整数走精确阶乘：gamma 近似会留下 7e-15 级误差（3! = 6.000000000000007）
        if (Number.isInteger(a.re) && a.re >= 0 && a.re <= 170) {
            let exact = 1;
            for (let i = 2; i <= a.re; i++) exact *= i;
            return { re: exact, im: 0 };
        }
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

    /**
     * digamma 函数 ψ(z) = d/dz ln Γ(z)（实数实现）。
     * 用于阶乘（伽马函数推广）的符号求导：d(Γ(x+1)) = Γ(x+1)·ψ(x+1)。
     * 反射公式处理 z < 0.5，负整数处 tan(πz)=0 → 反射返回 NaN（极点）。
     * @param {number} z 实数参数
     * @returns {number} ψ(z)，极点为 NaN
     */
    digamma(z) {
        z = Number(z);
        if (!Number.isFinite(z)) return NaN;
        // 反射公式：ψ(z) = ψ(1-z) - π·cot(πz)
        if (z < 0.5) {
            return this.digamma(1 - z) - Math.PI / Math.tan(Math.PI * z);
        }
        // 渐近展开：ψ(z) ≈ ln(z) - 1/(2z) - Σ B_{2k}/(2k·z^{2k})
        const C = [1 / 12, -1 / 120, 1 / 252, -1 / 240, 1 / 132, -691 / 32760];
        let sum = 0;
        let zz = z;
        // 递推加大 z，提升渐近展开精度
        for (let i = 0; i < 6; i++) {
            sum += 1 / zz;
            zz += 1;
        }
        const inv = 1 / (zz * zz);
        // 霍纳式求 P(w)=Σ C[i]·w^(i+1)，w=1/z²
        let poly = C[5];
        for (let i = 4; i >= 0; i--) poly = poly * inv + C[i];
        poly *= inv;
        return Math.log(zz) - 0.5 / zz - poly - sum;
    }

    // ========== 复数 → 实数转换 ==========

    /**
     * 虚部容差：随实部量级放大，用于吸收 e^(iπ)、(-2)^3 之类运算的浮点残差。
     * 单一来源 —— complexToNumber / isRealValue / validateSyntax / floor / sgn 判定实虚必须同口径，
     * 否则会出现「求值得到 -1、校验却说计算错误」这类自相矛盾的行为。
     */
    _imTolerance(re) {
        return Math.max(1e-10, Math.abs(re) * 1e-10);
    }

    /** 该值能否视为实数（实部有限且虚部在容差内） */
    isRealValue(v) {
        const c = this.toComplex(v);
        if (!Number.isFinite(c.re) || !Number.isFinite(c.im)) return false;
        return Math.abs(c.im) < this._imTolerance(c.re);
    }

    complexToNumber(v) {
        const c = this.toComplex(v);
        if (!Number.isFinite(c.re) || !Number.isFinite(c.im)) return null;
        // 虚部足够小 → 视为实数（处理 e^(iπ)、(-x)^n 整数幂的浮点精度问题）
        if (Math.abs(c.im) < this._imTolerance(c.re)) return c.re;
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

    // ========== 编辑器扁平 token 化（单一来源；UIInput/AI 旧实现已收敛到此） ==========
    // 返回扁平字符串数组：多字母函数名 + 单字符（变量/数字/运算符/括号），供 expressionElements 使用。
    tokenizeExpression(expr) {
        const tokens = [];
        let i = 0;
        const len = expr.length;
        const multiCharFuncs = this.functions; // ['sin','cos',...,'abs','ln','sqrt']，与白名单一致（无 exp/log）
        while (i < len) {
            let matched = false;
            for (const func of multiCharFuncs) {
                if (expr.substring(i, i + func.length) === func) {
                    tokens.push(func);
                    i += func.length;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;
            tokens.push(expr[i]);
            i++;
        }
        return tokens;
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
                    case 'asin': return this.cAsin(v);
                    case 'acos': return this.cAcos(v);
                    case 'atan': return this.cAtan(v);
                    case 'floor': return this.cFloor(v);
                    case 'sgn': return this.cSgn(v);
                    case 'abs': return this.cAbs(v);
                    case 'ln': return this.cLn(v);
                    case 'sqrt': {
                        const sv = this.evalAst(node.a, x);
                        const a = this.toComplex(sv);
                        if (a.im === 0 && a.re === 0) return 0;
                        return this.cSqrt(sv);
                    }
                    case 'digamma': {
                        // 内部求导节点专用：ψ(z)，只处理实数，虚部超出容差即视为复数（返回 NaN）
                        const dv = this.toComplex(v);
                        if (!this.isRealValue(dv)) return NaN;
                        return this.digamma(dv.re);
                    }
                    default: return { re: NaN, im: NaN };
                }
            }
            default: return NaN;
        }
    }

    // ========== 符号求导（对 x 求一阶导数） ==========

    /**
     * 判断 AST 节点是否含变量 x（用于幂法则判断底数/指数是否恒定）
     * @param {object} node AST 节点
     * @returns {boolean} true = 含 x
     */
    _containsVar(node) {
        if (!node) return false;
        switch (node.t) {
            case 'num':
            case 'const':
                return false;
            case 'x':
                return true;
            case 'neg':
                return this._containsVar(node.a);
            case '+':
            case '-':
            case '*':
            case '/':
            case '^':
                return this._containsVar(node.l) || this._containsVar(node.r);
            case 'fac':
                return this._containsVar(node.a);
            case 'fn':
                return this._containsVar(node.a);
            default:
                return false;
        }
    }

    /**
     * 对 AST 进行符号求导（对 x），返回导数的 AST。
     * 对无法求导的节点（floor / sgn / 阶乘等）返回 null，表示该函数不可绘制导数。
     * @param {object} node AST 节点
     * @returns {object|null} 导数 AST，或 null 表示不支持求导
     */
    differentiate(node) {
        if (!node) return null;
        const d = (n) => this.differentiate(n);
        switch (node.t) {
            case 'num':
            case 'const':
                // 常数导数为 0
                return { t: 'num', v: 0 };
            case 'x':
                return { t: 'num', v: 1 };
            case 'neg': {
                const da = d(node.a);
                return da ? { t: 'neg', a: da } : null;
            }
            case '+':
            case '-': {
                const dl = d(node.l), dr = d(node.r);
                if (!dl || !dr) return null;
                return { t: node.t, l: dl, r: dr };
            }
            case '*': {
                // 乘积法则：d(u·v) = du·v + u·dv
                const dl = d(node.l), dr = d(node.r);
                if (!dl || !dr) return null;
                return {
                    t: '+',
                    l: { t: '*', l: dl, r: node.r },
                    r: { t: '*', l: node.l, r: dr }
                };
            }
            case '/': {
                // 商法则：d(u/v) = (du·v - u·dv) / v²
                const dl = d(node.l), dr = d(node.r);
                if (!dl || !dr) return null;
                const num = {
                    t: '-',
                    l: { t: '*', l: dl, r: node.r },
                    r: { t: '*', l: node.l, r: dr }
                };
                const den = { t: '^', l: node.r, r: { t: 'num', v: 2 } };
                return { t: '/', l: num, r: den };
            }
            case '^': {
                const u = node.l, v = node.r;
                const du = d(u), dv = d(v);
                if (!du || !dv) return null;
                const uConst = !this._containsVar(u);
                const vConst = !this._containsVar(v);
                const lnU = { t: 'fn', n: 'ln', a: u };
                const base = { t: '^', l: u, r: v };
                if (vConst) {
                    // d(u^v) = v · u^(v-1) · du
                    const exp = { t: '-', l: v, r: { t: 'num', v: 1 } };
                    return { t: '*', l: v, r: { t: '*', l: { t: '^', l: u, r: exp }, r: du } };
                }
                if (uConst) {
                    // d(u^v) = u^v · ln(u) · dv
                    return { t: '*', l: base, r: { t: '*', l: lnU, r: dv } };
                }
                // 一般情况：d(u^v) = u^v · (dv·ln(u) + v·du/u)
                const term1 = { t: '*', l: dv, r: lnU };
                const term2 = { t: '*', l: v, r: { t: '/', l: du, r: u } };
                return { t: '*', l: base, r: { t: '+', l: term1, r: term2 } };
            }
            case 'fac': {
                // 阶乘用伽马函数推广：x! = Γ(x+1)，d(x!) = Γ(x+1)·ψ(x+1)·dx
                const da = d(node.a);
                if (!da) return null;
                const argPlus1 = { t: '+', l: node.a, r: { t: 'num', v: 1 } };
                const psi = { t: 'fn', n: 'digamma', a: argPlus1 };
                return { t: '*', l: da, r: { t: '*', l: { t: 'fac', a: node.a }, r: psi } };
            }
            case 'fn': {
                const a = node.a;
                // floor/sgn 在可导处导数恒为 0，与内部表达式无关 → 提前返回，不受内部不可导影响
                if (node.n === 'floor' || node.n === 'sgn') {
                    return { t: 'num', v: 0 };
                }
                const da = d(a);
                if (!da) return null;
                const daNode = da;
                switch (node.n) {
                    case 'sin':
                        return { t: '*', l: daNode, r: { t: 'fn', n: 'cos', a } };
                    case 'cos':
                        return { t: '*', l: { t: 'neg', a: daNode }, r: { t: 'fn', n: 'sin', a } };
                    case 'tan':
                        // d(tan) = du·(1 + tan²u)
                        return {
                            t: '*', l: daNode, r: {
                                t: '+',
                                l: { t: 'num', v: 1 },
                                r: { t: '^', l: { t: 'fn', n: 'tan', a }, r: { t: 'num', v: 2 } }
                            }
                        };
                    case 'asin': {
                        // d(asin) = du / sqrt(1 - u²)
                        const den = { t: 'fn', n: 'sqrt', a: { t: '-', l: { t: 'num', v: 1 }, r: { t: '^', l: a, r: { t: 'num', v: 2 } } } };
                        return { t: '/', l: daNode, r: den };
                    }
                    case 'acos': {
                        // d(acos) = -du / sqrt(1 - u²)
                        const den = { t: 'fn', n: 'sqrt', a: { t: '-', l: { t: 'num', v: 1 }, r: { t: '^', l: a, r: { t: 'num', v: 2 } } } };
                        return { t: '/', l: { t: 'neg', a: daNode }, r: den };
                    }
                    case 'atan': {
                        // d(atan) = du / (1 + u²)
                        const den = { t: '+', l: { t: 'num', v: 1 }, r: { t: '^', l: a, r: { t: 'num', v: 2 } } };
                        return { t: '/', l: daNode, r: den };
                    }
                    case 'abs':
                        // d(abs) = du·sgn(u)（u ≠ 0 处）
                        return { t: '*', l: daNode, r: { t: 'fn', n: 'sgn', a } };
                    case 'ln':
                        return { t: '/', l: daNode, r: a };
                    case 'sqrt':
                        // d(sqrt) = du / (2·sqrt(u))
                        return { t: '/', l: daNode, r: { t: '*', l: { t: 'num', v: 2 }, r: { t: 'fn', n: 'sqrt', a } } };
                    default:
                        return null;
                }
            }
            default:
                return null;
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

    // ========== 锁定元素管理 ==========

    clearLockedElements() {
        this.lockedElements = [];
    }

    isElementLocked(element) {
        return this.lockedElements.includes(element);
    }

    // 转义正则特殊字符（#43 修复：锁定元素可能是 + - * / ^ ! 等运算符，
    // 直接拼进 RegExp 会抛 SyntaxError 或误匹配）
    escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    validateExpressionForLocks(expression) {
        const cleanExpr = expression.replace(/\s/g, '');
        for (const locked of this.lockedElements) {
            // #43 修复：locked 可能含正则特殊字符，构造 pattern 前先转义
            const pattern = new RegExp(`(^|[^a-zA-Z0-9])${this.escapeRegExp(locked)}([^a-zA-Z0-9]|$)`, 'i');
            if (pattern.test(cleanExpr) || cleanExpr.includes(locked)) {
                if (this.containsElement(cleanExpr, locked)) {
                    return { valid: false, lockedElement: locked };
                }
            }
        }
        return { valid: true, lockedElement: null };
    }

    containsElement(expression, element) {
        // #43 修复：按 token 类型分类判定，避免未转义正则崩溃与误匹配。
        // 字母词（sin/exp/ln/log/e/i 等函数名与单字母常量）：用边界正则，防止 exp 误判含 e。
        // 数字、运算符（+ - * / ^ !）、π 等特殊符号：直接子串包含判定（天然无需转义）。
        if (/^[a-zA-Z]+$/.test(element)) {
            const escaped = this.escapeRegExp(element);
            const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
            return regex.test(expression);
        }
        return expression.includes(element);
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

        // 先做语法解析：真正的"语法错误"在此捕获（括号/操作符/token 等非法）
        let ast = null;
        try {
            ast = this.parse(expression);
        } catch (e) {
            return { valid: false, error: '语法错误：' + (e.message || '表达式无法解析') };
        }

        // 尝试计算多个测试点（包括定义域外的复数情况）
        const testPoints = [0, 1, -1, 0.5, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -3, 5, -5, 10, -10];
        let validCount = 0;
        let complexCount = 0;      // 语法合法但结果落在复数域（如 sqrt(-4)、i^3、ln(-1)）
        for (const x of testPoints) {
            let result;
            try {
                result = this.evalAst(ast, x);
            } catch (e) {
                result = null;
            }
            if (result === null || result === undefined) continue;
            // 实虚判定必须走 complexToNumber 的容差口径：
            // e^(iπ) = -1 的虚部只有 1.2e-16 的浮点残差，此前用精确比较 im===0
            // 会把 e^ipi、i^2、i^4、e^(2iπ)、(-2)^2 等一批"结果明明是实数"的表达式
            // 全部判成「表达式计算错误」。
            if (this.complexToNumber(result) !== null) { validCount++; continue; }
            const c = this.toComplex(result);
            if (Number.isFinite(c.re) && Number.isFinite(c.im)) complexCount++;
        }
        if (validCount === 0) {
            // 所有测试点都计算失败：可能是定义域很窄但语法合法的函数
            // （如 (-2x-1)!·(2x-1)!，其定义域恰好避开测试点），也可能是恒未定义的常量表达式（如 1/0）。
            // 含变量 x 的表达式已通过语法解析 → 视为合法（仅定义域窄），不应误判为语法错误；
            // 不含 x 的常量表达式：结果为复数 → 提示实数域无定义；否则才算计算错误。
            const hasVariable = this._containsVar(ast);
            if (hasVariable) {
                return { valid: true, error: null };
            }
            if (complexCount > 0) {
                return { valid: false, error: '表达式在实数范围内无定义（结果是复数）' };
            }
            return { valid: false, error: '表达式计算错误，请检查语法' };
        }
        return { valid: true, error: null };
    }

    // ========== 函数复杂度分析 ==========

    analyzeFunctionType(expression) {
        const cleanExpr = expression.replace(/\s+/g, '').replace(/[()（）]/g, '');
        let length = 0;
        const tokenRegex = /(sin|cos|tan|asin|acos|atan|floor|sgn|abs|ln|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
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

        const nonPolyPattern = /(sin|cos|tan|asin|acos|atan|floor|sgn|ln|sqrt|abs)/;
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
            let result;
            let passed;
            if (test.isPureImag) {
                // i^3 = -i 是纯虚数：evaluate() 会按实数口径返回 null，
                // 这里必须取 evalAst 的原始复数对象 {re:0, im:-1} 才比得出来（原断言写法恒为 FAIL）
                result = this.evalAst(this.parse(test.expr), 0);
                passed = result && typeof result === 'object'
                    && Math.abs(result.im - test.expected) < 1e-10 && Math.abs(result.re) < 1e-10;
            } else {
                result = this.evaluate(test.expr, 0);
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

// ── 安全出口一：受限表达式求值（替代 new Function / eval）──
// 背景：Summa 表达式校验、关卡导入曾直接用 new Function 执行任意字符串（等同 eval），
// 恶意关卡包 / AI 生成的表达式串可借此执行任意 JS。此处收敛为「白名单 + 既有解析器求值」。
(function () {
    const G = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    const MAX_LEN = 512;
    // 允许出现的标识符白名单（其余一律拒绝）
    const ALLOWED_NAMES = new Set(['x', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'abs', 'ln', 'log', 'sqrt', 'floor', 'ceil', 'sgn', 'exp', 'factorial', 'π']);
    // 禁止：字符串/模板串、语句分隔与代码块、属性访问、浏览器全局、构造函数
    const FORBIDDEN_RE = /['"`;{}[\]\\]|=>|\b(?:this|window|globalThis|self|document|parent|top|location|function|return|new|delete|void|typeof|instanceof|import|require|process|constructor|prototype|__proto__|eval|Function)\b/;
    const NAME_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
    let _shared = null;
    const parser = () => (_shared || (_shared = new FunctionParser()));

    /**
     * 受限解析数学表达式（仅含 x 与白名单函数/常量）。
     * @returns {{ok:true, evaluate:(x:number)=>number}|{ok:false, reason:string}}
     */
    function parse(expr) {
        if (typeof expr !== 'string') return { ok: false, reason: '类型错误' };
        const s = expr.trim();
        if (!s) return { ok: false, reason: '空表达式' };
        if (s.length > MAX_LEN) return { ok: false, reason: '长度超限' };
        if (FORBIDDEN_RE.test(s)) return { ok: false, reason: '含禁止字符或关键字' };
        // 先剥掉数字字面量（含 1e5 / 3.14），剩余标识符必须全部命中白名单
        const stripped = s.replace(/\d*\.?\d+(?:[eE][+-]?\d+)?/g, '');
        NAME_RE.lastIndex = 0;
        let m;
        while ((m = NAME_RE.exec(stripped))) {
            if (!ALLOWED_NAMES.has(m[0].toLowerCase())) return { ok: false, reason: '未知标识符: ' + m[0] };
        }
        let ast = null;
        try { ast = parser().parse(s); } catch (e) { ast = null; }
        if (!ast) return { ok: false, reason: '语法解析失败' };
        return {
            ok: true,
            evaluate: function (x) {
                try {
                    const v = parser().evaluateAst(ast, x);
                    return (typeof v === 'number' && isFinite(v)) ? v : NaN;
                } catch (e) { return NaN; }
            }
        };
    }

    G.SafeExpression = { parse: parse, MAX_LEN: MAX_LEN };

    // ── 安全出口二：HTML 转义（innerHTML 拼接任何变量前必须调用）──
    G.FnEscapeHtml = function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionParser;
}
