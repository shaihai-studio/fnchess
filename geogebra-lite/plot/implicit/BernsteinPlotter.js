class BernsteinPlotter extends CoordSystemAnimatedPlotter {
  constructor(geo, bounds, gp, transformedCoordSys) {
    super();
    this.gp = gp;
    this.transformedCoordSys = transformedCoordSys;
    this.cells = [];
    this.points = [];
    this.settings = new BernsteinPlotterSettings();
    const segments = { add() {}, flush() {} };
    this.algo = new BernsteinImplicitAlgo(bounds, geo, this.cells, segments, this.settings.minCellSizeInPixelsValue());
    this.visualDebug = this.settings.hasVisualDebug() ? new BernsteinPlotterVisualDebug(bounds, this.cells) : null;
  }

  draw(g2) {
    this.updateOnDemand();
    if (this.gp?.drawPolyline) {
      this.gp.drawPolyline(this.points);
    }
    if (this.settings.hasVisualDebug() && this.visualDebug) {
      this.visualDebug.draw(g2);
    }
  }

  update() {
    this.points.length = 0;
    this.algo.compute();
  }

  enableUpdate() {
    if (this.settings.isUpdateEnabled()) {
      super.enableUpdate?.();
    }
  }
}
