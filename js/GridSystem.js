/**
 * GridSystem 模块
 * 负责 Canvas 初始化和坐标系绘制
 * 根据回合数动态调整棋盘范围
 */
class GridSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // 棋盘配置
        this.gridSize = 10; // 初始 10x10
        this.range = 5; // 初始范围 -5 到 5
        this.cellSize = 0; // 每个格子的像素大小（动态计算）
        
        // 颜色配置
        this.colors = {
            gridLine: 'rgba(255, 255, 255, 0.2)',
            axis: 'rgba(255, 255, 255, 0.6)',
            target: '#22c55e',
            forbidden: 'rgba(239, 68, 68, 0.3)',
            forbiddenBorder: '#ef4444',
            background: '#0a0a1a'
        };
        
        // 目标网格和禁止区
        this.targetCell = null; // {x, y} - 兼容旧代码
        this.targetCells = []; // [{x, y}, ...] - 多个目标格
        this.forbiddenCells = []; // [{x, y}, ...]
        
        // 绑定 resize 事件
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }
    
    /**
     * 调整 Canvas 大小
     */
    resize() {
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight);
        
        // 设置 Canvas 实际像素大小
        this.canvas.width = size;
        this.canvas.height = size;
        
        // 计算每个格子的像素大小
        this.cellSize = size / this.gridSize;
        
        this.draw();
    }
    
    /**
     * 根据回合数更新棋盘范围
     * @param {number} round - 当前回合数（从1开始）
     */
    updateRange(round) {
        if (round <= 4) {
            this.gridSize = 10;
            this.range = 5;
        } else if (round <= 8) {
            this.gridSize = 20;
            this.range = 10;
        } else if (round <= 12) {
            this.gridSize = 30;
            this.range = 15;
        } else {
            this.gridSize = 40;
            this.range = 20;
        }
        this.resize();
    }
    
    /**
     * 将数学坐标转换为 Canvas 像素坐标
     * @param {number} x - 数学坐标 x
     * @param {number} y - 数学坐标 y
     * @returns {Object} {x, y} Canvas 像素坐标
     */
    mathToCanvas(x, y) {
        const size = this.canvas.width;
        const canvasX = (x + this.range) / (this.range * 2) * size;
        const canvasY = size - (y + this.range) / (this.range * 2) * size;
        return { x: canvasX, y: canvasY };
    }
    
    /**
     * 将 Canvas 像素坐标转换为数学坐标
     * @param {number} canvasX - Canvas 像素坐标 x
     * @param {number} canvasY - Canvas 像素坐标 y
     * @returns {Object} {x, y} 数学坐标
     */
    canvasToMath(canvasX, canvasY) {
        const size = this.canvas.width;
        const x = (canvasX / size) * (this.range * 2) - this.range;
        const y = ((size - canvasY) / size) * (this.range * 2) - this.range;
        return { x, y };
    }
    
    /**
     * 获取点击位置对应的网格坐标
     * @param {number} canvasX - Canvas 像素坐标 x
     * @param {number} canvasY - Canvas 像素坐标 y
     * @returns {Object|null} {x, y} 网格坐标，如果不在网格内返回 null
     */
    getCellFromCanvas(canvasX, canvasY) {
        const size = this.canvas.width;
        
        // 计算每个格子的像素大小
        const cellPixelSize = size / this.gridSize;
        
        // 将 Canvas 坐标转换为网格索引（0 到 gridSize-1）
        // 限制在有效范围内
        const gridIndexX = Math.max(0, Math.min(this.gridSize - 1, Math.floor(canvasX / cellPixelSize)));
        const gridIndexY = Math.max(0, Math.min(this.gridSize - 1, Math.floor(canvasY / cellPixelSize)));
        
        // 将网格索引转换为数学坐标
        // X: 网格索引 0 对应数学坐标 -range
        const cellX = gridIndexX - this.range;
        // Y: 网格索引 0 是顶部，对应数学坐标 +range；网格索引 gridSize-1 是底部，对应数学坐标 -range
        const cellY = this.range - 1 - gridIndexY;
        
        // 检查是否在有效范围内
        if (cellX >= -this.range && cellX < this.range && 
            cellY >= -this.range && cellY < this.range) {
            return { x: cellX, y: cellY };
        }
        return null;
    }
    
    /**
     * 设置目标网格（兼容旧代码）
     * @param {Object} cell - {x, y}
     */
    setTargetCell(cell) {
        this.targetCell = cell;
        if (cell) {
            this.targetCells = [cell];
        } else {
            this.targetCells = [];
        }
        this.draw();
    }
    
    /**
     * 设置多个目标网格
     * @param {Array} cells - [{x, y}, ...]
     */
    setTargetCells(cells) {
        this.targetCells = cells || [];
        this.targetCell = this.targetCells[0] || null; // 兼容旧代码
        this.draw();
    }
    
    /**
     * 添加目标网格
     * @param {Object} cell - {x, y}
     */
    addTargetCell(cell) {
        // 检查是否已存在
        const exists = this.targetCells.some(c => c.x === cell.x && c.y === cell.y);
        if (!exists) {
            this.targetCells.push(cell);
            this.targetCell = this.targetCells[0]; // 兼容旧代码
            this.draw();
            return true;
        }
        return false;
    }
    
    /**
     * 移除目标网格
     * @param {Object} cell - {x, y}
     */
    removeTargetCell(cell) {
        const index = this.targetCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (index !== -1) {
            this.targetCells.splice(index, 1);
            this.targetCell = this.targetCells[0] || null; // 兼容旧代码
            this.draw();
            return true;
        }
        return false;
    }
    
    /**
     * 添加禁止区
     * @param {Object} cell - {x, y}
     */
    addForbiddenCell(cell) {
        // 检查是否已存在
        const exists = this.forbiddenCells.some(c => c.x === cell.x && c.y === cell.y);
        if (!exists && (!this.targetCell || this.targetCell.x !== cell.x || this.targetCell.y !== cell.y)) {
            this.forbiddenCells.push(cell);
            this.draw();
            return true;
        }
        return false;
    }
    
    /**
     * 移除禁止区
     * @param {Object} cell - {x, y}
     */
    removeForbiddenCell(cell) {
        const index = this.forbiddenCells.findIndex(c => c.x === cell.x && c.y === cell.y);
        if (index !== -1) {
            this.forbiddenCells.splice(index, 1);
            this.draw();
            return true;
        }
        return false;
    }
    
    /**
     * 清除目标网格
     */
    clearTargetCell() {
        this.targetCell = null;
        this.targetCells = [];
        this.draw();
    }
    
    /**
     * 清除所有禁止区
     */
    clearForbiddenCells() {
        this.forbiddenCells = [];
        this.draw();
    }
    
    /**
     * 清除所有标记
     */
    clearAll() {
        this.targetCell = null;
        this.targetCells = [];
        this.forbiddenCells = [];
        this.draw();
    }
    
    /**
     * 绘制网格
     */
    draw() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        
        // 清空画布
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, size, size);
        
        // 绘制禁止区
        this.drawForbiddenCells();
        
        // 绘制目标网格
        this.drawTargetCell();
        
        // 绘制网格线
        this.drawGridLines();
        
        // 绘制坐标轴
        this.drawAxes();
    }
    
    /**
     * 绘制网格线
     */
    drawGridLines() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        
        ctx.strokeStyle = this.colors.gridLine;
        ctx.lineWidth = 1;
        
        // 垂直线
        for (let i = 0; i <= this.gridSize; i++) {
            const x = (i / this.gridSize) * size;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
            ctx.stroke();
        }
        
        // 水平线
        for (let i = 0; i <= this.gridSize; i++) {
            const y = (i / this.gridSize) * size;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }
    }
    
    /**
     * 绘制坐标轴
     */
    drawAxes() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        const center = this.mathToCanvas(0, 0);
        
        ctx.strokeStyle = this.colors.axis;
        ctx.lineWidth = 2;
        
        // X轴
        ctx.beginPath();
        ctx.moveTo(0, center.y);
        ctx.lineTo(size, center.y);
        ctx.stroke();
        
        // Y轴
        ctx.beginPath();
        ctx.moveTo(center.x, 0);
        ctx.lineTo(center.x, size);
        ctx.stroke();
        
        // 绘制刻度
        this.drawTicks();
    }
    
    /**
     * 绘制刻度
     */
    drawTicks() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        const center = this.mathToCanvas(0, 0);
        
        ctx.fillStyle = this.colors.axis;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // X轴刻度
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            const pos = this.mathToCanvas(i, 0);
            ctx.fillText(i.toString(), pos.x, center.y + 15);
            
            // 小刻度线
            ctx.beginPath();
            ctx.moveTo(pos.x, center.y - 3);
            ctx.lineTo(pos.x, center.y + 3);
            ctx.stroke();
        }
        
        // Y轴刻度
        ctx.textAlign = 'right';
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            const pos = this.mathToCanvas(0, i);
            ctx.fillText(i.toString(), center.x - 8, pos.y);
            
            // 小刻度线
            ctx.beginPath();
            ctx.moveTo(center.x - 3, pos.y);
            ctx.lineTo(center.x + 3, pos.y);
            ctx.stroke();
        }
        
        // 原点
        ctx.textAlign = 'right';
        ctx.fillText('0', center.x - 8, center.y + 15);
    }
    
    /**
     * 绘制目标网格（支持多个目标格）
     */
    drawTargetCell() {
        const ctx = this.ctx;
        
        // 绘制所有目标格
        for (const cell of this.targetCells) {
            const topLeft = this.mathToCanvas(cell.x, cell.y + 1);
            const bottomRight = this.mathToCanvas(cell.x + 1, cell.y);
            
            const width = bottomRight.x - topLeft.x;
            const height = bottomRight.y - topLeft.y;
            
            // 绘制目标格
            ctx.fillStyle = this.colors.target;
            ctx.fillRect(topLeft.x, topLeft.y, width, height);
        }
    }
    
    /**
     * 绘制禁止区
     */
    drawForbiddenCells() {
        const ctx = this.ctx;
        
        for (const cell of this.forbiddenCells) {
            const topLeft = this.mathToCanvas(cell.x, cell.y + 1);
            const bottomRight = this.mathToCanvas(cell.x + 1, cell.y);
            
            const width = bottomRight.x - topLeft.x;
            const height = bottomRight.y - topLeft.y;
            
            // 填充
            ctx.fillStyle = this.colors.forbidden;
            ctx.fillRect(topLeft.x, topLeft.y, width, height);
            
            // 边框
            ctx.strokeStyle = this.colors.forbiddenBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        }
    }
    
    /**
     * 获取当前棋盘范围
     * @returns {Object} {min, max}
     */
    getRange() {
        return { min: -this.range, max: this.range };
    }
    
    /**
     * 获取目标网格（兼容旧代码）
     * @returns {Object|null}
     */
    getTargetCell() {
        return this.targetCell;
    }
    
    /**
     * 获取所有目标网格
     * @returns {Array}
     */
    getTargetCells() {
        return [...this.targetCells];
    }
    
    /**
     * 获取所有禁止区
     * @returns {Array}
     */
    getForbiddenCells() {
        return [...this.forbiddenCells];
    }
    
    /**
     * 获取网格单元格的矩形边界（用于碰撞检测）
     * @param {Object} cell - {x, y}
     * @returns {Object} {x1, y1, x2, y2}
     */
    getCellRect(cell) {
        return {
            x1: cell.x,
            y1: cell.y,
            x2: cell.x + 1,
            y2: cell.y + 1
        };
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GridSystem;
}
