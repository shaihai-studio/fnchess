const canvas = document.getElementById('canvas');
const input = document.getElementById('expr');
const drawBtn = document.getElementById('drawBtn');
const clearBtn = document.getElementById('clearBtn');
const debugBtn = document.getElementById('debugBtn');
const statusEl = document.getElementById('status');
const plotter = new Plotter(canvas);

function setStatus(text, error = false) {
  statusEl.textContent = text;
  statusEl.style.color = error ? '#fca5a5' : '#93c5fd';
}

function createCurveAdapter(expr) {
  return {
    expr,
    newDoubleArray() { return [0, 0]; },
    isFunctionInX() { return true; },
    getMinDistX() { return 1e-4; },
    evaluateCurve(x, out) { out[0] = x; out[1] = plotter.evalAt(expr, x); },
    updateExpandedFunctions() {},
    distanceMax(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  };
}

function createView() {
  return {
    getWidth: () => canvas.clientWidth,
    getHeight: () => canvas.clientHeight,
    toScreenCoordXd: (x) => plotter.toCanvas(x, 0).x,
    toScreenCoordYd: (y) => plotter.toCanvas(0, y).y,
    isOnView: () => true,
    getYscale: () => canvas.clientHeight / (plotter.range * 2),
    getEuclidianController: () => ({ addZoomerAnimationListener() {}, removeZoomerAnimationListener() {} }),
    getSettings: () => null,
    isSegmentOffView: (a, b) => plotter.isSegmentOffView(a, b),
    getMaxBend: () => plotter.getMaxBend(),
    getMaxBendOffScreen: () => plotter.getMaxBendOffScreen()
  };
}

function createGP(view) {
  // 使用带 Cohen-Sutherland 裁剪的 GP，将屏幕外坐标裁剪到屏幕边界
  const gp = new GeneralPathClippedForCurvePlotter(view, plotter.ctx);
  const ctx = plotter.ctx;
  ctx.beginPath();
  return gp;
}

function buildLnPoints(expr) {
  const { xmin, xmax } = plotter.getView();
  const width = Math.max(1, canvas.clientWidth || 800);
  const baseStep = Math.max((xmax - xmin) / Math.max(7000, width * 30), (xmax - xmin) / 60000);
  const points = [];
  let lastValid = false;

  const stepFor = (x, y, exprText) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const s = exprText.toLowerCase().replace(/\s+/g, '');
    let step = baseStep;
    if (ax < 0.15) step *= 0.06;
    else if (ax < 0.35) step *= 0.1;
    else if (ax < 1) step *= 0.18;
    else if (ax < 3) step *= 0.4;
    if (s.includes('ln(-x)') || s.includes('ln(-x+') || s.includes('ln(-x-')) step *= 0.65;
    if (ay > 4) step *= 0.35;
    if (ay > 8) step *= 0.2;
    return Math.max(step, baseStep / 30);
  };

  for (let x = xmin; x <= xmax;) {
    const y = plotter.evalAt(expr, x);
    if (Number.isFinite(y) && y !== null) {
      if (lastValid && points.length && !points[points.length - 1].break) {
        points.push({ x, y });
      } else {
        points.push({ break: true });
        points.push({ x, y });
      }
      lastValid = true;
      x += stepFor(x, y, expr);
    } else {
      if (points.length && !points[points.length - 1].break) points.push({ break: true });
      lastValid = false;
      x += baseStep;
    }
  }
  return points;
}

function render() {
  try {
    const expr = input.value.trim();
    if (!expr) { setStatus('请输入表达式', true); plotter.drawGrid(); return; }
    
    plotter.drawGrid();
    const ctx = plotter.ctx;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;

    // ln(...) 走轻量级采样，避免通用曲线细分在渐近线附近过度递归导致卡顿。
    if (/(?:^|[^a-z])ln\s*(?:\(|x|X)/i.test(expr)) {
      const points = buildLnPoints(expr);
      plotter.drawPolyline(points);
      setStatus(`已绘制: ${expr}`);
      return;
    }

    const adapter = createCurveAdapter(expr);
    const view = createView();
    const gp = createGP(view);
    CurvePlotter.plotCurve(adapter, -plotter.range, plotter.range, view, gp, false, Gap.MOVE_TO);
    setStatus(`已绘制: ${expr}`);
  } catch (e) {
    setStatus(e.message || '绘制失败', true);
    plotter.drawGrid();
  }
}

plotter.resizeToDisplay();
render();
window.addEventListener('resize', () => { plotter.resizeToDisplay(); render(); });
drawBtn.addEventListener('click', render);
debugBtn.addEventListener('click', () => {
  plotter.debug.enabled = !plotter.debug.enabled;
  debugBtn.textContent = `调试：${plotter.debug.enabled ? '开' : '关'}`;
  render();
});
clearBtn.addEventListener('click', () => { input.value = ''; input.placeholder = 'sin(x)'; plotter.drawGrid(); setStatus(''); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    render();
  }
});
for (const btn of document.querySelectorAll('.chip')) { btn.addEventListener('click', () => { input.value = btn.dataset.expr; render(); }); }
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const factor = e.deltaY < 0 ? 0.88 : 1.14; plotter.setRange(Math.max(1, Math.min(60, plotter.range * factor))); render(); }, { passive: false });
