/**
 * 函数棋 (Function Chess) — geogebra-lite 引擎组件
 * Copyright (C) 2024-2025 Shaihai Studio (Shaihai工作室)
 * 
 * 本模块改编自 GeoGebra 开源项目 (https://www.geogebra.org/)，
 * 原始代码采用 GNU General Public License v3 发布。
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
class SegmentParams {
  constructor(tMin, divisors, plotter) {
    this.tMin = tMin;
    this.divisors = divisors;
    this.plotter = plotter;
    this.dyad = 1;
    this.depth = 0;
    this.diff = [0, 0];
    this.prevDiff = [0, 0];
    this.countDiffZeros = 0;
    this.t = tMin;
    this.left = tMin;
  }

  hasNotReachedMaxDepth() {
    return this.depth < 16;
  }

  isDiffZerosLimitNotReached() {
    return this.countDiffZeros < 1000;
  }

  isStepTooBig(maxParamStep) {
    return this.currentDivisor() > maxParamStep;
  }

  currentDivisor() {
    return this.divisors[this.depth];
  }

  progress() {
    this.dyad = 2 * this.dyad - 1;
    this.depth++;
    this.updateT();
  }

  updateT() {
    this.t = this.tMin + this.dyad * this.currentDivisor();
  }

  updateDiff(evalLeft, evalRight) {
    if (this.plotter && typeof this.plotter.getOnScreenDiff === 'function') {
      this.diff = this.plotter.getOnScreenDiff(evalLeft, evalRight);
      return;
    }
    this.diff = [evalRight[0] - evalLeft[0], evalRight[1] - evalLeft[1]];
  }

  updatePreviousDiff() {
    this.prevDiff = [...this.diff];
  }

  restoreFromStack(item) {
    this.depth = item.depth + 1;
    this.dyad = item.dyadic * 2;
    this.updatePreviousDiff();
    this.updateT();
  }
}

if (typeof window !== 'undefined') {
  window.SegmentParams = SegmentParams;
}
