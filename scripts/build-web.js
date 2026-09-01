/**
 * build-web.js — 将 index.html + files/ 构建为 www/（Capacitor webDir）
 *
 * 功能：
 *  1. 全量拷贝 index.html 与 files/ 到 www/（剔除冗余/非运行时文件）
 *  2. 将 index.html 中按依赖顺序加载的 files/js 与 files/geogebra-lite 脚本
 *     合并为少量 bundle（保持加载顺序不变），减少 WebView 请求开销
 *  3. 在 <head> 注入移动端启动脚本标记（capacitor 运行时由原生壳自动注入）
 *
 * 用法：node scripts/build-web.js [--no-bundle]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const NO_BUNDLE = process.argv.includes('--no-bundle');

// ── 需要剔除的文件/目录（不进入 App 包体） ─────────────────────
const EXCLUDE = [
  /tmp_test_server_check\.cjs$/i,
  /\.md$/i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
];

function shouldExclude(relPath) {
  return EXCLUDE.some((re) => re.test(relPath));
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // 目录被占用（如本地 dev-server 正在读取）或系统回收站策略拦截时降级：
    // 逐项删除，失败则保留旧文件（后续拷贝会覆盖），保证构建不中断
    console.warn('  [warn] 整目录清理失败，改为逐项删除：', e && e.message);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch (e2) {
        console.warn(`  [warn] 跳过删除 ${entry.name}：`, e2 && e2.message);
      }
    }
  }
}

function copyDir(src, dest, base) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    const rel = path.relative(base, s);
    if (entry.isDirectory()) {
      copyDir(s, d, base);
    } else if (!shouldExclude(rel)) {
      fs.copyFileSync(s, d);
    }
  }
}

// ── 合并 index.html 中的本地脚本为 bundle ──────────────────────
function bundleScripts(html) {
  // 匹配 <script src="files/..."></script>（不带其他属性的本地脚本）
  const scriptRe = /<script\s+src="(files\/[^"]+)"><\/script>/g;
  const groups = []; // 连续的本地 script 标签合并为一组
  let current = [];
  let lastEnd = -1;
  let m;
  const matches = [];
  while ((m = scriptRe.exec(html)) !== null) {
    matches.push({ full: m[0], src: m[1], index: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) return { html, bundleCount: 0 };

  for (const it of matches) {
    // 两个标签之间只允许空白，否则断开分组
    const between = lastEnd === -1 ? '' : html.slice(lastEnd, it.index);
    if (lastEnd !== -1 && !/^\s*$/.test(between)) {
      groups.push(current);
      current = [];
    }
    current.push(it);
    lastEnd = it.end;
  }
  groups.push(current);

  let out = '';
  let cursor = 0;
  let bundleIdx = 0;
  const mergedSrcs = [];
  for (const group of groups) {
    if (group.length < 3) {
      // 少于 3 个文件不值得合并，原样保留
      continue;
    }
    bundleIdx += 1;
    const bundleName = `files/bundle-${bundleIdx}.js`;
    const parts = [];
    for (const it of group) {
      const abs = path.join(ROOT, it.src);
      if (!fs.existsSync(abs)) {
        console.warn(`  [warn] 脚本不存在，跳过: ${it.src}`);
        continue;
      }
      mergedSrcs.push(it.src);
      let content = fs.readFileSync(abs, 'utf8');
      // 生产构建剥离 console.log（参数仍求值，无副作用差异；保留 warn/error/info 供诊断）
      content = content.replace(/console\.log\s*\(/g, 'void(');
      // 每个文件前置 ";" 防止 ASI 拼接事故
      parts.push(`\n;/* ══ ${it.src} ══ */\n` + content + '\n');
    }
    const bundleAbs = path.join(OUT, bundleName);
    fs.mkdirSync(path.dirname(bundleAbs), { recursive: true });
    fs.writeFileSync(bundleAbs, parts.join(''), 'utf8');
    console.log(`  [bundle] ${bundleName}  ← ${group.length} 个文件`);

    // 用 bundle 标签替换该组首个标签，移除其余标签
    out += html.slice(cursor, group[0].index);
    out += `<script src="${bundleName}"></script>`;
    cursor = group[group.length - 1].end;
  }
  out += html.slice(cursor);
  return { html: out, bundleCount: bundleIdx, mergedSrcs };
}

function main() {
  console.log('[build-web] 清理 www/ ...');
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  console.log('[build-web] 拷贝 files/ ...');
  copyDir(path.join(ROOT, 'files'), path.join(OUT, 'files'), ROOT);

  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  if (!NO_BUNDLE) {
    console.log('[build-web] 合并 JS bundle ...');
    const res = bundleScripts(html);
    html = res.html;
    console.log(`[build-web] 生成 ${res.bundleCount} 个 bundle`);
    // 移除已被合并的原始文件，避免包体冗余
    for (const src of res.mergedSrcs) {
      const p = path.join(OUT, src);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

  // 统计包体
  let total = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  })(OUT);
  console.log(`[build-web] 完成 → www/（${(total / 1024 / 1024).toFixed(2)} MB）`);
}

main();
