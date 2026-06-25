class IntervalFunctionModelImpl extends IntervalFunctionModel {
  constructor(data, sampler, bounds, path) {
    super();
    this.data = data;
    this.sampler = sampler;
    this.bounds = bounds;
    this.path = path;
    this.resampleNeeded = true;
  }

  update() {
    if (this.resampleNeeded) {
      this.resample();
    }
    this.path.update();
  }

  resample() {
    this.sampler?.resample?.(this.bounds.domain?.() ?? this.bounds);
    this.updatePath();
    this.resampleNeeded = false;
  }

  updateDomain() {
    this.sampler?.extend?.(this.bounds.domain?.() ?? this.bounds);
    this.updatePath();
  }

  updatePath() {
    if (this.data?.isValid?.() ?? true) {
      this.path.update();
    }
  }

  clear() {
    this.path.reset();
    this.data?.clear?.();
  }

  needsResampling() {
    this.resampleNeeded = true;
  }
}
