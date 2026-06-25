class DrawInvertedInterval {
  constructor(gp, data, bounds) {
    this.gp = gp;
    this.data = data;
    this.bounds = bounds;
    this.lastY = null;
    this.join = new JoinLines(bounds, gp);
  }

  drawJoined(idx, y) {
    this.lastY = y;
    if (!y || y.isUndefined?.() || this.data.isWholeAt?.(idx)) {
      this.lastY = null;
    } else {
      this.draw(idx);
    }
    return this.lastY;
  }

  draw(index) {
    if (this.hasNextToJoin(index)) {
      this.drawSegmentsJoined(index);
    } else {
      this.drawSegments(index);
    }
    if (!this.isInvertedNextTo(index)) {
      this.lastY = null;
    }
  }

  drawSegmentsJoined(index) {
    this.join.inverted(this.data.neighboursAt(index));
  }

  drawSegments(index) {
    const current = this.data.at(index);
    this.drawTopSegment(current);
    this.drawBottomSegment(current);
  }

  hasNextToJoin(index) {
    return this.data.hasNext?.(index) && !this.data.isInvertedAt?.(index + 1);
  }

  drawBottomSegment(current) {
    const y = current.y();
    if (y.getHigh() > this.bounds.getYmin()) {
      this.gp.segment(this.bounds, current.x().getLow(), this.bounds.getYmin(), current.x().getHigh(), y.getLow());
    }
  }

  drawTopSegment(current) {
    const y = current.y();
    if (y.getLow() < this.bounds.getYmax()) {
      const x = current.x();
      this.gp.segment(this.bounds, x.getHigh(), this.bounds.getYmax(), x.getHigh(), y.getHigh());
    }
  }

  isInvertedNextTo(idx) {
    return this.data.getCount?.() > idx && this.data.isInvertedAt?.(idx + 1);
  }
}
