# Goal — 函数棋（Function Chess）项目目标与对接手册

> 本文档用于项目交接 / 后续开发。记录项目现状、架构、踩过的坑、已做决策、待办目标。
> 维护建议：每完成一个重要节点，更新「当前状态」与「下一步目标」两节即可。
> 最后更新：2026-07-29

---

## 0. 一句话概览

**函数棋**是一款「数学函数 + 策略对战」的网页益智游戏：玩家构造数学函数表达式，让其图像穿过对手布下的**目标格**得分、避开**禁止区**。表达式越短得分越高。纯前端静态站点（HTML+Canvas+原生 JS），无构建步骤；联机对战另需一个 PeerJS 信令服务器（`server/`）。

---

## 1. 技术栈

| 项 | 说明 |
|----|------|
| 前端 | 原生 HTML5 + Canvas 2D + 原生 ES6 JavaScript（**无框架、无打包器、无 npm 依赖**） |
| 渲染 | `FunctionRenderer.js` 自研：tokenize → 递归下降解析 → 复数 AST 求值 → 折线采样绘制（含 geogebra-lite 采样/裁剪思路） |
| 数学引擎 | `FunctionParser.js`（复数运算、隐式乘法、支持 `π / e / i`、sin/cos/tan/abs/ln/sqrt、^ 乘方、! 阶乘） |
| 持久化 | `localStorage`（`GameHistoryService` / `AIPersistence`），闯关进度自动保存 |
| 联机 | PeerJS P2P（`P2PController.js`），信令由 `server/` 提供 |
| AI 对手 | `files/js/ai/` 下 9 个模块（Summa），含约束管理、表达式生成、目标选择、学习系统 |
| 资源 | `files/` 下 13 个 mp3（音效）、12 个 png（图标/素材） |

**运行方式**：直接用浏览器打开 `index.html` 即可（本地对战 / 人机 / 闯关 / 测试模式）。
**联机对战**：需 `cd server && npm install && npm start`，访问 `http://localhost:9000` 验证，再在游戏内「对战 → 联机」创建/加入房间。

---

## 2. 目录结构与模块职责

```
函数棋/
├── index.html                # 入口；按顺序加载所有 <script>；DOMContentLoaded 初始化各控制器
├── 游戏规则.txt              # 规则说明文档（注意：游戏内不加载此文件，仅给人看）
├── 问题清单与待解决项.md      # 本轮 10 项 bug 的排查/决策/修复记录（交接必读）
├── Goal.md                   # 本文档
├── files/
│   ├── css/style.css
│   ├── js/
│   │   ├── GridSystem.js         # 坐标系 / 棋盘 / 单位↔像素换算 / 扩展采样点求值
│   │   ├── CollisionDetector.js  # 命中判定（折线采样 + 自适应像素容差）
│   │   ├── FunctionRenderer.js   # 函数绘制 + AST 求值（核心渲染）
│   │   ├── FunctionParser.js     # 复数 AST 解析/求值引擎（全局 class FunctionParser）
│   │   ├── ComplexMath.js        # 复数运算
│   │   ├── GameController.js      # 回合状态机核心（选目标/设禁区/锁元素/输入/判定/计分）
│   │   ├── UIController.js        # 输入面板、表达式构建、事件绑定、UI 清空
│   │   ├── GameHistoryService.js  # 历史记录/已用格子持久化
│   │   ├── RaceMode/              # 竞速模式（RaceModeController / RaceModeManager）
│   │   ├── ai/                    # AI 对手 Summa（9 个模块）
│   │   ├── P2PController.js       # 联机信令客户端
│   │   ├── SummaTrainer.js        # AI 训练入口
│   │   ├── campaignLevels.js      # 闯关关卡数据（81+ 关）
│   │   ├── ExpressionAnalyzer.js  # 表达式复杂度/简洁度分析
│   │   ├── 函数复杂度运算/         # 复杂度分析子模块
│   │   ├── AudioManager/ResponsiveLayout/LevelEditorExtension/...
│   │   └── （位图/比特流编解码：BitmapCodec/BitStream/HybridMapCodec/SeedCrypto — 存档/种子相关）
│   └── ...
└── server/                       # PeerJS 信令服务器（独立 npm 项目，含 README.md）
```

**核心初始化顺序**（`index.html` 约 506 行起）：
```
gridSystem = new GridSystem('game-canvas')
gameController = new GameController()
uiController = new UIController(gridSystem, gameController)
uiController.raceModeManager = new RaceModeManager()
```

---

## 3. 当前项目状态

### 3.1 已完成（近期一轮修复，2026-07）
针对「非 P2P」逻辑排查的 10 项问题已全部处理完，详见 `问题清单与待解决项.md`：

| 序号 | 问题 | 处理结果 |
|------|------|----------|
| ① | 禁止区规则文本与代码矛盾（「前4回合无禁区」vs「第1–8回合最多1个」） | ✅ 改 `游戏规则.txt` 对齐代码（回合1起即可设禁区），未改代码 |
| ② | `GridSystem` 正则顺序 `exp`/`e` 互相破坏 | ✅ 随 ⑧ 改用 AST，根源消除 |
| ③ | `resetGame()` 漏重置 `elementLockCounts`（锁定计数跨局泄漏） | ✅ 在 `resetGame` 补 `new Map()` |
| ④ | `startTimer` 守卫笔误（`this.timer` 未定义） | ✅ 核查当前代码已无此 bug，无需改动 |
| ⑤ | 容差单位「规则单位」vs「代码像素」不一致 | ✅ 决策维持现状（方案 b，宽松手感，零 UX 风险） |
| ⑥ | 死代码 `RoundStateMachine.js`（与 `GameController` 双份实现，0 引用） | ✅ 已删除文件 + 移除 `index.html` 引用 |
| ⑦ | `1/x` 竖直渐近线「假穿越」 | 🚫 误报，已由 `FunctionRenderer` 的二分断点算法（`_isJumpDiscontinuity`）解除，排除 |
| ⑧ | `evaluateExpression` 用 `eval`+正则（缺 `π/i` 映射、注入风险） | ✅ 改用 `FunctionParser` AST 求值 + AST 缓存 |
| ⑨ | 容差/采样阈值两处各算一份 | ✅ 新增 `GridSystem.pxPerUnit`/`cellSizePx` 单一换算源 |
| ⑩ | 竞速 fail 重输命中字段残留 | ✅ 竞速失败分支内联重置 `hitTargets/hitTarget/hitForbidden` |

**代码校验**：上述改动 `read_lints` 无报错。
**Git 状态**：上述改动目前均为**未提交**（working tree 改动），交接前建议评审并 commit。

### 3.2 仍在运行 / 大体可用
- 本地对战、人机对战（Summa）、闯关模式、测试模式
- 函数渲染、命中判定、简洁度评分
- 闯关进度自动保存
- 联机信令（需起 `server/`）

---

## 4. 踩过的坑 / 重要注意事项（务必看，避免重蹈覆辙）

1. **`游戏规则.txt` 在游戏内完全不被加载**（全仓 0 处读取 `.txt`）。改这个文件**不会改变任何玩法/判定/显示**，玩家零感知。它只是给维护者/展示看的说明文档。→ 别指望靠改规则文本来改行为，要改行为必须改代码。

2. **容差「单位 vs 像素」是个陷阱**：规则写「0.8×5/范围」是数学单位，但代码直接当像素用。若严格把 0.8 单位换算成像素再「向内收缩」格子，range=5 时命中区会缩到中心约 12×12px，**判定骤难、玩家挫败**，是负向 UX。已决策维持现状（宽松、穿过即命中）。

3. **`FunctionParser.js` 的脚本加载顺序**：`index.html` 中 `FunctionParser.js`（约 456 行）**晚于** `GridSystem.js`（约 451 行）加载。但 `GridSystem.evaluateExpression` 是**运行时惰性** `new FunctionParser()`，所以能正常工作。⚠️ 若有人把 `evaluateExpression` 改成「构造函数里 `new FunctionParser()`」，会因加载顺序报错，务必保持惰性实例化（或把 `FunctionParser.js` 提到 `GridSystem.js` 之前）。

4. **两套表达式清理机制并存**：普通本地回合靠 `switchPlayer → resetRoundState` 清 `functionExpression`；竞速重试靠内联 `''` + `emit('forceClearExpression')`。改其中一处时另一处容易漏，建议日后抽统一 `prepareInputPhase()`（见待办）。

5. **`RoundStateMachine.js` 是死代码陷阱**：它是一份完整但**从未被实例化**的回合状态机（全仓 `new RoundStateMachine` = 0）。维护时若看到它的方法（`nextPhase`/`submitFunction` 等）**不要去改它**——真正运行的是 `GameController` 里的方法。已删除，但提醒后人：不要在别的文件里误引用它。

6. **AI 求值路径**：普通对局与 AI 早已用 `FunctionRenderer` 的 AST；只有「测试模式缩放」这条 `GridSystem.evaluateExpression` 旧走 `eval`（现已随 ⑧ 改 AST）。排查 `null`/静默失败时先确认是哪条求值路径。

7. **竖直渐近线**：`1/x` 这类在 `FunctionRenderer` 里用「二分取中点验证（`_isJumpDiscontinuity`，最多 32 次迭代）」断开伪连线，不要重复去「修复」这是个已解决点。

8. **闯关模式棋盘固定 20×20**，不随回合扩展（与本地对战的 ±5→±10 扩展不同），排查坐标相关 bug 时注意模式差异。

9. **`i`（虚数单位）与 `e` 是合法输入元素**：规则允许 `i²=−1`，键盘可输入 `π/e/i`。任何新的求值/解析代码都要覆盖这三个常量，否则会静默返回 `null`。

10. **无单元测试、无构建、无 lint 配置**：全靠人工 + 浏览器验证。改动后请手动走一遍相关模式（尤其 AI、竞速、闯关）。

---

## 5. 重要决策记录（含理由，便于回滚/续做）

- **⑤ 容差**：选择「维持现状/宽松」而非「严格规则单位」。理由：严格换算会让判定变难、损害体验；且 `游戏规则.txt` 不进游戏，文档口径问题不紧急。
- **① 规则文本**：选择「对齐代码」而非「让前4回合真正无禁区」。理由：用户要求本轮只改文本不碰代码；若日后想让「前4回合无禁区」生效，需改 `GameController.getMaxForbiddenCount()`（见待办）。
- **⑥ 死代码**：选择「删除」而非「合并到 GameController」。理由：全仓 0 引用，删除零风险，消除分叉隐患。
- **⑧/② 求值**：选择「复用 `FunctionRenderer` 的 `FunctionParser` AST」而非「修补正则」。理由：从根源消除正则顺序/`π/i` 缺失/注入三类问题，且普通对局早已验证该路径。
- **⑩ 竞速重试**：选择「内联重置命中字段」短期方案，未抽统一方法（留作待办）。

---

## 6. 下一步目标 / 待办（TODO）

### 6.1 高优先级（建议紧接着做）
- [ ] **提交当前未提交的修复**（git commit），含 ① 文本 + ⑥ 删文件 + ②③⑧⑨⑩ 代码。
- [ ] **抽统一 `prepareInputPhase()`**：让普通回合与竞速重试共用表达式/命中字段清理逻辑，消除 ⑩ 提到的两套机制分叉。
- [ ] **评审 `getMaxForbiddenCount()`**：是否要让「前4回合无禁区」真正生效？若用户想要，需在此函数加 `if (this.currentRound <= 4) return 0;`（并同步确认 `游戏规则.txt` 已表述一致）。

### 6.2 中优先级（健壮性 / 一致性）
- [ ] **规则文本容差描述**：把规则里「0.8 像素」那句顺手标注为「像素级容差」，与代码自洽（可选）。
- [ ] **`startTimer` 遗留笔误**：虽当前无 `this.timer` 守卫、非 bug，但 `if (this.timeLeft > 0 && this.timer)` 仍为误导性死代码，可清掉改为 `this.timerInterval`。
- [ ] **统一几何换算真源落地**：`GridSystem.pxPerUnit`/`cellSizePx` 已建，后续 `FunctionRenderer` 的线宽/采样密度应逐步改为从同一源派生，保证「看到的」与「判定的」完全一致（⑨ 的结构性收尾）。
- [ ] **增加基础回归测试**：至少覆盖 `FunctionParser` 的 `exp/e/π/i`、`CollisionDetector` 边界命中，避免再次引入正则类 bug。

### 6.3 低优先级 / 功能向
- [ ] **闯关模式 70–81 关「专家 ???」难度**：规则里仍为 `???`，待补关卡设计与说明。
- [ ] **AI Summa 训练/评估**：`SummaTrainer.js` + `ail/`，可评估 AI 在不同难度的胜率与表达质量。
- [ ] **联机对称 NAT**：`server/` 仅信令无 TURN，对称型 NAT 无法直连，需在 `P2PController.js` 配置 TURN。
- [ ] **移动端/响应式**：已有 `ResponsiveLayout.js`，可进一步验证小屏体验。
- [ ] **历史格子 `usedCells` 逻辑复核**：规则说历史格子半透明不可再选，确认各模式行为一致。

---

## 7. 对接 Checklist（新人/新会话起步）

1. 通读 `游戏规则.txt` 与本文档第 4 节（坑）。
2. 打开 `问题清单与待解决项.md`，确认 10 项状态与理由。
3. 浏览器打开 `index.html`，手动验证：本地对战一整局、人机一局、闯关 1–2 关、测试模式输入 `exp(x)`/`sin(x)`/`π*x` 确认渲染正确（验证 ⑧ 生效）。
4. 如需联机：`cd server && npm install && npm start`，游戏内创建/加入房间。
5. 改 `GridSystem`/`GameController` 相关求值或清理逻辑时，务必同步检查普通回合与竞速重试两条路径。
6. 任何改动后 `read_lints` 并手动走一遍对应模式；无单测，人工验证不可省。

---

## 8. 约定与规范（建议保持）

- 求值一律走 `FunctionParser` AST（`parse` + `evaluateAst`），**不要**再引入 `eval` + 正则字符串替换。
- 坐标换算统一从 `GridSystem.pxPerUnit` / `cellSizePx` 派生。
- 规则文本改动 ≠ 行为改动，需要改行为就改 `GameController`/`GridSystem` 等代码，并同步规则文档。
- 删除疑似死代码前，先全仓 grep 引用确认为 0。
- 保持「纯前端、无构建」特性，新增依赖需与项目主谨慎评估。
