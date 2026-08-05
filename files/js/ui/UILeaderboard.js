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

        // 竞速分关榜（Time Attack）关卡选择器：每个关卡一张独立小榜，比单关最快用时
        this._leaderboardRaceLevel = 1;
        this.leaderboardRaceSel = document.getElementById('leaderboard-race-selector');
        this.leaderboardRaceLevelSel = document.getElementById('leaderboard-race-level');
        if (this.leaderboardRaceLevelSel) {
            let maxLv = 30;
            try { if (this.gameController && this.gameController.maxOpenRaceLevel) maxLv = this.gameController.maxOpenRaceLevel; } catch (e) { /* 忽略 */ }
            let opts = '';
            for (let i = 1; i <= maxLv; i++) opts += `<option value="${i}">第 ${i} 关</option>`;
            this.leaderboardRaceLevelSel.innerHTML = opts;
            this.leaderboardRaceLevelSel.addEventListener('change', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._leaderboardRaceLevel = Number(this.leaderboardRaceLevelSel.value) || 1;
                this._queryLeaderboard('tt');
            });
        }

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

        // 首次进入昵称设置弹窗（之后仍可在排行榜里修改昵称）
        this.initNicknamePrompt();
        this.maybeShowNicknamePrompt();
    }
;

// initNicknamePrompt
    UIController.prototype.initNicknamePrompt = function() {
        this.nicknameModal = document.getElementById('nickname-modal');
        this.nicknameInput = document.getElementById('nickname-input');
        if (!this.nicknameModal || !this.nicknameInput) return;
        const confirmBtn = document.getElementById('nickname-confirm-btn');
        const cancelBtn = document.getElementById('nickname-cancel-btn');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this._nicknamePromptConfirm());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this._nicknamePromptCancel());
        this.nicknameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._nicknamePromptConfirm();
        });
        // 点击遮罩关闭 = 取消
        this.bindModalDismiss(this.nicknameModal, () => this._nicknamePromptCancel());
    }
;

// maybeShowNicknamePrompt
    UIController.prototype.maybeShowNicknamePrompt = function() {
        if (typeof PlayerProfile === 'undefined') return;
        if (PlayerProfile.hasProfile()) return; // 非首次进入，不再弹
        if (!this.nicknameModal || !this.nicknameInput) return;
        const self = this;
        // 等主菜单入场动画结束后再弹出，避免抢焦点
        setTimeout(() => {
            if (self.nicknameInput) self.nicknameInput.value = PlayerProfile.getNickname();
            self.showModal(self.nicknameModal);
        }, 900);
    }
;

// _nicknamePromptConfirm
    UIController.prototype._nicknamePromptConfirm = function() {
        if (window.audioManager) window.audioManager.playClick();
        let name = null;
        if (this.nicknameInput && typeof PlayerProfile !== 'undefined') {
            name = PlayerProfile.setNickname(this.nicknameInput.value);
        }
        this.hideModal(this.nicknameModal);
        if (name && typeof this.showMessage === 'function') {
            this.showMessage(`昵称已设置：${name}`, 'success');
        }
    }
;

// _nicknamePromptCancel
    UIController.prototype._nicknamePromptCancel = function() {
        if (window.audioManager) window.audioManager.playClick();
        this.hideModal(this.nicknameModal);
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
        // 竞速分关榜：显示关卡选择器，并默认跳到玩家当前所在竞速关
        if (board === 'tt') {
            if (this.leaderboardRaceSel) this.leaderboardRaceSel.style.display = 'flex';
            let cur = 1;
            try { if (this.raceCurrentLevelId) cur = Number(this.raceCurrentLevelId) || 1; } catch (e) { /* 忽略 */ }
            let maxLv = 30;
            try { if (this.gameController && this.gameController.maxOpenRaceLevel) maxLv = this.gameController.maxOpenRaceLevel; } catch (e) { /* 忽略 */ }
            if (cur < 1 || cur > maxLv) cur = 1;
            this._leaderboardRaceLevel = cur;
            if (this.leaderboardRaceLevelSel) this.leaderboardRaceLevelSel.value = String(cur);
        } else {
            if (this.leaderboardRaceSel) this.leaderboardRaceSel.style.display = 'none';
        }
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
        // 竞速分关榜：把 tt 标签映射到具体关卡的分榜 rt{level}（每关一张小榜，比单关最快用时）
        const actualBoard = (board === 'tt') ? ('rt' + (this._leaderboardRaceLevel || 1)) : board;
        this._leaderboardActiveBoard = actualBoard;
        // 8 秒超时兜底：服务器未启动 / 断连时避免"加载中"卡死
        if (this._leaderboardQueryTimer) clearTimeout(this._leaderboardQueryTimer);
        this._leaderboardQueryTimer = setTimeout(() => {
            self._leaderboardQuerying = false;
            if (self.leaderboardList && self._leaderboardBoard === board) {
                self.leaderboardList.innerHTML = '<div class="leaderboard-empty">无法连接排行榜服务器，请稍后重试</div>';
            }
        }, 8000);
        svc.query(actualBoard, playerId, (data) => {
            if (self._leaderboardQueryTimer) { clearTimeout(self._leaderboardQueryTimer); self._leaderboardQueryTimer = null; }
            self._leaderboardQuerying = false;
            if (self._leaderboardActiveBoard !== (data && data.boardType)) return; // Tab 已切换，丢弃过期结果
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
        // 竞速分关榜 rtN：用时越短越好，分数后缀带 s
        const isRaceBoard = (typeof boardType === 'string' && boardType.indexOf('rt') === 0 && /^\d+$/.test(boardType.slice(2)));
        const raceLevel = isRaceBoard ? Number(boardType.slice(2)) : 0;

        if (!rows.length) {
            list.innerHTML = '<div class="leaderboard-empty">暂无数据，快来挑战第一名吧！</div>';
        } else {
            let html = '';
            for (const row of rows) {
                const rankClass = row.rank <= 3 ? ` top-${row.rank}` : '';
                let scoreText;
                if (boardType === 'lr') scoreText = Number(row.score).toFixed(6);
                else if (isRaceBoard) scoreText = `${Number(row.score).toFixed(2)}s`;
                else if (boardType === 'tt') scoreText = `${row.score} 速度`;
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
                const myScoreText = isRaceBoard ? `${Number(myScore).toFixed(2)}s` : myScore;
                let label;
                if (boardType === 'lr') label = 'LR∑';
                else if (boardType === 'elo') label = 'ELO';
                else if (isRaceBoard) label = `第 ${raceLevel} 关 用时`;
                else label = '竞速速度值';
                this.leaderboardMyRankEl.textContent = `我的排名：第 ${myRank} 名（${label} ${myScoreText}）`;
            } else {
                this.leaderboardMyRankEl.textContent = '还没有上榜记录，快去打一局吧！';
            }
        }
    }
;

// refreshLeaderboardIfOpen：若排行榜当前处于打开状态，立即重新查询并刷新显示
// （技术分变化后，让玩家无需关闭重开即可看到最新榜单）
    UIController.prototype.refreshLeaderboardIfOpen = function() {
        if (!this.leaderboardModal) return;
        const state = (typeof this._getModalState === 'function') ? this._getModalState(this.leaderboardModal) : '';
        const open = state === 'visible' || state === 'entering';
        if (open) this._queryLeaderboard(this._leaderboardBoard || 'lr');
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
