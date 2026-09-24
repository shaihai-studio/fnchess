/**
 * ProgressSync - 账号进度同步（阶段 2：双保险）
 *
 * 职责：
 *   - 维护本地进度字段模型（localStorage 键 function_chess_progress_v2）
 *   - 采集本地 LR∑ / TT∑ / ELO（LR∑、TT∑ 为派生态，从原始键实时算）
 *   - pull / push 与服务器字段级合并
 *   - reconcile 全量对账 + 三种异常信号检测（时钟回退 / UUID 丢失 / 首次登录无档案）
 *
 * 设计（对齐 docs/登录系统技术方案.md §4.2 / §4.3）：
 *   - 服务器为时钟权威：每次 pull/push 带 serverTime，客户端算 offset 校正。
 *   - 字段级合并：lr / tt / elo 各自按 updatedAt 取新。
 *   - 保守合并原则：dirty=true（本地有未同步改动）时绝不反向覆盖，向上推。
 *
 * 依赖：
 *   - AuthService（登录态 / token）
 *   - PlayerProfile（本地 UUID）
 */
class ProgressSync {
    static get STORAGE_KEY() { return 'function_chess_progress_v2'; }

    // ── 字段定义 ──
    static get FIELDS() { return ['lr', 'tt', 'elo']; }

    // ── 服务器地址：与 AuthService 一致，统一指向后端 ──
    // 正常路径命中 AuthService.API_BASE（由 P2PController.signaling = p2p2.shaihai.cn:24026 推导），
    // 保证全局只有一个地址来源；下面的常量仅作 AuthService 未加载时的兜底。
    static get API_BASE() {
        if (window.AuthService && window.AuthService.API_BASE) {
            return String(window.AuthService.API_BASE).replace(/\/$/, '');
        }
        return 'https://p2p2.shaihai.cn:24026/api';
    }

    // ────────────── 本地模型读写 ──────────────

    /** 读取本地模型；不存在则用当前本地进度初始化 */
    static load() {
        let m = null;
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') m = parsed;
            }
        } catch (e) { /* 损坏则重建 */ }
        if (!m) m = { lr: {}, tt: {}, elo: {} };
        for (const f of this.FIELDS) {
            if (!m[f] || typeof m[f] !== 'object') m[f] = {};
            m[f].value = Number(m[f].value) || 0;
            m[f].updatedAt = Number(m[f].updatedAt) || 0;
            m[f].serverSyncedAt = Number(m[f].serverSyncedAt) || 0;
            m[f].dirty = !!m[f].dirty;
        }
        return m;
    }

    static save(m) {
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(m)); } catch (e) { /* 忽略 */ }
    }

    // ────────────── 本地进度采集（派生态） ──────────────

    /** LR∑：Σ 100/(10+bestToken) over 所有有最佳记录的关，减去解锁通关惩罚 */
    static collectLR() {
        let sum = 0;
        const addLevel = (id) => {
            try {
                const raw = localStorage.getItem('function_chess_campaign_best_' + id);
                const tok = Number(raw);
                if (Number.isFinite(tok) && tok > 0) sum += 100 / (10 + tok);
            } catch (e) { /* 忽略 */ }
        };
        // 整数关 1..90（与关卡数上限对齐）
        for (let i = 1; i <= 90; i++) addLevel(i);
        // 分数关 1/2..1/20
        for (let d = 2; d <= 20; d++) addLevel('1/' + d);
        // 解锁通关惩罚：每关 -10
        try {
            const unlocked = localStorage.getItem('function_chess_campaign_unlocked_play');
            if (unlocked) {
                const arr = JSON.parse(unlocked);
                if (Array.isArray(arr)) sum -= arr.length * 10;
            }
        } catch (e) { /* 忽略 */ }
        return Math.max(0, sum);
    }

    /** TT∑：遍历 30 关竞速最佳用时，按星级映射累加 */
    static collectTT() {
        let bestTimes = {};
        try {
            const raw = localStorage.getItem('function_chess_race_best_times');
            if (raw) bestTimes = JSON.parse(raw) || {};
        } catch (e) { /* 忽略 */ }
        const stars = (t) => {
            if (t < 100) return 5;
            if (t < 150) return 4;
            if (t < 300) return 3;
            if (t < 600) return 2;
            return 1;
        };
        let sum = 0;
        for (let lv = 1; lv <= 30; lv++) {
            const v = Number(bestTimes[lv]);
            if (Number.isFinite(v) && v > 0) sum += stars(v);
        }
        return sum;
    }

    /** ELO：本地模型里已有则取之，否则 1200（服务器权威，pull 后覆盖） */
    static collectELO() {
        const m = this.load();
        const v = Number(m.elo && m.elo.value);
        return Number.isFinite(v) && v > 0 ? v : 1200;
    }

    /** 采集当前全部本地值（仅 value；不触碰 updatedAt/dirty） */
    static collectLocalValues() {
        return { lr: this.collectLR(), tt: this.collectTT(), elo: this.collectELO() };
    }

    // ────────────── 游戏进度（闯关 + 竞速）：按账号归属隔离 + 云端同步 ──────────────
    //
    // 设计（2026-09 新增）：
    //   · 归属：OWNER_KEY 记录"认领本机游戏进度的账号 userId"。
    //     - 登录/注册后认领为当前账号；登出先上云再把归属复位为 'guest' 并清空本机进度。
    //     - 归属是**另一个账号**时（例如未登出直接换号），本机残留进度一律丢弃、只接受服务端回灌，
    //       避免"账号1 的进度被同步到账号2"。
    //     - 归属为空或 'guest'（本机游客进度）时按正常双向合并，游客进度在首次登录时可带入自己账号。
    //   · 同步：服务端 progress.game_state 存整块 JSON 快照；客户端先做字段级"取更优"合并再上传。
    //   · 覆盖范围：闯关（逐关最佳 token / 星数 / 表达式、通关数、收集星、解锁集）+
    //     竞速（逐关最佳用时、通关数、星数、解锁关、已上报标记）。

    /** 本机游戏进度的归属账号（userId 字符串，或 'guest'） */
    static get OWNER_KEY() { return 'function_chess_progress_owner'; }

    /** 账号专属进度快照（仅离线登出时落盘；只对该账号本人可见，用于下一次登录取回） */
    static get SNAPSHOT_PREFIX() { return 'function_chess_progress_snapshot_'; }

    /** 游戏进度键（精确匹配） */
    static get GAME_EXACT_KEYS() {
        return [
            'function_chess_campaign_cleared',
            'function_chess_campaign_fraction_cleared',
            'function_chess_campaign_stars',
            'function_chess_campaign_unlocked_play',
            'function_chess_race_best_times',
            'function_chess_race_unlocked_levels',
            'function_chess_race_cleared',
            'function_chess_race_stars',
            'function_chess_lr_last_upload'
        ];
    }

    /** 游戏进度键（前缀匹配：逐关数据） */
    static get GAME_PREFIXES() {
        return [
            'function_chess_campaign_best_stars_',
            'function_chess_campaign_best_expr_',
            'function_chess_campaign_best_',
            'function_chess_rt_last_'
        ];
    }

    static _readOwner() {
        try { return String(localStorage.getItem(this.OWNER_KEY) || ''); } catch (e) { return ''; }
    }

    static _writeOwner(uid) {
        try {
            if (uid) localStorage.setItem(this.OWNER_KEY, String(uid));
            else localStorage.removeItem(this.OWNER_KEY);
        } catch (e) { /* 忽略 */ }
    }

    /** 采集本机全部游戏进度键（原样字符串值） */
    static collectGameKeys() {
        const out = {};
        try {
            const exact = this.GAME_EXACT_KEYS;
            const prefixes = this.GAME_PREFIXES;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (exact.indexOf(k) === -1 && !prefixes.some((p) => k.startsWith(p))) continue;
                const v = localStorage.getItem(k);
                if (v !== null) out[k] = v;
            }
        } catch (e) { /* 忽略 */ }
        return out;
    }

    /** 单个键的合并规则：minNum=取更小（更优）/ maxNum=取更大 / union=并集 / minMap=逐关取更短 / preferLocal=本地优先 */
    static _keyRule(key) {
        if (key === 'function_chess_campaign_unlocked_play' || key === 'function_chess_race_unlocked_levels') return 'union';
        if (key === 'function_chess_race_best_times') return 'minMap';
        if (key.startsWith('function_chess_campaign_best_stars_')) return 'maxNum';
        if (key.startsWith('function_chess_campaign_best_expr_')) return 'preferLocal';
        if (key.startsWith('function_chess_campaign_best_')) return 'minNum';
        return 'maxNum';
    }

    static _mergeKey(rule, a, b) {
        if (a === undefined || a === null || a === '') return b;
        if (b === undefined || b === null || b === '') return a;
        if (rule === 'minNum' || rule === 'maxNum') {
            const na = Number(a), nb = Number(b);
            if (!Number.isFinite(na)) return b;
            if (!Number.isFinite(nb)) return a;
            return String(rule === 'minNum' ? Math.min(na, nb) : Math.max(na, nb));
        }
        if (rule === 'union') {
            try {
                const arrA = JSON.parse(a), arrB = JSON.parse(b);
                const list = (Array.isArray(arrA) ? arrA : []).concat(Array.isArray(arrB) ? arrB : []);
                const seen = new Set(), out = [];
                for (const v of list) { const s = String(v); if (!seen.has(s)) { seen.add(s); out.push(v); } }
                return JSON.stringify(out);
            } catch (e) { return a; }
        }
        if (rule === 'minMap') {
            try {
                const mA = JSON.parse(a) || {}, mB = JSON.parse(b) || {};
                const out = {};
                for (const k of Array.from(new Set(Object.keys(mA).concat(Object.keys(mB))))) {
                    const va = Number(mA[k]), vb = Number(mB[k]);
                    const okA = Number.isFinite(va) && va > 0, okB = Number.isFinite(vb) && vb > 0;
                    out[k] = okA && okB ? Math.min(va, vb) : (okA ? va : vb);
                }
                return JSON.stringify(out);
            } catch (e) { return a; }
        }
        return a;   // preferLocal：无法比较的字符串（如最佳表达式）保留本机值
    }

    /** 合并两份进度键集合（取更优） */
    static mergeGameKeys(local, server) {
        const out = {};
        const a = local || {}, b = server || {};
        const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
        for (const k of keys) out[k] = this._mergeKey(this._keyRule(k), a[k], b[k]);
        return out;
    }

    /** 两份进度键是否语义相同（避免无意义重复上传） */
    static _gameEqual(a, b) {
        const ka = Object.keys(a || {}), kb = Object.keys(b || {});
        if (ka.length !== kb.length) return false;
        for (const k of ka) if (String(a[k]) !== String((b || {})[k])) return false;
        return true;
    }

    static encodeGameState(keys) {
        try { return JSON.stringify({ v: 1, keys: keys || {} }); } catch (e) { return ''; }
    }

    static _decodeGameState(state) {
        if (!state || typeof state !== 'string') return {};
        try {
            const parsed = JSON.parse(state);
            const keys = parsed && parsed.keys;
            return (keys && typeof keys === 'object' && !Array.isArray(keys)) ? keys : {};
        } catch (e) { return {}; }
    }

    /** 把进度键写入本机（只写不删，写入前已按规则合并） */
    static applyGameKeys(keys) {
        if (!keys) return 0;
        let n = 0;
        for (const k of Object.keys(keys)) {
            try {
                const v = keys[k];
                if (v === undefined || v === null || v === '') continue;
                localStorage.setItem(k, String(v));
                n++;
            } catch (e) { /* 忽略 */ }
        }
        return n;
    }

    /** 清空本机全部游戏进度（换号/登出时使用） */
    static clearGameKeys() {
        const keys = Object.keys(this.collectGameKeys());
        for (const k of keys) {
            try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
        }
        return keys.length;
    }

    /** 通关/竞速记录更新后调用：防抖把游戏进度推上云（跨设备可见） */
    static schedulePush(delay = 2500) {
        if (!(window.AuthService && window.AuthService.isLoggedIn())) return;
        if (this._pushTimer) return;
        this._pushTimer = setTimeout(() => {
            this._pushTimer = null;
            this.pushNow();
        }, delay);
    }

    /**
     * 立即上云：先 pull 拿到服务端数据 → 与本机取更优合并 → 写回本机 → 推送合并结果。
     * 仅当本机进度归属就是当前账号（或本机无归属）时才执行，避免把别的账号的进度推给当前账号。
     */
    static async pushNow() {
        const uid = String((window.AuthService && window.AuthService.getUserId && window.AuthService.getUserId()) || '');
        if (!uid) return { ok: false, code: 'not_logged_in' };
        const owner = this._readOwner();
        if (owner && owner !== 'guest' && owner !== uid) return { ok: false, code: 'owner_mismatch' };

        const res = await this.pull();
        const serverGame = res && res.ok ? this._decodeGameState(res.game && res.game.state) : {};
        const localGame = this.collectGameKeys();
        const merged = this.mergeGameKeys(localGame, serverGame);
        this.applyGameKeys(merged);
        this._writeOwner(uid);

        const now = Date.now();
        if (res && res.ok) this._clockOffset(res.serverTime);
        const body = {
            game: { state: this.encodeGameState(merged), updatedAt: this._normalizeTs(now) }
        };
        for (const f of this.FIELDS) {
            body[f] = { value: Math.round(this.collectLocalValues()[f]), updatedAt: this._normalizeTs(now) };
        }
        const pushRes = await this.push(body);
        if (pushRes && pushRes.ok) {
            const m = this.load();
            m.game = { state: this.encodeGameState(merged), updatedAt: (pushRes.progress && pushRes.progress.game && pushRes.progress.game.updatedAt) || this._normalizeTs(now) };
            for (const f of this.FIELDS) {
                const sf = pushRes.progress && pushRes.progress[f];
                if (sf) { m[f].value = Number(sf.value) || 0; m[f].updatedAt = Number(sf.updatedAt) || m[f].updatedAt; }
                m[f].dirty = false;
            }
            this.save(m);
        }
        return pushRes;
    }

    /** 登出前：先把当前账号进度上云，再清空本机进度并复位归属（下一个账号不会继承本机残留） */
    static async beforeLogout() {
        const uid = String((window.AuthService && window.AuthService.getUserId && window.AuthService.getUserId()) || '');
        let pushed = false;
        try {
            const res = await this.pushNow();
            pushed = !!(res && res.ok);
        } catch (e) { /* 离线登出也要继续清理 */ }
        // 离线登出（没推上云）时留一份"账号专属快照"：既不会串给下一个账号，
        // 又能在该账号下次登录本机时被取回（见 reconcile 中的快照合并）。
        if (uid && !pushed) {
            try {
                const keys = this.collectGameKeys();
                if (Object.keys(keys).length) {
                    localStorage.setItem(this.SNAPSHOT_PREFIX + uid, this.encodeGameState(keys));
                }
            } catch (e) { /* 忽略 */ }
        } else if (uid) {
            try { localStorage.removeItem(this.SNAPSHOT_PREFIX + uid); } catch (e) { /* 忽略 */ }
        }
        this.clearGameKeys();
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) { /* 忽略 */ }
        this._writeOwner('guest');
    }

    // ────────────── 标记与变更 ──────────────

    /** 本地某字段发生变化时调用：更新 value + updatedAt，置 dirty（服务器时间戳由 reconcile 校正） */
    static markDirty(field) {
        const m = this.load();
        if (this.FIELDS.indexOf(field) === -1) return;
        const now = Date.now();
        m[field].value = this['collect' + field.toUpperCase()]();
        m[field].updatedAt = Math.max(m[field].updatedAt || 0, now);
        m[field].dirty = true;
        this.save(m);
    }

    /** 服务器覆盖本地某字段（反向恢复用）；serverTs 为校正后的服务器时间 */
    static _applyServer(field, value, serverTs) {
        const m = this.load();
        m[field].value = Number(value) || 0;
        m[field].updatedAt = Number(serverTs) || Date.now();
        m[field].serverSyncedAt = Number(serverTs) || Date.now();
        m[field].dirty = false;
        this.save(m);
    }

    // ────────────── 时钟对齐 ──────────────

    /** 记录服务器偏移：offset = serverTime - clientTime（有则校正用） */
    static _clockOffset(serverTime) {
        const st = Number(serverTime);
        if (Number.isFinite(st) && st > 0) {
            this._offset = st - Date.now();
        }
        return this._offset || 0;
    }

    /** 把本地 updatedAt 校正到服务器时钟，返回校正后时间戳 */
    static _normalizeTs(ts) {
        const t = Number(ts) || 0;
        if (!t) return 0;
        return t + (this._offset || 0);
    }

    // ────────────── HTTP ──────────────

    static async _request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.AuthService ? window.AuthService.getToken() : '';
        if (token) headers['Authorization'] = 'Bearer ' + token;
        let resp;
        try {
            resp = await fetch(this.API_BASE + path, {
                method,
                headers,
                body: body != null ? JSON.stringify(body) : undefined
            });
        } catch (e) {
            return { ok: false, code: 'network_error' };
        }
        let data = {};
        try { data = await resp.json(); } catch (e) { /* 空 */ }
        return data;
    }

    static async pull() {
        const res = await this._request('GET', '/sync/pull');
        return res;
    }

    static async push(progress) {
        const res = await this._request('POST', '/sync/push', { progress });
        return res;
    }

    // ────────────── 对账（双保险） ──────────────

    /**
     * 完整对账。返回 { ok, merged, serverUnreachable }。
     * 规则：
     *   1) 未登录：仅把本地最新采集值写入模型（标记 dirty），不联网，等登录再推。
     *   2) 已登录：pull 服务器 → 逐字段按 updatedAt 取新（双向）→ 反向异常检测 → push 脏字段 → 保存。
     */
    static async reconcile() {
        const logged = !!(window.AuthService && window.AuthService.isLoggedIn());
        const m = this.load();
        const local = this.collectLocalValues();

        // 未登录：把采集值对齐到模型并标记 dirty（避免被服务器反向覆盖）
        if (!logged) {
            let changed = false;
            for (const f of this.FIELDS) {
                if (Math.round(m[f].value) !== Math.round(local[f])) {
                    m[f].value = local[f];
                    m[f].updatedAt = Math.max(m[f].updatedAt || 0, Date.now());
                    m[f].dirty = true;
                    changed = true;
                }
            }
            if (changed) this.save(m);
            return { ok: true, merged: m, serverUnreachable: false };
        }

        // 已登录：拉取服务器
        const res = await this.pull();
        if (!res.ok) {
            // 服务器不可达 / token 失效：不联网。
            // 保守原则：把本地最新采集值落盘并标记 dirty（保留本地进度，不被反向覆盖，等下次登录再推）。
            let changed = false;
            for (const f of this.FIELDS) {
                if (Math.round(m[f].value) !== Math.round(local[f]) || !m[f].updatedAt) {
                    m[f].value = local[f];
                    m[f].updatedAt = Math.max(m[f].updatedAt || 0, Date.now());
                    m[f].dirty = true;
                    changed = true;
                }
            }
            if (changed) this.save(m);
            return { ok: false, merged: m, serverUnreachable: res.code === 'network_error' || res.code === 'unauthorized' };
        }
        this._clockOffset(res.serverTime);
        const server = res.progress || {};
        const offset = this._offset || 0;
        let anyServerNew = false;
        let anyLocalDirty = false;

        // ── 换号保护：本机游戏进度的归属是"另一个账号"时，丢弃本机残留，完全以服务端为准 ──
        //   （修复：账号1 玩过的进度被同步到新注册的账号2）
        const uid = String((window.AuthService && window.AuthService.getUserId && window.AuthService.getUserId()) || '');
        const owner = this._readOwner();
        if (uid && owner && owner !== 'guest' && owner !== uid) {
            this.clearGameKeys();
            this._writeOwner(uid);
            for (const f of this.FIELDS) {
                const sf = server[f] || {};
                this._applyServer(f, Number(sf.value) || 0, Number(sf.updatedAt) || 0 || Date.now());
            }
            const sGame = this._decodeGameState(res.game && res.game.state);
            this.applyGameKeys(sGame);
            const mm = this.load();
            mm.game = {
                state: (res.game && res.game.state) || '',
                updatedAt: Number(res.game && res.game.updatedAt) || 0
            };
            this.save(mm);
            console.log('[ProgressSync] 检测到换号：已丢弃本机进度，仅采用账号 ' + uid + ' 的云端进度');
            return { ok: true, merged: mm, serverUnreachable: false, switched: true };
        }
        if (uid) this._writeOwner(uid);

        for (const f of this.FIELDS) {
            const sf = server[f] || {};
            const sVal = Number(sf.value) || 0;
            const sUpdatedAt = Number(sf.updatedAt) || 0;
            // 本地已同步记录
            const lUpdatedAt = m[f].updatedAt || 0;
            const lDirty = m[f].dirty;
            // 把本地时间戳校正到服务器时钟再比较
            const lTs = this._normalizeTs(lUpdatedAt);

            // ① 反向异常检测：服务器值明显更新，且本地该字段未 dirty → 服务器覆盖本地
            //    （时钟回退/清零 / UUID 换新 / 首次登录无档案 都表现为本地 updatedAt 落后）
            if (!lDirty && sUpdatedAt > lTs) {
                this._applyServer(f, sVal, sUpdatedAt);
                anyServerNew = true;
                continue;
            }

            // ② 本地有改动（dirty）：向上推，不反向覆盖
            if (lDirty) {
                // 确保本地 value 是最新采集值
                m[f].value = local[f];
                anyLocalDirty = true;
                continue;
            }

            // ③ 本地有记录但服务器也有，二者时间戳相同或本地更新 → 以本地为准（不覆盖）
            //    仅当服务器 updatedAt 严格更高才覆盖（已在①处理）
            //    本地值若与最新采集不一致，说明本地源更新了但未标 dirty → 标记 dirty 以便推
            if (Math.round(m[f].value) !== Math.round(local[f])) {
                m[f].value = local[f];
                m[f].updatedAt = Math.max(m[f].updatedAt || 0, Date.now());
                m[f].dirty = true;
                anyLocalDirty = true;
            }
        }

        // 服务器有、本地完全没有的字段（首次登录/换新）：服务器覆盖本地
        for (const f of this.FIELDS) {
            const sf = server[f];
            if (sf && Number(sf.value) > 0 && !(m[f].updatedAt > 0)) {
                this._applyServer(f, Number(sf.value) || 0, Number(sf.updatedAt) || 0);
                anyServerNew = true;
            }
        }

        // ── 游戏进度（闯关 + 竞速）：与云端双向合并（取更优）→ 写回本机 → 需要时上云 ──
        //   同一账号换设备登录：云端有、本机没有的数据在这里回灌，解决"游戏进度不同步"。
        const serverGame = this._decodeGameState(res.game && res.game.state);
        let localGame = this.collectGameKeys();
        // 本账号离线登出时留在本机的专属快照（只对该账号本人可取回，不会串给其它账号）
        if (uid) {
            try {
                const snapRaw = localStorage.getItem(this.SNAPSHOT_PREFIX + uid);
                if (snapRaw) localGame = this.mergeGameKeys(localGame, this._decodeGameState(snapRaw));
            } catch (e) { /* 忽略 */ }
        }
        const mergedGame = this.mergeGameKeys(localGame, serverGame);
        this.applyGameKeys(mergedGame);
        const gameNeedsPush = !this._gameEqual(mergedGame, serverGame);
        if (!this._gameEqual(localGame, mergedGame)) anyServerNew = true;
        m.game = {
            state: (res.game && res.game.state) || '',
            updatedAt: Number(res.game && res.game.updatedAt) || 0
        };

        // 推送脏字段到服务器
        let pushOk = false;
        if (anyLocalDirty || gameNeedsPush) {
            const pushBody = {};
            for (const f of this.FIELDS) {
                if (m[f].dirty) {
                    pushBody[f] = { value: Math.round(m[f].value), updatedAt: this._normalizeTs(m[f].updatedAt) };
                }
            }
            if (gameNeedsPush) {
                pushBody.game = { state: this.encodeGameState(mergedGame), updatedAt: this._normalizeTs(Date.now()) };
            }
            const pushRes = await this.push(pushBody);
            pushOk = !!(pushRes && pushRes.ok);
            if (pushRes.ok) {
                // 2026-08-31 修复：推送成功后以服务器返回的权威进度覆盖本地对应字段，
                // 避免"本地时间戳落后于服务器 → 服务器拒绝覆盖 → 但客户端清 dirty"造成的短暂不一致窗口。
                const serverProgress = (pushRes && pushRes.progress) || {};
                // 只回写 lr/tt/elo 三个聚合字段；game 快照单独处理（结构与字段不同）
                for (const f of Object.keys(pushBody).filter((k) => this.FIELDS.indexOf(k) >= 0)) {
                    const sf = serverProgress[f];
                    if (sf) {
                        const sVal = Number(sf.value);
                        const sTs = Number(sf.updatedAt);
                        if (Number.isFinite(sVal)) m[f].value = sVal;
                        if (Number.isFinite(sTs) && sTs > 0) m[f].updatedAt = sTs;
                        m[f].serverSyncedAt = (Number.isFinite(sTs) && sTs > 0) ? sTs : this._normalizeTs(m[f].updatedAt);
                    } else {
                        // 旧服务器无 progress 回包：按原逻辑仅清 dirty
                        m[f].serverSyncedAt = this._normalizeTs(m[f].updatedAt);
                    }
                    m[f].dirty = false;
                }
                if (gameNeedsPush && serverProgress.game && serverProgress.game.state) {
                    m.game = {
                        state: serverProgress.game.state,
                        updatedAt: Number(serverProgress.game.updatedAt) || this._normalizeTs(Date.now())
                    };
                }
            } else if (pushRes.code === 'unauthorized') {
                // token 失效：不清 dirty，下次登录重推
                return { ok: false, merged: m, serverUnreachable: true };
            }
        }

        // 快照内容已并入（并已上云或与云端一致）→ 删除，避免长期残留
        if (uid && (!gameNeedsPush || pushOk)) {
            try { localStorage.removeItem(this.SNAPSHOT_PREFIX + uid); } catch (e) { /* 忽略 */ }
        }
        this.save(m);
        return { ok: true, merged: m, serverUnreachable: false, serverApplied: anyServerNew, localPushed: anyLocalDirty || gameNeedsPush };
    }

    /** 获取某字段当前本地权威值 */
    static getField(field) {
        const m = this.load();
        const f = m[field];
        if (!f) return 0;
        // 若本地源已更新，实时返回最新采集值
        if (field === 'lr') return Math.round(this.collectLR());
        if (field === 'tt') return Math.round(this.collectTT());
        return Math.round(f.value);
    }
}

if (typeof window !== 'undefined') window.ProgressSync = ProgressSync;

// ── 便捷触发：任何"写本地游戏进度"的地方调用一次即可（未登录/模块未加载时静默忽略）──
//    内部做 2.5s 防抖，合并为一次 pull+push，避免频繁请求。
if (typeof window !== 'undefined') {
    window.fnProgressChanged = function () {
        try {
            if (window.ProgressSync && typeof ProgressSync.schedulePush === 'function') ProgressSync.schedulePush();
        } catch (e) { /* 忽略 */ }
    };
}
