/**
 * FunctionRenderer 模块
 * 函数采样与绘制 —— 内部调用 geogebra-lite 引擎（CurvePlotter + Cohen-Sutherland 裁剪）
 * 保留动画绘制和发光效果
 * 外部接口不变：drawFunction, sampleFunction, cancelDrawing, convertToPolyline, clear, getYAtX 等
 */
class FunctionRenderer {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.parser = new FunctionParser();

        // 采样配置（保留供外部查询和 sampleFallback 使用）
        this.deltaX = 0.001;
        this.maxDeltaY = 100;
        this.collisionDeltaX = 0.0002;
        this.collisionMaxDeltaY = 500;

        // 颜色配置
        this.colors = {
            function: '#ffffff',
            glow: 'rgba(255, 255, 255, 0.3)'
        };

        // 动画绘制控制
        this.animationFrameId = null;
        this.isDrawing = false;
    }

    cancelDrawing() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isDrawing = false;
    }

    clearRenderCache() {
    }

    // ========== 自适应样式（保持原版） ==========

    getAdaptiveGlowSize() {
        const range = this.gridSystem.range;
        if (range <= 5) return 15;
        if (range <= 10) return 12;
        if (range <= 20) return 8;
        if (range <= 35) return 5;
        return 2;
    }

    getAdaptiveLineWidth() {
        const range = this.gridSystem.range;
        if (range <= 5) return 3;
        if (range <= 10) return 2.5;
        if (range <= 20) return 2;
        if (range <= 35) return 1.5;
        return 1;
    }

    getAdaptiveBatchSize() {
        const range = this.gridSystem.range;
        if (range <= 5) return 25;
        if (range <= 10) return 35;
        if (range <= 20) return 50;
        if (range <= 35) return 70;
        return 100;
    }

    getAdaptiveGlowColor(color = null) {
        const range = this.gridSystem.range;
        let alpha;
        if (range <= 5) alpha = 0.5;
        else if (range <= 10) alpha = 0.4;
        else if (range <= 20) alpha = 0.3;
        else if (range <= 35) alpha = 0.2;
        else alpha = 0.1;

        if (color && color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgba(255, 255, 255, ${alpha})`;
    }

    // ========== 适配层：将 GridSystem 包装为 geogebra-lite 需要的接口 ==========

    /**
     * 构造 view 对象，供 geogebra-lite 的 GeneralPathClippedForCurvePlotter 和 CurveSegmentInfo 使用
     */
    _buildView() {
        const gs = this.gridSystem;
        return {
            getWidth: () => gs.canvas.width,
            getHeight: () => gs.canvas.height,
            toScreenCoordXd: (x) => gs.mathToCanvas(x, 0).x,
            toScreenCoordYd: (y) => gs.mathToCanvas(0, y).y,
            isOnView: () => true,
            getYscale: () => gs.canvas.height / (gs.range * 2),
            isSegmentOffView: (a, b) => {
                const left = gs.mathToCanvas(a[0], a[1]);
                const right = gs.mathToCanvas(b[0], b[1]);
                const w = gs.canvas.width, h = gs.canvas.height;
                return (left.x < 0 && right.x < 0) || (left.x > w && right.x > w) ||
                       (left.y < 0 && right.y < 0) || (left.y > h && right.y > h);
            },
            getMaxBend: () => Math.tan(10 * Math.PI / 180),
            getMaxBendOffScreen: () => Math.tan(45 * Math.PI / 180),
            getEuclidianController: () => ({ addZoomerAnimationListener() {}, removeZoomerAnimationListener() {} }),
            getSettings: () => null
        };
    }

    /**
     * 构造 curve adapter，供 CurveSegmentPlotter.evaluateCurve() 使用
     * geogebra-lite 的 curve 接口要求：evaluateCurve(x, out) → out[0]=x, out[1]=y
     */
    /**
     * 判断两点之间是否为跳跃间断点（而非连续的陡峭函数）
     * 算法：二分取中点验证法（自适应迭代次数）
     * - 取中点 a = (x1+x2)/2，求 f(a)
     * - 如果差值 <= threshold → 连续，返回 false
     * - 如果中点 y 在两端 y 之间 → 函数平滑过渡，继续迭代（最多 32 次）
     * - 如果中点 y 不在两端 y 之间 → 间断特征，6 次后停止，返回 true
     * - 32 次仍差值 >= threshold → 不连线，返回 true
     * @param {object} ast 预解析的 AST
     * @param {number} threshold 跳跃量阈值（= range/100）
     * @returns {boolean} true = 跳跃间断点（不连线）
     */
    _isJumpDiscontinuity(ast, x1, y1, x2, y2, threshold) {
        const dy = Math.abs(y2 - y1);
        if (dy <= threshold) return false;

        let leftX = x1, leftY = y1;
        let rightX = x2, rightY = y2;
        const MAX_ITER = 32;
        const QUICK_STOP = 6;

        for (let i = 0; i < MAX_ITER; i++) {
            const midX = (leftX + rightX) / 2;
            const midY = this.parser.evaluateAst(ast, midX);

            if (midY === null || !Number.isFinite(midY)) return true;

            const diffLeft = Math.abs(midY - leftY);
            const diffRight = Math.abs(midY - rightY);

            if (diffLeft <= threshold && diffRight <= threshold) return false;

            // 区间非常小时：y 差值仍大 → 跳跃；y 差值也小 → 连续
            if (Math.abs(rightX - leftX) < 1e-12) {
                return Math.abs(rightY - leftY) > threshold;
            }

            // 判断中点 y 是否在当前两端 y 之间
            const minY = Math.min(leftY, rightY);
            const maxY = Math.max(leftY, rightY);
            const midBetween = midY >= minY && midY <= maxY;

            // 中点不在两端之间 → 间断特征，6 次后停止判定为跳跃
            if (!midBetween && i >= QUICK_STOP) return true;

            // 向差值更大的方向收缩
            if (diffLeft > diffRight) {
                rightX = midX;
                rightY = midY;
            } else {
                leftX = midX;
                leftY = midY;
            }
        }

        // 32 次迭代仍未收敛 → 不连线
        return true;
    }

    _buildAdapter(expr) {
        const parser = this.parser;
        const gs = this.gridSystem;
        // 预解析 AST，避免 evaluateCurve 和 _isJumpDiscontinuity 中重复 parse
        const ast = parser.parse(expr);
        const jumpThresh = Math.max(gs.range / 100, 0.01);
        const isJumpFn = (x1, y1, x2, y2) => this._isJumpDiscontinuity(ast, x1, y1, x2, y2, jumpThresh);
        // 跳跃间断点检测：上次有效求值点，用于判断 Y 跳变
        let lastValidX = null;
        let lastValidY = null;

        return {
            expr,
            newDoubleArray() { return [0, 0]; },
            isFunctionInX() { return true; },
            getMinDistX() { return 1e-4; },
            /** 无副作用求值：不修改 lastValidX/Y 追踪状态，供间断检测使用 */
            evaluateRaw(x) { return parser.evaluateAst(ast, x); },
            evaluateCurve(x, out) {
                out[0] = x;
                const y = parser.evaluateAst(ast, x);

                // 求值失败 → 标记 undefined，重置追踪
                if (y === null || !Number.isFinite(y)) {
                    out[1] = NaN;
                    lastValidX = null;
                    lastValidY = null;
                    return;
                }

                // 跳跃间断点检测：与上一个有效点比较 Y 跳变
                if (lastValidX !== null && lastValidY !== null) {
                    const dx = Math.abs(x - lastValidX);
                    // 只在 x 间距较小时才检测跳变（避免跨区间误判）
                    if (dx > 1e-12 && dx < gs.range * 0.1) {
                        if (isJumpFn(lastValidX, lastValidY, x, y)) {
                            out[1] = NaN;
                            // 不更新 lastValid，下次将从新位置重新开始追踪
                            return;
                        }
                    }
                }

                out[1] = y;
                lastValidX = x;
                lastValidY = y;
            },
            updateExpandedFunctions() {},
            distanceMax(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
        };
    }

    // ========== CapturingPath：捕获数学坐标 segments 供动画回放 ==========

    /**
     * CapturingPath 继承 PathPlotter，但不绘制到 Canvas。
     * 它记录每次 moveTo / lineTo 的数学坐标，形成 segments 数组。
     * 每个 segment 是一个连续曲线段（数学坐标点数组），segment 之间代表断点。
     */
    _createCapturingPath(view) {
        const segments = []; // segments: [ [{x,y}, ...], [{x,y}, ...], ... ]
        let currentSegment = [];

        const cp = new PathPlotter(null); // 基类
        const viewRef = view; // 闭包引用

        // 覆盖基类方法
        cp.firstPoint = function(pos, moveToAllowed) {
            currentSegment = [{ x: pos[0], y: pos[1] }];
        };

        cp.lineTo = function(pos) {
            currentSegment.push({ x: pos[0], y: pos[1] });
        };

        cp.moveTo = function(pos) {
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
            }
            currentSegment = [{ x: pos[0], y: pos[1] }];
        };

        cp.drawTo = function(pos, lineTo) {
            if (lineTo === Gap.LINE_TO) {
                this.lineTo(pos);
            } else {
                this.moveTo(pos);
            }
        };

        cp.corner = function() {};
        cp.cornerPos = function(pos) {
            currentSegment.push({ x: pos[0], y: pos[1] });
        };
        cp.cornerXY = function(x, y) {
            // cornerXY 接收屏幕坐标，这里我们无法完美还原数学坐标，但 corner 在动画中不关键
        };
        cp.endPlot = function() {
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
            }
        };

        cp.newDoubleArray = function() { return [0, 0]; };
        cp.supports = function() { return true; };

        cp._getSegments = function() { return segments; };

        return cp;
    }

    // ========== 采样方法 ==========

    /**
     * 使用 geogebra-lite 引擎采样，返回 segments（数学坐标分段数组）
     * ln(...) 走专用轻量采样，其他走 CurvePlotter.plotCurve()
     */
    _sampleToSegments(expr, xMin, xMax) {

        if (/(?:^|[^a-z])ln\s*(?:\(|x|X)/i.test(expr)) {
            const lnSeg = this._buildLnSegments(expr, xMin, xMax);
            return lnSeg;
        }

        const segments = this._denseResampleSegments(expr, xMin, xMax);
        return segments;
    }

    _shouldForceDenseResample(expr) {
        const s = String(expr || '').toLowerCase().replace(/\s+/g, '');
        return s.includes('!') || s.includes('/cos(') || s.includes('/x') || s.includes('tan(') || s.includes('cot(') || s.includes('sec(') || s.includes('csc(') || s.includes('x^');
    }

    /**
     * ln(...) 专用轻量采样（参考 geogebra-lite/app.js buildLnPoints）
     * 返回 segments 格式
     */
    _buildLnSegments(expr, xMin, xMax) {
        const points = this._buildLnPoints(expr, xMin, xMax);
        // 将 geogebra-lite 格式的 points [{x, y}, {break: true}, ...] 转换为 segments
        const segments = [];
        let currentSegment = [];

        for (const p of points) {
            if (p.break) {
                if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
            } else {
                currentSegment.push({ x: p.x, y: p.y });
            }
        }
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }

        return segments;
    }

    /**
     * ln(...) 采样（参考 geogebra-lite/app.js buildLnPoints）
     * 返回 geogebra-lite 格式: [{x, y}, {break: true}, {x, y}, ...]
     */
    _buildLnPoints(expr, xMin, xMax) {
        const width = Math.max(1, this.gridSystem.canvas.width || 800);
        const baseStep = Math.max((xMax - xMin) / Math.max(7000, width * 30), (xMax - xMin) / 60000);
        const points = [];
        let lastValid = false;
        const ast = this.parser.parse(expr);
        // 画布可视范围
        const viewRange = Math.max(this.gridSystem.range, (xMax - xMin) / 2);

        const stepFor = (x, y) => {
            const ax = Math.abs(x);
            const ay = Math.abs(y);
            const s = expr.toLowerCase().replace(/\s+/g, '');
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

        let lastInvalidX = xMin; // 记录最近一次离开画布/无效的 x 位置

        for (let x = xMin; x <= xMax;) {
            const y = this.parser.evaluateAst(ast, x);
            if (y !== null && isFinite(y)) {
                const offCanvas = Math.abs(y) > viewRange;

                // 超画布的点：二分搜索精确边界穿越点，再断开
                if (offCanvas) {
                    // 找到最后一个画布内的点，做二分搜索
                    let lastPt = null;
                    for (let k = points.length - 1; k >= 0; k--) {
                        if (!points[k].break && points[k].y !== undefined) { lastPt = points[k]; break; }
                    }
                    if (lastPt) {
                        let lo = lastPt.x, hi = x;
                        for (let iter = 0; iter < 6; iter++) {
                            const mid = (lo + hi) / 2;
                            const midY = this.parser.evaluateAst(ast, mid);
                            if (midY !== null && isFinite(midY) && Math.abs(midY) <= viewRange) {
                                lo = mid; // mid 在画布内，推高 lo
                            } else {
                                hi = mid; // mid 在画布外，拉低 hi
                            }
                        }
                        const finalY = this.parser.evaluateAst(ast, lo);
                        if (finalY !== null && isFinite(finalY) && Math.abs(finalY) <= viewRange && lo > lastPt.x) {
                            points.push({ x: lo, y: finalY });
                        }
                    }
                    if (points.length && !points[points.length - 1].break) points.push({ break: true });
                    lastInvalidX = x;
                    lastValid = false;
                    x += baseStep;
                    continue;
                }

                // 跳跃间断点检测：与上一个有效点比较
                let isJump = false;
                if (lastValid && points.length) {
                    let lastPt = null;
                    for (let k = points.length - 1; k >= 0; k--) {
                        if (!points[k].break && points[k].y !== undefined) { lastPt = points[k]; break; }
                    }
                    if (lastPt) {
                        const dy = Math.abs(y - lastPt.y);
                        const jumpThresh = Math.max(this.gridSystem.range / 100, 0.01);
                        if (dy > jumpThresh && this._isJumpDiscontinuity(ast, lastPt.x, lastPt.y, x, y, jumpThresh)) {
                            isJump = true;
                        }
                    }
                }

                if (isJump) {
                    points.push({ break: true });
                    points.push({ x, y });
                } else if (lastValid && points.length && !points[points.length - 1].break) {
                    points.push({ x, y });
                } else {
                    // 从无效区域回到画布内 → 二分搜索找精确入口
                    if (!lastValid && lastInvalidX < x) {
                        let lo = lastInvalidX, hi = x;
                        for (let iter = 0; iter < 6; iter++) {
                            const mid = (lo + hi) / 2;
                            const midY = this.parser.evaluateAst(ast, mid);
                            if (midY !== null && isFinite(midY) && Math.abs(midY) <= viewRange) {
                                hi = mid; // mid 在画布内，拉低 hi
                            } else {
                                lo = mid; // mid 在画布外/无效，推高 lo
                            }
                        }
                        const finalY = this.parser.evaluateAst(ast, hi);
                        if (finalY !== null && isFinite(finalY) && Math.abs(finalY) <= viewRange && hi < x) {
                            points.push({ break: true });
                            points.push({ x: hi, y: finalY });
                        }
                    }
                    points.push({ break: true });
                    points.push({ x, y });
                }
                lastValid = true;
                x += stepFor(x, y);
            } else {
                if (points.length && !points[points.length - 1].break) points.push({ break: true });
                lastInvalidX = x;
                lastValid = false;
                x += baseStep;
            }
        }
        return points;
    }

    /**
     * 等步长回退采样（当 geogebra-lite 异常时使用）
     */
    _fallbackSegments(expr, xMin, xMax) {
        const segments = [];
        let currentSegment = [];
        const step = 0.001;
        const ast = this.parser.parse(expr);
        const viewRange = Math.max(this.gridSystem.range, (xMax - xMin) / 2);

        for (let x = xMin; x <= xMax; x += step) {
            const y = this.parser.evaluateAst(ast, x);
            if (y !== null && isFinite(y)) {
                // 超画布的点：断开当前段，不加入
                if (Math.abs(y) > viewRange) {
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                    continue;
                }
                // 跳跃间断点检测：与当前段最后一个点比较
                if (currentSegment.length > 0) {
                    const last = currentSegment[currentSegment.length - 1];
                    const dy = Math.abs(y - last.y);
                    const jumpThresh = Math.max(this.gridSystem.range / 100, 0.01);
                    if (dy > jumpThresh && this._isJumpDiscontinuity(ast, last.x, last.y, x, y, jumpThresh)) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                }
                currentSegment.push({ x, y });
            } else {
                if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
            }
        }
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }
        return segments;
    }

    _denseResampleSegments(expr, xMin, xMax) {
        const width = Math.max(1, this.gridSystem.canvas.width || 800);
        const span = xMax - xMin;
        const targetPixelGap = 12;
        const dyThreshold = 8;
        const maxRounds = 6;
        const maxStep = Math.max(span / Math.max(3200, width * 18), span / 120000, 0.0005);
        const minStep = Math.max(span / Math.max(50000, width * 140), span / 500000, 0.00008);
        const ast = this.parser.parse(expr);
        // 画布可视范围：超出此范围的点标记 isOffCanvas，不参与连线/调试描点
        const viewRange = Math.max(this.gridSystem.range, span / 2);

        let points = [];
        for (let x = xMin; x <= xMax;) {
            const y = this.parser.evaluateAst(ast, x);
            if (y !== null && isFinite(y)) {
                points.push({ x, y, isOffCanvas: Math.abs(y) > viewRange });
                const slope = this._estimateLocalSlope(ast, x, span);
                const slopeFactor = Math.sqrt(1 + slope * slope);
                const step = Math.min(maxStep, Math.max(minStep, targetPixelGap / Math.max(slopeFactor, 1)));
                x += step;
            } else {
                points.push({ x, y: null, isBreak: true });
                x += maxStep;
            }
        }

        for (let round = 0; round < maxRounds; round++) {
            const refined = [];
            let changed = false;

            for (let i = 0; i < points.length; i++) {
                const cur = points[i];
                refined.push(cur);
                const next = points[i + 1];
                if (!next || cur.isBreak || next.isBreak || cur.y == null || next.y == null) continue;

                // 两个点都在画布外 → 跳过迭代，不插入中点
                if (cur.isOffCanvas && next.isOffCanvas) continue;

                const dy = Math.abs(next.y - cur.y);
                // 一点在画布内、一点在画布外 → 强制插入中点（边界细化）
                const isBoundaryPair = cur.isOffCanvas !== next.isOffCanvas;
                if (!isBoundaryPair && dy <= dyThreshold) continue;

                // 跳跃间断点检测：y 变化 > jumpThresh → 用二分中点验证法
                const jumpThresh = Math.max(this.gridSystem.range / 100, 0.01);
                if (dy > jumpThresh && this._isJumpDiscontinuity(ast, cur.x, cur.y, next.x, next.y, jumpThresh)) {
                    refined.push({ x: (cur.x + next.x) / 2, y: null, isBreak: true });
                    changed = true;
                    continue;
                }

                const midX = (cur.x + next.x) / 2;
                if (midX === cur.x || midX === next.x) continue;
                const midY = this.parser.evaluateAst(ast, midX);
                if (midY === null || !isFinite(midY)) {
                    refined.push({ x: midX, y: null, isBreak: true });
                } else {
                    refined.push({ x: midX, y: midY, isOffCanvas: Math.abs(midY) > viewRange });
                }
                changed = true;
            }

            points = refined;
            if (!changed) break;
        }

        // 构建 segments：超画布的点完全不加入（不连线、不描点）
        const segments = [];
        let currentSegment = [];
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.isBreak || p.y === null) {
                if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                continue;
            }
            // 超画布的点：断开当前段，不加入
            if (p.isOffCanvas) {
                if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                continue;
            }
            if (currentSegment.length > 0) {
                const last = currentSegment[currentSegment.length - 1];
                const segDy = Math.abs(p.y - last.y);
                // 跳跃间断点检测
                const jumpThresh = Math.max(this.gridSystem.range / 100, 0.01);
                if (segDy > dyThreshold || (segDy > jumpThresh && this._isJumpDiscontinuity(ast, last.x, last.y, p.x, p.y, jumpThresh))) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
            }
            currentSegment.push({ x: p.x, y: p.y });
        }
        if (currentSegment.length > 0) segments.push(currentSegment);
        return segments;
    }

    _estimateLocalSlope(ast, x, span) {
        const eps = Math.max(span / 4000, 0.0001);
        const y1 = this.parser.evaluateAst(ast, x - eps);
        const y2 = this.parser.evaluateAst(ast, x + eps);
        if (!Number.isFinite(y1) || !Number.isFinite(y2)) return 0;
        return Math.abs((y2 - y1) / Math.max(2 * eps, 1e-12));
    }

    // ========== 直接绘制（无动画，geogebra-lite 引擎即时绘制） ==========

    /**
     * 通过 geogebra-lite 引擎即时绘制函数曲线到 Canvas
     * ln(...) 走专用采样 + polyline 绘制
     */
    _drawViaGeoGebra(expr, color) {
        const ctx = this.gridSystem.ctx;
        const view = this._buildView();

        // 设置绘制样式
        ctx.strokeStyle = color || this.colors.function;
        ctx.lineWidth = this.getAdaptiveLineWidth();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 光晕效果（测试模式有自定义颜色时不显示）
        if (!color) {
            ctx.shadowColor = this.getAdaptiveGlowColor(color);
            ctx.shadowBlur = this.getAdaptiveGlowSize();
        }

        // ln(...) 走专用轻量采样
        if (/(?:^|[^a-z])ln\s*(?:\(|x|X)/i.test(expr)) {
            const range = this.gridSystem.getRange();
            const points = this._buildLnPoints(expr, range.min, range.max);
            this._drawLnPolyline(points, ctx);
            ctx.shadowBlur = 0;
            return;
        }

        // 其他函数：直接通过 GeneralPathClippedForCurvePlotter 绘制
        const adapter = this._buildAdapter(expr);
        const range = this.gridSystem.getRange();

        const gp = new GeneralPathClippedForCurvePlotter(view, ctx);
        ctx.beginPath();

        try {
            CurvePlotter.plotCurve(adapter, range.min, range.max, view, gp, false, Gap.MOVE_TO);
        } catch (e) {
            console.warn('[FunctionRenderer] geogebra-lite 绘制异常，回退到等步长:', e);
            // 回退到 polyline
            const segments = this._fallbackSegments(expr, range.min, range.max);
            this._drawSegmentsImmediate(segments, ctx);
        }

        ctx.shadowBlur = 0;
    }

    /**
     * 绘制 ln points（geogebra-lite 格式：{break: true} 分隔）
     */
    _drawLnPolyline(points, ctx) {
        let started = false;
        ctx.beginPath();
        for (const p of points) {
            if (p.break || p.y === null) {
                if (started) { ctx.stroke(); ctx.beginPath(); }
                started = false;
                continue;
            }
            const c = this.gridSystem.mathToCanvas(p.x, p.y);
            if (!started) {
                ctx.moveTo(c.x, c.y);
                started = true;
            } else {
                ctx.lineTo(c.x, c.y);
            }
        }
        if (started) ctx.stroke();
    }

    /**
     * 即时绘制 segments（回退用）
     */
    _drawSegmentsImmediate(segments, ctx) {
        for (const seg of segments) {
            if (seg.length < 2) continue;
            ctx.beginPath();
            const p0 = this.gridSystem.mathToCanvas(seg[0].x, seg[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < seg.length; i++) {
                const p = this.gridSystem.mathToCanvas(seg[i].x, seg[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
    }

    // ========== 动画绘制 ==========

    /**
     * 从 segments 逐帧动画绘制函数曲线
     */
    _animateDrawFromSegments(segments, color) {
        return new Promise((resolve) => {
            this.cancelDrawing();
            this.isDrawing = true;

            const ctx = this.gridSystem.ctx;
            const animationDuration = 600;
            const startTime = performance.now();

            // 设置绘制样式
            ctx.strokeStyle = color || this.colors.function;
            ctx.lineWidth = this.getAdaptiveLineWidth();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (!color) {
                ctx.shadowColor = this.getAdaptiveGlowColor(color);
                ctx.shadowBlur = this.getAdaptiveGlowSize();
            }

            // 计算总点数
            const totalPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
            if (totalPoints === 0) {
                ctx.shadowBlur = 0;
                this.isDrawing = false;
                resolve();
                return;
            }

            // 每段已绘制到的索引
            const segmentProgress = segments.map(() => 0);

            const drawFrame = (currentTime) => {
                if (!this.isDrawing) {
                    ctx.shadowBlur = 0;
                    resolve();
                    return;
                }

                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / animationDuration, 1);
                const targetPoints = Math.floor(totalPoints * progress);
                let pointsDrawn = 0;

                for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                    const segment = segments[segIdx];
                    const alreadyDrawn = segmentProgress[segIdx];
                    if (pointsDrawn >= targetPoints) break;

                    const pointsToDraw = Math.min(segment.length, targetPoints - pointsDrawn);

                    if (pointsToDraw > alreadyDrawn && pointsToDraw >= 2) {
                        ctx.beginPath();

                        if (alreadyDrawn === 0) {
                            const p0 = this.gridSystem.mathToCanvas(segment[0].x, segment[0].y);
                            ctx.moveTo(p0.x, p0.y);
                            for (let i = 1; i < pointsToDraw; i++) {
                                const p = this.gridSystem.mathToCanvas(segment[i].x, segment[i].y);
                                ctx.lineTo(p.x, p.y);
                            }
                        } else {
                            const startP = this.gridSystem.mathToCanvas(
                                segment[alreadyDrawn - 1].x, segment[alreadyDrawn - 1].y
                            );
                            ctx.moveTo(startP.x, startP.y);
                            for (let i = alreadyDrawn; i < pointsToDraw; i++) {
                                const p = this.gridSystem.mathToCanvas(segment[i].x, segment[i].y);
                                ctx.lineTo(p.x, p.y);
                            }
                        }

                        ctx.stroke();
                        segmentProgress[segIdx] = pointsToDraw;
                    }

                    pointsDrawn += segment.length;
                }

                if (progress < 1 && this.isDrawing) {
                    this.animationFrameId = requestAnimationFrame(drawFrame);
                } else {
                    ctx.shadowBlur = 0;
                    this.isDrawing = false;
                    this.animationFrameId = null;
                    resolve();
                }
            };

            this.animationFrameId = requestAnimationFrame(drawFrame);
        });
    }

    // ========== 外部接口 ==========

    /**
     * 采样函数（供碰撞检测使用）
     * 返回原格式 [{x, y}, {x, y: null, isBreak: true}, ...]
     */
    sampleFunction(expression, xMin, xMax, forCollision = false) {
        const range = this.gridSystem.getRange();
        const sampleMin = Math.max(xMin, range.min - 1);
        const sampleMax = Math.min(xMax, range.max + 1);

        const segments = this._sampleToSegments(expression, sampleMin, sampleMax);

        // 将 segments 转换回原格式 points
        const points = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (i > 0) {
                points.push({ x: 0, y: null, isBreak: true });
            }
            for (const p of seg) {
                points.push({ x: p.x, y: p.y });
            }
        }

        return points;
    }

    /**
     * 绘制函数（主入口）
     * @param {string} expression - 函数表达式
     * @param {boolean} animate - 是否使用动画绘制
     * @param {string} color - 自定义颜色（可选）
     * @returns {Promise<Array>} 采样点数组
     */
    async drawFunction(expression, animate = true, color = null) {
        const range = this.gridSystem.getRange();
        const segments = this._sampleToSegments(expression, range.min, range.max);

        // 统一使用同一份采样结果来绘制和调试，避免“图像”和“蓝点”不对应
        if (animate) {
            await this._animateDrawFromSegments(segments, color);
        } else {
            const ctx = this.gridSystem.ctx;
            ctx.save();
            ctx.strokeStyle = color || this.colors.function;
            ctx.lineWidth = this.getAdaptiveLineWidth();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (!color) {
                ctx.shadowColor = this.getAdaptiveGlowColor(color);
                ctx.shadowBlur = this.getAdaptiveGlowSize();
            }
            this._drawSegmentsImmediate(segments, ctx);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        this.clearRenderCache();
        if (typeof this.gridSystem.clearFunctionCache === 'function') {
            this.gridSystem.clearFunctionCache();
        }
        if (typeof this.parser.clearCache === 'function') {
            this.parser.clearCache();
        }

        return this._segmentsToPoints(segments);
    }

    /**
     * 将 segments 转换为原格式 points
     */
    _segmentsToPoints(segments) {
        const points = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (i > 0) {
                points.push({ x: 0, y: null, isBreak: true });
            }
            for (const p of seg) {
                points.push({ x: p.x, y: p.y });
            }
        }
        return points;
    }

    /**
     * 将采样点转换为折线（用于碰撞检测）
     */
    convertToPolyline(points) {
        const polyline = [];
        for (const p of points) {
            if (p.y === null || p.isBreak) {
                polyline.push(null);
            } else {
                polyline.push({ x: p.x, y: p.y });
            }
        }
        return polyline;
    }

    /**
     * 清除函数图像（重绘网格）
     */
    clear() {
        this.gridSystem.draw();
    }

    /**
     * 预览函数（快速绘制，用于输入时预览）
     */
    previewFunction(expression) {
        this.gridSystem.draw();
        this._drawViaGeoGebra(expression, null);
    }

    /**
     * 获取函数在特定 x 值处的 y 值
     */
    getYAtX(expression, x) {
        return this.parser.evaluate(expression, x);
    }

    /**
     * 等步长兼容采样（旧接口）
     */
    sampleFallback(expression, xMin, xMax) {
        const segments = this._fallbackSegments(expression, xMin, xMax);
        return this._segmentsToPoints(segments);
    }

    /**
     * 即时绘制点数组（旧接口兼容，供 drawPoints 调用）
     */
    drawPoints(points, color = null) {
        const ctx = this.gridSystem.ctx;
        ctx.strokeStyle = color || this.colors.function;
        ctx.lineWidth = this.getAdaptiveLineWidth();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (!color) {
            ctx.shadowColor = this.colors.glow;
            ctx.shadowBlur = this.getAdaptiveGlowSize();
        }

        let currentSegment = [];
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (point.y === null) {
                this._drawSingleSegment(currentSegment, ctx);
                currentSegment = [];
            } else {
                currentSegment.push(point);
            }
        }
        if (currentSegment.length > 1) {
            this._drawSingleSegment(currentSegment, ctx);
        }
        ctx.shadowBlur = 0;
    }

    _drawSingleSegment(segment, ctx) {
        if (segment.length < 2) return;
        ctx.beginPath();
        const p0 = this.gridSystem.mathToCanvas(segment[0].x, segment[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < segment.length; i++) {
            const p = this.gridSystem.mathToCanvas(segment[i].x, segment[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    isPointVisible(point, size) {
        return point.x >= -50 && point.x <= size + 50 &&
               point.y >= -50 && point.y <= size + 50;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionRenderer;
}
