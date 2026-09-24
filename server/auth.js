/**
 * auth.js - 账号认证路由（注册 / 登录 / 登出 / me / 改名 / 改密）
 *
 * 挂载：由 index.js `app.use('/api/auth', authRouter)` 引入。
 *
 * 依赖：
 *   - db.js（SQLite 访问）
 *   - Node 内置 crypto（scrypt 加盐哈希）
 *
 * 安全：
 *   - 密码 scrypt 加盐哈希，timingSafeEqual 恒时比较
 *   - IP 滑动窗口注册限流（1h / 10 次）
 *   - 同一 username 登录失败 5 次锁定 10 分钟
 *   - 全局注册 QPS 熔断
 */
const crypto = require('crypto');
const express = require('express');
const dbm = require('./db');

const router = express.Router();

// ── 常量 ──
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/; // 2~20 字母数字下划线中文
const USERNAME_MAX = 20;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 32;

// 反刷
const IP_REGISTER_WINDOW = 3600 * 1000;   // 1h
const IP_MAX_REGISTER = 10;               // 每 IP 1h 最多注册 10 个
const GLOBAL_REGISTER_BURST = 30;         // 5s 内全局注册超过该值 → 熔断
const GLOBAL_REGISTER_WINDOW = 5000;
const LOGIN_LOCK_THRESHOLD = 5;           // 连续失败 5 次
const LOGIN_LOCK_MS = 10 * 60 * 1000;     // 锁定 10 分钟

// ── 忘记密码 / 密保重置 ──
const SECRET_ANSWER_MIN = 2;              // 密保答案最少 2 字
const SECRET_ANSWER_MAX = 50;             // 密保答案最多 50 字
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;   // 重置令牌有效期 10 分钟
const RESET_MAX_ATTEMPT = 5;              // 密保答案连续答错 5 次
const RESET_LOCK_MS = 10 * 60 * 1000;     // 锁定 10 分钟
const IP_RESET_WINDOW = 3600 * 1000;      // 重置相关请求限流窗口 1h
const IP_MAX_RESET_REQ = 20;              // 每 IP 1h 最多 20 次重置请求

// ── 反刷状态（进程内） ──
const ipRegTimes = new Map();   // ip -> number[]（时间戳）
const loginFails = new Map();   // username(lower) -> { count, lockedUntil }
const registerTimestamps = [];  // 全局注册时间戳数组（熔断）
const ipResetTimes = new Map(); // ip -> number[]（重置相关请求时间戳）
const resetFails = new Map();   // username(lower) -> { count, lockedUntil }
const resetTokens = new Map();  // token -> { username, expiresAt }

// ── 密码哈希 ──
function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function verifyPassword(password, salt, hash) {
    if (!salt || !hash) return false;
    const h1 = Buffer.from(hash, 'hex');
    const h2 = Buffer.from(hashPassword(password, salt), 'hex');
    return h1.length === h2.length && crypto.timingSafeEqual(h1, h2);
}

// ── IP 工具 ──
function getClientIp(req) {
    try {
        const fwd = req.headers && req.headers['x-forwarded-for'];
        if (fwd) return String(fwd).split(',')[0].trim();
    } catch (e) { /* 忽略 */ }
    return (req.socket && req.socket.remoteAddress) || '';
}

// ── 限流检查 ──
function checkIpRegister(ip) {
    if (!ip) return true; // 无 IP 信息不拦截
    const now = Date.now();
    const arr = (ipRegTimes.get(ip) || []).filter(t => now - t < IP_REGISTER_WINDOW);
    if (arr.length >= IP_MAX_REGISTER) return false;
    arr.push(now);
    ipRegTimes.set(ip, arr);
    return true;
}

function checkGlobalBurst() {
    const now = Date.now();
    while (registerTimestamps.length && now - registerTimestamps[0] > GLOBAL_REGISTER_WINDOW) {
        registerTimestamps.shift();
    }
    if (registerTimestamps.length >= GLOBAL_REGISTER_BURST) return false;
    registerTimestamps.push(now);
    return true;
}

function isLoginLocked(username) {
    const rec = loginFails.get(username);
    if (!rec) return false;
    if (rec.lockedUntil > Date.now()) return true;
    return false;
}

function recordLoginFail(username) {
    const key = String(username).trim().toLowerCase();
    const rec = loginFails.get(key) || { count: 0, lockedUntil: 0 };
    rec.count = (rec.count || 0) + 1;
    if (rec.count >= LOGIN_LOCK_THRESHOLD) {
        rec.lockedUntil = Date.now() + LOGIN_LOCK_MS;
        rec.count = 0;
    }
    loginFails.set(key, rec);
}

function clearLoginFails(username) {
    loginFails.delete(String(username).trim().toLowerCase());
}

// ── 重置相关辅助 ──
function checkIpReset(ip) {
    if (!ip) return true;
    const now = Date.now();
    const arr = (ipResetTimes.get(ip) || []).filter(t => now - t < IP_RESET_WINDOW);
    if (arr.length >= IP_MAX_RESET_REQ) return false;
    arr.push(now);
    ipResetTimes.set(ip, arr);
    return true;
}

/** 密保答案归一化：去首尾空白 + 转小写（避免大小写/空格导致误判） */
function normalizeAnswer(answer) {
    return String(answer == null ? '' : answer).trim().toLowerCase();
}

function isResetLocked(username) {
    const rec = resetFails.get(username);
    if (!rec) return false;
    return rec.lockedUntil > Date.now();
}

function recordResetFail(username) {
    const key = String(username).trim().toLowerCase();
    const rec = resetFails.get(key) || { count: 0, lockedUntil: 0 };
    rec.count = (rec.count || 0) + 1;
    if (rec.count >= RESET_MAX_ATTEMPT) {
        rec.lockedUntil = Date.now() + RESET_LOCK_MS;
        rec.count = 0;
    }
    resetFails.set(key, rec);
}

function clearResetFails(username) {
    resetFails.delete(String(username).trim().toLowerCase());
}

/** 签发一次性重置令牌（10 分钟有效，绑定用户名） */
function issueResetToken(username) {
    const token = crypto.randomBytes(24).toString('hex');
    resetTokens.set(token, { username: String(username).trim().toLowerCase(), expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
    return token;
}

/** 校验并消费重置令牌；成功返回 true */
function consumeResetToken(token, username) {
    const rec = token ? resetTokens.get(String(token)) : null;
    if (!rec) return false;
    if (rec.expiresAt < Date.now()) { resetTokens.delete(String(token)); return false; }
    if (rec.username !== String(username).trim().toLowerCase()) return false;
    resetTokens.delete(String(token));
    return true;
}

// ── 响应辅助 ──
const ok = (res, data) => res.json(Object.assign({ ok: true }, data));
const fail = (res, code, status = 400, extra = {}) =>
    res.status(status).json(Object.assign({ ok: false, code }, extra));

// ── 中间件：解析 Bearer token → req.user（dbm.findUserById 结果）或 401 ──
function requireAuth(req, res, next) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    const token = m ? m[1].trim() : '';
    const userId = dbm.verifyToken(token);
    if (!userId) return fail(res, 'unauthorized', 401);
    const user = dbm.findUserById(userId);
    if (!user) return fail(res, 'user_not_found', 401);
    req.authToken = token;
    req.user = user;
    req.userId = userId;
    next();
}

// 通用字段校验
function validateCredentials(username, password) {
    const u = String(username == null ? '' : username).trim();
    const p = String(password == null ? '' : password);
    if (!USERNAME_RE.test(u)) return { ok: false, code: 'bad_username', msg: '用户名需为 2~20 位字母/数字/下划线/中文' };
    if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return { ok: false, code: 'bad_password', msg: '密码长度需为 6~32 位' };
    // 不再有独立展示昵称：昵称默认即用户名（保留原大小写输入），仅长度对齐用户名上限
    return { ok: true, username: u.toLowerCase(), nickname: u.slice(0, USERNAME_MAX) };
}

// ── 注册 ──
router.post('/register', (req, res) => {
    const ip = getClientIp(req);
    if (!checkIpRegister(ip)) return fail(res, 'ip_rate_limited', 429, { msg: '当前网络注册太频繁，请稍后再试' });
    if (!checkGlobalBurst()) return fail(res, 'server_busy', 503, { msg: '注册繁忙，请稍后再试' });

    const body = req.body || {};
    const v = validateCredentials(body.username, body.password);
    if (!v.ok) return fail(res, v.code, 400, { msg: v.msg });
    // 昵称已与用户名合并：注册不再接受自定义昵称，nickname 列仅保存用户名（保留注册大小写，供展示）
    const nickname = v.nickname;

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(body.password, salt);
    const uuid = String(body.uuid || '').slice(0, 64) || null;

    // 可选：注册时设置密保问题（用于「忘记密码」自助重置）
    // 注意：校验必须在 createUser 之前完成——否则"校验失败已返回错误、账号却已落库"，
    // 用户重试会得到 username_taken，留下"以为没注册成功、实际已存在"的脏账号。
    const secretQuestion = String(body.secretQuestion || '').trim().slice(0, 60);
    const secretAnswer = normalizeAnswer(body.secretAnswer);
    if (secretQuestion && secretAnswer.length < SECRET_ANSWER_MIN) {
        return fail(res, 'bad_secret_answer', 400, { msg: `密保答案至少 ${SECRET_ANSWER_MIN} 个字` });
    }

    let userId;
    try {
        userId = dbm.createUser({
            username: v.username,
            nickname,
            passwordHash,
            salt,
            boundUuid: uuid
        });
    } catch (e) {
        // UNIQUE 冲突 → 用户名已存在
        if (String(e.message || '').includes('UNIQUE')) return fail(res, 'username_taken', 409, { msg: '该用户名已被注册' });
        console.warn('[Auth] 注册失败:', e.message);
        return fail(res, 'server_error', 500, { msg: '注册失败，请稍后再试' });
    }

    if (secretQuestion) {
        const aSalt = crypto.randomBytes(16).toString('hex');
        try {
            dbm.setSecurityQA(userId, secretQuestion, hashPassword(secretAnswer, aSalt), aSalt);
        } catch (e) {
            // 密保写入失败不影响注册本身（用户仍可登录，后续可在面板补设密保）
            console.warn('[Auth] 密保写入失败:', e.message);
        }
    }

    const token = dbm.createToken(userId);
    dbm.touchLogin(userId);
    // 阶段3：注册时把旧 UUID 名下排行榜并入账号（若有）
    if (uuid && typeof router.migrateUuidToUser === 'function') {
        try { router.migrateUuidToUser(uuid, userId); } catch (e) { console.warn('[Auth] UUID 迁移失败:', e.message); }
    }
    console.log(`[Auth] 新用户注册: id=${userId} username=${v.username}`);
    ok(res, {
        token,
        userId,
        nickname,
        username: v.username,
        serverTime: Date.now()
    });
});

// ── 登录 ──
router.post('/login', (req, res) => {
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password) return fail(res, 'bad_request', 400, { msg: '请输入用户名和密码' });

    if (isLoginLocked(username)) {
        return fail(res, 'locked', 429, { msg: '失败次数过多，请 10 分钟后再试' });
    }

    const user = dbm.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
        recordLoginFail(username);
        return fail(res, 'bad_credentials', 401, { msg: '用户名或密码错误' });
    }
    clearLoginFails(username);

    // 绑定旧 UUID（若当前登录带 uuid 且未绑定/不同）
    const uuid = String(body.uuid || '').slice(0, 64) || null;
    if (uuid) {
        dbm.bindUuid(user.id, uuid);
        // 阶段3：登录时把旧 UUID 名下排行榜并入账号（首次绑定才迁移；重复绑定幂等）
        if (typeof router.migrateUuidToUser === 'function') {
            try { router.migrateUuidToUser(uuid, user.id); } catch (e) { console.warn('[Auth] UUID 迁移失败:', e.message); }
        }
    }

    const token = dbm.createToken(user.id);
    dbm.touchLogin(user.id);
    console.log(`[Auth] 用户登录: id=${user.id} username=${username}`);
    ok(res, {
        token,
        userId: user.id,
        // nickname 字段保留仅为协议兼容，语义已合并为「用户名」（保留注册时大小写）
        nickname: user.nickname || user.username,
        username: user.username,
        serverTime: Date.now()
    });
});

// ── 登出 ──
router.post('/logout', (req, res) => {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (m) dbm.deleteToken(m[1].trim());
    ok(res, {});
});

// ── 当前用户 ──
router.get('/me', requireAuth, (req, res) => {
    const qa = dbm.getSecurityQA(req.user.id);
    ok(res, {
        userId: req.user.id,
        username: req.user.username,
        nickname: req.user.nickname || req.user.username,   // 昵称已与用户名合并，字段保留仅为兼容
        boundUuid: req.user.bound_uuid || null,
        hasSecurityQuestion: !!(qa && qa.question),
        createdAt: req.user.created_at
    });
});

// ── 改名 ──
// 昵称已与用户名合并：用户名即展示名，注册后不可修改，故不再提供改昵称接口。

// ── 改密 ──
router.post('/me/password', requireAuth, (req, res) => {
    const body = req.body || {};
    const oldPwd = String(body.oldPassword || '');
    const newPwd = String(body.newPassword || '');
    if (newPwd.length < PASSWORD_MIN || newPwd.length > PASSWORD_MAX) {
        return fail(res, 'bad_password', 400, { msg: '新密码长度需为 6~32 位' });
    }
    if (!verifyPassword(oldPwd, req.user.salt, req.user.password_hash)) {
        return fail(res, 'bad_old_password', 401, { msg: '原密码错误' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    dbm.updatePassword(req.user.id, hashPassword(newPwd, salt), salt);
    // 使该用户其他 token 失效（保留当前）
    dbm.invalidateUserTokens(req.user.id, req.authToken);
    ok(res, {});
});

// ── 忘记密码：查询密保问题 ──
router.post('/reset/question', (req, res) => {
    const ip = getClientIp(req);
    if (!checkIpReset(ip)) return fail(res, 'ip_rate_limited', 429, { msg: '操作过于频繁，请稍后再试' });
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    if (!username) return fail(res, 'bad_request', 400, { msg: '请输入用户名' });
    const user = dbm.findUserByUsername(username);
    // 不泄露账号是否存在：统一返回 ok；question 为空表示该账号未设置密保
    const qa = user ? dbm.getSecurityQA(user.id) : null;
    ok(res, {
        question: qa && qa.question ? qa.question : null,
        uuidResetAvailable: !!(user && user.bound_uuid)
    });
});

// ── 忘记密码：校验密保答案 → 签发一次性重置令牌 ──
router.post('/reset/verify', (req, res) => {
    const ip = getClientIp(req);
    if (!checkIpReset(ip)) return fail(res, 'ip_rate_limited', 429, { msg: '操作过于频繁，请稍后再试' });
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const answer = normalizeAnswer(body.answer);
    if (!username || !answer) return fail(res, 'bad_request', 400, { msg: '请填写用户名与密保答案' });
    if (isResetLocked(username)) return fail(res, 'locked', 429, { msg: '答案错误次数过多，请 10 分钟后再试' });
    const user = dbm.findUserByUsername(username);
    const qa = user ? dbm.getSecurityQA(user.id) : null;
    if (!user || !qa || !qa.question || !verifyPassword(answer, qa.answerSalt, qa.answerHash)) {
        recordResetFail(username);
        return fail(res, 'bad_answer', 401, { msg: '密保答案不正确' });
    }
    clearResetFails(username);
    const resetToken = issueResetToken(username);
    ok(res, { resetToken, expiresIn: RESET_TOKEN_TTL_MS });
});

// ── 忘记密码：凭重置令牌提交新密码 ──
router.post('/reset/commit', (req, res) => {
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const newPwd = String(body.newPassword || '');
    if (newPwd.length < PASSWORD_MIN || newPwd.length > PASSWORD_MAX) {
        return fail(res, 'bad_password', 400, { msg: '新密码长度需为 6~32 位' });
    }
    if (!consumeResetToken(body.resetToken, username)) {
        return fail(res, 'bad_reset_token', 401, { msg: '重置凭证已失效，请重新验证密保' });
    }
    const user = dbm.findUserByUsername(username);
    if (!user) return fail(res, 'user_not_found', 404, { msg: '账号不存在' });
    const salt = crypto.randomBytes(16).toString('hex');
    dbm.updatePassword(user.id, hashPassword(newPwd, salt), salt);
    dbm.invalidateUserTokens(user.id);   // 所有旧 token 失效，需重新登录
    clearResetFails(username);
    console.log(`[Auth] 用户重置密码: id=${user.id} username=${username}`);
    ok(res, {});
});

// ── 忘记密码：同设备快捷重置（账号已绑定该设备 UUID） ──
router.post('/reset/uuid', (req, res) => {
    const ip = getClientIp(req);
    if (!checkIpReset(ip)) return fail(res, 'ip_rate_limited', 429, { msg: '操作过于频繁，请稍后再试' });
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const uuid = String(body.uuid || '').slice(0, 64);
    const newPwd = String(body.newPassword || '');
    if (newPwd.length < PASSWORD_MIN || newPwd.length > PASSWORD_MAX) {
        return fail(res, 'bad_password', 400, { msg: '新密码长度需为 6~32 位' });
    }
    const user = dbm.findUserByUsername(username);
    if (!user) return fail(res, 'user_not_found', 404, { msg: '账号不存在' });
    if (!uuid || !user.bound_uuid || user.bound_uuid !== uuid) {
        return fail(res, 'uuid_mismatch', 403, { msg: '当前设备与账号绑定不一致，无法快捷重置' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    dbm.updatePassword(user.id, hashPassword(newPwd, salt), salt);
    dbm.invalidateUserTokens(user.id);
    clearResetFails(username);
    console.log(`[Auth] 用户同设备重置密码: id=${user.id} username=${username}`);
    ok(res, {});
});

// ── 密保设置/更新（登录后；question 为空表示清除） ──
router.post('/me/security', requireAuth, (req, res) => {
    const body = req.body || {};
    const question = String(body.question || '').trim().slice(0, 60);
    const answer = normalizeAnswer(body.answer);
    if (!question) {
        dbm.setSecurityQA(req.user.id, null, null, null);
        return ok(res, { question: null });
    }
    if (answer.length < SECRET_ANSWER_MIN) {
        return fail(res, 'bad_secret_answer', 400, { msg: `密保答案至少 ${SECRET_ANSWER_MIN} 个字` });
    }
    if (answer.length > SECRET_ANSWER_MAX) {
        return fail(res, 'bad_secret_answer', 400, { msg: `密保答案最多 ${SECRET_ANSWER_MAX} 个字` });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    dbm.setSecurityQA(req.user.id, question, hashPassword(answer, salt), salt);
    ok(res, { question });
});

module.exports = router;
// 供 sync.js 复用 Bearer 鉴权中间件
module.exports.requireAuth = requireAuth;
