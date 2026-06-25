class BernsteinPlotterVisualDebug extends VisualDebug {
  constructor(bounds, cells) {
    super();
    this.bounds = bounds;
    this.cells = cells;
  }

  draw(g2) {
    if (!this.cells) return;
    for (const cell of this.cells) {
      this.drawCell(g2, cell);
    }
  }

  drawCell(g2, cell) {
    const box = cell.boundingBox;
    const x = this.bounds.toScreenCoordXd ? this.bounds.toScreenCoordXd(box.x1()) : box.x1();
    const y = this.bounds.toScreenCoordYd ? this.bounds.toScreenCoordYd(box.y1()) : box.y1();
    const width = (this.bounds.toScreenCoordXd ? this.bounds.toScreenCoordXd(box.x2()) : box.x2()) - x;
    const height = (this.bounds.toScreenCoordYd ? this.bounds.toScreenCoordYd(box.y2()) : box.y2()) - y;
    if (g2?.strokeRect) {
      g2.strokeStyle = '#ff0';
      g2.strokeRect(x, y, width, height);
    }
  }
}
