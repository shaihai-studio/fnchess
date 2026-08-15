/**
 * UICoreGameEvents —— UICore 模块切片（UIController.prototype 挂载）
 *
 * 对局事件绑定 bindGameEvents（元素/锁定/提交/退出等全部玩家交互）
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype.bindGameEvents = function() {
        this.gameController.on('gameInit', (data) => {
            // 完全重置UI状态
            this.gridSystem.clearAll();
            this.gridSystem.functionHistory = [];
            this.gridSystem.usedCells = [];
            this._lastRemoteExpr = null;
            this.clearExpression();
            this._syncKeepExprToggleVisibility();
            this.updateScoreboard();
            this.updateHeaderPlayerNames();
            this.roundElement.textContent = data.currentRound;
            this.totalRoundsElement.textContent = data.totalRounds;
            this.clearAllMessages();
            const badge = document.getElementById('campaign-level-badge');
            if (badge) badge.style.display = 'none';
            this.campaignDifficulty = null;
            this.campaignCurrentLevelId = null;
            this.campaignCurrentLevelBestRecord = null;
            
            // 测试模式特殊提示
            if (data.isTestMode) {
                this.hideBattleUI();
                this.showMessage('测试模式：自由构造函数，函数将持续显示在画布上');
            } else if (data.gameMode === 'campaign') {
                this.hideBattleUI();
                this.showMessage('闯关模式：请直接构造函数作答');
            } else if (data.gameMode === 'race') {
                // 多人联机竞速对战：走专属对局流程（特性卡/进度广播/房主结算），不显示单人竞速 UI
                if (this._rbMatchStarted && this.raceIsMultiplayer) {
                    this.hideBattleUI();
                    this._rbOnGameInit(data);
                    return;
                }
                this.hideBattleUI();
                this.showRaceBattleUI(data);
                this.showMessage(`竞速模式：第 ${data.currentRound} 关开始`);
            } else {
                this.restoreBattleUI();
                const state = this.gameController.getGameState();
                let starterLabel = '玩家B';
                if (state.gameMode === 'p2p' && this.p2pController) {
                    starterLabel = this.p2pController.myPlayerId === 'B' ? '你的回合，' : '对方回合，';
                }
                this.showMessage(`游戏开始！${starterLabel}请选择目标网格`);
            }
            
            // Summa: hook game start
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                window.summaCharacter.show('ai');
                window.summaCharacter.reactStart();
            } else if (window.summaCharacter) {
                window.summaCharacter.show('local'); // Hides summa
            }

            // 按当前难度重渲染元素面板（简单难度/分数关隐藏反三角函数）
            this.initDraggableElements();
        });
        
        this.gameController.on('phaseChange', (data) => {
            if (window.audioManager) window.audioManager.playPhaseChange();
            this.updatePhaseUI(data.phase);
            
            // Summa Reaction Hook for Phase Change
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                if (data.phase === 'input_function') {
                    if (data.currentPlayer === 'B') {
                        window.summaCharacter.reactAiThink();
                    } else {
                        window.summaCharacter.reactPlayerAction();
                    }
                    // 玩家输入函数时，Summa 看向公式输入区
                    window.summaCharacter.setLookMode('expression');
                } else if (data.phase === 'evaluate') {
                    if (data.currentPlayer === 'B') {
                        window.summaCharacter.reactAiPlay();
                    }
                    window.summaCharacter.setLookMode('mouse');
                } else if (data.phase === 'select_target' || data.phase === 'set_forbidden' || data.phase === 'set_locks') {
                    // 选择目标格/禁止区/锁定：Summa 跟随鼠标在棋盘上的位置
                    window.summaCharacter.setLookMode('canvas');
                } else {
                    window.summaCharacter.setLookMode('mouse');
                }
            }
            
            // 同步历史使用过的格子到 GridSystem（不启动动画）
            const state = this.gameController.getGameState();
            if (state.usedCells) {
                this.gridSystem.usedCells = state.usedCells;
                // 只更新数据，不重绘（等待函数绘制完成后再绘制和播放动画）
            }
            
            // 同步历史函数和当前回合数（确保在updateRange后能正确显示）
            if (state.functionHistory) {
                this.gridSystem.functionHistory = state.functionHistory;
                this.gridSystem.currentRound = state.currentRound;
            }
            
            // 如果是人机模式且当前是AI的回合，触发AI行动
            if (this.gameController.gameMode === 'ai' && data.currentPlayer === 'B') {
                this.triggerAITurn(data.phase);
            }

        });
        
        this.gameController.on('timerUpdate', (data) => {
            if (window.audioManager && data.remainingTime > 0 && data.remainingTime <= 5) {
                window.audioManager.playTick();
            }
            this.updateTimer(data.remainingTime);
        });
        
        this.gameController.on('timeout', (data) => {
            if (window.audioManager) window.audioManager.playError();
            if (data && data.reason === 'select_target') {
                const n = Number(data.consecutive) || 0;
                if (n > 0) {
                    // 禁止区/锁定区超时：扣 1 分并重试 20s，累计 3 次判负
                    this.showMessage(`${this.getPlayerDisplayName(data.player)}选格子超时！扣1分（第${n}/3次，再超时${Math.max(0, 3 - n)}次判负）`, 'error');
                } else {
                    // 选目标格超时（未选）：扣 1 分，由对手重新选格（不进输入回合）
                    this.showMessage(`${this.getPlayerDisplayName(data.player)}选目标格超时！扣1分，由对手重新选格`, 'error');
                }
            } else if (data && data.reason === 'select_target_selected') {
                // 选目标格超时但已选（含未确认）：不扣分，直接进入对手输入回合
                this.showMessage(`${this.getPlayerDisplayName(data.player)}选目标格超时，已选目标格不扣分，直接进入对手回合`, 'warning');
            } else {
                this.showMessage(`${this.getPlayerDisplayName(data.player)}超时！扣1分`, 'error');
            }
            // 扣分后立即刷新分数显示（选格子超时不经过 roundComplete）
            try { this.updateScoreboard(); } catch (e) { /* 忽略 */ }
        });

        // 选格子连续超时 3 次 → 消极比赛判负
        this.gameController.on('forfeit', (data) => {
            if (window.audioManager) window.audioManager.playError();
            this.showMessage(`${this.getPlayerDisplayName(data.loser)} 选格子连续超时 3 次，消极比赛判负！${this.getPlayerDisplayName(data.winner)}获胜`, 'error');
        });

        // 统一的输入阶段准备：只做 UI 侧清理（模型清理由 GameController.prepareInputPhase() 负责）
        this.gameController.on('prepareInputPhase', (data) => {
            // 「保留解析式」已改为默认行为：提交失败后不自动清空表达式（原开关已删除）
            const keepExpr = true;
            if (!keepExpr) {
                this.clearExpression();
            }
        });
        
        this.gameController.on('targetSelected', (data) => {
            if (window.audioManager) window.audioManager.playClick();
            // 更新所有目标格的显示
            this.gridSystem.setTargetCells(this.gameController.roundState.targetCells);
            const progress = data.count && data.total ? ` (${data.count}/${data.total})` : '';
            this.showMessage(`目标网格 ${data.count} 已选择: (${data.cell.x}, ${data.cell.y})${progress}`);
            
            // 更新阶段提示
            const state = this.gameController.getGameState();
            if (state.targetCount > 1) {
                this.phaseHintElement.textContent = `请点击棋盘选择 ${state.targetCount} 个目标网格 (${this.gameController.roundState.targetCells.length}/${state.targetCount})`;
            }
            // 重新计算确认按钮禁用态（选够/取消目标格后及时刷新）
            this.updatePhaseUI(this.gameController.currentPhase);

        });
        
        this.gameController.on('targetRemoved', (data) => {
            if (window.audioManager) window.audioManager.playElementClick();
            // 更新所有目标格的显示
            this.gridSystem.setTargetCells(this.gameController.roundState.targetCells);
            this.showMessage(`目标网格已取消: (${data.cell.x}, ${data.cell.y})`);
            
            // 更新阶段提示
            const state = this.gameController.getGameState();
            if (state.targetCount > 1) {
                this.phaseHintElement.textContent = `请点击棋盘选择 ${state.targetCount} 个目标网格 (${this.gameController.roundState.targetCells.length}/${state.targetCount})`;
            }
            // 重新计算确认按钮禁用态（选够/取消目标格后及时刷新）
            this.updatePhaseUI(this.gameController.currentPhase);

        });
        
        this.gameController.on('forbiddenAdded', (data) => {
            if (window.audioManager) window.audioManager.playClick();
            this.gridSystem.addForbiddenCell(data.cell);
            this.showMessage(`禁止区已设置: (${data.cell.x}, ${data.cell.y})`);
            // 更新阶段提示中的计数
            const state = this.gameController.getGameState();
            this.phaseHintElement.textContent = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;

        });
        
        this.gameController.on('forbiddenRemoved', (data) => {
            if (window.audioManager) window.audioManager.playElementClick();
            this.gridSystem.removeForbiddenCell(data.cell);
            this.showMessage(`禁止区已取消: (${data.cell.x}, ${data.cell.y})`);
            // 更新阶段提示中的计数
            const state = this.gameController.getGameState();
            this.phaseHintElement.textContent = `设置禁止区 (${state.roundState.forbiddenCells.length}/${state.maxForbidden}) - 点击棋盘选择，选好后点击确认`;

        });
        
        this.gameController.on('elementLocked', (data) => {
            this.updateLockedElements();
            this.showMessage(`已锁定元素: ${data.element}`);
        });

        // P2P：用户点"确认目标/禁止/锁定"时 currentPhase 已被对端快照覆盖（非预期阶段），
        // 请求同步自愈并提示用户稍候，避免按钮无反应造成困惑。
        this.gameController.on('phaseMismatchHint', (data) => {
            this.showMessage('正在与对手同步状态，请稍候…', 'warning');
        });
        
        this.gameController.on('evaluationComplete', (data) => {
            if (window.audioManager) {
                if (data.hitTarget && !data.hitForbidden) {
                    window.audioManager.playSuccess();
                } else {
                    window.audioManager.playError();
                }
            }
            this.showEvaluationResult(data);
            
            // 保存函数到历史记录（用于淡化显示）
            // 闯关模式下不记录历史函数
            if (data.expression && data.round && !this.gameController.campaignState.active) {
                // 确保functionHistory存在
                if (!this.gameController.functionHistory) {
                    this.gameController.functionHistory = [];
                }
                
                // 获取当前函数的采样点
                const range = this.gridSystem.getRange();
                const points = this.renderer.sampleFunction(data.expression, range.min, range.max);
                
                // 直接添加到GameController的functionHistory
                this.gameController.functionHistory.push({
                    expression: data.expression,
                    round: data.round,
                    points: points,
                    color: '#00d4ff', // 默认颜色
                    sampledRange: this.gridSystem.range  // 记录采样时的 range，用于 range 扩大后的重采样判断
                });
                // 历史淡化绘制只用最近 2 回合（GridSystem.drawHistoryFunctions 只画 roundDiff 1~2），
                // 裁剪更早的函数，防止 functionHistory 无限增长 → 每个函数数千~上万个采样点，
                // 导致 P2P 同步序列化/重绘越到后面越卡。
                const _histCutoff = this.gameController.currentRound - 2;
                if (_histCutoff > 0) {
                    this.gameController.functionHistory =
                        this.gameController.functionHistory.filter(f => f.round >= _histCutoff);
                }
            }

            // ── 挑衅反转学习钉子 ────────────────────────────────────────────────
            // 当 AI 模式下玩家 A 正在解答 Summa 的挑衅题目，需要让 Summa 学习或反馈
            if (this.gameController.gameMode === 'ai'
                && this.gameController.currentPlayer === 'A'
                && this.aiController.pendingRevengePuzzle !== null) {
                if (data.hitTarget && !data.hitForbidden) {
                    // 玩家成功解题：Summa 学习该解法
                    this.aiController.learnFromPlayer(data.expression);
                } else {
                    // 玩家也失败：Summa 得意
                    this.aiController.notifyPlayerFailedRevenge();
                }
            }

            // ── 玩家解析式深度训练 ─────────────────────────────────────────────────
            // AI 模式下，无论玩家成功与否，都对玩家的解析式进行 10000 局类似局面训练
            if (this.gameController.gameMode === 'ai'
                && this.gameController.currentPlayer === 'A'
                && data.expression) {
                const trainState = this.gameController.getGameState();
                // 静默后台训练，不阻塞游戏流程
                this.aiController.trainOnPlayerExpression(
                    data.expression,
                    trainState.roundState.targetCells,
                    trainState.roundState.forbiddenCells
                );
            }
        });

        // 闯关：关卡结果与自动进入下一关/重试
        this.gameController.on('campaignLevelResult', (data) => {
            if (!this.campaignIsCustom) this.refreshCampaignStartUI();
            const rawLevelId = data.levelId || this.campaignCurrentLevelId || 1;
            const isFraction = typeof rawLevelId === 'string' && String(rawLevelId).includes('/');
            const levelId = isFraction ? String(rawLevelId) : Number(rawLevelId || 1);
            if (!this.campaignIsCustom) {
            let isNewRecord = false;
            let previousBest = this.getCampaignLevelBestRecord(levelId);
            if (data.pass) {
                const length = this.getCurrentExpressionLength();
                if (previousBest === null || length < previousBest) {
                    isNewRecord = true;
                    this.campaignCurrentLevelBestRecord = previousBest;
                } else {
                    this.campaignCurrentLevelBestRecord = previousBest;
                }
                data.expressionLength = length;
                data.isNewRecord = isNewRecord;
                data.previousBest = previousBest;
                if (isNewRecord) {
                    const gainedStars = Math.max(1, Math.min(5, Number(data.score) || 1));
                    const previousStars = this.getCampaignLevelBestStars(levelId);
                    if (gainedStars > previousStars) {
                        const currentStars = this.getCampaignCollectedStars();
                        this.setCampaignCollectedStars(currentStars + (gainedStars - previousStars));
                        this.setCampaignLevelBestStars(levelId, gainedStars);
                    }
                    this.setCampaignLevelBestRecord(levelId, length);
                    // 分数关：更新独立进度（首次全通时弹出解锁提示）
                    if (isFraction) {
                        const denom = parseInt(String(rawLevelId).split('/')[1]) || 2;
                        if (typeof this._updateFractionClearedAndNotify === 'function') {
                            this._updateFractionClearedAndNotify(denom);
                        }
                    }
                    setTimeout(() => {
                        if (this.campaignCurrentLevelId === levelId || String(this.campaignCurrentLevelId) === String(levelId)) {
                            this.campaignCurrentLevelBestRecord = length;
                            this.updateCampaignGlobalProgressText(this.getCampaignCollectedStars());
                        }
                    }, 0);
                } else if (data.pass && typeof previousBest === 'number' && previousBest > 0) {
                    // 非新记录但通关了：也更新分数关进度（首次全通时弹出解锁提示）
                    if (isFraction) {
                        const denom = parseInt(String(rawLevelId).split('/')[1]) || 2;
                        if (typeof this._updateFractionClearedAndNotify === 'function') {
                            this._updateFractionClearedAndNotify(denom);
                        }
                    }
                }
            }
            }
            setTimeout(() => {
                try {
                    if (data.pass) {
                        this.showCampaignVictory(data);
                    } else {
                        this.gameController.prepareInputPhase();
                    }
                } catch (e) {
                    console.error('[Campaign] 处理关卡结果失败:', e);
                }
            }, 900);
        });

        this.gameController.on('campaignLevelLoaded', (data) => {
            try {
                this.updateCampaignDrawDelayToggleVisibility();
                // 闯关：隐藏计时器与回合数显示
                if (this.timerElement && this.timerElement.parentElement) {
                    this.timerElement.parentElement.style.display = 'none';
                }
                if (this.currentPlayerElement && this.currentPlayerElement.parentElement) {
                    this.currentPlayerElement.parentElement.style.display = 'none';
                }
                document.querySelectorAll('.score-display').forEach(el => {
                    el.style.display = 'none';
                });
                const roundDisplay = document.getElementById('round-display');
                if (roundDisplay) roundDisplay.style.display = 'none';

                // 更新顶部回合显示为关卡编号
                this.roundElement.textContent = data.levelId;
                this.totalRoundsElement.textContent = data.totalLevels;

                // 清空画布标记与表达式
                this.gridSystem.clearAll();
                this.clearExpression();

                // 设置目标与禁区
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                // 闯关模式每关独立，清空上一关遗留的历史函数与历史格子
                this.gridSystem.functionHistory = [];
                this.gridSystem.usedCells = [];
                this.gridSystem.draw();

                // 初始化可拖拽元素（会根据 lockedElements 上锁）
                this.initDraggableElements();

                // 提示
                const diffName = {
                    easy: '简单',
                    normal: '普通',
                    hard: '困难',
                    expert: '专家',
                    unsolvable: '无解'
                }[data.difficulty] || data.difficulty;
                this.updateCampaignLevelBadge(data.levelId, data.totalLevels, data.difficulty);
                this.showMessage(`闯关：关卡 ${data.levelId}（${diffName}）`, 'info');
            } catch (e) {
                console.error('[Campaign] campaignLevelLoaded 错误:', e);
            }
        });

        this.gameController.on('raceLevelLoaded', (data) => {
            try {
                // 棋盘加载（单人/多人竞速共用）：换关必须重置棋盘
                this.gridSystem.setRaceFixedRange(true);
                this.gridSystem.clearAll();
                this.clearExpression();
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                // 竞速每关独立，清空历史函数
                this.gridSystem.functionHistory = [];
                this.gridSystem.draw();
                this.initDraggableElements();
                // 多人联机竞速对战：不更新单人 HUD、不播单人倒计时（统一 goAt 起跑/特性卡由多人流程负责）
                if (this._rbMatchStarted && this.raceIsMultiplayer) {
                    // 2026-08-11 修复：换第二关卡死——多人分支提前 return，跳过下方单人 HUD，
                    // 但悬浮键盘/圆形按钮必须按当前阶段（INPUT_FUNCTION）恢复显示，否则输入区被隐藏无法输入
                    if (typeof this._applyFloatKeypadVisibility === 'function') {
                        try { this._applyFloatKeypadVisibility(); } catch (e) {}
                    }
                    return;
                }
                this.updateCampaignDrawDelayToggleVisibility();
                this.roundElement.textContent = data.levelId;
                this.totalRoundsElement.textContent = data.totalLevels || 30;
                this.updateRaceBattleUI(data.levelId, data.elapsed || 0);
                this.raceLiveTimeValue && (this.raceLiveTimeValue.style.display = 'block');
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.startRaceCountdown();
                this.showMessage(`竞速：第 ${data.levelId} 关`, 'info');
            } catch (e) {
                console.error('[Race] raceLevelLoaded 错误:', e);
            }
        });

        this.gameController.on('racePuzzleLoaded', (data) => {
            try {
                this.gridSystem.clearAll();
                this.clearExpression();
                this.gridSystem.setTargetCells(data.roundState.targetCells || []);
                this.gridSystem.forbiddenCells = data.roundState.forbiddenCells || [];
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.gridSystem.draw();
                this.initDraggableElements();
            } catch (e) {
                console.error('[Race] racePuzzleLoaded 错误:', e);
            }
        });

        this.gameController.on('racePuzzleCleared', (data) => {
            try {
                // 多人联机竞速对战：只更新对战进度面板并广播，不展示单人 HUD 消息
                if (this._rbMatchStarted && this.raceIsMultiplayer) {
                    this._rbOnPuzzleCleared(data);
                    return;
                }
                this.updateRacePuzzleProgress(data.solvedCount || 0, data.totalSolved || 10);
                this.updateRaceBattleUI(data.levelId, data.elapsed || 0);
                this.showMessage(`已完成 ${data.solvedCount}/${data.totalSolved} 个谜题`, 'info');
            } catch (e) {
                console.error('[Race] racePuzzleCleared 错误:', e);
            }
        });

        this.gameController.on('raceLevelResult', (data) => {
            try {
                // 多人联机竞速对战：进入下一关或完赛，不展示单人胜利弹窗/记录
                if (this._rbMatchStarted && this.raceIsMultiplayer) {
                    this._rbOnLevelResult(data);
                    return;
                }
                if (data.pass) {
                    this.clearRaceCountdown();
                    this.stopRaceElapsedTimer();
                    const afterWin = () => {
                        // 自定义竞速关不解锁内置 30 关进度；多人竞速对战也不解锁/不写单人进度
                        if (!this.raceIsCustom && !this.raceIsMultiplayer) this.unlockNextRaceLevel(data.levelId);
                        this.showRaceVictory(data);
                    };
                    // 自定义关/多人对战不记录最佳成绩，故不播放 NEW RECORD 过场
                    if (data.isNewBest && !this.raceIsCustom && !this.raceIsMultiplayer) this.playRaceNewRecordIntro(() => { if (window.audioManager) window.audioManager.playRaceFanfare?.(); afterWin(); });
                    else { if (window.audioManager) window.audioManager.playRaceFinish?.(); afterWin(); }
                } else {
                    this.showMessage('挑战失败，请重试本关', 'error');
                    this.gameController.prepareInputPhase();
                }
            } catch (e) {
                console.error('[Race] raceLevelResult 错误:', e);
            }
        });
        
        // 回合结束时的处理
        this.gameController.on('roundComplete', (data) => {
            try {
                // 1. 更新UI
                this.updateScoreboard();
                this.roundElement.textContent = data.currentRound;
                
                // 2. 清空当前回合的目标格和禁区（但保留usedCells）
                this.gridSystem.clearAll();
                // 对战模式（local/ai/p2p）：每个回合结束后清空表达式，避免上一回合解析式残留到新回合
                // （「提交失败后保留解析式」的默认保留行为仍作用于同一回合内的失败重试，不受影响）
                const gm = this.gameController && this.gameController.gameMode;
                if (gm === 'local' || gm === 'ai' || gm === 'p2p') {
                    this.clearExpression();
                }
                
                // 3. 显示消息
                this.showMessage(`第 ${data.currentRound - 1} 回合结束`);
                
                // 4. 重新初始化元素视图
                this.initDraggableElements();
                
                // 5. 更新usedCells并重绘
                const state = this.gameController.getGameState();
                if (state.usedCells && state.usedCells.length > 0) {
                    this.gridSystem.usedCells = state.usedCells;
                }
                
                // 6. 更新历史函数
                if (state.functionHistory && state.functionHistory.length > 0) {
                    this.gridSystem.functionHistory = state.functionHistory;
                    this.gridSystem.currentRound = data.currentRound;
                }
                
                this.gridSystem.draw();
            } catch (error) {
                console.error('[UI] roundComplete 错误:', error);
            }
        });
        
        this.gameController.on('gameEnd', (data) => {
            if (window.audioManager) window.audioManager.playGameWin();
            const finishGameOver = () => this.showGameOver(data);

            // 对局正常结束 → 双方都标记已结算，防止"中途退出判负"逻辑误触发
            this._p2pEloSettled = true;
            this._clearP2PResumeContext(); // 正常结束也清除可恢复上下文

            // 排行榜：仅排位模式且房主（Host）唯一上报 ELO 结果（服务器按房间码去重）
            // 休闲模式（_p2pMatchMode === 'casual'）不计算任何 ELO
            if (this.isP2PMode && this._p2pMatchMode === 'ranked'
                && this.p2pController && this.p2pController.isHost && this._leaderboardService) {
                this._submitP2PELO(data);
            }

            // Summa Reaction Hook
            if (this.gameController.gameMode === 'ai' && window.summaCharacter) {
                const summa = window.summaCharacter;
                const prevHandler = summa.onSpeechQueueEmpty;
                summa.onSpeechQueueEmpty = () => {
                    summa.onSpeechQueueEmpty = prevHandler || null;
                    finishGameOver();
                    if (typeof prevHandler === 'function') prevHandler();
                };
                if (data.winner === 'B') {
                    summa.reactWin();
                    return;
                } else if (data.winner === 'A') {
                    summa.reactLose();
                    return;
                }
            }
            finishGameOver();
        });

        // 测试模式函数面板：函数新增/删除/清空/更新时自动刷新列表
        this.gameController.on('testModeFunctionAdded', () => this.renderTestFunctionPanel());
        this.gameController.on('testModeFunctionRemoved', () => this.renderTestFunctionPanel());
        this.gameController.on('testModeFunctionsCleared', () => this.renderTestFunctionPanel());
        this.gameController.on('testModeFunctionUpdated', () => this.renderTestFunctionPanel());
    }
;

// _submitP2PELO
