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
     * 采样函数
     * @param {string} expression - 函数表达式
     * @param {number} xMin - x 最小值
     * @param {number} xMax - x 最大值
     * @returns {Array} 采样点数组 [{x, y}, ...]
     */
    sampleFunction(expression, xMin, xMax) {
        const points = [];
        const range = this.gridSystem.getRange();
        
        // 扩展采样范围以确保覆盖整个棋盘
        const sampleMin = Math.max(xMin, range.min - 1);
        const sampleMax = Math.min(xMax, range.max + 1);
        
        let prevY = null;
        let prevX = null;
        
        for (let x = sampleMin; x <= sampleMax; x += this.deltaX) {
            const y = this.parser.evaluate(expression, x);
            
            if (y !== null && isFinite(y)) {
                // 检查是否为断点（Y值突变）
                if (prevY !== null && prevX !== null) {
                    const deltaY = Math.abs(y - prevY);
                    const deltaX = x - prevX;
                    
                    // 如果斜率过大，视为断点
                    if (deltaX > 0 && Math.abs(deltaY / deltaX) > this.maxDeltaY) {
                        // 添加断点标记
                        points.push({ x: x, y: null, isBreak: true });
                        prevY = null;
                        prevX = null;
                        continue;
                    }
                }
                
                points.push({ x, y });
                prevY = y;
                prevX = x;
            } else {
                // 无效值，标记断点
                if (prevY !== null) {
                    points.push({ x: x, y: null, isBreak: true });
                }
                prevY = null;
                prevX = null;
            }
        }
        
        return points;
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
            const validPoints = points.filter(p => p.y !== null);
            
            if (validPoints.length < 2) {
                this.isDrawing = false;
                resolve();
                return;
            }
            
            let currentIndex = 0;
            // 根据坐标系范围调整绘制速度：范围越大，batchSize越小（视觉上越慢）
            const batchSize = this.getAdaptiveBatchSize();
            
            const drawFrame = () => {
                // 如果绘制被取消，提前结束
                if (!this.isDrawing) {
                    resolve();
                    return;
                }
                
                const endIndex = Math.min(currentIndex + batchSize, validPoints.length);
                
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
                
                for (let i = currentIndex; i < endIndex - 1; i++) {
                    const p1 = this.gridSystem.mathToCanvas(validPoints[i].x, validPoints[i].y);
                    const p2 = this.gridSystem.mathToCanvas(validPoints[i + 1].x, validPoints[i + 1].y);
                    
                    // 检查两点是否都在可视范围内
                    const canvasSize = this.gridSystem.canvas.width;
                    if (this.isPointVisible(p1, canvasSize) || this.isPointVisible(p2, canvasSize)) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
                
                // 重置阴影
                ctx.shadowBlur = 0;
                
                currentIndex = endIndex - 1;
                
                if (currentIndex < validPoints.length - 1 && this.isDrawing) {
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
        const validPoints = points.filter(p => p.y !== null);
        
        if (validPoints.length < 2) return;
        
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
        
        const canvasSize = this.gridSystem.canvas.width;
        
        for (let i = 0; i < validPoints.length - 1; i++) {
            const p1 = this.gridSystem.mathToCanvas(validPoints[i].x, validPoints[i].y);
            const p2 = this.gridSystem.mathToCanvas(validPoints[i + 1].x, validPoints[i + 1].y);
            
            // 只绘制在可视范围内的线段
            if (this.isPointVisible(p1, canvasSize) || this.isPointVisible(p2, canvasSize)) {
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
        
        // 重置阴影
        ctx.shadowBlur = 0;
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
        return points
            .filter(p => p.y !== null)
            .map(p => ({ x: p.x, y: p.y }));
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
        
        // 快速绘制（降低采样精度）
        const range = this.gridSystem.getRange();
        const previewDeltaX = 0.05; // 预览时使用较低精度
        
        const points = [];
        for (let x = range.min; x <= range.max; x += previewDeltaX) {
            const y = this.parser.evaluate(expression, x);
            if (y !== null && isFinite(y)) {
                points.push({ x, y });
            }
        }
        
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
