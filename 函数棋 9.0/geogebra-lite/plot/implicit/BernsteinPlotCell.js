class BernsteinPlotCell {
  constructor(box, polynomial, kind = 'CELL0') {
    this.boundingBox = box;
    this.polynomial = polynomial;
    this.kind = kind;
    this.marchingConfig = null;
  }

  getKind() { return this.kind; }
  mightHaveSolution() { return this.kind !== 'CELL2'; }
  getMarchingConfig() { return this.marchingConfig; }
  setMarchingConfig(marchingConfig) { this.marchingConfig = marchingConfig; }
  release(pool) { this.boundingBox?.release?.(pool); }
}
