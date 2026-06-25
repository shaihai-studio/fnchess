class ContinuityClassifier {
  constructor(plotter) {
    this.plotter = plotter;
    this.maxDelta = 1.2;
    this.maxSlope = 12;
    this.maxDepth = 8;
  }

  isFiniteY(y) {
    return Number.isFinite(y) && y !== null;
  }

  evalAt(expr, x) {
    const y = this.plotter.evalAt(expr, x);
    return this.isFiniteY(y) ? y : null;
  }

  sampleNeighborhood(expr, x) {
    const eps = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    return [
      this.evalAt(expr, x - eps * 8),
      this.evalAt(expr, x - eps * 2),
      this.evalAt(expr, x + eps * 2),
      this.evalAt(expr, x + eps * 8)
    ].filter(v => this.isFiniteY(v));
  }

  isJumpDiscontinuity(expr, x) {
    const eps0 = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    const levels = [32, 8, 2, 1];
    let bestGap = null;
    let leftAvg = null;
    let rightAvg = null;

    for (const k of levels) {
      const eps = eps0 * k;
      const leftVals = [this.evalAt(expr, x - eps * 8), this.evalAt(expr, x - eps * 2)].filter(v => this.isFiniteY(v));
      const rightVals = [this.evalAt(expr, x + eps * 2), this.evalAt(expr, x + eps * 8)].filter(v => this.isFiniteY(v));
      if (leftVals.length < 2 || rightVals.length < 2) continue;
      const l = leftVals.reduce((a, b) => a + b, 0) / leftVals.length;
      const r = rightVals.reduce((a, b) => a + b, 0) / rightVals.length;
      const ls = Math.max(...leftVals.map(v => Math.abs(v - l)));
      const rs = Math.max(...rightVals.map(v => Math.abs(v - r)));
      if (ls > this.maxDelta * 4 || rs > this.maxDelta * 4) continue;
      leftAvg = l;
      rightAvg = r;
      bestGap = Math.abs(r - l);
      if (bestGap < this.maxDelta * 3) return false;
    }

    if (bestGap === null) return false;
    return Math.abs(leftAvg - rightAvg) > this.maxDelta * 4;
  }

  continuityBisect(expr, a, b, depth = 0) {
    const left = this.evalAt(expr, a);
    const right = this.evalAt(expr, b);
    if (!this.isFiniteY(left) || !this.isFiniteY(right)) return false;
    if (depth >= this.maxDepth) return true;

    const mid = (a + b) / 2;
    const middle = this.evalAt(expr, mid);
    if (!this.isFiniteY(middle)) return false;

    const slope = Math.abs((right - left) / Math.max(b - a, 1e-12));
    if (slope > this.maxSlope * 4) return false;

    const band = Math.abs(right - left) * 1.5 + this.maxDelta * 2;
    if (Math.abs(middle - left) > band || Math.abs(right - middle) > band) {
      return this.continuityBisect(expr, a, mid, depth + 1) && this.continuityBisect(expr, mid, b, depth + 1);
    }
    return true;
  }

  classifyJump(expr, x) {
    const neigh = this.sampleNeighborhood(expr, x);
    if (neigh.length < 2) return 'unknown';
    const left = neigh[0];
    const right = neigh[neigh.length - 1];
    const jump = Math.abs(right - left);
    const signFlip = left * right < 0;
    if (this.isJumpDiscontinuity(expr, x)) return 'jump';
    if (signFlip && jump > this.maxDelta * 2) return 'jump';
    return 'continuous';
  }
}
