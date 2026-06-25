// ====== Tokenizer ======
const TOKEN = { NUM:'NUM', ID:'ID', OP:'OP', LPAREN:'(', RPAREN:')', COMMA:',', CARET:'^', BANG:'!' };

function tokenize(s) {
  const tokens = []; let i = 0;
  while (i < s.length) {
    if (' \t'.includes(s[i])) { i++; continue; }
    if ('0123456789.'.includes(s[i])) {
      let n = '';
      while (i < s.length && '0123456789.'.includes(s[i])) n += s[i++];
      tokens.push({ type: TOKEN.NUM, value: parseFloat(n) });
      continue;
    }
    if ('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.includes(s[i])) {
      let id = '';
      while (i < s.length && 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'.includes(s[i])) id += s[i++];
      tokens.push({ type: TOKEN.ID, value: id });
      continue;
    }
    if ('+-*/'.includes(s[i])) { tokens.push({ type: TOKEN.OP, value: s[i++] }); continue; }
    if (s[i] === '^') { tokens.push({ type: TOKEN.CARET, value: '^' }); i++; continue; }
    if (s[i] === '(') { tokens.push({ type: TOKEN.LPAREN, value: '(' }); i++; continue; }
    if (s[i] === ')') { tokens.push({ type: TOKEN.RPAREN, value: ')' }); i++; continue; }
    if (s[i] === ',') { tokens.push({ type: TOKEN.COMMA, value: ',' }); i++; continue; }
    if (s[i] === '!') { tokens.push({ type: TOKEN.BANG, value: '!' }); i++; continue; }
    throw new Error(`未知字符: '${s[i]}'`);
  }
  return tokens;
}

// ====== AST Parser (recursive descent) ======
const KNOWN_FUNCS = new Set(['sin','cos','tan','exp','log','ln','sqrt','abs','asin','acos','atan','sinh','cosh','tanh','sec','csc','cot']);

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const eat = (type, val) => {
    const t = tokens[pos];
    if (!t || (type && t.type !== type) || (val !== undefined && t.value !== val))
      throw new Error(`期望 ${val||type}，得到 ${t ? t.value : 'EOF'}`);
    pos++; return t;
  };

  function expr() { return addSub(); }

  function addSub() {
    let left = mulDiv();
    while (peek() && peek().type === TOKEN.OP && '+-'.includes(peek().value)) {
      const op = eat(TOKEN.OP).value;
      const right = mulDiv();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function mulDiv() {
    let left = power();
    while (peek() && peek().type === TOKEN.OP && '*/'.includes(peek().value)) {
      const op = eat(TOKEN.OP).value;
      const right = power();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function power() {
    let base = factorial();
    if (peek() && peek().type === TOKEN.CARET) {
      eat(TOKEN.CARET);
      const exp = power(); // right associative
      return { type: 'power', base, exp };
    }
    return base;
  }

  function factorial() {
    let node = unary();
    while (peek() && peek().type === TOKEN.BANG) {
      eat(TOKEN.BANG);
      node = { type: 'factorial', arg: node };
    }
    return node;
  }

  function unary() {
    if (peek() && peek().type === TOKEN.OP && peek().value === '-') {
      eat(TOKEN.OP);
      const arg = unary();
      if (arg.type === 'num') return { type: 'num', value: -arg.value }; // -常数 → 直接折叠
      return { type: 'binop', op: '*', left: { type: 'num', value: -1 }, right: arg };
    }
    if (peek() && peek().type === TOKEN.OP && peek().value === '+') { eat(TOKEN.OP); return unary(); }
    return atom();
  }

  function atom() {
    const t = peek();
    if (!t) throw new Error('意外的表达式结束');
    if (t.type === TOKEN.NUM) { eat(TOKEN.NUM); return { type: 'num', value: t.value }; }
    if (t.type === TOKEN.LPAREN) { eat(TOKEN.LPAREN); const e = expr(); eat(TOKEN.RPAREN); return e; }
    if (t.type === TOKEN.ID) {
      const name = eat(TOKEN.ID).value;
      if (KNOWN_FUNCS.has(name)) {
        eat(TOKEN.LPAREN);
        const args = [expr()];
        while (peek() && peek().type === TOKEN.COMMA) { eat(TOKEN.COMMA); args.push(expr()); }
        eat(TOKEN.RPAREN);
        return { type: 'func', name, args };
      }
      if (name === 'pi' || name === 'PI') return { type: 'num', value: Math.PI };
      if (name === 'e' && !(peek() && peek().type === TOKEN.LPAREN)) return { type: 'num', value: Math.E };
      return { type: 'var', name };
    }
    throw new Error(`意外的标记: ${t.value}`);
  }

  const result = expr();
  if (pos < tokens.length) throw new Error(`多余的输入: ${tokens[pos].value}`);
  return result;
}

// ====== AST to string ======
function astToStr(node) {
  if (!node) return '';
  switch (node.type) {
    case 'num': {
      const v = node.value;
      if (v === Math.PI) return 'π';
      if (v === Math.E) return 'e';
      if (Number.isInteger(v)) return '' + v;
      return '' + parseFloat(v.toFixed(6));
    }
    case 'var': return node.name;
    case 'binop': {
      const l = astToStr(node.left), r = astToStr(node.right);
      if (node.op === '*' && node.left.type === 'num' && node.left.value === -1) return `(-${r})`;
      return `(${l} ${node.op} ${r})`;
    }
    case 'power': return `(${astToStr(node.base)}^${astToStr(node.exp)})`;
    case 'func': return `${node.name}(${node.args.map(astToStr).join(', ')})`;
    case 'factorial': return `${astToStr(node.arg)}!`;
  }
  return '?';
}

// ====== Simplifier ======
function isConst(n) { return n.type === 'num'; }
function numVal(n) { return n.value; }
function num(v) { return { type: 'num', value: v }; }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function factorialVal(n) {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

function simplify(node) {
  if (!node) return node;
  switch (node.type) {
    case 'num': case 'var': return node;
    case 'factorial': {
      const arg = simplify(node.arg);
      if (isConst(arg)) { const v = factorialVal(numVal(arg)); if (!isNaN(v)) return num(v); }
      return { type: 'factorial', arg };
    }
    case 'func': {
      const args = node.args.map(simplify);
      if (args.every(isConst)) {
        const fns = { sin:Math.sin, cos:Math.cos, tan:Math.tan, exp:Math.exp, log:Math.log, ln:Math.log,
          sqrt:Math.sqrt, abs:Math.abs, asin:Math.asin, acos:Math.acos, atan:Math.atan,
          sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh, sec:x=>1/Math.cos(x), csc:x=>1/Math.sin(x), cot:x=>1/Math.tan(x) };
        if (fns[node.name]) { const v = fns[node.name](numVal(args[0])); if (isFinite(v)) return num(v); }
      }
      return { type: 'func', name: node.name, args };
    }
    case 'power': {
      const base = simplify(node.base), exp = simplify(node.exp);
      if (isConst(base) && isConst(exp)) { const v = Math.pow(numVal(base), numVal(exp)); if (isFinite(v)) return num(v); }
      if (isConst(exp) && numVal(exp) === 0) return num(1);           // f^0 → 1
      if (isConst(exp) && numVal(exp) === 1) return base;             // f^1 → f
      if (base.type === 'power' && isConst(base.exp) && isConst(exp)) // (f^a)^b → f^(a*b)
        return simplify({ type: 'power', base: base.base, exp: num(numVal(base.exp) * numVal(exp)) });
      return { type: 'power', base, exp };
    }
    case 'binop': {
      let left = simplify(node.left), right = simplify(node.right);
      const op = node.op;
      if (isConst(left) && isConst(right)) {
        const l = numVal(left), r = numVal(right);
        if (op === '+') return num(l + r);
        if (op === '-') return num(l - r);
        if (op === '*') return num(l * r);
        if (op === '/' && r !== 0) return num(l / r);
      }
      if (op === '+') {
        if (isConst(left)  && numVal(left)  === 0) return right;  // 0 + f → f
        if (isConst(right) && numVal(right) === 0) return left;   // f + 0 → f
      }
      if (op === '-') {
        if (isConst(right) && numVal(right) === 0) return left;   // f - 0 → f
        if (deepEqual(left, right)) return num(0);                 // f - f → 0
      }
      if (op === '*') {
        if (isConst(left)  && numVal(left)  === 0) return num(0); // 0 * f → 0
        if (isConst(right) && numVal(right) === 0) return num(0);
        if (isConst(left)  && numVal(left)  === 1) return right;  // 1 * f → f
        if (isConst(right) && numVal(right) === 1) return left;   // f * 1 → f
        // x^a * x^b → x^(a+b)
        if (left.type === 'power' && right.type === 'power' && deepEqual(left.base, right.base) && isConst(left.exp) && isConst(right.exp))
          return simplify({ type: 'power', base: left.base, exp: num(numVal(left.exp) + numVal(right.exp)) });
      }
      if (op === '/') {
        if (deepEqual(left, right)) return num(1);                 // f/f → 1
        if (isConst(right) && numVal(right) === 1) return left;   // f/1 → f
        // x^a / x^b → x^(a-b)
        if (left.type === 'power' && right.type === 'power' && deepEqual(left.base, right.base) && isConst(left.exp) && isConst(right.exp))
          return simplify({ type: 'power', base: left.base, exp: num(numVal(left.exp) - numVal(right.exp)) });
        // f^a / f → f^(a-1)
        if (left.type === 'power' && isConst(left.exp) && deepEqual(left.base, right))
          return simplify({ type: 'power', base: left.base, exp: num(numVal(left.exp) - 1) });
        // f / f^b → f^(1-b)
        if (right.type === 'power' && isConst(right.exp) && deepEqual(left, right.base))
          return simplify({ type: 'power', base: right.base, exp: num(1 - numVal(right.exp)) });
      }
      return { type: 'binop', op, left, right };
    }
  }
  return node;
}

function fullSimplify(node) {
  let prev = null, cur = node;
  for (let i = 0; i < 20; i++) {
    cur = simplify(cur);
    const s = JSON.stringify(cur);
    if (s === prev) break;
    prev = s;
  }
  return cur;
}

// ====== Step 2: C_structure ======
function calcStructure(node) {
  if (!node) return 0;
  switch (node.type) {
    case 'num': return 0;
    case 'var': return 1;
    case 'factorial': return calcStructure(node.arg) + 1;
    case 'func': return calcStructure(node.args[0]) + 1;
    case 'power': {
      const bc = calcStructure(node.base);
      if (isConst(node.exp)) return bc + 1;
      return bc + calcStructure(node.exp) + 2;
    }
    case 'binop': {
      const lc = calcStructure(node.left), rc = calcStructure(node.right);
      if (node.op === '+' || node.op === '-') return Math.max(lc, rc);
      if (node.op === '*') return lc + rc;
      if (node.op === '/') return lc + rc + 1;
    }
  }
  return 0;
}

// ====== Step 3: C_diversity ======
function collectFuncTypes(node, set) {
  if (!node) return;
  if (node.type === 'func') { set.add(node.name); node.args.forEach(a => collectFuncTypes(a, set)); }
  if (node.type === 'binop') { collectFuncTypes(node.left, set); collectFuncTypes(node.right, set); }
  if (node.type === 'power') { collectFuncTypes(node.base, set); collectFuncTypes(node.exp, set); }
  if (node.type === 'factorial') collectFuncTypes(node.arg, set);
}
function calcDiversity(node) {
  const s = new Set(); collectFuncTypes(node, s); return Math.max(s.size - 1, 0);
}

// ====== Step 4: Structure Bonus ======
function hasBranching(node) {
  if (!node) return false;
  if (node.type === 'binop' && node.op === '*' && !deepEqual(node.left, node.right)) return true;
  if (node.type === 'binop') return hasBranching(node.left) || hasBranching(node.right);
  if (node.type === 'power') return hasBranching(node.base) || hasBranching(node.exp);
  if (node.type === 'func') return node.args.some(hasBranching);
  if (node.type === 'factorial') return hasBranching(node.arg);
  return false;
}
function calcStructureBonus(node) { return hasBranching(node) ? 2 : 0; }

// ====== Step 5: C_penalty ======
function calcPenalty(originalAST, simplifiedAST) {
  let penalty = 0;

  // (1) 重复嵌套惩罚：连续相同函数超过2层，每多一层 -0.5
  function checkNestedRepeat(node, parentName, depth) {
    if (!node) return;
    if (node.type === 'func') {
      const nd = node.name === parentName ? depth + 1 : 1;
      if (nd > 2) penalty += 0.5;
      node.args.forEach(a => checkNestedRepeat(a, node.name, nd));
    } else {
      if (node.type === 'binop') { checkNestedRepeat(node.left, null, 0); checkNestedRepeat(node.right, null, 0); }
      if (node.type === 'power') { checkNestedRepeat(node.base, null, 0); checkNestedRepeat(node.exp, null, 0); }
      if (node.type === 'factorial') checkNestedRepeat(node.arg, null, 0);
    }
  }
  checkNestedRepeat(simplifiedAST, null, 0);

  // (2) 重复子表达式：f+f, f*f 等，每个 -1
  function checkDuplicateSub(node) {
    if (!node) return;
    if (node.type === 'binop') {
      if (deepEqual(node.left, node.right) && !isConst(node.left)) penalty += 1;
      checkDuplicateSub(node.left); checkDuplicateSub(node.right);
    }
    if (node.type === 'power') { checkDuplicateSub(node.base); checkDuplicateSub(node.exp); }
    if (node.type === 'func') node.args.forEach(checkDuplicateSub);
    if (node.type === 'factorial') checkDuplicateSub(node.arg);
  }
  checkDuplicateSub(simplifiedAST);

  // (3) 无意义结构：+0, *1, ^1 等，每个 -1（检查原始表达式）
  function checkMeaningless(node) {
    if (!node) return;
    if (node.type === 'binop') {
      if (node.op === '+' && ((isConst(node.left) && numVal(node.left) === 0) || (isConst(node.right) && numVal(node.right) === 0))) penalty += 1;
      if (node.op === '-' && isConst(node.right) && numVal(node.right) === 0) penalty += 1;
      if (node.op === '*' && ((isConst(node.left) && numVal(node.left) === 1) || (isConst(node.right) && numVal(node.right) === 1))) penalty += 1;
      checkMeaningless(node.left); checkMeaningless(node.right);
    }
    if (node.type === 'power') {
      if (isConst(node.exp) && numVal(node.exp) === 1) penalty += 1;
      checkMeaningless(node.base); checkMeaningless(node.exp);
    }
    if (node.type === 'func') node.args.forEach(checkMeaningless);
    if (node.type === 'factorial') checkMeaningless(node.arg);
  }
  checkMeaningless(originalAST);

  // (4) 指数滥用：指数为大常数(>5)，penalty += log(指数)
  function checkExpAbuse(node) {
    if (!node) return;
    if (node.type === 'power' && isConst(node.exp) && numVal(node.exp) > 5) penalty += Math.log(numVal(node.exp));
    if (node.type === 'binop') { checkExpAbuse(node.left); checkExpAbuse(node.right); }
    if (node.type === 'power') { checkExpAbuse(node.base); checkExpAbuse(node.exp); }
    if (node.type === 'func') node.args.forEach(checkExpAbuse);
    if (node.type === 'factorial') checkExpAbuse(node.arg);
  }
  checkExpAbuse(simplifiedAST);

  // (5) 除法作弊：f/f 或 x/x，每个 -2（检查原始表达式）
  function checkDivCheat(node) {
    if (!node) return;
    if (node.type === 'binop' && node.op === '/' && deepEqual(node.left, node.right)) penalty += 2;
    if (node.type === 'binop') { checkDivCheat(node.left); checkDivCheat(node.right); }
    if (node.type === 'power') { checkDivCheat(node.base); checkDivCheat(node.exp); }
    if (node.type === 'func') node.args.forEach(checkDivCheat);
    if (node.type === 'factorial') checkDivCheat(node.arg);
  }
  checkDivCheat(originalAST);

  // (6) 表达冗余惩罚：原始式复杂度 - 化简后复杂度
  const cOrig = calcStructure(originalAST), cSimp = calcStructure(simplifiedAST);
  if (cOrig > cSimp) penalty += (cOrig - cSimp);

  // (7) 三角除法惩罚：sin/cos → tan，cos/sin → cot 等可化简形式，每个 -1
  const TRIG_DIV_PAIRS = { sin: 'cos', cos: 'sin', sinh: 'cosh', cosh: 'sinh' };
  function checkTrigDivision(node) {
    if (!node) return;
    if (node.type === 'binop' && node.op === '/') {
      const l = node.left, r = node.right;
      if (l.type === 'func' && r.type === 'func' &&
          TRIG_DIV_PAIRS[l.name] === r.name &&
          deepEqual(l.args[0], r.args[0])) {
        penalty += 1;
      }
    }
    if (node.type === 'binop') { checkTrigDivision(node.left); checkTrigDivision(node.right); }
    if (node.type === 'power') { checkTrigDivision(node.base); checkTrigDivision(node.exp); }
    if (node.type === 'func') node.args.forEach(checkTrigDivision);
    if (node.type === 'factorial') checkTrigDivision(node.arg);
  }
  checkTrigDivision(originalAST);

  return penalty;
}

// ====== Main Evaluate ======
// Score = ceil( clamp(10 + 2*C_final, 5, 30) / 4 ) - 1  →  range [1, 7]
function evaluate(input) {
  const tokens = tokenize(input);
  const originalAST = parse(tokens);
  const simplifiedAST = fullSimplify(originalAST);

  const C_structure = calcStructure(simplifiedAST);
  const C_diversity = calcDiversity(simplifiedAST);
  const structureBonus = calcStructureBonus(simplifiedAST);
  const C_penalty = calcPenalty(originalAST, simplifiedAST);
  const C_final = C_structure + C_diversity + structureBonus - C_penalty;
  const Score = Math.ceil(Math.max(5, Math.min(30, 10 + 2 * C_final)) / 4) - 1;

  return {
    simplified: astToStr(simplifiedAST),
    C_structure,
    C_diversity,
    C_penalty: parseFloat(C_penalty.toFixed(2)),
    C_final,
    Score
  };
}
