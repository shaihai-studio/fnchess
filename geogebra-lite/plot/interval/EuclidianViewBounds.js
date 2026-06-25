class EuclidianViewBounds {
  constructor(plotter) {
    this.plotter = plotter;
  }

  toScreenCoordXd(x) { return this.plotter.toCanvas(x, 0).x; }
  toScreenCoordYd(y) { return this.plotter.toCanvas(0, y).y; }
  getWidth() { return this.plotter.canvas.clientWidth; }
  getHeight() { return this.plotter.canvas.clientHeight; }
  getXmin() { return -this.plotter.range; }
  getXmax() { return this.plotter.range; }
  getYmin() { return -this.plotter.range; }
  getYmax() { return this.plotter.range; }
}
