/**
 * UICoreAI —— UICore 模块切片（UIController.prototype 挂载）
 *
 * 几何辅助、AI 回合触发与队列、当前回合/玩家名/表头
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype.isMouseNearFunction = function(mouseX, mouseY, points, thresholdPx) {
        const validPoints = points.filter(p => p.y !== null);
        
        for (let i = 0; i < validPoints.length - 1; i++) {
            const p1 = this.gridSystem.mathToCanvas(validPoints[i].x, validPoints[i].y);
            const p2 = this.gridSystem.mathToCanvas(validPoints[i + 1].x, validPoints[i + 1].y);
            
            // 计算点到线段的距离
            const distance = this.pointToLineDistance(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y);
            if (distance <= thresholdPx) {
                return true;
            }
        }
        
        return false;
    }
;

// pointToLineDistance
    UIController.prototype.pointToLineDistance = function(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            return Math.sqrt(A * A + B * B);
        }
        
        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param));
        
        const xx = x1 + param * C;
        const yy = y1 + param * D;
        
        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }
;

// triggerAITurn
    UIController.prototype.triggerAITurn = async function(phase) {
        // 测试模式不触发AI
        if (this.gameController.isTestMode()) return;

        // ★ 游戏已停止（退出后），不再触发AI
        if (!this._gameActive) return;

        // 只处理AI可以操作的阶段，忽略evaluate/switch_player等中间阶段
        const aiActionablePhases = ['select_target', 'set_forbidden', 'set_locks', 'input_function'];
        if (!aiActionablePhases.includes(phase)) {
            console.log(`[UI] 阶段 ${phase} 无需AI操作，跳过`);
            return;
        }

        // 检查当前是否是AI的回合
        const state = this.gameController.getGameState();
        if (state.currentPlayer !== 'B') {
            console.log('[UI] 当前不是AI的回合，跳过');
            return;
        }

        // 再次检查（异步期间可能已退出）
        if (!this._gameActive) return;

        // 添加到队列
        this.aiTriggerQueue.push(phase);
        console.log(`[UI] AI触发请求入队: ${phase}, 队列长度: ${this.aiTriggerQueue.length}`);
        
        // 如果正在处理，直接返回
        if (this.isProcessingAITrigger) {
            console.log('[UI] 正在处理AI触发，等待');
            return;
        }
        
        // 处理队列
        await this.processAITriggerQueue();
    }
;

// processAITriggerQueue
    UIController.prototype.processAITriggerQueue = async function() {
        if (this.aiTriggerQueue.length === 0 || this.isProcessingAITrigger) {
            return;
        }

        this.isProcessingAITrigger = true;

        while (this.aiTriggerQueue.length > 0) {
            // ★ 游戏已停止，立即清空队列退出
            if (!this._gameActive) {
                this.aiTriggerQueue = [];
                break;
            }

            const phase = this.aiTriggerQueue.shift();

            // 如果AI正在思考，将阶段放回队首并等待，避免phase丢失
            if (this.aiController.isThinking) {
                console.log('[UI] AI正在思考，等待完成');
                this.aiTriggerQueue.unshift(phase); // 放回队首，不丢弃
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            
            console.log(`[UI] 处理AI触发，阶段: ${phase}`);
            this.showMessage(`Summa 正在思考...`, 'info');
            
            try {
                await this.aiController.playTurn(phase);
                console.log('[UI] AI阶段完成');
            } catch (error) {
                console.error('[UI] AI阶段出错:', error);
            }
            
            // 等待一小段时间，让phaseChange事件有机会触发
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        this.isProcessingAITrigger = false;
        console.log('[UI] AI触发队列处理完毕');
    }
;

// _isMyTurn
    UIController.prototype._isMyTurn = function() {
        if (!this.isP2PMode || !this.p2pController) return true;
        const phase = this.gameController.currentPhase;
        const me = this.p2pController.myPlayerId;            // 'A' | 'B'
        const curr = this.gameController.currentPlayer;      // 当前应操作的玩家
        const isMine = (phase === 'select_target' || phase === 'set_forbidden' || phase === 'set_locks' || phase === 'input_function') && curr === me;
        // 仅在回合归属变化时输出，避免 P2P 下高频调用刷屏
        const turnKey = `${phase}|${me}|${curr}`;
        if (turnKey !== this._lastTurnLogKey) {
            this._lastTurnLogKey = turnKey;
            console.log(`[UI][Turn] phase=${phase}, me=${me}, currentPlayer=${curr}, isMyTurn=${isMine}`);
        }
        return isMine;
    }
;

// getPlayerDisplayName
    UIController.prototype.getPlayerDisplayName = function(playerId, turn = false) {
        if (!playerId) return '未知';

        const myName = (typeof PlayerProfile !== 'undefined' && typeof PlayerProfile.getNickname === 'function')
            ? PlayerProfile.getNickname() : null;

        // 观战端：优先使用房主快照携带的双方昵称（替代"玩家A/玩家B"）
        if (this._isSpectating && this._spectateNicknames && this._spectateNicknames[playerId]) {
            const sn = this._spectateNicknames[playerId];
            return turn ? `${sn}的回合` : sn;
        }

        const state = this.gameController?.getGameState();
        const gameMode = state?.gameMode;

        if (gameMode === 'p2p' && this.p2pController) {
            const isMe = playerId === this.p2pController.myPlayerId;
            const name = isMe
                ? (myName || '我')
                : (this._p2pOpponentProfile?.nickname || `玩家${playerId}`);
            return turn ? `${name}的回合` : name;
        }

        if (gameMode === 'ai') {
            const name = playerId === 'A' ? (myName || '玩家A') : 'Summa';
            return turn ? `${name}的回合` : name;
        }

        if (gameMode === 'local') {
            // 本地对战：固定显示"玩家A/玩家B"，不使用个人昵称
            const name = `玩家${playerId}`;
            return turn ? `${name}的回合` : name;
        }

        return `玩家${playerId}`;
    }
;

// updateHeaderPlayerNames
    // 顶部信息栏的玩家名（左侧 A / 右侧 B）随模式刷新：
    // 人机=自己/Summa；联机=双方真实昵称；观战=房主快照携带的昵称
    UIController.prototype.updateHeaderPlayerNames = function() {
        const aEl = this.playerNameAElement;
        const bEl = this.playerNameBElement;
        if (aEl) aEl.textContent = this.getPlayerDisplayName('A');
        if (bEl) bEl.textContent = this.getPlayerDisplayName('B');
    }
;

// _syncToPeer
    // confirmKey 非空 = 阶段切换确认推送（要求对方回 state_sync_ack，并带重发），不节流；
    // 否则为普通推送（有 50ms 节流）。
