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
class CurvePlotterUtils {
  static draw(gp, pointList, transformSys) {
    const coords = gp.newDoubleArray();
    const size = pointList.length;
    const supports = gp.supports(transformSys);
    if (!supports || size === 0) {
      return coords;
    }

    let linetofirst = true;
    let lastMove = null;
    for (const p of pointList) {
      if (p && typeof p.isFinite === 'function' ? p.isFinite() : true) {
        const segmentType = p.getSegmentType ? p.getSegmentType() : null;
        const getLineTo = p.getLineTo ? p.getLineTo() : true;
        const point = p.coords || p;
        if (CurvePlotterUtils.isArcOrCurvePart(segmentType) && !linetofirst) {
          gp.drawTo(coords, segmentType);
          lastMove = null;
        } else if (getLineTo && !linetofirst) {
          gp.lineTo(coords);
          lastMove = null;
        } else {
          lastMove = CurvePlotterUtils.moveTo(gp, coords, lastMove);
        }
        linetofirst = false;
      } else {
        linetofirst = true;
      }
    }
    if (lastMove != null) {
      gp.lineTo(lastMove);
    }
    gp.endPlot();
    return coords;
  }

  static moveTo(gp, coords, previousLastMove) {
    let lastMove;
    if (previousLastMove != null) {
      gp.lineTo(previousLastMove);
      lastMove = previousLastMove;
    } else {
      lastMove = new Array(coords.length).fill(0);
    }
    gp.moveTo(coords);
    for (let i = 0; i < coords.length; i++) lastMove[i] = coords[i];
    return lastMove;
  }

  static isArcOrCurvePart(segmentType) {
    return segmentType === 'CURVE_TO'
      || segmentType === 'CONTROL'
      || segmentType === 'ARC_TO'
      || segmentType === 'AUXILIARY';
  }
}
