class DomainInspector {
  constructor(plotter) {
    this.plotter = plotter;
  }

  isFiniteY(y) {
    return Number.isFinite(y) && y !== null;
  }

  isBreak(expr, x) {
    const s = expr.toLowerCase().replace(/\s+/g, '');
    const eps = Math.max(this.plotter.range / this.plotter.canvas.clientWidth, 1e-4);
    const left = this.plotter.parser.evaluate(expr, x - eps * 4);
    const right = this.plotter.parser.evaluate(expr, x + eps * 4);
    if (!this.isFiniteY(left) || !this.isFiniteY(right)) return false;
    if ((s.includes('tan') || s.includes('sec') || s.includes('cot') || s.includes('csc')) && this.nearTrigPole(x, s)) return true;
    return false;
  }

  nearTrigPole(x, s) {
    const sinx = Math.sin(x);
    const cosx = Math.cos(x);
    if (s.includes('tan') || s.includes('sec')) return Math.abs(cosx) < 1e-6;
    if (s.includes('cot') || s.includes('csc')) return Math.abs(sinx) < 1e-6;
    return false;
  }

  findCandidates(expr, xmin, xmax) {
    const s = expr.toLowerCase().replace(/\s+/g, '');
    const breaks = [];
    const addGrid = (offset) => {
      const k0 = Math.floor((xmin - offset) / Math.PI) - 1;
      const k1 = Math.ceil((xmax - offset) / Math.PI) + 1;
      for (let k = k0; k <= k1; k++) breaks.push(offset + k * Math.PI);
    };
    if (s.includes('tan')) addGrid(Math.PI / 2);
    if (s.includes('cot') || s.includes('csc') || s.includes('sec')) addGrid(0);
    return [...new Set(breaks)].filter(v => v >= xmin && v <= xmax).sort((a, b) => a - b);
  }
}
