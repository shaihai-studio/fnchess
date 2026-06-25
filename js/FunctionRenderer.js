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
    _buildAdapter(expr) {
        const parser = this.parser;
        return {
            expr,
            newDoubleArray() { return [0, 0]; },
            isFunctionInX() { return true; },
            getMinDistX() { return 1e-4; },
            evaluateCurve(x, out) {
                out[0] = x;
                out[1] = parser.evaluate(expr, x);
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
        const cleanExpr = expr.toLowerCase().replace(/\s/g, '');

        if (/(?:^|[^a-z])ln\s*(?:\(|x|X)/i.test(expr)) {
            return this._buildLnSegments(expr, xMin, xMax);
        }

        const adapter = this._buildAdapter(expr);
        const view = this._buildView();
        const cp = this._createCapturingPath(view);

        try {
            CurvePlotter.plotCurve(adapter, xMin, xMax, view, cp, false, Gap.MOVE_TO);
        } catch (e) {
            console.warn('[FunctionRenderer] geogebra-lite 采样异常，回退到等步长:', e);
            return this._fallbackSegments(expr, xMin, xMax);
        }

        return cp._getSegments();
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

        for (let x = xMin; x <= xMax;) {
            const y = this.parser.evaluate(expr, x);
            if (y !== null && isFinite(y)) {
                if (lastValid && points.length && !points[points.length - 1].break) {
                    points.push({ x, y });
                } else {
                    points.push({ break: true });
                    points.push({ x, y });
                }
                lastValid = true;
                x += stepFor(x, y);
            } else {
                if (points.length && !points[points.length - 1].break) points.push({ break: true });
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

        for (let x = xMin; x <= xMax; x += step) {
            const y = this.parser.evaluate(expr, x);
            if (y !== null && isFinite(y)) {
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

        if (animate) {
            // 采样 segments → 动画绘制
            const segments = this._sampleToSegments(expression, range.min, range.max);
            await this._animateDrawFromSegments(segments, color);
            // 返回原格式 points
            return this._segmentsToPoints(segments);
        } else {
            // 直接通过 geogebra-lite 引擎绘制
            this._drawViaGeoGebra(expression, color);
            // 同时采样用于返回
            const segments = this._sampleToSegments(expression, range.min, range.max);
            return this._segmentsToPoints(segments);
        }
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
