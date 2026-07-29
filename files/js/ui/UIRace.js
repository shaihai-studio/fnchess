// Auto-split from UIController.js — prototype-attached methods (UIRace)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIRace] UIController must be loaded before this file');
}

// _raceTotalLevels
    UIController.prototype._raceTotalLevels = function() {
        return (this.raceLevels && this.raceLevels.length) ? this.raceLevels.length : 30;
    };

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
    };

// startRaceLevel
    UIController.prototype.startRaceLevel = function(levelId) {
        const safeLevelId = Math.max(1, Math.min(30, Number(levelId) || 1));
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
            this.gameController.initRace(safeLevelId);
        }
        this.hideModal(this.raceModal);
        this.hideModal(this.startModal);
    };

// closeRaceUI
    UIController.prototype.closeRaceUI = function() {
        this.raceCurrentLevelId = null;
        this.clearRaceCountdown();
        if (this._raceElapsedTimer) {
            clearInterval(this._raceElapsedTimer);
            this._raceElapsedTimer = null;
        }
        this.hideModal(this.raceModal, () => {
            this.showModal(this.startModal);
        });
        if (this.gameController && typeof this.gameController.cleanupRaceState === 'function') {
            this.gameController.cleanupRaceState();
        }
        if (this.gridSystem && typeof this.gridSystem.setRaceFixedRange === 'function') {
            this.gridSystem.setRaceFixedRange(false);
        }
        this.restoreBattleUI();
    };

// showRaceUI
    UIController.prototype.showRaceUI = function() {
        this.openRaceUI();
    };

// hideRaceUI
    UIController.prototype.hideRaceUI = function() {
        if (this.raceLivePanel) this.raceLivePanel.style.display = 'none';
        if (this.raceModal) this.hideModal(this.raceModal);
    };

// getRaceLevels
    UIController.prototype.getRaceLevels = function() {
        return Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
    };

// updateRaceTimerStyle
    UIController.prototype.updateRaceTimerStyle = function(remainingTime) {
        if (!this.timerElement) return;
        this.timerElement.classList.toggle('race-hyper', remainingTime > 20);
        this.timerElement.classList.toggle('race-critical', remainingTime <= 20 && remainingTime > 5);
        this.timerElement.classList.toggle('race-final', remainingTime <= 5);
    };

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
    };

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
        display.innerHTML = `<span class="lrsigma-label">TTΣ =</span> <span class="lrsigma-int">${total.toFixed(2).split('.')[0]}</span><span class="lrsigma-dec">.${total.toFixed(2).split('.')[1]}</span>`;
    };

// showRaceLevelList
    UIController.prototype.showRaceLevelList = function() {
        this.renderRaceLevelList();
        if (this.raceLevelTitle) this.raceLevelTitle.textContent = '选择等级';
        if (this.raceModal) this.showModal(this.raceModal);
        this.hideBattleUI();
        this.updateRaceModalBackground();
    };

// getRaceUnlockedLevels
    UIController.prototype.getRaceUnlockedLevels = function() {
        const unlocked = new Set([1]);
        try {
            const raw = localStorage.getItem('function_chess_race_unlocked_levels');
            const parsed = raw ? JSON.parse(raw) : [];
            for (const v of Array.isArray(parsed) ? parsed : []) {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 1 && n <= 30) unlocked.add(n);
            }
        } catch {}
        return unlocked;
    };

// saveRaceUnlockedLevels
    UIController.prototype.saveRaceUnlockedLevels = function(levels) {
        try {
            const arr = Array.from(new Set([...(levels || [])])).filter(v => Number.isFinite(Number(v))).map(v => Math.max(1, Math.min(30, Number(v))));
            localStorage.setItem('function_chess_race_unlocked_levels', JSON.stringify(arr));
        } catch {}
    };

// unlockNextRaceLevel
    UIController.prototype.unlockNextRaceLevel = function(levelId) {
        const next = Math.min(30, Number(levelId) + 1);
        const levels = this.getRaceUnlockedLevels();
        levels.add(next);
        this.saveRaceUnlockedLevels(levels);
    };

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
                message: '请再次确认：重置后将无法恢复已保存的竞速数据。\n真的要继续吗？',
                options: [
                    { label: '取消', value: false },
                    { label: '确认重置', value: true }
                ],
                showSkip: false
            });
            if (!secondConfirm) return;

            if (this.raceModeManager) {
                this.raceModeManager.clearProgress();
            }
            if (this.raceModeController) {
                this.raceModeController.bestTimes = {};
                if (typeof this.raceModeController.saveBestTimes === 'function') {
                    this.raceModeController.saveBestTimes();
                }
            }
            try {
                localStorage.removeItem('function_chess_race_best_times');
                localStorage.removeItem('function_chess_race_unlocked_levels');
            } catch {}
            this.raceLevels = this.getRaceLevels();
            this.raceCurrentLevelId = null;
            this.renderRaceLevelList();
            this.showMessage('✅ 竞速进度已重置', 'success');
        } catch (e) {
            this.showMessage('❌ 重置失败', 'error');
        }
    };

// updateRaceModalBackground
    UIController.prototype.updateRaceModalBackground = function() {
        if (!this.raceModal) return;
        const content = this.raceModal.querySelector('.modal-content');
        if (content) content.classList.add('campaign-modal-content');
    };

// showRaceBattleUI
    UIController.prototype.showRaceBattleUI = function(data) {
        this.battleUiHidden = false;
        if (this.header) this.header.classList.add('campaign-mode');
        document.querySelectorAll('.score-display').forEach(el => el.style.display = 'none');
        if (this.currentPlayerElement && this.currentPlayerElement.parentElement) this.currentPlayerElement.parentElement.style.display = 'none';
        if (this.timerElement && this.timerElement.parentElement) this.timerElement.parentElement.style.display = 'none';
        const roundDisplay = document.getElementById('round-display');
        if (roundDisplay) roundDisplay.style.display = 'none';
        if (this.raceLivePanel) this.raceLivePanel.style.display = 'block';
        this.updateCampaignDrawDelayToggleVisibility();
        this.updateRaceBattleUI(data?.currentRound || this.raceCurrentLevelId || 1, 0);
        if (this._raceElapsedTimer) clearInterval(this._raceElapsedTimer);
        this._raceElapsedTimer = null;
    };

// updateRaceBattleUI
    UIController.prototype.updateRaceBattleUI = function(levelId, elapsedSeconds = 0) {
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
        if (this.raceLiveTimeValue) this.raceLiveTimeValue.textContent = `${Number(elapsedSeconds || 0).toFixed(2)}s / ${this.gameController?.raceState?.puzzlesPerLevel || 10}`;
    };

// updateRaceProgressUI
    UIController.prototype.updateRaceProgressUI = function(data) {
        const progress = this.gameController?.getRaceProgress?.() || { cleared: 0, stars: 0 };
        this.raceCurrentLevelId = data.levelId;
        if (this.raceLevelProgress) this.raceLevelProgress.textContent = `已通关 ${progress.cleared}/${this._raceTotalLevels()}，TT∑分：${progress.stars}`;
        this.renderRaceLevelList();
    };

// updateRacePuzzleProgress
    UIController.prototype.updateRacePuzzleProgress = function(solved, total) {
        if (!this.raceLevelProgress) return;
        const progress = this.gameController?.getRaceProgress?.() || { cleared: 0, stars: 0 };
        this.raceLevelProgress.textContent = `已完成 ${Number(solved) || 0}/${Number(total) || 10} 个谜题 · 已通关 ${progress.cleared}/${this._raceTotalLevels()}，TT∑分：${progress.stars}`;
        if (this.raceLiveTimeValue) {
            const elapsed = this.gameController?.getRaceElapsedSeconds?.() || 0;
            this.raceLiveTimeValue.textContent = `${elapsed.toFixed(2)}s`;
        }
    };

// showRaceVictory
    UIController.prototype.showRaceVictory = function(data) {
        if (!this.raceVictoryModal) return;
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
        const levelText = `LEVEL ${String(levelId).padStart(2, '0')}`;

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

        this.renderRaceVictoryDetails(data, { levelId, elapsed, totalSolved, previousBestTime, hasPreviousBest, diff, isNewRecord });
        this.showModal(this.raceVictoryModal);
    };

// startRaceElapsedTimer
    UIController.prototype.startRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) clearInterval(this._raceElapsedTimer);
        if (this.gameController?.gameMode !== 'race' || !this.gameController?.raceState?.active) return;
        this._raceElapsedStart = Date.now();
        this._raceElapsedTimer = setInterval(() => {
            if (!this.gameController || this.gameController.gameMode !== 'race' || !this.gameController.raceState?.active) {
                clearInterval(this._raceElapsedTimer);
                this._raceElapsedTimer = null;
                return;
            }
            const elapsed = (Date.now() - this._raceElapsedStart) / 1000;
            this.updateRaceBattleUI(this.raceCurrentLevelId || this.gameController?.currentRound || 1, elapsed);
            this.updateRaceCountdownElapsed(elapsed);
        }, 50);
    };

// stopRaceElapsedTimer
    UIController.prototype.stopRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) {
            clearInterval(this._raceElapsedTimer);
            this._raceElapsedTimer = null;
        }
        this._raceElapsedFrozen = true;
    };

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
    };

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
    };

// clearRaceCountdown
    UIController.prototype.clearRaceCountdown = function() {
        this._raceCountdownActive = false;
        if (this._raceCountdownTimer) {
            clearTimeout(this._raceCountdownTimer);
            this._raceCountdownTimer = null;
        }
        this.hideRaceCountdownOverlay(false);
    };

// startRaceElapsedTimer
    UIController.prototype.startRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) clearInterval(this._raceElapsedTimer);
        if (this.gameController?.gameMode !== 'race' || !this.gameController?.raceState?.active) return;
        if (!this.gameController.raceState.startedAt) this.gameController.startRaceTimer?.();
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
    };

// stopRaceElapsedTimer
    UIController.prototype.stopRaceElapsedTimer = function() {
        if (this._raceElapsedTimer) {
            clearInterval(this._raceElapsedTimer);
            this._raceElapsedTimer = null;
        }
    };

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
    };

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
    };

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
    };

// hideRaceCountdownOverlay
    UIController.prototype.hideRaceCountdownOverlay = function(fade = false) {
        const overlay = this._raceCountdownOverlay || document.getElementById('race-countdown-overlay');
        if (!overlay) return;
        if (fade) overlay.classList.add('hide');
        window.setTimeout(() => {
            overlay.remove();
            if (this._raceCountdownOverlay === overlay) this._raceCountdownOverlay = null;
        }, fade ? 380 : 0);
    };

// playRaceCountdownTick
    UIController.prototype.playRaceCountdownTick = function(num) {
        if (!window.audioManager) return;
        if (num === 3) window.audioManager.playRaceCountdown?.();
        else if (num === 2) window.audioManager.playRaceBeep?.();
        else if (num === 1) window.audioManager.playRaceAlert?.();
        else window.audioManager.playRaceLaunch?.();
    };

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
    };

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
    };

// renderRaceVictoryDetails
    UIController.prototype.renderRaceVictoryDetails = function(data, meta) {
        const host = this.raceVictoryModal?.querySelector('.race-victory-extra');
        if (!host) return;
        const { levelId, elapsed, totalSolved, previousBestTime, hasPreviousBest, diff, isNewRecord } = meta;
        host.innerHTML = `
            <div class="race-victory-extra-line">关卡 ${levelId} · ${totalSolved} 谜题 · ${elapsed.toFixed(2)}s</div>
            <div class="race-victory-extra-line">${isNewRecord ? 'NEW BEST' : '稳定发挥'} · ${hasPreviousBest ? `PB ${previousBestTime.toFixed(2)}s` : 'PB 未记录'}</div>
            <div class="race-victory-extra-line">${diff === null ? '首通记录已建立' : (diff <= 0 ? '领先最佳成绩' : '仍可再快一点')}</div>
        `;
    };

// backToRaceLevelListFromVictory
    UIController.prototype.backToRaceLevelListFromVictory = function() {
        this.hideRaceVictory();
        this.showRaceLevelList();
    };

// hideRaceVictory
    UIController.prototype.hideRaceVictory = function() {
        if (this.raceVictoryModal) this.hideModal(this.raceVictoryModal);
    };

// retryRaceLevel
    UIController.prototype.retryRaceLevel = function() {
        const levelId = this.raceCurrentLevelId || 1;
        this.hideRaceVictory();
        this.startRaceLevel(levelId);
    };

// goToNextRaceLevel
    UIController.prototype.goToNextRaceLevel = function() {
        const next = Math.min(30, (this.raceCurrentLevelId || 1) + 1);
        const unlocked = this.getRaceUnlockedLevels();
        if (!unlocked.has(next)) {
            this.showMessage('请先通关上一关解锁', 'warning');
            return;
        }
        this.hideRaceVictory();
        this.startRaceLevel(next);
    };

