/**
 * analyze_delete.js — 按目标列表删除死代码方法（括号匹配 + 前导注释 + 空行合并）
 * 用法：
 *   node analyze_delete.js          dry-run，只打印计划
 *   node analyze_delete.js --apply  实际删除
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = 'c:/Users/admin/Desktop/函数棋项目/函数棋';
const APPLY = process.argv.includes('--apply');

// { file, line(1-based), name }
const targets = [
  { file: 'files/js/AudioManager.js', line: 268, name: 'playSummaDrag' },
  { file: 'files/js/FunctionParser.js', line: 346, name: 'setLockedElements' },
  { file: 'files/js/FunctionParser.js', line: 573, name: 'formatExpression' },
  { file: 'files/js/FunctionRenderer.js', line: 60, name: 'getAdaptiveBatchSize' },
  { file: 'files/js/FunctionRenderer.js', line: 195, name: 'evaluateRaw' },
  { file: 'files/js/FunctionRenderer.js', line: 237, name: '_createCapturingPath' },
  { file: 'files/js/FunctionRenderer.js', line: 306, name: '_shouldForceDenseResample' },
  { file: 'files/js/FunctionRenderer.js', line: 914, name: 'previewFunction' },
  { file: 'files/js/FunctionRenderer.js', line: 976, name: 'isPointVisible' },
  { file: 'files/js/GameController.js', line: 714, name: 'advanceCampaignLevel' },
  { file: 'files/js/GridSystem.js', line: 229, name: 'canvasToMath' },
  { file: 'files/js/GridSystem.js', line: 297, name: 'addTargetCell' },
  { file: 'files/js/GridSystem.js', line: 313, name: 'removeTargetCell' },
  { file: 'files/js/GridSystem.js', line: 358, name: 'clearTargetCell' },
  { file: 'files/js/GridSystem.js', line: 367, name: 'clearForbiddenCells' },
  { file: 'files/js/GridSystem.js', line: 631, name: 'extendFunctionPoints' },
  { file: 'files/js/GridSystem.js', line: 676, name: 'cellSizePx' },
  { file: 'files/js/GridSystem.js', line: 820, name: 'getTargetCells' },
  { file: 'files/js/GridSystem.js', line: 828, name: 'getForbiddenCells' },
  { file: 'files/js/GridSystem.js', line: 837, name: 'getCellRect' },
  { file: 'files/js/LeaderboardService.js', line: 215, name: 'submitTTSigma' },
  { file: 'files/js/P2PController.js', line: 887, name: 'getMyPlayerId' },
  { file: 'files/js/P2PController.js', line: 888, name: 'getOpponentPlayerId' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 73, name: 'completeLevel' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 87, name: 'failAndRetry' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 94, name: 'nextLevel' },
  { file: 'files/js/RaceMode/RaceModeManager.js', line: 32, name: 'setBestTime' },
  { file: 'files/js/RaceMode/RaceModeManager.js', line: 43, name: 'getDrawDelay' },
  { file: 'files/js/ui/UIEditor.js', line: 125, name: 'worldToCanvas' },
  { file: 'files/js/ui/UIEditor.js', line: 226, name: 'snapLevelPoints' },
  { file: 'files/js/ui/UIStart.js', line: 323, name: 'getSelectedTimeLimitMode' },
  { file: 'files/js/ui/UIStart.js', line: 337, name: 'handleStartButtonClick' },
  { file: 'files/js/ui/UIRace.js', line: 330, name: 'updateRaceProgressUI' },
  { file: 'files/js/ui/UICore.js', line: 388, name: 'getTimeLimitValue' },
  { file: 'files/js/ui/UICore.js', line: 999, name: 'calculateTTSpeed' },
  { file: 'files/js/ui/UICore.js', line: 1521, name: 'handleSkip' },
  { file: 'files/js/ui/UICore.js', line: 1954, name: 'addClearFunctionsButton' },
  { file: 'files/js/ui/UILobby.js', line: 216, name: '_escapeHtml' },
  { file: 'files/js/ui/UILobby.js', line: 509, name: '_confirmP2PExit' },
  { file: 'files/js/ui/UICampaign.js', line: 879, name: '_isFractionLevelUnlocked' },
  { file: 'files/js/ui/UICampaign.js', line: 886, name: '_renderCampaignBranchTree' },
  // 第二轮：调用方被删后暴露的连锁死代码
  { file: 'files/js/FunctionRenderer.js', line: 548, name: '_drawViaGeoGebra' },
  { file: 'files/js/GameController.js', line: 1839, name: 'skipPhase' },
  { file: 'files/js/GridSystem.js', line: 574, name: 'evaluateExpression' },
  { file: 'files/js/GridSystem.js', line: 699, name: 'getTargetCell' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 49, name: 'getElapsed' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 58, name: 'setBest' },
  { file: 'files/js/RaceMode/RaceModeController.js', line: 73, name: 'getStarsByElapsed' },
  // 第三轮：连锁暴露的 FunctionRenderer 内部方法
  { file: 'files/js/FunctionRenderer.js', line: 83, name: '_buildView' },
  { file: 'files/js/FunctionRenderer.js', line: 169, name: '_buildAdapter' },
  { file: 'files/js/FunctionRenderer.js', line: 547, name: '_drawLnPolyline' },
];

// 判断 `/` 是除法还是正则字面量开始：前一个非空白字符为标识符/数字/闭括号时是除法
function isRegexStart(line, j) {
  let k = j - 1;
  while (k >= 0 && /\s/.test(line[k])) k--;
  if (k < 0) return true;
  return !/[A-Za-z0-9_$)\]}]/.test(line[k]);
}

// 找到方法体的结束行（大括号匹配，跳过字符串、注释与正则字面量）
function findMethodEnd(lines, startIdx) {
  let depth = 0, started = false;
  let inS = false, inD = false, inT = false, inBC = false;
  let inRegex = false, inRegexClass = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let inLC = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j], n = line[j + 1];
      if (inLC) continue;
      if (inBC) {
        if (c === '*' && n === '/') { inBC = false; j++; }
        continue;
      }
      if (inRegex) {
        if (inRegexClass) {
          if (c === '\\') j++;
          else if (c === ']') inRegexClass = false;
        } else {
          if (c === '\\') j++;
          else if (c === '[') inRegexClass = true;
          else if (c === '/') inRegex = false;
        }
        continue;
      }
      if (inS) { if (c === '\\') j++; else if (c === "'") inS = false; continue; }
      if (inD) { if (c === '\\') j++; else if (c === '"') inD = false; continue; }
      if (inT) { if (c === '\\') j++; else if (c === '`') inT = false; continue; }
      if (c === '/' && n === '/') { inLC = true; j++; continue; }
      if (c === '/' && n === '*') { inBC = true; j++; continue; }
      if (c === '/' && isRegexStart(line, j)) { inRegex = true; continue; }
      if (c === "'") { inS = true; continue; }
      if (c === '"') { inD = true; continue; }
      if (c === '`') { inT = true; continue; }
      if (!started) {
        if (c === '{') { started = true; depth = 1; }
      } else {
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
      }
    }
  }
  return -1;
}

// 向上收集紧邻的连续注释行，返回第一行 index（无可删则返回 startIdx）
function leadingCommentStart(lines, startIdx) {
  let i = startIdx - 1;
  let commentStart = startIdx;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t === '') break;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
      commentStart = i;
    } else {
      break;
    }
    i--;
  }
  return commentStart;
}

// 按文件分组、行号降序处理，避免删除导致行号漂移
const byFile = new Map();
for (const t of targets) {
  if (!byFile.has(t.file)) byFile.set(t.file, []);
  byFile.get(t.file).push(t);
}

let totalDeleted = 0;
const problems = [];

for (const [rel, list] of byFile) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  const sorted = list.slice().sort((a, b) => b.line - a.line);

  for (const t of sorted) {
    const startIdx = t.line - 1;
    const defLine = lines[startIdx];
    if (defLine === undefined) { problems.push(`${rel}:${t.line} 越界`); continue; }
    if (!defLine.includes(t.name)) { problems.push(`${rel}:${t.line} 定义行不匹配「${t.name}」→ ${defLine.trim()}`); continue; }

    const endIdx = findMethodEnd(lines, startIdx);
    if (endIdx === -1) { problems.push(`${rel}:${t.line} ${t.name} 括号匹配失败`); continue; }

    let cStart = leadingCommentStart(lines, startIdx);
    let cEnd = endIdx;
    // UI 模块方法后独立 `;` 行一并删除
    let semicolon = false;
    if (endIdx + 1 < lines.length && lines[endIdx + 1].trim() === ';') {
      cEnd = endIdx + 1;
      semicolon = true;
    }

    const delCount = cEnd - cStart + 1;
    totalDeleted += delCount;

    const pre = cStart > 0 ? lines[cStart - 1].trim() : '<文件头>';
    const post = cEnd + 1 < lines.length ? lines[cEnd + 1].trim() : '<文件尾>';
    console.log(`[${rel}:${cStart + 1}-${cEnd + 1}] 删除 ${t.name}  (${delCount} 行, 分号=${semicolon})`);
    console.log(`    上方: ${pre.slice(0, 60) || '<空>'}`);
    console.log(`    下方: ${post.slice(0, 60) || '<空>'}`);
    console.log(`    首行: ${lines[cStart].trim().slice(0, 70)}`);
    console.log(`    末行: ${lines[cEnd].trim().slice(0, 70)}`);

    if (APPLY) {
      lines.splice(cStart, delCount);
      // 空行合并：删除点上下若都是空行，去掉下方一个
      if (cStart > 0 && cStart < lines.length &&
          lines[cStart - 1].trim() === '' && lines[cStart].trim() === '') {
        lines.splice(cStart, 1);
      }
    }
  }

  if (APPLY) fs.writeFileSync(abs, lines.join('\n'), 'utf8');
}

console.log('\n=== 汇总 ===');
console.log(`计划删除总行数: ${totalDeleted}`);
if (problems.length) {
  console.log('存在问题:');
  for (const p of problems) console.log('  ! ' + p);
} else {
  console.log('无匹配问题');
}
console.log(APPLY ? '已执行删除' : '（dry-run，未写文件。加 --apply 执行）');
