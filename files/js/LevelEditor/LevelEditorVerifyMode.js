/**
 * LevelEditorVerifyMode - 关卡编辑器验证模式
 * 职责：加载关卡进行测试、处理验证结果
 */
class LevelEditorVerifyMode {
    constructor(parent) {
        this.parent = parent;
    }

    activate() {
        if (this.parent.targetCells.length === 0) {
            alert('请先添加至少一个目标格');
            return false;
        }

        const validation = SeedImporter.validateLockedElements(this.parent.lockedElements);
        if (!validation.valid) {
            alert('禁用列表不合法: ' + validation.reason);
            return false;
        }

        this.parent.editMode = 'verify';
        document.getElementById('editor-edit-btn')?.classList.remove('btn-primary');
        document.getElementById('editor-verify-btn')?.classList.add('btn-primary');
        const editActions = document.getElementById('editor-edit-actions');
        if (editActions) editActions.style.display = 'none';

        this._setInputUIVisible(true);

        this.parent.gameController.difficulty = 'easy';
        this.parent.gameController.campaignState = {
            active: true,
            isEditorVerify: true,
            levelPack: { levels: [] },
            totalLevels: 1,
            currentLevelId: 0
        };
        this.parent.gameController.targetCount = this.parent.targetCells.length;
        this.parent.gameController.currentPhase = this.parent.gameController.phases.INPUT_FUNCTION;
        this.parent.gameController.roundState.targetCells = [...this.parent.targetCells];
        this.parent.gameController.roundState.forbiddenCells = [...this.parent.forbiddenCells];
        this.parent.gameController.roundState.lockedElements = [...this.parent.lockedElements];

        this.parent.uiController.parser.lockedElements = [...this.parent.lockedElements];
        this.parent.uiController.initDraggableElements();
        this.parent.uiController.clearExpression();

        this.parent.gridSystem.isCampaignFixedRange = true;
        this.parent.gridSystem.fixedCampaignRange = this.parent.gridSystem.range;

        const zoomControls = document.getElementById('zoom-controls');
        if (zoomControls) zoomControls.style.display = 'none';
        this.parent.uiController.lockZoomButtons();

        this._refreshGrid();
        this.parent.ui._refreshHint();
        if (this.parent.uiController.exitBtn) this.parent.uiController.exitBtn.textContent = '退出编辑器';
        this.parent.uiController.showMessage('验证模式：构建函数表达式，提交后判定是否通关');
        this.parent.uiController.updateCampaignDrawDelayToggleVisibility();

        return true;
    }

    handleResult(data) {
        if (data.pass) {
            this.parent.solutionTokens = this._countTokens(this.parent.uiController.currentExpression || '');
            this.parent.solutionVerified = true;
            setTimeout(() => { this._resetToInputPhase(); this.parent.ui._showSeedDialog(); }, 0);
        } else {
            setTimeout(() => this._resetToInputPhase(true), 0);
        }
    }

    _resetToInputPhase(keepExpression = false) {
        this.parent.gameController.resetRoundState();
        this.parent.gameController.roundState.targetCells = [...this.parent.targetCells];
        this.parent.gameController.roundState.forbiddenCells = [...this.parent.forbiddenCells];
        this.parent.gameController.roundState.lockedElements = [...this.parent.lockedElements];
        this.parent.gameController.currentPhase = this.parent.gameController.phases.INPUT_FUNCTION;
        this.parent.uiController.updatePhaseUI(this.parent.gameController.phases.INPUT_FUNCTION);

        if (!keepExpression) {
            this.parent.uiController.clearExpression();
        }
        this.parent.gridSystem.clearAll();
        this._refreshGrid();
    }

    _countTokens(expr) {
        try {
            return this.parent.uiController.parser.tokenize(expr)
                .filter(t => !['lparen', 'rparen', 'imult'].includes(t.type)).length;
        } catch {
            return 0;
        }
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
    module.exports = LevelEditorVerifyMode;
}
