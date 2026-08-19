// Auto-split from UIController.js — prototype-attached methods (UIModals)
// Loaded after UIController.js; attaches methods to UIController.prototype.
if (typeof UIController === 'undefined') {
    console.error('[UIModals] UIController must be loaded before this file');
}

// _getModalState
    UIController.prototype._getModalState = function(el) {
        return this._modalStates.get(el) || 'hidden';
    }
;

// _setModalState
    UIController.prototype._setModalState = function(el, state) {
        this._modalStates.set(el, state);
    }
;

// showModal
    UIController.prototype.showModal = function(modal, display = 'flex') {
        const el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) return;

        // 打开开始界面时刷新「对战函数设置」按钮（解锁进度可能已变化）
        if (el === this.startModal && typeof this.refreshFunctionPanelBtn === 'function') {
            this.refreshFunctionPanelBtn();
        }

        const state = this._getModalState(el);
        // 已在显示或正在入场 → 忽略
        if (state === 'visible' || state === 'entering') return;

        // 正在退场中：立即同步完成上一次隐藏（彻底杜绝竞态）
        if (state === 'exiting') {
            // 取消退场动画和监听器
            el.classList.remove('modal-exiting');
            el.removeEventListener('animationend', this._modalExitFinishers.get(el));
            this._modalExitFinishers.delete(el);
            // 立即完成隐藏：display:none + 状态归 hidden
            el.style.display = 'none';
            this._setModalState(el, 'hidden');
            this._modalSkipCallbacks.delete(el);
        }

        // 记录模态栈（最后打开的在最上层），供 ESC 关闭正确识别顶层（修复 #16–#22）
        this._modalStack = this._modalStack || [];
        this._modalStack = this._modalStack.filter((m) => m !== el);
        this._modalStack.push(el);

        // 动态层级：最后打开的弹窗始终位于最上层（高于 lobby 横幅/观战浮层/p2p-vs 等 9996~9999，
        // 但低于首屏 splash 99999）。仅靠 CSS 固定 z-index:1000 时，多弹窗并存会退化为 DOM 顺序，
        // 导致后开的弹窗反而被先开的盖住。
        const MODAL_BASE_Z = 10000;
        el.style.zIndex = String(MODAL_BASE_Z + (this._modalStack.length - 1) * 2);

        this._setModalState(el, 'entering');
        el.classList.remove('modal-exiting');
        el.style.display = display;

        // 打开开始界面时：默认落到「主界面」（模式选择），方便快速开始下一局；
        // splash 等真正的首次进入由调用方在 showModal 后显式调 showStartPage 切到「开始界面」。
        if (el === this.startModal && typeof this.showMainPage === 'function') {
            this.showMainPage();
        }

        // 强制 reflow 确保动画从头播放
        void el.offsetWidth;

        el.classList.add('modal-entering');

        const onEnterEnd = () => {
            el.classList.remove('modal-entering');
            el.removeEventListener('animationend', onEnterEnd);
            this._setModalState(el, 'visible');
        };
        el.addEventListener('animationend', onEnterEnd);
        // 保险：若入场动画未正常触发（如 #start-modal/#campaign-modal 的 animation:none !important），
        // 400ms 后强制完成入场——否则该弹窗会永久卡在 entering 状态，后续对它的 showModal
        // 会被防重入守卫直接拦截，表现为「竞速/闯关打完回主菜单后排行榜弹窗打不开」。
        setTimeout(() => {
            if (this._getModalState(el) === 'entering') {
                onEnterEnd();
            }
        }, 400);
    }
;

// hideModal
    UIController.prototype.hideModal = function(modal, callback) {
        const el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) {
            if (callback) callback();
            return;
        }

        const computed = window.getComputedStyle(el).display;
        const styleNone = el.style.display === 'none';
        // 已经隐藏了
        if (styleNone || computed === 'none') {
            this._setModalState(el, 'hidden');
            if (callback) callback();
            return;
        }

        const state = this._getModalState(el);
        // 已经在退场或已隐藏 → 忽略（callback 至多执行一次）
        if (state === 'exiting' || state === 'hidden') {
            if (callback) callback();
            return;
        }
        // 正在入场：先取消入场类
        if (state === 'entering') {
            el.classList.remove('modal-entering');
        }

        this._setModalState(el, 'exiting');
        el.classList.remove('modal-entering');
        el.classList.add('modal-exiting');

        let called = false;
        const doCallback = () => {
            if (called) return;
            called = true;
            el.classList.remove('modal-exiting');
            el.style.display = 'none';
            this._setModalState(el, 'hidden');
            this._modalStack = (this._modalStack || []).filter((m) => m !== el);
            this._modalExitFinishers.delete(el);
            this._modalSkipCallbacks.delete(el);
            if (callback) callback();
        };

        const onExitEnd = () => {
            el.removeEventListener('animationend', onExitEnd);
            doCallback();
        };
        // 记录退场监听器引用，以便 showModal 在需要时强制移除
        this._modalExitFinishers.set(el, onExitEnd);
        el.addEventListener('animationend', onExitEnd);

        // 保险：若动画未正常触发，400ms 后强制完成
        setTimeout(() => {
            if (this._getModalState(el) === 'exiting') {
                doCallback();
            }
        }, 400);
    }
;

// hideStartModal
    UIController.prototype.hideStartModal = function() {
        const startModal = document.getElementById('start-modal');
        if (startModal) {
            this.hideModal(startModal);
        }
    }
;

// showStartPage — 「开始界面」（精简首页）：标题 + 开始游戏 + 关于我们
    UIController.prototype.showStartPage = function() {
        const page = document.getElementById('start-page');
        const main = document.getElementById('main-page');
        if (page) page.style.display = '';
        if (main) main.style.display = 'none';
        // 开始界面不显示匹配大厅速览栏（从主界面开始才显示）
        if (typeof this._lwSetVisible === 'function') this._lwSetVisible(false);
    }
;

// showMainPage — 「主界面」（模式选择）：原开始界面的全部功能；返回主界面 = 回到这里
    UIController.prototype.showMainPage = function() {
        const page = document.getElementById('start-page');
        const main = document.getElementById('main-page');
        if (page) page.style.display = 'none';
        if (main) main.style.display = '';
        // 进入主界面后恢复显示匹配大厅速览栏
        if (typeof this._lwSetVisible === 'function') this._lwSetVisible(true);
        // 关闭可能残留的子模式选择弹窗
        if (typeof this.closeModeSubmenuModal === 'function') this.closeModeSubmenuModal();
        // 进入主界面时刷新选择器显示（难度/回合等文案）
        if (typeof this.refreshStartSelectorDisplay === 'function') this.refreshStartSelectorDisplay();
    }
;

// showSplash
    UIController.prototype.showSplash = function() {
        const splash = document.getElementById('splash-screen');
        if (!splash) return;
        splash.classList.remove('splash-exit');
        splash.style.display = '';
        splash._entering = false;
        this._bindSplashEnter(splash);
    }
;

// _bindSplashEnter
    UIController.prototype._bindSplashEnter = function(splash) {
        if (splash._splashEnterBound) return;
        splash._splashEnterBound = true;
        const self = this;
        const onEnter = () => self._enterFromSplash(splash);
        splash._splashClickHandler = onEnter;
        splash._splashKeyHandler = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                self._enterFromSplash(splash);
            }
        };
        splash.addEventListener('click', onEnter);
        document.addEventListener('keydown', splash._splashKeyHandler);
    }
;

// _unbindSplashEnter
    UIController.prototype._unbindSplashEnter = function(splash) {
        if (splash._splashClickHandler) splash.removeEventListener('click', splash._splashClickHandler);
        if (splash._splashKeyHandler) document.removeEventListener('keydown', splash._splashKeyHandler);
        splash._splashEnterBound = false;
    }
;

// _enterFromSplash
    UIController.prototype._enterFromSplash = function(splash) {
        if (!splash || splash._entering) return;
        splash._entering = true;
        this._unbindSplashEnter(splash);
        // 触发转场动画（旋转 + 放大 + 虚化 → 白闪）
        splash.classList.add('splash-exit');
        setTimeout(() => {
            splash.style.display = 'none';
            this.showModal(document.getElementById('start-modal'));
            // splash → 「开始界面」（标题页），与 showModal 默认落「主界面」区分开
            if (typeof this.showStartPage === 'function') this.showStartPage();
            if (window.audioManager) window.audioManager.startBgm();
            // 进入主界面后再拉取服务器通知 + 检查版本（避免弹窗盖在 splash 全屏遮罩上）
            if (typeof this.checkNotice === 'function') this.checkNotice();
            if (typeof this.checkVersion === 'function') this.checkVersion();
        }, 900);
    }
;

// bindSummaDialogEvents
    UIController.prototype.bindSummaDialogEvents = function() {
        // 输入框取消按钮
        document.getElementById('summa-dialog-input-cancel')?.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this.summaDialogResolve && this.summaDialogResolve(null);
            this.hideSummaDialog();
        });
        
        // 输入框确认按钮
        document.getElementById('summa-dialog-input-confirm')?.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            const value = this.summaDialogInput.value;
            this.summaDialogResolve && this.summaDialogResolve(value);
            this.hideSummaDialog();
        });
        
        // 输入框回车确认
        this.summaDialogInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = this.summaDialogInput.value;
                this.summaDialogResolve && this.summaDialogResolve(value);
                this.hideSummaDialog();
            }
        });
    }
;

// showGameDialog
    UIController.prototype.showGameDialog = function(options) {
        return new Promise((resolve) => {
            this.summaDialogResolve = resolve;

            // ── 防御性重置：确保 summaDialog 不处于卡死状态 ──
            // 如果上次隐藏因竞态未完成（如连续两次确认），强制清理
            const sd = this.summaDialog;
            if (sd) {
                const s = this._getModalState(sd);
                if (s === 'exiting' || s === 'entering') {
                    sd.classList.remove('modal-entering', 'modal-exiting');
                    sd.style.display = 'none';
                    const finisher = this._modalExitFinishers.get(sd);
                    if (finisher) { sd.removeEventListener('animationend', finisher); }
                    this._modalExitFinishers.delete(sd);
                    this._modalSkipCallbacks.delete(sd);
                    this._setModalState(sd, 'hidden');
                }
            }

            const {
                title = '提示',
                message = '',
                options: optButtons = [],
                showInput = false,
                inputPlaceholder = '',
                defaultValue = '',
                showSkip = true,
                skipText = '跳过，直接使用现有模型'
            } = options;
            
            // 设置内容
            this.summaDialogTitle.textContent = title;
            this.summaDialogMessage.innerHTML = message.replace(/\n/g, '<br>');
            
            // 清空并设置选项
            this.summaDialogOptions.innerHTML = '';
            
            if (showInput) {
                // 显示输入模式
                this.summaDialogOptions.style.display = 'none';
                this.summaDialogInputArea.style.display = 'block';
                this.summaDialogInput.value = defaultValue;
                this.summaDialogInput.placeholder = inputPlaceholder;
                setTimeout(() => this.summaDialogInput.focus(), 100);
            } else {
                // 显示选项按钮模式
                this.summaDialogOptions.style.display = 'grid';
                this.summaDialogInputArea.style.display = 'none';

                optButtons.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'summa-dialog-option-btn';
                    btn.textContent = opt.label;
                    btn.addEventListener('click', () => {
                        if (window.audioManager) window.audioManager.playClick();
                        resolve(opt.value);
                        this.hideSummaDialog();
                    });
                    this.summaDialogOptions.appendChild(btn);
                });

                const footerActions = document.querySelector('.summa-dialog-footer-actions');
                const skipBtn = document.getElementById('summa-dialog-skip-btn');
                const exitBtn = document.getElementById('summa-dialog-exit-btn');

                if (footerActions && skipBtn && exitBtn) {
                    footerActions.style.display = showSkip ? 'flex' : 'none';
                    skipBtn.textContent = skipText;
                    skipBtn.onclick = () => {
                        if (window.audioManager) window.audioManager.playClick();
                        resolve(null);
                        this.hideSummaDialog();
                    };
                    exitBtn.textContent = '退出';
                    exitBtn.onclick = () => {
                        if (window.audioManager) window.audioManager.playClick();
                        this.forceStopGame();
                        this.hideSummaDialog();
                        this.showModal(this.startModal);
                    };
                }
            }
            
            // 显示弹窗
            this.showModal(this.summaDialog);
        });
    }
;

// hideSummaDialog
    UIController.prototype.hideSummaDialog = function() {
        this.hideModal(this.summaDialog, () => {
            this.summaDialogResolve = null;
        });
    }
;

// bindBackgroundMusicControls
    UIController.prototype.bindBackgroundMusicControls = function() {
        if (this.bgmEnabledCheckbox) {
            this.bgmEnabledCheckbox.addEventListener('change', () => {
                if (window.audioManager) window.audioManager.setBgmEnabled(this.bgmEnabledCheckbox.checked);
            });
        }
        if (this.bgmVolumeSlider) {
            this.bgmVolumeSlider.addEventListener('input', () => {
                const volume = Number(this.bgmVolumeSlider.value) / 100;
                if (this.bgmVolumeValue) this.bgmVolumeValue.textContent = `${this.bgmVolumeSlider.value}%`;
                if (window.audioManager) window.audioManager.setBgmVolume(volume);
            });
        }
        if (this.sfxVolumeSlider) {
            this.sfxVolumeSlider.addEventListener('input', () => {
                const volume = Number(this.sfxVolumeSlider.value) / 100;
                if (this.sfxVolumeValue) this.sfxVolumeValue.textContent = `${this.sfxVolumeSlider.value}%`;
                if (window.audioManager) window.audioManager.setSfxVolume(volume);
            });
        }
        if (this.bgmOpenBtn) {
            this.bgmOpenBtn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                if (this.bgmModal) this.showModal(this.bgmModal);
            });
        }
        if (this.startBgmOpenBtn) {
            this.startBgmOpenBtn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                if (this.bgmModal) this.showModal(this.bgmModal);
            });
        }
        if (this.bgmCloseBtn) {
            this.bgmCloseBtn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                if (this.bgmModal) this.hideModal(this.bgmModal);
            });
        }
    }
;

// initBackgroundMusic
    UIController.prototype.initBackgroundMusic = function() {
        if (!window.audioManager) return;
        if (this.bgmEnabledCheckbox) this.bgmEnabledCheckbox.checked = window.audioManager.bgmEnabled;
        if (this.bgmVolumeSlider) {
            this.bgmVolumeSlider.value = String(Math.round(window.audioManager.bgmVolume * 100));
        }
        if (this.bgmVolumeValue && this.bgmVolumeSlider) {
            this.bgmVolumeValue.textContent = `${this.bgmVolumeSlider.value}%`;
        }
        if (this.sfxVolumeSlider) {
            this.sfxVolumeSlider.value = String(Math.round((window.audioManager.sfxVolume ?? 1) * 100));
        }
        if (this.sfxVolumeValue && this.sfxVolumeSlider) {
            this.sfxVolumeValue.textContent = `${this.sfxVolumeSlider.value}%`;
        }
        window.audioManager.startBgm();
    }
;

// showExitConfirm
    UIController.prototype.showExitConfirm = function() {
        if (window.audioManager) window.audioManager.playClick();
        if (!this.exitPopover) return;
        // 再次点击退出按钮则收起（切换）
        if (this.exitPopover.classList.contains('visible')) {
            this.hideExitConfirm();
            return;
        }
        this.exitPopover.classList.add('visible');
        // 点击气泡外部（且非退出按钮）自动收起
        if (!this._exitDocHandler) {
            this._exitDocHandler = (ev) => {
                if (!this.exitPopover || !this.exitPopover.classList.contains('visible')) return;
                if (!this.exitPopover.contains(ev.target) && !ev.target.closest('#exit-btn') && !ev.target.closest('#exit-fab-btn')) {
                    this.hideExitConfirm();
                }
            };
            document.addEventListener('mousedown', this._exitDocHandler);
        }
    }
;

// hideExitConfirm
    UIController.prototype.hideExitConfirm = function() {
        if (this.exitPopover) {
            this.exitPopover.classList.remove('visible');
        }
    }
;

// bindModalDismiss
    UIController.prototype.bindModalDismiss = function(modal, onDismiss, onEsc) {
        if (!modal || modal._dismissBound) return;
        modal._dismissBound = true;
        modal._onMaskDismiss = typeof onDismiss === 'function' ? onDismiss : null;
        modal._onEscDismiss = typeof onEsc === 'function' ? onEsc : modal._onMaskDismiss;
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            // U6: 遮罩关闭 150ms 防抖——双击遮罩只触发一次，避免 handleRestart 等回调重复执行
            const now = Date.now();
            if (modal._lastMaskDismissAt && now - modal._lastMaskDismissAt < 150) return;
            modal._lastMaskDismissAt = now;
            if (typeof modal._onMaskDismiss === 'function') {
                modal._onMaskDismiss();
            } else {
                this.hideModal(modal);
            }
        });
    }
;

// _modalStackTopVisible
    UIController.prototype._modalStackTopVisible = function() {
        const stack = this._modalStack || [];
        for (let i = stack.length - 1; i >= 0; i--) {
            const m = stack[i];
            if (!m) continue;
            // 正在退场（exiting）或尚未显示的弹窗不计入“当前最上层”，
            // 否则退场动画期间会错误地挡住其下弹窗的 ESC 关闭（修复 #39）
            const st = this._getModalState ? this._getModalState(m) : null;
            if (st === 'exiting' || st === 'hidden' || st === 'closing') continue;
            if (m.style.display !== 'none') return m;
        }
        return null;
    }
;

// _bindModalDismissals
    UIController.prototype._bindModalDismissals = function() {
        this.bindModalDismiss(this.bgmModal);
        this.bindModalDismiss(this.reportModal);
        this.bindModalDismiss(this.summaDialog);

        // 反三角函数提示弹窗：点遮罩/ESC 关闭
        this.inverseTrigModal = document.getElementById('inverse-trig-modal');
        if (this.inverseTrigModal) {
            this.bindModalDismiss(this.inverseTrigModal, () => this.hideModal(this.inverseTrigModal));
            const closeBtn = document.getElementById('inverse-trig-modal-close');
            if (closeBtn) closeBtn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this.hideModal(this.inverseTrigModal);
            });
        }

        const p2pRoom = document.getElementById('p2p-room-modal');
        if (p2pRoom) {
            this.bindModalDismiss(p2pRoom, () => {
                // 房主有活跃房间时弹二次确认；否则按原逻辑关闭
                if (typeof this._p2pCloseRoomModal === 'function') {
                    this._p2pCloseRoomModal();
                } else {
                    this.hideModal(p2pRoom);
                    if (typeof this._cleanupP2P === 'function') this._cleanupP2P();
                }
            });
        }

        this.bindModalDismiss(this.gameOverModal, () => this.handleRestart());
        // #19 用户选定：闯关通关弹窗 ESC=回选关页，点遮罩=直接打下一关
        this.bindModalDismiss(this.campaignVictoryModal, () => this.goToNextCampaignLevel(), () => this.returnToCampaignLevelSelect());
        // #20 用户选定：竞速通关弹窗 ESC=回选关页，点遮罩=直接进下一关
        this.bindModalDismiss(this.raceVictoryModal, () => this.goToNextRaceLevel(), () => this.backToRaceLevelListFromVictory());
    }
;

// showGameOver
    UIController.prototype.showGameOver = function(data) {
        let winnerText = '';
        if (data.winner === 'draw') {
            winnerText = '平局！';
        } else if (data && data.forfeit) {
            // 消极比赛判负：明确标注原因（判负方可能分数更高，需按判负而非比分判定）
            winnerText = `${this.getPlayerDisplayName(data.forfeit.winner)} 获胜！（${this.getPlayerDisplayName(data.forfeit.loser)} ${data.forfeit.reason}）`;
        } else {
            winnerText = `${this.getPlayerDisplayName(data.winner)} 获胜！`;
        }
        
        this.winnerElement.textContent = winnerText;
        this.finalScoresElement.innerHTML = `
            <div>${this.getPlayerDisplayName('A')}：${data.scores.A} 分</div>
            <div>${this.getPlayerDisplayName('B')}：${data.scores.B} 分</div>
        `;
        
        this.showModal(this.gameOverModal);
    }
;

// showGameReport
    UIController.prototype.showGameReport = function() {
        if (window.audioManager) window.audioManager.playClick();
        const state = this.gameController.getGameState();
        const report = this.gameController.getGameReport();
        
        let html = `
            <div class="report-summary">
                <h3>比赛总结</h3>
                <p>难度: ${this.getDifficultyName(report.difficulty)}</p>
                <p>总回合: ${report.totalRounds}</p>
                <p>获胜者: ${report.winner === 'draw' ? '平局' : '玩家 ' + report.winner}</p>
                <p>最终比分: A ${report.finalScores.A} - ${report.finalScores.B} B</p>
            </div>
            <div class="report-history">
                <h3>回合详情</h3>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>回合</th>
                            <th>选择方</th>
                            <th>构建方</th>
                            <th>目标坐标</th>
                            <th>禁止区</th>
                            <th>锁定元素</th>
                            <th>函数表达式</th>
                            <th>类型</th>
                            <th>结果</th>
                            <th>得分</th>
                            <th>总分(A-B)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        for (const round of report.history) {
            const resultText = round.timeout ? '超时' :
                              (round.hitForbidden ? '进入禁区' : 
                              (round.hitTarget ? '命中目标' : '未命中'));
            const scoreClass = round.score >= 0 ? 'score-positive' : 'score-negative';
            
            // 格式化坐标和元素显示
            const targetCoords = round.targetCells.map(c => `(${c.x},${c.y})`).join(', ');
            const forbiddenCoords = round.forbiddenCells.length > 0 ? round.forbiddenCells.map(c => `(${c.x},${c.y})`).join(', ') : '-';
            const lockedElems = round.lockedElements.length > 0 ? round.lockedElements.join(', ') : '-';
            const typeName = round.timeout ? '超时' : this.getFunctionTypeName(round.functionType.type);
            
            html += `
                <tr>
                    <td>${round.round}</td>
                    <td>${this.getPlayerDisplayName(round.selector)}</td>
                    <td>${this.getPlayerDisplayName(round.constructor)}</td>
                    <td class="coord-cell">${targetCoords}</td>
                    <td class="coord-cell">${forbiddenCoords}</td>
                    <td class="elem-cell">${lockedElems}</td>
                    <td class="expr-cell">${round.expression || '-'}</td>
                    <td>${typeName}</td>
                    <td>${resultText}</td>
                    <td>${round.score >= 0 ? '+' : ''}${round.score}</td>
                    <td>${round.totalScoreA} - ${round.totalScoreB}</td>
                </tr>
            `;
        }
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        this.reportContentElement.innerHTML = html;
        this.reportContentElement.scrollTop = 0;
        this.reportContentElement.style.overflowY = 'auto';
        this.reportContentElement.style.maxHeight = 'calc(90vh - 100px)';
        this.showModal(this.reportModal);
    }
;

// hideGameReport
    UIController.prototype.hideGameReport = function() {
        if (window.audioManager) window.audioManager.playClick();
        this.hideModal(this.reportModal);
    }
;

// showStartInfoModal — 开始界面 公告/版本 信息弹窗
    UIController.prototype.showStartInfoModal = function(title, content, actions) {
        const modal = document.getElementById('start-info-modal');
        if (!modal) return;
        const titleEl = document.getElementById('start-info-title');
        const contentEl = document.getElementById('start-info-content');
        const actionsEl = document.getElementById('start-info-actions');
        if (titleEl) titleEl.textContent = title;
        if (contentEl) contentEl.innerHTML = content || '';
        if (actionsEl) {
            actionsEl.innerHTML = '';
            (actions || []).forEach(a => {
                if (!a || !a.href) return;
                const btn = document.createElement('a');
                btn.href = a.href;
                btn.target = '_blank';
                btn.rel = 'noopener noreferrer';
                btn.className = 'btn btn-secondary';
                btn.textContent = a.text;
                btn.style.cssText = 'width:100%; text-align:center;';
                actionsEl.appendChild(btn);
            });
        }
        if (typeof this.bindModalDismiss === 'function') this.bindModalDismiss(modal);
        this.showModal(modal);
    }
;

// _buildAnnouncementContent — 公告内容（可配置拉取地址；失败时显示占位文案）
    UIController.prototype._buildAnnouncementContent = function() {
        const placeholders = [
            '欢迎来到函数棋！',
            '· 新增 sgn / floor 函数（闯关困难及以上、对战专家难度可用）',
            '· 闯关支持解锁通关功能',
            '· 修复多项已知问题',
            '',
            '（最新公告请前往 shaihai.cn 查看）'
        ];
        const text = placeholders.join('\n');
        // 尝试从远程获取公告（可选；失败静默回退到占位文案）
        try {
            const annUrl = 'https://shaihai.cn/api/announcement';
            const controller = this;
            fetch(annUrl).then(r => {
                if (!r.ok) throw new Error('no ann');
                return r.text();
            }).then(txt => {
                const contentEl = document.getElementById('start-info-content');
                if (contentEl && txt) contentEl.textContent = txt;
            }).catch(() => { /* 回退占位文案 */ });
        } catch (e) { /* 回退占位文案 */ }
        return text.split('\n').map(line => line ? line : '&nbsp;').join('<br>');
    }
;

// _buildVersionContent — 版本信息：当前版本 + 最新版本（可选拉取）；不一致时附前往按钮
    UIController.prototype._buildVersionContent = function() {
        const current = (typeof window.GAME_VERSION !== 'undefined') ? window.GAME_VERSION : '未知';
        const base = `
            <div style="margin-bottom:6px;"><b>当前版本</b>：<span id="ver-current" style="color:#fff;font-weight:800;">${current}</span></div>
            <div style="margin-bottom:6px;"><b>最新版本</b>：<span id="ver-latest">检查中…</span></div>
            <div id="ver-hint" style="color:#94a3b8;font-size:13px;margin-top:8px;">正在连接服务器检查最新版本…</div>
        `;
        const actions = [
            { href: 'https://shaihai.cn', text: '进入 shaihai.cn' },
            { href: 'https://space.bilibili.com/3690976753223882', text: '进入我们的 B 站主页' }
        ];
        // 异步检查最新版本（失败时显示当前版本并隐藏提示）
        try {
            fetch('https://shaihai.cn/api/version').then(r => {
                if (!r.ok) throw new Error('no ver');
                return r.json();
            }).then(v => {
                const latest = (v && (v.version || v.latest || v.data && v.data.version)) || null;
                const latestEl = document.getElementById('ver-latest');
                const hintEl = document.getElementById('ver-hint');
                if (latestEl) latestEl.textContent = latest || current;
                if (hintEl) {
                    if (latest && latest !== current) {
                        hintEl.innerHTML = '检测到新版本！可前往下方入口获取最新版本。';
                        hintEl.style.color = '#fbbf24';
                    } else {
                        hintEl.innerHTML = '你已是最新版本。';
                        hintEl.style.color = '#22c55e';
                    }
                }
                // 更新按钮区：显示前往入口
                const actionsEl = document.getElementById('start-info-actions');
                if (actionsEl && actionsEl.childNodes.length === 0) {
                    actions.forEach(a => {
                        const btn = document.createElement('a');
                        btn.href = a.href;
                        btn.target = '_blank';
                        btn.rel = 'noopener noreferrer';
                        btn.className = 'btn btn-secondary';
                        btn.textContent = a.text;
                        btn.style.cssText = 'width:100%; text-align:center;';
                        actionsEl.appendChild(btn);
                    });
                }
            }).catch(() => {
                const latestEl = document.getElementById('ver-latest');
                const hintEl = document.getElementById('ver-hint');
                if (latestEl) latestEl.textContent = current;
                if (hintEl) { hintEl.innerHTML = '无法连接服务器，当前为本地最新版本。'; hintEl.style.color = '#94a3b8'; }
            });
        } catch (e) { /* 忽略 */ }
        return base;
    }
;

