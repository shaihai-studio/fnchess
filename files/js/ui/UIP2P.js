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
        // 观战开关默认开启（房主默认允许观战，进入大厅建房时可取消勾选）
        if (this._spectateEnabled === undefined) this._spectateEnabled = true;
        // 房主有活跃等待房间时保留既有连接（PeerJS 建房等待不能断），只重绑回调
        const hasActiveHostRoom = this._lobby && this._lobby.myRoomCode &&
            this.p2pController && this.p2pController.isHost && !this.p2pController.isConnected;
        if (!hasActiveHostRoom) this._cleanupP2P?.();
        if (!this.p2pController) this.p2pController = new P2PController();
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
        // 进入联机模式即打开匹配大厅连接（切到大厅页签时通常已连好，无需等待）
        if (typeof this._openLobby === 'function') this._openLobby();
        // 打开联机模式弹提示：切勿消极比赛，中途退出扣 ELO（每个会话只提醒一次，且非对局中）
        if (!this._p2pWarningShown) {
            this._p2pWarningShown = true;
            const wm = document.getElementById('p2p-warning-modal');
            if (wm) {
                this.showModal(wm);
                const wc = document.getElementById('p2p-warning-confirm-btn');
                if (wc) {
                    const close = () => { if (window.audioManager) window.audioManager.playClick(); this.hideModal(wm); };
                    wc.addEventListener('click', close, { once: true });
                    this.bindModalDismiss(wm, close);
                }
            }
        }
    }
;

// _setupP2PCallbacks
    UIController.prototype._setupP2PCallbacks = function() {
        const p2p = this.p2pController;
        if (!p2p) return;
        // 每次进入联机界面重置对局状态（开场 VS / 中途退出结算标志）
        this._p2pMatchStarted = false;
        this._p2pEloSettled = false;
        this._p2pOpponentProfile = null;
        // 状态变化回调
        p2p.onStatusChange = (status, message) => {
            this._updateP2PStatus(status, message);
        };
        // 连接成功回调
        p2p.onConnected = () => {
            this._updateP2PStatus('connected', '对手已连接！');
            this.showMessage('对手已加入，游戏开始！');
            // 若从匹配大厅创建的房间，开局后通知服务器：
            //  - 开启观战（默认）→ 房间保留在大厅，观众可直接加入
            //  - 关闭观战 → 房间从大厅移除
            if (this._lobby && this._lobby.myRoomCode) {
                this._p2pRoomCode = this._lobby.myRoomCode;
                // 默认开启观战：仅当建房时显式取消勾选才关闭
                this._spectateEnabled = this._spectateEnabled !== false;
                this._lobby.notifyStarted(this._p2pRoomCode, this._spectateEnabled);
                // 显示"对战中"状态条（含观战开关），房主对局中可随时切换
                this._showHostGameBanner(this._p2pRoomCode);
            }
            // 隐藏所有模态框：P2P房间 + 开始界面
            const p2pModal = document.getElementById('p2p-room-modal');
            if (p2pModal) this.hideModal(p2pModal);
            this.hideStartModal();
            this.startP2PGame(); // 内含房主 initGame + sendGameInit（首局与 Rematch 统一路径）
        };
        // 收到游戏初始化（访客端）
        p2p.onGameInit = (config) => {
            this.gameController.setP2PController(p2p);
            // 排行榜：记录房主身份，并把自己的身份回传给房主（房主在 gameEnd 时上报 ELO）
            if (config && config.playerId) {
                this._p2pOpponentProfile = { playerId: String(config.playerId), nickname: config.nickname || '棋手' };
            }
            if (!p2p.isHost && typeof PlayerProfile !== 'undefined') {
                const profile = PlayerProfile.getProfile();
                p2p.send({ type: 'player_info', payload: { playerId: profile.playerId, nickname: profile.nickname } });
            }
            // 应用对手共享的时间限制模式
            if (config?.timeLimitMode && this.gameController) {
                this.gameController.timeLimitMode = config.timeLimitMode;
            }
            this.gameController.initGame(config.rounds || 8, config.difficulty || 'normal', 'p2p');
            this._p2pMatchStarted = true;
            this.showMessage('收到对手游戏配置，开始对战！');
            // 排行榜：开场 VS 动画（访客侧）
            this._startP2PVSIntro();
        };
        // 排行榜：房主收到访客回传的身份
        p2p.onPlayerInfo = (info) => {
            if (info && info.playerId) {
                this._p2pOpponentProfile = { playerId: String(info.playerId), nickname: info.nickname || '棋手' };
            }
            // 排行榜：开场 VS 动画（房主侧，等访客身份回传后再播放）
            this._startP2PVSIntro();
        };
        // 计时同步：非操作方仅显示对手驱动的倒计时
        p2p.onTimerSync = (remainingTime) => {
            if (!this.gameController || !this.p2pController) return;
            // 本方为操作方时，以本地倒计时为准，忽略对手的同步包
            if (this.gameController.currentPlayer === this.p2pController.myPlayerId) return;
            // 双驱动竞态保护：本地已有活动计时器（两端短暂判定不一致）时以本地为准，避免倒计时忽快忽慢
            if (this.gameController.timerInterval) return;
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
            // 排行榜：对局中途对手退出 → 判对手弃权（本局获胜）+ 弹窗；非对局中断线弹普通弹窗
            this._reportP2PForfeit(false);
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
            // 收到对方动作（阶段推进）→ 健康监测重置计时，视为对方在线
            this._p2pPeerActivityReset();
            if (this.gameController.onP2PGameAction) {
                return this.gameController.onP2PGameAction(action, payload);
            }
            return false;
        };
        // 全量状态镜像：接收对手的实时快照并直接重绘
        p2p.onStateSync = (state) => {
            console.log('[UI][P2P] 收到 state_sync');
            // 收到对方推进（快照）→ 健康监测重置计时，视为对方在线
            this._p2pPeerActivityReset();
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
        // 周期验证：向对手报告当前状态指纹（version/round/player/phase）。
        // P2PController 据此检测对方是否与本方同步：
        //  - 对方未初始化或 gen 落后 → Host 重发 game_init（直到收到确认，防开局卡死）
        //  - 对方状态版本落后/领先 → 主动补发或请求全量快照（防同步消息丢失导致的卡死）
        p2p.onGetVerifyState = () => {
            if (!this.isP2PMode || !this.gameController) return null;
            const gc = this.gameController;
            if (gc.gameMode !== 'p2p' || typeof gc.getSyncFingerprint !== 'function') return null;
            return gc.getSyncFingerprint();
        };
        // 健康探测回执：对方进程/连接仍在 → 停止补救循环并重新计时
        p2p.onHealthCheckAck = () => {
            this._p2pHealthChecking = false;
            this._p2pHealthRetryCount = 0;
            this._p2pWaitStartAt = Date.now();
        };
        // 阶段确认重发：P2PController 定时触发，用最新状态携带原确认 key 重发，
        // 直到对方回 state_sync_ack（保证阶段切换关键快照必达）
        p2p.onSyncConfirmResend = (key) => {
            this._syncToPeer(key);
        };
        // 等待对方回执提示：任何同步机制（action ack / 阶段确认 / game_init /
        // 全量快照请求 / health_check）在等待对方回复时，显示"连接不稳定，正在等待"常驻提示
        p2p.onAwaitChange = (awaiting) => this._p2pSetAwaitBanner(awaiting);
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
        // 返回按钮：房主有活跃房间时先弹二次确认
        const backBtn = $('p2p-back-btn');
        if (backBtn) {
            backBtn.onclick = () => this._p2pCloseRoomModal();
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
        // 对局进行中暂停大厅列表自动刷新，省流量（连接本身保留）
        if (this._lobby) this._lobby.pauseRefresh();
        this.gameController.setP2PController(p2p);
        // 注入全量同步钩子：本地状态变更（setPhase/选格/锁定）由 GameController 回调触发，
        // 必须强制绕过节流立即推送 —— 尤其"切换操作方"的关键阶段快照（如 input_function）
        // 若被 _syncToPeer 的 50ms 节流吞掉，且推送方随即变被动方（周期推送停止），
        // 对手将永远收不到该快照而卡死在旧阶段（双方死锁）。
        // confirm 参数：setPhase（阶段切换）传 true → 生成确认 key，要求对方回执并重发。
        this.gameController._syncHook = (confirm) => this._p2pSyncNow(confirm);
        this._applyingRemote = false;
        this._lastSyncTime = 0;
        // 周期同步：每 0.2s 由当前玩家方（操作方）主动推送一次完整快照
        this._startP2PPeriodicSync();
        // 健康监测：被动方等待对方回合超时（倒计时卡住 / 3s 未选格）→ 探测 + 多次补救 + 提示
        this._startP2PHealthMonitor();
        // 观战同步：开启观战且本端为房主（大厅登记的房主）时，每 500ms 经 Lobby WS 推送快照给观众
        this._startSpectateSync();
        // 房主在这里初始化游戏（访客在 onGameInit 中初始化），并发送游戏初始化给访客。
        // 首局与 Rematch 复用同一路径：sendGameInit 每次递增 _gen，
        // 保证 Rematch 后新旧对局消息能正确过滤（BUG-15）。
        if (p2p.isHost) {
            const rounds = this._getP2PRounds();
            const difficulty = this._getP2PDifficulty();
            const timeLimitMode = this._getP2PTimeLimitMode();
            if (this.gameController) this.gameController.timeLimitMode = timeLimitMode;
            this.gameController.initGame(rounds, difficulty, 'p2p');
            this._p2pMatchStarted = true;
            // 排行榜：房主把自己的身份随 game_init 发给访客，供访客回传身份（ELO 上报需要）
            let hostProfile = null;
            if (typeof PlayerProfile !== 'undefined') hostProfile = PlayerProfile.getProfile();
            p2p.sendGameInit({
                rounds, difficulty, timeLimitMode,
                playerId: hostProfile ? hostProfile.playerId : '',
                nickname: hostProfile ? hostProfile.nickname : ''
            });
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
        // 排行榜：对局中途被清理（未正常结算）→ 视为本方中途退出，判负上报 + 弹窗
        this._reportP2PForfeit(true);
        // 清理开场 VS 动画残留
        if (this._p2pVSTimer) { clearTimeout(this._p2pVSTimer); this._p2pVSTimer = null; }
        const vsOverlay = document.getElementById('p2p-vs-overlay');
        if (vsOverlay) vsOverlay.style.display = 'none';
        // 清理周期同步定时器，避免残留后台发送
        this._stopP2PPeriodicSync();
        // 清理健康监测定时器
        this._stopP2PHealthMonitor();
        // 清理观战同步定时器
        this._stopSpectateSync();
        // 对局中退出：告知服务器关闭观战（踢掉观众），房间随大厅连接断开自动清理。
        // 随后 _closeLobby 在 myRoomCode 为空（开局后已清空）时会真正断开大厅连接。
        if (this._lobby && this._p2pRoomCode) {
            this._lobby.setSpectateEnabled(this._p2pRoomCode, false);
            this._p2pRoomCode = null;
        }
        // 隐藏"连接不稳定，正在等待"提示条
        if (typeof this._p2pSetAwaitBanner === 'function') this._p2pSetAwaitBanner(false);
        // 房主有活跃等待房间（尚未开局）时，保留 PeerJS 建房连接、大厅 WS 与顶部状态条
        // （房间持续存活；有对手加入仍会自动切入对战）。
        const keepHostWaiting = this._lobby && this._lobby.myRoomCode &&
            this.p2pController && this.p2pController.isHost && !this.p2pController.isConnected;
        if (!keepHostWaiting && typeof this._stopHostRoomBanner === 'function') {
            this._stopHostRoomBanner();
        }
        // 清理创建房间时轮询房间码的定时器，避免重开弹窗后叠加残留轮询
        if (this._p2pCheckCodeInterval) {
            clearInterval(this._p2pCheckCodeInterval);
            this._p2pCheckCodeInterval = null;
        }
        if (this.p2pController && !keepHostWaiting) {
            this.p2pController.disconnect();
            this.p2pController = null;
        }
        this.isP2PMode = false;
        // 离开联机模式：关闭匹配大厅连接。
        // _closeLobby 在房主有活跃房间时只暂停列表刷新（WS 常驻，房间继续存活），
        // 无活跃房间时才真正断开（断开后服务器侧会自动清理本连接登记的房间）
        if (typeof this._closeLobby === 'function') this._closeLobby();
        // 清理 P2P 对局残留的历史函数与格子，防止切换到其他模式时仍显示旧图像
        if (this.gridSystem) {
            this.gridSystem.functionHistory = [];
            this.gridSystem.usedCells = [];
        }
        this._lastRemoteExpr = null;
        // 清理 confirm key 合并窗口，避免断线/重连后旧 key 残留误用
        this._lastConfirmKey = null;
        this._lastConfirmTime = 0;
        if (this.gameController && typeof this.gameController.bumpStateVersion === 'function') {
            this.gameController._syncHook = null;
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
    UIController.prototype._showP2PDisconnectModal = function(opponentLeft) {
        // opponentLeft: true=对手中途退出(本局获胜) / false=自己中途退出(判负) / null=普通断线
        const titleEl = document.getElementById('p2p-disc-title');
        const detailEl = document.getElementById('p2p-disc-detail');
        if (titleEl && detailEl) {
            if (opponentLeft === true) {
                titleEl.textContent = '对手中途退出';
                detailEl.textContent = '对手已中途退出，本局判你获胜，对手将扣除 ELO 积分。';
            } else if (opponentLeft === false) {
                titleEl.textContent = '中途退出';
                detailEl.textContent = '你已中途退出，本局判负，将扣除 ELO 积分。';
            } else {
                titleEl.textContent = '对手已断开连接';
                detailEl.textContent = '联机对局已中断';
            }
        }
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.showModal(disc);
    }
;

// _reportP2PForfeit
    UIController.prototype._reportP2PForfeit = function(isForfeitSelf) {
        // 非对局中（建房等待/加入等待阶段）断线 → 弹普通断线弹窗即可
        if (!this.isP2PMode || !this._p2pMatchStarted || this._p2pEloSettled) {
            this._showP2PDisconnectModal(null);
            return;
        }
        if (typeof PlayerProfile === 'undefined') return;
        const p2p = this.p2pController;
        const opp = this._p2pOpponentProfile;
        if (!p2p || !opp || !opp.playerId) return;
        if (!this._leaderboardService) return;
        const profile = PlayerProfile.getProfile();
        const roomKey = (p2p.roomCode || 'room') + '#' + (p2p._gen || 0);
        // isForfeitSelf=true：本方弃权判负（对手胜）；false：对手弃权（本方胜）
        this._leaderboardService.submitScore({
            boardType: 'elo',
            playerId: profile.playerId,
            nickname: profile.nickname,
            opponentPlayerId: opp.playerId,
            opponentNickname: opp.nickname || '棋手',
            scoreA: isForfeitSelf ? 0 : 1,
            scoreB: isForfeitSelf ? 1 : 0,
            winner: isForfeitSelf ? 'B' : 'A',
            roomCode: roomKey
        });
        this._p2pEloSettled = true;
        this._showP2PDisconnectModal(!isForfeitSelf);
    }
;

// _startP2PVSIntro
    UIController.prototype._startP2PVSIntro = function() {
        if (typeof PlayerProfile === 'undefined') return;
        if (!this._leaderboardService) return;
        const opp = this._p2pOpponentProfile;
        if (!opp || !opp.playerId) return;
        const myId = PlayerProfile.getPlayerId();
        const self = this;
        // 异步查询双方 ELO（服务器不可用时 ELO 显示为 —，动画照常播放）
        this._leaderboardService.queryPlayerElo([myId, opp.playerId], (data) => {
            if (self._p2pEloSettled || !self.isP2PMode) return; // 已结束则不再播放
            const map = (data && data.players) || {};
            const my = map[myId] || {};
            const op = map[opp.playerId] || {};
            self._showP2PVSIntro(
                PlayerProfile.getNickname(),
                Number.isFinite(my.elo) ? my.elo : null,
                opp.nickname || '棋手',
                Number.isFinite(op.elo) ? op.elo : null
            );
        });
    }
;

// _showP2PVSIntro
    UIController.prototype._showP2PVSIntro = function(myNick, myElo, oppNick, oppElo) {
        const overlay = document.getElementById('p2p-vs-overlay');
        if (!overlay) return;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        set('p2p-vs-my-nick', myNick);
        set('p2p-vs-my-elo', 'ELO ' + (myElo != null ? myElo : '—'));
        set('p2p-vs-opp-nick', oppNick);
        set('p2p-vs-opp-elo', 'ELO ' + (oppElo != null ? oppElo : '—'));
        overlay.style.display = 'flex';
        const numEl = document.getElementById('p2p-vs-number');
        const subEl = document.getElementById('p2p-vs-sub');
        const playTick = (n) => {
            if (!window.audioManager) return;
            if (n === 3) window.audioManager.playRaceCountdown?.();
            else if (n === 2) window.audioManager.playRaceBeep?.();
            else if (n === 1) window.audioManager.playRaceAlert?.();
            else window.audioManager.playRaceLaunch?.();
        };
        const self = this;
        let count = 3;
        const pop = () => {
            if (numEl) {
                numEl.textContent = String(count);
                numEl.classList.remove('pop');
                void numEl.offsetWidth; // 重新触发动画
                numEl.classList.add('pop');
            }
            playTick(count);
        };
        pop();
        const finish = () => {
            if (subEl) subEl.textContent = '开始！';
            playTick(0);
            setTimeout(() => { overlay.style.display = 'none'; }, 700);
        };
        const tick = () => {
            count--;
            if (count > 0) { pop(); self._p2pVSTimer = setTimeout(tick, 850); }
            else finish();
        };
        if (this._p2pVSTimer) clearTimeout(this._p2pVSTimer);
        this._p2pVSTimer = setTimeout(tick, 850);
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
    // 在事件驱动同步基础上，增加周期同步兜底：仅「当前玩家方」（操作方）主动推送完整状态快照，
    // 被动方只接收。事件驱动（选格/输入/锁定/阶段切换）已实时强制推送，周期推送只是兜底。
    // 频率 0.8s（放宽以减少 WebRTC 拥塞风险；操作方事件驱动仍实时，不影响同步即时性）。
    UIController.prototype._startP2PPeriodicSync = function() {
        this._stopP2PPeriodicSync();
        this._p2pSyncInterval = setInterval(() => {
            if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
            // 仅当前玩家方（操作方）主动推送
            if (!this.gameController ||
                this.gameController.currentPlayer !== this.p2pController.myPlayerId) return;
            this._syncToPeer();
        }, 800);
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

// _startSpectateSync
    // 观战同步：仅「大厅登记的房主 + 开启观战 + 大厅连接在线」时生效，
    // 每 500ms 将 buildSyncSnapshot() 经 Lobby WS 推给服务器，由其广播给观众。
    // 复用 WebRTC 的 P2P 快照构建逻辑，观众端无需任何 WebRTC 连接。
    UIController.prototype._startSpectateSync = function() {
        this._stopSpectateSync();
        if (!this._spectateEnabled || !this._p2pRoomCode) return;
        this._spectateSyncTimer = setInterval(() => {
            if (!this.isP2PMode) return;
            const lobby = this._lobby;
            if (!lobby || !lobby.isConnected || !this._spectateEnabled) return;
            try {
                lobby.sendSpectateSync(this.buildSyncSnapshot());
            } catch (e) { /* 快照构建失败时静默跳过本次推送 */ }
        }, 500);
    }
;

// _stopSpectateSync
    UIController.prototype._stopSpectateSync = function() {
        if (this._spectateSyncTimer) {
            clearInterval(this._spectateSyncTimer);
            this._spectateSyncTimer = null;
        }
    }
;

// _toggleSpectate
    // 房主对局中切换观战开关：开启 → 恢复大厅展示；关闭 → 立即隐藏房间并踢掉观众
    UIController.prototype._toggleSpectate = function(enabled) {
        this._spectateEnabled = !!enabled;
        const lobby = this._lobby;
        if (lobby && this._p2pRoomCode) {
            lobby.setSpectateEnabled(this._p2pRoomCode, this._spectateEnabled);
        }
        this._startSpectateSync();
        this._updateSpectateBar();
    }
;

// _updateSpectateBar
    // 对局中房主顶部的观战开关指示（lobby-host-banner 内嵌）
    UIController.prototype._updateSpectateBar = function() {
        const bar = document.getElementById('lobby-host-banner');
        const toggle = document.getElementById('lobby-spectate-toggle');
        const label = document.getElementById('lobby-spectate-label');
        if (!bar) return;
        if (!this._spectateEnabled) {
            if (toggle) toggle.checked = false;
            if (label) label.textContent = '观战关闭';
            bar.classList.remove('lobby-host-banner-playing');
        } else {
            if (toggle) toggle.checked = true;
            if (label) label.textContent = '观战开启';
            bar.classList.add('lobby-host-banner-playing');
        }
    }
;

// _startP2PHealthMonitor
// 被动方健康监测：每 0.5s 检查一次。当「对方回合」期间 5s 内无推进
        // （倒计时未刷新 = 未收到 timer_sync；进入对方回合超 5s = 未收到选格/推进）时，
        // 强制发起健康探测（health_check + request_sync 补救）；对方 2s 未回执则
        // 提醒「连接较差，请耐心等待」，并持续多次补救直到对方回应或连接断开。
        // 阈值放宽：操作方（选目标格/想函数）正常思考可能 3-5s，避免误报"连接不稳定"。
        UIController.prototype._startP2PHealthMonitor = function() {
        this._stopP2PHealthMonitor();
        this._p2pHealthChecking = false;
        this._p2pHealthRetryCount = 0;
        this._p2pWaitStartAt = null;
        this._p2pLastTimerVal = null;
        this._p2pStallWarnedAt = 0;
        this._p2pHealthTimer = setInterval(() => this._tickP2PHealth(), 500);
    }
;

// _stopP2PHealthMonitor
    UIController.prototype._stopP2PHealthMonitor = function() {
        if (this._p2pHealthTimer) {
            clearInterval(this._p2pHealthTimer);
            this._p2pHealthTimer = null;
        }
        this._p2pHealthChecking = false;
        this._p2pHealthRetryCount = 0;
        this._p2pWaitStartAt = null;
        this._p2pLastTimerVal = null;
    }
;

// _tickP2PHealth
    UIController.prototype._tickP2PHealth = function() {
        const p2p = this.p2pController;
        if (!p2p || !p2p.isConnected || !this.isP2PMode) return;
        const gc = this.gameController;
        if (!gc) return;
        const now = Date.now();
        // 我方操作：无需监测对方
        if (gc.currentPlayer === p2p.myPlayerId) {
            this._p2pWaitStartAt = null;
            this._p2pHealthChecking = false;
            this._p2pHealthRetryCount = 0;
            return;
        }
        // 对方回合：记录进入等待的起点
        if (this._p2pWaitStartAt == null) this._p2pWaitStartAt = now;
        // 倒计时刷新（timer_sync 持续到达）= 对方有推进，重置计时
        if (this._p2pLastTimerVal === null || gc.remainingTime !== this._p2pLastTimerVal) {
            this._p2pLastTimerVal = gc.remainingTime;
            this._p2pWaitStartAt = now;
            this._p2pHealthChecking = false;
            return;
        }
        // 等待超时（进入对方回合 5s 无推进 / 倒计时 5s 卡住）→ 强制检查一次
        if (!this._p2pHealthChecking && now - this._p2pWaitStartAt > 5000) {
            this._p2pHealthChecking = true;
            this._p2pHealthRetryCount = 0;
            this._fireP2PHealthCheck();
            return;
        }
        // 检查中且 2s 无回应 → 再次发动补救，并节流提醒用户
        if (this._p2pHealthChecking && now - this._p2pHealthCheckAt > 2000) {
            this._p2pHealthRetryCount++;
            this._fireP2PHealthCheck();
            if (now - this._p2pStallWarnedAt > 10000) {
                this._p2pStallWarnedAt = now;
                console.warn('[P2P] 对方无回应，连接较差，进入补救循环');
                this.showMessage('连接较差，请耐心等待', 'warning');
            }
        }
    }
;

// _fireP2PHealthCheck
    // 强制检查：首次只发轻量健康探测（对方回 ack 即视为在线，不打扰不刷消息）；
    // 仅当确认对方 2s 无回应（补救阶段）才发 request_sync 请求全量快照恢复同步。
    // 避免在 SELECT_TARGET 等无计时阶段的正常等待中持续 request_sync 造成消息风暴
    // （全量快照体积随回合增长，风暴会引发丢包→版本落后→更多请求的恶性循环）。
    UIController.prototype._fireP2PHealthCheck = function() {
        const p2p = this.p2pController;
        if (!p2p || !p2p.isConnected) return;
        this._p2pHealthCheckAt = Date.now();
        // 轻量健康探测：要求对方立即回执（确认连接/进程是否仍在）
        if (p2p.sendHealthCheck) p2p.sendHealthCheck();
        // 补救阶段：前 2 次无回执仍只发轻量探测（轻微网络波动不应触发全量快照风暴），
        // 连续 ≥3 次无回执才请求全量快照帮助恢复同步。
        if (this._p2pHealthRetryCount >= 2) {
            console.warn(`[P2P] 对方持续无回应，第 ${this._p2pHealthRetryCount} 次补救，请求全量重同步`);
            if (p2p.sendSyncRequest) p2p.sendSyncRequest();
        } else if (this._p2pHealthRetryCount > 0) {
            console.warn(`[P2P] 对方暂未回执，第 ${this._p2pHealthRetryCount} 次轻量探测`);
        }
    }
;

// _p2pPeerActivityReset
    // 收到对方推进（state_sync / action / health_check_ack）时重置健康监测计时
    UIController.prototype._p2pPeerActivityReset = function() {
        if (this._p2pHealthChecking || this._p2pWaitStartAt != null) {
            this._p2pHealthChecking = false;
            this._p2pWaitStartAt = Date.now();
        }
    }
;

// _p2pSetAwaitBanner
    // 任何同步机制（action ack / 阶段确认 / game_init / 全量快照请求 / health_check）
    // 在等待对方回复期间显示常驻提示"连接不稳定，正在等待对方回复…"；收到回执后隐藏。
    UIController.prototype._p2pSetAwaitBanner = function(awaiting) {
        const banner = document.getElementById('p2p-await-banner');
        if (!banner) return;
        if (awaiting) {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }
;

