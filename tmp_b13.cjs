const fs = require('fs');
const root = process.cwd();

// 1. FunctionParser 函数白名单
const fp = fs.readFileSync(root + '/files/js/FunctionParser.js', 'utf8');
const m = fp.match(/sin|cos|tan|asin|acos|atan|abs|ln|sqrt|exp|log/g);
console.log('FunctionParser funcs mentioned:', m ? [...new Set(m)].sort().join(',') : '(none)');
// 找 functions 定义块
const fm = fp.match(/functions\s*[:=]\s*\{[\s\S]*?\}/);
console.log('--- functions block ---');
console.log(fm ? fm[0].slice(0, 600) : '(no functions block found)');

// 2. MathLatex FUNC_MAP
const ml = fs.readFileSync(root + '/files/js/MathLatex.js', 'utf8');
const mm = ml.match(/exp|log|ln|sin|cos|tan|abs|sqrt/g);
console.log('MathLatex funcs mentioned:', mm ? [...new Set(mm)].sort().join(',') : '(none)');

// 3. RACE_TIERS in server
const sv = fs.readFileSync(root + '/server/index.js', 'utf8');
const tm = sv.match(/RACE_TIERS[\s\S]*?\];/);
console.log('--- RACE_TIERS ---');
console.log(tm ? tm[0].slice(0, 800) : '(RACE_TIERS not found)');
const pm = sv.match(/RACE_PROTECT_SCORE\s*=\s*\d+/);
console.log('RACE_PROTECT_SCORE:', pm ? pm[0] : '(not found)');
