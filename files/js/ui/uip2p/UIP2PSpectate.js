/**
 * UIP2PSpectate —— UIP2P 模块切片（UIController.prototype 挂载）
 *
 * 观战玩家、对局收尾、弃权判负（房主/访客）
 * 本文件是 files/js/ui/UIP2P.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UIP2P 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype._buildSpectatePlayers = function() {
        const players = {};
        const me = (this.p2pController && this.p2pController.myPlayerId) || 'A';
        const myName = (typeof PlayerProfile !== 'undefined' && typeof PlayerProfile.getNickname === 'function')
            ? PlayerProfile.getNickname() : '房主';
        const opp = this._p2pOpponentProfile;
        players[me] = myName;
        players[me === 'A' ? 'B' : 'A'] = (opp && opp.nickname) || '访客';
        return players;
    }
;

// _notifySpectatorsGuestLeft
    // 访客中途退出/弃权：房主立即推送一条带 _notice 的观战快照，观众端收到后弹窗提示
    UIController.prototype._notifySpectatorsGuestLeft = function() {
        try {
            const lobby = this._lobby;
            if (!lobby || !lobby.isConnected || !this._p2pRoomCode) return;
            const opp = this._p2pOpponentProfile;
            const snapshot = this.buildSyncSnapshot();
            snapshot._notice = { type: 'guest_left', nickname: (opp && opp.nickname) || '访客' };
            lobby.sendSpectateSync(snapshot);
        } catch (e) {
            console.warn('[UI][P2P] 通知观众访客退出失败：', e);
        }
    }
;

    UIController.prototype._finalizeP2PMatch = function(opts) {
        opts = opts || {};
        const isForfeitSelf = !!opts.forfeitSelf;
        // 非对局中（未开局/建房等待/已结算）不处理，返回 false；调用方据此决定是否弹普通断线弹窗
        if (!this.isP2PMode || !this._p2pMatchStarted || this._p2pEloSettled) {
            return false;
        }
        // 访客中途退出/弃权（对手弃权）且本端为房主时：即时推送观战通知，观众端弹窗"访客已退出"
        if (!isForfeitSelf && this.p2pController && this.p2pController.isHost) {
            this._notifySpectatorsGuestLeft();
        }
        // ★ 休闲模式：不结算 ELO，但仍按"对手弃权"弹 disconnect-modal（语义上我方胜）
        if (this._p2pMatchMode !== 'ranked') {
            this._p2pEloSettled = true; // 标记结算（防止重复弹窗/重复处理）
            this._stopSpectateSync();   // P4：对局结束，停止观战快照周期推送
            this._showP2PDisconnectModal(!isForfeitSelf);
            return true;
        }
        if (typeof PlayerProfile === 'undefined') return false;
        const p2p = this.p2pController;
        const opp = this._p2pOpponentProfile;
        if (!p2p || !opp || !opp.playerId) return false;
        if (!this._leaderboardService) return false;
        const profile = PlayerProfile.getProfile();
        const roomKey = ((this._p2pRoomCode || p2p.roomCode) || 'room') + '#' + (p2p._gen || 0);
        // isForfeitSelf=true：本方弃权判负（对手胜）；false：对手弃权（本方胜）
        this._leaderboardService.submitEloScore({
            nickname: profile.nickname,
            opponentPlayerId: opp.playerId,
            opponentNickname: opp.nickname || '棋手',
            scoreA: isForfeitSelf ? 0 : 1,
            scoreB: isForfeitSelf ? 1 : 0,
            winner: isForfeitSelf ? 'B' : 'A',
            roomCode: roomKey
        });
        this._p2pEloSettled = true;
        this._stopSpectateSync(); // P4：对局结束，停止观战快照周期推送
        this._showP2PDisconnectModal(!isForfeitSelf);
        return true;
    };

    UIController.prototype._reportP2PForfeit = function(isForfeitSelf) {
        return this._finalizeP2PMatch({ forfeitSelf: isForfeitSelf });
    };

    // _onOpponentQuit
    // 收到对方"主动退出"通知（PeerJS quit 消息，非断线）：
    // - 排位：对手弃权 → 本方判胜（ELO 对称，服务端按 roomKey 去重）
    // - 休闲：弹"对手已退出对局"
    // 立即结算并主动断开，不进入 60s 重连等待；结算后由 disconnect-modal 的
    // "返回主菜单"按钮走 _cleanupP2P 完成剩余清理（踢观众/关房间/回主菜单）。
    UIController.prototype._onOpponentQuit = function() {
        console.warn(`[UI][P2P] _onOpponentQuit 收到对手主动退出通知：matchMode=${this._p2pMatchMode}, eloSettled=${this._p2pEloSettled}, roomDissolved=${this._p2pRoomDissolved}`);
        if (!this.isP2PMode) return;
        if (this._p2pEloSettled || this._p2pRoomDissolved) return;
        // 标记对局已结束，避免后续 onDisconnected / _cleanupP2P 重复结算
        this._p2pRoomDissolved = true;
        this._hideP2PReconnectWait();
        this._hideP2PReconnectingToast();
        // 对手弃权：本方判胜（休闲模式同样弹"对手已退出对局"）。
        // 先结算（此时 p2p.roomCode 仍保留，roomKey 稳定），再断开本方连接。
        if (!this._reportP2PForfeit(false)) {
            this._showP2PDisconnectModal(true);
        }
        // 主动断开本方连接（_disconnecting=true → _handleDisconnect 直接返回，不弹窗、不重连）
        if (this.p2pController) this.p2pController.disconnect();
        // 告知 handleExit 跳过弹主菜单，等待用户看完结算弹窗后点"返回主菜单"
        this._p2pShowDisconnectReturnToMenu = true;
    };
;

// _reportP2PForfeitOpponent
// 访客专用：收到房主解散/退出通知时，本方结算为获胜得分（与房主判负完全对称）。
// 上报语义与 _reportP2PForfeit(false) 一致：本方略胜（scoreA=1, winner='A'）；
// 服务端按 roomKey 去重，房主端已上报同样结果，两侧结果天然一致，不会重复扣分。
UIController.prototype._reportP2PForfeitOpponent = function() {
    // 访客收到房主解散/退出通知时，本方结算为获胜得分（与房主判负完全对称）；
    // 语义与 _reportP2PForfeit(false) 一致：本方略胜（winner='A'），统一收敛到 _finalizeP2PMatch（P5）
    return this._finalizeP2PMatch({ forfeitSelf: false });
}
;

// _startP2PVSIntro
