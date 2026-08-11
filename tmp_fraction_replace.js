// 一次性脚本：用 C:\Users\admin\Desktop\campaignFraction2.js 替换 campaignLevels.js 的分数关卡 1/2~1/20
// 校验 JSON 合法、保留 1/20 的 nextId=30（接数字关卡 30）
const fs = require('fs');

const newPath = 'C:\\Users\\admin\\Desktop\\campaignFraction2.js';
const srcPath = 'c:\\Users\\admin\\Desktop\\函数棋项目\\函数棋\\files\\js\\campaignLevels.js';

// 1. 读取并 JSON 校验新文件
let newText = fs.readFileSync(newPath, 'utf8').trim();
const arr = JSON.parse(newText);
if (!Array.isArray(arr) || arr.length !== 19) throw new Error('新文件关卡数不是 19: ' + arr.length);
for (const lv of arr) {
    if (!lv.id || lv.difficulty !== 'fraction') throw new Error('关卡格式不符: ' + JSON.stringify(lv.id));
    if (typeof lv.nextId !== 'string' && lv.nextId !== null) throw new Error('nextId 类型不符: ' + lv.id);
    for (const c of [].concat(lv.targetCells, lv.forbiddenCells)) {
        if (Math.abs(c.x) > 10 || Math.abs(c.y) > 10) throw new Error('坐标超界: ' + lv.id + ' ' + c.x + ',' + c.y);
    }
}
console.log('新文件校验通过，共', arr.length, '关');

// 2. 提取对象文本：去掉首行 [ 与末行 ]
let objText = newText.replace(/^\[\s*\r?\n/, '').replace(/\r?\n\s*\]\s*$/, '');
// 首行 { 补缩进（对齐原文件对象起始的 19 空格）
if (!/^\s*\{/.test(objText)) throw new Error('对象文本开头不是 {');
objText = '                   ' + objText.replace(/^\s*\{/, '{');
// 修正 1/20 的 nextId null -> 30
const fixed = objText.replace(/"nextId":\s*null/, '"nextId":  30');
if (fixed === objText) throw new Error('未找到 nextId: null 需要修正');
objText = fixed;
console.log('对象文本提取完成，长度', objText.length);

// 3. 读取原文件并定位替换区间
let src = fs.readFileSync(srcPath, 'utf8');
const idStart = src.indexOf('"id":  "1/2"');
if (idStart < 0) throw new Error('原文件未找到 1/2');
const start = src.lastIndexOf('{', idStart);
const id30 = src.indexOf('"id":  30');
if (id30 < 0) throw new Error('原文件未找到 id 30');
const end = src.lastIndexOf('{', id30);

// 4. 替换
const result = src.slice(0, start) + objText + src.slice(end);
fs.writeFileSync(srcPath, result, 'utf8');

// 5. 校验替换结果
const check = fs.readFileSync(srcPath, 'utf8');
const fracCount = (check.match(/"difficulty":\s*"fraction"/g) || []).length;
const nextId30Count = (check.match(/"nextId":\s*30/g) || []).length;
const startOk = check.includes('"id":  "1/2"');
const endOk = check.includes('"id":  30');
if (!startOk || !endOk || fracCount !== 19) throw new Error('替换结果校验失败: fraction=' + fracCount + ' nextId30=' + nextId30Count);
console.log('替换完成: fraction 关卡数=' + fracCount + ', nextId=30 出现=' + nextId30Count + ', 数字关卡 30 保留=' + endOk);
