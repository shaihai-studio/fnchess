/**
 * UIP2PDisconnect —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 断线/房间解散/重连等待与 toast
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._bindP2PDisconnectButtons = function() {
        const menu = document.getElementById('p2p-disc-menu-btn');
        if (menu) menu.onclick = () => {
            if (window.audioManager) window.audioManager.playClick();
            // 统一处理：弹窗点击"返回主菜单" → 关闭弹窗 + 清理 P2P + 返回主菜单
            // 不依赖 _p2pReturnToMenu（避免 hide disconnect-modal 后又弹 startModal 覆盖）
            const disc = document.getElementById('p2p-disconnect-modal');
            if (disc) this.hideModal(disc);
            if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
            // 速览浮窗「确认退出进入大厅」：判负弹窗点「返回主菜单」后自动打开目标大厅
            if (this._lwPendingLobby) {
                const target = this._lwPendingLobby;
                this._lwPendingLobby = null;
                if (typeof this._lwGo === 'function') this._lwGo(target);
                return;
            }
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
