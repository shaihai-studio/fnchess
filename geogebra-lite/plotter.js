class Plotter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parser = new FunctionParser();
    this.range = 10;
    this.recentExpression = '';
    this.classifier = new ContinuityClassifier(this);
    this.domain = new DomainInspector(this);
    this.curve = new AdaptiveCurvePlotter(this);
    this.yLimitFactor = 3;
  }

  resizeToDisplay() { const dpr = window.devicePixelRatio || 1; const rect = this.canvas.getBoundingClientRect(); this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  getView() { return { xmin: -this.range, xmax: this.range, ymin: -this.range, ymax: this.range }; }
  toCanvas(x, y) { const w = this.canvas.clientWidth, h = this.canvas.clientHeight; return { x: (x + this.range) * w / (this.range * 2), y: h - ((y + this.range) * h / (this.range * 2)) }; }
  isFiniteY(y) { return Number.isFinite(y) && y !== null; }
  evalAt(expr, x) { const y = this.parser.evaluate(expr, x); return this.isFiniteY(y) ? y : null; }
  curveType(expr) { const s = expr.toLowerCase().replace(/\s+/g, ''); return { linearLike: /^[-+]?\d+(?:\.\d+)?\*?x(?:[-+]\d+(?:\.\d+)?)?$/.test(s) || /^[-+]?x$/.test(s) || /^[-+]?\d*\*?x$/.test(s), hasTan: s.includes('tan'), hasSec: s.includes('sec') || s.includes('/cos('), hasCsc: s.includes('csc'), hasCot: s.includes('cot'), hasReciprocal: /(^|[^a-z])1\/x([^a-z]|$)/.test(s) || /\/x([^a-z]|$)/.test(s), hasJumpAbsRatio: /abs\([^)]*\)\/x/.test(s) || /abs\([^)]*\)\/(?:\([^)]*\)|x[^a-z]|[^a-z]x)/.test(s) || /absx\/x/.test(s), hasFactorial: s.includes('!'), hasVerticalAsymptoteCandidate: s.includes('/cos(') || /\/x([^a-z]|$)/.test(s) || s.includes('tan') || s.includes('cot') || s.includes('sec') || s.includes('csc') }; }
  getOnScreenDiff(evalLeft, evalRight) { const left = this.toCanvas(evalLeft[0], evalLeft[1]); const right = this.toCanvas(evalRight[0], evalRight[1]); return [right.x - left.x, right.y - left.y]; }
  isSegmentOffView(evalLeft, evalRight) { const left = this.toCanvas(evalLeft[0], evalLeft[1]); const right = this.toCanvas(evalRight[0], evalRight[1]); const w = this.canvas.clientWidth, h = this.canvas.clientHeight; return (left.x < 0 && right.x < 0) || (left.x > w && right.x > w) || (left.y < 0 && right.y < 0) || (left.y > h && right.y > h); }
  getMaxBend() { return Math.tan(10 * Math.PI / 180); }
  getMaxBendOffScreen() { return Math.tan(45 * Math.PI / 180); }
  drawGrid() { const ctx = this.ctx, w = this.canvas.clientWidth, h = this.canvas.clientHeight; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); const step = w / 20; for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); const center = this.toCanvas(0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, center.y); ctx.lineTo(w, center.y); ctx.moveTo(center.x, 0); ctx.lineTo(center.x, h); ctx.stroke(); }
  buildPoints(expr) { return this.curve.build(expr).filter(p => p.break || this.isFiniteY(p.y)); }
  drawPolyline(points, color = '#22c55e') { const ctx = this.ctx; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; let started = false; ctx.beginPath(); for (const p of points) { if (p.break || p.y === null) { if (started) { ctx.stroke(); ctx.beginPath(); } started = false; continue; } const c = this.toCanvas(p.x, p.y); if (!started) { ctx.moveTo(c.x, c.y); started = true; } else { ctx.lineTo(c.x, c.y); } } if (started) ctx.stroke(); }
  draw(expr) { this.recentExpression = expr; this.drawGrid(); const points = this.buildPoints(expr); this.drawPolyline(points); this.curve.drawAsymptotes(expr); return points; }
  redraw() { if (this.recentExpression) this.draw(this.recentExpression); else this.drawGrid(); }
  setRange(range) { this.range = Math.max(1, range); this.redraw(); }
}

if (typeof window !== 'undefined') { window.Plotter = Plotter; }
