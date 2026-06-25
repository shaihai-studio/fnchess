class DrawInterval {
  constructor(gp, bounds) {
    this.gp = gp;
    this.bounds = bounds;
    this.joinToPrevious = false;
  }

  setJoinToPrevious(joinToPrevious) {
    this.joinToPrevious = joinToPrevious;
  }

  drawJoined(lastY, x, y) {
    if (y > lastY) {
      this.drawUp(x, y);
    } else {
      this.drawDown(x, y);
    }
  }

  drawUp(x, y) {
    if (this.joinToPrevious) this.lineTo(x.low ?? x.getLow?.(), y.low ?? y.getLow?.());
    else this.moveTo(x.low ?? x.getLow?.(), y.low ?? y.getLow?.());
    this.lineTo(x.high ?? x.getHigh?.(), y.high ?? y.getHigh?.());
  }

  drawDown(x, y) {
    if (this.joinToPrevious) this.lineTo(x.low ?? x.getLow?.(), y.high ?? y.getHigh?.());
    else this.moveTo(x.low ?? x.getLow?.(), y.high ?? y.getHigh?.());
    this.lineTo(x.high ?? x.getHigh?.(), y.low ?? y.getLow?.());
  }

  moveTo(x, y) { this.gp?.moveTo?.([this.clamp(x), this.clamp(y)]); }
  lineTo(x, y) { this.gp?.lineTo?.([this.clamp(x), this.clamp(y)]); }

  clamp(value) {
    if (value === Infinity) return 1e9;
    if (value === -Infinity) return -1e9;
    return value;
  }

  drawWhole(x) {
    this.gp?.segment?.(this.bounds, x.getLow?.() ?? x.low, this.bounds.getYmin(), x.getLow?.() ?? x.low, this.bounds.getYmax());
  }

  drawIndependent(tuple) {
    const x = this.bounds.toScreenIntervalX(tuple.x());
    const y = this.bounds.toScreenIntervalY(tuple.y());
    if (y?.isUndefined?.()) return null;
    this.line(x, y);
    return y;
  }

  line(x, y) {
    this.moveTo(x.getHigh ? x.getHigh() : x.high, y.getLow ? y.getLow() : y.low);
    this.lineTo(x.getHigh ? x.getHigh() : x.high, y.getHigh ? y.getHigh() : y.high);
  }
}
