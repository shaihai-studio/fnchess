// Auto-split from UIController.js — prototype-attached methods (UIInput)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIInput] UIController must be loaded before this file');
}

// bindExpressionScrollSupport
    UIController.prototype.bindExpressionScrollSupport = function() {
        if (!this.expressionDisplay || this._expressionScrollBound) return;
        this._expressionScrollBound = true;
        // 注意：不要在这里写内联 overflow-y: auto（会覆盖 CSS 类的按需滚动，
        // 导致不溢出时也常显滚动条）。是否可滚动交由 updateExpressionScrollState() 切换 .is-scrollable 类
        this.expressionDisplay.style.whiteSpace = 'normal';
        this.expressionDisplay.style.scrollBehavior = 'smooth';
        this.expressionDisplay.style.touchAction = 'pan-y';
        this.expressionDisplay.addEventListener('wheel', (e) => {
            if (this.gameController?.currentPhase !== 'input_function') return;
            const hasVerticalOverflow = this.expressionDisplay.scrollHeight > this.expressionDisplay.clientHeight + 2;
            if (!hasVerticalOverflow) return;
            e.preventDefault();
            this.expressionDisplay.scrollTop += e.deltaY;
        }, { passive: false });
        // 初次评估滚动状态（空表达式时不显示滚动条）
        this.updateExpressionScrollState();
    }
;

// updateExpressionScrollState
    UIController.prototype.updateExpressionScrollState = function() {
        if (!this.expressionDisplay) return;
        const overY = this.expressionDisplay.scrollHeight - this.expressionDisplay.clientHeight;
        this.expressionDisplay.classList.toggle('is-scrollable', overY > 1);
        const overX = this.expressionDisplay.scrollWidth - this.expressionDisplay.clientWidth;
        this.expressionDisplay.classList.toggle('is-scrollable-x', overX > 1);
    }
;

// handleKeyboardInput
    UIController.prototype.handleKeyboardInput = function(e) {
        // 关卡编辑器输入框聚焦时，交还浏览器原生处理：允许 textarea 换行、input 正常录入，
        // 避免被全局键盘监听（捕获阶段）拦截 Enter 等按键导致无法换行。
        // 任何文本框（输入框/文本域/可编辑区）一律交还浏览器原生处理，
        // 确保锁定等游戏键盘逻辑不会拦截或影响文本框输入（编辑器、Summa 对话框、联机房间码等）
        const _edT = e.target;
        if (_edT && _edT.tagName && (_edT.tagName === 'TEXTAREA' || _edT.tagName === 'INPUT' || _edT.isContentEditable)) {
            return;
        }
        const phase = this.gameController.currentPhase;
        const key = e.key;

        // ESC 关闭退出确认气泡（优先于其他 Escape 处理）
        if (key === 'Escape' && this.exitPopover && this.exitPopover.classList.contains('visible')) {
            e.preventDefault();
            this.hideExitConfirm();
            return;
        }

        if (this.gameController?.gameMode === 'race' && this._raceCountdownActive) {
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Backspace','Delete','Enter','Escape'].includes(key)) {
                e.preventDefault();
            }
            return;
        }

        if (this.handleStartSelectorKeys(e)) return;

        // 闯关胜利界面快捷键
        if (this.campaignVictoryModal && this.campaignVictoryModal.style.display !== 'none') {
            if (key === 'Enter') {
                e.preventDefault();
                this.goToNextCampaignLevel();
                return;
            }
            if (key === 'Delete' || key === 'Backspace') {
                e.preventDefault();
                this.retryCampaignLevel();
                return;
            }
        }
        
        // 回车键确认：在 select_target / set_forbidden / set_locks / input_function 阶段都可用
        if (key === 'Enter') {
            e.preventDefault();
            if (['set_forbidden', 'set_locks', 'input_function'].includes(phase)) {
                // 这些阶段可以直接确认
                this.handleConfirm();
            } else if (phase === 'select_target') {
                // 选择目标阶段需要检查是否已选择目标
                const state = this.gameController.getGameState();
                if (state.roundState.targetCell) {
                    this.handleConfirm();
                } else {
                    this.showMessage('请先点击棋盘选择目标网格', 'error');
                }
            }
            return;
        }
        
        // 以下键盘输入只在 input_function 阶段响应
        if (phase !== 'input_function') {
            return;
        }
        
        // P2P：非本方（构造方）回合，禁止通过键盘编辑表达式
        if (this.isP2PMode && !this._isMyTurn()) {
            return;
        }
        
        // 允许的键：x, 0-9, +, -, *, /, ., !, (, ), ^, π, e, i
        if (key === 'x' || key === 'X') {
            e.preventDefault();
            this.addElementToExpression('x');
        } else if (/^[0-9]$/.test(key)) {
            e.preventDefault();
            this.addElementToExpression(key);
        } else if (['+', '-', '*', '/', '.', '!', '(', ')', '^'].includes(key)) {
            e.preventDefault();
            this.addElementToExpression(key);
        } else if (key === 'p' || key === 'P') {
            // p 键输入 π
            e.preventDefault();
            this.addElementToExpression('π');
        } else if (key === 'e' || key === 'E') {
            // e 键输入自然常数 e
            e.preventDefault();
            this.addElementToExpression('e');
        } else if (key === 'i' || key === 'I') {
            // i 键输入虚数单位 i
            e.preventDefault();
            this.addElementToExpression('i');
        } else if (key === 's' || key === 'S') {
            // s 键输入 sin
            e.preventDefault();
            this.addElementToExpression('sin');
        } else if (key === 'c' || key === 'C') {
            // c 键输入 cos
            e.preventDefault();
            this.addElementToExpression('cos');
        } else if (key === 't' || key === 'T') {
            // t 键输入 tan
            e.preventDefault();
            this.addElementToExpression('tan');
        } else if (key === 'a' || key === 'A') {
            // a 键输入 abs
            e.preventDefault();
            this.addElementToExpression('abs');
        } else if (key === 'r' || key === 'R') {
            // r 键输入 sqrt
            e.preventDefault();
            this.addElementToExpression('sqrt');
        } else if (key === 'l' || key === 'L') {
            // l 键输入 ln
            e.preventDefault();
            this.addElementToExpression('ln');
        } else if (key === 'Backspace') {
            e.preventDefault();
            // 删除光标前的一个元素
            if (this.cursorIndex > 0) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(this.cursorIndex - 1, 1);
                this.cursorIndex--;
                this.updateExpressionDisplay();
            }
        } else if (key === 'Delete') {
            e.preventDefault();
            // 删除光标后的一个元素
            if (this.cursorIndex < this.expressionElements.length) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(this.cursorIndex, 1);
                this.updateExpressionDisplay();
            }
        } else if (key === 'ArrowLeft') {
            e.preventDefault();
            if (this.cursorIndex > 0) {
                this.cursorIndex--;
                this.updateExpressionDisplay();
            }
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            if (this.cursorIndex < this.expressionElements.length) {
                this.cursorIndex++;
                this.updateExpressionDisplay();
            }
        } else if (key === 'ArrowUp' || key === 'ArrowDown') {
            e.preventDefault();
            this.handleVerticalCursorMove(key === 'ArrowUp' ? -1 : 1);
        } else if (key === 'Home') {
            e.preventDefault();
            this.cursorIndex = 0;
            this.updateExpressionDisplay();
        } else if (key === 'End') {
            e.preventDefault();
            this.cursorIndex = this.expressionElements.length;
            this.updateExpressionDisplay();
        } else if (key === 'Escape') {
            e.preventDefault();
            // 清除表达式
            this.handleClear();
        }
    }
;

// isMobileElementLayout
    UIController.prototype.isMobileElementLayout = function() {
        return window.innerWidth <= 768 || (window.innerWidth <= 1024 && window.matchMedia?.('(orientation: portrait)').matches);
    }
;

// initDraggableElements
    UIController.prototype.initDraggableElements = function() {
        const phase = this.gameController.currentPhase;
        
        // 在锁定阶段使用特殊的锁定元素视图
        if (phase === 'set_locks') {
            this.initLockElementsView();
            return;
        }
        
        const elements = this.parser.getAvailableElements();
        
        // 获取当前回合被锁定的元素
        const state = this.gameController.getGameState();
        const roundLockedElements = state.roundState.lockedElements || [];
        
        // 函数显示名称映射
        const funcDisplayNames = {
            'sin': 'sin',
            'cos': 'cos',
            'tan': 'tan',
            'arcsin': 'arcsin',
            'arccos': 'arccos',
            'arctan': 'arctan',
            'abs': 'abs',
            'exp': 'exp',
            'ln': 'ln',
            'log': 'log'
        };
        
        // 移动端/平板竖屏：使用内联面板+Tab切换
        if (this.isMobileElementLayout() && this.inlineElementsTabs && this.inlineElementsBody) {
            this.elementsContainer.style.display = 'none';
            this.inlineElementsCard.style.display = 'block';
            this.renderMobileInlineElements(elements, roundLockedElements, funcDisplayNames);
            return;
        } else {
            this.elementsContainer.style.display = '';
            if (this.inlineElementsCard) this.inlineElementsCard.style.display = 'none';
        }
        
        this.elementsContainer.innerHTML = '';
        
        // 创建分类容器
        const categories = [
            { key: 'variable', label: '变量' },
            { key: 'numbers', label: '数字' },
            { key: 'basicOperators', label: '四则运算' },
            { key: 'operators', label: '其他运算符' },
            { key: 'functions', label: '函数' }
        ];
        
        for (const cat of categories) {
            const catDiv = document.createElement('div');
            catDiv.className = 'element-category';
            
            const label = document.createElement('div');
            label.className = 'category-label';
            label.textContent = cat.label;
            catDiv.appendChild(label);
            
            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'element-items';
            
            for (const item of elements[cat.key]) {
                // 反三角函数：简单难度/分数关或开关关闭时直接不显示
                const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(item.value);
                if (isInverseTrig && this.shouldHideInverseTrigElement()) {
                    continue;
                }

                const btn = document.createElement('button');
                btn.className = 'element-btn';
                // 使用数学符号显示，函数使用显示名称映射
                const displayValue = cat.key === 'functions' && funcDisplayNames[item.value] 
                    ? funcDisplayNames[item.value] 
                    : this.getDisplaySymbol(item.value);
                btn.textContent = displayValue;
                btn.dataset.value = item.value;

                // 反三角函数未解锁：锁定样式但保持可点击，点击弹出解锁提示
                if (isInverseTrig && !this.isInverseTrigUnlocked()) {
                    btn.classList.add('locked', 'inverse-trig-locked');
                    btn.innerHTML = `${displayValue} <span class="lock-icon">🔒</span>`;
                    btn.title = '需通关全部分数关解锁';
                    btn.addEventListener('click', () => this.showInverseTrigLockedDialog());
                    itemsDiv.appendChild(btn);
                    continue;
                }
                
                // 检查是否被本回合锁定
                const isLockedThisRound = roundLockedElements.includes(item.value);
                // 检查是否被之前回合锁定（parser中的locked状态）
                const isLockedPreviously = item.locked;
                
                if (isLockedThisRound || isLockedPreviously) {
                    btn.classList.add('locked');
                    btn.disabled = true;
                    const lockedDisplayValue = cat.key === 'functions' && funcDisplayNames[item.value] 
                        ? funcDisplayNames[item.value] 
                        : this.getDisplaySymbol(item.value);
                    btn.innerHTML = `${lockedDisplayValue} <span class="lock-icon">🔒</span>`;
                    if (isLockedThisRound) {
                        btn.title = '本回合被锁定';
                    }
                } else {
                    btn.addEventListener('click', () => this.addElementToExpression(item.value));
                }
                
                itemsDiv.appendChild(btn);
            }
            
            catDiv.appendChild(itemsDiv);
            this.elementsContainer.appendChild(catDiv);
        }
    }
;

// initLockElementsView
    UIController.prototype.initLockElementsView = function() {
        // 移动端/平板竖屏：使用内联面板
        if (this.isMobileElementLayout() && this.inlineElementsTabs && this.inlineElementsBody) {
            this.elementsContainer.style.display = 'none';
            this.inlineElementsCard.style.display = 'block';

            this.inlineElementsTabs.innerHTML = '';
            this.inlineElementsBody.innerHTML = '';

            // 单个tab显示"锁定元素"
            const tab = document.createElement('button');
            tab.className = 'inline-elements-tab active';
            tab.textContent = '选择要锁定的元素';
            this.inlineElementsTabs.appendChild(tab);
        } else {
            this.elementsContainer.style.display = '';
            if (this.inlineElementsCard) this.inlineElementsCard.style.display = 'none';
        }

        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements;
        
        this.elementsContainer.innerHTML = '';
        
        const title = document.createElement('div');
        title.className = 'element-category';
        title.style.width = '100%';
        
        const label = document.createElement('div');
        label.className = 'category-label';
        label.textContent = `选择要锁定的元素 (${alreadyLocked.length}/${state.maxLocks})`;
        title.appendChild(label);
        
        // 同步更新阶段提示文本
        if (state.difficulty === 'easy') {
            this.phaseHintElement.textContent = `点击下方元素锁定对方 (${alreadyLocked.length}/${state.maxLocks})，四则运算无法被锁定`;
        } else {
            this.phaseHintElement.textContent = `点击下方元素锁定对方 (${alreadyLocked.length}/${state.maxLocks})`;
        }
        
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'element-items';
        
        // 收集所有可锁定的元素（除了x和括号）
        // 注意：简单难度下四则运算也会显示，但处于保护状态
        // 反三角函数：简单/分数关、未解锁、开关关闭时均不参与锁定视图
        const allElements = [
            ...elements.numbers.map(e => e.value),  // 包含 π, e, i
            ...elements.basicOperators.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x' && e.value !== '(' && e.value !== ')').map(e => e.value),
            ...elements.functions
                .filter(e => !(Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(e.value))
                    || !this._shouldSkipInverseTrigInLockView())
                .map(e => e.value)
        ];
        
        // 函数显示名称映射（用于锁定视图）
        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp',
            'ln': 'ln', 'log': 'log'
        };
        
        for (const element of allElements) {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            // 使用数学符号显示，函数使用显示名称映射
            btn.textContent = lockFuncDisplayNames[element] || this.getDisplaySymbol(element);
            btn.dataset.value = element;
            
            // 获取该元素的锁定次数
            const lockCount = state.getElementLockCount ? state.getElementLockCount(element) : 0;
            const isMaxLocked = lockCount >= 2;
            
            // 检查是否已被本回合锁定
            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            
            // 如果已经达到最大锁定次数，半透明化并禁用
            if (isMaxLocked) {
                btn.style.opacity = '0.4';
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.title = `${this.getDisplaySymbol(element)} 已达到最大锁定次数 (2/2)`;
            }
            
            // 添加鼠标悬停事件显示气泡框
            btn.addEventListener('mouseenter', (e) => {
                this.showLockCountTooltip(e, element, lockCount);
            });
            btn.addEventListener('mouseleave', () => {
                this.hideLockCountTooltip();
            });
            
            // 检查是否为简单难度的受保护元素（四则运算）
            const isProtectedInEasyMode = state.difficulty === 'easy' && 
                ['+', '-', '*', '/'].includes(element);
            
            if (isProtectedInEasyMode) {
                // 简单难度：四则运算显示为保护状态，无法点击
                btn.classList.add('protected');
                btn.disabled = true;
                btn.title = '四则运算无法被锁定';
            } else {
                btn.addEventListener('click', () => this.toggleLockElement(element, btn));
            }
            
            itemsDiv.appendChild(btn);
        }
        
        title.appendChild(itemsDiv);
        // 移动端渲染到内联面板，桌面端渲染到底部元素栏
        if (this.isMobileElementLayout() && this.inlineElementsBody) {
            this.inlineElementsBody.innerHTML = '';
            this.inlineElementsBody.appendChild(title);
        } else {
            this.elementsContainer.appendChild(title);
        }
    }
;

// toggleLockElement
    UIController.prototype.toggleLockElement = function(element, btn) {
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements;

        // P2P：非本方回合（锁定阶段由选择方操作）禁止锁定/解锁
        if (this.isP2PMode && !this._isMyTurn()) {
            this.showMessage('等待对手操作中…', 'info');
            return;
        }
        
        if (alreadyLocked.includes(element)) {
            // 取消锁定（从数组中移除）
            const index = alreadyLocked.indexOf(element);
            if (index > -1) {
                alreadyLocked.splice(index, 1);
                // 解锁分支不经 GameController，需手动递增版本号，确保对手能应用本次同步
                if (this.gameController && typeof this.gameController.bumpStateVersion === 'function') {
                    this.gameController.bumpStateVersion();
                }
            }
            btn.classList.remove('selected');
            btn.style.background = '';
        } else {
            // x 和括号不能被锁定
            if (element === 'x') {
                this.showMessage('变量 x 不能被锁定', 'warning');
                return;
            }
            if (element === '(' || element === ')') {
                this.showMessage('括号不能被锁定', 'warning');
                return;
            }
            
            // 添加锁定
            if (this.gameController.addLockedElement(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
        }
        
        // 更新标签
        this.initLockElementsView();

        // 锁定状态变化后同步给对手（解锁分支不经 GameController，需手动同步）；
        // 绕过节流，保证每次点击锁定/解锁都立即同步
        this._p2pSyncNow();
    }
;

// showLockCountTooltip
    UIController.prototype.showLockCountTooltip = function(event, element, count) {
        // 移除旧的气泡框
        this.hideLockCountTooltip();
        
        const btn = event.target;
        const displaySymbol = this.getDisplaySymbol(element);
        
        // 创建气泡框
        const tooltip = document.createElement('div');
        tooltip.id = 'lock-count-tooltip';
        tooltip.className = 'lock-count-tooltip';
        tooltip.textContent = `(${count}/2)`;
        
        // 定位气泡框
        const rect = btn.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${rect.right + 8}px`;
        tooltip.style.top = `${rect.top + rect.height / 2 - 15}px`;
        tooltip.style.zIndex = '10000';
        tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        
        document.body.appendChild(tooltip);
    }
;

// hideLockCountTooltip
    UIController.prototype.hideLockCountTooltip = function() {
        const tooltip = document.getElementById('lock-count-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
;

// updateLockedElements
    UIController.prototype.updateLockedElements = function() {
        const state = this.gameController.getGameState();
        const lockedElements = state.roundState.lockedElements;
        
        // 函数显示名称映射（用于锁定视图）
        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp',
            'ln': 'ln', 'log': 'log'
        };
        
        // 更新按钮状态（桌面端 + 移动端内联面板）
        const buttons = this.elementsContainer.querySelectorAll('.element-btn');
        const inlineButtons = this.inlineElementsBody ? this.inlineElementsBody.querySelectorAll('.element-btn') : [];
        const allButtons = [...buttons, ...inlineButtons];
        allButtons.forEach(btn => {
            const value = btn.dataset.value;

            // 反三角函数未解锁：始终保持锁定态（可点击弹解锁提示），不被本轮锁定状态覆盖
            const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(value);
            if (isInverseTrig && !this.isInverseTrigUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.disabled = false;
                if (!btn.querySelector('.lock-icon')) {
                    const originalValue = lockFuncDisplayNames[value] || this.getDisplaySymbol(value);
                    btn.innerHTML = `${originalValue} <span class="lock-icon">🔒</span>`;
                }
                return;
            }

            // 先清除所有锁定状态
            btn.classList.remove('locked');
            btn.disabled = false;
            // 移除锁图标，恢复原始文本
            if (btn.querySelector('.lock-icon')) {
                const originalValue = lockFuncDisplayNames[value] || this.getDisplaySymbol(value);
                btn.textContent = originalValue;
            }
            
            // 如果元素在当前锁定列表中，添加锁定状态
            if (lockedElements.includes(value)) {
                btn.classList.add('locked');
                btn.disabled = true;
                if (!btn.querySelector('.lock-icon')) {
                    btn.innerHTML = `${value} <span class="lock-icon">🔒</span>`;
                }
            }
        });
    }
;

// addElementToExpression
    UIController.prototype.addElementToExpression = function(element) {
        if (this.gameController?.gameMode === 'race' && this._raceCountdownActive) return;
        const phase = this.gameController.currentPhase;
        if (phase !== 'input_function') {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage('当前阶段不能输入函数', 'error');
            return;
        }
        
        // 人机模式下，如果当前是AI的回合，禁止玩家操作
        const state = this.gameController.getGameState();
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            this.showMessage('Summa 正在思考中...', 'info');
            return;
        }

        // P2P：非本方回合（构造方阶段）禁止编辑表达式
        if (this.isP2PMode && !this._isMyTurn()) {
            this.showMessage('等待对手构造函数…', 'info');
            return;
        }
        
        // 检查元素是否被锁定
        if (state.roundState.lockedElements.includes(element)) {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage(`元素 "${element}" 已被锁定，无法使用`, 'error');
            return;
        }
        
        // 函数类元素自动添加括号
        const functionElements = ['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'abs', 'exp', 'ln', 'log', 'sqrt'];
        if (functionElements.includes(element)) {
            // 插入函数名和括号：[sin, (, )]
            this.expressionElements.splice(this.cursorIndex, 0, element, '(', ')');
            // 光标定位到括号中间（函数名和左括号后面，即+2位置）
            this.cursorIndex += 2;
        } else {
            // 其他元素正常插入
            this.expressionElements.splice(this.cursorIndex, 0, element);
            this.cursorIndex++;
        }
        
        if (window.audioManager) window.audioManager.playClick();
        this.updateExpressionDisplay();
    }
;

// getDisplaySymbol
    UIController.prototype.getDisplaySymbol = function(element) {
        const symbolMap = {
            '*': '×',
            '/': '÷',
            '!': '!'
        };
        return symbolMap[element] || element;
    }
;

// updateExpressionDisplay
    UIController.prototype.updateExpressionDisplay = function(skipSync = false) {
        this.currentExpression = this.expressionElements.join('');
        this.expressionDisplay.innerHTML = '';
        
        // 添加 "y =" 前缀（始终显示）
        const prefix = document.createElement('span');
        prefix.className = 'expression-prefix';
        prefix.textContent = 'y =';
        this.expressionDisplay.appendChild(prefix);
        
        if (this.expressionElements.length === 0) {
            // 表达式为空时显示闪烁的光标
            const cursorSpan = document.createElement('span');
            cursorSpan.className = 'cursor';
            cursorSpan.textContent = '|';
            this.expressionDisplay.appendChild(cursorSpan);
            this.cursorIndex = 0;
            this._renderMathPreview();
            return;
        }
        
        // 确保光标位置合法
        if (this.cursorIndex > this.expressionElements.length) {
            this.cursorIndex = this.expressionElements.length;
        }
        
        for (let i = 0; i < this.expressionElements.length; i++) {
            // 在光标位置前插入光标元素
            if (i === this.cursorIndex) {
                const cursorSpan = document.createElement('span');
                cursorSpan.className = 'cursor';
                cursorSpan.textContent = '|';
                this.expressionDisplay.appendChild(cursorSpan);
            }
            
            const span = document.createElement('span');
            span.className = 'expression-element';
            // 使用数学符号显示（纯文本，配合等宽字体，保持原有输入区风格）
            span.textContent = this.getDisplaySymbol(this.expressionElements[i]);
            span.dataset.index = i;
            this.expressionDisplay.appendChild(span);
        }
        
        // 如果光标在末尾
        if (this.cursorIndex === this.expressionElements.length) {
            const cursorSpan = document.createElement('span');
            cursorSpan.className = 'cursor';
            cursorSpan.textContent = '|';
            this.expressionDisplay.appendChild(cursorSpan);
        }

        // 自动滚动：以光标位置为锚点保持可见（修复 #31：不再永远滚到末尾，
        // 光标停在表达式中间插入元素时，编辑点不会被滚出视野）
        if (this.expressionDisplay.scrollHeight > this.expressionDisplay.clientHeight) {
            const cursorSpan = this.expressionDisplay.querySelector('.cursor');
            if (cursorSpan && cursorSpan.scrollIntoView) {
                cursorSpan.scrollIntoView({ block: 'nearest' });
            } else {
                this.expressionDisplay.scrollTop = this.expressionDisplay.scrollHeight;
            }
        }

        // 刷新滚动条按需显示状态（修复 #45：不溢出时不显示滚动条）
        this.updateExpressionScrollState();

        // 渲染 KaTeX 数学预览（表达式实时美化，解析失败回退纯文本）
        this._renderMathPreview();

        // P2P：本地输入时防抖同步，避免高频发送 state_sync 导致乱序覆盖
        if (!skipSync) {
            if (this._syncDebounceTimer) clearTimeout(this._syncDebounceTimer);
            this._syncDebounceTimer = setTimeout(() => {
                this._syncDebounceTimer = null;
                this._syncToPeer();
            }, 250);
            // 表达式属于 UI 层状态，手动递增版本号，确保远端能持续收到最新表达式
            if (this.gameController && typeof this.gameController.bumpStateVersion === 'function') {
                this.gameController.bumpStateVersion();
            }
        }
    }
;

// renderMathPreview
    UIController.prototype._renderMathPreview = function() {
        if (!this.mathPreview) {
            this.mathPreview = document.getElementById('math-preview');
        }
        if (!this.mathPreview) return;

        const expr = this.expressionElements.join('');
        // 空表达式 / 引擎未就绪：显示引导提示（预览区域常驻可见）
        if (!expr || typeof window.katex === 'undefined' || !window.MathLatex) {
            this.mathPreview.innerHTML = '';
            const hint = document.createElement('span');
            hint.className = 'math-preview-empty';
            hint.textContent = '构建表达式后在此实时预览数学公式';
            this.mathPreview.appendChild(hint);
            return;
        }

        const latex = window.MathLatex.toLatex(expr);
        this.mathPreview.innerHTML = '';
        if (latex === null) {
            // 表达式不完整/非法：显示原文，提示暂不可渲染
            const raw = document.createElement('span');
            raw.className = 'math-preview-raw';
            raw.textContent = expr;
            this.mathPreview.appendChild(raw);
            return;
        }

        window.katex.render(latex, this.mathPreview, { throwOnError: false });
    }
;

// handleExpressionClick
    UIController.prototype.handleExpressionClick = function(e) {
        const phase = this.gameController.currentPhase;
        if (phase !== 'input_function') return;
        
        // 人机模式下，如果当前是AI的回合，阻止玩家操作
        const state = this.gameController.getGameState();
        if (this.gameController.gameMode === 'ai' && state.currentPlayer === 'B') {
            return;
        }

        // P2P：非本方回合禁止编辑表达式
        if (this.isP2PMode && !this._isMyTurn()) {
            return;
        }
        
        // 如果点击的是某个具体的元素块，则删除该元素
        const elementSpan = e.target.closest('.expression-element');
        if (elementSpan) {
            const index = parseInt(elementSpan.dataset.index);
            if (!isNaN(index)) {
                if (window.audioManager) window.audioManager.playElementClick();
                this.expressionElements.splice(index, 1);
                // 调整光标位置：如果删除的元素在光标前，光标也要前移
                if (index < this.cursorIndex) {
                    this.cursorIndex--;
                }
                this.updateExpressionDisplay();
            }
            return;
        }
        
        // 如果点击的是空白区域，则将光标移动到点击位置
        const rect = this.expressionDisplay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY; // 使用绝对Y坐标来匹配元素
        
        // 收集所有表达式的元素（排除 cursor），按Y坐标分组
        const lineGroups = new Map(); // key: 行的Y坐标, value: [{elementIndex, left, right, center}]
        const elementIndices = []; // 记录每个子元素对应的 expressionElements 索引
        
        for (let i = 0; i < this.expressionDisplay.children.length; i++) {
            const child = this.expressionDisplay.children[i];
            
            // 跳过 cursor 元素
            if (child.classList.contains('cursor')) continue;
            
            // 只有有 index 的才是表达式元素
            if (child.dataset.index === undefined) continue;
            
            const childRect = child.getBoundingClientRect();
            const childLeft = childRect.left - rect.left;
            const childRight = childLeft + childRect.width;
            const childCenter = childLeft + childRect.width / 2;
            const childTop = Math.round(childRect.top);
            const elementIndex = parseInt(child.dataset.index);
            
            if (!lineGroups.has(childTop)) {
                lineGroups.set(childTop, []);
            }
            lineGroups.get(childTop).push({ 
                elementIndex, // 对应 expressionElements 的索引
                left: childLeft, 
                right: childRight, 
                center: childCenter 
            });
            elementIndices.push({ childIndex: i, elementIndex });
        }
        
        if (lineGroups.size === 0) {
            // 没有表达式元素，光标移到开头
            this.cursorIndex = 0;
            this.updateExpressionDisplay();
            return;
        }
        
        // 找出点击位置所在的行（按Y坐标匹配）
        let targetLine = null;
        let minYDiff = Infinity;
        
        for (const lineY of lineGroups.keys()) {
            const yDiff = Math.abs(lineY - clickY);
            if (yDiff < minYDiff) {
                minYDiff = yDiff;
                targetLine = lineGroups.get(lineY);
            }
        }
        
        // 在目标行中查找光标位置
        let newCursorIndex = 0;
        
        if (targetLine) {
            // 按 left 排序
            targetLine.sort((a, b) => a.left - b.left);
            
            // 在该行中找到点击X位置对应的元素
            for (let i = 0; i < targetLine.length; i++) {
                const item = targetLine[i];
                if (clickX < item.center) {
                    newCursorIndex = item.elementIndex;
                    break;
                }
                newCursorIndex = item.elementIndex + 1;
            }
        } else {
            // 没有找到目标行，使用最近的元素
            const allItems = [];
            for (const line of lineGroups.values()) {
                allItems.push(...line);
            }
            allItems.sort((a, b) => a.left - b.left);
            
            for (let i = 0; i < allItems.length; i++) {
                if (clickX < allItems[i].center) {
                    newCursorIndex = allItems[i].elementIndex;
                    break;
                }
                newCursorIndex = allItems[i].elementIndex + 1;
            }
        }
        
        this.cursorIndex = newCursorIndex;
        this.updateExpressionDisplay();
    }
;

// handleVerticalCursorMove
    UIController.prototype.handleVerticalCursorMove = function(direction) {
        const phase = this.gameController.currentPhase;
        if (phase !== 'input_function') return;
        if (this.expressionElements.length === 0) return;
        
        const rect = this.expressionDisplay.getBoundingClientRect();
        
        // 收集所有元素的位置信息
        const allItems = [];
        for (let i = 0; i < this.expressionDisplay.children.length; i++) {
            const child = this.expressionDisplay.children[i];
            if (child.classList.contains('cursor')) continue;
            if (child.dataset.index === undefined) continue;
            
            const childRect = child.getBoundingClientRect();
            allItems.push({
                index: parseInt(child.dataset.index),
                y: Math.round(childRect.top),
                left: childRect.left,
                right: childRect.right,
                center: childRect.left + childRect.width / 2
            });
        }
        
        if (allItems.length === 0) return;
        
        // 获取当前光标位置
        let cursorY = null;
        let cursorX = null;
        
        for (let i = 0; i < this.expressionDisplay.children.length; i++) {
            const child = this.expressionDisplay.children[i];
            if (child.classList.contains('cursor')) {
                const childRect = child.getBoundingClientRect();
                cursorY = Math.round(childRect.top);
                cursorX = childRect.left + childRect.width / 2;
                break;
            }
        }
        
        // 如果没找到光标，使用末尾位置
        if (cursorY === null) {
            const lastItem = allItems[allItems.length - 1];
            if (lastItem) {
                cursorY = lastItem.y;
                cursorX = lastItem.right + 20;
            }
        }
        
        if (cursorY === null) return;
        
        // 收集所有不同的Y坐标（行）
        const yValues = [...new Set(allItems.map(item => item.y))].sort((a, b) => a - b);
        
        // 找到当前行索引 - 使用最近匹配而非精确匹配，防止因微小偏移导致匹配失败
        let currentLineIdx = yValues.indexOf(cursorY);
        if (currentLineIdx === -1 && cursorY !== null) {
            // 精确匹配失败时，找最近的行
            let minDiff = Infinity;
            for (let i = 0; i < yValues.length; i++) {
                const diff = Math.abs(yValues[i] - cursorY);
                if (diff < minDiff) { minDiff = diff; currentLineIdx = i; }
            }
        }
        
        // 计算目标行
        const targetLineIdx = currentLineIdx + direction;
        if (targetLineIdx < 0 || targetLineIdx >= yValues.length) return;
        
        const targetY = yValues[targetLineIdx];
        
        // 找到目标行中的所有元素
        const targetItems = allItems.filter(item => item.y === targetY).sort((a, b) => a.index - b.index);
        
        if (targetItems.length === 0) return;
        
        // 找到最近的插入位置
        let bestIndex = 0;
        let minDist = Infinity;
        
        // 检查每个可能的插入位置
        for (let pos = 0; pos <= targetItems.length; pos++) {
            let x;
            if (pos === 0) {
                x = targetItems[0].left - 10;
            } else if (pos === targetItems.length) {
                x = targetItems[pos - 1].right + 10;
            } else {
                x = (targetItems[pos - 1].right + targetItems[pos].left) / 2;
            }
            
            const dist = Math.abs(x - cursorX);
            if (dist < minDist) {
                minDist = dist;
                bestIndex = pos === 0 ? targetItems[0].index : 
                           (pos === targetItems.length ? targetItems[pos - 1].index + 1 : 
                            targetItems[pos - 1].index + 1);
            }
        }
        
        this.cursorIndex = bestIndex;
        this.updateExpressionDisplay();
    }
;

// clearExpression
    UIController.prototype.clearExpression = function() {
        if (window.audioManager && this.expressionElements && this.expressionElements.length > 0) {
            window.audioManager.playElementClick();
        }
        this.expressionElements = [];
        this.currentExpression = '';
        this.updateExpressionDisplay();
    }
;

// bindStartKeyboardSupport
    UIController.prototype.bindStartKeyboardSupport = function() {
        if (this._startKeyBound) return;
        this._startKeyBound = true;
        document.addEventListener('keydown', (e) => {
            if (!this.startModal || this.startModal.style.display === 'none') return;
            const targetTag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
            if (['input', 'textarea', 'select'].includes(targetTag)) return;
            // ESC：关闭开始弹窗，返回启动封面（修复 #11）
            if (e.key === 'Escape') {
                // 若有更上层弹窗打开（如音乐设置/战报等），先让上层处理，避免误关开始弹窗
                if (this._modalStackTopVisible() !== this.startModal) return;
                e.preventDefault();
                this.hideStartModal();
                this.showSplash();
                return;
            }
            // 回车：开始游戏
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleStart();
            }
        });
        // 点击遮罩（弹窗外部空白处）关闭并返回启动封面（修复 #11）
        this.startModal.addEventListener('click', (e) => {
            if (e.target === this.startModal) {
                this.hideStartModal();
                this.showSplash();
            }
        });
    }
;

// getCurrentExpressionLength
    UIController.prototype.getCurrentExpressionLength = function() {
        const expression = this.currentExpression || this.gameController?.getGameState?.()?.roundState?.functionExpression || '';
        if (!expression) return 0;
        const cleanExpr = expression.replace(/\s+/g, '').replace(/[()（）]/g, '');
        let length = 0;
        const tokenRegex = /(sin|cos|tan|arcsin|arccos|arctan|abs|exp|ln|log|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
        let match;
        while ((match = tokenRegex.exec(cleanExpr)) !== null) {
            length++;
        }
        if (length === 0 && cleanExpr.length > 0) {
            length = cleanExpr.length;
        }
        return length;
    }
;

// tokenizeExpression
    UIController.prototype.tokenizeExpression = function(expr) {
        const tokens = [];
        let i = 0;
        const len = expr.length;
        
        // 多字母函数名列表
        const multiCharFuncs = ['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'abs', 'exp', 'ln', 'log', 'sqrt'];
        
        while (i < len) {
            let matched = false;
            
            // 尝试匹配多字母函数
            for (const func of multiCharFuncs) {
                if (expr.substring(i, i + func.length) === func) {
                    tokens.push(func);
                    i += func.length;
                    matched = true;
                    break;
                }
            }
            
            if (matched) continue;
            
            // 匹配单个字符（变量、数字、运算符、括号等）
            tokens.push(expr[i]);
            i++;
        }
        
        return tokens;
    }
;

