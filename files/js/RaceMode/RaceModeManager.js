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
