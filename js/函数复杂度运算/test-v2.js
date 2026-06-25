// 测试新算法 V2
const FunctionComplexityAnalyzer = require('./function-complexity-analyzer');

const analyzer = new FunctionComplexityAnalyzer();

const testCases = [
    // 基础规则
    { expr: 'x', expected: 1, desc: 'x → 1' },
    { expr: '5', expected: 0, desc: '常数 5 → 0' },
    { expr: 'e', expected: 0, desc: 'e → 0' },
    { expr: 'pi', expected: 0, desc: 'pi → 0' },
    
    // 三角函数和嵌套函数：1 + y(内部)
    { expr: 'sin(x)', expected: 2, desc: 'sin(x) → 1+1=2' },
    { expr: 'cos(x)', expected: 2, desc: 'cos(x) → 1+1=2' },
    { expr: 'tan(x)', expected: 2, desc: 'tan(x) → 1+1=2' },
    { expr: 'sin(x^2)', expected: 3, desc: 'sin(x^2) → 1+2=3（^返回2）' },
    { expr: 'cos(sin(x))', expected: 3, desc: 'cos(sin(x)) → 1+2=3' },
    { expr: 'x!', expected: 2, desc: 'x! → 1+1=2' },
    { expr: 'sin(x)!', expected: 3, desc: 'sin(x)! → 1+2=3' },
    
    // 乘法：y(f) + y(g)
    { expr: 'x*x', expected: 2, desc: 'x*x → 1+1=2' },
    { expr: 'sin(x)*sin(x)', expected: 4, desc: 'sin(x)*sin(x) → 2+2=4' },
    { expr: 'x*sin(x)', expected: 3, desc: 'x*sin(x) → 1+2=3' },
    
    // 加法：max(y(f), y(g))
    { expr: 'x+x', expected: 1, desc: 'x+x → max(1,1)=1' },
    { expr: 'x^2+x', expected: 2, desc: 'x^2+x → max(2,1)=2（^返回2）' },
    { expr: 'sin(x)+cos(x)', expected: 2, desc: 'sin(x)+cos(x) → max(2,2)=2' },
    
    // 未说明的运算符（^, /）→ 2
    { expr: 'x^2', expected: 2, desc: 'x^2 → 2（^返回2）' },
    { expr: 'x^4', expected: 2, desc: 'x^4 → 2（^返回2）' },
    { expr: 'x/2', expected: 2, desc: 'x/2 → 2（/返回2）' },
    { expr: 'x^4/1145-4.5', expected: 2, desc: 'x^4/1145-4.5 → max(2,0)=2' },
    
    // 常值函数
    { expr: 'sin(0)', expected: 0, desc: 'sin(0) → 0（不含x）' },
    { expr: 'cos(pi)', expected: 0, desc: 'cos(pi) → 0（不含x）' },
    { expr: '5!', expected: 0, desc: '5! → 0（不含x）' },
    
    // 复杂组合
    { expr: 'x^2+sin(x)', expected: 2, desc: 'x^2+sin(x) → max(2,2)=2' },
    { expr: 'x*sin(x)+cos(x)', expected: 3, desc: 'x*sin(x)+cos(x) → max(3,2)=3' },
];

console.log('=== 测试新算法 V2 ===\n');

let passed = 0;
let failed = 0;
const failedTests = [];

testCases.forEach((test, index) => {
    const result = analyzer.analyze(test.expr);
    const isPass = result === test.expected;
    
    if (isPass) {
        passed++;
        console.log(`✓ 测试 ${index + 1}: ${test.desc}`);
        console.log(`  ${test.expr} = ${result}`);
    } else {
        failed++;
        failedTests.push({ ...test, actual: result });
        console.log(`✗ 测试 ${index + 1}: ${test.desc}`);
        console.log(`  ${test.expr}`);
        console.log(`  期望: ${test.expected}, 实际: ${result}`);
    }
    console.log();
});

console.log('=== 测试总结 ===');
console.log(`总计: ${testCases.length} 个测试`);
console.log(`通过: ${passed} ✓`);
console.log(`失败: ${failed} ✗`);
console.log(`通过率: ${((passed / testCases.length) * 100).toFixed(2)}%`);

if (failed > 0) {
    console.log('\n=== 失败的测试详情 ===');
    failedTests.forEach((test, index) => {
        console.log(`${index + 1}. ${test.desc}`);
        console.log(`   表达式: ${test.expr}`);
        console.log(`   期望: ${test.expected}, 实际: ${test.actual}`);
        console.log();
    });
}
