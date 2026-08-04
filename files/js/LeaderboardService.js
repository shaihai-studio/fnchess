/**
 * LeaderboardService - 排行榜数据服务
 *
 * 复用现有 /lobby WebSocket（MatchLobbyController）通道：
 *  - 上报成绩：submit_score（boardType: lr / tt / elo）
 *  - 查询榜单：query_leaderboard → leaderboard_result（按 id 配对回调）
 * 服务器未启动 / 断连时静默降级，不影响对局与结算界面。
 *
 * 连接就绪队列：首次上报/查询时若 WebSocket 尚在连接中，消息先入队，
 * 待连接建立后统一发送，避免首条消息丢失。
 */
class LeaderboardService {
    constructor(lobby) {
        this.lobby = lobby || null;
        this._pendingQueries = new Map(); // id -> callback
        this._pendingSends = [];          // 连接建立前暂存的消息
        this._querySeq = 0;
        if (this.lobby) {
            const self = this;
            this.lobby.onLeaderboardResult = (data) => self._handleResult(data);
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
        const cb = this._pendingQueries.get(id);
        if (cb) {
            this._pendingQueries.delete(id);
            try { cb(data); } catch (e) { /* 忽略 */ }
        }
    }

    /** 通用上报 */
    submitScore(payload) {
        this._send(Object.assign({ type: 'submit_score' }, payload || {}));
    }

    /** 上报闯关 LR∑ 积分 */
    submitLRSigma(value, nickname) {
        let playerId = '';
        if (typeof PlayerProfile !== 'undefined') playerId = PlayerProfile.getPlayerId();
        this.submitScore({ boardType: 'lr', value: Number(value) || 0, nickname: nickname || '', playerId });
    }

    /** 上报竞速 TT∑ 星分 */
    submitTTSigma(value, nickname) {
        let playerId = '';
        if (typeof PlayerProfile !== 'undefined') playerId = PlayerProfile.getPlayerId();
        this.submitScore({ boardType: 'tt', value: Number(value) || 0, nickname: nickname || '', playerId });
    }

    /** 查询榜单；boardType: 'lr' | 'tt' | 'elo'；回调收到 leaderboard_result */
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
