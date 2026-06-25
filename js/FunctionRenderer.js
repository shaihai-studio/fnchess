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
     * @returns {Promise<Array>} 返回采样点数组
     */
    async drawFunction(expression, animate = true) {
        const range = this.gridSystem.getRange();
        const points = this.sampleFunction(expression, range.min, range.max);
        
        if (animate) {
            await this.animateDraw(points);
        } else {
            this.drawPoints(points);
        }
        
        return points;
    }
    
    /**
     * 动画绘制函数
     * @param {Array} points - 采样点数组
     * @returns {Promise}
     */
    animateDraw(points) {
        return new Promise((resolve) => {
            const ctx = this.gridSystem.ctx;
            const validPoints = points.filter(p => p.y !== null);
            
            if (validPoints.length < 2) {
                resolve();
                return;
            }
            
            let currentIndex = 0;
            const batchSize = 20; // 每帧绘制的点数，增加以加快动画
            
            const drawFrame = () => {
                const endIndex = Math.min(currentIndex + batchSize, validPoints.length);
                
                ctx.strokeStyle = this.colors.function;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // 添加发光效果
                ctx.shadowColor = this.colors.glow;
                ctx.shadowBlur = 10;
                
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
                
                if (currentIndex < validPoints.length - 1) {
                    requestAnimationFrame(drawFrame);
                } else {
                    resolve();
                }
            };
            
            drawFrame();
        });
    }
    
    /**
     * 直接绘制所有点（无动画）
     * @param {Array} points - 采样点数组
     */
    drawPoints(points) {
        const ctx = this.gridSystem.ctx;
        const validPoints = points.filter(p => p.y !== null);
        
        if (validPoints.length < 2) return;
        
        ctx.strokeStyle = this.colors.function;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // 添加发光效果
        ctx.shadowColor = this.colors.glow;
        ctx.shadowBlur = 10;
        
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
