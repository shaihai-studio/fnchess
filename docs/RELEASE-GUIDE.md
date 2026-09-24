# 函数棋 App 构建与上架指南

适用版本：v2.0.0.2（Capacitor 8 混合壳）
应用 ID：`cn.shaihai.fnchess`　应用名：函数棋

---

## 1. 环境准备

| 平台 | 需要的环境 |
|------|-----------|
| Android | Node.js 18+、JDK 17+、Android Studio（含 Android SDK 36） |
| iOS | macOS、Xcode 15+、CocoaPods 或 SwiftPM（Capacitor 8 默认 SPM）、Apple 开发者账号（$99/年） |

通用依赖安装（仓库根目录）：

```bash
npm install
```

## 2. 日常开发流程

```bash
# 1. 修改 files/ 下的前端代码后，重建 www（含 JS bundle 合并）
npm run build:web

# 2. 同步到原生工程（拷贝 www + 更新插件）
npx cap sync

# 3. 打开原生 IDE
npx cap open android   # Android Studio
npx cap open ios       # Xcode（需 macOS）

# 浏览器快速调试（免原生构建）
node scripts/dev-server.js 8137        # 源码版
node scripts/dev-server.js 8138 www    # 打包产物版
```

## 3. Android 构建与上架

### 3.1 生成签名密钥（仅首次）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gen-android-keystore.ps1
```

- 生成 `android/fnchess-release.keystore`（已被 `.gitignore` 忽略）并写好 `android/keystore.properties`
- 未指定 `-Password` 时随机生成 24 位口令，同时备份到 `.secrets/android-keystore.txt`（不入库）
- ⚠️ **密钥库与口令必须离线备份**：丢失后无法再为已上架应用发布更新（国内渠道基本无法找回）
- 手工等价命令：`keytool -genkeypair -v -keystore android/fnchess-release.keystore -alias fnchess -keyalg RSA -keysize 2048 -validity 10000`
- 配置模板见 `android/keystore.properties.example`

签名配置已内置于 `android/app/build.gradle`：读取 `android/keystore.properties`，**文件缺失时 release 产物不签名**（仍可构建，便于本地验证或 CI 未配密钥时降级）。

### 3.2 构建发布产物（一键）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1           # AAB + APK
powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1 -ApkOnly  # 只要 APK
```

脚本流程：`npm run build:web` → `npx cap copy android` → `gradlew bundleRelease assembleRelease` → `apksigner` 校签 + 打印 `versionCode/versionName`。

产物：
- AAB（Google Play 必需）：`android/app/build/outputs/bundle/release/app-release.aab`
- APK（国内渠道 / 官网下载）：`android/app/build/outputs/apk/release/app-release.apk`

### 3.3 CI 自动构建与发布（GitHub Actions）

`.github/workflows/android-release.yml`：

- 手动触发（Actions → **Android 发布构建** → Run workflow），或推送 `v*` 标签自动触发
- `create_release=true` → 自动创建 GitHub Release 并附上 APK/AAB（对应 `docs/index.html` 的「下载 Android APK」按钮）
- `publish_to_play=true` → 自动上传 AAB 到 Google Play **内部测试轨道**（需 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`）
- 仓库 Secrets 需要：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`

```powershell
# 生成密钥库 base64（粘贴到 ANDROID_KEYSTORE_BASE64，注意去掉 BEGIN/END 两行）
certutil -encode android\fnchess-release.keystore ks.b64
```

国内渠道（华为/小米/OPPO/vivo/应用宝）目前对个人开发者**没有稳定开放的自动上传接口**，实际流程是：CI 产出 APK → 人工登录各渠道后台上传（首次必须人工创建应用、签署协议、提交资质）。

### 3.4 Android 商店清单

- **Google Play**：AAB、targetSdk 36（已配置）、隐私政策 URL、数据安全表单（声明：收集昵称/战绩用于排行榜；不收集敏感信息）、应用图标 512×512、置顶大图 1024×500、手机截图 ≥2 张（建议 1080×2400）
- **国内商店（华为/小米/OPPO/vivo/应用宝）**：软著证书、ICP 备案号（游戏使用 p2p2.shaihai.cn 域名服务）、隐私政策、未成年人保护说明、部分商店要求游戏版号（休闲单机+联机功能需评估，建议先以「工具/教育」类目或去掉联机的版本上架咨询）
- 权限：仅 `INTERNET`（已最小化）

## 4. iOS 构建与上架

### 4.1 Xcode 配置（已预置）

- Deployment Target：iOS 15.0
- TARGETED_DEVICE_FAMILY = 1,2（iPhone + iPad）
- 支持方向：iPhone 竖屏+横屏；iPad 全方向
- `ITSAppUsesNonExemptEncryption = false`（仅系统加密，免出口合规流程）
- 全链路 HTTPS/WSS，无 ATS 例外

### 4.2 签名与构建

1. `npx cap open ios`，在 Xcode → Signing & Capabilities 选择你的 Team，自动管理签名
2. Product → Archive → Distribute App → App Store Connect

### 4.3 App Store 素材清单

- 截图（必需）：6.7"（1290×2796，iPhone 15 Pro Max）、6.5"（1242×2688）、iPad 12.9"（2048×2732）各 3-5 张
- 隐私政策 URL（必需；内容需覆盖：昵称、ELO 战绩、排行榜数据的使用）
- 年龄分级：4+；类目：游戏/教育/益智
- 审核备注：提供联机对战演示说明（两个测试账号互开房间码），说明 WebRTC 仅用于点对点数据传输，不采集音视频

## 5. 服务端配合事项（p2p2.shaihai.cn:24026）

App 内网络请求走三条路径：

1. **HTTP API（公告/版本/排行榜/账号）**：已由 `CapacitorHttp.enabled=true` 经原生层转发，**不受 CORS 限制**。
   服务端同时已放行白名单来源（`https://p2p2.shaihai.cn:24026`、`p2p/p2p2.shaihai.cn` 正则、`localhost`），跨源 fetch 亦可正常工作。
2. **WebSocket（PeerJS 信令 / 匹配大厅 wss://p2p2.shaihai.cn:24026）**：WebSocket 不受 CORS 约束，但服务端若校验 `Origin` 头，需放行：
   - `capacitor://localhost`（iOS）
   - `https://localhost`（Android）
   - 建议：信令/大厅服务不校验 Origin，或将上述两个 origin 加入白名单。
3. **TURN 中继（`p2p2.shaihai.cn:3478`，自建 coturn）**：客户端**不再硬编码凭证**。每次联机前调用 `GET /api/ice` 换取「STUN 列表 + 限时 TURN 凭证」（coturn TURN REST API：`username` = 过期时间戳，`credential` = `base64(HMAC-SHA1(shared-secret, username))`，有效期 1 小时）；ICE 配置已收口在 `P2PController._fetchIceServers()`，`RaceRoomController` 自动复用。
   - 拉取失败/超时（3s）会回落静态公共 STUN，不会卡住建房。
   - 服务端密钥来自 `server/.turn-secret`（环境变量 `FNCHESS_TURN_SECRET` 优先），**不入库**。
   - 外网连通性自检：`python scripts/turn_check.py`（验证 3478/UDP 与中继端口段 49160-49200）。

## 6. 版本号管理

三端必须一起递增；当前基线 **2.0.0.2**：

| 端 | 位置 | 当前值 | 说明 |
|---|---|---|---|
| 网页 | `files/js/GameVersion.js` 的 `GAME_VERSION` | `2.0.0.2` | 客户端与 `/version` 比较，服务端更大则提示更新 |
| 网页 | `server/version.json` | `2.0.0.2` | 服务端权威版本（`/version` 接口） |
| 网页 | `package.json` 的 `version` | `2.0.0.2` | 与上两者保持一致 |
| Android | `android/app/build.gradle` 的 `versionName` / `versionCode` | `2.0.0.2` / `2` | 第四段用于小版本；`versionCode` 必须**递增整数**（商店据此判断升级） |
| iOS | Xcode `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | `2.0.0` / `2` | ⚠️ App Store 只接受**最多三段**（`CFBundleShortVersionString`），故第四段折算到 build 号 |

发布新版本时的操作清单：

1. 改 `files/js/GameVersion.js`（如 `2.0.0.3`）→ 部署前端与 `server/version.json`（老客户端即会收到更新提示）
2. Android：`versionName` 同步为 `2.0.0.3`，`versionCode` +1（`3`）
3. iOS：`MARKETING_VERSION = 2.0.1`（或与 Android 前三段一致），`CURRENT_PROJECT_VERSION` +1
4. `package.json` 的 `version` 同步，然后按 §2 重新 `build:web` 并部署

## 7. 可选增强：关键存档双写（@capacitor/preferences）

`@capacitor/preferences@8.0.1` 已作为依赖安装并已 sync 到 iOS/Android 原生工程。当前版本沿用 localStorage 存储闯关进度、ELO、昵称等数据（打包产物中实测工作正常）。

若商店测试或用户反馈出现「进度丢失」（通常发生在系统清理 WebView 数据时），可启用双写兜底：

1. 在前端增加一层薄封装：写入时同时写 localStorage 与 Preferences，读取时以 localStorage 为主、缺失时从 Preferences 恢复
2. 关键 key 清单：闯关进度、ELO 分值、昵称、竞速最佳成绩、音量设置

> 说明：本项目为免构建（无 bundler）的静态脚本架构，浏览器 ESM 无法解析 `@capacitor/core` 裸模块名，因此未直接 `import` 该插件；接入时建议使用原生 runtime 注入的 `Capacitor.Plugins.Preferences`，或在 scripts/build-web.js 中内联该插件的 UMD 产物。

## 8. 发布前检查清单

- [ ] `npm run build:web` 重建，且 `node scripts/smoke-mobile.cjs` 全部通过（当前 14/14）
- [ ] `npx cap sync` 后 iOS/Android 原生工程可编译
- [ ] 真机验证：iPhone（小屏/大屏）、Android（高低分辨率）、iPad 各至少 1 台
- [ ] 联机对战（排位+休闲）、竞速联机、排行榜、公告在 App 内实测通过
- [ ] 断网/弱网下的提示与重连表现
- [ ] 后台切换 10 分钟后返回：BGM 恢复、倒计时不漂移、P2P 重连提示正常
- [ ] 隐私政策（docs/PRIVACY-POLICY.md）已部署到可访问 URL，且内容与实际数据行为一致
- [ ] 服务端已按 §5 第 3 条将 TURN 改为限时凭证（否则凭证随安装包装外泄）

## 9. Android APK 一键构建与安装（验收用）

仓库自带 JDK 21 / Android SDK / Gradle 8.14.3（`tools/` 下，不依赖系统全局配置），一条命令出调试包：

```powershell
# 仓库根目录（默认会先 npx cap copy android 同步 www/ 产物）
powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1

# 可选参数
scripts\build-android-apk.ps1 -Clean      # 先 clean 再构建
scripts\build-android-apk.ps1 -SkipCopy   # 已同步过 www/ 时跳过拷贝
```

- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 36 MB，debug 签名，可直接安装）
- 安装：
  - 数据线：`adb install -r android\app\build\outputs\apk\debug\app-debug.apk`
  - 传文件：把 APK 传到手机，允许「未知来源」后点击安装
- 上架正式包（AAB）见 §3.3：`./gradlew bundleRelease`（需先配置 `keystore.properties`）

> 说明：APK 内的 Web 资源来自 `www/`（`npm run build:web` 产物）。每次改前端后必须重新 build → copy → 构建 APK，否则手机端仍是旧代码。

## 10. 安全加固结论（2026-09 本轮）

按「先判定存在与否，存在则加固」逐项结论与残留风险：

| # | 风险项 | 结论 | 处置 |
|---|--------|------|------|
| 1 | 关卡导入 `new Function` 执行任意 JS | **存在** | 改为 `fnParseRelaxedJson()` 只解析数据字面量（拒绝函数调用/标识符/表达式），并对关卡做字段白名单 + 长度/数量上限裁剪 |
| 2 | Summa 表达式 `new Function` 副作用 | **存在** | 改为 `SafeExpression.parse()`（白名单标识符 + 既有 `FunctionParser` 求值），解析失败即按非法处理 |
| 3 | `state_sync → functionHistory → tooltip` 的 innerHTML 注入 | **存在** | 服务端入口 `_sanitizeFunctionHistory()` 校验结构/去控制字符/限长；渲染层 `tooltip` 改用 `FnEscapeHtml` |
| 4 | 战报 `expression` innerHTML 注入 | **存在** | 战报表单（回合/双方/坐标/锁元素/表达式/结果/分值）全部 `FnEscapeHtml` |
| 5 | 昵称未转义进入 innerHTML | **部分存在** | 榜单/房间昵称此前已有 `_escapeHtml`/`_rbEscapeHtml`；本轮补齐：P2P/观战昵称统一走 `_sanitizeDisplayName()`（去控制字符 + 限长 32），结算弹窗全部转义 |
| 6 | 编辑器关卡列表 `${lvl.id}` 未转义 | **存在** | 改为 `FnEscapeHtml(lvl.id)`；导入包字段白名单兜底 |
| 7 | P2P 对局分数/胜负可被对端单方面伪造 | **存在（客户端不可信）** | 服务端新增双向结果一致性核对：同一 `roomCode` 双方上报换算为「绝对胜者身份键」后比对，不一致记 `[LB][CHEAT]` 且本次不计分 |
| 8 | HMAC 签名密钥硬编码在前端 | **存在** | 服务端随 `challenge` 下发会话密钥（`HMAC(主密钥, nonce‖连接标识)`，随 nonce 一次性作废）；前端 `VerifyCrypto.setSessionKey()` 优先使用；服务端双候选校验（旧客户端回落主密钥，灰度兼容） |
| 9 | 闯关 LR∑/彗星榜可直连 WS 伪造刷分 | **存在（已有闸门，无法根除）** | 保留并加强：一次性 nonce + HMAC 验签 + IP 频率闸门 + 核验退避 + 举报；本轮密钥升级为会话级。**残留**：纯 JS HMAC 可被离线复现，根除需服务端权威判定/回放（另立专项） |
| 10 | 竞速 `solvedCount`/难度下限仍由客户端声明 | **存在（部分缓解）** | `rsc` 由服务端权威计分（服务端算 delta）；`rtN` 必须绑定服务端计时会话 + 用时 ≥ 难度下限 + 会话一次性。**残留**：`solvedCount` 仍由客户端声明，需完整对局回放校验（另立专项） |
| 11 | 无 CSP 且本地 vendor 失败时从 CDN 拉脚本 | **存在** | 移除 `P2PController` / `RaceRoomController` 的 unpkg 回退（只加载 `files/vendor` 本地副本，失败显式报错）；`index.html` 增加 CSP meta（脚本/样式仅 `'self'` + `'unsafe-inline'`，连接仅本站与 WSS） |

统一出口（全仓复用）：

- `FnEscapeHtml(str)`：`innerHTML` 拼接任何变量前的转义出口（定义于 `files/js/FunctionParser.js`）
- `SafeExpression.parse(expr)`：受限表达式求值（白名单 + `FunctionParser`，替代 `new Function`/`eval`）
- `UIController.prototype._sanitizeDisplayName(name)` / `GameController._sanitizeFunctionHistory(list)`：不可信入参净化

回归与验证入口：

```bash
python tests/server_auth_lobby_test.py     # 鉴权/大厅/喊话 29 项
python tests/server_race_chat_test.py      # 竞速/榜单/在线人数去重 40 项
node scripts/e2e-race-room.cjs             # 真实浏览器 33 项（含 floor 预览、键盘模糊、安全出口、CSP、会话密钥）
```
