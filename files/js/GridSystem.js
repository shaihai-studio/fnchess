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
            target: 'rgba(34, 197, 94, 0.5)',  // 半透明绿色
            targetBorder: '#22c55e',
            forbidden: 'rgba(239, 68, 68, 0.3)',
            forbiddenBorder: '#ef4444',
            background: '#0a0a1a'
        };
        
        // 目标网格和禁止区
        this.targetCell = null; // {x, y} - 兼容旧代码
        this.targetCells = []; // [{x, y}, ...] - 多个目标格
        this.forbiddenCells = []; // [{x, y}, ...]
        
        // 历史使用过的格子
        this.usedCells = []; // [{x, y, type: 'target'|'forbidden', round: number}, ...]
        
        // 历史函数（用于淡化显示）
        this.functionHistory = []; // [{expression, round, points, color}, ...]
        
        // 缩放配置（用于测试模式）
        this.minRange = 5;   // 最小范围
        this.maxRange = 50;  // 最大范围
        this.rangeStep = 5;  // 每次缩放步长
        this.fixedCampaignRange = 10; // 闯关模式固定 20x20
        this.isCampaignFixedRange = false;
        
        // 防抖定时器
        this.resizeTimeout = null;
        
        // 绑定 resize 事件
        window.addEventListener('resize', () => this.debounceResize());
        this.resize();
    }
    
    /**
     * 防抖调整大小
     */
    debounceResize() {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
            this.resize();
        }, 100);
    }
    
    /**
     * 放大坐标系（范围增加）
     * @returns {number} 新的范围值
     */
    zoomOut() {
        if (this.range < this.maxRange) {
            this.range += this.rangeStep;
            this.gridSize = this.range * 2;
            // 使用 requestAnimationFrame 优化性能
            requestAnimationFrame(() => this.resize());
        }
        return this.range;
    }
    
    /**
     * 缩小坐标系（范围减小）
     * @returns {number} 新的范围值
     */
    zoomIn() {
        if (this.range > this.minRange) {
            this.range -= this.rangeStep;
            this.gridSize = this.range * 2;
            // 使用 requestAnimationFrame 优化性能
            requestAnimationFrame(() => this.resize());
        }
        return this.range;
    }
    
    /**
     * 设置坐标系范围
     * @param {number} newRange - 新的范围值
     */
    setRange(newRange) {
        if (newRange >= this.minRange && newRange <= this.maxRange) {
            this.range = newRange;
            this.gridSize = newRange * 2;
            this.resize();
        }
    }
    
    /**
     * 调整 Canvas 大小
     */
    resize() {
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight);
        
        // 设置 Canvas 实际像素大小（保持 1:1 正方形）
        this.canvas.width = size;
        this.canvas.height = size;
        
        // 计算每个格子的像素大小
        this.cellSize = size / this.gridSize;
        
        this.draw();
    }
    
    /**
     * 切换闯关模式固定坐标系（20x20）
     * @param {boolean} enabled
     */
    setCampaignFixedRange(enabled) {
        this.isCampaignFixedRange = !!enabled;
        if (this.isCampaignFixedRange) {
            this.range = this.fixedCampaignRange;
            this.gridSize = this.range * 2;
            this.resize();
        } else {
            // 退出闯关时立即恢复默认对战网格，避免保留 20x20 状态
            this.range = 5;
            this.gridSize = 10;
            this.resize();
        }
    }
    
    /**
     * 根据回合数更新棋盘范围
     * @param {number} round - 当前回合数（从1开始）
     */
    updateRange(round) {
        if (this.isCampaignFixedRange) {
            this.range = this.fixedCampaignRange;
            this.gridSize = this.range * 2;
            this.resize();
            return false;
        }
        const oldRange = this.range;
        if (round <= 4) {
            // 1-4回合：范围5
            this.gridSize = 10;
            this.range = 5;
        } else if (round <= 8) {
            // 5-8回合：范围6
            this.gridSize = 12;
            this.range = 6;
        } else if (round <= 12) {
            // 9-12回合：范围7
            this.gridSize = 14;
            this.range = 7;
        } else if (round <= 16) {
            // 13-16回合：范围8
            this.gridSize = 16;
            this.range = 8;
        } else if (round <= 20) {
            // 17-20回合：范围9
            this.gridSize = 18;
            this.range = 9;
        } else {
            // 21-24回合：范围10
            this.gridSize = 20;
            this.range = 10;
        }
        this.resize();
        // 返回 range 是否真正发生了变化（供 UIController 判断是否需要重采样历史函数）
        return this.range !== oldRange;
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
        this.targetCells = [];  // 清空当前回合的目标格
        this.forbiddenCells = [];  // 清空当前回合的禁区
        // 注意：不清空 usedCells，这是历史格子，需要在下一回合显示为灰色
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
        
        // 绘制历史使用过的格子
        this.drawUsedCells();
        
        // 绘制禁止区
        this.drawForbiddenCells();
        
        // 绘制目标网格
        this.drawTargetCell();
        
        // 绘制网格线
        this.drawGridLines();
        
        // 绘制坐标轴
        this.drawAxes();
        
        // 绘制历史函数（淡化显示）
        this.drawHistoryFunctions();
    }
    
    /**
     * 绘制网格线
     */
    drawGridLines() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        
        ctx.strokeStyle = this.colors.gridLine;
        ctx.lineWidth = 1;
        
        // 使用单次路径绘制所有网格线，减少绘制调用
        ctx.beginPath();
        
        // 垂直线
        for (let i = 0; i <= this.gridSize; i++) {
            const x = (i / this.gridSize) * size;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
        }
        
        // 水平线
        for (let i = 0; i <= this.gridSize; i++) {
            const y = (i / this.gridSize) * size;
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
        }
        
        ctx.stroke();
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
        
        // 使用单次路径绘制 X轴和Y轴
        ctx.beginPath();
        ctx.moveTo(0, center.y);
        ctx.lineTo(size, center.y);
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
        
        // 根据范围计算刻度间隔
        const step = this.getTickStep();
        
        // 合并绘制所有刻度线（减少绘制调用）
        ctx.beginPath();
        
        // X轴刻度线
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            const pos = this.mathToCanvas(i, 0);
            ctx.moveTo(pos.x, center.y - 3);
            ctx.lineTo(pos.x, center.y + 3);
        }
        
        // Y轴刻度线
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            const pos = this.mathToCanvas(0, i);
            ctx.moveTo(center.x - 3, pos.y);
            ctx.lineTo(center.x + 3, pos.y);
        }
        
        ctx.stroke();
        
        // 绘制数字标签
        // X轴数字
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            if (i % step === 0) {
                const pos = this.mathToCanvas(i, 0);
                ctx.fillText(i.toString(), pos.x, center.y + 15);
            }
        }
        
        // Y轴数字
        ctx.textAlign = 'right';
        for (let i = -this.range; i <= this.range; i++) {
            if (i === 0) continue;
            if (i % step === 0) {
                const pos = this.mathToCanvas(0, i);
                ctx.fillText(i.toString(), center.x - 8, pos.y);
            }
        }
        
        // 原点
        ctx.fillText('0', center.x - 8, center.y + 15);
    }
    
    /**
     * 绘制历史函数（淡化显示）
     */
    drawHistoryFunctions() {
        // 闯关模式下不显示历史图像
        if (this.isCampaignFixedRange) {
            return;
        }
        
        const ctx = this.ctx;
        const currentRound = this.currentRound || 1;
        const currentRange = this.range;
        
        for (const func of this.functionHistory) {
            const roundDiff = currentRound - func.round;
            
            // 只绘制上2回合的函数
            if (roundDiff < 1 || roundDiff > 2) continue;
            
            // 计算透明度：上回合30%，上上回合10%
            const opacity = roundDiff === 2 ? 0.1 : 0.3;
            
            // 直接使用缓存的采样点（扩展后的重采样由 UIController.refreshHistoryFunctionPoints 在 range 变化时统一完成）
            const points = func.points;
            
            if (!points || points.length < 2) continue;
            
            // 解析颜色并应用透明度（历史函数使用白色）
            const baseColor = '#ffffff';  // 白色
            ctx.strokeStyle = this.addAlphaToColor(baseColor, opacity);
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // 处理断点：分段绘制
            let segmentStart = -1;
            
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                
                if (point.y === null || point.isBreak) {
                    // 遇到断点，绘制当前段
                    if (segmentStart !== -1 && i - segmentStart >= 2) {
                        ctx.beginPath();
                        const p1 = this.mathToCanvas(points[segmentStart].x, points[segmentStart].y);
                        ctx.moveTo(p1.x, p1.y);
                        
                        for (let j = segmentStart + 1; j < i; j++) {
                            const p = this.mathToCanvas(points[j].x, points[j].y);
                            ctx.lineTo(p.x, p.y);
                        }
                        ctx.stroke();
                    }
                    segmentStart = -1;
                } else {
                    // 有效点
                    if (segmentStart === -1) {
                        segmentStart = i;
                    }
                }
            }
            
            // 绘制最后一段
            if (segmentStart !== -1 && points.length - segmentStart >= 2) {
                ctx.beginPath();
                const p1 = this.mathToCanvas(points[segmentStart].x, points[segmentStart].y);
                ctx.moveTo(p1.x, p1.y);
                
                for (let j = segmentStart + 1; j < points.length; j++) {
                    const p = this.mathToCanvas(points[j].x, points[j].y);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
        }
    }
    
    /**
     * 给颜色添加透明度
     */
    addAlphaToColor(color, alpha) {
        // 如果是十六进制颜色，转换为rgba
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
    
    /**
     * 扩展函数采样点到新的范围
     * @param {string} expression - 函数表达式
     * @param {Array} oldPoints - 旧的采样点
     * @param {number} newMinX - 新的最小x
     * @param {number} newMaxX - 新的最大x
     * @returns {Array} 新的采样点
     */
    extendFunctionPoints(expression, oldPoints, newMinX, newMaxX) {
        // 如果没有expression，返回原点
        if (!expression) return oldPoints;
        
        // 创建临时的FunctionParser来重新采样
        // 这里我们使用简单的扩展策略：在两端添加新点
        const deltaX = 0.01; // 采样精度
        const newPoints = [];
        
        // 获取旧的采样范围
        const oldMinX = oldPoints[0].x;
        const oldMaxX = oldPoints[oldPoints.length - 1].x;
        
        // 采样左边扩展部分
        for (let x = newMinX; x < oldMinX; x += deltaX) {
            const y = this.evaluateExpression(expression, x);
            if (y !== null && isFinite(y)) {
                newPoints.push({ x, y });
            } else {
                newPoints.push({ x, y: null, isBreak: true });
            }
        }
        
        // 添加旧点
        newPoints.push(...oldPoints);
        
        // 采样右边扩展部分
        for (let x = oldMaxX; x <= newMaxX; x += deltaX) {
            const y = this.evaluateExpression(expression, x);
            if (y !== null && isFinite(y)) {
                newPoints.push({ x, y });
            } else {
                newPoints.push({ x, y: null, isBreak: true });
            }
        }
        
        return newPoints;
    }
    
    /**
     * 简单的表达式求值（用于扩展采样点）
     */
    evaluateExpression(expression, x) {
        try {
            // 替换表达式中的x
            const expr = expression.replace(/x/g, `(${x})`)
                                  .replace(/sin/g, 'Math.sin')
                                  .replace(/cos/g, 'Math.cos')
                                  .replace(/tan/g, 'Math.tan')
                                  .replace(/abs/g, 'Math.abs')
                                  .replace(/exp/g, 'Math.exp')
                                  .replace(/ln/g, 'Math.log')
                                  .replace(/log/g, 'Math.log10')
                                  .replace(/pi/gi, 'Math.PI')
                                  .replace(/e/g, 'Math.E')
                                  .replace(/\^/g, '**');
            
            // eslint-disable-next-line no-eval
            const result = eval(expr);
            return result;
        } catch (e) {
            return null;
        }
    }
    
    /**
     * 根据坐标系范围获取刻度间隔
     * @returns {number} 刻度间隔
     */
    getTickStep() {
        // 根据范围自适应调整刻度间隔
        if (this.range <= 5) {
            return 1;  // 范围 <= 5，每个整数都显示
        } else if (this.range <= 10) {
            return 1;  // 范围 <= 10，每个整数都显示
        } else if (this.range <= 20) {
            return 2;  // 范围 <= 20，每2个显示一个
        } else if (this.range <= 40) {
            return 5;  // 范围 <= 40，每5个显示一个
        } else {
            return 10; // 范围 > 40，每10个显示一个
        }
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
            
            // 绘制目标格填充
            ctx.fillStyle = this.colors.target;
            ctx.fillRect(topLeft.x, topLeft.y, width, height);
            
            // 绘制目标格边框
            ctx.strokeStyle = this.colors.targetBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        }
    }
    
    /**
     * 绘制历史使用过的格子
     */
    drawUsedCells() {
        const ctx = this.ctx;
            
        for (const cell of this.usedCells) {
            const key = `${cell.x},${cell.y}`;
            const topLeft = this.mathToCanvas(cell.x, cell.y + 1);
            const bottomRight = this.mathToCanvas(cell.x + 1, cell.y);
                
            const width = bottomRight.x - topLeft.x;
            const height = bottomRight.y - topLeft.y;
                
            // 直接绘制灰色，不使用动画
            ctx.fillStyle = 'rgba(100, 100, 100, 0.25)';
            ctx.fillRect(topLeft.x, topLeft.y, width, height);
                
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(topLeft.x, topLeft.y, width, height);
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
        if (this.isCampaignFixedRange) {
            return { min: -this.fixedCampaignRange, max: this.fixedCampaignRange };
        }
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
