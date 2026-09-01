// Auto-split from UIController.js — prototype-attached methods (UICanvas)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UICanvas] UIController must be loaded before this file');
}

// renderMobileInlineElements
    UIController.prototype.renderMobileInlineElements = function(elements, roundLockedElements, funcDisplayNames) {
        this.inlineElementsTabs.innerHTML = '';
        this.inlineElementsBody.innerHTML = '';

        const categories = [
            { key: 'variable', label: '变量' },
            { key: 'numbers', label: '数字' },
            { key: 'basicOperators', label: '四则运算' },
            { key: 'operators', label: '其他运算符' },
            { key: 'functions', label: '函数' }
        ];

        for (const cat of categories) {
            const catElements = elements[cat.key];
            if (!catElements || catElements.length === 0) continue;

            const tab = document.createElement('button');
            tab.className = 'inline-elements-tab';
            tab.textContent = cat.label;
            tab.dataset.catKey = cat.key;
            tab.addEventListener('click', () => {
                this.inlineElementsTabs.querySelectorAll('.inline-elements-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderMobileCategoryElements(cat.key, cat.label, elements, roundLockedElements, funcDisplayNames);
            });
            this.inlineElementsTabs.appendChild(tab);
        }

        // 默认激活第一个分类
        const defaultCat = categories.find(c => c.key === 'numbers') || categories[0];
        const firstTab = this.inlineElementsTabs.querySelector(`[data-cat-key="${defaultCat.key}"]`);
        if (firstTab) firstTab.classList.add('active');
        this.renderMobileCategoryElements(defaultCat.key, defaultCat.label, elements, roundLockedElements, funcDisplayNames);
    }
;

// renderMobileCategoryElements
    UIController.prototype.renderMobileCategoryElements = function(catKey, catLabel, elements, roundLockedElements, funcDisplayNames) {
        this.inlineElementsBody.innerHTML = '';
        const catElements = elements[catKey];
        if (!catElements || catElements.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'opacity:0.5;padding:12px;text-align:center;font-size:13px;';
            empty.textContent = '暂无可用元素';
            this.inlineElementsBody.appendChild(empty);
            return;
        }
        for (const item of catElements) {
            // 面板中禁用该函数 → 直接隐藏（对所有可选函数生效）
            if (typeof this.getFunctionEnabled === 'function' && !this.getFunctionEnabled(item.value)) {
                continue;
            }
            // 反三角函数：简单难度/分数关或面板中关闭时直接不显示
            const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(item.value);
            if (isInverseTrig && this.shouldHideInverseTrigElement(item.value)) {
                continue;
            }
            // sgn / floor：难度太低/模式不适用时直接隐藏
            if (item.value === 'sgn' && typeof this.shouldHideSgnElement === 'function' && this.shouldHideSgnElement()) continue;
            if (item.value === 'floor' && typeof this.shouldHideFloorElement === 'function' && this.shouldHideFloorElement()) continue;

            const btn = document.createElement('button');
            btn.className = 'element-btn';
            const displayValue = catKey === 'functions' && funcDisplayNames[item.value]
                ? funcDisplayNames[item.value]
                : this.getDisplaySymbol(item.value);
            btn.textContent = displayValue;
            btn.dataset.value = item.value;

            // 反三角函数未解锁：锁定样式但保持可点击，点击弹出解锁提示
            if (isInverseTrig && !this.isInverseTrigUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.innerHTML = `${displayValue} <span class="lock-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>`;
                btn.title = '需通关全部分数关解锁';
                btn.addEventListener('click', () => this.showInverseTrigLockedDialog());
                this.inlineElementsBody.appendChild(btn);
                continue;
            }
            // sgn / floor：当前难度适用但未解锁时，显示锁定态并可点击弹出解锁提示
            if (item.value === 'sgn' && typeof this.isSgnUnlocked === 'function' && !this.isSgnUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.innerHTML = `${displayValue} <span class="lock-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>`;
                btn.title = '需通关专家难度解锁';
                btn.addEventListener('click', () => this.showSgnLockedDialog());
                this.inlineElementsBody.appendChild(btn);
                continue;
            }
            if (item.value === 'floor' && typeof this.isFloorUnlocked === 'function' && !this.isFloorUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.innerHTML = `${displayValue} <span class="lock-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>`;
                btn.title = '需通关无解难度解锁';
                btn.addEventListener('click', () => this.showFloorLockedDialog());
                this.inlineElementsBody.appendChild(btn);
                continue;
            }

            const isLockedThisRound = roundLockedElements.includes(item.value);
            const isLockedPreviously = item.locked;
            if (isLockedThisRound || isLockedPreviously) {
                btn.classList.add('locked');
                btn.disabled = true;
                const lockedDisplayValue = catKey === 'functions' && funcDisplayNames[item.value]
                    ? funcDisplayNames[item.value]
                    : this.getDisplaySymbol(item.value);
                btn.innerHTML = `${lockedDisplayValue} <span class="lock-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>`;
                if (isLockedThisRound) btn.title = '本回合被锁定';
            } else {
                btn.addEventListener('click', () => this.addElementToExpression(item.value));
            }
            this.inlineElementsBody.appendChild(btn);
        }
    }
;

// checkHistoryFunctionHover
    UIController.prototype.checkHistoryFunctionHover = function(event) {
        const pt = this.gridSystem.eventToCanvas(event.clientX, event.clientY);
        if (!pt) return;
        const mouseX = pt.x;
        const mouseY = pt.y;
        
        // 隐藏旧的气泡框
        this.hideHistoryFunctionTooltip();
        
        const state = this.gameController.getGameState();
        if (!state.functionHistory || state.functionHistory.length === 0) return;
        
        const currentRound = state.currentRound;
        
        // 检查每个历史函数
        for (const func of state.functionHistory) {
            const roundDiff = currentRound - func.round;
            
            // 只检查上2回合的函数
            if (roundDiff < 1 || roundDiff > 2) continue;
            
            // 检查鼠标是否距离函数15px以内（更宽松的检测）
            if (this.isMouseNearFunction(mouseX, mouseY, func.points, 15)) {
                this.showHistoryFunctionTooltip(event, func.expression, func.round);
                return;
            }
        }
    }
;

// showHistoryFunctionTooltip
    UIController.prototype.showHistoryFunctionTooltip = function(event, expression, round) {
        this.hideHistoryFunctionTooltip();
        
        const tooltip = document.createElement('div');
        tooltip.id = 'history-function-tooltip';
        tooltip.className = 'history-function-tooltip';
        tooltip.innerHTML = `<div style="font-weight: bold;">第 ${round} 回合</div><div style="margin-top: 4px;">${expression}</div>`;
        
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${event.clientX + 15}px`;
        tooltip.style.top = `${event.clientY - 10}px`;
        tooltip.style.zIndex = '10000';
        tooltip.style.background = 'rgba(0, 0, 0, 0.85)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '13px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.maxWidth = '300px';
        tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        
        document.body.appendChild(tooltip);
    }
;

// hideHistoryFunctionTooltip
    UIController.prototype.hideHistoryFunctionTooltip = function() {
        const tooltip = document.getElementById('history-function-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
;

// handleCanvasClick
    UIController.prototype.handleCanvasClick = function(e) {
        // 观战模式：棋盘只读，禁止点击
        if (this._isSpectating) return;
        // 2026-08-15 修复 #26：测试模式下棋盘点击不用于选格/禁区（测试模式通过 submitFunction 绘制），
        // 显式早返回避免误触发"已使用格子"等提示（原依赖 GC 侧 selectTargetCell/addForbiddenCell 内部拦截）。
        if (this.gameController?.isTestMode()) return;
        if (this.gameController?.gameMode === 'race' && this._raceCountdownActive) return;
        const pt = this.gridSystem.eventToCanvas(e.clientX, e.clientY);
        if (!pt) return;

        const cell = this.gridSystem.getCellFromCanvas(pt.x, pt.y);
        if (!cell) return;
        
        const phase = this.gameController.currentPhase;
        const state = this.gameController.getGameState();
        
        // 人机模式下，如果当前是AI的回合，阻止玩家操作
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            console.log('[UI] AI回合中，阻止玩家点击');
            return;
        }

        // P2P：非本方回合禁止操作棋盘
        if (this.isP2PMode && !this._isMyTurn()) {
            console.log(`[UI][Click] 非本方回合，已阻止 cell=(${cell.x},${cell.y})`);
            this.showMessage('等待对手操作中…', 'info');
            return;
        }

        console.log(`[UI][Click] 处理点击 cell=(${cell.x},${cell.y}), phase=${phase}`);

        // 检查是否是历史使用过的格子
        const isUsedCell = state.usedCells && state.usedCells.some(c => c.x === cell.x && c.y === cell.y);
        if (isUsedCell) {
            this.showMessage('此格子已在之前的回合中使用过，无法再次选择', 'warning');
            return;
        }
        
        if (phase === 'select_target') {
            this.gameController.selectTargetCell(cell);
        } else if (phase === 'set_forbidden') {
            this.gameController.addForbiddenCell(cell);
        }
        // P2P：selectTargetCell/addForbiddenCell 内部已通过 _syncHook(_p2pSyncNow) 强制同步，
        // 无需再重复推送（避免同版本全量快照双发造成消息风暴）
    }
;

// handleCanvasHover
    UIController.prototype.handleCanvasHover = function(e) {
        // 观战模式：禁用悬停效果
        if (this._isSpectating) {
            if (this._lastHoverKey !== 'spectating') {
                this.gridSystem.canvas.style.cursor = 'not-allowed';
                this.gridSystem.canvas.title = '观战模式（只读）';
                this._lastHoverKey = 'spectating';
            }
            return;
        }
        // 触屏/触控笔无悬停概念，跳过 hover 处理（避免点按瞬间误写 title/cursor）
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const pt = this.gridSystem.eventToCanvas(e.clientX, e.clientY);
        if (!pt) return;

        const cell = this.gridSystem.getCellFromCanvas(pt.x, pt.y);
        const state = this.gameController.getGameState();
        
        // 人机模式下，如果当前是AI的回合，禁用悬停效果
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            if (this._lastHoverKey !== 'ai-turn') {
                this.gridSystem.canvas.style.cursor = 'not-allowed';
                this.gridSystem.canvas.title = 'Summa 正在操作中...';
                this._lastHoverKey = 'ai-turn';
            }
            return;
        }

        // 仅当悬停目标格变化时才写 DOM，避免每像素 mousemove 都重设 title/cursor（修复 #32）
        const key = cell ? `(${cell.x}, ${cell.y})` : 'empty';
        if (this._lastHoverKey === key) return;
        this._lastHoverKey = key;

        if (cell) {
            this.gridSystem.canvas.style.cursor = 'pointer';
            this.gridSystem.canvas.title = `(${cell.x}, ${cell.y})`;
        } else {
            this.gridSystem.canvas.style.cursor = 'default';
            this.gridSystem.canvas.title = '';
        }
    }
;

// _renderFromState
    UIController.prototype._renderFromState = function() {
        const gc = this.gameController;
        const state = gc.getGameState();

        // 棋盘：目标格 / 禁止区 / 历史格 / 历史函数
        this.gridSystem.clearAll();
        this.gridSystem.setTargetCells(state.roundState.targetCells);
        // 复制数组，避免 gridSystem 与 GameController 共用引用，
        // 否则 P2P 同步后本地再次选择禁止格时会因“已存在”而跳过绘制。
        this.gridSystem.forbiddenCells = (state.roundState.forbiddenCells || []).slice();
        this.gridSystem.usedCells = (state.usedCells || []).slice();
        this.gridSystem.functionHistory = (state.functionHistory || []).slice();
        this.gridSystem.currentRound = state.currentRound;
        this.gridSystem.draw();

        // 阶段提示与元素面板
        this.updatePhaseUI(state.currentPhase);
        // 锁定元素按钮状态
        this.updateLockedElements();
        // 表达式显示（远端快照回放，跳过 P2P 同步与版本号递增）
        this.updateExpressionDisplay(true);
        // 分数与回合
        this.updateScoreboard();
        this.roundElement.textContent = state.currentRound;
        this.totalRoundsElement.textContent = state.totalRounds;
        // 计时（仅展示对手端的剩余时间，便于观战）
        if (typeof state.remainingTime === 'number' && this.updateTimer) {
            this.updateTimer(state.remainingTime);
        }

        // 构造方提交后绘制函数曲线，让对手同步看到。
        // 只在「提交后」（roundState.functionExpression 非空）绘制 —— 输入过程中
        // 不画曲线，仅同步表达式文本；避免"还没点确认就开始绘制"。
        // 不限阶段：提交后进入 evaluate/switch_player 的快照也会到达，
        // 而棋盘 gridSystem.draw() 已清空画布，必须每次快照都补画曲线。
        if (state.roundState.functionExpression) {
            this._drawRemoteFunction(state.roundState.functionExpression);
        }
    }
;

// _drawRemoteFunction
    // 远端快照到达时重绘函数曲线。因为棋盘 gridSystem.draw() 每次都会清空整块画布，
    // 曲线必须随每次快照补画；表达式变化时带动画（与提交方同步体验），
    // 表达式相同时无动画静默补画（避免提交瞬间 expr 未变被去重跳过 → 曲线消失）。
    UIController.prototype._drawRemoteFunction = async function(expr) {
        if (!expr || !this.renderer) return;
        if (expr !== this._lastRemoteExpr) {
            this._lastRemoteExpr = expr;
            try {
                // 带动画绘制函数曲线，让对手看到与提交方相同的绘制过程
                await this.renderer.drawFunction(expr, true);
            } catch (e) {
                // 远端函数绘制失败时静默处理
            }
        } else {
            try {
                // 相同表达式：无动画静默补画（画布刚被棋盘重绘清空）
                this.renderer.drawFunction(expr, false);
            } catch (e) {
                // 远端函数绘制失败时静默处理
            }
        }
    }
;

// renderTestModeFunction
    UIController.prototype.renderTestModeFunction = async function(expression) {
        // 防止重复提交
        if (this.isRenderingTestFunction) {
            return;
        }
        this.isRenderingTestFunction = true;

        // 锁定缩放按钮
        this.lockZoomButtons();

        try {
            const existingFunctions = this.gameController.getTestModeFunctions();
            const editingIndex = (this._editingTestFunctionIndex != null) ? this._editingTestFunctionIndex : -1;
            const isEditing = editingIndex >= 0 && editingIndex < existingFunctions.length;

            // 编辑模式：表达式未变化时直接退出编辑
            if (isEditing && existingFunctions[editingIndex].expression === expression) {
                this._cancelTestFunctionEdit();
                this.clearExpression();
                this.showMessage('函数未修改', 'info');
                return;
            }

            // 检查是否已存在相同的函数（编辑模式排除被编辑项本身）
            if (existingFunctions.some((f, i) => i !== editingIndex && f.expression === expression)) {
                this.showMessage('该函数已存在', 'error');
                return;
            }

            await this.prepareRenderCanvas();

            if (isEditing) {
                // 编辑模式：用原函数颜色绘制新表达式
                const color = existingFunctions[editingIndex].color || this.getTestModeColor();
                const points = await this.renderer.drawFunction(expression, true, color, true);

                if (points && points.length > 0) {
                    // 更新函数（保留原颜色）
                    this.gameController.updateTestModeFunction(editingIndex, expression);

                    // 退出编辑模式并清空表达式
                    this._cancelTestFunctionEdit();
                    this.clearExpression();

                    // 重新绘制所有测试模式函数，避免新函数绘制时把旧函数覆盖掉
                    await this.redrawTestModeFunctions();

                    // 渲染后再刷新一次，确保调试层/曲线层都稳定显示
                    await this.postRenderRefresh();

                    this.showMessage(`函数已更新: ${expression}`, 'success');
                } else {
                    this.showMessage('函数绘制失败，请检查表达式', 'error');
                }
            } else {
                // 新增函数（使用不同颜色，测试模式无光晕）
                const color = this.getTestModeColor();
                const points = await this.renderer.drawFunction(expression, true, color, true);

                if (points && points.length > 0) {
                    // 保存函数
                    this.gameController.addTestModeFunction(expression, color);

                    // 清空当前表达式
                    this.clearExpression();

                    // 重新绘制所有测试模式函数，避免新函数绘制时把旧函数覆盖掉
                    await this.redrawTestModeFunctions();

                    // 渲染后再刷新一次，确保调试层/曲线层都稳定显示
                    await this.postRenderRefresh();

                    this.showMessage(`函数已绘制: ${expression}`, 'success');
                } else {
                    this.showMessage('函数绘制失败，请检查表达式', 'error');
                }
            }
        } catch (error) {
            this.showMessage('函数计算错误: ' + error.message, 'error');
        } finally {
            // 重置提交标志并解锁缩放按钮
            this.isRenderingTestFunction = false;
            this.unlockZoomButtons();
        }
    }
;

// prepareRenderCanvas
    UIController.prototype.prepareRenderCanvas = async function() {
        // 只清理浏览器内存中的临时引用，不删除本地存档/AI模型/关卡数据等持久化数据
        this._renderTempState = null;
        // 只重绘当前棋盘显示，不能清掉 target / forbidden / usedCells
        if (this.gridSystem && typeof this.gridSystem.draw === 'function') {
            this.gridSystem.draw();
        }
    }
;

// postRenderRefresh
    UIController.prototype.postRenderRefresh = async function() {
        if (!this.gridSystem) return;
        await new Promise(resolve => requestAnimationFrame(() => {
            // 仅等待下一帧，让浏览器完成本次绘制提交；不要再次清空画布，否则会把函数擦掉
            resolve();
        }));
    }
;

// renderAndEvaluate
    UIController.prototype.renderAndEvaluate = async function(expression) {
        await this.prepareRenderCanvas();

        // 1. 渲染用采样（标准精度）- 等待绘制完成
        await this.renderer.drawFunction(expression, true);

        // 闯关模式：图像绘制完成后额外延迟一小段时间再进行后续判定与反馈
        if (this.gameController && this.gameController.gameMode === 'campaign' && this.campaignDrawDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.campaignDrawDelay));
        }

        // 渲染后再刷新一次画布显示，避免首次绘图时调试层/函数层未稳定
        await this.postRenderRefresh();
        
        // 2. 碰撞检测用采样（高精度）
        const range = this.gridSystem.getRange();
        const collisionPoints = this.renderer.sampleFunction(expression, range.min, range.max, true);
        const polyline = this.renderer.convertToPolyline(collisionPoints);
        
        // 获取目标网格和禁止区
        const state = this.gameController.getGameState();
        const targetCells = state.roundState.targetCells;
        const forbiddenCells = state.roundState.forbiddenCells;
        
        // 碰撞检测 - 检测所有目标格（视觉检测）
        const hitTargets = [];
        for (const targetCell of targetCells) {
            if (this.detector.checkHitTarget(polyline, targetCell, this.gridSystem)) {
                hitTargets.push(targetCell);
            }
        }
        
        // 检测禁止区（视觉检测）
        let hitForbidden = false;
        if (forbiddenCells.length > 0) {
            hitForbidden = this.detector.checkHitForbidden(polyline, forbiddenCells, this.gridSystem);
        }
        
        // 分析函数类型
        const functionType = this.parser.analyzeFunctionType(expression);
        
        // 评估结果
        this.gameController.evaluateResult(hitTargets, hitForbidden, functionType);
    }
;

// addWheelZoomSupport
    UIController.prototype.addWheelZoomSupport = function() {
        // 移除旧的滚轮事件（如果存在）
        if (this.wheelHandler) {
            this.gridSystem.canvas.removeEventListener('wheel', this.wheelHandler);
        }
        
        // 创建新的滚轮事件处理器
        this.wheelHandler = (e) => {
            e.preventDefault();
            
            // 如果正在绘制，不响应滚轮
            if (this.renderer.isDrawing) {
                return;
            }
            
            const delta = e.deltaY > 0 ? 1 : -1;
            const wheelStep = 1; // 滚轮步长为 1，比按钮的 5 更小
            let newRange;
            
            if (delta > 0) {
                // 向下滚动，放大坐标系（范围增加）
                newRange = this.adjustRange(wheelStep);
            } else {
                // 向上滚动，缩小坐标系（范围减小）
                newRange = this.adjustRange(-wheelStep);
            }
            
            // 更新显示
            this.updateZoomDisplay(newRange);
            
            // 重绘所有函数
            this.redrawAllTestFunctions();
        };
        
        // 绑定滚轮事件到 Canvas
        this.gridSystem.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

        // ── 触屏双指捏合缩放（pinch-to-zoom，测试模式） ──
        this._addPinchZoomSupport();
    }
;

// _addPinchZoomSupport
    // 双指捏合缩放坐标系：跟踪两个活动指针，按指距变化方向步进缩放，
    // 缩放执行复用与滚轮相同的 adjustRange + redrawAllTestFunctions 链路。
    UIController.prototype._addPinchZoomSupport = function() {
        const canvas = this.gridSystem.canvas;
        if (!canvas || this._pinchZoomBound) return;
        this._pinchZoomBound = true;

        const activePointers = new Map(); // pointerId → {x, y}
        let lastDist = 0;
        let accumulated = 0; // 累积缩放比例，跨越阈值后步进一次
        let pinchZoomTimer = null;

        const queueZoomStep = (delta) => {
            if (this.renderer && this.renderer.isDrawing) return;
            const newRange = this.adjustRange(delta);
            this.updateZoomDisplay(newRange);
            if (pinchZoomTimer) clearTimeout(pinchZoomTimer);
            pinchZoomTimer = setTimeout(() => {
                pinchZoomTimer = null;
                this.redrawAllTestFunctions();
            }, 150);
        };

        const pointerDist = () => {
            const pts = [...activePointers.values()];
            if (pts.length < 2) return 0;
            return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size === 2) {
                lastDist = pointerDist();
                accumulated = 1;
            }
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size !== 2) return;
            const dist = pointerDist();
            if (lastDist > 0 && dist > 0) {
                accumulated *= dist / lastDist;
                // 指距变化超过 25% 步进一次：放大 → 范围减小(zoom in)，缩小 → 范围增大(zoom out)
                if (accumulated >= 1.25) {
                    queueZoomStep(-1);
                    accumulated = 1;
                } else if (accumulated <= 0.8) {
                    queueZoomStep(1);
                    accumulated = 1;
                }
            }
            lastDist = dist;
        });
        const release = (e) => {
            activePointers.delete(e.pointerId);
            if (activePointers.size < 2) {
                lastDist = 0;
                accumulated = 1;
            }
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
    }
;

// addZoomButtons
    UIController.prototype.addZoomButtons = function() {
        // 检查是否已存在
        if (document.getElementById('zoom-controls')) return;
        
        const container = document.createElement('div');
        container.id = 'zoom-controls';
        container.className = 'zoom-controls';
        container.innerHTML = `
            <button id="zoom-out-btn" class="zoom-btn" title="放大坐标系 (+)">+</button>
            <span id="zoom-range" class="zoom-range">±${this.gridSystem.range}</span>
            <button id="zoom-in-btn" class="zoom-btn" title="缩小坐标系 (-)">−</button>
        `;
        
        // 添加到 canvas 容器
        const canvasSection = document.querySelector('.canvas-section');
        if (canvasSection) {
            canvasSection.appendChild(container);
        }
        
        // 绑定事件
        // V6 修复：缩放节流改为「累积 + trailing 合并」——连点期间累加步数，
        // 最后一次点击后 120ms 内无新点击则统一执行一次缩放+重绘。
        // 既保证连点全部生效（原 leading-drop 会丢弃 300ms 内的点击），
        // 又避免多条 async 重绘链交错闪帧（原 U9 的防并发目的）。
        let pendingZoomSteps = 0;
        let zoomTrailingTimer = null;
        const applyZoom = () => {
            const steps = pendingZoomSteps;
            pendingZoomSteps = 0;
            zoomTrailingTimer = null;
            if (steps === 0) return;
            const newRange = this.adjustRange(steps);
            this.updateZoomDisplay(newRange);
            this.redrawAllTestFunctions();
        };
        const queueZoom = (delta) => {
            // 如果正在绘制，不响应
            if (this.renderer.isDrawing) return;
            pendingZoomSteps += delta;
            if (zoomTrailingTimer) return;
            zoomTrailingTimer = setTimeout(applyZoom, 120);
        };
        document.getElementById('zoom-out-btn').addEventListener('click', () => queueZoom(5));
        document.getElementById('zoom-in-btn').addEventListener('click', () => queueZoom(-5));
    }
;

// updateZoomDisplay
    UIController.prototype.updateZoomDisplay = function(range) {
        const display = document.getElementById('zoom-range');
        if (display) {
            display.textContent = `±${range}`;
        }
    }
;

// lockZoomButtons
    UIController.prototype.lockZoomButtons = function() {
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (zoomOutBtn) zoomOutBtn.disabled = true;
        if (zoomInBtn) zoomInBtn.disabled = true;
    }
;

// unlockZoomButtons
    UIController.prototype.unlockZoomButtons = function() {
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        if (zoomOutBtn) zoomOutBtn.disabled = false;
        if (zoomInBtn) zoomInBtn.disabled = false;
    }
;

// redrawTestModeFunctions
    UIController.prototype.redrawTestModeFunctions = async function() {
        if (!this.gameController?.isTestMode()) return;
        if (!this.gridSystem || !this.renderer) return;

        const functions = this.gameController.getTestModeFunctions();
        this.gridSystem.draw();
        for (const func of functions) {
            await this.renderer.drawFunction(func.expression, false, func.color);
        }
    }
;

// redrawAllTestFunctions
    UIController.prototype.redrawAllTestFunctions = async function() {
        // 取消任何正在进行的绘制
        this.renderer.cancelDrawing();

        await this.prepareRenderCanvas();
        const functions = this.gameController.getTestModeFunctions();

        // 使用 requestAnimationFrame 批量绘制，避免阻塞UI（测试模式无光晕）
        await new Promise(resolve => requestAnimationFrame(async () => {
            for (const func of functions) {
                await this.renderer.drawFunction(func.expression, false, func.color, true);
            }
            await this.postRenderRefresh();
            resolve();
        }));
    }
;

// refreshHistoryFunctionPoints
    UIController.prototype.refreshHistoryFunctionPoints = function() {
        const state = this.gameController.getGameState();
        if (!state.functionHistory || state.functionHistory.length === 0) return;
        
        const newRange = this.gridSystem.range;
        
        for (const func of state.functionHistory) {
            // 只对采样范围小于当前 range 的函数重新采样
            if ((func.sampledRange || 0) < newRange) {
                try {
                    func.points = this.renderer.sampleFunction(func.expression, -newRange, newRange);
                    func.sampledRange = newRange;
                } catch (e) {
                    console.warn('[UI] 重采样历史函数失败:', func.expression, e);
                }
            }
        }
        
        // 同步到 GridSystem
        this.gridSystem.functionHistory = state.functionHistory;
    }
;

