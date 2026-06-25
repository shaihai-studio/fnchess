class IntervalPlotController {
  constructor(model, functionGeo) {
    this.model = model;
    this.function = functionGeo;
    this.euclidianController = null;
    this.euclidianSettings = null;
  }

  attachEuclidianView(view) {
    this.euclidianController = view?.getEuclidianController?.() || null;
    this.euclidianSettings = view?.getSettings?.() || null;
    if (this.euclidianSettings?.addListener) {
      this.euclidianSettings.addListener(this);
    }
  }

  onZoomStop(info) {
    if (info?.setXAxisZoom) info.setXAxisZoom(false);
    if (IntervalPlotSettings.isUpdateOnZoomStopEnabled?.()) {
      this.model?.resample?.();
    }
  }

  onMoveStop() {
    if (IntervalPlotSettings.isUpdateOnMoveStopEnabled?.()) {
      this.model?.resample?.();
    }
  }

  onMove(info) {
    if (info?.isXAxisZoom?.() || info?.isCenterView?.()) return;
    if (IntervalPlotSettings.isUpdateOnMoveEnabled?.()) {
      this.model?.updateDomain?.();
    }
  }

  detach() {
    this.euclidianController?.removeZoomerAnimationListener?.(this.function);
    if (this.euclidianSettings?.removeListener) {
      this.euclidianSettings.removeListener(this);
    }
  }

  settingsChanged(settings) {
    if (IntervalPlotSettings.isUpdateOnSettingsChangeEnabled?.()) {
      this.model?.resample?.();
    }
  }
}
