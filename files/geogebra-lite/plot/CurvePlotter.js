class CurvePlotter {
  constructor(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed) {
    const width = view?.getWidth?.() || view?.width || 800;
    const minSamplePoints = Math.max(160, width / 3 || 160);
    const maxParamStep = Math.abs(tMax - tMin) / minSamplePoints;
    this.curveSegmentPlotter = new CurveSegmentPlotter(curve, tMin, tMax, 0, maxParamStep, view, gp, calcLabelPos, moveToAllowed);
    if (moveToAllowed === Gap.CORNER && gp.corner) {
      gp.corner();
    }
  }

  static plotCurve(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed) {
    const plotter = new CurvePlotter(curve, tMin, tMax, view, gp, calcLabelPos, moveToAllowed);
    return plotter.getLabelPoint();
  }

  getLabelPoint() {
    return this.curveSegmentPlotter.getLabelPoint();
  }
}

if (typeof window !== 'undefined') {
  window.CurvePlotter = CurvePlotter;
}
