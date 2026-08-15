/**
 * UICoreTestFunc —— UICore 模块切片（UIController.prototype 挂载）
 *
 * 测试模式函数面板：渲染/编辑/删除/清空
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype.renderTestFunctionPanel = function() {
        const panel = document.getElementById('test-function-panel');
        const listEl = document.getElementById('test-fp-list');
        const emptyEl = document.getElementById('test-fp-empty');
        const clearAllBtn = document.getElementById('test-fp-clear-all');
        if (!panel || !listEl) return;

        const functions = this.gameController.getTestModeFunctions();
        listEl.innerHTML = '';

        if (!functions || functions.length === 0) {
            if (emptyEl) emptyEl.style.display = '';
            if (clearAllBtn) clearAllBtn.disabled = true;
            this._syncTestModeSubmitLabel();
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (clearAllBtn) clearAllBtn.disabled = false;

        functions.forEach((func, index) => {
            const item = document.createElement('div');
            item.className = 'test-fp-item';
            if (this._editingTestFunctionIndex === index) {
                item.classList.add('editing');
            }

            const colorDot = document.createElement('span');
            colorDot.className = 'test-fp-color';
            colorDot.style.background = func.color || '#ffffff';
            item.appendChild(colorDot);

            const exprEl = document.createElement('span');
            exprEl.className = 'test-fp-expr';
            exprEl.title = func.expression;
            // KaTeX 渲染表达式（非法表达式回退原文）
            const exprHtml = this._renderTestFunctionExpr(func.expression);
            exprEl.innerHTML = exprHtml;
            item.appendChild(exprEl);

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'test-fp-edit';
            editBtn.dataset.index = String(index);
            editBtn.title = '修改此函数';
            editBtn.textContent = '✎';
            item.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'test-fp-delete';
            delBtn.dataset.index = String(index);
            delBtn.title = '删除此函数';
            delBtn.textContent = '×';
            item.appendChild(delBtn);

            listEl.appendChild(item);
        });

        // 编辑模式下同步确认按钮文案
        this._syncTestModeSubmitLabel();
    }
;

// _syncTestModeSubmitLabel
    UIController.prototype._syncTestModeSubmitLabel = function() {
        if (this.confirmBtn && this.gameController && this.gameController.isTestMode()) {
            const isEditing = this._editingTestFunctionIndex != null && this._editingTestFunctionIndex >= 0;
            this.confirmBtn.textContent = isEditing ? '更新函数' : '绘制函数';
        }
    }
;

// _renderTestFunctionExpr
    UIController.prototype._renderTestFunctionExpr = function(expression) {
        if (window.MathLatex && typeof window.MathLatex.toLatex === 'function') {
            try {
                const latex = window.MathLatex.toLatex(expression);
                if (window.katex && typeof window.katex.renderToString === 'function') {
                    return window.katex.renderToString(latex, { throwOnError: false });
                }
                return latex;
            } catch (e) {
                // 解析失败，回退原文
            }
        }
        // 安全转义后显示原文
        return expression.replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
;

// _handleTestFunctionEdit
    UIController.prototype._handleTestFunctionEdit = function(index) {
        if (window.audioManager) window.audioManager.playClick();
        const functions = this.gameController.getTestModeFunctions();
        if (!functions || index < 0 || index >= functions.length) return;
        const fn = functions[index];

        // 进入编辑模式（记录被编辑的函数索引）
        this._editingTestFunctionIndex = index;

        // 回填表达式到输入框，光标置于末尾
        this.currentExpression = fn.expression;
        this.expressionElements = this.tokenizeExpression(fn.expression);
        this.cursorIndex = this.expressionElements.length;
        this.updateExpressionDisplay();

        // 刷新面板（高亮被编辑项 + 确认按钮变「更新函数」）
        this.renderTestFunctionPanel();

        this.showMessage(`正在修改函数 ${fn.expression}，改完点击「更新函数」`, 'info');
    }
;

// _cancelTestFunctionEdit
    UIController.prototype._cancelTestFunctionEdit = function() {
        if (this._editingTestFunctionIndex == null) return;
        this._editingTestFunctionIndex = null;
        // 刷新面板（去掉高亮 + 确认按钮恢复「绘制函数」）
        this.renderTestFunctionPanel();
    }
;

// _handleTestFunctionDelete
    UIController.prototype._handleTestFunctionDelete = function(index) {
        if (window.audioManager) window.audioManager.playClick();
        // 删除正在编辑的函数则退出编辑；删除其前的函数则编辑索引前移
        if (this._editingTestFunctionIndex != null) {
            if (this._editingTestFunctionIndex === index) {
                this._editingTestFunctionIndex = null;
            } else if (index < this._editingTestFunctionIndex) {
                this._editingTestFunctionIndex--;
            }
        }
        this.gameController.removeTestModeFunction(index);
        this.redrawTestModeFunctions();
    }
;

// _handleTestFunctionsClearAll
    UIController.prototype._handleTestFunctionsClearAll = function() {
        if (window.audioManager) window.audioManager.playClick();
        const functions = this.gameController.getTestModeFunctions();
        if (!functions || functions.length === 0) return;
        // 清空全部时退出编辑模式
        this._cancelTestFunctionEdit();
        this.gameController.clearTestModeFunctions();
        this.gridSystem.clearAll();
        this.redrawTestModeFunctions();
    }
;

// isMouseNearFunction
