class BernsteinMarchingConfigProvider {
  constructor(cell) {
    this.marchingRect = new BernsteinMarchingRect(cell);
    cell.setMarchingConfig(BernsteinMarchingConfig.VALID);
  }

  getConfigFrom(r) { return BernsteinMarchingConfig.VALID; }
  empty() { return BernsteinMarchingConfig.EMPTY; }
  listThreshold() { return 1; }
  canChangePointOrder() { return false; }
  isConfigFinal(config) { return true; }
  checkContinuity(config, marchingRect, points) { return BernsteinMarchingConfig.VALID; }
  getMarchingRect() { return this.marchingRect; }
}
