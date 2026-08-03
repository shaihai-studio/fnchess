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
        boxSelectEnabled: false,
        pathPaintEnabled: false,
        swapMouse: false,
        history: [],
        historyIndex: -1,
        dragState: null
    };

    const els = Object.fromEntries(['id','difficulty','nextId','targetCells','forbiddenCells','lockedElements','exportBox','levelList','gridCanvas','status','btnBack','btnCloseLeft','btnCloseRight','btnShowLeft','btnShowRight','btnCopyOne','btnAdd','btnDelete','btnCopyExport','btnDownload','fileNameInput','precisionSelect','btnBoxSelect','btnPathPaint','btnSwapMouse','anchorModeSelect'].map(id => [id, document.getElementById(id)]));
    const ctx = els.gridCanvas.getContext('2d');

    const parseLines = (text) => text.split('\n').map(s => s.trim()).filter(Boolean);
    const safeJsonArray = (lines) => lines.map(line => JSON.parse(line.replace(/,$/,'').trim()));
    const fmtArr = (arr) => arr.map(v => typeof v === 'string' ? `"${v}"` : JSON.stringify(v)).join(',\n');
    // 自动增高：让 textarea 随内容换行撑高（编辑器打开时调用；隐藏时跳过以免高度塌为 0）
    const autoGrow = (el) => { if (!el || el.offsetParent === null) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
    const snap = (n) => Number((Math.round(n * state.precision) / state.precision).toFixed(10));
    const cloneLevels = () => structuredClone(state.levels);
    const pushHistory = () => {
        const snapshot = cloneLevels();
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        state.historyIndex = state.history.length - 1;
    };
    const restoreHistory = (index) => {
        if (index < 0 || index >= state.history.length) return;
        state.levels = structuredClone(state.history[index]);
        state.current = Math.min(state.current, state.levels.length - 1);
        state.historyIndex = index;
        syncFormFromLevel();
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
    function worldToCanvas(x, y) {
        const { w, h, cellSize, originX, originY } = gridMetrics();
        return { x: originX + x * cellSize, y: originY - y * cellSize, cellSize, w, h };
    }
    function canvasToWorld(px, py) {
        const { w, h, cellSize, originX, originY } = gridMetrics();
        return { x: (px - originX) / cellSize, y: (originY - py) / cellSize, cellSize, w, h };
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

    function draw() {
        drawGrid();
        const lvl = currentLevel();
        (lvl.targetCells || []).forEach((p, i) => drawCellRect(p, 'rgba(34,197,94,0.5)', `T${i+1}`));
        (lvl.forbiddenCells || []).forEach((p, i) => drawCellRect(p, 'rgba(239,68,68,0.5)', `F${i+1}`));
        drawSelectionRect(state.dragState?.selecting ? state.dragState : null);
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

    function snapLevelPoints(level) {
        return level;
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
    els.btnBoxSelect.onclick = () => {
        state.boxSelectEnabled = !state.boxSelectEnabled;
        els.btnBoxSelect.classList.toggle('active', state.boxSelectEnabled);
        setStatus(state.boxSelectEnabled ? '框选已开启' : '框选已关闭');
    };
    els.btnPathPaint.onclick = () => {
        state.pathPaintEnabled = !state.pathPaintEnabled;
        els.btnPathPaint.classList.toggle('active', state.pathPaintEnabled);
        setStatus(state.pathPaintEnabled ? '路径涂满已开启' : '路径涂满已关闭');
    };
    els.btnSwapMouse.onclick = () => {
        state.swapMouse = !state.swapMouse;
        els.btnSwapMouse.classList.toggle('active', state.swapMouse);
        els.btnSwapMouse.textContent = state.swapMouse ? '左键:禁止 右键:目标' : '左键:目标 右键:禁止';
        setStatus(state.swapMouse ? '已互换：左键禁止区 / 右键目标格' : '已恢复：左键目标格 / 右键禁止区');
    };

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
        const existingType = removeCellAt(level, cell);
        if (existingType === type) return;
        if (existingType && existingType !== type) {
            if (type === 'target') level.targetCells.push(cell); else level.forbiddenCells.push(cell);
            return;
        }
        if (type === 'target') level.targetCells.push(cell); else level.forbiddenCells.push(cell);
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
    const addPathCells = (start, end, type) => {
        const lvl = currentLevel();
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) * state.precision * 4;
        const count = Math.max(1, Math.ceil(steps));
        const visited = new Set();
        for (let i = 0; i <= count; i++) {
            const t = count === 0 ? 0 : i / count;
            const x = snap(start.x + dx * t);
            const y = snap(start.y + dy * t);
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            addCellAt(lvl, { x, y }, type);
        }
    };
    const startSelection = (e, type) => {
        const start = gridCellFromEvent(e);
        state.dragState = {
            type,
            start,
            end: start,
            selecting: true,
            moved: false,
            pathMode: state.pathPaintEnabled,
            button: e.button,
            startX: e.clientX,
            startY: e.clientY,
            longPressTimer: null,
            committed: false
        };
        if (!state.boxSelectEnabled && !state.pathPaintEnabled) {
            addCellAt(currentLevel(), start, type);
            syncFormFromLevel();
            pushHistory();
            state.dragState.committed = true;
        }
        state.dragState.longPressTimer = window.setTimeout(() => {
            if (state.dragState && state.boxSelectEnabled) state.dragState.selecting = true;
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
        if (s.pathMode && s.moved) {
            addPathCells(s.start, s.end, s.type);
            syncFormFromLevel();
            pushHistory();
        } else if (s.selecting && s.moved && state.boxSelectEnabled) {
            addCellRange(s.start, s.end, s.type);
            syncFormFromLevel();
            pushHistory();
        } else if ((state.boxSelectEnabled || s.pathMode) && !s.moved) {
            addCellAt(currentLevel(), s.start, s.type);
            syncFormFromLevel();
            pushHistory();
        }
        state.dragState = null;
        draw();
    };

    els.gridCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    els.gridCanvas.addEventListener('pointerdown', (e) => {
        if (!state.boxSelectEnabled && !state.pathPaintEnabled) return;
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        els.gridCanvas.setPointerCapture(e.pointerId);
        startSelection(e, typeForButton(e.button));
    });
    els.gridCanvas.addEventListener('pointermove', (e) => {
        if (!state.dragState || (!state.boxSelectEnabled && !state.pathPaintEnabled)) return;
        const dx = Math.abs(e.clientX - state.dragState.startX);
        const dy = Math.abs(e.clientY - state.dragState.startY);
        if (dx > 4 || dy > 4) state.dragState.moved = true;
        state.dragState.end = gridCellFromEvent(e);
        draw();
    });
    els.gridCanvas.addEventListener('pointerup', (e) => {
        if (!state.boxSelectEnabled && !state.pathPaintEnabled) return;
        if (state.dragState) {
            try { els.gridCanvas.releasePointerCapture(e.pointerId); } catch {}
            finishSelection();
        }
    });
    els.gridCanvas.addEventListener('click', (e) => {
        if (state.boxSelectEnabled || state.pathPaintEnabled) return;
        const point = cellFromEvent(e);
        addCellAt(currentLevel(), point, state.swapMouse ? 'forbidden' : 'target');
        syncFormFromLevel();
        pushHistory();
    });
    els.gridCanvas.addEventListener('contextmenu', (e) => {
        if (state.boxSelectEnabled || state.pathPaintEnabled) return;
        e.preventDefault();
        const point = cellFromEvent(e);
        addCellAt(currentLevel(), point, state.swapMouse ? 'target' : 'forbidden');
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
        if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); restoreHistory(state.historyIndex - 1); }
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
    this.showModal(this.startModal);
};
