// Auto-split from UIController.js — prototype-attached methods (UINotice)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UINotice] UIController must be loaded before this file');
}

// 服务器通知：本地缓存编号键
const NOTICE_CACHE_KEY = 'function_chess_notice_id';

// 轻量 HTML 转义（版本号/文案插入 innerHTML 前调用，防注入）
function fnNoticeEscHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// _getServerHttpBase — 根据 P2PController.signaling 拼接 http(s)://host[:port] 基地址
    UIController.prototype._getServerHttpBase = function() {
        const sig = (typeof P2PController !== 'undefined' && P2PController.signaling)
            ? P2PController.signaling
            : { host: 'localhost', port: 9000, secure: false };
        const scheme = sig.secure ? 'https' : 'http';
        const portStr = sig.port && sig.port !== 80 && sig.port !== 443 ? ':' + sig.port : '';
        return `${scheme}://${sig.host}${portStr}`;
    }
;

// _getNoticeUrl — 拼接 /notice 的 HTTP 地址
    UIController.prototype._getNoticeUrl = function() {
        return this._getServerHttpBase() + '/notice';
    }
;

// _getVersionUrl — 拼接 /version 的 HTTP 地址
    UIController.prototype._getVersionUrl = function() {
        return this._getServerHttpBase() + '/version';
    }
;

// _compareVersion — 语义化版本比较：a<b 返回 -1，a==b 返回 0，a>b 返回 1
    UIController.prototype._compareVersion = function(a, b) {
        const pa = String(a || '').trim().split('.').map((n) => parseInt(n, 10) || 0);
        const pb = String(b || '').trim().split('.').map((n) => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    }
;

// initNotice — 绑定通知弹窗 + 版本弹窗「知道了」按钮（启动时调用一次）
    UIController.prototype.initNotice = function() {
        const bind = (modalId, btnId) => {
            const modal = document.getElementById(modalId);
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    if (window.audioManager && window.audioManager.playClick) window.audioManager.playClick();
                    if (modal) this.hideModal(modal);
                });
            }
        };
        bind('notice-modal', 'notice-confirm-btn');
        bind('version-modal', 'version-confirm-btn');
    }
;

// checkNotice — 拉取服务器通知，编号与本地缓存不同则弹窗并缓存新编号
    UIController.prototype.checkNotice = function() {
        const self = this;
        let url;
        try { url = this._getNoticeUrl(); } catch (e) { return; }

        const show = (notice) => {
            if (!notice || notice.id == null) return;
            const noticeId = String(notice.id);
            let cachedId = null;
            try { cachedId = localStorage.getItem(NOTICE_CACHE_KEY); } catch (e) { /* 忽略 */ }
            // 编号相同 → 已看过，不重复弹出
            if (cachedId === noticeId) return;
            // 缓存新编号（打开即缓存，避免每次启动重复弹）
            try { localStorage.setItem(NOTICE_CACHE_KEY, noticeId); } catch (e) { /* 忽略 */ }

            const titleEl = document.getElementById('notice-title');
            const contentEl = document.getElementById('notice-content');
            if (titleEl) titleEl.textContent = String(notice.title || '通知');
            if (contentEl) contentEl.textContent = String(notice.content || '');
            const modal = document.getElementById('notice-modal');
            if (modal) {
                this.showModal(modal);
                // 通知需覆盖在首屏 splash（z-index 99999）之上
                modal.style.zIndex = '100000';
            }
        };

        fetch(url, { method: 'GET', cache: 'no-store' })
            .then((res) => {
                if (!res.ok) throw new Error('notice http ' + res.status);
                return res.json();
            })
            .then((notice) => show(notice))
            .catch((e) => {
                // 服务器未启动 / 网络失败 / 跨域失败 → 静默降级，不阻塞进入游戏
                console.warn('[Notice] 通知获取失败（忽略）:', (e && e.message) || e);
            });
    }
;

// checkVersion — 拉取服务器版本，本地版本更小则每次启动都弹「发现新版本」提示
    UIController.prototype.checkVersion = function() {
        const local = (typeof window !== 'undefined' && window.GAME_VERSION) ? String(window.GAME_VERSION) : '';
        if (!local) return;
        let url;
        try { url = this._getVersionUrl(); } catch (e) { return; }

        fetch(url, { method: 'GET', cache: 'no-store' })
            .then((res) => {
                if (!res.ok) throw new Error('version http ' + res.status);
                return res.json();
            })
            .then((data) => {
                const remote = (data && data.version) ? String(data.version) : '';
                if (!remote) return;
                // 本地版本 < 服务器版本 → 提示有新版本（不缓存，每次启动都提示）
                if (this._compareVersion(local, remote) >= 0) return;

                const titleEl = document.getElementById('version-title');
                const contentEl = document.getElementById('version-content');
                if (titleEl) titleEl.textContent = '发现新版本';
                if (contentEl) {
                    const escLocal = fnNoticeEscHtml(local);
                    const escRemote = fnNoticeEscHtml(remote);
                    const linkStyle = 'color:#4ea1ff;word-break:break-all;text-decoration:underline;';
                    contentEl.innerHTML =
                        `当前版本：${escLocal}<br>` +
                        `最新版本：${escRemote}<br><br>` +
                        `新版本已发布，请访问以下链接了解详情：<br>` +
                        `<a href="https://space.bilibili.com/3690976753223882" target="_blank" rel="noopener noreferrer" style="${linkStyle}">https://space.bilibili.com/3690976753223882</a><br>` +
                        `<a href="https://shaihai.cn" target="_blank" rel="noopener noreferrer" style="${linkStyle}">shaihai.cn</a>`;
                }
                const modal = document.getElementById('version-modal');
                if (modal) {
                    this.showModal(modal);
                    modal.style.zIndex = '100000';
                }
            })
            .catch((e) => {
                console.warn('[Version] 版本检查失败（忽略）:', (e && e.message) || e);
            });
    }
;
