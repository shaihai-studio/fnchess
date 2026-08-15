/**
 * UICoreP2PSync —— UICore 模块切片（UIController.prototype 挂载）
 *
 * P2P 同步：发送/快照构建/应用
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._syncToPeer = function(confirmKey = null) {
        if (this._applyingRemote) return;
        if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
        const now = Date.now();
        if (!confirmKey && this._lastSyncTime && now - this._lastSyncTime < 50) return; // 简单节流
        this._lastSyncTime = now;
        this.p2pController.sendStateSync(this.buildSyncSnapshot(), confirmKey);
    }
;

// _p2pSyncNow
    // 绕过节流立即同步一次：用于棋盘点选/锁定等低频但要求"每点击一次同步一次"的操作。
    // confirm=true 时生成阶段确认 key（触发对方回执 + 重发，用于阶段切换）。
    // 关键：300ms 内复用同一 confirm key。evaluateResult 内 setPhase(SWITCH_PLAYER) +
    // switchPlayer 内 setPhase(SELECT_TARGET) 会连续两次调用本函数（确认 push），
    // 若都生成新 key → 两次独立的高频重发（8 次 × 2 = 16 条消息）；复用同一 key 只 8 次。
    UIController.prototype._p2pSyncNow = function(confirm = false) {
        if (this._applyingRemote) return;
        if (!this.isP2PMode || !this.p2pController || !this.p2pController.isConnected) return;
        this._lastSyncTime = 0;
        let key = null;
        if (confirm) {
            const now = Date.now();
            if (this._lastConfirmTime && this._lastConfirmKey &&
                now - this._lastConfirmTime < 300) {
                key = this._lastConfirmKey;
            } else {
                key = this.p2pController.nextSyncConfirmKey();
                this._lastConfirmKey = key;
                this._lastConfirmTime = now;
            }
        }
        this._syncToPeer(key);
    }
;

// buildSyncSnapshot
    UIController.prototype.buildSyncSnapshot = function() {
        const snapshot = {
            gc: this.gameController.getStateSnapshot(),
            expr: this.expressionElements.slice(),
            cursorIndex: this.cursorIndex
        };
        // 房主观战快照附带双方昵称：观众端据此用昵称替代"玩家A/玩家B"文案
        if (this.isP2PMode && this.p2pController && this.p2pController.isHost && this._p2pMatchStarted) {
            snapshot.players = this._buildSpectatePlayers();
        }
        // 观战快照附带最近一次 Summa 表情事件（一次性，推完即清）：
        // 双方互发的表情经房主透传给观众，观众端 applySpectateSnapshot 弹出展示。
        if (this._spectatePendingEmoji) {
            snapshot._emoji = this._spectatePendingEmoji;
            this._spectatePendingEmoji = null;
        }
        return snapshot;
    }
;

// applySyncSnapshot
    UIController.prototype.applySyncSnapshot = function(s) {
        if (!s || !s.gc) return;
        this._applyingRemote = true;
        try {
            const gc = this.gameController;
            const prevRound = gc.currentRound;
            const prevPhase = gc.currentPhase;
            // 应用前记录本地"未提交操作"，用于检测本地操作被远端快照覆盖/回滚并提示用户
            const hadLocalExpr = this.expressionElements.length > 0;
            const prevExprStr = this.expressionElements.join('|');
            const prevTargets = (gc.roundState && gc.roundState.targetCells) ? gc.roundState.targetCells.length : 0;
            const prevForbidden = (gc.roundState && gc.roundState.forbiddenCells) ? gc.roundState.forbiddenCells.length : 0;
            const applied = gc.loadStateSnapshot(s.gc);
            // 以操作方为基准：轮到本方的回合内，不覆盖本方的表达式输入（避免吞字符）。
            // 用远端快照里的 currentPlayer 判断而非应用后的本地值：若快照因版本过滤被拒绝，
            // 本地 currentPlayer 未更新，用本地值判断会误判"轮到对方"而吞掉本方正在输入的表达式。
            const myId = this.p2pController && this.p2pController.myPlayerId;
            const isMyTurn = !!(myId && s.gc && s.gc.currentPlayer === myId);
            const newRound = gc.currentRound;
            const newPhase = gc.currentPhase;
            // 回合推进（进入新回合）：清空表达式与棋盘残留。
            // 操作方本地由 switchPlayer→roundComplete 清理；被动方靠快照推进时也必须清理，
            // 否则上一回合构造的表达式/目标格会残留到新回合（如构造方 y=1 残留、目标/禁止格残留）。
            // 此时刻意不采用 s.expr（操作方快照里可能仍带其本地输入残留），强制置空。
            const roundAdvanced = applied && newRound !== prevRound;
            // 兜底：只要进入 SELECT_TARGET（新回合开始，不允许输入表达式），就强制清空表达式残留。
            // 覆盖（applied=false 本地维持 SELECT_TARGET）或（roundAdvanced=false 应对端也推进过了）
            // 等场景，避免 y=1 等残留。
            const enteredSelectTarget = applied && newPhase === this.gameController.phases.SELECT_TARGET &&
                prevPhase !== this.gameController.phases.SELECT_TARGET;
            if (roundAdvanced || enteredSelectTarget) {
                this.expressionElements = [];
                this.cursorIndex = 0;
                this.gridSystem.clearAll();
            } else if (!isMyTurn) {
                this.expressionElements = (s.expr || []).slice();
                this.cursorIndex = (typeof s.cursorIndex === 'number') ? s.cursorIndex : this.expressionElements.length;
            }
            // ── 回滚提示：本地未提交操作被远端快照覆盖/清空时，明确告知用户 ──
            // 仅在同一回合内（非正常回合推进清理）检测，避免新回合清空被误报为"回滚"。
            if (applied && !roundAdvanced && !enteredSelectTarget) {
                const nowExprStr = this.expressionElements.join('|');
                const nowTargets = (gc.roundState && gc.roundState.targetCells) ? gc.roundState.targetCells.length : 0;
                const nowForbidden = (gc.roundState && gc.roundState.forbiddenCells) ? gc.roundState.forbiddenCells.length : 0;
                const exprReset = hadLocalExpr && nowExprStr !== prevExprStr;
                const targetsReset = prevTargets > 0 && nowTargets < prevTargets;
                const forbiddenReset = prevForbidden > 0 && nowForbidden < prevForbidden;
                if (exprReset || targetsReset || forbiddenReset) {
                    this.showMessage('状态已与对手同步：你未提交的操作已被重置', 'warning');
                }
            }
            // ── P2P 被动方音效：接收方对"对方选格/回合推进"给出声音反馈 ──
            // 仅在应用成功且本端非当前操作方（!isMyTurn）时播放，避免与本地交互音效叠加。
            if (applied && !isMyTurn && window.audioManager) {
                const nowTargets = (gc.roundState && gc.roundState.targetCells) ? gc.roundState.targetCells.length : 0;
                const nowForbidden = (gc.roundState && gc.roundState.forbiddenCells) ? gc.roundState.forbiddenCells.length : 0;
                if (roundAdvanced || enteredSelectTarget) {
                    window.audioManager.playPhaseChange();   // 新回合开始提示
                } else if (nowTargets > prevTargets || nowForbidden > prevForbidden) {
                    window.audioManager.playElementClick();  // 对方新增目标格/禁止格
                }
            }
            // P2P 快照只传历史函数解析式（剥离采样点）→ 应用后为缺 points 的历史函数
            // 用本地 renderer 重新采样，保证历史淡化绘图正常显示（传解析式、本地绘历史）。
            // 最多 2 个历史函数，每次采样开销很小；_renderFromState 会把补好点的
            // functionHistory 同步给 GridSystem 并绘制。
            if (applied && this.renderer && this.gridSystem) {
                const _hist = gc.functionHistory;
                if (Array.isArray(_hist)) {
                    const _range = this.gridSystem.getRange();
                    for (const _f of _hist) {
                        if (_f && _f.expression && !Array.isArray(_f.points)) {
                            try {
                                _f.points = this.renderer.sampleFunction(_f.expression, _range.min, _range.max);
                                _f.sampledRange = this.gridSystem.range;
                            } catch (e) {
                                _f.points = [];
                            }
                        }
                    }
                }
            }
            // 只有真正应用了新的状态才执行完整重绘，避免旧/重复快照触发不必要的重绘
            if (applied) this._renderFromState();
        } finally {
            this._applyingRemote = false;
        }
    }
;

// submitFunction
