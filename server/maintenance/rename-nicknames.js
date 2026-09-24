#!/usr/bin/env node
/**
 * rename-nicknames.js — 排行榜昵称一致性维护
 *
 * 做两件事（默认都会做）：
 *   1. 昵称对齐账号：把各榜单中身份键形如 'u<userId>' 的记录，昵称改写为该账号的登录名
 *      （历史记录里昵称可能是旧的本地昵称）；无账号对应的记录（未登录产生的 playerId）保持原昵称。
 *   2. 清理测试数据：删除自测身份留下的记录（默认 fnchess-selftest / e2e-raceboard 等）。
 *      分数、局数、更新时间等其余字段一律不动。
 *
 * ⚠️ 必须在 Node 服务停止时执行（运行中的服务会周期性回写 leaderboard.json 覆盖修改）。
 *
 * 用法（在服务器上，站点 server 目录内）：
 *   /www/server/nodejs/18.20.4/bin/node maintenance/rename-nicknames.js --dry-run
 *   /www/server/nodejs/18.20.4/bin/node maintenance/rename-nicknames.js
 *   可选：
 *     --no-rename        只清理测试数据，不改昵称
 *     --no-prune         只改昵称，不清理测试数据
 *     --prune=id1,id2    指定要清理的身份键/playerId（追加到默认列表）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const DO_RENAME = !process.argv.includes('--no-rename');
const DO_PRUNE = !process.argv.includes('--no-prune');
const EXTRA_PRUNE = (process.argv.find((a) => a.startsWith('--prune=')) || '').replace('--prune=', '');

const LB_FILE = path.join(__dirname, '..', 'leaderboard.json');

// 自测/回归产生的身份键（Python 测试脚本与 Playwright E2E 使用）
const PRUNE_IDS = new Set([
    'fnchess-selftest',
    'e2e-raceboard',
    'e2e_host', 'e2e_guest',
    'hostprobe1', 'guestprobe1'
]);
if (EXTRA_PRUNE) EXTRA_PRUNE.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => PRUNE_IDS.add(s));

// 自动化测试每轮注册的临时账号/随机昵称（会污染榜单展示），按昵称清理
const PRUNE_NICK_PATTERNS = [
    /^自检/,                  // tests/server_*.py 的随机昵称
    /E2E/,                    // Playwright E2E 用例
    /^(?:rh|rg)[a-z0-9]{6,}$/ // 测试注册的房主/访客账号（rh/rg + 随机串）
];

let dbm = null;
try {
    dbm = require('../db');
} catch (e) {
    console.warn('[warn] 无法加载 db 模块（跳过昵称对齐）：' + e.message);
}

function usernameOf(userId) {
    if (!dbm || typeof dbm.findUserById !== 'function') return '';
    try {
        const u = dbm.findUserById(Number(userId));
        return u ? String(u.username || u.nickname || '') : '';
    } catch (e) {
        return '';
    }
}

function main() {
    if (!fs.existsSync(LB_FILE)) {
        console.error('leaderboard.json 不存在: ' + LB_FILE);
        process.exit(1);
    }
    const raw = fs.readFileSync(LB_FILE, 'utf8');
    const data = JSON.parse(raw);
    const summary = { boards: 0, renamed: 0, pruned: 0, kept: 0, details: [] };

    for (const key of Object.keys(data)) {
        if (key === 'savedAt') continue;
        const arr = data[key];
        if (!Array.isArray(arr)) continue;
        summary.boards++;
        const next = [];
        for (const p of arr) {
            if (!p) continue;
            const idKey = String(p.idKey || p.playerId || '');
            const playerId = String(p.playerId || '');
            const nickname = String(p.nickname || '');
            if (DO_PRUNE && (PRUNE_IDS.has(idKey) || PRUNE_IDS.has(playerId))) {
                summary.pruned++;
                summary.details.push('prune ' + key + ' ' + idKey + ' (' + nickname + ')');
                continue;
            }
            if (DO_PRUNE && PRUNE_NICK_PATTERNS.some((re) => re.test(nickname))) {
                summary.pruned++;
                summary.details.push('prune-nick ' + key + ' ' + idKey + ' (' + nickname + ')');
                continue;
            }
            const uid = (p.userId != null && p.userId !== '') ? String(p.userId)
                : (idKey.charAt(0) === 'u' ? idKey.slice(1) : '');
            if (DO_RENAME && uid && /^\d+$/.test(uid)) {
                const uname = usernameOf(uid);
                if (uname) {
                    const target = uname.slice(0, 10); // 与服务端入库口径一致
                    if (p.nickname !== target) {
                        summary.renamed++;
                        summary.details.push('rename ' + key + ' ' + idKey + ': "' + (p.nickname || '') + '" -> "' + target + '"');
                        p.nickname = target;
                    }
                    if (p.userId == null) p.userId = Number(uid);
                }
            } else {
                summary.kept++;
            }
            next.push(p);
        }
        data[key] = next;
    }

    console.log('榜单数: ' + summary.boards + ' | 改名: ' + summary.renamed + ' | 清理测试数据: ' + summary.pruned + ' | 保持原昵称(无账号): ' + summary.kept);
    summary.details.slice(0, 60).forEach((d) => console.log('  ' + d));
    if (summary.details.length > 60) console.log('  ...（其余 ' + (summary.details.length - 60) + ' 条略）');

    if (DRY_RUN) {
        console.log('\n[dry-run] 未写入文件。');
        return;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = LB_FILE + '.bak.' + ts;
    fs.copyFileSync(LB_FILE, backup);
    data.savedAt = Date.now();
    fs.writeFileSync(LB_FILE, JSON.stringify(data), 'utf8');
    console.log('\n已写入: ' + LB_FILE);
    console.log('已备份: ' + backup);
}

main();
