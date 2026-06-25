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
class CurveSegmentInfo {
  constructor(view) {
    this.view = view;
    this.distanceOK = true;
    this.angleOK = true;
    this.offScreen = false;
    this.reachedminStep = false;
  }

  isOffScreen() {
    return this.offScreen;
  }

  update(evalLeft, evalRight, diff, prevDiff, curve) {
    this.offScreen = this.view.isSegmentOffView ? this.view.isSegmentOffView(evalLeft, evalRight) : false;
    this.reachedminStep = Math.abs(diff[0]) < curve.getMinDistX();
    this.distanceOK = this.offScreen || this.isDistanceOK(diff);
    this.angleOK = this.isAngleOK(prevDiff, diff, this.offScreen ? this.getMaxBendOffScreen() : this.getMaxBend());
  }

  getMaxBend() {
    return this.view.getMaxBend ? this.view.getMaxBend() : Math.tan(10 * Math.PI / 180);
  }

  getMaxBendOffScreen() {
    return this.view.getMaxBendOffScreen ? this.view.getMaxBendOffScreen() : Math.tan(45 * Math.PI / 180);
  }

  isDistanceOrAngleInvalid() {
    return !this.angleOK || !this.distanceOK;
  }

  isDistanceOK(diff) {
    for (const d of diff) {
      if (Math.abs(d) > CurveSegmentInfo.MAX_PIXEL_DISTANCE) return false;
    }
    return true;
  }

  isAngleOK(v, w, bend) {
    let innerProduct = 0;
    for (let i = 0; i < v.length; i++) {
      innerProduct += v[i] * w[i];
    }
    if (!Number.isFinite(innerProduct)) return true;
    if (innerProduct <= 0) return false;
    let det;
    if (v.length < 3) {
      det = Math.abs(v[0] * w[1] - v[1] * w[0]);
    } else {
      const d1 = v[0] * w[1] - v[1] * w[0];
      const d2 = v[1] * w[2] - v[2] * w[1];
      const d3 = v[2] * w[0] - v[0] * w[2];
      det = Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3);
    }
    return det < bend * innerProduct;
  }

  hasNotReachedMinStep() {
    return !this.reachedminStep;
  }
}

CurveSegmentInfo.MAX_PIXEL_DISTANCE = 32;
