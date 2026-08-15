const fs = require('fs');
const root = process.cwd();
const fp = fs.readFileSync(root + '/files/js/FunctionParser.js', 'utf8').split('\n');
const ml = fs.readFileSync(root + '/files/js/MathLatex.js', 'utf8').split('\n');

function ctx(lines, kw, label) {
  console.log('==== ' + label + ' : lines containing ' + kw + ' ====');
  lines.forEach((l, i) => {
    if (l.includes(kw)) console.log((i + 1) + ': ' + l.trim().slice(0, 120));
  });
}
ctx(fp, 'exp', 'FunctionParser exp');
ctx(fp, 'log', 'FunctionParser log');
ctx(ml, 'exp', 'MathLatex exp');
ctx(ml, 'log', 'MathLatex log');
