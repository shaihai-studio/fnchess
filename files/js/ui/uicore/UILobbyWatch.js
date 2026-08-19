/**
 * UILobbyWatch —— 全局匹配大厅速览浮窗（UIController.prototype 挂载）
 *
 * 功能：不论处于游戏哪个界面，总有一个常驻浮窗显示联机对战 / 竞速对战
 * 匹配大厅中是否有「等待中」的房间。2×2 网格：
 *     对战排位 / 对战休闲 / 竞速排位 / 竞速休闲
 * - 有房：对应格子出现红点数量徽标，浮窗整体高亮并呼吸闪烁（醒目提醒）
 * - 点击格子：直达对应匹配大厅（打开弹窗并自动切到「大厅」页签）
 * - 可拖动（按住标题栏）、可隐藏（迷你胶囊按钮，参考可拖动输入栏）
 * - 默认展开、默认位于左下角
 *
 * 实现说明：浮窗自身维护 4 个常驻 MatchLobbyController 探针连接，
 * 分别以 currentLobbyMode = ranked / casual / race_ranked / race_casual
 * 拉取房间列表，与游戏内大厅连接相互独立、互不影响。
 * 统计口径：仅统计 status !== 'playing' 的房间（对局中的房间不算）。
 */
(function () {
    if (typeof UIController === 'undefined') {
        console.error('[UILobbyWatch] UIController must be loaded before this file');
        return;
    }

    // 4 类大厅：mode 对应服务器 list_rooms 的 mode 过滤参数
    const LW_CELLS = [
        { key: 'p2pRanked',  mode: 'ranked',      isRace: false, name: '对战排位' },
        { key: 'p2pCasual',  mode: 'casual',      isRace: false, name: '对战休闲' },
        { key: 'raceRanked', mode: 'race_ranked', isRace: true,  name: '竞速排位' },
        { key: 'raceCasual', mode: 'race_casual', isRace: true,  name: '竞速休闲' }
    ];

    // ─── 初始化：构建 DOM → 恢复状态 → 启动探针 ────────────────────
    UIController.prototype._initLobbyWatch = function () {
        if (this._lwReady) return;
        this._lwReady = true;
        // -1 表示探针尚未连接成功（未知）
        this._lwCounts = { p2pRanked: -1, p2pCasual: -1, raceRanked: -1, raceCasual: -1 };
        this._lwProbes = {};
        this._lwBuildDom();
        this._lwRestoreState();
        this._lwConnect();
    };

    // ─── DOM 构建与事件绑定 ──────────────────────────────────────
    UIController.prototype._lwBuildDom = function () {
        const root = document.createElement('div');
        root.id = 'lobby-watch';
        root.className = 'lobby-watch';
        root.innerHTML =
            '<div class="lw-header">' +
                '<span class="lw-title">匹配大厅速览</span>' +
                '<span class="lw-dot"></span>' +
                '<button type="button" class="lw-btn lw-close" title="隐藏浮窗">×</button>' +
            '</div>' +
            '<div class="lw-body">' +
                '<div class="lw-grid">' +
                    LW_CELLS.map((c) =>
                        '<div class="lw-cell" data-lw-key="' + c.key + '">' +
                            '<span class="lw-cell-name">' + c.name + '</span>' +
                            '<span class="lw-badge">0</span>' +
                        '</div>'
                    ).join('') +
                '</div>' +
            '</div>';
        document.body.appendChild(root);

        const mini = document.createElement('div');
        mini.id = 'lobby-watch-mini';
        mini.className = 'lobby-watch-mini';
        mini.title = '展开匹配大厅速览';
        mini.innerHTML = '<span>大厅速览</span><span class="lw-mini-badge">0</span>';
        document.body.appendChild(mini);

        // 缓存元素
        const els = {
            root: root,
            mini: mini,
            header: root.querySelector('.lw-header'),
            close: root.querySelector('.lw-close'),
            dot: root.querySelector('.lw-dot'),
            miniBadge: mini.querySelector('.lw-mini-badge'),
            cells: {},
            badges: {}
        };
        LW_CELLS.forEach((c) => {
            const cell = root.querySelector('.lw-cell[data-lw-key="' + c.key + '"]');
            els.cells[c.key] = cell;
            els.badges[c.key] = cell.querySelector('.lw-badge');
        });
        this._lwEls = els;

        // 交互
        els.close.addEventListener('click', () => this._lwHide());
        // 迷你按钮点击展开；拖动过（>5px）则不展开（参考可拖动输入栏收起按钮）
        mini.addEventListener('click', () => { if (!this._lwMiniDragMoved) this._lwShow(); });
        LW_CELLS.forEach((c) => {
            els.cells[c.key].addEventListener('click', () => this._lwOpen(c.key));
        });

        // 拖动：仅标题栏触发（按钮不触发拖动，避免吞掉点击），位置持久化于 localStorage: dragpos:lobby-watch
        this._lwMakeDraggable();
        // 迷你按钮可拖动（参考可拖动输入栏收起按钮），隐藏时可随手拖到任意位置
        this._lwMakeMiniDraggable();
    };

    // ─── 隐藏状态持久化 ─────────────────────────────────────────
    UIController.prototype._lwSaveState = function () {
        try {
            localStorage.setItem('lobbyWatchState', JSON.stringify({
                hidden: this._lwEls.root.style.display === 'none'
            }));
        } catch (e) { /* 忽略 */ }
    };

    UIController.prototype._lwRestoreState = function () {
        let st = { hidden: false };
        try {
            const s = JSON.parse(localStorage.getItem('lobbyWatchState') || 'null');
            if (s) { st.hidden = !!s.hidden; }
        } catch (e) { /* 忽略 */ }
        // 恢复隐藏态时，迷你按钮对齐速览框当前左上角（参考输入栏收起逻辑）
        if (st.hidden) this._lwHide();
    };

    // 隐藏：迷你按钮移到速览框当前左上角（参考输入栏收起：fab 对齐输入栏左上角）
    UIController.prototype._lwHide = function () {
        const els = this._lwEls;
        const r = els.root.getBoundingClientRect();
        els.mini.style.left = r.left + 'px';
        els.mini.style.top = r.top + 'px';
        els.mini.style.right = 'auto';
        els.mini.style.bottom = 'auto';
        els.root.style.display = 'none';
        els.mini.style.display = 'flex';
        this._lwSaveState();
    };

    // 展开：速览框左上角对齐迷你按钮左上角（参考输入栏展开逻辑），并夹回屏幕内
    UIController.prototype._lwShow = function () {
        const els = this._lwEls;
        const fr = els.mini.getBoundingClientRect();
        els.root.style.display = '';
        els.root.style.left = fr.left + 'px';
        els.root.style.top = fr.top + 'px';
        els.root.style.right = 'auto';
        els.root.style.bottom = 'auto';
        els.root.style.transform = 'none';
        this._lwClampRoot();
        try {
            localStorage.setItem('dragpos:lobby-watch', JSON.stringify({
                left: parseFloat(els.root.style.left) || 0,
                top: parseFloat(els.root.style.top) || 0
            }));
        } catch (e) { /* 忽略 */ }
        els.mini.style.display = 'none';
        this._lwSaveState();
    };

    // 将速览框夹回屏幕内
    UIController.prototype._lwClampRoot = function () {
        const root = this._lwEls.root;
        const w = root.offsetWidth, h = root.offsetHeight;
        root.style.left = Math.max(0, Math.min(parseFloat(root.style.left) || 0, window.innerWidth - w)) + 'px';
        root.style.top = Math.max(0, Math.min(parseFloat(root.style.top) || 0, window.innerHeight - h)) + 'px';
    };

    // ─── 迷你按钮拖动：参考可拖动输入栏收起按钮 ──────────────────
    // pointermove 位移 >5px 视为拖动（拖动中夹回屏幕内），拖动后点击不展开。
    UIController.prototype._lwMakeMiniDraggable = function () {
        const mini = this._lwEls.mini;
        this._lwMiniDragMoved = false;
        let drag = null;
        mini.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0 && !e.touches) return;
            const pt = e.touches ? e.touches[0] : e;
            drag = { sx: pt.clientX, sy: pt.clientY, left: mini.offsetLeft, top: mini.offsetTop };
            this._lwMiniDragMoved = false;
            try { mini.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
            if (e.cancelable) e.preventDefault();
        });
        mini.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - drag.sx, dy = pt.clientY - drag.sy;
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // 5px 阈值内视为点击
            this._lwMiniDragMoved = true;
            const w = mini.offsetWidth, h = mini.offsetHeight;
            mini.style.left = Math.max(0, Math.min(drag.left + dx, window.innerWidth - w)) + 'px';
            mini.style.top = Math.max(0, Math.min(drag.top + dy, window.innerHeight - h)) + 'px';
            mini.style.right = 'auto';
            mini.style.bottom = 'auto';
            if (e.cancelable) e.preventDefault();
        });
        const endDrag = () => { drag = null; };
        mini.addEventListener('pointerup', endDrag);
        mini.addEventListener('pointercancel', endDrag);
    };

    // ─── 拖动：按住标题栏拖动（按钮不触发拖动，避免吞掉点击）───
    // 参考可拖动输入栏的实现方式：拖动只绑定在头部，头部内的 button 一律放行。
    UIController.prototype._lwMakeDraggable = function () {
        const root = this._lwEls.root;
        const header = this._lwEls.header;
        const KEY = 'dragpos:lobby-watch';
        // 恢复上次保存的位置
        try {
            const saved = localStorage.getItem(KEY);
            if (saved) {
                const p = JSON.parse(saved);
                if (typeof p.left === 'number' && typeof p.top === 'number') {
                    root.style.left = p.left + 'px';
                    root.style.top = p.top + 'px';
                    root.style.right = 'auto';
                    root.style.bottom = 'auto';
                    root.style.transform = 'none';
                }
            }
        } catch (e) { /* 忽略 */ }
        let drag = null;
        header.addEventListener('pointerdown', (e) => {
            // 按钮等交互控件不触发拖动，保证点击正常
            if (e.target.closest && e.target.closest('button')) return;
            if (e.button !== undefined && e.button !== 0 && !e.touches) return;
            const pt = e.touches ? e.touches[0] : e;
            const r = root.getBoundingClientRect();
            drag = { sx: pt.clientX, sy: pt.clientY, left: r.left, top: r.top };
            root.classList.add('dragging');
            try { header.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
            if (e.cancelable) e.preventDefault();
        });
        header.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const pt = e.touches ? e.touches[0] : e;
            const w = root.offsetWidth, h = root.offsetHeight;
            let nl = Math.max(0, Math.min(drag.left + (pt.clientX - drag.sx), window.innerWidth - w));
            let nt = Math.max(0, Math.min(drag.top + (pt.clientY - drag.sy), window.innerHeight - h));
            root.style.left = nl + 'px';
            root.style.top = nt + 'px';
            root.style.right = 'auto';
            root.style.bottom = 'auto';
            root.style.transform = 'none';
            if (e.cancelable) e.preventDefault();
        });
        const endDrag = () => {
            if (!drag) return;
            drag = null;
            root.classList.remove('dragging');
            try {
                localStorage.setItem(KEY, JSON.stringify({
                    left: parseFloat(root.style.left) || 0,
                    top: parseFloat(root.style.top) || 0
                }));
            } catch (e2) { /* 忽略 */ }
        };
        header.addEventListener('pointerup', endDrag);
        header.addEventListener('pointercancel', endDrag);
    };

    // ─── 常驻探针：4 类大厅各自独立连接 ──────────────────────────
    UIController.prototype._lwConnect = function () {
        if (typeof MatchLobbyController === 'undefined') {
            console.error('[UILobbyWatch] MatchLobbyController 未加载');
            return;
        }
        LW_CELLS.forEach((c) => {
            const lobby = new MatchLobbyController();
            lobby.currentLobbyMode = c.mode;
            lobby.onConnectionChange = (connected) => {
                if (!connected) this._lwCounts[c.key] = -1; // 掉线视为未知
                this._lwRender();
            };
            lobby.onRoomsUpdate = (rooms) => {
                let n = 0;
                (rooms || []).forEach((r) => {
                    if (!r || r.status === 'playing') return; // 进行中的房间不算
                    if (c.isRace ? (r.isRace === true) : (r.isRace !== true)) n++;
                });
                this._lwCounts[c.key] = n;
                this._lwRender();
            };
            this._lwProbes[c.key] = lobby;
        });
        // 统一连接（连接成功后自动 fetch 并每 2.5s 刷新）
        Object.keys(this._lwProbes).forEach((k) => this._lwProbes[k].connect());
    };

    // ─── 渲染 ───────────────────────────────────────────────────
    UIController.prototype._lwRender = function () {
        if (!this._lwEls) return;
        const els = this._lwEls;
        let total = 0;
        LW_CELLS.forEach((c) => {
            const n = this._lwCounts[c.key];
            const cell = els.cells[c.key];
            const badge = els.badges[c.key];
            if (n > 0) {
                badge.textContent = n > 99 ? '99+' : String(n);
                badge.style.display = '';
                cell.classList.add('has-rooms');
                cell.classList.remove('lw-unknown');
                total += n;
            } else {
                badge.style.display = 'none';
                cell.classList.remove('has-rooms');
                cell.classList.toggle('lw-unknown', n < 0);
            }
        });
        const anyRooms = total > 0;
        els.root.classList.toggle('has-rooms', anyRooms);
        els.mini.classList.toggle('has-rooms', anyRooms);
        els.miniBadge.textContent = total > 99 ? '99+' : String(total);
        els.miniBadge.style.display = anyRooms ? '' : 'none';
    };

    // ─── 点击格子：直达对应匹配大厅 ──────────────────────────────
    UIController.prototype._lwOpen = function (key) {
        try {
            const cell = LW_CELLS.find((c) => c.key === key);
            if (!cell) return;
            if (window.audioManager) window.audioManager.playClick();
            // 对局 / 关卡 / 观战中：先弹确认框，确认退出后再自动进入大厅
            const busy = this._lwBusyState();
            if (busy) {
                this._lwConfirmExit(cell, busy);
                return;
            }
            // 空闲：先收拢可能残留的选关/房间/结算等弹窗（回到主界面），再直达对应大厅
            this._lwCloseAllScreens();
            this._lwGo(cell);
        } catch (e) {
            this.showMessage('进入大厅失败：' + (e && e.message ? e.message : e), 'error');
        }
    };

    // 当前是否处于对局 / 关卡 / 观战中；返回 null 表示空闲可直接进入
    UIController.prototype._lwBusyState = function () {
        if (this._isSpectating) {
            return {
                type: 'spectate', title: '当前正在观战',
                message: '当前正在观战一局对局。\n\n退出观战将离开观战频道并返回主界面，观战进度不会保留。确定要退出观战吗？'
            };
        }
        if (this.isP2PMode && this._p2pMatchStarted) {
            return {
                type: 'p2p', title: '当前正在进行联机对局',
                message: this._p2pMatchMode === 'ranked'
                    ? '当前正在进行联机排位对局。\n\n确认退出后本局将判负并扣除 ELO 积分，确定要退出吗？'
                    : '当前正在进行联机休闲对局。\n\n确认退出后本局将直接结束且不计胜负，确定要退出吗？'
            };
        }
        if (this._rbMatchStarted) {
            return {
                type: 'race', title: '当前正在进行竞速对局',
                message: this._rbRanked
                    ? '当前正在进行竞速排位对局。\n\n确认退出后本局将判负并扣除 30 分，确定要退出吗？'
                    : '当前正在进行竞速对局。\n\n确认退出后本局将直接结束且不计胜负，确定要退出吗？'
            };
        }
        if (this.editorView && this.editorView.style.display === 'flex') {
            return {
                type: 'editor', title: '当前正在编辑关卡',
                message: '当前正在编辑关卡。\n\n退出后本次编辑内容将不会保存，确定要退出编辑吗？'
            };
        }
        if (this._gameActive) {
            return {
                type: 'game', title: '当前正在进行对局',
                message: '当前正在进行单人对局。\n\n退出后本局进度将不会保留，确定要退出吗？'
            };
        }
        return null;
    };

    // 弹出确认框：显示退出后果，确认后先退出当前对局/关卡，再自动打开对应大厅
    UIController.prototype._lwConfirmExit = function (cell, busy) {
        this.showGameDialog({
            title: busy.title,
            message: busy.message,
            showSkip: false,
            options: [
                { label: '取消', value: false },
                { label: '确认退出', value: true }
            ]
        }).then((confirmed) => {
            if (confirmed) this._lwExitAndGo(cell, busy);
        });
    };

    // 执行退出（按占用类型走对应退出函数），退出完成后自动打开目标大厅
    UIController.prototype._lwExitAndGo = function (cell, busy) {
        this._lwPendingLobby = cell; // P2P 排位判负弹窗点「返回主菜单」后自动进入目标大厅
        switch (busy.type) {
            case 'spectate':
                this.exitSpectatorMode();
                break;
            case 'p2p':
                this._cleanupP2P(); // 排位会弹判负弹窗（点「返回主菜单」后经 _lwPendingLobby 自动进大厅）
                break;
            case 'race':
                this.raceBattleDoLeave(); // 内部会重新打开竞速房间弹窗，随后只需切到大厅页签
                break;
            case 'editor':
                this.closeEditor();
                break;
            default:
                this.handleExit();
                break;
        }
        // P2P 排位：判负弹窗已弹出，等待用户点「返回主菜单」后由 _lwPendingLobby 接管
        if (busy.type === 'p2p' && this._p2pShowDisconnectReturnToMenu) return;
        this._lwPendingLobby = null;
        // 其余路径：退出完成后强制收拢所有残留界面回到主界面，稍候自动打开目标大厅
        setTimeout(() => {
            this._lwCloseAllScreens();
            if (this.startModal && this.startModal.style.display === 'none') this.showModal(this.startModal);
            this._lwGo(cell);
        }, 500);
    };

    // 直接进入对应匹配大厅（仅在确认无占用时调用）
    UIController.prototype._lwGo = function (cell) {
        if (cell.isRace) this._lwOpenRace(cell.mode === 'race_ranked');
        else this._lwOpenP2P(cell.mode);
    };

    // 统一收拢界面：关闭除主界面外的所有弹窗（选关/房间/结算/设置等），回到主界面；
    // 返回是否真的关闭了某些弹窗
    UIController.prototype._lwCloseAllScreens = function () {
        let closed = false;
        document.querySelectorAll('.modal').forEach((m) => {
            if (!m.id || m.id === 'start-modal') return;
            const hidden = m.style.display === 'none' || window.getComputedStyle(m).display === 'none';
            if (hidden) return;
            this.hideModal(m);
            closed = true;
        });
        return closed;
    };

    // 开始界面隐藏速览栏（仅主界面及之后显示）：静默隐藏/恢复，不改变用户的折叠偏好
    UIController.prototype._lwSetVisible = function (visible) {
        if (!this._lwEls) return;
        if (visible) {
            const prev = this._lwSupPrev || { rootHidden: false, miniHidden: true };
            this._lwEls.root.style.display = prev.rootHidden ? 'none' : '';
            this._lwEls.mini.style.display = prev.miniHidden ? 'none' : 'flex';
            this._lwSupPrev = null;
        } else {
            this._lwSupPrev = {
                rootHidden: this._lwEls.root.style.display === 'none',
                miniHidden: this._lwEls.mini.style.display === 'none'
            };
            this._lwEls.root.style.display = 'none';
            this._lwEls.mini.style.display = 'none';
        }
    };

    // 联机对战（对战排位 / 对战休闲）
    UIController.prototype._lwOpenP2P = function (mode) {
        if (typeof P2PController === 'undefined') {
            this.showMessage('P2P 模块未加载', 'error');
            return;
        }
        // 对局中 / 观战中：不允许进入大厅，避免打断当前对局
        if (this.p2pController && this.p2pController.isConnected) {
            this.showMessage('对局进行中，无法进入大厅', 'error');
            return;
        }
        this._p2pMatchMode = mode;       // 设定排位/休闲，绕过模式选择弹窗
        this._p2pWarningShown = true;    // 浮窗直达：跳过排位警告弹窗，避免挡住大厅
        this._proceedP2PRoomModal();     // 打开联机房间弹窗（大厅连接自动建立）
        // 直达「大厅」页签：手动切换并建立连接。
        // 注意：不用 tab.click()——其 onclick 里会再播一次 playClick，导致音效重复。
        this._lwForceP2PLobbyTab();
    };

    // 兜底：tab.onclick 未绑定时手动切到「大厅」页签并建立连接（不重复操作）
    UIController.prototype._lwForceP2PLobbyTab = function () {
        const modal = document.getElementById('p2p-room-modal');
        if (!modal || modal.style.display === 'none') return;
        const tab = document.getElementById('p2p-tab-lobby');
        const content = document.getElementById('p2p-tab-lobby-content');
        if (!tab || !content) return;
        if (tab.classList.contains('active')) return; // 已由 onclick 切好
        document.querySelectorAll('.p2p-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.p2p-tab-content').forEach((c) => c.style.display = 'none');
        tab.classList.add('active');
        content.style.display = 'block';
        const leftCol = document.querySelector('.p2p-selectors-left');
        if (leftCol) leftCol.style.display = 'flex';
        if (typeof this._openLobby === 'function') this._openLobby();
    };

    // 竞速对战（竞速排位 / 竞速休闲）
    UIController.prototype._lwOpenRace = function (ranked) {
        if (this._rbMatchStarted) {
            this.showMessage('对局进行中，无法进入大厅', 'error');
            return;
        }
        // 已有等待中的竞速房间（房主/访客等待中）：不重置房间，只打开弹窗并切到大厅
        if (this._rbRoom && this._rbRoomOpen && !this._rbMatchStarted) {
            this.showModal('race-battle-modal');
            this.raceBattleSwitchTab('lobby');
            return;
        }
        this._rbRanked = ranked;         // 设定排位/休闲，绕过模式选择弹窗
        this._rbWarningShown = true;     // 浮窗直达：跳过排位警告弹窗，避免挡住大厅
        this._proceedRaceBattleModal();
        this.raceBattleSwitchTab('lobby'); // 直达「大厅」页签（自动连接竞速大厅）
    };
})();
