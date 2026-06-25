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
class TupleNeighbours {
  constructor(left = null, current = null, right = null) {
    this.set(left, current, right);
  }

  set(left, current, right) {
    this.left = left;
    this.current = current;
    this.right = right;
  }

  hasLeft() {
    return !(this.left == null || this.left.isUndefined?.());
  }

  hasRight() {
    return !(this.right == null || this.right.isUndefined?.());
  }

  leftXLow() { return this.left.x().getLow(); }
  leftXHigh() { return this.left.x().getHigh(); }
  leftYLow() { return this.left.y().getLow(); }
  leftYHigh() { return this.left.y().getHigh(); }

  currentXLow() { return this.current.x().getLow(); }
  currentXHigh() { return this.current.x().getHigh(); }
  currentYLow() { return this.current.y().getLow(); }
  currentYHigh() { return this.current.y().getHigh(); }

  rightXLow() { return this.right.x().getLow(); }
  rightXHigh() { return this.right.x().getHigh(); }
  rightYLow() { return this.right.y().getLow(); }
  rightYHigh() { return this.right.y().getHigh(); }

  left() { return this.left; }
  current() { return this.current; }
  right() { return this.right; }

  toString() {
    return this.toStringForCode();
  }

  toStringForCode() {
    return `TupleNeighbours neighbours = new TupleNeighbours(\n${this.tuple(this.left)}, \n${this.tuple(this.current)}, \n${this.tuple(this.right)});`;
  }

  tuple(tuple) {
    if (tuple == null) return 'null';
    let result = 'Tuples.';
    if (tuple.isUndefined?.()) {
      result += `undefined(${this.comma(tuple.x())}) `;
    } else if (tuple.y().isInverted?.()) {
      result += `inverted(${this.comma(tuple.x())}, ${this.comma(tuple.y())}) `;
    } else {
      result += `normal(${this.comma(tuple.x())}, ${this.comma(tuple.y())}) `;
    }
    return result;
  }

  comma(x) {
    return `${x.getLow()}, ${x.getHigh()}`
      .replace(/Infinity/g, 'Double.POSITIVE_INFINITY')
      .replace(/-Double\.POSITIVE_INFINITY/g, 'Double.POSITIVE_INFINITY');
  }

  isLeftInfinite() {
    return this.left != null && this.left.y().hasInfinity?.();
  }

  isRightInfinite() {
    return this.right != null && this.right.y().hasInfinity?.();
  }
}
