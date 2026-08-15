/**
 * UIRaceBattleMatch —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 对局调度：开局、消息分发、房主丢失与迁移接管
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

UIController.prototype.raceBattleStartMatch = function(params) {
    this._ensureRaceBattleFields();
    // U10: 防重入——消息重复投递时忽略第二次（新对局由 rematch/doLeave 复位 _rbMatchStarted）
    if (this._rbMatchStarted) return;
    this._rbMatchStarted = true;
    this._rbGameParams = params;
    this._rbGoAt = params.goAt || (Date.now() + 4500);
    this.raceBattleRenderMembers();
    this.raceBattleShowPanel(this.raceBattleRoomCode.textContent);
    // 新对局重置"退出结算/继续观战"选择条
    this.raceBattleShowFinishChoice(false);
    // 进度初始化：先显示全员等待起跑
    const list = this._rbMembers;
    const progress = {};
    list.forEach((m) => {
        progress[m.playerId] = {
            level: 1, puzzle: 0, times: [], finished: false,
            disconnected: false, nickname: m.nickname
        };
    });
    this._rbProgress = progress;
    this.raceBattleRenderProgress(progress);
    this.raceBattleSetFeatureLine(this._raceBattleDefaultFeatureLine(params));
    // 排位对局开局即保存恢复上下文（覆盖起跑前刷新场景；字段未就绪的由 _rbUpdateSelfProgress 补齐）
    if (params.ranked) this._rbSaveResumeContext();
    // 第 1 关直接 3-2-1 起跑（基于统一时间戳，杜绝抢先）
    this.raceBattleShowCountdownAt(this._rbGoAt, () => {
        this._raceBattleBeginPlay(params);
    });
};

UIController.prototype._raceBattleDefaultFeatureLine = function(params) {
    const df = RACE_BATTLE_DIFFICULTIES[(params.startLevel || params.difficulty) - 1];
    const levels = params.levels || 3;
    return '难度' + df.name + ' · 连跑 ' + levels + ' 关 · 每关 10 题';
};

// ─── 消息处理（协议层占位，ui-logic 填充具体分支）──────────────

UIController.prototype._raceBattleHandleMessage = function(payload, fromPlayerId) {
    if (!payload || !payload.type) return;
    switch (payload.type) {
        case 'race_battle_params':
            this._rbGameParams = payload;
            this._rbRanked = !!payload.ranked;
            this._rbStamina = payload.stamina || 1;
            this._rbDifficulty = payload.difficulty || 1;
            this.raceBattleStartMatch(payload);
            break;
        case 'race_battle_ready':
            if (payload.ready != null) {
                // 就绪消息由 RoomController.send 注入发送者身份，统一用 fromPlayerId
                this._rbReadyMap[fromPlayerId] = !!payload.ready;
                this.raceBattleRenderMembers();
                if (window.audioManager) { try { window.audioManager.playTick(); } catch (e) {} }
            }
            break;
        case 'race_battle_kick':
            // kick 仅由房主发起并广播给全员，各端自行判断：
            // 房主本地移除目标；被踢访客自识别后退出；其余访客忽略
            if (this._rbIsHost) {
                this._rbMembers = this._rbMembers.filter((m) => m.playerId !== payload.targetId);
                delete this._rbReadyMap[payload.targetId];
                this.raceBattleRenderMembers();
            } else if (payload.targetId === this._rbMyId) {
                this.raceBattleToast('你已被房主移出房间');
                this.raceBattleDoLeave(true); // isKick=true：被动离开，不触发主动退出的 -30 扣分
                // 被踢后强制重渲染成员列表：确保底部「就绪」按钮隐藏（_rbRoomOpen=false 分支生效）
                this.raceBattleRenderMembers();
            }
            break;
        case 'race_battle_dissolve':
            if (this._rbMatchStarted) {
                // 对局中房主主动解散（含完赛退出）：触发迁移让其他玩家继续，
                // 与 race_close(host_dissolved) 语义一致。不能直接作废——否则房主完赛退出后其他人无法继续玩
                if (!this._rbMigrationActive) this._rbStartHostMigration('host_dissolved');
            } else {
                // 未开局：房主解散房间，仅提示不弹结算
                this._rbRoomOpen = false;
                this._raceBattleSetStatus('error', '房间已解散');
                this.raceBattleToast('房主已解散房间');
                // 断开 PeerJS 房间连接并置空：房主已断开，本地若不主动断开，
                // conn close 会误启 60s 重连（重连注定失败、还会残留"正在重连"状态）
                if (this._rbRoom) {
                    try { this._rbRoom.disconnect(); } catch (e) {}
                    this._rbRoom = null;
                }
                this._raceBattleSwitchJoinButton('join');
                this.raceBattleRenderMembers(); // 房间解散：隐藏底部按钮
            }
            break;
        case 'race_battle_rematch':
            if (!this._rbIsHost) {
                this._rbMatchStarted = false;
                this._rbProgress = {};
                this._rbReadyMap = {};
                this.raceBattleSwitchTab('create');
                this.raceBattleRenderParams();
                this.raceBattleRenderMembers();
                this.showModal('race-battle-modal');
            }
            break;
        case 'race_battle_progress':
            this._rbHandleProgressMsg(payload, fromPlayerId);
            break;
        case 'race_battle_level_done':
            this._rbHandleLevelDoneMsg(payload, fromPlayerId);
            break;
        case 'race_battle_finish':
            this._rbHandleFinishMsg(payload, fromPlayerId);
            break;
        case 'race_battle_result':
            this._rbHandleResultMsg(payload);
            break;
        // ── 房主迁移（host migration）协议 ──
        case 'race_progress_request':
            // 新房主请求进度快照 → 回传本人条目（各跑各的，按 playerId 分区）
            if (!this._rbIsHost && this._rbMigrationActive && !this._rbMigrationDone) this._rbSendMigrationSync();
            break;
        case 'race_progress_sync':
            this._rbHandleProgressSyncMsg(payload, fromPlayerId);
            break;
        case 'race_migration_done':
            this._rbHandleMigrationDoneMsg(payload);
            break;
        case 'race_migration_query':
            // 新房主收到访客的补发请求：若迁移已完成则立即重发 migration_done（幂等）
            if (this._rbIsHost && this._rbMigrationDone) this._rbResendMigrationDone();
            break;
        // ── 重连恢复后的完整进度快照同步（不触发迁移收尾，避免污染 _rbMigrationDone）──
        case 'race_full_progress_request':
            // 新房主收到（旧房主/晚连访客）的完整快照请求 → 回发全员进度
            if (this._rbIsHost && this._rbProgress) {
                try { this._rbRoom.send({ type: 'race_full_progress', progress: this._rbProgress }, true); } catch (e) {}
            }
            break;
        case 'race_full_progress':
            // 收到完整快照 → 仅更新进度并重绘，不进入迁移收尾（保持 _rbMigrationDone 不变）
            if (payload && payload.progress && typeof payload.progress === 'object') {
                this._rbProgress = payload.progress;
                this.raceBattleRenderProgress();
            }
            break;
        default:
            if (this._rbOnMessage) {
                try { this._rbOnMessage(payload, fromPlayerId); } catch (e) { console.error(e); }
            }
            break;
    }
};

/** 远端完赛：更新其 finished 状态，房主触发结算检查 */
UIController.prototype._rbHandleFinishMsg = function(payload, fromPlayerId) {
    const p = this._rbProgress[fromPlayerId] || (this._rbProgress[fromPlayerId] = {});
    p.finished = true;
    p.finishTime = payload.elapsed || 0;
    p.puzzle = 10;
    const member = this._rbMembers.find((m) => m.playerId === fromPlayerId);
    if (member) p.nickname = member.nickname;
    this.raceBattleRenderProgress();
    if (this._rbIsHost) this._rbCheckResult();
};

UIController.prototype._raceBattleHandleHostLost = function(reason) {
    // 对局中断（迁移失败/断线弃权）：清理断线恢复上下文，不再提供恢复入口
    this._rbClearResumeContext();
    // 对局已中断：终止迁移状态机（清选举/60s 兜底/同步窗口定时器，置 done），
    // 防止 onReconnectFailed 先弹「对局中断」后，60s 兜底定时器仍触发 _rbAbortMigration、
    // 或 _rbTryPromote 在已中断的对局上继续尝试接管
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    // 房主连接断开：迁移超时兜底（已完成玩家成绩已直连上报，不白打）
    if (window.audioManager) { try { window.audioManager.playError(); } catch (e) {} }
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    // U1: 与 raceBattleShowResult 一致，走 showModal 获取动态 z-index，避免被悬浮键盘盖住
    this.showModal(this.raceBattleResultModal);
    this.raceBattleResultTitle.textContent = '对局中断';
    this.raceBattleResultRanklist.innerHTML = '';
    const self = this.raceBattleResultSelf;
    self.style.display = '';
    if (reason === 'self_finished') self.textContent = '对局中断，你已完成全部关卡，成绩已上报';
    else if (reason === 'reconnect_failed') self.textContent = '网络连接已断开，本局按弃权处理';
    else if (reason === 'user_abort') self.textContent = '你已放弃等待迁移，本局不计成绩';
    else self.textContent = '房主连接断开，迁移失败，本局不计成绩';
    const backBtn = document.getElementById('race-battle-back-btn');
    const rematchBtn = document.getElementById('race-battle-rematch-btn');
    if (backBtn) backBtn.style.display = '';
    if (rematchBtn) rematchBtn.style.display = 'none';
};

// ─── 房主迁移（host migration）状态机 ────────────────────────
// 触发：访客端感知房主退出（掉线 conn_closed / 主动解散 host_dissolved）→ 立即弹窗
// 选举：各访客按 slot×1.5s 错开尝试 promote，PeerJS id 唯一性天然仲裁
// 同步：新房主收集各访客本人进度条目 → 分区组合 → 广播 migration_done 关闭弹窗继续对局

/** 启动迁移：弹窗并调度选举 */
UIController.prototype._rbStartHostMigration = function(reason) {
    this._ensureRaceBattleFields();
    if (!this._rbMatchStarted || this._rbMigrationActive) return;
    if (this._rbIsHost) return; // 房主自己不掉线，无需迁移
    this._rbMigrationActive = true;
    this._rbMigrationDone = false; // 第二次迁移：重置 done，允许重新选举
    this._rbMigrationNewHostName = '';
    this.raceBattleShowMigrationModal(true, '正在重新安排新房主并进行重连与同步…');
    // 按成员序号错开尝试升级：序号越小越先，PeerJS id 唯一性仲裁
    const me = this._rbMembers.find(m => m.playerId === this._rbMyId);
    const slot = (me && me.slot != null) ? me.slot : 1;
    if (this._rbMigrationTimer) clearTimeout(this._rbMigrationTimer);
    this._rbMigrationTimer = setTimeout(() => this._rbTryPromote(), Math.min(slot, 4) * 1500);
    // 总超时兜底：60s 内无法完成迁移 → 回落对局中断
    if (this._rbMigrationAbortTimer) clearTimeout(this._rbMigrationAbortTimer);
    this._rbMigrationAbortTimer = setTimeout(() => this._rbAbortMigration('timeout'), 60000);
};

/** 选举到点：若已重连成功则按目标判断（闪断恢复/新主接管），否则尝试升级为新房主 */
UIController.prototype._rbTryPromote = function() {
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (!this._rbRoom) { this._rbAbortMigration('room_gone'); return; }
    if (this._rbRoom.isConnected && !this._rbRoom._promoting) {
        if (this._rbIsOldHostBack()) this._rbCancelMigration();
        return; // 已连上新房主 → 等 migration_done
    }
    this._rbPromoteAsHost();
};

/** 执行升级；成功则成为新房主并开启进度收集窗口，失败（有人抢先）则保持访客等同步 */
UIController.prototype._rbPromoteAsHost = async function() {
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (!this._rbRoom) { this._rbAbortMigration('room_gone'); return; }
    let ok = false;
    try {
        ok = await this._rbRoom.promoteToHost();
    } catch (e) {
        console.error('[RB-MIGRATE] promoteToHost error', e);
        ok = false;
    }
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    if (ok) {
        // 自己成为新房主：本地进度即本人权威，等待其他访客重连并回传进度
        this._rbIsHost = true;
        this._rbMigrationNewHostName = (window.PlayerProfile && PlayerProfile.getNickname()) || '我';
        // 通知服务端移交房间 hostWs，防止旧房主断开时误删房间
        if (this._rbLobby && this._rbLobbyConnected) {
            try {
                this._rbLobby.notifyHostTransfer(this._rbRoom.roomCode, this._rbMyId, this._rbMigrationNewHostName);
            } catch (e) { console.error(e); }
        }
        this.raceBattleShowMigrationModal(true, '已接管房间，正在同步其他玩家的进度…');
        if (this._rbMigrationSyncTimer) clearTimeout(this._rbMigrationSyncTimer);
        this._rbMigrationSyncTimer = setTimeout(() => this._rbAbortMigration('sync_timeout'), 8000);
        this._rbRequestProgress();
        // 周期重发进度请求：其他访客可能因重连延迟尚未连上而错过首次请求，
        // 每 1.5s 重发一次直到收齐（_rbAllOnlineSynced 触发收尾）或超时，保证晚连访客也能回传
        if (this._rbMigrationProgressTimer) clearInterval(this._rbMigrationProgressTimer);
        this._rbMigrationProgressTimer = setInterval(() => {
            if (this._rbMigrationDone || !this._rbMigrationActive || !this._rbIsHost) {
                clearInterval(this._rbMigrationProgressTimer);
                this._rbMigrationProgressTimer = null;
                return;
            }
            this._rbRequestProgress();
        }, 1500);
    } else {
        // 已有其他访客抢先成为新房主：保持访客，等重连成功或 migration_done
        this.raceBattleShowMigrationModal(true, '新房主已确定，正在重连并同步进度…');
        // 兜底：新房主广播 migration_done 时本端可能尚未重连成功而错过消息，
        // 周期主动 query 请求新房主重发，直到收到或超时，避免弹窗永久挂死
        this._rbStartMigrationQuery();
    }
};

/** 访客侧：迁移待确认时周期向新房主请求重发 migration_done（错过广播的兜底） */
UIController.prototype._rbStartMigrationQuery = function() {
    if (this._rbMigrationQueryTimer) return;
    let tries = 0;
    const self = this;
    const step = () => {
        if (self._rbMigrationDone || !self._rbMigrationActive) {
            self._rbMigrationQueryTimer = null;
            return;
        }
        if (self._rbRoom && !self._rbIsHost) {
            try { self._rbRoom.send({ type: 'race_migration_query' }, false); } catch (e) {}
        }
        tries++;
        if (tries >= 8) { // 约 16s 内新房主未响应 → 交由总超时兜底收尾
            self._rbMigrationQueryTimer = null;
            return;
        }
        self._rbMigrationQueryTimer = setTimeout(step, 2000);
    };
    this._rbMigrationQueryTimer = setTimeout(step, 2000);
};

/** 新房主：向所有已连接访客请求进度快照 */
UIController.prototype._rbRequestProgress = function() {
    if (!this._rbRoom || !this._rbIsHost || this._rbMigrationDone) return;
    this._rbRoom.send({ type: 'race_progress_request' }, true);
};

/** 访客：回传本人进度条目给新房主（各跑各的，按 playerId 分区） */
UIController.prototype._rbSendMigrationSync = function() {
    if (!this._rbRoom || this._rbIsHost) return;
    if (!this._rbProgress || !this._rbProgress[this._rbMyId]) return;
    this._rbRoom.send({ type: 'race_progress_sync', progress: { [this._rbMyId]: this._rbProgress[this._rbMyId] } }, false);
};

/** 新房主：收集各端本人条目，分区组合进本地快照（只信本人自报，未回复者保留迁移前最后快照） */
UIController.prototype._rbHandleProgressSyncMsg = function(payload, fromPlayerId) {
    // 兜底：迁移已完成但收到晚到的进度回传（说明某访客刚连上新房主、正等 migration_done）→ 重发
    if (this._rbIsHost && this._rbMigrationDone) {
        this._rbResendMigrationDone();
        return;
    }
    if (!this._rbIsHost || !this._rbMigrationActive || this._rbMigrationDone) return;
    const pg = payload && payload.progress;
    if (!pg || typeof pg !== 'object') return;
    Object.keys(pg).forEach((id) => {
        if (id !== fromPlayerId) return; // 仅采纳本人自报的条目
        const p = pg[id];
        if (!p || typeof p !== 'object') return;
        const cur = this._rbProgress[id] || {};
        this._rbProgress[id] = {
            level: (p.level != null) ? p.level : (cur.level != null ? cur.level : 1),
            puzzle: (p.puzzle != null) ? p.puzzle : (cur.puzzle != null ? cur.puzzle : 0),
            times: Array.isArray(p.times) ? p.times.slice() : (Array.isArray(cur.times) ? cur.times.slice() : []),
            finished: !!p.finished,
            finishTime: p.finishTime || 0,
            disconnected: !!p.disconnected,
            nickname: (p.nickname || cur.nickname || '玩家'),
            _synced: true
        };
        const member = this._rbMembers.find(m => m.playerId === id);
        if (member && member.nickname) this._rbProgress[id].nickname = member.nickname;
    });
    this.raceBattleRenderProgress();
    // 若全部在线成员均已回传 → 提前广播迁移完成
    if (this._rbAllOnlineSynced()) {
        if (this._rbMigrationSyncTimer) { clearTimeout(this._rbMigrationSyncTimer); this._rbMigrationSyncTimer = null; }
        this._rbBroadcastMigrationDone();
    }
};

/** 新房主：检查除自己外的在线成员是否都已回传进度 */
UIController.prototype._rbAllOnlineSynced = function() {
    const online = this._rbMembers.filter(m => m.playerId !== this._rbMyId && m.connected);
    if (!online.length) return true; // 没有其他在线成员，无需等待
    return online.every(m => this._rbProgress[m.playerId] && this._rbProgress[m.playerId]._synced);
};

/** 新房主：广播迁移完成（合并后完整快照）并收尾 */
UIController.prototype._rbBroadcastMigrationDone = function() {
    if (!this._rbIsHost || !this._rbMigrationActive) return;
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true; // 防重入
    try {
        this._rbRoom.send({ type: 'race_migration_done', newHost: this._rbMigrationNewHostName, progress: this._rbProgress }, true);
    } catch (e) { console.error(e); }
    this._rbFinishMigration();
};

/** 新房主：重发迁移完成通知（无 Active/Done 守卫）。
 *  用于兜底「晚于 migration_done 才连上新房主的访客」——对方只缺这一条消息，
 *  重发是幂等的（访客 _rbHandleMigrationDoneMsg 已处理过则直接 return）。 */
UIController.prototype._rbResendMigrationDone = function() {
    if (!this._rbIsHost || !this._rbRoom || !this._rbProgress) return;
    try {
        this._rbRoom.send({ type: 'race_migration_done', newHost: this._rbMigrationNewHostName, progress: this._rbProgress }, true);
    } catch (e) {}
};

/** 访客：收到新房主广播，覆盖本地快照并收尾 */
UIController.prototype._rbHandleMigrationDoneMsg = function(payload) {
    if (this._rbMigrationDone) return;
    const pg = payload && payload.progress;
    if (pg && typeof pg === 'object') this._rbProgress = pg; // 新房主合并后的完整快照
    this._rbMigrationNewHostName = (payload && payload.newHost) || '新房主';
    this._rbFinishMigration();
};

/** 迁移收尾（两端通用）：关弹窗、清定时器、渲染进度、提示继续 */
UIController.prototype._rbFinishMigration = function() {
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    this.raceBattleRenderProgress();
    this.raceBattleToast('房主已转移为 ' + this._rbMigrationNewHostName + '，对局继续');
    // 新房主侧：若已有玩家全部完成 → 触发结算检查
    if (this._rbIsHost) this._rbCheckResult();
};

/** 房主闪断重连成功：取消迁移直接继续 */
UIController.prototype._rbCancelMigration = function() {
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    this.raceBattleToast('房主连接已恢复，对局继续');
};

/** 迁移超时兜底：新房主侧强制广播继续；访客侧回落对局中断 */
UIController.prototype._rbAbortMigration = function(reason) {
    if (this._rbMigrationDone) return;
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    if (this._rbIsHost) {
        // 部分成员未在窗口内回传：保留其迁移前最后快照，直接广播迁移完成继续对局
        this._rbMigrationDone = false;
        this._rbBroadcastMigrationDone();
        return;
    }
    const me = this._rbProgress[this._rbMyId];
    if (me && me.finished) {
        this._raceBattleHandleHostLost('self_finished'); // 成绩已直连上报，不白打
    } else {
        this._raceBattleHandleHostLost('reconnect_failed');
    }
};

/** 清理迁移定时器 */
UIController.prototype._rbClearMigrationTimers = function() {
    if (this._rbMigrationTimer) { clearTimeout(this._rbMigrationTimer); this._rbMigrationTimer = null; }
    if (this._rbMigrationAbortTimer) { clearTimeout(this._rbMigrationAbortTimer); this._rbMigrationAbortTimer = null; }
    if (this._rbMigrationSyncTimer) { clearTimeout(this._rbMigrationSyncTimer); this._rbMigrationSyncTimer = null; }
    if (this._rbMigrationProgressTimer) { clearInterval(this._rbMigrationProgressTimer); this._rbMigrationProgressTimer = null; }
    if (this._rbMigrationAbortBtnTimer) { clearTimeout(this._rbMigrationAbortBtnTimer); this._rbMigrationAbortBtnTimer = null; } // U7: 10s 放弃按钮计时器
    if (this._rbMigrationQueryTimer) { clearTimeout(this._rbMigrationQueryTimer); this._rbMigrationQueryTimer = null; }
};

/** 迁移弹窗开关（遮罩拦截点击，关闭按钮由 10s 后出现的「放弃对局」承担，迁移完成/兜底两条路径关闭） */
UIController.prototype.raceBattleShowMigrationModal = function(show, statusText) {
    this._ensureRaceBattleFields();
    const modal = this.raceBattleMigrationModal;
    if (!modal) return;
    const wasHidden = modal.style.display !== 'flex';
    modal.style.display = show ? 'flex' : 'none';
    const abortBtn = this.raceBattleMigrationAbortBtn;
    if (!show) {
        // 关闭弹窗：清除 10s 放弃按钮计时器并隐藏按钮
        if (this._rbMigrationAbortBtnTimer) { clearTimeout(this._rbMigrationAbortBtnTimer); this._rbMigrationAbortBtnTimer = null; }
        if (abortBtn) abortBtn.style.display = 'none';
    } else if (wasHidden && abortBtn) {
        // 首次显示：重置 10s 计时（后续状态文字更新不重置，保证从打开起算）
        if (this._rbMigrationAbortBtnTimer) clearTimeout(this._rbMigrationAbortBtnTimer);
        abortBtn.style.display = 'none';
        this._rbMigrationAbortBtnTimer = setTimeout(() => {
            this._rbMigrationAbortBtnTimer = null;
            // 弹窗仍打开时再显示，否则忽略
            if (modal.style.display === 'flex') abortBtn.style.display = 'inline-block';
        }, 10000);
    }
    if (show && statusText && this.raceBattleMigrationStatus) {
        this.raceBattleMigrationStatus.textContent = statusText;
    }
    if (show && window.audioManager) { try { window.audioManager.playRaceAlert(); } catch (e) {} }
};

/** U7: 玩家主动放弃迁移——关闭迁移弹窗并回落对局中断（已通关则保留成绩） */
UIController.prototype.raceBattleAbortMigration = function() {
    this._ensureRaceBattleFields();
    if (!this._rbMigrationActive || this._rbMigrationDone) return;
    // 若已成功接管成为新房主（弹窗状态"已接管房间"）：走原 timeout 兜底逻辑——
    // 广播 migration_done 继续对局，避免误把本可继续的对局中断
    if (this._rbIsHost) { this._rbAbortMigration('user_abort'); return; }
    this._rbMigrationDone = true;
    this._rbMigrationActive = false;
    this._rbClearMigrationTimers();
    this.raceBattleShowMigrationModal(false);
    const me = this._rbProgress[this._rbMyId];
    if (me && me.finished) {
        this._raceBattleHandleHostLost('self_finished'); // 成绩已直连上报，不白打
    } else {
        this._raceBattleHandleHostLost('user_abort');
    }
};

