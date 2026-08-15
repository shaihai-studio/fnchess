/**
 * UIRaceBattleLobby —— UIRaceBattle 模块切片（UIController.prototype 挂载）
 *
 * 大厅：房间列表、过滤、TTL、创建/加入/删除
 * 本文件是 files/js/ui/UIRaceBattle.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * 加载顺序：UIRaceBattleBase 必须最先加载（含 RACE_BATTLE_DIFFICULTIES /
 * RACE_BATTLE_STAMINA 两个顶层 const，供其余切片运行时引用）。
 */

UIController.prototype._ensureRaceLobby = function() {
    if (this._rbLobby) {
        // 实例复用时也同步当前排位/休闲子模式（用户可能在排位/休闲间切换）
        this._rbLobby.currentLobbyMode = this._rbRanked ? 'race_ranked' : 'race_casual';
        return this._rbLobby;
    }
    const lobby = new MatchLobbyController({
        onConnectionChange: (connected) => {
            this._rbLobbyConnected = connected;
            if (connected) {
                this._raceLobbySetStatus('connected', '已连接大厅');
                // 处理挂起的大厅登记请求（WS 刚连上时补发）
                if (this._rbPendingLobbyHost) {
                    const pending = this._rbPendingLobbyHost;
                    this._rbPendingLobbyHost = null;
                    pending.lobby.hostRegister(pending.opts);
                }
            } else {
                this._raceLobbySetStatus('idle', '未连接');
            }
        },
        onRoomsUpdate: (rooms) => {
            this._rbLobbyRooms = Array.isArray(rooms) ? rooms.filter((r) => r && r.isRace) : [];
            // 批量收集房间房主 playerId，填充竞速段位徽章（避免"未定段"）
            const ids = [];
            for (const r of this._rbLobbyRooms) {
                if (r && r.hostPlayerId) ids.push(r.hostPlayerId);
            }
            const selfId = this._rbLobby ? this._rbLobby._getPlayerId() : '';
            if (selfId) ids.push(selfId);
            if (ids.length) this._rbQueryRaceRanks(ids);
            this._renderRaceLobbyRooms();
        },
        onPlayerRaceRankResult: (data) => {
            const players = (data && data.players) || {};
            for (const pid in players) {
                const tier = players[pid] && players[pid].tier;
                if (tier) this._rbRanks[pid] = tier;
            }
            this._renderRaceLobbyRooms();
            this.raceBattleRenderMembers();
        },
        onHostRegistered: (code, expiresAt) => {
            this._rbLobbyOpen = true;
            this._rbLobbyExpiresAt = Number(expiresAt) || 0;
            this._rbLobbyUpdateTtl();
            this._rbStartLobbyTtlTimer();
            // 常驻顶部胶囊：[房间号] 等待玩家加入 剩余时间（对齐联机对战）
            if (typeof this._showHostRoomBanner === 'function') this._showHostRoomBanner(code, this._rbLobbyExpiresAt);
            if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
            if (this.raceBattleRoomCode) this.raceBattleRoomCode.textContent = code;
            const disp = document.getElementById('race-battle-room-code-display');
            if (disp) disp.style.display = '';
            this._renderRaceLobbyRooms();
        },
        onGuestJoining: (code, info) => {
            if (info && info.nickname) {
                this._raceLobbySetStatus('connected', `${info.nickname} 加入房间（${info.currentPlayers}/${info.maxPlayers}）`);
            }
        },
        onGuestLeft: (code, info) => {
            if (info && info.nickname) this._raceLobbySetStatus('connected', `${info.nickname} 离开房间`);
        },
        onJoinAccepted: (code) => {
            // 竞速房先到先得：服务器已放行 → 走常规加入流程建立 PeerJS 连接
            this._raceLobbySetStatus('connected', '已获准加入，正在建立连接…');
            if (this.raceBattleJoinInput) this.raceBattleJoinInput.value = String(code);
            this.raceBattleJoinRoom(true); // skipLookup：大厅列表已确认是竞速房
        },
        onJoinRejected: (code, reason) => {
            this._raceLobbySetStatus('error', this._raceLobbyReasonText(reason));
            this._renderRaceLobbyRooms();
        },
        onHostRoomExpired: () => {
            this._rbLobbyOpen = false;
            this._rbLobbyExpiresAt = 0;
            this._rbKeepHostWaiting = false;
            this._rbStopLobbyTtlTimer();
            if (typeof this._stopHostRoomBanner === 'function') this._stopHostRoomBanner();
            if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
            if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
            // 房间到期 = 房间作废：PeerJS 房间可能仍存活（等待中的访客还在里面），
            // 必须广播解散让访客退出并断开连接，否则访客会卡在已过期的房间里
            // （服务端 room_started 时 expiresAt=0，对局中房间不受 TTL 清理，故此处必为等待阶段）
            if (this._rbRoom && this._rbIsHost && !this._rbMatchStarted) {
                try { this._rbRoom.send({ type: 'race_battle_dissolve' }, true); } catch (e) {}
                try { this._rbRoom.disconnect(); } catch (e) {}
                this._rbRoom = null;
                this._rbRoomOpen = false;
                this._rbMembers = [];
                this._rbReadyMap = {};
                this._rbClearResumeContext();
                this.raceIsMultiplayer = false;
                this.raceBattleStopMatchUI();
                this.raceBattleHidePanel();
                this.raceBattleRenderMembers();
                this._raceBattleSetStatus('idle', '未连接');
                this._raceBattleSwitchJoinButton('join');
            }
            this._raceLobbySetStatus('idle', '房间已到期，请重新创建');
            this._renderRaceLobbyRooms();
        }
    });
    // 竞速房区分排位/休闲子模式（race_ranked / race_casual），大厅列表按子模式精确过滤
    lobby.currentLobbyMode = this._rbRanked ? 'race_ranked' : 'race_casual';
    this._rbLobby = lobby;
    // "仅同段位可见"开关：切换时持久化到 lobby 并立即刷新房间列表（定时刷新沿用该状态）
    if (this.raceLobbyTierToggle && !this._rbTierToggleBound) {
        this._rbTierToggleBound = true;
        this.raceLobbyTierToggle.addEventListener('change', () => {
            if (this._rbLobbyConnected) lobby.setTierFilter(this.raceLobbyTierToggle.checked ? 'same' : null);
            if (this._rbLobbyOpen && this.raceLobbyCreateBtn) {
                // 房主已建房间时不能改过滤（房间登记已完成），提示即可
                this._raceLobbySetStatus('connected', '过滤仅对新创建的房间生效');
            }
        });
    }
    return lobby;
};

/** 打开大厅 tab：连接大厅并刷新房间列表 */
UIController.prototype._openRaceLobby = function() {
    this._ensureRaceBattleFields();
    const lobby = this._ensureRaceLobby();
    if (this._rbLobbyOpen) {
        if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
        if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
    }
    if (!this._rbLobbyConnected) {
        // 首次连接前同步段位过滤开关，保证 ws.onopen 的首次 fetchRooms 即带过滤
        lobby.setTierFilter(this._rbLobbyTierFilter() ? 'same' : null);
        this._raceLobbySetStatus('connecting', '连接大厅中…');
        lobby.connect();
    } else {
        // 仅同段位可见：按开关状态传 tierFilter（服务端按访客竞速段位过滤房间列表）
        const tierFilter = this._rbLobbyTierFilter() ? 'same' : null;
        lobby.fetchRooms(tierFilter);
    }
};

/** 关闭大厅：取消登记并断开连接 */
UIController.prototype._closeRaceLobby = function(keep) {
    if (!this._rbLobby) return;
    try {
        if (this._rbLobbyOpen) {
            if (keep) {
                // 保留房间：仅暂停列表刷新，WS 与大厅登记保持，返回主菜单后房间仍可加入
                this._rbLobby.pauseRefresh();
            } else {
                this._rbLobby.cancelHost(this._rbLobby.myRoomCode);
                this._rbLobby.disconnect();
            }
        } else if (!keep) {
            this._rbLobby.disconnect();
        }
    } catch (e) {}
    if (keep) return;
    this._rbLobby = null;
    this._rbLobbyConnected = false;
    this._rbLobbyOpen = false;
    this._rbLobbyExpiresAt = 0;
    this._rbLobbyRooms = [];
    this._rbStopLobbyTtlTimer();
    this._renderRaceLobbyRooms();
    if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    this._raceLobbySetStatus('idle', '未连接');
};

/** 房主是否处于"等待阶段"（未开局、无访客已连上）且已登记大厅 → 退出时保留房间；
 *  创建tab直建房（未登记大厅）不满足 → 退出即删除房间（对齐联机对战） */
UIController.prototype._rbShouldKeepHostWaiting = function() {
    return !!(this._rbRoom && this._rbRoomOpen && this._rbIsHost &&
        !this._rbMatchStarted && this._rbLobbyOpen &&
        (!this._rbMembers || this._rbMembers.length <= 1));
};

/** 刷新大厅房间 TTL 倒计时文案 */
UIController.prototype._rbLobbyUpdateTtl = function() {
    if (!this._rbLobbyOpen || !this._rbLobbyExpiresAt) return;
    const remain = Math.max(1, Math.ceil((this._rbLobbyExpiresAt - Date.now()) / 60000));
    this._raceLobbySetStatus('connected', '房间已创建，等待玩家加入 · 约 ' + remain + ' 分钟后到期');
};

UIController.prototype._rbStartLobbyTtlTimer = function() {
    this._rbStopLobbyTtlTimer();
    this._rbLobbyTtlTimer = setInterval(() => {
        if (!this._rbLobbyOpen || !this._rbLobbyExpiresAt) { this._rbStopLobbyTtlTimer(); return; }
        if (Date.now() >= this._rbLobbyExpiresAt) { this._rbStopLobbyTtlTimer(); return; }
        this._rbLobbyUpdateTtl();
    }, 15000);
};

UIController.prototype._rbStopLobbyTtlTimer = function() {
    if (this._rbLobbyTtlTimer) { clearInterval(this._rbLobbyTtlTimer); this._rbLobbyTtlTimer = null; }
};

/** 状态条（颜色用内联样式，不依赖外部 CSS 类） */
UIController.prototype._raceLobbySetStatus = function(kind, text) {
    if (!this.raceLobbyStatus) return;
    const txt = this.raceLobbyStatus.querySelector('.lobby-status-text');
    if (!txt) return;
    txt.textContent = text || '';
    const colors = { connected: '#2ecc71', connecting: '#f1c40f', error: '#e74c3c' };
    txt.style.color = colors[kind] || '';
};

/** 拒绝原因文案 */
UIController.prototype._raceLobbyReasonText = function(reason) {
    const map = {
        room_not_available: '房间不可用或已开局',
        room_expired: '房间已过期',
        room_full: '房间已满员',
        already_joined: '你已在该房间中',
        mode_mismatch: '模式不匹配',
        elo_range: '段位差距超出房间限制',
        tier_mismatch: '该房间仅限同竞速段位玩家加入'
    };
    return map[reason] || ('加入失败：' + (reason || '未知原因'));
};

/** HTML 转义 */
UIController.prototype._rbEscapeHtml = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
};

/** 渲染大厅房间列表 */
UIController.prototype._renderRaceLobbyRooms = function() {
    const el = this.raceLobbyList;
    if (!el) return;
    const rooms = this._rbLobbyRooms || [];
    if (!this._rbLobbyConnected) {
        el.innerHTML = '<div class="lobby-empty">大厅未连接</div>';
        return;
    }
    if (!rooms.length) {
        el.innerHTML = '<div class="lobby-empty">暂无等待中的竞速房间<br>点击上方「创建房间（进大厅）」登记你的房间</div>';
        return;
    }
    const diffNames = ['简单', '普通', '困难', '极难', '地狱', '噩梦', '深渊'];
    const items = rooms.map((r) => {
        const opts = r.options || {};
        const st = opts.stamina || 1;
        const df = opts.difficulty || 1;
        const diffName = diffNames[df - 1] || ('Lv.' + df);
        const players = `${r.currentPlayers}/${r.maxPlayers}`;
        const host = this._rbEscapeHtml(r.hostNickname || '房主');
        // 房主竞速段位（服务端 list_rooms 实时下发，hostTierNow；旧房间无值则回退本地缓存）
        let hostTier = r.hostTier || '';
        if (!hostTier && r.hostPlayerId) hostTier = this._rbRanks[r.hostPlayerId] || '';
        // 竞速房子模式：race_ranked=排位 / race_casual=休闲（旧 race 视为休闲）
        const modeTag = (opts.mode === 'race_ranked')
            ? '<span class="lobby-room-mode lobby-room-mode-ranked">排位</span>'
            : '<span class="lobby-room-mode lobby-room-mode-casual">休闲</span>';
        const tierTag = hostTier
            ? `<span class="lobby-room-tier">${this._rbEscapeHtml(hostTier)}</span>`
            : '';
        return `<div class="lobby-room-row">
            <div class="lobby-room-info">
                <span class="lobby-room-code">${r.code}</span>
                <span class="lobby-room-desc">${modeTag}${players} 人 · 耐力 ${st} · ${diffName}</span>
                <span class="lobby-room-host">${host}${tierTag}</span>
            </div>
            <button class="btn btn-small lobby-join-btn" data-code="${r.code}">加入</button>
        </div>`;
    }).join('');
    el.innerHTML = items;
    el.querySelectorAll('.lobby-join-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            const code = btn.getAttribute('data-code');
            if (code) this._joinRaceLobbyRoom(code);
        });
    });
};

/** 房主：创建房间并登记进大厅 */
UIController.prototype._createRaceLobbyRoom = function() {
    this._ensureRaceBattleFields();
    if (this.raceLobbyCreateBtn) this.raceLobbyCreateBtn.disabled = true;
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = '';
    var self = this;
    var doRegister = function(roomCode) {
        var lobby = self._ensureRaceLobby();
        var opts = {
            // 排位/休闲竞速房用不同子模式，大厅列表按子模式精确隔离
            mode: self._rbRanked ? 'race_ranked' : 'race_casual',
            maxPlayers: 4,
            roomCode: roomCode,
            longLived: !!(self.raceLobbyLongLivedToggle && self.raceLobbyLongLivedToggle.checked),
            tierOnly: !!(self.raceLobbyTierToggle && self.raceLobbyTierToggle.checked),
            stamina: self._rbStamina,
            difficulty: self._rbDifficulty
        };
        if (lobby.isConnected) {
            lobby.hostRegister(opts);
        } else {
            self._raceLobbySetStatus('connecting', '等待大厅连接…');
            self._rbPendingLobbyHost = { lobby: lobby, opts: opts };
            lobby.connect(); // 主动发起大厅 WS 连接，避免登记请求永久挂起
        }
    };
    var roomCode;
    if (this._rbRoom && this._rbRoom.isHost && this._rbRoomOpen) {
        this._raceLobbySetStatus('connecting', '已在房间中，正在登记大厅…');
        doRegister(this._rbRoom.roomCode);
    } else {
        this._rbCreateViaLobby = true;
        // 长效模式：房间码以 00 开头（对齐服务端 genRoomCode 的 00 前缀约定），30 分钟有效
        var longLived = !!(this.raceLobbyLongLivedToggle && this.raceLobbyLongLivedToggle.checked);
        roomCode = longLived
            ? '00' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
            : String(Math.floor(100000 + Math.random() * 900000));
        var ready = this.raceBattleCreateRoom(roomCode);
        if (ready && ready.then) {
            ready.then(function(ok) {
                if (ok) doRegister(roomCode);
            });
        }
    }
};

/** 房主：删除登记的房间（从大厅移除，并断开 PeerJS 房间、隐藏胶囊与底部按钮） */
UIController.prototype._deleteRaceLobbyRoom = function() {
    if (!this._rbLobby || !this._rbLobbyOpen) return;
    this._rbLobby.cancelHost(this._rbLobby.myRoomCode);
    this._rbLobbyOpen = false;
    this._rbLobbyExpiresAt = 0;
    this._rbKeepHostWaiting = false;
    this._rbStopLobbyTtlTimer();
    this._rbClearResumeContext(); // 删除房间即清理恢复上下文
    // 大厅建房时同时创建了 PeerJS 房间（_rbRoom），删除时一并断开
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
    this.raceIsMultiplayer = false;
    this._stopHostRoomBanner();      // 隐藏顶部等待时间胶囊
    this.raceBattleRenderMembers();  // 重渲染：_rbRoomOpen=false 驱动隐藏底部按钮
    this._raceBattleSwitchJoinButton('join');
    if (this.raceLobbyCreateBtn) { this.raceLobbyCreateBtn.disabled = false; this.raceLobbyCreateBtn.style.display = ''; }
    if (this.raceLobbyDeleteBtn) this.raceLobbyDeleteBtn.style.display = 'none';
    // 恢复创建tab的创建/删除按钮与房间码展示
    const createBtn = document.getElementById('race-battle-create-btn');
    const deleteBtn = document.getElementById('race-battle-delete-btn');
    if (createBtn) createBtn.disabled = false;
    if (deleteBtn) deleteBtn.style.display = 'none';
    const codeDisplay = document.getElementById('race-battle-room-code-display');
    if (codeDisplay) codeDisplay.style.display = 'none';
    this._raceLobbySetStatus('idle', '已从大厅移除房间');
    this._renderRaceLobbyRooms();
};

/** 访客：从大厅列表加入房间 */
UIController.prototype._joinRaceLobbyRoom = function(code) {
    this._ensureRaceBattleFields();
    if (!this._rbLobby) return;
    this._raceLobbySetStatus('connecting', '正在申请加入…');
    this._rbLobby.joinRoom(code);
};


