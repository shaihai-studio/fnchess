/**
 * PlayerProfile - 玩家身份（排行榜用）
 *
 * 休闲娱乐向身份方案（已与用户确认）：
 *  - 以 localStorage UUID 为主身份：首次运行生成随机 playerId + 默认用户名，
 *    存入 function_chess_player_profile。换浏览器 / 清缓存即新身份（接受此限制）。
 *  - "在哪台机器上玩" = 哪个浏览器的 localStorage 拥有该 UUID。
 *  - IP 仅由服务器端做刷榜风控，不作为身份主键，前端不感知。
 *
 * 2026-09 变更：昵称与用户名合并，全站只保留「用户名」一个概念：
 *  - 已登录：一律使用账号用户名（保留注册时的大小写，来自 AuthService 的账号缓存）。
 *  - 未登录：使用本地自动生成的占位用户名（棋手xxxx），供单机/未登录场景展示与上报。
 *  - 旧数据里的 nickname 字段会自动迁移为 username；getNickname() 保留为兼容别名。
 */
class PlayerProfile {
    static get STORAGE_KEY() { return 'function_chess_player_profile'; }

    static _read() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                if (p && p.playerId) return p;
            }
        } catch (e) { /* 忽略 */ }
        return null;
    }

    static _write(p) {
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* 忽略 */ }
    }

    static _genId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return 'p_' + window.crypto.randomUUID();
        }
        return 'p_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
    }

    /** 确保身份存在并返回 { playerId, username, createdAt }（旧版 nickname 字段自动迁移） */
    static ensure() {
        let p = this._read();
        if (!p) {
            p = {
                playerId: this._genId(),
                username: '棋手' + Math.floor(1000 + Math.random() * 9000),
                createdAt: Date.now()
            };
            this._write(p);
        } else if (!p.username && p.nickname) {
            // 旧版本（独立昵称）数据迁移：昵称直接成为用户名
            p.username = p.nickname;
            delete p.nickname;
            this._write(p);
        }
        return p;
    }

    static getProfile() { return this.ensure(); }
    static getPlayerId() { return this.ensure().playerId; }

    /**
     * 当前用户名（唯一的对外身份名）：
     * 已登录 → 账号用户名（保留注册大小写）；未登录 → 本地自动生成的占位名。
     */
    static getUsername() {
        try {
            const A = (typeof AuthService !== 'undefined') ? AuthService : (window ? window.AuthService : null);
            if (A && typeof A.getNickname === 'function') {
                const u = A.getNickname();   // AuthService 侧已收敛为 username
                if (u) return String(u);
            }
        } catch (e) { /* 未登录或模块未加载 */ }
        return this.ensure().username;
    }

    /** 兼容别名：昵称概念已废除，与用户名同值（旧调用点无需改动） */
    static getNickname() { return this.getUsername(); }

    /** 是否已存在身份（用于判断是否首次进入游戏） */
    static hasProfile() { return !!this._read(); }
}

// 挂到 window：供 AuthService._currentUuid 等通过 window.PlayerProfile 访问（保证注册/登录能取到本地 UUID 并入账号）
if (typeof window !== 'undefined') window.PlayerProfile = PlayerProfile;
