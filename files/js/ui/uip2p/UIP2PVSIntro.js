/**
 * UIP2PVSIntro —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * P2P VS 入场动画
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

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
