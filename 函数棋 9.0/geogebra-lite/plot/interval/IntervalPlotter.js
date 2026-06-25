class IntervalPlotter {
  constructor(converter, bounds, pathPlotter) {
    this.converter = converter;
    this.evBounds = bounds;
    this.gp = pathPlotter;
    this.enabled = false;
    this.model = null;
    this.controller = null;
    this.path = null;
  }

  enableFor(functionGeo) {
    this.build(functionGeo);
    this.enable();
  }

  enableForWithView(functionGeo, view, forList) {
    this.build(functionGeo);
    this.controller?.attachEuclidianView?.(view);
    if (!forList && view?.getEuclidianController?.()?.addZoomerAnimationListener) {
      view.getEuclidianController().addZoomerAnimationListener(this.controller, functionGeo);
    }
    this.enable();
  }

  build(functionGeo) {
    const tuples = [];
    const data = new IntervalFunctionData(functionGeo, this.converter, this.evBounds, tuples);
    const sampler = {};
    const query = new QueryFunctionDataImpl(tuples);
    this.path = new IntervalPath(this.gp, this.evBounds, query);
    this.model = new IntervalFunctionModelImpl(data, sampler, this.evBounds, this.path);
    this.controller = new IntervalPlotController(this.model, functionGeo);
  }

  enable() {
    this.enabled = true;
    this.model?.update?.();
  }

  update() { this.model?.update?.(); }
  draw(g2) { this.gp?.draw?.(g2); }
  isEnabled() { return this.enabled; }
  disable() { this.enabled = false; this.model?.clear?.(); this.controller?.detach?.(); }
  getLabelPoint() { return this.path?.getLabelPoint?.(); }
  needsUpdateAll() { this.model?.needsResampling?.(); }
}
