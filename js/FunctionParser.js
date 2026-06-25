/**
 * FunctionParser 模块
 * 负责解析函数表达式，计算函数值
 * 支持：多项式、abs、sin/cos/tan、1/x、exp
 */
class FunctionParser {
    constructor() {
        // 支持的运算符和函数
        this.operators = ['+', '-', '*', '/', '^'];
        this.functions = ['sin', 'cos', 'tan', 'abs', 'exp', 'log', 'sqrt'];
        this.constants = ['pi', 'e'];
        
        // 锁定元素列表
        this.lockedElements = [];
        
        // 元素分类（用于构建拖拽元素）
        this.elementCategories = {
            variable: ['x'],
            numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            operators: ['+', '-', '*', '/', '^', '(', ')'],
            functions: ['sin', 'cos', 'tan', 'abs', 'exp']
        };
    }
    
    /**
     * 设置锁定元素
     * @param {Array} elements - 被锁定的元素数组
     */
    setLockedElements(elements) {
        this.lockedElements = [...elements];
    }
    
    /**
     * 清除锁定元素
     */
    clearLockedElements() {
        this.lockedElements = [];
    }
    
    /**
     * 检查元素是否被锁定
     * @param {string} element - 元素
     * @returns {boolean}
     */
    isElementLocked(element) {
        return this.lockedElements.includes(element);
    }
    
    /**
     * 验证表达式是否包含被锁定的元素
     * @param {string} expression - 函数表达式
     * @returns {Object} {valid: boolean, lockedElement: string|null}
     */
    validateExpressionForLocks(expression) {
        // 移除空格
        const cleanExpr = expression.replace(/\s/g, '');
        
        // 检查每个锁定元素
        for (const locked of this.lockedElements) {
            // 创建正则表达式来匹配完整的元素（不是子串）
            const pattern = new RegExp(`(^|[^a-zA-Z0-9])${locked}([^a-zA-Z0-9]|$)`);
            if (pattern.test(cleanExpr) || cleanExpr.includes(locked)) {
                // 更精确的检查
                if (this.containsElement(cleanExpr, locked)) {
                    return { valid: false, lockedElement: locked };
                }
            }
        }
        
        return { valid: true, lockedElement: null };
    }
    
    /**
     * 检查表达式是否包含特定元素
     * @param {string} expression - 表达式
     * @param {string} element - 要检查的元素
     * @returns {boolean}
     */
    containsElement(expression, element) {
        // 特殊处理数字
        if (/^\d+$/.test(element)) {
            return expression.includes(element);
        }
        
        // 处理函数和变量
        const regex = new RegExp(`\\b${element}\\b`, 'i');
        return regex.test(expression);
    }
    
    /**
     * 将表达式转换为 math.js 兼容格式
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertToMathJS(expression) {
        let converted = expression;
        
        // 替换 ^ 为 **
        converted = converted.replace(/\^/g, '**');
        
        // 确保乘法显式表示
        // 处理数字与x之间缺少乘号的情况，如 2x -> 2*x
        converted = converted.replace(/(\d)(x)/gi, '$1*$2');
        
        // 处理数字与括号之间缺少乘号的情况，如 2(x) -> 2*(x)
        converted = converted.replace(/(\d)(\()/g, '$1*$2');
        
        // 处理 x 与数字之间缺少乘号的情况，如 x2 -> x*2
        converted = converted.replace(/(x)(\d)/gi, '$1*$2');
        
        // 处理括号与括号之间缺少乘号的情况，如 )( -> )*(
        converted = converted.replace(/(\))(\()/g, '$1*$2');
        
        // 处理 x 与函数之间缺少乘号的情况，如 xsin -> x*sin
        for (const func of this.functions) {
            converted = converted.replace(new RegExp(`(x)(${func})`, 'gi'), '$1*$2');
            converted = converted.replace(new RegExp(`(${func})(x)`, 'gi'), '$1($2)');
        }
        
        return converted;
    }
    
    /**
     * 计算函数在指定点的值
     * @param {string} expression - 函数表达式
     * @param {number} x - x 值
     * @returns {number|null} 函数值，如果计算失败返回 null
     */
    evaluate(expression, x) {
        try {
            const converted = this.convertToMathJS(expression);
            
            // 使用 Function 构造函数创建安全的计算环境
            // 定义所有支持的数学函数
            const sin = Math.sin;
            const cos = Math.cos;
            const tan = Math.tan;
            const abs = Math.abs;
            const exp = Math.exp;
            const log = Math.log;
            const sqrt = Math.sqrt;
            const pi = Math.PI;
            const e = Math.E;
            
            // 创建函数
            const func = new Function('x', `
                with (Math) {
                    return ${converted};
                }
            `);
            
            const result = func(x);
            
            // 检查结果是否有效
            if (!isFinite(result) || isNaN(result)) {
                return null;
            }
            
            return result;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 验证表达式语法是否正确
     * @param {string} expression - 函数表达式
     * @returns {Object} {valid: boolean, error: string|null}
     */
    validateSyntax(expression) {
        if (!expression || expression.trim() === '') {
            return { valid: false, error: '表达式不能为空' };
        }
        
        // 检查括号匹配
        let bracketCount = 0;
        for (const char of expression) {
            if (char === '(') bracketCount++;
            if (char === ')') bracketCount--;
            if (bracketCount < 0) {
                return { valid: false, error: '括号不匹配' };
            }
        }
        if (bracketCount !== 0) {
            return { valid: false, error: '括号不匹配' };
        }
        
        // 检查是否包含 x
        if (!expression.toLowerCase().includes('x')) {
            return { valid: false, error: '表达式必须包含变量 x' };
        }
        
        // 尝试计算几个测试点
        const testPoints = [0, 1, -1, 0.5];
        let validCount = 0;
        
        for (const x of testPoints) {
            const result = this.evaluate(expression, x);
            if (result !== null && isFinite(result)) {
                validCount++;
            }
        }
        
        if (validCount === 0) {
            return { valid: false, error: '表达式计算错误，请检查语法' };
        }
        
        return { valid: true, error: null };
    }
    
    /**
     * 分析函数类型并计算得分
     * 新规则：
     * - 常值函数（0次）：+0分
     * - n次方程：+n分（1次+1，2次+2，3次+3）
     * - 4次及以上：统一+4分
     * - abs、sin、cos等函数：统一+2分
     * - 分数如1/x：统一+2分
     * @param {string} expression - 函数表达式
     * @returns {Object} {type: string, score: number}
     */
    analyzeFunctionType(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        console.log(`[DEBUG] analyzeFunctionType: 表达式=${cleanExpr}`);
        
        // 检查是否为常值函数（不含x）
        if (!cleanExpr.includes('x')) {
            console.log(`[DEBUG] analyzeFunctionType: 常值函数，得分=0`);
            return { type: 'constant', score: 0 };
        }
        
        // 检查是否为分数形式（如1/x）
        if (cleanExpr.includes('/x') || cleanExpr.includes('1/x')) {
            console.log(`[DEBUG] analyzeFunctionType: 分数形式，得分=2`);
            return { type: 'fraction', score: 2 };
        }
        
        // 检查是否为特殊函数（abs、sin、cos、tan、exp、log、sqrt）
        const specialFuncs = ['abs', 'sin', 'cos', 'tan', 'exp', 'log', 'sqrt'];
        for (const func of specialFuncs) {
            if (cleanExpr.includes(func)) {
                console.log(`[DEBUG] analyzeFunctionType: 特殊函数${func}，得分=2`);
                return { type: func, score: 2 };
            }
        }
        
        // 分析多项式次数
        const degree = this.getPolynomialDegree(cleanExpr);
        console.log(`[DEBUG] analyzeFunctionType: 多项式次数=${degree}`);
        
        // 根据次数计算得分
        let score;
        if (degree === 0) {
            score = 0;
        } else if (degree >= 4) {
            score = 4;
        } else {
            score = degree;
        }
        console.log(`[DEBUG] analyzeFunctionType: 最终得分=${score}`);
        return { type: `degree_${degree}`, score: score };
    }
    
    /**
     * 计算多项式的最高次数
     * @param {string} expression - 多项式表达式
     * @returns {number} 最高次数
     */
    getPolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        
        // 如果包含非多项式函数，返回特殊标记
        const nonPolyPattern = /(sin|cos|tan|exp|log|sqrt|abs)/;
        if (nonPolyPattern.test(cleanExpr)) {
            return -1; // 表示非多项式
        }
        
        let maxDegree = 0;
        
        // 匹配 x^n 模式（如 x^2, x^3）
        const caretPattern = /x\^(\d+)/g;
        let match;
        while ((match = caretPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 匹配 x**n 模式（math.js转换后的格式）
        const powerPattern = /x\*\*(\d+)/g;
        while ((match = powerPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 检查单独的 x（次数为1）
        // 匹配 x 后面不是 ^ 或数字的情况
        if (/x(?![\^\d])/.test(cleanExpr) || cleanExpr === 'x') {
            if (maxDegree < 1) {
                maxDegree = 1;
            }
        }
        
        return maxDegree;
    }
    
    /**
     * 获取所有可用的拖拽元素
     * @returns {Object} 分类的元素对象
     */
    getAvailableElements() {
        const result = {};
        
        for (const [category, elements] of Object.entries(this.elementCategories)) {
            result[category] = elements.map(el => ({
                value: el,
                locked: this.isElementLocked(el)
            }));
        }
        
        return result;
    }
    
    /**
     * 格式化表达式显示
     * @param {string} expression - 原始表达式
     * @returns {string} 格式化后的表达式
     */
    formatExpression(expression) {
        // 添加空格以提高可读性
        let formatted = expression;
        
        // 在运算符周围添加空格
        formatted = formatted.replace(/([+\-*/^()])/g, ' $1 ');
        
        // 移除多余空格
        formatted = formatted.replace(/\s+/g, ' ').trim();
        
        return formatted;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionParser;
}
