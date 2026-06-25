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
class LabelPositionCalculator {
  constructor(bounds) {
    this.bounds = bounds;
  }

  calculate(x, y) {
    const xLabel = this.bounds.toScreenCoordXd ? this.bounds.toScreenCoordXd(x) : x;
    const yLabel = this.bounds.toScreenCoordYd ? this.bounds.toScreenCoordYd(y) : y;
    return { x: Math.trunc(xLabel), y: Math.trunc(yLabel) };
  }
}
