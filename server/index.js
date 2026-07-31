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
 *    - 房主 host_register 登记房间（带 难度/回合/时间限制 配置）
 *    - 访客 list_rooms 拉取列表、join_request 申请加入
 *    - 房主 guest_joining 收到有人加入通知
 *    - room_started / cancel_register / host 断开 自动清理房间
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
 * Map<code, { code, options, hostWs, guestWs, status, createdAt }>
 * status: 'waiting' | 'joining'
 */
const rooms = new Map();

function genRoomCode() {
    let code;
    do {
        code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    } while (rooms.has(code));
    return code;
}

function send(ws, obj) {
    if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
    }
}

/** 若该连接是某房间的房主，移除其房间 */
function cleanupHost(ws) {
    for (const [code, room] of rooms) {
        if (room.hostWs === ws) {
            rooms.delete(code);
            console.log(`[Lobby] 房主断开，房间 ${code} 已清理`);
        }
    }
}

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
                const code = genRoomCode();
                rooms.set(code, {
                    code,
                    options: msg.options || {},
                    hostWs: ws,
                    guestWs: null,
                    status: 'waiting',
                    createdAt: Date.now()
                });
                send(ws, { type: 'host_registered', code });
                console.log(`[Lobby] 房主登记房间 ${code}`, msg.options || {});
                break;
            }

            // 房主取消登记（退出等待）
            case 'cancel_register': {
                rooms.delete(String(msg.code));
                console.log(`[Lobby] 房主取消登记 ${msg.code}`);
                break;
            }

            // 访客拉取房间列表
            case 'list_rooms': {
                const list = [];
                for (const room of rooms.values()) {
                    if (room.status !== 'waiting') continue;
                    list.push({ code: room.code, options: room.options, createdAt: room.createdAt });
                }
                send(ws, { type: 'rooms_list', rooms: list });
                break;
            }

            // 访客申请加入
            case 'join_request': {
                const room = rooms.get(String(msg.code));
                if (!room || room.status !== 'waiting') {
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

            // 房间开局（任一方上报即移除）
            case 'room_started': {
                if (rooms.delete(String(msg.code))) {
                    console.log(`[Lobby] 房间 ${msg.code} 开局，已从列表移除`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[Lobby] 客户端断开');
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
