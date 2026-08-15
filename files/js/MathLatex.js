/**
 * MathLatex 模块
 * 把函数棋表达式（expressionElements / 字符串）转换为 LaTeX 字符串，供 KaTeX 渲染。
 *
 * - toLatex(exprStr)    : 表达式字符串 → 完整 LaTeX。解析失败（不完整/非法，编辑中常见）返回 null，调用方回退纯文本。
 * - tokenToLatex(el)    : 单个 token → LaTeX（用于输入区 token 级美化）；不支持返回 null。
 *
 * 依赖 FunctionParser（运行时惰性实例化，规避加载顺序问题）。
 *
 * 乘法渲染策略（2026-07-31 用户要求）：隐式乘法（2x / x(x+1) / 2x^3）省略乘号；
 * 显式 `*`（2*x / x*y）用 \cdot（·），避免 `×` 与 `x` 混淆。
 */
window.MathLatex = (function () {
    'use strict';

    let _parser = null;
    function getParser() {
        if (_parser === null && typeof FunctionParser !== 'undefined') {
            _parser = new FunctionParser();
        }
        return _parser;
    }

    // 运算符优先级（用于最小括号化）
    const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, neg: 3.5, fac: 4, atom: 10 };

    function pri(n) {
        switch (n.t) {
            case '+': case '-': return PREC['+'];
            case '*': case '/': return PREC['*'];
            case '^': return PREC['^'];
            case 'neg': return PREC.neg;
            case 'fac': return PREC.fac;
            default: return PREC.atom; // num / x / const / fn / 括号
        }
    }

    function wrapParen(inner) {
        return '\\left(' + inner + '\\right)';
    }

    function astToLatex(n) {
        switch (n.t) {
            case 'num': {
                let s = String(n.v);
                if (s.startsWith('.')) s = '0' + s;
                return s;
            }
            case 'x': return 'x';
            // pi 输出带尾随空格：隐式乘法会省略乘号，若不分隔，\pi 与后接字母
            // （x / e / i 或 \sin 等）会拼成 \pix / \pisin 等未定义命令 → KaTeX 红色报错。
            // 数学模式下空格被 KaTeX 忽略，视觉上仍是紧凑的 πx。
            case 'const': return n.v === 'pi' ? '\\pi ' : n.v; // e / i
            case 'neg': {
                const inner = astToLatex(n.a);
                const needParen = pri(n.a) < PREC.neg;
                return '-' + (needParen ? wrapParen(inner) : inner);
            }
            case '+':
            case '-': {
                const l = astToLatex(n.l);
                const r = astToLatex(n.r);
                const lp = pri(n.l) < PREC[n.t];
                const rp = pri(n.r) <= PREC[n.t]; // 左结合：同级右子节点需要括号
                return (lp ? wrapParen(l) : l) + n.t + (rp ? wrapParen(r) : r);
            }
            case '*': {
                const l = astToLatex(n.l);
                const r = astToLatex(n.r);
                const lp = pri(n.l) < PREC['*'];
                const rp = pri(n.r) <= PREC['*'];
                // 隐式乘法省略乘号；显式 `*` 用 \cdot（点乘），避免 × 与 x 混淆
                const op = n.implicit ? '' : '\\cdot ';
                return (lp ? wrapParen(l) : l) + op + (rp ? wrapParen(r) : r);
            }
            case '/': {
                const l = astToLatex(n.l);
                const r = astToLatex(n.r);
                const lp = pri(n.l) < PREC['/'];
                const rp = pri(n.r) <= PREC['/'];
                // 用 \dfrac：inline 渲染下分子分母保持与主体同字号，避免分数整体偏小
                return '\\dfrac{' + (lp ? wrapParen(l) : l) + '}{' + (rp ? wrapParen(r) : r) + '}';
            }
            case '^': {
                const l = astToLatex(n.l);
                const r = astToLatex(n.r);
                const lp = pri(n.l) < PREC['^'];
                const rp = pri(n.r) < PREC['^']; // ^ 右结合：同级不加括号
                return (lp ? wrapParen(l) : l) + '^{' + (rp ? wrapParen(r) : r) + '}';
            }
            case 'fac': {
                const a = astToLatex(n.a);
                const ap = pri(n.a) < PREC.fac;
                return (ap ? wrapParen(a) : a) + '!';
            }
            case 'fn': {
                const arg = astToLatex(n.a);
                switch (n.n) {
                    case 'sin': return '\\sin\\left(' + arg + '\\right)';
                    case 'cos': return '\\cos\\left(' + arg + '\\right)';
                    case 'tan': return '\\tan\\left(' + arg + '\\right)';
                    case 'asin': return '\\operatorname{asin}\\left(' + arg + '\\right)';
                    case 'acos': return '\\operatorname{acos}\\left(' + arg + '\\right)';
                    case 'atan': return '\\operatorname{atan}\\left(' + arg + '\\right)';
                    case 'ln': return '\\ln\\left(' + arg + '\\right)';
                    case 'sqrt': return '\\sqrt{' + arg + '}';
                    case 'abs': return '\\left|' + arg + '\\right|';
                    default: return '\\operatorname{' + n.n + '}\\left(' + arg + '\\right)';
                }
            }
            default: return '';
        }
    }

    // 自写递归下降解析：与 FunctionParser.parse 结构一致，但区分隐式乘法（n.implicit）
    function parseLatex(expr) {
        const parser = getParser();
        if (!parser) return null;
        const tokens = parser.tokenize(expr); // 含 {type:'imult'} 标记
        let p = 0;
        const peek = () => tokens[p];
        const eat = () => tokens[p++];

        const primary = () => {
            const t = eat();
            if (!t) throw new Error('表达式不完整');
            if (t.type === 'number') return { t: 'num', v: t.value };
            if (t.type === 'var') return { t: 'x' };
            if (t.type === 'const') return { t: 'const', v: t.value };
            if (t.type === 'lparen') {
                const n = add();
                if (!peek() || peek().type !== 'rparen') throw new Error('缺少右括号');
                eat();
                return n;
            }
            if (t.type === 'fn') {
                if (peek() && peek().type === 'lparen') {
                    eat();
                    const arg = add();
                    if (!peek() || peek().type !== 'rparen') throw new Error('缺少右括号');
                    eat();
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
            if (peek() && peek().type === 'op' && peek().value === '^') {
                eat();
                n = { t: '^', l: n, r: powerRight() };
            }
            return n;
        };

        const powerRight = () => {
            let n = powerLeaf();
            while (peek() && peek().type === 'imult') {
                eat();
                const r = powerLeaf();
                n = { t: '*', implicit: true, l: n, r };
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
                n = { t: '*', implicit: true, l: n, r };
            }
            return n;
        };

        const mul = () => {
            let n = implicitMul();
            while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
                const op = eat().value;
                const r = implicitMul();
                n = op === '*' ? { t: '*', implicit: false, l: n, r } : { t: '/', l: n, r };
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

    /**
     * 主入口：表达式字符串 → LaTeX。
     * 解析成功返回 LaTeX 字符串；失败（不完整/非法表达式）返回 null。
     */
    function toLatex(expr) {
        if (!expr) return null;
        try {
            const ast = parseLatex(expr);
            if (!ast) return null;
            const latex = astToLatex(ast);
            return latex || null;
        } catch (e) {
            return null;
        }
    }

    const FUNC_MAP = {
        sin: '\\sin', cos: '\\cos', tan: '\\tan',
        asin: '\\operatorname{asin}', acos: '\\operatorname{acos}', atan: '\\operatorname{atan}',
        ln: '\\ln',
        sqrt: '\\sqrt', abs: '\\operatorname{abs}'
    };
    const SIMPLE_MAP = { '*': '\\cdot ', '/': '\\div', 'π': '\\pi ' };

    /**
     * 单 token → LaTeX（输入区每个元素的 token 级美化）。
     * 不支持 / 不需要美化的 token（如孤立的 '^'）返回 null，调用方回退为纯文本。
     */
    function tokenToLatex(el) {
        if (el === undefined || el === null || el === '') return null;
        if (FUNC_MAP[el]) return FUNC_MAP[el];
        if (SIMPLE_MAP[el]) return SIMPLE_MAP[el];
        if (/^[0-9.]$/.test(el)) return el;
        if (el === 'x' || el === '+' || el === '-' || el === '(' || el === ')' || el === '!') return el;
        return null;
    }

    return { toLatex: toLatex, tokenToLatex: tokenToLatex };
})();
