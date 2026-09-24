/**
 * sync.js - 账号进度同步（阶段 2：双保险）
 *
 * 职责：
 *   - GET  /api/sync/pull   拉取服务器权威进度 + serverTime
 *   - POST /api/sync/push   字段级推送（仅当客户端 updatedAt > 服务器该字段 updatedAt 才覆盖）
 *
 * 设计要点（对齐 docs/登录系统技术方案.md §3.7 / §3.8 / §4.3）：
 *   - 服务器为时钟权威：所有响应带 serverTime，客户端据此算 offset 校正。
 *   - 字段级合并：lr / tt / elo 各自按 updatedAt 取新，不整条覆盖。
 *   - 鉴权：复用 auth.js 的 requireAuth（Bearer token）。
 *
 * 依赖：
 *   - db.js（getProgress / mergeProgress）
 *   - auth.js（requireAuth 中间件）
 */
const express = require('express');
const dbm = require('./db');
const authRouter = require('./auth');

const router = express.Router();
const { requireAuth } = authRouter;

// 响应辅助（与 auth.js 保持一致）
const ok = (res, data) => res.json(Object.assign({ ok: true }, data));

/** 统一返回服务器权威进度：{ progress:{ lr:{value,updatedAt}, tt:..., elo:... }, game:{state,updatedAt}, serverTime }
 *  game 为游戏进度快照（闯关 + 竞速的逐关数据，JSON 字符串）：客户端自行做字段级合并后整块上传。 */
function serverProgressPayload(userId) {
    const p = dbm.getProgress(userId);
    const normalize = (f) => ({ value: f ? Number(f.value) : 0, updatedAt: f ? Number(f.updatedAt) : 0 });
    return {
        progress: {
            lr: normalize(p && p.lr),
            tt: normalize(p && p.tt),
            elo: normalize(p && p.elo)
        },
        game: {
            state: (p && p.game && typeof p.game.state === 'string') ? p.game.state : '',
            updatedAt: (p && p.game) ? (Number(p.game.updatedAt) || 0) : 0
        },
        serverTime: Date.now()
    };
}

// ── 拉取 ──
router.get('/pull', requireAuth, (req, res) => {
    ok(res, serverProgressPayload(req.userId));
});

// ── 推送（字段级合并） ──
router.post('/push', requireAuth, (req, res) => {
    const body = req.body || {};
    const progress = body.progress;
    if (!progress || typeof progress !== 'object') {
        // 空推送：仅返回权威进度
        return ok(res, serverProgressPayload(req.userId));
    }
    // 字段级合并（仅当客户端 updatedAt 更高才覆盖）
    dbm.mergeProgress(req.userId, progress);
    ok(res, serverProgressPayload(req.userId));
});

module.exports = router;
