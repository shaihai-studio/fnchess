// tmp_test_server_check.cjs
// 诊断：公告/版本号看不了，是不是服务器的问题？
// 模拟前端请求并验证响应，无需 npm install，Node 内置 https 即可。
// 用法：node tmp_test_server_check.cjs
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 8000;

// ─── 请求封装（模拟前端 fetch） ─────────────────────────
function httpGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: true,
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// ─── 检查项 ─────────────────────────────────────────────
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

function parseJson(name, body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    check(`${name} 返回合法 JSON`, false, `JSON.parse 失败: ${e.message}`);
    return null;
  }
}

// ─── 主流程 ─────────────────────────────────────────────
async function main() {
  console.log('=== 函数棋 公告/版本 服务器诊断 ===');
  const gvRaw = fs.readFileSync(path.join(__dirname, 'files', 'js', 'GameVersion.js'), 'utf8');
  const gvMatch = gvRaw.match(/GAME_VERSION\s*=\s*'([^']+)'/);
  console.log('本地 GAME_VERSION =', gvMatch ? gvMatch[1] : '(未找到)');

  // 读取本地 server 文件作为基准
  const localNotice = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'server', 'notice.json'), 'utf8')); }
    catch (e) { return null; }
  })();
  const localVersion = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'server', 'version.json'), 'utf8')); }
    catch (e) { return null; }
  })();
  check('本地 server/notice.json 可读且合法', !!localNotice, localNotice ? `id=${localNotice.id}` : '');
  check('本地 server/version.json 可读且合法', !!localVersion, localVersion ? `version=${localVersion.version}` : '');

  console.log('\n--- 接口 1: p2p.shaihai.cn/notice (游戏内公告) ---');
  const r1 = await httpGet('https://p2p.shaihai.cn/notice');
  if (!r1.ok) {
    check('p2p.shaihai.cn/notice 可连接', false, `请求失败: ${r1.error}`);
  } else {
    check('p2p.shaihai.cn/notice 可连接', true, `HTTP ${r1.status}`);
    check('p2p.shaihai.cn/notice HTTP 200', r1.status === 200, `status=${r1.status}`);
    check('p2p.shaihai.cn/notice 带 CORS 头', (r1.headers['access-control-allow-origin'] === '*' || !!r1.headers['access-control-allow-origin']), `ACAO=${r1.headers['access-control-allow-origin']}`);
    const n = parseJson('p2p.shaihai.cn/notice', r1.body);
    if (n) {
      check('notice 含 id', n.id != null, `id=${n.id}`);
      check('notice 含 title', !!n.title, n.title ? `"${n.title}"` : '缺失');
      check('notice 含 content', !!n.content, n.content ? `content 长度=${n.content.length}` : '缺失');
      if (localNotice) {
        check('notice 与本地文件一致', n.id === localNotice.id, `本地 id=${localNotice.id}, 服务器 id=${n.id}`);
      }
    }
  }

  console.log('\n--- 接口 2: p2p.shaihai.cn/version (游戏内版本) ---');
  const r2 = await httpGet('https://p2p.shaihai.cn/version');
  if (!r2.ok) {
    check('p2p.shaihai.cn/version 可连接', false, `请求失败: ${r2.error}`);
  } else {
    check('p2p.shaihai.cn/version 可连接', true, `HTTP ${r2.status}`);
    check('p2p.shaihai.cn/version HTTP 200', r2.status === 200, `status=${r2.status}`);
    check('p2p.shaihai.cn/version 带 CORS 头', (r2.headers['access-control-allow-origin'] === '*' || !!r2.headers['access-control-allow-origin']), `ACAO=${r2.headers['access-control-allow-origin']}`);
    const v = parseJson('p2p.shaihai.cn/version', r2.body);
    if (v) {
      check('version 含 version 字段', !!v.version, v.version ? `version=${v.version}` : '缺失');
      if (localVersion) {
        check('version 与本地文件一致', v.version === localVersion.version, `本地=${localVersion.version}, 服务器=${v.version}`);
      }
    }
  }

  console.log('\n--- 接口 3: shaihai.cn/api/announcement (开始界面公告按钮) ---');
  const r3 = await httpGet('https://shaihai.cn/api/announcement');
  if (!r3.ok) {
    check('shaihai.cn/api/announcement 可连接', false, `请求失败: ${r3.error}`);
  } else {
    check('shaihai.cn/api/announcement 可连接', true, `HTTP ${r3.status}`);
    check('announcement HTTP 200', r3.status === 200, `status=${r3.status}`);
    check('announcement 返回非空文本', r3.body.trim().length > 0, `长度=${r3.body.trim().length}`);
  }

  console.log('\n--- 接口 4: shaihai.cn/api/version (开始界面版本按钮) ---');
  const r4 = await httpGet('https://shaihai.cn/api/version');
  if (!r4.ok) {
    check('shaihai.cn/api/version 可连接', false, `请求失败: ${r4.error}`);
  } else {
    check('shaihai.cn/api/version 可连接', true, `HTTP ${r4.status}`);
    check('api/version HTTP 200', r4.status === 200, `status=${r4.status}`);
    const v = parseJson('shaihai.cn/api/version', r4.body);
    if (v) {
      const latest = v.version || v.latest || (v.data && v.data.version) || null;
      check('api/version 可解析出版本号', !!latest, latest ? `version=${latest}` : `原始内容=${r4.body.slice(0, 80)}`);
    }
  }

  // ─── 汇总 ─────────────────────────────────────────────
  console.log('\n=== 汇总 ===');
  const fails = results.filter((r) => !r.pass);
  const passes = results.filter((r) => r.pass);
  console.log(`PASS ${passes.length} / FAIL ${fails.length} / TOTAL ${results.length}`);
  if (fails.length === 0) {
    console.log('结论：服务器接口全部正常，问题不在服务器，应继续排查前端（z-index/弹窗逻辑/浏览器缓存）。');
  } else {
    console.log('结论：存在失败项，见上方 [FAIL] 明细。');
    fails.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }
}

main().catch((e) => {
  console.error('脚本异常:', e);
  process.exit(1);
});
