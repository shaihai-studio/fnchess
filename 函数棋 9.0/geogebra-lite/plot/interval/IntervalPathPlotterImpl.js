class IntervalPathPlotterImpl extends IntervalPathPlotter {
  constructor() {
    super();
    this.segments = [];
  }

  reset() {
    this.segments.length = 0;
  }

  moveTo(x, y) {
    this.segments.push({ type: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this.segments.push({ type: 'lineTo', x, y });
  }

  segment(x1, y1, x2, y2) {
    this.segments.push({ type: 'segment', x1, y1, x2, y2 });
  }

  draw(g2) {
    if (!g2 || !g2.beginPath) return;
    g2.beginPath();
    let started = false;
    for (const s of this.segments) {
      if (s.type === 'moveTo') {
        g2.moveTo?.(s.x, s.y);
        started = true;
      } else if (s.type === 'lineTo' || s.type === 'segment') {
        if (!started) {
          g2.moveTo?.(s.x1 ?? s.x, s.y1 ?? s.y);
          started = true;
        }
        g2.lineTo?.(s.x2 ?? s.x, s.y2 ?? s.y);
      }
    }
    g2.stroke?.();
  }

  leftToTop(bounds, x, y) {
    this.segment(bounds, x.getLow?.() ?? x.low, y.getLow?.() ?? y.low, x.getHigh?.() ?? x.high, bounds.getYmax());
  }

  leftToBottom(bounds, x, y) {
    this.segment(bounds, x.getLow?.() ?? x.low, y.getHigh?.() ?? y.high, x.getHigh?.() ?? x.high, bounds.getYmin());
  }
}
