// Auto-split from UIController.js — prototype-attached methods (UILeaderboard)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UILeaderboard] UIController must be loaded before this file');
}

// initLeaderboard
    UIController.prototype.initLeaderboard = function() {
        this.leaderboardModal = document.getElementById('leaderboard-modal');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.leaderboardMyRankEl = document.getElementById('leaderboard-myrank');
        this.leaderboardNicknameInput = document.getElementById('leaderboard-nickname-input');
        this._leaderboardBoard = 'lr';
        this._leaderboardQuerying = false;

        const openBtn = document.getElementById('leaderboard-open-btn');
        if (openBtn) openBtn.addEventListener('click', () => this.openLeaderboard());

        const closeBtn = document.getElementById('leaderboard-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.hideModal(this.leaderboardModal);
        });

        document.querySelectorAll('.leaderboard-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._switchLeaderboardTab(tab.dataset.board);
            });
        });

        const saveBtn = document.getElementById('leaderboard-nickname-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this._leaderboardSaveNickname());
        if (this.leaderboardNicknameInput) {
            this.leaderboardNicknameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._leaderboardSaveNickname();
            });
        }

        // 点击遮罩关闭
        if (this.leaderboardModal) {
            this.bindModalDismiss(this.leaderboardModal, () => this.hideModal(this.leaderboardModal));
        }
    }
;

// openLeaderboard
    UIController.prototype.openLeaderboard = function() {
        if (window.audioManager) window.audioManager.playClick();
        // 展示当前昵称
        if (typeof PlayerProfile !== 'undefined') {
            const p = PlayerProfile.getProfile();
            if (this.leaderboardNicknameInput) this.leaderboardNicknameInput.value = p.nickname;
        }
        if (this.leaderboardMyRankEl) this.leaderboardMyRankEl.textContent = '';
        this.showModal(this.leaderboardModal);
        this._queryLeaderboard(this._leaderboardBoard || 'lr');
    }
;

// _switchLeaderboardTab
    UIController.prototype._switchLeaderboardTab = function(board) {
        if (board !== 'lr' && board !== 'tt' && board !== 'elo') return;
        this._leaderboardBoard = board;
        document.querySelectorAll('.leaderboard-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.board === board);
        });
        this._queryLeaderboard(board);
    }
;

// _queryLeaderboard
    UIController.prototype._queryLeaderboard = function(board) {
        const svc = this._leaderboardService;
        if (!svc) {
            if (this.leaderboardList) this.leaderboardList.innerHTML = '<div class="leaderboard-empty">排行榜服务未就绪</div>';
            return;
        }
        if (this._leaderboardQuerying) return; // 防抖：等待上一次结果
        this._leaderboardQuerying = true;
        if (this.leaderboardList) this.leaderboardList.innerHTML = '<div class="leaderboard-empty">加载中…</div>';
        let playerId = '';
        if (typeof PlayerProfile !== 'undefined') playerId = PlayerProfile.getPlayerId();
        const self = this;
        // 8 秒超时兜底：服务器未启动 / 断连时避免"加载中"卡死
        if (this._leaderboardQueryTimer) clearTimeout(this._leaderboardQueryTimer);
        this._leaderboardQueryTimer = setTimeout(() => {
            self._leaderboardQuerying = false;
            if (self.leaderboardList && self._leaderboardBoard === board) {
                self.leaderboardList.innerHTML = '<div class="leaderboard-empty">无法连接排行榜服务器，请稍后重试</div>';
            }
        }, 8000);
        svc.query(board, playerId, (data) => {
            if (self._leaderboardQueryTimer) { clearTimeout(self._leaderboardQueryTimer); self._leaderboardQueryTimer = null; }
            self._leaderboardQuerying = false;
            if (self._leaderboardBoard !== (data && data.boardType)) return; // Tab 已切换，丢弃过期结果
            self._renderLeaderboard(data);
        });
    }
;

// _renderLeaderboard
    UIController.prototype._renderLeaderboard = function(data) {
        const list = this.leaderboardList;
        if (!list) return;
        const boardType = data && data.boardType;
        const rows = Array.isArray(data && data.list) ? data.list : [];

        if (!rows.length) {
            list.innerHTML = '<div class="leaderboard-empty">暂无数据，快来挑战第一名吧！</div>';
        } else {
            let html = '';
            for (const row of rows) {
                const rankClass = row.rank <= 3 ? ` top-${row.rank}` : '';
                let scoreText;
                if (boardType === 'lr') scoreText = Number(row.score).toFixed(6);
                else scoreText = String(row.score);
                const sub = (boardType === 'elo')
                    ? `${row.wins}胜 ${row.losses}负 ${row.draws}平`
                    : '';
                html += `
                    <div class="leaderboard-row${row.isMe ? ' me' : ''}">
                        <span class="leaderboard-rank${rankClass}">${row.rank}</span>
                        <span class="leaderboard-name">${this._escapeHtml(row.nickname)}${row.isMe ? '<em>(我)</em>' : ''}</span>
                        <span class="leaderboard-score">${scoreText}</span>
                        ${sub ? `<span class="leaderboard-sub">${sub}</span>` : ''}
                    </div>`;
            }
            list.innerHTML = html;
        }

        // 我的名次
        if (this.leaderboardMyRankEl) {
            const myRank = Number(data && data.myRank);
            if (myRank > 0) {
                const myScore = (data && data.myScore != null) ? data.myScore : '';
                const label = boardType === 'lr' ? 'LR∑' : boardType === 'tt' ? 'TT∑' : 'ELO';
                this.leaderboardMyRankEl.textContent = `我的排名：第 ${myRank} 名（${label} ${myScore}）`;
            } else {
                this.leaderboardMyRankEl.textContent = '还没有上榜记录，快去打一局吧！';
            }
        }
    }
;

// _leaderboardSaveNickname
    UIController.prototype._leaderboardSaveNickname = function() {
        if (typeof PlayerProfile === 'undefined') return;
        const input = this.leaderboardNicknameInput;
        if (!input) return;
        const name = PlayerProfile.setNickname(input.value);
        input.value = name;
        if (window.audioManager) window.audioManager.playClick();
        this.showMessage('昵称已保存，下次对局自动带上新昵称', 'success');
    }
;

// _escapeHtml
    UIController.prototype._escapeHtml = function(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
;
