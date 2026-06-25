/**
 * FunctionRenderer 模块
 * 负责函数采样与绘制
 * 采样精度 Δx ≤ 0.01
 * 处理函数断点（如 1/x）
 */
class FunctionRenderer {
    constructor(gridSystem) {
        this.gridSystem = gridSystem;
        this.parser = new FunctionParser();
        
        // 采样配置
        this.deltaX = 0.01; // 采样精度
        this.maxDeltaY = 100; // 最大Y变化，超过视为断点
        
        // 碰撞检测专用高精度采样配置
        this.collisionDeltaX = 0.002; // 碰撞检测使用更高精度（5倍）
        this.collisionMaxDeltaY = 500; // 碰撞检测允许更高的斜率
        
        // 颜色配置
        this.colors = {
            function: '#ffffff',
            glow: 'rgba(255, 255, 255, 0.3)'
        };
        
        // 动画绘制控制
        this.animationFrameId = null;
        this.isDrawing = false;
    }
    
    /**
     * 取消正在进行的绘制
     */
    cancelDrawing() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isDrawing = false;
    }
    
    /**
     * 根据坐标系范围获取自适应光晕大小
     * @returns {number} 光晕大小
     */
    getAdaptiveGlowSize() {
        const range = this.gridSystem.range;
        // 坐标系范围越小，光晕越大（小范围时函数图像更突出）
        if (range <= 5) {
            return 15; // 小范围：强光晕
        } else if (range <= 10) {
            return 12; // 中范围：较强光晕
        } else if (range <= 20) {
            return 8;  // 大范围：中等光晕
        } else if (range <= 35) {
            return 5;  // 较大范围：轻微光晕
        } else {
            return 2;  // 超大范围：几乎无光晕
        }
    }
    
    /**
     * 根据坐标系范围获取自适应线条粗细
     * @returns {number} 线条宽度
     */
    getAdaptiveLineWidth() {
        const range = this.gridSystem.range;
        // 坐标系范围越大，线条越细
        if (range <= 5) {
            return 3;  // 小范围：粗线条
        } else if (range <= 10) {
            return 2.5; // 中范围：较粗线条
        } else if (range <= 20) {
            return 2;  // 大范围：标准线条
        } else if (range <= 35) {
            return 1.5; // 较大范围：细线条
        } else {
            return 1;  // 超大范围：最细线条
        }
    }
    
    /**
     * 根据坐标系范围获取自适应绘制批次大小
     * 范围越大，batchSize越大（实际绘制更快），但视觉上感觉略慢
     * @returns {number} 每帧绘制的点数
     */
    getAdaptiveBatchSize() {
        const range = this.gridSystem.range;
        // 坐标系范围越大，batchSize越大（实际绘制更快）
        // 但由于范围扩大，视觉上会感觉略慢
        if (range <= 5) {
            return 25;  // 小范围：标准速度
        } else if (range <= 10) {
            return 35;  // 中范围：较快
        } else if (range <= 20) {
            return 50;  // 大范围：更快
        } else if (range <= 35) {
            return 70;  // 较大范围：很快
        } else {
            return 100; // 超大范围：最快
        }
    }
    
    /**
     * 根据坐标系范围获取自适应光晕颜色（透明度）
     * @param {string} color - 基础颜色（hex格式，如 '#ff6b6b'）
     * @returns {string} 带透明度的光晕颜色
     */
    getAdaptiveGlowColor(color = null) {
        const range = this.gridSystem.range;
        
        // 坐标系范围越大，光晕越浅（透明度越低）
        let alpha;
        if (range <= 5) {
            alpha = 0.5;  // 小范围：较深光晕
        } else if (range <= 10) {
            alpha = 0.4;  // 中范围：中等深度光晕
        } else if (range <= 20) {
            alpha = 0.3;  // 大范围：标准光晕
        } else if (range <= 35) {
            alpha = 0.2;  // 较大范围：较浅光晕
        } else {
            alpha = 0.1;  // 超大范围：最浅光晕
        }
        
        // 将 hex 颜色转换为 rgba
        if (color && color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        
        // 默认白色光晕
        return `rgba(255, 255, 255, ${alpha})`;
    }
    
    /**
     * 采样函数（Desmos风格：符号分析 + 分段采样）
     * @param {string} expression - 函数表达式
     * @param {number} xMin - x 最小值
     * @param {number} xMax - x 最大值
     * @param {boolean} forCollision - 是否为碰撞检测采样（使用更高精度）
     * @returns {Array} 采样点数组 [{x, y}, ...]
     */
    sampleFunction(expression, xMin, xMax, forCollision = false) {
        const range = this.gridSystem.getRange();
        
        // 扩展采样范围
        const sampleMin = Math.max(xMin, range.min - 1);
        const sampleMax = Math.min(xMax, range.max + 1);
        
        const deltaX = forCollision ? this.collisionDeltaX : this.deltaX;
        
        // Desmos风格：符号分析断点 + 分段采样
        return this.sampleWithDiscontinuities(expression, sampleMin, sampleMax, deltaX);
    }
    
    /**
     * 符号分析：找出函数表达式中的所有断点
     */
    findDiscontinuities(expression, xMin, xMax) {
        const discontinuities = [];
        if (!expression) return discontinuities;
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        
        // 1. tan(x) 的断点：π/2 + nπ
        if (cleanExpr.includes('tan')) {
            for (let n = -100; n <= 100; n++) {
                const asymptote = Math.PI / 2 + n * Math.PI;
                if (asymptote >= xMin && asymptote <= xMax) {
                    discontinuities.push(asymptote);
                }
            }
        }
        
        // 2. cot(x) 的断点：nπ
        if (cleanExpr.includes('cot')) {
            for (let n = -100; n <= 100; n++) {
                const asymptote = n * Math.PI;
                if (asymptote >= xMin && asymptote <= xMax) {
                    discontinuities.push(asymptote);
                }
            }
        }
        
        // 3. sec(x) 的断点：π/2 + nπ
        if (cleanExpr.includes('sec')) {
            for (let n = -100; n <= 100; n++) {
                const asymptote = Math.PI / 2 + n * Math.PI;
                if (asymptote >= xMin && asymptote <= xMax) {
                    discontinuities.push(asymptote);
                }
            }
        }
        
        // 4. csc(x) 的断点：nπ
        if (cleanExpr.includes('csc')) {
            for (let n = -100; n <= 100; n++) {
                const asymptote = n * Math.PI;
                if (asymptote >= xMin && asymptote <= xMax) {
                    discontinuities.push(asymptote);
                }
            }
        }
        
        // 5. ln(x)、log(x) 的定义域：x > 0
        if (cleanExpr.includes('ln(') || cleanExpr.includes('log(')) {
            if (cleanExpr === 'ln(x)' || cleanExpr === 'log(x)') {
                if (0 >= xMin && 0 <= xMax) {
                    discontinuities.push(0);
                }
            }
        }
        
        return [...new Set(discontinuities)].sort((a, b) => a - b);
    }
    
    /**
     * 分段采样（Desmos风格）
     */
    sampleWithDiscontinuities(expression, xMin, xMax, deltaX) {
        const discontinuities = this.findDiscontinuities(expression, xMin, xMax);
        
        // Y值限制（视口范围的两倿）
        const range = this.gridSystem.getRange();
        const yLimit = (range.max - range.min) * 2;
        
        const allPoints = [];
        let prevX = xMin;
        const epsilon = deltaX * 0.1;
        
        for (const disc of discontinuities) {
            const segmentEnd = disc - epsilon;
            if (segmentEnd > prevX) {
                const segment = this.sampleSegment(expression, prevX, segmentEnd, deltaX, yLimit);
                allPoints.push(...segment);
            }
            
            allPoints.push({x: disc, y: null, isBreak: true});
            prevX = disc + epsilon;
        }
        
        if (prevX < xMax) {
            const lastSegment = this.sampleSegment(expression, prevX, xMax, deltaX, yLimit);
            allPoints.push(...lastSegment);
        }
        
        return allPoints;
    }
    
    /**
     * 采样一个连续区间
     */
    sampleSegment(expression, xMin, xMax, deltaX, yLimit) {
        const points = [];
        
        for (let x = xMin; x <= xMax; x += deltaX) {
            const y = this.parser.evaluate(expression, x);
            
            if (y !== null && isFinite(y)) {
                if (Math.abs(y) > yLimit) {
                    if (points.length > 0 && points[points.length - 1].y !== null) {
                        points.push({ x: x, y: null, isBreak: true });
                    }
                    continue;
                }

                // 防止跨越隐藏断点（如 abs(x)/x 在 x=0）时被错误连成竖线
                if (points.length > 0 && points[points.length - 1].y !== null) {
                    const prevPoint = points[points.length - 1];
                    if (this.shouldBreakBetweenPoints(expression, prevPoint, { x, y })) {
                        points.push({ x, y: null, isBreak: true });
                    }
                }

                points.push({ x, y });
            } else {
                if (points.length > 0 && points[points.length - 1].y !== null) {
                    points.push({ x: x, y: null, isBreak: true });
                }
            }
        }
        
        return points;
    }

    /**
     * 判断两个有效采样点之间是否应强制断开，避免竖线伪连接
     */
    shouldBreakBetweenPoints(expression, p1, p2) {
        const dy = Math.abs(p2.y - p1.y);

        // 规则1：明显跳变且异号（典型 jump discontinuity）
        const signChanged = p1.y * p2.y < 0;
        if (signChanged && Math.abs(p1.y) > 0.5 && Math.abs(p2.y) > 0.5 && dy > 1) {
            return true;
        }

        // 规则2：中点不可算，说明中间存在未采到的不连续点
        const midX = (p1.x + p2.x) / 2;
        const midY = this.parser.evaluate(expression, midX);
        if (midY === null || !isFinite(midY)) {
            return true;
        }

        return false;
    }
    
    /**
     * 绘制函数
     * @param {string} expression - 函数表达式
     * @param {boolean} animate - 是否使用动画绘制
     * @param {string} color - 函数颜色（可选，用于测试模式）
     * @returns {Promise<Array>} 返回采样点数组
     */
    async drawFunction(expression, animate = true, color = null) {
        const range = this.gridSystem.getRange();
        const points = this.sampleFunction(expression, range.min, range.max);
        
        if (animate) {
            await this.animateDraw(points, color);
        } else {
            this.drawPoints(points, color);
        }
        
        return points;
    }
    
    /**
     * 动画绘制函数
     * @param {Array} points - 采样点数组
     * @param {string} color - 自定义颜色（可选）
     * @returns {Promise}
     */
    animateDraw(points, color = null) {
        return new Promise((resolve) => {
            // 取消之前的绘制
            this.cancelDrawing();
            this.isDrawing = true;
            
            const ctx = this.gridSystem.ctx;
            
            // 分段绘制：先找出所有连续段
            const segments = [];
            let currentSegment = [];
            
            for (let i = 0; i < points.length; i++) {
                if (points[i].y === null) {
                    // 断点：保存当前段
                    if (currentSegment.length >= 2) {
                        segments.push(currentSegment);
                    }
                    currentSegment = [];
                } else {
                    currentSegment.push(points[i]);
                }
            }
            
            // 保存最后一段
            if (currentSegment.length >= 2) {
                segments.push(currentSegment);
            }
            
            if (segments.length === 0) {
                this.isDrawing = false;
                resolve();
                return;
            }
            
            let currentSegmentIndex = 0;
            let currentPointIndex = 0;
            const batchSize = this.getAdaptiveBatchSize();
            
            const drawFrame = () => {
                // 如果绘制被取消，提前结束
                if (!this.isDrawing) {
                    resolve();
                    return;
                }
                
                ctx.strokeStyle = color || this.colors.function;
                ctx.lineWidth = this.getAdaptiveLineWidth();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // 测试模式（有自定义颜色）不显示光晕
                if (!color) {
                    // 添加发光效果（自适应大小和深浅）
                    ctx.shadowColor = this.getAdaptiveGlowColor(color);
                    ctx.shadowBlur = this.getAdaptiveGlowSize();
                }
                
                let pointsDrawn = 0;
                
                // 性能优化：每帧将同一段内的多个点合并为单一路径，大幅减少 stroke() 调用次数
                while (currentSegmentIndex < segments.length && pointsDrawn < batchSize) {
                    const segment = segments[currentSegmentIndex];
                    
                    // 计算本帧内这一段还能绘制多少个点
                    const remaining = segment.length - 1 - currentPointIndex;
                    const canDraw = Math.min(remaining, batchSize - pointsDrawn);
                    
                    if (canDraw > 0) {
                        // 将本批次这一段的多个点合并为单一路径一次输出
                        ctx.beginPath();
                        const p0 = this.gridSystem.mathToCanvas(
                            segment[currentPointIndex].x,
                            segment[currentPointIndex].y
                        );
                        ctx.moveTo(p0.x, p0.y);
                        
                        for (let k = 1; k <= canDraw; k++) {
                            const p = this.gridSystem.mathToCanvas(
                                segment[currentPointIndex + k].x,
                                segment[currentPointIndex + k].y
                            );
                            ctx.lineTo(p.x, p.y);
                        }
                        ctx.stroke();
                        
                        currentPointIndex += canDraw;
                        pointsDrawn += canDraw;
                    }
                    
                    // 当前段绘制完成，跳到下一段
                    if (currentPointIndex >= segment.length - 1) {
                        currentSegmentIndex++;
                        currentPointIndex = 0;
                    }
                }
                
                // 重置阴影
                ctx.shadowBlur = 0;
                
                if (currentSegmentIndex < segments.length && this.isDrawing) {
                    this.animationFrameId = requestAnimationFrame(drawFrame);
                } else {
                    this.isDrawing = false;
                    this.animationFrameId = null;
                    resolve();
                }
            };
            
            drawFrame();
        });
    }
    
    /**
     * 直接绘制所有点（无动画）
     * @param {Array} points - 采样点数组
     * @param {string} color - 自定义颜色（可选）
     */
    drawPoints(points, color = null) {
        const ctx = this.gridSystem.ctx;
        
        ctx.strokeStyle = color || this.colors.function;
        ctx.lineWidth = this.getAdaptiveLineWidth();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // 测试模式（有自定义颜色）不显示光晕
        if (!color) {
            // 添加发光效果（自适应大小）
            ctx.shadowColor = this.colors.glow;
            ctx.shadowBlur = this.getAdaptiveGlowSize();
        }
        
        // 遍历所有点，遇到断点就停止当前线段
        let currentSegment = [];
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            
            if (point.y === null) {
                // 断点：绘制当前线段并清空
                this.drawSegment(currentSegment, ctx);
                currentSegment = [];
            } else {
                currentSegment.push(point);
            }
        }
        
        // 绘制最后一段
        if (currentSegment.length > 1) {
            this.drawSegment(currentSegment, ctx);
        }
        
        ctx.shadowBlur = 0;
    }
    
    /**
     * 绘制一段连续曲线
     * 性能优化：将整段合并为单一路径，只调用一次 stroke()
     */
    drawSegment(segment, ctx) {
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
    
    /**
     * 检查点是否在 Canvas 可视范围内
     * @param {Object} point - {x, y} Canvas 坐标
     * @param {number} size - Canvas 大小
     * @returns {boolean}
     */
    isPointVisible(point, size) {
        return point.x >= -50 && point.x <= size + 50 && 
               point.y >= -50 && point.y <= size + 50;
    }
    
    /**
     * 将采样点转换为折线（用于碰撞检测）
     * @param {Array} points - 采样点数组
     * @returns {Array} 折线点数组
     */
    convertToPolyline(points) {
        const polyline = [];
        for (const p of points) {
            if (p.y === null || p.isBreak) {
                // 遇到断点或无效值，插入 null 作为分隔符
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
     * @param {string} expression - 函数表达式
     */
    previewFunction(expression) {
        // 先清除之前的函数
        this.gridSystem.draw();
        
        // 快速绘制（降低采样精度），但仍按断点分段，避免预览时出现竖线伪连接
        const range = this.gridSystem.getRange();
        const previewDeltaX = 0.05; // 预览时使用较低精度

        const points = this.sampleWithDiscontinuities(
            expression,
            range.min,
            range.max,
            previewDeltaX
        );

        this.drawPoints(points);
    }
    
    /**
     * 获取函数在特定 x 值处的 y 值
     * @param {string} expression - 函数表达式
     * @param {number} x - x 值
     * @returns {number|null}
     */
    getYAtX(expression, x) {
        return this.parser.evaluate(expression, x);
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionRenderer;
}
