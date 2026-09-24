/**
 * UIP2PChat —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 对战聊天框：联机对战（1v1 P2P）与竞速对战（2-4 人）均可使用。
 * - 消息气泡显示区复用 Summa 表情的同区域（底部边角弹出）
 * - 观战者只读，不能发送
 * - 字数限制 40 字 + 冷却间隔（2s），防刷屏卡爆对方
 * - 退出对局/断线时隐藏
 */
(function () {
    if (typeof UIController === 'undefined') {
        console.error('[UIP2PChat] UIController must be loaded before this file');
        return;
    }

    const CHAT_MAX_LEN = 40;      // 单条消息最大字数
    const CHAT_COOLDOWN_MS = 2000; // 发送冷却

    UIController.prototype._initBattleChatUI = function () {
        if (this._battleChatReady) return;
        this._battleChatReady = true;
        this._battleChatCooldown = false;
        this._battleChatMsgCount = 0;

        const box = document.getElementById('battle-chat-box');
        const panel = document.getElementById('battle-chat-input-panel');
        const fab = document.getElementById('chat-fab-btn');
        const input = document.getElementById('battle-chat-input');
        const sendBtn = document.getElementById('battle-chat-send-btn');

        // 聊天按钮：打开/关闭输入面板
        if (fab) fab.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            if (!panel) return;
            const show = panel.style.display === 'none';
            panel.style.display = show ? 'flex' : 'none';
            if (show && input) input.focus();
        });

        // 发送按钮
        if (sendBtn) sendBtn.addEventListener('click', () => this._sendChatText());
        // 回车发送
        if (input) input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this._sendChatText(); }
        });
        // 输入实时长度提示
        if (input) input.addEventListener('input', () => {
            if (input.value.length > CHAT_MAX_LEN) input.value = input.value.slice(0, CHAT_MAX_LEN);
        });
        // 点击面板外部关闭输入
        document.addEventListener('click', (ev) => {
            if (!panel || panel.style.display === 'none') return;
            if (!ev.target.closest('#battle-chat-input-panel') && !ev.target.closest('#chat-fab-btn')) {
                panel.style.display = 'none';
            }
        });
    };

    /** 显示一条聊天消息。fromMe=true 表示本人发送（右侧蓝色气泡），false 为对方（左侧灰色气泡） */
    UIController.prototype._showChatMessage = function (text, fromMe) {
        if (typeof this._initBattleChatUI === 'function') this._initBattleChatUI();
        const box = document.getElementById('battle-chat-box');
        const list = document.getElementById('battle-chat-messages');
        if (!box || !list) return;
        const t = String(text || '').trim();
        if (!t) return;

        const bubble = document.createElement('div');
        bubble.className = 'battle-chat-msg ' + (fromMe ? 'mine' : 'theirs');
        const label = document.createElement('span');
        label.className = 'battle-chat-label';
        label.textContent = fromMe ? '我' : '对手';
        const content = document.createElement('span');
        content.className = 'battle-chat-text';
        content.textContent = t;
        bubble.appendChild(label);
        bubble.appendChild(content);
        list.appendChild(bubble);

        // 仅保留最近 6 条，避免越积越多
        while (list.children.length > 6) list.removeChild(list.firstChild);
        list.scrollTop = list.scrollHeight;

        // 显示消息区，2.5s 后若无新消息则自动隐藏（避免长时间遮挡棋盘）
        box.style.display = 'block';
        this._battleChatMsgCount++;
        const myCount = this._battleChatMsgCount;
        clearTimeout(this._battleChatHideTimer);
        this._battleChatHideTimer = setTimeout(() => {
            if (this._battleChatMsgCount === myCount && box) box.style.display = 'none';
        }, 2500);
        // 观战转发：房主开启观战推送时，记录最近一条聊天消息，
        // 随下一个观战快照（buildSyncSnapshot）经 Lobby WS 推给观众端展示。
        if (this._spectateSyncTimer && this.p2pController && this.p2pController.isHost) {
            this._spectatePendingChat = { text: t, fromMe };
        }
        // 消息到达提示音（与表情包反馈一致，柔和）
        if (window.audioManager) { try { window.audioManager.playTick(); } catch (e) {} }
    };

    /** 发送聊天：观战者不可发；校验字数与冷却 */
    UIController.prototype._sendChatText = function () {
        const input = document.getElementById('battle-chat-input');
        const panel = document.getElementById('battle-chat-input-panel');
        if (!input) return;
        // 观战者只读，不能发送
        if (this._isSpectating) {
            this.showMessage('观战模式不能发送消息', 'warning');
            if (input) input.value = '';
            if (panel) panel.style.display = 'none';
            return;
        }
        // 冷却：防止连点刷屏
        if (this._battleChatCooldown) {
            this.showMessage('发送太快，请稍候再试', 'warning');
            return;
        }
        const text = input.value.trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;

        let sent = false;
        // 竞速对战：走竞速房间（2-4 人广播）
        if (this._rbRoom && this._rbRoom.isConnected) {
            sent = this._rbRoom.sendChat(text);
        }
        // 1v1 联机对战：走 P2P
        else if (this.p2pController && this.p2pController.isConnected && !this._rbMatchStarted) {
            this.p2pController.sendChat(text);
            sent = true;
        }
        if (!sent) {
            this.showMessage('当前无可用连接，无法发送', 'error');
            return;
        }
        // 本地即时显示 + 冷却
        this._showChatMessage(text, true);
        this._battleChatCooldown = true;
        const fab = document.getElementById('chat-fab-btn');
        if (fab) fab.classList.add('chat-cooldown');
        setTimeout(() => {
            this._battleChatCooldown = false;
            if (fab) fab.classList.remove('chat-cooldown');
        }, CHAT_COOLDOWN_MS);
        input.value = '';
        if (panel) panel.style.display = 'none';
    };

    /** 进入对局时显示聊天按钮 */
    UIController.prototype._showBattleChatUI = function () {
        this._initBattleChatUI();
        const fab = document.getElementById('chat-fab-btn');
        if (fab) fab.style.display = '';
    };

    /** 退出对局/断线清理：隐藏聊天入口并清空面板 */
    UIController.prototype._hideBattleChatUI = function () {
        const fab = document.getElementById('chat-fab-btn');
        const box = document.getElementById('battle-chat-box');
        const panel = document.getElementById('battle-chat-input-panel');
        const list = document.getElementById('battle-chat-messages');
        if (fab) { fab.style.display = 'none'; fab.classList.remove('chat-cooldown'); }
        if (box) box.style.display = 'none';
        if (panel) panel.style.display = 'none';
        if (list) list.innerHTML = '';
        this._battleChatCooldown = false;
    };
})();
