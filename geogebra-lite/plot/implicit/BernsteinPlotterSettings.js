class BernsteinPlotterSettings {
  constructor(updateEnabled = true, visualDebug = false, minCellSizeInPixels = 4) {
    this.updateEnabled = updateEnabled;
    this.visualDebug = visualDebug;
    this.minCellSizeInPixels = minCellSizeInPixels;
  }

  hasVisualDebug() { return this.visualDebug; }
  isUpdateEnabled() { return this.updateEnabled; }
  minCellSizeInPixelsValue() { return this.minCellSizeInPixels; }
}
