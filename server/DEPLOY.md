# 函数棋服务端 · 自建与部署指南

> 本目录是**服务端**（PeerJS 信令 + 匹配大厅 + 排行榜 + 账号/进度 API）。
> 这是一份**空白蓝图**：所有路径、域名、密钥均为占位符，照着填成你自己的即可。
> 端到端部署流程（前端静态托管、证书、验收清单）另见仓库 `docs/DEPLOY.md`。

## 一、它提供什么

| 路径 | 用途 |
|---|---|
| `/peerjs` | PeerJS 信令服务（WebRTC 握手，交换连接元数据） |
| `/lobby` | 匹配大厅 WebSocket（房间列表 + 在线人数） |
| `/api/auth` | 注册 / 登录 / 登出 / 改密 / 密保找回 |
| `/api/sync` | 账号进度同步（字段级合并，服务器为时钟权威） |
| `/api/ice` | 下发 STUN 列表与 coturn 限时 TURN 凭证 |
| `/api/version`、`/api/notice`、`/api/leaderboard` 等 | 版本检查 / 公告 / 榜单 |

以上**共用同一个端口**（默认 9000），靠路径区分。

## 二、目录结构要求（重要）

`index.js` 会 `require('../files/js/...')` 复用前端的数学/校验模块，所以**服务端目录的上一级必须同时包含 `files/` 与 `index.html`**：

```
fnchess/                 ← 部署根目录
├── index.html
├── files/               ← 必须存在（含 js/ 等）
└── server/              ← 本目录，在此处 npm install && npm start
```

也就是说：**整个仓库一起上传**，而不是只传 `server/`。只传 `server/` 会启动即报错。

## 三、快速开始（本地跑通）

```bash
cd server
npm install
npm start                      # 默认监听 0.0.0.0:9000
```

启动后打开 `http://localhost:9000` 应能看到服务响应，启动日志应包含：

```
✅ 函数棋 P2P 信令 + 大厅服务器已启动: http://localhost:9000
[LB-SELFTEST] 4 pass, 0 fail
```

本地联机验证：浏览器打开仓库根的 `index.html`（可用 `node scripts/dev-server.js` 起静态服务），
两个窗口分别「创建房间」与「加入房间」即可。

## 四、环境变量

完整清单与逐项说明见 **`server/.env.example`**（空白模板，可复制填写）。最常改的四个：

| 变量 | 说明 | 不填会怎样 |
|---|---|---|
| `P2P_PORT` | 服务端口 | 默认 9000 |
| `P2P_HOST` | 监听网卡 | 默认 `0.0.0.0`；用 Nginx 反代建议改 `127.0.0.1` |
| `FNCHESS_ALLOWED_ORIGINS` | 前端跨域白名单（逗号分隔） | 只放行 localhost / 127.0.0.1 / file:// |
| `FNCHESS_LB_SECRET` | 排行榜签名密钥 | 首次启动自动生成 `server/.lb-secret` |
| `FNCHESS_TURN_HOST` / `FNCHESS_TURN_SECRET` | 自建 TURN 中继（可选） | 只下发公共 STUN |

> ⚠️ `server/index.js` 直接读**系统环境变量**，不读 `.env` 文件。
> 想用 `.env`，可用 `export $(grep -v '^#' .env | xargs)`、systemd 的 `EnvironmentFile=`、
> 面板的「环境变量」设置，或自行 `npm i dotenv`。`.env` 已被 `.gitignore` 忽略，不会误提交。

## 五、依赖与 Node 版本

| 项 | 要求 |
|---|---|
| Node.js | **18.x 或更高**（本项目在 18.20.4 上验证） |
| 架构 | 见下方 `better-sqlite3` 说明 |

| 包 | 版本 | 说明 |
|---|---|---|
| `express` | ^4.19.2 | HTTP API |
| `ws` | ^8.18.0 | `/lobby` 大厅 WebSocket |
| `peer` | ^1.0.2 | `/peerjs` 信令服务 |
| `better-sqlite3` | 7.6.2 | 账号库（原生模块，装预编译包即可） |

```bash
cd server
npm install                     # 国内网络慢可加 --registry=https://registry.npmmirror.com
```

**注意 `better-sqlite3` 是原生模块**：

- 服务器上 `npm install` 会自动下载对应平台（如 Linux-x64）的预编译包，**无需编译工具链**。
- **切勿从开发机上传 `node_modules/`**：本机（如 Windows / macOS arm64）的 `better_sqlite3.node`
  会覆盖服务器的 ELF 文件，直接导致 502。
- 若已误传导致 ABI 不匹配：`rm -rf node_modules && npm install` 重装即可。

## 六、启动与守护

前台测试：`node index.js`

推荐用 systemd 守护（示例单元 `/etc/systemd/system/fnchess.service`，**名字随你改**）：

```ini
[Unit]
Description=fnchess p2p server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/fnchess/server
EnvironmentFile=/path/to/fnchess/server/.env     # 不用 .env 就删掉这行
ExecStart=/usr/bin/node index.js
Restart=always
User=www

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now fnchess
systemctl restart fnchess && sleep 5
ss -lntp | grep ':9000' || echo 'NOT-LISTENING'
curl -s -m 8 http://127.0.0.1:9000/version; echo
```

用宝塔等面板：在**网站 → Node 项目**里指向 `server` 目录启动，端口填 9000 即可。

> 重启前建议先做语法自检，避免把语法错误带上线：`node --check index.js`

## 七、反向代理（Nginx）

要让前端经 443/80 访问 9000，必须让 **WebSocket 升级头**也被代理，否则信令与大厅都连不上。
完整示例见 **`server/Nginx/nginx.conf.example`**（含 HTTPS、静态托管、WebSocket 超时、禁止访问 `server/db` 等）。
核心片段：

```nginx
location ~ ^/(peerjs|peer|api|lobby) {
    proxy_pass http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

## 八、运行时自动生成的文件（**不要用本地副本覆盖线上**）

| 文件 | 用途 |
|---|---|
| `db/function_chess.db` | SQLite 账号库（首次启动自动建库建表） |
| `leaderboard.json` | 在线榜单（LR∑ / TT∑ / ELO / 竞速分关，防抖落盘） |
| `notice.json` | 全服公告 |
| `version.json` | 客户端版本检查依据 |
| `.lb-secret` | 排行榜签名密钥（首次启动随机生成） |
| `.turn-secret` | TURN 静态密钥（可选，也可用环境变量） |

以上**除 `version.json` 外都已被 `.gitignore` 忽略**——它们属于部署后的运行时数据，仓库里不该有。

## 九、代码文件职责

| 文件 | 用途 |
|---|---|
| `index.js` | 主程序：信令 + 大厅 + 排行榜 + 账号 API + 竞速房与在线统计 |
| `auth.js` | 注册 / 登录 / Token 校验 / 密保找回（scrypt 哈希、登录锁定） |
| `db.js` | SQLite 数据层（用户、密保问答、竞速成绩等） |
| `sync.js` | 账号进度同步路由 |
| `maintenance/rename-nicknames.js` | 昵称批量维护脚本（可选） |
| `rule-gen.cjs` | 规则生成工具（可选） |
| `package.json` / `package-lock.json` | 依赖清单 |
| `.env.example` | 环境变量空白模板 |
| `Nginx/nginx.conf.example` | 反代示例配置 |

## 十、常见问题

| 现象 | 处理 |
|---|---|
| 启动报 `Cannot find module '../files/js/...'` | 部署目录不完整——上一级必须同时有 `files/` 和 `index.html`（见第二节） |
| `better-sqlite3` 版本 / ABI 报错 | 删掉 `node_modules` 后用同版本 Node 重装 |
| 端口 9000 被占用 | 旧进程残留：`ss -lntp \| grep 9000` 后结束它 |
| 前端连不上 | 检查 Nginx 是否把 `/peerjs`、`/lobby`、`/api/` 反代到 `127.0.0.1:9000`，且带 WebSocket 升级头 |
| 浏览器报跨域（CORS） | 把前端地址加进 `FNCHESS_ALLOWED_ORIGINS` |
| 大厅房间列表为空 | 正常：房间是内存态，重启或房主断开即清空 |
| 对称型 NAT 下连不上 | 需要自建 coturn（TURN），只靠 STUN 无法穿透 |

## 十一、自建检查清单

- [ ] 整个仓库上传（`index.html` + `files/` + `server/`），不是只传 `server/`
- [ ] `cd server && npm install`（**不要**上传本机 `node_modules`）
- [ ] 复制 `.env.example` 填写，至少改 `FNCHESS_LB_SECRET`（用随机串）
- [ ] 前端 `files/js/P2PController.js` 的 `P2PController.signaling`（或 `index.html` 里的 `window.P2P_SIGNALING`）指向你的域名与端口
- [ ] 把前端地址填进 `FNCHESS_ALLOWED_ORIGINS`
- [ ] Nginx 反代带上 WebSocket 升级头（参考 `Nginx/nginx.conf.example`）
- [ ] 想要 TURN：部署 coturn + 开放 3478/udp 与 49152-65535/udp + 设置 `FNCHESS_TURN_SECRET`
- [ ] 对外暴露前确认 `server/db/`、`.lb-secret`、`.turn-secret` 不在 Web 可访问路径下
