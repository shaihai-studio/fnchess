class SegmentParams {
  constructor(tMin, divisors, plotter) {
    this.tMin = tMin;
    this.divisors = divisors;
    this.plotter = plotter;
    this.dyad = 1;
    this.depth = 0;
    this.diff = [0, 0];
    this.prevDiff = [0, 0];
    this.countDiffZeros = 0;
    this.t = tMin;
    this.left = tMin;
  }

  hasNotReachedMaxDepth() {
    return this.depth < 16;
  }

  isDiffZerosLimitNotReached() {
    return this.countDiffZeros < 1000;
  }

  isStepTooBig(maxParamStep) {
    return this.currentDivisor() > maxParamStep;
  }

  currentDivisor() {
    return this.divisors[this.depth];
  }

  progress() {
    this.dyad = 2 * this.dyad - 1;
    this.depth++;
    this.updateT();
  }

  updateT() {
    this.t = this.tMin + this.dyad * this.currentDivisor();
  }

  updateDiff(evalLeft, evalRight) {
    if (this.plotter && typeof this.plotter.getOnScreenDiff === 'function') {
      this.diff = this.plotter.getOnScreenDiff(evalLeft, evalRight);
      return;
    }
    this.diff = [evalRight[0] - evalLeft[0], evalRight[1] - evalLeft[1]];
  }

  updatePreviousDiff() {
    this.prevDiff = [...this.diff];
  }

  restoreFromStack(item) {
    this.depth = item.depth + 1;
    this.dyad = item.dyadic * 2;
    this.updatePreviousDiff();
    this.updateT();
  }
}

if (typeof window !== 'undefined') {
  window.SegmentParams = SegmentParams;
}
