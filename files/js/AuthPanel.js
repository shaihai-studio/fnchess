/**
 * AuthPanel - 账号登录/注册 UI 面板
 *
 * 自包含：运行时动态创建 DOM + 挂载事件，不侵入现有 HTML 结构。
 * 依赖：
 *   - AuthService（HTTP API）
 *   - 现有 .modal / .modal-content 样式体系
 *
 * 用法：
 *   AuthPanel.init();           // 初始化（绑定入口按钮）
 *   AuthPanel.open();           // 打开弹窗
 *   AuthPanel.openPanel();      // 打开已登录面板
 */
class AuthPanel {
    static init() {
        const btn = document.getElementById('account-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                if (AuthService.isLoggedIn()) this.openPanel();
                else this.open();
            });
        }
        this._refreshBtn();
    }

    // 更新入口按钮的显示状态（登录/未登录）
    // 开始页按钮为纯图标按钮：登录后显示小绿点 + title 带用户名
    static _refreshBtn() {
        const btn = document.getElementById('account-btn');
        if (!btn) return;
        const logged = AuthService.isLoggedIn();
        const nick = logged ? (AuthService.getUsername() || '账号') : '';
        btn.classList.toggle('logged-in', !!logged);
        const dot = btn.querySelector('.account-btn-dot');
        if (dot) dot.style.display = logged ? '' : 'none';
        btn.title = logged ? '账号（' + nick + '）' : '登录 / 注册';
    }

    // 登录态变化（登录 / 注册 / 登出）后通知 UI 层重连联机连接：
    // MatchLobbyController.connect() 会比对 token 变化并断开旧连接重建，确保服务端按最新身份识别。
    // 仅在未登记房间时重连游戏内大厅，避免登出把正在等待的房间一并注销。
    static _notifyAuthChanged() {
        const ui = (typeof window !== 'undefined') ? window.uiController : null;
        if (!ui) return;
        try {
            if (typeof ui._lwReconnectProbes === 'function') ui._lwReconnectProbes();
        } catch (e) { /* 忽略 */ }
        try {
            if (ui._lobby && typeof ui._lobby.connect === 'function' && !ui._lobby.myRoomCode) {
                ui._lobby.connect();
            }
        } catch (e) { /* 忽略 */ }
    }

    static _destroyModal(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    /**
     * 需登录守卫（方案A：不强制登录也能玩，但排行榜/联机等联网功能必须登录）。
     * 未登录 → 提示并打开登录框，登录成功后执行 callback；已登录 → 直接执行 callback。
     * @param {Function} callback 登录成功后的回调
     */
    static requireLogin(callback) {
        const isLogged = !!(window.AuthService && window.AuthService.isLoggedIn());
        if (isLogged) {
            if (typeof callback === 'function') callback();
            return;
        }
        // 挂起登录成功后的继续回调
        this.onLoginSuccess = () => {
            if (typeof callback === 'function') callback();
        };
        this.open();
        // 提示"需登录"
        const msg = document.getElementById('auth-msg');
        if (msg) {
            msg.style.display = 'block';
            msg.textContent = '该功能需要登录账号后才能使用';
            msg.className = 'auth-msg auth-msg-err';
        }
        if (window.audioManager) { try { window.audioManager.playClick(); } catch (e) {} }
    }

    // ── 打开登录/注册/重置密码弹窗（mode: 'login' | 'register' | 'reset'） ──
    static open(mode) {
        this._destroyModal('auth-modal');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'auth-modal';
        modal.style.display = 'flex';
        // ★ 关键修复：主菜单 start-modal 通过 showModal 拿到动态 z-index(10000+)，
        // 本面板是直接创建 .modal（CSS 默认 z-index 1000），会被 start-page 全屏遮罩盖住导致"点按钮没反应"。
        // 必须显式设置足够高的 z-index（参考 notice/version 弹窗的 100000）。
        modal.style.zIndex = '100000';
        modal.innerHTML = `
            <div class="modal-content auth-panel-content">
                <!-- 右上角：左箭头返回（关闭弹窗） -->
                <button class="auth-back" id="auth-close" type="button" title="返回" aria-label="返回">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                </button>

                <h2 id="auth-title">登录账号</h2>
                <p class="auth-subtitle">登录后可跨设备同步进度，并保护你的排行身份</p>

                <div id="auth-form">
                    <label class="auth-label">用户名</label>
                    <input class="auth-input" id="auth-username" type="text" autocomplete="username" maxlength="20"
                           placeholder="2~20 位字母/数字/下划线/中文">
                    <label class="auth-label">密码</label>
                    <input class="auth-input" id="auth-password" type="password" autocomplete="current-password"
                           maxlength="32" placeholder="6~32 位">
                    <!-- 注册模式：可选密保（用于忘记密码自助重置） -->
                    <div id="auth-secret-wrap" style="display:none;">
                        <label class="auth-label">密保问题（可选，忘记密码时用）</label>
                        <input class="auth-input" id="auth-secret-question" type="text" maxlength="30"
                               placeholder="例如：我最喜欢的函数是？">
                        <label class="auth-label">密保答案</label>
                        <input class="auth-input" id="auth-secret-answer" type="text" maxlength="50"
                               placeholder="2~50 字，不区分大小写">
                    </div>
                    <div class="auth-msg" id="auth-msg" style="display:none;"></div>
                    <button class="auth-btn" id="auth-submit" type="button">登录</button>
                </div>

                <!-- 忘记密码：自助重置（密保答案 / 同设备快捷重置） -->
                <div id="auth-reset" style="display:none;">
                    <label class="auth-label">用户名</label>
                    <input class="auth-input" id="reset-username" type="text" autocomplete="username" maxlength="20"
                           placeholder="请输入要重置密码的账号用户名">
                    <div id="reset-q-wrap" style="display:none;">
                        <label class="auth-label">密保问题</label>
                        <div class="auth-subtitle" id="reset-question" style="margin:4px 0 8px;"></div>
                        <label class="auth-label">密保答案</label>
                        <input class="auth-input" id="reset-answer" type="text" maxlength="50" placeholder="不区分大小写">
                    </div>
                    <div id="reset-newpwd-wrap" style="display:none;">
                        <label class="auth-label">新密码</label>
                        <input class="auth-input" id="reset-newpwd" type="password" maxlength="32" placeholder="6~32 位">
                    </div>
                    <div class="auth-msg" id="reset-msg" style="display:none;"></div>
                    <button class="auth-btn" id="reset-next" type="button">下一步</button>
                </div>

                <div class="auth-toggle-row">
                    <span id="auth-toggle-label">还没有账号？</span>
                    <button class="auth-link" id="auth-toggle" type="button">注册</button>
                    <button class="auth-link" id="auth-forgot" type="button" style="margin-left:auto;">忘记密码？</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const state = { mode: (mode === 'register' || mode === 'reset') ? mode : 'login', resetStep: 0, resetUsername: '' };
        const title = document.getElementById('auth-title');
        const submit = document.getElementById('auth-submit');
        const toggleLabel = document.getElementById('auth-toggle-label');
        const toggle = document.getElementById('auth-toggle');
        const forgot = document.getElementById('auth-forgot');
        const msg = document.getElementById('auth-msg');
        const username = document.getElementById('auth-username');
        const password = document.getElementById('auth-password');
        const secretWrap = document.getElementById('auth-secret-wrap');
        const secretQuestion = document.getElementById('auth-secret-question');
        const secretAnswer = document.getElementById('auth-secret-answer');
        const formEl = document.getElementById('auth-form');
        const resetEl = document.getElementById('auth-reset');
        const resetMsg = document.getElementById('reset-msg');
        const resetUsername = document.getElementById('reset-username');
        const resetQWrap = document.getElementById('reset-q-wrap');
        const resetQuestion = document.getElementById('reset-question');
        const resetAnswer = document.getElementById('reset-answer');
        const resetNewPwdWrap = document.getElementById('reset-newpwd-wrap');
        const resetNewPwd = document.getElementById('reset-newpwd');
        const resetNext = document.getElementById('reset-next');

        const showMsg = (text, ok) => {
            msg.style.display = 'block';
            msg.textContent = text;
            msg.className = 'auth-msg' + (ok ? ' auth-msg-ok' : ' auth-msg-err');
        };
        const showResetMsg = (text, ok) => {
            resetMsg.style.display = 'block';
            resetMsg.textContent = text;
            resetMsg.className = 'auth-msg' + (ok ? ' auth-msg-ok' : ' auth-msg-err');
        };

        const renderMode = () => {
            const isLogin = state.mode === 'login';
            const isRegister = state.mode === 'register';
            const isReset = state.mode === 'reset';
            formEl.style.display = (isLogin || isRegister) ? '' : 'none';
            resetEl.style.display = isReset ? '' : 'none';
            secretWrap.style.display = isRegister ? '' : 'none';
            if (isLogin) {
                title.textContent = '登录账号';
                submit.textContent = '登录';
                toggleLabel.textContent = '还没有账号？';
                toggle.textContent = '注册';
                if (forgot) forgot.style.display = '';
                password.setAttribute('autocomplete', 'current-password');
            } else if (isRegister) {
                title.textContent = '注册账号';
                submit.textContent = '注册';
                toggleLabel.textContent = '已有账号？';
                toggle.textContent = '登录';
                if (forgot) forgot.style.display = 'none';
                password.setAttribute('autocomplete', 'new-password');
            } else {
                title.textContent = '重置密码';
                toggleLabel.textContent = '想起密码了？';
                toggle.textContent = '返回登录';
                if (forgot) forgot.style.display = 'none';
                resetUsername.readOnly = state.resetStep >= 1;
                resetQWrap.style.display = state.resetStep === 1 ? '' : 'none';
                resetNewPwdWrap.style.display = state.resetStep >= 1 ? '' : 'none';
                resetNext.textContent = state.resetStep === 0 ? '下一步'
                    : (state.resetStep === 2 ? '本机重置密码' : '重置密码');
            }
        };

        const doSubmit = async () => {
            const u = username.value.trim();
            const p = password.value;
            if (!u) return showMsg('请输入用户名', false);
            if (!p) return showMsg('请输入密码', false);
            const isLogin = state.mode === 'login';
            submit.disabled = true;
            submit.textContent = '处理中…';
            try {
                let res;
                if (isLogin) res = await AuthService.login({ username: u, password: p });
                else res = await AuthService.register({
                    username: u, password: p,
                    secretQuestion: secretQuestion ? secretQuestion.value.trim() : '',
                    secretAnswer: secretAnswer ? secretAnswer.value.trim() : ''
                });
                if (res.ok) {
                    showMsg(isLogin ? '登录成功！' : '注册成功！', true);
                    // 拉取账号档案（含 hasSecurityQuestion），供账号面板展示密保状态
                    AuthService.fetchMe().catch(() => {});
                    // 登录/注册成功后触发进度对账（阶段2 双保险）：把本地进度推上服务器 / 拉回账号历史进度
                    if (window.ProgressSync) {
                        ProgressSync.reconcile().catch(() => {});
                    }
                    setTimeout(() => {
                        this._destroyModal('auth-modal');
                        this._refreshBtn();
                        // 登录态变化 → 让大厅/速览探针按新 token 重连（否则旧连接仍被视为未登录）
                        AuthPanel._notifyAuthChanged();
                        // 强制登录模式：登录成功后执行挂起的回调（如"进入主菜单"）
                        if (typeof AuthPanel.onLoginSuccess === 'function') {
                            const cb = AuthPanel.onLoginSuccess;
                            AuthPanel.onLoginSuccess = null;
                            cb();
                        }
                    }, 600);
                } else {
                    // 网络错误 / 无有效响应（非 JSON）→ 明确提示离线或无法连接，避免模糊的"操作失败"
                    if (res.code === 'network_error' || (!res.code && res.msg === '无法连接服务器')) {
                        showMsg('无法连接服务器，当前可能处于离线状态。注册/登录需要联网，请检查网络后重试', false);
                    } else {
                        showMsg(res.msg || this._codeText(res.code), false);
                    }
                }
            } finally {
                submit.disabled = false;
                submit.textContent = isLogin ? '登录' : '注册';
            }
        };

        // 忘记密码：step0 输入用户名 → 查密保；step1 密保答案+新密码；step2 同设备快捷重置
        const doResetNext = async () => {
            if (state.resetStep === 0) {
                const u = resetUsername.value.trim();
                if (!u) return showResetMsg('请输入用户名', false);
                resetNext.disabled = true;
                resetNext.textContent = '查询中…';
                try {
                    const res = await AuthService.resetQuestion(u);
                    if (!res.ok) { showResetMsg(res.msg || this._codeText(res.code), false); return; }
                    state.resetUsername = u;
                    if (res.question) {
                        state.resetStep = 1;
                        resetQuestion.textContent = res.question;
                        showResetMsg('请填写密保答案与新密码', true);
                    } else if (res.uuidResetAvailable) {
                        state.resetStep = 2;
                        showResetMsg('该账号未设置密保，但本机是账号绑定设备，可直接重置密码', true);
                    } else {
                        showResetMsg('该账号未设置密保且非绑定设备，无法自助重置，请联系管理员', false);
                    }
                    if (state.resetStep >= 1) renderMode();
                } finally {
                    resetNext.disabled = false;
                    if (state.resetStep === 0) resetNext.textContent = '下一步';
                }
                return;
            }
            const newPwd = resetNewPwd.value;
            if (!newPwd || newPwd.length < 6 || newPwd.length > 32) {
                return showResetMsg('新密码长度需为 6~32 位', false);
            }
            resetNext.disabled = true;
            resetNext.textContent = '处理中…';
            try {
                let res;
                if (state.resetStep === 2) {
                    res = await AuthService.resetByUuid(state.resetUsername, newPwd);
                } else {
                    const answer = resetAnswer.value.trim();
                    if (!answer) { showResetMsg('请填写密保答案', false); return; }
                    const v = await AuthService.resetVerify(state.resetUsername, answer);
                    if (!v.ok) { showResetMsg(v.msg || this._codeText(v.code), false); return; }
                    res = await AuthService.resetCommit(state.resetUsername, v.resetToken, newPwd);
                }
                if (res.ok) {
                    showResetMsg('密码已重置，请用新密码登录', true);
                    setTimeout(() => {
                        this._destroyModal('auth-modal');
                        this.open('login');
                    }, 900);
                } else {
                    showResetMsg(res.msg || this._codeText(res.code), false);
                }
            } finally {
                resetNext.disabled = false;
                resetNext.textContent = state.resetStep === 2 ? '本机重置密码' : '重置密码';
            }
        };

        toggle.addEventListener('click', () => {
            if (state.mode === 'reset') {
                state.mode = 'login';
                state.resetStep = 0;
            } else {
                state.mode = state.mode === 'login' ? 'register' : 'login';
            }
            msg.style.display = 'none';
            renderMode();
        });
        submit.addEventListener('click', doSubmit);
        if (forgot) forgot.addEventListener('click', () => {
            state.mode = 'reset';
            state.resetStep = 0;
            resetUsername.value = username.value.trim();
            resetUsername.readOnly = false;
            resetNewPwd.value = '';
            resetAnswer.value = '';
            resetMsg.style.display = 'none';
            renderMode();
            resetUsername.focus();
        });
        resetNext.addEventListener('click', doResetNext);
        resetUsername.addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetNext(); });
        document.getElementById('auth-close').addEventListener('click', () => this._destroyModal('auth-modal'));
        password.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
        // 点击遮罩关闭
        modal.addEventListener('mousedown', (e) => { if (e.target === modal) this._destroyModal('auth-modal'); });
        renderMode();
        if (state.mode === 'register') { password.focus(); }
        else if (state.mode === 'reset') { resetUsername.focus(); }
        else { username.focus(); }
    }

    // ── 打开已登录面板 ──
    static openPanel() {
        const u = AuthService.getUser();
        if (!u) return this.open();
        this._destroyModal('auth-panel-modal');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'auth-panel-modal';
        modal.style.display = 'flex';
        // 同 open()：直接创建的 .modal 需显式抬高 z-index，否则被 start-modal 全屏遮罩盖住。
        modal.style.zIndex = '100000';
        modal.innerHTML = `
            <div class="modal-content auth-panel-content">
                <!-- 右上角：左箭头返回（关闭弹窗） -->
                <button class="auth-back" id="ap-close" type="button" title="返回" aria-label="返回">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                </button>

                <h2>账号信息</h2>
                <div class="auth-info-row"><span>用户名</span><b id="ap-username"></b></div>
                <div class="auth-info-row"><span>ID</span><b id="ap-id"></b></div>

                <div class="auth-section-title">修改密码</div>
                <label class="auth-label">原密码</label>
                <input class="auth-input" id="ap-oldpwd" type="password" maxlength="32">
                <label class="auth-label">新密码</label>
                <input class="auth-input" id="ap-newpwd" type="password" maxlength="32">
                <button class="auth-btn" id="ap-pwd-btn" type="button">修改密码</button>

                <div class="auth-section-title">密保问题（忘记密码时用）</div>
                <label class="auth-label">问题</label>
                <input class="auth-input" id="ap-sec-question" type="text" maxlength="30"
                       placeholder="例如：我最喜欢的函数是？（留空并保存 = 清除密保）">
                <label class="auth-label">答案</label>
                <input class="auth-input" id="ap-sec-answer" type="text" maxlength="50" placeholder="2~50 字，不区分大小写">
                <button class="auth-btn" id="ap-sec-btn" type="button">保存密保</button>

                <div class="auth-msg" id="ap-msg" style="display:none;"></div>
                <div class="auth-logout-row">
                    <button class="auth-link auth-link-danger" id="ap-logout" type="button">退出登录</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('ap-username').textContent = u.username || '';
        document.getElementById('ap-id').textContent = String(u.userId || '');

        const msg = document.getElementById('ap-msg');
        const showMsg = (text, ok) => {
            msg.style.display = 'block';
            msg.textContent = text;
            msg.className = 'auth-msg' + (ok ? ' auth-msg-ok' : ' auth-msg-err');
        };

        document.getElementById('ap-pwd-btn').addEventListener('click', async () => {
            const o = document.getElementById('ap-oldpwd').value;
            const n = document.getElementById('ap-newpwd').value;
            if (!o || !n) return showMsg('请填写原密码和新密码', false);
            const btn = document.getElementById('ap-pwd-btn');
            btn.disabled = true;
            try {
                const res = await AuthService.updatePassword(o, n);
                if (res.ok) showMsg('密码已修改，其他设备已下线', true);
                else showMsg(res.msg || this._codeText(res.code), false);
            } finally { btn.disabled = false; }
        });

        // 密保设置/更新（留空问题 = 清除密保）
        const secQEl = document.getElementById('ap-sec-question');
        const secAEl = document.getElementById('ap-sec-answer');
        if (secQEl && u.hasSecurityQuestion) secQEl.placeholder = '已设置（留空并保存可清除）';
        const secBtn = document.getElementById('ap-sec-btn');
        if (secBtn) secBtn.addEventListener('click', async () => {
            const q = secQEl.value.trim();
            const a = secAEl.value.trim();
            if (q && a.length < 2) return showMsg('密保答案至少 2 个字', false);
            secBtn.disabled = true;
            try {
                const res = await AuthService.setSecurityQuestion(q, a);
                if (res.ok) {
                    showMsg(q ? '密保已保存' : '密保已清除', true);
                    const uu = AuthService.getUser() || {};
                    uu.hasSecurityQuestion = !!q;
                    AuthService.setUser(uu);
                    secAEl.value = '';
                } else {
                    showMsg(res.msg || this._codeText(res.code), false);
                }
            } finally { secBtn.disabled = false; }
        });

        document.getElementById('ap-logout').addEventListener('click', async () => {
            // 登出前：先把当前账号进度（含闯关/竞速游戏进度）上云，再清空本机进度，
            // 这样账号数据不丢，同时下一个登录/注册的账号不会继承本机残留进度。
            if (window.ProgressSync && typeof ProgressSync.beforeLogout === 'function') {
                try { await ProgressSync.beforeLogout(); } catch (e) { /* 忽略：离线也要完成登出与清理 */ }
            }
            await AuthService.logout();
            this._destroyModal('auth-panel-modal');
            this._refreshBtn();
            // 登出同样要重连：服务端在连接建立时固定身份，不复用旧连接会把已登出玩家继续当已登录
            AuthPanel._notifyAuthChanged();
        });
        document.getElementById('ap-close').addEventListener('click', () => this._destroyModal('auth-panel-modal'));
        modal.addEventListener('mousedown', (e) => { if (e.target === modal) this._destroyModal('auth-panel-modal'); });
    }

    static _codeText(code) {
        const map = {
            bad_username: '用户名格式不正确（2~20 位字母/数字/下划线/中文）',
            bad_password: '密码长度需为 6~32 位',
            username_taken: '该用户名已被注册',
            bad_credentials: '用户名或密码错误',
            locked: '失败次数过多，请 10 分钟后再试',
            ip_rate_limited: '当前网络注册太频繁，请稍后再试',
            server_busy: '服务器繁忙，请稍后再试',
            bad_old_password: '原密码错误',
            network_error: '无法连接服务器，请检查网络'
        };
        return map[code] || '操作失败，请稍后再试';
    }
}

if (typeof window !== 'undefined') window.AuthPanel = AuthPanel;
