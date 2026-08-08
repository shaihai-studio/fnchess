// Auto-split from UIController.js — prototype-attached methods (UISpectator)
// Loaded after UIController.js; attaches methods to UIController.prototype.
// 观战模式：观众通过 Lobby WebSocket 接收房主推送的 state_sync 快照，只读渲染整局。
// 不涉及 PeerJS/WebRTC（数据走 Lobby WS），复用 GameController.loadStateSnapshot 无条件接受快照
// （观众未注入 p2pActionSender，isOperator 恒为 false → 天然无条件接受）。
if (typeof UIController === 'undefined') {
    console.error('[UISpectator] UIController must be loaded before this file');
}

// enterSpectatorMode
    // 观众进入观战：关闭主页/联机弹窗 → 初始化只读 GameController → 加入观战频道
    UIController.prototype.enterSpectatorMode = function(code) {
        // 已处于观战（重复进入 / 退出后重进）时，先干净地退出旧频道再重新加入，
        // 避免叠加监听、状态残留导致第二次进入卡死或收不到快照。
        if (this._isSpectating) {
            try {
                if (this._lobby && this._spectatorCode) this._lobby.leaveSpectate(this._spectatorCode);
            } catch (e) {}
            this._isSpectating = false;
            this._spectatorCode = null;
        }
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected) {
            this.showMessage('大厅未连接，无法观战', 'error');
            return;
        }
        this._spectatorCode = String(code);
        this._isSpectating = true;
        this._spectateNicknames = null;       // 房主快照携带的双方昵称（替代"玩家A/玩家B"）
        this._lastSpectateNoticeKey = null;   // 通知去重（观战快照循环推送，防止重复弹窗）
        // 观战状态下禁用 P2P 相关操作入口
        this.isP2PMode = false;
        // 观众端必须作为「纯被动接收方」：清掉可能残留的 p2pActionSender，
        // 否则 loadStateSnapshot 会误判为操作方而走版本过滤、把房主真实快照拒掉 → 棋盘不刷新。
        if (this.gameController) this.gameController.p2pActionSender = null;
        // 观战期间允许 UI 更新 / 特效正常触发（forceStopGame 曾把 _gameActive 置为 false）
        this._gameActive = true;

        // 清理可能残留的 P2P / 关卡编辑器状态
        if (this.levelEditor) this.levelEditor.deactivate();
        this._stopP2PPeriodicSync?.();
        this._stopP2PHealthMonitor?.();
        this._stopSpectateSync?.();

        // 初始化只读 GameController（p2p 模式以便快照正常应用；不设 p2pActionSender → 无条件接受）
        if (!this.gameController) {
            console.error('[UISpectator] gameController 未初始化，无法观战');
            this._isSpectating = false;
            return;
        }
        this.gameController.initGame(8, 'normal', 'p2p');
        // 清空棋盘与表达式残留
        if (this.gridSystem) {
            this.gridSystem.functionHistory = [];
            this.gridSystem.usedCells = [];
            this.gridSystem.clearAll();
        }
        this.expressionElements = [];
        this.cursorIndex = 0;
        this._lastRemoteExpr = null;

        // 绑定观战回调（覆盖式，避免重复进入叠加监听）
        lobby.onSpectateState = (payload, roomCode) => this.applySpectateSnapshot(payload);
        lobby.onSpectateJoined = (roomCode) => {
            this._updateSpectatorRoomCode(roomCode);
            this.showMessage(`已加入房间 ${roomCode} 的观战`);
        };
        lobby.onSpectateJoinRejected = (roomCode, reason) => {
            if (reason === 'elo_range') {
                this.showMessage('该房间开启了「仅限相近ELO」，你的段位不在允许观战范围内', 'warning');
            } else {
                this.showMessage('该房间不可观战（可能已关闭观战或对局结束）', 'warning');
            }
            this.exitSpectatorMode();
        };
        lobby.onSpectateEnded = (roomCode, reason) => {
            this.showMessage('观战结束：房主已解散该房间', 'warning');
            this.exitSpectatorMode();
        };

        // 显示观战 UI 并退出到主界面（关闭主页 modal）
        this.hideStartModal();
        const overlay = document.getElementById('spectator-overlay');
        const watermark = document.getElementById('spectator-watermark');
        if (overlay) { overlay.style.display = 'flex'; this._makeDraggable(overlay); }
        if (watermark) watermark.style.display = 'block';
        this._bindSpectatorButtons();
        this._bindSpectateNoticeButton();
        this._updateSpectatorRoomCode(this._spectatorCode);
        // 标记棋盘只读
        if (this.gridSystem && this.gridSystem.canvas) {
            this.gridSystem.canvas.style.cursor = 'not-allowed';
        }
        // 隐藏底部操作按钮：观战是只读的，观众不能确认/清除/退出对局
        // （误点"退出对局"会走 handleExit → _cleanupP2P → 断开大厅连接，
        //   但观战遮罩/回调/标志残留，第二次进入观战就空白/失败；
        //   确认/清除对观众无意义，点了也无效果）
        const exitBtn = document.getElementById('exit-btn');
        if (exitBtn) exitBtn.style.display = 'none';
        const confirmBtn = document.getElementById('confirm-btn');
        if (confirmBtn) confirmBtn.style.display = 'none';
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) clearBtn.style.display = 'none';
        // 观战：隐藏右下角圆形 确认/返回 按钮
        const confirmFab = document.getElementById('confirm-fab-btn');
        const exitFab = document.getElementById('exit-fab-btn');
        if (confirmFab) confirmFab.style.display = 'none';
        if (exitFab) exitFab.style.display = 'none';
        // 加入观战
        lobby.joinSpectate(this._spectatorCode);
        this._updateLobbyStatus('spectating', `正在连接房间 ${this._spectatorCode} 观战...`);
    }
;

// _bindSpectatorButtons
    UIController.prototype._bindSpectatorButtons = function() {
        const btn = document.getElementById('spectator-exit-btn');
        if (btn) {
            btn.onclick = () => this.exitSpectatorMode();
        }
    }
;

// _bindSpectateNoticeButton
    // 绑定观战通知弹窗的"知道了"关闭按钮（仅绑定一次）
    UIController.prototype._bindSpectateNoticeButton = function() {
        const btn = document.getElementById('spectator-notice-close');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const modal = document.getElementById('spectator-notice-modal');
            if (modal) this.hideModal(modal);
        });
    }
;

// _handleSpectateNotice
    // 观众端收到房主推送的通知（如"访客已退出对局"）→ 弹窗提示；
    // 对相同通知去重，避免观战快照循环推送导致重复弹窗
    UIController.prototype._handleSpectateNotice = function(notice) {
        if (!notice || typeof notice !== 'object') return;
        const key = JSON.stringify(notice);
        if (this._lastSpectateNoticeKey === key) return;
        this._lastSpectateNoticeKey = key;
        const modal = document.getElementById('spectator-notice-modal');
        if (!modal) return;
        const titleEl = document.getElementById('spectator-notice-title');
        const textEl = document.getElementById('spectator-notice-text');
        if (notice.type === 'guest_left') {
            const name = notice.nickname || '访客';
            if (titleEl) titleEl.textContent = '访客已退出对局';
            if (textEl) textEl.textContent = `${name} 已退出对局，本局已结束。`;
        } else {
            if (titleEl) titleEl.textContent = '观战通知';
            if (textEl) textEl.textContent = (notice.message || '');
        }
        this.showModal(modal);
    }
;

// _updateSpectatorRoomCode
    UIController.prototype._updateSpectatorRoomCode = function(code) {
        const el = document.getElementById('spectator-room-code');
        if (el) el.textContent = String(code || this._spectatorCode || '------');
    }
;

// applySpectateSnapshot
    // 观众收到房主快照：无条件接受（无需版本过滤/操作方判断），应用后重绘整局
    UIController.prototype.applySpectateSnapshot = function(payload) {
        if (!this._isSpectating || !payload || !payload.gc) return;
        const gc = this.gameController;
        if (!gc) return;
        // 房主快照携带的双方昵称：观众端用昵称替代"玩家A/玩家B"文案
        if (payload.players && typeof payload.players === 'object') {
            this._spectateNicknames = payload.players;
        }
        // 顶部信息栏玩家名随快照昵称刷新
        this.updateHeaderPlayerNames();
        // 房主推送的通知（如"访客已退出对局"）→ 弹窗提示
        if (payload._notice) {
            this._handleSpectateNotice(payload._notice);
        }
        const applied = gc.loadStateSnapshot(payload.gc);
        if (!applied) return;
        // 历史函数剥离采样点 → 本地重新采样绘制
        if (this.renderer && this.gridSystem && Array.isArray(gc.functionHistory)) {
            const range = this.gridSystem.getRange();
            for (const f of gc.functionHistory) {
                if (f && f.expression && !Array.isArray(f.points)) {
                    try {
                        f.points = this.renderer.sampleFunction(f.expression, range.min, range.max);
                        f.sampledRange = this.gridSystem.range;
                    } catch (e) {
                        f.points = [];
                    }
                }
            }
        }
        this.expressionElements = Array.isArray(payload.expr) ? payload.expr.slice() : [];
        this.cursorIndex = (typeof payload.cursorIndex === 'number') ? payload.cursorIndex : this.expressionElements.length;
        this._renderFromState();
    }
;

// exitSpectatorMode
    // 观众退出观战：离开观战频道 → 隐藏观战 UI → 返回主界面
    UIController.prototype.exitSpectatorMode = function() {
        if (!this._isSpectating) return;
        this._isSpectating = false;
        // 防御：停掉可能残留的本地选格子倒计时（观众端只读，不应有任何扣分/判负）
        if (this.gameController && typeof this.gameController.stopTargetTimer === 'function') {
            this.gameController.stopTargetTimer();
        }
        const lobby = this._lobby;
        if (lobby && this._spectatorCode) {
            lobby.leaveSpectate(this._spectatorCode);
            // 解除观战回调，避免残留触发
            lobby.onSpectateState = null;
            lobby.onSpectateJoined = null;
            lobby.onSpectateJoinRejected = null;
            lobby.onSpectateEnded = null;
        }
        this._spectatorCode = null;
        this._spectateNicknames = null;
        // 恢复顶部玩家名为默认（观战昵称已清空，按当前模式重新解析）
        this.updateHeaderPlayerNames();
        const overlay = document.getElementById('spectator-overlay');
        const watermark = document.getElementById('spectator-watermark');
        if (overlay) overlay.style.display = 'none';
        if (watermark) watermark.style.display = 'none';
        // 恢复棋盘指针
        if (this.gridSystem && this.gridSystem.canvas) {
            this.gridSystem.canvas.style.cursor = 'default';
        }
        // 恢复底部按钮（仅观战时隐藏）
        const exitBtn = document.getElementById('exit-btn');
        if (exitBtn) exitBtn.style.display = '';
        const confirmBtn = document.getElementById('confirm-btn');
        if (confirmBtn) confirmBtn.style.display = '';
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) clearBtn.style.display = '';
        // 恢复右下角圆形按钮
        const confirmFab = document.getElementById('confirm-fab-btn');
        const exitFab = document.getElementById('exit-fab-btn');
        if (confirmFab) confirmFab.style.display = '';
        if (exitFab) exitFab.style.display = '';
        this.showMessage('已退出观战');
        // 返回开始界面（观战结束即回主页）
        this.handleRestart();
    }
;
