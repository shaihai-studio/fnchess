class CurveSegmentPlotter {
  constructor(curve, tMin, tMax, intervalDepth, maxParamStep, view, gp, calcLabelPos, moveToAllowed) {
    this.curve = curve;
    this.tMin = tMin;
    this.tMax = tMax;
    this.intervalDepth = intervalDepth;
    this.maxParamStep = maxParamStep;
    this.view = view;
    this.gp = gp;
    this.needLabelPos = calcLabelPos;
    this.moveToAllowed = moveToAllowed;
    this.labelPoint = null;
    this.move = curve.newDoubleArray();
    this.nextLineToNeedsMoveToFirst = false;
    this.eval = curve.newDoubleArray();
    this.evalLeft = null;
    this.evalRight = null;
    this.info = null;
    this.params = null;
    this.stack = null;
    this.onScreen = false;
    this.divisors = null;
    this.zeroStack = [];
    this.zeroRefinePoints = [];
    this.debug = false;

    this.MAX_DEFINED_BISECTIONS = 16;
    this.MAX_PROBLEM_BISECTIONS = 8;
    this.MAX_CONTINUITY_BISECTIONS = 8;
    this.MAX_JUMP = 5;
    this.MAX_SEGMENT_STEPS = 4096;
    this.MAX_REFINED_DEPTH = 16;
    this.MAX_ZERO_COUNT = 1000;
    this.MAX_SLOPE = 1e4;

    this.start();
  }

  getExpr() { return this.curve?.expr || ''; }
  isSqrtExpr() { return /sqrt\(/i.test(this.getExpr()); }
  getWindowSize() { return Math.max(Math.abs(this.tMax - this.tMin), this.view?.getWidth?.() || 1); }
  getZeroWindow() { return this.getWindowSize() / 32; }

  logDebug(stage, extra = {}) {
    if (typeof console === 'undefined' || !this.isSqrtExpr()) return;
    console.log(`[CurveSegmentPlotter:${stage}]`, {
      expr: this.getExpr(),
      tMin: this.tMin,
      tMax: this.tMax,
      zeroWindow: this.getZeroWindow(),
      zeroStack: [...this.zeroStack],
      zeroRefinePoints: [...this.zeroRefinePoints],
      ...extra
    });
  }

  start() {
    if (this.isCurveUndefinedAt(this.tMin)) return this.plotProblemInterval(this.tMin);
    this.evalLeft = [...this.eval];
    if (this.isCurveUndefinedAt(this.tMax)) return this.plotProblemInterval(this.tMin);
    this.onScreen = this.isOnView(this.eval);
    this.evalRight = [...this.eval];
    if (!this.isPointOnScreen(this.evalLeft)) {
      const b = this.findFirstOnScreen(this.tMin, this.tMax);
      if (!b) { this.gp.endPlot?.(); return; }
      this.evalLeft = [...b];
      this.evalRight = [...b];
      this.onScreen = true;
    }
    this.gp.firstPoint(this.evalLeft, this.moveToAllowed);
    this.createStack(); this.createDivisors(); this.createParams(); this.initDiffs(); this.createInfo();
    if (this.isSqrtExpr()) this.collectZeroNeighborhoods();
    this.logDebug('start');
    this.plot();
    return true;
  }

  collectZeroNeighborhoods() {
    const w = this.getZeroWindow();
    const step = Math.max(w / 8, this.maxParamStep / 8);
    for (let x = this.tMin; x <= this.tMax; x += step) {
      this.curve.evaluateCurve(x, this.eval);
      if (!this.isUndefinedVec(this.eval) && Math.abs(this.eval[1]) < w / 32) this.zeroStack.push(x);
    }
    this.logDebug('collectZeroNeighborhoods');
  }

  refineZeroNeighborhoods() {
    if (!this.isSqrtExpr() || this.zeroStack.length === 0) {
      this.logDebug('refineZeroNeighborhoods-skip', { reason: 'no zeroStack or not sqrt' });
      return;
    }
    const w = this.getZeroWindow();
    const half = w / 32;
    const step = Math.max(half / 16, this.maxParamStep / 16);
    const uniq = [...new Set(this.zeroStack)].sort((a, b) => a - b);
    this.zeroRefinePoints = [];
    for (const center of uniq) {
      const a = Math.max(this.tMin, center - half);
      const b = Math.min(this.tMax, center + half);
      let prev = null;
      const oldStroke = this.gp.ctx?.strokeStyle;
      if (this.gp.ctx) this.gp.ctx.strokeStyle = '#ef4444';
      for (let x = a; x <= b; x += step) {
        this.curve.evaluateCurve(x, this.eval);
        if (this.isUndefinedVec(this.eval)) { prev = null; continue; }
        this.zeroRefinePoints.push([this.eval[0], this.eval[1]]);
        if (prev) this.gp.lineTo(this.eval);
        else this.gp.moveTo(this.eval);
        prev = [...this.eval];
      }
      if (this.gp.ctx && oldStroke != null) this.gp.ctx.strokeStyle = oldStroke;
    }
    this.logDebug('refineZeroNeighborhoods', { hasRefine: this.zeroRefinePoints.length > 0 });
  }

  createStack() { this.stack = new CurvePlotterStack(this.CurveLength(), this.onScreen, this.evalRight); }
  CurveLength() { return this.MAX_DEFINED_BISECTIONS + 1; }
  createDivisors() { this.divisors = this.createDivisorsArray(this.tMin, this.tMax); }
  createParams() { this.params = new SegmentParams(this.tMin, this.divisors, this.view); }
  initDiffs() { this.params.diff = this.getOnScreenDiff(this.evalLeft, this.evalRight); this.curve.evaluateCurve(this.tMin + this.divisors[this.divisors.length - 1], this.eval); this.params.prevDiff = this.getOnScreenDiff(this.evalLeft, this.eval); }
  createInfo() { this.info = new CurveSegmentInfo(this.view); }

  plot() { if (this.plotBisectorAlgo()) return this.plotProblemInterval(this.params ? this.params.left : this.tMin); return this.labelPoint; }

  plotBisectorAlgo() {
    if (!this.params || !this.stack || !this.info) { this.gp.endPlot?.(); return false; }
    let safety = 0;
    do {
      if (safety++ > this.MAX_SEGMENT_STEPS) { this.gp.endPlot?.(); return false; }
      this.info.update(this.evalLeft, this.evalRight, this.params.diff, this.params.prevDiff, this.curve);
      this.curve.updateExpandedFunctions?.();
      while (this.params.hasNotReachedMaxDepth() && this.info.hasNotReachedMinStep() && (this.info.isDistanceOrAngleInvalid() || this.params.isStepTooBig(this.maxParamStep)) && this.params.isDiffZerosLimitNotReached()) {
        if (!this.stack || this.stack.top >= this.stack.items.length - 1) { this.gp.endPlot?.(); return false; }
        this.stack.push(this.params.dyad, this.params.depth, this.onScreen, [...this.evalRight]);
        this.params.progress();
        this.curve.evaluateCurve(this.params.t, this.eval);
        this.onScreen = this.isOnView(this.eval);
        if (this.isUndefinedVec(this.eval)) { if (this.hasNoSingularity(this.params.t, this.divisors[this.divisors.length - 1])) { const b = this.findBoundary(this.evalLeft[0], this.params.t); if (b) this.gp.lineTo(b); return true; } } else if (!this.isPointOnScreen(this.eval)) { const b = this.findBoundary(this.evalLeft[0], this.params.t); if (b) this.gp.lineTo(b); this.move = [...this.eval]; this.nextLineToNeedsMoveToFirst = true; return true; }
        this.evalRight = [...this.eval];
        this.params.updateDiff(this.evalLeft, this.evalRight);
        this.params.countDiffZeros = this.isDiffZero(this.params.diff) ? this.params.countDiffZeros + 1 : 0;
        this.info.update(this.evalLeft, this.evalRight, this.params.diff, this.params.prevDiff, this.curve);
      }
      this.drawSegment(this.params.t, this.params.left, this.info);
      this.evalLeft = [...this.evalRight];
      this.params.left = this.params.t;
      if (this.onScreen && this.needLabelPos) this.calculateLabelPosition();
      const item = this.stack.pop();
      if (!item) { this.gp.endPlot?.(); return false; }
      this.onScreen = item.onScreen;
      this.evalRight = [...item.eval];
      this.params.restoreFromStack(item);
      this.params.updateDiff(this.evalLeft, this.evalRight);
    } while (this.stack.hasItems());
    this.refineZeroNeighborhoods();
    this.logDebug('plotBisectorAlgo-end');
    this.gp.endPlot?.();
    return false;
  }

  hasNoSingularity(t, interval) { return !this.isContinuousAround(this.curve, t, interval, this.view, this.eval); }
  isCurveUndefinedAt(x) { this.curve.evaluateCurve(x, this.eval); return this.isUndefinedVec(this.eval); }
  drawSegment(t, left, info) { if (this.isLineTo(t, left, info)) { if (this.nextLineToNeedsMoveToFirst) { this.gp.moveTo(this.move); this.nextLineToNeedsMoveToFirst = false; } this.gp.lineTo(this.evalRight); } else { if (this.evalRight && !this.isPointOnScreen(this.evalRight)) { const b = this.findBoundary(this.evalLeft[0], t); if (b) this.gp.lineTo(b); } this.move = [...this.evalRight]; this.nextLineToNeedsMoveToFirst = true; } }
  calculateLabelPosition() { this.labelPoint = this.evalRight ? [this.evalRight[0], this.evalRight[1]] : null; this.needLabelPos = false; }
  isLineTo(t, left, info) { if (this.moveToAllowed === Gap.MOVE_TO) { if (info.isOffScreen()) return false; if (info.isDistanceOrAngleInvalid()) return this.isContinuous(this.curve, left, t, this.MAX_CONTINUITY_BISECTIONS); } else if (this.moveToAllowed === Gap.CORNER) { this.gp.corner(this.evalRight); } return true; }
  isDiffZero(diff) { return Math.abs(diff[0]) < 1e-12 && Math.abs(diff[1]) < 1e-12; }
  createDivisorsArray(tMin, tMax) { const divisors = new Array(this.MAX_DEFINED_BISECTIONS + 1); divisors[0] = tMax - tMin; for (let i = 1; i < divisors.length; i++) divisors[i] = divisors[i - 1] / 2; return divisors; }
  isUndefined(x) { return x == null || !Number.isFinite(x); }
  isUndefinedVec(evalVec) { for (const value of evalVec) if (this.isUndefined(value)) return true; return false; }
  plotProblemInterval(left) {
    const calcLabel = this.needLabelPos;
    if (this.intervalDepth > this.MAX_PROBLEM_BISECTIONS || left === this.tMax) return this.labelPoint;
    const splitParam = (left + this.tMax) / 2.0;
    const intervalSize = Math.abs(this.tMax - left);
    if (intervalSize <= this.maxParamStep) return this.labelPoint;

    const leftBorders = [left, splitParam];
    const rightBorders = [splitParam, this.tMax];
    this.getDefinedInterval(this.curve, left, splitParam, leftBorders);
    this.getDefinedInterval(this.curve, splitParam, this.tMax, rightBorders);
    const leftDepth = this.intervalDepth + 1;
    const rightDepth = this.intervalDepth + 1;
    if (Math.abs(leftBorders[1] - leftBorders[0]) > this.maxParamStep && leftDepth <= this.MAX_PROBLEM_BISECTIONS) { const leftPlotter = new CurveSegmentPlotter(this.curve, leftBorders[0], leftBorders[1], leftDepth, this.maxParamStep, this.view, this.gp, calcLabel && this.labelPoint == null, this.moveToAllowed); if (!this.labelPoint && leftPlotter.getLabelPoint()) this.labelPoint = leftPlotter.getLabelPoint(); }
    if (Math.abs(rightBorders[1] - rightBorders[0]) > this.maxParamStep && rightDepth <= this.MAX_PROBLEM_BISECTIONS) { const rightPlotter = new CurveSegmentPlotter(this.curve, rightBorders[0], rightBorders[1], rightDepth, this.maxParamStep, this.view, this.gp, calcLabel && this.labelPoint == null, this.moveToAllowed); if (!this.labelPoint && rightPlotter.getLabelPoint()) this.labelPoint = rightPlotter.getLabelPoint(); }
    return this.labelPoint;
  }
  isContinuousAround(curve, t, eps, view, evalT) { if (eps <= 0 || !Number.isFinite(eps)) return false; const sample = curve.newDoubleArray(); curve.evaluateCurve(t + eps, sample); const oldy = sample[1]; if (this.isUndefinedVec(sample)) return false; curve.evaluateCurve(t - eps, sample); if (this.isUndefinedVec(sample)) return false; if (curve.isFunctionInX && curve.isFunctionInX() && Math.abs(oldy - sample[1]) * (view?.getYscale?.() || 1) < this.MAX_JUMP) { evalT[1] = (oldy + sample[1]) * 0.5; return true; } return !curve.isFunctionInX || !curve.isFunctionInX(); }
  isPointOnScreen(eval) {
    if (this.isUndefinedVec(eval)) return false;
    const sx = this.view.toScreenCoordXd(eval[0]);
    const sy = this.view.toScreenCoordYd(eval[1]);
    const w = this.view.getWidth();
    const h = this.view.getHeight();
    return sx >= 0 && sx <= w && sy >= 0 && sy <= h;
  }
  findBoundary(goodX, badX) {
    const sample = this.curve.newDoubleArray();
    const ITERS = 48;
    // 确保 lo < hi，同时跟踪哪个是good哪个是bad
    let a = goodX, b = badX;
    // 检查 a 是否是 good（在屏上）
    this.curve.evaluateCurve(a, sample);
    let aIsGood = !this.isUndefinedVec(sample) && Number.isFinite(sample[1]) && this.isPointOnScreen(sample);
    // 如果 a 是 bad，b 是 good，交换
    if (!aIsGood) { [a, b] = [b, a]; }
    // 现在 a = good (在屏上), b = bad (不在屏上)
    // 确保 a < b（如果不是，我们仍然可以搜索，只是方向问题）
    for (let i = 0; i < ITERS; i++) {
      if (Math.abs(b - a) < 1e-15) break;
      const mid = (a + b) / 2;
      this.curve.evaluateCurve(mid, sample);
      if (this.isUndefinedVec(sample) || !this.isPointOnScreen(sample)) { b = mid; }
      else { a = mid; }
    }
    this.curve.evaluateCurve(a, sample);
    if (!this.isUndefinedVec(sample) && Number.isFinite(sample[1]) && this.isPointOnScreen(sample)) return sample;
    return null;
  }
  findFirstOnScreen(a, b) {
    const sample = this.curve.newDoubleArray();
    const ITERS = 48;
    // 确保我们向正确的方向搜索
    this.curve.evaluateCurve(a, sample);
    let aIsOn = !this.isUndefinedVec(sample) && this.isPointOnScreen(sample);
    this.curve.evaluateCurve(b, sample);
    let bIsOn = !this.isUndefinedVec(sample) && this.isPointOnScreen(sample);
    if (aIsOn) return [...sample]; // a 已经在屏上了
    if (!bIsOn) return null; // 两端都不在屏上
    // a 不在屏上, b 在屏上: 向 b 方向搜索第一个在屏上的点
    for (let i = 0; i < ITERS; i++) {
      if (Math.abs(b - a) < 1e-15) break;
      const mid = (a + b) / 2;
      this.curve.evaluateCurve(mid, sample);
      if (this.isUndefinedVec(sample) || !this.isPointOnScreen(sample)) { a = mid; }
      else { b = mid; }
    }
    this.curve.evaluateCurve(b, sample);
    if (!this.isUndefinedVec(sample) && this.isPointOnScreen(sample)) return sample;
    return null;
  }
  isContinuous(c, from, to, maxIterations) { if (maxIterations <= 0) return true; let tMin = from; let tMax = to; const left = c.newDoubleArray(); const right = c.newDoubleArray(); c.evaluateCurve(tMin, left); c.evaluateCurve(tMax, right); if (this.isUndefinedVec(left) || this.isUndefinedVec(right)) return false; const initialDistance = Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1])); const eps = Math.max(initialDistance * 0.9, 1e-12); const middle = c.newDoubleArray(); let dist = Infinity; for (let i = 0; i < maxIterations && dist > eps; i++) { const m = (tMin + tMax) / 2; c.evaluateCurve(m, middle); if (this.isUndefinedVec(middle)) return false; const distLeft = this.distanceMax(left, middle); const distRight = this.distanceMax(right, middle); if (distLeft > distRight) { dist = distLeft; tMax = m; } else { dist = distRight; tMin = m; } if (Math.abs(tMin - tMax) < 1e-12) return true; } return dist <= eps; }
  getDefinedInterval(curve, a, b, borders) { const evalTmp = curve.newDoubleArray(); curve.evaluateCurve(a, evalTmp); const aDef = !this.isUndefinedVec(evalTmp); curve.evaluateCurve(b, evalTmp); const bDef = !this.isUndefinedVec(evalTmp); if (aDef && bDef) { borders[0] = a; borders[1] = b; return; } if (aDef || bDef) { const interval = curve.getDefinedInterval ? curve.getDefinedInterval(a, b) : [a, b]; borders[0] = this.isUndefined(interval[0]) ? a : interval[0]; borders[1] = this.isUndefined(interval[1]) ? b : interval[1]; return; } borders[0] = a; borders[1] = b; }
  getOnScreenDiff(a, b) { if (!this.view || !this.view.toScreenCoordXd || !this.view.toScreenCoordYd) return [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]; return [Math.abs(this.view.toScreenCoordXd(a[0]) - this.view.toScreenCoordXd(b[0])), Math.abs(this.view.toScreenCoordYd(a[1]) - this.view.toScreenCoordYd(b[1]))]; }
  isOnView(evalVec) { return !this.isUndefinedVec(evalVec); }
  distanceMax(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  getLabelPoint() { return this.labelPoint; }
}

if (typeof window !== 'undefined') { window.CurveSegmentPlotter = CurveSegmentPlotter; }
