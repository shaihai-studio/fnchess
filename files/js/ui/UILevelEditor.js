// Auto-split from UIController.js — prototype-attached methods (UILevelEditor)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UILevelEditor] UIController must be loaded before this file');
}

// activateLevelEditor
    UIController.prototype.activateLevelEditor = function() {
        if (!this.levelEditor) {
            this.levelEditor = new LevelEditorExtension(
                this.gameController,
                this,
                this.gridSystem
            );
        }
        this.levelEditor.activate();
        this.showMessage('关卡编辑器已激活，左键选择目标格，右键选择禁止格');
    };

