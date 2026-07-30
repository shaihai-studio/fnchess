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
        this.showModal(document.getElementById('p2p-room-modal'));
        this._bindP2PRoomEvents();
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
            // 记录房间码/身份，供掉线后「重试连接」复用（#25）
            this._p2pLastRoomCode = p2p.roomCode;
            this._p2pLastIsHost = p2p.isHost;
            // 隐藏所有模态框：P2P房间 + 开始界面
            const p2pModal = document.getElementById('p2p-room-modal');
            if (p2pModal) this.hideModal(p2pModal);
            this.hideStartModal();
            this.startP2PGame();
            // 房主发送游戏初始化给访客
            if (p2p.isHost && this.gameController) {
                const rounds = parseInt(this.roundValue?.textContent) || 8;
                const difficulty = this.getSelectedDifficulty();
                p2p.sendGameInit({ rounds, difficulty });
            }
        };
        // 收到游戏初始化（访客端）
        p2p.onGameInit = (config) => {
            this.gameController.setP2PController(p2p);
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
            // #25：弹出三按钮恢复框（不再仅靠 toast），提供重试/等待/返回入口
            this._showP2PDisconnectModal();
        };
        // 错误回调
        p2p.onError = (err) => {
            console.error('[UI][P2P] onError:', err);
            this._updateP2PStatus('error', '连接错误：' + (err.message || err));
            this.showMessage('P2P连接错误：' + (err.message || err), 'error');
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
                const code = $('p2p-room-input')?.value?.trim().toUpperCase();
                if (!code || code.length !== 6) {
                    this.showMessage('请输入6位房间码', 'error');
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
        // 标签页切换
        const bindTab = (tabId, contentId) => {
            const tab = $(tabId), content = $(contentId);
            if (tab && content) {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.p2p-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.p2p-tab-content').forEach(c => c.style.display = 'none');
                    tab.classList.add('active');
                    content.style.display = 'block';
                });
            }
        };
        bindTab('p2p-tab-create', 'p2p-tab-create-content');
        bindTab('p2p-tab-join', 'p2p-tab-join-content');
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
        // 房主在这里初始化游戏（访客在 onGameInit 中初始化）
        if (p2p.isHost) {
            const rounds = parseInt(this.roundValue?.textContent) || 8;
            const difficulty = this.getSelectedDifficulty();
            this.gameController.initGame(rounds, difficulty, 'p2p');
        }
    }
;

// _cleanupP2P
    UIController.prototype._cleanupP2P = function() {
        // 清理创建房间时轮询房间码的定时器，避免重开弹窗后叠加残留轮询
        if (this._p2pCheckCodeInterval) {
            clearInterval(this._p2pCheckCodeInterval);
            this._p2pCheckCodeInterval = null;
        }
        this.p2pController?.disconnect();
        this.p2pController = null;
        this.isP2PMode = false;
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
        const retry = document.getElementById('p2p-disc-retry-btn');
        const wait = document.getElementById('p2p-disc-wait-btn');
        const menu = document.getElementById('p2p-disc-menu-btn');
        const bannerRetry = document.getElementById('p2p-wait-retry-btn');
        const bannerMenu = document.getElementById('p2p-wait-menu-btn');
        const onRetry = () => this._retryP2P();
        const onMenu = () => this._p2pReturnToMenu();
        if (retry) retry.onclick = () => this.playUIButtonSound(onRetry);
        if (wait) wait.onclick = () => this.playUIButtonSound(() => this._p2pWaitForOpponent());
        if (menu) menu.onclick = () => this.playUIButtonSound(onMenu);
        if (bannerRetry) bannerRetry.onclick = () => this.playUIButtonSound(onRetry);
        if (bannerMenu) bannerMenu.onclick = () => this.playUIButtonSound(onMenu);
    }
;

// _showP2PDisconnectModal
    UIController.prototype._showP2PDisconnectModal = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.showModal(disc);
    }
;

// _retryP2P
    UIController.prototype._retryP2P = function() {
        const code = this._p2pLastRoomCode;
        if (!code || !this.p2pController) {
            this.showMessage('缺少房间码，无法重连，请返回主菜单', 'error');
            return;
        }
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.hideModal(disc);
        this._hideP2PWaitBanner();
        this._updateP2PStatus('connecting', '正在重连...');
        this.showMessage('正在重连...');
        if (this._p2pLastIsHost) {
            this.p2pController.createRoomWithCode(code);
        } else {
            this.p2pController.joinRoom(code);
        }
    }
;

// _p2pReturnToMenu
    UIController.prototype._p2pReturnToMenu = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.hideModal(disc);
        this._hideP2PWaitBanner();
        if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
        this.handleRestart();
    }
;

// _p2pWaitForOpponent
    UIController.prototype._p2pWaitForOpponent = function() {
        const disc = document.getElementById('p2p-disconnect-modal');
        if (disc) this.hideModal(disc);
        const banner = document.getElementById('p2p-wait-banner');
        if (banner) banner.style.display = 'flex';
    }
;

// _hideP2PWaitBanner
    UIController.prototype._hideP2PWaitBanner = function() {
        const banner = document.getElementById('p2p-wait-banner');
        if (banner) banner.style.display = 'none';
    }
;

