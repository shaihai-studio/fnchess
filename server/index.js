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
    proxied: false,
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

/** 若该连接是某房间的房主，移除其房间并通知观众 */
function cleanupHost(ws) {
    for (const [code, room] of rooms) {
        if (room.hostWs === ws) {
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

lobbyWss.on('connection', (ws) => {
    console.log('[Lobby] 客户端已连接');

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
                    longLived
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
            case 'list_rooms': {
                const now = Date.now();
                const list = [];
                for (const [code, room] of rooms) {
                    if (room.expiresAt && now >= room.expiresAt) {
                        rooms.delete(code);
                        continue;
                    }
                    const isWaiting = room.status === 'waiting';
                    const isSpectatable = room.status === 'playing' && room.spectateEnabled;
                    if (!isWaiting && !isSpectatable) continue;
                    list.push({
                        code: room.code,
                        options: room.options,
                        createdAt: room.createdAt,
                        expiresAt: room.expiresAt,
                        status: room.status,
                        spectatorCount: room.spectators ? room.spectators.size : 0
                    });
                }
                send(ws, { type: 'rooms_list', rooms: list });
                break;
            }

            // 访客申请加入
            case 'join_request': {
                const room = rooms.get(String(msg.code));
                if (!room) {
                    send(ws, { type: 'join_rejected', code: String(msg.code), reason: 'room_not_available' });
                    return;
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

server.listen(PORT, HOST, () => {
    console.log(`✅ 函数棋 P2P 信令 + 大厅服务器已启动: http://localhost:${PORT}`);
    console.log(`   PeerJS 信令: http://localhost:${PORT}/peerjs`);
    console.log(`   匹配大厅 WebSocket: ws://localhost:${PORT}/lobby`);
    console.log(`   前端配置: files/js/P2PController.js → P2PController.signaling`);
});
