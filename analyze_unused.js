// 临时分析脚本 v3：统计"定义行之外"的引用次数（只读，不修改任何源文件）
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_DIRS = ['files/js', 'files/Summa形象处理', 'files/geogebra-lite/plot', 'files/geogebra-lite'];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const allJs = [];
for (const d of SRC_DIRS) walk(path.join(ROOT, d), allJs);

const contents = new Map();
for (const f of allJs) contents.set(f, fs.readFileSync(f, 'utf8'));

// 收集每行文本（file -> array of {lineText, lineNo}），用于统计定义行之外的引用
const fileLines = new Map();
for (const [f, c] of contents) {
  fileLines.set(f, c.split('\n'));
}

// 收集所有行（定义处之外）做字符串计数
const htmlLines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');

function countOccurrences(name, defFile, defLine) {
  let n = 0;
  const re = new RegExp(name, 'g');
  let m;
  for (const [f, lines] of fileLines) {
    for (let i = 0; i < lines.length; i++) {
      if (f === defFile && i + 1 === defLine) continue; // 跳过定义行
      const re2 = new RegExp(name, 'g');
      while ((m = re2.exec(lines[i])) !== null) n++;
    }
  }
  for (const l of htmlLines) {
    const re2 = new RegExp(name, 'g');
    while ((m = re2.exec(l)) !== null) n++;
  }
  return n;
}

const defs = new Map();

for (const [f, c] of contents) {
  const lines = c.split('\n');
  // prototype 方法
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*(function|\()/);
    if (m) {
      const name = m[2];
      if (!defs.has(name)) defs.set(name, { file: f, line: i + 1, type: 'prototype' });
    }
  }
  // class 方法 / 字段
  let inClass = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inClass && /^class\s+[A-Za-z_$][\w$]*/.test(line)) { inClass = true; continue; }
    if (inClass && line === '}') { inClass = false; continue; }
    if (inClass) {
      let mm = line.match(/^\s{4,}(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
      if (!mm) mm = line.match(/^\s{4,}([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>/);
      if (!mm) mm = line.match(/^\s{4,}([A-Za-z_$][\w$]*)\s*=\s*function/);
      if (mm) {
        const name = mm[1];
        if (!/^(if|for|while|switch|catch|function|return|else)$/.test(name)) {
          if (!defs.has(name)) defs.set(name, { file: f, line: i + 1, type: 'class:method' });
        }
      }
    }
  }
}

// 顶层 function 定义
for (const [f, c] of contents) {
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) {
      const name = m[1];
      if (!defs.has(name)) defs.set(name, { file: f, line: i + 1, type: 'function' });
    }
  }
}

const report = [];
for (const [name, d] of defs) {
  if (name.length < 2 || name === 'constructor') continue;
  const cnt = countOccurrences(name, d.file, d.line);
  if (cnt === 0) report.push({ name, cnt, ...d }); // 只关注定义行之外 0 次引用的
}

report.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const out = [];
out.push('=== 定义行之外 0 次引用的方法（未使用）===');
for (const r of report) {
  const rel = path.relative(ROOT, r.file);
  out.push(`${rel}:${r.line}  ${r.name}  (${r.type})`);
}
out.push(`\n共 ${report.length} 个`);
const outStr = out.join('\n');
console.log(outStr);
fs.writeFileSync(path.join(ROOT, 'analyze_unused_out.txt'), outStr);
