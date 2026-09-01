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

```bash
keytool -genkeypair -v -keystore fnchess-release.keystore -alias fnchess -keyalg RSA -keysize 2048 -validity 10000
```

在 `android/` 下创建 `keystore.properties`（**切勿提交 git**）：

```properties
storeFile=../fnchess-release.keystore
storePassword=你的密码
keyAlias=fnchess
keyPassword=你的密码
```

### 3.2 配置签名（android/app/build.gradle）

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

### 3.3 构建产物

```bash
cd android
./gradlew assembleRelease     # APK：app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease       # AAB：app/build/outputs/bundle/release/app-release.aab（Google Play 必需）
```

### 3.4 Android 商店清单

- **Google Play**：AAB、targetSdk 36（已配置）、隐私政策 URL、数据安全表单（声明：收集昵称/战绩用于排行榜；不收集敏感信息）、应用图标 512×512、置顶大图 1024×500、手机截图 ≥2 张（建议 1080×2400）
- **国内商店（华为/小米/OPPO/vivo/应用宝）**：软著证书、ICP 备案号（游戏使用 p2p.shaihai.cn 域名服务）、隐私政策、未成年人保护说明、部分商店要求游戏版号（休闲单机+联机功能需评估，建议先以「工具/教育」类目或去掉联机的版本上架咨询）
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

## 5. 服务端配合事项（p2p.shaihai.cn）

App 内网络请求走三条路径：

1. **HTTP API（公告/版本/排行榜）**：已由 `CapacitorHttp.enabled=true` 经原生层转发，**不受 CORS 限制**，无需服务端改动。
   说明：实测 `p2p.shaihai.cn` 的 `/notice`、`/version` 等接口未返回 `Access-Control-Allow-Origin`，浏览器/App WebView 直接 fetch 会被拦截，必须依赖该原生转发。
2. **WebSocket（PeerJS 信令 / 匹配大厅 wss://p2p.shaihai.cn）**：WebSocket 不受 CORS 约束，但服务端若校验 `Origin` 头，需放行：
   - `capacitor://localhost`（iOS）
   - `https://localhost`（Android）
   - 建议：信令/大厅服务不校验 Origin，或将上述两个 origin 加入白名单。
3. **TURN 中继（124.222.7.170:3478）**：当前客户端硬编码长期凭证（`turnuser` / 固定密码）。**上架前服务端应改为限时凭证**（coturn REST API，App 启动时用 `/ice` 接口换取 username/credential，有效期建议 ≤1 小时），避免凭证随安装包外泄后被滥用中继流量。客户端已把 ICE 配置收口到 `P2PController.getIceServers()`，届时只需让该方法改为拉取服务端限时凭证即可，`RaceRoomController` 自动同步受益。

## 6. 版本号管理

- 前端版本：`files/js/GameVersion.js` 的 `GAME_VERSION`（服务器版本检查依此）
- Android：`android/app/build.gradle` 的 `versionCode`（递增整数）与 `versionName`
- iOS：Xcode 的 `MARKETING_VERSION` 与 `CURRENT_PROJECT_VERSION`
- 三者发布时必须同步递增

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
