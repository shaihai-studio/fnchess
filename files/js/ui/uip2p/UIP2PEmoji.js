/**
 * UIP2PEmoji —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * Summa 表情面板：UI/切换/发送/展示/连播/隐藏
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

UIController.prototype._ensureSummaEmojiUI = function() {
    const panel = document.getElementById('summa-emoji-panel');
    const fab = document.getElementById('emoji-fab-btn');
    if (!panel || panel.dataset.summaBuilt) return;
    panel.dataset.summaBuilt = '1';
    const moods = ['neutral', 'thinking', 'smug', 'happy', 'surprised', 'sad', 'angry', 'determined', 'exhausted'];
    moods.forEach(mood => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'summa-emoji-item';
        cell.title = mood;
        const img = document.createElement('img');
        img.src = `files/Summa形象处理/summa_image/${mood}.png`;
        img.alt = mood;
        img.draggable = false;
        cell.appendChild(img);
        cell.addEventListener('click', () => this._sendSummaEmoji(mood));
        panel.appendChild(cell);
    });
    if (fab) fab.addEventListener('click', () => this._toggleSummaEmojiPanel());
    // 点击面板外部区域自动关闭
    document.addEventListener('click', (ev) => {
        const p = document.getElementById('summa-emoji-panel');
        if (!p || p.style.display === 'none') return;
        if (!ev.target.closest('#summa-emoji-panel') && !ev.target.closest('#emoji-fab-btn')) {
            p.style.display = 'none';
        }
    });
};

UIController.prototype._toggleSummaEmojiPanel = function(forceShow) {
    const panel = document.getElementById('summa-emoji-panel');
    if (!panel) return;
    if (window.audioManager) window.audioManager.playClick();
    const show = forceShow !== undefined ? forceShow : (panel.style.display === 'none');
    panel.style.display = show ? 'grid' : 'none';
};

UIController.prototype._sendSummaEmoji = function(mood) {
    // 观战模式：没有 PeerJS 连接，表情走 Lobby WS 发给对战双方与其他观众
    if (this._isSpectating) {
        const lobby = this._lobby;
        if (!lobby || !lobby.isConnected || !this._spectatorCode) return;
        if (this._summaEmojiCooldown) return;
        lobby.sendSpectateEmoji(this._spectatorCode, mood);
        this._showSummaEmoji(mood, false);
        this._summaEmojiCooldown = true;
        const fab = document.getElementById('emoji-fab-btn');
        if (fab) fab.classList.add('emoji-cooldown');
        setTimeout(() => {
            this._summaEmojiCooldown = false;
            if (fab) fab.classList.remove('emoji-cooldown');
        }, 2000);
        this._toggleSummaEmojiPanel(false);
        return;
    }
    const p2p = this.p2pController;
    if (!p2p || !p2p.isConnected) return;
    if (this._summaEmojiCooldown) return;
    p2p.sendSummaEmoji(mood);
    // 本地即时反馈（右侧小图）
    this._showSummaEmoji(mood, false);
    // 冷却 2s：按钮置灰防连点刷屏
    this._summaEmojiCooldown = true;
    const fab = document.getElementById('emoji-fab-btn');
    if (fab) fab.classList.add('emoji-cooldown');
    setTimeout(() => {
        this._summaEmojiCooldown = false;
        if (fab) fab.classList.remove('emoji-cooldown');
    }, 2000);
    this._toggleSummaEmojiPanel(false);
};

UIController.prototype._showSummaEmoji = function(mood, fromOpponent) {
    if (!this._summaEmojiQueue) this._summaEmojiQueue = [];
    this._summaEmojiQueue.push({ mood, fromOpponent });
    // 观战转发：房主开启观战推送时，记录最近一次表情事件，
    // 随下一个观战快照（buildSyncSnapshot）经 Lobby WS 推给观众端展示。
    if (this._spectateSyncTimer && this.p2pController && this.p2pController.isHost) {
        this._spectatePendingEmoji = { mood, fromOpponent };
    }
    this._playNextSummaEmoji();
};

// 队列化播放：收到对手表情（左侧大图）或本地发出反馈（右侧小图），逐个展示
UIController.prototype._playNextSummaEmoji = function() {
    if (this._summaEmojiPlaying) return;
    if (!this._summaEmojiQueue || !this._summaEmojiQueue.length) return;
    const item = this._summaEmojiQueue.shift();
    this._summaEmojiPlaying = true;
    const pop = document.getElementById('summa-emoji-pop');
    const img = document.getElementById('summa-emoji-pop-img');
    if (!pop || !img) { this._summaEmojiPlaying = false; return; }
    const moods = ['neutral', 'thinking', 'smug', 'happy', 'surprised', 'sad', 'angry', 'determined', 'exhausted'];
    const m = moods.indexOf(item.mood) !== -1 ? item.mood : 'neutral';
    img.src = `files/Summa形象处理/summa_image/${m}.png`;
    pop.classList.toggle('pop-left', !!item.fromOpponent);
    pop.classList.toggle('pop-right', !item.fromOpponent);
    pop.style.display = 'block';
    // 重启动画：连续展示时强制重新触发 pop-in
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = '';
    setTimeout(() => {
        pop.style.display = 'none';
        this._summaEmojiPlaying = false;
        this._playNextSummaEmoji();
    }, 2200);
};

// 退出对局/断线清理：隐藏表情入口并清空播放队列
UIController.prototype._hideSummaEmojiUI = function() {
    const fab = document.getElementById('emoji-fab-btn');
    const panel = document.getElementById('summa-emoji-panel');
    const pop = document.getElementById('summa-emoji-pop');
    if (fab) { fab.style.display = 'none'; fab.classList.remove('emoji-cooldown'); }
    if (panel) panel.style.display = 'none';
    if (pop) pop.style.display = 'none';
    this._summaEmojiQueue = [];
    this._summaEmojiPlaying = false;
    this._summaEmojiCooldown = false;
};

// _bindP2PDisconnectButtons
