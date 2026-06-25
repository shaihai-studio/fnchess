class BernsteinImplicitAlgo extends PlotterAlgo {
  constructor(bounds, curve, cells, segments, minCellSizeInPixels) {
    super();
    this.bounds = bounds;
    this.curve = curve;
    this.cells = cells;
    this.segments = segments;
    this.minCellSizeInPixels = minCellSizeInPixels;
    this.polynomial = null;
  }

  compute() {
    this.cells.length = 0;
    if (!this.curve) return;
    // Placeholder JS translation skeleton.
    // Full Bernstein subdivision/marching translation continues in follow-up.
    this.segments?.flush?.();
  }
}
