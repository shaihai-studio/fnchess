# 函数棋项目长期记忆

## 项目概述
函数棋是一款"数学函数+策略对战"的纯前端网页游戏（HTML5 Canvas + 原生 ES6 JS，无框架/无打包器/npm依赖）。联机对战需额外启动 PeerJS 信令服务器。

## 关键约定
- 如果要引用 image/ 目录下的图片，必须先复制到 assets/icons/ 并改为纯英文名
- 游戏规则.txt 游戏内完全不加载（0 处读取），改规则必须改代码
- FunctionParser.js 加载顺序晚于 GridSystem.js，evaluateExpression 必须惰性实例化 new FunctionParser()
- 容差「单位 vs 像素」有坑：规则写数学单位，代码当像素用。已维持宽松。
- RoundStateMachine.js 已删除，不要误引用。
- 闯关棋盘固定 20×20，本地对战是 ±5→±10 扩展。
- i、e、π 是合法输入常量。
- KaTeX 已本地化到 files/vendor/katex/（0.18.1，katex.min.js/css + fonts，约1.37MB），index.html 已引 katex.min.css（head）+ katex.min.js + MathLatex.js（script）。表达式区有 KaTeX 数学预览（#math-preview）和输入区 token 级美化。

## 重大架构决策
- 2026-07-30 P2P 联机对战 UI 整改：① 断线弹窗只剩"返回主菜单"按钮，已移除三按钮/等待横幅和 `_retryP2P/_p2pWaitForOpponent/_hideP2PWaitBanner` 三个方法；② P2P 子模式下主页三 stepper 视觉禁用（lockSelectors 条件新增）；③ P2P 弹窗加左侧独立三选项（难度/回合数/时间限制），独立索引 `_p2pCurrent*Index`，初值同步自主页当前值，发给访客的 `sendGameInit` payload 多带一个 `timeLimitMode`，guest 在 onGameInit 中赋值给 `gameController.timeLimitMode`。
- 2026-07-29: 抽取统一 prepareInputPhase() 方法，消除两套表达式清理机制分叉。GameController 统一管理模型清理+事件通知+阶段切换，UIController 只做 UI 侧 clearExpression()。forceClearExpression 事件已废弃移除。
- 2026-07-29: UIController.js 模块化拆分。原 6405 行巨类拆为瘦壳 `files/js/UIController.js`（仅 class 定义+constructor+字段/箭头字段+getter/setter）+ 10 个原型扩展模块 `files/js/ui/*.js`（UIModals/UIStart/UIInput/UICanvas/UIPhase/UICampaign/UIRace/UIP2P/UILevelEditor/UICore，共 222 个方法）。机制：每个模块用 `UIController.prototype.x = function(){...}` 把方法挂回原型，浏览器经典脚本共享词法全局，行为与单文件完全一致。加载顺序：index.html 中 `UIController.js` 之后、内联 `new UIController()` 实例化之前，按顺序插入 10 个 ui 模块 script 标签。注意：项目无打包器/无 ES Module，勿改用 import/export；若需重新拆分，必须先 `git checkout` 还原原 UIController.js（脚本对瘦壳重跑会出错）。原文件有 2 对重复方法名（startRaceElapsedTimer/stopRaceElapsedTimer 各定义两次，后者覆盖前者），属历史遗留，拆分时原样保留。
- 2026-08-04 竞速在线榜重做（用户决策）：在线竞速榜（tt 榜）主维度改为「速度榜 Time Attack」，不再用封顶 150 的 TTΣ 星分。新增 `UIController.calculateTTSpeed()`：速度值 = round(3000000 / 有效总时长)，有效总时长 = Σ各关最佳时间 + 未通关关×300s 惩罚；永不封顶、越快/越全通越高。竞速通关后通过 `_leaderboardService.submitTTSpeed()` 上报（boardType 仍为 'tt'，服务端未改）。用户明确：暂不做服务端权威计分/防刷榜（只改前端计分与展示）。index.html tab 改名「竞速速度榜」，展示加「速度」后缀、我的名次标签改「竞速速度值」。
- 2026-08-06 ELO 计分 Bug 修复：`_submitP2PELO`（UICore.js:940）原先从 scores 自行推算 winner，忽略了 GameController 的 `forcedWinner`（如连续超时判负）。改为 `data.winner || (scoreA > scoreB ...)` 优先使用 authoritative winner，解决"比分领先者超时判负时 ELO 反加分"问题。
- 2026-08-06 休闲模式断线弹窗误显示 ELO 文案 Bug 修复：`_showP2PDisconnectModal`（UIP2P.js:780）文案原为硬编码 ELO（"对手/你中途退出…将扣除 ELO 积分"），休闲模式访客收到房主解散（_onRoomDissolved）或 Peer 断开时误显示。修复：按 `_p2pMatchMode === 'casual'` 切换文案，访客+对局中+true → "房主已解散房间"；onDisconnected 休闲分支若 `_p2pRoomDissolved` 已 true 则直接 return 避免重复弹窗。
- 2026-08-05 竞速在线榜改为【方案 A：分关 Time Attack 榜】（用户拍板）。原因：20-30 关综合速度=20min 马拉松，且 21/22/27 三个墙关（forbidden 200~300）单关就占 25~50%，比的是耐力而非手速，劝退。落地：① 服务端 `server/index.js` 把 `leaderboards{lr,tt,elo}` 重构为动态 `scoreBoards` + `eloBoard`，新增 `rtN` 分关榜（N=关卡号），`boardOrder()` 对 rtN 升序（用时短者优）、取最短用时；`handleSubmitScore` 接受 `rt\d+`，校验 1s~1e6s，IP 风控保留；`handleQueryLeaderboard` 支持任意分榜动态排序与落盘（load/save 改为遍历 scoreBoards）。② 客户端 `LeaderboardService.submitRaceTime(levelId, seconds, nickname)` → boardType `rt{level}`；`UIRace.showRaceVictory` 每关通关后上报该关最佳用时（取更短，localStorage 去重键 `function_chess_rt_last_{lv}`），不再报综合速度值；`UILeaderboard` 新增竞速分关关卡选择器（下拉 1~maxOpenRaceLevel，默认定位当前关），tt 标签映射到 `rt{cur}` 查询、渲染用时带 s、我的名次标签「第 N 关 用时」。③ index.html tab 改名「竞速分关榜」，加选择器 UI + CSS。注意：旧的 `tt` 星分榜（≤150）仍保留在服务器作为历史榜，新分关榜独立。`calculateTTSpeed`/`submitTTSpeed` 已无调用（仅 `calculateTTSpeed` 残留在 UICore.js 作本地统计，无害）。防刷榜仍按用户 08-04 决策暂缓。
