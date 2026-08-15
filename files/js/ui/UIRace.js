// Auto-split from UIController.js — prototype-attached methods (UIRace)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIRace] UIController must be loaded before this file');
}

// _raceTotalLevels
    UIController.prototype._raceTotalLevels = function() {
        return (this.raceLevels && this.raceLevels.length) ? this.raceLevels.length : 30;
    }
;
// 2026-08-15 修复 #59：竞速总关卡数单一来源（调用时求值，避免 RaceModeController 尚未加载时捕获到旧值 30）
UIController.prototype._raceMaxLevel = function() {
    return (typeof RaceModeController !== 'undefined' && RaceModeController.TOTAL_LEVELS) || 30;
};

// openRaceUI
    UIController.prototype.openRaceUI = function() {
        this.raceCurrentLevelId = null;
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(false);
        }
        this.showRaceLevelList();
        this.hideModal(this.startModal, () => {
            this.showModal(this.raceModal);
        });
        this.hideBattleUI();
        this.updateCampaignDrawDelayToggleVisibility();
        setTimeout(() => this.showRaceLevelList(), 0);
    }
;

// startRaceLevel
    UIController.prototype.startRaceLevel = function(levelId) {
        // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;
        const safeLevelId = Math.max(1, Math.min(this._raceMaxLevel(), Number(levelId) || 1));
        const unlocked = this.getRaceUnlockedLevels();
        if (safeLevelId > 1 && !unlocked.has(safeLevelId)) {
            this.showMessage('请先通关上一关解锁', 'warning');
            return;
        }
        this.raceCurrentLevelId = safeLevelId;
        this._markGameActive();
        this.clearRaceCountdown();
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(true);
        }
        if (this.gameController && typeof this.gameController.initRace === 'function') {
            // 进入内置关卡前，先清除自定义/多人标记，避免污染内置 30 关进度
            this.raceIsCustom = false;
            this.raceIsMultiplayer = false;
            if (this.gameController.raceState) {
                this.gameController.raceState.isCustom = false;
                this.gameController.raceState.customConfig = null;
            }
            this.gameController.initRace(safeLevelId);
        }
        this.hideModal(this.raceModal);
        this.hideModal(this.startModal);
    }
;

// closeRaceUI — backToCustom=true 时返回竞速试炼场自定义弹窗（2026-08-12）
    UIController.prototype.closeRaceUI = function(backToCustom) {
        this.raceCurrentLevelId = null;
        this.raceIsCustom = false;
        this.raceIsMultiplayer = false;
        // 退出竞速对局立即取消所有锁定（不影响文本框输入）
        this.clearAllLocks();
        if (this.gameController && this.gameController.raceState) {
            this.gameController.raceState.isCustom = false;
            this.gameController.raceState.customConfig = null;
        }
        this.clearRaceCountdown();
        if (this._raceElapsedTimer) {
            clearInterval(this._raceElapsedTimer);
            this._raceElapsedTimer = null;
        }
        this.hideModal(this.raceModal, () => {
            if (backToCustom) {
                this.openRaceCustomModal();
            } else {
                this.showModal(this.startModal);
            }
        });
        if (this.gameController && typeof this.gameController.cleanupRaceState === 'function') {
            this.gameController.cleanupRaceState();
        }
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(false);
        }
        this.restoreBattleUI();
    }
;

// showRaceUI
    UIController.prototype.showRaceUI = function() {
        this.openRaceUI();
    }
;

// hideRaceUI
    UIController.prototype.hideRaceUI = function() {
        if (this.raceLiveTimeValue) this.raceLiveTimeValue.style.display = 'none';
        if (this.raceModal) this.hideModal(this.raceModal);
    }
;

// getRaceLevels
    UIController.prototype.getRaceLevels = function() {
        return Array.from({ length: this._raceMaxLevel() }, (_, i) => ({ id: i + 1 }));
    }
;

// updateRaceTimerStyle
    UIController.prototype.updateRaceTimerStyle = function(remainingTime) {
        if (!this.timerElement) return;
        this.timerElement.classList.toggle('race-hyper', remainingTime > 20);
        this.timerElement.classList.toggle('race-critical', remainingTime <= 20 && remainingTime > 5);
        this.timerElement.classList.toggle('race-final', remainingTime <= 5);
    }
;

// renderRaceLevelList
    UIController.prototype.renderRaceLevelList = function() {
        if (!this.raceLevelGrid) return;
        const levels = this.raceLevels || [];
        this.raceCurrentLevelId = null;
        this._raceUnlockedLevels = this.getRaceUnlockedLevels();
        if (this.raceLevelTitle) this.raceLevelTitle.textContent = '选择等级';
        if (this.raceLevelProgress) this.raceLevelProgress.textContent = `共 ${levels.length} 关`;
        this.raceLevelGrid.innerHTML = '';

        const ttSigma = levels.reduce((sum, level) => {
            const bestTime = this.raceModeManager?.getBestTime?.(level.id);
            return Number.isFinite(bestTime) && bestTime > 0 ? sum + bestTime : sum;
        }, 0);
        this.updateRaceTTSigmaDisplay(ttSigma);

        levels.forEach(level => {
            const bestTime = this.raceModeManager?.getBestTime?.(level.id);
            const hasBestTime = Number.isFinite(bestTime) && bestTime > 0;
            const unlocked = !this._raceUnlockedLevels || this._raceUnlockedLevels.has(level.id) || level.id === 1;
            const cell = document.createElement('div');
            cell.className = 'campaign-level-cell race-level-cell';
            cell.style.cursor = unlocked ? 'pointer' : 'not-allowed';
            cell.style.pointerEvents = unlocked ? 'auto' : 'none';
            if (!unlocked) cell.classList.add('locked');
            cell.innerHTML = `
                <div class="campaign-cell-number">${level.id}</div>
                ${!unlocked ? '<div class="race-level-best-record">未解锁</div>' : (hasBestTime ? `<div class="race-level-best-record">最佳 ${bestTime.toFixed(2)}s</div>` : '')}
            `;
            cell.classList.add('race-level-cell');
            cell.onclick = () => {
                if (!unlocked) return;
                if (window.audioManager) window.audioManager.playClick();
                this.startRaceLevel(level.id);
            };
            this.raceLevelGrid.appendChild(cell);
        });
    }
;

// updateRaceTTSigmaDisplay
    UIController.prototype.updateRaceTTSigmaDisplay = function(sum = 0) {
        const display = document.getElementById('race-ttsigma-display');
        if (!display) return;
        const total = Number(sum);
        if (!Number.isFinite(total) || total <= 0) {
            display.innerHTML = '';
            display.style.display = 'none';
            return;
        }
        display.style.display = 'flex';
        // TTΣ 为已通关关卡的最佳用时之和（本地统计），在线榜改比每关最快用时（竞速分关榜）
        display.innerHTML = `<span class="lrsigma-label">TTΣ =</span> <span class="lrsigma-int">${total.toFixed(2).split('.')[0]}</span><span class="lrsigma-dec">.${total.toFixed(2).split('.')[1]}</span>`;
    }
;

// showRaceLevelList
    UIController.prototype.showRaceLevelList = function() {
        this.renderRaceLevelList();
        if (this.raceLevelTitle) this.raceLevelTitle.textContent = '选择等级';
        if (this.raceModal) {
            // ESC：返回主界面
            this.raceModal._dismissBound = true;
            this.raceModal._onEscDismiss = () => this.closeRaceUI();
            this.showModal(this.raceModal);
        }
        this.hideBattleUI();
        this.updateRaceModalBackground();
    }
;

// getRaceUnlockedLevels
    UIController.prototype.getRaceUnlockedLevels = function() {
        const unlocked = new Set([1]);
        try {
            const raw = localStorage.getItem('function_chess_race_unlocked_levels');
            const parsed = raw ? JSON.parse(raw) : [];
            for (const v of Array.isArray(parsed) ? parsed : []) {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 1 && n <= this._raceMaxLevel()) unlocked.add(n);
            }
        } catch {}
        return unlocked;
    }
;

// saveRaceUnlockedLevels
    UIController.prototype.saveRaceUnlockedLevels = function(levels) {
        try {
            const arr = Array.from(new Set([...(levels || [])])).filter(v => Number.isFinite(Number(v))).map(v => Math.max(1, Math.min(this._raceMaxLevel(), Number(v))));
            localStorage.setItem('function_chess_race_unlocked_levels', JSON.stringify(arr));
        } catch {}
    }
;

// unlockNextRaceLevel
    UIController.prototype.unlockNextRaceLevel = function(levelId) {
        const next = Math.min(this._raceMaxLevel(), Number(levelId) + 1);
        const levels = this.getRaceUnlockedLevels();
        levels.add(next);
        this.saveRaceUnlockedLevels(levels);
    }
;

// resetRaceProgress
    UIController.prototype.resetRaceProgress = async function() {
        try {
            const firstConfirm = await this.showGameDialog({
                title: '重置竞速进度',
                message: '你确定要重置所有竞速进度吗？\n此操作会清空竞速已解锁等级、最佳记录。',
                options: [
                    { label: '取消', value: false },
                    { label: '重置', value: true }
                ],
                showSkip: false
            });
            if (!firstConfirm) return;

            await new Promise(r => setTimeout(r, 200));

            const secondConfirm = await this.showGameDialog({
                title: '再次确认',
                message: '请再次确认：重置后将无法恢复已保存的竞速数据。\n是否同时在排行榜中保留你的成绩？',
                options: [
                    { label: '取消', value: 'cancel' },
                    { label: '重置并保留排行榜成绩', value: 'keep' },
                    { label: '重置并清除排行榜成绩', value: 'wipe' }
                ],
                showSkip: false
            });
            if (!secondConfirm || secondConfirm === 'cancel') return;

            // 2026-08-15 修复 #61：bestTimes 单一写者已统一为 RaceModeManager.clearProgress，
            // 不再由 RaceModeController 重复写同一 localStorage key（避免两处都写 function_chess_race_best_times）
            if (this.raceModeManager) {
                this.raceModeManager.clearProgress();
            }
            try {
                localStorage.removeItem('function_chess_race_best_times');
                localStorage.removeItem('function_chess_race_unlocked_levels');
            } catch {}
            this.raceLevels = this.getRaceLevels();
            this.raceCurrentLevelId = null;
            this.renderRaceLevelList();
            this.showMessage('✅ 竞速进度已重置', 'success');

            // 排行榜：仅当玩家选择"清除"时才删除自己在 rt* 分关榜上的记录
            if (secondConfirm === 'wipe' && this._leaderboardService) {
                try {
                    const res = await this._leaderboardService.deleteMyScores('race');
                    if (typeof this.refreshLeaderboardIfOpen === 'function') this.refreshLeaderboardIfOpen();
                    if (res && res.ok) {
                        this.showMessage('🏆 已清除排行榜中的竞速成绩', 'success');
                    } else {
                        this.showMessage('⚠️ 排行榜成绩清除失败（服务器未连接？），本地进度已重置', 'error');
                    }
                } catch (e) { console.error('[LB] 清除竞速排行榜成绩失败:', e); }
            }
        } catch (e) {
            this.showMessage('❌ 重置失败', 'error');
        }
    }
;

// updateRaceModalBackground
    UIController.prototype.updateRaceModalBackground = function() {
        if (!this.raceModal) return;
        const content = this.raceModal.querySelector('.modal-content');
        if (content) content.classList.add('campaign-modal-content');
    }
;

// showRaceBattleUI
    UIController.prototype.showRaceBattleUI = function(data) {
        this.battleUiHidden = false;
        if (this.header) this.header.classList.add('campaign-mode');
        document.querySelectorAll('.score-display').forEach(el => el.style.display = 'none');
        if (this.currentPlayerElement && this.currentPlayerElement.parentElement) this.currentPlayerElement.parentElement.style.display = 'none';
        if (this.timerElement && this.timerElement.parentElement) this.timerElement.parentElement.style.display = 'none';
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = 'none';
        if (this.raceLiveTimeValue) this.raceLiveTimeValue.style.display = 'block';
        this.updateCampaignDrawDelayToggleVisibility();
        this.updateRaceBattleUI(data?.currentRound || this.raceCurrentLevelId || 1, 0);
        if (this._raceElapsedTimer) clearInterval(this._raceElapsedTimer);
        this._raceElapsedTimer = null;
    }
;

// updateRaceBattleUI
    UIController.prototype.updateRaceBattleUI = function(levelId, elapsedSeconds = 0) {
        if (this.raceIsCustom) {
            // 自定义竞速：显示「自定义」徽标，不展示内置最佳成绩
            if (this.roundElement) this.roundElement.textContent = '自定义';
            const badge = document.getElementById('campaign-level-badge');
            const value = document.getElementById('campaign-level-value');
            if (badge && value) {
                badge.style.display = 'inline-flex';
                value.textContent = '自定义竞速';
            }
            if (this.raceLiveTimeValue) this.raceLiveTimeValue.textContent = `${Number(elapsedSeconds || 0).toFixed(2)}s`;
            return;
        }
        this.roundElement.textContent = levelId;
        this.totalRoundsElement.textContent = this._raceTotalLevels();
        const badge = document.getElementById('campaign-level-badge');
        const value = document.getElementById('campaign-level-value');
        const bestTime = this.raceModeController?.getBest?.(levelId) ?? this.raceModeManager?.getBestTime?.(levelId);
        const displayBest = Number.isFinite(bestTime) && bestTime > 0 ? bestTime : Infinity;
        if (badge && value) {
            badge.style.display = 'inline-flex';
            value.textContent = Number.isFinite(displayBest) && displayBest > 0 ? `Lv. ${levelId}  best:${displayBest.toFixed(2)}s` : `Lv. ${levelId}`;
        }
        if (this.raceLiveTimeValue) this.raceLiveTimeValue.textContent = `${Number(elapsedSeconds || 0).toFixed(2)}s`;
    }
;

// updateRacePuzzleProgress
    UIController.prototype.updateRacePuzzleProgress = function(solved, total) {
        if (!this.raceLevelProgress) return;
        const progress = this.gameController?.getRaceProgress?.() || { cleared: 0, stars: 0 };
        this.raceLevelProgress.textContent = `已完成 ${Number(solved) || 0}/${Number(total) || 10} 个谜题 · 已通关 ${progress.cleared}/${this._raceTotalLevels()}，TT∑分：${progress.stars}`;
        if (this.raceLiveTimeValue) {
            const elapsed = this.gameController?.getRaceElapsedSeconds?.() || 0;
            this.raceLiveTimeValue.textContent = `${elapsed.toFixed(2)}s`;
        }
    }
;

// showRaceVictory
    UIController.prototype.showRaceVictory = function(data) {
        if (!this.raceVictoryModal) return;
        if (window.audioManager) window.audioManager.playSuccess();
        const levelId = Number(data?.levelId || this.raceCurrentLevelId || 1);
        const elapsed = Number(data?.elapsed || 0);
        const totalSolved = Number(data?.totalSolved || 10) || 10;
        const previousBestTime = Number.isFinite(Number(data?.previousBestTime)) ? Number(data.previousBestTime) : Infinity;
        const hasPreviousBest = Number.isFinite(previousBestTime) && previousBestTime > 0;
        const diff = hasPreviousBest ? (elapsed - previousBestTime) : null;
        const isNewRecord = !!data?.isNewBest;

        const timeEl = this.raceVictoryTime;
        const diffEl = this.raceVictoryDiff;
        const bestEl = this.raceVictoryBest;
        const levelEl = this.raceVictoryLevel;
        const levelText = this.raceIsCustom ? '自定义' : `LEVEL ${String(levelId).padStart(2, '0')}`;

        if (levelEl) levelEl.textContent = levelText;
        if (timeEl) timeEl.textContent = `${elapsed.toFixed(2)}s`;
        if (diffEl) {
            if (diff === null || !Number.isFinite(diff)) {
                diffEl.textContent = '';
                diffEl.className = 'race-victory-diff';
                diffEl.style.display = 'none';
            } else {
                const formatted = `${diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(1)}s`;
                diffEl.textContent = formatted;
                diffEl.style.display = 'block';
                diffEl.className = `race-victory-diff ${diff >= 0 ? 'negative' : 'positive'}`;
            }
        }
        if (bestEl) {
            bestEl.textContent = hasPreviousBest ? `当前最佳：${previousBestTime.toFixed(2)}s` : `首次通关！`;
        }

        const nextBtn = document.getElementById('race-victory-next-btn');
        if (nextBtn) nextBtn.textContent = this.raceIsCustom ? '返回主菜单' : '进入下一等级';
        // 试炼场（自定义关）：结算弹窗左侧按钮改为「返回主菜单」
        const selectBtn = document.getElementById('race-victory-level-select-btn');
        if (selectBtn) selectBtn.textContent = this.raceIsCustom ? '返回主菜单' : '返回等级选择';
        this.renderRaceVictoryDetails(data, { levelId, elapsed, totalSolved, previousBestTime, hasPreviousBest, diff, isNewRecord });
        // 排行榜：竞速通关后把 TT∑ 星分累计写回本地进度（与竞速内部星级规则一致），
        // 并自动上报该关最佳用时到「竞速分关榜」rt{level}（每关一张小榜，取更短者；自定义关/多人对战不参与）
        if (!this.raceIsCustom && !this.raceIsMultiplayer && this._leaderboardService && typeof PlayerProfile !== 'undefined') {
            try {
                const gc = this.gameController;
                const lv = Number(data.levelId || this.raceCurrentLevelId || 1);
                if (gc && typeof gc.getRaceProgress === 'function' && typeof gc.setRaceProgress === 'function') {
                    const prev = gc.getRaceProgress();
                    const ttSigma = this.calculateTTSigma();
                    if (ttSigma > 0) {
                        gc.setRaceProgress({ cleared: Math.max(prev.cleared || 0, lv), stars: ttSigma });
                    }
                }
                // 该关当前最佳用时（已通关取历史最佳，否则取本次用时）
                const bestTime = (hasPreviousBest && previousBestTime < elapsed) ? Number(previousBestTime) : Number(elapsed);
                if (Number.isFinite(bestTime) && bestTime > 0) {
                    const lastKey = 'function_chess_rt_last_' + lv;
                    const last = Number(localStorage.getItem(lastKey) || 0);
                    if (bestTime < last || last === 0) {
                        try { localStorage.setItem(lastKey, String(bestTime)); } catch (e2) { /* 忽略 */ }
                        const profile = PlayerProfile.getProfile();
                        // 附题数供服务器难度下限拦截（通关必然解满 10 题）
                        const solved = Number(data.solvedCount) || 0;
                        const totalR = Number(data.totalSolved) || solved;
                        // 阶段一：携带服务端权威计时会话（raceSessionId）上报；无会话也照常提交，由服务端拒绝（强制权威计时）
                        const doSubmit = (sessionId) => {
                            this._leaderboardService.submitRaceTime(lv, bestTime, profile.nickname, solved, totalR, sessionId);
                            this.refreshLeaderboardIfOpen();
                        };
                        if (this._raceSessionPromise) {
                            this._raceSessionPromise.then((sid) => doSubmit(sid)).catch(() => doSubmit(null));
                        } else {
                            doSubmit(null);
                        }
                    }
                }
            } catch (e) { /* 上报失败静默降级，不影响结算界面 */ }
        }
        this.showModal(this.raceVictoryModal);
    }
;

// startRaceElapsedTimer（旧实现已被下方同名的第二版覆盖，此处删除重复定义：
// 第一版基于 Date.now() 计时、第二版基于 raceState.startedAt 并兼容冻结/阈值逻辑，
// 第二版实际生效，第一版属于死代码）


// playRaceNewRecordIntro
    UIController.prototype.playRaceNewRecordIntro = function(done) {
        const existing = document.getElementById('race-new-record-overlay');
        if (existing) existing.remove();
        if (window.audioManager) window.audioManager.playRaceFanfare?.();

        const overlay = document.createElement('div');
        overlay.id = 'race-new-record-overlay';
        overlay.className = 'race-new-record-overlay';
        overlay.innerHTML = `
            <div class="race-new-record-rings" aria-hidden="true"></div>
            <div class="race-new-record-panel">
                <div class="race-new-record-tag">NEW RECORD!</div>
                <div class="race-new-record-sub">PIT LANE CHECKPOINT</div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));

        const finish = () => {
            overlay.classList.remove('visible');
            overlay.classList.add('exiting');
            window.setTimeout(() => {
                overlay.remove();
                if (typeof done === 'function') done();
            }, 520);
        };

        window.setTimeout(finish, 1400);
    }
;

// startRaceCountdown
    UIController.prototype.startRaceCountdown = function() {
        if (this.gameController?.gameMode !== 'race') return;
        this.clearRaceCountdown();
        this.stopRaceElapsedTimer();
        this._raceCountdownActive = true;
        this._raceCountdownLockReason = '竞速模式启动倒计时';
        this.disableRaceInput(true);
        const overlay = this.ensureRaceCountdownOverlay();
        if (overlay) {
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.zIndex = '999999';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.pointerEvents = 'none';
            const backdrop = overlay.querySelector('.race-countdown-backdrop');
            if (backdrop) {
                backdrop.style.position = 'absolute';
                backdrop.style.inset = '0';
                backdrop.style.backdropFilter = 'blur(12px)';
                backdrop.style.background = 'rgba(0,0,0,0.18)';
            }
            const core = overlay.querySelector('.race-countdown-core');
            if (core) {
                core.style.position = 'relative';
                core.style.display = 'flex';
                core.style.flexDirection = 'column';
                core.style.alignItems = 'center';
                core.style.justifyContent = 'center';
                core.style.gap = '8px';
                core.style.minWidth = '280px';
                core.style.minHeight = '280px';
            }
            const ring = overlay.querySelector('.race-countdown-ring');
            if (ring) {
                ring.style.position = 'absolute';
                ring.style.inset = '0';
                ring.style.borderRadius = '50%';
                ring.style.border = '2px solid rgba(45,212,191,0.22)';
                ring.style.boxShadow = '0 0 44px rgba(45,212,191,0.22), inset 0 0 40px rgba(59,130,246,0.12)';
                ring.style.animation = 'raceCountdownRing 0.8s ease-in-out infinite alternate';
            }
            const number = overlay.querySelector('.race-countdown-number');
            if (number) {
                number.style.fontSize = 'clamp(120px, 18vw, 220px)';
                number.style.lineHeight = '0.88';
                number.style.fontWeight = '900';
                number.style.letterSpacing = '0.04em';
                number.style.color = '#ffffff';
                number.style.textShadow = '0 0 18px rgba(255,255,255,0.45), 0 0 36px rgba(45,212,191,0.35), 0 0 72px rgba(59,130,246,0.25)';
                number.style.animation = 'raceCountdownNumber 0.72s cubic-bezier(0.2, 0.9, 0.2, 1.2) infinite alternate';
            }
            const sub = overlay.querySelector('.race-countdown-sub');
            if (sub) {
                sub.style.display = 'none';
            }
        }
        this.playRaceCountdownTick(3);
        let count = 3;
        const step = () => {
            if (!this._raceCountdownActive) return;
            this.updateRaceCountdownOverlay(count);
            if (count <= 0) {
                this.clearRaceCountdown();
                this.disableRaceInput(false);
                this.hideRaceCountdownOverlay(true);
                this.startRaceElapsedTimer();
                if (window.audioManager) window.audioManager.playRaceLaunch?.();
                this.showMessage('竞速开始！', 'success');
                return;
            }
            if (count < 3) this.playRaceCountdownTick(count);
            count--;
            this._raceCountdownTimer = window.setTimeout(step, 850);
        };
        step();
    }
;

// clearRaceCountdown
    UIController.prototype.clearRaceCountdown = function() {
        this._raceCountdownActive = false;
        if (this._raceCountdownTimer) {
            clearTimeout(this._raceCountdownTimer);
            this._raceCountdownTimer = null;
        }
        this.hideRaceCountdownOverlay(false);
    }
;

// startRaceElapsedTimer
    UIController.prototype.startRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) clearInterval(this._raceElapsedTimer);
        if (this.gameController?.gameMode !== 'race' || !this.gameController?.raceState?.active) return;
        if (!this.gameController.raceState.startedAt) this.gameController.startRaceTimer?.();
        // 阶段一：单人竞速（非自定义关）正式起跑时向服务器申请权威计时会话（每关一个）
        this._raceSessionPromise = null;
        const raceLevelId = Number(this.raceCurrentLevelId);
        if (!this.raceIsMultiplayer && !this.raceIsCustom && raceLevelId >= 1 && this._leaderboardService && typeof this._leaderboardService.startRaceSession === 'function') {
            this._raceSessionPromise = this._leaderboardService.startRaceSession(raceLevelId);
        }
        this._raceTriggeredThresholds = new Set();
        this._raceElapsedStart = this.gameController.raceState.startedAt || Date.now();
        this._raceElapsedFrozen = false;
        const levelId = this.raceCurrentLevelId || this.gameController?.raceState?.currentLevelId || 1;
        this._raceElapsedTimer = setInterval(() => {
            if (!this.gameController || this.gameController.gameMode !== 'race' || !this.gameController.raceState?.active) {
                this.stopRaceElapsedTimer();
                return;
            }
            const elapsed = this.gameController.getRaceElapsedSeconds ? this.gameController.getRaceElapsedSeconds() : ((Date.now() - this._raceElapsedStart) / 1000);
            this.updateRaceBattleUI(levelId, elapsed);
            this.updateRaceCountdownElapsed(elapsed);
        }, 50);
    }
;

// stopRaceElapsedTimer
    UIController.prototype.stopRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) {
            clearInterval(this._raceElapsedTimer);
            this._raceElapsedTimer = null;
        }
        // 冻结倒计时阈值触发（startRaceElapsedTimer 会重置 false）；
        // 否则 updateRaceCountdownElapsed 的 _raceElapsedFrozen 分支永为死代码
        this._raceElapsedFrozen = true;
    }
;

// disableRaceInput
    UIController.prototype.disableRaceInput = function(disabled) {
        const canvas = this.gridSystem?.canvas;
        if (canvas) canvas.style.pointerEvents = disabled ? 'none' : '';
        [this.confirmBtn, this.clearBtn, this.exitBtn].forEach(btn => {
            if (!btn) return;
            btn.disabled = disabled && btn !== this.exitBtn;
        });
        if (this.elementsContainer) this.elementsContainer.style.pointerEvents = disabled ? 'none' : '';
        if (this.expressionDisplay) this.expressionDisplay.style.pointerEvents = disabled ? 'none' : '';
    }
;

// ensureRaceCountdownOverlay
    UIController.prototype.ensureRaceCountdownOverlay = function() {
        let overlay = document.getElementById('race-countdown-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'race-countdown-overlay';
        overlay.className = 'race-countdown-overlay';
        overlay.innerHTML = `
            <div class="race-countdown-backdrop"></div>
            <div class="race-countdown-core">
                <div class="race-countdown-ring"></div>
                <div class="race-countdown-number">3</div>
                <div class="race-countdown-sub">READY</div>
            </div>`;
        document.body.appendChild(overlay);
        this._raceCountdownOverlay = overlay;
        return overlay;
    }
;

// updateRaceCountdownOverlay
    UIController.prototype.updateRaceCountdownOverlay = function(value) {
        const overlay = this.ensureRaceCountdownOverlay();
        const numberEl = overlay.querySelector('.race-countdown-number');
        const subEl = overlay.querySelector('.race-countdown-sub');
        if (numberEl) numberEl.textContent = String(Math.max(0, value));
        if (subEl) subEl.textContent = value > 0 ? 'READY' : '';
        overlay.classList.remove('flash');
        void overlay.offsetWidth;
        overlay.classList.add('flash');
        if (window.audioManager) {
            if (value === 3) window.audioManager.playRaceCountdown?.();
            else if (value === 2) window.audioManager.playRaceBeep?.();
            else if (value === 1) window.audioManager.playRaceAlert?.();
        }
    }
;

// hideRaceCountdownOverlay
    UIController.prototype.hideRaceCountdownOverlay = function(fade = false) {
        const overlay = this._raceCountdownOverlay || document.getElementById('race-countdown-overlay');
        if (!overlay) return;
        if (fade) overlay.classList.add('hide');
        window.setTimeout(() => {
            overlay.remove();
            if (this._raceCountdownOverlay === overlay) this._raceCountdownOverlay = null;
        }, fade ? 380 : 0);
    }
;

// playRaceCountdownTick
    UIController.prototype.playRaceCountdownTick = function(num) {
        if (!window.audioManager) return;
        if (num === 3) window.audioManager.playRaceCountdown?.();
        else if (num === 2) window.audioManager.playRaceBeep?.();
        else if (num === 1) window.audioManager.playRaceAlert?.();
        else window.audioManager.playRaceLaunch?.();
    }
;

// updateRaceCountdownElapsed
    UIController.prototype.updateRaceCountdownElapsed = function(elapsed) {
        if (this._raceElapsedFrozen) return;
        if (this.gameController?.gameMode !== 'race') return;
        const t = Math.floor(Number(elapsed) || 0);
        if (!this._raceThresholds?.length) return;
        if (!this._raceTriggeredThresholds) this._raceTriggeredThresholds = new Set();
        for (const threshold of this._raceThresholds) {
            if (t === threshold && !this._raceTriggeredThresholds.has(threshold)) {
                this._raceTriggeredThresholds.add(threshold);
                this.showRaceThresholdReminder(threshold);
            }
        }
    }
;

// showRaceThresholdReminder
    UIController.prototype.showRaceThresholdReminder = function(threshold) {
        if (this.gameController?.gameMode !== 'race') return;
        const badge = document.createElement('div');
        badge.className = 'race-threshold-reminder';
        badge.textContent = `${threshold}s`;
        badge.style.position = 'fixed';
        badge.style.left = '50%';
        badge.style.top = '50%';
        badge.style.transform = 'translate(-50%, -50%) scale(0.9)';
        badge.style.zIndex = '999998';
        badge.style.pointerEvents = 'none';
        badge.style.padding = '8px 18px';
        badge.style.borderRadius = '999px';
        badge.style.background = 'rgba(6, 10, 20, 0.18)';
        badge.style.border = '1px solid rgba(255,255,255,0.10)';
        badge.style.color = '#f8fafc';
        badge.style.fontSize = 'clamp(22px, 3vw, 30px)';
        badge.style.fontWeight = '800';
        badge.style.letterSpacing = '0.08em';
        badge.style.textShadow = '0 0 12px rgba(255,255,255,0.28), 0 0 22px rgba(45,212,191,0.22)';
        badge.style.boxShadow = '0 0 18px rgba(45,212,191,0.12)';
        badge.style.opacity = '0';
        badge.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        badge.style.animation = 'raceThresholdPop 0.8s ease-out both';
        document.body.appendChild(badge);
        requestAnimationFrame(() => {
            badge.style.opacity = '1';
            badge.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        if (window.audioManager) window.audioManager.playRaceAlert?.();
        window.setTimeout(() => {
            badge.style.opacity = '0';
            badge.style.transform = 'translate(-50%, -50%) scale(0.96)';
            window.setTimeout(() => badge.remove(), 420);
        }, 1000);
    }
;

// renderRaceVictoryDetails
    UIController.prototype.renderRaceVictoryDetails = function(data, meta) {
        const host = this.raceVictoryModal?.querySelector('.race-victory-extra');
        if (!host) return;
        const { levelId, elapsed, totalSolved, previousBestTime, hasPreviousBest, diff, isNewRecord } = meta;
        host.innerHTML = `
            <div class="race-victory-extra-line">关卡 ${levelId} · ${totalSolved} 谜题 · ${elapsed.toFixed(2)}s</div>
            <div class="race-victory-extra-line">${isNewRecord ? 'NEW BEST' : '稳定发挥'} · ${hasPreviousBest ? `PB ${previousBestTime.toFixed(2)}s` : 'PB 未记录'}</div>
            <div class="race-victory-extra-line">${diff === null ? '首通记录已建立' : (diff < 0 ? '领先最佳成绩' : (diff === 0 ? '追平最佳成绩' : '仍可再快一点'))}</div>
        `;
    }
;

// backToRaceLevelListFromVictory
    UIController.prototype.backToRaceLevelListFromVictory = function() {
        this.hideRaceVictory();
        if (this.raceIsCustom) {
            // 试炼场（自定义关）：无内置等级列表可回，返回试炼场自定义弹窗（保留上次配置）
            this.closeRaceUI(true);
            return;
        }
        this.showRaceLevelList();
    }
;

// hideRaceVictory
    UIController.prototype.hideRaceVictory = function() {
        if (this.raceVictoryModal) this.hideModal(this.raceVictoryModal);
    }
;

// retryRaceLevel
    UIController.prototype.retryRaceLevel = function() {
        this.hideRaceVictory();
        if (this.raceIsCustom && this._lastRaceCustomConfig) {
            this._replayCustomRace();
            return;
        }
        const levelId = this.raceCurrentLevelId || 1;
        this.hideRaceVictory();
        this.startRaceLevel(levelId);
    }
;

// goToNextRaceLevel
    UIController.prototype.goToNextRaceLevel = function() {
        if (this.raceIsCustom) {
            // 自定义关无下一内置关：返回选关列表
            this.backToRaceLevelListFromVictory();
            return;
        }
        const next = Math.min(this._raceMaxLevel(), (this.raceCurrentLevelId || 1) + 1);
        const unlocked = this.getRaceUnlockedLevels();
        if (!unlocked.has(next)) {
            this.showMessage('请先通关上一关解锁', 'warning');
            return;
        }
        this.hideRaceVictory();
        this.startRaceLevel(next);
    }
;

// _replayCustomRace — 重玩上一次的自定义竞速配置
    UIController.prototype._replayCustomRace = function() {
        // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;
        const config = this._lastRaceCustomConfig;
        if (!config) { this.backToRaceLevelListFromVictory(); return; }
        this.gameController.raceState.customConfig = config;
        this.gameController.raceState.isCustom = true;
        this.raceIsCustom = true;
        this._markGameActive();
        this.clearRaceCountdown();
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(true);
        }
        this.gameController.initRace(1);
        this.gameController.raceState.currentLevelId = 0;
        this.gameController.currentRound = 0;
        this.raceCurrentLevelId = 0;
        this.hideModal(this.raceModal);
        this.hideModal(this.startModal);
        if (window.audioManager) window.audioManager.playClick();
    }
;

// initRaceCustom — 绑定竞速自定义弹窗内的按钮与实时校验
    UIController.prototype.initRaceCustom = function() {
        this.raceIsCustom = false;
        const startBtn = document.getElementById('race-custom-start');
        const cancelBtn = document.getElementById('race-custom-cancel');
        const allowedEl = document.getElementById('race-custom-allowed');
        const forbiddenEl = document.getElementById('race-custom-forbidden');
        const locksEl = document.getElementById('race-custom-locks');
        if (!startBtn || !cancelBtn) return;

        // 反三角函数是否启用：完全跟随主界面开关（不在自定义界面内选择）
        const syncArcNote = () => {
            const arcOn = this.getInverseTrigEnabled ? this.getInverseTrigEnabled() : false;
            const maxLocks = arcOn ? 23 : 20;
            if (locksEl) locksEl.max = String(maxLocks);
            const renderLocks = this._raceStepperRenders && this._raceStepperRenders['race-custom-locks'];
            if (renderLocks) renderLocks();
            this._refreshRaceCustomHint();
        };
        [allowedEl, forbiddenEl, locksEl].forEach(el => {
            if (el) el.addEventListener('input', () => this._refreshRaceCustomHint());
        });
        cancelBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.closeRaceCustomModal();
        });
        startBtn.addEventListener('click', () => this.startCustomRace());
        this._raceCustomSyncArcNote = syncArcNote;
        this.initRaceCustomSteppers();
        syncArcNote();
    }
;

// initRaceCustomSteppers — 把数字输入做成与主界面回合数同款的左右箭头步进器（支持长按连续增减，且中间数字可直接键入）
    UIController.prototype.initRaceCustomSteppers = function() {
        this._raceStepperRenders = {};
        const defs = [
            { id: 'race-custom-allowed', min: 1 },
            { id: 'race-custom-forbidden', min: 0 },
            { id: 'race-custom-locks', min: 0 },
        ];
        const self = this;
        defs.forEach(def => {
            const input = document.getElementById(def.id);
            const prev = document.getElementById(def.id + '-prev');
            const next = document.getElementById(def.id + '-next');
            if (!input || !prev || !next) return;
            const maxOf = () => Number(input.max) || 9999;
            const clamp = v => Math.max(def.min, Math.min(maxOf(), v));
            // 仅更新左右箭头可用状态（不覆盖输入框内容，避免干扰直接键入）
            const updateArrows = () => {
                const raw = Number(input.value);
                const cur = isNaN(raw) ? def.min : raw;
                prev.disabled = cur <= def.min;
                next.disabled = cur >= maxOf();
            };
            // 步进 / 失焦归一化：钳制到 [min, max] 并写回输入框
            const commit = (delta) => {
                let v = Number(input.value);
                if (isNaN(v)) v = def.min;
                if (typeof delta === 'number') v = clamp(v + delta);
                else v = clamp(v);
                input.value = String(v);
                updateArrows();
                self._refreshRaceCustomHint();
            };
            const step = delta => {
                if (window.audioManager) window.audioManager.playClick();
                commit(delta);
            };
            const attach = (btn, delta) => {
                let timer = null, interval = null;
                const start = () => {
                    step(delta);
                    timer = setTimeout(() => { interval = setInterval(() => step(delta), 70); }, 300);
                };
                const stop = () => {
                    if (timer) { clearTimeout(timer); timer = null; }
                    if (interval) { clearInterval(interval); interval = null; }
                };
                btn.addEventListener('mousedown', e => { e.preventDefault(); start(); });
                btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
                ['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'blur'].forEach(ev => btn.addEventListener(ev, stop));
                btn.addEventListener('click', e => e.preventDefault());
            };
            attach(prev, -1);
            attach(next, 1);
            // 直接键入：实时更新箭头与提示，但不在输入过程中覆盖内容；失焦时归一化
            input.addEventListener('input', () => { updateArrows(); self._refreshRaceCustomHint(); });
            input.addEventListener('blur', () => commit());
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); self.startCustomRace(); } });
            self._raceStepperRenders[def.id] = commit;
            commit();
        });
    }
;

// openRaceCustomModal — 打开竞速试炼场弹窗（从主界面竞速子模式进入）
    UIController.prototype.openRaceCustomModal = function() {
        const modal = document.getElementById('race-custom-modal');
        if (!modal) return;
        if (this._raceCustomSyncArcNote) this._raceCustomSyncArcNote();
        if (this._raceStepperRenders) { for (const k in this._raceStepperRenders) this._raceStepperRenders[k](); }
        // 先隐藏开始界面弹窗，再打开试炼场弹窗
        this.hideModal(this.startModal, () => {
            this.showModal(modal);
        });
    }
;

// closeRaceCustomModal — 关闭试炼场弹窗并回到主界面（开始界面）
    UIController.prototype.closeRaceCustomModal = function() {
        const modal = document.getElementById('race-custom-modal');
        if (modal) this.hideModal(modal);
        if (this.startModal) this.showModal(this.startModal);
    }
;

// _getRaceCustomArcEnabled — 反三角函数是否启用：跟随主界面开关，不在弹窗内选择
    UIController.prototype._getRaceCustomArcEnabled = function() {
        return !!(this.getInverseTrigEnabled && this.getInverseTrigEnabled());
    }
;

// _refreshRaceCustomHint — 实时校验并给出提示
    UIController.prototype._refreshRaceCustomHint = function() {
        const allowedEl = document.getElementById('race-custom-allowed');
        const forbiddenEl = document.getElementById('race-custom-forbidden');
        const locksEl = document.getElementById('race-custom-locks');
        const hintEl = document.getElementById('race-custom-hint');
        if (!hintEl) return;
        const arcEnabled = this._getRaceCustomArcEnabled();
        const maxLocks = arcEnabled ? 23 : 20;
        const allowed = Number(allowedEl && allowedEl.value);
        const forbidden = Number(forbiddenEl && forbiddenEl.value);
        const locks = Number(locksEl && locksEl.value);
        const msgs = [];
        if (!Number.isInteger(allowed) || allowed < 1) msgs.push('允许区数量需为 ≥1 的整数');
        if (!Number.isInteger(forbidden) || forbidden < 0) msgs.push('禁止区数量需为 ≥0 的整数');
        if (allowed + forbidden >= 400) msgs.push('允许区 + 禁止区 数量之和须 < 400');
        if (!Number.isInteger(locks) || locks < 0) msgs.push('锁定元素数量需为 ≥0 的整数');
        if (locks > maxLocks) msgs.push(`锁定元素数量上限为 ${maxLocks}（${arcEnabled ? '已启用 arc' : '未启用 arc'}）`);
        const ok = msgs.length === 0;
        hintEl.textContent = ok
            ? `配置有效：允许 ${allowed} + 禁止 ${forbidden} = ${allowed + forbidden}，锁定 ${locks}${arcEnabled ? '（含 arc）' : ''}`
            : msgs.join('；');
        hintEl.style.color = ok ? '#22c55e' : '#f87171';
        const startBtn = document.getElementById('race-custom-start');
        if (startBtn) startBtn.disabled = !ok;
    }
;

// startCustomRace — 读取校验并生成自定义竞速关卡
    UIController.prototype.startCustomRace = function() {
        // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
        if (this._guardPendingOnlineMatch()) return;
        const allowedEl = document.getElementById('race-custom-allowed');
        const forbiddenEl = document.getElementById('race-custom-forbidden');
        const locksEl = document.getElementById('race-custom-locks');
        if (!allowedEl || !forbiddenEl || !locksEl) return;
        const arcEnabled = this._getRaceCustomArcEnabled();
        const maxLocks = arcEnabled ? 23 : 20;
        const allowed = Number(allowedEl.value);
        const forbidden = Number(forbiddenEl.value);
        const locks = Number(locksEl.value);
        if (!Number.isInteger(allowed) || allowed < 1
            || !Number.isInteger(forbidden) || forbidden < 0
            || allowed + forbidden >= 400
            || !Number.isInteger(locks) || locks < 0 || locks > maxLocks) {
            this._refreshRaceCustomHint();
            this.showMessage('配置无效，请检查输入', 'warning');
            return;
        }
        const config = {
            allowed,
            forbidden,
            fixedLocks: locks,
            randomLocks: 0,
            mustLock: [],
            arcEnabled
        };
        this._lastRaceCustomConfig = config;
        // 先写入自定义配置（buildRaceLevel 在 initRace 内读取），并标记自定义关
        this.gameController.raceState.customConfig = config;
        this.gameController.raceState.isCustom = true;
        this.raceIsCustom = true;

        this._markGameActive();
        this.clearRaceCountdown();
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(true);
        }
        // 自定义关使用 customConfig 生成，levelId 仅作占位（1~30 之外）
        this.gameController.initRace(1);
        this.gameController.raceState.currentLevelId = 0;
        this.gameController.currentRound = 0;
        this.raceCurrentLevelId = 0;

        // 直接隐藏试炼场弹窗（closeRaceCustomModal 会恢复主界面，这里避免闪烁）
        const customModal = document.getElementById('race-custom-modal');
        if (customModal) this.hideModal(customModal);
        this.hideModal(this.raceModal);
        this.hideModal(this.startModal);
        if (window.audioManager) window.audioManager.playClick();
    }
;


