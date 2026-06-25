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
            numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'π', 'e', 'i'],
            basicOperators: ['+', '-', '*', '/'],
            operators: ['.', '^', '!', '(', ')'],
            functions: ['sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log']
        };
        
        // 检查函数复杂度评估器是否已加载
        this.hasEvaluator = (typeof evaluate === 'function');
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
     * 计算阶乘（使用伽马函数扩展到实数域）
     * 对于正整数: n! = n * (n-1) * ... * 1
     * 对于实数: n! = Γ(n+1)，其中 Γ 是伽马函数
     * @param {number} n - 实数（负整数除外）
     * @returns {number} 阶乘结果
     */
    factorial(n) {
        // 负整数无定义
        if (n < 0 && Number.isInteger(n)) return NaN;
        
        // 0! = 1, 1! = 1
        if (n === 0 || n === 1) return 1;
        
        // 对于正整数，使用直接计算
        if (n > 0 && Number.isInteger(n) && n <= 170) {
            let result = 1;
            for (let i = 2; i <= n; i++) {
                result *= i;
            }
            return result;
        }
        
        // 对于实数，使用伽马函数: n! = Γ(n+1)
        return this.gamma(n + 1);
    }
    
    /**
     * 伽马函数（Lanczos近似算法）
     * 用于计算实数的阶乘: Γ(z) = (z-1)!
     * @param {number} z - 实数（负整数除外）
     * @returns {number} 伽马函数值
     */
    gamma(z) {
        // 负整数无定义
        if (z <= 0 && Number.isInteger(z)) return NaN;
        
        // 使用Lanczos近似算法
        const p = [
            676.5203681218851,
            -1259.1392167224028,
            771.32342877765313,
            -176.61502916214059,
            12.507343278686905,
            -0.13857109526572012,
            9.9843695780195716e-6,
            1.5056327351493116e-7
        ];
        
        // 反射公式处理 z < 0.5 的情况
        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
        }
        
        z -= 1;
        let x = 0.99999999999980993;
        for (let i = 0; i < p.length; i++) {
            x += p[i] / (z + i + 1);
        }
        
        const t = z + p.length - 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }
    
    /**
     * 处理函数的括号省略形式
     * 如 ln x -> ln(x), log 10 -> log(10), sin x -> sin(x)
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertFunctionWithoutParen(expression) {
        let converted = expression;
        
        // 处理 ln 后跟变量、数字、常数、括号表达式或函数
        // 模式1: ln x -> ln(x), ln sin -> ln(sin)
        // 注意：这里匹配单个字母变量（如x）或多字母标识符（如sin）
        // 支持空格或没有空格的情况（如 lnx 或 ln x）
        converted = converted.replace(/\bln\s*([a-zA-Zπe](?:\w*))/gi, 'ln($1)');
        
        // 模式2: ln 数字 -> ln(数字)
        converted = converted.replace(/\bln\s+(\d+(?:\.\d+)?)/gi, 'ln($1)');
        
        // 模式3: ln (表达式) -> ln((表达式)) 或保持 ln(表达式)
        // 先处理 ln ( -> ln(
        converted = converted.replace(/\bln\s*\(/gi, 'ln(');
        
        // 模式4: ln π -> ln(π)
        converted = converted.replace(/\bln\s*π/gi, 'ln(π)');
        
        // 模式5: ln e -> ln(e)
        converted = converted.replace(/\bln\s+e\b/gi, 'ln(e)');
        
        // 处理 log 的类似形式
        // 模式1: log x -> log(x)
        // 支持空格或没有空格的情况（如 logx 或 log x）
        converted = converted.replace(/\blog\s*([a-zA-Zπe]\w*)/gi, 'log($1)');
        
        // 模式2: log 数字 -> log(数字)
        converted = converted.replace(/\blog\s+(\d+(?:\.\d+)?)/gi, 'log($1)');
        
        // 模式3: log (表达式) -> log((表达式)) 或保持 log(表达式)
        converted = converted.replace(/\blog\s*\(/gi, 'log(');
        
        // 模式4: log π -> log(π)
        converted = converted.replace(/\blog\s*π/gi, 'log(π)');
        
        // 模式5: log e -> log(e)
        converted = converted.replace(/\blog\s+e\b/gi, 'log(e)');
        
        // 处理 sin, cos, tan, abs, exp, sqrt 的括号省略形式
        // 如 sin x -> sin(x), cos x -> cos(x)
        const trigFuncs = ['sin', 'cos', 'tan', 'abs', 'exp', 'sqrt'];
        
        for (const func of trigFuncs) {
            // 模式1: func x -> func(x)，支持空格或无空格
            const funcVarPattern = new RegExp(`\\b${func}\\s*([a-zA-Zπe](?:\\w*))`, 'gi');
            converted = converted.replace(funcVarPattern, `${func}($1)`);
            
            // 模式2: func 数字 -> func(数字)
            const funcNumPattern = new RegExp(`\\b${func}\\s+(\\d+(?:\\.\\d+)?)`, 'gi');
            converted = converted.replace(funcNumPattern, `${func}($1)`);
            
            // 模式3: func (表达式) -> func(
            const funcParenPattern = new RegExp(`\\b${func}\\s*\\(`, 'gi');
            converted = converted.replace(funcParenPattern, `${func}(`);
            
            // 模式4: func π -> func(π)
            const funcPiPattern = new RegExp(`\\b${func}\\s*π`, 'gi');
            converted = converted.replace(funcPiPattern, `${func}(π)`);
            
            // 模式5: func e -> func(e)
            const funcEPattern = new RegExp(`\\b${func}\\s+e\\b`, 'gi');
            converted = converted.replace(funcEPattern, `${func}(e)`);
        }
        
        return converted;
    }
    
    /**
     * 处理使用虚数单位 i 的欧拉公式
     * e^(i*θ) = cos(θ) + i*sin(θ)
     * 当结果为实数时返回实数部分
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertComplexEuler(expression) {
        let converted = expression;
        
        // 模式1: e^(i*π) 或 e^(i*PI) - 结果为 -1
        const pattern1 = /e\^\(\s*i\s*\*\s*(?:PI|π)\s*\)/gi;
        converted = converted.replace(pattern1, '(-1)');
        
        // 模式2: e^(π*i) 或 e^(PI*i) - 结果为 -1
        const pattern2 = /e\^\(\s*(?:PI|π)\s*\*\s*i\s*\)/gi;
        converted = converted.replace(pattern2, '(-1)');
        
        // 模式1b: e^(iπ) 或 e^(iPI) - 隐式乘法，结果为 -1
        const pattern1b = /e\^\(\s*i(?:PI|π)\s*\)/gi;
        converted = converted.replace(pattern1b, '(-1)');
        
        // 模式2b: e^(πi) 或 e^(PIi) - 隐式乘法，结果为 -1
        const pattern2b = /e\^\(\s*(?:PI|π)i\s*\)/gi;
        converted = converted.replace(pattern2b, '(-1)');
        
        // 模式3: e^(i*n*π) = cos(n*π) = (-1)^n
        const pattern3 = /e\^\(\s*i\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*(?:PI|π)\s*\)/gi;
        const pattern4 = /e\^\(\s*(\d+(?:\.\d+)?)\s*\*\s*i\s*\*\s*(?:PI|π)\s*\)/gi;
        const pattern5 = /e\^\(\s*(\d+(?:\.\d+)?)\s*\*\s*(?:PI|π)\s*\*\s*i\s*\)/gi;
        const pattern6 = /e\^\(\s*i\s*\*\s*(?:PI|π)\s*\*\s*(\d+(?:\.\d+)?)\s*\)/gi;
        const pattern7 = /e\^\(\s*(?:PI|π)\s*\*\s*i\s*\*\s*(\d+(?:\.\d+)?)\s*\)/gi;
        const pattern8 = /e\^\(\s*(?:PI|π)\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*i\s*\)/gi;
        
        const handleComplexEuler = (match, n) => {
            const num = parseFloat(n);
            if (Number.isInteger(num)) {
                // e^(i*n*π) = cos(n*π) = (-1)^n
                return num % 2 === 0 ? '1' : '(-1)';
            }
            // 非整数情况返回实数部分
            return `cos(${n}*PI)`;
        };
        
        converted = converted.replace(pattern3, handleComplexEuler);
        converted = converted.replace(pattern4, handleComplexEuler);
        converted = converted.replace(pattern5, handleComplexEuler);
        converted = converted.replace(pattern6, handleComplexEuler);
        converted = converted.replace(pattern7, handleComplexEuler);
        converted = converted.replace(pattern8, handleComplexEuler);
        
        // 使用 exp 函数的形式
        const pattern9 = /exp\(\s*i\s*\*\s*(?:PI|π)\s*\)/gi;
        const pattern10 = /exp\(\s*(?:PI|π)\s*\*\s*i\s*\)/gi;
        converted = converted.replace(pattern9, '(-1)');
        converted = converted.replace(pattern10, '(-1)');
        
        return converted;
    }
    
    /**
     * 处理虚数单位的运算
     * i^2 = -1, i*i = -1, i^3 = -i, i^4 = 1
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertImaginaryOperations(expression) {
        let converted = expression;
        
        // i^2 -> (-1)
        converted = converted.replace(/i\^\s*2/g, '(-1)');
        converted = converted.replace(/i\*\*\s*2/g, '(-1)');
        
        // i*i -> (-1)
        converted = converted.replace(/i\s*\*\s*i/g, '(-1)');
        
        // i^3 -> (-1)*i 或 -i
        converted = converted.replace(/i\^\s*3/g, '((-1)*i)');
        converted = converted.replace(/i\*\*\s*3/g, '((-1)*i)');
        
        // i^4 -> 1
        converted = converted.replace(/i\^\s*4/g, '1');
        converted = converted.replace(/i\*\*\s*4/g, '1');
        
        return converted;
    }
    
    /**
     * 检测并转换欧拉公式形式（使用 (-1)^(1/2) 表示虚数单位）
     * e^(i*θ) = cos(θ) + i*sin(θ)，其中 i = (-1)^(1/2)
     * 当结果为实数时（如 e^(i*π) = -1），返回实数部分
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertEulerFormula(expression) {
        let converted = expression;
        
        // 标准化输入：将全角括号转换为半角，pie转换为π
        converted = converted.replace(/（/g, '(').replace(/）/g, ')');
        converted = converted.replace(/pie/gi, 'π');
        
        // 匹配 e^((-1)^(1/2)*π) 或 e^(π*(-1)^(1/2)) 等形式
        // 即 e^(i*π) 形式，其中 i = (-1)^(1/2)
        
        // 模式1: e^((-1)^(1/2)*π) - 标准形式
        const eulerPattern1 = /e\^\(\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\*\s*(?:PI|π)\s*\)/gi;
        
        // 模式2: e^(π*(-1)^(1/2)) - 交换顺序
        const eulerPattern2 = /e\^\(\s*(?:PI|π)\s*\*\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\)/gi;
        
        // 模式3: exp((-1)^(1/2)*π) - 使用exp函数
        const eulerPattern3 = /exp\(\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\*\s*(?:PI|π)\s*\)/gi;
        
        // 模式4: exp(π*(-1)^(1/2)) - 使用exp函数交换顺序
        const eulerPattern4 = /exp\(\s*(?:PI|π)\s*\*\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\)/gi;
        
        // 替换为 -1（因为 e^(i*π) = cos(π) + i*sin(π) = -1 + 0i = -1）
        converted = converted.replace(eulerPattern1, '(-1)');
        converted = converted.replace(eulerPattern2, '(-1)');
        converted = converted.replace(eulerPattern3, '(-1)');
        converted = converted.replace(eulerPattern4, '(-1)');
        
        // 模式5: e^((-1)^(0.5)*π) - 使用0.5而不是1/2
        const eulerPattern5 = /e\^\(\s*\(\s*-1\s*\)\^\s*0\.5\s*\*\s*(?:PI|π)\s*\)/gi;
        const eulerPattern6 = /e\^\(\s*(?:PI|π)\s*\*\s*\(\s*-1\s*\)\^\s*0\.5\s*\)/gi;
        converted = converted.replace(eulerPattern5, '(-1)');
        converted = converted.replace(eulerPattern6, '(-1)');
        
        // 更通用的模式：e^(i*n*π) = cos(n*π) = (-1)^n
        // 匹配 e^((-1)^(1/2)*n*π) 或 e^(n*(-1)^(1/2)*π) 等形式
        const generalPattern1 = /e\^\(\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*(?:PI|π)\s*\)/gi;
        const generalPattern2 = /e\^\(\s*(\d+(?:\.\d+)?)\s*\*\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\*\s*(?:PI|π)\s*\)/gi;
        const generalPattern3 = /e\^\(\s*(\d+(?:\.\d+)?)\s*\*\s*(?:PI|π)\s*\*\s*\(\s*-1\s*\)\^\s*\(?\s*(?:1\s*\/\s*2|0\.5)\s*\)?\s*\)/gi;
        
        const handleGeneralEuler = (match, n) => {
            const num = parseFloat(n);
            if (Number.isInteger(num)) {
                // e^(i*n*π) = cos(n*π) = (-1)^n
                return num % 2 === 0 ? '1' : '(-1)';
            }
            // 非整数情况：e^(i*n*π) = cos(n*π) + i*sin(n*π)，返回实数部分
            return `cos(${n}*PI)`;
        };
        
        converted = converted.replace(generalPattern1, handleGeneralEuler);
        converted = converted.replace(generalPattern2, handleGeneralEuler);
        converted = converted.replace(generalPattern3, handleGeneralEuler);
        
        return converted;
    }
    
    /**
     * 将表达式中的阶乘符号转换为函数调用
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertFactorial(expression) {
        let converted = expression;
        
        // 处理数字多阶乘: 5!!! -> factorial(factorial(factorial(5)))
        converted = converted.replace(/(\d+)(!+)/g, (match, num, facts) => {
            const count = facts.length;
            let result = num;
            for (let i = 0; i < count; i++) {
                result = `factorial(${result})`;
            }
            return result;
        });
        
        // 处理变量多阶乘: x!!! -> factorial(factorial(factorial(x)))
        converted = converted.replace(/(x)(!+)/gi, (match, variable, facts) => {
            const count = facts.length;
            let result = variable;
            for (let i = 0; i < count; i++) {
                result = `factorial(${result})`;
            }
            return result;
        });
        
        // 处理括号阶乘: (expression)! -> factorial(expression)
        // 使用智能方法：从内到外逐层处理，支持嵌套和多阶乘
        let prev;
        let maxIterations = 20; // 增加迭代次数以支持多阶乘
        let iterations = 0;
        
        do {
            prev = converted;
            iterations++;
            
            // 方法1: 匹配简单括号 + 多阶乘 \([^()]*\)!+
            converted = converted.replace(/(\([^()]*\))(!+)/g, (match, expr, facts) => {
                const count = facts.length;
                let result = expr;
                for (let i = 0; i < count; i++) {
                    result = `factorial(${result})`;
                }
                return result;
            });
            
            // 方法2: 匹配包含factorial的括号 + 多阶乘
            if (converted === prev) {
                converted = converted.replace(/(\(factorial\([^)]*\)\))(!+)/g, (match, expr, facts) => {
                    const count = facts.length;
                    let result = expr;
                    for (let i = 0; i < count; i++) {
                        result = `factorial(${result})`;
                    }
                    return result;
                });
            }
            
            // 方法3: 匹配包含任意嵌套括号的复杂表达式 + 多阶乘
            if (converted === prev) {
                converted = converted.replace(/(\((?:[^()]*|\([^()]*\))*\))(!+)/g, (match, expr, facts) => {
                    const count = facts.length;
                    let result = expr;
                    for (let i = 0; i < count; i++) {
                        result = `factorial(${result})`;
                    }
                    return result;
                });
            }
            
        } while (converted !== prev && iterations < maxIterations);
        
        return converted;
    }
    
    /**
     * 将表达式转换为 math.js 兼容格式
     * @param {string} expression - 原始表达式
     * @returns {string} 转换后的表达式
     */
    convertToMathJS(expression) {
        let converted = expression;
        
        // 先处理阶乘（在替换其他符号之前）
        converted = this.convertFactorial(converted);
        
        // 检测并处理欧拉公式形式：e^((-1)^(1/2)*π) 或 e^(π*(-1)^(1/2))
        // 这需要在替换 π 和 ^ 之前进行，以匹配原始表达式模式
        converted = this.convertEulerFormula(converted);
        
        // 替换 π 为 PI
        converted = converted.replace(/π/g, 'PI');
        
        // 处理虚数单位 i 在欧拉公式中的使用
        // 将 e^(i*π) 形式转换为欧拉公式处理
        converted = this.convertComplexEuler(converted);
        
        // 替换 ^ 为 **
        converted = converted.replace(/\^/g, '**');
        
        // 确保乘法显式表示
        
        // 【核心逻辑】处理隐式乘法的高优先级问题：
        // 在数学中，2x 或 2(x) 的优先级高于除法。
        // 例如：1/2x 应被解析为 1/(2*x) 而不是 (1/2)*x。
        // 实现方法：当遇到 "数字/数字变量" 或 "数字/数字(" 时，将除号后面的部分用括号括起来。
        
        // 模式1: /数字x -> /(数字*x)
        // 注意：只匹配除法后面紧跟数字和字母的情况，避免误转换 x/2 这种合法表达式
        converted = converted.replace(/(?<=[^a-zA-Z])\/(\d+)([a-zA-Z])/g, '/($1*$2)');
        
        // 模式2: /数字( -> /(数字*(...))
        // 这是一个简化的处理，匹配 /数字( 并在对应的右括号后闭合
        let prev;
        do {
            prev = converted;
            converted = converted.replace(/\/(\d+)\(([^()]+)\)/g, '/($1*($2))');
        } while (converted !== prev);
        
        // 处理常规的数字与x之间缺少乘号的情况，如 2x -> 2*x
        converted = converted.replace(/(\d)(x)/gi, '$1*$2');
        
        // 处理数字与π/e之间缺少乘号的情况，如 2π -> 2*PI
        converted = converted.replace(/(\d)(PI)/g, '$1*$2');
        // 注意：只在e后面不是字母时才匹配，避免把exp中的e当作常数
        converted = converted.replace(/(\d)(e)(?![a-zA-Z])/g, '$1*$2');
        
        // 处理π/e与数字之间缺少乘号的情况，如 π2 -> PI*2
        converted = converted.replace(/(PI)(\d)/g, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(e)(\d)(?![a-zA-Z])/g, '$1*$2');
        
        // 处理x与π/e之间缺少乘号的情况，如 xπ -> x*PI
        converted = converted.replace(/(x)(PI)/gi, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(x)(e)(?![a-zA-Z])/gi, '$1*$2');
        
        // 处理π/e与x之间缺少乘号的情况，如 πx -> PI*x
        converted = converted.replace(/(PI)(x)/gi, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(e)(x)(?![a-zA-Z])/gi, '$1*$2');
        
        // 处理i与π/e之间缺少乘号的情况，如 iπ -> i*PI
        converted = converted.replace(/(i)(PI)/gi, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(i)(e)(?![a-zA-Z])/gi, '$1*$2');
        
        // 处理π/e与i之间缺少乘号的情况，如 πi -> PI*i
        converted = converted.replace(/(PI)(i)/gi, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(e)(i)(?![a-zA-Z])/gi, '$1*$2');
        
        // 处理i与x之间缺少乘号的情况，如 ix -> i*x
        converted = converted.replace(/(i)(x)/gi, '$1*$2');
        converted = converted.replace(/(x)(i)/gi, '$1*$2');
        
        // 处理i与数字之间缺少乘号的情况，如 i2 -> i*2, 2i -> 2*i
        converted = converted.replace(/(i)(\d)/gi, '$1*$2');
        converted = converted.replace(/(\d)(i)/g, '$1*$2');
        
        // 处理i与括号之间缺少乘号的情况，如 i(x) -> i*(x)
        converted = converted.replace(/(i)(\()/g, '$1*$2');
        converted = converted.replace(/(\))(i)/g, '$1*$2');
        
        // 处理 i*i 和 i^2 的情况（i^2 = -1）
        // 需要在替换 ^ 为 ** 之前处理
        converted = this.convertImaginaryOperations(converted);
        
        // 处理数字与括号之间缺少乘号的情况，如 2(x) -> 2*(x)
        converted = converted.replace(/(\d)(\()/g, '$1*$2');
        
        // 处理 x 与数字之间缺少乘号的情况，如 x2 -> x*2
        converted = converted.replace(/(x)(\d)/gi, '$1*$2');
        
        // 处理括号与括号之间缺少乘号的情况，如 )( -> )*(
        converted = converted.replace(/(\))(\()/g, '$1*$2');
        
        // 处理函数的括号省略形式，如 ln x -> ln(x), sin x -> sin(x)
        // 需要在处理其他隐式乘法之前执行，以确保正确识别
        converted = this.convertFunctionWithoutParen(converted);
        
        // 处理 x 与函数之间缺少乘号的情况，如 xsin -> x*sin
        for (const func of this.functions) {
            converted = converted.replace(new RegExp(`(x)(${func})`, 'gi'), '$1*$2');
            // 注意：这里不处理 func(x) 的情况，因为已经在 convertFunctionWithoutParen 中处理了
            // 避免重复添加括号导致 ln(x) 变成 ln((x))
        }
        
        // 处理 π/e 与函数之间缺少乘号的情况，如 πsin -> PI*sin
        for (const func of this.functions) {
            converted = converted.replace(new RegExp(`(PI)(${func})`, 'gi'), '$1*$2');
            converted = converted.replace(new RegExp(`(e)(${func})`, 'gi'), '$1*$2');
        }
        
        // 处理 i 与函数之间缺少乘号的情况，如 isin -> i*sin
        for (const func of this.functions) {
            converted = converted.replace(new RegExp(`(i)(${func})`, 'gi'), '$1*$2');
        }
        
        // 处理 π 与 e 之间缺少乘号的情况，如 πe -> PI*e
        converted = converted.replace(/(PI)(e)/gi, '$1*$2');
        converted = converted.replace(/(e)(PI)/gi, '$1*$2');
        
        // 处理 π/e 与括号之间缺少乘号的情况，如 π(x) -> PI*(x)
        converted = converted.replace(/(PI)(\()/g, '$1*$2');
        // 注意：只在e后面不是字母时才匹配
        converted = converted.replace(/(e)(\()(?![a-zA-Z])/g, '$1*$2');
        
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
            
            // 定义阶乘函数
            const factorial = (n) => this.factorial(n);
            
            // 创建函数
            const func = new Function('x', `
                // 伽马函数（Lanczos近似）
                const gamma = (z) => {
                    if (z <= 0 && Number.isInteger(z)) return NaN;
                    const p = [
                        676.5203681218851,
                        -1259.1392167224028,
                        771.32342877765313,
                        -176.61502916214059,
                        12.507343278686905,
                        -0.13857109526572012,
                        9.9843695780195716e-6,
                        1.5056327351493116e-7
                    ];
                    if (z < 0.5) {
                        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
                    }
                    z -= 1;
                    let x = 0.99999999999980993;
                    for (let i = 0; i < p.length; i++) {
                        x += p[i] / (z + i + 1);
                    }
                    const t = z + p.length - 0.5;
                    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
                };
                
                // 阶乘函数（使用伽马函数扩展到实数域）
                const factorial = (n) => {
                    if (n < 0 && Number.isInteger(n)) return NaN;
                    if (n === 0 || n === 1) return 1;
                    if (n > 0 && Number.isInteger(n) && n <= 170) {
                        let result = 1;
                        for (let i = 2; i <= n; i++) result *= i;
                        return result;
                    }
                    return gamma(n + 1);
                };
                
                // 对数函数
                const ln = (x) => Math.log(x);           // 自然对数（以e为底）
                const log = (x) => Math.log(x) / Math.LN10; // 常用对数（以10为底）
                
                // 虚数单位 i（当表达式中包含未转换的 i 时使用）
                const i = Math.sqrt(-1) || NaN;
                
                // 自然常数 e
                const e = Math.E;
                
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
        
        // 检查函数是否带括号
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        const functionNames = ['sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log'];
        
        for (const func of functionNames) {
            // 查找函数名
            let pos = cleanExpr.indexOf(func);
            while (pos !== -1) {
                // 检查函数名后面是否跟着 (
                const afterFunc = cleanExpr.substring(pos + func.length);
                if (!afterFunc.startsWith('(')) {
                    return { valid: false, error: `函数 ${func} 必须带括号，例如 ${func}(x)` };
                }
                // 继续查找下一个
                pos = cleanExpr.indexOf(func, pos + func.length);
            }
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
        
        // 尝试计算几个测试点（常值函数也允许）
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
     * 临时方案：统一+1分
     * @param {string} expression - 函数表达式
     * @returns {Object} {type: string, score: number}
     */
    /**
     * 为复杂度评估器预处理表达式：补全隐式乘号，转换符号
     * 保持数学表示法（^而非**），输出评估器可解析的格式
     */
    prepareForEvaluator(expression) {
        let expr = expression;
        
        // 符号替换：用括号包裹确保隔离
        expr = expr.replace(/π/g, '(pi)');
        expr = this.convertFactorial(expr);
        
        // 已知函数名（长的排前，避免正则部分匹配）
        const funcNames = 'sinh|cosh|tanh|asin|acos|atan|sqrt|sin|cos|tan|abs|exp|log|sec|csc|cot|ln';
        
        // 1. 数字/字母/) 后跟函数名: 2sin( -> 2*sin(, xsin( -> x*sin(, )sin( -> )*sin(
        expr = expr.replace(new RegExp(`([0-9a-zA-Z\\)])(?=${funcNames})`, 'gi'), '$1*');
        
        // 2. 数字后跟字母: 2x -> 2*x, 2pi -> 2*pi
        expr = expr.replace(/(\d)([a-zA-Z])/g, '$1*$2');
        
        // 3. 数字后跟(: 2( -> 2*(
        expr = expr.replace(/(\d)(\()/g, '$1*$2');
        
        // 4. )后跟(: )( -> )*(
        expr = expr.replace(/(\))(\()/g, '$1*$2');
        
        // 5. )后跟字母或数字: )x -> )*x, )2 -> )*2
        expr = expr.replace(/(\))([a-zA-Z0-9])/g, '$1*$2');
        
        // 6. 变量/pi后跟(（但不是函数调用）: x( -> x*(, pi( -> pi*(
        const protectedParts = [];
        let temp = expr.replace(new RegExp(`(${funcNames}|factorial)\\(`, 'gi'), (match) => {
            const idx = protectedParts.length;
            protectedParts.push(match);
            return `\x00F${idx}\x00`;
        });
        temp = temp.replace(/([a-zA-Z])(\()/g, '$1*$2');
        temp = temp.replace(/\x00F(\d+)\x00/g, (_, idx) => protectedParts[parseInt(idx)]);
        expr = temp;
        
        return expr;
    }
    
    analyzeFunctionType(expression) {
        // 使用新的函数复杂度评估器 (evaluator.js)
        if (this.hasEvaluator) {
            try {
                const prepared = this.prepareForEvaluator(expression);
                const result = evaluate(prepared);
                // result: { simplified, C_structure, C_diversity, C_penalty, C_final, Score }
                // Score 范围 [1, 7]
                const score = result.Score;
                
                let type;
                if (score <= 1) {
                    type = 'degree_1';
                } else if (score <= 2) {
                    type = 'degree_2';
                } else if (score <= 3) {
                    type = 'degree_3';
                } else {
                    type = 'high_degree';
                }
                
                return { type, score };
            } catch (e) {
                console.warn('[WARN] 复杂度评估失败:', e.message);
            }
        }
        
        // 降级方案：如果评估器未加载或评估失败
        console.warn('[WARN] 函数复杂度评估器未加载，使用临时方案');
        return { type: 'degree_1', score: 1 };
    }
    
    /**
     * 计算多项式的最高次数
     * @param {string} expression - 多项式表达式
     * @returns {number} 最高次数
     */
    getPolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        
        // 如果包含非多项式函数，返回特殊标记
        const nonPolyPattern = /(sin|cos|tan|exp|ln|log|sqrt|abs)/;
        if (nonPolyPattern.test(cleanExpr)) {
            return -1; // 表示非多项式
        }
        
        // 如果包含阶乘，返回特殊标记
        if (cleanExpr.includes('!')) {
            return -1; // 表示非多项式
        }
        
        // 如果包含欧拉公式形式（虚数单位），返回特殊标记
        if (cleanExpr.includes('(-1)^(1/2)') || cleanExpr.includes('(-1)^0.5') || cleanExpr.includes('i')) {
            return -1; // 表示非多项式（复数运算）
        }
        
        let maxDegree = 0;
        
        // 匹配复合多项式形式 (表达式)^n，如 (x+1)^2, (2x-3)^3
        // 这种形式展开后次数为 n * (内部表达式的最高次数)
        const compositePattern = /\(([^()]+)\)\^(\d+)/g;
        let match;
        while ((match = compositePattern.exec(cleanExpr)) !== null) {
            const innerExpr = match[1];
            const outerPower = parseInt(match[2]);
            // 递归计算内部表达式的次数
            const innerDegree = this.getSimplePolynomialDegree(innerExpr);
            if (innerDegree > 0) {
                const totalDegree = innerDegree * outerPower;
                if (totalDegree > maxDegree) {
                    maxDegree = totalDegree;
                }
            }
        }
        
        // 匹配 x^n 模式（如 x^2, x^3），但排除系数为0的情况
        // 模式：可选的系数（数字或小数）*x^n
        // 使用 (^|[^\d.]) 来匹配开头或非数字非小数点字符，避免使用负向回顾后发
        const caretPattern = /(?:^|[^\d.])([\d.]+)?\*?x\^(\d+)/g;
        while ((match = caretPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            const degree = parseInt(match[2]);
            // 只考虑非零系数
            if (coefficient !== 0 && degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 匹配 x**n 模式（math.js转换后的格式）
        const powerPattern = /(?:^|[^\d.])([\d.]+)?\*?x\*\*(\d+)/g;
        while ((match = powerPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            const degree = parseInt(match[2]);
            // 只考虑非零系数
            if (coefficient !== 0 && degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 检查单独的 x（次数为1），但排除系数为0的情况
        // 匹配 x 后面不是 ^ 或数字的情况
        const xPattern = /(?:^|[^\d.])([\d.]+)?\*?x(?![\^\d*])/g;
        while ((match = xPattern.exec(cleanExpr)) !== null) {
            const coefficient = match[1] ? parseFloat(match[1]) : 1;
            // 只考虑非零系数
            if (coefficient !== 0 && maxDegree < 1) {
                maxDegree = 1;
            }
        }
        
        // 特殊情况：如果表达式只是 "x"
        if (cleanExpr === 'x' && maxDegree < 1) {
            maxDegree = 1;
        }
        
        return maxDegree;
    }
    
    /**
     * 提取分子的次数
     * @param {string} expression - 已清理的表达式（小写，无空格）
     * @returns {number} 分子的次数
     */
    getNumeratorDegree(expression) {
        // 找到第一个除号的位置
        const slashIndex = expression.indexOf('/');
        if (slashIndex === -1) return 0;
        
        // 提取分子部分（除号前面的所有内容）
        const numerator = expression.substring(0, slashIndex);
        
        // 计算分子的次数
        return this.getPolynomialDegree(numerator);
    }
    
    /**
     * 提取分母的次数
     * @param {string} expression - 已清理的表达式（小写，无空格）
     * @returns {number} 分母的次数
     */
    getDenominatorDegree(expression) {
        // 找到第一个除号的位置
        const slashIndex = expression.indexOf('/');
        if (slashIndex === -1) return 0;
        
        // 提取分母部分（除号后面的所有内容）
        let denominator = expression.substring(slashIndex + 1);
        
        // 如果分母以括号开头，提取完整的括号内容
        if (denominator.startsWith('(')) {
            denominator = this.extractParenthesesContent(denominator);
        }
        
        // 检查分母是否有幂次 ^n 或 **n
        const powerMatch = denominator.match(/\^\s*(\d+)$/);
        const powerMatch2 = denominator.match(/\*\*\s*(\d+)$/);
        
        if (powerMatch || powerMatch2) {
            const power = parseInt((powerMatch || powerMatch2)[1]);
            // 去掉幂次部分，计算基础表达式的次数
            const baseExpr = denominator.replace(/[\^\*]+\s*\d+$/, '');
            const baseDegree = this.getPolynomialDegree(baseExpr);
            return baseDegree > 0 ? baseDegree * power : power;
        }
        
        // 没有幂次，直接计算分母的次数
        return this.getPolynomialDegree(denominator);
    }
    
    /**
     * 提取括号内容（支持嵌套括号）
     * @param {string} str - 以 '(' 开头的字符串
     * @returns {string} 括号内的内容
     */
    extractParenthesesContent(str) {
        if (!str.startsWith('(')) return str;
        
        let depth = 0;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '(') depth++;
            else if (str[i] === ')') {
                depth--;
                if (depth === 0) {
                    return str.substring(0, i + 1);
                }
            }
        }
        return str;
    }
    
    /**
     * 计算简单多项式表达式的最高次数（用于复合多项式内部）
     * @param {string} expression - 简单多项式表达式（不含括号）
     * @returns {number} 最高次数
     */
    getSimplePolynomialDegree(expression) {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        
        let maxDegree = 0;
        
        // 匹配 x^n 模式
        const caretPattern = /x\^(\d+)/g;
        let match;
        while ((match = caretPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 匹配 x**n 模式
        const powerPattern = /x\*\*(\d+)/g;
        while ((match = powerPattern.exec(cleanExpr)) !== null) {
            const degree = parseInt(match[1]);
            if (degree > maxDegree) {
                maxDegree = degree;
            }
        }
        
        // 检查是否有单独的 x
        if (cleanExpr.includes('x') && maxDegree < 1) {
            maxDegree = 1;
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
    
    /**
     * 测试欧拉公式转换
     * 用于验证 e^(i*π) = -1 的正确性
     * @returns {Object} 测试结果
     */
    testEulerFormula() {
        const testCases = [
            // 使用 (-1)^(1/2) 表示虚数单位
            { expr: 'e^((-1)^(1/2)*π)', expected: -1 },
            { expr: 'e^(π*(-1)^(1/2))', expected: -1 },
            { expr: 'exp((-1)^0.5*π)', expected: -1 },
            { expr: 'e^((-1)^(1/2)*2*π)', expected: 1 },  // e^(i*2π) = 1
            // 使用 i 表示虚数单位（显式乘法）
            { expr: 'e^(i*π)', expected: -1 },
            { expr: 'e^(π*i)', expected: -1 },
            { expr: 'exp(i*π)', expected: -1 },
            { expr: 'e^(i*2*π)', expected: 1 },  // e^(i*2π) = 1
            { expr: 'e^(2*i*π)', expected: 1 },  // e^(2iπ) = 1
            // 使用 i 表示虚数单位（隐式乘法）
            { expr: 'e^(iπ)', expected: -1 },    // iπ = i*π
            { expr: 'e^(πi)', expected: -1 },    // πi = π*i
        ];
        
        const results = [];
        for (const test of testCases) {
            const converted = this.convertToMathJS(test.expr);
            const result = this.evaluate(test.expr, 0);
            results.push({
                expression: test.expr,
                converted: converted,
                result: result,
                expected: test.expected,
                passed: Math.abs(result - test.expected) < 1e-10
            });
        }
        
        return results;
    }
    
    /**
     * 测试 ln 和 log 的括号省略功能
     * @returns {Object} 测试结果
     */
    testLogWithoutParen() {
        const testCases = [
            // 带括号的标准形式
            { expr: 'ln(e)', expected: 1 },
            { expr: 'ln(1)', expected: 0 },
            { expr: 'log(10)', expected: 1 },
            { expr: 'log(100)', expected: 2 },
            // 省略括号的形式
            { expr: 'ln e', expected: 1 },
            { expr: 'ln x', x: 1, expected: 0 },
            { expr: 'log 10', expected: 1 },
            { expr: 'log 100', expected: 2 },
            { expr: 'ln π', expected: Math.log(Math.PI) },
            { expr: 'log π', expected: Math.log(Math.PI) / Math.LN10 },
            // sin, cos, tan 等函数的括号省略
            { expr: 'sin x', x: 0, expected: 0 },
            { expr: 'cos x', x: 0, expected: 1 },
            { expr: 'tan x', x: 0, expected: 0 },
            { expr: 'sin π', expected: Math.sin(Math.PI) },
            { expr: 'cos π', expected: Math.cos(Math.PI) },
            { expr: 'abs x', x: -5, expected: 5 },
            { expr: 'exp x', x: 0, expected: 1 },
            { expr: 'sqrt x', x: 4, expected: 2 },
            // e^x 和 π^x 形式的指数函数
            { expr: 'e^x', x: 0, expected: 1 },
            { expr: 'e^x', x: 1, expected: Math.E },
            { expr: 'π^x', x: 0, expected: 1 },
            { expr: 'π^x', x: 1, expected: Math.PI },
            { expr: 'e^(2*x)', x: 1, expected: Math.E * Math.E },
        ];
        
        const results = [];
        for (const test of testCases) {
            const converted = this.convertToMathJS(test.expr);
            const x = test.x !== undefined ? test.x : 1;
            const result = this.evaluate(test.expr, x);
            results.push({
                expression: test.expr,
                converted: converted,
                result: result,
                expected: test.expected,
                passed: Math.abs(result - test.expected) < 1e-10
            });
        }
        
        return results;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunctionParser;
}
