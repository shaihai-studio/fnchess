class FirstBatchCurveAdapter {
  constructor(plotter, expr) {
    this.plotter = plotter;
    this.expr = expr;
    this.path = new GeneralPathClippedForCurvePlotter(plotter);
    this.pathSegments = [];
  }

  newDoubleArray() {
    return [0, 0];
  }

  isFunctionInX() {
    return true;
  }

  getMinDistX() {
    return 1e-4;
  }

  evaluateCurve(x, out) {
    const y = this.plotter.evalAt(this.expr, x);
    out[0] = x;
    out[1] = y;
  }

  updateExpandedFunctions() {}

  distanceMax(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  }
}
