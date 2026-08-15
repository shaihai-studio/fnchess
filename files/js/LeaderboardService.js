/**
 * LeaderboardService - 排行榜数据服务
 *
 * 复用现有 /lobby WebSocket（MatchLobbyController）通道：
 *  - 上报成绩：submit_score（boardType: lr / rtN / elo）
 *  - 查询榜单：query_leaderboard → leaderboard_result（按 id 配对回调）
 *  - 玩家举报：report（90s 间隔，被举报者强制核验）
 *
 * 防作弊（方案A）：
 *  - 服务器连接时下发一次性 nonce（challenge 消息），用完即作废，可随时 request_challenge 重新申请。
 *  - lr / rtN / report 均携带 HMAC-SHA256 签名（VerifyCrypto.sign），验签失败服务器直接丢弃。
 *  - 服务器未启动 / 断连 / 拿不到 nonce 时静默降级，不影响对局与结算界面。
 */
class LeaderboardService {
    constructor(lobby) {
        this.lobby = lobby || null;
        this._pendingQueries = new Map(); // id -> callback
        this._pendingSends = [];          // 连接建立前暂存的消息
        this._raceScoreWaiters = [];      // 竞速积分上报等待队列（submit_result 分发）
        this._querySeq = 0;
        this._nonce = null;               // 当前可用的一次性 nonce
        this._nonceExp = 0;
        this._nonceWaiters = [];          // 等待 nonce 的 Promise resolve 队列
        this._signChain = Promise.resolve(); // 2026-08-15 修复 #65：签名上报串行化链，避免并发抢同一一次性 nonce
        this.onSubmitResult = null;       // (data) => void（verify_failed / rate_limited / too_fast 等）
        if (this.lobby) {
            const self = this;
            this.lobby.onLeaderboardResult = (data) => self._handleResult(data);
            this.lobby.onPlayerEloResult = (data) => self._handleResult(data);   // 批量 ELO 查询结果（P2P 开场用）
            this.lobby.onRaceStartResult = (data) => self._handleResult(data);   // 阶段一：竞速权威计时会话（按 id 配对）
            this.lobby.onChallenge = (data) => self._handleChallenge(data);
            this.lobby.onSubmitResult = (data) => {
                // 失败原因控制台可见（之前只 setItem 成功路径，失败被吞，排障困难）
                if (data && !data.ok) {
                    console.warn(`[LB] 上报被拒: code=${data.code || '?'} reason=${data.reason || '?'} level=${data.level || ''} waitMs=${data.waitMs || ''} boardType=${data.boardType || '?'}`);
                }
                // 2026-08-15 修复 #65：所有签名上报（rsc/lr/rtN/elo/wipe）统一按 FIFO 配对 submit_result。
                // 因 _withFreshNonce 已串行化，先进先出即正确配对，无需按 boardType 过滤（原仅 rsc 分发会导致其它榜等待 6s 超时）。
                if (self._raceScoreWaiters && self._raceScoreWaiters.length) {
                    const w = self._raceScoreWaiters.shift();
                    try { w(data); } catch (e) { /* 忽略 */ }
                }
                if (self.onSubmitResult) { try { self.onSubmitResult(data); } catch (e) { /* 忽略 */ } }
                // LR∑ 上报真正被服务器接受后，才把"已上报值"写回 localStorage
                // （之前的实现是 submit 之前 setItem，导致上报失败时 last 虚高、永远不报）
                if (data && data.ok && data.boardType === 'lr' && Number.isFinite(data.score)) {
                    try { localStorage.setItem('function_chess_lr_last_upload', String(data.score)); } catch (e) { /* 忽略 */ }
                }
            };
            // 不用 onConnectionChange（UILobby 进入大厅时会覆盖该回调），改用轮询 flush：
            // 连接建立后，把等待中的消息统一补发出去。
            this._flushTimer = setInterval(() => self._flushPending(), 500);
        }
    }

    _ensureConnected() {
        if (!this.lobby) return;
        if (this.lobby.isConnected) return;
        this.lobby.connect();
    }

    _send(obj) {
        if (this.lobby && this.lobby.isConnected) {
            this.lobby._send(obj);
        } else {
            // 未就绪：入队，连接建立后统一发送
            this._pendingSends.push(obj);
            if (this._pendingSends.length > 200) this._pendingSends.shift(); // 防内存堆积
            this._ensureConnected();
        }
    }

    _flushPending() {
        if (!this._pendingSends.length) return;
        if (!this.lobby || !this.lobby.isConnected) return; // 尚未连接，继续等待
        const batch = this._pendingSends;
        this._pendingSends = [];
        for (const obj of batch) {
            if (this.lobby) this.lobby._send(obj);
        }
    }

    _handleResult(data) {
        const id = data && data.id;
        if (!id) return;
        // 彗星分关榜查询结果：缓存该关全服最短 token（供本地算 plv / 胜利弹窗展示）
        if (data && data.boardType && /^pl\d+(?:\/\d+)?$/.test(data.boardType) && data.levelBestToken != null) {
            try { localStorage.setItem('function_chess_comet_best_' + data.boardType.slice(2), String(data.levelBestToken)); } catch (e) { /* 忽略 */ }
        }
        const cb = this._pendingQueries.get(id);
        if (cb) {
            this._pendingQueries.delete(id);
            try { cb(data); } catch (e) { /* 忽略 */ }
        }
    }

    _handleChallenge(data) {
        this._nonce = String((data && data.nonce) || '');
        this._nonceExp = Number((data && data.exp) || 0) || (Date.now() + 120000);
        const waiters = this._nonceWaiters;
        this._nonceWaiters = [];
        for (const w of waiters) { try { w(); } catch (e) { /* 忽略 */ } }
    }

    /** 确保有可用的 nonce；返回 Promise（拿到 nonce 后 resolve；3s 超时兜底） */
    _requestNonce() {
        return new Promise((resolve) => {
            if (this._nonce && Date.now() < this._nonceExp) { resolve(); return; }
            if (!this.lobby) { resolve(); return; } // 无法签名 → 放弃（静默降级）
            this._nonceWaiters.push(resolve);
            this._send({ type: 'request_challenge' });
            setTimeout(() => {
                const i = this._nonceWaiters.indexOf(resolve);
                if (i >= 0) this._nonceWaiters.splice(i, 1);
                resolve();
            }, 3000);
        });
    }

    // 2026-08-15 修复 #65：以下三个方法用于串行化所有签名上报，杜绝并发抢同一一次性 nonce。
    // 关键点：每步都先申请全新 nonce 并等上一次上报的 submit_result 回来后再申请下一个，
    // 否则服务器会在 verify 前因新的 request_challenge 覆盖 ws._nonce，导致在途提交验签失败（nonce_mismatch）。
    _requestFreshNonce() {
        return new Promise((resolve) => {
            if (!this.lobby) { resolve(null); return; }
            let done = false;
            const cleanup = () => { const i = this._nonceWaiters.indexOf(onChallenge); if (i >= 0) this._nonceWaiters.splice(i, 1); };
            const onChallenge = () => { if (done) return; done = true; cleanup(); resolve(this._nonce || null); };
            this._nonceWaiters.push(onChallenge);
            this._send({ type: 'request_challenge' });
            setTimeout(() => { if (done) return; done = true; cleanup(); resolve((this._nonce && Date.now() < this._nonceExp) ? this._nonce : null); }, 3000);
        });
    }

    _withFreshNonce(buildMsg) {
        const run = async () => {
            const nonce = await this._requestFreshNonce();
            if (!nonce) { console.warn('[LB] 签名上报已放弃：无法获取 nonce'); return { ok: false, code: 'no_nonce' }; }
            return buildMsg(nonce);
        };
        this._signChain = this._signChain.then(run, run);
        return this._signChain;
    }

    _awaitSubmitResult(msg) {
        return new Promise((resolve) => {
            const waiter = (res) => resolve(res);
            this._raceScoreWaiters.push(waiter);
            this._send(msg);
            setTimeout(() => {
                const i = this._raceScoreWaiters.indexOf(waiter);
                if (i >= 0) { this._raceScoreWaiters.splice(i, 1); resolve({ ok: false, code: 'timeout' }); }
            }, 6000);
        });
    }

    /** 带签名的上报（lr / rtN）；payload 随签名一起锁定，防篡改 */
    async _submitSigned(obj, payload) {
        if (typeof VerifyCrypto === 'undefined') { console.warn('[LB] VerifyCrypto 缺失，上报已放弃'); return { ok: false, code: 'no_crypto' }; }
        const playerId = typeof PlayerProfile !== 'undefined' ? PlayerProfile.getPlayerId() : '';
        const boardType = String(obj.boardType || '');
        const value = obj.value;
        const self = this;
        return this._withFreshNonce((nonce) => {
            const sig = VerifyCrypto.sign(nonce, playerId, boardType, value, payload || {});
            // 诊断日志（与服务端 verifySig 对账）
            try {
                const payloadJson = JSON.stringify(payload || {});
                const sigInput = [String(nonce || ''), String(playerId || ''), boardType, String(value === undefined ? '' : value)].join('|');
                console.log(`[LB] sign input: boardType=${boardType} playerId="${String(playerId).slice(0, 24)}" value=${value} nonce="${String(nonce).slice(0, 16)}..." sig=${sig.slice(0, 24)}... payload=${payloadJson.slice(0, 120)} | sigInput="${sigInput.slice(0, 120)}"`);
            } catch (e) { /* 忽略诊断日志异常 */ }
            return self._awaitSubmitResult(Object.assign({ type: 'submit_score' }, obj, { playerId, nonce, sig, payload: payload || {} }));
        });
    }

    /** 通用上报（不签名消息用；ELO 走 submitEloScore 签名版） */
    submitScore(payload) {
        this._send(Object.assign({ type: 'submit_score' }, payload || {}));
    }

    /** ELO 上报（签名版，防伪造消息刷 ELO；房主/访客结算各自上报，服务器按 roomKey 去重） */
    submitEloScore(payload) {
        const p = payload || {};
        const playerId = typeof PlayerProfile !== 'undefined' ? PlayerProfile.getPlayerId() : '';
        return this._submitSigned(Object.assign({ boardType: 'elo', value: 0 }, p, { playerId }), {});
    }

    /**
     * 上报闯关 LR∑ 积分（方案A签名 + 方案B核验载荷）
     * @param {number} value  LR∑ 值（客户端按 §5 token 口径算）
     * @param {string} nickname
     * @param {Object} [minTokens]  { levelId: minToken }，全部有最佳记录的关
     * @param {Array}  [levels]     核验载荷：[{ level, expr, minToken }]（触发核验时服务器据此复算）
     */
    submitLRSigma(value, nickname, minTokens, levels) {
        let playerId = '';
        if (typeof PlayerProfile !== 'undefined') playerId = PlayerProfile.getPlayerId();
        const payload = {};
        if (minTokens && typeof minTokens === 'object') payload.minTokens = minTokens;
        if (Array.isArray(levels) && levels.length) payload.levels = levels;
        this._submitSigned({ boardType: 'lr', value: Number(value) || 0, nickname: nickname || '', playerId }, payload);
    }

    /** 上报竞速分关 Time Attack 用时：boardType = rt{levelId}，value = 该关最佳用时(秒)；附题数供服务器难度下限拦截 */
    submitRaceTime(levelId, seconds, nickname, solvedCount, totalRounds, raceSessionId) {
        let playerId = '';
        if (typeof PlayerProfile !== 'undefined') playerId = PlayerProfile.getPlayerId();
        const payload = {};
        // 阶段一：服务端权威计时。raceSessionId 放入 payload（随签名锁定），服务端以此校验会话并用 now-startTs 计算权威用时
        if (raceSessionId) payload.raceSessionId = String(raceSessionId);
        this._submitSigned({
            boardType: 'rt' + Number(levelId),
            value: Number(seconds) || 0,
            nickname: nickname || '',
            playerId,
            solvedCount: Number(solvedCount) || 0,
            totalRounds: Number(totalRounds) || 0
        }, payload);
    }

    /**
     * 阶段一：竞速权威计时——向服务器申请一次性会话（每关一个，起跑时调用）。
     * 服务器记录 startTs，并以 now - startTs 为权威用时；无会话的 rtN 上报会被拒绝。
     * @param {number} levelId 竞速关卡（1~30；自定义关/多人对战不要调用）
     * @returns {Promise<string|null>} raceSessionId（服务器未连/被限流/超时返回 null）
     */
    startRaceSession(levelId) {
        return new Promise((resolve) => {
            const id = 'rs' + (++this._querySeq);
            const timer = setTimeout(() => {
                this._pendingQueries.delete(id);
                resolve(null);
            }, 5000);
            this._pendingQueries.set(id, (data) => {
                clearTimeout(timer);
                resolve(data && data.ok ? String(data.raceSessionId || '') : null);
            });
            this._send({ type: 'race_start', levelId: Number(levelId) || 0, id: String(id) });
        });
    }

    /**
     * 上报竞速对战积分（boardType: 'rsc'，签名版；服务端按 roomKey+playerId 去重权威计分）
     * @param {Object} payload { roomCode, place, totalPlayers, nickname }
     * 返回 Promise<{ ok, code, score, delta, tier, games, wins }>（服务器未连/验签失败时 ok=false）
     */
    submitRaceScore(payload) {
        if (typeof VerifyCrypto === 'undefined') return Promise.resolve({ ok: false, code: 'no_crypto' });
        const p = payload || {};
        const playerId = typeof PlayerProfile !== 'undefined' ? PlayerProfile.getPlayerId() : '';
        const self = this;
        // 2026-08-15 修复 #65：走串行化链，确保竞速结算的 nonce 独占且等结果回来再发下一个
        return this._withFreshNonce((nonce) => {
            const sig = VerifyCrypto.sign(nonce, playerId, 'rsc', 0, p);
            return self._awaitSubmitResult({
                type: 'submit_score',
                boardType: 'rsc',
                value: 0,
                nickname: String(p.nickname || '') || '',
                playerId,
                nonce,
                sig,
                payload: p
            });
        });
    }

    /** 查询竞速对战积分榜（boardType: 'rsc'）；回调收到 leaderboard_result（list 含 tier/games/wins，另有 myTier/myGames） */
    queryRaceBoard(playerId, callback) {
        this.query('rsc', String(playerId || ''), callback);
    }

    /** 玩家举报（90s 间隔由服务器控制；被举报者下次 lr 强制核验） */
    async report(target, reason) {
        if (typeof VerifyCrypto === 'undefined') return;
        const playerId = typeof PlayerProfile !== 'undefined' ? PlayerProfile.getPlayerId() : '';
        if (!playerId || !target || target === playerId) return;
        // 2026-08-15 修复 #65：走串行化链
        return this._withFreshNonce((nonce) => {
            const sig = VerifyCrypto.sign(nonce, playerId, '', '', {});
            return this._awaitSubmitResult({ type: 'report', target: String(target || ''), playerId, reason: String(reason || ''), nonce, sig });
        });
    }

    /**
     * 清除自己的排行榜成绩（重置进度时选择"不保留"）。
     * @param {string} mode 'campaign'（删 lr + pl*）| 'race'（删 rt*）
     * 签名防伪造：只能清自己的。返回 Promise，resolve 结果对象 { ok, removed, mode, code }；
     * 服务器未连 / 超时 / 验签失败时 resolve { ok:false }。
     */
    deleteMyScores(mode) {
        if (typeof VerifyCrypto === 'undefined') return Promise.resolve({ ok: false });
        const playerId = typeof PlayerProfile !== 'undefined' ? PlayerProfile.getPlayerId() : '';
        if (!playerId) return Promise.resolve({ ok: false });
        // 2026-08-15 修复 #65：走串行化链（原用 _pendingQueries[id]，现统一 FIFO 配对 submit_result）
        return this._withFreshNonce((nonce) => {
            const sig = VerifyCrypto.sign(nonce, playerId, '', '', {});
            return this._awaitSubmitResult({ type: 'delete_my_scores', playerId, mode: String(mode || ''), nonce, sig });
        });
    }

    /** 查询榜单；boardType: 'lr' | 'rt{level}' | 'pl{level}' | 'elo'；回调收到 leaderboard_result */
    query(boardType, playerId, callback) {
        const id = 'q' + (++this._querySeq);
        if (typeof callback === 'function') this._pendingQueries.set(id, callback);
        this._send({ type: 'query_leaderboard', boardType: String(boardType), playerId: String(playerId || ''), id: String(id) });
    }

    /** 批量查询玩家 ELO（联机开场 VS 用）；回调收到 { id, players: {playerId: {elo,nickname,...}} } */
    queryPlayerElo(playerIds, callback) {
        const id = 'pelo' + (++this._querySeq);
        if (typeof callback === 'function') this._pendingQueries.set(id, callback);
        this._send({ type: 'query_player_elo', playerIds: Array.isArray(playerIds) ? playerIds : [], id: String(id) });
    }
}
