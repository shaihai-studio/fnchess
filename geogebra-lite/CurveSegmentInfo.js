class CurveSegmentInfo {
  constructor(view) {
    this.view = view;
    this.distanceOK = true;
    this.angleOK = true;
    this.offScreen = false;
    this.reachedminStep = false;
    this.MAX_PIXEL_DISTANCE = 10;
    this.MAX_ANGLE = 10;
    this.MAX_ANGLE_OFF_SCREEN = 45;
    this.MAX_BEND = Math.tan(this.MAX_ANGLE * Math.PI / 180);
    this.MAX_BEND_OFF_SCREEN = Math.tan(this.MAX_ANGLE_OFF_SCREEN * Math.PI / 180);
  }

  isOffScreen() {
    return this.offScreen;
  }

  update(evalLeft, evalRight, diff, prevDiff, curve) {
    this.offScreen = this.view.isSegmentOffView ? this.view.isSegmentOffView(evalLeft, evalRight) : false;
    this.reachedminStep = Math.abs(diff[0]) < (curve.getMinDistX ? curve.getMinDistX() : 1e-4);
    this.distanceOK = this.offScreen || this.isDistanceOK(diff);
    this.angleOK = this.isAngleOK(prevDiff, diff, this.offScreen ? this.MAX_BEND_OFF_SCREEN : this.MAX_BEND);
  }

  isDistanceOrAngleInvalid() {
    return !this.angleOK || !this.distanceOK;
  }

  isDistanceOK(diff) {
    for (const d of diff) {
      if (Math.abs(d) > this.MAX_PIXEL_DISTANCE) {
        return false;
      }
    }
    return true;
  }

  isAngleOK(v, w, bend) {
    let innerProduct = 0;
    for (let i = 0; i < v.length; i++) {
      innerProduct += v[i] * w[i];
    }
    if (!Number.isFinite(innerProduct)) {
      return true;
    }
    if (innerProduct <= 0) {
      return false;
    }
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

if (typeof window !== 'undefined') {
  window.CurveSegmentInfo = CurveSegmentInfo;
}
