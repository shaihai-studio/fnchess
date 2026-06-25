class SegmentParams {
  constructor(tMin, divisors, view) {
    this.tMin = tMin;
    this.divisors = divisors;
    this.view = view;
    this.dyad = 1;
    this.depth = 0;
    this.diff = [0, 0];
    this.prevDiff = [0, 0];
    this.countDiffZeros = 0;
    this.t = tMin;
    this.left = tMin;
    this.MAX_DEFINED_BISECTIONS = 16;
    this.MAX_ZERO_COUNT = 1000;
  }

  hasNotReachedMaxDepth() {
    return this.depth < this.MAX_DEFINED_BISECTIONS;
  }

  isDiffZerosLimitNotReached() {
    return this.countDiffZeros < this.MAX_ZERO_COUNT;
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
    this.diff = this.view.getOnScreenDiff ? this.view.getOnScreenDiff(evalLeft, evalRight) : [evalRight[0] - evalLeft[0], evalRight[1] - evalLeft[1]];
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
