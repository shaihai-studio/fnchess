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
