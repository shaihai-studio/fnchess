// Auto-split from UIController.js — prototype-attached methods (UIP2P)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIP2P] UIController must be loaded before this file');
}

// showP2PRoomModal
    UIController.prototype.showP2PRoomModal = function() {
        if (typeof P2PController === 'undefined') {
            this.showMessage('P2P模块未加载', 'error');
            return;
        }
        // 退出可能残留的关卡编辑器 UI
        if (this.levelEditor) this.levelEditor.deactivate();
        this._cleanupP2P?.();
        this.p2pController = new P2PController();
        this._setupP2PCallbacks();
        const $ = id => document.getElementById(id);
        const cb = $('p2p-create-btn'); if (cb) cb.disabled = false;
        const jb = $('p2p-join-btn'); if (jb) jb.disabled = false;
        const d = $('p2p-room-code-display'); if (d) d.style.display = 'none';
        const inp = $('p2p-room-input'); if (inp) inp.value = '';
        this._updateP2PStatus('idle', '准备就绪');
        this._initP2PSelectors();
        this._bindP2PStepperButtons();
        this.showModal(document.getElementById('p2p-room-modal'));
        this._bindP2PRoomEvents();
        this._bindLobbyEvents();
    }
;

// _setupP2PCallbacks
    UIController.prototype._setupP2PCallbacks = function() {
        const p2p = this.p2pController;
        if (!p2p) return;
        // 状态变化回调
        p2p.onStatusChange = (status, message) => {
            this._updateP2PStatus(status, message);
        };
        // 连接成功回调
        p2p.onConnected = () => {
            this._updateP2PStatus('connected', '对手已连接！');
            this.showMessage('对手已加入，游戏开始！');
            // 若从匹配大厅创建的房间，开局后通知服务器从列表移除
            if (this._lobby && this._lobby.myRoomCode) {
                this._lobby.notifyStarted();
            }
            // 隐藏所有模态框：P2P房间 + 开始界面
            const p2pModal = document.getElementById('p2p-room-modal');
            if (p2pModal) this.hideModal(p2pModal);
            this.hideStartModal();
            this.startP2PGame();
            // 房主发送游戏初始化给访客
            if (p2p.isHost && this.gameController) {
                const rounds = this._getP2PRounds();
                const difficulty = this._getP2PDifficulty();
                const timeLimitMode = this._getP2PTimeLimitMode();
                p2p.sendGameInit({ rounds, difficulty, timeLimitMode });
            }
        };
        // 收到游戏初始化（访客端）
        p2p.onGameInit = (config) => {
            this.gameController.setP2PController(p2p);
            // 应用对手共享的时间限制模式
            if (config?.timeLimitMode && this.gameController) {
                this.gameController.timeLimitMode = config.timeLimitMode;
            }
            this.gameController.initGame(config.rounds || 8, config.difficulty || 'normal', 'p2p');
            this.showMessage('收到对手游戏配置，开始对战！');
        };
        // 计时同步：非操作方仅显示对手驱动的倒计时
        p2p.onTimerSync = (remainingTime) => {
            if (!this.gameController || !this.p2pController) return;
            // 本方为操作方时，以本地倒计时为准，忽略对手的同步包
            if (this.gameController.currentPlayer === this.p2pController.myPlayerId) return;
            this.gameController.remainingTime = remainingTime;
            if (window.audioManager && remainingTime > 0 && remainingTime <= 5) {
                window.audioManager.playTick();
            }
            this.updateTimer(remainingTime);
        };
        // 对手超时提示
        p2p.onTimeout = (player) => {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage(`${this.getPlayerDisplayName(player)}超时！扣1分`, 'error');
        };
        // 断开连接回调
        p2p.onDisconnected = () => {
            console.log('[UI][P2P] onDisconnected 触发');
            this._updateP2PStatus('disconnected', '对手已断开连接');
            this._showP2PDisconnectModal();
        };
        // 错误回调
        p2p.onError = (err) => {
            console.error('[UI][P2P] onError:', err);
            this._updateP2PStatus('error', '连接错误：' + (err.message || err));
            this.showMessage('P2P连接错误：' + (err.message || err), 'error');
            // 房主通过大厅创建失败/超时 → 取消大厅房间登记，恢复按钮
            if (p2p.isHost && this._lobby && this._lobby.myRoomCode) {
                this._lobbyCancelHost();
            }
            // 访客通过大厅加入失败 → 释放房间锁，恢复大厅可重新加入
            if (!p2p.isHost && this._joiningRoomCode) {
                if (this._lobby) this._lobby.cancelJoin(this._joiningRoomCode);
                this._joiningRoomCode = null;
                this._updateLobbyStatus('error', '加入失败：无法连接到房主，请刷新后重试');
            }
            // 失败后恢复创建/加入按钮，避免永久卡死（需手动关闭弹窗才能重试）
            const cb = document.getElementById('p2p-create-btn'); if (cb) cb.disabled = false;
            const jb = document.getElementById('p2p-join-btn'); if (jb) jb.disabled = false;
        };
        // 游戏数据接收
        p2p.onGameAction = (action, payload) => {
            console.log(`[UI][P2P] 收到动作 action=${action}, payload=`, payload);
            if (this.gameController.onP2PGameAction) {
                return this.gameController.onP2PGameAction(action, payload);
            }
            return false;
        };
        // 全量状态镜像：接收对手的实时快照并直接重绘
        p2p.onStateSync = (state) => {
            console.log('[UI][P2P] 收到 state_sync');
            this.applySyncSnapshot(state);
        };
        // 对方拒绝动作（nack）：提示并请求整局状态重同步（P20）
        p2p.onNack = (action, rollback, reason) => {
            this.showMessage('对手拒绝了操作，正在同步状态...', 'error');
            if (typeof rollback === 'function') {
                try { rollback(); } catch (e) { /* 回滚失败时静默处理，避免影响同步流程 */ }
            }
            // 请求对手发送最新完整快照，以恢复一致状态
            if (p2p.sendSyncRequest) p2p.sendSyncRequest();
        };
        // 对手请求重同步：发送当前完整状态快照
        p2p.onSyncRequest = () => {
            this._syncToPeer();
        };
        // 对方请求再战：保持 P2P 连接与 host/guest 角色，直接重置对局
        // （翻转 isHost 但不重建连接会导致 myPlayerId 与 isHost 不一致，故不再翻转）
        p2p.onRematch = () => {
            this.showMessage('对手请求再战，准备新对局...');
            this.startP2PGame();
        };
    }
;

// _bindP2PRoomEvents
    UIController.prototype._bindP2PRoomEvents = function() {
        const $ = id => document.getElementById(id);
        // 创建房间
        const createBtn = $('p2p-create-btn');
        if (createBtn) {
            createBtn.onclick = () => {
                createBtn.disabled = true;
                this._updateP2PStatus('creating', '正在创建房间...');
                this.p2pController?.createRoom();
                // 延迟读取 roomCode
                const checkCode = setInterval(() => {
                    const code = this.p2pController?.roomCode;
                    if (code) {
                        clearInterval(checkCode);
                        this._p2pCheckCodeInterval = null;
                        const d = $('p2p-room-code-display');
                        const t = $('p2p-room-code-text');
                        if (d) d.style.display = 'flex';
                        if (t) t.textContent = code;
                        this._updateP2PStatus('waiting', '等待对手加入...');
                    }
                }, 200);
                this._p2pCheckCodeInterval = checkCode;
                setTimeout(() => {
                    clearInterval(checkCode);
                    if (this._p2pCheckCodeInterval === checkCode) this._p2pCheckCodeInterval = null;
                }, 15000);
            };
        }
        // 加入房间
        const joinBtn = $('p2p-join-btn');
        if (joinBtn) {
            joinBtn.onclick = () => {
                const code = $('p2p-room-input')?.value?.trim();
                if (!code || code.length !== 6) {
                    this.showMessage('请输入6位数字房间码', 'error');
                    return;
                }
                joinBtn.disabled = true;
                this._updateP2PStatus('joining', '正在加入房间...');
                this.p2pController?.joinRoom(code);
            };
        }
        // 复制房间码
        const copyBtn = $('p2p-copy-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const code = $('p2p-room-code-text')?.textContent;
                if (code && code !== '------') {
                    navigator.clipboard.writeText(code).then(() => {
                        this.showMessage('房间码已复制');
                    }).catch(() => {
                        this.showMessage('复制失败，请手动复制', 'error');
                    });
                }
            };
        }
        // 标签页切换（onclick 覆盖式，避免重复打开弹窗时监听器叠加）
        const bindTab = (tabId, contentId, showLeft) => {
            const tab = $(tabId), content = $(contentId);
            if (!tab || !content) return;
            tab.onclick = () => {
                document.querySelectorAll('.p2p-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.p2p-tab-content').forEach(c => c.style.display = 'none');
                tab.classList.add('active');
                content.style.display = 'block';
                // 切换「加入房间」时隐藏左侧三选项（建房参数不适用），创建房间/匹配大厅恢复
                const leftCol = document.querySelector('.p2p-selectors-left');
                if (leftCol) leftCol.style.display = showLeft ? 'flex' : 'none';
                // 切换到匹配大厅时自动连接并刷新
                if (tabId === 'p2p-tab-lobby') this._openLobby();
            };
        };
        bindTab('p2p-tab-create', 'p2p-tab-create-content', true);
        bindTab('p2p-tab-join', 'p2p-tab-join-content', false);
        bindTab('p2p-tab-lobby', 'p2p-tab-lobby-content', true);
        // 返回按钮
        const backBtn = $('p2p-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.hideModal(document.getElementById('p2p-room-modal'));
                this._cleanupP2P();
            };
        }
    }
;

// _updateP2PStatus
    UIController.prototype._updateP2PStatus = function(state, message) {
        const status = document.getElementById('p2p-status');
        if (!status) return;
        const dot = status.querySelector('.p2p-status-dot');
        const text = status.querySelector('.p2p-status-text');
        if (dot) {
            dot.className = 'p2p-status-dot ' + state;
        }
        if (text) text.textContent = message;
    }
;

// startP2PGame
    UIController.prototype.startP2PGame = function() {
        const p2p = this.p2pController;
        if (!p2p) return;
        // 退出可能残留的关卡编辑器 UI
        if (this.levelEditor) this.levelEditor.deactivate();
        this._markGameActive();
        this.isP2PMode = true;
        this.gameController.setP2PController(p2p);
        // 注入全量同步钩子：本地状态变更时由 GameController 回调，向对手发送完整快照
        this.gameController._syncHook = () => this._syncToPeer();
        this._applyingRemote = false;
        this._lastSyncTime = 0;
        // 周期同步：每 0.2s 由当前玩家方（操作方）主动推送一次完整快照
        this._startP2PPeriodicSync();
        // 房主在这里初始化游戏（访客在 onGameInit 中初始化）
        if (p2p.isHost) {
            const rounds = this._getP2PRounds();
            const difficulty = this._getP2PDifficulty();
            const timeLimitMode = this._getP2PTimeLimitMode();
            if (this.gameController) this.gameController.timeLimitMode = timeLimitMode;
            this.gameController.initGame(rounds, difficulty, 'p2p');
        }
    }
;

// _initP2PSelectors
    UIController.prototype._initP2PSelectors = function() {
        // 取一次 stepper 元素引用（懒加载，DOM 在 showP2PRoomModal 时已存在）
        this.p2pRoundStepper = document.getElementById('p2p-round-stepper');
        this.p2pRoundValue = document.getElementById('p2p-round-value');
        this.p2pDifficultyStepper = document.getElementById('p2p-difficulty-stepper');
        this.p2pDifficultyValue = document.getElementById('p2p-difficulty-value');
        this.p2pTimeLimitStepper = document.getElementById('p2p-time-limit-stepper');
        this.p2pTimeLimitValue = document.getElementById('p2p-time-limit-value');
        if (!this.p2pRoundValue) return;
        // P2P 三选项与主界面完全独立：初值取 P2P 自己的持久化记录（无记录则 8回合/简单/普通）
        const saved = this._loadP2PSelectors();
        this.p2pCurrentRoundIndex = saved.round;
        this.p2pCurrentDifficultyIndex = saved.difficulty;
        this.p2pCurrentTimeLimitIndex = saved.time;
        if (!this.roundOptions || !this.roundOptions.length) return;
        if (this.p2pCurrentRoundIndex < 0 || this.p2pCurrentRoundIndex >= this.roundOptions.length) this.p2pCurrentRoundIndex = 0;
        if (this.p2pCurrentDifficultyIndex < 0 || this.p2pCurrentDifficultyIndex >= this.difficultyOptions.length) this.p2pCurrentDifficultyIndex = 0;
        if (this.p2pCurrentTimeLimitIndex < 0 || this.p2pCurrentTimeLimitIndex >= this.timeLimitOptions.length) this.p2pCurrentTimeLimitIndex = 2;
        this._refreshP2PStepperDisplay();
    }
;

// _loadP2PSelectors / _saveP2PSelectors — P2P 三选项独立持久化，主界面 stepper 变化不影响 P2P
    UIController.prototype._loadP2PSelectors = function() {
        const def = { round: 0, difficulty: 0, time: 2 };
        try {
            const raw = localStorage.getItem('function_chess_p2p_selectors');
            if (!raw) return def;
            const s = JSON.parse(raw);
            return {
                round: Number.isFinite(s && s.round) ? s.round : def.round,
                difficulty: Number.isFinite(s && s.difficulty) ? s.difficulty : def.difficulty,
                time: Number.isFinite(s && s.time) ? s.time : def.time
            };
        } catch (e) {
            return def;
        }
    }
;

    UIController.prototype._saveP2PSelectors = function() {
        try {
            localStorage.setItem('function_chess_p2p_selectors', JSON.stringify({
                round: this.p2pCurrentRoundIndex ?? 0,
                difficulty: this.p2pCurrentDifficultyIndex ?? 0,
                time: this.p2pCurrentTimeLimitIndex ?? 2
            }));
        } catch (e) { /* localStorage 不可用时静默忽略 */ }
    }
;

// _refreshP2PStepperDisplay
    UIController.prototype._refreshP2PStepperDisplay = function() {
        if (!this.p2pRoundValue) return;
        const theme = {
            round: {
                8:  { bg: 'rgba(96, 165, 250, 0.14)', fg: '#7a9bb5', shadow: 'rgba(96,165,250,0.18)' },
                12: { bg: 'rgba(52, 211, 153, 0.14)', fg: '#6b9f8e', shadow: 'rgba(52,211,153,0.18)' },
                16: { bg: 'rgba(251, 191, 36, 0.14)', fg: '#b8944a', shadow: 'rgba(251,191,36,0.18)' },
                20: { bg: 'rgba(249, 115, 22, 0.14)', fg: '#b87a4e', shadow: 'rgba(249,115,22,0.18)' },
                24: { bg: 'rgba(244, 63, 94, 0.14)', fg: '#b06e6e', shadow: 'rgba(244,63,94,0.18)' }
            },
            difficulty: {
                easy:    { bg: 'rgba(34, 197, 94, 0.14)', fg: '#6b9f6e', shadow: 'rgba(34,197,94,0.18)' },
                fraction:{ bg: 'rgba(20, 184, 166, 0.14)', fg: '#14b8a6', shadow: 'rgba(20,184,166,0.25)' },
                normal:  { bg: 'rgba(59, 130, 246, 0.14)', fg: '#6b84a8', shadow: 'rgba(59,130,246,0.18)' },
                expert:  { bg: 'rgba(245, 158, 11, 0.14)', fg: '#b8944a', shadow: 'rgba(245,158,11,0.18)' },
                test:    { bg: 'rgba(168, 85, 247, 0.14)', fg: '#8b7bb0', shadow: 'rgba(168,85,247,0.18)' }
            },
            time: {
                super_slow: { bg: 'rgba(253, 186, 116, 0.14)', fg: '#d4a373', shadow: 'rgba(253,186,116,0.18)' },
                slow:       { bg: 'rgba(250, 204, 21, 0.14)',  fg: '#c9a227', shadow: 'rgba(250,204,21,0.18)' },
                normal:     { bg: 'rgba(59, 130, 246, 0.14)',  fg: '#6b84a8', shadow: 'rgba(59,130,246,0.18)' },
                fast:       { bg: 'rgba(34, 197, 94, 0.14)',   fg: '#6b9f6e', shadow: 'rgba(34,197,94,0.18)' },
                super_fast: { bg: 'rgba(168, 85, 247, 0.14)',  fg: '#8b7bb0', shadow: 'rgba(168,85,247,0.18)' }
            }
        };

        const applyArrowTheme = (idPrev, idNext, valueEl, t) => {
            const prev = document.getElementById(idPrev);
            const next = document.getElementById(idNext);
            [prev, next].forEach(btn => {
                if (!btn) return;
                btn.style.background = t.bg;
                btn.style.color = t.fg;
                btn.style.boxShadow = `0 0 14px ${t.shadow}`;
            });
            if (valueEl) {
                valueEl.style.transition = 'transform 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease';
                valueEl.style.color = t.fg;
                valueEl.style.borderColor = t.fg;
                valueEl.style.boxShadow = `0 0 18px ${t.shadow}`;
            }
        };

        const roundOpt = this.roundOptions[this.p2pCurrentRoundIndex];
        if (roundOpt) {
            this.p2pRoundValue.textContent = roundOpt.label;
            this.p2pRoundValue.dataset.value = String(roundOpt.value);
            const t = theme.round[roundOpt.value] || theme.round[8];
            applyArrowTheme('p2p-round-prev', 'p2p-round-next', this.p2pRoundValue, t);
        }
        const diffOpt = this.difficultyOptions[this.p2pCurrentDifficultyIndex];
        if (diffOpt) {
            this.p2pDifficultyValue.textContent = diffOpt.label;
            this.p2pDifficultyValue.dataset.value = diffOpt.value;
            const t = theme.difficulty[diffOpt.value] || theme.difficulty.easy;
            applyArrowTheme('p2p-difficulty-prev', 'p2p-difficulty-next', this.p2pDifficultyValue, t);
        }
        const timeOpt = this.timeLimitOptions[this.p2pCurrentTimeLimitIndex];
        if (timeOpt) {
            this.p2pTimeLimitValue.textContent = timeOpt.label;
            this.p2pTimeLimitValue.dataset.value = timeOpt.value;
            const t = theme.time[timeOpt.value] || theme.time.normal;
            applyArrowTheme('p2p-time-limit-prev', 'p2p-time-limit-next', this.p2pTimeLimitValue, t);
        }
    }
;

// _bindP2PStepperButtons
    UIController.prototype._bindP2PStepperButtons = function() {
        // 覆盖式绑定：避免每次打开弹窗时 addEventListener 累加，导致一次点击跳多个档位
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };
        bind('p2p-round-prev', () => this._stepP2PRound(-1));
        bind('p2p-round-next', () => this._stepP2PRound(1));
        bind('p2p-difficulty-prev', () => this._stepP2PDifficulty(-1));
        bind('p2p-difficulty-next', () => this._stepP2PDifficulty(1));
        bind('p2p-time-limit-prev', () => this._stepP2PTimeLimit(-1));
        bind('p2p-time-limit-next', () => this._stepP2PTimeLimit(1));
    }
;

// _stepP2PRound
    UIController.prototype._stepP2PRound = function(direction) {
        if (!this.roundOptions || !this.roundOptions.length) return;
        const len = this.roundOptions.length;
        const next = ((this.p2pCurrentRoundIndex ?? 0) + direction + len) % len;
        this.p2pCurrentRoundIndex = next;
        this._saveP2PSelectors();
        this._refreshP2PStepperDisplay();
        this._playP2PStepperFeedback('round');
    }
;

// _stepP2PDifficulty
    UIController.prototype._stepP2PDifficulty = function(direction) {
        if (!this.difficultyOptions || !this.difficultyOptions.length) return;
        const len = this.difficultyOptions.length;
        const next = ((this.p2pCurrentDifficultyIndex ?? 0) + direction + len) % len;
        this.p2pCurrentDifficultyIndex = next;
        this._saveP2PSelectors();
        this._refreshP2PStepperDisplay();
        this._playP2PStepperFeedback('difficulty');
    }
;

// _stepP2PTimeLimit
    UIController.prototype._stepP2PTimeLimit = function(direction) {
        if (!this.timeLimitOptions || !this.timeLimitOptions.length) return;
        const len = this.timeLimitOptions.length;
        const next = ((this.p2pCurrentTimeLimitIndex ?? 2) + direction + len) % len;
        this.p2pCurrentTimeLimitIndex = next;
        this._saveP2PSelectors();
        this._refreshP2PStepperDisplay();
        this._playP2PStepperFeedback('time-limit');
    }
;

// _playP2PStepperFeedback
    UIController.prototype._playP2PStepperFeedback = function(kind) {
        if (window.audioManager) window.audioManager.playRaceAlert?.();
        const hostMap = { round: this.p2pRoundStepper, difficulty: this.p2pDifficultyStepper, 'time-limit': this.p2pTimeLimitStepper };
        const host = hostMap[kind];
        if (!host) return;
        host.classList.remove('selector-change');
        void host.offsetWidth;
        host.classList.add('selector-change');
        clearTimeout(this._p2pSelectorChangeTimeout);
        this._p2pSelectorChangeTimeout = setTimeout(() => host.classList.remove('selector-change'), 220);
    }
;

// _getP2PRounds
    UIController.prototype._getP2PRounds = function() {
        const opt = this.roundOptions?.[this.p2pCurrentRoundIndex ?? 0];
        return opt ? Number(opt.value) || 8 : 8;
    }
;

// _getP2PDifficulty
    UIController.prototype._getP2PDifficulty = function() {
        const opt = this.difficultyOptions?.[this.p2pCurrentDifficultyIndex ?? 0];
        return opt ? opt.value : 'normal';
    }
;

// _getP2PTimeLimitMode
    UIController.prototype._getP2PTimeLimitMode = function() {
        const opt = this.timeLimitOptions?.[this.p2pCurrentTimeLimitIndex ?? 2];
        return opt ? opt.value : 'normal';
    }
;

// _cleanupP2P
    UIController.prototype._cleanupP2P = function() {
        // 清理周期同步定时器，避免残留后台发送
        this._stopP2PPeriodicSync();
        // 清理创建房间时轮询房间码的定时器，避免重开弹窗后叠加残留轮询
        if (this._p2pCheckCodeInterval) {
            clearInterval(this._p2pCheckCodeInterval);
            this._p2pCheckCodeInterval = null;
        }
        this.p2pController?.disconnect();
        this.p2pController = null;
        this.isP2PMode = false;
        // 断开匹配大厅连接（含自动重连清理）
        if (typeof this._closeLobby === 'function') this._closeLobby();
        // 清理 P2P 对局残留的历史函数与格子，防止切换到其他模式时仍显示旧图像
        if (this.gridSystem) {
            this.gridSystem.functionHistory = [];
            this.gridSystem.usedCells = [];
        }
        this._lastRemoteExpr = null;
        if (this.gameController && typeof this.gameController.bumpStateVersion === 'function') {
            this.gameController._syncHook = null;
        }
    }
;

// _p2pSendConfirmed
    UIController.prototype._p2pSendConfirmed = function(action, payload) {
        if (this.isP2PMode && this.p2pController && this.p2pController.isConnected) {
            this.p2pController.sendGameAction(action, payload);
        }
    }
;

// _bindP2PDisconnectButtons
    UIController.prototype._bindP2PDisconnectButtons = function() {
        const menu = document.getElementById('p2p-disc-menu-btn');
        if (menu) menu.onclick = () => this.playUIButtonSound(() => this._p2pReturnToMenu());
    }
;

// _showP2PDisconnectModal
    UIController.prototype._showP2PDisconnectModal = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.showModal(disc);
    }
;

// _p2pReturnToMenu
    UIController.prototype._p2pReturnToMenu = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.hideModal(disc);
        if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
        this.handleRestart();
    }
;

// _startP2PPeriodicSync
    // 在事件驱动同步基础上，增加每 0.2s 的周期同步：
    // 仅「当前玩家方」（操作方）主动推送完整状态快照，被动方只接收，
    // 保证对手能实时看到操作方的输入/选点/锁定等过程状态。
    // 配合 state_sync 的版本号机制，旧快照会被接收方自动丢弃，不会乱序覆盖。
    UIController.prototype._startP2PPeriodicSync = function() {
        this._stopP2PPeriodicSync();
        this._p2pSyncInterval = setInterval(() => {
            if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
            // 仅当前玩家方（操作方）主动推送
            if (!this.gameController ||
                this.gameController.currentPlayer !== this.p2pController.myPlayerId) return;
            this._syncToPeer();
        }, 200);
    }
;

// _stopP2PPeriodicSync
    UIController.prototype._stopP2PPeriodicSync = function() {
        if (this._p2pSyncInterval) {
            clearInterval(this._p2pSyncInterval);
            this._p2pSyncInterval = null;
        }
    }
;

