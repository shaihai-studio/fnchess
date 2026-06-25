class CurveSegmentInfo {
  constructor(view) {
    this.view = view;
    this.distanceOK = true;
    this.angleOK = true;
    this.offScreen = false;
    this.reachedminStep = false;
  }

  isOffScreen() {
    return this.offScreen;
  }

  update(evalLeft, evalRight, diff, prevDiff, curve) {
    this.offScreen = this.view.isSegmentOffView ? this.view.isSegmentOffView(evalLeft, evalRight) : false;
    this.reachedminStep = Math.abs(diff[0]) < curve.getMinDistX();
    this.distanceOK = this.offScreen || this.isDistanceOK(diff);
    this.angleOK = this.isAngleOK(prevDiff, diff, this.offScreen ? this.getMaxBendOffScreen() : this.getMaxBend());
  }

  getMaxBend() {
    return this.view.getMaxBend ? this.view.getMaxBend() : Math.tan(10 * Math.PI / 180);
  }

  getMaxBendOffScreen() {
    return this.view.getMaxBendOffScreen ? this.view.getMaxBendOffScreen() : Math.tan(45 * Math.PI / 180);
  }

  isDistanceOrAngleInvalid() {
    return !this.angleOK || !this.distanceOK;
  }

  isDistanceOK(diff) {
    for (const d of diff) {
      if (Math.abs(d) > CurveSegmentInfo.MAX_PIXEL_DISTANCE) return false;
    }
    return true;
  }

  isAngleOK(v, w, bend) {
    let innerProduct = 0;
    for (let i = 0; i < v.length; i++) {
      innerProduct += v[i] * w[i];
    }
    if (!Number.isFinite(innerProduct)) return true;
    if (innerProduct <= 0) return false;
    let det;
    if (v.length < 3) {
      det = Math.abs(v[0] * w[1] - v[1] * w[0]);
    } else {
      const d1 = v[0] * w[1] - v[1] * w[0];
      const d2 = v[1] * w[2] - v[2] * w[1];
      const d3 = v[2] * w[0] - v[0] * w[2];
      det = Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3);
    }
    return det < bend * innerProduct;
  }

  hasNotReachedMinStep() {
    return !this.reachedminStep;
  }
}

CurveSegmentInfo.MAX_PIXEL_DISTANCE = 32;
