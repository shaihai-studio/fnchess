class GeoGebraCurvePlotter {
  constructor(plotter) {
    this.plotter = plotter;
    this.MAX_PIXEL_DISTANCE = 10;
    this.MAX_ANGLE = 10;
    this.MAX_BEND = Math.tan(this.MAX_ANGLE * Math.PI / 180);
    this.MAX_BEND_OFF_SCREEN = Math.tan(45 * Math.PI / 180);
    this.MAX_DEFINED_BISECTIONS = 16;
    this.MAX_CONTINUITY_BISECTIONS = 8;
    this.MAX_JUMP = 5;
  }

  isFiniteY(y) { return Number.isFinite(y) && y !== null; }
  evalAt(expr, x) { return this.plotter.evalAt(expr, x); }

  isJumpDiscontinuity(expr, x) {
    const eps0 = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    const levels = [64, 16, 4, 1];
    let leftAvg = null;
    let rightAvg = null;
    let bestGap = null;
    for (const k of levels) {
      const eps = eps0 * k;
      const leftVals = [this.evalAt(expr, x - eps * 8), this.evalAt(expr, x - eps * 2)].filter(v => this.isFiniteY(v));
      const rightVals = [this.evalAt(expr, x + eps * 2), this.evalAt(expr, x + eps * 8)].filter(v => this.isFiniteY(v));
      if (leftVals.length < 1 || rightVals.length < 1) continue;
      const l = leftVals.reduce((a, b) => a + b, 0) / leftVals.length;
      const r = rightVals.reduce((a, b) => a + b, 0) / rightVals.length;
      const ls = Math.max(...leftVals.map(v => Math.abs(v - l)));
      const rs = Math.max(...rightVals.map(v => Math.abs(v - r)));
      if (ls > this.MAX_JUMP * 2 || rs > this.MAX_JUMP * 2) continue;
      leftAvg = l;
      rightAvg = r;
      bestGap = Math.abs(r - l);
      if (bestGap < this.MAX_JUMP * 0.6) return false;
    }
    if (bestGap === null) return false;
    const signFlip = leftAvg * rightAvg < 0;
    return signFlip || bestGap > this.MAX_JUMP * 0.9;
  }

  isContinuous(expr, a, b, depth = 0) {
    if (depth >= this.MAX_CONTINUITY_BISECTIONS) return true;
    const left = this.evalAt(expr, a);
    const right = this.evalAt(expr, b);
    if (!this.isFiniteY(left) || !this.isFiniteY(right)) return false;
    const mid = (a + b) / 2;
    const middle = this.evalAt(expr, mid);
    if (!this.isFiniteY(middle)) return false;
    const q1 = this.evalAt(expr, (a + mid) / 2);
    const q3 = this.evalAt(expr, (mid + b) / 2);
    if (!this.isFiniteY(q1) || !this.isFiniteY(q3)) return false;
    const span = Math.abs(b - a);
    const expectedMid = (left + right) / 2;
    const expectedQ1 = (left + middle) / 2;
    const expectedQ3 = (middle + right) / 2;
    const midResidual = Math.abs(middle - expectedMid);
    const qResidual = Math.abs(q1 - expectedQ1) + Math.abs(q3 - expectedQ3);
    const slope = Math.abs((right - left) / Math.max(span, 1e-12));
    const lineLike = midResidual <= Math.max(this.MAX_JUMP, slope * span * 0.08) && qResidual <= Math.max(this.MAX_JUMP, slope * span * 0.16);
    if (lineLike) return true;
    if (midResidual > this.MAX_JUMP * 1.2 || qResidual > this.MAX_JUMP * 2.2) {
      return this.isContinuous(expr, a, mid, depth + 1) && this.isContinuous(expr, mid, b, depth + 1);
    }
    return true;
  }

  buildPoints(expr) {
    const xmin = -this.plotter.range;
    const xmax = this.plotter.range;
    const steps = Math.max(8000, Math.floor(this.plotter.canvas.clientWidth * 20));
    const dx = (xmax - xmin) / steps;
    const type = this.plotter.curveType(expr);
    const points = [];

    const shouldBreakBetween = (a, b, leftY, rightY) => {
      const midX = (a + b) / 2;
      const midY = this.evalAt(expr, midX);
      if (!this.isFiniteY(midY)) return true;
      const gap = Math.abs(rightY - leftY);
      const signFlip = leftY * rightY < 0;
      const slope = Math.abs((rightY - leftY) / Math.max(b - a, 1e-12));
      const midExpected = (leftY + rightY) / 2;
      const midResidual = Math.abs(midY - midExpected);
      const looksLikeJump = (signFlip && midResidual > this.MAX_JUMP * 0.25)
        || (gap > this.MAX_JUMP * 2 && midResidual > this.MAX_JUMP * 0.75 && slope < 1e5)
        || (this.isJumpDiscontinuity(expr, midX) && !signFlip);
      return looksLikeJump;
    };

    let prev = null;
    for (let x = xmin; x <= xmax; x += dx) {
      const y = this.evalAt(expr, x);
      if (!this.isFiniteY(y)) {
        if (points.length && !points[points.length - 1].break) points.push({ break: true });
        prev = null;
        continue;
      }
      const cur = { x, y };
      if (prev) {
        const leftProbe = this.evalAt(expr, prev.x + dx * 0.15);
        const rightProbe = this.evalAt(expr, x - dx * 0.15);
        if (!this.isFiniteY(leftProbe) || !this.isFiniteY(rightProbe) || shouldBreakBetween(prev.x, x, leftProbe, rightProbe)) {
          points.push({ break: true });
        }
      }
      points.push(cur);
      prev = cur;
    }

    if (type.linearLike && points.length > 2) {
      const refined = [];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        refined.push(a);
        if (a.break || b.break) continue;
        const mx = (a.x + b.x) / 2;
        const my = this.evalAt(expr, mx);
        if (this.isFiniteY(my)) refined.push({ x: mx, y: my });
      }
      refined.push(points[points.length - 1]);
      return refined;
    }
    return points;
  }

  drawPolyline(points) {
    const ctx = this.plotter.ctx;
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const p of points) {
      if (p.break || p.y === null) {
        if (started) ctx.stroke();
        ctx.beginPath();
        started = false;
        continue;
      }
      const c = this.plotter.toCanvas(p.x, p.y);
      if (!started) { ctx.moveTo(c.x, c.y); started = true; }
      else { ctx.lineTo(c.x, c.y); }
    }
    if (started) ctx.stroke();
    ctx.restore();
  }
}
