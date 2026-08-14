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
        // 进入联机模式：先弹"选择对战模式"（排位/休闲），选完再进联机主界面。
        // 休闲模式玩家在匹配大厅看不到排位房间（反之亦然），由服务器按 mode 过滤。
        const sel = document.getElementById('p2p-mode-select-modal');
        if (sel) {
            // 该弹窗被竞速联机入口复用，恢复为 P2P 的 ELO 文案（竞速入口会动态改成段位）
            const _t = sel.querySelector('h2');
            const _d = sel.querySelector('.p2p-mode-select-desc');
            const _rSub = sel.querySelector('#p2p-mode-select-ranked .p2p-mode-select-sub');
            const _cSub = sel.querySelector('#p2p-mode-select-casual .p2p-mode-select-sub');
            if (_t) _t.textContent = '选择对战模式';
            if (_d) _d.textContent = '排位模式计入 ELO 积分并参与排行榜；休闲模式不计算任何 ELO。';
            if (_rSub) _rSub.textContent = '计 ELO · 可上排行榜';
            if (_cSub) _cSub.textContent = '不计 ELO · 娱乐对局';
            // ESC 关闭模式选择弹窗（返回主界面）
            sel._dismissBound = true;
            sel._onEscDismiss = () => this.hideModal(sel);
            const pick = (mode) => {
                this._p2pMatchMode = mode;
                this.hideModal(sel);
                this._proceedP2PRoomModal();
            };
            const btnR = document.getElementById('p2p-mode-select-ranked');
            const btnC = document.getElementById('p2p-mode-select-casual');
            if (btnR) btnR.onclick = () => { if (window.audioManager) window.audioManager.playClick(); pick('ranked'); };
            if (btnC) btnC.onclick = () => { if (window.audioManager) window.audioManager.playClick(); pick('casual'); };
            const btnBack = document.getElementById('p2p-mode-select-back');
            if (btnBack) btnBack.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
                this.hideModal(sel);
            };
            this.showModal(sel);
            return;
        }
        this._proceedP2PRoomModal();
    }
;

// _proceedP2PRoomModal
    UIController.prototype._proceedP2PRoomModal = function() {
        if (typeof P2PController === 'undefined') return;
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
        const del = $('p2p-delete-btn'); if (del) del.style.display = 'none';
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
        // 打开联机模式弹提示：切勿消极比赛，中途退出扣 ELO（仅排位模式；每个会话只提醒一次，且非对局中）
        if (this._getP2PMode() === 'ranked' && !this._p2pWarningShown) {
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
        // 对局模式：'ranked'=排位（计 ELO，默认）｜'casual'=休闲（不计算任何 ELO）
        this._p2pMatchStarted = false;
        this._p2pEloSettled = false;
        this._p2pRoomDissolved = false;
        this._p2pOpponentProfile = null;
        this._p2pResuming = false; // 每次进入联机界面复位恢复标志，避免上次失败恢复污染新局
        this._p2pQuitPending = false; // P1：访客主动退出时已发送 quit、待延迟断开连接（给消息留发送窗口）
        if (!this._p2pMatchMode) this._p2pMatchMode = 'ranked'; // 默认排位
        // 对战方/观众收到"房主已解散该房间"（大厅模式经 lobby WS；房间码模式靠 Peer 断开兜底）
        if (this._lobby) {
            this._lobby.onRoomDissolved = (data) => this._onRoomDissolved(data);
        }
        // 状态变化回调
        p2p.onStatusChange = (status, message) => {
            this._updateP2PStatus(status, message);
        };
        // 连接成功回调
        p2p.onConnected = () => {
            console.warn(`[UI][P2P] onConnected 触发：isHost=${p2p.isHost}, _reconnecting=${p2p._reconnecting}（若为重连后触发将走 startP2PGame 重新开局）`);
            this._updateP2PStatus('connected', `${this._p2pOpponentProfile?.nickname || '对手'}已连接！`);
            this.showMessage(`${this._p2pOpponentProfile?.nickname || '对手'}已加入，游戏开始！`);
            // 若从匹配大厅创建的房间，开局后通知服务器：
            //  - 开启观战（默认）→ 房间保留在大厅，观众可直接加入
            //  - 关闭观战 → 房间从大厅移除
            if (this._lobby && this._lobby.myRoomCode) {
                this._p2pRoomCode = this._lobby.myRoomCode;
                // 默认开启观战：仅当建房时显式取消勾选才关闭
                this._spectateEnabled = this._spectateEnabled !== false;
                this._lobby.notifyStarted(this._p2pRoomCode, this._spectateEnabled);
                // notifyStarted 已清空 myRoomCode → 刷新"删除房间"按钮（开局后该按钮使命完成，应隐藏）
                if (typeof this._refreshHostDeleteBtn === 'function') this._refreshHostDeleteBtn();
                // 显示"对战中"状态条（含观战开关），房主对局中可随时切换
                this._showHostGameBanner(this._p2pRoomCode);
            }
            // 隐藏所有模态框：P2P房间 + 开始界面
            const p2pModal = document.getElementById('p2p-room-modal');
            if (p2pModal) this.hideModal(p2pModal);
            this.hideStartModal();
            this.startP2PGame(); // 内含房主 initGame + sendGameInit（首局与 Rematch 统一路径）
            // 访客大退后重开页面恢复：本地已无任何对局状态，房主走重连恢复链路不会重发 game_init，
            // 因此此处不等 game_init，直接以存储的 gen 请求房主推送完整快照续局。
            if (this._p2pResuming && !p2p.isHost) {
                this._p2pResuming = false;
                this._p2pMatchStarted = true;
                const _rc = this._loadP2PResumeContext();
                if (_rc && _rc.opponent) this._p2pOpponentProfile = _rc.opponent;
                this.showMessage('已重连，正在恢复对局状态…');
                console.warn('[UI][P2P] 访客大退恢复：本地 _gen=' + (this.p2pController && this.p2pController._gen) + '，请求房主快照');
                if (this.p2pController && typeof this.p2pController.sendSyncRequest === 'function') {
                    this.p2pController.sendSyncRequest();
                }
            }
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
            // 对局模式（休闲/排位）：以房主选择的为准；休闲模式关闭断线重连等待
            if (config && (config.mode === 'ranked' || config.mode === 'casual')) {
                this._p2pMatchMode = config.mode;
            }
            if (p2p) p2p.reconnectEnabled = (this._p2pMatchMode === 'ranked');
            console.log(`[UI][P2P] onGameInit：mode=${this._p2pMatchMode}, reconnectEnabled=${p2p.reconnectEnabled}, isHost=${p2p.isHost}, isP2PMode=${this.isP2PMode}`);
            // 应用对手共享的时间限制模式
            if (config?.timeLimitMode && this.gameController) {
                this.gameController.timeLimitMode = config.timeLimitMode;
            }
            this.gameController.initGame(config.rounds || 8, config.difficulty || 'normal', 'p2p');
            this._p2pMatchStarted = true;
            // 持久化断线恢复上下文（仅访客需要；房主始终在线等待，无需恢复）
            this._saveP2PResumeContext({
                roomCode: p2p.roomCode,
                mode: this._p2pMatchMode,
                opponent: this._p2pOpponentProfile || null,
                gen: p2p._gen
            });
            this.showMessage(`收到${this._p2pOpponentProfile?.nickname || '对手'}的游戏配置，开始对战！`);
            // 排行榜：开场 VS 动画（访客侧）
            this._startP2PVSIntro();
        };
        // 排行榜：房主收到访客回传的身份
        p2p.onPlayerInfo = (info) => {
            if (info && info.playerId) {
                this._p2pOpponentProfile = { playerId: String(info.playerId), nickname: info.nickname || '棋手' };
            }
            // 顶部信息栏玩家名随对手身份刷新（房主侧此时才知道访客昵称）
            this.updateHeaderPlayerNames();
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
        p2p.onDisconnected = (reason) => {
            const _p = this.p2pController;
            console.warn(`[UI][P2P] onDisconnected 触发：reason=${reason || '(无)'}, isHost=${_p ? _p.isHost : '-'}, matchMode=${this._p2pMatchMode}, matchStarted=${this._p2pMatchStarted}, eloSettled=${this._p2pEloSettled}, roomDissolved=${this._p2pRoomDissolved}, isP2PMode=${this.isP2PMode}, reconnectEnabled=${_p ? _p.reconnectEnabled : '-'}, _reconnecting=${_p ? _p._reconnecting : '-'}`);
            // 模式不匹配被房主拒绝（hello_reject）→ 提示后回到房间弹窗，不弹断线结算弹窗
            if (_p && _p._modeRejected) {
                _p._modeRejected = false;
                this._updateP2PStatus('error', '该房间为排位/休闲房，与你的选择不符');
                const p2pModal = document.getElementById('p2p-room-modal');
                if (p2pModal && p2pModal.style.display === 'none') this.showModal(p2pModal);
                const jb = document.getElementById('p2p-join-btn'); if (jb) jb.disabled = false;
                return;
            }
            this._updateP2PStatus('disconnected', `${this._p2pOpponentProfile?.nickname || '对手'}已断开连接`);
            // 休闲模式：不计算 ELO。已收到房主解散通知（_onRoomDissolved 已弹"房主已解散房间"）则不重复；
            // 访客在对局中 Peer 断开（房主退出为最常见原因）→ 显示"房主已解散房间"；其余弹普通断开提示
            if (this._p2pMatchMode === 'casual') {
                if (this._p2pRoomDissolved) return;
                this._p2pRoomDissolved = true; // 置位防重：保证 _onRoomDissolved 后续到达时不再重复弹窗（P4）
                const isGuestInMatch = this.p2pController && !this.p2pController.isHost && this._p2pMatchStarted;
                this._showP2PDisconnectModal(isGuestInMatch ? true : null);
                return;
            }
            // 我是访客（对端是房主）
            if (!this.p2pController || !this.p2pController.isHost) {
                // 自己掉线后重连失败 → 判本方负（除非已收到房主解散通知）
                if (reason === 'self_reconnect_failed') {
                    if (this._p2pRoomDissolved) { this._showP2PDisconnectModal(true); return; }
                    if (this.isP2PMode && this._p2pMatchStarted && !this._p2pEloSettled) {
                        this._reportP2PForfeit(true);
                    }
                    return;
                }
                // 房主退出/解散 → 排位模式访客结算为获胜得分（与房主判负完全对称）；
                // 休闲模式仍本局作废、不结算 ELO
                if (this._p2pRoomDissolved) return; // 已收到解散通知，结算/弹窗已显示，避免重复
                if (this.isP2PMode && this._p2pMatchStarted && !this._p2pEloSettled) {
                    this._p2pRoomDissolved = true;
                    if (this._p2pMatchMode === 'ranked') {
                        if (!this._reportP2PForfeitOpponent()) {
                            this._showP2PDisconnectModal(true); // 上报失败兜底：对手退，本局判我获胜
                        }
                    } else {
                        this._showP2PDisconnectModal(true); // 休闲模式：对手退，本局不结算 ELO（不上报）
                    }
                } else {
                    this._showP2PDisconnectModal(null); // 非对局中 → 普通断线弹窗
                }
                return;
            }
            // 我是房主（对端是访客）：
            // - reason='self_reconnect_failed'（本方信令丢失重连失败，P2 对称修复）→ 判房主自己负
            // - reason='opponent_lost'/无 reason（访客中途退出/访客重连超时）→ 判访客弃权（本局获胜）
            // 非对局中断线（建房等待/加入等待）→ 弹普通断线弹窗
            if (reason === 'self_reconnect_failed') {
                if (this.isP2PMode && this._p2pMatchStarted && !this._p2pEloSettled) {
                    this._reportP2PForfeit(true);
                } else {
                    this._showP2PDisconnectModal(null);
                }
                return;
            }
            if (!this._reportP2PForfeit(false)) {
                this._showP2PDisconnectModal(null);
            }
        };
        // 访客掉线重连：房主等待（倒计时弹窗）/ 访客自动重连提示
        p2p.onReconnectingChange = (isReconnecting) => this._onP2PReconnectingChange(isReconnecting);
        p2p.onReconnected = () => this._onP2PReconnected();
        // 对方主动退出（quit 消息，非断线）：立即结算，房主不进入 60s 重连等待
        p2p.onOpponentQuit = () => this._onOpponentQuit();
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
            const del = document.getElementById('p2p-delete-btn'); if (del) del.style.display = 'none';
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
            // 收到对方推进（快照）→ 恢复兜底计时结束（访客重连后只要收到任意有效同步即视为恢复成功，P3）
            if (this._p2pRecoveryPending) {
                this._p2pRecoveryPending = false;
                if (this._p2pRecoveryTimer) { clearTimeout(this._p2pRecoveryTimer); this._p2pRecoveryTimer = null; }
            }
            // 收到对方推进（快照）→ 健康监测重置计时，视为对方在线
            this._p2pPeerActivityReset();
            this.applySyncSnapshot(state);
        };
        // 对方拒绝动作（nack）：提示并请求整局状态重同步（P20）
        p2p.onNack = (action, rollback, reason) => {
            this.showMessage(`${this._p2pOpponentProfile?.nickname || '对手'}拒绝了操作，正在同步状态...`, 'error');
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
            this.showMessage(`${this._p2pOpponentProfile?.nickname || '对手'}请求再战，准备新对局...`);
            this.startP2PGame();
        };
        // 对方发来 Summa 表情包：弹出展示（纯图片）
        p2p.onSummaEmoji = (mood) => this._showSummaEmoji(mood, true);
    }
;

// _bindP2PRoomEvents
    UIController.prototype._bindP2PRoomEvents = function() {
        const $ = id => document.getElementById(id);
        // 创建房间
        const createBtn = $('p2p-create-btn');
        if (createBtn) {
            createBtn.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
                createBtn.disabled = true;
                const del = $('p2p-delete-btn'); if (del) del.style.display = '';
                this._updateP2PStatus('creating', '正在创建房间...');
                this.p2pController?.createRoom(this._getP2PMode());
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
                        this._updateP2PStatus('waiting', '等待访客加入...');
                    }
                }, 200);
                this._p2pCheckCodeInterval = checkCode;
                setTimeout(() => {
                    clearInterval(checkCode);
                    if (this._p2pCheckCodeInterval === checkCode) this._p2pCheckCodeInterval = null;
                }, 15000);
            };
        }
        // 删除房间（创建后裂分出现的按钮：销毁建房连接并恢复创建按钮）
        const delBtn = $('p2p-delete-btn');
        if (delBtn) {
            delBtn.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
                // 对局已开始：走完整清理流程（含 ELO 结算），否则静默销毁建房连接
                if (this._p2pMatchStarted) {
                    this._cleanupP2P();
                } else {
                    if (this.p2pController) {
                        try { this.p2pController.disconnect(); } catch (e) {}
                        this.p2pController = null;
                    }
                    if (this._p2pCheckCodeInterval) {
                        clearInterval(this._p2pCheckCodeInterval);
                        this._p2pCheckCodeInterval = null;
                    }
                    const d = $('p2p-room-code-display'); if (d) d.style.display = 'none';
                    this._updateP2PStatus('idle', '房间已删除');
                }
                createBtn.disabled = false;
                delBtn.style.display = 'none';
            };
        }
        // 加入房间
        const joinBtn = $('p2p-join-btn');
        if (joinBtn) {
            joinBtn.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
                const code = $('p2p-room-input')?.value?.trim();
                if (!code || code.length !== 6) {
                    this.showMessage('请输入6位数字房间码', 'error');
                    return;
                }
                joinBtn.disabled = true;
                this._updateP2PStatus('joining', '正在加入房间...');
                // 先向服务器查询房间码类型：若为竞速联机房间（isRace=true），提示模式不对，不发连接
                const doJoin = () => this.p2pController?.joinRoom(code, this._getP2PMode());
                const doLookup = () => {
                    if (!this._lobby || typeof this._lobby.lookupRoom !== 'function') { doJoin(); return; }
                    let settled = false;
                    const fallback = () => { if (!settled) { settled = true; doJoin(); } };
                    this._lobby.onRoomLookupResult = (data) => {
                        if (settled) return;
                        if (String(data.code) !== code) return;
                        settled = true;
                        if (data.found && data.isRace) {
                            joinBtn.disabled = false;
                            this._updateP2PStatus('error', '该房间为竞速联机房间，请到竞速联机中进入');
                            this.showMessage('该房间为竞速联机房间，请到竞速联机中进入', 'error');
                            return;
                        }
                        doJoin();
                    };
                    this._lobby.lookupRoom(code);
                    setTimeout(fallback, 2500); // 查询超时兜底：正常走 PeerJS 连接（原有报错提示）
                };
                if (this._lobby && this._lobby.isConnected) {
                    doLookup();
                } else if (this._lobby) {
                    // 大厅 WS 尚未连好：先确保连接，等连接成功后补发查询（否则消息发不出去）
                    if (typeof this._openLobby === 'function') this._openLobby();
                    const prev = this._lobby.onConnectionChange;
                    let timer = null;
                    const wait = () => {
                        if (this._lobby && this._lobby.isConnected) {
                            if (prev && prev !== this._lobby.onConnectionChange) { /* 忽略：_openLobby 已重绑 */ }
                            if (timer) clearTimeout(timer);
                            doLookup();
                        }
                    };
                    this._lobby.onConnectionChange = (connected) => {
                        if (connected) wait();
                        if (prev) prev(connected);
                    };
                    if (!timer) timer = setTimeout(() => { doJoin(); }, 3000); // 3s 连不上兜底
                } else {
                    doJoin();
                }
            };
        }
        // 复制房间码
        const copyBtn = $('p2p-copy-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
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
                if (window.audioManager) window.audioManager.playClick();
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
            backBtn.onclick = () => {
                if (window.audioManager) window.audioManager.playClick();
                this._p2pCloseRoomModal();
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
        // 错误态边框随状态切换更新（state==='error' 时高亮，其余清除）
        status.classList.toggle('error-state', state === 'error');
    }
;

// startP2PGame
    UIController.prototype.startP2PGame = function() {
        const p2p = this.p2pController;
        if (!p2p) return;
        console.warn(`[UI][P2P] startP2PGame 被调用：isHost=${p2p.isHost}, _reconnecting=${p2p._reconnecting}, _p2pMatchStarted=${this._p2pMatchStarted}（重连成功后若仍触发 → 会 initGame+sendGameInit 重新开局，覆盖快照恢复）`);
        // 退出可能残留的关卡编辑器 UI
        if (this.levelEditor) this.levelEditor.deactivate();
        this._markGameActive();
        this.isP2PMode = true;
        // Summa 表情入口：仅 P2P 对局显示（右下角 确认/返回 按钮左侧）
        this._ensureSummaEmojiUI();
        const emojiFab = document.getElementById('emoji-fab-btn');
        if (emojiFab) emojiFab.style.display = '';
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
            // 对局模式（休闲/排位）：排位计 ELO，休闲不计
            this._p2pMatchMode = this._getP2PMode();
            if (this.gameController) this.gameController.timeLimitMode = timeLimitMode;
            this.gameController.initGame(rounds, difficulty, 'p2p');
            this._p2pMatchStarted = true;
            // 排行榜：房主把自己的身份随 game_init 发给访客，供访客回传身份（ELO 上报需要）
            let hostProfile = null;
            if (typeof PlayerProfile !== 'undefined') hostProfile = PlayerProfile.getProfile();
            p2p.sendGameInit({
                rounds, difficulty, timeLimitMode,
                mode: this._p2pMatchMode,
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
        // 对局模式选项（排位=计 ELO / 休闲=不计 ELO）
        this._p2pModeOptions = [
            { value: 'ranked', label: '排位模式（计 ELO）' },
            { value: 'casual', label: '休闲模式（不计 ELO）' }
        ];
        const saved = this._loadP2PSelectors();
        this.p2pCurrentRoundIndex = saved.round;
        this.p2pCurrentDifficultyIndex = saved.difficulty;
        this.p2pCurrentTimeLimitIndex = saved.time;
        this.p2pCurrentModeIndex = saved.mode === 1 ? 1 : 0;
        if (!this.roundOptions || !this.roundOptions.length) return;
        if (this.p2pCurrentRoundIndex < 0 || this.p2pCurrentRoundIndex >= this.roundOptions.length) this.p2pCurrentRoundIndex = 0;
        if (this.p2pCurrentDifficultyIndex < 0 || this.p2pCurrentDifficultyIndex >= this.difficultyOptions.length) this.p2pCurrentDifficultyIndex = 0;
        if (this.p2pCurrentTimeLimitIndex < 0 || this.p2pCurrentTimeLimitIndex >= this.timeLimitOptions.length) this.p2pCurrentTimeLimitIndex = 2;
        this._refreshP2PStepperDisplay();
    }
;

// _loadP2PSelectors / _saveP2PSelectors — P2P 三选项独立持久化，主界面 stepper 变化不影响 P2P
    UIController.prototype._loadP2PSelectors = function() {
        const def = { round: 0, difficulty: 0, time: 2, mode: 0 };
        try {
            const raw = localStorage.getItem('function_chess_p2p_selectors');
            if (!raw) return def;
            const s = JSON.parse(raw);
            return {
                round: Number.isFinite(s && s.round) ? s.round : def.round,
                difficulty: Number.isFinite(s && s.difficulty) ? s.difficulty : def.difficulty,
                time: Number.isFinite(s && s.time) ? s.time : def.time,
                mode: (s && s.mode === 1) ? 1 : 0
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
                time: this.p2pCurrentTimeLimitIndex ?? 2,
                mode: this.p2pCurrentModeIndex ?? 0
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
            this.p2pRoundValue.textContent = this.getSelectorLabel(roundOpt);
            this.p2pRoundValue.dataset.value = String(roundOpt.value);
            const t = theme.round[roundOpt.value] || theme.round[8];
            applyArrowTheme('p2p-round-prev', 'p2p-round-next', this.p2pRoundValue, t);
        }
        const diffOpt = this.difficultyOptions[this.p2pCurrentDifficultyIndex];
        if (diffOpt) {
            this.p2pDifficultyValue.textContent = this.getSelectorLabel(diffOpt);
            this.p2pDifficultyValue.dataset.value = diffOpt.value;
            const t = theme.difficulty[diffOpt.value] || theme.difficulty.easy;
            applyArrowTheme('p2p-difficulty-prev', 'p2p-difficulty-next', this.p2pDifficultyValue, t);
        }
        const timeOpt = this.timeLimitOptions[this.p2pCurrentTimeLimitIndex];
        if (timeOpt) {
            this.p2pTimeLimitValue.textContent = this.getSelectorLabel(timeOpt);
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

// _getP2PMode
    UIController.prototype._getP2PMode = function() {
        // 对局模式由"选择对战模式"弹窗决定（showP2PRoomModal）；默认排位
        return this._p2pMatchMode === 'casual' ? 'casual' : 'ranked';
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
        // ★ 无论何种退出/断开路径，先停掉对局计时（阶段倒计时 + 选格子倒计时），
        //   否则退出对局后倒计时仍继续跑，最终触发超时/判负弹窗
        if (this.gameController && typeof this.gameController.stopTimer === 'function') {
            this.gameController.stopTimer();
        }
        if (this.gameController && typeof this.gameController.stopTargetTimer === 'function') {
            this.gameController.stopTargetTimer();
        }
    // 对局进行中 + 主动退出（点退出/解散/返回主菜单）→ 立即结算并弹 disconnect-modal
    // - 排位模式：房主解散判负扣 ELO（弹"中途退出"）；访客判负扣 ELO（弹"你已中途退出判负"）
    //   两端对称：房主解散=房主判负，访客收到解散=访客判负、房主获胜
        // - 休闲模式：不计算 ELO，直接清理回主菜单（等同原始联机体验）
        // 排位模式弹窗后让用户先看完 disconnect-modal 上的"返回主菜单"按钮再回主菜单，
        // 避免被 handleExit 后续的 showModal(startModal) 覆盖。
        if (this.isP2PMode && this._p2pMatchStarted && !this._p2pEloSettled && !this._p2pRoomDissolved) {
            if (this._p2pMatchMode === 'ranked') {
                const p2p = this.p2pController;
                if (p2p && p2p.isHost) {
                    // 房主主动解散/退出：判房主负、扣 ELO（与访客掉线判负完全对称）
                    if (this._lobby) this._lobby.notifyRoomDissolve();
                    if (!this._reportP2PForfeit(true)) {
                        // 对手资料缺失等兜底：自己退本局判负（文案同 _reportP2PForfeit 成功路径）
                        this._p2pRoomDissolved = true;
                        this._showP2PDisconnectModal(false);
                    }
                } else {
                    // 访客主动退出：先通过 PeerJS 告知房主"主动退出"（房主据此跳过 60s 重连等待、
                    // 立即结算判本方胜），再判访客负、扣 ELO
                    // P1：quit 消息不能与 disconnect()（内部 peer.destroy()）同一调用栈发出——
                    // WebRTC DataChannel 缓冲中的消息来不及发送连接即被销毁，quit 几乎必然丢失，
                    // 房主收不到主动退出通知而进入 60s 重连等待。这里先标记，由 _cleanupP2P 末尾延迟断开。
                    if (this.p2pController && this.p2pController.isConnected) {
                        try { this.p2pController.send({ type: 'quit', reason: 'active_exit' }); } catch (e) {}
                    }
                    this._p2pQuitPending = true;
                    this._reportP2PForfeit(true);
                }
                this._p2pShowDisconnectReturnToMenu = true; // 告知 handleExit 跳过弹主菜单
            }
            // 休闲模式：不结算 ELO，走下方正常清理
        }
        // 清理断线重连等待/提示弹窗与定时器
        this._hideP2PReconnectWait();
        this._hideP2PReconnectingToast();
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
        // 兜底刷新"删除房间"按钮：房主解散/退出/开局后 myRoomCode 已清空，按钮应隐藏
        if (!keepHostWaiting && typeof this._refreshHostDeleteBtn === 'function') {
            this._refreshHostDeleteBtn();
        }
        // 清理创建房间时轮询房间码的定时器，避免重开弹窗后叠加残留轮询
        if (this._p2pCheckCodeInterval) {
            clearInterval(this._p2pCheckCodeInterval);
            this._p2pCheckCodeInterval = null;
        }
        if (this.p2pController && !keepHostWaiting) {
            if (this._p2pQuitPending) {
                // P1：访客主动退出时，quit 消息需先经 WebRTC 缓冲发出，再真正销毁连接。
                // 延迟 350ms 断开，给消息留出发送窗口，避免与 disconnect() 同栈执行导致丢失。
                const p2p = this.p2pController;
                this._p2pQuitPending = false;
                this.p2pController = null;
                setTimeout(() => { if (p2p) { try { p2p.disconnect(); } catch (e) {} } }, 350);
            } else {
                this.p2pController.disconnect();
                this.p2pController = null;
            }
        }
        this.isP2PMode = false;
        // 清理 Summa 表情入口与残留浮层（按钮/面板/队列）
        this._hideSummaEmojiUI();
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

// ---------- Summa 表情包互发（P2P 联机对局） ----------
// 惰性构建表情面板（9 种 Summa 情绪立绘）并绑定表情按钮
UIController.prototype._ensureSummaEmojiUI = function() {
    const panel = document.getElementById('summa-emoji-panel');
    const fab = document.getElementById('emoji-fab-btn');
    if (!panel || panel.dataset.summaBuilt) return;
    panel.dataset.summaBuilt = '1';
    const moods = ['neutral', 'thinking', 'smug', 'happy', 'surprised', 'sad', 'angry', 'determined', 'exhausted'];
    moods.forEach(mood => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'summa-emoji-item';
        cell.title = mood;
        const img = document.createElement('img');
        img.src = `files/Summa形象处理/summa_image/${mood}.PNG`;
        img.alt = mood;
        img.draggable = false;
        cell.appendChild(img);
        cell.addEventListener('click', () => this._sendSummaEmoji(mood));
        panel.appendChild(cell);
    });
    if (fab) fab.addEventListener('click', () => this._toggleSummaEmojiPanel());
    // 点击面板外部区域自动关闭
    document.addEventListener('click', (ev) => {
        const p = document.getElementById('summa-emoji-panel');
        if (!p || p.style.display === 'none') return;
        if (!ev.target.closest('#summa-emoji-panel') && !ev.target.closest('#emoji-fab-btn')) {
            p.style.display = 'none';
        }
    });
};

UIController.prototype._toggleSummaEmojiPanel = function(forceShow) {
    const panel = document.getElementById('summa-emoji-panel');
    if (!panel) return;
    if (window.audioManager) window.audioManager.playClick();
    const show = forceShow !== undefined ? forceShow : (panel.style.display === 'none');
    panel.style.display = show ? 'grid' : 'none';
};

UIController.prototype._sendSummaEmoji = function(mood) {
    // 观战模式：没有 PeerJS 连接，表情走 Lobby WS 发给对战双方与其他观众
    if (this._isSpectating) {
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected || !this._spectatorCode) return;
        if (this._summaEmojiCooldown) return;
        lobby.sendSpectateEmoji(this._spectatorCode, mood);
        this._showSummaEmoji(mood, false);
        this._summaEmojiCooldown = true;
        const fab = document.getElementById('emoji-fab-btn');
        if (fab) fab.classList.add('emoji-cooldown');
        setTimeout(() => {
            this._summaEmojiCooldown = false;
            if (fab) fab.classList.remove('emoji-cooldown');
        }, 2000);
        this._toggleSummaEmojiPanel(false);
        return;
    }
    const p2p = this.p2pController;
    if (!p2p || !p2p.isConnected) return;
    if (this._summaEmojiCooldown) return;
    p2p.sendSummaEmoji(mood);
    // 本地即时反馈（右侧小图）
    this._showSummaEmoji(mood, false);
    // 冷却 2s：按钮置灰防连点刷屏
    this._summaEmojiCooldown = true;
    const fab = document.getElementById('emoji-fab-btn');
    if (fab) fab.classList.add('emoji-cooldown');
    setTimeout(() => {
        this._summaEmojiCooldown = false;
        if (fab) fab.classList.remove('emoji-cooldown');
    }, 2000);
    this._toggleSummaEmojiPanel(false);
};

UIController.prototype._showSummaEmoji = function(mood, fromOpponent) {
    if (!this._summaEmojiQueue) this._summaEmojiQueue = [];
    this._summaEmojiQueue.push({ mood, fromOpponent });
    // 观战转发：房主开启观战推送时，记录最近一次表情事件，
    // 随下一个观战快照（buildSyncSnapshot）经 Lobby WS 推给观众端展示。
    if (this._spectateSyncTimer && this.p2pController && this.p2pController.isHost) {
        this._spectatePendingEmoji = { mood, fromOpponent };
    }
    this._playNextSummaEmoji();
};

// 队列化播放：收到对手表情（左侧大图）或本地发出反馈（右侧小图），逐个展示
UIController.prototype._playNextSummaEmoji = function() {
    if (this._summaEmojiPlaying) return;
    if (!this._summaEmojiQueue || !this._summaEmojiQueue.length) return;
    const item = this._summaEmojiQueue.shift();
    this._summaEmojiPlaying = true;
    const pop = document.getElementById('summa-emoji-pop');
    const img = document.getElementById('summa-emoji-pop-img');
    if (!pop || !img) { this._summaEmojiPlaying = false; return; }
    const moods = ['neutral', 'thinking', 'smug', 'happy', 'surprised', 'sad', 'angry', 'determined', 'exhausted'];
    const m = moods.indexOf(item.mood) !== -1 ? item.mood : 'neutral';
    img.src = `files/Summa形象处理/summa_image/${m}.PNG`;
    pop.classList.toggle('pop-left', !!item.fromOpponent);
    pop.classList.toggle('pop-right', !item.fromOpponent);
    pop.style.display = 'block';
    // 重启动画：连续展示时强制重新触发 pop-in
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = '';
    setTimeout(() => {
        pop.style.display = 'none';
        this._summaEmojiPlaying = false;
        this._playNextSummaEmoji();
    }, 2200);
};

// 退出对局/断线清理：隐藏表情入口并清空播放队列
UIController.prototype._hideSummaEmojiUI = function() {
    const fab = document.getElementById('emoji-fab-btn');
    const panel = document.getElementById('summa-emoji-panel');
    const pop = document.getElementById('summa-emoji-pop');
    if (fab) { fab.style.display = 'none'; fab.classList.remove('emoji-cooldown'); }
    if (panel) panel.style.display = 'none';
    if (pop) pop.style.display = 'none';
    this._summaEmojiQueue = [];
    this._summaEmojiPlaying = false;
    this._summaEmojiCooldown = false;
};

// _bindP2PDisconnectButtons
    UIController.prototype._bindP2PDisconnectButtons = function() {
        const menu = document.getElementById('p2p-disc-menu-btn');
        if (menu) menu.onclick = () => {
            if (window.audioManager) window.audioManager.playClick();
            // 统一处理：弹窗点击"返回主菜单" → 关闭弹窗 + 清理 P2P + 返回主菜单
            // 不依赖 _p2pReturnToMenu（避免 hide disconnect-modal 后又弹 startModal 覆盖）
            const disc = document.getElementById('p2p-disconnect-modal');
            if (disc) this.hideModal(disc);
            if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
            this.handleRestart();
        };
    }
;

// _showP2PDisconnectModal
    UIController.prototype._showP2PDisconnectModal = function(opponentLeft) {
        this._clearP2PResumeContext(); // 断线弹窗即本局结束，清除可恢复上下文
        // P3：未开局（建房等待/加入等待阶段）断开 → 一律用中性"连接已断开"文案，
        // 不显示"判负/扣分/判我胜"等结算文案，避免误导用户以为对局已开始、积分受影响
        if (!this._p2pMatchStarted) {
            opponentLeft = null;
        }
        // opponentLeft: true=对手中途退出(本局获胜) / false=自己中途退出(判负) / null=普通断线
        const titleEl = document.getElementById('p2p-disc-title');
        const detailEl = document.getElementById('p2p-disc-detail');
        const isCasual = this._p2pMatchMode === 'casual';
        const myName = (typeof PlayerProfile !== 'undefined' && typeof PlayerProfile.getNickname === 'function')
            ? PlayerProfile.getNickname() : '你';
        const oppName = this._p2pOpponentProfile?.nickname || '对手';
        // 休闲模式 + 访客视角 + 对局中：房主退出/解散/掉线 → 统一显示"房主已解散房间"
        const guestSeesHostLeave = isCasual && opponentLeft === true &&
            this.p2pController && !this.p2pController.isHost && this._p2pMatchStarted;
        if (titleEl && detailEl) {
            if (guestSeesHostLeave) {
                titleEl.textContent = '房主已解散房间';
                detailEl.textContent = `房主 ${oppName} 已解散房间，联机对局结束。`;
            } else if (opponentLeft === true) {
                titleEl.textContent = isCasual ? `${oppName} 已退出对局` : `${oppName} 中途退出`;
                detailEl.textContent = isCasual ? `${oppName} 已退出对局，本局结束。` : `${oppName} 已中途退出，本局判 ${myName} 获胜，${oppName} 将扣除 ELO 积分。`;
            } else if (opponentLeft === false) {
                titleEl.textContent = isCasual ? '已退出对局' : '中途退出';
                detailEl.textContent = isCasual ? `${myName} 已退出对局，本局结束。` : `${myName} 已中途退出，本局判负，将扣除 ELO 积分。`;
            } else {
                titleEl.textContent = `${oppName} 已断开连接`;
                detailEl.textContent = '联机对局已中断';
            }
        }
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.showModal(disc);
    }
;

// _onRoomDissolved
    UIController.prototype._onRoomDissolved = function(data) {
        // V9 修复：本端已主动退出并结算完毕（_p2pEloSettled=true）时，
        // 对手解散消息晚到直接短路，避免弹窗文案与服务器结算结果不一致。
        if (this._p2pEloSettled) return;
        // 对战方收到"房主已解散该房间"（大厅模式经 lobby WS 通知）
        if (this._p2pRoomDissolved) return; // 防重：若 onDisconnected 已先行处理，避免重复弹窗（P4）
        this._p2pRoomDissolved = true;
        this._hideP2PReconnectWait();
        // 房主已退出：访客侧停止重连尝试，避免 60s 后重连失败重复弹窗
        if (this.p2pController && !this.p2pController.isHost) {
            this.p2pController.disconnect();
            if (this._p2pMatchMode === 'ranked' && this._p2pMatchStarted && !this._p2pEloSettled) {
                // 访客结算为获胜得分（与房主判负完全对称）；服务端按 roomKey 去重，结果天然一致
                if (!this._reportP2PForfeitOpponent()) {
                    this._showP2PDisconnectModal(true); // 上报失败兜底：对手退，本局判我获胜
                    return;
                }
                return;
            }
        }
        this._showP2PDisconnectModal(true); // 非访客或非对局中：兜底显示对手退
    }
;

// _onP2PReconnectingChange
    UIController.prototype._onP2PReconnectingChange = function(isReconnecting) {
        console.warn(`[UI][P2P] onReconnectingChange：isReconnecting=${isReconnecting}, isP2PMode=${this.isP2PMode}, matchMode=${this._p2pMatchMode}, isHost=${this.p2pController ? this.p2pController.isHost : '-'}`);
        if (!this.isP2PMode) return;
        // 休闲模式：不弹重连等待（reconnectEnabled=false 正常不会触发，兜底防意外）
        if (this._p2pMatchMode === 'casual') return;
        if (isReconnecting) {
            this._p2pReconnectStartAt = Date.now();
            if (this.p2pController && this.p2pController.isHost) {
                this._showP2PReconnectWait();       // 房主：等待访客重连（60s 倒计时）
            } else {
                this._showP2PReconnectingToast();   // 访客：自动重连提示
            }
        } else {
            this._hideP2PReconnectWait();
            this._hideP2PReconnectingToast();
        }
    }
;

// _onP2PReconnected
    UIController.prototype._onP2PReconnected = function() {
        this._hideP2PReconnectWait();
        this._hideP2PReconnectingToast();
        const p2p = this.p2pController;
        if (!p2p) return;
        if (p2p.isHost) {
            // 房主：把当前对局状态完整同步给访客（继续原对局，不重新开局、不扣分）
            if (typeof this._syncToPeer === 'function') this._syncToPeer();
            // 稍后再补发一次，确保访客收到（重连后首包可能不稳）
            setTimeout(() => { if (typeof this._syncToPeer === 'function') this._syncToPeer(); }, 300);
        } else {
            // 访客：请求房主补发完整状态快照以恢复原对局
            // 访客恢复兜底（P3）：重连后在 10s 内未收到任何有效快照（房主已不在/未响应），
            // 则结束对局并提示，避免卡死在空白棋盘
            this._p2pRecoveryPending = true;
            if (this._p2pRecoveryTimer) { clearTimeout(this._p2pRecoveryTimer); this._p2pRecoveryTimer = null; }
            this._p2pRecoveryTimer = setTimeout(() => {
                this._p2pRecoveryTimer = null;
                if (this._p2pRecoveryPending) {
                    this._p2pRecoveryPending = false;
                    if (this.p2pController) { try { this.p2pController.disconnect(); } catch (e) {} }
                    this._showP2PDisconnectModal(null);
                }
            }, 10000);
            if (p2p.sendSyncRequest) p2p.sendSyncRequest();
        }
        this.showMessage('连接已恢复，继续对局', 'success');
    }
;

// _showP2PReconnectWait / _hideP2PReconnectWait（房主等待访客重连）
    UIController.prototype._showP2PReconnectWait = function() {
        const modal = document.getElementById('p2p-reconnect-modal');
        if (!modal) return;
        this.showModal(modal);
        const self = this;
        const el = document.getElementById('p2p-reconnect-countdown');
        const start = Date.now();
        const total = 60; // 1 分钟重连宽限
        const update = () => {
            const left = Math.max(0, total - Math.round((Date.now() - start) / 1000));
            if (el) el.textContent = String(left);
            if (left > 0 && self._p2pReconnectingNow) {
                // V8 修复：赋值前清除旧链，断线-恢复循环不会残留多条倒计时
                if (self._p2pReconnectCountTimer) clearTimeout(self._p2pReconnectCountTimer);
                self._p2pReconnectCountTimer = setTimeout(update, 500);
            }
            // left <= 0：controller 侧 20×3s≈60s 兜底（_giveUpReconnect）即将触发
            // onDisconnected('self_reconnect_failed') 判负，保持弹窗等待其回调收尾
        };
        this._p2pReconnectingNow = true;
        if (this._p2pReconnectCountTimer) clearTimeout(this._p2pReconnectCountTimer);
        this._p2pReconnectCountTimer = setTimeout(update, 500);
        const exitBtn = document.getElementById('p2p-reconnect-exit-btn');
        if (exitBtn) {
            // U4: 用 onclick 覆盖式赋值（而非 addEventListener once），
            // 避免断线-恢复循环后监听器累积、一次点击触发多次 _p2pReturnToMenu
            const onExit = () => {
                if (window.audioManager) window.audioManager.playClick();
                self._p2pReconnectingNow = false;
                self._p2pReturnToMenu();
            };
            exitBtn.onclick = onExit;
        }
    }
;

    UIController.prototype._hideP2PReconnectWait = function() {
        this._p2pReconnectingNow = false;
        if (this._p2pReconnectCountTimer) { clearTimeout(this._p2pReconnectCountTimer); this._p2pReconnectCountTimer = null; }
        const modal = document.getElementById('p2p-reconnect-modal');
        if (modal) this.hideModal(modal);
    }
;

// _showP2PReconnectingToast / _hideP2PReconnectingToast（访客自动重连提示）
    UIController.prototype._showP2PReconnectingToast = function() {
        const modal = document.getElementById('p2p-reconnecting-modal');
        if (modal) this.showModal(modal);
    }
;

    UIController.prototype._hideP2PReconnectingToast = function() {
        const modal = document.getElementById('p2p-reconnecting-modal');
        if (modal) this.hideModal(modal);
    }
;

// _reportP2PForfeit
    // 统一结算入口（P5）：无论休闲/排位、主动退出/断线/被解散，ELO 上报、置标、弹窗逻辑全部收敛于此，
    // 消除 _reportP2PForfeit 与 _reportP2PForfeitOpponent 的重复实现，并统一 roomKey（用 UI 层持久真实房间码）。
    // opts.forfeitSelf=true 表示本方弃权判负（对手胜，winner='B'）；false 表示对手弃权（本方胜，winner='A'）。
// _buildSpectatePlayers
    // 构造观战快照的 players 映射（A/B → 昵称），观众端据此替换"玩家A/玩家B"文案
    UIController.prototype._buildSpectatePlayers = function() {
        const players = {};
        const me = (this.p2pController && this.p2pController.myPlayerId) || 'A';
        const myName = (typeof PlayerProfile !== 'undefined' && typeof PlayerProfile.getNickname === 'function')
            ? PlayerProfile.getNickname() : '房主';
        const opp = this._p2pOpponentProfile;
        players[me] = myName;
        players[me === 'A' ? 'B' : 'A'] = (opp && opp.nickname) || '访客';
        return players;
    }
;

// _notifySpectatorsGuestLeft
    // 访客中途退出/弃权：房主立即推送一条带 _notice 的观战快照，观众端收到后弹窗提示
    UIController.prototype._notifySpectatorsGuestLeft = function() {
        try {
            const lobby = this._lobby;
            if (!lobby || !lobby.isConnected || !this._p2pRoomCode) return;
            const opp = this._p2pOpponentProfile;
            const snapshot = this.buildSyncSnapshot();
            snapshot._notice = { type: 'guest_left', nickname: (opp && opp.nickname) || '访客' };
            lobby.sendSpectateSync(snapshot);
        } catch (e) {
            console.warn('[UI][P2P] 通知观众访客退出失败：', e);
        }
    }
;

    UIController.prototype._finalizeP2PMatch = function(opts) {
        opts = opts || {};
        const isForfeitSelf = !!opts.forfeitSelf;
        // 非对局中（未开局/建房等待/已结算）不处理，返回 false；调用方据此决定是否弹普通断线弹窗
        if (!this.isP2PMode || !this._p2pMatchStarted || this._p2pEloSettled) {
            return false;
        }
        // 访客中途退出/弃权（对手弃权）且本端为房主时：即时推送观战通知，观众端弹窗"访客已退出"
        if (!isForfeitSelf && this.p2pController && this.p2pController.isHost) {
            this._notifySpectatorsGuestLeft();
        }
        // ★ 休闲模式：不结算 ELO，但仍按"对手弃权"弹 disconnect-modal（语义上我方胜）
        if (this._p2pMatchMode !== 'ranked') {
            this._p2pEloSettled = true; // 标记结算（防止重复弹窗/重复处理）
            this._stopSpectateSync();   // P4：对局结束，停止观战快照周期推送
            this._showP2PDisconnectModal(!isForfeitSelf);
            return true;
        }
        if (typeof PlayerProfile === 'undefined') return false;
        const p2p = this.p2pController;
        const opp = this._p2pOpponentProfile;
        if (!p2p || !opp || !opp.playerId) return false;
        if (!this._leaderboardService) return false;
        const profile = PlayerProfile.getProfile();
        const roomKey = ((this._p2pRoomCode || p2p.roomCode) || 'room') + '#' + (p2p._gen || 0);
        // isForfeitSelf=true：本方弃权判负（对手胜）；false：对手弃权（本方胜）
        this._leaderboardService.submitEloScore({
            nickname: profile.nickname,
            opponentPlayerId: opp.playerId,
            opponentNickname: opp.nickname || '棋手',
            scoreA: isForfeitSelf ? 0 : 1,
            scoreB: isForfeitSelf ? 1 : 0,
            winner: isForfeitSelf ? 'B' : 'A',
            roomCode: roomKey
        });
        this._p2pEloSettled = true;
        this._stopSpectateSync(); // P4：对局结束，停止观战快照周期推送
        this._showP2PDisconnectModal(!isForfeitSelf);
        return true;
    };

    UIController.prototype._reportP2PForfeit = function(isForfeitSelf) {
        return this._finalizeP2PMatch({ forfeitSelf: isForfeitSelf });
    };

    // _onOpponentQuit
    // 收到对方"主动退出"通知（PeerJS quit 消息，非断线）：
    // - 排位：对手弃权 → 本方判胜（ELO 对称，服务端按 roomKey 去重）
    // - 休闲：弹"对手已退出对局"
    // 立即结算并主动断开，不进入 60s 重连等待；结算后由 disconnect-modal 的
    // "返回主菜单"按钮走 _cleanupP2P 完成剩余清理（踢观众/关房间/回主菜单）。
    UIController.prototype._onOpponentQuit = function() {
        console.warn(`[UI][P2P] _onOpponentQuit 收到对手主动退出通知：matchMode=${this._p2pMatchMode}, eloSettled=${this._p2pEloSettled}, roomDissolved=${this._p2pRoomDissolved}`);
        if (!this.isP2PMode) return;
        if (this._p2pEloSettled || this._p2pRoomDissolved) return;
        // 标记对局已结束，避免后续 onDisconnected / _cleanupP2P 重复结算
        this._p2pRoomDissolved = true;
        this._hideP2PReconnectWait();
        this._hideP2PReconnectingToast();
        // 对手弃权：本方判胜（休闲模式同样弹"对手已退出对局"）。
        // 先结算（此时 p2p.roomCode 仍保留，roomKey 稳定），再断开本方连接。
        if (!this._reportP2PForfeit(false)) {
            this._showP2PDisconnectModal(true);
        }
        // 主动断开本方连接（_disconnecting=true → _handleDisconnect 直接返回，不弹窗、不重连）
        if (this.p2pController) this.p2pController.disconnect();
        // 告知 handleExit 跳过弹主菜单，等待用户看完结算弹窗后点"返回主菜单"
        this._p2pShowDisconnectReturnToMenu = true;
    };
;

// _reportP2PForfeitOpponent
// 访客专用：收到房主解散/退出通知时，本方结算为获胜得分（与房主判负完全对称）。
// 上报语义与 _reportP2PForfeit(false) 一致：本方略胜（scoreA=1, winner='A'）；
// 服务端按 roomKey 去重，房主端已上报同样结果，两侧结果天然一致，不会重复扣分。
UIController.prototype._reportP2PForfeitOpponent = function() {
    // 访客收到房主解散/退出通知时，本方结算为获胜得分（与房主判负完全对称）；
    // 语义与 _reportP2PForfeit(false) 一致：本方略胜（winner='A'），统一收敛到 _finalizeP2PMatch（P5）
    return this._finalizeP2PMatch({ forfeitSelf: false });
}
;

// _startP2PVSIntro
    UIController.prototype._startP2PVSIntro = function() {
        // 休闲模式不计算 ELO，也不播放排位 VS 动画（等同原始联机体验）
        if (this._p2pMatchMode === 'casual') return;
        if (typeof PlayerProfile === 'undefined') return;
        if (!this._leaderboardService) return;
        const opp = this._p2pOpponentProfile;
        if (!opp || !opp.playerId) return;
        const myId = PlayerProfile.getPlayerId();
        const self = this;
        // 立即播放开场动画（不再等 ELO 查询），避免"开始后 1~2s 才显示"
        if (!self._p2pEloSettled && self.isP2PMode) {
            self._showP2PVSIntro(
                PlayerProfile.getNickname(),
                null,
                opp.nickname || '棋手',
                null
            );
        }
        // ELO 查询回来后回填昵称下方的 ELO 数值（动画已在进行，无需等待）
        this._leaderboardService.queryPlayerElo([myId, opp.playerId], (data) => {
            if (self._p2pEloSettled || !self.isP2PMode) return;
            const map = (data && data.players) || {};
            const my = map[myId] || {};
            const op = map[opp.playerId] || {};
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = 'ELO ' + (v != null ? v : 1200); };
            set('p2p-vs-my-elo', my.elo);
            set('p2p-vs-opp-elo', op.elo);
        });
    }
;

// _showP2PVSIntro
    UIController.prototype._showP2PVSIntro = function(myNick, myElo, oppNick, oppElo) {
        const overlay = document.getElementById('p2p-vs-overlay');
        if (!overlay) return;
        // 关键修复（2026-08-13）：VS 开场动画期间暂停回合计时，动画"开始！"后再恢复，
        // 避免玩家还在看 3-2-1 时回合倒计时已提前消耗 3~4 秒。
        if (this.gameController && typeof this.gameController.pauseTimer === 'function') {
            this.gameController.pauseTimer();
        }
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        set('p2p-vs-my-nick', myNick);
        set('p2p-vs-my-elo', 'ELO ' + (myElo != null ? myElo : 1200));
        set('p2p-vs-opp-nick', oppNick);
        set('p2p-vs-opp-elo', 'ELO ' + (oppElo != null ? oppElo : 1200));
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
            // 动画结束后恢复计时（从暂停时的剩余时间续跑，不重置）
            if (this.gameController) this._resumeP2PTimer();
            setTimeout(() => { overlay.style.display = 'none'; }, 900);
        };
        const tick = () => {
            count--;
            if (count > 0) { pop(); self._p2pVSTimer = setTimeout(tick, 1000); }
            else finish();
        };
        if (this._p2pVSTimer) clearTimeout(this._p2pVSTimer);
        this._p2pVSTimer = setTimeout(tick, 1000);
    }
;

// _resumeP2PTimer：VS 开场动画结束后按当前阶段恢复回合计时（从暂停时的剩余时间续跑）
    UIController.prototype._resumeP2PTimer = function() {
        const gc = this.gameController;
        if (!gc || gc.gameMode !== 'p2p') return;
        if (gc.currentPhase === gc.phases.INPUT_FUNCTION) {
            if (typeof gc.resumeTimer === 'function') gc.resumeTimer();
        } else if (gc.currentPhase === gc.phases.SELECT_TARGET ||
                   gc.currentPhase === gc.phases.SET_FORBIDDEN ||
                   gc.currentPhase === gc.phases.SET_LOCKS) {
            if (typeof gc.resumeTargetTimer === 'function') gc.resumeTargetTimer();
        }
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
        this._p2pHealthCheckAt = 0;
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
    // 在等待对方回执期间显示常驻提示"连接不稳定，正在等待对手客户端响应…"；收到回执后隐藏。
    UIController.prototype._p2pSetAwaitBanner = function(awaiting) {
        const banner = document.getElementById('p2p-await-banner');
        if (!banner) return;
        if (awaiting) {
            banner.style.display = 'flex';
            this._makeDraggable(banner);
        } else {
            banner.style.display = 'none';
        }
    }
;

// ===== 访客大退后重开页面恢复对局 =====
// 仅访客侧需要：房主始终在线等待，访客关闭页面后重新打开可通过存储的 roomCode 重连，
// 由房主端快照续局（房主在断开后 60s 宽限内等待重连；休闲模式房主不等待，故不支持恢复）。

    UIController.prototype._saveP2PResumeContext = function(extra) {
        try {
            const existing = this._loadP2PResumeContext() || {};
            const ctx = Object.assign(existing, extra || {}, { timestamp: Date.now() });
            if (!ctx.roomCode) return;
            localStorage.setItem('function_chess_p2p_resume', JSON.stringify(ctx));
        } catch (e) { /* localStorage 不可用（隐私模式等）时静默忽略 */ }
    };

    UIController.prototype._loadP2PResumeContext = function() {
        try {
            const raw = localStorage.getItem('function_chess_p2p_resume');
            if (!raw) return null;
            const ctx = JSON.parse(raw);
            if (!ctx || !ctx.roomCode) return null;
            return ctx;
        } catch (e) { return null; }
    };

    UIController.prototype._clearP2PResumeContext = function() {
        try { localStorage.removeItem('function_chess_p2p_resume'); } catch (e) {}
        this._p2pResumeCtx = null;
    };

    // 启动检测：若有未结束的排位对局，弹出恢复询问
    UIController.prototype._checkP2PResume = function() {
        const ctx = this._loadP2PResumeContext();
        // 仅排位对局支持断线恢复（休闲模式房主不等待重连，无法续局）
        if (!ctx || !ctx.roomCode || ctx.mode !== 'ranked') {
            this._clearP2PResumeContext();
            return;
        }
        // 隐藏封面，直接弹出恢复询问
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('splash-exit');
            splash.style.display = 'none';
            // 关键修复：解绑 splash 的 document 级 keydown 监听器，避免恢复后答题按 Enter 误触 _enterFromSplash 跳回主菜单
            this._unbindSplashEnter(splash);
        }
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.showModal(modal);
    };

    // 用户确认恢复：以存储的 roomCode 重新加入房主房间，并走快照续局链路
    UIController.prototype.confirmP2PResume = function() {
        const ctx = this._loadP2PResumeContext();
        if (!ctx || !ctx.roomCode) { this._clearP2PResumeContext(); return; }
        this.hideStartModal();
        this._p2pRole = 'guest';
        this._p2pRoomCode = ctx.roomCode;
        this._p2pResumeCtx = ctx;
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.hideModal(modal);
        this.showMessage('正在重连恢复对局…');
        // 直接建立 P2PController 并绑定回调（不弹房间选择弹窗），
        // 再以存储的 roomCode 加入房主房间（房主端处于 60s 重连等待，走快照续局，不会重开）。
        if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
        if (!this.p2pController) this.p2pController = new P2PController();
        this._p2pMatchMode = ctx.mode || 'ranked';
        if (typeof this._setupP2PCallbacks === 'function') this._setupP2PCallbacks();
        // 必须在连接打开前把房主当前 gen 设回：访客大退后是全新会话，_gen 重置为 0，
        // 否则后续 action/timer_sync 会被房主按 gen 拒绝，且 request_sync 也会被房主过滤。
        // 房主主动推送的 state_sync 虽不过滤 gen，但续局后的交互必须 gen 匹配。
        if (this.p2pController && ctx.gen != null) this.p2pController._gen = ctx.gen;
        if (this.p2pController && typeof this.p2pController.joinRoom === 'function') {
            this.p2pController.joinRoom(ctx.roomCode, (ctx.mode === 'casual') ? 'casual' : 'ranked');
        }
        // 标记恢复中：在 onConnected 中据此走快照续局而非等待 game_init
        this._p2pResuming = true;
    };

    // 用户放弃恢复：清除上下文并返回主菜单
    UIController.prototype.cancelP2PResume = function() {
        this._clearP2PResumeContext();
        const modal = document.getElementById('p2p-resume-modal');
        if (modal) this.hideModal(modal);
        this.showSplash();
    };

