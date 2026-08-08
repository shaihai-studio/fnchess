/**
 * 函数棋 P2P 信令 + 匹配大厅服务器
 * 基于 PeerJS Server + WebSocket 大厅，用于本地/局域网/公网对战联机
 *
 * 启动方式：
 *   cd server && npm install && npm start
 *
 * 组成：
 * 1. PeerJS 信令服务（/peerjs）—— 负责 WebRTC 连接的握手信令
 * 2. 匹配大厅（/lobby）—— 维护"等待中的房间列表"，支持：
 *    - 房主 host_register 登记房间（带 难度/回合/时间限制/观战开关 配置）
 *    - 访客 list_rooms 拉取列表、join_request 申请加入
 *    - 房主 guest_joining 收到有人加入通知
 *    - room_started / cancel_register / host 断开 自动清理房间
 * 3. 观战（spectate）—— 对局中的房间按观战开关决定去留：
 *    - 房主默认开启观战（host_register.options.allowSpectate !== false）
 *    - 开局后开启观战的房间保留在大厅列表，观众凭房间码直接加入
 *    - 房主关闭观战 → 房间立即从大厅移除、观众被踢出
 *    - 房主 spectate_sync 推送状态快照 → 服务器广播给所有观众
 *
 * 实现要点：
 * PeerJS 内部的 WebSocketServer 会拦截所有 Upgrade 请求并对 path 不匹配的
 * 请求直接返回 400，导致同一端口无法直接挂第二个 WebSocketServer。
 * 因此这里通过 createWebSocketServer 把 PeerJS 的 wss 设为 noServer 模式，
 * 由本文件统一在 server 'upgrade' 事件上按 path 分发到 /lobby 或 /peerjs。
 */
const http = require('http');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { ExpressPeerServer } = require('peer');

const PORT = process.env.P2P_PORT || 9000;
const HOST = process.env.P2P_HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// ─────────────────────────────────────────────
// 1. PeerJS 信令服务
// ─────────────────────────────────────────────
let peerWss = null; // 由 createWebSocketServer 创建，noServer 模式
const peerServer = ExpressPeerServer(server, {
    path: '/',
    // 允许任意 API key（前端默认使用 'peerjs'）
    allow_discovery: true,
    proxied: true,
    // 让 PeerJS 内部 wss 使用 noServer 模式，避免它拦截 /lobby 的 Upgrade
    createWebSocketServer: (options) => {
        peerWss = new WebSocketServer({ noServer: true, path: options.path });
        return peerWss;
    }
});
app.use('/', peerServer);

peerServer.on('connection', (client) => {
    console.log(`[P2P] 客户端已连接: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
    console.log(`[P2P] 客户端已断开: ${client.getId()}`);
});

// ─────────────────────────────────────────────
// 2. 匹配大厅 WebSocket（noServer 模式，由下方 upgrade 分发）
// ─────────────────────────────────────────────
const lobbyWss = new WebSocketServer({ noServer: true });

// 统一 Upgrade 分发：/lobby → 大厅，其余 → PeerJS
server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (e) { /* 保持空串 */ }
    if (pathname === '/lobby') {
        lobbyWss.handleUpgrade(req, socket, head, (ws) => {
            lobbyWss.emit('connection', ws, req);
        });
    } else if (peerWss) {
        peerWss.handleUpgrade(req, socket, head, (ws) => {
            peerWss.emit('connection', ws, req);
        });
    } else {
        socket.destroy();
    }
});

/**
 * 房间表
 * Map<code, { code, options, hostWs, guestWs, status, spectateEnabled, spectators, createdAt }>
 * status: 'waiting' | 'joining' | 'playing'
 * spectateEnabled: 是否允许观战（默认 true）
 * spectators: 观众 WebSocket 集合
 */
const rooms = new Map();

// 房间有效期：普通 5 分钟，长效模式 30 分钟
const ROOM_TTL_DEFAULT = 5 * 60 * 1000;
const ROOM_TTL_LONG = 30 * 60 * 1000;

function genRoomCode(longLived = false) {
    let code;
    do {
        if (longLived) {
            // 长效模式：房间号以 00 开头（如 002639），占用特殊号段
            code = '00' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        } else {
            code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        }
    } while (rooms.has(code));
    return code;
}

function send(ws, obj) {
    if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
    }
}

// ─────────────────────────────────────────────
// 3. 在线排行榜（内存 Map + leaderboard.json 落盘）
// ─────────────────────────────────────────────
const LDB_FILE = path.join(__dirname, 'leaderboard.json');
const ELO_K = 32;              // ELO K 值
const ELO_INIT = 1200;         // ELO 初始分
// 榜单返回条数：分关榜（rtN/plN，含分数关 pl1/2）保留前 100，总分榜（lr/tt/elo）保留前 1000
function topFor(boardType) {
    return /^(rt|pl)\d+(?:\/\d+)?$/.test(String(boardType || '')) ? 100 : 1000;
}

// 计分榜：boardType -> Map(playerId, {playerId, nickname, score, updatedAt})
// 支持 lr(闯关) / tt(历史竞速星分) / rtN(竞速分关 Time Attack 用时) 等任意分榜
const scoreBoards = {};
// 联机 ELO 榜（独立结构：含胜负平）
const eloBoard = new Map();

function ensureBoard(boardType) {
    if (!scoreBoards[boardType]) scoreBoards[boardType] = new Map();
    return scoreBoards[boardType];
}
// 竞速分关榜 rtN 取最短用时（升序）；彗星分关榜 plN 取最短 token（升序）；其余计分榜取最高分（降序）
function boardOrder(boardType) {
    const b = typeof boardType === 'string' ? boardType : '';
    if (/^rt\d+$/.test(b)) return 'asc';
    if (/^pl\d+(?:\/\d+)?$/.test(b)) return 'asc';   // 彗星：token 越少越优
    return 'desc';
}
const eloSettled = new Set();  // 已结算的房间码（ELO 去重：防 A/B 双端重复上报）

// IP 风控（辅助，非身份主键）：窗口内同一 IP 出现的"新 playerId"数量超阈值则降级
const IP_WINDOW = 60 * 60 * 1000; // 60 分钟
const IP_MAX_NEW = 5;             // 窗口内最多允许的新身份数
const ipIdentity = new Map();     // ip -> { firstSeen, ids:Set }

let saveTimer = null;
let savePending = false;

function getClientIp(req) {
    if (!req) return '';
    try {
        const fwd = req.headers && req.headers['x-forwarded-for'];
        if (fwd) return String(fwd).split(',')[0].trim();
    } catch (e) { /* 忽略 */ }
    return (req.socket && req.socket.remoteAddress) || '';
}

// ─────────────────────────────────────────────
// 4. 排行榜防作弊（方案A HMAC 签名 + 方案B 核验通道 + 举报 + 彗星）
// 核验通道为"务实版"：验证 表达式可解析 / 未用锁元素 / token 与长度一致 / LR∑ 与长度一致，
// 不做视觉复算"是否通关"（客户端判定依赖响应式画布尺寸 + geogebra 引擎，移植不可靠，见实施方案 §4.2 注）。
// ─────────────────────────────────────────────
const LB_SECRET = 'fnchess-lb-secret-2026-08-05';
const NONCE_TTL = 2 * 60 * 1000;      // nonce 有效期 2 分钟
const SIGN_GATE = 2 * 1000;           // 签名通道最小间隔 2s
const VERIFY_GATES = [2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000]; // 核验退避间隔
const VERIFY_WINDOW = 5 * 60 * 1000;  // 核验滑动窗口
const VERIFY_LOCK_K = 5;              // 窗口内核验 ≥K 次 → 当日锁定核验通道
const DAY_MS = 24 * 3600 * 1000;
const RACE_PUZZLES = 10;              // 竞速每关固定 10 题
const REPORT_GATE = 90 * 1000;        // 举报间隔 1min30s
// 竞速 30 关难度 [allowed, forbidden, fixedLocks, randomLocks]（与 GameController.buildRaceLevel.levelConfigs 一致）
const RACE_LEVEL_CFG = [
    [1, 1, 0, 0], [1, 1, 1, 0], [1, 3, 3, 0], [2, 1, 0, 0], [2, 1, 1, 0], [2, 2, 2, 0],
    [1, 20, 10, 0], [2, 4, 3, 0], [2, 2, 2, 2], [2, 4, 13, 1], [2, 10, 2, 0], [3, 1, 0, 0],
    [2, 20, 5, 0], [3, 1, 2, 0], [3, 1, 5, 0], [3, 2, 3, 0], [3, 3, 4, 0], [3, 20, 2, 0],
    [4, 1, 2, 0], [4, 2, 3, 0], [2, 200, 0, 0], [2, 300, 0, 2], [4, 3, 4, 0], [3, 6, 6, 0],
    [5, 2, 2, 0], [5, 3, 4, 0], [3, 200, 1, 0], [3, 5, 5, 3], [3, 4, 15, 2], [6, 6, 6, 0]
];

// —— 纯 JS SHA-256 / HMAC-SHA256（与前端 VerifyCrypto.js 完全一致，file:// 下不依赖 crypto.subtle） ——
function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
}
function bytesToLatin1(b) { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
function bytesToHex(b) { let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
function hexToBytes(hex) { const out = []; for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16)); return out; }

/** sha256Hex(ascii) —— ascii 必须为 latin1（每字符 1 字节） */
function sha256Hex(ascii) {
    const rotr = (v, n) => (v >>> n) | (v << (32 - n));
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
        0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc,
        0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351,
        0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
        0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585,
        0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
        0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const ml = ascii.length * 8;
    let msg = ascii + '\x80';
    while (msg.length % 64 !== 56) msg += '\x00';
    const hi = Math.floor(ml / 4294967296) >>> 0;
    const lo = ml >>> 0;
    msg += String.fromCharCode((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
        (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    const w = new Array(64).fill(0);
    const h = H0.slice();
    for (let ci = 0; ci < msg.length; ci += 64) {
        for (let i = 0; i < 16; i++) {
            const o = ci + i * 4;
            w[i] = (msg.charCodeAt(o) << 24) | (msg.charCodeAt(o + 1) << 16) | (msg.charCodeAt(o + 2) << 8) | msg.charCodeAt(o + 3);
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    // 逐字提取 4 字节（h 可能为负数，须按无符号取字节；数字 toString(16) 会丢前导 0）
    const out = new Array(32);
    for (let i = 0; i < 8; i++) {
        const v = h[i] >>> 0;
        out[i * 4] = (v >>> 24) & 255;
        out[i * 4 + 1] = (v >>> 16) & 255;
        out[i * 4 + 2] = (v >>> 8) & 255;
        out[i * 4 + 3] = v & 255;
    }
    return bytesToHex(out);
}
function hmacSHA256Hex(keyStr, msgStr) {
    let key = utf8Bytes(keyStr);
    if (key.length > 64) key = hexToBytes(sha256Hex(bytesToLatin1(key)));
    const k = new Array(64).fill(0);
    for (let i = 0; i < key.length && i < 64; i++) k[i] = key[i];
    const ipad = k.map(x => x ^ 0x36);
    const opad = k.map(x => x ^ 0x5c);
    const inner = sha256Hex(bytesToLatin1([...ipad, ...utf8Bytes(msgStr)]));
    return sha256Hex(bytesToLatin1([...opad, ...hexToBytes(inner)]));
}

/** 长度口径（§5：原始 token，不化简；与前端 FunctionParser.analyzeFunctionType 完全一致） */
function tokenCount(expr) {
    const s = String(expr).replace(/\s+/g, '').replace(/[()（）]/g, '');
    const re = /(sin|cos|tan|arcsin|arccos|arctan|abs|exp|ln|log|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
    let n = 0, m;
    while ((m = re.exec(s)) !== null) n++;
    if (n === 0 && s.length > 0) n = s.length;
    return n;
}
/** 表达式是否使用了被锁元素（锁数字时按字符级检查） */
function usesLockedElement(expr, locked) {
    if (!locked || !locked.length) return false;
    const s = String(expr).replace(/\s+/g, '');
    const re = /(sin|cos|tan|arcsin|arccos|arctan|abs|exp|ln|log|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
        const tok = m[0];
        if (locked.indexOf(tok) !== -1) return true;
        if (/^\d/.test(tok)) {
            for (const ch of tok) if (locked.indexOf(ch) !== -1) return true;
        }
    }
    return false;
}

// 加载闯关关卡数据（核验/彗星用；支持整数关与分数关 "1/2".."1/20"）
let levelById = null;
try {
    global.window = global;
    require(path.join(__dirname, '..', 'files', 'js', 'campaignLevels.js'));
    const pack = global.CAMPAIGN_LEVEL_PACK || {};
    levelById = new Map();
    for (const lv of (pack.levels || [])) {
        if (lv && lv.id != null) levelById.set(String(lv.id), lv);
    }
} catch (e) {
    console.warn('[LB] 关卡数据加载失败（核验/彗星不可用）:', e.message);
}
let ParserCls = null;
try { ParserCls = require(path.join(__dirname, '..', 'files', 'js', 'FunctionParser.js')); } catch (e) { console.warn('[LB] FunctionParser 加载失败:', e.message); }

// —— nonce / 闸门 / 核验 / 举报 / 彗星 状态 ——
const lastSubmitAt = new Map();     // ip → 最近提交时间
const verifyWindow = new Map();     // ip → { count, first }
const lockedUntil = new Map();      // ip → 当日锁定截止
const flaggedForVerify = new Set(); // 被举报待核验 playerId
const lastReportAt = new Map();     // playerId → 最近举报时间
const levelBestToken = new Map();   // 关卡 → 全服最短 token（彗星）

function issueNonce(ws) {
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
    ws._nonce = nonce;
    ws._nonceExp = Date.now() + NONCE_TTL;
    send(ws, { type: 'challenge', nonce, exp: ws._nonceExp });
}
function verifySig(ws, msg) {
    const nonce = String(msg.nonce || '');
    const fail = (reason, extra) => {
        console.warn(`[LB] verifySig FAIL: ${reason} | playerId=${String(msg.playerId || '').slice(0, 32)} boardType=${msg.boardType} value=${msg.value} | ${extra || ''}`);
        return false;
    };
    if (!nonce) return fail('nonce_empty');
    if (!ws._nonce) return fail('ws_nonce_empty (可能 nonce 已用过或从未下发)');
    if (Date.now() > (ws._nonceExp || 0)) return fail('nonce_expired', `now=${Date.now()} exp=${ws._nonceExp}`);
    if (nonce !== ws._nonce) return fail('nonce_mismatch', `got="${nonce.slice(0, 24)}..." ws="${String(ws._nonce).slice(0, 24)}..."`);
    ws._nonce = null; // 一次性
    const payload = msg.payload || {};
    const payloadJson = JSON.stringify(payload);
    const levelsHash = sha256Hex(bytesToLatin1(utf8Bytes(payloadJson)));
    const expected = hmacSHA256Hex(LB_SECRET,
        [nonce, String(msg.playerId || ''), String(msg.boardType || ''), String(msg.value === undefined ? '' : msg.value), levelsHash].join('|'));
    const got = String(msg.sig || '');
    if (got.length !== expected.length) return fail('sig_length_diff', `got=${got.length} expected=${expected.length} payload=${payloadJson.slice(0, 200)}`);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= (got.charCodeAt(i) ^ expected.charCodeAt(i));
    if (diff !== 0) {
        const sigInput = [nonce, String(msg.playerId || ''), String(msg.boardType || ''), String(msg.value === undefined ? '' : msg.value), levelsHash].join('|');
        return fail('sig_mismatch', `expected=${expected.slice(0, 24)}... got=${got.slice(0, 24)}... sigInput="${sigInput.slice(0, 200)}" payload=${payloadJson.slice(0, 200)}`);
    }
    return true;
}
function sendSubmitResult(ws, ok, extra = {}) {
    send(ws, Object.assign({ type: 'submit_result', ok }, extra));
}
// report / 上报专用：附带 boardType，方便客户端按榜更新本地状态（如"已上报 LR∑"）
function sendSubmitResultBT(ws, ok, boardType, extra = {}) {
    send(ws, Object.assign({ type: 'submit_result', ok, boardType }, extra));
}

/** 竞速总时长下限（与实施方案 §6.2：锚定 Lv1 = 1s，关联 allowed/forbidden/locks） */
function raceFloorSeconds(levelId) {
    const cfg = RACE_LEVEL_CFG[levelId - 1];
    if (!cfg) return 0.5;
    const [allowed, forbidden, fixedLocks, randomLocks] = cfg;
    const factor = 1 + 0.02 * (forbidden - 1) + 0.10 * (fixedLocks + randomLocks) + 0.20 * (allowed - 1);
    return 1 * factor;
}

/** D1+D6：是否触发核验（冷启动三档 + 超下一名 50 + 被举报） */
function needVerify(playerId, value) {
    if (flaggedForVerify.has(playerId)) return true;
    if (!ParserCls || !levelById) return false; // 复算不可用时退回签名通道
    const map = scoreBoards['lr'];
    if (!map) return false;
    const N = map.size;
    if (N < 10) return false; // 冷启动：全签名
    let M = 0, nextLower = -Infinity;
    for (const p of map.values()) {
        const s = p.score;
        if (s > M) M = s;
        if (s < value && s > nextLower) nextLower = s;
    }
    if (N < 50) {
        const T = Math.max(M - 100, Math.ceil(M * 0.8));
        if (value >= T) return true;
        if (value - (nextLower === -Infinity ? 0 : nextLower) > 50) return true;
        return false;
    }
    if (value >= M - 100) return true;
    if (value - (nextLower === -Infinity ? 0 : nextLower) > 50) return true;
    return false;
}

/** D3 + S2：整批拒绝 + 细化报错（务实版核验 + 老玩家升级兼容）
 *  总分一致性用 minTokens（全部有最佳记录的关，与客户端 calculateLRSigma 口径一致）；
 *  levels 必须覆盖全部 minTokens 关（防"少传表达式"绕过）；
 *  缺表达式的关（老玩家 1.0.0 历史数据）以 expr:'' 占位 → 做"已验证最优"边界检查：
 *    该关 minToken 不得优于全服已验证最优（否则无法证明 → missing_expr，需重新通关补齐）。 */
function verifyLRSigma(levels, minTokens, claimedValue) {
    const parser = new ParserCls();
    // 0) 键集合一致性：levels 覆盖全部 minTokens 关，且不出现额外关
    const tokKeys = new Set();
    for (const k of Object.keys(minTokens || {})) tokKeys.add(String(k));
    const lvlKeys = new Set();
    for (const lv of levels) lvlKeys.add(String(lv.level));
    for (const k of lvlKeys) if (!tokKeys.has(k)) return { ok: false, reason: 'level_not_open', level: k };
    for (const k of tokKeys) if (!lvlKeys.has(k)) return { ok: false, reason: 'missing_expr', level: k };
    // 1) 总分一致性：Σ 100/(10+minToken) over minTokens == value
    let sumAll = 0;
    if (minTokens && typeof minTokens === 'object') {
        for (const tokRaw of Object.values(minTokens)) {
            const tok = Number(tokRaw);
            if (Number.isFinite(tok) && tok > 0) sumAll += 100 / (10 + tok);
        }
    }
    if (Math.abs(sumAll - Number(claimedValue)) > 1e-6) return { ok: false, reason: 'value_mismatch', level: '' };
    // 2) 逐关内容核验
    for (const lv of levels) {
        const levelId = String(lv.level);
        const def = levelById.get(levelId);
        if (!def) return { ok: false, reason: 'level_not_open', level: levelId };
        const expr = String(lv.expr || '');
        const minTok = Number(lv.minToken);
        if (!expr) {
            // 占位（老玩家历史无表达式）：长度不得优于全服已验证最优，否则无法证明 → 拒
            const best = levelBestToken.get(levelId);
            if (Number.isFinite(minTok) && minTok > 0 && best != null && minTok < best) {
                return { ok: false, reason: 'missing_expr', level: levelId };
            }
            continue; // 有最优边界即接受（历史对齐，不误伤老玩家）
        }
        if (expr.length > 500) return { ok: false, reason: 'expr_mismatch', level: levelId };
        try { parser.evaluate(expr, 0); } catch (e) { return { ok: false, reason: 'expr_mismatch', level: levelId }; }
        if (usesLockedElement(expr, def.lockedElements || [])) return { ok: false, reason: 'not_pass', level: levelId };
        const realTok = tokenCount(expr);
        if (realTok !== minTok) return { ok: false, reason: 'length_mismatch', level: levelId };
    }
    return { ok: true, recomputedSum: sumAll };
}

/** 彗星：用该关最短 token 更新 levelBestToken 与 pl{lv} 榜（满分 10 颗 = 10 × 最优/我的） */
function updateCometBoards(playerId, nickname, minTokenMap, verifiedOnly) {
    if (!levelById) return;
    if (!minTokenMap || typeof minTokenMap !== 'object') return;
    for (const [lv, minTokenRaw] of Object.entries(minTokenMap)) {
        const minToken = Number(minTokenRaw);
        if (!Number.isFinite(minToken) || minToken <= 0 || minToken > 500) continue;
        if (!levelById.has(String(lv))) continue;
        if (verifiedOnly) { // 仅核验通过的关更新"全服已验证最优"（S2：签名通道不污染最优）
            const prevBest = levelBestToken.get(String(lv));
            if (prevBest == null || minToken < prevBest) levelBestToken.set(String(lv), minToken);
        }
        // 彗星分关榜 pl{lv}：score 直接存"该关最短 token"，token 越少越优（boardOrder 升序）
        const board = ensureBoard('pl' + String(lv));
        const cur = board.get(playerId);
        if (!cur || minToken < cur.score) {
            board.set(playerId, { playerId, nickname, score: minToken, updatedAt: Date.now() });
            scheduleSave();
        }
    }
}

/** D6：玩家举报（90s 间隔，被举报者下次 lr 强制核验，失败清分） */
function handleReport(ws, msg) {
    if (!verifySig(ws, msg)) { sendSubmitResultBT(ws, false, 'lr', { code: 'invalid_signature' }); return; }
    const target = String(msg.target || '').slice(0, 64);
    const playerId = String(msg.playerId || '').slice(0, 64);
    if (!target || !playerId || target === playerId) { sendSubmitResultBT(ws, false, 'lr', { code: 'bad_report' }); return; }
    const now = Date.now();
    if (now - (lastReportAt.get(playerId) || 0) < REPORT_GATE) { sendSubmitResultBT(ws, false, 'lr', { code: 'rate_limited' }); return; }
    lastReportAt.set(playerId, now);
    const map = scoreBoards['lr'];
    if (!map || !map.has(target)) { sendSubmitResultBT(ws, false, 'lr', { code: 'target_not_found' }); return; }
    flaggedForVerify.add(target);
    console.log(`[LB] ${playerId} 举报 ${target}（90s 间隔 OK），已标记强制核验`);
    sendSubmitResultBT(ws, true, 'lr', { code: 'reported' });
}

/** 从彗星 pl* 榜回填"全服已验证最优"levelBestToken（重启 / 清分 / 删榜后调用） */
function rebuildLevelBestTokens() {
    levelBestToken.clear();
    for (const t of Object.keys(scoreBoards)) {
        if (/^pl\d+(?:\/\d+)?$/.test(t)) {
            let min = null;
            for (const p of scoreBoards[t].values()) {
                if (min == null || p.score < min) min = p.score;
            }
            if (min != null) levelBestToken.set(String(t).slice(2), min);
        }
    }
}

/**
 * 清除玩家自己的排行榜成绩（重置进度时选择"不保留"）。
 * 签名防伪造：只能清自己的（playerId 在签名内锁定），无法清别人。
 * mode: 'campaign' → 删 lr + 所有 pl*（闯关重置）；'race' → 删所有 rt*（竞速重置）。
 * ELO 属于联机对局记录，与本地进度无关，不清。
 */
function handleDeleteMyScores(ws, msg) {
    const resp = (ok, extra = {}) => sendSubmitResultBT(ws, ok, 'wipe', Object.assign({ id: String(msg.id || '') }, extra));
    if (!verifySig(ws, msg)) { resp(false, { code: 'invalid_signature' }); return; }
    const playerId = String(msg.playerId || '').slice(0, 64);
    if (!playerId) { resp(false, { code: 'bad_request' }); return; }
    const mode = String(msg.mode || '');
    if (mode !== 'campaign' && mode !== 'race') { resp(false, { code: 'bad_mode' }); return; }
    let removed = 0;
    for (const t of Object.keys(scoreBoards)) {
        let match = false;
        if (mode === 'race') match = /^rt\d+$/.test(t);
        else match = t === 'lr' || /^pl\d+(?:\/\d+)?$/.test(t);
        if (!match) continue;
        if (scoreBoards[t].delete(playerId)) removed++;
    }
    // 联机 ELO 不随本地进度清除（历史对局记录）；若确需同步清，另行决策
    if (removed > 0) {
        rebuildLevelBestTokens(); // 被删者可能持有该关最短 token，需重算全服最优
        scheduleSave();
    }
    console.log(`[LB] ${playerId} 清除排行榜成绩(mode=${mode})，删除 ${removed} 条记录`);
    resp(true, { removed, mode });
}

/** 新身份风控：返回 false 表示该 IP 疑似刷榜，应忽略该新身份的上报 */
function checkIpNewIdentity(ip, playerId) {
    if (!ip) return true; // 无 IP 信息时不拦截（如未代理环境）
    const now = Date.now();
    let rec = ipIdentity.get(ip);
    if (!rec || now - rec.firstSeen > IP_WINDOW) {
        rec = { firstSeen: now, ids: new Set() };
        ipIdentity.set(ip, rec);
    }
    if (rec.ids.has(playerId)) return true; // 已是该 IP 见过的身份 → 不误伤
    rec.ids.add(playerId);
    return rec.ids.size <= IP_MAX_NEW;
}

/** 计算并更新双方 ELO（标准 ELO，K=32；winner: 'A'=playerId 胜, 'B'=对手胜, 'draw'） */
function updateElo(playerId, nickname, opponentId, opponentNickname, winner) {
    const now = Date.now();
    const getP = (id, defaultNick) => {
        const p = eloBoard.get(id);
        if (p) return p;
        return { playerId: id, nickname: defaultNick, elo: ELO_INIT, wins: 0, losses: 0, draws: 0, updatedAt: now };
    };
    const a = getP(playerId, nickname);
    const b = getP(opponentId, opponentNickname);

    const EA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
    const EB = 1 - EA;
    const sa = winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5;
    const sb = 1 - sa;

    a.elo = Math.round(a.elo + ELO_K * (sa - EA));
    b.elo = Math.round(b.elo + ELO_K * (sb - EB));
    a.nickname = nickname;
    b.nickname = opponentNickname;
    if (winner === 'A') { a.wins++; b.losses++; }
    else if (winner === 'B') { b.wins++; a.losses++; }
    else { a.draws++; b.draws++; }
    a.updatedAt = b.updatedAt = now;

    eloBoard.set(playerId, a);
    eloBoard.set(opponentId, b);
    scheduleSave();
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            const data = {
                savedAt: Date.now(),
                elo: [...eloBoard.values()]
            };
            for (const t of Object.keys(scoreBoards)) {
                data[t] = [...scoreBoards[t].values()];
            }
            fs.writeFileSync(LDB_FILE, JSON.stringify(data, null, 2));
            savePending = false;
        } catch (e) {
            console.warn('[LB] 排行榜落盘失败:', e.message);
        }
    }, 2000);
}

function loadLeaderboards() {
    try {
        if (!fs.existsSync(LDB_FILE)) return;
        const data = JSON.parse(fs.readFileSync(LDB_FILE, 'utf8'));
        let lrCount = 0, ttCount = 0;
        for (const t of Object.keys(data)) {
            if (t === 'savedAt') continue;
            const arr = Array.isArray(data[t]) ? data[t] : [];
            if (t === 'elo') {
                for (const p of arr) if (p && p.playerId) eloBoard.set(String(p.playerId), p);
            } else {
                const m = ensureBoard(t);
                for (const p of arr) if (p && p.playerId) m.set(String(p.playerId), p);
                if (t === 'lr') lrCount = m.size;
                if (t === 'tt') ttCount = m.size;
            }
        }
        // M1：从彗星 pl* 榜回填"全服已验证最优"levelBestToken（重启后不丢失）
        rebuildLevelBestTokens();
        console.log(`[LB] 排行榜已加载: LR ${lrCount} 人 / TT ${ttCount} 人 / ELO ${eloBoard.size} 人`);
    } catch (e) {
        console.warn('[LB] 加载排行榜失败:', e.message);
    }
}

function verifyCount(ip) { return (verifyWindow.get(ip) || { count: 0 }).count || 0; }
function isLockedOut(ip) { return (lockedUntil.get(ip) || 0) > Date.now(); }
function recordVerify(ip) {
    const now = Date.now();
    let w = verifyWindow.get(ip);
    if (!w || now - w.first > VERIFY_WINDOW) w = { count: 0, first: now };
    w.count++;
    verifyWindow.set(ip, w);
    if (w.count >= VERIFY_LOCK_K) {
        lockedUntil.set(ip, now + DAY_MS);
        console.log(`[LB] IP ${ip} 窗口内核验达 ${VERIFY_LOCK_K} 次，当日锁定核验通道`);
    }
}

function handleSubmitScore(ws, msg) {
    const boardType = String(msg.boardType || '');
    const playerId = String(msg.playerId || '').slice(0, 64);
    const nickname = String(msg.nickname || '棋手').trim().slice(0, 16) || '棋手';
    if (!playerId) return;
    const ip = ws && ws._ip ? ws._ip : '';
    const now = Date.now();

    // ── ELO：签名上报（防伪造 submit_score 刷 ELO；结算仍按 roomKey 去重） ──
    if (boardType === 'elo') {
        if (!verifySig(ws, msg)) { sendSubmitResultBT(ws, false, 'elo', { code: 'invalid_signature' }); return; }
        const opponentId = String(msg.opponentPlayerId || '').slice(0, 64);
        if (!opponentId || opponentId === playerId) return;
        const roomKey = String(msg.roomCode || '').slice(0, 64);
        if (roomKey) {
            if (eloSettled.has(roomKey)) return; // 该房间已结算
            eloSettled.add(roomKey);
            if (eloSettled.size > 20000) { // 防止内存无限增长
                const first = eloSettled.values().next().value;
                if (first) eloSettled.delete(first);
            }
        }
        const winner = (msg.winner === 'A' || msg.winner === 'B') ? msg.winner : 'draw';
        const opponentNickname = String(msg.opponentNickname || '棋手').trim().slice(0, 16) || '棋手';
        updateElo(playerId, nickname, opponentId, opponentNickname, winner);
        return;
    }

    // ── 计分榜（lr / rtN）：方案A 验签 + nonce + 闸门（tt 历史榜不再接受新上报） ──
    const isRaceTime = /^rt\d+$/.test(boardType);
    const isComet = /^pl\d+$/.test(boardType);
    if (!isRaceTime && !isComet && boardType !== 'lr') return;
    if (!verifySig(ws, msg)) { sendSubmitResultBT(ws, false, boardType, { code: 'invalid_signature' }); return; }
    const value = Number(msg.value);
    if (!Number.isFinite(value) || value < 0) return;

    const needV = boardType === 'lr' ? needVerify(playerId, value) : false;
    let gate = SIGN_GATE;
    if (needV) {
        gate = isLockedOut(ip) ? Infinity : VERIFY_GATES[Math.min(verifyCount(ip), VERIFY_GATES.length - 1)];
    }
    const wait = now - (lastSubmitAt.get(ip) || 0);
    if (wait < gate) {
        sendSubmitResultBT(ws, false, boardType, { code: 'rate_limited', waitMs: Math.max(1, Math.ceil((gate - wait) / 1000)) });
        return;
    }
    lastSubmitAt.set(ip, now);

    // ── LR∑ 榜 ──
    if (boardType === 'lr') {
        if (value > 1e9) return;
        const payload = msg.payload || {};
        if (needV) {
            // 方案二核验通道：逐关复算（务实版），通过后用服务器值入库
            const levels = Array.isArray(payload.levels) ? payload.levels : null;
            if (!levels || !levels.length) { sendSubmitResultBT(ws, false, 'lr', { code: 'verify_failed', reason: 'missing_levels' }); return; }
            recordVerify(ip);
            const res = verifyLRSigma(levels, payload.minTokens, value);
            if (!res.ok) {
                if (flaggedForVerify.has(playerId)) { // D6 被举报且核验失败 → 清分
                    const lrMap = scoreBoards['lr'];
                    if (lrMap) lrMap.delete(playerId);
                    // M2：连带清理该玩家在各彗星分关榜 pl* 的记录
                    for (const t of Object.keys(scoreBoards)) {
                        if (/^pl\d+(?:\/\d+)?$/.test(t)) scoreBoards[t].delete(playerId);
                    }
                    flaggedForVerify.delete(playerId);
                    scheduleSave();
                    console.log(`[LB] ${playerId} 被举报且核验失败(${res.reason}/${res.level})，已清分（含彗星榜）`);
                }
                sendSubmitResultBT(ws, false, 'lr', { code: 'verify_failed', reason: res.reason, level: res.level });
                return;
            }
            flaggedForVerify.delete(playerId);
            const map = ensureBoard('lr');
            const cur = map.get(playerId);
            if (!cur || res.recomputedSum > cur.score) {
                if (!cur && !checkIpNewIdentity(ip, playerId)) {
                    console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${playerId} 的上报`);
                    return;
                }
                map.set(playerId, { playerId, nickname, score: res.recomputedSum, updatedAt: now });
                scheduleSave();
            }
            const minTokens = {};
            for (const lv of levels) if (lv.expr) minTokens[String(lv.level)] = Number(lv.minToken);
            updateCometBoards(playerId, nickname, minTokens, true); // 仅核验关更新全服最优
            sendSubmitResultBT(ws, true, 'lr', { score: res.recomputedSum });
            return;
        }
        // 签名通道：value 与 minTokens 均在签名内，信任入库
        const map = ensureBoard('lr');
        const cur = map.get(playerId);
        if (!cur || value > cur.score) {
            if (!cur && !checkIpNewIdentity(ip, playerId)) {
                console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${playerId} 的上报`);
                return;
            }
            map.set(playerId, { playerId, nickname, score: value, updatedAt: now });
            scheduleSave();
        }
        updateCometBoards(playerId, nickname, payload.minTokens, false); // 签名通道不更新全服最优
        sendSubmitResultBT(ws, true, 'lr', { score: value });
        return;
    }

    // ── 竞速分关榜 rt{N}：签名 + 题数校验 + 难度下限 ──
    if (isRaceTime) {
        const levelId = Number(boardType.slice(2));
        if (!Number.isFinite(levelId) || levelId < 1 || levelId > 30) return;
        if (value < 1 || value > 1e6) return;
        const solvedCount = Number(msg.solvedCount);
        const totalRounds = Number(msg.totalRounds);
        // L1：缺省（老客户端不带 / 传 0）视为 10 兼容；显式给了且不是 10 才拒（仍防"明确报不满题"）
        if ((Number.isFinite(solvedCount) && solvedCount > 0 && solvedCount !== RACE_PUZZLES) ||
            (Number.isFinite(totalRounds) && totalRounds > 0 && totalRounds !== RACE_PUZZLES)) return;
        if (value < raceFloorSeconds(levelId)) { sendSubmitResultBT(ws, false, boardType, { code: 'too_fast', level: levelId }); return; }
        const map = ensureBoard(boardType);
        const cur = map.get(playerId);
        if (!cur || value < cur.score) {
            if (!cur && !checkIpNewIdentity(ip, playerId)) {
                console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${playerId} 的上报`);
                return;
            }
            map.set(playerId, { playerId, nickname, score: value, updatedAt: now });
            scheduleSave();
        }
        sendSubmitResultBT(ws, true, boardType);
        return;
    }

    // 彗星 pl{N}：只读，不接受客户端直接提交
    if (isComet) { sendSubmitResultBT(ws, false, boardType, { code: 'readonly' }); return; }
}

function handleQueryLeaderboard(ws, msg) {
    const boardType = String(msg.boardType || '');
    const playerId = String(msg.playerId || '');

    // 联机 ELO 榜：按 ELO 降序（未打过任何对局视为 1200，且显示"我的分数"）
    if (boardType === 'elo') {
        const arr = [...eloBoard.values()].sort((a, b) => b.elo - a.elo || a.updatedAt - b.updatedAt);
        const list = arr.slice(0, topFor('elo')).map((p, i) => ({
            rank: i + 1,
            nickname: p.nickname,
            score: p.elo,
            wins: p.wins,
            losses: p.losses,
            draws: p.draws,
            isMe: String(p.playerId) === playerId
        }));
        const meIdx = arr.findIndex((p) => String(p.playerId) === playerId);
        const inTop = meIdx >= 0 && meIdx < topFor('elo');
        send(ws, {
            type: 'leaderboard_result',
            id: String(msg.id || ''),
            boardType,
            list,
            myRank: inTop ? meIdx + 1 : -1,
            myScore: meIdx === -1 ? ELO_INIT : arr[meIdx].elo   // 一场没打 = 1200
        });
        return;
    }

    // 其余计分榜（lr / tt / rtN）：按 boardOrder 排序（rtN 升序 = 用时短者优）
    const map = scoreBoards[boardType];
    if (!map) {
        send(ws, { type: 'leaderboard_result', id: String(msg.id || ''), boardType, list: [], myRank: -1, myScore: null });
        return;
    }
    const order = boardOrder(boardType);
    const arr = [...map.values()].sort((a, b) => {
        if (order === 'asc') return (a.score - b.score) || (a.updatedAt - b.updatedAt);
        return (b.score - a.score) || (a.updatedAt - b.updatedAt);
    });
    const list = arr.slice(0, topFor(boardType)).map((p, i) => ({
        rank: i + 1,
        nickname: p.nickname,
        score: p.score,
        playerId: String(p.playerId),     // 供举报等需要（LR∑ 榜）
        isMe: String(p.playerId) === playerId
    }));
    const meIdx = arr.findIndex((p) => String(p.playerId) === playerId);
    const inTop = meIdx >= 0 && meIdx < topFor(boardType);
    // 彗星分关榜额外返回：该关全服最短 token（供客户端算 plv 与缓存）
    const isCometBoard = /^pl\d+(?:\/\d+)?$/.test(boardType);
    const levelBestTok = isCometBoard ? (levelBestToken.get(String(boardType.slice(2))) || null) : null;
    send(ws, {
        type: 'leaderboard_result',
        id: String(msg.id || ''),
        boardType,
        list,
        myRank: inTop ? meIdx + 1 : -1,                    // 未进前 N 视为未上榜
        myScore: meIdx === -1 ? null : arr[meIdx].score,   // 有记录则返回自己的分数（供未上榜时显示）
        levelBestToken: isCometBoard ? levelBestTok : undefined
    });
}

/** 若该连接是某房间的房主，移除其房间并通知对战方与观众。
 *  注意：房主退出并非"本局作废"——对局判定由客户端上报：
 *  房主端自行 _reportP2PForfeit(true)（房主判负），访客端收到 room_dissolved 后
 *  _reportP2PForfeitOpponent()（判房主负、访客胜），服务端按 roomKey 去重，结果对称。 */
function cleanupHost(ws) {
    for (const [code, room] of rooms) {
        if (room.hostWs === ws) {
            if (room.guestWs) send(room.guestWs, { type: 'room_dissolved', code, reason: 'host_left' });
            for (const sp of room.spectators) {
                send(sp, { type: 'spectate_ended', code, reason: 'host_left' });
            }
            room.spectators.clear();
            rooms.delete(code);
            console.log(`[Lobby] 房主断开，房间 ${code} 已清理`);
        }
    }
}

// 定期清理过期房间（普通 5 分钟 / 长效 30 分钟），并通知对应房主
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (room.expiresAt && now >= room.expiresAt) {
            rooms.delete(code);
            console.log(`[Lobby] 房间 ${code} 已过期，自动清理`);
            send(room.hostWs, { type: 'room_expired', code });
        }
    }
}, 30000);

lobbyWss.on('connection', (ws, req) => {
    // 记录来源 IP（排行榜刷榜风控用；不做身份主键）
    ws._ip = getClientIp(req);
    console.log('[Lobby] 客户端已连接' + (ws._ip ? `（IP ${ws._ip}）` : ''));

    // 排行榜签名：下发一次性 nonce
    try { issueNonce(ws); } catch (e) { /* 忽略 */ }

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!msg || !msg.type) return;

        switch (msg.type) {
            // 房主登记房间（建房进大厅列表）
            case 'host_register': {
                cleanupHost(ws); // 同一连接重复登记时，先清旧房
                const longLived = !!(msg.options && msg.options.longLived);
                const code = genRoomCode(longLived);
                const expiresAt = Date.now() + (longLived ? ROOM_TTL_LONG : ROOM_TTL_DEFAULT);
                // 允许观战默认开启：仅当显式 allowSpectate === false 时关闭
                const spectateEnabled = !(msg.options && msg.options.allowSpectate === false);
                // 房主身份与 ELO：ELO 距离过滤以房主 ELO 为基准（从 eloBoard 实时取，最权威）
                const hostPlayerId = String(msg.playerId || '').slice(0, 64);
                const hostEloEntry = hostPlayerId ? eloBoard.get(hostPlayerId) : null;
                const hostElo = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                // ELO 距离过滤阈值：仅排位房间可设置（>0 开启，超出范围的玩家不可见/不可加入）
                const rawRange = Number(msg.eloRange);
                const eloRange = isFinite(rawRange) && rawRange > 0 ? rawRange : null;
                rooms.set(code, {
                    code,
                    options: msg.options || {},
                    hostWs: ws,
                    guestWs: null,
                    status: 'waiting',
                    spectateEnabled,
                    spectators: new Set(),
                    createdAt: Date.now(),
                    expiresAt,
                    longLived,
                    hostPlayerId,
                    hostElo,
                    eloRange,
                    hostNickname: String(msg.nickname || '').slice(0, 32)
                });
                send(ws, { type: 'host_registered', code, expiresAt });
                console.log(`[Lobby] 房主登记房间 ${code}（${longLived ? '长效 30 分钟' : '5 分钟'}, 观战${spectateEnabled ? '开启' : '关闭'}）`, msg.options || {});
                break;
            }

            // 房主取消登记（退出等待）
            case 'cancel_register': {
                rooms.delete(String(msg.code));
                console.log(`[Lobby] 房主取消登记 ${msg.code}`);
                break;
            }

            // 访客拉取房间列表（等待中的房间 + 对局中且开启观战的房间）
            // mode 过滤：休闲玩家看不到排位房间，反之亦然（未标记模式的老房间按排位处理）
            // ELO 过滤：房主开启 ELO 距离过滤的房间，距房主 ELO 太远的访客不可见
            case 'list_rooms': {
                const now = Date.now();
                const modeFilter = msg.mode === 'casual' ? 'casual' : (msg.mode === 'ranked' ? 'ranked' : null);
                const visitorId = String(msg.playerId || '').slice(0, 64);
                const visitorEloEntry = visitorId ? eloBoard.get(visitorId) : null;
                const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                const list = [];
                for (const [code, room] of rooms) {
                    if (room.expiresAt && now >= room.expiresAt) {
                        rooms.delete(code);
                        continue;
                    }
                    const isWaiting = room.status === 'waiting';
                    const isSpectatable = room.status === 'playing' && room.spectateEnabled;
                    if (!isWaiting && !isSpectatable) continue;
                    if (modeFilter) {
                        const roomMode = (room.options && room.options.mode) || 'ranked';
                        if (roomMode !== modeFilter) continue;
                    }
                    // 房主当前 ELO：实时从 eloBoard 取（房间登记后再打排位赛会变动，显示/过滤都用最新值）
                    const hostEloEntry = room.hostPlayerId ? eloBoard.get(room.hostPlayerId) : null;
                    const hostEloNow = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                    // ELO 距离过滤：开启过滤的房间，访客 ELO 距房主超过阈值 → 不可见
                    if (room.eloRange) {
                        if (!visitorId) continue; // 无法校验身份 → 保守隐藏
                        if (Math.abs(hostEloNow - visitorElo) > room.eloRange) continue;
                    }
                    list.push({
                        code: room.code,
                        options: room.options,
                        createdAt: room.createdAt,
                        expiresAt: room.expiresAt,
                        status: room.status,
                        spectatorCount: room.spectators ? room.spectators.size : 0,
                        hostElo: hostEloNow,
                        hostNickname: room.hostNickname || ''
                    });
                }
                send(ws, { type: 'rooms_list', rooms: list });
                break;
            }

            // 访客申请加入（校验模式匹配：休闲/排位不能混搭）
            case 'join_request': {
                const room = rooms.get(String(msg.code));
                if (!room) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_not_available' });
                    return;
                }
                if (msg.mode === 'casual' || msg.mode === 'ranked') {
                    const roomMode = (room.options && room.options.mode) || 'ranked';
                    if (roomMode !== msg.mode) {
                        send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'mode_mismatch' });
                        return;
                    }
                }
                if (room.expiresAt && Date.now() >= room.expiresAt) {
                    rooms.delete(String(msg.code));
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_expired' });
                    return;
                }
                if (room.status !== 'waiting') {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_not_available' });
                    return;
                }
                // ELO 距离过滤：房主开启过滤的房间，访客 ELO 距房主超过阈值 → 拒绝加入
                if (room.eloRange) {
                    const visitorId = String(msg.playerId || '').slice(0, 64);
                    const visitorEloEntry = visitorId ? eloBoard.get(visitorId) : null;
                    const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                    const hostEloEntry = room.hostPlayerId ? eloBoard.get(room.hostPlayerId) : null;
                    const hostEloNow = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                    if (!visitorId || Math.abs(hostEloNow - visitorElo) > room.eloRange) {
                        send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'elo_range' });
                        return;
                    }
                }
                // 锁住房间，防止两个访客同时加入
                room.status = 'joining';
                room.guestWs = ws;
                send(room.hostWs, { type: 'guest_joining', code: room.code });
                send(ws, { type: 'join_accepted', code: room.code });
                console.log(`[Lobby] 访客申请加入 ${room.code}`);
                break;
            }

            // 访客取消加入
            case 'join_cancel': {
                const room = rooms.get(String(msg.code));
                if (room && room.status === 'joining' && room.guestWs === ws) {
                    room.status = 'waiting';
                    room.guestWs = null;
                    console.log(`[Lobby] 访客取消加入 ${room.code}，恢复等待`);
                }
                break;
            }

            // 房间开局：房间对象保留（生命周期由房主连接控制），仅切换状态；
            // 是否展示在大厅由 spectateEnabled（list_rooms 过滤）决定
            case 'room_started': {
                const room = rooms.get(String(msg.code));
                if (room) {
                    room.status = 'playing';
                    room.expiresAt = 0; // 对局中房间不受 TTL 清理
                    // 建房时已关闭观战（或开局上报关闭）→ 观众不可加入
                    if (msg.spectate === false) {
                        room.spectateEnabled = false;
                        for (const sp of room.spectators) {
                            send(sp, { type: 'spectate_ended', code: room.code, reason: 'disabled' });
                        }
                        room.spectators.clear();
                    }
                    console.log(`[Lobby] 房间 ${room.code} 开局，观战${room.spectateEnabled ? '开启（保留在大厅）' : '关闭（已隐藏）'}`);
                }
                break;
            }

            // 房主开启观战（对局中切换；waiting 阶段也可改）
            case 'spectate_enable': {
                const room = rooms.get(String(msg.code));
                if (room) {
                    room.spectateEnabled = true;
                    console.log(`[Lobby] 房间 ${msg.code} 开启观战`);
                }
                break;
            }

            // 房主关闭观战：立即隐藏（list_rooms 不再返回）并踢掉所有观众。
            // 房间对象保留，房主随时可重新开启；最终随房主断开自动清理。
            case 'spectate_disable': {
                const code = String(msg.code);
                const room = rooms.get(code);
                if (room) {
                    room.spectateEnabled = false;
                    for (const sp of room.spectators) {
                        send(sp, { type: 'spectate_ended', code, reason: 'disabled' });
                    }
                    room.spectators.clear();
                    console.log(`[Lobby] 房主关闭观战，房间 ${code} 已从大厅隐藏`);
                }
                break;
            }

            // 观众加入观战（仅对局中且开启观战的房间）
            case 'spectate_join': {
                const code = String(msg.code);
                const room = rooms.get(code);
                if (!room || room.status !== 'playing' || !room.spectateEnabled) {
                    send(ws, { type: 'spectate_join_rejected', code, reason: 'spectate_not_allowed' });
                    return;
                }
                // ELO 距离过滤同样约束观战：距房主太远的观众不可观战（与列表不可见保持一致）
                if (room.eloRange) {
                    const visitorId = String(msg.playerId || '').slice(0, 64);
                    const visitorEloEntry = visitorId ? eloBoard.get(visitorId) : null;
                    const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                    const hostEloEntry = room.hostPlayerId ? eloBoard.get(room.hostPlayerId) : null;
                    const hostEloNow = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                    if (!visitorId || Math.abs(hostEloNow - visitorElo) > room.eloRange) {
                        send(ws, { type: 'spectate_join_rejected', code, reason: 'elo_range' });
                        return;
                    }
                }
                // 同一连接只能观战一场对局
                for (const [c, r] of rooms) {
                    if (r.spectators && r.spectators.has(ws)) r.spectators.delete(ws);
                }
                room.spectators.add(ws);
                send(ws, { type: 'spectate_joined', code, options: room.options });
                console.log(`[Lobby] 观众加入观战 ${code}，当前 ${room.spectators.size} 人`);
                break;
            }

            // 观众主动退出观战
            case 'spectate_leave': {
                const room = rooms.get(String(msg.code));
                if (room && room.spectators) room.spectators.delete(ws);
                break;
            }

            // 房主/对手推送状态快照 → 广播给该房间所有观众
            case 'spectate_sync': {
                if (msg.payload == null) break;
                for (const [code, room] of rooms) {
                    if (room.hostWs === ws || room.guestWs === ws) {
                        for (const sp of room.spectators) {
                            send(sp, { type: 'spectate_state', code, payload: msg.payload });
                        }
                        break;
                    }
                }
                break;
            }

            // 排行榜：上报成绩（LR∑ / TT∑ / ELO）
            case 'submit_score': {
                try { handleSubmitScore(ws, msg); } catch (e) { console.warn('[LB] submit_score 处理异常:', e.message); }
                break;
            }

            // 排行榜：查询榜单 → leaderboard_result
            case 'query_leaderboard': {
                try { handleQueryLeaderboard(ws, msg); } catch (e) { console.warn('[LB] query_leaderboard 处理异常:', e.message); }
                break;
            }

            // 排行榜：玩家举报（90s 间隔，被举报者强制核验）
            case 'report': {
                try { handleReport(ws, msg); } catch (e) { console.warn('[LB] report 处理异常:', e.message); }
                break;
            }

            // 排行榜：重新申请一次性 nonce（签名用）
            case 'request_challenge': {
                try { issueNonce(ws); } catch (e) { console.warn('[LB] request_challenge 处理异常:', e.message); }
                break;
            }

            // 排行榜：清除自己的成绩（重置进度时选择"不保留"；签名防伪造）
            case 'delete_my_scores': {
                try { handleDeleteMyScores(ws, msg); } catch (e) { console.warn('[LB] delete_my_scores 处理异常:', e.message); }
                break;
            }

            // 房主主动解散房间（对局中/等待中退出）：通知对战方与观众，房间作废
            case 'room_dissolve': {
                try {
                    for (const [code, room] of rooms) {
                        if (room.hostWs === ws) {
                            if (room.guestWs) send(room.guestWs, { type: 'room_dissolved', code, reason: 'host_dissolved' });
                            for (const sp of room.spectators) {
                                send(sp, { type: 'spectate_ended', code, reason: 'host_dissolved' });
                            }
                            room.spectators.clear();
                            rooms.delete(code);
                            console.log(`[Lobby] 房主主动解散房间 ${code}`);
                            break;
                        }
                    }
                } catch (e) { console.warn('[Lobby] room_dissolve 处理异常:', e.message); }
                break;
            }

            // 排行榜：批量查询玩家 ELO（联机开场 VS 动画用）→ player_elo_result
            case 'query_player_elo': {
                try {
                    const ids = (Array.isArray(msg.playerIds) ? msg.playerIds : [])
                        .map((id) => String(id).slice(0, 64)).filter(Boolean);
                    const players = {};
                    for (const id of ids) {
                        const p = eloBoard.get(id);
                        players[id] = p
                            ? { elo: p.elo, nickname: p.nickname, wins: p.wins, losses: p.losses, draws: p.draws }
                            : { elo: ELO_INIT, nickname: '棋手', wins: 0, losses: 0, draws: 0 };
                    }
                    send(ws, { type: 'player_elo_result', id: String(msg.id || ''), players });
                } catch (e) { console.warn('[LB] query_player_elo 处理异常:', e.message); }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[Lobby] 客户端断开');
        // 从所有观战房间移除该观众
        for (const room of rooms.values()) {
            if (room.spectators && room.spectators.has(ws)) {
                room.spectators.delete(ws);
            }
        }
        // 访客若正在 joining，恢复房间为 waiting，避免房间被锁死
        for (const room of rooms.values()) {
            if (room.guestWs === ws && room.status === 'joining') {
                room.status = 'waiting';
                room.guestWs = null;
                console.log(`[Lobby] 加入中的访客断开，房间 ${room.code} 恢复等待`);
            }
        }
        cleanupHost(ws);
    });
});

// —— 启动时 SHA256/HMAC 自测（与 VerifyCrypto.js 同一锚点；不一致则客户端签名一定失败） ——
(function selfTestCrypto() {
    const cases = [
        { label: 'sha256("")',     got: sha256Hex(''),                                                                          want: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
        { label: 'sha256("abc")',   got: sha256Hex('abc'),                                                                        want: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
        { label: 'hmac(key, fox)',  got: hmacSHA256Hex('key', 'The quick brown fox jumps over the lazy dog'),                      want: 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8' },
        { label: 'sha256(中文)',    got: sha256Hex(bytesToLatin1(utf8Bytes('中文'))),                                              want: '72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21' }
    ];
    let pass = 0, fail = 0;
    for (const c of cases) {
        if (c.got === c.want) { pass++; console.log(`[LB-SELFTEST] ✅ ${c.label}`); }
        else { fail++; console.warn(`[LB-SELFTEST] ❌ ${c.label}\n   got:  ${c.got}\n   want: ${c.want}`); }
    }
    console.log(`[LB-SELFTEST] ${pass} pass, ${fail} fail${fail ? '  ⚠️ 排行榜验签一定全部失败，请联系开发' : ''}`);
})();

loadLeaderboards();

server.listen(PORT, HOST, () => {
    console.log(`✅ 函数棋 P2P 信令 + 大厅服务器已启动: http://localhost:${PORT}`);
    console.log(`   PeerJS 信令: http://localhost:${PORT}/peerjs`);
    console.log(`   匹配大厅 WebSocket: ws://localhost:${PORT}/lobby`);
    console.log(`   在线排行榜: ${LDB_FILE}`);
    console.log(`   前端配置: files/js/P2PController.js → P2PController.signaling`);
});
