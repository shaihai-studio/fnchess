// 测试 ln x 的转换
const expression = "ln x";

// 模拟 convertLogWithoutParen
let converted = expression;

// 模式1: ln x -> ln(x)
converted = converted.replace(/\bln\s+([a-zA-Zπe](?:\w*))/gi, 'ln($1)');

// 模式2: ln 数字 -> ln(数字)
converted = converted.replace(/\bln\s+(\d+(?:\.\d+)?)/gi, 'ln($1)');

// 模式3: ln (表达式) -> ln(
converted = converted.replace(/\bln\s*\(/gi, 'ln(');

// 模式4: ln π -> ln(π)
converted = converted.replace(/\bln\s*π/gi, 'ln(π)');

// 模式5: ln e -> ln(e)
converted = converted.replace(/\bln\s+e\b/gi, 'ln(e)');

console.log("原始表达式:", expression);
console.log("转换后:", converted);

// 测试计算
try {
    const ln = (x) => Math.log(x);
    const x = 1;
    const result = eval(converted);
    console.log("当 x=1 时, 结果:", result);
} catch (e) {
    console.log("计算错误:", e.message);
}
