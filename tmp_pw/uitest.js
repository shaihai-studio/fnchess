// 函数棋 UI 用户模拟排查脚本（Playwright headless）
// 模拟真实用户：开始游戏 → 人机对战 → 写表达式提交 → 退出 → 测试模式连点缩放
const pw = require('C:/Users/admin/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const EXE = 'C:/Users/admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8899/index.html';

const LOGS = [];
function capture(page, tag) {
  page.on('console', m => LOGS.push(`[${tag}][console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => LOGS.push(`[${tag}][pageerror] ${e.stack || e.message}`));
  page.on('requestfailed', r => LOGS.push(`[${tag}][reqfailed] ${r.url()} ${r.failure() ? r.failure().errorText : ''}`));
}

async function getState(page) {
  return page.evaluate(() => {
    const gc = window.gameController;
    if (!gc) return { init: false };
    return {
      init: true,
      phase: gc.currentPhase,
      mode: gc.gameMode,
      round: gc.currentRound,
      player: gc.currentPlayer,
      canvas: !!document.getElementById('game-canvas'),
      zoomRange: document.getElementById('zoom-range') ? document.getElementById('zoom-range').textContent : null
    };
  });
}

async function clickCanvasCell(page, x, y) {
  // 通过 gridSystem 计算格子像素位置，真实鼠标点击
  const box = await page.evaluate(([cx, cy]) => {
    const gc = window.gameController;
    const canvas = document.getElementById('game-canvas');
    const r = canvas.getBoundingClientRect();
    const p = gc.gridSystem.mathToCanvas(cx, cy);
    return { left: r.left, top: r.top, px: p.x, py: p.y, w: r.width, h: r.height };
  }, [x, y]);
  await page.mouse.click(box.left + box.px, box.top + box.py);
}

async function skipPhase(page) {
  await page.evaluate(() => {
    const b = document.getElementById('skip-btn');
    if (b) b.click();
  });
}

async function main() {
  const browser = await pw.chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
  const page = await ctx.newPage();
  capture(page, 'P1');

  console.log('=== 1. 打开页面 ===');
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  let st = await getState(page);
  console.log('页面初始化:', JSON.stringify(st));

  console.log('=== 2. 开始游戏 → 人机对战 ===');
  await page.click('#start-go-btn');
  await page.waitForTimeout(500);
  await page.click('#mode-ai');
  await page.waitForTimeout(400);
  const hint = await page.evaluate(() => document.getElementById('mode-hint').textContent);
  console.log('模式提示:', hint);
  await page.click('#start-btn');
  await page.waitForTimeout(3000);
  st = await getState(page);
  console.log('对局开始:', JSON.stringify(st));

  console.log('=== 3. 逐阶段模拟 ===');
  for (let step = 0; step < 40; step++) {
    st = await getState(page);
    if (!st.init) { console.log('[step', step, '] gameController 不存在，退出'); break; }

    // 检查游戏结束弹窗
    const over = await page.evaluate(() => {
      const m = document.getElementById('game-over-modal');
      return m ? m.style.display !== 'none' : false;
    });
    if (over) {
      console.log('[step', step, '] 游戏结束弹窗出现, phase=', st.phase, 'round=', st.round);
      break;
    }

    if (st.phase === 'input_function') {
      console.log('[step', step, '] input_function 阶段, 输入表达式 x 并连按 3 次 Enter (V7测试)');
      await page.keyboard.press('x');
      await page.waitForTimeout(120);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    } else if (st.phase === 'select_target') {
      console.log('[step', step, '] select_target, 点棋盘格子(0,0) + Enter');
      await clickCanvasCell(page, 0, 0);
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    } else if (st.phase === 'set_forbidden' || st.phase === 'set_locks') {
      console.log('[step', step, ']', st.phase, ', 尝试跳过阶段');
      await skipPhase(page);
      await page.waitForTimeout(1500);
    } else if (st.phase === 'evaluate' || st.phase === 'init') {
      console.log('[step', step, ']', st.phase, ', 等待评估');
      await page.waitForTimeout(2000);
    } else {
      console.log('[step', step, '] 其他阶段:', st.phase, ', round=', st.round);
      await page.waitForTimeout(1200);
    }

    // 每 4 步检查一次是否卡死（phase 10s 无变化则报错）
    if (step % 4 === 0) {
      const s1 = JSON.stringify(st);
      await page.waitForTimeout(3000);
      const st2 = await getState(page);
      const s2 = JSON.stringify(st2);
      if (s1 === s2 && !over) {
        console.log('[step', step, '] ⚠ 可能卡死: phase 3s 无变化', s2);
      } else {
        console.log('[step', step, '] phase 变化正常:', s1, '→', s2);
      }
    }
  }

  console.log('=== 4. 退出对局 ===');
  await page.evaluate(() => {
    const b = document.getElementById('exit-btn');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = document.getElementById('confirm-exit-btn');
    if (b) b.click();
  });
  await page.waitForTimeout(2000);
  st = await getState(page);
  console.log('退出后:', JSON.stringify(st));

  console.log('=== 5. 测试模式缩放连点 (V6) ===');
  await page.click('#mode-test');
  await page.waitForTimeout(400);
  await page.click('#start-btn');
  await page.waitForTimeout(1500);
  const zoomBefore = await page.evaluate(() => {
    const z = document.getElementById('zoom-range');
    const gc = window.gameController;
    return { text: z ? z.textContent : null, range: gc ? gc.gridSystem.range : null };
  });
  console.log('缩放前:', JSON.stringify(zoomBefore));
  // 快速连点 zoom-out 5 次（间隔 50ms）
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const b = document.getElementById('zoom-out-btn');
      if (b) b.click();
    });
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(800);
  const zoomAfter = await page.evaluate(() => {
    const z = document.getElementById('zoom-range');
    const gc = window.gameController;
    return { text: z ? z.textContent : null, range: gc ? gc.gridSystem.range : null };
  });
  console.log('缩放后(期望连续缩小5级 range-25):', JSON.stringify(zoomAfter));
  if (zoomAfter.range !== zoomBefore.range - 25) {
    console.log('⚠ V6 复现: 连点缩放被节流丢弃, 实际只缩小', (zoomBefore.range - zoomAfter.range), '级');
  } else {
    console.log('V6 未复现: 5 连点全部生效');
  }

  console.log('=== 6. 收集到的 console 日志 ===');
  const V5_PATTERNS = /_cleanupP2P|收到房间解散|onReconnected|访客重连后 10s|房主重连等待|确认 phase|非本方回合/;
  let v5Count = 0;
  for (const line of LOGS) {
    if (V5_PATTERNS.test(line)) { console.log('[V5-日志]', line); v5Count++; }
  }
  console.log('V5 残留日志计数:', v5Count);
  const errors = LOGS.filter(l => l.includes('[pageerror]') || l.includes('[console.error]'));
  console.log('--- 错误(全部) ---');
  for (const e of errors) console.log(e);
  if (errors.length === 0) console.log('(无 pageerror / console.error)');
  const warns = LOGS.filter(l => l.includes('[console.warn]'));
  console.log('--- console.warn(', warns.length, '条) ---');
  for (const w of warns) console.log(w);

  await browser.close();
}

main().catch(e => { console.error('脚本异常:', e); process.exit(1); });
