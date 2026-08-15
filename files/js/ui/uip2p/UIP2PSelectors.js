/**
 * UIP2PSelectors —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * P2P 选择器与 stepper：难度/回合/时间限制、存档、清理
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

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
