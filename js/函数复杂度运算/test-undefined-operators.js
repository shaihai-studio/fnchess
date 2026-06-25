// 测试未说明运算符
const FunctionComplexityAnalyzer = require('./function-complexity-analyzer');

const analyzer = new FunctionComplexityAnalyzer();

const testCases = [
    // 除法 / → 2
    { expr: '1/x', expected: 2, desc: '1/x → 2（/未说明）' },
    { expr: 'x/2', expected: 2, desc: 'x/2 → 2（/未说明）' },
    { expr: 'x^4/1145', expected: 2, desc: 'x^4/1145 → 2（/未说明）' },
    
    // 幂运算 ^ → 2
    { expr: 'x^2', expected: 2, desc: 'x^2 → 2（^未说明）' },
    { expr: 'x^4', expected: 2, desc: 'x^4 → 2（^未说明）' },
    { expr: 'x^0.5', expected: 2, desc: 'x^0.5 → 2（^未说明）' },
    
    // 乘法 * 仍然正常工作
    { expr: 'x*x', expected: 2, desc: 'x*x → 1+1=2' },
    { expr: '2*x', expected: 1, desc: '2*x → 0+1=1' },
    { expr: 'x*sin(x)', expected: 3, desc: 'x*sin(x) → 1+2=3' },
    
    // 加法 + 仍然正常工作
    { expr: 'x+1', expected: 1, desc: 'x+1 → max(1,0)=1' },
    { expr: 'x^2+x', expected: 2, desc: 'x^2+x → max(2,1)=2' },
    
    // 函数仍然正常工作
    { expr: 'sin(x)', expected: 2, desc: 'sin(x) → 1+1=2' },
    { expr: 'cos(x)', expected: 2, desc: 'cos(x) → 1+1=2' },
    { expr: 'x!', expected: 2, desc: 'x! → 1+1=2' },
];

console.log('=== 测试未说明运算符 ===\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
    const result = analyzer.analyze(test.expr);
    const isPass = result === test.expected;
    
    if (isPass) {
        passed++;
        console.log(`✓ 测试 ${index + 1}: ${test.desc}`);
        console.log(`  ${test.expr} = ${result}`);
    } else {
        failed++;
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
