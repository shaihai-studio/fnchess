/**
 * db.js - 函数棋账号数据库（SQLite, better-sqlite3）
 *
 * 职责：
 *   - 初始化 / 打开 SQLite 库文件（WAL 模式）
 *   - 建表：users / tokens / progress / bind_codes（bind_codes 为手机号绑定预留，暂不启用）
 *   - 提供同步 API 便于 auth.js / sync.js 使用
 *
 * 库文件：server/db/function_chess.db
 * 首次运行时自动建目录、建表。
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, 'db');
const DB_FILE = path.join(DB_DIR, 'function_chess.db');

// 确保目录存在
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);
// WAL：并发读写更友好（多请求同时写不互斥）
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// 建表
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT UNIQUE NOT NULL,          -- 登录名（小写归一化，唯一）
    nickname       TEXT NOT NULL,                 -- 展示昵称（可改）
    password_hash  TEXT NOT NULL,                 -- scrypt 输出 hex（含盐派生）
    salt           TEXT NOT NULL,                 -- 随机盐 hex
    bound_uuid     TEXT,                          -- 旧 localStorage UUID（并入用）
    phone_hash     TEXT UNIQUE,                   -- 预留：手机号 HMAC 哈希（反刷绑定）
    phone_verified INTEGER DEFAULT 0,             -- 预留：0 未绑 1 已绑
    created_at     INTEGER NOT NULL,              -- 注册时间戳(ms)
    last_login_at  INTEGER NOT NULL DEFAULT 0,    -- 最近登录时间戳(ms)
    updated_at     INTEGER NOT NULL DEFAULT 0     -- 档案更新时间戳(ms)
);

CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,                  -- 随机 64 hex
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS progress (
    user_id       INTEGER PRIMARY KEY,
    lr_value      INTEGER DEFAULT 0,
    lr_updated_at INTEGER DEFAULT 0,
    tt_value      INTEGER DEFAULT 0,
    tt_updated_at INTEGER DEFAULT 0,
    elo_value     INTEGER DEFAULT 1200,
    elo_updated_at INTEGER DEFAULT 0,
    updated_at    INTEGER DEFAULT 0,
    -- 游戏进度快照（闯关 + 竞速的逐关数据）：JSON 字符串，客户端已做字段级合并后整块上传
    game_state    TEXT DEFAULT '',
    game_state_updated_at INTEGER DEFAULT 0
);

-- 预留：绑定验证码（未来手机号绑定用，当前不启用）
CREATE TABLE IF NOT EXISTS bind_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    target     TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used       INTEGER DEFAULT 0
);
`);

// ── 轻量迁移：为老库补列（列已存在则跳过） ──
function ensureColumn(table, column, ddl) {
    try {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all();
        if (!cols.some((c) => c.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
            console.log(`[DB] 迁移：${table}.${column} 已新增`);
        }
    } catch (e) {
        console.warn(`[DB] 迁移列失败 ${table}.${column}:`, e.message);
    }
}

// 密保问题（忘记密码自助重置用）：问题明文存储便于展示，答案加盐哈希
ensureColumn('users', 'secret_question', 'secret_question TEXT');
ensureColumn('users', 'secret_answer_hash', 'secret_answer_hash TEXT');
ensureColumn('users', 'secret_answer_salt', 'secret_answer_salt TEXT');

// 游戏进度快照（闯关 + 竞速）：老库补列
ensureColumn('progress', 'game_state', "game_state TEXT DEFAULT ''");
ensureColumn('progress', 'game_state_updated_at', 'game_state_updated_at INTEGER DEFAULT 0');

/** 游戏进度快照体积上限（防止异常/恶意超大 payload 撑爆 SQLite） */
const GAME_STATE_MAX = 512 * 1024;

/** 注册一个新用户；返回 userId。username 冲突时抛错（由调用方 catch 转 409）。
 *  nickname 列与用户名同值（保留注册时大小写，供展示），缺省回退 username。 */
function createUser({ username, nickname, passwordHash, salt, boundUuid }) {
    const now = Date.now();
    const info = db.prepare(
        `INSERT INTO users (username, nickname, password_hash, salt, bound_uuid, created_at, last_login_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(username, nickname || username, passwordHash, salt, boundUuid || null, now, now, now);
    const userId = info.lastInsertRowid;
    // 初始化空进度（ELO 默认 1200）
    db.prepare(
        `INSERT OR IGNORE INTO progress (user_id, elo_value, elo_updated_at, updated_at)
         VALUES (?, 1200, ?, ?)`
    ).run(userId, now, now);
    return userId;
}

/** 按 username（小写归一化）查用户；无则 null */
function findUserByUsername(username) {
    return db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username).trim().toLowerCase());
}

/** 按 id 查用户；无则 null */
function findUserById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

// updateNickname 已移除：昵称与用户名合并后不再提供改昵称入口
// （users.nickname 列保留，值恒等于用户名，供历史数据与协议字段兼容）

/** 更新密码哈希（改密用） */
function updatePassword(userId, passwordHash, salt) {
    return db.prepare(`UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`)
        .run(passwordHash, salt, Date.now(), userId);
}

/** 设置/更新密保问题与答案（答案已加盐哈希后传入）；question 为空表示清除密保 */
function setSecurityQA(userId, question, answerHash, answerSalt) {
    return db.prepare(
        `UPDATE users SET secret_question = ?, secret_answer_hash = ?, secret_answer_salt = ?, updated_at = ? WHERE id = ?`
    ).run(
        question || null,
        question ? (answerHash || null) : null,
        question ? (answerSalt || null) : null,
        Date.now(),
        userId
    );
}

/** 读取密保信息：返回 { question, answerHash, answerSalt }（未设置为 null） */
function getSecurityQA(userId) {
    const row = db.prepare(`SELECT secret_question, secret_answer_hash, secret_answer_salt FROM users WHERE id = ?`).get(userId);
    if (!row) return null;
    return {
        question: row.secret_question || null,
        answerHash: row.secret_answer_hash || null,
        answerSalt: row.secret_answer_salt || null
    };
}

/** 绑定旧 UUID 到账号（仅当未绑定或需更新） */
function bindUuid(userId, uuid) {
    if (!uuid) return;
    const cur = db.prepare(`SELECT bound_uuid FROM users WHERE id = ?`).get(userId);
    if (cur && cur.bound_uuid === uuid) return;
    db.prepare(`UPDATE users SET bound_uuid = ?, updated_at = ? WHERE id = ?`).run(uuid, Date.now(), userId);
}

/** 记录登录时间 */
function touchLogin(userId) {
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(Date.now(), userId);
}

// —— token ——

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天

function createToken(userId) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex
    const now = Date.now();
    db.prepare(`INSERT INTO tokens (token, user_id, created_at, expires_at, last_seen)
                VALUES (?, ?, ?, ?, ?)`)
        .run(token, userId, now, now + TOKEN_TTL_MS, now);
    return token;
}

/** 校验 token：有效返回 userId，失效返回 null（并清理过期 token） */
function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const rec = db.prepare(`SELECT * FROM tokens WHERE token = ?`).get(token);
    if (!rec) return null;
    const now = Date.now();
    if (rec.expires_at < now) {
        db.prepare(`DELETE FROM tokens WHERE token = ?`).run(token);
        return null;
    }
    // 滑动续期：临近过期时顺延，减少过期误判
    if (rec.expires_at - now < 7 * 24 * 3600 * 1000) {
        db.prepare(`UPDATE tokens SET expires_at = ?, last_seen = ? WHERE token = ?`)
            .run(now + TOKEN_TTL_MS, now, token);
    } else {
        db.prepare(`UPDATE tokens SET last_seen = ? WHERE token = ?`).run(now, token);
    }
    return rec.user_id;
}

function deleteToken(token) {
    db.prepare(`DELETE FROM tokens WHERE token = ?`).run(token);
}

/** 使某用户除保留 token 外的所有 token 失效（改密时调用） */
function invalidateUserTokens(userId, keepToken) {
    if (keepToken) {
        db.prepare(`DELETE FROM tokens WHERE user_id = ? AND token != ?`).run(userId, keepToken);
    } else {
        db.prepare(`DELETE FROM tokens WHERE user_id = ?`).run(userId);
    }
}

// —— 进度（阶段 2 用，先提供读写基础方法） ——

function getProgress(userId) {
    const row = db.prepare(`SELECT * FROM progress WHERE user_id = ?`).get(userId);
    if (!row) return null;
    return {
        lr: { value: row.lr_value, updatedAt: row.lr_updated_at },
        tt: { value: row.tt_value, updatedAt: row.tt_updated_at },
        elo: { value: row.elo_value, updatedAt: row.elo_updated_at },
        // 游戏进度快照（逐关通关/最佳用时/解锁等）：state 为 JSON 字符串，空表示该账号还没有快照
        game: { state: row.game_state || '', updatedAt: row.game_state_updated_at || 0 }
    };
}

/** 字段级更新：仅当 incoming.updatedAt > 服务器值时才覆盖，返回服务器权威进度 */
function mergeProgress(userId, fields) {
    const now = Date.now();
    const stmts = {
        lr: db.prepare(`UPDATE progress SET lr_value = ?, lr_updated_at = ?, updated_at = ? WHERE user_id = ? AND lr_updated_at < ?`),
        tt: db.prepare(`UPDATE progress SET tt_value = ?, tt_updated_at = ?, updated_at = ? WHERE user_id = ? AND tt_updated_at < ?`),
        elo: db.prepare(`UPDATE progress SET elo_value = ?, elo_updated_at = ?, updated_at = ? WHERE user_id = ? AND elo_updated_at < ?`),
        game: db.prepare(`UPDATE progress SET game_state = ?, game_state_updated_at = ?, updated_at = ? WHERE user_id = ? AND game_state_updated_at < ?`)
    };
    if (fields) {
        for (const key of ['lr', 'tt', 'elo']) {
            const f = fields[key];
            if (!f || typeof f !== 'object') continue;
            const value = Number(f.value);
            const updatedAt = Number(f.updatedAt);
            if (!Number.isFinite(value) || !Number.isFinite(updatedAt) || updatedAt <= 0) continue;
            stmts[key].run(
                Math.round(value), updatedAt, now, userId, updatedAt
            );
        }
        // 游戏进度快照：整块 JSON，同样按 updatedAt 覆盖（客户端在 push 前已完成字段级合并）
        const g = fields.game;
        if (g && typeof g === 'object') {
            const state = typeof g.state === 'string' ? g.state : '';
            const updatedAt = Number(g.updatedAt);
            if (state && state.length <= GAME_STATE_MAX
                && Number.isFinite(updatedAt) && updatedAt > 0) {
                stmts.game.run(state, updatedAt, now, userId, updatedAt);
            }
        }
    }
    return getProgress(userId);
}

/** 供阶段 3：把旧 UUID 名下的历史进度并入账号（此处留接口，阶段 2/3 实现明细） */

module.exports = {
    db,
    DB_FILE,
    createUser,
    findUserByUsername,
    findUserById,
    updatePassword,
    setSecurityQA,
    getSecurityQA,
    bindUuid,
    touchLogin,
    createToken,
    verifyToken,
    deleteToken,
    invalidateUserTokens,
    getProgress,
    mergeProgress
};
