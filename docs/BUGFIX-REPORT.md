# 函数棋 全量审计与 Bug 修复报告

日期：2026-08-31　版本：v2.0.0.2 → App 化改造

---

## 一、App 化改造中已修复的问题

| # | 级别 | 文件 | 问题 | 修复 |
|---|------|------|------|------|
| 1 | P0 | files/js/GridSystem.js | 主棋盘未处理 devicePixelRatio，手机高分屏（DPR 2-3）棋盘点格、网格线、刻度文字整体模糊 | 引入 cssSize/dpr 双轨制：物理像素 = CSS 像素 × dpr（上限 3），ctx.setTransform 统一映射，全部绘制/坐标换算走 CSS 像素逻辑单位；新增 eventToCanvas() 统一事件坐标换算 |
| 2 | P0 | files/js/ui/uicore/UICoreEvents.js、UICanvas.js | 棋盘 hover 依赖 mousemove，触屏无悬停概念且点按瞬间会误写 title/cursor；三处事件坐标换算各自手写易错 | hover 迁移至 pointermove 并按 pointerType 过滤（仅鼠标）；坐标换算统一收口到 gridSystem.eventToCanvas() |
| 3 | P1 | files/js/ui/UICanvas.js | 测试模式缩放仅支持桌面滚轮，触屏无法缩放坐标系 | 新增双指捏合缩放（pointer 事件跟踪双指距，25% 阈值步进，trailing 合并重绘） |
| 4 | P1 | files/css/style.css #game-canvas | touch-action: manipulation 导致双指手势被浏览器劫持、双击可能缩放页面 | 改为 touch-action: none，棋盘触控完全由 JS 接管 |
| 5 | P1 | files/js/ui/UIEditor.js | 关卡编辑器「右键=禁止格」在触屏无对应手势，移动端无法放置禁止格 | 新增触屏长按（>500ms、位移≤8px）放置/取消禁止格，触发后抑制后续 click 并震动反馈 |
| 6 | P1 | files/js/ui/UILeaderboard.js | 首次进入昵称弹窗在页面加载 900ms 后无条件弹出；用户快速开局后弹窗遮挡棋盘，且对局计时器在弹窗期间继续走导致超时扣分 | 弹窗改为检测到对局进行中（开始界面已关闭）时每 3s 轮询推迟，回到主菜单再弹 |
| 7 | P1 | files/js/ui/uicore/UILobbyWatch.js | 「匹配大厅速览」浮窗默认展开，横屏小屏（如 844×390）遮挡主界面「竞速模式」按钮 | 无用户偏好时小屏/矮屏默认收起为迷你胶囊；修复 _lwSetVisible(true) 无前置快照时强制展开的问题（改为尊重当前状态） |
| 8 | P2 | files/css/style.css #main-mode-toggle | iPad 竖屏（≥768px 宽）模式按钮被强制 1×4 单列，页面中上部大片空白 | 竖屏单列断点增加 max-width:767px 限制，iPad 竖屏恢复 2×2 网格 |
| 9 | P2 | files/js/ui/UIFloatKeypad.js | 手机竖屏输入函数时悬浮键盘展开遮挡棋盘下半部 | 小屏触屏（pointer:coarse 且 ≤767px）首次进入输入阶段默认收起为 FAB 圆形按钮，用户手动展开/收起后尊重其选择 |
| 10 | P2 | files/js/ui/UIInput.js | 键入表达式时每个字符都触发 KaTeX 全量排版，低端机输入卡顿 | 新增 LRU 缓存（60 条，按 latex 字符串键），相同公式零重复排版 |
| 11 | P2 | files/js/AudioManager.js | App 退后台后 BGM 被系统暂停、AudioContext 挂起，回前台无声 | visibilitychange 监听：回前台自动恢复 BGM 播放并 resume AudioContext |
| 12 | P2 | index.html | 触屏设备触发无意义的磁性吸附/光晕计算；缺 favicon（404）；缺 theme-color 等 App 元信息 | 磁性/光晕按 pointer:fine 守卫；新增 favicon（64px）、apple-touch-icon、theme-color、mobile-web-app-capable 等 meta |
| 13 | P2 | files/css/style.css | 触控目标尺寸不足 44px 的控件（stepper 箭头/页签/返回圆钮等）；WKWebView 输入框聚焦自动放大；小屏模态框内边距过大 | @media (pointer:coarse) 统一提升触控目标 ≥44px、输入控件字号 16px、禁用 hover 粘滞；≤480px 模态框收窄内边距并适配 safe-area 底部 |
| 14 | P2 | files/css/editor.css | 编辑器画布触屏绘制时可能触发浏览器滚动/选中；dpad 仅 30px | #gridCanvas touch-action:none + 禁止选中/长按菜单；pointer:coarse 下 dpad/工具按钮放大至 44px |
| 15 | P1 | p2p.shaihai.cn / Capacitor | 实测公告/版本接口无 Access-Control-Allow-Origin，App 内（capacitor://localhost / https://localhost origin）fetch 必被 CORS 拦截 | capacitor.config.json 启用 CapacitorHttp（enabled:true），App 内全部 fetch 经原生层转发绕过 CORS；WebSocket 信令不受 CORS 约束（服务端需不校验或放行 Origin，见 RELEASE-GUIDE §5） |

## 二、打包工程问题

| # | 问题 | 修复 |
|---|------|------|
| 16 | 86 个 script 标签逐个请求，WebView 冷启动慢 | scripts/build-web.js 按加载顺序合并为 9 个 bundle（ASI 安全分隔），构建产物 33.5MB，浏览器实测 0 错误 |
| 17 | capacitor.config.ts 与 TypeScript 7 不兼容导致 cap 命令失败 | 改用 capacitor.config.json |
| 18 | @capacitor/assets 依赖 sharp 二进制下载失败（网络受限） | 改用 System.Drawing 离线生成全部图标/启动屏（scripts/gen-assets.ps1） |
| 19 | iOS 上架合规缺口 | Info.plist 补 ITSAppUsesNonExemptEncryption=false、arm64 能力声明、zh_CN 区域；Android 自适应图标背景改品牌深色 #0B1020 |

## 三、全量静态审计清单（code-explorer 子代理）与修复状态

审计范围：files/js 下 86 个 JS + 5 个 CSS，静态审计维度含触控缺失、内存泄漏、定时器管理、事件解绑、边界条件、CSS 断点缺口。结果：P0 零项、P1 七项、P2 十三项（另有 @media 断点清单、网络地址清单、定时器清单三个附录）。

### P1（全部已修复）

| # | 问题 | 修复 | 状态 |
|---|------|------|------|
| A1 | GridSystem.js resize() 未处理 devicePixelRatio → 全移动端/iPad 棋盘与曲线发虚 | cssSize/dpr 双轨制 + setTransform 映射 + eventToCanvas() 统一坐标换算 | ✅（同第一节 #1） |
| A2 | UICoreEvents.js 监听 'devicechange'（媒体设备插拔事件）重建元素面板 → 旋转永不触发 | 改为 orientationchange + resize（250ms 防抖） | ✅ |
| A3 | RaceRoomController.js 静态调用 P2PController 实例方法 `_fetchIceServers` → 恒为 undefined，联机竞速丢失 TURN，严格 NAT/国内网络必连不上 | 抽 `P2PController.getIceServers()` 静态方法，两个控制器共用同一 ICE 配置 | ✅ |
| A4 | P2PController.js TURN 账号密码硬编码（长期凭证） | 客户端无法根除：新增 `getIceServers()` 集中配置并注释，服务端需改为限时凭证下发；已写入 RELEASE-GUIDE 服务端章节 | ⚠️ 需服务端配合 |
| A5 | 主棋盘仅 click/mousemove，触屏无 pointer 事件：历史函数气泡移动端不可达、测试模式无触屏缩放 | hover 迁移 pointermove（按 pointerType 过滤）、测试模式新增双指捏合缩放、touch-action:none | ✅（同第一节 #2、#3、#4） |
| A6 | GameController 倒计时用 setInterval 递减 → 切后台回前台计时不准（后台节流） | 四处计时器改为 deadline 时间戳驱动（`_timerDeadline` / `_targetDeadline`），回前台首帧校正 | ✅ |
| A7 | UIEditor.js 无防护使用 structuredClone → 旧 Android WebView（<98）编辑器整体崩溃 | 引入 `_deepClone` 封装（structuredClone 优先，JSON 深拷贝兜底），6 处调用统一替换 | ✅ |

### P2（已修复项）

| # | 问题 | 修复 |
|---|------|------|
| B1 | AudioManager.setBgmVolume 漏乘 masterVolume，主音量改动后 BGM 音量不联动 | `volume = masterVolume * v` |
| B2 | 逐字语音 playSummaTalkSequence 的 setTimeout 不可取消（弹窗关闭后仍继续发声/叠音） | 引入 `_talkSeqId` 序列令牌，旧序列定时器全部失效；新增 `stopSummaTalk()` |
| B3 | LeaderboardService 500ms flush 定时器常驻空转 | 改为按需启停（入队时启动，队列清空时 clearInterval） |
| B4 | 两个控制器 PeerJS 加载源/版本不一致（本地 1.5.2 vs CDN 1.5.4，竞速优先远程加载） | RaceRoomController 统一为：本地 vendor 1.5.2 → 信令服务器副本 → CDN 1.5.2 |
| B5 | 生产包含大量 console.log | scripts/build-web.js 打包时剥离 console.log（参数仍求值，保留 warn/error/info） |
| B6 | 构建脚本 www 清理受目录占用/系统删除策略影响导致中断 | rmrf 增加逐项删除降级与告警，构建不中断 |

### P2（已评估、保持现状）

| # | 问题 | 决策 |
|---|------|------|
| C1 | 约 130 条 :hover 规则无 `@media (hover:hover)` 包裹 | 已在 `@media (pointer:coarse)` 中禁用主要按钮/模式卡片的 hover 位移与抬升，消除触屏粘滞；逐条包裹 130 条规则改动面过大、回归风险高，维持现状 |
| C2 | bindEvents/initUI 中大量无防护 `getElementById().xxx` 链式调用 | 均为静态 id，页面结构固定，缺失即为空实现错误；保持现状，冒烟脚本已覆盖主流程无未捕获异常 |
| C3 | tmp_test_server_check.cjs 等测试脚本 | 不在 files/ 目录，build-web 只拷贝 index.html + files/，永不进入 App 包 |

## 四、验证记录

- 2026-09-01 scripts/smoke-mobile.cjs：**18/18 PASS**
  - iPhone 仿真（390×844、DPR=3、触屏）：DPR 渲染（1140 = 380×3）、触屏点按选格、进入输入阶段、悬浮键盘自动收起为 FAB、FAB 展开、KaTeX 预览、提交函数结算推进回合、控制台无未捕获异常
  - 6 视口布局（iPhone SE 375×667 / 15 Pro Max 430×932 / Android 360×800 / iPad 820×1180 / iPad 横屏 1180×820 / 手机横屏 844×390）：均无水平溢出
  - 横竖屏切换重排：390×844 → 844×390 → 390×844 棋盘 cssSize/物理像素正确重算（380×3 → 270×3 → 380×3），无溢出、无异常
  - 4 个模态框（闯关 / 竞速 / 排行榜 / 联机）在 390×844 下完整可见，无底部溢出
- 打包产物（www，9 个 JS bundle，含 console.log 剥离）在浏览器实测 0 错误
- `npx cap sync` 双平台同步成功（@capacitor/app、keyboard、preferences、splash-screen、status-bar 均已注入）
- 编辑器：触屏长按（>500ms）成功放置禁止格；示例关预置 (0,0.5)，长按新增 (0,0)

## 五、WebView 兼容性验证结论（Capacitor 混合壳）

| 能力 | 结论 | 处理方式 |
|------|------|----------|
| HTTP API（公告/版本/排行榜 fetch） | ⚠️ 实测 `p2p.shaihai.cn` 未返回 `Access-Control-Allow-Origin`，App 内 origin 为 `capacitor://localhost`（iOS）/ `https://localhost`（Android），直接 fetch 必被拦截 | 已在 capacitor.config.json 启用 `CapacitorHttp.enabled=true`，App 内 fetch 经原生层转发，**完全绕过 CORS**，服务端无需改动 |
| WebSocket（PeerJS 信令 / 匹配大厅） | ✅ WebSocket 不受 CORS 约束；风险仅在于服务端若校验 Origin | 服务端需放行 `capacitor://localhost` / `https://localhost`，或不做 Origin 校验（已写入 RELEASE-GUIDE §5） |
| WebRTC DataChannel | ✅ iOS WKWebView（iOS 14.3+）与 Android System WebView 均支持；本项目仅用 DataChannel 传棋局数据，不申请音视频权限 | 无需特殊处理；保留 TURN 中继兜底（见 A3 修复） |
| Android scheme | ✅ `androidScheme: https`（`https://localhost`），避免混合内容与 `file://` 限制 | 已在 capacitor.config.json 配置 |
| iOS ATS | ✅ 全链路 https/wss，无明文 HTTP | 无需配置 ATS 例外；Info.plist 已补 ITSAppUsesNonExemptEncryption |
| 音频自动播放 | ⚠️ WKWebView/Android WebView 禁止无手势播放 | 复用启动页点击手势解锁（splash 点击即触发）；另补 visibilitychange：回前台自动恢复 BGM 与 AudioContext |
| localStorage 持久化 | ✅ 已安装 App 的 WKWebView 数据随 App 沙箱持久化（非 Safari ITP 的 7 天限制） | 保持 localStorage；`@capacitor/preferences` 双写列为可选增强（RELEASE-GUIDE §7） |
| 输入/滚动行为 | ✅ `viewport-fit=cover` + `user-scalable=no` + 画布 `touch-action:none` | index.html 与 CSS 均已配置 |

> 说明：上述结论中「CORS 缺失」为浏览器实测取证；WebRTC/ATS/scheme 部分基于 Capacitor 官方行为与已完成的 `cap sync` 工程配置。**真机联机对战（两台设备互连）仍需在 TestFlight/内部测试阶段实测确认**，已列入 RELEASE-GUIDE 发布前检查清单。
