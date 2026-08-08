// Auto-split from UIController.js — 悬浮计算器式输入栏（UIFloatKeypad）
// 唯一的输入栏（原底部元素栏 / 移动端内联面板已删除）；可拖动 / 收起为圆形按钮。
// 加载顺序需在 UIController.js 之后（index.html 已置于 ui 脚本区）
if (typeof UIController === 'undefined') {
    console.error('[UIFloatKeypad] UIController must be loaded before this file');
}

// initFloatKeypad
    UIController.prototype.initFloatKeypad = function() {
        const el = document.getElementById('float-keypad');
        if (!el) return;

        this.floatKeypad = el;
        this.floatKeypadHeader = document.getElementById('float-keypad-header');
        this.floatKeypadBody = document.getElementById('float-keypad-body');
        this.floatKeypadDisplay = document.getElementById('float-keypad-display');
        this.floatKeypadCollapseBtn = document.getElementById('float-keypad-collapse');
        this.floatKeypadSubmit = document.getElementById('float-keypad-submit');
        this.floatKeypadFx = document.getElementById('float-keypad-fx');
        this.floatKeypadLeft = document.getElementById('float-keypad-left');
        this.floatKeypadRight = document.getElementById('float-keypad-right');
        this.floatKeypadFab = document.getElementById('float-keypad-fab');

        this._floatKeypadCollapsed = false;  // 收起为圆形按钮

        // 初始化一次缩放（窄屏时字号随宽度自适应）
        this.updateKeypadScale();

        // —— 拖动（按住标题栏） ——
        let drag = null;
        const header = this.floatKeypadHeader;
        header.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return; // 按钮不触发拖动
            e.preventDefault();
            const r = el.getBoundingClientRect();
            drag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
            try { header.setPointerCapture(e.pointerId); } catch (err) {}
        });
        header.addEventListener('pointermove', (e) => {
            if (!drag) return;
            el.style.left = (drag.left + e.clientX - drag.sx) + 'px';
            el.style.top = (drag.top + e.clientY - drag.sy) + 'px';
            el.style.transform = 'none'; // 拖动后取消居中 transform
            this._clampFloatKeypad();     // 防止拖出屏幕
            this.updateKeypadScale();     // 位置/尺寸变化 → 重新计算缩放
        });
        const endDrag = () => { drag = null; };
        header.addEventListener('pointerup', endDrag);
        header.addEventListener('pointercancel', endDrag);

        // —— 窗口尺寸/方向变化：自动夹回屏幕内 + 重算字号缩放 ——
        window.addEventListener('resize', () => {
            this._clampFloatKeypad();
            this.updateKeypadScale();
            this._clampFloatKeypadFab();
        });

        // —— 收起为圆形按钮（×） ——
        this.floatKeypadCollapseBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this._floatKeypadCollapsed = true;
            // 收起时同步收起 fx 面板（避免下次展开时残留展开态）
            el.classList.remove('fx-open');
            if (this._floatKeypadFxOpen) { this._floatKeypadFxOpen = false; }
            // 圆形按钮出现在原输入栏位置
            const r = el.getBoundingClientRect();
            if (this.floatKeypadFab) {
                this.floatKeypadFab.style.left = r.left + 'px';
                this.floatKeypadFab.style.top = r.top + 'px';
            }
            this._applyFloatKeypadVisibility();
        });

        // —— 圆形按钮：点击展开 / 可拖动 ——
        if (this.floatKeypadFab) {
            const fab = this.floatKeypadFab;
            // 拖动标志：pointermove 位移超过阈值视为拖动；click 时若发生过拖动则跳过展开（只有单击才展开）
            fab._fabDragMoved = false;
            fab.addEventListener('click', () => {
                if (fab._fabDragMoved) return; // 拖动后松开：不展开输入栏
                if (window.audioManager) window.audioManager.playClick();
                this._floatKeypadCollapsed = false;
                // 记录圆形按钮当前（拖动后）的左上角位置，展开时输入栏左上角与之对齐
                //（与收起时按钮左上角 = 输入栏左上角的相对关系一致）
                const fr = fab.getBoundingClientRect();
                this._floatKeypadOpenFromFab = { x: fr.left, y: fr.top };
                this._applyFloatKeypadVisibility();
                requestAnimationFrame(() => {
                    // 输入栏左上角对齐按钮左上角；若该位置会导致出界，_clampFloatKeypad 会把它
                    // 夹到离该位置最近的合法位置（与圆形按钮共用同一套视口 clamp）
                    const el = this.floatKeypad;
                    if (el && this._floatKeypadOpenFromFab) {
                        el.style.transform = 'none';
                        el.style.left = this._floatKeypadOpenFromFab.x + 'px';
                        el.style.top = this._floatKeypadOpenFromFab.y + 'px';
                        this._floatKeypadOpenFromFab = null;
                    }
                    this._clampFloatKeypad();
                    this.updateKeypadScale();
                });
            });
            let fabDrag = null;
            fab.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                fab._fabDragMoved = false;
                const r = fab.getBoundingClientRect();
                fabDrag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
                try { fab.setPointerCapture(e.pointerId); } catch (err) {}
            });
            fab.addEventListener('pointermove', (e) => {
                if (!fabDrag) return;
                // 位移超过 5px 判定为拖动（区别于单击）
                if (Math.abs(e.clientX - fabDrag.sx) > 5 || Math.abs(e.clientY - fabDrag.sy) > 5) {
                    fab._fabDragMoved = true;
                }
                fab.style.left = (fabDrag.left + e.clientX - fabDrag.sx) + 'px';
                fab.style.top = (fabDrag.top + e.clientY - fabDrag.sy) + 'px';
                this._clampFloatKeypadFab();
            });
            const endFabDrag = () => { fabDrag = null; };
            fab.addEventListener('pointerup', endFabDrag);
            fab.addEventListener('pointercancel', endFabDrag);
        }

        // —— 提交函数（与主确认按钮一致的语义：当前阶段确认） ——
        if (this.floatKeypadSubmit) {
            this.floatKeypadSubmit.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this.handleConfirm();
            });
            const refreshSubmit = () => {
                const cb = this.confirmBtn;
                if (cb) this.floatKeypadSubmit.disabled = !!cb.disabled;
            };
            refreshSubmit();
            // 阶段切换 / 锁更新时同步：委托给 updatePhaseUI 在末尾统一调一下
            this._refreshFloatKeypadSubmit = refreshSubmit;
        }

        // —— fx 按钮：展开/收起左侧函数面板（3×3） ——
        if (this.floatKeypadFx) {
            this._floatKeypadFxOpen = false;
            this.floatKeypadFx.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._floatKeypadFxOpen = !this._floatKeypadFxOpen;
                el.classList.toggle('fx-open', this._floatKeypadFxOpen);
                this.floatKeypadFx.classList.toggle('active', this._floatKeypadFxOpen);
                // 展开后宽度变化 → 夹回屏幕内 + 重算字号缩放
                requestAnimationFrame(() => {
                    this._clampFloatKeypad();
                    this.updateKeypadScale();
                });
            });
        }

        // —— 底部 ◀ ▶：左右移动光标（与键盘 ArrowLeft/ArrowRight 一致） ——
        const moveCursor = (delta) => {
            if (this.gameController.currentPhase !== 'input_function') return;
            if (this._isSpectating) return;
            const n = this.expressionElements.length;
            if (delta < 0 && this.cursorIndex > 0) {
                this.cursorIndex--;
                this.updateExpressionDisplay();
            } else if (delta > 0 && this.cursorIndex < n) {
                this.cursorIndex++;
                this.updateExpressionDisplay();
            }
        };
        if (this.floatKeypadLeft) {
            this.floatKeypadLeft.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playElementClick();
                moveCursor(-1);
            });
        }
        if (this.floatKeypadRight) {
            this.floatKeypadRight.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playElementClick();
                moveCursor(1);
            });
        }

        // —— 悬浮栏顶部表达式区：点击定位光标 / 点击元素删除（原 expression-display 栏目已隐藏，交互搬到这里） ——
        if (this.floatKeypadDisplay) {
            this.floatKeypadDisplay.addEventListener('click', (e) => this.handleExpressionClick(e));
        }

        // 初始同步一次可见性（此时 currentPhase='init'，输入栏隐藏）
        this._applyFloatKeypadVisibility();
    }
;

// _floatKeypadRelevant — 仅在需要元素输入的阶段显示（与原输入栏显示时机一致）；
//                       关卡编辑器打开时隐藏悬浮栏与圆形按钮
    UIController.prototype._floatKeypadRelevant = function() {
        const gc = this.gameController;
        if (!gc) return false;
        // 关卡编辑器打开：不显示悬浮输入栏/圆形按钮
        const editorView = document.getElementById('editor-view');
        if (editorView && editorView.style.display !== 'none') return false;
        const phase = gc.currentPhase;
        if (gc.isTestMode && gc.isTestMode()) return true;
        return phase === 'input_function' || phase === 'set_locks';
    }
;

// _applyFloatKeypadVisibility — 悬浮栏是唯一输入栏：相关阶段显示；收起时显示圆形按钮
    UIController.prototype._applyFloatKeypadVisibility = function() {
        const relevant = this._floatKeypadRelevant();
        const showKeypad = relevant && !this._floatKeypadCollapsed;
        const showFab = relevant && this._floatKeypadCollapsed;
        if (this.floatKeypad) this.floatKeypad.hidden = !showKeypad;
        if (this.floatKeypadFab) this.floatKeypadFab.hidden = !showFab;
        // 相关阶段：隐藏原输入栏与右侧表达式区（body 类 + 永久 CSS 双保险）
        document.body.classList.toggle('float-keypad-mode', relevant);
        if (showKeypad) {
            this.renderFloatKeypad();
            // 首次显示时夹回屏幕内（小屏可能溢出）
            requestAnimationFrame(() => {
                this._clampFloatKeypad();
                this.updateKeypadScale();
                // 同步「提交」按钮的可用态（与主确认按钮一致）
                if (this._refreshFloatKeypadSubmit) this._refreshFloatKeypadSubmit();
            });
        }
        if (showFab) {
            // 圆形按钮显示时也夹回屏幕内（任何界面/模式下均不越界，与输入栏一致）
            requestAnimationFrame(() => this._clampFloatKeypadFab());
        }
    }
;

// _clampToViewport — 公共边界约束：把任意 fixed 定位元素夹回视口内（输入栏与圆形按钮共用同一套逻辑）。
//                     margin 为视口安全边距；centerIfUnpositioned=true 时未定位过的元素默认居中（输入栏），
//                     false 时默认落到右下角（圆形按钮）。
    UIController.prototype._clampToViewport = function(el, margin, centerIfUnpositioned) {
        if (!el) return;
        margin = margin || 8;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = parseFloat(el.style.left);
        let top = parseFloat(el.style.top);
        if (Number.isNaN(left)) left = centerIfUnpositioned ? (vw - el.offsetWidth) / 2 : vw - el.offsetWidth - 16;
        if (Number.isNaN(top)) top = centerIfUnpositioned ? (vh - el.offsetHeight) / 2 : vh - el.offsetHeight - 16;
        left = Math.max(margin, Math.min(left, vw - margin - el.offsetWidth));
        top = Math.max(margin, Math.min(top, vh - margin - el.offsetHeight));
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }
;

// _clampFloatKeypadFab — 圆形按钮夹回屏幕内（复用公共 clamp，行为与输入栏一致；默认右下角）
    UIController.prototype._clampFloatKeypadFab = function() {
        const fab = this.floatKeypadFab;
        if (!fab || fab.hidden) return;
        this._clampToViewport(fab, 8, false);
    }
;

// updateKeypadScale — 根据当前宽度更新 --kp-w-scale，
//                      驱动 CSS 中 calc(base * scale) 的字号 / 间距随窄屏自适应收缩。
//                      （高度已由内容自适应，--kp-h-scale 固定为 1；fx 展开变宽时不放大字号）
    UIController.prototype.updateKeypadScale = function() {
        const el = this.floatKeypad;
        if (!el) return;
        const w = el.offsetWidth;
        // 基准宽度 220 为 1.0（默认态已缩小并匹配主键盘）；只允许缩窄（窄屏收缩），fx 展开变宽不放大字号
        const wScale = Math.min(1, Math.max(0.72, (w || 220) / 220));
        el.style.setProperty('--kp-w-scale', wScale.toFixed(3));
        el.style.setProperty('--kp-h-scale', '1');
    }
;

// _clampFloatKeypad — 夹回屏幕内（位置 + 尺寸；复用公共 clamp，行为与圆形按钮一致；默认居中）
    UIController.prototype._clampFloatKeypad = function() {
        const el = this.floatKeypad;
        if (!el || el.hidden) return;
        this._clampToViewport(el, 8, true);
        el.style.transform = 'none'; // 消除居中 transform，确保 left/top 定位生效
    }
;

// renderFloatKeypad — 按当前阶段渲染（input → 计算器键盘；set_locks → 锁定选择视图）
    UIController.prototype.renderFloatKeypad = function() {
        if (!this.floatKeypadBody) return;
        const phase = this.gameController && this.gameController.currentPhase;
        if (phase === 'set_locks') {
            this._renderFloatLockView();
        } else {
            this._renderFloatKeypadInput();
        }
        // 锁定阶段无表达式：隐藏数学预览区域；输入阶段显示
        const mathEl = document.getElementById('float-keypad-math');
        if (mathEl) mathEl.style.display = (phase === 'set_locks') ? 'none' : '';
    }
;

// _renderFloatKeypadInput — 计算器式键盘（5 列主键盘；函数收进 fx 面板 3×3，默认隐藏，
//                           点击「fx」按钮展开到左侧；锁定元素正常显示 🔒）
    UIController.prototype._renderFloatKeypadInput = function() {
        const body = this.floatKeypadBody;
        if (!body) return;
        body.innerHTML = '';

        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const roundLocked = (state.roundState && state.roundState.lockedElements) || [];
        const spectating = !!this._isSpectating;
        const isAiTurn = this.gameController.gameMode === 'ai' && state.currentPlayer === 'B';
        const notMyTurn = this.isP2PMode && !this._isMyTurn();
        const blockInput = spectating || isAiTurn || notMyTurn;

        const funcNames = { 'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'asin': 'asin', 'acos': 'acos', 'atan': 'atan', 'abs': 'abs', 'ln': 'ln', 'sqrt': '√' };
        const lockBtn = (btn, display) => {
            btn.classList.add('locked');
            btn.disabled = true;
            btn.innerHTML = `${display} <span class="lock-icon">🔒</span>`;
            btn.title = '本回合被锁定';
        };

        const main = document.createElement('div');
        main.className = 'float-keypad-main';

        // —— 左侧函数面板（3×3 网格，默认隐藏；fx 展开时显示） ——
        const funcValues = ['sin', 'cos', 'tan', 'ln', 'sqrt', 'abs'];
        const inverseTrig = ['asin', 'acos', 'atan'];
        const fxPanel = document.createElement('div');
        fxPanel.className = 'float-keypad-fx-panel';
        const addFuncBtn = (v, item) => {
            const display = funcNames[v] || v;
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = display;
            btn.dataset.value = v;
            if (roundLocked.includes(v) || item.locked) {
                lockBtn(btn, display);
            } else if (blockInput) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => this.addElementToExpression(v));
            }
            fxPanel.appendChild(btn);
        };
        for (const v of funcValues) {
            const item = (elements.functions || []).find(f => f.value === v);
            if (item) addFuncBtn(v, item);
        }
        // 反三角函数：可见才显示；未解锁时锁定样式但可点击弹解锁提示
        for (const v of inverseTrig) {
            const item = (elements.functions || []).find(f => f.value === v);
            if (!item) continue;
            const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(v);
            if (isInverseTrig && this.shouldHideInverseTrigElement()) continue;
            const display = funcNames[v] || v;
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = display;
            btn.dataset.value = v;
            if (isInverseTrig && !this.isInverseTrigUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.innerHTML = `${display} <span class="lock-icon">🔒</span>`;
                btn.title = '需通关全部分数关解锁';
                if (!blockInput) btn.addEventListener('click', () => this.showInverseTrigLockedDialog());
                fxPanel.appendChild(btn);
                continue;
            }
            addFuncBtn(v, item);
        }
        main.appendChild(fxPanel);

        // —— 右侧主键盘（5 列计算器式） ——
        const keyMap = [
            ['7', '8', '9', '/', 'back'],
            ['4', '5', '6', '*', '('],
            ['1', '2', '3', '-', ')'],
            ['0', '.', 'π', '+', '^'],
            ['x', 'e', 'i', '!', 'clear']
        ];
        const grid = document.createElement('div');
        grid.className = 'float-keypad-grid';
        for (const row of keyMap) {
            for (const key of row) {
                const btn = document.createElement('button');
                btn.className = 'element-btn';
                if (key === 'back') {
                    btn.textContent = '⌫';
                    btn.dataset.action = 'back';
                    btn.title = '删除光标前一个元素';
                    if (!blockInput) btn.addEventListener('click', () => this.floatKeypadBackspace());
                } else if (key === 'clear') {
                    btn.textContent = 'AC';
                    btn.dataset.action = 'clear';
                    btn.title = '清空表达式';
                    if (!blockInput) btn.addEventListener('click', () => this.handleClear());
                } else {
                    const display = this.getDisplaySymbol(key);
                    btn.textContent = display;
                    btn.dataset.value = key;
                    if (roundLocked.includes(key)) {
                        lockBtn(btn, display);
                    } else if (blockInput) {
                        btn.disabled = true;
                    } else {
                        btn.addEventListener('click', () => this.addElementToExpression(key));
                    }
                }
                if (blockInput) btn.disabled = true; // ⌫ / C 在对方回合同样禁用
                grid.appendChild(btn);
            }
        }
        main.appendChild(grid);
        body.appendChild(main);

        // 恢复 fx 面板展开态（收起时已复位，展开态保持）
        const el = this.floatKeypad;
        if (el && this._floatKeypadFxOpen) {
            el.classList.add('fx-open');
            if (this.floatKeypadFx) this.floatKeypadFx.classList.add('active');
        }
    }
;

// _renderFloatLockView — 锁定选择视图：与输入栏完全相同的计算器网格样式（复用 float-keypad-grid）
    UIController.prototype._renderFloatLockView = function() {
        const body = this.floatKeypadBody;
        if (!body) return;
        body.innerHTML = '';

        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements || [];
        const spectating = !!this._isSpectating;
        const blockInput = spectating || (this.isP2PMode && !this._isMyTurn());

        const title = document.createElement('div');
        title.className = 'float-keypad-lock-label';
        title.textContent = `选择要锁定的元素 (${alreadyLocked.length}/${state.maxLocks})`;

        // 与输入栏一致的 5 列计算器网格（按钮样式完全继承 float-keypad-grid .element-btn）
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'float-keypad-grid';

        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp', 'ln': 'ln', 'log': 'log'
        };

        const allElements = [
            ...elements.numbers.map(e => e.value),  // 包含 π, e, i
            ...elements.basicOperators.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x' && e.value !== '(' && e.value !== ')').map(e => e.value),
            ...elements.functions
                .filter(e => !(Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(e.value))
                    || !this._shouldSkipInverseTrigInLockView())
                .map(e => e.value)
        ];

        for (const element of allElements) {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = lockFuncDisplayNames[element] || this.getDisplaySymbol(element);
            btn.dataset.value = element;

            const lockCount = state.getElementLockCount ? state.getElementLockCount(element) : 0;
            const isMaxLocked = lockCount >= 2;

            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            if (isMaxLocked) {
                btn.style.opacity = '0.4';
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.title = `${this.getDisplaySymbol(element)} 已达到最大锁定次数 (2/2)`;
            }
            btn.addEventListener('mouseenter', (e) => this.showLockCountTooltip(e, element, lockCount));
            btn.addEventListener('mouseleave', () => this.hideLockCountTooltip());

            const isProtectedInEasyMode = state.difficulty === 'easy' && ['+', '-', '*', '/'].includes(element);
            if (isProtectedInEasyMode) {
                btn.classList.add('protected');
                btn.disabled = true;
                btn.title = '四则运算无法被锁定';
            } else if (blockInput) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => this.toggleLockElement(element, btn));
            }
            itemsDiv.appendChild(btn);
        }

        body.appendChild(title);
        body.appendChild(itemsDiv);
    }
;

// floatKeypadBackspace — ⌫ 删除光标前一个元素（与键盘 Backspace 一致）
    UIController.prototype.floatKeypadBackspace = function() {
        if (this._isSpectating) return;
        if (this.gameController.currentPhase !== 'input_function') return;
        if (this.cursorIndex > 0) {
            if (window.audioManager) window.audioManager.playElementClick();
            this.expressionElements.splice(this.cursorIndex - 1, 1);
            this.cursorIndex--;
            this.updateExpressionDisplay();
        }
    }
;

// _syncFloatKeypadDisplay — 悬浮栏表达式显示镜像主输入区
    UIController.prototype._syncFloatKeypadDisplay = function() {
        if (this.floatKeypadDisplay) {
            this.floatKeypadDisplay.innerHTML = this.expressionDisplay.innerHTML;
        }
    }
;
