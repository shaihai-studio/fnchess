class RaceModeManager {
    constructor() {
        this.storageKey = {
            bestTimes: 'function_chess_race_best_times',
            drawDelay: 'function_chess_race_draw_delay',
            cleared: 'function_chess_race_cleared',
            stars: 'function_chess_race_stars'
        };
        this.drawDelayOptions = [0, 1000, 5000];
    }

    loadBestTimes() {
        try {
            const raw = localStorage.getItem(this.storageKey.bestTimes);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    saveBestTimes(map) {
        try { localStorage.setItem(this.storageKey.bestTimes, JSON.stringify(map || {})); } catch {}
    }

    getBestTime(levelId) {
        const map = this.loadBestTimes();
        const v = Number(map[levelId]);
        return Number.isFinite(v) && v > 0 ? v : Infinity;
    }

    setBestTime(levelId, seconds) {
        const map = this.loadBestTimes();
        const next = Number(seconds);
        if (!Number.isFinite(next) || next <= 0) return;
        const prev = Number(map[levelId]);
        if (!Number.isFinite(prev) || prev <= 0 || next < prev) {
            map[levelId] = next;
            this.saveBestTimes(map);
        }
    }

    getDrawDelay() {
        try {
            const v = Number(localStorage.getItem(this.storageKey.drawDelay));
            return this.drawDelayOptions.includes(v) ? v : 0;
        } catch { return 0; }
    }

    setDrawDelay(value) {
        const next = this.drawDelayOptions.includes(Number(value)) ? Number(value) : 0;
        try { localStorage.setItem(this.storageKey.drawDelay, String(next)); } catch {}
        return next;
    }

    clearProgress() {
        try {
            localStorage.removeItem(this.storageKey.bestTimes);
            localStorage.removeItem(this.storageKey.cleared);
            localStorage.removeItem(this.storageKey.stars);
            localStorage.removeItem(this.storageKey.drawDelay);
        } catch {}
    }
}

window.RaceModeManager = RaceModeManager;
