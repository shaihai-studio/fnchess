/**
 * LevelEditorExtension - 关卡编辑器扩展（简化版）
 * 协调编辑模式和验证模式
 */
class LevelEditorExtension {
    constructor(gameController, uiController, gridSystem) {
        this.gameController = gameController;
        this.uiController = uiController;
        this.gridSystem = gridSystem;
        this.crypto = new SeedCrypto();

        this.isActive = false;
        this.editMode = 'edit';
        this.targetCells = [];
        this.forbiddenCells = [];
        this.lockedElements = [];
        this.solutionVerified = false;
        this.solutionTokens = 0;

        this._evalIntercepted = false;
    }

    activate() {
        this.isActive = true;
        this.editMode = 'edit';
        this.targetCells = [];
        this.forbiddenCells = [];
        this.lockedElements = [];
        this.solutionVerified = false;
        this.solutionTokens = 0;

        this._originalLockedElements = this.uiController?.parser?.lockedElements
            ? [...this.uiController.parser.lockedElements]
            : [];

        this.gameController.initGame(1, 'test', 'local');
        this.uiController.hideBattleUI?.();
        this.uiController.hideRaceUI?.();
        this.uiController.hideStartModal?.();

        this._buildEditorUI();
        this._switchToEditMode();
    }

    deactivate() {
        this.isActive = false;
        const editorUI = document.getElementById('editor-mode-switcher');
        if (editorUI) editorUI.remove();

        this.gameController.campaignState = { active: false, levelPack: null, totalLevels: 0, currentLevelId: 1 };
        this.gameController.difficulty = 'normal';
        this._setInputUIVisible(true);
        this.uiController.restoreBattleUI?.();
        this.uiController.showModal?.(document.getElementById('start-modal'));

        // 恢复 parser 原锁定集合，避免污染后续对局（P13）
        if (this.uiController?.parser) {
            this.uiController.parser.lockedElements = this._originalLockedElements ?? [];
        }
        this._originalLockedElements = null;
    }

    _buildEditorUI() {
        if (document.getElementById('editor-mode-switcher')) return;

        const phaseCard = document.getElementById('phase-hint')?.closest('.panel-card');
        if (!phaseCard) return;

        const controlPanel = document.querySelector('.control-panel');
        if (!controlPanel) return;

        let div = document.getElementById('editor-mode-switcher');
        if (div) div.remove();
        div = document.createElement('div');
        div.id = 'editor-mode-switcher';
        div.className = 'panel-card';
        div.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <button class="btn btn-primary" id="editor-edit-btn">编辑模式</button>
                <button class="btn" id="editor-verify-btn">验证模式</button>
            </div>
            <div id="editor-hint" style="font-size:13px;line-height:1.7;padding:8px;background:rgba(15,23,42,0.5);border-radius:6px;"></div>
            <div id="editor-edit-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-small" id="editor-clear-cells-btn">清除所有格子</button>
                <button class="btn btn-secondary btn-small" id="editor-import-btn">导入种子</button>
                <button class="btn btn-exit btn-small" id="editor-exit-btn">退出编辑器</button>
            </div>`;
        controlPanel.appendChild(div);

        document.getElementById('editor-edit-btn').addEventListener('click', () => this._switchToEditMode());
        document.getElementById('editor-verify-btn').addEventListener('click', () => this._switchToVerifyMode());
        document.getElementById('editor-clear-cells-btn').addEventListener('click', () => {
            this.targetCells = [];
            this.forbiddenCells = [];
            this.solutionVerified = false;
            this._refreshGrid();
            this._refreshHint();
        });
        document.getElementById('editor-import-btn').addEventListener('click', () => this._showImportDialog());
        document.getElementById('editor-exit-btn').addEventListener('click', () => this._showExitConfirm());
    }

    _showExitConfirm() {
        if (document.getElementById('editor-exit-confirm-popover')) return;
        if (window.audioManager) window.audioManager.playClick();

        const popover = document.createElement('div');
        popover.id = 'editor-exit-confirm-popover';
        popover.className = 'exit-confirm-popover';
        popover.innerHTML = `
            <p>确定要退出关卡编辑器吗？</p>
            <div class="popover-buttons">
                <button class="btn btn-small btn-confirm-exit" id="editor-confirm-exit-btn">确认退出</button>
                <button class="btn btn-small btn-cancel" id="editor-cancel-exit-btn">取消</button>
            </div>`;
        document.body.appendChild(popover);
        requestAnimationFrame(() => popover.classList.add('visible'));

        popover.querySelector('#editor-confirm-exit-btn').addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this._hideExitConfirm();
            this.deactivate();
        });
        popover.querySelector('#editor-cancel-exit-btn').addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this._hideExitConfirm();
        });
    }

    _hideExitConfirm() {
        document.getElementById('editor-exit-confirm-popover')?.remove();
    }

    _switchToEditMode() {
        this.editMode = 'edit';
        document.getElementById('editor-edit-btn')?.classList.add('btn-primary');
        document.getElementById('editor-verify-btn')?.classList.remove('btn-primary');
        const editActions = document.getElementById('editor-edit-actions');
        if (editActions) editActions.style.display = 'flex';
        
        this.gameController.difficulty = 'test';
        this.gameController.campaignState = { active: false };
        this.gameController.currentPhase = this.gameController.phases.INPUT_FUNCTION;
        
        this._setInputUIVisible(false);
        const elems = document.getElementById('elements-container');
        if (elems) elems.style.display = 'flex';
        
        this._renderLockEditor();
        this._refreshGrid();
        this._refreshHint();
        this._setupCanvasEvents();
        this.uiController.showMessage('编辑模式：左键=目标格，右键=禁止格，中键=清除');
    }

    _switchToVerifyMode() {
        if (this.targetCells.length === 0) {
            this.uiController?.showMessage('请先添加至少一个目标格', 'error');
            return;
        }

        this.editMode = 'verify';
        document.getElementById('editor-edit-btn')?.classList.remove('btn-primary');
        document.getElementById('editor-verify-btn')?.classList.add('btn-primary');
        const editActions = document.getElementById('editor-edit-actions');
        if (editActions) editActions.style.display = 'none';

        this._setInputUIVisible(true);

        this.gameController.difficulty = 'easy';
        this.gameController.campaignState = {
            active: true,
            isEditorVerify: true,
            levelPack: { levels: [] },
            totalLevels: 1,
            currentLevelId: 0
        };
        this.gameController.targetCount = this.targetCells.length;
        this.gameController.currentPhase = this.gameController.phases.INPUT_FUNCTION;
        this.gameController.roundState.targetCells = [...this.targetCells];
        this.gameController.roundState.forbiddenCells = [...this.forbiddenCells];
        this.gameController.roundState.lockedElements = [...this.lockedElements];

        this.uiController.parser.lockedElements = [...this.lockedElements];
        this.uiController.initDraggableElements();
        this.uiController.clearExpression();

        this._refreshGrid();
        this._refreshHint();
        this.uiController.showMessage('验证模式：构建函数表达式，提交后判定是否通关');
    }

    handleResult(data) {
        if (data.pass) {
            this.solutionTokens = this._countTokens(this.uiController.currentExpression || '');
            this.solutionVerified = true;
            setTimeout(() => { this._resetToInputPhase(); this._showSeedDialog(); }, 0);
        } else {
            setTimeout(() => this._resetToInputPhase(true), 0);
        }
    }

    _resetToInputPhase(keepExpression = false) {
        this.gameController.resetRoundState();
        this.gameController.roundState.targetCells = [...this.targetCells];
        this.gameController.roundState.forbiddenCells = [...this.forbiddenCells];
        this.gameController.roundState.lockedElements = [...this.lockedElements];
        this.gameController.currentPhase = this.gameController.phases.INPUT_FUNCTION;
        this.uiController.updatePhaseUI(this.gameController.phases.INPUT_FUNCTION);

        if (!keepExpression) {
            this.uiController.clearExpression();
        }
        this.gridSystem.clearAll();
        this._refreshGrid();
    }

    _countTokens(expr) {
        try {
            return this.uiController.parser.tokenize(expr)
                .filter(t => !['lparen', 'rparen', 'imul'].includes(t.type)).length;
        } catch {
            return 0;
        }
    }

    _refreshGrid() {
        this.gridSystem.setTargetCells(this.targetCells);
        this.gridSystem.forbiddenCells = [...this.forbiddenCells];
        this.gridSystem.draw({
            targetCells: this.targetCells,
            forbiddenCells: this.forbiddenCells,
            usedCells: [],
            functionHistory: [],
            currentRound: 1
        });
    }

    _setInputUIVisible(v) {
        const exprCard = document.getElementById('expression-display')?.closest('.panel-card');
        const btnCard = document.getElementById('confirm-btn')?.closest('.panel-card');
        const elems = document.getElementById('elements-container');
        if (exprCard) exprCard.style.display = v ? '' : 'none';
        if (btnCard) btnCard.style.display = v ? '' : 'none';
        if (elems) elems.style.display = (v || this.editMode === 'edit') ? 'flex' : 'none';
    }

    _renderLockEditor() {
        const container = document.getElementById('elements-container');
        if (!container) return;

        // 简化的锁定元素编辑器
        const elements = this.uiController.parser.getAvailableElements();
        const categories = [
            { key: 'variable', label: '变量' },
            { key: 'numbers', label: '数字' },
            { key: 'basicOperators', label: '四则运算' },
            { key: 'operators', label: '其他运算符' },
            { key: 'functions', label: '函数' }
        ];
        const protectedTokens = new Set(['x', '(', ')']);

        container.innerHTML = '';
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
                const btn = document.createElement('button');
                const isProtected = protectedTokens.has(item.value);
                const isLocked = this.lockedElements.includes(item.value);
                btn.className = 'element-btn' + (isLocked ? ' locked' : '') + (isProtected ? ' protected' : '');
                btn.textContent = this.uiController.getDisplaySymbol(item.value);
                if (isLocked) btn.innerHTML += ' <span class="lock-icon">🔒</span>';
                btn.title = isProtected ? '该元素不能被禁用' : (isLocked ? '点击解锁' : '点击禁用');
                btn.addEventListener('click', () => {
                    if (isProtected) {
                        this.uiController?.showMessage(item.value === 'x' ? 'x 不能被禁用' : '括号不能被禁用', 'error');
                        return;
                    }
                    const idx = this.lockedElements.indexOf(item.value);
                    if (idx >= 0) {
                        this.lockedElements.splice(idx, 1);
                    } else {
                        this.lockedElements.push(item.value);
                    }
                    this._renderLockEditor();
                });
                itemsDiv.appendChild(btn);
            }
            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        }
    }

    _refreshHint() {
        const hint = document.getElementById('editor-hint');
        if (!hint) return;
        if (this.editMode === 'edit') {
            hint.innerHTML = `<b>棋盘操作：</b><br>
                左键：添加/删除目标格 🟩（覆盖禁止格）<br>
                右键：添加/删除禁止格 🟥（覆盖目标格）<br>
                中键：删除格子<br>
                <span style="opacity:.7;">目标格 <b>${this.targetCells.length}</b> 个，禁止格 <b>${this.forbiddenCells.length}</b> 个</span>`;
        } else {
            hint.innerHTML = `<b>验证模式：</b>构建函数通关<br>
                <span style="opacity:.7;">目标格 ${this.targetCells.length} 个，禁止格 ${this.forbiddenCells.length} 个<br>通关后自动弹出种子</span>`;
        }
    }

    _showSeedDialog() {
        const seed = this.crypto.encrypt({
            targetCells: this.targetCells,
            forbiddenCells: this.forbiddenCells,
            lockedElements: this.lockedElements,
            solutionTokens: this.solutionTokens,
            mapSize: this.gridSystem.gridSize
        });
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div class="modal-content">
            <h2>✅ 关卡验证通过！</h2>
            <p>目标格 ${this.targetCells.length} | 禁止格 ${this.forbiddenCells.length} | 禁用：${this.lockedElements.join(',')||'无'}</p>
            <p>答案复杂度：${this.solutionTokens} tokens</p>
            <hr style="margin:12px 0;border:1px solid rgba(255,255,255,.2);">
            <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:11px;
                padding:6px;background:rgba(0,0,0,.4);color:#e5e7eb;
                border:1px solid rgba(255,255,255,.2);border-radius:4px;resize:none;">${seed}</textarea>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button class="btn btn-primary" id="seed-copy-btn">复制种子</button>
                <button class="btn btn-secondary" id="seed-close-btn">关闭</button>
            </div></div>`;
        document.body.appendChild(modal);
        const seedTextarea = modal.querySelector('textarea');
        const doCopy = () => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(seed).then(() => {
                    if (this.uiController?.showMessage) this.uiController.showMessage('种子已复制到剪贴板', 'success');
                }).catch(() => fallbackCopy());
                return;
            }
            fallbackCopy();
        };
        const fallbackCopy = () => {
            if (!seedTextarea) return;
            seedTextarea.focus();
            seedTextarea.select();
            try {
                const ok = document.execCommand('copy');
                if (this.uiController?.showMessage) {
                    this.uiController.showMessage(ok ? '种子已复制到剪贴板' : '复制失败，请手动复制文本框内容', ok ? 'success' : 'error');
                }
            } catch (e) {
                if (this.uiController?.showMessage) this.uiController.showMessage('复制失败，请手动复制文本框内容', 'error');
            }
        };
        modal.querySelector('#seed-copy-btn').onclick = doCopy;
        modal.querySelector('#seed-close-btn').onclick = () => modal.remove();
    }

    _showImportDialog() {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div class="modal-content">
            <h2>导入关卡种子</h2>
            <textarea id="seed-import-input" placeholder="粘贴种子..."
                style="width:100%;height:100px;font-family:monospace;font-size:11px;
                padding:6px;background:rgba(0,0,0,.4);color:#e5e7eb;
                border:1px solid rgba(255,255,255,.2);border-radius:4px;resize:none;"></textarea>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button class="btn btn-primary" id="import-confirm-btn">导入</button>
                <button class="btn btn-secondary" id="import-cancel-btn">取消</button>
            </div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('#import-confirm-btn').onclick = () => {
            try {
                const d = this.crypto.decrypt(modal.querySelector('#seed-import-input').value.trim());
                this.targetCells = d.targetCells;
                this.forbiddenCells = d.forbiddenCells;
                this.lockedElements = d.lockedElements;
                this.solutionTokens = d.solutionTokens;

                // 使用 setRange 统一重建坐标系，确保 gridSize/range/cellSize 一致（P14）
                this.gridSystem.setRange(d.mapSize / 2);
                modal.remove();
                this._switchToEditMode();
                requestAnimationFrame(() => {
                    this.gridSystem.resize();
                    this._refreshGrid();
                });
                this.uiController?.showMessage('导入成功！', 'success');
            } catch (e) { this.uiController?.showMessage('导入失败：' + e.message, 'error'); }
        };
        modal.querySelector('#import-cancel-btn').onclick = () => modal.remove();
    }

    _setupCanvasEvents() {
        const canvas = this.gridSystem.canvas;
        if (!canvas || canvas._editorEventsBound) return;
        canvas._editorEventsBound = true;

        let dragButton = -1;
        let dragging = false;
        let startX = 0, startY = 0;

        const getCell = (e) => {
            const rect = canvas.getBoundingClientRect();
            return this.gridSystem.getCellFromCanvas(
                (e.clientX - rect.left) * (canvas.width / rect.width),
                (e.clientY - rect.top) * (canvas.height / rect.height)
            );
        };

        canvas.addEventListener('mousedown', (e) => {
            if (!this.isActive) return;
            e.preventDefault();
            dragButton = e.button;
            dragging = false;
            startX = e.clientX; startY = e.clientY;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (dragButton < 0 || !this.isActive) return;
            if (!dragging && (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4)) {
                dragging = true;
            }
            if (!dragging) return;
            const cell = getCell(e);
            if (!cell) return;
            if (dragButton === 0) this._setTarget(cell);
            else if (dragButton === 2) this._setForbidden(cell);
            else if (dragButton === 1) this._removeCell(cell);
            this._refreshGrid();
            this._refreshHint();
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!dragging && dragButton >= 0 && this.isActive) {
                const cell = getCell(e);
                if (cell) {
                    if (dragButton === 0) this._toggleTarget(cell);
                    else if (dragButton === 2) this._toggleForbidden(cell);
                    else if (dragButton === 1) this._removeCell(cell);
                    this._refreshGrid();
                    this._refreshHint();
                }
            }
            dragButton = -1; dragging = false;
        });

        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    _setTarget(cell) {
        // 与单击 toggle 语义统一：禁止格可拖成目标格（P15）
        this.forbiddenCells = this.forbiddenCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        if (!this.targetCells.some(c => c.x === cell.x && c.y === cell.y))
            this.targetCells.push(cell);
        this.solutionVerified = false;
    }

    _setForbidden(cell) {
        // 与单击 toggle 语义统一：目标格可拖成禁止格（P15）
        this.targetCells = this.targetCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        if (!this.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y))
            this.forbiddenCells.push(cell);
        this.solutionVerified = false;
    }

    _toggleTarget(cell) {
        if (this.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y)) {
            this.forbiddenCells = this.forbiddenCells.filter(c => !(c.x === cell.x && c.y === cell.y));
            this.targetCells.push(cell);
            this.solutionVerified = false;
            return;
        }
        const idx = this.targetCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (idx >= 0) this.targetCells.splice(idx, 1); else this.targetCells.push(cell);
        this.solutionVerified = false;
    }

    _toggleForbidden(cell) {
        if (this.targetCells.some(c => c.x === cell.x && c.y === cell.y)) {
            this.targetCells = this.targetCells.filter(c => !(c.x === cell.x && c.y === cell.y));
            this.forbiddenCells.push(cell);
            this.solutionVerified = false;
            return;
        }
        const idx = this.forbiddenCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (idx >= 0) this.forbiddenCells.splice(idx, 1); else this.forbiddenCells.push(cell);
        this.solutionVerified = false;
    }

    _removeCell(cell) {
        this.targetCells = this.targetCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        this.forbiddenCells = this.forbiddenCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        this.solutionVerified = false;
    }
}

// 导出到全局
window.LevelEditorExtension = LevelEditorExtension;
