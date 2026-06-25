class GeneralPathClippedForCurvePlotter extends PathPlotter {
  constructor(view, ctx) {
    super(null);
    this.view = view;
    this.lineDrawn = false;
    this.currentPoint = null;
    this.default2dView = true;
    this._inCorner = false;
    this.offscreenPadding = 10;
    this.ctx = ctx;
  }

  moveTo(xOrPos, y) {
    let px, py;
    if (Array.isArray(xOrPos)) {
      const sp = this.toScreen(xOrPos);
      px = sp.x; py = sp.y;
    } else {
      px = xOrPos; py = y;
    }
    this.currentPoint = { x: px, y: py };
    this.lineDrawn = false;
    if (this.ctx) { this.ctx.moveTo(px, py); }
  }
  lineTo(pos) { this.drawTo(pos, 'LINE_TO'); }
  drawTo(pos, segmentType) { const p = this.toScreen(pos); this.drawToXY(p.x, p.y, segmentType); }
  toScreen(pos) { return { x: this.view.toScreenCoordXd(pos[0]), y: this.view.toScreenCoordYd(pos[1]) }; }

  // Cohen-Sutherland 线段裁剪算法
  clipToView(x1, y1, x2, y2) {
    const w = this.view.getWidth();
    const h = this.view.getHeight();
    const pad = this.offscreenPadding;
    const outCode = (x, y) => (x < -pad ? 1 : x > w + pad ? 2 : 0) | (y < -pad ? 4 : y > h + pad ? 8 : 0);
    let c1 = outCode(x1, y1), c2 = outCode(x2, y2);
    while (true) {
      if (!(c1 | c2)) return [x1, y1, x2, y2]; // 完全在视口内
      if (c1 & c2) return null; // 完全在视口外同一侧
      const c = c1 || c2;
      let x = 0, y = 0;
      if (c & 8) { x = x1 + (x2 - x1) * (h - y1) / (y2 - y1); y = h; }
      else if (c & 4) { x = x1 + (x2 - x1) * (0 - y1) / (y2 - y1); y = 0; }
      else if (c & 2) { y = y1 + (y2 - y1) * (w - x1) / (x2 - x1); x = w; }
      else if (c & 1) { y = y1 + (y2 - y1) * (0 - x1) / (x2 - x1); x = 0; }
      if (c === c1) { x1 = x; y1 = y; c1 = outCode(x1, y1); }
      else { x2 = x; y2 = y; c2 = outCode(x2, y2); }
    }
  }

  drawToXY(x, y, lineTo) {
    const point = this.getCurrentPoint();
    const ctx = this.ctx;
    if (point == null) { this.moveTo(x, y); return; }
    const isLine = lineTo !== 'MOVE_TO';

    // 只忽略真正重复的点，避免在某些缩放比例下把短但有效的线段误判为重复段
    const dx = x - point.x;
    const dy = y - point.y;
    const samePoint = Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9;
    if (samePoint && isLine === this.lineDrawn) return;

    const clipped = this.clipToView(point.x, point.y, x, y);
    this.currentPoint = { x, y };
    this.lineDrawn = isLine;
    if (!ctx || !clipped) return;
    const [cx1, cy1, cx2, cy2] = clipped;
    if (isLine) {
      ctx.lineTo(cx2, cy2);
    } else {
      ctx.moveTo(cx2, cy2);
    }
  }

  getCurrentPoint() { return this.currentPoint; }

  corner() {
    if (this._inCorner) return;
    this._inCorner = true;
    const p = this.getCurrentPoint();
    if (p) {
      const w = this.view.getWidth();
      const h = this.view.getHeight();
      const x0 = p.x < 0 ? -this.offscreenPadding : (p.x > w ? w + this.offscreenPadding : p.x);
      const y0 = p.y < 0 ? -this.offscreenPadding : (p.y > h ? h + this.offscreenPadding : p.y);
      this.currentPoint = { x: x0, y: y0 };
    }
    this._inCorner = false;
  }

  cornerPos(pos) { const p = this.toScreen(pos); this.cornerXY(p.x, p.y); }
  cornerXY(x0, y0) { this.currentPoint = { x: x0, y: y0 }; if (this.ctx) { this.ctx.lineTo(x0, y0); } }
  firstPoint(pos) { const p = this.toScreen(pos); this.moveTo(p.x, p.y); }
  newDoubleArray() { return [0, 0]; }
  copyCoords(point, ret) { ret[0] = point.x; ret[1] = point.y; return true; }
  endPlot() { if (this.ctx) this.ctx.stroke(); }
  supports() { return true; }
}

if (typeof window !== 'undefined') { window.GeneralPathClippedForCurvePlotter = GeneralPathClippedForCurvePlotter; }
