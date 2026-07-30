class LevelEditorUI {
    constructor(parent) { this.parent = parent; }

    _buildEditorUI() {
        if (document.getElementById('editor-mode-switcher')) return;
        const phaseCard = document.getElementById('phase-hint')?.closest('.panel-card');
        if (!phaseCard) return;
        const div = document.createElement('div');
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
        phaseCard.parentNode.insertBefore(div, phaseCard);
        document.getElementById('editor-edit-btn').addEventListener('click', () => this.parent.switchToEditMode());
        document.getElementById('editor-verify-btn').addEventListener('click', () => this.parent.switchToVerifyMode());
        document.getElementById('editor-clear-cells-btn').addEventListener('click', () => {
            this.parent.targetCells = [];
            this.parent.forbiddenCells = [];
            this.parent.solutionVerified = false;
            this.parent._refreshGrid();
            this.parent._refreshHint();
        });
        document.getElementById('editor-import-btn').addEventListener('click', () => this.parent._showImportDialog());
        document.getElementById('editor-exit-btn').addEventListener('click', () => this.parent.uiController.handleExitClick());
    }

    _renderLockEditor() {
        const container = document.getElementById('elements-container');
        if (!container) return;
        const elements = this.parent.uiController.parser.getAvailableElements();
        const categories = [
            { key: 'variable', label: '变量' },
            { key: 'numbers', label: '数字' },
            { key: 'basicOperators', label: '四则运算' },
            { key: 'operators', label: '其他运算符' },
            { key: 'functions', label: '函数' }
        ];
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
                const isLocked = this.parent.lockedElements.includes(item.value);
                btn.className = 'element-btn' + (isLocked ? ' locked' : '');
                btn.textContent = this.parent.uiController.getDisplaySymbol(item.value);
                if (isLocked) btn.innerHTML += ' <span class="lock-icon">🔒</span>';
                btn.title = isLocked ? '点击解锁' : '点击禁用';
                btn.addEventListener('click', () => {
                    
                    if (item.value === '(' || item.value === ')') {
                        alert('括号不能被禁用');
                        return;
                    }
                    const allNumbers = ['0','1','2','3','4','5','6','7','8','9','π','e','i'];
                    const idx = this.parent.lockedElements.indexOf(item.value);
                    if (idx >= 0) {
                        this.parent.lockedElements.splice(idx, 1);
                    } else {
                        
                        if (item.value === 'x') {
                            const allNumsLocked = allNumbers.every(n => this.parent.lockedElements.includes(n));
                            if (allNumsLocked) { alert('数字已全被禁用，x 不能再被禁用'); return; }
                        } else if (allNumbers.includes(item.value)) {
                            const xLocked = this.parent.lockedElements.includes('x');
                            const otherNumsLocked = allNumbers.filter(n => n !== item.value).every(n => this.parent.lockedElements.includes(n));
                            if (xLocked && otherNumsLocked) { alert('x 已被禁用，数字不能全被禁用'); return; }
                        }
                        this.parent.lockedElements.push(item.value);
                    }
                    this.parent._renderLockEditor();
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
        if (this.parent.editMode === 'edit') {
            hint.innerHTML = `<b>棋盘操作：</b><br>
                左键：添加/删除目标格 🟩（覆盖禁止格）<br>
                右键：添加/删除禁止格 🟥（覆盖目标格）<br>
                中键：删除格子<br>
                <span style="opacity:.7;">目标格 <b>${this.parent.targetCells.length}</b> 个，禁止格 <b>${this.parent.forbiddenCells.length}</b> 个</span>`;
        } else {
            hint.innerHTML = `<b>验证模式：</b>构建函数通关<br>
                <span style="opacity:.7;">目标格 ${this.parent.targetCells.length} 个，禁止格 ${this.parent.forbiddenCells.length} 个<br>通关后自动弹出种子</span>`;
        }
    }

    _showSeedDialog() {
        const seed = this.parent.crypto.encrypt({
            targetCells: this.parent.targetCells, forbiddenCells: this.parent.forbiddenCells,
            lockedElements: this.parent.lockedElements, solutionTokens: this.parent.solutionTokens,
            mapSize: this.parent.gridSystem.gridSize
        });
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div class="modal-content">
            <h2>✅ 关卡验证通过！</h2>
            <p>目标格 ${this.parent.targetCells.length} | 禁止格 ${this.parent.forbiddenCells.length} | 禁用：${this.parent.lockedElements.join(',')||'无'}</p>
            <p>答案复杂度：${this.parent.solutionTokens} tokens</p>
            <hr style="margin:12px 0;border:1px solid rgba(255,255,255,.2);">
            <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:11px;
                padding:6px;background:rgba(0,0,0,.4);color:#e5e7eb;
                border:1px solid rgba(255,255,255,.2);border-radius:4px;resize:none;">${seed}</textarea>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button class="btn btn-primary" id="seed-copy-btn">复制种子</button>
                <button class="btn btn-secondary" id="seed-close-btn">关闭</button>
            </div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('#seed-copy-btn').onclick = () =>
            navigator.clipboard.writeText(seed).then(() => alert('已复制！'));
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
                const d = this.parent.crypto.decrypt(modal.querySelector('#seed-import-input').value.trim());
                if (!d.mapSize || typeof d.mapSize !== 'number' || d.mapSize < 10) {
                    throw new Error('种子格式不正确');
                }
                
                const validation = RandomChallengeMode.validateLockedElements(d.lockedElements);
                if (!validation.valid) {
                    alert('种子不合法: ' + validation.reason);
                    return;
                }
                this.parent.targetCells    = d.targetCells;
                this.parent.forbiddenCells = d.forbiddenCells;
                this.parent.lockedElements = d.lockedElements;
                this.parent.solutionTokens = d.solutionTokens;
                
                this.parent.gridSystem.gridSize = d.mapSize;
                this.parent.gridSystem.range = d.mapSize / 2;
                this.parent.gridSystem.resize();
                modal.remove();
                this.parent.switchToEditMode();
                requestAnimationFrame(() => this.parent._refreshGrid());
                this.parent.uiController.updateZoomDisplay(this.parent.gridSystem.range);
                alert('导入成功！');
            } catch (e) { alert('导入失败'); }
        };
        modal.querySelector('#import-cancel-btn').onclick = () => modal.remove();
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=LevelEditorUI;