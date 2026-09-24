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
        // 每个格子维护两个计数：wait=可进入（等待中）房间数（红），play=进行中对战数（蓝）
        this._lwCounts = { p2pRanked: { wait: -1, play: -1 }, p2pCasual: { wait: -1, play: -1 }, raceRanked: { wait: -1, play: -1 }, raceCasual: { wait: -1, play: -1 } };
        this._lwProbes = {};
        // 全服喊话：最近消息缓存 + 未读数（收起时提示用）
        this._lwShouts = [];
        this._lwShoutUnread = 0;
        // 在线人数（-1 = 未知，服务端 online_stats 广播后更新）
        this._lwOnline = -1;
        this._lwOnlineTs = 0;
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
                '<span class="lw-online" id="lw-online" title="当前可连接服务器的在线人数">在线 <b id="lw-online-count">--</b></span>' +
                '<span class="lw-dot"></span>' +
                '<span class="lw-drag-hint">按住拖动</span>' +
                '<button type="button" class="lw-btn lw-close" title="隐藏浮窗">×</button>' +
            '</div>' +
            '<div class="lw-body">' +
                '<div class="lw-grid">' +
                    LW_CELLS.map((c) =>
                        '<div class="lw-cell" data-lw-key="' + c.key + '">' +
                            '<span class="lw-cell-name">' + c.name + '</span>' +
                            '<span class="lw-badge-wrap">' +
                                '<span class="lw-badge lw-badge-wait">0</span>' +
                                '<span class="lw-badge lw-badge-play">0</span>' +
                            '</span>' +
                        '</div>'
                    ).join('') +
                '</div>' +
                '<div class="lw-shout-wrap">' +
                    '<div class="lw-shout-head">' +
                        '<span class="lw-shout-title">全服喊话</span>' +
                        '<span class="lw-shout-badge" id="lw-shout-badge" style="display:none;">0</span>' +
                    '</div>' +
                    '<div class="lw-shout-feed" id="lw-shout-feed"></div>' +
                    '<div class="lw-shout-input-row">' +
                        '<input type="text" class="lw-shout-input" id="lw-shout-input" maxlength="30" placeholder="喊话（30字内）" autocomplete="off">' +
                        '<button type="button" class="lw-shout-send" id="lw-shout-send">发送</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(root);

        const mini = document.createElement('div');
        mini.id = 'lobby-watch-mini';
        mini.className = 'lobby-watch-mini';
        mini.title = '展开匹配大厅速览';
        mini.innerHTML = '<span>大厅速览</span><span class="lw-mini-online" id="lw-mini-online" title="在线人数">在线 --</span><span class="lw-mini-badge">0</span>';
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
            badges: {},
            shoutFeed: root.querySelector('#lw-shout-feed'),
            shoutInput: root.querySelector('#lw-shout-input'),
            shoutSend: root.querySelector('#lw-shout-send'),
            shoutBadge: root.querySelector('#lw-shout-badge'),
            online: root.querySelector('#lw-online-count'),
            miniOnline: mini.querySelector('#lw-mini-online')
        };
        LW_CELLS.forEach((c) => {
            const cell = root.querySelector('.lw-cell[data-lw-key="' + c.key + '"]');
            els.cells[c.key] = cell;
            els.badges[c.key] = {
                wait: cell.querySelector('.lw-badge-wait'),
                play: cell.querySelector('.lw-badge-play')
            };
        });
        this._lwEls = els;

        // 交互
        els.close.addEventListener('click', () => this._lwHide());
        // 迷你按钮点击展开；拖动过（>5px）则不展开（参考可拖动输入栏收起按钮）
        mini.addEventListener('click', () => { if (!this._lwMiniDragMoved) this._lwShow(); });
        LW_CELLS.forEach((c) => {
            els.cells[c.key].addEventListener('click', () => this._lwOpen(c.key));
        });

        // 全服喊话：发送 + 回车发送
        if (els.shoutSend) els.shoutSend.addEventListener('click', () => this._lwSendShout());
        if (els.shoutInput) {
            els.shoutInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this._lwSendShout(); }
            });
        }

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
        // 展开时清空喊话未读数并刷新喊话 feed
        this._lwShoutUnread = 0;
        this._lwRenderShouts();
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
                if (!connected) this._lwCounts[c.key] = { wait: -1, play: -1 }; // 掉线视为未知
                this._lwRender();
            };
            lobby.onRoomsUpdate = (rooms) => {
                let wait = 0, play = 0;
                (rooms || []).forEach((r) => {
                    if (!r) return;
                    if (c.isRace ? (r.isRace !== true) : (r.isRace === true)) return;
                    if (r.status === 'playing') play++;      // 进行中的对战（蓝圈）
                    else if (r.status !== 'playing') wait++; // 等待中可进入的房间（红圈）
                });
                this._lwCounts[c.key] = { wait, play };
                this._lwRender();
            };
            // 全服喊话：任一探针收到历史列表/新喊话都处理（用 ts 去重，避免 4 路重复渲染）
            lobby.onShoutList = (shouts) => this._lwReceiveShouts(shouts || [], false);
            lobby.onShoutNew = (entry) => this._lwReceiveShouts([entry], true);
            // 在线人数与战局数：服务端广播，任一探针收到即更新（多路用 ts 去重）
            lobby.onOnlineStats = (stats) => this._lwReceiveOnlineStats(stats);
            lobby.onShoutRejected = (data) => {
                const secs = (data && data.retryAfter) || 30;
                if (typeof this.showMessage === 'function') {
                    this.showMessage('喊话太频繁，请 ' + secs + ' 秒后再试', 'warning');
                }
            };
            // 强制登录：探针连接可能建立于登录之前（未带 token），服务端拒绝联机动作时
            // 必须引导登录并重连探针，否则会静默失败（用户只看到"没反应"）
            lobby.onAuthRequired = (action) => this._lwHandleAuthRequired(action);
            this._lwProbes[c.key] = lobby;
        });
        // 统一连接（连接成功后自动 fetch 并每 2.5s 刷新）
        Object.keys(this._lwProbes).forEach((k) => this._lwProbes[k].connect());
        // 连接建立后拉取一次全服喊话历史（任一探针返回即可）
        const anyProbe = this._lwProbes[LW_CELLS[0].key];
        if (anyProbe && typeof anyProbe.fetchShouts === 'function') {
            let tries = 0;
            const t = setInterval(() => {
                tries++;
                if (anyProbe.isConnected && anyProbe.ws && anyProbe.ws.readyState === WebSocket.OPEN) {
                    clearInterval(t);
                    anyProbe.fetchShouts();
                    return;
                }
                // 20s 内仍未连上（离线 / 未登录未建立连接）则放弃，避免定时器常驻
                if (tries > 40) clearInterval(t);
            }, 500);
        }
    };

    // 服务端回 auth_required：说明当前连接未携带有效登录态
    // - 本机已登录（登录发生在连接建立之后）→ 重连探针，让握手带上最新 token
    // - 本机未登录 → 引导登录，登录成功后重连探针
    UIController.prototype._lwHandleAuthRequired = function (action) {
        const loggedIn = (typeof AuthService !== 'undefined' && AuthService.isLoggedIn)
            ? AuthService.isLoggedIn() : false;
        if (loggedIn) { this._lwReconnectProbes(); return; }
        if (typeof AuthPanel !== 'undefined' && AuthPanel.requireLogin) {
            AuthPanel.requireLogin(() => {
                this._lwReconnectProbes();
                if (typeof this.showMessage === 'function') {
                    this.showMessage(action === 'shout' ? '已登录，请重新发送喊话' : '已登录，请重新操作', 'success');
                }
            });
        } else if (typeof this.showMessage === 'function') {
            this.showMessage('联机功能需要先登录账号', 'warning');
        }
    };

    // 重连全部探针：MatchLobbyController.connect() 会比对 token 变化并断开旧连接重连，
    // 确保服务端按最新登录身份识别（登录 / 登出 / 换号后都必须调用）
    UIController.prototype._lwReconnectProbes = function () {
        Object.keys(this._lwProbes || {}).forEach((k) => {
            const p = this._lwProbes[k];
            try { if (p && typeof p.connect === 'function') p.connect(); } catch (e) { /* 忽略 */ }
        });
    };

    // ─── 全服喊话 ──────────────────────────────────────────────
    // 接收历史列表或新喊话（isNew=true 视为新消息，收起时计数提醒）
    UIController.prototype._lwReceiveShouts = function (list, isNew) {
        if (!Array.isArray(list) || !list.length) return;
        const seen = {};
        (this._lwShouts || []).forEach((s) => { seen[s.ts] = true; });
        let added = false;
        list.forEach((s) => {
            if (!s || !s.text || seen[s.ts]) return;
            seen[s.ts] = true;
            this._lwShouts.push({ playerId: s.playerId || '', nickname: s.nickname || '匿名', text: String(s.text), ts: s.ts || 0 });
            added = true;
        });
        if (!added) return;
        // 只保留最近 20 条
        if (this._lwShouts.length > 20) this._lwShouts = this._lwShouts.slice(-20);
        this._lwShouts.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        // 新消息（而非历史回灌）→ 未读数 +1，收起时触发提示
        if (isNew) {
            this._lwShoutUnread = (this._lwShoutUnread || 0) + list.length;
            this._lwNotifyShout();
        }
        this._lwRenderShouts();
        this._lwRender();
    };

    // 渲染喊话 feed（最多显示最近 4 条）与未读徽标
    UIController.prototype._lwRenderShouts = function () {
        if (!this._lwEls) return;
        const els = this._lwEls;
        const feed = els.shoutFeed;
        if (feed) {
            feed.innerHTML = '';
            this._lwShouts.slice(-4).forEach((s) => {
                const row = document.createElement('div');
                row.className = 'lw-shout-item';
                const nick = document.createElement('span');
                nick.className = 'lw-shout-nick';
                nick.textContent = this._lwSafeNick(s.nickname);
                const txt = document.createElement('span');
                txt.className = 'lw-shout-text';
                txt.textContent = s.text;
                row.appendChild(nick);
                row.appendChild(txt);
                feed.appendChild(row);
            });
            // 空态提示
            if (!this._lwShouts.length) {
                feed.innerHTML = '<div class="lw-shout-empty">暂无喊话</div>';
            }
        }
        // 未读徽标（展开时清空）
        if (els.shoutBadge) {
            const unread = this._lwShoutUnread || 0;
            if (unread > 0 && els.root.style.display !== 'none') {
                els.shoutBadge.textContent = unread > 99 ? '99+' : String(unread);
                els.shoutBadge.style.display = '';
            } else {
                els.shoutBadge.style.display = 'none';
            }
        }
    };

    // 发送全服喊话
    UIController.prototype._lwSendShout = function () {
        const els = this._lwEls;
        const input = els && els.shoutInput;
        if (!input) return;
        const text = input.value.trim().slice(0, 30);
        if (!text) return;
        // 强制登录：未登录不发送（探针连接可能建立于登录之前，服务端会回 auth_required）
        // 注意：此处不清空输入、不进冷却，登录成功后用户可原样重发
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn && !AuthService.isLoggedIn()) {
            if (typeof AuthPanel !== 'undefined' && AuthPanel.requireLogin) {
                AuthPanel.requireLogin(() => {
                    this._lwReconnectProbes();
                    if (typeof this.showMessage === 'function') this.showMessage('已登录，请重新发送喊话', 'success');
                });
            } else if (typeof this.showMessage === 'function') {
                this.showMessage('喊话需要先登录账号', 'warning');
            }
            return;
        }
        if (this._lwShoutCooldown) {
            if (typeof this.showMessage === 'function') this.showMessage('喊话太频繁，请稍后再试', 'warning');
            return;
        }
        const anyProbe = this._lwProbes[LW_CELLS[0].key];
        if (!anyProbe || !anyProbe.isConnected || !anyProbe.ws || anyProbe.ws.readyState !== WebSocket.OPEN) {
            if (typeof this.showMessage === 'function') this.showMessage('大厅未连接，无法喊话', 'error');
            return;
        }
        anyProbe.sendShout(text);
        input.value = '';
        this._lwShoutCooldown = true;
        if (els.shoutSend) els.shoutSend.classList.add('cooldown');
        setTimeout(() => {
            this._lwShoutCooldown = false;
            if (els.shoutSend) els.shoutSend.classList.remove('cooldown');
        }, 30000);
    };

    // 收起（mini）状态下收到新喊话：像"有房间"一样闪烁提示
    UIController.prototype._lwNotifyShout = function () {
        const els = this._lwEls;
        if (!els) return;
        // 展开状态：不额外打扰，仅未读徽标在 _lwRenderShouts 中处理
        if (els.root.style.display !== 'none') return;
        // 收起：迷你胶囊闪烁 + 提示音
        els.mini.classList.add('has-shout');
        setTimeout(() => els.mini.classList.remove('has-shout'), 2000);
        if (window.audioManager) { try { window.audioManager.playSuccess(); } catch (e) {} }
        this._lwRenderShouts();
    };

    // 昵称安全显示（防止注入）
    UIController.prototype._lwSafeNick = function (s) {
        const t = String(s || '匿名');
        return t.length > 6 ? t.slice(0, 6) + '…' : t;
    };

    // ─── 渲染 ───────────────────────────────────────────────────
    UIController.prototype._lwRender = function () {
        if (!this._lwEls) return;
        const els = this._lwEls;
        let totalWait = 0, totalPlay = 0;
        LW_CELLS.forEach((c) => {
            const n = this._lwCounts[c.key] || { wait: -1, play: -1 };
            const cell = els.cells[c.key];
            const waitBadge = els.badges[c.key].wait;
            const playBadge = els.badges[c.key].play;
            const wait = n.wait;
            const play = n.play;
            // 红圈：等待中可进入的房间
            if (wait > 0) {
                waitBadge.textContent = wait > 99 ? '99+' : String(wait);
                waitBadge.style.display = '';
                totalWait += wait;
            } else {
                waitBadge.style.display = 'none';
            }
            // 蓝圈：正在进行的对战
            if (play > 0) {
                playBadge.textContent = play > 99 ? '99+' : String(play);
                playBadge.style.display = '';
                totalPlay += play;
            } else {
                playBadge.style.display = 'none';
            }
            // 未知状态（探针未连接）：格子降灰
            cell.classList.toggle('lw-unknown', wait < 0);
            cell.classList.toggle('has-rooms', wait > 0);
            cell.classList.toggle('has-battles', play > 0);
        });
        const anyRooms = totalWait > 0;
        const anyBattles = totalPlay > 0;
        els.root.classList.toggle('has-rooms', anyRooms);
        els.root.classList.toggle('has-battles', anyBattles);
        els.mini.classList.toggle('has-rooms', anyRooms);
        els.mini.classList.toggle('has-battles', anyBattles);
        els.miniBadge.textContent = totalWait > 99 ? '99+' : String(totalWait);
        els.miniBadge.style.display = anyRooms ? '' : 'none';
        // 迷你胶囊蓝点：有进行中战局时显示（与红点可并存）
        if (!els.miniPlayBadge) {
            els.miniPlayBadge = document.createElement('span');
            els.miniPlayBadge.className = 'lw-mini-badge lw-mini-badge-play';
            els.mini.appendChild(els.miniPlayBadge);
        }
        els.miniPlayBadge.textContent = totalPlay > 99 ? '99+' : String(totalPlay);
        els.miniPlayBadge.style.display = anyBattles ? '' : 'none';
        this._lwRenderOnline();
    };

    // 在线人数渲染：展开态标题栏 + 收起态迷你胶囊都必须可见
    UIController.prototype._lwRenderOnline = function () {
        if (!this._lwEls) return;
        const n = (typeof this._lwOnline === 'number' && this._lwOnline >= 0) ? this._lwOnline : null;
        const txt = n == null ? '--' : (n > 999 ? '999+' : String(n));
        if (this._lwEls.online) this._lwEls.online.textContent = txt;
        if (this._lwEls.miniOnline) this._lwEls.miniOnline.textContent = '在线 ' + txt;
    };

    // 收到服务端在线统计（每 5s 广播；多探针用 ts 去重，只认最新）
    UIController.prototype._lwReceiveOnlineStats = function (stats) {
        if (!stats || typeof stats !== 'object') return;
        const ts = Number(stats.ts) || 0;
        if (ts && this._lwOnlineTs && ts <= this._lwOnlineTs) { this._lwRenderOnline(); return; }
        if (ts) this._lwOnlineTs = ts;
        this._lwOnline = Number(stats.online) || 0;
        this._lwOnlineDetail = stats;
        this._lwRenderOnline();
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
        // 注意：对局已结算（_p2pEloSettled）或房间已解散时不算"进行中"。
        // 对局结束会立即断开 P2P 但保留 isP2PMode/_p2pMatchStarted 直到返回主页，
        // 若不加这两个条件，玩家在结算弹窗期间点浮窗会被误弹「退出即判负」确认框。
        if (this.isP2PMode && this._p2pMatchStarted && !this._p2pEloSettled && !this._p2pRoomDissolved) {
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
        if (!cell) return;
        // 强制登录：未登录不允许进入联机大厅（浮窗直达是唯一绕过路径，这里补上守卫）
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn && !AuthService.isLoggedIn()) {
            if (typeof AuthPanel !== 'undefined' && AuthPanel.requireLogin) {
                AuthPanel.requireLogin(() => { this._lwGo(cell); });
            } else if (typeof this.showMessage === 'function') {
                this.showMessage('联机对战需要先登录账号', 'warning');
            }
            return;
        }
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
