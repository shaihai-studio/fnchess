/**
 * UIRaceBattleRoom —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 房间：建房/加入、成员列表、就绪/踢人/开始、离开/解散
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

UIController.prototype.raceBattleStepStamina = function(delta) {
    this._ensureRaceBattleFields();
    const max = RACE_BATTLE_STAMINA.length;
    this._rbStamina = Math.max(1, Math.min(max, this._rbStamina + delta));
    const allowed = RACE_BATTLE_STAMINA[this._rbStamina - 1].maxDiff;
    if (this._rbDifficulty > allowed) this._rbDifficulty = allowed;
    this.raceBattleRenderParams();
};

UIController.prototype.raceBattleStepDifficulty = function(delta) {
    this._ensureRaceBattleFields();
    const allowed = RACE_BATTLE_STAMINA[this._rbStamina - 1].maxDiff;
    this._rbDifficulty = Math.max(1, Math.min(allowed, this._rbDifficulty + delta));
    this.raceBattleRenderParams();
};

UIController.prototype.raceBattleRenderParams = function() {
    this._ensureRaceBattleFields();
    const n = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    this.raceBattleStaminaDots.textContent = n + ' 关';
    const df = RACE_BATTLE_DIFFICULTIES[this._rbDifficulty - 1];
    this.raceBattleDifficultyBadge.textContent = df.name;
    this.raceBattleDifficultyBadge.className = 'stepper-value';
    // 竞速排位/休闲局：段位标签按选中模式动态显示
    if (this.raceBattleRankTag) {
        if (this._rbRanked) {
            this.raceBattleRankTag.classList.add('is-ranked');
            this.raceBattleRankTag.textContent = '排位局 · 计竞速积分';
        } else {
            this.raceBattleRankTag.classList.remove('is-ranked');
            this.raceBattleRankTag.textContent = '休闲局 · 不增减积分';
        }
    }
    // 访客只读：房间已开且非房主时禁用参数操作
    const params = document.querySelector('.p2p-selectors-left');
    if (params) params.classList.toggle('is-readonly', !this._rbIsHost && this._rbRoomOpen);
};

UIController.prototype.raceBattleCopyCode = function() {
    this._ensureRaceBattleFields();
    const code = this.raceBattleRoomCode.textContent || '';
    if (code.length !== 6) return;
    const done = () => {
        this.raceBattleCopyBtn.textContent = '已复制';
        this.raceBattleCopyBtn.classList.add('copied');
        setTimeout(() => {
            this.raceBattleCopyBtn.textContent = '复制';
            this.raceBattleCopyBtn.classList.remove('copied');
        }, 1200);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => {});
    else done();
};
// ─── 建房 / 加入 ────────────────────────────────────────────────

UIController.prototype.raceBattleCreateRoom = function(optCode) {
    // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
    if (this._guardPendingOnlineMatch()) return;
    this._ensureRaceBattleFields();
    // 已在房间中：明确提示，避免用户重复创建导致状态错乱（2026-08-13）
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) {
        this.raceBattleToast('你已在该房间中（房间码 ' + this._rbRoom.roomCode + '），无需重复创建');
        return;
    }
    // U5: UI 层互斥——创建/加入任一进行中直接返回，避免连点重复建房
    if (this._rbBusy) return;
    this._rbBusy = true;
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = '';
    // 创建tab建房：固定随机 6 位普通房间码（长效模式仅大厅 tab 提供）
    let code = optCode;
    if (!code) {
        code = String(Math.floor(100000 + Math.random() * 900000));
    }
    const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';
    this.raceBattleRoomCode.textContent = code;
    this._raceBattleSetStatus('connecting', '正在创建房间…');
    this._rbIsHost = true;
    this._rbMyId = 'racehost_' + code;

    if (!this._rbRoom) this._rbRoom = new RaceRoomController();
    const room = this._rbRoom;
    this._bindRaceBattleRoomCallbacks(room);
    return room.createRoom({ roomCode: code, maxPlayers: 4, playerId: this._rbMyId, nickname, profileId: this._rbProfileId(), mode: this._rbRanked ? 'ranked' : 'casual' }).then((ok) => {
        if (!ok) {
            // U5: 创建被拒/失败立即复位；成功时 _rbBusy 保持 true 直到 onStatusChange(connected/error)，
            // 覆盖「Peer 信令连接中」的挂起窗口，防止切 tab 加入互相覆盖状态
            this._rbBusy = false;
            if (createBtn) createBtn.disabled = false;
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
            this._raceBattleSetStatus('error', '房间创建失败，请检查网络后重试');
        }
        return ok;
    });
};

/** 竞速访客加入房间。skipLookup=true 表示来源为大厅列表 onJoinAccepted（房间已由服务器确认是竞速房），跳过类型查询 */
UIController.prototype.raceBattleJoinRoom = function(skipLookup) {
    // 统一守卫：进入任意对局前检查是否有未完成的联机排位对局，有则弹恢复询问
    if (this._guardPendingOnlineMatch()) return;
    this._ensureRaceBattleFields();
    // 已在房间中：明确提示，避免访客重复加入覆盖当前连接状态（2026-08-13）
    if (this._rbRoom && this._rbRoomOpen) {
        this.raceBattleToast('你已在该房间中（房间码 ' + (this._rbRoom.roomCode || this.raceBattleRoomCode.textContent || '') + '），无需重复加入');
        return;
    }
    // U5: UI 层互斥——创建/加入任一进行中直接返回，避免创建挂起时切 tab 加入互相覆盖状态
    if (this._rbBusy) return;
    const code = (this.raceBattleJoinInput.value || '').trim().replace(/[^0-9]/g, '');
    if (code.length !== 6) {
        this.raceBattleJoinError.textContent = '请输入 6 位数字房间码';
        return;
    }
    const doJoin = () => {
        this._rbBusy = true; // U5: 置位互斥标志（doJoin 内部是真正的异步连接）
        this.raceBattleJoinError.textContent = '';
        this.raceBattleRoomCode.textContent = code;
        this._raceBattleSetStatus('connecting', '正在连接房间…');
        this._rbIsHost = false;
        this._rbMyId = 'raceguest_' + Math.random().toString(36).substr(2, 9);
        const nickname = (typeof PlayerProfile !== 'undefined' && PlayerProfile.getNickname ? (PlayerProfile.getNickname() || '') : '') || '玩家';

        if (!this._rbRoom) this._rbRoom = new RaceRoomController();
        const room = this._rbRoom;
        this._bindRaceBattleRoomCallbacks(room);
        room.joinRoom({ roomCode: code, playerId: this._rbMyId, nickname, profileId: this._rbProfileId(), mode: this._rbRanked ? 'ranked' : 'casual' }).then((ok) => {
            if (!ok) {
                // U5: 加入被拒/失败立即复位；成功时保持 true 直到 onStatusChange(connected/error)
                this._rbBusy = false;
                this._raceBattleSetStatus('error', '加入失败，请确认房间码后重试');
            }
        });
    };
    if (skipLookup) { doJoin(); return; }
    // 先向服务器查询房间码类型：若为 1v1 联机对战房间（isRace=false 且 isP2P=true），提示模式不对，不发连接
    const doLookup = () => {
        if (!this._rbLobby || typeof this._rbLobby.lookupRoom !== 'function') { doJoin(); return; }
        let settled = false;
        const fallback = () => { if (!settled) { settled = true; doJoin(); } };
        this._rbLobby.onRoomLookupResult = (data) => {
            if (settled) return;
            if (String(data.code) !== code) return;
            settled = true;
            if (data.found && !data.isRace) {
                this.raceBattleJoinError.textContent = '该房间为联机对战房间，请到联机对战中进入';
                this._raceBattleSetStatus('error', '该房间为联机对战房间，请到联机对战中进入');
                return;
            }
            doJoin();
        };
        this._rbLobby.lookupRoom(code);
        setTimeout(fallback, 2500); // 查询超时兜底：正常走 PeerJS 连接（原有报错提示）
    };
    if (this._rbLobby && this._rbLobby.isConnected) {
        doLookup();
    } else if (this._rbLobby) {
        // 大厅 WS 尚未连好：确保连接，等连接成功后补发查询
        const lobby = this._rbLobby;
        const prev = lobby.onConnectionChange;
        let timer = null;
        const wait = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            doLookup();
        };
        lobby.onConnectionChange = (connected) => {
            if (connected) wait();
            if (prev) prev(connected);
        };
        if (!lobby.isConnected) lobby.connect();
        if (!timer) timer = setTimeout(() => { doJoin(); }, 3000); // 3s 连不上兜底
    } else {
        doJoin();
    }
};

// ─── 房间回调绑定 ────────────────────────────────────────────────

UIController.prototype._bindRaceBattleRoomCallbacks = function(room) {
    room.onStatusChange = (status, msg) => {
        // U5: 建房/加入的异步挂起窗口在此关闭（createRoom/joinRoom 返回 resolve 后 peer.open 才真正连接完成）
        if (status === 'connected' || status === 'error') this._rbBusy = false;
        if (status === 'connected') {
            this._rbRoomOpen = true;
            this._raceBattleSetStatus('connected', msg || '已连接');
            // 竞速排位断线恢复：joinRoom 成功后用已持久化的上下文恢复对局 UI
            if (this._rbResuming && this._rbResumeCtx) {
                const ctx = this._rbResumeCtx;
                this._rbRestoreMatchFromCtx(ctx);
            }
            if (this._rbIsHost) {
                if (this._rbCreateViaLobby) {
                    // 从大厅创建：留在大厅 tab（可立即看到"删除"按钮）
                    this._rbCreateViaLobby = false;
                } else {
                    this.raceBattleSwitchTab('create');
                }
                // 始终显示六位房间码
                const disp = document.getElementById('race-battle-room-code-display');
                if (disp) disp.style.display = '';
                this.raceBattleMembersCount.textContent = '1/4';
            } else {
                // 2026-08-11：访客连接成功后将加入按钮变为离开按钮
                this._raceBattleSwitchJoinButton('leave');
                // 访客加入成功：底部「开始竞速」按钮复用为「就绪」按钮，需显示
                if (this.raceBattleStartBtn) this.raceBattleStartBtn.style.display = '';
            }
        } else if (status === 'error') {
            this._raceBattleSetStatus('error', msg || '连接错误');
            // 恢复流程中连接失败（如房主已超时移除/房间关闭）：清恢复上下文并回主菜单。
            // 关键修复：仅"尚未真正进入对局"时才回主页；已在对局中（含恢复后继续比赛）的连接抖动
            // 只提示，走正常断线/迁移流程，绝不把正在对局的玩家弹回主页面。
            if (this._rbResuming && !this._rbMatchStarted) {
                this._rbClearResumeContext();
                this.raceBattleToast('恢复失败，本局已结束');
                this.showSplash();
            }
        } else if (status === 'disconnected') {
            this._raceBattleSetStatus('disconnected', msg || '连接已断开');
            // 恢复流程中连接彻底断开（60s 重连放弃后走 disconnected）：清上下文回主菜单，
            // 否则 _rbResuming 残留，用户会卡在"正在恢复对局…"界面
            if (this._rbResuming && !this._rbMatchStarted) {
                this._rbClearResumeContext();
                this.raceBattleToast('恢复失败，本局已结束');
                this.showSplash();
            }
        } else {
            // connecting/waiting 等过渡状态：仅更新状态文案。
            // 关键修复：joinRoom 内部 _notifyStatus('connecting') 会先于连接建立同步触发，
            // 若把 connecting 误判为"恢复失败"清上下文并 showSplash，恢复按钮一按就被弹回主页面。
            this._raceBattleSetStatus('connecting', msg || '连接中…');
        }
    };
    room.onMembersUpdate = (members) => {
        this._rbMembers = members.slice();
        // 同步 _rbReadyMap：继承已有就绪状态，新增成员默认 false
        const prev = this._rbReadyMap || {};
        this._rbReadyMap = {};
        members.forEach((m) => {
            this._rbReadyMap[m.playerId] = m.isHost ? true : !!prev[m.playerId];
        });
        // 批量查询未缓存的成员竞速段位（避免成员行显示"未定段"）；查询用 profileId 持久身份而非临时 playerId
        this._rbQueryRaceRanks(this._rbMembers.map((m) => m.profileId || m.playerId));
        this.raceBattleRenderMembers();
    };
    room.onMemberJoined = (member) => {
        this._rbMembers.push(member);
        this._rbReadyMap[member.playerId] = false;
        this._rbQueryRaceRanks([member.profileId || member.playerId]);
        this.raceBattleRenderMembers();
        // 2026-08-12 修复重复音效：移除 click（playUIButtonSound），只保留加入成功音
        if (window.audioManager) { try { window.audioManager.playSuccess(); } catch (e) {} }
        this.raceBattleToast(member.nickname + ' 加入了房间');
    };
    room.onMemberState = (member) => {
        this._rbHandleMemberState(member);
        this.raceBattleRenderMembers();
    };
    room.onReconnected = () => {
        this._rbHandleReconnected();
    };
    room.onMemberLeft = (member) => {
        if (this._rbMatchStarted) this._rbHandleMemberLeftInMatch(member);
        this._rbMembers = this._rbMembers.filter((m) => m.playerId !== member.playerId);
        delete this._rbReadyMap[member.playerId];
        if (this._rbMatchStarted) {
            // 对局中：掉线成员标记弃权并保留进度记录，结算时排名垫底而非被遗忘
            const p = this._rbProgress[member.playerId] || (this._rbProgress[member.playerId] = {});
            p.abandoned = true;
            p.disconnected = true;
            if (!p.nickname) p.nickname = member.nickname;
        } else {
            delete this._rbProgress[member.playerId];
        }
        this.raceBattleRenderMembers();
        if (!this._rbMatchStarted) {
            this.raceBattleToast(member.nickname + ' 离开了房间');
            if (window.audioManager) { try { window.audioManager.playTick(); } catch (e) {} }
        } else if (window.audioManager) {
            // 对局中成员掉线弃权
            try { window.audioManager.playRaceAlert(); } catch (e) {}
        }
    };
    // 被房主踢出：清理房间状态 + 弹窗提示（race_member_left 带 kicked 标记时触发）
    room.onKicked = (member) => {
        this.raceBattleToast('你已被房主移出房间');
        // isKick=true：被动离开，不触发主动退出的 -30 扣分；内部会恢复房间弹窗主界面
        this.raceBattleDoLeave(true);
        // 被踢后强制重渲染成员列表：确保底部「就绪」按钮隐藏（_rbRoomOpen=false 分支生效）
        this.raceBattleRenderMembers();
        // 弹窗提示被移出（确定后返回竞速房间弹窗主界面）
        const kickedModal = this.raceBattleKickedModal || (this.raceBattleKickedModal = document.getElementById('race-battle-kicked-modal'));
        if (kickedModal) this.showModal('race-battle-kicked-modal');
    };
    room.onRoomClosed = (reason) => {
        this._rbRoomOpen = false;
        this._rbKeepHostWaiting = false;
        if (this._rbMatchStarted) {
            // 对局中房主主动解散：迁移流程由 onHostLost 统一接管，不在这里中断
            if (reason !== 'host_dissolved') this._raceBattleHandleHostLost(reason);
        } else {
            this._raceBattleSetStatus('error', '房间已解散');
            this.raceBattleToast(reason === 'host_exit' ? '房主已解散房间' : '房间已关闭');
            // 房间已解散：断开连接、清空成员与就绪状态，回到"未进入房间"状态，
            // 允许重新创建房间、调整关卡数与难度、加入其他房间
            if (this._rbRoom) {
                try { this._rbRoom.disconnect(); } catch (e) {}
                this._rbRoom = null;
            }
            this._rbMembers = [];
            this._rbReadyMap = {};
            this._rbMatchStarted = false;
            this._raceBattleSwitchJoinButton('join');
            this.raceBattleRenderParams();  // 恢复耐力/难度可调
            this.raceBattleRenderMembers(); // 清空成员列表 + 隐藏底部按钮
        }
    };
    room.onHostLost = (reason) => {
        // 对局中房主退出（掉线/主动解散）→ 立即进入迁移流程，不再傻等 60s
        if (this._rbMatchStarted && !this._rbMigrationActive) this._rbStartHostMigration(reason);
    };
    room.onReconnectingChange = (reconnecting) => {
        this.raceBattleWaitHint.style.display = reconnecting ? '' : 'none';
        if (reconnecting) {
            this._raceBattleSetStatus('connecting', '连接不稳定，正在重连…');
            if (this._rbMatchStarted) this.raceBattleRenderProgress();
        }
    };
    room.onReconnectFailed = () => {
        this.raceBattleWaitHint.style.display = 'none';
        // 对局中重连失败：提示中断本局（房主端 60s 超时后会将本方判负结算）
        if (this._rbMatchStarted) this._raceBattleHandleHostLost('reconnect_failed');
    };
    room.onMessage = (payload, fromPlayerId) => {
        this._raceBattleHandleMessage(payload, fromPlayerId);
    };
};

// ─── 成员列表渲染 ───────────────────────────────────────────────

UIController.prototype.raceBattleRenderMembers = function() {
    if (!this._rbReady) return;
    this.raceBattleMembers.innerHTML = '';
    const list = this._rbMembers;
    this.raceBattleMembersCount.textContent = list.length + '/4';

    // 未创建/未加入房间前隐藏底部按钮（房主=开始竞速，访客=就绪/取消就绪），入房后才显示
    if (this.raceBattleStartBtn) this.raceBattleStartBtn.style.display = this._rbRoomOpen ? '' : 'none';

    const allReady = list.length >= 2 && list.every((m) => m.isHost || this._rbReadyMap[m.playerId]);
    if (this._rbIsHost) {
        this.raceBattleStartBtn.disabled = this._rbMatchStarted || !allReady;
        if (list.length < 2) this.raceBattleStartBtn.textContent = '等待玩家...';
        else if (!allReady) this.raceBattleStartBtn.textContent = '等待就绪...';
        else this.raceBattleStartBtn.textContent = '开始竞速';
    } else {
        // 访客端：底部按钮复用为「就绪/取消就绪」
        this.raceBattleStartBtn.disabled = this._rbMatchStarted;
        this.raceBattleStartBtn.textContent = this._rbReadyMap[this._rbMyId] ? '取消就绪' : '就绪';
    }

    if (list.length === 0) return;
    list.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'race-battle-member';
        if (m.playerId === this._rbMyId) row.classList.add('is-me');

        const nick = document.createElement('span');
        nick.className = 'race-battle-member-nick';
        nick.textContent = m.nickname;
        nick.title = m.nickname;
        row.appendChild(nick);

        const badge = document.createElement('span');
        badge.className = 'race-battle-member-badge';
        badge.textContent = this._raceBattleGetRankBadge(m.profileId || m.playerId);
        row.appendChild(badge);

        const role = document.createElement('span');
        role.className = 'race-battle-member-role';
        role.textContent = m.isHost ? '房主' : '访客';
        row.appendChild(role);

        if (m.connected === false) {
            const dc = document.createElement('span');
            dc.className = 'race-battle-member-disconnected';
            dc.textContent = '重连中';
            row.appendChild(dc);
        } else if (!m.isHost) {
            const ready = !!this._rbReadyMap[m.playerId];
            const rd = document.createElement('span');
            rd.className = 'race-battle-member-ready' + (ready ? ' is-ready' : '');
            rd.textContent = ready ? '已就绪' : '未就绪';
            row.appendChild(rd);
        }

        if (this._rbIsHost && !m.isHost) {
            const kick = document.createElement('button');
            kick.className = 'race-battle-kick-btn';
            kick.textContent = '踢出';
            kick.addEventListener('click', () => this.raceBattleKickMember(m.playerId));
            row.appendChild(kick);
        }

        this.raceBattleMembers.appendChild(row);
    });
};

/** 竞速成绩身份（持久）：与成绩上报 submitRaceScore 同 key，段位查询/展示必须用它（临时 playerId racehost_/raceguest_ 查不到 raceBoard） */
UIController.prototype._rbProfileId = function() {
    return (typeof PlayerProfile !== 'undefined' && PlayerProfile.getPlayerId ? (PlayerProfile.getPlayerId() || '') : '') || '';
};

UIController.prototype._raceBattleGetRankBadge = function(playerId) {
    const ranks = this._rbRanks || {};
    if (ranks[playerId]) return ranks[playerId];
    // 查询仍在进行中 → 显示"加载中…"，查出来后再替换为真实段位
    if (this._rbRanksPending && this._rbRanksPending[playerId]) return '加载中…';
    return '未定段';
};

/** 批量查询玩家竞速段位并填充 _rbRanks（去重已缓存/查询中项，避免 N+1 重复请求） */
UIController.prototype._rbQueryRaceRanks = function(playerIds) {
    const lobby = this._rbLobby;
    if (!lobby || typeof lobby.queryPlayerRaceRank !== 'function') return;
    const need = [];
    const seen = {};
    (Array.isArray(playerIds) ? playerIds : []).forEach((pid) => {
        if (!pid || seen[pid]) return;
        seen[pid] = true;
        if (!this._rbRanks[pid] && !this._rbRanksPending[pid]) need.push(pid);
    });
    if (!need.length) return;
    const self = this;
    need.forEach((pid) => {
        this._rbRanksPending[pid] = true;
        // 超时兜底：网络丢包/服务器无响应时从"加载中…"回退"未定段"，
        // 但不写入 _rbRanks，后续渲染（成员变动/房间刷新）会重新查询
        const timer = setTimeout(() => {
            delete self._rbRanksPending[pid];
            delete self._rbRanksTimeout[pid];
            self._renderRaceLobbyRooms();
            self.raceBattleRenderMembers();
        }, 8000);
        if (this._rbRanksTimeout[pid]) clearTimeout(this._rbRanksTimeout[pid]);
        this._rbRanksTimeout[pid] = timer;
    });
    lobby.queryPlayerRaceRank(need, 'race-rank');
};

/** "仅同段位可见"开关是否开启 */
UIController.prototype._rbLobbyTierFilter = function() {
    return !!(this.raceLobbyTierToggle && this.raceLobbyTierToggle.checked);
};

UIController.prototype.raceBattleToggleReady = function() {
    if (!this._rbRoom) return;
    const ready = !this._rbReadyMap[this._rbMyId];
    this._rbReadyMap[this._rbMyId] = ready;
    this.raceBattleRenderMembers();
    this._rbRoom.send({ type: 'race_battle_ready', ready: !!ready }, true); // 广播：其他访客也能看到本人就绪状态
    if (this.playUIButtonSound) this.playUIButtonSound();
};

UIController.prototype.raceBattleKickMember = function(playerId) {
    if (!this._rbRoom || !this._rbIsHost) return;
    var member = this._rbMembers.find(function(m) { return m.playerId === playerId; });
    if (member) {
        this.raceBattleToast(member.nickname + ' 已被移出房间');
        // 2026-08-12 修复重复音效：反馈音由 onMemberLeft 统一播放（等待期 tick / 对局中 alert），这里不再重复
    }
    // RaceRoomController 负责关闭连接 + 广播 + 禁止重入
    this._rbRoom.kickMember(playerId);
    // onMemberLeft 回调会自动更新 _rbMembers 与 DOM，此处不需要手动操作
};

UIController.prototype.raceBattleStart = function() {
    if (!this._rbRoom) return;
    if (!this._rbIsHost) {
        // 访客端：底部按钮已复用为就绪按钮，点击即切换就绪状态
        this.raceBattleToggleReady();
        return;
    }
    const list = this._rbMembers;
    if (list.length < 2 || !list.every((m) => m.isHost || this._rbReadyMap[m.playerId])) return;
    const levels = RACE_BATTLE_STAMINA[this._rbStamina - 1].levels;
    const params = {
        type: 'race_battle_params',
        stamina: this._rbStamina,
        difficulty: this._rbDifficulty,
        ranked: this._rbRanked,
        levels: levels,
        startLevel: this._rbDifficulty,
        seeds: this._raceBattleBuildSeeds(this._rbDifficulty, levels),
        goAt: Date.now() + 4500   // 统一起跑时间戳：3s 倒计时 + 0.5s 缓冲
    };
    this._rbGameParams = params;
    this._rbRoom.send(params, true);
    // 竞速房开局：通知大厅移除房间（竞速房暂不支持观战，不保留在大厅）
    if (this._rbLobby && this._rbLobbyOpen) {
        try { this._rbLobby.notifyStarted(this._rbLobby.myRoomCode, false); } catch (e) {}
        this._rbLobbyOpen = false;
        this._rbLobbyExpiresAt = 0;
        if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.style.display = '';
        if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    }
    this._rbKeepHostWaiting = false;
    this._stopHostRoomBanner(); // 开局后竞速有进度面板，顶部胶囊隐藏
    this._rbStopLobbyTtlTimer();
    this.raceBattleStartMatch(params);
};

/** 房主随机出题：生成 levels 个随机种子（不再固定派生），保证每局关卡各不相同。
 *  仅房主调用一次；访客经 race_battle_params.seeds 接收，全员拿到同一份卷子。 */
UIController.prototype._raceBattleBuildSeeds = function(startLevel, levels) {
    const seeds = [];
    const base = (Date.now() % 1000000) + (Number(startLevel) || 0) * 131;  // 时间基底 + 难度扰动，配合随机数避免重复
    for (let i = 0; i < levels; i++) {
        seeds.push(base + Math.floor(Math.random() * 1000000) + i * 7919);
    }
    return seeds;
};

// ─── 离开 / 解散确认 ────────────────────────────────────────────

/** 将加入房间按钮切换为「加入」或「离开」模式 */
UIController.prototype._raceBattleSwitchJoinButton = function(mode) {
    const btn = document.getElementById('race-battle-join-btn');
    if (!btn) return;
    this._rbJoinBtnMode = mode;
    if (mode === 'leave') {
        btn.textContent = '离开房间';
        // 2026-08-11 修复：改用 p2p-action-btn 保持全宽，避免按钮缩成内容宽度（原 p2p-back-btn 无 width:100%）
        btn.className = 'btn btn-secondary p2p-action-btn';
    } else {
        btn.textContent = '加入房间';
        btn.className = 'btn btn-primary p2p-action-btn';
    }
};

UIController.prototype.raceBattleConfirmLeave = function() {
    this._ensureRaceBattleFields();
    if (!this.raceBattleExitModal) return;
    // U3: 注册 ESC/遮罩关闭（等价"取消"，保持 2026-08-11 修复的 showModal 动态 z-index 行为）
    this.bindModalDismiss(this.raceBattleExitModal, () => this.raceBattleCancelLeave());
    const isRanked = this._rbRanked && this._rbMatchStarted;
    const p = this.raceBattleExitModal.querySelector('p');
    if (p) {
        p.textContent = isRanked
            ? '确定要退出当前竞速对局吗？退出后本局判负并扣除 30 分。'
            : '确定要离开房间吗？';
    }
    // 2026-08-11 修复弹窗不显示：必须走 showModal() 获得动态 z-index（10000 + 栈深*2），
    // 直接 style.display='flex' 只有 CSS 的 1000，会被 start-modal(10000)/race-battle-modal(10004) 盖住
    this.showModal('race-battle-exit-modal');
};

UIController.prototype.raceBattleCancelLeave = function() {
    if (this._rbReady) this.hideModal('race-battle-exit-modal');
};

UIController.prototype.raceBattleDoLeave = function(isKick) {
    this._ensureRaceBattleFields();
    // 排位对局中主动退出（非被踢）：立即上报弃权结算，服务端固定扣 30 分（不受低段位保护，保底不减成负数）
    if (!isKick && this._rbRanked && this._rbMatchStarted) {
        try {
            const prog = this._rbProgress[this._rbMyId] || (this._rbProgress[this._rbMyId] = {});
            prog.abandoned = true;
            this._rbSubmitSelfScore(this._rbBuildResult());
        } catch (e) {}
    }
    // 离开/解散即清理断线恢复上下文（对局已放弃）
    this._rbClearResumeContext();
    this.hideModal('race-battle-exit-modal');
    // 房主等待阶段（未开局、无访客已连上）退出 → 保留房间，返回主菜单后仍可恢复加入
    const keep = this._rbShouldKeepHostWaiting();
    this._rbKeepHostWaiting = keep;
    if (this._rbRoom) {
        try {
            if (this._rbIsHost && !keep) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            if (!keep) this._rbRoom.disconnect();
        } catch (e) {}
        if (!keep) this._rbRoom = null;
    }
    if (!keep) {
        this._rbRoomOpen = false;
        this._rbMembers = [];
        this._rbReadyMap = {};
        this._raceBattleSwitchJoinButton('join');
        this._stopHostRoomBanner(); // 创建tab建房退出即删除 → 隐藏顶部胶囊
    }
    this._rbMatchStarted = false;
    if (this._rbRoom) this._rbRoom.matchStarted = false; // 房间回到等待/关闭状态：大厅阶段退出按踢出处理
    this.raceIsMultiplayer = false; // 离开多人模式，恢复单人竞速记录
    this._closeRaceLobby(keep);
    if (!keep) {
        this.raceBattleStopMatchUI();
        this.raceBattleHidePanel();
    }
    // 2026-08-12 需求：退出后回到联机竞速房间弹窗（keep 时 _proceedRaceBattleModal 会恢复原保留房间）
    this.hideModal('race-mode-select-modal');
    this._proceedRaceBattleModal();
    if (!keep) {
        const createBtn = document.getElementById('race-battle-create-btn');
        const deleteBtn = document.getElementById('race-battle-delete-btn');
        if (createBtn) createBtn.disabled = false;
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
};
/** 创建tab上的"删除房间"按钮：只清理房间连接 + 恢复UI，不离屏不回主页 */
UIController.prototype.raceBattleDeleteRoom = function() {
    this._ensureRaceBattleFields();
    this._rbClearResumeContext(); // 删除房间即清理恢复上下文
    if (this._rbRoom) {
        try {
            if (this._rbIsHost) this._rbRoom.send({ type: 'race_battle_dissolve' }, true);
            this._rbRoom.disconnect();
        } catch (e) {}
        this._rbRoom = null;
    }
    this._rbRoomOpen = false;
    this._rbMatchStarted = false;
    this._rbMembers = [];
    this._rbReadyMap = {};
    this._rbKeepHostWaiting = false;
    this._stopHostRoomBanner(); // 删除房间即隐藏顶部胶囊
    this.raceIsMultiplayer = false;
    this.raceBattleStopMatchUI();
    this.raceBattleHidePanel();
    // 2026-08-11 修复：清空 _rbMembers 后必须重渲染成员列表 DOM，
    // 否则删除房间后成员列表仍残留"房主自己"的行
    this.raceBattleRenderMembers();
    // 恢复状态提示
    this._raceBattleSetStatus('idle', '未连接');
    // 恢复创建/删除按钮
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = false;
    if (deleteBtn) deleteBtn.style.display = 'none';
    this._raceBattleSwitchJoinButton('join');
    // 隐藏房间码展示区（如果可见）
    const codeDisplay = document.getElementById('race-battle-room-code-display');
    if (codeDisplay) codeDisplay.style.display = 'none';
    // 如果同时在大厅也创建了房间，也给清理掉
    this._closeRaceLobby();
};
// ─── 对局进度面板 ───────────────────────────────────────────────

