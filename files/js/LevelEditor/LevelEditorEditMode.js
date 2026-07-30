/**
 * LevelEditorEditMode - 关卡编辑器编辑模式
 * 职责：格子编辑（目标格/禁止格）、锁定元素编辑、Canvas 交互
 */
class LevelEditorEditMode {
    constructor(parent) {
        this.parent = parent;
        this._canvasBindDone = false;
        this._coordHint = null;
    }

    activate() {
        this.parent.editMode = 'edit';
        document.getElementById('editor-edit-btn')?.classList.add('btn-primary');
        document.getElementById('editor-verify-btn')?.classList.remove('btn-primary');
        const editActions = document.getElementById('editor-edit-actions');
        if (editActions) editActions.style.display = 'flex';

        this.parent.gameController.difficulty = 'test';
        this.parent.gameController.campaignState = { active: false };
        this.parent.gameController.currentPhase = this.parent.gameController.phases.INPUT_FUNCTION;

        this._setInputUIVisible(false);
        const elems = document.getElementById('elements-container');
        if (elems) elems.style.display = 'flex';

        this.parent.uiController.parser.lockedElements = [];
        this.parent.ui._renderLockEditor();

        this._refreshGrid();
        this.parent.ui._refreshHint();
        this.parent.uiController.showMessage('编辑模式：左键=目标格，右键=禁止格，中键=清除');
        if (this.parent.uiController.exitBtn) this.parent.uiController.exitBtn.textContent = '退出编辑器';
        this.parent.uiController.updateCampaignDrawDelayToggleVisibility();

        this.parent.gridSystem.range = this.parent.gridSystem.gridSize / 2;
        this.parent.gridSystem.resize();
        this.parent.gridSystem.isCampaignFixedRange = false;

        const existingZoom = document.getElementById('zoom-controls');
        if (existingZoom) existingZoom.style.display = '';
        this.parent.uiController.addZoomButtons();
        this.parent._setupWheelZoom();
        this.parent.uiController.unlockZoomButtons();
        this.parent.uiController.updateZoomDisplay(this.parent.gridSystem.range);
    }

    bindCanvasEvents() {
        if (this._canvasBindDone) return;
        this._canvasBindDone = true;
        const canvas = this.parent.gridSystem.canvas;
        let dragButton = -1;
        let dragging = false;
        let startX = 0, startY = 0;

        const getCell = (e) => {
            const rect = canvas.getBoundingClientRect();
            return this.parent.gridSystem.getCellFromCanvas(
                (e.clientX - rect.left) * (canvas.width / rect.width),
                (e.clientY - rect.top) * (canvas.height / rect.height)
            );
        };

        let coordHint = document.getElementById('editor-coord-hint');
        if (!coordHint) {
            coordHint = document.createElement('div');
            coordHint.id = 'editor-coord-hint';
            coordHint.style.cssText = 'position:fixed;padding:4px 8px;background:rgba(0,0,0,0.8);color:#fff;font-size:12px;border-radius:4px;pointer-events:none;display:none;z-index:1000;';
            document.body.appendChild(coordHint);
        }
        this._coordHint = coordHint;

        canvas.addEventListener('mousedown', (e) => {
            if (!this.parent.isActive || this.parent.editMode !== 'edit') return;
            e.preventDefault();
            dragButton = e.button;
            dragging = false;
            startX = e.clientX; startY = e.clientY;
        });
        canvas.addEventListener('mousemove', (e) => {
            if (this.parent.isActive && this.parent.editMode === 'edit') {
                const cell = getCell(e);
                if (cell) {
                    this._coordHint.textContent = `(${cell.x}, ${cell.y})`;
                    this._coordHint.style.left = (e.clientX + 15) + 'px';
                    this._coordHint.style.top = (e.clientY + 15) + 'px';
                    this._coordHint.style.display = 'block';
                } else {
                    this._coordHint.style.display = 'none';
                }
            }

            if (dragButton < 0 || !this.parent.isActive || this.parent.editMode !== 'edit') return;
            if (!dragging && (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4)) {
                dragging = true;
            }
            if (!dragging) return;
            const cell = getCell(e);
            if (!cell) return;
            if (dragButton === 0) this._setTarget(cell);
            else if (dragButton === 2) this._setForbidden(cell);
            else if (dragButton === 1) this._removeCell(cell);
            this._refreshGrid(); this.parent.ui._refreshHint();
        });
        canvas.addEventListener('mouseup', (e) => {
            if (!dragging && dragButton >= 0 && this.parent.isActive && this.parent.editMode === 'edit') {
                const cell = getCell(e);
                if (cell) {
                    if (dragButton === 0) this._toggleTarget(cell);
                    else if (dragButton === 2) this._toggleForbidden(cell);
                    else if (dragButton === 1) this._removeCell(cell);
                    this._refreshGrid(); this.parent.ui._refreshHint();
                }
            }
            dragButton = -1; dragging = false;
        });
        canvas.addEventListener('mouseleave', () => {
            dragButton = -1; dragging = false;
            if (this._coordHint) this._coordHint.style.display = 'none';
        });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    _setTarget(cell) {
        if (this.parent.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y)) return;
        if (!this.parent.targetCells.some(c => c.x === cell.x && c.y === cell.y))
            this.parent.targetCells.push(cell);
        this.parent.solutionVerified = false;
    }

    _setForbidden(cell) {
        if (this.parent.targetCells.some(c => c.x === cell.x && c.y === cell.y)) return;
        if (!this.parent.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y))
            this.parent.forbiddenCells.push(cell);
        this.parent.solutionVerified = false;
    }

    _toggleTarget(cell) {
        if (this.parent.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y)) {
            this.parent.forbiddenCells = this.parent.forbiddenCells.filter(c => !(c.x === cell.x && c.y === cell.y));
            this.parent.targetCells.push(cell);
            this.parent.solutionVerified = false;
            return;
        }
        const idx = this.parent.targetCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (idx >= 0) this.parent.targetCells.splice(idx, 1); else this.parent.targetCells.push(cell);
        this.parent.solutionVerified = false;
    }

    _toggleForbidden(cell) {
        if (this.parent.targetCells.some(c => c.x === cell.x && c.y === cell.y)) {
            this.parent.targetCells = this.parent.targetCells.filter(c => !(c.x === cell.x && c.y === cell.y));
            this.parent.forbiddenCells.push(cell);
            this.parent.solutionVerified = false;
            return;
        }
        const idx = this.parent.forbiddenCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (idx >= 0) this.parent.forbiddenCells.splice(idx, 1); else this.parent.forbiddenCells.push(cell);
        this.parent.solutionVerified = false;
    }

    _removeCell(cell) {
        this.parent.targetCells = this.parent.targetCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        this.parent.forbiddenCells = this.parent.forbiddenCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        this.parent.solutionVerified = false;
    }

    _refreshGrid() {
        this.parent.gridSystem.setTargetCells(this.parent.targetCells);
        this.parent.gridSystem.forbiddenCells = [...this.parent.forbiddenCells];
        this.parent.gridSystem.draw({
            targetCells: this.parent.targetCells,
            forbiddenCells: this.parent.forbiddenCells,
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
        if (elems) elems.style.display = v ? 'flex' : 'none';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LevelEditorEditMode;
}
