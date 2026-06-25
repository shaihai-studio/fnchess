class CoordSystemAnimatedPlotter {
  constructor() {
    this.updateEnabled = true;
  }

  onZoomStop(info) { this.enableUpdate(); }
  onMove(info) { this.disableUpdate(); }
  onMoveStop() { this.enableUpdate(); }
  updateOnDemand() { if (this.updateEnabled) this.update(); }
  update() {}
  enableUpdate() { this.updateEnabled = true; }
  disableUpdate() { this.updateEnabled = false; }
  draw(g2) {}
}
