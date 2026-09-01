/**
 * smoke-mobile.cjs — 移动端冒烟测试（可重复运行）
 *
 * 覆盖：
 *  1. iPhone 仿真（DPR=3、触屏）：DPR 高分屏渲染、点按选格、悬浮键盘 FAB 自动收起、提交函数全链路
 *  2. 多视口截图：iPhone SE / 15 Pro Max / Android / iPad 竖屏 / iPad 横屏 / 手机横屏
 *
 * 前置：node scripts/dev-server.js 8138 www 已启动（或任意静态服务）
 * 运行：node scripts/smoke-mobile.cjs [baseUrl]
 * 依赖：全局安装的 playwright（npm i -g @playwright/cli 自带），用系统 Edge 免下载 Chromium
 */
'use strict';
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8138/index.html';
const OUT = path.resolve(__dirname, '..', 'smoke-shots');
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e1) {
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e2) {
    const { execSync } = require('child_process');
    const globalRoot = execSync('npm root -g').toString().trim();
    ({ chromium } = require(path.join(globalRoot, '@playwright', 'cli', 'node_modules', 'playwright')));
  }
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    return await chromium.launch({ headless: true }); // 回退默认 Chromium
  }
}

async function testIphoneFlow(browser) {
  console.log('\n=== iPhone 仿真全流程（390x844, DPR=3, 触屏） ===');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE);
  await page.waitForTimeout(1800);

  // 昵称弹窗（首次进入）：确认
  const nickVisible = await page.evaluate(() => {
    const m = document.getElementById('nickname-modal');
    return m && m.style.display !== 'none' && m.style.display !== '';
  });
  if (nickVisible) await page.click('#nickname-confirm-btn');

  // DPR 高分屏渲染
  const dpr = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    canvasW: uiController.gridSystem.canvas.width,
    css: uiController.gridSystem.cssSize,
  }));
  check('DPR 高分屏：canvas.width ≈ cssSize × dpr', Math.abs(dpr.canvasW - Math.round(dpr.css * dpr.dpr)) <= 3, JSON.stringify(dpr));

  // 进入本地对战
  await page.click('#splash-screen');
  await page.waitForTimeout(400);
  await page.click('#start-go-btn');
  await page.waitForTimeout(400);
  await page.click('#mode-battle');
  await page.waitForTimeout(400);
  await page.click('#mode-submenu-list button');
  await page.waitForTimeout(400);
  await page.click('#mode-config-confirm');
  await page.waitForTimeout(700);
  check('开局进入 select_target 阶段', (await page.evaluate(() => gameController.currentPhase)) === 'select_target');

  // 触屏点按选格
  const box = await (await page.$('#game-canvas')).boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.waitForTimeout(300);
  const targets = await page.evaluate(() => gameController.getGameState().roundState.targetCells);
  check('触屏点按选格生效', Array.isArray(targets) && targets.length === 1, JSON.stringify(targets));

  // 确认目标 → 跳过禁区 → 进入输入阶段
  await page.tap('#confirm-fab-btn');
  await page.waitForTimeout(400);
  await page.tap('#confirm-fab-btn');
  await page.waitForTimeout(600);
  check('进入 input_function 阶段', (await page.evaluate(() => gameController.currentPhase)) === 'input_function');

  // 手机触屏：悬浮键盘默认收起为 FAB
  const kp = await page.evaluate(() => ({
    keypadHidden: document.getElementById('float-keypad').hidden,
    fabHidden: document.getElementById('float-keypad-fab').hidden,
    auto: !!uiController._floatKeypadAutoCollapsed,
  }));
  check('悬浮键盘自动收起为 FAB', kp.keypadHidden === true && kp.fabHidden === false && kp.auto === true, JSON.stringify(kp));

  // 点击 FAB 展开键盘
  await page.tap('#float-keypad-fab');
  await page.waitForTimeout(400);
  check('FAB 点击展开键盘', await page.evaluate(() => !document.getElementById('float-keypad').hidden));

  // 输入 y=x 并提交
  await page.evaluate(() => uiController.addElementToExpression('x'));
  await page.waitForTimeout(300);
  const preview = await page.evaluate(() => document.getElementById('math-preview').innerHTML.length);
  check('KaTeX 预览已渲染', preview > 50, `previewLen=${preview}`);
  await page.screenshot({ path: path.join(OUT, 'iphone-input.png') });
  await page.tap('#float-keypad-submit');
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => ({
    phase: gameController.currentPhase,
    scores: gameController.getGameState().scores,
  }));
  check('提交函数完成结算并推进回合', after.phase !== 'input_function', JSON.stringify(after));
  check('控制台无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(OUT, 'iphone-after-submit.png') });
  await ctx.close();
}

async function testViewports(browser) {
  console.log('\n=== 多视口布局截图 ===');
  const viewports = [
    { name: 'iphone-se-375x667', width: 375, height: 667 },
    { name: 'iphone-15pm-430x932', width: 430, height: 932 },
    { name: 'android-360x800', width: 360, height: 800 },
    { name: 'ipad-portrait-820x1180', width: 820, height: 1180 },
    { name: 'ipad-landscape-1180x820', width: 1180, height: 820 },
    { name: 'phone-landscape-844x390', width: 844, height: 390 },
  ];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const nickVisible = await page.evaluate(() => {
    const m = document.getElementById('nickname-modal');
    return m && m.style.display !== 'none' && m.style.display !== '';
  });
  if (nickVisible) await page.click('#nickname-confirm-btn');
  await page.click('#splash-screen');
  await page.waitForTimeout(400);
  await page.click('#start-go-btn');
  await page.waitForTimeout(500);

  let overflowIssues = 0;
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${vp.name}.png`) });
    // 水平溢出检测：文档可滚动宽度不应超过视口宽
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) {
      overflowIssues++;
      console.log(`  [warn] ${vp.name} 水平溢出 ${overflow}px`);
    }
  }
  check('六种视口均无水平溢出', overflowIssues === 0, `溢出视口数=${overflowIssues}`);
  await ctx.close();
}

async function testRotation(browser) {
  console.log('\n=== 横竖屏切换重排（390x844 ↔ 844x390 触屏） ===');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForTimeout(1600);
  const nickVisible = await page.evaluate(() => {
    const m = document.getElementById('nickname-modal');
    return m && m.style.display !== 'none' && m.style.display !== '';
  });
  if (nickVisible) await page.click('#nickname-confirm-btn');
  await page.click('#splash-screen');
  await page.waitForTimeout(400);
  await page.click('#start-go-btn');
  await page.waitForTimeout(400);
  await page.click('#mode-battle');
  await page.waitForTimeout(400);
  await page.click('#mode-submenu-list button');
  await page.waitForTimeout(400);
  await page.click('#mode-config-confirm');
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => ({
    css: uiController.gridSystem.cssSize,
    canvasW: uiController.gridSystem.canvas.width,
  }));
  // 旋转到横屏
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  const afterLandscape = await page.evaluate(() => ({
    css: uiController.gridSystem.cssSize,
    canvasW: uiController.gridSystem.canvas.width,
    dpr: uiController.gridSystem.dpr,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check('横屏下棋盘重新测量并重建物理像素', afterLandscape.css > 0 && Math.abs(afterLandscape.canvasW - Math.round(afterLandscape.css * afterLandscape.dpr)) <= 3, `竖屏 ${JSON.stringify(before)} → 横屏 ${JSON.stringify(afterLandscape)}`);
  check('横屏无水平溢出', afterLandscape.docOverflowX <= 1, `overflowX=${afterLandscape.docOverflowX}`);
  await page.screenshot({ path: path.join(OUT, 'rotate-landscape.png') });

  // 转回竖屏
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const afterPortrait = await page.evaluate(() => ({
    css: uiController.gridSystem.cssSize,
    canvasW: uiController.gridSystem.canvas.width,
  }));
  check('转回竖屏棋盘尺寸正确恢复', afterPortrait.css > 0 && afterPortrait.canvasW !== afterLandscape.canvasW, JSON.stringify(afterPortrait));
  check('旋转过程无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await ctx.close();
}

async function testModals(browser) {
  console.log('\n=== 小屏模态框布局（390x844 触屏） ===');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  // 每个模态框检查前重新进入主界面（模式按钮位于 start-modal 内，打开下级界面后会被隐藏）
  const enterMainPage = async () => {
    await page.goto(BASE);
    await page.waitForTimeout(1600);
    const nickVisible = await page.evaluate(() => {
      const m = document.getElementById('nickname-modal');
      return m && m.style.display !== 'none' && m.style.display !== '';
    });
    if (nickVisible) await page.click('#nickname-confirm-btn');
    await page.click('#splash-screen');
    await page.waitForTimeout(400);
    await page.click('#start-go-btn');
    await page.waitForTimeout(400);
  };

  // 模态框可见性与可视区域溢出检测
  const modalAudit = async (label) => {
    const info = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      let worst = null;
      for (const m of document.querySelectorAll('.modal')) {
        if (m.style.display === 'none' || m.style.display === '') continue;
        const card = m.querySelector('.modal-content');
        if (!card) continue;
        const r = card.getBoundingClientRect();
        const overBottom = Math.round(r.bottom - vh);
        const overRight = Math.round(r.right - vw);
        if (!worst || overBottom > worst.overBottom) worst = { overBottom, overRight };
      }
      return { vh, vw, worst };
    });
    const ok = !info.worst || (info.worst.overBottom <= 2 && info.worst.overRight <= 2);
    check(`${label} 模态框在小屏内完整可见`, ok, JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, `modal-${label}.png`) });
  };

  // 闯关模式
  await enterMainPage();
  await page.click('#mode-campaign');
  await page.waitForTimeout(700);
  await modalAudit('campaign');

  // 竞速模式
  await enterMainPage();
  await page.click('#mode-race');
  await page.waitForTimeout(900);
  await modalAudit('race');

  // 排行榜
  await enterMainPage();
  await page.click('#leaderboard-open-btn');
  await page.waitForTimeout(900);
  await modalAudit('leaderboard');

  // 联机对战（房间弹窗；网络失败不影响布局检查）
  await enterMainPage();
  await page.click('#mode-battle');
  await page.waitForTimeout(600);
  const btns = await page.$$('#mode-submenu-list button');
  if (btns[2]) {
    await btns[2].click();
    await page.waitForTimeout(900);
    await modalAudit('p2p');
  }

  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    await testIphoneFlow(browser);
    await testViewports(browser);
    await testRotation(browser);
    await testModals(browser);
  } finally {
    await browser.close();
  }
  const fails = results.filter((r) => !r.pass);
  console.log(`\n=== 汇总: PASS ${results.length - fails.length} / FAIL ${fails.length} / TOTAL ${results.length} ===`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('冒烟脚本异常:', e);
  process.exit(2);
});
