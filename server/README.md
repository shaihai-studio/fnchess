# 函数棋 P2P 信令 + 匹配大厅服务器

本地/局域网/公网联机对战所需的服务端。包含两部分：

1. **PeerJS 信令服务**（`/peerjs`）—— WebRTC 连接握手
2. **匹配大厅**（`/lobby`）—— 房间列表式大厅：
   - 房主登记房间（带 难度/回合/时间限制 配置）→ 房间进入等待列表
   - 访客拉取列表、点击房间加入 → 双方建立 P2P 对战（取房主配置）

两者共用同一端口（默认 9000），通过路径区分。

## 快速启动

```bash
cd server
npm install
npm start
```

启动后访问 `http://localhost:9000` 确认服务正常。

## 联机测试流程

### 房间码模式（原有）

1. 启动本服务器
2. 打开 `index.html`，进入「对战模式 → 联机」
3. 玩家A 点击「创建房间」获取房间码
4. 玩家B 输入房间码点击「加入房间」
5. 双方连接后即可对战

### 匹配大厅模式（新增）

1. 启动本服务器
2. 玩家A 进入「联机对战 → 匹配大厅」，点击「创建房间（进大厅）」，房间进入等待列表
3. 玩家B 进入「匹配大厅」，房间列表会显示 A 的房间（难度/回合/时间限制）
4. 玩家B 点击「加入」→ 服务器通知 A，双方自动建立连接并按房主配置开局

## 跨互联网部署

将本目录部署到公网服务器（如云主机）即可。前端已默认指向自托管服务器：

- 信令服务器地址：`http://p2p.shaihai.cn/`（端口 80，明文 HTTP）
- 前端配置位于 `files/js/P2PController.js` 的 `P2PController.signaling`，
  也可通过 `index.html` 中的 `window.P2P_SIGNALING` 覆盖，例如：

```javascript
window.P2P_SIGNALING = {
    host: '你的公网域名或IP',
    port: 9000,
    secure: true,   // 若用 HTTPS/TLS 则设为 true
    debug: 0
};
```

大厅 WebSocket 地址由前端从 `P2PController.signaling` 自动派生：
`ws(s)://<host>:<port>/lobby`，与信令共用端口，无需额外开放端口。

### 反向代理注意事项

若使用 Nginx 等反向代理把 80 端口转发到 9000 端口，必须确保 WebSocket 升级请求
（`Upgrade: websocket` 头）也能被代理，否则 P2P 信令与大厅都无法连接。常见配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

## 说明

- 大厅为**内存态**：房间在房主断开或开局后自动清理，服务器重启后列表清空
- 信令服务器只负责交换连接元数据，游戏数据（函数表达式、网格状态）为 P2P 直连传输
- STUN 使用公共服务器（Cloudflare / 腾讯 / 小米），无 TURN 中继，适用于大多数 NAT 环境
- 若处于对称型 NAT 环境无法直连，需额外部署 TURN 服务器
