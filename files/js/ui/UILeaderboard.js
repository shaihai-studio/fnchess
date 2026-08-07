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
        this.raceLevelSelect = document.getElementById('race-level-select');
        this.raceLevelTrigger = document.getElementById('race-level-trigger');
        this.raceLevelDropdown = document.getElementById('race-level-dropdown');
        this._initRaceLevelSelector();

        const openBtn = document.getElementById('leaderboard-open-btn');
        if (openBtn) openBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.openLeaderboard();
        });

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

        // 举报按钮（事件委托，按钮在每行渲染时生成）
        if (this.leaderboardList) {
            this.leaderboardList.addEventListener('click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('[data-action="report"]') : null;
                if (btn) this._leaderboardReport(btn.dataset.target, btn.dataset.name);
            });
        }

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

        // 页面加载后自动同步已通关的闯关记录（老玩家升级新版本后的首次同步；只同步闯关）
        setTimeout(() => {
            if (typeof this.syncCampaignRecordsOnLoad === 'function') this.syncCampaignRecordsOnLoad();
        }, 800);
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
        if (board !== 'lr' && board !== 'tt' && board !== 'elo' && board !== 'comet') return;
        this._leaderboardBoard = board;
        document.querySelectorAll('.leaderboard-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.board === board);
        });
        // 竞速分关榜 / 彗星分关榜：显示关卡选择器；选项按榜单类型与玩家解锁进度重建
        if (board === 'tt' || board === 'comet') {
            if (this.leaderboardRaceSel) this.leaderboardRaceSel.style.display = 'flex';
            this._rebuildRaceLevelOptions(board);
            // 竞速：默认跳到玩家当前所在竞速关
            if (board === 'tt') {
                let cur = 1;
                try { if (this.raceCurrentLevelId) cur = Number(this.raceCurrentLevelId) || 1; } catch (e) { /* 忽略 */ }
                let maxLv = 30;
                try { const _un = (typeof this.getRaceUnlockedLevels === 'function') ? this.getRaceUnlockedLevels() : null; if (_un && _un.size) maxLv = Math.max.apply(null, Array.from(_un)); } catch (e) { /* 忽略 */ }
                if (cur < 1 || cur > maxLv) cur = 1;
                this._leaderboardRaceLevel = cur;
                this._updateRaceLevelTrigger(cur);
            }
        } else {
            if (this.leaderboardRaceSel) this.leaderboardRaceSel.style.display = 'none';
        }
        this._queryLeaderboard(board);
    }
;

// _leaderboardReport
    UIController.prototype._leaderboardReport = function(targetPlayerId, targetName) {
        if (window.audioManager) window.audioManager.playClick();
        const myId = (typeof PlayerProfile !== 'undefined') ? PlayerProfile.getPlayerId() : '';
        if (!targetPlayerId || targetPlayerId === myId) {
            if (typeof this.showMessage === 'function') this.showMessage('不能举报自己', 'error');
            return;
        }
        if (!this._leaderboardService) return;
        if (!window.confirm(`确认举报「${targetName || targetPlayerId}」？\n举报后对方下一次 LR∑ 提交将被强制核验，作弊会被清分。\n（每 90 秒最多举报一次）`)) return;
        this._leaderboardService.report(targetPlayerId, 'cheat');
        if (typeof this.showMessage === 'function') this.showMessage('举报已提交，感谢反馈', 'success');
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
        // 彗星分关榜：把 comet 标签映射到 pl{level}（比单关"越接近全服最优 token"的 10 颗制得分）
        const actualBoard = (board === 'tt') ? ('rt' + (this._leaderboardRaceLevel || 1))
            : (board === 'comet') ? ('pl' + (this._leaderboardRaceLevel || 1)) : board;
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
        // 彗星分关榜 plN（含分数关 pl1/2）：直接比"该关最短 token"，越少越优
        const isCometBoard = (typeof boardType === 'string' && /^pl\d+(?:\/\d+)?$/.test(boardType));
        const cometLevel = isCometBoard ? boardType.slice(2) : '';

        if (!rows.length) {
            list.innerHTML = '<div class="leaderboard-empty">暂无数据，快来挑战第一名吧！</div>';
        } else {
            let html = '';
            for (const row of rows) {
                const rankClass = row.rank <= 3 ? ` top-${row.rank}` : '';
                let scoreText;
                if (boardType === 'lr') scoreText = Number(row.score).toFixed(6);
                else if (isRaceBoard) scoreText = `${Number(row.score).toFixed(2)}s`;
                else if (isCometBoard) scoreText = `${row.score} token`;   // 彗星：显示该关最短 token
                else if (boardType === 'tt') scoreText = `${row.score} 速度`;
                else scoreText = String(row.score);
                const sub = (boardType === 'elo')
                    ? `${row.wins}胜 ${row.losses}负 ${row.draws}平`
                    : '';
                // 举报按钮：仅 LR∑ 榜显示，且不能举报自己
                const reportBtn = (boardType === 'lr' && !row.isMe)
                    ? `<button class="leaderboard-report-btn" data-action="report" data-target="${this._escapeHtml(row.playerId || '')}" data-name="${this._escapeHtml(row.nickname || '')}">举报</button>`
                    : '';
                html += `
                    <div class="leaderboard-row${row.isMe ? ' me' : ''}">
                        <span class="leaderboard-rank${rankClass}">${row.rank}</span>
                        <span class="leaderboard-name">${this._escapeHtml(row.nickname)}${row.isMe ? '<em>(我)</em>' : ''}</span>
                        <span class="leaderboard-score">${scoreText}</span>
                        ${sub ? `<span class="leaderboard-sub">${sub}</span>` : ''}
                        ${reportBtn}
                    </div>`;
            }
            list.innerHTML = html;
        }

        // 我的名次 / 我的分数（未上榜时也显示自己的分数，无记录显示 "-"）
        if (this.leaderboardMyRankEl) {
            const myRank = Number(data && data.myRank);
            const myScore = (data && data.myScore != null) ? data.myScore : null;
            let label;
            if (boardType === 'lr') label = 'LR∑';
            else if (boardType === 'elo') label = 'ELO';
            else if (isRaceBoard) label = `第 ${raceLevel} 关 用时`;
            else if (isCometBoard) label = `彗星 第 ${cometLevel} 关 最短 token`;
            else label = null; // [P6] 不再使用误导性的"竞速速度值"；解析不出榜类型时不显示标签
            if (myRank > 0) {
                const myScoreText = isRaceBoard ? `${Number(myScore).toFixed(2)}s`
                    : isCometBoard ? `${Number(myScore)}`
                    : myScore;
                this.leaderboardMyRankEl.textContent = (label != null) ? `我的排名：第 ${myRank} 名（${label} ${myScoreText}）` : `我的排名：第 ${myRank} 名`;
            } else {
                const mine = (myScore == null)
                    ? '-'
                    : (isRaceBoard ? `${Number(myScore).toFixed(2)}s`
                        : isCometBoard ? `${Number(myScore)}`
                        : String(myScore));
                this.leaderboardMyRankEl.textContent = (label != null) ? `我的分数：${label} ${mine}` : `我的分数：${mine}`;
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

// _initRaceLevelSelector：自定义竞速/彗星关卡下拉（替代原生 select，避免 30 关展开超出屏幕）
    UIController.prototype._initRaceLevelSelector = function() {
        if (!this.raceLevelSelect || !this.raceLevelTrigger || !this.raceLevelDropdown) return;
        this._rebuildRaceLevelOptions('tt');

        const self = this;
        const toggle = () => {
            if (self.raceLevelSelect.classList.contains('open')) {
                self._closeRaceLevelDropdown();
            } else {
                self._openRaceLevelDropdown();
            }
        };
        this.raceLevelTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.audioManager) window.audioManager.playClick();
            toggle();
        });
        this.raceLevelTrigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
        this.raceLevelDropdown.addEventListener('click', (e) => {
            const opt = e.target.closest('.race-level-option');
            if (!opt) return;
            const val = String(opt.dataset.value) || '1';
            self._leaderboardRaceLevel = val;
            self._updateRaceLevelTrigger(val);
            self._closeRaceLevelDropdown();
            if (window.audioManager) window.audioManager.playClick();
            self._queryLeaderboard(self._leaderboardBoard || 'tt');
        });
        document.addEventListener('click', (e) => {
            if (!self.raceLevelSelect) return;
            if (!self.raceLevelSelect.contains(e.target)) self._closeRaceLevelDropdown();
        });
    }
;

// _updateRaceLevelTrigger
    UIController.prototype._updateRaceLevelTrigger = function(level) {
        const key = String(level);
        if (this.raceLevelTrigger) {
            this.raceLevelTrigger.textContent = (key.indexOf('/') >= 0) ? `分数关 ${key}` : `第 ${key} 关`;
        }
        if (this.raceLevelDropdown) {
            this.raceLevelDropdown.querySelectorAll('.race-level-option').forEach((el) => {
                el.classList.toggle('active', String(el.dataset.value) === key);
            });
        }
    }
;

// _rebuildRaceLevelOptions：按榜单类型重建关卡下拉选项
//   竞速（tt）：1..maxOpenRaceLevel（当前可玩的竞速关）
//   彗星（comet）：只显示玩家已解锁的关卡 —— 整数关 1..已通关数，分数关 1/2..1/已通关分数关
    UIController.prototype._rebuildRaceLevelOptions = function(board) {
        if (!this.raceLevelDropdown) return;
        if (board === 'comet') {
            // 只显示玩家已解锁的关卡：整数关 1..(已通关+1)，分数关 1/2..(已通关+1)
            let cleared = 0;
            try { cleared = this.getCampaignClearedMax(); } catch (e) { /* 忽略 */ }
            const intEnd = Math.max(1, Math.min((Number(cleared) || 0) + 1, 90));
            const groups = [];
            for (let start = 1; start <= intEnd; start += 10) {
                const end = Math.min(start + 9, intEnd);
                const items = [];
                for (let i = start; i <= end; i++) items.push({ key: String(i), text: `第 ${i} 关` });
                groups.push({ label: `整数关 ${start}–${end}`, items });
            }
            let fracUnlocked = 0;
            try { fracUnlocked = typeof this.getCampaignFractionUnlockedMax === 'function' ? this.getCampaignFractionUnlockedMax() : 0; } catch (e) { /* 忽略 */ }
            if (Number(fracUnlocked) >= 2) {
                const items = [];
                for (let d = 2; d <= Math.min(Number(fracUnlocked), 20); d++) items.push({ key: `1/${d}`, text: `分数关 1/${d}` });
                groups.push({ label: '分数关', items });
            }
            let html = '';
            for (const g of groups) {
                html += `<div class="race-level-group">${g.label}</div>`;
                for (const it of g.items) html += `<div class="race-level-option" data-value="${it.key}">${it.text}</div>`;
            }
            this.raceLevelDropdown.innerHTML = html;
            const firstKey = groups.length && groups[0].items.length ? groups[0].items[0].key : '1';
            this._leaderboardRaceLevel = firstKey;
            this._updateRaceLevelTrigger(firstKey);
        } else {
            // 竞速：可玩的竞速关 1..maxOpenRaceLevel
            let maxLv = 30;
            try { if (this.gameController && this.gameController.maxOpenRaceLevel) maxLv = this.gameController.maxOpenRaceLevel; } catch (e) { /* 忽略 */ }
            let html = '';
            for (let start = 1; start <= maxLv; start += 10) {
                const end = Math.min(start + 9, maxLv);
                html += `<div class="race-level-group">第 ${start}–${end} 关</div>`;
                for (let i = start; i <= end; i++) html += `<div class="race-level-option" data-value="${i}">第 ${i} 关</div>`;
            }
            this.raceLevelDropdown.innerHTML = html;
            this._leaderboardRaceLevel = 1;
            this._updateRaceLevelTrigger(1);
        }
    }
;

// _openRaceLevelDropdown
    UIController.prototype._openRaceLevelDropdown = function() {
        if (!this.raceLevelSelect) return;
        const rect = this.raceLevelSelect.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        // 下拉面板固定 max-height 200px，优先向下；下方空间不足则向上展开
        this.raceLevelSelect.classList.toggle('open-up', spaceBelow < 210 && spaceAbove > spaceBelow);
        this.raceLevelSelect.classList.add('open');
        const active = this.raceLevelDropdown && this.raceLevelDropdown.querySelector('.race-level-option.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }
;

// _closeRaceLevelDropdown
    UIController.prototype._closeRaceLevelDropdown = function() {
        if (!this.raceLevelSelect) return;
        this.raceLevelSelect.classList.remove('open', 'open-up');
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
