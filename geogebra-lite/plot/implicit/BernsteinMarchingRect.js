class BernsteinMarchingRect {
  constructor(cell) {
    this.box = cell.boundingBox;
    const poly = cell.polynomial;
    this.corners = [poly.evaluate(0, 0), poly.evaluate(1, 0), poly.evaluate(1, 1), poly.evaluate(0, 1)];
  }

  x1() { return this.box.x1(); }
  y1() { return this.box.y1(); }
  x2() { return this.box.x2(); }
  y2() { return this.box.y2(); }
  topLeft() { return this.corners[0]; }
  topRight() { return this.corners[1]; }
  bottomRight() { return this.corners[2]; }
  bottomLeft() { return this.corners[3]; }
  cornerAt(i) { return this.corners[i]; }
  toString() { return `BernsteinPlotRect{box=${this.box}, corners=${JSON.stringify(this.corners)}}`; }
}
