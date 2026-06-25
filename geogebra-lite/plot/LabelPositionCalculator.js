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
