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
