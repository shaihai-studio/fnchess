/**
 * 函数棋 - Function Chess
 * Copyright (C) 2024 shaihai-studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class AIExpressionHandler {
    constructor(ai) { this.ai = ai; }

    async submitExpression(expression) {
        console.log('[AI] 准备提交表达式:', expression);

        // 验证表达式不为空
        if (!expression || expression.trim() === '') {
            console.error('[AI] 表达式为空！');
            expression = 'x';
        }

        if (!this.ai.uiController) {
            console.error('[AI] 没有 UIController 引用！');
            this.ai.gameController.submitFunction(expression);
            return;
        }

        console.log('[AI] 通过 UIController 提交，逐个元素显示');

        // 将表达式拆分为元素
        const tokens = this.ai.tokenizeExpression(expression);

        // 先清空输入框，防止上一回合残留内容
        this.ai.uiController.expressionElements = [];
        this.ai.uiController.cursorIndex = 0;
        this.ai.uiController.updateExpressionDisplay();

        /*
        // 在 UI 测试泡泡上显示调试信息（推演了多少次）
        if (window.summaCharacter && this.ai.lastThinkCount) {
            window.summaCharacter.messageBox.textContent = `[深度演算了 ${this.ai.lastThinkCount} 次]`;
            window.summaCharacter.messageBox.classList.add('visible');
        }
        */

        // 逐个添加元素，模拟思考过程
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // 添加当前元素
            this.ai.uiController.expressionElements.push(token);
            this.ai.uiController.cursorIndex = this.ai.uiController.expressionElements.length;
            this.ai.uiController.updateExpressionDisplay();

            console.log(`[AI] 输入元素 ${i + 1}/${tokens.length}: ${token}`);

            // 每个元素之间延迟，体现思考过程
            const delay = 200 + Math.random() * 300; // 200-500ms
            await this.ai.think(delay);
        }

        console.log('[AI] 表达式输入完成，等待确认...');

        // 输入完成后稍微等待，然后提交
        await this.ai.think(500);

        // 通过UIController提交
        await this.ai.uiController.submitFunction();
    }

    tokenizeExpression(expr) {
        const tokens = [];
        let i = 0;
        const len = expr.length;

        // 多字母函数名列表
        const multiCharFuncs = ['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'abs', 'exp', 'ln', 'log', 'sqrt'];

        while (i < len) {
            let matched = false;

            // 尝试匹配多字母函数
            for (const func of multiCharFuncs) {
                if (expr.substring(i, i + func.length) === func) {
                    tokens.push(func);
                    i += func.length;
                    matched = true;
                    break;
                }
            }

            if (matched) continue;

            // 匹配单个字符（变量、数字、运算符、括号等）
            tokens.push(expr[i]);
            i++;
        }

        return tokens;
    }

    normalizeExpressionInput(expression) {
        if (!expression) return '';
        return String(expression)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/\bxx\b/g, 'x*x')
            .replace(/\[(.*?)\]/g, '($1)');
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AIExpressionHandler;