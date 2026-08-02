/**
 * GameController 模块
 * 控制游戏流程与规则
 * 管理回合、玩家、得分、时间
 */
class GameController {
    constructor() {
        // 游戏配置
        this.totalRounds = 8; // 默认8回合
        this.currentRound = 1;
        
        // 游戏模式
        this.gameMode = 'local'; // 'local' 本地对战, 'ai' 人机对战, 'campaign' 闯关模式, 'race' 竞速模式        
        // 难度设置
        this.difficulty = 'normal'; // easy, normal, hard, expert, test
        this.targetCount = 1; // 根据难度设置目标格数量
        
        // 测试模式：保存绘制的函数
        this.testModeFunctions = []; // { expression: string, color: string, timestamp: number }
        
        // 玩家状态
        this.players = {
            A: { score: 0, role: 'constructor' }, // 构造函数者
            B: { score: 0, role: 'selector' }     // 选择目标者
        };
        this.currentPlayer = 'B'; // B 先开始选择目标
        
        // 游戏阶段
        this.phases = {
            INIT: 'init',
            SELECT_TARGET: 'select_target',
            SET_FORBIDDEN: 'set_forbidden',
            SET_LOCKS: 'set_locks',
            INPUT_FUNCTION: 'input_function',
            EVALUATE: 'evaluate',
            SETTLE: 'settle',
            SWITCH_PLAYER: 'switch_player',
            END: 'end'
        };
        this.currentPhase = this.phases.INIT;
        
        // 时间限制（秒）
        this.timeLimit = 40;
        this.timeLimitMode = 'normal';
        this.timeLimitMultiplier = 1;
        this.remainingTime = 40;
        this.timerInterval = null;
        
        // 回合状态
        this.roundState = {
            targetCells: [], // 多个目标格数组
            targetCell: null, // 兼容旧代码，指向第一个目标格
            forbiddenCells: [],
            lockedElements: [],
            functionExpression: '',
            hitTargets: [], // 记录哪些目标格被穿过
            hitTarget: false, // 兼容旧代码，是否全部穿过
            hitForbidden: false,
            score: 0
        };
        
        // 历史使用过的格子（目标格和禁止区）
        this.usedCells = []; // [{x, y, type: 'target'|'forbidden', round: number}, ...]
        
        // 回调函数
        this.callbacks = {};
        
        // 游戏历史记录（用于生成报告）
        this.gameHistory = [];

        // 闯关模式状态
        this.campaignState = {
            active: false,
            levelPack: null,
            totalLevels: 0,
            currentLevelId: 1
        };

        // 竞速模式状态
        this.raceState = {
            active: false,
            totalLevels: 30,
            currentLevelId: 1,
            startedAt: null,
            clearedLevels: new Set(),
            bestTimes: {},
            elapsedTimer: null,
            roundSeed: null,
            solvedCount: 0,
            puzzlesPerLevel: 10,
            fixedRange: 10 // 20x20范围：坐标从-10到9
        };
        
        // P2P联机动作发送器
        this.p2pActionSender = null;

        // 全量同步：UI 层提供的数据快照钩子（由 UIController 注入）
        this._syncHook = null;
        // 正在应用远端快照时置为 true，避免镜像回环
        this._applyingRemote = false;
        // 状态快照版本号，用于 P2P 同步时拒绝旧版本覆盖新版本
        this._stateVersion = 0;
        // 被动方复制推进（finalizeRound/startNextRound）期间抑制 P2P 阶段确认推送，
        // 避免把本地复制推进的状态推回给操作方造成覆盖
        this._suppressP2PSync = false;
        // 全量快照请求节流（与 P2PController._lastFullSyncRequestAt 对齐，2s 一次，避免高频触发）
        this._lastFullSyncRequestAt = 0;
    }
    
    /**
     * 注册回调函数
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        this.callbacks[event] = callback;
    }
    
    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {*} data - 数据
     */
    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }
    
    /**
     * 初始化游戏
     * @param {number} rounds - 总回合数
     * @param {string} difficulty - 难度级别 (easy, normal, hard, expert, test)
     * @param {string} gameMode - 游戏模式 (local, ai)
     */
    initGame(rounds = 8, difficulty = 'normal', gameMode = 'local') {
        // 退出闯关/竞速模式
        this.campaignState.active = false;
        this.campaignState.levelPack = null;
        this.campaignState.totalLevels = 0;
        this.campaignState.currentLevelId = 1;
        this.raceState.active = false;
        this.raceState.currentLevelId = 1;
        this.raceState.startedAt = null;
        this.raceState.clearedLevels = new Set();
        this.raceState.solvedCount = 0;

        this.totalRounds = Math.min(Math.max(rounds, 4), 24);
        this.difficulty = difficulty;
        this.targetCount = this.getTargetCountByDifficulty(difficulty);
        this.currentRound = 1;
        this.gameMode = gameMode;
        this.players.A.score = 0;
        this.players.B.score = 0;
        
        // 清空测试模式函数和游戏历史
        this.testModeFunctions = [];
        this.clearGameHistory();
        
        // 清空历史使用过的格子
        this.usedCells = [];
        
        // 记录每个元素被锁定的次数（一局游戏中最多2次）
        this.elementLockCounts = new Map(); // element -> count
        
        // 重置状态版本号
        this._stateVersion = 0;
        
        // 记录历史函数（用于淡化显示）
        this.functionHistory = [];
        
        // 第1回合B选择目标，A构建函数
        this.currentPlayer = 'B';
        
        this.updateTimeLimit();
        this.resetRoundState();
        
        // 测试模式直接进入输入函数阶段，跳过目标选择等
        if (this.isTestMode()) {
            this.setPhase(this.phases.INPUT_FUNCTION);
        } else {
            this.setPhase(this.phases.SELECT_TARGET);
        }
        
        this.emit('gameInit', {
            totalRounds: this.totalRounds,
            currentRound: this.currentRound,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: this.isTestMode(),
            gameMode: this.gameMode
        });
    }

    /**
     * 初始化闯关模式
     * @param {Object} levelPack - levels.txt 解析后的对象
     * @param {number} startLevelId - 起始关卡编号
     */
    initCampaign(levelPack, startLevelId = 1) {
        if (!levelPack || !Array.isArray(levelPack.levels)) return false;

        // 清空普通对局状态
        this.clearGameHistory();
        this.usedCells = [];
        this.functionHistory = [];
        this.testModeFunctions = [];
        this.elementLockCounts = new Map();

        this.gameMode = 'campaign';
        this.campaignState.active = true;
        this.campaignState.levelPack = levelPack;
        this.campaignState.totalLevels = levelPack.levels.length;
        this.players.A.score = 0;
        this.players.B.score = 0;

        const ok = this.loadCampaignLevel(startLevelId);
        if (!ok) return false;

        this.emit('gameInit', {
            totalRounds: this.totalRounds,
            currentRound: this.currentRound,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: false,
            gameMode: this.gameMode
        });

        this.emit('campaignLevelLoaded', {
            levelId: this.campaignState.currentLevelId,
            totalLevels: this.campaignState.totalLevels,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            roundState: { ...this.roundState }
        });

        this.setPhase(this.phases.INPUT_FUNCTION);
        return true;
    }

    /**
     * 加载某个闯关关卡（不会自动切阶段）
     */
    loadCampaignLevel(levelId) {
        if (!this.campaignState.active || !this.campaignState.levelPack) return false;
        const id = levelId;
        const level = this.campaignState.levelPack.levels.find(l => String(l.id) === String(id));
        if (!level) return false;

        this.campaignState.currentLevelId = id;
        this.currentRound = id;
        this.totalRounds = this.campaignState.totalLevels;

        // 闯关难度由关卡本身标记决定；旧数字关卡沿用原区间映射
        if (level.difficulty === 'fraction') this.difficulty = 'fraction';
        else if (Number(id) >= 1 && Number(id) <= 29) this.difficulty = 'easy';
        else if (Number(id) >= 30 && Number(id) <= 53) this.difficulty = 'normal';
        else if (Number(id) >= 54 && Number(id) <= 69) this.difficulty = 'hard';
        else if (Number(id) >= 70 && Number(id) <= 81) this.difficulty = 'expert';
        else this.difficulty = 'expert';

        // 闯关：目标格数量按关卡数据
        this.targetCount = Array.isArray(level.targetCells) ? level.targetCells.length : 1;

        this.updateTimeLimit();
        this.resetRoundState();
        this.roundState.targetCells = (level.targetCells || []).map(c => ({ x: c.x, y: c.y }));
        this.roundState.targetCell = this.roundState.targetCells[0] || null;
        this.roundState.forbiddenCells = (level.forbiddenCells || []).map(c => ({ x: c.x, y: c.y }));
        this.roundState.lockedElements = (level.lockedElements || []).slice();

        // 单人闯关：让玩家A作为构造者
        this.currentPlayer = 'A';

        this.emit('campaignLevelLoaded', {
            levelId: id,
            totalLevels: this.campaignState.totalLevels,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            roundState: { ...this.roundState }
        });

        return true;
    }

    initRace(levelId = 1) {
        const safeLevelId = Math.max(1, Math.min(30, Number(levelId) || 1));
        this.stopTimer();
        this.campaignState.active = false;
        this.campaignState.levelPack = null;
        this.campaignState.totalLevels = 0;
        this.campaignState.currentLevelId = 1;
        this.raceState.active = false;
        this.raceState.currentLevelId = safeLevelId;
        this.raceState.startedAt = null;
        this.raceState.elapsedTimer = null;
        this.raceState.roundSeed = null;

        this.gameMode = 'race';
        this.raceState.active = true;
        this.raceState.currentLevelId = safeLevelId;
        this.raceState.startedAt = null;
        this.raceState.countdownPending = true;
        this.raceState.solvedCount = 0;
        this.raceState.fixedRange = 10; // 20x20范围：坐标从-10到9
        this.loadRaceBestTimes();

        this.totalRounds = 1;
        this.currentRound = safeLevelId;
        this.difficulty = 'normal';
        this.clearGameHistory();
        this.usedCells = [];
        this.functionHistory = [];
        this.testModeFunctions = [];
        this.elementLockCounts = new Map();

        this.updateTimeLimit();
        this.resetRoundState();

        const raceLevel = this.buildRaceLevel();
        this.targetCount = raceLevel.targetCells.length; // 动态设置为当前等级的允许区数量
        this.roundState.targetCells = raceLevel.targetCells;
        this.roundState.targetCell = this.roundState.targetCells[0] || null;
        this.roundState.forbiddenCells = raceLevel.forbiddenCells;
        this.roundState.lockedElements = raceLevel.lockedElements;
        this.roundState.score = 0;
        this.roundState.hitTargets = [];
        this.roundState.hitTarget = false;
        this.roundState.hitForbidden = false;

        this.emit('gameInit', {
            totalRounds: 1,
            currentRound: safeLevelId,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: false,
            gameMode: this.gameMode,
            raceLevel
        });

        this.emit('raceLevelLoaded', {
            levelId: safeLevelId,
            totalLevels: this.raceState.totalLevels,
            roundState: { ...this.roundState },
            elapsed: 0,
            raceLevel
        });

        this.setPhase(this.phases.INPUT_FUNCTION);
        return true;
    }

    cleanupRaceState() {
        this.stopTimer();
        this.raceState.active = false;
        this.raceState.currentLevelId = 1;
        this.raceState.startedAt = null;
        this.raceState.elapsedTimer = null;
        this.raceState.roundSeed = null;
    }

    pauseTimer() {
        this.stopTimer();
    }

    getRaceElapsedSeconds() {
        if (!this.raceState.startedAt) return 0;
        return (Date.now() - this.raceState.startedAt) / 1000;
    }

    startRaceTimer() {
        if (!this.raceState.active) return;
        this.raceState.startedAt = Date.now();
        this.raceState.countdownPending = false;
    }

    getRaceStarsByElapsed(elapsed) {
        const t = Number(elapsed) || 0;
        if (t < 100) return 5;
        if (t < 150) return 4;
        if (t < 300) return 3;
        if (t < 1000) return 2;
        return 1;
    }

    loadRacePuzzleForCurrentLevel() {
        const raceLevel = this.buildRaceLevel();
        this.resetRoundState();
        this.roundState.targetCells = raceLevel.targetCells;
        this.roundState.targetCell = this.roundState.targetCells[0] || null;
        this.roundState.forbiddenCells = raceLevel.forbiddenCells;
        this.roundState.lockedElements = raceLevel.lockedElements;
        this.roundState.score = 0;
        this.roundState.hitTargets = [];
        this.roundState.hitTarget = false;
        this.roundState.hitForbidden = false;
        this.roundState.functionExpression = '';
        this.emit('racePuzzleLoaded', {
            levelId: this.raceState.currentLevelId,
            solvedCount: this.raceState.solvedCount || 0,
            totalSolved: this.raceState.puzzlesPerLevel || 10,
            roundState: { ...this.roundState },
            raceLevel
        });
        this.setPhase(this.phases.INPUT_FUNCTION);
    }

    buildRaceLevel() {
        const levelId = this.raceState.currentLevelId;
        const seed = Date.now() + Math.floor(Math.random() * 1000000);
        const rand = this.createSeededRandom(seed);
        const used = new Set();
        const minCoord = -this.raceState.fixedRange;
        const maxCoord = this.raceState.fixedRange - 1;
        const pickCell = () => {
            let x, y, key;
            do {
                x = Math.floor(rand() * (maxCoord - minCoord + 1)) + minCoord;
                y = Math.floor(rand() * (maxCoord - minCoord + 1)) + minCoord;
                key = `${x},${y}`;
            } while (used.has(key));
            used.add(key);
            return { x, y };
        };

        // 30个等级的配置数据
        const levelConfigs = [
            // id: 1
            { allowed: 1, forbidden: 1, fixedLocks: 0, randomLocks: 0, mustLock: [] },
            // id: 2
            { allowed: 1, forbidden: 1, fixedLocks: 1, randomLocks: 0, mustLock: [] },
            // id: 3
            { allowed: 1, forbidden: 3, fixedLocks: 3, randomLocks: 0, mustLock: [] },
            // id: 4
            { allowed: 2, forbidden: 1, fixedLocks: 0, randomLocks: 0, mustLock: [] },
            // id: 5
            { allowed: 2, forbidden: 1, fixedLocks: 1, randomLocks: 0, mustLock: [] },
            // id: 6
            { allowed: 2, forbidden: 2, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 7
            { allowed: 1, forbidden: 20, fixedLocks: 10, randomLocks: 0, mustLock: [] },
            // id: 8
            { allowed: 2, forbidden: 4, fixedLocks: 3, randomLocks: 0, mustLock: [] },
            // id: 9
            { allowed: 2, forbidden: 2, fixedLocks: 2, randomLocks: 2, mustLock: ['+', '-'] },
            // id: 10
            { allowed: 2, forbidden: 4, fixedLocks: 13, randomLocks: 1, mustLock: ['0','1','2','3','4','5','6','7','8','9','π','e','i'] },
            // id: 11
            { allowed: 2, forbidden: 10, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 12
            { allowed: 3, forbidden: 1, fixedLocks: 0, randomLocks: 0, mustLock: [] },
            // id: 13
            { allowed: 2, forbidden: 20, fixedLocks: 5, randomLocks: 0, mustLock: [] },
            // id: 14
            { allowed: 3, forbidden: 1, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 15
            { allowed: 3, forbidden: 1, fixedLocks: 5, randomLocks: 0, mustLock: [] },
            // id: 16
            { allowed: 3, forbidden: 2, fixedLocks: 3, randomLocks: 0, mustLock: [] },
            // id: 17
            { allowed: 3, forbidden: 3, fixedLocks: 4, randomLocks: 0, mustLock: [] },
            // id: 18
            { allowed: 3, forbidden: 20, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 19
            { allowed: 4, forbidden: 1, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 20
            { allowed: 4, forbidden: 2, fixedLocks: 3, randomLocks: 0, mustLock: [] },
            // id: 21
            { allowed: 2, forbidden: 200, fixedLocks: 0, randomLocks: 0, mustLock: [] },
            // id: 22
            { allowed: 2, forbidden: 300, fixedLocks: 0, randomLocks: 2, mustLock: [] },
            // id: 23
            { allowed: 4, forbidden: 3, fixedLocks: 4, randomLocks: 0, mustLock: [] },
            // id: 24
            { allowed: 3, forbidden: 6, fixedLocks: 6, randomLocks: 0, mustLock: [] },
            // id: 25
            { allowed: 5, forbidden: 2, fixedLocks: 2, randomLocks: 0, mustLock: [] },
            // id: 26
            { allowed: 5, forbidden: 3, fixedLocks: 4, randomLocks: 0, mustLock: [] },
            // id: 27
            { allowed: 3, forbidden: 200, fixedLocks: 1, randomLocks: 0, mustLock: [] },
            // id: 28
            { allowed: 3, forbidden: 5, fixedLocks: 5, randomLocks: 3, mustLock: ['sin','cos','tan','+','-'] },
            // id: 29
            { allowed: 3, forbidden: 4, fixedLocks: 15, randomLocks: 2, mustLock: ['0','1','2','3','4','5','6','7','8','9','π','e','i','+','-'] },
            // id: 30
            { allowed: 6, forbidden: 6, fixedLocks: 6, randomLocks: 0, mustLock: [] }
        ];

        const config = levelConfigs[levelId - 1];
        if (!config) {
            return { targetCells: [pickCell(), pickCell()], forbiddenCells: [pickCell(), pickCell()], lockedElements: [] };
        }

        const targetCells = [];
        for (let i = 0; i < config.allowed; i++) {
            targetCells.push(pickCell());
        }

        // 生成禁止区，确保不与目标格重叠
        const allCells = [];
        for (let x = minCoord; x <= maxCoord; x++) {
            for (let y = minCoord; y <= maxCoord; y++) {
                const key = `${x},${y}`;
                if (!used.has(key)) {
                    allCells.push({ x, y });
                }
            }
        }
        const forbiddenCount = Math.min(config.forbidden, allCells.length);
        const forbiddenCells = [];
        for (let i = 0; i < forbiddenCount; i++) {
            const idx = Math.floor(rand() * allCells.length);
            const cell = allCells.splice(idx, 1)[0];
            used.add(`${cell.x},${cell.y}`);
            forbiddenCells.push(cell);
        }

        // 生成锁定元素
        const lockedElements = [];
        const conflictGroups = [
            ['+', '-', '^'],           // 不能全部同时锁定
            ['!', 'sin', 'cos', 'tan'] // 不能全部同时锁定
        ];
        const wouldLockAll = (candidate, locked) => {
            for (const g of conflictGroups) {
                if (g.includes(candidate)) {
                    const already = locked.filter(el => g.includes(el)).length;
                    if (already + 1 === g.length) return true;
                }
            }
            return false;
        };

        // 固定锁定元素（mustLock中指定的），确保每个都被锁定
        const fixed = config.mustLock || [];
        for (const el of fixed) {
            if (lockedElements.includes(el)) continue;
            // 如果添加这个元素会导致冲突组全部被锁定，则需要先解锁组内一个非mustLock的元素
            if (wouldLockAll(el, lockedElements)) {
                for (const g of conflictGroups) {
                    if (g.includes(el)) {
                        const lockedInGroup = lockedElements.filter(x => g.includes(x));
                        // 找一个不是mustLock的元素解锁
                        const toUnlock = lockedInGroup.find(x => !fixed.includes(x));
                        if (toUnlock) {
                            lockedElements.splice(lockedElements.indexOf(toUnlock), 1);
                        }
                        break;
                    }
                }
            }
            if (!lockedElements.includes(el)) {
                lockedElements.push(el);
            }
        }

        // 如果固定锁定数量不足，从剩余元素中补充（不与已有元素冲突）
        const allElements = ['+','-','*','/','^','!','sin','cos','tan','arcsin','arccos','arctan','abs','sqrt','ln','log','exp','factorial','0','1','2','3','4','5','6','7','8','9','π','e','i'];
        const banned = new Set(['x', '(', ')']);
        let pool = allElements.filter(el => !banned.has(el) && !lockedElements.includes(el));

        while (lockedElements.length < config.fixedLocks && pool.length > 0) {
            const idx = Math.floor(rand() * pool.length);
            const candidate = pool[idx];
            if (candidate && !wouldLockAll(candidate, lockedElements)) {
                lockedElements.push(candidate);
                pool.splice(idx, 1);
            } else {
                pool.splice(idx, 1);
            }
        }

        // 随机锁定元素（从剩余元素中选，不导致冲突组全部锁定）
        pool = allElements.filter(el => !banned.has(el) && !lockedElements.includes(el));
        let attempts = 0;
        while (lockedElements.length < config.fixedLocks + config.randomLocks && pool.length > 0 && attempts < 1000) {
            attempts++;
            const idx = Math.floor(rand() * pool.length);
            const candidate = pool[idx];
            if (candidate && !wouldLockAll(candidate, lockedElements)) {
                lockedElements.push(candidate);
                pool.splice(idx, 1);
            } else {
                pool.splice(idx, 1);
            }
        }

        return { targetCells, forbiddenCells, lockedElements };
    }

    createSeededRandom(seed) {
        let s = (seed * 9301 + 49297) % 233280;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    getRaceProgress() {
        try {
            const cleared = localStorage.getItem('function_chess_race_cleared');
            const stars = localStorage.getItem('function_chess_race_stars');
            return {
                cleared: cleared ? Number(cleared) || 0 : 0,
                stars: stars ? Number(stars) || 0 : 0
            };
        } catch {
            return { cleared: 0, stars: 0 };
        }
    }

    setRaceProgress({ cleared = 0, stars = 0 } = {}) {
        try {
            localStorage.setItem('function_chess_race_cleared', String(Math.max(0, Number(cleared) || 0)));
            localStorage.setItem('function_chess_race_stars', String(Math.max(0, Number(stars) || 0)));
        } catch {}
    }

    getRaceBestTime(levelId) {
        try {
            const map = this.raceState.bestTimes || {};
            const v = Number(map[levelId]);
            return Number.isFinite(v) && v > 0 ? v : Infinity;
        } catch {
            return Infinity;
        }
    }

    setRaceBestTime(levelId, elapsed) {
        const t = Number(elapsed);
        if (!Number.isFinite(t) || t <= 0) return;
        const prev = this.getRaceBestTime(levelId);
        if (!Number.isFinite(prev) || t < prev) {
            this.raceState.bestTimes[levelId] = t;
            try {
                localStorage.setItem('function_chess_race_best_times', JSON.stringify(this.raceState.bestTimes));
            } catch {}
        }
    }

    loadRaceBestTimes() {
        try {
            const raw = localStorage.getItem('function_chess_race_best_times');
            const parsed = raw ? JSON.parse(raw) : {};
            this.raceState.bestTimes = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            this.raceState.bestTimes = {};
        }
    }

    getCampaignProgress() {
        try {
            const raw = localStorage.getItem('function_chess_campaign_cleared');
            const v = raw ? Number(raw) : 0;
            return Number.isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    }

    setCampaignProgress(clearedMax) {
        try {
            localStorage.setItem('function_chess_campaign_cleared', String(clearedMax));
        } catch (e) { }
    }

    advanceCampaignLevel() {
        if (!this.campaignState.active) return false;
        const currentId = this.campaignState.currentLevelId;
        const currentLevel = this.campaignState.levelPack?.levels?.find(l => String(l.id) === String(currentId));
        const nextId = currentLevel?.nextId ?? (Number.isFinite(Number(currentId)) ? Number(currentId) + 1 : currentId);
        return this.loadCampaignLevel(nextId);
    }
    
    /**
     * 检查是否为测试模式
     * @returns {boolean}
     */
    isTestMode() {
        return this.difficulty === 'test';
    }
    
    /**
     * 重置游戏状态
     */
    resetGame() {
        this.totalRounds = 8;
        this.difficulty = 'normal';
        this.targetCount = 1;
        this.currentRound = 1;
        this.gameMode = 'local';
        this.players.A.score = 0;
        this.players.B.score = 0;
        this.testModeFunctions = [];
        this.clearGameHistory();
        this.functionHistory = [];
        this.elementLockCounts = new Map();
        this.usedCells = [];
        this.resetRoundState();
        this.setPhase(this.phases.SELECT_TARGET);
        this.emit('gameReset');
    }
    
    /**
     * 添加测试模式函数
     * @param {string} expression - 函数表达式
     * @param {string} color - 函数颜色
     */
    addTestModeFunction(expression, color = null) {
        if (!this.isTestMode()) return;
        
        // 生成随机颜色（如果没有指定）
        if (!color) {
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
            color = colors[this.testModeFunctions.length % colors.length];
        }
        
        this.testModeFunctions.push({
            expression: expression,
            color: color,
            timestamp: Date.now()
        });
        
        this.emit('testModeFunctionAdded', { expression, color });
    }
    
    /**
     * 清空测试模式函数
     */
    clearTestModeFunctions() {
        this.testModeFunctions = [];
        this.emit('testModeFunctionsCleared');
    }
    
    /**
     * 获取测试模式函数列表
     * @returns {Array}
     */
    getTestModeFunctions() {
        return this.testModeFunctions;
    }
    
    /**
     * 根据难度获取目标格数量
     * @param {string} difficulty - 难度级别
     * @returns {number} 目标格数量
     */
    getTargetCountByDifficulty(difficulty) {
        switch (difficulty) {
            case 'test':
                return 0; // 测试模式无目标格
            case 'normal':
                return 2;
            case 'hard':
            case 'expert':
                return 3;
            case 'easy':
            default:
                return 1;
        }
    }
    
    /**
     * 检查是否为简单难度
     * @returns {boolean}
     */
    isEasyMode() {
        return this.difficulty === 'easy';
    }
    
    /**
     * 检查元素是否可被锁定
     * @param {string} element - 元素
     * @returns {boolean}
     */
    canLockElement(element) {
        const count = this.elementLockCounts.get(element) || 0;
        if (this.raceState && this.raceState.active) {
            return count < 2;
        }
        if (count >= 2) {
            return false;
        }
        return true;
    }
    
    /**
     * 增加元素的锁定次数
     * @param {string} element - 元素
     */
    incrementElementLockCount(element) {
        const currentCount = this.elementLockCounts.get(element) || 0;
        this.elementLockCounts.set(element, currentCount + 1);
    }
    
    /**
     * 获取元素的锁定次数
     * @param {string} element - 元素
     * @returns {number}
     */
    getElementLockCount(element) {
        return this.elementLockCounts.get(element) || 0;
    }
    
    /**
     * 更新当前回合的时间限制
     * 新规则：
     * - 1-4回合: 40秒（简单难度+20秒）
     * - 5-8回合: 50秒（简单难度+20秒）
     * - 此后每4回合增加10秒，最高90秒（简单难度+20秒）
     */
    updateTimeLimit() {
        const group = Math.floor((this.currentRound - 1) / 4);
        
        if (this.raceState && this.raceState.active) {
            this.timeLimit = 0;
            this.remainingTime = 0;
            return;
        }
        if (group === 0) {
            // 1-4回合
            this.timeLimit = 40;
        } else if (group === 1) {
            // 5-8回合
            this.timeLimit = 50;
        } else {
            // 9-12回合: 60秒，13-16回合: 70秒，17-20回合: 80秒，21-24回合: 90秒
            // 从第3组开始，每增加1组增加10秒，最高90秒
            this.timeLimit = Math.min(50 + (group - 1) * 10, 90);
        }
        
        const multipliers = {
            super_slow: 2.0,
            slow: 1.5,
            normal: 1.0,
            fast: 0.75,
            super_fast: 0.5
        };
        const multiplier = multipliers[this.timeLimitMode] ?? 1.0;
        this.timeLimitMultiplier = multiplier;
        this.timeLimit = Math.round(this.timeLimit * multiplier);
        this.remainingTime = this.timeLimit;
    }
    
    /**
     * 重置回合状态
     */
    resetRoundState() {
        this.roundState = {
            targetCells: [], // 多个目标格数组
            targetCell: null, // 兼容旧代码
            forbiddenCells: [],
            lockedElements: [],
            functionExpression: '',
            hitTargets: [], // 记录哪些目标格被穿过
            hitTarget: false, // 兼容旧代码
            hitForbidden: false,
            score: 0
        };
    }
    
    /**
     * 设置游戏阶段
     * @param {string} phase - 阶段
     */
    setPhase(phase) {
        this.currentPhase = phase;
        if (this.raceState && this.raceState.active && phase === this.phases.SELECT_TARGET) {
            this.currentRound = this.raceState.currentLevelId;
        }
        // 本地状态发生变化，递增版本号（P2P 同步时用于识别最新状态）
        this._stateVersion++;
        console.log(`[GC] setPhase phase=${phase}, currentPlayer=${this.currentPlayer}, currentRound=${this.currentRound}, version=${this._stateVersion}`);
        this.emit('phaseChange', {
            phase: phase,
            currentPlayer: this.currentPlayer,
            currentRound: this.currentRound
        });
        
        // 根据阶段执行相应逻辑
        switch (phase) {
            case this.phases.SELECT_TARGET:
                // 选择目标阶段不需要计时器
                this.stopTimer();
                this.remainingTime = this.timeLimit;
                this.emit('timerUpdate', { remainingTime: this.remainingTime });
                break;
            case this.phases.SET_FORBIDDEN:
                // 注意：不在这里自动跳过，让AI有机会执行
                // 如果需要跳过，应该在nextPhase中处理
                break;
            case this.phases.SET_LOCKS:
                // 注意：不在这里自动跳过，让AI有机会执行
                // 如果需要跳过，应该在nextPhase中处理
                break;
            case this.phases.INPUT_FUNCTION:
                this.startTimer();
                break;
            case this.phases.EVALUATE:
                this.stopTimer();
                break;
            case this.phases.SWITCH_PLAYER:
                this.switchPlayer();
                break;
            case this.phases.END:
                this.endGame();
                break;
        }

        // P2P：阶段切换即向对手同步最新状态（带确认重发，防关键阶段快照丢失卡死）；
        // 被动方复制推进（finalizeRound/startNextRound）期间抑制，避免旧状态推回操作方
        if (!this._suppressP2PSync) {
            this._maybeSync(true);
        }
        this._suppressP2PSync = false;
    }
    
    /**
     * 切换到输入阶段
     */
    switchToInputPhase() {
        // 切换到构建函数的玩家（与选择目标的玩家相反）
        this.currentPlayer = this.currentPlayer === 'A' ? 'B' : 'A';
        this.setPhase(this.phases.INPUT_FUNCTION);
    }
    
    /**
     * 开始计时
     */
    startTimer() {
        // 测试模式/闯关模式/竞速模式不启动计时器
        if (this.isTestMode() || (this.campaignState && this.campaignState.active) || (this.raceState && this.raceState.active)) return;
        
        this.stopTimer();
        this.remainingTime = this.timeLimit;
        
        this.emit('timerUpdate', { remainingTime: this.remainingTime });
        
        // P2P：只有当前操作玩家（构造方）本地驱动倒计时，对手仅接收同步
        const isP2P = this.gameMode === 'p2p' && this.p2pActionSender;
        if (isP2P && this.currentPlayer !== this.p2pActionSender.myPlayerId) {
            return;
        }
        
        this.timerInterval = setInterval(() => {
            this.remainingTime--;
            this.emit('timerUpdate', { remainingTime: this.remainingTime });
            
            // P2P：每秒向对手同步一次剩余时间
            if (isP2P && this.p2pActionSender.sendTimerSync) {
                this.p2pActionSender.sendTimerSync(this.remainingTime);
            }
            
            if (this.remainingTime <= 0) {
                this.handleTimeout();
            }
        }, 1000);
    }
    
    /**
     * 停止计时
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    /**
     * 处理超时
     */
    handleTimeout() {
        this.stopTimer();
        
        // P2P：通知对手超时，让对方也显示超时提示
        if (this.gameMode === 'p2p' && this.p2pActionSender && this.p2pActionSender.sendTimeout) {
            this.p2pActionSender.sendTimeout(this.currentPlayer);
        }
        
        if (this.currentPhase === this.phases.INPUT_FUNCTION) {
            // 构造函数超时，扣1分
            this.roundState.score = -1;
            this.players[this.currentPlayer].score -= 1;
            this.emit('timeout', { player: this.currentPlayer });

            // 清空当前表达式，确保时间到立即停止输入
            this.roundState.functionExpression = '';
            this.emit('prepareInputPhase', { player: this.currentPlayer });

            // 记录超时回合到游戏报告，避免报告中遗漏
            this.recordRoundHistory({
                round: this.currentRound,
                selector: this.currentPlayer,
                constructor: this.currentPlayer === 'A' ? 'B' : 'A',
                targetCells: this.roundState.targetCells,
                forbiddenCells: this.roundState.forbiddenCells,
                lockedElements: this.roundState.lockedElements,
                expression: this.roundState.functionExpression,
                functionType: { type: 'timeout' },
                hitTarget: false,
                hitForbidden: false,
                score: -1,
                totalScoreA: this.players.A.score,
                totalScoreB: this.players.B.score
            });

            // 立即开始下一轮选择目标格
            this.setPhase(this.phases.SWITCH_PLAYER);
        } else {
            // 其他阶段超时，自动进入下一阶段
            this.nextPhase();
        }
    }
    
    /**
     * 获取当前阶段允许的最大禁止区数量
     * @returns {number}
     */
    getMaxForbiddenCount() {
        if (this.raceState && this.raceState.active) return 2;
        if (this.currentRound <= 8) return 1;
        if (this.currentRound <= 16) return 2;
        return 3;
    }
    
    /**
     * 获取当前阶段允许的最大锁定数量
     * @returns {number}
     */
    getMaxLockCount() {
        if (this.raceState && this.raceState.active) return 2;
        if (this.currentRound <= 4) return 0;
        if (this.currentRound <= 12) return 1;
        return 2;
    }
    
    /**
     * 选择目标网格
     * @param {Object} cell - {x, y}
     * @returns {boolean}
     */
    selectTargetCell(cell) {
        if (this.currentPhase !== this.phases.SELECT_TARGET) return false;
        
        // 检查是否已选择此格子
        const existsIndex = this.roundState.targetCells.findIndex(
            c => c.x === cell.x && c.y === cell.y
        );
        
        if (existsIndex !== -1) {
            // 取消选择
            this.roundState.targetCells.splice(existsIndex, 1);
            this.emit('targetRemoved', { cell, count: this.roundState.targetCells.length });
            
            // 更新兼容字段
            this.roundState.targetCell = this.roundState.targetCells[0] || null;
            // P2P：每次点选/取消都递增版本号，确保对手立即应用本次变更（而非被同版本快照过滤掉）
            this.bumpStateVersion();
            this._maybeSync();
            return true;
        }
        
        // 检查是否已达到最大目标数
        if (this.roundState.targetCells.length >= this.targetCount) {
            // 替换最后一个选择的目标
            const removedCell = this.roundState.targetCells.pop();
            this.emit('targetRemoved', { cell: removedCell, count: this.roundState.targetCells.length });
        }
        
        // 添加新目标
        this.roundState.targetCells.push(cell);
        this.roundState.targetCell = this.roundState.targetCells[0]; // 兼容旧代码
        this.emit('targetSelected', { cell, count: this.roundState.targetCells.length, total: this.targetCount });
        // P2P：每次点选/取消都递增版本号，确保对手立即应用本次变更
        this.bumpStateVersion();
        this._maybeSync();
        return true;
    }
    
    /**
     * 确认目标选择，进入下一阶段
     */
    confirmTargetSelection() {
        if (this.currentPhase !== this.phases.SELECT_TARGET) {
            // P2P：currentPhase 可能被对端快照覆盖成非 SELECT_TARGET（如对方提前推进），
            // 此时用户点确认按钮没反应会困惑。主动请求全量同步自愈（2s 节流），并提示。
            if (this.gameMode === 'p2p' && this.p2pActionSender && typeof this.p2pActionSender.sendSyncRequest === 'function') {
                const now = Date.now();
                if (!this._lastFullSyncRequestAt || now - this._lastFullSyncRequestAt >= 2000) {
                    this._lastFullSyncRequestAt = now;
                    this.p2pActionSender.sendSyncRequest();
                    this.emit('phaseMismatchHint', { expected: this.phases.SELECT_TARGET, actual: this.currentPhase });
                }
            }
            return false;
        }
        
        // 检查是否已选择足够的目标格
        if (this.roundState.targetCells.length < this.targetCount) {
            return false;
        }
        
        // 注意：不立即添加到 usedCells，等回合结束后再添加
        // 这样当前回合的目标格会保持绿色，不会变灰
        
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 添加或切换禁止区
     * @param {Object} cell - {x, y}
     * @returns {boolean}
     */
    addForbiddenCell(cell) {
        if (this.currentPhase !== this.phases.SET_FORBIDDEN) return false;
        
        // 不能选择目标网格作为禁止区
        const isTarget = this.roundState.targetCells.some(c => c.x === cell.x && c.y === cell.y);
        if (isTarget) {
            return false;
        }
        
        // 检查是否已存在
        const existsIndex = this.roundState.forbiddenCells.findIndex(
            c => c.x === cell.x && c.y === cell.y
        );
        if (existsIndex !== -1) {
            // 点击已存在的禁止区，取消选择
            const removedCell = this.roundState.forbiddenCells.splice(existsIndex, 1)[0];
            this.emit('forbiddenRemoved', { cell: removedCell, count: this.roundState.forbiddenCells.length });
            // P2P：每次点选/取消都递增版本号，确保对手立即应用本次变更
            this.bumpStateVersion();
            this._maybeSync();
            return true;
        }
        
        const maxCount = this.getMaxForbiddenCount();
        
        // 如果已达到最大数量，替换最后一个选择的禁止区（改选模式）
        if (this.roundState.forbiddenCells.length >= maxCount) {
            // 移除最后一个禁止区
            const removedCell = this.roundState.forbiddenCells.pop();
            this.emit('forbiddenRemoved', { cell: removedCell, count: this.roundState.forbiddenCells.length });
        }
        
        // 添加新的禁止区
        this.roundState.forbiddenCells.push(cell);
        this.emit('forbiddenAdded', { cell, count: this.roundState.forbiddenCells.length });
        // P2P：每次点选/取消都递增版本号，确保对手立即应用本次变更
        this.bumpStateVersion();
        this._maybeSync();
        
        return true;
    }
    
    /**
     * 确认禁止区设置
     */
    confirmForbiddenSelection() {
        if (this.currentPhase !== this.phases.SET_FORBIDDEN) {
            // P2P：phase 不匹配（被快照覆盖）→ 主动请求同步 + 提示（与 confirmTargetSelection 一致）
            if (this.gameMode === 'p2p' && this.p2pActionSender && typeof this.p2pActionSender.sendSyncRequest === 'function') {
                const now = Date.now();
                if (!this._lastFullSyncRequestAt || now - this._lastFullSyncRequestAt >= 2000) {
                    this._lastFullSyncRequestAt = now;
                    this.p2pActionSender.sendSyncRequest();
                    this.emit('phaseMismatchHint', { expected: this.phases.SET_FORBIDDEN, actual: this.currentPhase });
                }
            }
            return false;
        }
        
        // 注意：不立即添加到 usedCells，等回合结束后再添加
        // 这样当前回合的禁区会保持红色，不会变灰
        
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 添加锁定元素
     * @param {string} element - 元素
     * @returns {boolean}
     */
    addLockedElement(element) {
        if (this.currentPhase !== this.phases.SET_LOCKS) return false;
        
        const maxCount = this.getMaxLockCount();
        if (this.roundState.lockedElements.length >= maxCount) return false;
        
        // x 不能被锁定
        if (element === 'x') return false;
        
        // 括号不能被锁定
        if (element === '(' || element === ')') return false;
        
        // 检查元素是否可被锁定（简单难度保护）
        if (!this.canLockElement(element)) return false;
        
        // 检查是否已存在
        if (this.roundState.lockedElements.includes(element)) return false;
        
        this.roundState.lockedElements.push(element);
        this.emit('elementLocked', { element, count: this.roundState.lockedElements.length });
        // P2P：每次锁定都递增版本号，确保对手立即应用本次变更
        this.bumpStateVersion();
        this._maybeSync();
        
        // 不再自动进入下一阶段，需要点击确认按钮
        return true;
    }
    
    /**
     * 确认锁定设置
     */
    confirmLockSelection() {
        if (this.currentPhase !== this.phases.SET_LOCKS) {
            // P2P：phase 不匹配（被快照覆盖）→ 主动请求同步 + 提示
            if (this.gameMode === 'p2p' && this.p2pActionSender && typeof this.p2pActionSender.sendSyncRequest === 'function') {
                const now = Date.now();
                if (!this._lastFullSyncRequestAt || now - this._lastFullSyncRequestAt >= 2000) {
                    this._lastFullSyncRequestAt = now;
                    this.p2pActionSender.sendSyncRequest();
                    this.emit('phaseMismatchHint', { expected: this.phases.SET_LOCKS, actual: this.currentPhase });
                }
            }
            return false;
        }
        
        // 增加本回合锁定元素的计数
        for (const element of this.roundState.lockedElements) {
            this.incrementElementLockCount(element);
        }
        
        // 使用和跳过按钮一致的逻辑
        this.nextPhase();
        return true;
    }
    
    /**
     * 提交函数表达式
     * @param {string} expression - 函数表达式
     * @returns {boolean}
     */
    submitFunction(expression) {
        if (this.currentPhase !== this.phases.INPUT_FUNCTION) return false;
        
        this.roundState.functionExpression = expression;
        
        // 测试模式：不进入评估阶段，保持在输入阶段
        if (this.isTestMode()) {
            return true;
        }
        
        this.setPhase(this.phases.EVALUATE);
        return true;
    }
    
    /**
     * 评估函数结果
     * @param {Array} hitTargets - 命中的目标格数组
     * @param {boolean} hitForbidden - 是否进入禁止区
     * @param {Object} functionType - 函数类型信息
     */
    evaluateResult(hitTargets, hitForbidden, functionType) {
        if (this.currentPhase !== this.phases.EVALUATE) {
            // P2P：评估发起方在 renderAndEvaluate（异步）期间，可能被对端 finalizeRound
            // 推送的 SELECT_TARGET 快照抢先推进了 currentPhase。此时本地无需重复推进
            // （对端已通过快照同步了 score 与新回合状态），但必须清理 UI 残留
            // （表达式/目标/禁止格），否则新回合会残留上一回合的 y=1 与目标格。
            if (this.gameMode === 'p2p') {
                console.warn('[GC] evaluateResult 时 currentPhase 已被对端推进，仅触发 UI 清理');
                this.emit('roundComplete', {
                    currentRound: this.currentRound,
                    totalRounds: this.totalRounds,
                    scores: {
                        A: this.players.A.score,
                        B: this.players.B.score
                    }
                });
            }
            return;
        }
        
        // 兼容旧代码：如果 hitTargets 是布尔值，转换为数组
        if (typeof hitTargets === 'boolean') {
            this.roundState.hitTarget = hitTargets;
            this.roundState.hitTargets = hitTargets ? this.roundState.targetCells : [];
        } else {
            this.roundState.hitTargets = hitTargets || [];
            // 只有当所有目标格都被穿过时才算命中
            this.roundState.hitTarget = this.roundState.hitTargets.length >= this.targetCount;
        }
        
        this.roundState.hitForbidden = hitForbidden;
        
        let score = 0;
        
        // 如果进入禁止区，直接失败，扣1分
        if (hitForbidden) {
            score = -1;
        } else if (this.roundState.hitTarget) {
            // 命中所有目标，根据函数类型得分（防御 functionType/score 缺失）
            score = functionType?.score ?? 0;
        } else {
            // 未命中所有目标，扣1分
            score = -1;
        }
        
        // 当summa单次加分特别高时（>4）给额外加分（已根据要求禁用）
        // if (this.currentPlayer === 'B' && score > 4) {
        //     score += 4;
        // }
        
        this.roundState.score = score;
        this.players[this.currentPlayer].score += score;
        
        // 记录回合历史
        this.recordRoundHistory({
            round: this.currentRound,
            selector: this.currentPlayer,
            constructor: this.currentPlayer === 'A' ? 'B' : 'A',
            targetCells: this.roundState.targetCells,
            forbiddenCells: this.roundState.forbiddenCells,
            lockedElements: this.roundState.lockedElements,
            expression: this.roundState.functionExpression,
            functionType: functionType,
            hitTarget: this.roundState.hitTarget,
            hitForbidden: hitForbidden,
            score: score,
            totalScoreA: this.players.A.score,
            totalScoreB: this.players.B.score
        });
        
        this.emit('evaluationComplete', {
            hitTarget: this.roundState.hitTarget,
            hitTargets: this.roundState.hitTargets,
            hitForbidden,
            functionType,
            score,
            totalScore: this.players[this.currentPlayer].score,
            targetCount: this.targetCount,
            hitCount: this.roundState.hitTargets.length,
            expression: this.roundState.functionExpression,
            round: this.currentRound
        });

        // 闯关模式：不进入换人/下一回合逻辑，由 UI 决定是重试还是进入下一关
        if (this.campaignState && this.campaignState.active) {
            const pass = !!this.roundState.hitTarget && !hitForbidden;
            const clearedMax = this.getCampaignProgress();
            if (pass && this.currentRound > clearedMax) {
                this.setCampaignProgress(this.currentRound);
            }
            this.emit('campaignLevelResult', {
                levelId: this.currentRound,
                pass,
                score,
                expression: this.roundState.functionExpression,
                clearedMax: this.getCampaignProgress(),
                totalLevels: this.campaignState.totalLevels
            });
            this.setPhase(this.phases.INIT);
            return;
        }

        if (this.raceState && this.raceState.active) {
            const pass = !!this.roundState.hitTarget && !hitForbidden;
            if (pass) {
                this.raceState.solvedCount = (this.raceState.solvedCount || 0) + 1;
                const completed = this.raceState.solvedCount;
                const total = Number(this.raceState.puzzlesPerLevel || 10);
                const elapsed = this.getRaceElapsedSeconds();

                if (completed >= total) {
                    const best = this.getRaceBestTime(this.currentRound);
                    const isNewBest = !Number.isFinite(best) || elapsed < best;
                    if (isNewBest) this.setRaceBestTime(this.currentRound, elapsed);
                    const stars = this.getRaceStarsByElapsed(elapsed);
                    this.pauseTimer();
                    this.emit('raceLevelResult', {
                        levelId: this.currentRound,
                        pass,
                        score,
                        elapsed,
                        bestTime: this.getRaceBestTime(this.currentRound),
                        previousBestTime: isNewBest ? best : this.getRaceBestTime(this.currentRound),
                        isNewBest,
                        stars,
                        solvedCount: completed,
                        totalSolved: total,
                        expression: this.roundState.functionExpression,
                        roundState: { ...this.roundState }
                    });
                    this.setPhase(this.phases.INIT);
                    return;
                }

                this.emit('racePuzzleCleared', {
                    levelId: this.currentRound,
                    solvedCount: completed,
                    totalSolved: total,
                    elapsed,
                    isNewBest: false,
                    stars: this.getRaceStarsByElapsed(elapsed),
                    bestTime: this.getRaceBestTime(this.currentRound),
                    previousBestTime: this.getRaceBestTime(this.currentRound)
                });
                this.loadRacePuzzleForCurrentLevel();
                return;
            }
            // 竞速失败重试：统一通过 prepareInputPhase 清理
            this.prepareInputPhase();
            return;
        }

        // P2P：发送 function_result 给对手，双方各自推进回合；状态同步通过 state_sync 保持一致。
        // 额外携带累计总分 scoreA/scoreB：对端若因阶段快照丢失导致 currentPhase 已非 EVALUATE，
        // 可据此直接覆盖本地分数（构造方是分数权威），避免"function_result 被静默丢弃 → 分数不同步"。
        if (this.gameMode === 'p2p') {
            this._sendP2PAction('function_result', {
                hitTargets: this.roundState.hitTargets,
                hitForbidden: this.roundState.hitForbidden,
                score: score,
                currentRound: this.currentRound,
                scoreA: this.players.A.score,
                scoreB: this.players.B.score
            });
        }

        this.setPhase(this.phases.SWITCH_PLAYER);
    }
    
    /**
     * 统一准备输入阶段（消除两套清理机制分叉）
     * 模型清理（重设 roundState 表达式/命中字段）+ UI清理（事件通知）+ 切到 INPUT_FUNCTION
     */
    prepareInputPhase(clearExpr = true) {
        this.roundState.functionExpression = '';
        this.roundState.hitTargets = [];
        this.roundState.hitTarget = false;
        this.roundState.hitForbidden = false;
        // clearExpr=false 时 UI 侧保留已输入的表达式（供「提交失败后保留解析式」开关使用）
        this.emit('prepareInputPhase', { player: this.currentPlayer, clearExpression: clearExpr !== false });
        this.setPhase(this.phases.INPUT_FUNCTION);
    }
    
    /**
     * 切换玩家
     */
    switchPlayer() {
        // 回合结束，将当前回合的目标格和禁区添加到历史记录
        // 这样它们会在下一回合变成灰色
        for (const cell of this.roundState.targetCells) {
            const exists = this.usedCells.some(c => c.x === cell.x && c.y === cell.y);
            if (!exists) {
                this.usedCells.push({
                    x: cell.x,
                    y: cell.y,
                    type: 'target',
                    round: this.currentRound
                });
            }
        }
        for (const cell of this.roundState.forbiddenCells) {
            const exists = this.usedCells.some(c => c.x === cell.x && c.y === cell.y);
            if (!exists) {
                this.usedCells.push({
                    x: cell.x,
                    y: cell.y,
                    type: 'forbidden',
                    round: this.currentRound
                });
            }
        }
        
        // 增加回合数
        this.currentRound++;
        
        // 检查游戏是否结束
        if (this.currentRound > this.totalRounds) {
            this.setPhase(this.phases.END);
            return;
        }
        
        // 设置下一回合选择目标的玩家
        // 1-4回合：B-A-B-A 循环（无禁止区/锁定）
        // 5回合及以上：奇数回合B，偶数回合A
        if (this.currentRound <= 4) {
            // 第2回合A，第3回合B，第4回合A
            this.currentPlayer = (this.currentRound % 2 === 0) ? 'A' : 'B';
        } else {
            // 5回合及以上：奇数回合B选择，偶数回合A选择
            this.currentPlayer = (this.currentRound % 2 === 1) ? 'B' : 'A';
        }
        this.updateTimeLimit();
        this.resetRoundState();
        
        this.emit('roundComplete', {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            }
        });
        
        this.setPhase(this.phases.SELECT_TARGET);
    }
    
    /**
     * 进入下一阶段
     */
    nextPhase() {
        const phaseOrder = [
            this.phases.SELECT_TARGET,
            this.phases.SET_FORBIDDEN,
            this.phases.SET_LOCKS,
            this.phases.INPUT_FUNCTION,
            this.phases.EVALUATE,
            this.phases.SWITCH_PLAYER
        ];

        const currentIndex = phaseOrder.indexOf(this.currentPhase);
        // 防御：currentPhase 不在合法列表（-1）或已是末位 → 不推进。
        // P2P 中 currentPhase 可能被远端快照覆盖成非合法值（如 INIT/END/异常值），
        // 若不防护，indexOf=-1 会让 nextPhase = phaseOrder[0] = SELECT_TARGET → 错误回退，
        // 甚至触发 switchPlayer 导致回合错乱（截图症状的潜在根因之一）。
        if (currentIndex < 0 || currentIndex >= phaseOrder.length - 1) {
            console.warn(`[GC] nextPhase 跳过：currentPhase=${this.currentPhase} 不在合法列表或已是末位`);
            return;
        }
        let nextPhase = phaseOrder[currentIndex + 1];

        // 如果从SET_LOCKS进入INPUT_FUNCTION，需要切换玩家
        if (this.currentPhase === this.phases.SET_LOCKS && nextPhase === this.phases.INPUT_FUNCTION) {
            this.switchToInputPhase();
            return;
        }

        // 自动跳过不需要设置的阶段（在AI确认后）
        if (nextPhase === this.phases.SET_FORBIDDEN && this.getMaxForbiddenCount() === 0) {
            nextPhase = this.phases.SET_LOCKS;
        }

        if (nextPhase === this.phases.SET_LOCKS && this.getMaxLockCount() === 0) {
            this.switchToInputPhase();
            return;
        }

        this.setPhase(nextPhase);
    }
    
    /**
     * 记录回合历史
     * @param {Object} roundData - 回合数据
     */
    recordRoundHistory(roundData) {
        this.gameHistory.push({
            round: roundData.round,
            selector: roundData.selector,
            constructor: roundData.constructor,
            targetCells: [...roundData.targetCells],
            forbiddenCells: [...roundData.forbiddenCells],
            lockedElements: [...roundData.lockedElements],
            expression: roundData.expression,
            functionType: roundData.functionType,
            hitTarget: roundData.hitTarget,
            hitForbidden: roundData.hitForbidden,
            score: roundData.score,
            totalScoreA: roundData.totalScoreA,
            totalScoreB: roundData.totalScoreB
        });
    }
    
    /**
     * 获取游戏报告
     * @returns {Object} 游戏报告数据
     */
    getGameReport() {
        return {
            difficulty: this.difficulty,
            totalRounds: this.totalRounds,
            winner: this.players.A.score > this.players.B.score ? 'A' :
                   this.players.B.score > this.players.A.score ? 'B' : 'draw',
            finalScores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            history: this.gameHistory
        };
    }
    
    /**
     * 清空游戏历史
     */
    clearGameHistory() {
        this.gameHistory = [];
    }
    
    /**
     * 结束游戏
     */
    endGame() {
        this.stopTimer();
        
        const winner = this.players.A.score > this.players.B.score ? 'A' :
                      this.players.B.score > this.players.A.score ? 'B' : 'draw';
        
        // P2P：同步最终比分后再弹出结算界面
        this._maybeSync();

        this.emit('gameEnd', {
            winner,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            report: this.getGameReport()
        });
    }
    
    /**
     * 获取当前游戏状态
     * @returns {Object}
     */
    getGameState() {
        return {
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            currentPlayer: this.currentPlayer,
            currentPhase: this.currentPhase,
            remainingTime: this.remainingTime,
            timeLimit: this.timeLimit,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            isTestMode: this.isTestMode(),
            gameMode: this.gameMode,
            testModeFunctions: this.testModeFunctions,
            scores: {
                A: this.players.A.score,
                B: this.players.B.score
            },
            roundState: { ...this.roundState },
            maxForbidden: this.getMaxForbiddenCount(),
            maxLocks: this.getMaxLockCount(),
            usedCells: this.usedCells,
            elementLockCounts: this.elementLockCounts,
            getElementLockCount: (element) => this.getElementLockCount(element),
            functionHistory: this.functionHistory
        };
    }
    
    /**
     * 跳过当前阶段（用于快速测试）
     */
    skipPhase() {
        this.nextPhase();
    }
    
    // ─── P2P 联机同步 ──────────────────────────────────────────────────────
    
    /**
     * 设置P2P控制器
     * @param {Object} p2p - P2PController 实例
     */
    setP2PController(p2p) {
        this.p2pActionSender = p2p;
        this.gameMode = 'p2p';
    }

    /**
     * 本地状态发生变更时，若处于 P2P 模式则请求向对手同步一份完整快照。
     * 快照的构建与发送由 UIController 注入的 _syncHook 完成（需读取表达式等 UI 状态）。
     */
    _maybeSync(confirm = false) {
        if (this.gameMode !== 'p2p') return;
        if (this._applyingRemote) return;
        if (typeof this._syncHook === 'function') {
            try { this._syncHook(confirm); } catch (e) { /* 静默失败，避免同步钩子异常影响主流程 */ }
        }
    }

    /**
     * 导出当前可序列化的完整游戏状态（用于全量实时同步）
     */
    getStateSnapshot() {
        // 将 Map 转换为普通对象以便序列化
        const lockCountsObj = {};
        if (this.elementLockCounts) {
            for (const [k, v] of this.elementLockCounts) {
                lockCountsObj[k] = v;
            }
        }
        return {
            currentPhase: this.currentPhase,
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            currentPlayer: this.currentPlayer,
            version: this._stateVersion,
            players: {
                A: { score: this.players.A.score },
                B: { score: this.players.B.score }
            },
            gameMode: this.gameMode,
            difficulty: this.difficulty,
            targetCount: this.targetCount,
            timeLimit: this.timeLimit,
            remainingTime: this.remainingTime,
            // 直接引用传递（不做深拷贝）：发送端 conn.send 时会 JSON 序列化一次，
            // 接收端 loadStateSnapshot 才深拷贝，避免生产端重复序列化白耗 CPU。
            // buildSyncSnapshot 调用后立即同步 send，期间不会修改这些引用，安全。
            roundState: this.roundState,
            usedCells: this.usedCells || [],
            // P2P 联机：历史函数只传解析式（剥离采样点，接收端本地重新采样绘制）。
            // 每个函数原本带数千~上万个 {x,y} 采样点，若全量传输会让每条 state_sync
            // 快照序列化体积暴涨 → 第二回合起同步明显变慢。只传表达式后体积近乎为零，
            // 接收端 applySyncSnapshot 对缺 points 的历史函数用本地 renderer 补采样。
            functionHistory: this._p2pFunctionHistorySnapshot(),
            elementLockCounts: lockCountsObj
        };
    }

    /**
     * 返回供 P2P 快照传输的近期历史函数。
     * 仅保留 round >= currentRound - 2 的部分（GridSystem.drawHistoryFunctions 只绘制
     * roundDiff 1~2 的历史函数，更早的既不被绘制也不需同步）。
     */
    _recentFunctionHistory() {
        const all = this.functionHistory || [];
        if (all.length === 0) return all;
        const cutoff = this.currentRound - 2;
        if (cutoff <= 0) return all;
        return all.filter(f => f.round >= cutoff);
    }

    /**
     * 返回供 P2P 快照传输的历史函数（剥离采样点，只保留解析式与必要元数据）。
     * P2P 下每条 state_sync 都带完整历史函数（数千~上万采样点）会令消息体积暴涨
     * （第二回合起同步变慢）；只传 expression 后接收端用本地 renderer 重新采样绘制，
     * 体积近乎为零且不影响历史淡化显示。
     */
    _p2pFunctionHistorySnapshot() {
        const recent = this._recentFunctionHistory();
        if (this.gameMode !== 'p2p' || !Array.isArray(recent)) return recent;
        return recent.map(f => ({
            expression: f.expression,
            round: f.round,
            color: f.color
        }));
    }

    /**
     * 返回轻量的状态指纹（供 P2P sync_verify 周期验证，判断双方是否同步）
     */
    getSyncFingerprint() {
        return {
            version: this._stateVersion,
            round: this.currentRound,
            player: this.currentPlayer,
            phase: this.currentPhase
        };
    }

    /**
     * 手动递增状态版本号（用于 UI 层状态变化，如表达式输入）
     */
    bumpStateVersion() {
        this._stateVersion++;
    }
    /**
     * 判断远端快照的 round/phase 是否领先本地（用于被动方放宽接受旧版本快照，
     * 避免被动方本地版本号虚高导致真实新快照被误拒 → 永远追不上）
     */
    _isRemoteAhead(remotePhase, remoteRound) {
        if (remoteRound > this.currentRound) return true;
        if (remoteRound < this.currentRound) return false;
        return this._phaseIndex(remotePhase) > this._phaseIndex(this.currentPhase);
    }

    _phaseIndex(phase) {
        // phases 对象键为常量名（如 SELECT_TARGET），值为阶段字符串（如 'select_target'），
        // 需按值匹配并返回其在定义顺序中的索引
        const names = Object.keys(this.phases || {});
        for (let i = 0; i < names.length; i++) {
            if (this.phases[names[i]] === phase) return i;
        }
        return -1;
    }

    loadStateSnapshot(s) {
        if (!s) return false;
        const remoteVersion = s.version ?? -1;
        // P2P 版本同步原则：
        // - 操作方（快照所声明的 currentPlayer === myPlayerId）本地状态权威：仅接受对端 round/phase
        //   前进（remoteAhead，对端已推进到下一阶段/回合）或 version 更高的快照，其余按旧快照/回声拒绝。
        // - 被动方：操作方版本权威，无条件接受（DataChannel 保序，操作方只发其最新状态）。
        //   被动方本地 finalizeRound/startNextRound 复制推进会令本地 _stateVersion 虚高
        //   （setPhase 递增），若仍按 version 比较会拒绝操作方后续真实快照（选目标/禁止/锁定），
        //   导致"被动方新回合收不到操作方状态"。故被动方无条件接受并在应用后强制对齐 version。
        // 关键修正（方案A）：isOperator 用「远端快照声明的 currentPlayer」判定，而非本地 currentPlayer。
        // 旧逻辑用本地 currentPlayer，若被动方因时序残留旧操作方值（如回合1 selector=B 残留），会误判
        // 为自己是操作方 → 走版本过滤拒绝操作方的真实快照（如第二回合 A 选的目标格）→ B 端卡死且
        // health monitor 因"我方操作"停止 → 永久卡死。改用远端快照判定后，被动方无论本地 currentPlayer
        // 残留什么都会无条件接受操作方快照；同时 version 对齐也据此正确（被动方严格对齐、消除虚高）。
        const _myId = this.p2pActionSender ? this.p2pActionSender.myPlayerId : null;
        const isOperator = !!(_myId && s.currentPlayer === _myId);
        if (remoteVersion !== -1 && isOperator) {
            const remoteAhead = this._isRemoteAhead(s.currentPhase, s.currentRound);
            if (!remoteAhead && remoteVersion <= this._stateVersion) {
                console.log(`[GC][Sync] 忽略旧快照 localVersion=${this._stateVersion}, remoteVersion=${remoteVersion}`);
                return false;
            }
        }
        this._applyingRemote = true;
        try {
            console.log(`[GC][Sync] 应用远端快照 phase=${s.currentPhase}, round=${s.currentRound}, player=${s.currentPlayer}, version=${remoteVersion}`);
            const oldPhase = this.currentPhase;
            this.currentPhase = s.currentPhase;
            this.currentRound = s.currentRound;
            this.totalRounds = s.totalRounds;
            this.currentPlayer = s.currentPlayer;
            if (s.players) {
                this.players.A.score = s.players.A?.score ?? this.players.A.score;
                this.players.B.score = s.players.B?.score ?? this.players.B.score;
            }
            this.gameMode = 'p2p';
            this.difficulty = s.difficulty || this.difficulty;
            this.targetCount = (s.targetCount != null) ? s.targetCount : this.targetCount;
            this.timeLimit = (s.timeLimit != null) ? s.timeLimit : this.timeLimit;
            this.remainingTime = (s.remainingTime != null) ? s.remainingTime : this.remainingTime;
            this.roundState = JSON.parse(JSON.stringify(s.roundState));
            this.usedCells = JSON.parse(JSON.stringify(s.usedCells || []));
            // 同步历史函数和锁元素计数（即使 elementLockCounts 尚未初始化也保证为 Map）
            this.functionHistory = JSON.parse(JSON.stringify(s.functionHistory || []));
            this.elementLockCounts = new Map(Object.entries(s.elementLockCounts || {}));

            if (this.gameMode === 'p2p' && this.p2pActionSender &&
                oldPhase !== this.phases.INPUT_FUNCTION && this.currentPhase === this.phases.INPUT_FUNCTION &&
                this.currentPlayer === this.p2pActionSender.myPlayerId) {
                this.startTimer();
            }
            // 应用远端快照后同步版本号：
            // 操作方保留 max（防被对端旧快照回退）；被动方严格对齐操作方（消除本地
            // finalizeRound 复制推进导致的 version 虚高，避免后续操作方真快照被误拒）
            this._stateVersion = isOperator
                ? Math.max(this._stateVersion, remoteVersion)
                : remoteVersion;
        } finally {
            this._applyingRemote = false;
        }
        return true;
    }
    
    /**
     * 处理从P2P收到的远程游戏动作
     * @param {string} action - 动作类型
     * @param {Object} payload - 负载数据
     * @returns {boolean} 是否成功处理
     */
    onP2PGameAction(action, payload) {
        console.log(`[GC][P2P] 收到动作 action=${action}, payload=`, payload, `currentPhase=${this.currentPhase}, currentRound=${this.currentRound}, currentPlayer=${this.currentPlayer}`);
        switch (action) {
            // 注意：game_init 是独立 P2P 消息类型（P2PController._handleMessage 'game_init'），
            // 不会通过 action 通道进入此处，故移除该死分支（P8）。
            case 'select_target_confirmed':
                // 远程玩家确认了目标选择
                if (this.currentPhase !== this.phases.SELECT_TARGET) return true;
                if (payload.targetCells) {
                    this.roundState.targetCells = payload.targetCells;
                }
                this.nextPhase();
                return true;
                
            case 'forbidden_confirmed':
                // 远程玩家确认了禁止区
                if (this.currentPhase !== this.phases.SET_FORBIDDEN) return true;
                if (payload.forbiddenCells !== undefined) {
                    this.roundState.forbiddenCells = payload.forbiddenCells;
                }
                this.nextPhase();
                return true;
                
            case 'locks_confirmed':
                // 远程玩家确认了锁定元素
                if (this.currentPhase !== this.phases.SET_LOCKS) return false;
                if (payload.lockedElements) {
                    this.roundState.lockedElements = payload.lockedElements;
                }
                this.nextPhase();
                return true;
                
            case 'function_result':
                // 构造函数者提交结果
                {
                    const remoteRound = payload?.currentRound ?? this.currentRound;
                    // 已处理过（状态快照可能先到），忽略
                    if (remoteRound < this.currentRound) return true;
                    // 本地落后：以操作方（当前玩家方）为基准，请求对手发送完整快照
                    if (remoteRound > this.currentRound) {
                        if (this.p2pActionSender && typeof this.p2pActionSender.sendSyncRequest === 'function') {
                            this.p2pActionSender.sendSyncRequest();
                        }
                        return true;
                    }
                    // 最小修复：不再因 currentPhase 非 EVALUATE 而静默丢弃（那会丢失分数与回合推进）。
                    // 构造方（对端）是分数权威，先以累计总分覆盖本地，保证分数不丢。
                    const sA = payload && typeof payload.scoreA === 'number' ? payload.scoreA : null;
                    const sB = payload && typeof payload.scoreB === 'number' ? payload.scoreB : null;
                    if (this.currentPhase === this.phases.EVALUATE) {
                        // 本端处于评估阶段：正常完成本回合（记录历史 + 推进 + UI 事件）
                        if (payload && payload.hitTargets !== undefined) {
                            // 远程传来的评估结果（P6：统一按长度 >= targetCount 判定命中）
                            this.roundState.hitTargets = payload.hitTargets || [];
                            this.roundState.hitTarget = this.roundState.hitTargets.length >= this.targetCount;
                            this.roundState.hitForbidden = payload.hitForbidden || false;
                        }
                        // 用对端累计总分覆盖本地（finalizeRound 内部通过 remoteTotal 避免重复加分）
                        this.finalizeRound(payload.score !== undefined ? payload.score : 0,
                            (sA != null && sB != null) ? { A: sA, B: sB } : null);
                    } else {
                        // 本端 finalizeRound 因 phase 检查被跳过（EVALUATE 确认快照可能丢失，
                        // currentPhase 仍停在旧阶段）→ 只覆盖分数会导致本端 currentPlayer/回合
                        // 不推进，双方互视对方为被动方 → health monitor 双端常驻 → 双向死锁。
                        // 因此这里必须补齐被跳过的回合推进，否则只能等 request_sync 自愈（慢且不稳）。
                        console.warn(`[GC][P2P] function_result 到达但 currentPhase=${this.currentPhase} 非 EVALUATE，补齐回合推进`);
                        // 1) 分数对齐（构造方是对端，权威）
                        if (sA != null) this.players.A.score = sA;
                        if (sB != null) this.players.B.score = sB;
                        this.roundState.score = (payload && typeof payload.score === 'number') ? payload.score : 0;
                        // 2) 本端尚未推进回合（currentRound 仍等于对端评估回合）→ 补齐 finalizeRound 被跳过的推进。
                        //    用 _suppressP2PSync 抑制推送（被动方复制推进不推回操作方，避免旧状态覆盖）。
                        if (this.currentRound === payload.currentRound) {
                            console.warn(`[GC][P2P] 本端仍在本回合（round=${this.currentRound}），执行 switchPlayer 补齐推进`);
                            this._suppressP2PSync = true;
                            try { this.switchPlayer(); }
                            finally { this._suppressP2PSync = false; }
                        }
                        // 3) 请求全量快照兜底，确保与操作方完全一致（尤其 currentPlayer/阶段）。
                        //    2s 节流防止高频触发（与 _maybeRequestFullSync 一致）。
                        if (this.p2pActionSender && typeof this.p2pActionSender.sendSyncRequest === 'function') {
                            const now = Date.now();
                            if (!this._lastFullSyncRequestAt || now - this._lastFullSyncRequestAt >= 2000) {
                                this._lastFullSyncRequestAt = now;
                                this.p2pActionSender.sendSyncRequest();
                            }
                        }
                    }
                }
                return true;
                
            case 'evaluation_result':
                // 评估完成的分数同步
                if (payload) {
                    this.players.A.score = payload.scoreA ?? this.players.A.score;
                    this.players.B.score = payload.scoreB ?? this.players.B.score;
                    this.currentRound = payload.currentRound ?? this.currentRound;
                }
                return true;
                
            case 'next_round':
                // 进入下一回合
                this.startNextRound();
                return true;
                
            case 'end_game':
                if (payload) {
                    this.players.A.score = payload.scoreA ?? this.players.A.score;
                    this.players.B.score = payload.scoreB ?? this.players.B.score;
                }
                this.endGame();
                return true;
                
            default:
                return false;
        }
    }
    
    /**
     * P2P：由对方传来的评估结果完成本回合（finalizeRound 缺失会导致崩溃）
     * @param {number} score - 本回合得分（由构造函数者计算后同步）
     * @param {{A?:number,B?:number}|null} remoteTotal - 可选：对端（构造方）算好的累计总分。
     *        传入时直接覆盖本地 A/B 总分，避免本端重复加分；不传则按旧逻辑给 currentPlayer 加分。
     */
    finalizeRound(score = 0, remoteTotal = null) {
        if (this.currentPhase !== this.phases.EVALUATE) return;

        this.roundState.score = score;
        if (remoteTotal) {
            if (typeof remoteTotal.A === 'number') this.players.A.score = remoteTotal.A;
            if (typeof remoteTotal.B === 'number') this.players.B.score = remoteTotal.B;
        } else {
            this.players[this.currentPlayer].score += score;
        }

        // 远程未携带函数类型信息，构造占位（得分已由对方计算好）
        const functionType = { type: 'remote', score };

        this.recordRoundHistory({
            round: this.currentRound,
            selector: this.currentPlayer,
            constructor: this.currentPlayer === 'A' ? 'B' : 'A',
            targetCells: this.roundState.targetCells,
            forbiddenCells: this.roundState.forbiddenCells,
            lockedElements: this.roundState.lockedElements,
            expression: this.roundState.functionExpression,
            functionType,
            hitTarget: this.roundState.hitTarget,
            hitForbidden: this.roundState.hitForbidden,
            score,
            totalScoreA: this.players.A.score,
            totalScoreB: this.players.B.score
        });

        this.emit('evaluationComplete', {
            hitTarget: this.roundState.hitTarget,
            hitTargets: this.roundState.hitTargets,
            hitForbidden: this.roundState.hitForbidden,
            functionType,
            score,
            totalScore: this.players[this.currentPlayer].score,
            targetCount: this.targetCount,
            hitCount: this.roundState.hitTargets.length,
            expression: this.roundState.functionExpression,
            round: this.currentRound
        });

        // 仅"被动方复制推进"（currentPlayer !== myPlayerId）才抑制推送，避免把本地推进
        // 状态推回操作方造成覆盖；操作方（构造者）自己推进必须推送告知对方，否则
        // 双方都抑制 → 没有确认推送 → 周期兜底又被互相等待卡住 → 第2回合起死锁
        this._suppressP2PSync = !(this.p2pActionSender && this.currentPlayer === this.p2pActionSender.myPlayerId);
        this.setPhase(this.phases.SWITCH_PLAYER);
        this._suppressP2PSync = false;
    }

    /**
     * P2P：进入下一回合（由 next_round 动作触发）
     * 仅在评估阶段时推进，避免与 finalizeRound 重复推进导致跳回合
     */
    startNextRound() {
        if (this.currentPhase === this.phases.EVALUATE) {
            this._suppressP2PSync = !(this.p2pActionSender && this.currentPlayer === this.p2pActionSender.myPlayerId);
            this.setPhase(this.phases.SWITCH_PLAYER);
            this._suppressP2PSync = false;
        }
    }

    /**
     * 发送P2P动作到远端
     */
    _sendP2PAction(action, payload) {
        if (this.p2pActionSender && typeof this.p2pActionSender.sendGameAction === 'function') {
            this.p2pActionSender.sendGameAction(action, payload);
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameController;
}
