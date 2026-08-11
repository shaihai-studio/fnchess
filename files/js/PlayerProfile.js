/**
 * PlayerProfile - 玩家身份（排行榜用）
 *
 * 休闲娱乐向身份方案（已与用户确认）：
 *  - 以 localStorage UUID 为主身份：首次运行生成随机 playerId + 默认昵称，
 *    存入 function_chess_player_profile。换浏览器 / 清缓存即新身份（接受此限制）。
 *  - "在哪台机器上玩" = 哪个浏览器的 localStorage 拥有该 UUID。
 *  - IP 仅由服务器端做刷榜风控，不作为身份主键，前端不感知。
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

    /** 确保身份存在并返回 { playerId, nickname, createdAt } */
    static ensure() {
        let p = this._read();
        if (!p) {
            p = {
                playerId: this._genId(),
                nickname: '棋手' + Math.floor(1000 + Math.random() * 9000),
                createdAt: Date.now()
            };
            this._write(p);
        }
        return p;
    }

    static getProfile() { return this.ensure(); }
    static getPlayerId() { return this.ensure().playerId; }
    static getNickname() { return this.ensure().nickname; }

    /** 是否已存在身份（用于判断是否首次进入游戏） */
    static hasProfile() { return !!this._read(); }

    /** 设置昵称：清理空白、限长 10 字符；空输入保持原昵称 */
    static setNickname(name) {
        const p = this.ensure();
        const clean = String(name == null ? '' : name).trim().slice(0, 10);
        if (!clean) return p.nickname;
        p.nickname = clean;
        this._write(p);
        return p.nickname;
    }
}
