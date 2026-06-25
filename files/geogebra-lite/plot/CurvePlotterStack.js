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
class CurvePlotterStack {
  constructor(length, onScreen, evalValue) {
    this.items = new Array(length);
    for (let i = 0; i < length; i++) this.items[i] = new CurvePlotterStackItem();
    this.items[0].set(1, 0, onScreen, Array.isArray(evalValue) ? [...evalValue] : evalValue);
    this.top = 1;
  }

  push(dyadic, depth, onScreen, evalValue) {
    this.items[this.top].set(dyadic, depth, onScreen, Array.isArray(evalValue) ? [...evalValue] : evalValue);
    this.top += 1;
  }

  pop() {
    this.top -= 1;
    return this.top >= 0 ? this.items[this.top] : null;
  }

  hasItems() {
    return this.top !== 0;
  }
}

if (typeof window !== 'undefined') {
  window.CurvePlotterStack = CurvePlotterStack;
}
