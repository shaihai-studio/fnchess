class RaceModeController {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.totalLevels = RaceModeController.TOTAL_LEVELS; // 2026-08-15 修复 #59：总关卡数改为单一常量（默认 109，对齐游戏实际关卡数）
        this.currentLevelId = 1;
        this._mgr = null; // 懒加载的 RaceModeManager 实例（#61 单一写者）
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
        // 2026-08-15 修复 #60：统一同 key 哨兵为 Infinity（与 RaceModeManager.getBestTime 一致），消除 null/Infinity 双标准
        const m = this._getManager();
        if (m) return m.getBestTime(levelId);
        const v = Number(this.bestTimes[levelId]);
        return Number.isFinite(v) && v > 0 ? v : Infinity;
    }

    start(levelId = 1) {
        this.currentLevelId = Math.max(1, Math.min(this.totalLevels, Number(levelId) || 1));
        this.active = true;
        this.startedAt = Date.now();
        this.emit('levelLoad', { levelId: this.currentLevelId, totalLevels: this.totalLevels, delay: this.currentDelay });
    }

    clearProgress() {
        // 2026-08-15 修复 #61：bestTimes 的单一写者改为 RaceModeManager（消除两处写同一 localStorage key）
        const m = this._getManager();
        if (m) m.clearProgress();
        this.bestTimes = {};
    }

    _getManager() {
        if (!this._mgr && typeof window !== 'undefined' && window.RaceModeManager) {
            this._mgr = new window.RaceModeManager();
        }
        return this._mgr || null;
    }
}

// 竞速模式总关卡数单一来源（默认 30 关，闯关模式才是 109 关；
// 修改此处即同步 RaceModeController.totalLevels 与 UIRace 各上限判断）
RaceModeController.TOTAL_LEVELS = 30;

window.RaceModeController = RaceModeController;
