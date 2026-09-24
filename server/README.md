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

## 跨互联网部署（自建）

完整步骤见 **`server/DEPLOY.md`**，环境变量空白清单见 **`server/.env.example`**，
Nginx 反代示例见 **`server/Nginx/nginx.conf.example`**。

> ⚠️ **前端默认指向的是作者自建的服务器**（`P2PController.signaling` 中的 `p2p2.shaihai.cn:24026`）。
> 自建后必须改成你自己的地址，否则你的服务器不会被使用。

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

自建要点速览：

| 要改的地方 | 在哪 |
|---|---|
| 端口 / 监听地址 | `.env.example` → `P2P_PORT` / `P2P_HOST` |
| 跨域白名单 | `.env.example` → `FNCHESS_ALLOWED_ORIGINS` |
| 排行榜签名密钥 | `.env.example` → `FNCHESS_LB_SECRET`（留空会自动生成 `server/.lb-secret`） |
| TURN 中继（可选） | `.env.example` → `FNCHESS_TURN_HOST` / `FNCHESS_TURN_SECRET` |
| 前端指向哪台服务器 | `files/js/P2PController.js` 或 `index.html` 的 `window.P2P_SIGNALING` |
| Nginx 反代 | 参考 `Nginx/nginx.conf.example`（**WebSocket 升级头不能缺**） |

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

## 在线排行榜（v2 新增）

复用 `/lobby` 通道，提供跨玩家共享的中央排行榜，主菜单点「榜」按钮查看：

- **LR∑ 榜**：闯关 LR∑ 积分（通关时自动上报，取历史最高分）
- **TT∑ 榜**：竞速 TT∑ 星分（通关时自动上报）
- **ELO 榜**：联机对战 ELO（标准 ELO，K=32，初始 1200；由房主在对局结束上报，按「房间码+对局号」去重，防双方重复计分）

数据与行为：

- 玩家身份 = 浏览器 localStorage 中的随机 UUID（`function_chess_player_profile`），昵称可随时改；
  服务器以 UUID 为主键，昵称跟随展示。换浏览器/清缓存即新身份（休闲向设计）。
- v2 起另有**可选**的账号体系（`/api/auth`，见 `auth.js`）：登录后进度可跨设备同步；
  不登录也能正常玩，榜单依旧按上面的 UUID 计分。
- 榜单保存到 `leaderboard.json`（运行时自动生成，变更后防抖 2s 落盘，重启不丢）。
- 服务器对上报数值做范围校验（防伪造脏数据），并以 IP 为辅助风控：同一 IP 在 60 分钟内出现
  超过 5 个新身份时，忽略该 IP 的新身份上报（防刷榜；不影响正常玩家与已有身份）。
- 排行榜服务不可用时前端静默降级，不影响对局。

## 说明

- 大厅为**内存态**：房间在房主断开或开局后自动清理，服务器重启后列表清空
- 信令服务器只负责交换连接元数据，游戏数据（函数表达式、网格状态）为 P2P 直连传输
- STUN 使用公共服务器（Cloudflare / 腾讯 / 小米），无 TURN 中继，适用于大多数 NAT 环境
- 若处于对称型 NAT 环境无法直连，需额外部署 TURN 服务器
