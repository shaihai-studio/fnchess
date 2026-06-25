/**
 * CollisionDetector 模块
 * 实现线段与矩形相交检测算法
 * 用于判定函数是否进入目标网格或禁止区
 */
class CollisionDetector {
    constructor() {
        // 精度配置
        this.epsilon = 1e-10;
    }
    
    /**
     * 判断线段是否与矩形相交（必须进入内部）
     * 使用 Liang-Barsky 算法或分离轴定理
     * @param {Object} p1 - 线段起点 {x, y}
     * @param {Object} p2 - 线段终点 {x, y}
     * @param {Object} rect - 矩形 {x1, y1, x2, y2}
     * @returns {boolean} 是否相交（进入内部）
     */
    lineSegmentIntersectsRect(p1, p2, rect) {
        // 首先检查线段端点是否在矩形内部
        if (this.pointInRectInterior(p1, rect) || this.pointInRectInterior(p2, rect)) {
            return true;
        }
        
        // 检查线段是否与矩形的任意边相交（不包括端点接触）
        const edges = [
            { p1: { x: rect.x1, y: rect.y1 }, p2: { x: rect.x2, y: rect.y1 } }, // 下边
            { p1: { x: rect.x2, y: rect.y1 }, p2: { x: rect.x2, y: rect.y2 } }, // 右边
            { p1: { x: rect.x2, y: rect.y2 }, p2: { x: rect.x1, y: rect.y2 } }, // 上边
            { p1: { x: rect.x1, y: rect.y2 }, p2: { x: rect.x1, y: rect.y1 } }  // 左边
        ];
        
        for (const edge of edges) {
            if (this.lineSegmentsIntersectProperly(p1, p2, edge.p1, edge.p2)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 判断点是否在矩形内部（不包括边界）
     * @param {Object} p - 点 {x, y}
     * @param {Object} rect - 矩形 {x1, y1, x2, y2}
     * @returns {boolean}
     */
    pointInRectInterior(p, rect) {
        return p.x > rect.x1 + this.epsilon && 
               p.x < rect.x2 - this.epsilon && 
               p.y > rect.y1 + this.epsilon && 
               p.y < rect.y2 - this.epsilon;
    }
    
    /**
     * 判断点是否在矩形边界上
     * @param {Object} p - 点 {x, y}
     * @param {Object} rect - 矩形 {x1, y1, x2, y2}
     * @returns {boolean}
     */
    pointOnRectBoundary(p, rect) {
        const onVerticalEdge = (Math.abs(p.x - rect.x1) < this.epsilon || Math.abs(p.x - rect.x2) < this.epsilon) &&
                               p.y >= rect.y1 - this.epsilon && p.y <= rect.y2 + this.epsilon;
        const onHorizontalEdge = (Math.abs(p.y - rect.y1) < this.epsilon || Math.abs(p.y - rect.y2) < this.epsilon) &&
                                 p.x >= rect.x1 - this.epsilon && p.x <= rect.x2 + this.epsilon;
        return onVerticalEdge || onHorizontalEdge;
    }
    
    /**
     * 判断两条线段是否真正相交（不包括端点接触）
     * @param {Object} a1 - 线段A起点
     * @param {Object} a2 - 线段A终点
     * @param {Object} b1 - 线段B起点
     * @param {Object} b2 - 线段B终点
     * @returns {boolean}
     */
    lineSegmentsIntersectProperly(a1, a2, b1, b2) {
        // 计算方向
        const d1 = this.direction(b1, b2, a1);
        const d2 = this.direction(b1, b2, a2);
        const d3 = this.direction(a1, a2, b1);
        const d4 = this.direction(a1, a2, b2);
        
        // 一般情况：互相跨越
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }
        
        // 排除端点接触的情况
        return false;
    }
    
    /**
     * 计算方向（叉积）
     * @param {Object} p1
     * @param {Object} p2
     * @param {Object} p3
     * @returns {number} 正数表示逆时针，负数表示顺时针，0表示共线
     */
    direction(p1, p2, p3) {
        return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
    }
    
    /**
     * 检测折线是否与矩形相交
     * @param {Array} polyline - 折线点数组 [{x, y}, ...]
     * @param {Object} rect - 矩形 {x1, y1, x2, y2}
     * @returns {boolean}
     */
    polylineIntersectsRect(polyline, rect) {
        if (polyline.length < 2) return false;
        
        for (let i = 0; i < polyline.length - 1; i++) {
            if (this.lineSegmentIntersectsRect(polyline[i], polyline[i + 1], rect)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * 检测折线是否与多个矩形中的任意一个相交
     * @param {Array} polyline - 折线点数组
     * @param {Array} rects - 矩形数组 [{x1, y1, x2, y2}, ...]
     * @returns {Object|null} 返回第一个相交的矩形，无则返回null
     */
    polylineIntersectsAnyRect(polyline, rects) {
        for (const rect of rects) {
            if (this.polylineIntersectsRect(polyline, rect)) {
                return rect;
            }
        }
        return null;
    }
    
    /**
     * 检测函数折线是否命中目标网格
     * @param {Array} polyline - 函数折线点数组
     * @param {Object} targetCell - 目标网格 {x, y}
     * @returns {boolean}
     */
    checkHitTarget(polyline, targetCell) {
        const rect = {
            x1: targetCell.x,
            y1: targetCell.y,
            x2: targetCell.x + 1,
            y2: targetCell.y + 1
        };
        return this.polylineIntersectsRect(polyline, rect);
    }
    
    /**
     * 检测函数折线是否进入禁止区
     * @param {Array} polyline - 函数折线点数组
     * @param {Array} forbiddenCells - 禁止区数组 [{x, y}, ...]
     * @returns {boolean}
     */
    checkHitForbidden(polyline, forbiddenCells) {
        const rects = forbiddenCells.map(cell => ({
            x1: cell.x,
            y1: cell.y,
            x2: cell.x + 1,
            y2: cell.y + 1
        }));
        return this.polylineIntersectsAnyRect(polyline, rects) !== null;
    }
    
    /**
     * Cohen-Sutherland 线段裁剪算法
     * 用于裁剪线段到矩形区域内
     * @param {Object} p1 - 线段起点
     * @param {Object} p2 - 线段终点
     * @param {Object} rect - 裁剪矩形
     * @returns {Object|null} 裁剪后的线段，如果完全在外部返回null
     */
    clipLineSegment(p1, p2, rect) {
        const INSIDE = 0;
        const LEFT = 1;
        const RIGHT = 2;
        const BOTTOM = 4;
        const TOP = 8;
        
        const computeCode = (p) => {
            let code = INSIDE;
            if (p.x < rect.x1) code |= LEFT;
            else if (p.x > rect.x2) code |= RIGHT;
            if (p.y < rect.y1) code |= BOTTOM;
            else if (p.y > rect.y2) code |= TOP;
            return code;
        };
        
        let x1 = p1.x, y1 = p1.y;
        let x2 = p2.x, y2 = p2.y;
        let code1 = computeCode(p1);
        let code2 = computeCode(p2);
        
        while (true) {
            if ((code1 | code2) === 0) {
                // 完全在内部
                return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
            } else if ((code1 & code2) !== 0) {
                // 完全在外部
                return null;
            }
            
            let x, y;
            const codeOut = code1 !== 0 ? code1 : code2;
            
            if (codeOut & TOP) {
                x = x1 + (x2 - x1) * (rect.y2 - y1) / (y2 - y1);
                y = rect.y2;
            } else if (codeOut & BOTTOM) {
                x = x1 + (x2 - x1) * (rect.y1 - y1) / (y2 - y1);
                y = rect.y1;
            } else if (codeOut & RIGHT) {
                y = y1 + (y2 - y1) * (rect.x2 - x1) / (x2 - x1);
                x = rect.x2;
            } else {
                y = y1 + (y2 - y1) * (rect.x1 - x1) / (x2 - x1);
                x = rect.x1;
            }
            
            if (codeOut === code1) {
                x1 = x;
                y1 = y;
                code1 = computeCode({ x: x1, y: y1 });
            } else {
                x2 = x;
                y2 = y;
                code2 = computeCode({ x: x2, y: y2 });
            }
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollisionDetector;
}
