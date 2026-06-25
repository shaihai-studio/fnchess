class IntervalPath {
  constructor(gp, bounds, data) {
    this.gp = gp;
    this.bounds = bounds;
    this.data = data;
    this.lastY = null;
    this.labelPoint = null;
    this.lastPiece = 0;
    this.drawInterval = new DrawInterval(gp, bounds);
    this.drawInvertedInterval = new DrawInvertedInterval(gp, data, bounds);
    this.labelPositionCalculator = new LabelPositionCalculator(bounds);
  }

  update() {
    this.reset();
    if (!this.data || !this.data.forEach) return;
    this.data.forEach((index) => this.drawAt(index));
  }

  drawAt(index) {
    const tuple = this.data.at(index);
    if (!tuple || tuple.isUndefined?.() || this.isPieceChanged(tuple)) {
      this.noJoinForNextTuple();
    } else {
      this.drawTupleAt(index);
    }
    this.drawInterval.setJoinToPrevious(!tuple?.isUndefined?.() && !this.isPieceChanged(tuple));
  }

  noJoinForNextTuple() {
    this.lastY = null;
  }

  drawTupleAt(index) {
    if (this.isJoinNeeded(index)) {
      this.drawTupleJoined(index);
    } else {
      this.drawTupleIndependent(index);
    }
  }

  isPieceChanged(tuple) {
    if (tuple.piece() !== this.lastPiece) {
      this.lastPiece = tuple.piece();
      return true;
    }
    return false;
  }

  isJoinNeeded(index) {
    return !(this.lastY == null || this.isPieceChanged(this.data.at(index)));
  }

  drawTupleJoined(index) {
    const tuple = this.data.at(index);
    if (tuple.isInverted()) {
      this.drawInvertedJoined(index);
    } else if (tuple.y().isWhole()) {
      this.drawWhole(tuple.x());
    } else if (this.lastY != null) {
      this.drawNonInverted(tuple);
    }
    this.calculateLabelPoint(tuple);
  }

  drawNonInverted(tuple) {
    if (tuple.y().hasInfinity()) {
      this.drawNormalInfinity(tuple);
    } else {
      this.drawNormalJoined(tuple);
    }
  }

  drawInvertedJoined(index) {
    if (!this.isJoinNeeded(index) || this.data.isWholeAt(index)) {
      this.noJoinForNextTuple();
    } else {
      this.lastY = this.drawInvertedInterval.drawJoined(index, this.lastY);
    }
  }

  drawNormalJoined(tuple) {
    const screenY = this.bounds.toScreenIntervalY ? this.bounds.toScreenIntervalY(tuple.y()) : tuple.y();
    this.drawInterval.drawJoined(this.lastY, this.bounds.toScreenIntervalX ? this.bounds.toScreenIntervalX(tuple.x()) : tuple.x(), screenY);
    this.lastY = screenY;
  }

  drawNormalInfinity(tuple) {
    const y = tuple.y();
    if (this.bounds.range?.contains?.(y.getLow()) && Number.isInfinite(y.getHigh())) {
      this.gp.leftToTop?.(this.bounds, tuple.x(), y);
      this.lastY = 0;
    } else if (this.bounds.range?.contains?.(y.getHigh())) {
      this.gp.leftToBottom?.(this.bounds, tuple.x(), y);
      this.lastY = this.bounds.getHeight();
    } else {
      this.lastY = null;
    }
  }

  drawWhole(x) {
    this.drawInterval.drawWhole(x);
    this.noJoinForNextTuple();
  }

  drawTupleIndependent(index) {
    if (this.data.isInvertedAt(index)) {
      this.drawInvertedInterval.draw(index);
    } else {
      const lastValue = this.drawInterval.drawIndependent(this.data.at(index));
      this.lastY = lastValue;
    }
  }

  reset() {
    this.gp.reset?.();
    this.labelPoint = null;
    this.noJoinForNextTuple();
  }

  calculateLabelPoint(tuple) {
    if (this.labelPoint == null && this.bounds.isOnView?.(tuple.x().getLow(), tuple.y().getLow())) {
      this.labelPoint = this.labelPositionCalculator.calculate(tuple.x().getLow(), tuple.y().getLow());
    }
  }

  getLabelPoint() {
    return this.labelPoint;
  }
}
