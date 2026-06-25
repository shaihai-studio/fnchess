/**
 * 函数棋 (Function Chess)
 * Copyright (C) 2024-2025 Shaihai Studio (Shaihai工作室)
 * Visit us on Bilibili: https://space.bilibili.com/3690976753223882
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
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

    getElapsed() {
        return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    }

    getBest(levelId) {
        const v = Number(this.bestTimes[levelId]);
        return Number.isFinite(v) && v > 0 ? v : null;
    }

    setBest(levelId, elapsed) {
        const prev = this.getBest(levelId);
        if (prev === null || elapsed < prev) {
            this.bestTimes[levelId] = elapsed;
            this.saveBestTimes();
        }
    }

    start(levelId = 1) {
        this.currentLevelId = Math.max(1, Math.min(this.totalLevels, Number(levelId) || 1));
        this.active = true;
        this.startedAt = Date.now();
        this.emit('levelLoad', { levelId: this.currentLevelId, totalLevels: this.totalLevels, delay: this.currentDelay });
    }

    completeLevel() {
        if (!this.active) return;
        const elapsed = this.getElapsed();
        this.setBest(this.currentLevelId, elapsed);
        this.active = false;
        this.startedAt = null;
        this.emit('victory', {
            levelId: this.currentLevelId,
            elapsed,
            bestElapsed: this.getBest(this.currentLevelId),
            stars: this.getStarsByElapsed(elapsed)
        });
    }

    failAndRetry() {
        this.emit('retry', { levelId: this.currentLevelId });
        this.startedAt = Date.now();
        this.active = true;
        this.emit('levelLoad', { levelId: this.currentLevelId, totalLevels: this.totalLevels, delay: this.currentDelay });
    }

    nextLevel() {
        const next = Math.min(this.totalLevels, this.currentLevelId + 1);
        this.start(next);
    }

    getStarsByElapsed(t) {
        if (t < 100) return 5;
        if (t < 150) return 4;
        if (t < 300) return 3;
        if (t < 1000) return 2;
        return 1;
    }

    clearProgress() {
        try { localStorage.removeItem('function_chess_race_best_times'); } catch {}
        this.bestTimes = {};
    }
}

window.RaceModeController = RaceModeController;
