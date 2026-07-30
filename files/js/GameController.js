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
        const allElements = ['+','-','*','/','^','!','sin','cos','tan','abs','sqrt','ln','log','exp','factorial','0','1','2','3','4','5','6','7','8','9','π','e','i'];
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

        // P2P：阶段切换即向对手同步最新状态
        this._maybeSync();
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
        this._maybeSync();
        return true;
    }
    
    /**
     * 确认目标选择，进入下一阶段
     */
    confirmTargetSelection() {
        if (this.currentPhase !== this.phases.SELECT_TARGET) return false;
        
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
        this._maybeSync();
        
        return true;
    }
    
    /**
     * 确认禁止区设置
     */
    confirmForbiddenSelection() {
        if (this.currentPhase !== this.phases.SET_FORBIDDEN) {
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
        this._maybeSync();
        
        // 不再自动进入下一阶段，需要点击确认按钮
        return true;
    }
    
    /**
     * 确认锁定设置
     */
    confirmLockSelection() {
        if (this.currentPhase !== this.phases.SET_LOCKS) {
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
        if (this.currentPhase !== this.phases.EVALUATE) return;
        
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

        // P2P：发送 function_result 给对手，双方各自推进回合；状态同步通过 state_sync 保持一致
        if (this.gameMode === 'p2p') {
            this._sendP2PAction('function_result', {
                hitTargets: this.roundState.hitTargets,
                hitForbidden: this.roundState.hitForbidden,
                score: score,
                currentRound: this.currentRound
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
        if (currentIndex < phaseOrder.length - 1) {
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
    _maybeSync() {
        if (this.gameMode !== 'p2p') return;
        if (this._applyingRemote) return;
        if (typeof this._syncHook === 'function') {
            try { this._syncHook(); } catch (e) { /* 静默失败，避免同步钩子异常影响主流程 */ }
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
            roundState: JSON.parse(JSON.stringify(this.roundState)),
            usedCells: JSON.parse(JSON.stringify(this.usedCells || [])),
            functionHistory: JSON.parse(JSON.stringify(this.functionHistory || [])),
            elementLockCounts: lockCountsObj
        };
    }

    /**
     * 手动递增状态版本号（用于 UI 层状态变化，如表达式输入）
     */
    bumpStateVersion() {
        this._stateVersion++;
    }
    loadStateSnapshot(s) {
        if (!s) return false;
        const remoteVersion = s.version ?? -1;
        // P2P：远端版本低于或等于本地已知版本时，忽略旧快照，防止覆盖最新状态
        if (remoteVersion !== -1 && remoteVersion <= this._stateVersion) {
            console.log(`[GC][Sync] 忽略旧快照 localVersion=${this._stateVersion}, remoteVersion=${remoteVersion}`);
            return false;
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
            // 应用远端快照后，同步本地版本号，防止后续旧快照回退
            this._stateVersion = Math.max(this._stateVersion, remoteVersion);
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
                    // 本地落后，请求一次完整状态重同步
                    if (remoteRound > this.currentRound) {
                        this._maybeSync();
                        return true;
                    }
                    if (this.currentPhase !== this.phases.EVALUATE) return true;
                    if (payload && payload.hitTargets !== undefined) {
                        // 远程传来的评估结果（P6：统一按长度 >= targetCount 判定命中）
                        this.roundState.hitTargets = payload.hitTargets || [];
                        this.roundState.hitTarget = this.roundState.hitTargets.length >= this.targetCount;
                        this.roundState.hitForbidden = payload.hitForbidden || false;
                        this.finalizeRound(payload.score !== undefined ? payload.score : 0);
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
     */
    finalizeRound(score = 0) {
        if (this.currentPhase !== this.phases.EVALUATE) return;

        this.roundState.score = score;
        this.players[this.currentPlayer].score += score;

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

        this.setPhase(this.phases.SWITCH_PLAYER);
    }

    /**
     * P2P：进入下一回合（由 next_round 动作触发）
     * 仅在评估阶段时推进，避免与 finalizeRound 重复推进导致跳回合
     */
    startNextRound() {
        if (this.currentPhase === this.phases.EVALUATE) {
            this.setPhase(this.phases.SWITCH_PLAYER);
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
