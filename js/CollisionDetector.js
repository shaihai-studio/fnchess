/**
 * CollisionDetector 模块
 * 实现视觉检测算法：通过采样函数图像的点来判定是否穿过格子
 * 优点：避免数学计算错误，更符合视觉直觉
 */
class CollisionDetector {
    constructor(gridSystem) {
        // 采样密度：每段折线采样多少个点
        this.sampleDensity = 20; // 每殠20个点
        this.gridSystem = gridSystem; // 保存gridSystem引用
    }
    
    /**
     * 根据坐标系范围计算自适应容差
     * 范围=5时容差=0.8px，范围=6时容差=0.8*5/6px，以此类推
     * @returns {number} 容差（像素）
     */
    getAdaptiveTolerance() {
        const range = this.gridSystem.range;
        const baseTolerance = 0.8;
        const baseRange = 5;
        
        // 按比例缩放：range越大，容差越小
        return baseTolerance * baseRange / range;
    }
    
    /**
     * 检测函数折线是否命中目标网格（视觉检测）
     * @param {Array} polyline - 函数折线点数组 [{x, y}, ...]（数学坐标）
     * @param {Object} targetCell - 目标网格 {x, y}
     * @param {Object} gridSystem - GridSystem实例（用于坐标转换）
     * @returns {boolean} 是否命中
     */
    checkHitTarget(polyline, targetCell, gridSystem) {
        // 将目标格转换为Canvas坐标
        const cellRect = this.getCellCanvasRect(targetCell, gridSystem);
        
        // 采样函数折线，检查是否有点在格子内部
        return this.polylineIntersectsCellVisual(polyline, cellRect, gridSystem);
    }
    
    /**
     * 检测函数折线是否进入禁止区（视觉检测）
     * @param {Array} polyline - 函数折线点数组
     * @param {Array} forbiddenCells - 禁止区数组 [{x, y}, ...]
     * @param {Object} gridSystem - GridSystem实例
     * @returns {boolean}
     */
    checkHitForbidden(polyline, forbiddenCells, gridSystem) {
        for (const cell of forbiddenCells) {
            const cellRect = this.getCellCanvasRect(cell, gridSystem);
            if (this.polylineIntersectsCellVisual(polyline, cellRect, gridSystem)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * 获取格子的Canvas坐标矩形
     * @param {Object} cell - 格子 {x, y}
     * @param {Object} gridSystem - GridSystem实例
     * @returns {Object} {x1, y1, x2, y2} Canvas坐标
     */
    getCellCanvasRect(cell, gridSystem) {
        const topLeft = gridSystem.mathToCanvas(cell.x, cell.y + 1);     // 左上角
        const bottomRight = gridSystem.mathToCanvas(cell.x + 1, cell.y); // 右下角
        
        return {
            x1: topLeft.x,
            y1: topLeft.y,
            x2: bottomRight.x,
            y2: bottomRight.y
        };
    }
    
    /**
     * 视觉检测：函数折线是否穿过格子
     * 性能优化：先用包围盒快速剔除不可能相交的线段，大幅减少采样计算量
     * @param {Array} polyline - 函数折线点数组（数学坐标）
     * @param {Object} cellRect - 格子的Canvas坐标矩形
     * @param {Object} gridSystem - GridSystem实例
     * @returns {boolean}
     */
    polylineIntersectsCellVisual(polyline, cellRect, gridSystem) {
        // 边界检查
        if (!polyline || polyline.length === 0) return false;
        
        // 提前计算自适应容差，避免循环内重复调用
        const epsilon = this.getAdaptiveTolerance();
        
        // 遍历每一段折线
        for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i];
            const p2 = polyline[i + 1];
            
            // 跳过 null 分隔符或无效点
            if (p1 === null || p2 === null) continue;
            if (p1.y === null || p2.y === null) continue;
            
            // 转换为Canvas坐标
            const canvasP1 = gridSystem.mathToCanvas(p1.x, p1.y);
            const canvasP2 = gridSystem.mathToCanvas(p2.x, p2.y);
            
            // 性能优化：包围盒快速剔除
            // 如果线段的包围盒与格子矩形不重叠，直接跳过（>95%的线段满足此条件）
            const segMinX = Math.min(canvasP1.x, canvasP2.x);
            const segMaxX = Math.max(canvasP1.x, canvasP2.x);
            const segMinY = Math.min(canvasP1.y, canvasP2.y);
            const segMaxY = Math.max(canvasP1.y, canvasP2.y);
            
            if (segMaxX < cellRect.x1 || segMinX > cellRect.x2 ||
                segMaxY < cellRect.y1 || segMinY > cellRect.y2) {
                continue; // 包围盒不重叠，跳过
            }
            
            // 包围盒有重叠，进行精确采样检测
            const samples = this.sampleLineSegment(canvasP1, canvasP2, this.sampleDensity);
            
            // 检查是否有任何采样点在格子内部
            for (const point of samples) {
                if (this.pointInRectInterior(point, cellRect, epsilon)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * 在线段上采样多个点
     * @param {Object} p1 - 起点 {x, y}
     * @param {Object} p2 - 终点 {x, y}
     * @param {number} count - 采样点数量
     * @returns {Array} 采样点数组
     */
    sampleLineSegment(p1, p2, count) {
        const samples = [];
        
        // 包括端点在内的均匀采样
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            samples.push({
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t
            });
        }
        
        return samples;
    }
    
    /**
     * 判断点是否在矩形内部（严格内部，不含边界）
     * @param {Object} p - 点 {x, y}
     * @param {Object} rect - 矩形 {x1, y1, x2, y2}
     * @param {number} [epsilon] - 容差（可选，不传时会自动计算）
     * @returns {boolean}
     */
    pointInRectInterior(p, rect, epsilon) {
        if (epsilon === undefined) epsilon = this.getAdaptiveTolerance();
        return p.x > rect.x1 + epsilon && 
               p.x < rect.x2 - epsilon && 
               p.y > rect.y1 + epsilon && 
               p.y < rect.y2 - epsilon;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollisionDetector;
}
