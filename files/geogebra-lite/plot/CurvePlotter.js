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
class CurvePlotter {
  constructor(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed) {
    const width = view?.getWidth?.() || view?.width || 800;
    const minSamplePoints = Math.max(160, width / 3 || 160);
    const maxParamStep = Math.abs(tMax - tMin) / minSamplePoints;
    this.curveSegmentPlotter = new CurveSegmentPlotter(curve, tMin, tMax, 0, maxParamStep, view, gp, calcLabelPos, moveToAllowed);
    if (moveToAllowed === Gap.CORNER && gp.corner) {
      gp.corner();
    }
  }

  static plotCurve(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed) {
    const plotter = new CurvePlotter(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed);
    return plotter.getLabelPoint();
  }

  getLabelPoint() {
    return this.curveSegmentPlotter.getLabelPoint();
  }
}

if (typeof window !== 'undefined') {
  window.CurvePlotter = CurvePlotter;
}
