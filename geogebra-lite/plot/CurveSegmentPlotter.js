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

  start() {
    if (this.isCurveUndefinedAt(this.tMin)) return this.plotProblemInterval(this.tMin);
    this.evalLeft = [...this.eval];
    if (this.isCurveUndefinedAt(this.tMax)) return this.plotProblemInterval(this.tMin);
    this.onScreen = this.isOnView(this.eval);
    this.evalRight = [...this.eval];
    this.gp.firstPoint(this.evalLeft, this.moveToAllowed);
    this.createStack(); this.createDivisors(); this.createParams(); this.initDiffs(); this.createInfo();
    this.plot();
    return true;
  }

  createStack() { this.stack = new CurvePlotterStack(this.CurveLength(), this.onScreen, this.evalRight); }
  CurveLength() { return this.MAX_DEFINED_BISECTIONS + 1; }
  createDivisors() { this.divisors = this.createDivisorsArray(this.tMin, this.tMax); }
  createParams() { this.params = new SegmentParams(this.tMin, this.divisors, this); }
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
        if (this.isUndefinedVec(this.eval)) {
          if (this.hasNoSingularity(this.params.t, this.divisors[this.divisors.length - 1])) {
            return true;
          }
        }
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
    this.gp.endPlot?.();
    return false;
  }

  hasNoSingularity(t, interval) { return !this.isContinuousAround(this.curve, t, interval, this.view, this.eval); }
  isCurveUndefinedAt(x) { this.curve.evaluateCurve(x, this.eval); return this.isUndefinedVec(this.eval); }

  drawSegment(t, left, info) {
    if (this.isLineTo(t, left, info)) {
      if (this.nextLineToNeedsMoveToFirst) { this.gp.moveTo(this.move); this.nextLineToNeedsMoveToFirst = false; }
      this.gp.lineTo(this.evalRight);
    } else {
      this.move = [...this.evalRight];
      this.nextLineToNeedsMoveToFirst = true;
    }
  }

  calculateLabelPosition() { this.labelPoint = this.evalRight ? [this.evalRight[0], this.evalRight[1]] : null; this.needLabelPos = false; }
  isLineTo(t, left, info) { if (this.moveToAllowed === Gap.MOVE_TO) { if (info.isOffScreen()) return false; if (info.isDistanceOrAngleInvalid()) return this.isContinuous(this.curve, left, t, this.MAX_CONTINUITY_BISECTIONS); } else if (this.moveToAllowed === Gap.CORNER) { this.gp.corner(this.evalRight); } return true; }
  isDiffZero(diff) { return Math.abs(diff[0]) < 1e-12 && Math.abs(diff[1]) < 1e-12; }
  createDivisorsArray(tMin, tMax) { const divisors = new Array(this.MAX_DEFINED_BISECTIONS + 1); divisors[0] = tMax - tMin; for (let i = 1; i < divisors.length; i++) divisors[i] = divisors[i - 1] / 2; return divisors; }
  isUndefined(x) { return x == null || !Number.isFinite(x); }
  isUndefinedVec(evalVec) { for (const value of evalVec) if (this.isUndefined(value)) return true; return false; }

  // 在 [goodEnd, badEnd] 方向画线到屏幕边界或 undefined 处
  // goodEnd: 有定义的一端, badEnd: undefined 的一端
  plotToBoundary(goodEnd, badEnd) {
    const sample = this.curve.newDoubleArray();
    const ITERS = 64;
    let a = goodEnd, b = badEnd;
    let prevPoint = null;

    for (let i = 0; i < ITERS; i++) {
      const mid = (a + b) / 2;
      this.curve.evaluateCurve(mid, sample);
      if (this.isUndefinedVec(sample)) {
        b = mid;
        continue;
      }
      const pt = [...sample];
      if (prevPoint) {
        this.gp.lineTo(pt);
      } else {
        this.gp.moveTo(pt);
      }
      prevPoint = pt;
      a = mid;

      // 当点远离屏幕时停止，GP 裁剪器会将线段裁剪到屏幕边界
      const sy = this.view.toScreenCoordYd(pt[1]);
      const h = this.view.getHeight();
      if (sy < -50 || sy > h + 50) break;
    }
  }

  // 从 undefined 端点向 defined 方向画到屏幕边界
  // 用于处理区间左端 undefined、右端 defined 的情况（如 0.1/x 的 x=0+ 侧）
  plotFromBoundary(badEnd, goodEnd) {
    const sample = this.curve.newDoubleArray();
    const ITERS = 64;
    let a = badEnd, b = goodEnd;
    let prevPoint = null;

    for (let i = 0; i < ITERS; i++) {
      const mid = (a + b) / 2;
      this.curve.evaluateCurve(mid, sample);
      if (this.isUndefinedVec(sample)) {
        a = mid;
        continue;
      }
      const pt = [...sample];
      if (prevPoint) {
        this.gp.lineTo(pt);
      } else {
        this.gp.moveTo(pt);
      }
      prevPoint = pt;
      b = mid;

      // 当点远离屏幕时停止
      const sy = this.view.toScreenCoordYd(pt[1]);
      const h = this.view.getHeight();
      if (sy < -50 || sy > h + 50) break;
    }
  }

  plotProblemInterval(left) {
    const calcLabel = this.needLabelPos;
    if (this.intervalDepth > this.MAX_PROBLEM_BISECTIONS || left === this.tMax) return this.labelPoint;
    const splitParam = (left + this.tMax) / 2.0;
    const intervalSize = Math.abs(this.tMax - left);
    if (intervalSize <= this.maxParamStep) {
      // 区间太小无法继续分裂
      // 情况1: left 有定义，tMax 无定义 → 从 left 向 tMax 方向画到边界
      const sampleL = this.curve.newDoubleArray();
      this.curve.evaluateCurve(left, sampleL);
      const leftDefined = !this.isUndefinedVec(sampleL);
      const tMaxUndefined = this.isCurveUndefinedAt(this.tMax);

      if (leftDefined && tMaxUndefined) {
        this.plotToBoundary(left, this.tMax);
      }
      // 情况2: left 无定义，tMax 有定义 → 从 left 向 tMax 方向画到边界（上侧双曲线场景）
      if (!leftDefined && !tMaxUndefined) {
        this.plotFromBoundary(left, this.tMax);
      }
      return this.labelPoint;
    }
    const leftBorders = [left, splitParam];
    const rightBorders = [splitParam, this.tMax];
    this.getDefinedInterval(this.curve, left, splitParam, leftBorders);
    this.getDefinedInterval(this.curve, splitParam, this.tMax, rightBorders);
    const leftDepth = this.intervalDepth + 1;
    const rightDepth = this.intervalDepth + 1;
    if (Math.abs(leftBorders[1] - leftBorders[0]) > this.maxParamStep && leftDepth <= this.MAX_PROBLEM_BISECTIONS) {
      const leftPlotter = new CurveSegmentPlotter(this.curve, leftBorders[0], leftBorders[1], leftDepth, this.maxParamStep, this.view, this.gp, calcLabel && this.labelPoint == null, this.moveToAllowed);
      if (!this.labelPoint && leftPlotter.getLabelPoint()) this.labelPoint = leftPlotter.getLabelPoint();
    }
    if (Math.abs(rightBorders[1] - rightBorders[0]) > this.maxParamStep && rightDepth <= this.MAX_PROBLEM_BISECTIONS) {
      const rightPlotter = new CurveSegmentPlotter(this.curve, rightBorders[0], rightBorders[1], rightDepth, this.maxParamStep, this.view, this.gp, calcLabel && this.labelPoint == null, this.moveToAllowed);
      if (!this.labelPoint && rightPlotter.getLabelPoint()) this.labelPoint = rightPlotter.getLabelPoint();
    } else if (Math.abs(rightBorders[1] - rightBorders[0]) <= this.maxParamStep) {
      // 右边界区间太小，检查是否需要画到边界
      const sample = this.curve.newDoubleArray();
      this.curve.evaluateCurve(rightBorders[0], sample);
      if (!this.isUndefinedVec(sample) && this.isCurveUndefinedAt(rightBorders[1])) {
        this.plotToBoundary(rightBorders[0], rightBorders[1]);
      }
    }
    return this.labelPoint;
  }

  isContinuousAround(curve, t, eps, view, evalT) {
    if (eps <= 0 || !Number.isFinite(eps)) return false;
    const sample = curve.newDoubleArray();
    const checkEps = Math.min(eps, Math.abs(this.tMax - this.tMin) / 65536);
    curve.evaluateCurve(t + checkEps, sample);
    const rightY = sample[1];
    if (this.isUndefinedVec(sample)) return false;
    curve.evaluateCurve(t - checkEps, sample);
    const leftY = sample[1];
    if (this.isUndefinedVec(sample)) return false;
    if (curve.isFunctionInX && curve.isFunctionInX() && Math.abs(rightY - leftY) * (view?.getYscale?.() || 1) < this.MAX_JUMP) {
      evalT[1] = (rightY + leftY) * 0.5;
      return true;
    }
    return !curve.isFunctionInX || !curve.isFunctionInX();
  }
  isContinuous(c, from, to, maxIterations) { if (maxIterations <= 0) return true; let tMin = from; let tMax = to; const left = c.newDoubleArray(); const right = c.newDoubleArray(); c.evaluateCurve(tMin, left); c.evaluateCurve(tMax, right); if (this.isUndefinedVec(left) || this.isUndefinedVec(right)) return false; const initialDistance = Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1])); const eps = Math.max(initialDistance * 0.9, 1e-12); const middle = c.newDoubleArray(); let dist = Infinity; for (let i = 0; i < maxIterations && dist > eps; i++) { const m = (tMin + tMax) / 2; c.evaluateCurve(m, middle); if (this.isUndefinedVec(middle)) return false; const distLeft = this.distanceMax(left, middle); const distRight = this.distanceMax(right, middle); if (distLeft > distRight) { dist = distLeft; tMax = m; } else { dist = distRight; tMin = m; } if (Math.abs(tMin - tMax) < 1e-12) return true; } return dist <= eps; }
  getDefinedInterval(curve, a, b, borders) {
    const evalTmp = curve.newDoubleArray();
    curve.evaluateCurve(a, evalTmp);
    const aDef = !this.isUndefinedVec(evalTmp);
    curve.evaluateCurve(b, evalTmp);
    const bDef = !this.isUndefinedVec(evalTmp);
    if (aDef && bDef) { borders[0] = a; borders[1] = b; return; }
    if (aDef || bDef) {
      let interval;
      if (curve.getDefinedInterval) {
        interval = curve.getDefinedInterval(a, b);
      } else {
        // 无 getDefinedInterval 时，用二进制搜索找有定义的子区间
        interval = this._findDefinedIntervalBySearch(curve, a, b, aDef, bDef);
      }
      borders[0] = this.isUndefined(interval[0]) ? a : interval[0];
      borders[1] = this.isUndefined(interval[1]) ? b : interval[1];
      return;
    }
    borders[0] = a; borders[1] = b;
  }

  // 当 curve 没有 getDefinedInterval 时，用二进制搜索找有定义的子区间
  _findDefinedIntervalBySearch(curve, a, b, aDef, bDef) {
    const evalTmp = curve.newDoubleArray();
    if (!aDef && bDef) {
      // a 无定义，b 有定义：找第一个有定义的点
      let lo = a, hi = b;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        curve.evaluateCurve(mid, evalTmp);
        if (this.isUndefinedVec(evalTmp)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      // hi 是有定义的点，验证一下
      curve.evaluateCurve(hi, evalTmp);
      if (!this.isUndefinedVec(evalTmp)) {
        return [hi, b];
      }
      return [a, b];
    }
    if (aDef && !bDef) {
      // a 有定义，b 无定义：找最后一个有定义的点
      let lo = a, hi = b;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        curve.evaluateCurve(mid, evalTmp);
        if (this.isUndefinedVec(evalTmp)) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      curve.evaluateCurve(lo, evalTmp);
      if (!this.isUndefinedVec(evalTmp)) {
        return [a, lo];
      }
      return [a, b];
    }
    return [a, b];
  }
  getOnScreenDiff(a, b) { if (!this.view || !this.view.toScreenCoordXd || !this.view.toScreenCoordYd) return [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]; return [Math.abs(this.view.toScreenCoordXd(a[0]) - this.view.toScreenCoordXd(b[0])), Math.abs(this.view.toScreenCoordYd(a[1]) - this.view.toScreenCoordYd(b[1]))]; }
  isOnView(evalVec) { return !this.isUndefinedVec(evalVec); }
  distanceMax(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  getLabelPoint() { return this.labelPoint; }
}

if (typeof window !== 'undefined') { window.CurveSegmentPlotter = CurveSegmentPlotter; }
