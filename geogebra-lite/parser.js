class FunctionParser {
  constructor() {
    this.functions = ['sin', 'cos', 'tan', 'abs', 'ln', 'sqrt'];
    this.constants = { pi: { re: Math.PI, im: 0 }, e: { re: Math.E, im: 0 }, i: { re: 0, im: 1 } };
  }

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
    return this.toComplex(this.gamma(a.re + 1));
  }

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

  complexToNumber(v) {
    const c = this.toComplex(v);
    if (!Number.isFinite(c.re) || !Number.isFinite(c.im)) return null;
    return Math.abs(c.im) < 1e-10 ? c.re : c;
  }

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
            const v = this.evalAst(node.a, x);
            const a = this.toComplex(v);
            if (a.im === 0 && a.re === 0) return 0;return this.cSqrt(v);
          }
          default: return { re: NaN, im: NaN };
        }
      }
      default: return NaN;
    }
  }

  evaluate(expr, x) {
    try {
      const v = this.evalAst(this.parse(expr), x);
      return this.complexToNumber(v);
    } catch {
      return null;
    }
  }
}
