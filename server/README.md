# 函数棋 P2P 信令服务器

本地/局域网联机对战所需的 PeerJS 信令服务器。

## 快速启动

```bash
cd server
npm install
npm start
```

启动后访问 `http://localhost:9000` 确认服务正常。

## 联机测试流程

1. 启动本服务器
2. 打开 `index.html`，进入「对战模式 → 联机」
3. 玩家A 点击「创建房间」获取房间码
4. 玩家B 输入房间码点击「加入房间」
5. 双方连接后即可对战

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

## 说明

- 信令服务器只负责交换连接元数据，游戏数据（函数表达式、网格状态）为 P2P 直连传输
- STUN 使用公共服务器（Cloudflare / 腾讯 / 小米），无 TURN 中继，适用于大多数 NAT 环境
- 若处于对称型 NAT 环境无法直连，需额外部署 TURN 服务器
