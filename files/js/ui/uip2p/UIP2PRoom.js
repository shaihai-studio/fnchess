/**
 * UIP2PRoom —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 房间弹窗：showP2PRoomModal/_proceedP2PRoomModal/回调绑定/状态/开局
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

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

            // 收到对方动作（阶段推进）→ 健康监测重置计时，视为对方在线
            this._p2pPeerActivityReset();
            if (this.gameController.onP2PGameAction) {
                return this.gameController.onP2PGameAction(action, payload);
            }
            return false;
        };
        // 全量状态镜像：接收对手的实时快照并直接重绘
        p2p.onStateSync = (state) => {

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
