// Auto-split: 关卡编辑器，作为 UIController 的方法挂载，融入主程序模式切换
// 加载顺序需在 UIController.js / UICore.js 之后（index.html 已置于 ui 脚本区末尾）
if (typeof UIController === 'undefined') {
    console.error('[UIEditor] UIController must be loaded before this file');
}

// initEditor
UIController.prototype.initEditor = function() {
    const editorView = this.editorView = document.getElementById('editor-view');
    if (!editorView) { console.error('[UIEditor] #editor-view 不存在'); return; }

    const sampleLevels = [
        {
            id: '1/2',
            difficulty: 'fraction',
            nextId: '1/3',
            targetCells: [{ x: -0.5, y: 0 }],
            forbiddenCells: [{ x: 0, y: 0.5 }],
            lockedElements: []
        },
        {
            id: '1/3',
            difficulty: 'fraction',
            nextId: '1/4',
            targetCells: [{ x: 0.5, y: 0.5 }],
            forbiddenCells: [{ x: 0, y: 0 }],
            lockedElements: ['+']
        }
    ];

    const state = {
        levels: structuredClone(sampleLevels),
        current: 0,
        dragging: null,
        mode: 'target',
        precision: 4,
        anchorMode: 'corner',
        rectEnabled: false,
        lineEnabled: false,
        brushEnabled: false,
        selectEnabled: false,
        selection: null,
        swapMouse: false,
        referenceExpr: '',
        history: [],
        historyIndex: -1,
        dragState: null
    };

    const els = Object.fromEntries(['id','difficulty','nextId','targetCells','forbiddenCells','lockedElements','exportBox','levelList','gridCanvas','status','btnBack','btnCloseLeft','btnCloseRight','btnShowLeft','btnShowRight','btnCopyOne','btnAdd','btnDelete','btnCopyExport','btnDownload','btnImportFile','btnImportText','editorImportFile','fileNameInput','precisionSelect','btnRect','btnLine','btnBrush','btnSelect','btnSwapMouse','btnUndo','btnFx','fxPanel','fxInput','btnFxClear','anchorModeSelect','btnArrowUp','btnArrowDown','btnArrowLeft','btnArrowRight','btnTrash','lockElementPanel'].map(id => [id, document.getElementById(id)]));
    const ctx = els.gridCanvas.getContext('2d');

    // 锁定元素快捷面板：从解析器可用元素构建，点击元素按钮即锁定/解锁（无需手动输入坐标或编号）
    const lockKeys = [];
    {
        const _lockParser = new FunctionParser();
        Object.values(_lockParser.elementCategories).forEach((list) => list.forEach((el) => { if (!lockKeys.includes(el)) lockKeys.push(el); }));
    }
    function renderLockPanel() {
        const panel = els.lockElementPanel;
        if (!panel) return;
        const lvl = currentLevel();
        const locked = lvl.lockedElements || [];
        panel.innerHTML = '';
        lockKeys.forEach((key) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = key;
            btn.dataset.element = key;
            btn.title = `点击${locked.includes(key) ? '解锁' : '锁定'}「${key}」`;
            btn.className = 'lock-el' + (locked.includes(key) ? ' active' : '');
            btn.onclick = () => {
                const cur = currentLevel();
                if (!Array.isArray(cur.lockedElements)) cur.lockedElements = [];
                const idx = cur.lockedElements.indexOf(key);
                if (idx === -1) cur.lockedElements.push(key);
                else cur.lockedElements.splice(idx, 1);
                syncFormFromLevel();
                pushHistory();
                setStatus(idx === -1 ? `已锁定元素「${key}」，玩家将无法使用` : `已解锁元素「${key}」`);
            };
            panel.appendChild(btn);
        });
    }

    const parseLines = (text) => text.split('\n').map(s => s.trim()).filter(Boolean);
    const safeJsonArray = (lines) => lines.map(line => JSON.parse(line.replace(/,$/,'').trim()));
    const fmtArr = (arr) => arr.map(v => typeof v === 'string' ? `"${v}"` : JSON.stringify(v)).join(',\n');
    // 自动增高：让 textarea 随内容换行撑高（编辑器打开时调用；隐藏时跳过以免高度塌为 0）
    const autoGrow = (el) => { if (!el || el.offsetParent === null) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
    const snap = (n) => Number((Math.round(n * state.precision) / state.precision).toFixed(10));
    const cloneLevels = () => structuredClone(state.levels);
    const canUndo = () => state.historyIndex > 0;
    const updateUndoBtn = () => { if (els.btnUndo) els.btnUndo.disabled = !canUndo(); };
    const pushHistory = () => {
        const snapshot = cloneLevels();
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        state.historyIndex = state.history.length - 1;
        updateUndoBtn();
    };
    const restoreHistory = (index) => {
        if (index < 0 || index >= state.history.length) return;
        state.levels = structuredClone(state.history[index]);
        state.current = Math.min(state.current, state.levels.length - 1);
        state.historyIndex = index;
        syncFormFromLevel();
        updateUndoBtn();
    };
    // 撤回：效果等同 Ctrl+Z
    const doUndo = () => {
        if (!canUndo()) { setStatus('已无更多可撤回步骤'); return; }
        restoreHistory(state.historyIndex - 1);
        setStatus('已撤回上一步操作');
    };

    function currentLevel() { return state.levels[state.current]; }
    function syncFormFromLevel() {
        const lvl = currentLevel();
        els.id.value = lvl.id ?? '';
        els.difficulty.value = lvl.difficulty ?? '';
        els.nextId.value = lvl.nextId ?? '';
        els.targetCells.value = fmtArr(lvl.targetCells || []);
        els.forbiddenCells.value = fmtArr(lvl.forbiddenCells || []);
        els.lockedElements.value = (lvl.lockedElements || []).map(x => `"${x}"`).join('\n');
        renderList();
        renderLockPanel();
        draw();
        autoGrow(els.targetCells); autoGrow(els.forbiddenCells); autoGrow(els.lockedElements);
    }

    function commitFormToLevel() {
        const lvl = currentLevel();
        lvl.id = els.id.value.trim();
        lvl.difficulty = els.difficulty.value.trim();
        lvl.nextId = els.nextId.value.trim() === 'null' || els.nextId.value.trim() === '' ? null : els.nextId.value.trim();
        try { lvl.targetCells = safeJsonArray(parseLines(els.targetCells.value)); } catch {}
        try { lvl.forbiddenCells = safeJsonArray(parseLines(els.forbiddenCells.value)); } catch {}
        try { lvl.lockedElements = parseLines(els.lockedElements.value).map(v => JSON.parse(v)); } catch {}
        renderList();
        renderLockPanel();
        draw();
        pushHistory();
        autoGrow(els.targetCells); autoGrow(els.forbiddenCells); autoGrow(els.lockedElements);
    }

    function renderList() {
        els.levelList.innerHTML = '';
        state.levels.forEach((lvl, i) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.style.outline = i === state.current ? '2px solid rgba(124,219,157,.45)' : 'none';
            div.innerHTML = `<div><strong>${lvl.id || '(未命名)'}</strong><small>${(lvl.targetCells||[]).length} 目标 · ${(lvl.forbiddenCells||[]).length} 禁区 · ${(lvl.lockedElements||[]).length} 锁定</small></div><button class="ghost">编辑</button>`;
            div.querySelector('button').onclick = () => { state.current = i; syncFormFromLevel(); };
            els.levelList.appendChild(div);
        });
    }

    function fitCanvas() {
        const rect = els.gridCanvas.parentElement.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        els.gridCanvas.width = rect.width * dpr;
        els.gridCanvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    function gridMetrics() {
        const w = els.gridCanvas.parentElement.clientWidth;
        const h = els.gridCanvas.parentElement.clientHeight;
        const cellSize = Math.min(w, h) / 20;
        return { w, h, cellSize, originX: w / 2, originY: h / 2 };
    }
    function canvasToWorld(px, py) {
        const { w, h, cellSize, originX, originY } = gridMetrics();
        return { x: (px - originX) / cellSize, y: (originY - py) / cellSize, cellSize, w, h };
    }
    function worldToCanvas(x, y) {
        const { cellSize, w, h, originX, originY } = gridMetrics();
        return { x: originX + x * cellSize, y: originY - y * cellSize, cellSize, w, h };
    }

    function drawGrid() {
        const { w, h, cellSize, originX, originY } = gridMetrics();
        const gridSize = 20 * cellSize;
        const left = originX - gridSize / 2;
        const top = originY - gridSize / 2;
        ctx.clearRect(0,0,w,h);
        // 外圈背景（更暗，提示此处不可交互）
        ctx.fillStyle = '#050b14';
        ctx.fillRect(0,0,w,h);
        // 用 clip 把网格绘制约束到中心 20×20 方块内
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, gridSize, gridSize);
        ctx.clip();
        // 方块内背景
        ctx.fillStyle = '#0a1326';
        ctx.fillRect(left, top, gridSize, gridSize);
        // 普通格线
        ctx.strokeStyle = 'rgba(148,163,184,0.2)';
        ctx.lineWidth = 1;
        for (let i = -10; i <= 10; i++) {
            const x = originX + i * cellSize;
            const y = originY - i * cellSize;
            ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + gridSize); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + gridSize, y); ctx.stroke();
        }
        // 中心轴高亮
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(originX, top); ctx.lineTo(originX, top + gridSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(left, originY); ctx.lineTo(left + gridSize, originY); ctx.stroke();
        ctx.restore();
        // 方块外边框
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, gridSize, gridSize);
    }

    function drawCellRect(p, color, label) {
        const { cellSize, w, h } = gridMetrics();
        const left = w / 2 + p.x * cellSize;
        const top = h / 2 - (p.y + 1) * cellSize;
        ctx.fillStyle = color;
        ctx.fillRect(left, top, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.strokeRect(left, top, cellSize, cellSize);
        ctx.fillStyle = '#fff';
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText(label, left + 4, top + 14);
    }

    function drawSelectionRect(sel) {
        if (!sel) return;
        const { cellSize, w, h } = gridMetrics();
        const x1 = Math.min(sel.start.x, sel.end.x);
        const x2 = Math.max(sel.start.x, sel.end.x);
        const y1 = Math.min(sel.start.y, sel.end.y);
        const y2 = Math.max(sel.start.y, sel.end.y);
        const left = w / 2 + x1 * cellSize;
        const right = w / 2 + (x2 + 1) * cellSize;
        const top = h / 2 - (y2 + 1) * cellSize;
        const bottom = h / 2 - y1 * cellSize;
        ctx.fillStyle = 'rgba(59,130,246,0.18)';
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.strokeStyle = 'rgba(59,130,246,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, right - left, bottom - top);
    }

    function drawSelectionHighlight(sel) {
        if (!sel || !sel.cells.length) return;
        const { cellSize, w, h } = gridMetrics();
        ctx.save();
        ctx.fillStyle = 'rgba(253,224,71,0.18)';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        sel.cells.forEach((p) => {
            const left = w / 2 + p.x * cellSize;
            const top = h / 2 - (p.y + 1) * cellSize;
            ctx.fillRect(left, top, cellSize, cellSize);
            ctx.strokeRect(left + 1, top + 1, cellSize - 2, cellSize - 2);
        });
        ctx.restore();
    }

    // 直线实时预览：拖动过程中高亮将要落格的格点序列
    function drawLinePreview(a, b) {
        if (!a || !b) return;
        const { cellSize, w, h } = gridMetrics();
        const cells = linePathCells(a, b);
        ctx.save();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
        ctx.lineWidth = 1.5;
        cells.forEach((p) => {
            const left = w / 2 + p.x * cellSize;
            const top = h / 2 - (p.y + 1) * cellSize;
            ctx.fillRect(left + 0.5, top + 0.5, cellSize - 1, cellSize - 1);
            ctx.strokeRect(left + 0.5, top + 0.5, cellSize - 1, cellSize - 1);
        });
        ctx.restore();
    }

    function draw() {
        drawGrid();
        const lvl = currentLevel();
        (lvl.targetCells || []).forEach((p, i) => drawCellRect(p, 'rgba(34,197,94,0.5)', `T${i+1}`));
        (lvl.forbiddenCells || []).forEach((p, i) => drawCellRect(p, 'rgba(239,68,68,0.5)', `F${i+1}`));
        const ds = state.dragState;
        const showRect = ds && (ds.rectMode || (ds.selectMode && !ds.moveMode));
        drawSelectionRect(showRect ? ds : null);
        if (ds && ds.lineMode) drawLinePreview(ds.start, ds.end);
        drawSelectionHighlight(state.selection);
        drawReferenceCurve();
        ctx.fillStyle = '#facc15';
        ctx.font = '13px ui-monospace, monospace';
        (lvl.lockedElements || []).forEach((s, i) => ctx.fillText(`锁 ${i+1}: ${s}`, 16, 24 + i * 18));
    }

    function exportLevel(lvl) {
        const nextId = lvl.nextId === '' ? null : lvl.nextId;
        return `{
                       "id":  "${lvl.id}",
                       "difficulty":  "${lvl.difficulty}",
                       "nextId":  ${nextId === null ? 'null' : `"${nextId}"`},
                       "targetCells":  ${JSON.stringify(lvl.targetCells, null, 4).replace(/\n/g, '\n                                           ')},
                       "forbiddenCells":  ${JSON.stringify(lvl.forbiddenCells, null, 4).replace(/\n/g, '\n                                            ')},
                       "lockedElements":  ${JSON.stringify(lvl.lockedElements, null, 4).replace(/\n/g, '\n                                              ')}
                   }`;
    }

    function exportAll() {
        const out = state.levels.map((lvl, i) => exportLevel(lvl) + (i < state.levels.length - 1 ? ',' : '')).join('\n                   ');
        els.exportBox.value = out;
        setStatus(`已导出 ${state.levels.length} 个关卡`);
        return out;
    }

    function setStatus(msg) { els.status.textContent = msg; }

    els.precisionSelect.onchange = () => {
        state.precision = Number(els.precisionSelect.value);
        setStatus(`点击精度已切换到 1/${state.precision}`);
    };
    els.anchorModeSelect.onchange = () => {
        state.anchorMode = els.anchorModeSelect.value;
        setStatus(state.anchorMode === 'center' ? '点击基准：中心' : '点击基准：左下角');
    };
    // 四个工具互斥：开启一个会关闭其余；关闭选中会清空选择集
    const setTool = (tool) => {
        state.rectEnabled = tool === 'rect';
        state.lineEnabled = tool === 'line';
        state.brushEnabled = tool === 'brush';
        const sel = tool === 'select';
        if (!sel) state.selection = null;
        state.selectEnabled = sel;
        els.btnRect.classList.toggle('active', state.rectEnabled);
        els.btnLine.classList.toggle('active', state.lineEnabled);
        els.btnBrush.classList.toggle('active', state.brushEnabled);
        els.btnSelect.classList.toggle('active', sel);
        if (sel) setStatus('框选（移动）已开启：拖动框住区域选中，随后可拖动或用方向键/实体键移动');
        else if (tool === 'rect') setStatus('长方形已开启');
        else if (tool === 'line') setStatus('直线已开启');
        else if (tool === 'brush') setStatus('画笔已开启：按住左/右键拖动即绘目标格/禁止区');
        else setStatus('已关闭所有绘制工具');
        draw();
    };
    els.btnRect.onclick = () => setTool(state.rectEnabled ? null : 'rect');
    els.btnLine.onclick = () => setTool(state.lineEnabled ? null : 'line');
    els.btnBrush.onclick = () => setTool(state.brushEnabled ? null : 'brush');
    els.btnSelect.onclick = () => setTool(state.selectEnabled ? null : 'select');
    els.btnArrowUp.onclick = () => moveSelectionByKey('up');
    els.btnArrowDown.onclick = () => moveSelectionByKey('down');
    els.btnArrowLeft.onclick = () => moveSelectionByKey('left');
    els.btnArrowRight.onclick = () => moveSelectionByKey('right');
    els.btnTrash.onclick = () => deleteSelection();
    els.btnSwapMouse.onclick = () => {
        state.swapMouse = !state.swapMouse;
        els.btnSwapMouse.classList.toggle('active', state.swapMouse);
        els.btnSwapMouse.textContent = state.swapMouse ? '左键:禁止 右键:目标' : '左键:目标 右键:禁止';
        setStatus(state.swapMouse ? '已互换：左键禁止区 / 右键目标格' : '已恢复：左键目标格 / 右键禁止区');
    };
    els.btnUndo.onclick = () => { doUndo(); };

    // ---- 函数参考线（fx）：与函数棋相同的 geogebra-lite 引擎，纯辅助，不影响关卡数据 ----
    const fxParser = new FunctionParser();
    const refGrid = {
        get canvas() { return { width: els.gridCanvas.clientWidth || 800, height: els.gridCanvas.clientHeight || 600 }; },
        ctx,
        range: 10,
        getRange: () => ({ min: -10, max: 10 }),
        mathToCanvas: (x, y) => worldToCanvas(x, y),
        draw: () => {}
    };
    const refRenderer = new FunctionRenderer(refGrid);
    const REF_COLOR = 'rgba(34, 211, 238, 0.85)';
    // 采样结果缓存：表达式或画布尺寸变化时才重新采样（避免每次 draw 重算导致拖动卡顿）
    let refCache = { expr: null, w: 0, h: 0, segments: null };
    const drawReferenceCurve = () => {
        const expr = state.referenceExpr;
        if (!expr) return;
        try {
            fxParser.parse(expr); // 非法表达式不绘制
            const w = els.gridCanvas.clientWidth || 800;
            const h = els.gridCanvas.clientHeight || 600;
            if (refCache.expr !== expr || refCache.w !== w || refCache.h !== h) {
                refCache.expr = expr;
                refCache.w = w;
                refCache.h = h;
                refCache.segments = refRenderer._sampleToSegments(expr, -10, 10);
            }
            ctx.save();
            ctx.strokeStyle = REF_COLOR;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const seg of refCache.segments) {
                if (seg.length < 2) continue;
                ctx.beginPath();
                const p0 = worldToCanvas(seg[0].x, seg[0].y);
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < seg.length; i++) {
                    const p = worldToCanvas(seg[i].x, seg[i].y);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        } catch (e) { /* 输入框下已提示，这里静默 */ }
    };
    let fxTimer = null;
    const applyFxNow = (expr) => {
        state.referenceExpr = expr;
        if (!expr) {
            setStatus('已清除函数参考线');
        } else {
            try { fxParser.parse(expr); setStatus('参考线已更新（仅辅助设计，不影响关卡）'); }
            catch (err) { setStatus(`表达式有误：${err.message}`); }
        }
        draw();
    };
    const fxDebounced = (expr) => { clearTimeout(fxTimer); fxTimer = setTimeout(() => applyFxNow(expr), 300); };
    els.btnFx.onclick = () => {
        const show = els.fxPanel.hidden;
        els.fxPanel.hidden = !show;
        els.btnFx.classList.toggle('active', show);
        if (show) els.fxInput.focus();
    };
    els.fxInput.addEventListener('input', () => fxDebounced(els.fxInput.value.trim()));
    els.fxInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(fxTimer); applyFxNow(els.fxInput.value.trim()); }
        if (e.key === 'Escape') { els.fxPanel.hidden = true; els.btnFx.classList.remove('active'); }
    });
    els.btnFxClear.onclick = () => { clearTimeout(fxTimer); els.fxInput.value = ''; applyFxNow(''); };

    els.id.oninput = els.difficulty.oninput = els.nextId.oninput = () => { commitFormToLevel(); };
    els.targetCells.oninput = els.forbiddenCells.oninput = els.lockedElements.oninput = () => { commitFormToLevel(); };

    els.btnBack.onclick = () => { this.closeEditor(); };
    els.btnAdd.onclick = () => { state.levels.push({ id: `new-${state.levels.length+1}`, difficulty: 'fraction', nextId: null, targetCells: [], forbiddenCells: [], lockedElements: [] }); state.current = state.levels.length - 1; syncFormFromLevel(); pushHistory(); };
    els.btnDelete.onclick = () => { if (state.levels.length <= 1) return setStatus('至少保留一个关卡'); state.levels.splice(state.current,1); state.current = Math.max(0, state.current - 1); syncFormFromLevel(); pushHistory(); };
    els.btnCopyExport.onclick = async () => { const text = exportAll(); await navigator.clipboard.writeText(text); setStatus('导出文本已复制'); };
    els.btnDownload.onclick = () => {
        let name = (els.fileNameInput.value || '').trim() || 'campaignLevels.fragment';
        if (!/\.[^.]+$/.test(name)) name += '.js';
        const text = `[
${exportAll()}
]`; const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
        setStatus(`已下载 ${name}`);
    };
    els.btnCopyOne.onclick = async () => { const text = exportLevel(currentLevel()); await navigator.clipboard.writeText(text); setStatus('当前关卡文本已复制'); };

    // ---- 导入项目：从外部 .js/.json 文件或粘贴文本，导入关卡布局、对象配置与游戏逻辑数据 ----
    const parseProjectText = (raw) => {
        const text = String(raw || '').trim();
        if (!text) return null;
        let data = null;
        // 1) 标准 JSON（数组或 { "levels": [...] }）
        try { data = JSON.parse(text); } catch {}
        // 2) 编辑器导出的文本格式（无外层方括号的对象列表）→ 包裹成数组再解析
        if (data === null) {
            try { data = JSON.parse(`[${text}]`); } catch {}
        }
        // 3) JS 数组字面量片段（const X = [ ... ]; / 直接贴数组）→ 提取中括号内容
        if (data === null) {
            try {
                const m = text.match(/\[[\s\S]*\]/);
                if (m) data = JSON.parse(m[0]);
            } catch {}
        }
        if (data === null) return null;
        if (data && !Array.isArray(data) && Array.isArray(data.levels)) data = data.levels;
        return data;
    };
    const applyImportedProject = (levels) => {
        if (!Array.isArray(levels) || !levels.length) { setStatus('导入失败：未找到关卡数据'); return false; }
        state.levels = structuredClone(levels).map((l) => ({
            id: l.id ?? `import-${Math.random().toString(36).slice(2, 6)}`,
            difficulty: l.difficulty ?? 'fraction',
            nextId: l.nextId ?? null,
            targetCells: Array.isArray(l.targetCells) ? l.targetCells : [],
            forbiddenCells: Array.isArray(l.forbiddenCells) ? l.forbiddenCells : [],
            lockedElements: Array.isArray(l.lockedElements) ? l.lockedElements : []
        }));
        state.current = 0;
        state.history = [];
        state.historyIndex = -1;
        syncFormFromLevel();
        pushHistory();
        exportAll();
        setStatus(`已导入 ${state.levels.length} 个关卡`);
        return true;
    };
    els.btnImportFile.onclick = () => { if (els.editorImportFile) els.editorImportFile.click(); };
    els.editorImportFile.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const levels = parseProjectText(text);
            if (!levels || !applyImportedProject(levels)) setStatus('导入失败：文件内容不是有效的关卡数据');
            else setStatus(`已从 ${f.name} 导入 ${levels.length} 个关卡`);
        } catch (err) {
            setStatus('导入失败：' + (err && err.message ? err.message : '无法解析文件'));
        }
        e.target.value = '';
    });
    // 粘贴导入弹窗（惰性创建）
    const ensureImportTextModal = () => {
        let m = document.getElementById('editor-import-text-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'editor-import-text-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:30000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);';
        m.innerHTML = `<div style="width:min(560px,92vw);background:#0b1526;border:1px solid rgba(250,204,21,.35);border-radius:16px;padding:18px 20px;box-shadow:0 24px 80px rgba(0,0,0,.5);box-sizing:border-box;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <strong style="color:#fde047;font-size:14px;">粘贴导入关卡项目</strong>
                <button id="editor-import-text-close" type="button" style="background:none;border:none;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;" title="关闭">&times;</button>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;">支持：编辑器导出的关卡文本 / JSON 数组 / { &quot;levels&quot;: [...] } / JS 数组片段。导入会覆盖当前全部关卡。</p>
            <textarea id="editor-import-text-area" rows="10" placeholder="在此粘贴关卡项目文本…" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#e2e8f0;padding:10px;font-size:12px;font-family:ui-monospace,Consolas,monospace;resize:vertical;"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                <button id="editor-import-text-cancel" type="button" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 18px;color:#cbd5e1;cursor:pointer;font-size:12px;">取消</button>
                <button id="editor-import-text-confirm" type="button" style="background:linear-gradient(135deg,#facc15,#f59e0b);border:none;border-radius:10px;padding:8px 22px;color:#1e293b;font-weight:700;cursor:pointer;font-size:12px;">导入</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
        m.querySelector('#editor-import-text-close').onclick = () => { m.style.display = 'none'; };
        m.querySelector('#editor-import-text-cancel').onclick = () => { m.style.display = 'none'; };
        m.querySelector('#editor-import-text-confirm').onclick = () => {
            const text = m.querySelector('#editor-import-text-area').value;
            if (!text.trim()) { setStatus('请先粘贴关卡项目文本'); return; }
            const levels = parseProjectText(text);
            if (!levels || !applyImportedProject(levels)) setStatus('导入失败：文本不是有效的关卡数据');
            else m.style.display = 'none';
        };
        return m;
    };
    els.btnImportText.onclick = () => {
        const m = ensureImportTextModal();
        m.querySelector('#editor-import-text-area').value = '';
        m.style.display = 'flex';
        setTimeout(() => m.querySelector('#editor-import-text-area').focus(), 30);
    };
    els.btnCloseLeft.onclick = () => { editorView.classList.add('left-hidden'); fitCanvas(); };
    els.btnCloseRight.onclick = () => { editorView.classList.add('right-hidden'); fitCanvas(); };
    els.btnShowLeft.onclick = () => { editorView.classList.remove('left-hidden'); fitCanvas(); };
    els.btnShowRight.onclick = () => { editorView.classList.remove('right-hidden'); fitCanvas(); };

    const quantizeToPrecision = (n) => snap(n);
    const cellFromEvent = (e) => {
        const rect = els.gridCanvas.getBoundingClientRect();
        const p = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const offset = state.anchorMode === 'center' ? -0.5 : 0;
        return { x: quantizeToPrecision(p.x + offset), y: quantizeToPrecision(p.y + offset) };
    };
    const gridCellFromEvent = (e) => {
        const rect = els.gridCanvas.getBoundingClientRect();
        const p = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
        return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };
    const sameCell = (a, b) => a.x === b.x && a.y === b.y;
    const typeForButton = (btn) => {
        const left = btn === 0;
        return state.swapMouse ? (left ? 'forbidden' : 'target') : (left ? 'target' : 'forbidden');
    };
    const removeCellAt = (level, cell) => {
        const targetIndex = (level.targetCells || []).findIndex(p => sameCell(p, cell));
        if (targetIndex !== -1) {
            level.targetCells.splice(targetIndex, 1);
            return 'target';
        }
        const forbiddenIndex = (level.forbiddenCells || []).findIndex(p => sameCell(p, cell));
        if (forbiddenIndex !== -1) {
            level.forbiddenCells.splice(forbiddenIndex, 1);
            return 'forbidden';
        }
        return null;
    };
    const addCellAt = (level, cell, type) => {
        // 幂等：目标位已是同类型格 → 直接短路，不删不落（修复画笔来回涂 / 矩形覆盖 / 直线自交 / 选区移动丢格）
        const arr = type === 'target' ? (level.targetCells || []) : (level.forbiddenCells || []);
        if (arr.some(p => sameCell(p, cell))) return;
        // 异类型占用：删旧补新（覆盖语义）
        const other = type === 'target' ? (level.forbiddenCells || []) : (level.targetCells || []);
        const otherIndex = other.findIndex(p => sameCell(p, cell));
        if (otherIndex !== -1) other.splice(otherIndex, 1);
        if (type === 'target') level.targetCells.push(cell); else level.forbiddenCells.push(cell);
    };
    // 单点点击专用 toggle：同类型已存在 → 删除该格；异类型/空位 → 落格（保留「点同格取消」交互）
    const toggleCellAt = (level, cell, type) => {
        const existingType = removeCellAt(level, cell);
        if (existingType !== type) {
            if (type === 'target') level.targetCells.push(cell); else level.forbiddenCells.push(cell);
        }
    };
    const addCellRange = (start, end, type) => {
        const lvl = currentLevel();
        const xs = [Math.floor(Math.min(start.x, end.x)), Math.floor(Math.max(start.x, end.x))];
        const ys = [Math.floor(Math.min(start.y, end.y)), Math.floor(Math.max(start.y, end.y))];
        for (let x = xs[0]; x <= xs[1]; x++) {
            for (let y = ys[0]; y <= ys[1]; y++) {
                addCellAt(lvl, { x, y }, type);
            }
        }
    };
    // 直线：计算首尾两点间按精度吸附的格点序列（不修改关卡，供实时预览与落格共用）
    const linePathCells = (start, end) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) * state.precision * 4;
        const count = Math.max(1, Math.ceil(steps));
        const visited = new Set();
        const cells = [];
        for (let i = 0; i <= count; i++) {
            const t = count === 0 ? 0 : i / count;
            const x = snap(start.x + dx * t);
            const y = snap(start.y + dy * t);
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            cells.push({ x, y });
        }
        return cells;
    };
    const addPathCells = (start, end, type) => {
        const lvl = currentLevel();
        linePathCells(start, end).forEach(c => addCellAt(lvl, c, type));
    };
    // 画笔：沿拖动轨迹逐段落格，落点按精度（1/2、1/3、1/4…）吸附，半格采样保证连续覆盖
    const paintSegment = (a, b, type) => {
        const lvl = currentLevel();
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const step = 0.5 / state.precision;
        const count = Math.max(1, Math.ceil(dist / step));
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            addCellAt(lvl, { x: snap(a.x + dx * t), y: snap(a.y + dy * t) }, type);
        }
    };
    const startSelection = (e, type) => {
        const start = gridCellFromEvent(e);
        const brush = state.brushEnabled;
        state.dragState = {
            type,
            start,
            end: start,
            rectMode: state.rectEnabled && !brush,
            moved: false,
            lineMode: state.lineEnabled && !brush,
            brushMode: brush,
            button: e.button,
            startX: e.clientX,
            startY: e.clientY,
            longPressTimer: null,
            committed: false,
            lastBrush: cellFromEvent(e)
        };
        if (brush) {
            // 画笔：按下即落第一个格，整笔在 pointerup 时统一入一次历史
            addCellAt(currentLevel(), state.dragState.lastBrush, type);
            syncFormFromLevel();
            draw();
            return;
        }
        if (!state.rectEnabled && !state.lineEnabled) {
            addCellAt(currentLevel(), start, type);
            syncFormFromLevel();
            pushHistory();
            state.dragState.committed = true;
        }
        state.dragState.longPressTimer = window.setTimeout(() => {
            if (state.dragState && state.rectEnabled && !state.brushEnabled) state.dragState.rectMode = true;
        }, 180);
        draw();
    };
    const finishSelection = () => {
        const s = state.dragState;
        if (!s) return;
        clearTimeout(s.longPressTimer);
        if (s.committed) {
            state.dragState = null;
            draw();
            return;
        }
        if (s.brushMode) {
            // 整笔已在 move 中逐格落点，这里统一入一次历史
            syncFormFromLevel();
            pushHistory();
        } else if (s.lineMode && s.moved) {
            addPathCells(s.start, s.end, s.type);
            syncFormFromLevel();
            pushHistory();
        } else if (s.rectMode && s.moved && state.rectEnabled) {
            addCellRange(s.start, s.end, s.type);
            syncFormFromLevel();
            pushHistory();
        } else if ((state.rectEnabled || s.lineMode) && !s.moved) {
            addCellAt(currentLevel(), s.start, s.type);
            syncFormFromLevel();
            pushHistory();
        }
        state.dragState = null;
        draw();
    };

    els.gridCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- 新「框选」：框住区域选中，随后可拖动 / 方向键 / 实体键移动 ----
    const canvasPoint = (e) => {
        const rect = els.gridCanvas.getBoundingClientRect();
        return canvasToWorld(e.clientX - rect.left, e.clientY - rect.top);
    };
    const getSelectionBounds = (sel) => {
        const xs = sel.cells.map(c => c.x), ys = sel.cells.map(c => c.y);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    const selectCellsInRect = (start, end) => {
        const lvl = currentLevel();
        const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
        const cells = [];
        (lvl.targetCells || []).forEach(p => {
            if (Math.floor(p.x) >= minX && Math.floor(p.x) <= maxX && Math.floor(p.y) >= minY && Math.floor(p.y) <= maxY)
                cells.push({ x: p.x, y: p.y, type: 'target' });
        });
        (lvl.forbiddenCells || []).forEach(p => {
            if (Math.floor(p.x) >= minX && Math.floor(p.x) <= maxX && Math.floor(p.y) >= minY && Math.floor(p.y) <= maxY)
                cells.push({ x: p.x, y: p.y, type: 'forbidden' });
        });
        return cells;
    };
    const moveSelectionBy = (dx, dy) => {
        const sel = state.selection;
        if (!sel || !sel.cells.length) { setStatus('请先用「框选」框住区域选中格子，再移动'); return false; }
        const lvl = currentLevel();
        sel.cells.forEach(c => removeCellAt(lvl, { x: c.x, y: c.y }));
        const newCells = sel.cells.map(c => ({ x: snap(c.x + dx), y: snap(c.y + dy), type: c.type }));
        newCells.forEach(c => addCellAt(lvl, { x: c.x, y: c.y }, c.type));
        sel.cells = newCells;
        syncFormFromLevel();
        draw();
        return true;
    };
    const moveSelectionByKey = (dir) => {
        if (!state.selection || !state.selection.cells.length) { setStatus('请先用「框选」框住区域选中格子，再移动'); return; }
        const unit = 1 / state.precision;
        const d = { up: [0, unit], down: [0, -unit], left: [-unit, 0], right: [unit, 0] }[dir];
        if (!d) return;
        const ok = moveSelectionBy(d[0], d[1]);
        if (ok) { pushHistory(); setStatus(`已向${ {up:'上',down:'下',left:'左',right:'右'}[dir] }移动一个精度单位（1/${state.precision}）`); }
    };
    // 删除选中区域的所有格子（Delete/Backspace / 实体垃圾桶按钮），整批入一次历史
    const deleteSelection = () => {
        const sel = state.selection;
        if (!sel || !sel.cells.length) { setStatus('请先用「框选」框住区域选中格子，再删除'); return false; }
        const lvl = currentLevel();
        const count = sel.cells.length;
        sel.cells.forEach(c => removeCellAt(lvl, { x: c.x, y: c.y }));
        state.selection = null;
        syncFormFromLevel();
        pushHistory();
        setStatus(`已删除 ${count} 个格子`);
        draw();
        return true;
    };
    const handleSelectDown = (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        els.gridCanvas.setPointerCapture(e.pointerId);
        const p = canvasPoint(e);
        const sel = state.selection;
        let inside = false;
        if (sel && sel.cells.length) {
            const b = getSelectionBounds(sel);
            inside = (p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1 + 1e-6 && p.y >= b.minY - 1e-6 && p.y <= b.maxY + 1 + 1e-6);
        }
        if (sel && sel.cells.length && inside) {
            state.dragState = { selectMode: true, moveMode: true, home: structuredClone(sel.cells), origin: { x: p.x, y: p.y }, moved: false };
        } else {
            state.dragState = { selectMode: true, moveMode: false, start: gridCellFromEvent(e), end: gridCellFromEvent(e), moved: false, startX: e.clientX, startY: e.clientY };
        }
        draw();
    };
    const handleSelectMove = (e) => {
        const ds = state.dragState;
        if (ds.moveMode) {
            const p = canvasPoint(e);
            const dx = snap(p.x - ds.origin.x);
            const dy = snap(p.y - ds.origin.y);
            const lvl = currentLevel();
            // remove 与 add 统一基于 ds.home（初始位置），避免连续拖动时新旧坐标错位导致丢格/残留
            ds.home.forEach(c => removeCellAt(lvl, { x: c.x, y: c.y }));
            const newCells = ds.home.map(c => ({ x: snap(c.x + dx), y: snap(c.y + dy), type: c.type }));
            newCells.forEach(c => addCellAt(lvl, { x: c.x, y: c.y }, c.type));
            state.selection.cells = newCells;
            ds.moved = true;
            syncFormFromLevel();
            draw();
        } else {
            const dx = Math.abs(e.clientX - ds.startX), dy = Math.abs(e.clientY - ds.startY);
            if (dx > 4 || dy > 4) ds.moved = true;
            ds.end = gridCellFromEvent(e);
            draw();
        }
    };
    const handleSelectUp = (e) => {
        const ds = state.dragState;
        if (!ds) return;
        try { els.gridCanvas.releasePointerCapture(e.pointerId); } catch {}
        if (ds.moveMode) {
            if (ds.moved) { pushHistory(); setStatus('已移动选中区域'); }
        } else {
            if (ds.moved) {
                const cells = selectCellsInRect(ds.start, ds.end);
                if (cells.length) {
                    state.selection = { cells };
                    setStatus(`已选中 ${cells.length} 个格子，可拖动或用方向键/实体键移动（每次一个精度单位）`);
                } else {
                    state.selection = null;
                    setStatus('框选区域内没有格子');
                }
            } else if (state.selection) {
                state.selection = null;
                setStatus('已取消选择');
            }
        }
        state.dragState = null;
        draw();
    };

    els.gridCanvas.addEventListener('pointerdown', (e) => {
        if (state.selectEnabled) { handleSelectDown(e); return; }
        if (!state.rectEnabled && !state.lineEnabled && !state.brushEnabled) return;
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        els.gridCanvas.setPointerCapture(e.pointerId);
        startSelection(e, typeForButton(e.button));
    });
    els.gridCanvas.addEventListener('pointermove', (e) => {
        if (!state.dragState) return;
        if (state.dragState.selectMode) { handleSelectMove(e); return; }
        if (!state.rectEnabled && !state.lineEnabled && !state.brushEnabled) return;
        const dx = Math.abs(e.clientX - state.dragState.startX);
        const dy = Math.abs(e.clientY - state.dragState.startY);
        if (dx > 4 || dy > 4) state.dragState.moved = true;
        if (state.dragState.brushMode) {
            const cur = cellFromEvent(e);
            paintSegment(state.dragState.lastBrush, cur, state.dragState.type);
            state.dragState.lastBrush = cur;
            syncFormFromLevel();
            draw();
            return;
        }
        state.dragState.end = gridCellFromEvent(e);
        draw();
    });
    els.gridCanvas.addEventListener('pointerup', (e) => {
        if (state.dragState && state.dragState.selectMode) { handleSelectUp(e); return; }
        if (!state.rectEnabled && !state.lineEnabled && !state.brushEnabled) return;
        if (state.dragState) {
            try { els.gridCanvas.releasePointerCapture(e.pointerId); } catch {}
            finishSelection();
        }
    });
    els.gridCanvas.addEventListener('click', (e) => {
        if (state.selectEnabled || state.rectEnabled || state.lineEnabled || state.brushEnabled) return;
        const point = cellFromEvent(e);
        toggleCellAt(currentLevel(), point, state.swapMouse ? 'forbidden' : 'target');
        syncFormFromLevel();
        pushHistory();
    });
    els.gridCanvas.addEventListener('contextmenu', (e) => {
        if (state.selectEnabled || state.rectEnabled || state.lineEnabled || state.brushEnabled) return;
        e.preventDefault();
        const point = cellFromEvent(e);
        toggleCellAt(currentLevel(), point, state.swapMouse ? 'target' : 'forbidden');
        syncFormFromLevel();
        pushHistory();
    });

    // 键盘 / resize 守卫：仅编辑器打开时生效，避免影响主程序
    window.addEventListener('resize', () => {
        if (editorView.style.display === 'none') return;
        fitCanvas();
    });
    window.addEventListener('keydown', (e) => {
        if (editorView.style.display === 'none') return;
        if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); exportAll(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
        // 在输入框/文本域/下拉框内时，移动与删除键交给输入控件（如 fx 表达式、JSON 文本域），不劫持
        const t = e.target;
        const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (editable) return;
        // 方向键：移动选中区域
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (state.selection && state.selection.cells.length) {
                e.preventDefault();
                moveSelectionByKey({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]);
            }
        }
        // WASD：等同方向键移动（W上 A左 S下 D右），带修饰键时放行（如 Ctrl+W 关闭标签页）
        if (!e.ctrlKey && !e.metaKey && !e.altKey && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
            if (state.selection && state.selection.cells.length) {
                e.preventDefault();
                moveSelectionByKey({ w: 'up', a: 'left', s: 'down', d: 'right' }[e.key.toLowerCase()]);
            }
        }
        // Delete / Backspace：删除选中区域的所有格子
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.selection && state.selection.cells.length) {
                e.preventDefault();
                deleteSelection();
            }
        }
    });

    state.levels = structuredClone(sampleLevels);
    syncFormFromLevel();
    exportAll();
    pushHistory();

    /* 函数棋同款：按钮光晕 + 涟漪（事件委托，作用域到 #editor-view，覆盖动态生成的按钮） */
    editorView.addEventListener('pointermove', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--gx', (e.clientX - r.left) + 'px');
        btn.style.setProperty('--gy', (e.clientY - r.top) + 'px');
    });
    editorView.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) || 40;
        const span = document.createElement('span');
        span.className = 'ripple';
        span.style.width = span.style.height = size + 'px';
        span.style.left = (e.clientX - r.left - size / 2) + 'px';
        span.style.top = (e.clientY - r.top - size / 2) + 'px';
        btn.appendChild(span);
        setTimeout(() => span.remove(), 660);
    });

    // 暴露给 openEditor / closeEditor 使用
    this._editorFit = fitCanvas;
    this._editorDraw = draw;
};

// openEditor
UIController.prototype.openEditor = function() {
    if (!this.editorView) return;
    this.hideModal(this.startModal);
    this.editorView.style.display = 'flex';
    // 编辑器打开时隐藏悬浮输入栏/圆形按钮
    if (typeof this._applyFloatKeypadVisibility === 'function') this._applyFloatKeypadVisibility();
    // 进入编辑器默认隐藏左右两侧面板（面板浮于坐标系之上，显隐不影响画布）
    this.editorView.classList.add('left-hidden', 'right-hidden');
    // 等布局生效（display 变更 + 重排）后再测量画布，避免尺寸为 0
    requestAnimationFrame(() => {
        if (this._editorFit) this._editorFit();
        if (this._editorDraw) this._editorDraw();
        ['targetCells', 'forbiddenCells', 'lockedElements'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.offsetParent !== null) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
        });
    });
};

// closeEditor
UIController.prototype.closeEditor = function() {
    if (!this.editorView) return;
    this.editorView.style.display = 'none';
    // 编辑器关闭后恢复悬浮输入栏可见性（回到主界面/开始界面，通常不可见，仅刷新状态）
    if (typeof this._applyFloatKeypadVisibility === 'function') this._applyFloatKeypadVisibility();
    this.showModal(this.startModal);
};
