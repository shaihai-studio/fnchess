class RaceModeController {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.totalLevels = 30;
        this.currentLevelId = 1;
        this.bestTimes = this.loadBestTimes();
        this.startedAt = null;
        this.timer = null;
        this.active = false;
        this.currentDelay = this.loadDrawDelay();
        this.callbacks = {};
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    emit(event, data) {
        if (typeof this.callbacks[event] === 'function') this.callbacks[event](data);
    }

    loadBestTimes() {
        try {
            const raw = localStorage.getItem('function_chess_race_best_times');
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    saveBestTimes() {
        try { localStorage.setItem('function_chess_race_best_times', JSON.stringify(this.bestTimes)); } catch {}
    }

    loadDrawDelay() {
        try {
            const v = Number(localStorage.getItem('function_chess_race_draw_delay'));
            return [0, 1000, 5000].includes(v) ? v : 0;
        } catch { return 0; }
    }

    setDrawDelay(ms) {
        this.currentDelay = [0, 1000, 5000].includes(Number(ms)) ? Number(ms) : 0;
        try { localStorage.setItem('function_chess_race_draw_delay', String(this.currentDelay)); } catch {}
        this.emit('delayChange', { delay: this.currentDelay });
    }

    getBest(levelId) {
        const v = Number(this.bestTimes[levelId]);
        return Number.isFinite(v) && v > 0 ? v : null;
    }

    start(levelId = 1) {
        this.currentLevelId = Math.max(1, Math.min(this.totalLevels, Number(levelId) || 1));
        this.active = true;
        this.startedAt = Date.now();
        this.emit('levelLoad', { levelId: this.currentLevelId, totalLevels: this.totalLevels, delay: this.currentDelay });
    }

    clearProgress() {
        try { localStorage.removeItem('function_chess_race_best_times'); } catch {}
        this.bestTimes = {};
    }
}

window.RaceModeController = RaceModeController;
