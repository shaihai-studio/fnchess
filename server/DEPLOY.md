# 函数棋 P2P 服务器 · 运行与部署

> 本目录是**服务端**（PeerJS 信令 + 匹配大厅 + 排行榜/账号 API）。
> 端到端的部署流程（前端上传、Nginx、验收清单、回滚）见仓库根目录 `DEPLOY.md`。

## 运行环境

| 项 | 要求 |
|---|---|
| Node.js | **18.20.4（强制）**，`/www/server/nodejs/18.20.4/bin/node` |
| 端口 | `127.0.0.1:9000`（Express + `ws` + PeerJS 共用） |
| 运行目录 | `/www/wwwroot/Shaihai/fnchess/server1/server` |
| 上一级目录 | 必须包含 `files/` 与 `index.html`（`index.js` 会 `require('../files/js/...')`） |

依赖（均为 Node 18 兼容版本）：

| 包 | 版本 | 说明 |
|---|---|---|
| `express` | ^4.19.2 | HTTP API |
| `ws` | ^8.18.0 | `/lobby` 大厅 WebSocket |
| `peer` | ^1.0.2 | `/peerjs` 信令服务 |
| `better-sqlite3` | 7.6.2 | 账号库；需 Linux-x64 ABI 108 预编译包 |

## 首次部署 / 依赖更新

```bash
cd /www/wwwroot/Shaihai/fnchess/server1/server
npm install --registry=https://registry.npmmirror.com
```

- `better-sqlite3` 为原生模块，服务器会下载 Linux-x64 预编译包，**无需编译工具链**。
- **切勿从开发机上传 `node_modules/`**：本地（如 macOS arm64）的 `better_sqlite3.node`
  会覆盖服务器 ELF，直接导致站点 502。
- 若误传导致 ABI 不匹配：`rm -rf node_modules && npm install` 重新安装。

## 启动与重启

宝塔面板：**网站 → Node 项目 → `server` → 停止 → 启动**。
服务器上也已配置 systemd 单元 `fnchess.service`（`Restart=always`，开机自启）：

```bash
systemctl restart fnchess
sleep 5
ss -lntp | grep ':9000' || echo 'NOT-LISTENING'
curl -s -m 8 http://127.0.0.1:9000/version; echo
tail -30 /www/wwwlogs/nodejs/server.log
```

启动日志应包含：

```
✅ 函数棋 P2P 信令 + 大厅服务器已启动: http://localhost:9000
[LB-SELFTEST] 4 pass, 0 fail
```

> 重启前建议先做语法自检，避免把语法错误带上线：
> `/www/server/nodejs/18.20.4/bin/node --check index.js`

## 运行时生成的文件（不要用本地副本覆盖）

| 文件 | 用途 |
|---|---|
| `db/function_chess.db` | SQLite 账号库（自动建库建表） |
| `leaderboard.json` | 在线榜单（LR∑ / TT∑ / ELO / 竞速分关，防抖落盘） |
| `notice.json` | 全服公告 |
| `version.json` | 客户端版本检查 |

## 代码文件职责

| 文件 | 用途 |
|---|---|
| `index.js` | 主程序：信令 + 大厅 + 排行榜 + 账号 API + 竞速房与在线统计 |
| `auth.js` | 注册/登录/Token 校验/密保找回（scrypt 哈希、登录锁定） |
| `db.js` | SQLite 数据层（用户、密保问答、竞速成绩等） |
| `sync.js` | 进度同步路由 |
| `Nginx/fullchain.pem` | 证书公链本地备份（私钥不入库，见根 `DEPLOY.md` 第 9 节） |
| `rule-gen.cjs` | 规则生成工具（可选） |
| `package.json` / `package-lock.json` | 依赖清单（Node 18 兼容） |

## 常见问题

| 现象 | 处理 |
|---|---|
| `better-sqlite3` 版本/ABI 报错 | 删除 `node_modules` 后用 Node 18.20.4 重新 `npm install` |
| 端口 9000 已被占用 | 旧的手动 `node index.js` 进程残留：`ss -lntp \| grep 9000` 后结束该进程 |
| 前端连不上 | 检查 Nginx 是否把 `/peerjs`、`/lobby`、`/api/` 反代到 `127.0.0.1:9000` 且带 WebSocket 升级头 |
| 大厅房间列表为空 | 属正常：房间为内存态，重启或房主断开即清空 |
