class AdaptiveCurvePlotter {
  constructor(plotter) {
    this.plotter = plotter;
    this.classifier = plotter.classifier;
    this.domain = plotter.domain;
    this.maxDepth = 16;
    this.minPixelStep = 0.25;
    this.maxDelta = 6.0;
    this.maxSlope = 120;
    this.yLimitFactor = 12;
  }

  isFiniteY(y) { return Number.isFinite(y) && y !== null; }
  typeOf(expr) { return this.plotter.curveType ? this.plotter.curveType(expr) : { linearLike: false, hasFactorial: false, hasReciprocal: false, hasJumpAbsRatio: false, hasTan: false, hasVerticalAsymptoteCandidate: false }; }

  shouldConnectAcross(expr, x) {
    const c = this.classifier.classifyJump(expr, x);
    if (c === 'jump') return false;
    if (this.domain.isBreak(expr, x)) return false;
    return true;
  }

  shouldSplit(expr, a, b, ya, yb, depth) {
    if (depth >= this.maxDepth) return false;
    const dx = b - a;
    const minDx = this.minPixelStep * (2 * this.plotter.range) / this.plotter.canvas.clientWidth;
    if (dx <= minDx) return false;
    if (!this.isFiniteY(ya) || !this.isFiniteY(yb)) return true;
    const mid = (a + b) / 2;
    const ym = this.plotter.evalAt(expr, mid);
    if (!this.isFiniteY(ym)) return true;
    if (this.domain.isBreak(expr, mid)) return true;
    const q1 = this.plotter.evalAt(expr, (a + mid) / 2);
    const q3 = this.plotter.evalAt(expr, (mid + b) / 2);
    if (!this.isFiniteY(q1) || !this.isFiniteY(q3)) return true;
    const chordMid = (ya + yb) / 2;
    const curvature = Math.abs(ym - chordMid);
    const quadResidual = Math.abs(q1 - (ya + ym) / 2) + Math.abs(q3 - (ym + yb) / 2);
    const pxA = this.plotter.toCanvas(a, ya);
    const pxB = this.plotter.toCanvas(b, yb);
    const pixelDx = Math.abs(pxB.x - pxA.x);
    const pixelDy = Math.abs(pxB.y - pxA.y);
    const slope = Math.abs((yb - ya) / Math.max(dx, 1e-12));
    const type = this.typeOf(expr);
    if (type.hasReciprocal || type.hasVerticalAsymptoteCandidate || type.hasJumpAbsRatio) return false;
    if (this.classifier.isJumpDiscontinuity(expr, mid)) return true;
    if (!this.classifier.continuityBisect(expr, a, b)) return true;
    if (!type.linearLike && curvature > this.maxDelta) return true;
    if (!type.linearLike && quadResidual > this.maxDelta * 2) return true;
    if (!type.linearLike && pixelDy > 12) return true;
    if (!type.linearLike && pixelDx > 0 && pixelDy / pixelDx > 24 && slope < this.maxSlope * 4) return true;
    return false;
  }

  nextStep(expr, x, y, coarseStep, endX) {
    const eps = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    const y1 = this.plotter.evalAt(expr, x + eps * 2);
    const y2 = this.plotter.evalAt(expr, x + eps * 8);
    let step = coarseStep;
    const type = this.typeOf(expr);
    if (type.hasReciprocal || type.hasVerticalAsymptoteCandidate || type.hasJumpAbsRatio) return Math.min(coarseStep * 0.6, (endX - x) / 800);
    if (type.linearLike) return Math.max(coarseStep * 2.2, (endX - x) / 250);
    if (this.isFiniteY(y1) && this.isFiniteY(y2)) {
      const slope = Math.abs((y2 - y1) / Math.max(eps * 6, 1e-12));
      if (slope > this.maxSlope * 8) step *= 0.35; else if (slope > this.maxSlope * 4) step *= 0.55; else if (slope > this.maxSlope * 2) step *= 0.85; else if (slope < 0.5) step *= 1.4;
    }
    return Math.max(step, (endX - x) / 500);
  }

  localRefine(expr, a, b, baseSteps) {
    const steps = Math.max(baseSteps, 10), out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = a + (b - a) * t, y = this.plotter.evalAt(expr, x);
      if (this.isFiniteY(y)) out.push({ x, y }); else if (out.length && !out[out.length - 1].break) out.push({ break: true });
    }
    return out;
  }

  splitAndPush(expr, a, b, depth, out) {
    if (b <= a) return;
    const ya = this.plotter.evalAt(expr, a);
    const yb = this.plotter.evalAt(expr, b);
    if (!this.shouldSplit(expr, a, b, ya, yb, depth)) { out.push(...this.localRefine(expr, a, b, Math.max(32, Math.round((b - a) * 80)))); return; }
    const mid = (a + b) / 2;
    if (depth >= this.maxDepth) { out.push(...this.localRefine(expr, a, b, 20)); return; }
    this.splitAndPush(expr, a, mid, depth + 1, out);
    out.push({ break: true });
    this.splitAndPush(expr, mid, b, depth + 1, out);
  }

  build(expr) {
    const { xmin, xmax } = this.plotter.getView();
    const candidates = this.domain.findCandidates(expr, xmin, xmax);
    const points = [];
    let start = xmin;
    const eps = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    const localWindow = Math.max(8 * eps, (xmax - xmin) / 400);
    const coarseStep = Math.max((xmax - xmin) / 2500, this.plotter.range / this.plotter.canvas.clientWidth / 8);
    const type = this.typeOf(expr);
    const pushStrip = (a, b) => {
      if (b <= a) return;
      let x = a, prev = null;
      while (x <= b) {
        const y = this.plotter.evalAt(expr, x);
        if (this.isFiniteY(y)) {
          const p = { x, y };
          if (prev) {
            const shouldConnect = this.shouldConnectAcross(expr, x);
            if (!shouldConnect && this.classifier.isJumpDiscontinuity(expr, x)) points.push({ break: true });
          }
          points.push(p); prev = p; x += this.nextStep(expr, x, y, coarseStep, b);
        } else {
          if (points.length && !points[points.length - 1].break) points.push({ break: true }); prev = null; x += coarseStep;
        }
      }
    };

    for (const d of candidates) {
      const left = d - localWindow;
      const right = d + localWindow;
      if (left > start) {
        pushStrip(start, left);
        if (!type.linearLike && !type.hasFactorial) this.splitAndPush(expr, Math.max(start, d - localWindow), Math.min(left, d - eps), 0, points);
      }
      points.push({ break: true });
      start = right;
    }
    if (start < xmax) {
      pushStrip(start, xmax);
      if (!type.linearLike && !type.hasFactorial) this.splitAndPush(expr, Math.max(start, xmax - localWindow), xmax, 0, points);
    }
    return points;
  }

  drawAsymptotes(expr) { return; }
}
