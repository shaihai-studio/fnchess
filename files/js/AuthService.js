/**
 * AuthService - 账号认证前端服务
 *
 * 职责：
 *   - 管理登录 token（localStorage 持久化）
 *   - 封装 /api/auth/* HTTP 接口
 *   - 提供当前登录用户缓存（userId / nickname / username）
 *   - 注册/登录时把旧 localStorage UUID 并入账号
 *
 * 依赖：
 *   - PlayerProfile（获取本地 UUID）
 *
 * 服务器地址：与 P2P 信令同源，这里用 window.location 推导（HTTPS）。
 *   若前端与后端不同源，可通过 window.AUTH_API_BASE 覆盖。
 */
class AuthService {
    static get TOKEN_KEY() { return 'function_chess_auth_token'; }
    static get USER_KEY() { return 'function_chess_auth_user'; }

    static get API_BASE() {
        // 覆盖（本地测试/调试用）
        if (window.AUTH_API_BASE) return window.AUTH_API_BASE.replace(/\/$/, '');
        // 与 P2P 信令服务器同源：从 P2PController.signaling 推导（不再硬编码域名）。
        // 前端可能部署在官网域名，后端在信令服务器域名，因此统一指向信令服务器的 /api。
        try {
            const sig = (typeof P2PController !== 'undefined' && P2PController.signaling) ? P2PController.signaling : null;
            if (sig && sig.host) {
                const scheme = sig.secure ? 'https' : 'http';
                const portStr = sig.port && sig.port !== 80 && sig.port !== 443 ? ':' + sig.port : '';
                return `${scheme}://${sig.host}${portStr}/api`;
            }
        } catch (e) { /* 忽略，走回退 */ }
        // 回退：与页面同源
        try {
            if (window.location && window.location.origin && /^https?:/.test(window.location.origin)) {
                return window.location.origin + '/api';
            }
        } catch (e) { /* 忽略 */ }
        return '/api';
    }

    // ── token / 用户缓存 ──
    static getToken() {
        try { return localStorage.getItem(this.TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    static setToken(t) {
        try { if (t) localStorage.setItem(this.TOKEN_KEY, t); else localStorage.removeItem(this.TOKEN_KEY); } catch (e) { /* 忽略 */ }
    }
    static getUser() {
        try {
            const raw = localStorage.getItem(this.USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    static setUser(u) {
        try { if (u) localStorage.setItem(this.USER_KEY, JSON.stringify(u)); else localStorage.removeItem(this.USER_KEY); } catch (e) { /* 忽略 */ }
    }
    static isLoggedIn() {
        return !!this.getToken() && !!this.getUser();
    }
    static getUserId() { const u = this.getUser(); return u ? u.userId : null; }
    // 账号登录名（小写归一化，用于查找/排重）
    static getUsername() { const u = this.getUser(); return u ? u.username : null; }
    // 展示用的用户名：服务端 nickname 字段保留注册时的大小写，昵称概念已废除，与用户名同值
    static getNickname() { const u = this.getUser(); return u ? (u.nickname || u.username) : null; }

    // ── HTTP 封装 ──
    static async _request(method, path, body, token) {
        const headers = { 'Content-Type': 'application/json' };
        const tk = token || this.getToken();
        if (tk) headers['Authorization'] = 'Bearer ' + tk;
        let resp;
        try {
            resp = await fetch(this.API_BASE + path, {
                method,
                headers,
                body: body != null ? JSON.stringify(body) : undefined
            });
        } catch (e) {
            return { ok: false, code: 'network_error', msg: '无法连接服务器' };
        }
        let data = {};
        try { data = await resp.json(); } catch (e) { /* 空 */ }
        // 响应不是有效 JSON，且非 2xx（如 Nginx 返回 HTML 错误页）→ 统一归为"无法连接服务器"
        if (!data || typeof data !== 'object' || !('ok' in data)) {
            if (!resp.ok) return { ok: false, code: 'network_error', msg: '无法连接服务器' };
        }
        data._httpStatus = resp.status;
        return data;
    }

    // ── 注册 ──
    // 不再有独立展示昵称：注册时昵称与用户名保持一致（服务端 nickname 缺省即用 username）
    static async register({ username, password, secretQuestion, secretAnswer }) {
        const uuid = this._currentUuid();
        const res = await this._request('POST', '/auth/register', {
            username, password, uuid,
            // 可选密保：注册时设置，便于日后「忘记密码」自助重置
            secretQuestion: secretQuestion || undefined,
            secretAnswer: secretAnswer || undefined
        });
        if (res.ok) {
            this.setToken(res.token);
            // 2026-08-31 修复：昵称用服务器返回的 nickname（可能已改过名），
            // 不能用 res.username（小写登录名）覆盖，否则重新登录后显示名被重置
            this.setUser({ userId: res.userId, username: res.username, nickname: res.nickname || res.username });
        }
        return res;
    }

    // ── 登录 ──
    static async login({ username, password }) {
        const uuid = this._currentUuid();
        const res = await this._request('POST', '/auth/login', { username, password, uuid });
        if (res.ok) {
            this.setToken(res.token);
            this.setUser({ userId: res.userId, username: res.username, nickname: res.nickname || res.username });
        }
        return res;
    }

    // ── 登出 ──
    static async logout() {
        const token = this.getToken();
        if (token) await this._request('POST', '/auth/logout', null, token);
        this.setToken('');
        this.setUser(null);
    }

    // ── 拉取当前用户（用于启动时校验 token 是否仍有效） ──
    static async fetchMe() {
        const res = await this._request('GET', '/auth/me');
        if (res.ok) {
            this.setUser({
                userId: res.userId,
                username: res.username,
                nickname: res.nickname,
                boundUuid: res.boundUuid,
                hasSecurityQuestion: !!res.hasSecurityQuestion,
                createdAt: res.createdAt
            });
            return res;
        }
        if (res.code === 'unauthorized' || res.code === 'user_not_found') {
            // token 失效
            this.setToken('');
            this.setUser(null);
        }
        return res;
    }

    // ── 改名 ──
    // 昵称与用户名已合并：不再提供改昵称入口（用户名即展示名，注册后不可改）。

    // ── 改密（需原密码） ──
    static async updatePassword(oldPassword, newPassword) {
        return this._request('POST', '/auth/me/password', { oldPassword, newPassword });
    }

    // ── 密保设置/更新（登录后；question 为空表示清除） ──
    static async setSecurityQuestion(question, answer) {
        return this._request('POST', '/auth/me/security', { question, answer });
    }

    // ── 忘记密码：查询该账号的密保问题 ──
    // 返回 { ok, question|null, uuidResetAvailable }
    static async resetQuestion(username) {
        return this._request('POST', '/auth/reset/question', { username });
    }

    // ── 忘记密码：校验密保答案 → 取得一次性重置令牌 ──
    static async resetVerify(username, answer) {
        return this._request('POST', '/auth/reset/verify', { username, answer });
    }

    // ── 忘记密码：凭重置令牌提交新密码 ──
    static async resetCommit(username, resetToken, newPassword) {
        const res = await this._request('POST', '/auth/reset/commit', { username, resetToken, newPassword });
        if (res.ok) { this.setToken(''); this.setUser(null); }   // 旧 token 已失效，需重新登录
        return res;
    }

    // ── 忘记密码：同设备快捷重置（账号已绑定本机 UUID） ──
    static async resetByUuid(username, newPassword) {
        const uuid = this._currentUuid();
        const res = await this._request('POST', '/auth/reset/uuid', { username, uuid, newPassword });
        if (res.ok) { this.setToken(''); this.setUser(null); }
        return res;
    }

    // ── 获取本地 UUID（PlayerProfile 主身份） ──
    static _currentUuid() {
        try {
            if (window.PlayerProfile && typeof window.PlayerProfile.getPlayerId === 'function') {
                return window.PlayerProfile.getPlayerId();
            }
        } catch (e) { /* 忽略 */ }
        return null;
    }
}

if (typeof window !== 'undefined') window.AuthService = AuthService;
