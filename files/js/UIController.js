/**
 * UIController 模块
 * 负责用户交互与界面更新
 * 管理拖拽、点击、显示等所有UI操作
 */
class UIController {

    // ===== 以下方法已拆分到 files/js/ui/*.js（原型挂载，运行时挂回 UIController.prototype） =====

    constructor(gridSystem, gameController) {
        this.gridSystem = gridSystem;
        this.gameController = gameController;
        this.parser = new FunctionParser();
        this.detector = new CollisionDetector(gridSystem); // 传入gridSystem以支持自适应容差
        this.renderer = new FunctionRenderer(gridSystem);
        
        // 初始化AI控制器
        this.aiController = new AIController(gameController, gridSystem);
        this.aiController.uiController = this; // 设置UIController引用
        
        // 初始化 Summa 角色
        if (typeof SummaCharacter !== 'undefined') {
            window.summaCharacter = new SummaCharacter('summa-container');
        }
        
        // 初始化P2P联机控制器相关属性
        this.p2pController = null;
        this.isP2PMode = false;

        // 移动端内联元素面板引用
        this.inlineElementsCard = document.getElementById('inline-elements-card');
        this.inlineElementsTabs = document.getElementById('inline-elements-tabs');
        this.inlineElementsBody = document.getElementById('inline-elements-body');
        
        // AI触发队列
        this.aiTriggerQueue = [];
        this.isProcessingAITrigger = false;

        // Modal 状态追踪（状态机：防止重复触发动画）
        this._modalStates = new Map();
        // 每-modal 独立的跳过回调标志（替代全局 _modalSkipCallback）
        this._modalSkipCallbacks = new Map();
        // 记录每个 modal 当前活跃的退场完成函数（用于强制取消）
        this._modalExitFinishers = new Map();

        // 游戏活跃标记（退出后设为 false，阻止 AI/计时器继续运行）
        this._gameActive = false;

        // 当前表达式
        this.currentExpression = '';
        this.expressionElements = [];
        
        // 光标位置（索引）
        this.cursorIndex = 0;
        
        // P2P：最近一次在远端绘制的函数表达式，避免重复绘制
        this._lastRemoteExpr = null;
        
        // P2P：表达式同步防抖计时器，避免输入过程中频繁发送 state_sync
        this._syncDebounceTimer = null;
        // P2P：周期同步定时器（每 0.2s 由当前玩家方主动推送一次完整快照）
        this._p2pSyncInterval = null;
        // P2P：健康监测（被动方等待对方回合超时 → 健康探测 + 多次补救 + 提示）
        this._p2pHealthTimer = null;
        this._p2pHealthChecking = false;
        this._p2pHealthRetryCount = 0;
        this._p2pHealthCheckAt = 0;
        this._p2pWaitStartAt = null;
        this._p2pLastTimerVal = null;
        this._p2pStallWarnedAt = 0;
        
        // 拖拽状态
        this.draggedElement = null;
        
        // 初始化UI
        this.initUI();
        this.bindEvents();
        this.bindGameEvents();
    }
    
    /**
     * 初始化UI元素引用
     */
    
    // ─────────────────────────────────────────────────────────
    //  界面切换过渡动效辅助方法（状态机版）
    // ─────────────────────────────────────────────────────────

    /**
     * 获取 modal 当前状态
     */


    /**
     * 显示一个 modal（带入场动效）— 状态机保护，防重复触发
     * @param {HTMLElement|string} modal - DOM 元素或 ID
     * @param {string} [display='flex']  - 目标 display 值
     */

    /**
     * 隐藏一个 modal（带退场动效）— 状态机保护，防重复触发
     * @param {HTMLElement|string} modal - DOM 元素或 ID
     * @param {Function} [callback]       - 动画结束后的回调（仅执行一次）
     */

    // ─────────────────────────────────────────────────────────

    /**
     * 更新难度选择提示
     */

















    
    /**
     * 选择游戏模式
     */

    /**
     * 显示P2P联机房间模态框
     */

    /**
     * 获取当前选择的时间限制值
     */

    /**
     * 获取当前选择的时间限制模式
     */

    /**
     * 处理开始按钮点击
     */

    /**
     * 激活关卡编辑器
     */

    /**
     * 开始普通游戏（本地、AI、测试模式）
     */
    
    // ─── P2P 联机房间 ──────────────────────────────────────────────────────
    
    /**
     * 显示P2P房间模态框
     */






    /**
     * 获取当前选择的难度
     */

    /**
     * 获取模式名称
     */

    /**
     * 隐藏开始模态框
     */

    /**
     * 显示启动封面（首次加载 与 「开始弹窗 ESC / 点遮罩」返回时都会调用）
     * 复位转场状态并重新绑定「点击 / ESC / 回车 / 空格 = 进入」监听
     */

    // 绑定启动封面进入监听（点击 + 键盘），防止重复绑定

    // 解绑启动封面进入监听

    // 从启动封面进入主界面：转场动画 → 隐藏封面 → 显示开始弹窗 + 启动 BGM
    
    /**
     * 绑定游戏事件
     */
    
    /**
     * 绑定 Summa 训练弹窗事件
     */
    
    /**
     * 显示 Summa 训练弹窗
     * @param {Object} options - 弹窗配置
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息文本
     * @param {Array} options.options - 选项数组 [{label, value, desc}]
     * @param {boolean} options.showInput - 是否显示输入框
     * @param {string} options.inputPlaceholder - 输入框占位符
     * @param {string} options.defaultValue - 输入框默认值
     * @param {boolean} options.showSkip - 是否显示跳过按钮
     * @param {string} options.skipText - 跳过按钮文本
     * @returns {Promise} 返回用户选择结果
     */
    
    /**
     * 隐藏 Summa 训练弹窗
     */
    /**
     * 隐藏 Summa 训练弹窗
     */
    
    /**
     * 绑定DOM事件
     */

    

    /**
     * 处理键盘输入
     */
    
    /**
     * 判断是否使用移动端内联元素布局
     */

    /**
     * 初始化可拖拽元素
     */
    
    /**
     * 初始化锁定元素视图（用于锁定阶段）
     */

    /**
     * 移动端内联元素渲染 — 使用 Tab 切换分类
     */

    /**
     * 渲染移动端指定分类的元素
     */

    /**
     * 切换锁定元素
     */
    
    /**
     * 显示锁定次数气泡框
     */
    
    /**
     * 隐藏锁定次数气泡框
     */
    
    /**
     * 检查鼠标是否悬停在历史函数上
     */
    
    /**
     * 检查鼠标是否距离函数指定像素内
     */
    
    /**
     * 计算点到线段的距离
     */
    
    /**
     * 显示历史函数气泡框
     */
    
    /**
     * 隐藏历史函数气泡框
     */
    
    /**
     * 更新锁定元素显示
     */
    
    /**
     * 触发 AI 回合
     */
    
    /**
     * 处理AI触发队列
     */
    
    /**
     * 处理 Canvas 点击
     */
    
    /**
     * 处理 Canvas 悬停
     */
    
    /**
     * 添加元素到表达式
     */
    
    /**
     * 将运算符转换为显示符号
     */
    
    /**
     * 更新表达式显示
     * @param {boolean} skipSync - 是否跳过 P2P 同步与版本号递增（远端快照回放时使用）
     */
    
    /**
     * 处理表达式点击（删除元素或移动光标）
     */
    
    /**
     * 处理上下键垂直移动光标
     * @param {number} direction - 1表示向下，-1表示向上
     */
    
    /**
     * 清除表达式
     */
    
    /**
     * 处理确认按钮
     */

    /**
     * P2P：确认类动作的辅助发送（带连接与模式检查）
     */

    /**
     * P2P 全量实时同步：判断当前是否轮到本地玩家操作
     * - 选择目标 / 设置禁区 / 设置锁定 阶段：由选择方（currentPlayer）操作
     * - 输入函数阶段：由构造方操作
     *   注意 switchToInputPhase() 已将 currentPlayer 切换为构造方，
     *   因此所有阶段的判断逻辑统一为 currentPlayer === me
     */

    /**
     * 将玩家ID转换为界面显示名称
     * - P2P模式：本地玩家显示为'我'，对手显示为'对方'
     * - 人机模式：玩家B显示为'Summa'
     * - 其他：玩家 A / 玩家 B
     * @param {string} playerId - 'A' 或 'B'
     * @param {boolean} [turn=false] - 是否返回回合提示（我的回合/对方回合）
     * @returns {string}
     */

    /**
     * 向对手发送一份完整状态快照（含表达式与函数曲线数据）
     */

    /**
     * 构建需要同步的快照（GameController 核心状态 + UI 层表达式）
     */

    /**
     * 应用对手发来的快照：覆盖本地状态并完整重绘（实现“全量实时同步”）
     */

    /**
     * 依据当前 GameController 状态 + 表达式，完整重绘所有可见元素
     */

    /**
     * 仅在远端（观战方）绘制函数曲线，不做碰撞检测/计分
     * 观战方同步使用非动画方式，并跳过冗余的棋盘重绘，避免高频 state_sync 阻塞 UI
     */

    /**
     * 提交函数
     */

    /**
     * AI 强制提交函数：跳过输入校验，但仍执行提交与绘制流程
     */
    
    /**
     * 绘制测试模式函数
     */
    
    /**
     * 获取测试模式函数颜色
     */
    
    /**
     * 绘制函数并评估结果
     */









    
    /**
     * 显示评估结果
     */
    
    /**
     * 显示分数变化气泡
     * @param {string} player - 'A' 或 'B'
     * @param {number} scoreChange - 分数变化（正数为加分，负数为扣分）
     */
    
    /**
     * 闪烁网格效果
     */
    
    /**
     * 处理清除按钮
     */
    
    /**
     * 处理跳过按钮（已废弃，改为退出功能）
     */

    /**
     * 强制停止当前对局（退出前调用）
     * 停止计时器、清除AI队列、标记游戏非活跃
     */

    /**
     * 标记游戏为活跃状态（开始新对局时调用）
     */
    
    /**
     * 处理退出按钮点击（根据模式决定是否显示气泡框）
     */
    
    /**
     * 显示退出确认气泡框
     */

    
    /**
     * 隐藏退出确认气泡框
     */
    
    /**
     * 处理退出游戏
     */
    
    /**
     * 退出测试模式
     */
    

    // ─────────────────────────────────────────────────────────
    // 统一弹窗「ESC / 点遮罩关闭」能力（修复 #16–#22）
    // ─────────────────────────────────────────────────────────

    /**
     * 为指定弹窗注册「点遮罩(外部空白)关闭」能力与「ESC 关闭」能力（两者可不同）。
     * - onDismiss：点遮罩(外部空白)时触发；省略则默认 hideModal。
     * - onEsc：按 ESC 时触发；省略则回退为 onDismiss（即 ESC 与遮罩行为一致）。
     * ESC 关闭由全局 bindGlobalEsc 统一处理（依据模态栈顶层判断，避免弹窗叠放误判）。
     */

    /**
     * 返回模态栈中「最上层且可见」的弹窗（叠放时用于判断 ESC 应关闭谁）
     */

    /**
     * 全局 ESC 关闭：关闭模态栈最上层的弹窗（start-modal 交由自身 ESC 处理）
     */

    /**
     * 竞速模式总关数（不再硬编码 30，修复 #34）
     */

    /**
     * 注册所有「可 ESC / 点遮罩关闭」的弹窗
     * - 信息/设置类：ESC 或点遮罩 = 关闭弹窗
     * - 结果类：ESC 或点遮罩 = 触发既有「返回」按钮行为
     */

    // ─────────────────────────────────────────────────────────
    // #25 联机对手掉线恢复（三按钮：重试连接 / 等对手回来 / 返回主菜单）
    // ─────────────────────────────────────────────────────────

    /** 绑定掉线框与等待横幅的按钮 */

    /** 弹出掉线恢复框（强制选择，ESC/点遮罩不关闭） */

    /** 用记录的房间码重新建立连接 */

    /** 彻底退出联机对局，返回主菜单 */

    /** 不退出，保留棋盘并提示等待对手重连（顶部常驻横幅提供退出/重试入口） */


    /**
     * 处理开始游戏
     */




    // 获取单个关卡的最高星星数

    // 设置单个关卡的最高星星数





























































    // 计算LRΣ = Σ(100/(10+b))，b为已通关关卡的best score

    // 更新LRΣ显示






    
    /**
     * 初始化测试模式 UI
     */
    
    /**
     * 添加鼠标滚轮缩放功能
     */
    
    /**
     * 调整坐标系范围（支持任意步长）
     * @param {number} step - 步长（正数放大，负数缩小）
     * @returns {number} 新的范围值
     */
    
    /**
     * 添加缩放按钮
     */
    
    /**
     * 更新缩放显示
     */

    
    
    /**
     * 锁定缩放按钮
     */
    
    /**
     * 解锁缩放按钮
     */
    
    /**
     * 添加函数列表容器
     */
    
    /**
     * 更新函数列表显示
     */

    
    /**
     * 将表达式字符串智能拆分为元素数组
     * @param {string} expr - 表达式字符串
     * @returns {Array} 元素数组
     */
    
    /**
     * 编辑测试模式函数
     */
    
    /**
     * 删除测试模式函数
     */
    
    /**
     * 重新绘制所有测试模式函数
     */
    
    /**
     * 添加清空函数按钮
     */

    /**
     * 处理返回主页
     */
    
    /**
     * 当棋盘 range 扩大时，用 FunctionRenderer 重新采样所有历史函数到新范围
     * 只在 range 发生变化时调用一次，不在每帧 draw 里重复计算
     */
    
    /**
     * 更新阶段UI
     */
    
    /**
     * 更新计时器显示
     */
    
    /**
     * 更新记分板
     */
    
    /**
     * 显示消息
     */
    
    /**
     * 渐隐消息
     */
    
    /**
     * 显示游戏结束
     */
    
    /**
     * 显示游戏报告
     */
    
    /**
     * 隐藏游戏报告
     */
    
    /**
     * 获取难度名称
     */
    
    /**
     * 获取函数类型名称
     */
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
