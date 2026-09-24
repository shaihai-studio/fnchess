# 函数棋 · 部署手册

> 适用：网页版（宝塔 nginx 静态站点）+ P2P 信令/大厅服务（Node）+ 排行榜/账号 API。
> 移动端（iOS/Android）打包发版见 `docs/RELEASE-GUIDE.md`。

## 0. 环境事实速查

| 项 | 值 |
|---|---|
| 站点根目录 | `/www/wwwroot/Shaihai/fnchess/server1` |
| 前端位置 | `server1/index.html` + `server1/files/`（必须与 `server/` 同级） |
| 服务端位置 | `server1/server/` |
| Node 版本 | **18.20.4（强制）**，二进制 `/www/server/nodejs/18.20.4/bin/node` |
| 服务监听 | `127.0.0.1:9000`（Express + ws + PeerJS） |
| Nginx vhost | `/etc/nginx/sites-available/fnchess` |
| 外网入口 | `https://p2p2.shaihai.cn:24026`（NAT `24026 → 443`） |
| 域名 | `p2p2.shaihai.cn`（新服务器）；`p2p.shaihai.cn` 当前仍解析到**旧服务器**，见第 10 节 |
| 服务管理 | 宝塔面板「Node 项目」项目名 `server`（托管进程）；另有 cron 看门狗 `/root/fnchess_watchdog.sh`（每 2 分钟探测 9000，失联则调面板 API 重启）。`fnchess.service` 单元存在但**处于 disabled，勿用 `systemctl` 重启** |
| 运行日志 | `/www/wwwlogs/nodejs/server.log` |
| SSH | `111.170.33.2:56521`（口令保存在本地 `.secrets/`，**不入库**） |

前端**信令/接口基址**统一由 `files/js/P2PController.js` 的 `P2PController.signaling`
（或 `index.html` 中的 `window.P2P_SIGNALING`）推导，`/lobby` 的 `ws(s)` 地址自动派生。
**禁止在业务代码中硬编码域名**，否则切换服务器需改多处。

---

## 1. 部署前备份（务必先做）

```bash
cd /www/wwwroot/Shaihai/fnchess/server1/server
TS=$(date +%Y%m%d_%H%M%S)
cp leaderboard.json ~/leaderboard.json.bak.$TS
cp -r db ~/db.bak.$TS
tar -czf ~/fnchess-server-src.$TS.tar.gz index.js auth.js db.js sync.js rule-cache 2>/dev/null || true
ls -lh ~/ | grep -E 'leaderboard|db.bak|fnchess-server-src'
```

## 2. 构建前端产物（仅 App 需要）

```bash
npm run build:web      # files/ + index.html → www/（Capacitor webDir）
npm run sync           # www/ → ios/App/App/public、android/app/src/main/assets/public
```

> **网页版站点不部署 `www/`**：nginx 直接服务源码 `index.html` + `files/`，
> 便于按文件增量上传与线上排查。`www/` 仅用于 iOS/Android 打包。

## 3. 上传文件

| 目标 | 内容 |
|---|---|
| `server1/server/` | `index.js`、`auth.js`、`db.js`、`sync.js`、`rule-gen.cjs`、`package.json`、`package-lock.json`、`README.md`、`DEPLOY.md` |
| `server1/` | `index.html` |
| `server1/files/` | `files/**` 增量（排除 `*.md`、`tmp_test_server_check.cjs` 等非运行时文件） |

**严禁上传 `node_modules/`。**
历史事故：把本地（macOS arm64）的 `better_sqlite3.node` 覆盖到服务器，导致站点 502。
`db/`、`leaderboard.json`、`notice.json`、`version.json` 为**服务器运行时数据，不回传覆盖**。

上传后先做语法自检，避免把语法错误重启上线：

```bash
cd /www/wwwroot/Shaihai/fnchess/server1/server
/www/server/nodejs/18.20.4/bin/node --check index.js
/www/server/nodejs/18.20.4/bin/node --check auth.js
/www/server/nodejs/18.20.4/bin/node --check db.js
```

## 4. 依赖（仅当 `package.json` 变化时）

```bash
cd /www/wwwroot/Shaihai/fnchess/server1/server
npm install --registry=https://registry.npmmirror.com
```

- `better-sqlite3@7.6.2` 依赖 Node 18 的 ABI 108，需 Linux-x64 预编译包（无需编译工具链）。
- **不要用 Node 24 安装**（无对应 prebuild，会走源码编译并失败）。

## 5. 重启服务

宝塔面板：**网站 → Node 项目 → `server` → 停止 → 启动**。

命令行等价方式（复用面板 API，比 kill 更干净，且与看门狗的 pid 文件保持一致）：

```bash
/www/server/panel/pyenv/bin/python3 /root/fnchess_restart.py   # 仅启动
# 需要「停止并启动」时用部署工具：
python scripts/deploy.py restart                               # 本地执行（见第 11 节）
```

重启后校验：

```bash
sleep 6
ss -lntp | grep ':9000' || echo 'NOT-LISTENING'
curl -s -m 8 http://127.0.0.1:9000/version; echo
tail -25 /www/wwwlogs/nodejs/server.log
```

启动日志应出现：服务已启动 + `[LB-SELFTEST] 4 pass, 0 fail`。

> 注意：`systemctl restart fnchess` **不可用**——该单元处于 disabled，进程实际由宝塔面板
> 托管（`npm run start`），面板停止项目时会删除 `/www/server/nodejs/vhost/pids/server.pid`，
> 从而避免与看门狗（每 2 分钟探测 9000 端口）互相干扰。

## 6. 验收清单

1. **静态首页**：`https://p2p2.shaihai.cn:24026/` 返回 200，且 `files/js/*.js`、`files/css/*.css` 可加载。
2. **接口**：`/version`、`/notice`、`/api/auth/register|login|reset` 返回符合 `ok/fail` 约定。
3. **WebSocket**：
   - `wss://p2p2.shaihai.cn:24026/lobby` 握手 101（大厅：在线统计 / 房间列表 / 喊话）
   - `wss://p2p2.shaihai.cn:24026/peerjs` 握手 101（WebRTC 信令）
4. **自动化回归**：
   ```bash
   python tests/server_auth_lobby_test.py
   python tests/server_race_chat_test.py
   # 指定环境：FNCHESS_BASE=https://p2p2.shaihai.cn:24026 或 http://127.0.0.1:9000
   ```
5. **浏览器端到端**（真实外网）：注册/登录/找回密码 → 进入大厅 → 建房/入房/观战 → 全服喊话 → 对局聊天 → 竞速建房有人加入的全局提醒 → 竞速分关榜有数据 → 对局结束立即断开 P2P。

## 7. 回滚

```bash
cd /www/wwwroot/Shaihai/fnchess/server1
# 前端
git -C ~/fnchess-deploy rollback 2>/dev/null || tar -xzf ~/fnchess-front.bak.$TS.tar.gz
# 服务端源码
tar -xzf ~/fnchess-server-src.$TS.tar.gz -C server/
# 数据
cp ~/leaderboard.json.bak.$TS server/leaderboard.json && rm -rf server/db && cp -r ~/db.bak.$TS server/db
systemctl restart fnchess
```

## 8. 常见问题

| 现象 | 排查方向 |
|---|---|
| 站点 502 | Node 未监听 9000（看日志）；或 `better-sqlite3` ABI 不匹配（重装依赖，勿传本地 `node_modules`） |
| WebSocket 握手失败（非 101） | nginx vhost 缺少 `Upgrade`/`Connection` 头或 `/peerjs`、`/lobby` 反代缺失 |
| 访问出现 301 循环 | 同域名存在重复 server 块（`sites-available/fnchess` 与宝塔 vhost 同时生效） |
| 页面仍是旧版 | 浏览器/WebView 缓存，或 nginx root 未指向 `server1/`（应含 `index.html` 与 `files/`） |
| 排行榜/账号接口 404 | Node 服务未重启成功，或反代 `/api/` 缺失 |
| 联机提示 `could not peer to` | 房间码失效 / 房主 PeerJS 未就绪；网络异常时提示用户「换 WiFi、关闭 VPN」后重试 |

## 9. 安全提醒

- SSH 口令、宝塔面板口令、ACME 账户私钥、服务端私钥均**不入库**，统一存放于本地 `.secrets/`（已加入 `.gitignore`）。
- 若这些凭据曾进入过版本库或外发，请在服务器侧轮换 SSH 口令与面板口令，并重新签发证书私钥。

## 10. 服务端地址（已统一为 p2p2.shaihai.cn:24026）

前端所有联机与账号请求都由 `P2P_SIGNALING` 一个来源推导（`AuthService` / `ProgressSync` /
`MatchLobbyController` / PeerJS 均消费它）：

| 位置 | 当前值 |
|---|---|
| `index.html` → `window.P2P_SIGNALING` | `{ host: 'p2p2.shaihai.cn', port: 24026, path: '/', secure: true }` |
| `files/js/P2PController.js` → `static signaling` 默认值 | 同上（无 `P2P_SIGNALING` 时兜底） |
| `files/js/ProgressSync.js` → `API_BASE` 兜底 | `https://p2p2.shaihai.cn:24026/api` |
| `server/index.js` → CORS 白名单 | `shaihai.cn` 与 `wakudemo.cn` **及其所有子域**（https）+ `null`（file:// 本地直开）+ `localhost` / `127.0.0.1`；口径与老服务器 nginx `map $http_origin` 一致 |

因此：网页端 @ `p2p2.shaihai.cn:24026` 与后端同源；App（`https://localhost` / `capacitor://localhost`）
也指向该地址，且 CORS 白名单已覆盖跨源场景。

## 10.1 TURN / STUN 中继（自建 coturn）

| 项 | 值 |
|---|---|
| 服务 | coturn 4.5.2（Ubuntu 22.04，`systemctl enable coturn` 已开机自启） |
| 配置 | `/etc/turnserver.conf`（本地下发源：`.secrets/turnserver.conf`，已 gitignore） |
| 监听 | `0.0.0.0:3478`（UDP/TCP），中继端口段 `49160-49200/udp` |
| NAT 声明 | `external-ip=111.170.33.2/172.16.0.34`（**NAT 后必须声明**，否则下发内网 relay 地址） |
| 认证 | `use-auth-secret` 限时凭证；共享密钥在服务器 `server/.turn-secret`（环境变量 `FNCHESS_TURN_SECRET` 优先） |
| 下发接口 | `GET /api/ice` → `{ ok, turn, ttl, iceServers: [STUN, TURN+凭证] }` |
| 上游映射 | `3478/udp`、`3478/tcp`、`49160-49200/udp` → `172.16.0.34`（同端口） |
| 服务端放行 | `ufw allow 3478/udp|tcp`、`ufw allow 49160:49200/udp`（已配置） |
| 自检 | `python scripts/turn_check.py`（外网 STUN + 中继分配）、`systemctl status coturn`、`/var/log/turnserver.log` |

客户端逻辑：`files/js/P2PController._fetchIceServers()` 先拉 `/api/ice`（缓存至 ttl-60s，3s 超时），
失败则回落静态公共 STUN；`RaceRoomController` 复用同一实现。

**遗留说明**

- `p2p.shaihai.cn`（`124.222.7.170`）为旧服务器，仍在线但接口较旧（`/api/auth/reset/question` 返回 404）。
  前端与 ICE 配置均已不再指向它；确认无玩家后即可停服（含其上 coturn）。
- 更换 TURN 密钥时需同步改两处：服务器 `/etc/turnserver.conf` 的 `static-auth-secret` 与 `server/.turn-secret`。

## 11. 部署工具（scripts/deploy.py）

```powershell
$env:FNCHESS_SSH_PASS = '<SSH 口令>'
python scripts/deploy.py probe      # 只读：远端环境 / 服务状态 / 关键文件 md5
python scripts/deploy.py backup     # 备份 db/ + leaderboard.json + 服务端源码 + 前端
python scripts/deploy.py server     # 上传 server/ 代码（不含 node_modules 与运行时数据）
python scripts/deploy.py frontend   # 上传 index.html + files/（自动排除 *.md/*.bak）
python scripts/deploy.py restart    # 面板 API 停止并启动 + 端口/日志自检
python scripts/deploy.py verify     # 本机与外网接口自检
python scripts/deploy.py run "<cmd>"  # 远端执行任意命令（排障）
python scripts/deploy.py all        # 备份 → 服务端 → 前端 → 重启 → 自检
```

安全约束：口令仅从环境变量读取，脚本本身不含任何凭据，可安全入库。
