// Auto-split from UIController.js — 闯关模式「导入 .js 自制关卡包」功能
// 加载顺序需在 UICampaign.js 之后、UICore.js 之前（index.html 已置于 ui 脚本区）
if (typeof UIController === 'undefined') {
    console.error('[UICampaignImport] UIController must be loaded before this file');
}

// initCampaignImport — 在难度选择界面注入「导入 .js 关卡」按钮与隐藏文件输入
    UIController.prototype.initCampaignImport = function() {
        const host = document.getElementById('campaign-step-difficulty');
        const grid = document.getElementById('campaign-difficulty-grid');
        if (!host || !grid) return;

        const row = document.createElement('div');
        row.id = 'campaign-import-row';
        row.style.marginBottom = '10px';
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.id = 'campaign-import-btn';
        btn.textContent = '导入 .js 关卡';
        btn.style.background = 'rgba(255,255,255,.1)';
        // 显式 min-width：内层 flex 行在 #campaign-import-slot 收缩包裹下没有剩余空间，
        // flex 比例(1.3)无法分配，因此用 min-width 保证「导入」明显比「粘贴文本」宽。
        btn.style.flex = '1.6';
        btn.style.minWidth = '180px';
        btn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            if (this.campaignImportFile) this.campaignImportFile.click();
        });

        const file = document.createElement('input');
        file.type = 'file';
        file.id = 'campaign-import-file';
        file.accept = '.js,.json,application/javascript,text/javascript';
        file.style.display = 'none';
        file.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) this.importCampaignPack(f);
            e.target.value = ''; // 允许重复导入同一文件
        });

        row.appendChild(btn);
        row.appendChild(file);
        this.campaignImportFile = file;

        // 粘贴文本导入入口：直接把 pack 文本粘进 textarea 即可导入
        const textBtn = document.createElement('button');
        textBtn.className = 'btn';
        textBtn.id = 'campaign-import-text-btn';
        textBtn.textContent = '粘贴文本';
        textBtn.style.background = 'rgba(255,255,255,.1)';
        textBtn.style.minWidth = '120px';
        textBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this._showImportTextModal();
        });
        row.appendChild(textBtn);

        // 插入到右下角「LR∑ 右侧」的占位槽（#campaign-import-slot），
        // 若不存在则回退到难度网格之后。
        const slot = document.getElementById('campaign-import-slot');
        if (slot) slot.appendChild(row);
        else if (grid.nextSibling) host.insertBefore(row, grid.nextSibling);
        else host.appendChild(row);
    }
;

// importCampaignPack — 读取并校验用户选择的 .js 关卡包
    UIController.prototype.importCampaignPack = async function(file) {
        try {
            const text = await file.text();
            const pack = this._parseCampaignPack(text);
            if (!pack || !Array.isArray(pack.levels) || !pack.levels.length) {
                this.showMessage('文件格式无效：需包含 levels 数组', 'error');
                return;
            }
            const bad = pack.levels.find(l => l == null || l.id === undefined || l.id === null || !Array.isArray(l.targetCells));
            if (bad) {
                this.showMessage('关卡数据缺少 id 或 targetCells', 'error');
                return;
            }
            // 规整缺省字段
            pack.levels.forEach(l => {
                if (!Array.isArray(l.forbiddenCells)) l.forbiddenCells = [];
                if (!Array.isArray(l.lockedElements)) l.lockedElements = [];
            });
            this.importedCampaignPack = pack;
            this.importedCampaignName = (file.name || '自制关卡').replace(/\.[^.]+$/, '');
            this._ensureCustomDifficultyButton();
            this.showMessage(`已导入「${this.importedCampaignName}」：${pack.levels.length} 关`, 'success');
        } catch (err) {
            console.error('[UICampaignImport] 解析失败:', err);
            this.showMessage('导入失败：' + (err && err.message ? err.message : '无法解析文件'), 'error');
        }
    }
;

// _parseCampaignPack — 兼容 JSON 数组 / JS 数组或对象字面量 / { levels:[...] }
//                       / 编辑器「复制导出文本」的「关卡对象列表正文」(无外层 [ ])
    UIController.prototype._parseCampaignPack = function(text) {
        const t = (text || '').trim();
        if (!t) return null;
        // 1) 标准 JSON（合法 JSON 数组 / { levels:[...] } 对象）
        try {
            const j = JSON.parse(t);
            const norm = this._normalizePack(j);
            if (norm) return norm;
        } catch (e) { /* fallthrough */ }
        // 2) 编辑器导出格式：形如 {…},\n{…}（数组体，无外层 [ ]）。
        //    补上外层中括号后按 JSON 解析（同时兼容单个 {…} 关卡对象）。
        if (t.startsWith('{') || t.startsWith('[')) {
            let arrText = t.replace(/,\s*$/, ''); // 去掉末尾多余逗号
            if (!arrText.startsWith('[')) arrText = '[' + arrText + ']';
            try {
                const j = JSON.parse(arrText);
                const norm = this._normalizePack(j);
                if (norm) return norm;
            } catch (e) { /* fallthrough */ }
        }
        // 3) JS 表达式（去掉尾逗号后用 Function 求值，兼容对象/数组字面量 /
        //    const X = [...]; var X = {...}; export default [...] 等赋值式）
        try {
            const sanitized = t.replace(/,\s*([}\]])/g, '$1');
            const expr = sanitized
                .replace(/^\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*/, '')
                .replace(/^\s*export\s+default\s*/, '')
                .replace(/;?\s*$/, '');
            const v = new Function('return (' + expr + ');')();
            const norm = this._normalizePack(v);
            if (norm) return norm;
        } catch (e) { /* fallthrough */ }
        return null;
    }
;

// _normalizePack — 把「纯数组」包成 { levels }；对象含 levels 直接用
    UIController.prototype._normalizePack = function(v) {
        if (Array.isArray(v)) return { levels: v };
        if (v && typeof v === 'object' && Array.isArray(v.levels)) return v;
        return null;
    }
;

// _ensureCustomDifficultyButton — 在难度网格中按文件名创建/更新自定义入口
    UIController.prototype._ensureCustomDifficultyButton = function() {
        const grid = document.getElementById('campaign-difficulty-grid');
        if (!grid) return;
        let btn = document.getElementById('campaign-diff-custom');
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'campaign-diff-custom';
            btn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this.openCampaignLevels('custom');
            });
            grid.appendChild(btn);
        }
        btn.textContent = this.importedCampaignName || '自制关卡';
        btn.style.display = '';
        // 同步网格列数（可见数 +1）
        if (typeof this.refreshUnsovableDifficultyVisibility === 'function') {
            this.refreshUnsovableDifficultyVisibility();
        }
    }
;

// renderCustomCampaignLevelGrid — 按 js 原始顺序渲染全部关卡（全部可玩，无解锁）
    UIController.prototype.renderCustomCampaignLevelGrid = function() {
        if (!this.campaignLevelGrid || !this.campaignLevelTitle || !this.campaignLevelProgress) return;
        const pack = this.importedCampaignPack;
        if (!pack || !Array.isArray(pack.levels) || !pack.levels.length) {
            this.campaignLevelTitle.textContent = `选择关卡：${this.importedCampaignName || '自制关卡'}`;
            this.campaignLevelProgress.textContent = '未导入自制关卡';
            this.campaignLevelGrid.innerHTML = '';
            return;
        }
        this.campaignLevelTitle.textContent = `选择关卡：${this.importedCampaignName || '自制关卡'}（共 ${pack.levels.length} 关）`;
        this.campaignLevelProgress.textContent = '全部关卡可直接进入，无解锁限制';
        this.campaignLevelGrid.innerHTML = '';
        pack.levels.forEach((level, idx) => {
            const id = level.id;
            const cell = document.createElement('div');
            cell.className = 'campaign-level-cell custom';
            const numberSpan = document.createElement('span');
            numberSpan.className = 'campaign-cell-number';
            numberSpan.textContent = String(level.id != null ? level.id : (idx + 1));
            cell.appendChild(numberSpan);
            cell.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                if (this.campaignModal) this.hideModal(this.campaignModal);
                this.startCampaign(String(id));
            });
            this.campaignLevelGrid.appendChild(cell);
        });
    }
;

// _ensureImportTextModal — 惰性创建「粘贴文本导入」弹窗（与文件导入共用解析路径）
    UIController.prototype._ensureImportTextModal = function() {
        if (document.getElementById('campaign-import-text-modal')) return;
        const backdrop = document.createElement('div');
        backdrop.id = 'campaign-import-text-modal';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);';
        backdrop.innerHTML = `
            <div style="width:min(580px,92vw);max-height:86vh;overflow:auto;background:rgba(20,22,28,.97);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
                <h3 style="margin:0 0 4px;color:#fff;font-size:18px;">粘贴关卡文本</h3>
                <p style="margin:0 0 12px;color:#9ca3af;font-size:12px;">支持 JSON 数组 / 含 levels 的对象 / .js 关卡包文本</p>
                <label style="display:block;color:#e5e7eb;font-size:13px;margin-bottom:6px;">关卡包名称（显示在难度网格入口）</label>
                <input id="campaign-import-text-name" type="text" placeholder="例如：我的关卡" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-size:14px;margin-bottom:12px;outline:none;" />
                <label style="display:block;color:#e5e7eb;font-size:13px;margin-bottom:6px;">关卡文本</label>
                <textarea id="campaign-import-text-area" placeholder='粘贴关卡包，例如：&#10;[{"id":"a1","targetCells":[{"x":0,"y":0}]}]' style="width:100%;box-sizing:border-box;height:200px;resize:vertical;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-size:13px;font-family:monospace;outline:none;"></textarea>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
                    <button id="campaign-import-text-cancel" class="btn" style="background:rgba(255,255,255,.1);">取消</button>
                    <button id="campaign-import-text-confirm" class="btn" style="background:#22c55e;color:#06281a;">确认导入</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this._hideImportTextModal(); });
        backdrop.querySelector('#campaign-import-text-cancel').addEventListener('click', () => this._hideImportTextModal());
        backdrop.querySelector('#campaign-import-text-confirm').addEventListener('click', () => {
            const text = backdrop.querySelector('#campaign-import-text-area').value;
            const name = backdrop.querySelector('#campaign-import-text-name').value;
            this._importCampaignFromText(text, name);
        });
    }
;

// _showImportTextModal — 打开粘贴文本弹窗
    UIController.prototype._showImportTextModal = function() {
        this._ensureImportTextModal();
        const m = document.getElementById('campaign-import-text-modal');
        const area = m.querySelector('#campaign-import-text-area');
        const name = m.querySelector('#campaign-import-text-name');
        if (name) name.value = (this.importedCampaignName && this.importedCampaignName !== '自制关卡') ? this.importedCampaignName : '';
        if (area) area.value = '';
        m.style.display = 'flex';
        if (area) setTimeout(() => area.focus(), 30);
    }
;

// _hideImportTextModal — 关闭粘贴文本弹窗
    UIController.prototype._hideImportTextModal = function() {
        const m = document.getElementById('campaign-import-text-modal');
        if (m) m.style.display = 'none';
    }
;

// _importCampaignFromText — 解析并导入粘贴的 pack 文本（复用 _parseCampaignPack 路径）
    UIController.prototype._importCampaignFromText = function(text, name) {
        if (!text || !text.trim()) {
            this.showMessage('请先粘贴关卡文本', 'error');
            return;
        }
        const pack = this._parseCampaignPack(text);
        if (!pack || !Array.isArray(pack.levels) || !pack.levels.length) {
            this.showMessage('文本格式无效：需包含 levels 数组', 'error');
            return;
        }
        const bad = pack.levels.find(l => l == null || l.id === undefined || l.id === null || !Array.isArray(l.targetCells));
        if (bad) {
            this.showMessage('关卡数据缺少 id 或 targetCells', 'error');
            return;
        }
        pack.levels.forEach(l => {
            if (!Array.isArray(l.forbiddenCells)) l.forbiddenCells = [];
            if (!Array.isArray(l.lockedElements)) l.lockedElements = [];
        });
        this.importedCampaignPack = pack;
        this.importedCampaignName = (name && name.trim()) || this.importedCampaignName || '粘贴关卡';
        this._ensureCustomDifficultyButton();
        this._hideImportTextModal();
        this.showMessage(`已导入「${this.importedCampaignName}」：${pack.levels.length} 关`, 'success');
    }
;

