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

        // ── 阶段守卫 ─────────────────────────────────────────────
        // AI 只能在"自己的输入阶段"（input_function 且 AI=B）输入/提交表达式。
        // 若生成表达式过慢导致 INPUT_FUNCTION 超时进入新回合（玩家已在选格子），
        // 继续逐个输入会把 AI 的表达式塞进玩家当前回合的输入框（抢跑 bug）。
        const canSubmit = () => {
            const gc = this.ai && this.ai.gameController;
            return !!(gc && gc.currentPhase === 'input_function' && gc.currentPlayer === 'B');
        };
        const abort = () => {
            const gc = this.ai && this.ai.gameController;
            console.warn(`[AI] 阶段已切换（当前 phase=${gc ? gc.currentPhase : '?'}），放弃输入/提交表达式`);
            // 仅在仍轮到 AI（B）时清空输入框：若阶段已切到玩家（A）回合，
            // 输入框可能已被玩家编辑，无条件清空会误删玩家输入（bug 修复）。
            if (this.ai && this.ai.uiController && gc && gc.currentPlayer === 'B') {
                this.ai.uiController.expressionElements = [];
                this.ai.uiController.cursorIndex = 0;
                this.ai.uiController.updateExpressionDisplay();
            }
        };
        if (!canSubmit()) { abort(); return; }

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

        // 逐个添加元素，模拟思考过程
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // 每步前检查阶段是否仍是 AI 的输入阶段（异步期间可能已超时/被玩家推进）
            if (!canSubmit()) { abort(); return; }

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

        // 提交前最后检查：阶段若已切换则放弃（不能污染玩家回合）
        if (!canSubmit()) { abort(); return; }

        // 通过UIController提交
        await this.ai.uiController.submitFunction();
    }

    tokenizeExpression(expr) {
        // #41 收敛：委托 UIController（最终走 FunctionParser.tokenizeExpression 单一来源），消除与 UIInput 的重复实现
        return this.ai.uiController.tokenizeExpression(expr);
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