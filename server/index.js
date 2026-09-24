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
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { ExpressPeerServer } = require('peer');
const dbm = require('./db');   // 账号库（大厅强制登录校验 token 用）

const PORT = process.env.P2P_PORT || 9000;
const HOST = process.env.P2P_HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// 解析 JSON 请求体（账号认证 / 进度同步用）
app.use(express.json());

// ─────────────────────────────────────────────
// 0. CORS 跨域中间件
//     前端（登录 / 进度同步 / notice / version）会从 shaihai.cn 系列与 wakudemo.cn 系列
//     域名、localhost、以及本地 file:// 打开的页面跨源访问本服务的 /api，
//     浏览器会拦截跨域，这里统一放行已知来源并处理 OPTIONS preflight。
//     白名单口径与老服务器 nginx 的 map $http_origin 保持一致：
//       "~^https://(.*\.)?wakudemo\.cn$" / "~^https://(.*\.)?shaihai\.cn$" / "null"
//     注意：WebSocket（/lobby、/peerjs）不走此中间件，本身不跨域受限。
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    // 线上站点（含裸域与所有子域）：www.shaihai.cn / shaihai.cn / p2p.shaihai.cn /
    // p2p2.shaihai.cn:24026 / wakudemo.cn / www.wakudemo.cn / … 均在放行之列
    //
    // http 也必须放行：手机浏览器地址栏输入「shaihai.cn/fnchess」（不带协议）时，
    // 首访可能先走 http（站点未强制跳转，且新设备没有 HSTS 缓存），
    // 此时页面里的 /api 请求带的是 Origin: http://shaihai.cn —— 只放行 https 就会
    // 被浏览器按 CORS 拦掉，前端只能报「无法连接服务器」（电脑因已缓存 HSTS 走 https 而正常）。
    // 站点侧已同时配置 http→https 强制跳转，这里放行 http 只是兜底。
    /^https?:\/\/([a-z0-9_-]+\.)*shaihai\.cn(:\d+)?$/i,
    /^https?:\/\/([a-z0-9_-]+\.)*wakudemo\.cn(:\d+)?$/i,
    // 本地直接双击 index.html（file:// 协议）时浏览器发出的 Origin 是字符串 'null'。
    // 不放行 → 请求被浏览器按 CORS 拦截 → 前端只能提示"无法连接服务器，当前可能处于离线状态"。
    // 本 API 不使用 Cookie 鉴权（token 走 Authorization 头、且按源隔离的 localStorage），
    // 因此放行 null 不会带来凭据泄露，只放开了本就公开的接口。
    'null',
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/
];
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = origin && ALLOWED_ORIGINS.some(
        (o) => typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (origin) res.setHeader('Vary', 'Origin');   // 白名单随来源变化，避免中间层缓存串源
    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
        // preflight：即使来源不在白名单也返回 204，避免被浏览器判定失败
        return res.sendStatus(204);
    }
    next();
});

// ─────────────────────────────────────────────
// 0. 账号认证（注册 / 登录 / 登出 / me / 改名 / 改密）
//     依赖 better-sqlite3（server/db.js + server/auth.js）
//     ⚠️ 必须挂载在 peerServer 之前，否则会被 PeerJS 拦截
// ─────────────────────────────────────────────
const authRouter = require('./auth');
app.use('/api/auth', authRouter);

// ─────────────────────────────────────────────
// 0. 账号进度同步（pull / push，字段级合并，服务器为时钟权威）
//    依赖 better-sqlite3（server/sync.js + server/db.js）
//    同样必须挂载在 peerServer 之前
// ─────────────────────────────────────────────
const syncRouter = require('./sync');
app.use('/api/sync', syncRouter);

// ─────────────────────────────────────────────
// 0. ICE 配置下发（WebRTC 直连 / TURN 中继）
//    下发 STUN 列表 + coturn 限时 TURN 凭证（TURN REST API 约定：
//    username = 过期时间戳；credential = base64(HMAC-SHA1(secret, username))）。
//    密钥来源：环境变量 FNCHESS_TURN_SECRET > server/.turn-secret 文件（不入库）。
//    未配置密钥时只下发 STUN，避免给客户端无效的中继凭证。
// ─────────────────────────────────────────────
const TURN_HOST = 'p2p2.shaihai.cn';
const TURN_SECRET_FILE = path.join(__dirname, '.turn-secret');
let _turnSecret = null;
function getTurnSecret() {
    if (process.env.FNCHESS_TURN_SECRET) return process.env.FNCHESS_TURN_SECRET;
    if (_turnSecret !== null) return _turnSecret;
    try { _turnSecret = fs.readFileSync(TURN_SECRET_FILE, 'utf8').trim(); } catch (e) { _turnSecret = ''; }
    return _turnSecret;
}
app.get('/api/ice', (req, res) => {
    const stun = {
        urls: [
            'stun:' + TURN_HOST + ':3478',
            'stun:stun.cloudflare.com:3478',
            'stun:stun.qq.com:3478',
            'stun:stun.miwifi.com:3478'
        ]
    };
    const secret = getTurnSecret();
    const ttl = 3600;
    if (!secret) return res.json({ ok: true, turn: false, ttl: 0, iceServers: [stun] });
    const username = String(Math.floor(Date.now() / 1000) + ttl);
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    res.json({
        ok: true,
        turn: true,
        ttl,
        iceServers: [stun, {
            urls: [
                'turn:' + TURN_HOST + ':3478?transport=udp',
                'turn:' + TURN_HOST + ':3478?transport=tcp'
            ],
            username,
            credential
        }]
    });
});

// ─────────────────────────────────────────────
// 0. 服务器通知（notice.json）
//    前端每次打开游戏会 fetch /notice 拿到 { id, title, content }，
//    与本地缓存的编号比较，编号不同则弹出通知。改 notice.json 无需重启服务器。
// ─────────────────────────────────────────────
const NOTICE_FILE = path.join(__dirname, 'notice.json');
app.get('/notice', (req, res) => {
    //res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (!fs.existsSync(NOTICE_FILE)) {
            res.status(404).json({ error: 'no_notice' });
            return;
        }
        const raw = fs.readFileSync(NOTICE_FILE, 'utf8');
        const notice = JSON.parse(raw);
        if (notice && notice.id != null) {
            res.json(notice);
        } else {
            res.status(500).json({ error: 'notice_bad_format' });
        }
    } catch (e) {
        console.warn('[Notice] 读取通知文件失败:', e.message);
        res.status(500).json({ error: 'notice_error' });
    }
});

// ─────────────────────────────────────────────
// 0.1 游戏版本（version.json）
//     前端每次启动拉取 /version，与本地 window.GAME_VERSION 比较，
//     本地版本更小则提示有新版本。发布新版本时更新此文件的 version 即可。
// ─────────────────────────────────────────────
const VERSION_FILE = path.join(__dirname, 'version.json');
app.get('/version', (req, res) => {
    //res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (!fs.existsSync(VERSION_FILE)) {
            res.status(404).json({ error: 'no_version' });
            return;
        }
        const raw = fs.readFileSync(VERSION_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data && data.version) {
            res.json(data);
        } else {
            res.status(500).json({ error: 'version_bad_format' });
        }
    } catch (e) {
        console.warn('[Version] 读取版本文件失败:', e.message);
        res.status(500).json({ error: 'version_error' });
    }
});

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

// 在线 PeerJS id 集合：房主建房后其 Peer id 即「裸房间码」（1v1）或「race_房间码」（竞速）。
// 用于 room_lookup 判断输入的房间码属于对战房还是竞速房（即使未登记大厅也能识别）。
const onlinePeerIds = new Set();
peerServer.on('connection', (client) => {
    if (client && typeof client.getId === 'function') onlinePeerIds.add(client.getId());
    console.log(`[P2P] 客户端已连接: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
    if (client && typeof client.getId === 'function') onlinePeerIds.delete(client.getId());
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
 * Map<code, { code, options, hostWs, guestWs, isRace, maxPlayers, guests, status, spectateEnabled, spectators, createdAt }>
 * status: 'waiting' | 'joining' | 'playing'
 * spectateEnabled: 是否允许观战（默认 true，竞速房强制 false）
 * 竞速房（isRace=true）：guestWs 恒为 null，多访客存于 guests（[{ws,playerId,nickname}]），1v1 房 guests 恒为 null
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
// 双向结果一致性核对：同一房间双方各自上报战果，换算为「绝对胜者身份键」后比对，
// 不一致即有一方在伪造战果（彻底裁决需服务端权威帧/回放，见 docs/RELEASE-GUIDE.md 残留风险）。
const eloReports = new Map();  // roomKey → [{ self, opp, winnerAbs, ts }]
const eloAnomaly = new Set();  // 已判定为双向不一致的房间（日志告警 + 排查用）

// ── 全服喊话（世界频道）──
// shoutHistory：最近若干条喊话（环形上限），新喊话广播给所有 /lobby 连接
// lastShoutAt：playerId → 最近一次喊话时间戳（按身份限流，防刷屏）
const shoutHistory = [];           // [{ playerId, nickname, text, ts }]
const SHOUT_HISTORY_MAX = 20;      // 保留最近 20 条
const SHOUT_MAX_LEN = 30;          // 单条最大字数（压缩信息量）
const SHOUT_COOLDOWN_MS = 30000;   // 每个玩家喊话冷却 30s（较长时间间隔）
const lastShoutAt = new Map();     // playerId → 最近喊话时间戳
function pushShout(entry) {
    shoutHistory.push(entry);
    if (shoutHistory.length > SHOUT_HISTORY_MAX) shoutHistory.shift();
}
// 向所有大厅连接广播喊话
function broadcastShout(entry) {
    const msg = { type: 'shout_new', playerId: entry.playerId, nickname: entry.nickname, text: entry.text, ts: entry.ts };
    for (const ws of lobbyWss.clients) {
        if (ws.readyState === 1) send(ws, msg);
    }
}

// ── 在线人数 / 房间统计（匹配大厅速览浮窗展示）──
// online：去重后的在线人数（见下方口径说明），conns：原始连接数（排障用）
// waitP2P/playP2P/waitRace/playRace：等待中/对局中的对战房与竞速房数量
function computeOnlineStats() {
    const now = Date.now();
    let waitP2P = 0, playP2P = 0, waitRace = 0, playRace = 0;
    for (const room of rooms.values()) {
        // 对局中的房间不参与 TTL 清理；等待中的过期房间不计入
        if (room.status !== 'playing' && room.expiresAt && now >= room.expiresAt) continue;
        if (room.isRace) {
            if (room.status === 'playing') playRace++; else waitRace++;
        } else {
            if (room.status === 'playing') playP2P++; else waitP2P++;
        }
    }
    // 在线人数口径：按「玩家」去重，而不是按连接数。
    // 原因：速览浮窗会为一个客户端开 4 条 /lobby 探针，同一人多开网页/多开 App 也会叠加连接，
    // 按连接数统计会把在线人数放大数倍（历史缺陷：显示值约为真实人数 4~5 倍）。
    //   已登录 → 按账号 userId 去重；未登录 → 按客户端 IP 去重；
    //   同一 IP 上既有登录连接又有匿名连接时（换号/登出残留）只算一次。
    const seenUsers = new Set();
    const authedIps = new Set();
    const anonIps = new Set();
    let conns = 0;
    for (const ws of lobbyWss.clients) {
        if (ws.readyState !== 1) continue; // 只统计活跃连接
        conns++;
        if (ws._userId) {
            seenUsers.add(String(ws._userId));
            if (ws._ip) authedIps.add(ws._ip);
        } else {
            anonIps.add(ws._ip || 'unknown');
        }
    }
    let online = seenUsers.size;
    for (const ip of anonIps) {
        if (!authedIps.has(ip)) online++;
    }
    return { online: online, conns: conns, waitP2P, playP2P, waitRace, playRace, ts: now };
}

function broadcastOnlineStats() {
    const stats = computeOnlineStats();
    const msg = { type: 'online_stats', stats };
    for (const ws of lobbyWss.clients) {
        if (ws.readyState === 1) send(ws, msg);
    }
    return stats;
}

// 周期广播在线人数与战局数（5s 足够，避免刷屏）
setInterval(() => { try { broadcastOnlineStats(); } catch (e) { /* 忽略 */ } }, 5000);

// ── 竞速对战积分榜（boardType 'rsc'）──
// 结构：Map(playerId, { playerId, nickname, score, games, wins, updatedAt })
const raceBoard = new Map();
const raceSettled = new Set();  // 已结算的竞速房间码（按 roomKey:playerId 去重，防多端重复上报）
// 竞速段位区间（分数越高段位越高）——9 级天体段位
// 间隔分段：前 4 级 +100、中 3 级 +200、末段 +600（低段升得快、高段升得慢）
// ⚠️ 2026-08-15 修复 #5：此段位表为权威源，前端 UIRaceBattle._raceBattleRankTotal 的 thresholds 数组
// 必须与此处 min 值完全一致（0/100/200/300/400/600/800/1000/1600，total=1600），改动需同步两处。
const RACE_TIERS = [
    { name: '流星体', min: 0 },
    { name: '小行星', min: 100 },
    { name: '矮行星', min: 200 },
    { name: '行星', min: 300 },
    { name: '恒星', min: 400 },
    { name: '矮星系', min: 600 },
    { name: '星系', min: 800 },
    { name: '星系团', min: 1000 },
    { name: '宇宙', min: 1600 }
];
function raceTier(score) {
    let t = RACE_TIERS[0];
    for (const x of RACE_TIERS) if (score >= x.min) t = x;
    return t;
}
// 难度倍率（1~7 入门~传说）：难度越高，胜负增减越多
const RACE_DIFF_MULT = [0.6, 0.7, 0.8, 0.95, 1.1, 1.3, 1.5];
// 耐力倍率（1~4：1/3/5/10关）：连跑越长，胜负增减越多
const RACE_STAMINA_MULT = [0.6, 0.9, 1.2, 1.5];
// 低段位保护线：积分低于 300（未达「行星」段，即前三个段位）时输不扣分
const RACE_PROTECT_SCORE = 300;
// 按名次固定加减分（人数不同分值不同）× 难度/耐力倍率：place 1 为第一名；
// 局数越多变化越小（抑制刷分），衰减下限 40%
function raceDelta(place, totalPlayers, games, difficulty, stamina) {
    const base = totalPlayers <= 2 ? [20, -20]
        : totalPlayers === 3 ? [25, 5, -25]
        : [30, 10, -10, -30];
    const idx = Math.max(0, Math.min((place | 0) - 1, base.length - 1));
    const scale = Math.max(0.4, 1 - (games | 0) * 0.03);
    const dIdx = Math.max(0, Math.min((difficulty | 0) - 1, RACE_DIFF_MULT.length - 1));
    const sIdx = Math.max(0, Math.min((stamina | 0) - 1, RACE_STAMINA_MULT.length - 1));
    return Math.round(base[idx] * scale * RACE_DIFF_MULT[dIdx] * RACE_STAMINA_MULT[sIdx]);
}
// 竞速对战积分结算（服务端权威计算 delta，不信任客户端上报的数值，防伪造刷分）
// 2026-08-15 修复 #2/#3/#68：补限速 + IP 风控（对齐 handleSubmitScore 的 lr/rtN 防护），验签失败回传细分 code
function handleRaceScore(ws, msg, ip) {
    const vres = verifySig(ws, msg);
    if (vres !== true) { sendSubmitResultBT(ws, false, 'rsc', { code: vres || 'invalid_signature' }); return; }
    const now = Date.now();
    const playerId = String(msg.playerId || '').slice(0, 64);
    if (!playerId) return;
    // 阶段3：排行榜主键改用"身份键"（登录 'u'+userId，未登录 playerId）
    const idKey = msgIdentity(msg);
    // 2026-08-15 修复 #2：限速（对齐 handleSubmitScore 的 SIGN_GATE 2s 闸门，防脚本刷分）
    if (ip) {
        const g = lastSubmitAt.get(ip) || 0;
        if (now - g < SIGN_GATE) {
            sendSubmitResultBT(ws, false, 'rsc', { code: 'too_fast', waitMs: Math.max(1, Math.ceil((SIGN_GATE - (now - g)) / 1000)) });
            return;
        }
        lastSubmitAt.set(ip, now);
    }
    const nickname = String(msg.nickname || '棋手').trim().slice(0, 10) || '棋手';
    const payload = msg.payload || {};
    const roomKey = String(payload.roomCode || '').slice(0, 64);
    if (!roomKey) return;
    const dedupKey = roomKey + ':' + idKey;
    if (raceSettled.has(dedupKey)) return; // #3 房间级去重（防换 roomKey 反复结算）
    raceSettled.add(dedupKey);
    if (raceSettled.size > 20000) { // 防止内存无限增长
        const first = raceSettled.values().next().value;
        if (first) raceSettled.delete(first);
    }
    // 2026-08-15 修复 #2：IP 新身份风控（对齐 lr/rtN 路径：仅拦截该 IP 下的"新身份"）
    if (ip && !raceBoard.has(idKey) && !checkIpNewIdentity(ip, idKey)) {
        console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${idKey} 的竞速结算`);
        sendSubmitResultBT(ws, false, 'rsc', { code: 'ip_banned', message: '当前网络环境异常，暂时无法提交' });
        return;
    }
    const place = Math.max(1, parseInt(payload.place, 10) || 1);
    const totalPlayers = Math.min(4, Math.max(2, parseInt(payload.totalPlayers, 10) || 2));
    const difficulty = Math.max(1, parseInt(payload.difficulty, 10) || 1);
    const stamina = Math.max(1, parseInt(payload.stamina, 10) || 1);
    const abandoned = !!payload.abandoned; // 主动退出/弃权：固定扣 30 分，不受难度/耐力倍率与低段位保护影响
    const p = raceBoard.get(idKey) || { idKey, playerId, userId: msg.userId || null, nickname, score: 0, games: 0, wins: 0, updatedAt: now };
    let delta;
    if (abandoned) {
        delta = -30;
    } else {
        delta = raceDelta(place, totalPlayers, p.games, difficulty, stamina);
        // 低段位保护：前几个等级（积分 < 300 未达「行星」段）正常输/垫底不扣分
        if (delta < 0 && p.score < RACE_PROTECT_SCORE) delta = 0;
    }
    p.score = Math.max(0, p.score + delta);
    p.nickname = nickname;
    p.games++;
    if (delta > 0) p.wins++;
    p.updatedAt = now;
    raceBoard.set(idKey, p);
    scheduleSave();
    sendSubmitResultBT(ws, true, 'rsc', {
        score: p.score,
        delta,
        games: p.games,
        wins: p.wins,
        tier: raceTier(p.score).name
    });
}

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
// 签名主密钥：原先硬编码明文，server/ 入库后会随仓库扩散（等同泄露）。
// 现改为：环境变量 FNCHESS_LB_SECRET > server/.lb-secret 文件 > 首次启动随机生成并落盘。
// .lb-secret 已在 .gitignore 中忽略，生产环境建议用环境变量注入。
const LB_SECRET = (function () {
    const env = process.env.FNCHESS_LB_SECRET;
    if (env && String(env).trim()) return String(env).trim();
    const secretFile = path.join(__dirname, '.lb-secret');
    try {
        const s = fs.readFileSync(secretFile, 'utf8').trim();
        if (s) return s;
    } catch (e) { /* 首次启动尚无文件，走下面生成分支 */ }
    const generated = crypto.randomBytes(32).toString('hex');
    try {
        fs.writeFileSync(secretFile, generated, { mode: 0o600 });
        console.log('[lb] 已生成签名密钥 server/.lb-secret（勿外传、勿入库）');
    } catch (e) {
        console.warn('[lb] 无法写入 .lb-secret，本次仅使用进程内随机密钥：' + e.message);
    }
    return generated;
})();
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

// ===== 阶段一：竞速权威计时会话（rtN 分关榜）=====
// raceSessionId -> { levelId, startTs, ws, expiresAt }（每关一个会话，一次性，上报后即删）
const raceSessions = new Map();
const RACE_SESSION_TTL = 10 * 60 * 1000; // 兜底 TTL：10 分钟
setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of raceSessions) {
        if (s.expiresAt < now) {
            if (s.ws && s.ws._raceSessionId === sid) s.ws._raceSessionId = null;
            raceSessions.delete(sid);
        }
    }
}, 60 * 1000);

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
    const re = /(sin|cos|tan|asin|acos|atan|abs|ln|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
    let n = 0, m;
    while ((m = re.exec(s)) !== null) n++;
    if (n === 0 && s.length > 0) n = s.length;
    return n;
}
/** 表达式是否使用了被锁元素（锁数字时按字符级检查） */
function usesLockedElement(expr, locked) {
    if (!locked || !locked.length) return false;
    const s = String(expr).replace(/\s+/g, '');
    const re = /(sin|cos|tan|asin|acos|atan|abs|ln|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
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
    // 会话签名密钥：由主密钥按「nonce + 连接标识」派生，随 nonce 一同下发。
    // 前端不再硬编码主密钥（旧客户端仍可用主密钥签名，见 verifySig 的双候选校验）。
    const connId = ws._connId || (ws._connId = Math.random().toString(36).slice(2) + Date.now().toString(36));
    ws._sigKey = hmacSHA256Hex(LB_SECRET, 'sigkey|' + nonce + '|' + connId);
    send(ws, { type: 'challenge', nonce, exp: ws._nonceExp, sigKey: ws._sigKey });
}
/**
 * 排行榜身份键（阶段3：主键 playerId → userId）。
 * 规则：已登录（带 userId）→ 'u' + userId（同一账号多设备共享排名）；
 *       未登录 / 老客户端（无 userId）→ 原样 playerId（行为与现状一致）。
 * 该键同时作为排行榜存储主键、签名锁定字段、isMe 判断依据。
 */
function identityKey(playerId, userId) {
    return userId ? 'u' + String(userId) : String(playerId);
}
// 从上报/查询消息取身份键（兼容老客户端无 userId）
function msgIdentity(msg) {
    return identityKey(String(msg.playerId || ''), msg.userId);
}

// 2026-08-15 修复 #68：verifySig 失败返回细分原因字符串（原只返回 false），便于客户端按 code 区分 nonce 过期/不匹配/签名错
function verifySig(ws, msg) {
    const nonce = String(msg.nonce || '');
    const fail = (reason, extra) => {
        console.warn(`[LB] verifySig FAIL: ${reason} | playerId=${String(msg.playerId || '').slice(0, 32)} boardType=${msg.boardType} value=${msg.value} | ${extra || ''}`);
        return reason;
    };
    if (!nonce) return fail('nonce_empty');
    if (!ws._nonce) return fail('ws_nonce_empty');
    if (Date.now() > (ws._nonceExp || 0)) return fail('nonce_expired', `now=${Date.now()} exp=${ws._nonceExp}`);
    if (nonce !== ws._nonce) return fail('nonce_mismatch', `got="${nonce.slice(0, 24)}..." ws="${String(ws._nonce).slice(0, 24)}..."`);
    ws._nonce = null; // 一次性
    const payload = msg.payload || {};
    const payloadJson = JSON.stringify(payload);
    const levelsHash = sha256Hex(bytesToLatin1(utf8Bytes(payloadJson)));
    // 阶段3：签名锁定"身份键"（登录用 'u'+userId，未登录/老客户端用 playerId），防止伪造 userId 刷到他人账号
    const sigId = msgIdentity(msg);
    const sigInput = [nonce, sigId, String(msg.boardType || ''), String(msg.value === undefined ? '' : msg.value), levelsHash].join('|');
    // 双候选：会话密钥（随 nonce 下发、可轮换）优先，主密钥仅用于兼容尚未升级的旧客户端。
    const candidates = [hmacSHA256Hex(LB_SECRET, sigInput)];
    if (ws._sigKey) candidates.push(hmacSHA256Hex(ws._sigKey, sigInput));
    const got = String(msg.sig || '');
    if (!candidates.some((e) => e.length === got.length)) {
        return fail('sig_length_diff', `got=${got.length} expected=${candidates[0].length} payload=${payloadJson.slice(0, 200)}`);
    }
    let ok = false;
    for (const exp of candidates) {
        if (exp.length !== got.length) continue;
        let diff = 0;
        for (let i = 0; i < exp.length; i++) diff |= (got.charCodeAt(i) ^ exp.charCodeAt(i));
        if (diff === 0) { ok = true; break; }
    }
    if (!ok) {
        return fail('sig_mismatch', `expected=${candidates[0].slice(0, 24)}... got=${got.slice(0, 24)}... sigInput="${sigInput.slice(0, 200)}" payload=${payloadJson.slice(0, 200)}`);
    }
    ws._sigKey = null; // 一次性：会话密钥随 nonce 一同作废
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
function updateCometBoards(idKey, playerId, nickname, minTokenMap, verifiedOnly) {
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
        const cur = board.get(idKey);
        if (!cur || minToken < cur.score) {
            board.set(idKey, { idKey, playerId, nickname, score: minToken, updatedAt: Date.now() });
            scheduleSave();
        }
    }
}

/** 目标玩家是否存在于 LR∑ 榜或任意彗星 pl* 分关榜（彗星数据由 lr 上报附带产生）；按身份键判断 */
function playerOnAnyBoard(idKey) {
    const lr = scoreBoards['lr'];
    if (lr && lr.has(idKey)) return true;
    for (const t of Object.keys(scoreBoards)) {
        if (/^pl\d+(?:\/\d+)?$/.test(t) && scoreBoards[t].has(idKey)) return true;
    }
    return false;
}

/** D6：玩家举报（90s 间隔，被举报者下次 lr 强制核验，失败清分，连带清理彗星榜） */
function handleReport(ws, msg) {
    const vres = verifySig(ws, msg);
    if (vres !== true) { sendSubmitResultBT(ws, false, 'lr', { code: vres || 'invalid_signature' }); return; }
    const target = String(msg.target || '').slice(0, 64);
    const playerId = String(msg.playerId || '').slice(0, 64);
    if (!target || !playerId || target === playerId) { sendSubmitResultBT(ws, false, 'lr', { code: 'bad_report' }); return; }
    // 阶段3：举报目标用身份键（榜单行返回 idKey 作为 data-target）
    const idKey = msgIdentity(msg);
    const targetIdKey = String(msg.targetIdKey || identityKey(target, msg.targetUserId));
    if (!targetIdKey || targetIdKey === idKey) { sendSubmitResultBT(ws, false, 'lr', { code: 'bad_report' }); return; }
    const now = Date.now();
    if (now - (lastReportAt.get(idKey) || 0) < REPORT_GATE) { sendSubmitResultBT(ws, false, 'lr', { code: 'rate_limited' }); return; }
    lastReportAt.set(idKey, now);
    if (!playerOnAnyBoard(targetIdKey)) { sendSubmitResultBT(ws, false, 'lr', { code: 'target_not_found' }); return; }
    flaggedForVerify.add(targetIdKey);
    console.log(`[LB] ${idKey} 举报 ${targetIdKey}（90s 间隔 OK），已标记强制核验`);
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
    const vres = verifySig(ws, msg);
    if (vres !== true) { resp(false, { code: vres || 'invalid_signature' }); return; }
    const playerId = String(msg.playerId || '').slice(0, 64);
    if (!playerId) { resp(false, { code: 'bad_request' }); return; }
    // 阶段3：清除以"身份键"为准（登录 'u'+userId，未登录 playerId）
    const idKey = msgIdentity(msg);
    const mode = String(msg.mode || '');
    if (mode !== 'campaign' && mode !== 'race') { resp(false, { code: 'bad_mode' }); return; }
    let removed = 0;
    for (const t of Object.keys(scoreBoards)) {
        let match = false;
        if (mode === 'race') match = /^rt\d+$/.test(t);
        else match = t === 'lr' || /^pl\d+(?:\/\d+)?$/.test(t);
        if (!match) continue;
        if (scoreBoards[t].delete(idKey)) removed++;
    }
    // 联机 ELO 不随本地进度清除（历史对局记录）；若确需同步清，另行决策
    if (removed > 0) {
        rebuildLevelBestTokens(); // 被删者可能持有该关最短 token，需重算全服最优
        scheduleSave();
    }
    console.log(`[LB] ${idKey} 清除排行榜成绩(mode=${mode})，删除 ${removed} 条记录`);
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

/**
 * 阶段3身份键兼容查询（2026-08-31 修复）：
 * 排行榜存储键 = 身份键（登录 'u'+userId，未登录裸 playerId），但大厅 / P2P 对局等场景
 * 仍可能以"裸 playerId"引用他人（如对手 ELO、房间成员段位），需双向匹配：
 *   1) 精确命中（键即该 id）→ 直接用；
 *   2) 键未命中 → 按记录 playerId 字段匹配（老数据/对手结算写入的裸键），
 *      多命中时优先账号键（'u' 开头）的记录，避免旧裸键残留覆盖。
 */
function lookupBoard(map, rawId) {
    const id = String(rawId || '');
    if (!id) return null;
    if (map.has(id)) return map.get(id);
    let match = null;
    for (const p of map.values()) {
        if (p && String(p.playerId || '') === id) {
            if (String(p.idKey || '').charAt(0) === 'u') return p; // 账号记录优先
            if (!match) match = p;
        }
    }
    return match;
}
function lookupElo(rawId) { return lookupBoard(eloBoard, rawId); }
function lookupRace(rawId) { return lookupBoard(raceBoard, rawId); }

/** 计算并更新双方 ELO（标准 ELO，K=32；winner: 'A'=idKey 胜, 'B'=对手胜, 'draw'）
 * 阶段3：主键用"身份键"（登录 'u'+userId，未登录 playerId）。
 * 2026-08-31 修复：双方记录按 lookup 双向匹配（裸 playerId ↔ 身份键），
 * 结算写回"实际存储键"并清理旧键，避免登录账号出现 ELO 双记录。 */
function updateElo(idKey, playerId, nickname, oppIdKey, oppPlayerId, opponentNickname, winner) {
    const now = Date.now();
    const existingA = lookupElo(idKey);
    const existingB = lookupElo(oppIdKey);
    const aKey = (existingA && existingA.idKey) || idKey;
    const bKey = (existingB && existingB.idKey) || oppIdKey;
    const getP = (id, existing, rawPlayerId, defaultNick) => {
        if (existing) return existing;
        return { idKey: id, playerId: rawPlayerId, nickname: defaultNick, elo: ELO_INIT, wins: 0, losses: 0, draws: 0, updatedAt: now };
    };
    const a = getP(aKey, existingA, playerId, nickname);
    const b = getP(bKey, existingB, oppPlayerId, opponentNickname);

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

    eloBoard.set(aKey, a);
    eloBoard.set(bKey, b);
    // 键归一：身份键与存储键不一致（历史裸 UUID 残留）时清理旧键，避免双记录
    if (aKey !== idKey) eloBoard.delete(idKey);
    if (bKey !== oppIdKey) eloBoard.delete(oppIdKey);
    scheduleSave();
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            const data = {
                savedAt: Date.now(),
                elo: [...eloBoard.values()],
                race: [...raceBoard.values()]
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
                for (const p of arr) if (p && (p.idKey || p.playerId)) eloBoard.set(String(p.idKey || p.playerId), p);
            } else if (t === 'race') {
                for (const p of arr) if (p && (p.idKey || p.playerId)) raceBoard.set(String(p.idKey || p.playerId), p);
            } else {
                const m = ensureBoard(t);
                for (const p of arr) if (p && (p.idKey || p.playerId)) m.set(String(p.idKey || p.playerId), p);
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

/**
 * 阶段3：把旧 UUID（playerId）名下的排行榜记录并入账号（userId 主键）。
 * 规则：找到所有主键 == uuid 的记录（老玩家 playerId 形如 'p_<uuid>'），
 *       迁移到 'u'+userId；若目标键已有记录则保留更优的（分数更高 / 用时更短）。
 * 该函数挂到 authRouter，供注册/登录绑定 UUID 时调用。
 */
function migrateUuidToUser(uuid, userId) {
    if (!uuid || !userId) return;
    const oldKey = String(uuid); // 老玩家 playerId 即 uuid（形如 p_xxx）
    const newKey = 'u' + String(userId);
    if (oldKey === newKey) return;
    let moved = 0;
    // 计分榜（lr / rtN / plN）
    for (const t of Object.keys(scoreBoards)) {
        const map = scoreBoards[t];
        const rec = map.get(oldKey);
        if (!rec) continue;
        const better = (a, b) => { // 更优：分数榜取高，用时榜(rt/pl)取低
            if (/^rt\d+$/.test(t) || /^pl\d+(?:\/\d+)?$/.test(t)) return b.score < a.score;
            return b.score > a.score;
        };
        const existing = map.get(newKey);
        if (!existing || better(rec, existing)) {
            map.set(newKey, Object.assign({}, rec, { idKey: newKey, userId }));
        }
        map.delete(oldKey);
        moved++;
    }
    // ELO 榜
    const e = eloBoard.get(oldKey);
    if (e) {
        const ee = eloBoard.get(newKey);
        if (!ee) eloBoard.set(newKey, Object.assign({}, e, { idKey: newKey, userId }));
        eloBoard.delete(oldKey);
        moved++;
    }
    // 竞速对战积分榜 rsc
    const r = raceBoard.get(oldKey);
    if (r) {
        const rr = raceBoard.get(newKey);
        if (!rr) raceBoard.set(newKey, Object.assign({}, r, { idKey: newKey, userId }));
        raceBoard.delete(oldKey);
        moved++;
    }
    if (moved > 0) {
        rebuildLevelBestTokens(); // 迁移可能影响全服最优 token
        scheduleSave();
        console.log(`[LB] UUID 并入账号：${oldKey} → ${newKey}，迁移 ${moved} 条记录`);
    }
}

// 挂载迁移函数到 authRouter，供注册/登录绑定 UUID 后调用
authRouter.migrateUuidToUser = migrateUuidToUser;

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

// —— 竞速权威计时：创建一次性会话（阶段一；无签名，配合频率限制防 Flood）——
function handleRaceStart(ws, msg) {
    // 回执统一带上请求 id：客户端按 id 配对（历史缺陷：不带 id 时客户端会直接丢弃回执，
    // 导致"竞速权威计时会话申请永远超时 → rtN 上报被拒 → 竞速分关榜为空"）
    const reqId = String(msg.id || '');
    // 未登录不上榜：匿名不发放竞速权威计时会话（无会话的 rtN 上报本就会被拒）
    if (!ws || !ws._userId) {
        send(ws, { type: 'race_start_result', ok: false, id: reqId, code: 'login_required' });
        return;
    }
    const levelId = Number(msg.levelId);
    if (!Number.isFinite(levelId) || levelId < 1 || levelId > 30) {
        send(ws, { type: 'race_start_result', ok: false, id: reqId, code: 'bad_level' });
        return;
    }
    const now = Date.now();
    // 防 Flood：同一连接每秒最多创建一次
    if (ws._lastRaceStart && now - ws._lastRaceStart < 1000) {
        send(ws, { type: 'race_start_result', ok: false, id: reqId, code: 'rate_limited' });
        return;
    }
    ws._lastRaceStart = now;
    // 每关一个会话：替换该连接上一个未上报的会话
    if (ws._raceSessionId) {
        raceSessions.delete(ws._raceSessionId);
        ws._raceSessionId = null;
    }
    const raceSessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    raceSessions.set(raceSessionId, { levelId, startTs: now, ws, expiresAt: now + RACE_SESSION_TTL });
    ws._raceSessionId = raceSessionId;
    send(ws, { type: 'race_start_result', ok: true, id: reqId, raceSessionId, serverTs: now });
}

function handleSubmitScore(ws, msg) {
    const boardType = String(msg.boardType || '');
    const playerId = String(msg.playerId || '').slice(0, 64);
    const nickname = String(msg.nickname || '棋手').trim().slice(0, 10) || '棋手';
    if (!playerId) return;
    // 未登录不上榜：所有榜单成绩（lr / rtN / plN / elo / rsc）都必须来自登录账号
    if (!ws || !ws._userId) {
        sendSubmitResultBT(ws, false, boardType, { code: 'login_required' });
        console.log(`[LB] 拒绝未登录上报：boardType=${boardType} playerId=${playerId}`);
        return;
    }
    const ip = ws && ws._ip ? ws._ip : '';
    const now = Date.now();
    // 阶段3：排行榜主键改用"身份键"（登录 'u'+userId，未登录 playerId）
    const idKey = msgIdentity(msg);

    // ── ELO：签名上报（防伪造 submit_score 刷 ELO；结算仍按 roomKey 去重） ──
    if (boardType === 'elo') {
        const vres = verifySig(ws, msg);
        if (vres !== true) { sendSubmitResultBT(ws, false, 'elo', { code: vres || 'invalid_signature' }); return; }
        const opponentId = String(msg.opponentPlayerId || '').slice(0, 64);
        if (!opponentId || opponentId === playerId) return;
        // 对手身份键（对手 userId 或 playerId）
        const oppIdKey = identityKey(opponentId, msg.opponentUserId);
        const roomKey = String(msg.roomCode || '').slice(0, 64);
        if (roomKey) {
            // —— 双向结果一致性核对（先登记本方战果，再判定是否结算）——
            // winner 口径：'A'=上报方自认胜、'B'=对手胜、其他=平；换算成「绝对胜者身份键」后与对端上报比对。
            const w = (msg.winner === 'A' || msg.winner === 'B') ? msg.winner : 'draw';
            const winnerAbs = w === 'A' ? idKey : w === 'B' ? oppIdKey : 'draw';
            const rec = eloReports.get(roomKey) || [];
            const counterpart = rec.find((r) => r.self === oppIdKey && r.opp === idKey);
            if (counterpart && counterpart.winnerAbs !== winnerAbs) {
                console.warn(`[LB][CHEAT] ELO 双向结果不一致 roomKey=${roomKey}：一方(${counterpart.self})声称胜者=${counterpart.winnerAbs}，另一方(${idKey})声称胜者=${winnerAbs} → 本次不再计分`);
                eloAnomaly.add(roomKey);
                sendSubmitResultBT(ws, true, 'elo', { code: 'result_mismatch' });
                return;
            }
            rec.push({ self: idKey, opp: oppIdKey, winnerAbs, ts: now });
            eloReports.set(roomKey, rec);
            if (eloReports.size > 5000) { const k = eloReports.keys().next().value; if (k) eloReports.delete(k); }

            if (eloSettled.has(roomKey)) return; // 该房间已结算
            eloSettled.add(roomKey);
            if (eloSettled.size > 20000) { // 防止内存无限增长
                const first = eloSettled.values().next().value;
                if (first) eloSettled.delete(first);
            }
        }
        const winner = (msg.winner === 'A' || msg.winner === 'B') ? msg.winner : 'draw';
        const opponentNickname = String(msg.opponentNickname || '棋手').trim().slice(0, 10) || '棋手';
        updateElo(idKey, playerId, nickname, oppIdKey, opponentId, opponentNickname, winner);
        // 2026-08-15 修复 #65：ELO 上报补回 submit_result，避免客户端串行上报时因无回执而 6s 超时阻塞
        sendSubmitResultBT(ws, true, 'elo', {});
        return;
    }

    // ── 竞速对战积分 rsc：签名上报（服务端权威计分 + 按 roomKey:playerId 去重，防多端重复结算） ──
    if (boardType === 'rsc') {
    handleRaceScore(ws, msg, ip);
    return;
    }

    // ── 计分榜（lr / rtN）：方案A 验签 + nonce + 闸门（tt 历史榜不再接受新上报） ──
    const isRaceTime = /^rt\d+$/.test(boardType);
    const isComet = /^pl\d+$/.test(boardType);
    if (!isRaceTime && !isComet && boardType !== 'lr') return;
    const vres = verifySig(ws, msg);
    if (vres !== true) { sendSubmitResultBT(ws, false, boardType, { code: vres || 'invalid_signature' }); return; }
    const value = Number(msg.value);
    if (!Number.isFinite(value) || value < 0) return;

    // 2026-08-31 修复：needVerify 用身份键判断（flaggedForVerify 以 idKey 存储，裸 playerId 会漏判已登录被举报者）
    const needV = boardType === 'lr' ? needVerify(idKey, value) : false;
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
                if (flaggedForVerify.has(idKey)) { // D6 被举报且核验失败 → 清分
                    const lrMap = scoreBoards['lr'];
                    if (lrMap) lrMap.delete(idKey);
                    // M2：连带清理该玩家在各彗星分关榜 pl* 的记录
                    for (const t of Object.keys(scoreBoards)) {
                        if (/^pl\d+(?:\/\d+)?$/.test(t)) scoreBoards[t].delete(idKey);
                    }
                    flaggedForVerify.delete(idKey);
                    scheduleSave();
                    console.log(`[LB] ${idKey} 被举报且核验失败(${res.reason}/${res.level})，已清分（含彗星榜）`);
                }
                sendSubmitResultBT(ws, false, 'lr', { code: 'verify_failed', reason: res.reason, level: res.level });
                return;
            }
            flaggedForVerify.delete(idKey);
            const map = ensureBoard('lr');
            const cur = map.get(idKey);
            if (!cur || res.recomputedSum > cur.score) {
                if (!cur && !checkIpNewIdentity(ip, idKey)) {
                    console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${idKey} 的上报`);
                    return;
                }
                map.set(idKey, { idKey, playerId, userId: msg.userId || null, nickname, score: res.recomputedSum, updatedAt: now });
                scheduleSave();
            }
            const minTokens = {};
            for (const lv of levels) if (lv.expr) minTokens[String(lv.level)] = Number(lv.minToken);
            updateCometBoards(idKey, playerId, nickname, minTokens, true); // 仅核验关更新全服最优
            sendSubmitResultBT(ws, true, 'lr', { score: res.recomputedSum });
            return;
        }
        // 签名通道：value 与 minTokens 均在签名内，信任入库
        const map = ensureBoard('lr');
        const cur = map.get(idKey);
        if (!cur || value > cur.score) {
            if (!cur && !checkIpNewIdentity(ip, idKey)) {
                console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${idKey} 的上报`);
                return;
            }
            map.set(idKey, { idKey, playerId, userId: msg.userId || null, nickname, score: value, updatedAt: now });
            scheduleSave();
        }
        updateCometBoards(idKey, playerId, nickname, payload.minTokens, false); // 签名通道不更新全服最优
        sendSubmitResultBT(ws, true, 'lr', { score: value });
        return;
    }

    // ── 竞速分关榜 rt{N}：签名 + 题数校验 + 难度下限（阶段一：服务端权威计时）──
    if (isRaceTime) {
        const levelId = Number(boardType.slice(2));
        if (!Number.isFinite(levelId) || levelId < 1 || levelId > 30) return; // 竞速共 30 关
        const solvedCount = Number(msg.solvedCount);
        const totalRounds = Number(msg.totalRounds);
        // L1：缺省（老客户端不带 / 传 0）视为 10 兼容；显式给了且不是 10 才拒（仍防"明确报不满题"）
        if ((Number.isFinite(solvedCount) && solvedCount > 0 && solvedCount !== RACE_PUZZLES) ||
            (Number.isFinite(totalRounds) && totalRounds > 0 && totalRounds !== RACE_PUZZLES)) return;
        // 阶段一：必须携带服务端下发的 raceSessionId，以服务端记录的开局时刻为权威基准。
        // 客户端本地 value 仅作兜底/展示，不参与排名（无会话 → 直接拒绝，强制走权威计时）。
        const raceSessionId = String((msg.payload && msg.payload.raceSessionId) || '');
        const session = raceSessions.get(raceSessionId);
        if (!session || session.ws !== ws || session.levelId !== levelId) {
            sendSubmitResultBT(ws, false, boardType, { code: 'no_session', level: levelId });
            return;
        }
        raceSessions.delete(raceSessionId); // 会话一次性，用完即删
        if (ws._raceSessionId === raceSessionId) ws._raceSessionId = null;
        const serverElapsed = (Date.now() - session.startTs) / 1000;
        if (serverElapsed > 1e6) return;
        // 权威用时低于关卡难度下限 → 判无效（含"极短用时"伪造；即便接近 0 也走此分支给明确响应）
        if (serverElapsed < raceFloorSeconds(levelId)) { sendSubmitResultBT(ws, false, boardType, { code: 'too_fast', level: levelId }); return; }
        const map = ensureBoard(boardType);
        const cur = map.get(idKey);
        if (!cur || serverElapsed < cur.score) {
            if (!cur && !checkIpNewIdentity(ip, idKey)) {
                console.warn(`[LB] IP ${ip} 疑似刷榜，忽略新身份 ${idKey} 的上报`);
                return;
            }
            map.set(idKey, { idKey, playerId, userId: msg.userId || null, nickname, score: serverElapsed, updatedAt: now });
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
    // 阶段3：查询者的身份键（登录 'u'+userId，未登录 playerId）
    const myIdKey = msgIdentity(msg);
    // 存储条目的身份键（老数据无 idKey 字段时按 playerId/userId 回退推导）
    const entryIdKey = (p) => (p && p.idKey) || identityKey(p && p.playerId, p && p.userId);

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
            isMe: entryIdKey(p) === myIdKey
        }));
        const meIdx = arr.findIndex((p) => entryIdKey(p) === myIdKey);
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

    // 竞速对战积分榜 rsc：按竞速积分降序（含胜场/局数/段位）
    if (boardType === 'rsc') {
        const arr = [...raceBoard.values()].sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
        const list = arr.slice(0, topFor('rsc')).map((p, i) => ({
            rank: i + 1,
            nickname: p.nickname,
            score: p.score,
            wins: p.wins,
            games: p.games,
            tier: raceTier(p.score).name,
            isMe: entryIdKey(p) === myIdKey
        }));
        const meIdx = arr.findIndex((p) => entryIdKey(p) === myIdKey);
        const inTop = meIdx >= 0 && meIdx < topFor('rsc');
        send(ws, {
            type: 'leaderboard_result',
            id: String(msg.id || ''),
            boardType,
            list,
            myRank: inTop ? meIdx + 1 : -1,
            myScore: meIdx === -1 ? 0 : arr[meIdx].score,
            // 无排位记录 → 未定段（而非按 0 分误判为最低段「流星体」）
            myTier: meIdx === -1 ? '未定段' : raceTier(arr[meIdx].score).name,
            myGames: meIdx === -1 ? 0 : arr[meIdx].games
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
        playerId: String(p.playerId),       // 供举报兼容（老字段）
        idKey: entryIdKey(p),                // 阶段3：举报/身份用身份键
        isMe: entryIdKey(p) === myIdKey
    }));
    const meIdx = arr.findIndex((p) => entryIdKey(p) === myIdKey);
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
            if (room.isRace && Array.isArray(room.guests)) {
                for (const g of room.guests) {
                    send(g.ws, { type: 'room_dissolved', code, reason: 'host_left' });
                }
            } else if (room.guestWs) {
                send(room.guestWs, { type: 'room_dissolved', code, reason: 'host_left' });
            }
            for (const sp of room.spectators) {
                send(sp, { type: 'spectate_ended', code, reason: 'host_left' });
            }
            room.spectators.clear();
            rooms.delete(code);
            console.log(`[Lobby] 房主断开，房间 ${code} 已清理${room.isRace ? `（竞速房 ${room.guests.length} 访客已通知）` : ''}`);
            try { broadcastOnlineStats(); } catch (e) { /* 忽略 */ }
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

/** 强制登录守卫：未登录连接执行联机动作时拒绝并回 auth_required */
function requireLobbyAuth(ws, action) {
    if (ws._userId) return true;
    send(ws, { type: 'auth_required', action: String(action || '') });
    return false;
}

lobbyWss.on('connection', (ws, req) => {
    // 记录来源 IP（排行榜刷榜风控用；不做身份主键）
    ws._ip = getClientIp(req);
    // 解析并校验登录令牌（强制登录才能联机）：token 由前端拼在 /lobby?token=xxx
    ws._userId = null;
    ws._nickname = '';
    try {
        const u = new URL(req.url || '/lobby', 'http://localhost');
        const tk = u.searchParams.get('token') || '';
        const uid = tk ? dbm.verifyToken(tk) : null;
        if (uid) {
            const user = dbm.findUserById(uid);
            if (user) { ws._userId = uid; ws._nickname = user.nickname || user.username || ''; }
        }
    } catch (e) { /* 忽略：视为未登录 */ }
    console.log('[Lobby] 客户端已连接' + (ws._ip ? `（IP ${ws._ip}）` : '') + (ws._userId ? `（账号 ${ws._userId}）` : '（未登录）'));

    // 排行榜签名：下发一次性 nonce
    try { issueNonce(ws); } catch (e) { /* 忽略 */ }
    // 立即回一帧在线统计，速览浮窗连接后无需等 5s
    try { send(ws, { type: 'online_stats', stats: computeOnlineStats() }); } catch (e) { /* 忽略 */ }

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!msg || !msg.type) return;

        switch (msg.type) {
            // 房主登记房间（建房进大厅列表）
            case 'host_register': {
                if (!requireLobbyAuth(ws, 'host_register')) break;
                cleanupHost(ws); // 同一连接重复登记时，先清旧房
                const longLived = !!(msg.options && msg.options.longLived);
                // 允许客户端指定房间码（竞速房 PeerJS 码即 Lobby 码）
                const clientCode = msg.options && msg.options.roomCode ? String(msg.options.roomCode) : '';
                const isValidClientCode = /^\d{6}$/.test(clientCode) && !rooms.has(clientCode);
                const code = isValidClientCode ? clientCode : genRoomCode(longLived);
                const expiresAt = Date.now() + (longLived ? ROOM_TTL_LONG : ROOM_TTL_DEFAULT);
                // 竞速对战房（2-4 人多人房）：mode 以 'race' 开头（race / race_ranked / race_casual），
                // 与 1v1 的 casual/ranked 完全隔离，且排位/休闲竞速房互不可见
                const isRace = !!(msg.options && typeof msg.options.mode === 'string' && msg.options.mode.indexOf('race') === 0);
                const maxPlayers = isRace
                    ? Math.min(4, Math.max(2, parseInt(msg.options && msg.options.maxPlayers, 10) || 4))
                    : 2;
                // 允许观战默认开启：仅当显式 allowSpectate === false 时关闭（竞速房强制关闭）
                const spectateEnabled = isRace ? false : !(msg.options && msg.options.allowSpectate === false);
                // 房主身份与 ELO：ELO 距离过滤以房主 ELO 为基准（从 eloBoard 实时取，最权威）
                // 2026-08-31 修复：身份键兼容查询（登录账号记录在 'u'+userId 键，裸 playerId 查不到）
                const hostPlayerId = String(msg.playerId || '').slice(0, 64);
                const hostEloEntry = hostPlayerId ? lookupElo(hostPlayerId) : null;
                const hostElo = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                // ELO 距离过滤阈值：仅排位房间可设置（>0 开启，超出范围的玩家不可见/不可加入）
                const rawRange = Number(msg.eloRange);
                const eloRange = isFinite(rawRange) && rawRange > 0 ? rawRange : null;
                // 竞速段位：房主竞速分数（raceBoard）→ 天体段位名，供大厅显示与"仅同段位可见"过滤
                // 无排位记录（从未打过竞速排位）→ 未定段，而非按 0 分误判为最低段「流星体」
                const hostRaceEntry = hostPlayerId ? lookupRace(hostPlayerId) : null;
                const hostTier = isRace ? (hostRaceEntry && hostRaceEntry.score != null ? raceTier(hostRaceEntry.score).name : '未定段') : null;
                // 仅同段位可见（竞速房可开启）：非同段位访客不可见/不可加入
                const tierOnly = isRace && !!(msg.tierOnly);
                rooms.set(code, {
                    code,
                    options: msg.options || {},
                    hostWs: ws,
                    guestWs: null,
                    isRace,
                    maxPlayers,
                    // 竞速房：多访客列表（每个元素 { ws, playerId, nickname }）；1v1 房保持 null 不动
                    guests: isRace ? [] : null,
                    status: 'waiting',
                    spectateEnabled,
                    spectators: new Set(),
                    createdAt: Date.now(),
                    expiresAt,
                    longLived,
                    hostPlayerId,
                    // 房主账号 id：用于拦截"同一账号自己和自己联机/竞速/观战"
                    hostUserId: ws._userId || null,
                    hostElo,
                    eloRange,
                    hostTier,
                    tierOnly,
                    hostNickname: String(ws._nickname || msg.nickname || '').slice(0, 10)
                });
                send(ws, { type: 'host_registered', code, expiresAt });
                broadcastOnlineStats();
                console.log(`[Lobby] 房主登记房间 ${code}（${longLived ? '长效 30 分钟' : '5 分钟'}, 观战${spectateEnabled ? '开启' : '关闭'}${isRace ? `, 竞速 ${maxPlayers} 人房` : ''}）`, msg.options || {});
                break;
            }

            // 房主取消登记（退出等待）——回 ack 确认已删除，客户端据此确认房间确实不在服务器
            case 'cancel_register': {
                const code = String(msg.code || '');
                // 只有房主本人（或同账号的另一端）能取消该房间，避免任意客户端删别人的房
                const cancelRoom = rooms.get(code);
                if (cancelRoom && cancelRoom.hostWs !== ws
                    && !(cancelRoom.hostUserId && ws._userId && String(cancelRoom.hostUserId) === String(ws._userId))) break;
                rooms.delete(code);
                send(ws, { type: 'cancel_register_ack', code, ok: true });
                console.log(`[Lobby] 房主取消登记 ${code}`);
                break;
            }

            // 访客拉取房间列表（等待中的房间 + 对局中且开启观战的房间）
            // mode 过滤：休闲玩家看不到排位房间，反之亦然（未标记模式的老房间按排位处理）
            // ELO 过滤：房主开启 ELO 距离过滤的房间，距房主 ELO 太远的访客不可见
            case 'list_rooms': {
                const now = Date.now();
                const modeFilter = (msg.mode === 'casual' || msg.mode === 'ranked' || msg.mode === 'race' ||
                    msg.mode === 'race_ranked' || msg.mode === 'race_casual') ? msg.mode : null;
                const visitorId = String(msg.playerId || '').slice(0, 64);
                const visitorEloEntry = visitorId ? lookupElo(visitorId) : null;
                const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                // 访客竞速段位：tierFilter='same'（仅同段位可见）时按访客段位过滤
                // 无排位记录 → 未定段，避免与真实 0 分「流星体」混淆
                const visitorRaceEntry = visitorId ? lookupRace(visitorId) : null;
                const visitorTierName = visitorRaceEntry && visitorRaceEntry.score != null ? raceTier(visitorRaceEntry.score).name : '未定段';
                const tierFilter = msg.tierFilter === 'same';
                const list = [];
                for (const [code, room] of rooms) {
                    if (room.expiresAt && now >= room.expiresAt) {
                        rooms.delete(code);
                        continue;
                    }
                    // 自己的房间仍然下发（自己创建的房间自己能看到），只标记 isMine →
                    // 前端把「加入/观战」置灰并提示；真正加入会被 join_request / spectate_join 拦截
                    const isMine = room.hostWs === ws
                        || (room.hostUserId && ws._userId && String(room.hostUserId) === String(ws._userId))
                        || (room.hostPlayerId && visitorId && String(room.hostPlayerId) === String(visitorId));
                    const isWaiting = room.status === 'waiting';
                    const isPlaying = room.status === 'playing';
                    // 等待中的房间 + 对局中的房间都返回（用于大厅速览统计进行中数量）；
                    // 非观战对局也一并下发但带 spectateEnabled=false，前端不展示为可加入/可观战
                    if (!isWaiting && !isPlaying) continue;
                    if (modeFilter) {
                        const roomMode = (room.options && room.options.mode) || 'ranked';
                        if (roomMode !== modeFilter) continue;
                    }
                    // 房主当前 ELO：实时从 eloBoard 取（房间登记后再打排位赛会变动，显示/过滤都用最新值）
                    const hostEloEntry = room.hostPlayerId ? lookupElo(room.hostPlayerId) : null;
                    const hostEloNow = hostEloEntry && hostEloEntry.elo != null ? hostEloEntry.elo : ELO_INIT;
                    // ELO 距离过滤：开启过滤的房间，访客 ELO 距房主超过阈值 → 不可见
                    if (room.eloRange) {
                        if (!visitorId) continue; // 无法校验身份 → 保守隐藏
                        if (Math.abs(hostEloNow - visitorElo) > room.eloRange) continue;
                    }
                    // 竞速段位过滤（双层）：
                    //   1) 房主开启"仅同段位可见"（tierOnly）→ 非同段位访客不可见
                    //   2) 访客开启"仅同段位可见"（tierFilter='same'）→ 只显示与访客同段位的房间
                    let hostTierNow = null;
                    if (room.isRace) {
                        const hostRaceEntry = room.hostPlayerId ? lookupRace(room.hostPlayerId) : null;
                        hostTierNow = hostRaceEntry && hostRaceEntry.score != null ? raceTier(hostRaceEntry.score).name : '未定段';
                        if (room.tierOnly || tierFilter) {
                            if (!visitorId) continue; // 无法校验身份 → 保守隐藏
                            if (hostTierNow !== visitorTierName) continue;
                        }
                    }
                    const guestCount = room.isRace && Array.isArray(room.guests) ? room.guests.length : (room.guestWs ? 1 : 0);
                    list.push({
                        code: room.code,
                        options: room.options,
                        createdAt: room.createdAt,
                        expiresAt: room.expiresAt,
                        status: room.status,
                        spectateEnabled: !!room.spectateEnabled,
                        spectatorCount: room.spectators ? room.spectators.size : 0,
                        hostElo: hostEloNow,
                        hostTier: hostTierNow,
                        hostNickname: room.hostNickname || '',
                        isRace: !!room.isRace,
                        maxPlayers: room.maxPlayers || 2,
                        currentPlayers: 1 + guestCount,
                        // 是否是我自己创建的房间（前端据此置灰「加入/观战」）
                        mine: !!isMine
                    });
                }
                send(ws, { type: 'rooms_list', rooms: list });
                break;
            }

            // 拉取全服喊话历史（速览浮窗连接后拉取，或对局空闲时主动刷新）
            case 'fetch_shouts': {
                send(ws, { type: 'shout_list', shouts: shoutHistory.slice(-SHOUT_HISTORY_MAX) });
                break;
            }

            // 全服喊话：字数限制 + 每玩家长冷却（防刷屏、防信息量爆炸）
            case 'shout': {
                if (!requireLobbyAuth(ws, 'shout')) break;
                const text = String(msg.text || '').trim().slice(0, SHOUT_MAX_LEN);
                if (!text) break;
                const playerId = String(msg.playerId || '').slice(0, 64);
                const nickname = String(ws._nickname || msg.nickname || '匿名').slice(0, 10);
                const now = Date.now();
                // 冷却校验（按身份，未提供身份则按连接 IP 限流兜底）
                const key = playerId || (ws._ip || '');
                const lastTs = key ? lastShoutAt.get(key) : 0;
                if (lastTs && (now - lastTs) < SHOUT_COOLDOWN_MS) {
                    send(ws, { type: 'shout_rejected', reason: 'cooldown', retryAfter: Math.ceil((SHOUT_COOLDOWN_MS - (now - lastTs)) / 1000) });
                    break;
                }
                if (key) lastShoutAt.set(key, now);
                const entry = { playerId, nickname, text, ts: now };
                pushShout(entry);
                console.log(`[Shout] ${nickname}: ${text}`);
                broadcastShout(entry);
                break;
            }

            // 房间码查询：返回该房间是否存在及其模式（isRace 竞速联机房）。
            // 同时查「大厅登记表 rooms」与「在线 PeerJS id」：
            //   - 裸房间码在线 = 1v1 对战房（P2PController 房主 id = 房间码）
            //   - race_<房间码> 在线 = 竞速房（RaceRoomController 房主 id = race_<房间码>）
            // 供联机对战访客在输入房间码时校验是否误连竞速房间 → 客户端提示模式不对
            case 'room_lookup': {
                const code = String(msg.code || '');
                const room = rooms.get(code);
                const p2pOnline = onlinePeerIds.has(code);
                const raceOnline = onlinePeerIds.has('race_' + code);
                send(ws, {
                    type: 'room_lookup_result',
                    code,
                    found: !!room || p2pOnline || raceOnline,
                    isRace: !!(room && room.isRace) || raceOnline,
                    isP2P: p2pOnline,
                    mode: room ? ((room.options && room.options.mode) || 'ranked') : null
                });
                break;
            }

            // 访客申请加入（校验模式匹配：休闲/排位不能混搭）
            case 'join_request': {
                if (!requireLobbyAuth(ws, 'join_request')) break;
                const room = rooms.get(String(msg.code));
                if (!room) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_not_available' });
                    return;
                }
                // ── 同账号自联机拦截（1v1 与竞速共用）：自己不能加入自己的房间 ──
                //   ① 同一连接；② 同一账号的另一端（userId 由 token 校验得出，最可靠）；
                //   ③ 兜底：同一设备 UUID（不同账号但同一浏览器）
                if (room.hostWs === ws) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'self_join' });
                    return;
                }
                if (room.hostUserId && ws._userId && String(room.hostUserId) === String(ws._userId)) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'same_account' });
                    return;
                }
                if (room.hostPlayerId && msg.playerId && String(room.hostPlayerId) === String(msg.playerId)) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'same_device' });
                    return;
                }
                if (msg.mode === 'casual' || msg.mode === 'ranked' || msg.mode === 'race' ||
                    msg.mode === 'race_ranked' || msg.mode === 'race_casual') {
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
                // 竞速房：多访客加入（满员校验、不锁状态，保持 waiting 以便继续加人）
                if (room.isRace) {
                    if (Array.isArray(room.guests) && room.guests.length >= room.maxPlayers - 1) {
                        send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_full' });
                        return;
                    }
                    // 防重复：同一连接重复 join_request 视为重复加入；
                    // 同账号/同设备的另一端也不能重复加入同一竞速房（自联机拦截）
                    if (room.guests && room.guests.some(g => g.ws === ws
                        || (g.userId && ws._userId && String(g.userId) === String(ws._userId))
                        || (g.playerId && msg.playerId && String(g.playerId) === String(msg.playerId)))) {
                        send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'already_joined' });
                        return;
                    }
                    // 仅同段位可见：房主开启 tierOnly → 非同段位访客拒绝加入
                    // 无排位记录 → 未定段（而非按 0 分误判为最低段「流星体」），未定段之间可互加
                    if (room.tierOnly) {
                        const visitorId = String(msg.playerId || '').slice(0, 64);
                        const vRace = visitorId ? lookupRace(visitorId) : null;
                        const vTier = vRace && vRace.score != null ? raceTier(vRace.score).name : '未定段';
                        const hRace = room.hostPlayerId ? lookupRace(room.hostPlayerId) : null;
                        const hTier = hRace && hRace.score != null ? raceTier(hRace.score).name : '未定段';
                        if (!visitorId || vTier !== hTier) {
                            send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'tier_mismatch' });
                            return;
                        }
                    }
                    const guestPlayerId = String(msg.playerId || '').slice(0, 64);
                    const guestNickname = String(msg.nickname || '').slice(0, 10);
                    room.guests.push({ ws, playerId: guestPlayerId, nickname: guestNickname, userId: ws._userId || null });
                    send(room.hostWs, {
                        type: 'guest_joining',
                        code: room.code,
                        playerId: guestPlayerId,
                        nickname: guestNickname,
                        currentPlayers: 1 + room.guests.length,
                        maxPlayers: room.maxPlayers
                    });
                    send(ws, { type: 'join_accepted', code: room.code, maxPlayers: room.maxPlayers });
                    console.log(`[Lobby] 竞速访客加入 ${room.code}（${1 + room.guests.length}/${room.maxPlayers} 人）`);
                    break;
                }
                // ELO 距离过滤：房主开启过滤的房间，访客 ELO 距房主超过阈值 → 拒绝加入
                if (room.eloRange) {
                    const visitorId = String(msg.playerId || '').slice(0, 64);
                    const visitorEloEntry = visitorId ? lookupElo(visitorId) : null;
                    const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                    const hostEloEntry = room.hostPlayerId ? lookupElo(room.hostPlayerId) : null;
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
                if (!room) break;
                if (room.isRace && Array.isArray(room.guests)) {
                    const idx = room.guests.findIndex(g => g.ws === ws);
                    if (idx !== -1) {
                        const removed = room.guests.splice(idx, 1)[0];
                        send(room.hostWs, {
                            type: 'guest_left',
                            code: room.code,
                            playerId: removed.playerId,
                            nickname: removed.nickname,
                            currentPlayers: 1 + room.guests.length,
                            maxPlayers: room.maxPlayers
                        });
                        console.log(`[Lobby] 竞速访客取消加入 ${room.code}（${1 + room.guests.length}/${room.maxPlayers} 人）`);
                    }
                } else if (room.status === 'joining' && room.guestWs === ws) {
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
                    broadcastOnlineStats();
                }
                break;
            }

            // 房主迁移：新房主接管房间，移交 hostWs（防止旧房主断开时误删房间）
            case 'host_transfer': {
                const room = rooms.get(String(msg.code));
                if (!room) break;
                if (!room.isRace || !Array.isArray(room.guests)) break; // 仅竞速房
                const gi = room.guests.findIndex(g => g.ws === ws);
                if (gi === -1) break; // 仅限当前房间的访客升级
                const oldHostWs = room.hostWs;
                room.hostWs = ws;
                room.hostPlayerId = msg.playerId ? String(msg.playerId) : room.hostPlayerId;
                room.hostNickname = msg.nickname ? String(msg.nickname).slice(0, 10) : room.hostNickname;
                room.guests.splice(gi, 1); // 新房主不再是访客
                // 清理旧房主残留在访客列表中的连接（重入被拒后已断开）
                room.guests = room.guests.filter(g => g.ws !== oldHostWs);
                console.log(`[Lobby] 房主迁移 ${room.code}：${room.hostNickname} 接管房间（${1 + room.guests.length}/${room.maxPlayers} 人）`);
                send(ws, { type: 'host_transferred', code: room.code });
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
                if (!requireLobbyAuth(ws, 'spectate_join')) break;
                const code = String(msg.code);
                const room = rooms.get(code);
                if (!room) {
                    send(ws, { type: 'spectate_join_rejected', code, reason: 'spectate_not_allowed' });
                    return;
                }
                // 不能观战自己所在的房间：同连接 / 同账号另一端 / 同设备（自联机拦截的观战侧）
                // 先于"房间状态"判断，保证自己房间给出明确原因
                const selfInRoom = room.hostWs === ws || room.guestWs === ws
                    || (room.hostUserId && ws._userId && String(room.hostUserId) === String(ws._userId))
                    || (room.hostPlayerId && msg.playerId && String(room.hostPlayerId) === String(msg.playerId))
                    || (Array.isArray(room.guests) && room.guests.some(g => g.ws === ws
                        || (g.userId && ws._userId && String(g.userId) === String(ws._userId))));
                if (selfInRoom) {
                    send(ws, { type: 'spectate_join_rejected', code, reason: 'self_spectate' });
                    return;
                }
                if (room.status !== 'playing' || !room.spectateEnabled) {
                    send(ws, { type: 'spectate_join_rejected', code, reason: 'spectate_not_allowed' });
                    return;
                }
                // ELO 距离过滤同样约束观战：距房主太远的观众不可观战（与列表不可见保持一致）
                if (room.eloRange) {
                    const visitorId = String(msg.playerId || '').slice(0, 64);
                    const visitorEloEntry = visitorId ? lookupElo(visitorId) : null;
                    const visitorElo = visitorEloEntry && visitorEloEntry.elo != null ? visitorEloEntry.elo : ELO_INIT;
                    const hostEloEntry = room.hostPlayerId ? lookupElo(room.hostPlayerId) : null;
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

            // 观众发表情 → 转发给该房间对战双方（房主/访客）与其他观众
            case 'spectate_emoji': {
                const mood = String(msg.mood || '');
                const moods = ['neutral', 'thinking', 'smug', 'happy', 'surprised', 'sad', 'angry', 'determined', 'exhausted'];
                if (moods.indexOf(mood) === -1) break;
                for (const [code, room] of rooms) {
                    if (room.spectators && room.spectators.has(ws)) {
                        const out = { type: 'spectate_emoji_from_viewer', code, mood };
                        if (room.hostWs) send(room.hostWs, out);
                        if (room.guestWs) send(room.guestWs, out);
                        for (const sp of room.spectators) {
                            if (sp !== ws) send(sp, out);
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

            // 竞速权威计时：创建一次性会话（阶段一）→ race_start_result
            case 'race_start': {
                try { handleRaceStart(ws, msg); } catch (e) { console.warn('[LB] race_start 处理异常:', e.message); }
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

            // 房主主动解散房间（对局中/等待中退出）：通知对战方与观众，房间作废，并回 ack 确认删除
            case 'room_dissolve': {
                try {
                    let dissolvedCode = '';
                    for (const [code, room] of rooms) {
                        if (room.hostWs === ws) {
                            if (room.isRace && Array.isArray(room.guests)) {
                                for (const g of room.guests) {
                                    send(g.ws, { type: 'room_dissolved', code, reason: 'host_dissolved' });
                                }
                            } else if (room.guestWs) {
                                send(room.guestWs, { type: 'room_dissolved', code, reason: 'host_dissolved' });
                            }
                            for (const sp of room.spectators) {
                                send(sp, { type: 'spectate_ended', code, reason: 'host_dissolved' });
                            }
                            room.spectators.clear();
                            rooms.delete(code);
                            dissolvedCode = code;
                            console.log(`[Lobby] 房主主动解散房间 ${code}（${room.isRace ? `竞速房 ${room.guests.length} 访客已通知` : ''}）`);
                            break;
                        }
                    }
                    // 无论是否找到房间都回 ack（幂等：找不到也视为已删除），客户端据此确认房间确实不在服务器
                    send(ws, { type: 'room_dissolve_ack', code: dissolvedCode, ok: true });
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
                        // 2026-08-31 修复：身份键兼容查询（登录账号记录在 'u'+userId 键）
                        const p = lookupElo(id);
                        players[id] = p
                            ? { elo: p.elo, nickname: p.nickname, wins: p.wins, losses: p.losses, draws: p.draws }
                            : { elo: ELO_INIT, nickname: '棋手', wins: 0, losses: 0, draws: 0 };
                    }
                    send(ws, { type: 'player_elo_result', id: String(msg.id || ''), players });
                } catch (e) { console.warn('[LB] query_player_elo 处理异常:', e.message); }
                break;
            }

            // 排行榜：批量查询玩家竞速段位（竞速房成员段位徽章）→ player_race_rank_result
            case 'query_player_race_rank': {
                try {
                    const ids = (Array.isArray(msg.playerIds) ? msg.playerIds : [])
                        .map((id) => String(id).slice(0, 64)).filter(Boolean);
                    const players = {};
                    for (const id of ids) {
                        // 2026-08-31 修复：身份键兼容查询（登录账号记录在 'u'+userId 键）
                        const p = lookupRace(id);
                        // 无排位记录（从未打过竞速排位）→ 未定段，而非按 0 分误判为最低段「流星体」
                        if (p && p.score != null) {
                            players[id] = { score: p.score, tier: raceTier(p.score).name };
                        } else {
                            players[id] = { score: 0, tier: '未定段' };
                        }
                    }
                    send(ws, { type: 'player_race_rank_result', id: String(msg.id || ''), players });
                } catch (e) { console.warn('[LB] query_player_race_rank 处理异常:', e.message); }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[Lobby] 客户端断开');
        // 阶段一：断开即清理其竞速权威计时会话，避免内存泄漏
        if (ws._raceSessionId) {
            raceSessions.delete(ws._raceSessionId);
            ws._raceSessionId = null;
        }
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
            // 竞速房：访客断开 → 从 guests 列表移除并通知房主
            if (room.isRace && Array.isArray(room.guests)) {
                const idx = room.guests.findIndex(g => g.ws === ws);
                if (idx !== -1) {
                    const removed = room.guests.splice(idx, 1)[0];
                    send(room.hostWs, {
                        type: 'guest_left',
                        code: room.code,
                        playerId: removed.playerId,
                        nickname: removed.nickname,
                        currentPlayers: 1 + room.guests.length,
                        maxPlayers: room.maxPlayers
                    });
                    console.log(`[Lobby] 竞速访客断开，房间 ${room.code}（${1 + room.guests.length}/${room.maxPlayers} 人）`);
                }
            }
        }
        cleanupHost(ws);
        try { broadcastOnlineStats(); } catch (e) { /* 忽略 */ }
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
