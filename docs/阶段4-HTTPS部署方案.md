# 函数棋 阶段4：HTTPS 部署方案（已完成的阶段记录）

> **现状更新（2026-09-22）**：生产服务器已迁至 `111.170.33.2`（Ubuntu 22.04 + 宝塔面板），
> 对外 HTTPS 入口为 `https://p2p2.shaihai.cn:24026`（NAT `24026→443`；HTTP 侧 `http://p2p2.shaihai.cn:38487`，NAT `38487→80`）。
> 注意：公网 443/80 未映射，**访问必须带端口**。旧的腾讯云 `124.222.7.170` / `p2p.shaihai.cn` 已不再使用。
> 本文档正文中的地址已同步更新，权威的部署/回滚/验收步骤见仓库根目录 `DEPLOY.md`。

> 目标：让登录/同步/排行榜（阶段1-3）通过 `https://p2p2.shaihai.cn:24026` 正式上线。
> 现状：`p2p2.shaihai.cn:24026` 已是 HTTPS（宝塔 Nginx 反代 → Node 9000），且已切换为新服务器。

---

## 0. 环境确认（已从截图 + 代码确认）

| 项 | 值 |
|---|---|
| 服务器 | 111.170.33.2（Ubuntu 22.04 + 宝塔），宝塔面板 |
| 域名 | `p2p2.shaihai.cn:24026`（老用户访问入口） |
| 后端 | Node `server/index.js`，端口 9000，宝塔「Node项目」`server` |
| 前端 | 静态文件在 `/www/wwwroot/Shaihai/fnchess/server1/`（index.html + files/） |
| HTTPS | 已通过 Nginx 443 → 9000 反代（老版本已工作） |
| 新依赖 | `better-sqlite3`（阶段1 新增，需编译） |

---

## 1. 目标架构（写死连 p2p + 后端开 CORS）

> 与「原版本地也能上传排行榜」一致：原版排行榜/联机走 `/lobby` WebSocket，
> 地址由 `P2PController.signaling` 写死指向 `p2p2.shaihai.cn:24026`，与页面 origin 无关。
> 阶段4 让登录/进度同步的 HTTP 也统一写死指向 `p2p2.shaihai.cn:24026/api`，并由后端开 CORS 放行。

```
用户（在线 www.shaihai.cn / p2p2.shaihai.cn:24026 / 本地 localhost）→ https://p2p2.shaihai.cn:24026
   │
   ├─ /api/*        → HTTP 登录(/auth)、进度同步(/sync)   ← 写死 p2p + 后端 CORS 放行
   ├─ /lobby        → WebSocket 排行榜/联机               ← 写死 p2p（原版机制）
   └─ /peerjs       → WebSocket P2P 信令                 ← 写死 p2p（原版机制）
```

前端地址来源（已落地）：
- `AuthService.API_BASE` = `https://p2p2.shaihai.cn:24026/api`（写死，可用 `window.AUTH_API_BASE` 覆盖）
- `ProgressSync.API_BASE` = 与 AuthService 一致（写死 p2p）
- 排行榜/联机 = `P2PController.signaling`（写死 `wss://p2p2.shaihai.cn:24026`）
- notice/version = `_getServerHttpBase()`（由 signaling 拼接，写死 p2p）

后端 CORS（已落地）：`server/index.js` 新增中间件，放行 `www.shaihai.cn`、`p2p2.shaihai.cn:24026`、
任意端口 `localhost`/`127.0.0.1`，并处理 OPTIONS preflight。WebSocket 不跨域受限，无需 CORS。

---

## 2. 部署步骤

### 第 1 步：上传本地改动到服务器

把本地（函数棋2.0.0.2）以下**改动/新增文件**覆盖到服务器对应目录：

**后端 `/www/wwwroot/Shaihai/fnchess/server1/server/`**
- `index.js`（阶段3 排行榜主键改造 + **阶段4 CORS 中间件**）
- `auth.js`（阶段1 认证 + UUID 迁移）
- `db.js`（阶段1 建库）
- `sync.js`（新增，阶段2）
- `package.json`（含 better-sqlite3 依赖）

**前端 `/www/wwwroot/Shaihai/fnchess/server1/`**
- `index.html`
- `files/js/` 下新增/改动：
  - `AuthService.js`、`AuthPanel.js`、`ProgressSync.js`（新增；**阶段4 API_BASE 已写死指向 p2p**）
  - `PlayerProfile.js`（加 window 挂载）、`LeaderboardService.js`、`VerifyCrypto.js`
  - `ui/UILeaderboard.js`、`ui/UIModals.js`、`ui/uip2p/UIP2PRoom.js`、`ui/racebattle/UIRaceBattleBase.js`
- `files/css/auth-panel.css`（新增）

> 最稳妥：整个 `files/` 和 `server/` 目录整体上传覆盖。

> 最稳妥：整个 `files/` 和 `server/` 目录整体上传覆盖。

### 第 2 步：安装依赖 + 重启后端

在服务器 `server/` 目录执行：
```bash
cd /www/wwwroot/Shaihai/fnchess/server1/server
npm install          # 会编译 better-sqlite3（需 gcc/python；宝塔一般自带）
```

在宝塔「Node项目」里**重启 `server`**，看日志确认：
```
✅ 函数棋 P2P 信令 + 大厅服务器已启动: http://localhost:9000
```
（若启动报错，多半是 better-sqlite3 编译失败，或 DB 目录权限。）

### 第 3 步：检查 / 补充 Nginx 反代 `/api`

宝塔「网站」→ `p2p2.shaihai.cn:24026` → 配置文件，确认 `location /api` 存在并把请求转发到 9000。

**关键**：需要能处理 JSON body（`express.json()` 已在代码里），Nginx 默认 `location /` 反代即可覆盖 `/api`。若 `location /` 已把所有请求转发到 9000，则无需额外配 `/api`（Node 的 `app.use('/api/auth')` 会处理）。

典型 Nginx 配置（若 `location /` 已反代则无需改）：
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:9000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
> ⚠️ 若 `location /` 是「直接 serve 静态文件」（root 指向 fnchess），则必须**单独加 `location /api/` 反代**，否则 `/api` 会被当作静态文件返回 404。

**关于 CORS（本方案特有）**：因为前端地址写死指向 `p2p2.shaihai.cn:24026/api`，当页面从
`www.shaihai.cn` 或本地 `localhost` 打开时，浏览器会拦截跨域请求。这已由**后端代码**
（`server/index.js` 的 CORS 中间件）处理，**不依赖 Nginx**。Nginx 只需保证 `/api` 反代到
9000 即可，后端会自动返回正确的 CORS 头。

### 第 4 步：验证

在浏览器打开 `https://p2p2.shaihai.cn:24026`（Ctrl+Shift+R 强刷），进入主菜单点账号按钮：
1. 打开登录弹窗 ✅
2. 注册/登录 → 不弹「无法连接服务器」✅
3. 排行榜能看、登录后能上报 ✅

用 curl 在服务器本机自测：
```bash
curl -s https://p2p2.shaihai.cn:24026/api/sync/pull    # 无token应 401（说明 /api 通）
curl -s -X POST https://p2p2.shaihai.cn:24026/api/auth/register -H "Content-Type: application/json" -d '{"username":"testx","password":"test123456"}'
```

**本地 localhost 跨域测试（本方案特有）**：部署后，在本地电脑起一个前端静态服务
（如 `python -m http.server 8080`），浏览器打开 `http://localhost:8080` 进入登录。
若登录/进度同步正常，说明后端 CORS 已正确放行 `localhost`。
（排行榜/联机走 WebSocket，本来就能连，不受 CORS 影响。）

---

## 3. 潜在坑 & 处理

| 坑 | 现象 | 处理 |
|---|---|---|
| better-sqlite3 编译失败 | Node 启动报错 | 装 gcc：`yum install gcc-c++ make python3` 后重装 |
| DB 目录无权限 | SQLite 无法写 | `chmod 777 /www/wwwroot/Shaihai/fnchess/server1/server/db` |
| `/api` 404 | Nginx 只 serve 静态 | 补 `location /api/` 反代 |
| 老前端缓存 | 新按钮不显示 | 强刷 + 改版本号 |
| 排行榜历史数据 | 老 playerId 记录 | 阶段3 迁移：登录后自动并入账号，无需手动处理 |
| 首次登录进度同步 | 本地进度推上服务器 | ProgressSync 登录后自动 reconcile |
| 本地 localhost 登录失败 | 浏览器控制台报 CORS 错误 | 确认服务器端 `index.js` 已部署新版（含 CORS 中间件）并已重启 |

---

## 4. 部署后建议

1. **备份**服务器上 `server/leaderboard.json` 和整个 `server/` 到本地（含 `db/`），防误操作。
2. **清空测试数据**：服务器 DB 里的测试账号（synctest_user、planA_test、final_check、e2e_xxx 等），避免污染正式榜单。
3. 上线后观察日志，确认无异常。

---

## 5. 需要你在服务器上确认的 2 个点

1. **Nginx 当前 `location /` 是 serve 静态文件、还是反代 9000？**（决定第 3 步要不要加 `/api` 反代）
2. **Node 9000 现在跑的是旧 index.js 还是新 index.js？**（决定要不要重启 / 覆盖）

如果你把宝塔 `p2p2.shaihai.cn:24026` 站点的「配置文件」截图发我，我能直接告诉你第 3 步怎么改。
