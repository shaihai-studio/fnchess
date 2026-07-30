/**
 * LevelEditorExtension - 关卡编辑器扩展
 * 职责：协调编辑模式和验证模式
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

        this.ui = new LevelEditorUI(this);
        this.editModeController = new LevelEditorEditMode(this);
        this.verifyModeController = new LevelEditorVerifyMode(this);
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

        this.gameController.initGame(1, 'test', 'test');

        setTimeout(() => {
            this.ui._buildEditorUI();
            this.editModeController.bindCanvasEvents();
            this.switchToEditMode();
        }, 150);
    }

    handleResult(data) {
        this.verifyModeController.handleResult(data);
    }

    switchToEditMode() {
        this.editModeController.activate();
    }

    switchToVerifyMode() {
        this.verifyModeController.activate();
    }

    _showSeedDialog(...args){return this.ui._showSeedDialog(...args);}
    _showImportDialog(...args){return this.ui._showImportDialog(...args);}
    _refreshGrid(...args){return this.editModeController._refreshGrid(...args);}
    _renderLockEditor(...args){return this.ui._renderLockEditor(...args);}
    _refreshHint(...args){return this.ui._refreshHint(...args);}
    _setInputUIVisible(...args){return this.editModeController._setInputUIVisible(...args);}

    _setupWheelZoom() {
        const gs = this.gridSystem;
        if (this._wheelHandler) gs.canvas.removeEventListener('wheel', this._wheelHandler);
        this._wheelThrottled = false;
        this._wheelHandler = (e) => {
            e.preventDefault();
            if (!this.isActive || gs.isCampaignFixedRange) return;
            if (this._wheelThrottled) return;
            this._wheelThrottled = true;
            setTimeout(() => { this._wheelThrottled = false; }, 400);
            const step = e.deltaY > 0 ? 5 : -5;
            const clamped = Math.max(gs.minRange, Math.min(gs.range + step, gs.maxRange));
            if (clamped !== gs.range) {
                gs.range = clamped; gs.gridSize = clamped * 2;
                requestAnimationFrame(() => { gs.resize(); this._refreshGrid(); });
            }
            this.uiController.updateZoomDisplay(gs.range);
        };
        gs.canvas.addEventListener('wheel', this._wheelHandler, { passive: false });
    }

    deactivate() {
        this.isActive = false;
        document.getElementById('editor-mode-switcher')?.remove();
        this._setInputUIVisible(true);
        if (this._wheelHandler) { this.gridSystem.canvas.removeEventListener('wheel', this._wheelHandler); this._wheelHandler = null; }

        this.gameController.campaignState = { active: false, levelPack: null, totalLevels: 0, currentLevelId: 1 };
        this.gameController.difficulty = 'normal';

        this.gridSystem.isCampaignFixedRange = false;

        if (this._originalCampaignResultCallback) {
            this.gameController.callbacks['campaignLevelResult'] = this._originalCampaignResultCallback;
            this._originalCampaignResultCallback = null;
        }
        this._evalIntercepted = false;
    }
}