/**
 * UICoreEvents —— UICore 模块切片（UIController.prototype 挂载）
 *
 * ELO 上报 _submitP2PELO、TTSigma、全局 bindEvents
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._submitP2PELO = function(data) {
        if (typeof PlayerProfile === 'undefined') return;
        const p2p = this.p2pController;
        if (!p2p || !data || !data.scores) return;
        const profile = PlayerProfile.getProfile();
        const opp = this._p2pOpponentProfile;
        // 对手身份未交换成功（异常情况）→ 静默跳过，不上报
        if (!opp || !opp.playerId) return;

        const scoreA = Number(data.scores.A) || 0;
        const scoreB = Number(data.scores.B) || 0;
        // 优先使用 GameController 的 authoritative winner（含 forcedWinner，如超时判负）
        const winner = data.winner || (scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : 'draw'));
        // [P7] 联调告警：若 authoritative winner 与比分推算冲突，记录以便排查跨端不一致
        if (data.winner && (data.winner === 'A' ? (scoreB > scoreA) : data.winner === 'B' ? (scoreA > scoreB) : false)) {
            console.warn(`[ELO] authoritative winner=${data.winner} 与比分(scoreA=${scoreA},scoreB=${scoreB})冲突，采用 authoritative winner`);
        }

        // roomCode + 对局 gen 组成唯一结算键：防止 rematch（房间码不变）被服务器去重误伤
        const roomKey = ((this._p2pRoomCode || p2p.roomCode) || 'room') + '#' + (p2p._gen || 0); // [P7] 用 UI 层持久真实房间码，避免正常结束时 p2p.roomCode 已被清空致去重失效
        this._leaderboardService.submitEloScore({
            nickname: profile.nickname,
            opponentPlayerId: opp.playerId,
            opponentNickname: opp.nickname || '棋手',
            scoreA,
            scoreB,
            winner,
            roomCode: roomKey
        });
    }
;

// calculateTTSigma
    UIController.prototype.calculateTTSigma = function() {
        const gc = this.gameController;
        if (!gc || typeof gc.getRaceBestTime !== 'function') return 0;
        let sum = 0;
        for (let lv = 1; lv <= 30; lv++) {
            let best;
            try { best = gc.getRaceBestTime(lv); } catch (e) { best = Infinity; }
            if (Number.isFinite(best) && best > 0) {
                const stars = (typeof gc.getRaceStarsByElapsed === 'function') ? gc.getRaceStarsByElapsed(best) : 1;
                sum += Number(stars) || 0;
            }
        }
        return sum;
    }
;

// bindEvents
    UIController.prototype.bindEvents = function() {
        // Canvas 点击事件
        this.gridSystem.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.gridSystem.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.gridSystem.canvas.addEventListener('mousemove', (e) => this.checkHistoryFunctionHover(e));
        
        // 按钮事件
        this.confirmBtn.addEventListener('click', () => this.handleConfirm());
        this.clearBtn.addEventListener('click', () => this.handleClear());
        this.exitBtn.addEventListener('click', () => this.handleExitClick());
        // 右下角圆形按钮：✓ 确认 / ← 返回退出
        this.confirmFabBtn = document.getElementById('confirm-fab-btn');
        this.exitFabBtn = document.getElementById('exit-fab-btn');
        if (this.confirmFabBtn) this.confirmFabBtn.addEventListener('click', () => this.handleConfirm());
        if (this.exitFabBtn) this.exitFabBtn.addEventListener('click', () => this.handleExitClick());
        if (this.skipBtn) this.skipBtn.addEventListener('click', () => {
            const gc = this.gameController;
            if (gc && gc.skipSubPhase) gc.skipSubPhase();
        });
        this.restartBtn.addEventListener('click', () => this.handleRestart());
        this.bindStartKeyboardSupport();
        this._bindModalDismissals();
        this._bindP2PDisconnectButtons();
        this.bindGlobalEsc();
        if (this.viewReportBtn) {
            this.viewReportBtn.addEventListener('click', () => this.showGameReport());
        }
        if (this.closeReportBtn) {
            this.closeReportBtn.addEventListener('click', () => this.hideGameReport());
        }
        
        // 退出气泡框事件
        if (this.cancelExitBtn) {
            this.cancelExitBtn.addEventListener('click', () => this.hideExitConfirm());
        }
        if (this.confirmExitBtn) {
            this.confirmExitBtn.addEventListener('click', () => this.handleExit());
        }
        
        // 表达式显示区点击删除与光标移动
        this.expressionDisplay.addEventListener('click', (e) => this.handleExpressionClick(e));
        this.bindExpressionScrollSupport();
        
        // 键盘输入事件
        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e), true);

        // 设备切换/旋转时重建元素面板（桌面网格 ↔ 移动端内联布局不同）
        window.addEventListener('devicechange', () => {
            if (this.gameController && this.gameController.currentPhase) {
                this.initDraggableElements();
            }
        });
        
        // 初始化拖拽元素
        this.initDraggableElements();
        
        // 测试模式函数面板：清空按钮 + 列表删除按钮（事件委托）
        const clearAllBtn = document.getElementById('test-fp-clear-all');
        if (clearAllBtn) clearAllBtn.addEventListener('click', () => this._handleTestFunctionsClearAll());
        const fpList = document.getElementById('test-fp-list');
        if (fpList) {
            fpList.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.test-fp-edit');
                if (editBtn) {
                    const editIndex = parseInt(editBtn.dataset.index, 10);
                    if (!isNaN(editIndex)) this._handleTestFunctionEdit(editIndex);
                    return;
                }
                const delBtn = e.target.closest('.test-fp-delete');
                if (!delBtn) return;
                const index = parseInt(delBtn.dataset.index, 10);
                if (!isNaN(index)) this._handleTestFunctionDelete(index);
            });
        }
    }
;

// renderTestFunctionPanel
