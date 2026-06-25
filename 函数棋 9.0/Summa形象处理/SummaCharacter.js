class SummaCharacter {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // 情绪 → 立绘图片映射
        this.imageMap = {
            neutral: 'Summa形象处理/summa_image/neutral.PNG',
            thinking: 'Summa形象处理/summa_image/thinking.PNG',
            smug: 'Summa形象处理/summa_image/smug.PNG',
            happy: 'Summa形象处理/summa_image/happy.PNG',
            surprised: 'Summa形象处理/summa_image/surprised.PNG',
            sad: 'Summa形象处理/summa_image/sad.PNG',
            angry: 'Summa形象处理/summa_image/angry.PNG',
            determined: 'Summa形象处理/summa_image/determined.PNG',
            exhausted: 'Summa形象处理/summa_image/exhausted.PNG'
        };

        // 温和、鼓励、带点数学趣味的对话库
        this.dialogues = {
            startGame: [
                "坐标轴已展开。一起享受这场函数对战吧！",
                "拓扑检测完毕。放轻松，好好享受对局吧！",
                "这可是高维空间的切片，注意你的参数范围哦～",
                "准备好了吗？期待你的精彩表现！",
                "算力唤醒中。来一局愉快的数学对决吧！",
                "今天的心情正好是个凸函数，开始吧！"
            ],
            aiThink: [
                "唔……让我想想用什么函数好呢？",
                "正尝试从常微分方程中寻找灵感……",
                "计算洛必达法则的极限，稍微等我一下。",
                "这局的拓扑结构有点意思，得好好思考。",
                "多项式展开中……再给我一点时间。",
                "思考中。别急，脑海里的曲线正在成型。",
                "锁定特征向量，寻找最优的拟合路径。"
            ],
            aiPlay: [
                "得出极值。就是这个表达式了。",
                "希望这根曲线能顺利穿过目标点～",
                "代入常数。看看这次效果如何。",
                "计算完毕，这是我精心挑选的解。",
                "希望这条曲线能命中目标~",
                "试试这个表达式，感觉还不错！"
            ],
            playerAction: [
                "到你了。慢慢思考，不用着急哦。",
                "请输出你的防线，期待你的精彩解法！",
                "小心禁区，不过我相信你能处理好的。",
                "观察你的拟合走向……加油，你行的！",
                "不用着急，认真构建你的函数吧。",
                "请给出你的闭式解，我相信你能做到！"
            ],
            aiSuccess: [
                "精准命中！这次的曲线选得不错～",
                "漂亮，成功命中目标！",
                "看来我的拟合方向是对的，开心！",
                "误差在可控范围内，顺利命中！",
                "成功命中！继续加油哦！",
                "命中目标！看来状态还可以～"
            ],
            aiSuccess_Multiple: [
                "一箭双雕！多重覆盖成功命中！",
                "漂亮，一条曲线覆盖了多个目标！",
                "曲率调整得恰到好处，精准穿透～",
                "这根曲线划过的角度，还挺完美的！",
                "一次收割完毕，这种感觉真好！"
            ],
            aiSuccess_Complex: [
                "这套非线性的组合表达式，居然成功了！",
                "跳出了基础函数的局限，效果还不错嘛～",
                "这种复合表达式能命中，我自己也有点惊喜！",
                "把算子相互嵌套，居然真的有效！",
                "尝试了复杂表达式，结果令人满意～"
            ],
            aiSuccess_Discontinuous: [
                "虽然表达式有点不连续，但还是命中啦！",
                "函数在间断点附近跳了跳，不过效果还可以～",
                "尽管有点跳跃，但结果还是好的！",
                "不连续也没关系，命中目标就是胜利～",
                "有一点间断，但照样能命中，还不错吧！"
            ],
            aiError: [
                "……计算产生了溢出，刚才那个不算。",
                "什么？截断误差居然把我的曲线带偏了？",
                "参数没选好，我的拟合失效了……",
                "哎呀，遇到了非法的自变量区间……",
                "失手了。下次我会调整得更好的。",
                "这可能是浮点数精度的问题，再来一次！"
            ],
            playerSuccess: [
                "哇，你的曲线精准命中了！真厉害！",
                "竟然真的突破了我的防守？太棒了！",
                "这组解析式选得很漂亮，令人佩服！",
                "精彩的表现！你的思路非常清晰！",
                "漂亮的一击！看来我也得加油了～",
                "这个解法很巧妙！值得我学习呢！"
            ],
            playerError: [
                "稍微偏离了目标域，不过没关系，再试一次！",
                "啊，差一点就命中了，下次加油！",
                "没关系的，函数构建本来就需要多尝试。",
                "这次没命中，但你已经很努力了！",
                "再来一次吧，我相信你能找到正确的解法！",
                "不要灰心，调整一下思路，你一定能成功！",
                "失败是成功之母，多试几次就会越来越好的！"
            ],
            win: [
                "比赛结束！这真是一场精彩的对局。",
                "积分收割完毕。你的表现也很不错！",
                "承让了！期待下次与你更精彩的对决！",
                "今天的发挥还不错，不过你也有潜力哦～",
                "险胜而已，下次你一定能做得更好！"
            ],
            lose: [
                "……居然被你用巧妙的解法打败了，佩服！",
                "这局你赢了！你的函数构建能力很强！",
                "你的表现真的很出色，我输得心服口服！",
                "输了？这说明你的策略比我更优！",
                "好吧，我承认你在这种残局下的代数直觉很准。"
            ]
        };

        this.animator = null;    // SummaAnimator 实例，render() 后赋值
        this.bubbleTimeout = null;

        this.render();
    }

    /**
     * 构建多层 DOM 结构并初始化 SummaAnimator
     * 结构：
     *   #summa-root（fixed锚点/可拖动）
     *     └─ #summa-body（弹性物理层）
     *          ├─ #summa-face-wrap（立绘 + 眼部叠加）
     *          │    ├─ <img> 立绘底图
     *          │    ├─ .summa-eye.summa-eye-left
     *          │    │    ├─ .summa-pupil
     *          │    │    └─ .summa-eyelid
     *          │    └─ .summa-eye.summa-eye-right
     *          │         ├─ .summa-pupil
     *          │         └─ .summa-eyelid
     *          └─ #summa-message（气泡框）
     *
     * 眼睛位置以 250×250 立绘为基准（百分比可在 CSS 里微调）
     */
    render() {
        this.container.innerHTML = `
            <div id="summa-root" class="summa-root" style="display:none;">
                <div id="summa-message" class="summa-message"></div>
                <div id="summa-body" class="summa-body">
                    <div id="summa-hitbox" class="summa-hitbox"></div>
                    <div id="summa-face-wrap" class="summa-face-wrap">
                        <img id="summa-avatar" class="summa-avatar"
                             src="${this.imageMap.neutral}" alt="Summa">

                        <!-- 左眼覆盖层 -->
                        <div class="summa-eye summa-eye-left" id="summa-eye-left">
                            <!-- <div class="summa-pupil" id="summa-pupil-left"></div> -->
                            <div class="summa-eyelid" id="summa-eyelid-left"></div>
                        </div>

                        <!-- 右眼覆盖层 -->
                        <div class="summa-eye summa-eye-right" id="summa-eye-right">
                            <!-- <div class="summa-pupil" id="summa-pupil-right"></div> -->
                            <div class="summa-eyelid" id="summa-eyelid-right"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 物理参数调试面板 (默认隐藏，按 Shift 切换) -->
            <div id="summa-debug-panel" style="position:fixed; top:20px; left:20px; background:rgba(0,0,0,0.85); color:#00ffcc; font-family:monospace; padding:15px; border-radius:10px; z-index:10000; display:none; flex-direction:column; gap:8px; border:1px solid #00ffcc; box-shadow:0 4px 15px rgba(0,255,204,0.4); font-size:12px;">
                <h3 style="margin:0 0 10px 0; font-size:16px; border-bottom:1px solid #00ffcc; padding-bottom:5px;"> Summa Physics Debug </h3>
                <label style="display:flex; justify-content:space-between; align-items:center;">链长弹性(CHAIN_K)<input type="number" id="dbg-chainK" step="0.01" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">回拉弹性(ANCHOR_K)<input type="number" id="dbg-anchorK" step="0.01" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">拖拽重力(GRAV_DRAG)<input type="number" id="dbg-gravD" step="0.1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">微弱重力(GRAV_FREE)<input type="number" id="dbg-gravF" step="0.01" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">拖拽位移阻尼(D_D_TRA)<input type="number" id="dbg-dampDTrans" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">拖拽旋转阻尼(D_D_ROT)<input type="number" id="dbg-dampDRot" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">拖拽变形阻尼(D_D_DEF)<input type="number" id="dbg-dampDDef" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">自由位移阻尼(D_F_TRA)<input type="number" id="dbg-dampFTrans" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">自由旋转阻尼(D_F_ROT)<input type="number" id="dbg-dampFRot" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">自由变形阻尼(D_F_DEF)<input type="number" id="dbg-dampFDef" step="0.01" max="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">拉伸上限(MAX_STRTCH)<input type="number" id="dbg-maxStretch" step="0.1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">压缩下限(MIN_STRTCH)<input type="number" id="dbg-minStretch" step="0.1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">形变弯倍率(SKEW_MUL)<input type="number" id="dbg-skew" step="0.1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;">最大速度(MAX_VEL)<input type="number" id="dbg-maxVel" step="1" style="width:70px; background:#111; color:#00ffcc; border:1px solid #00ffcc; padding:2px;"></label>
                
                <button id="dbg-btn-reset" style="margin-top:10px; background:#00ffcc; color:#000; border:none; padding:8px; cursor:pointer; font-weight:bold; border-radius:5px;">重置默认值</button>
            </div>
        `;

        this.wrapper = document.getElementById('summa-root');
        this.messageBox = document.getElementById('summa-message');
        this.avatarImg = document.getElementById('summa-avatar');

        // 初始化动画引擎
        if (typeof SummaAnimator !== 'undefined') {
            this.animator = new SummaAnimator({
                root: document.getElementById('summa-root'),
                body: document.getElementById('summa-body'),
                eyeLeft: document.getElementById('summa-eye-left'),
                eyeRight: document.getElementById('summa-eye-right'),
                pupilLeft: document.getElementById('summa-pupil-left'),
                pupilRight: document.getElementById('summa-pupil-right'),
                eyelidLeft: document.getElementById('summa-eyelid-left'),
                eyelidRight: document.getElementById('summa-eyelid-right'),
            });

            // 拖拽表情联动：拖动时始终为 smug，松手后进入表情序列
            this._exprTimers = [];  // 待执行的表情定时器列表

            this.animator.onDragStart = () => {
                // 清除上次松手可能正在运行的表情序列定时器
                this._exprTimers.forEach(id => clearTimeout(id));
                this._exprTimers = [];
                this.setExpressionAnimated('smug', true);  // force=true 确保重新播放动画
            };

            this.animator.onDragEnd = () => {
                // 松手：determined / exhausted 各 50%
                const first = Math.random() < 0.5 ? 'determined' : 'exhausted';
                this.setExpressionAnimated(first);
                // 2s 后：angry / happy 各 50%
                const t1 = setTimeout(() => {
                    const second = Math.random() < 0.5 ? 'angry' : 'happy';
                    this.setExpressionAnimated(second);
                    // 再 2s 后：neutral
                    const t2 = setTimeout(() => {
                        this.setExpressionAnimated('neutral');
                    }, 2000);
                    this._exprTimers.push(t2);
                }, 2000);
                this._exprTimers.push(t1);
            };

            // 绑定面板调试
            this._bindDebugPanel();
        }
    }

    _bindDebugPanel() {
        const anim = this.animator;
        if (!anim) return;

        const inputs = {
            'dbg-chainK': 'CHAIN_K',
            'dbg-anchorK': 'ANCHOR_K',
            'dbg-gravD': 'GRAVITY_DRAG',
            'dbg-gravF': 'GRAVITY_FREE',
            'dbg-dampDTrans': 'VEL_DAMP_DRAG_TRANS',
            'dbg-dampDRot': 'VEL_DAMP_DRAG_ROT',
            'dbg-dampDDef': 'VEL_DAMP_DRAG_DEF',
            'dbg-dampFTrans': 'VEL_DAMP_FREE_TRANS',
            'dbg-dampFRot': 'VEL_DAMP_FREE_ROT',
            'dbg-dampFDef': 'VEL_DAMP_FREE_DEF',
            'dbg-maxStretch': 'MAX_STRETCH',
            'dbg-minStretch': 'MIN_STRETCH',
            'dbg-skew': 'SKEW_MULT',
            'dbg-maxVel': 'MAX_VELOCITY'
        };

        const updateInputs = () => {
            for (let id in inputs) {
                const el = document.getElementById(id);
                if (el) el.value = anim[inputs[id]];
            }
        };

        updateInputs();

        for (let id in inputs) {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    anim[inputs[id]] = parseFloat(e.target.value);
                });
            }
        }

        const btnReset = document.getElementById('dbg-btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                anim.CHAIN_K = 0.05;
                anim.ANCHOR_K = 0.025;
                anim.GRAVITY_DRAG = 4.0;
                anim.GRAVITY_FREE = 0.10;
                anim.VEL_DAMP_DRAG_TRANS = 0.90;
                anim.VEL_DAMP_DRAG_ROT = 0.95;
                anim.VEL_DAMP_DRAG_DEF = 0.85;
                anim.VEL_DAMP_FREE_TRANS = 0.70;
                anim.VEL_DAMP_FREE_ROT = 0.98;
                anim.VEL_DAMP_FREE_DEF = 0.85;
                anim.MAX_STRETCH = 1.2;
                anim.MIN_STRETCH = 0.8;
                anim.SKEW_MULT = 0.2;
                anim.MAX_VELOCITY = 120;
                updateInputs();
            });
        }

        // ── Q 键切换 debug 面板显示/隐藏 ────────────────────────────────────
        this._debugPanelVisible = false;
        this._handleDebugToggleKey = (e) => {
            if (e.key === 'q' || e.key === 'Q') {
                e.preventDefault();
                this._debugPanelVisible = !this._debugPanelVisible;
                const panel = document.getElementById('summa-debug-panel');
                if (panel) {
                    panel.style.display = this._debugPanelVisible ? 'flex' : 'none';
                }
            }
        };
        document.addEventListener('keydown', this._handleDebugToggleKey);
    }

    show(mode) {
        if (!this.wrapper) return;
        this.wrapper.style.display = (mode === 'ai') ? 'flex' : 'none';
    }

    setExpressionAnimated(mood, force = false) {
        if (!this.avatarImg) return;
        const img = this.avatarImg;
        const newSrc = this.imageMap[mood] || this.imageMap.neutral;

        // 如果已经是该表情则跳过（force=true 时强制刷新）
        if (!force && img.dataset.currentMood === mood) return;
        // 拖拽中不允许普通表情切换覆盖 smug
        if (!force && this.animator && this.animator.isDragging) return;

        img.dataset.currentMood = mood;

        // 直接替换，移除所有淡入淡出动画
        img.style.transition = 'none';
        img.style.opacity = '1';
        img.style.transform = 'scale(1.0)';
        img.src = newSrc;

        // 同时更新眨眼频率
        if (this.animator) {
            const excitedMoods = ['surprised', 'happy', 'smug', 'angry'];
            this.animator.setBlinkMood(excitedMoods.includes(mood) ? 'excited' : 'normal');
            this.animator.triggerBlink();
        }
    }

    setExpression(mood) {
        if (!this.avatarImg) return;
        // 拖拽中不覆盖表情（smug 状态由拖拽逻辑控制）
        if (this.animator && this.animator.isDragging) return;
        this.avatarImg.src = this.imageMap[mood] || this.imageMap.neutral;

        // 根据情绪调整眨眼频率
        if (this.animator) {
            const excitedMoods = ['surprised', 'happy', 'smug', 'angry'];
            this.animator.setBlinkMood(excitedMoods.includes(mood) ? 'excited' : 'normal');
            // 情绪切换时触发一次眨眼，增强生动感
            this.animator.triggerBlink();
        }
    }

    /**
     * 设置眼珠追踪模式
     * @param {'mouse'|'expression'|'canvas'|'idle'} mode
     */
    setLookMode(mode) {
        if (this.animator) this.animator.setLookMode(mode);
    }

    /**
     * 判断表达式是否存在不连续点（间断、除零、尖点炸裂等）
     */
    _hasDiscontinuity(expression) {
        if (!expression) return false;

        // 快速特征筛查：包含 tan 一定有间断
        if (expression.includes('tan')) return true;

        // 包含除法时，在定义域内采样检查是否存在 NaN/Infinity
        if (expression.includes('/')) {
            return this._sampleHasNaN(expression);
        }

        // 包含 sqrt 时负数测试
        if (expression.includes('sqrt') || expression.includes('log') || expression.includes('ln')) {
            return this._sampleHasNaN(expression);
        }

        return false;
    }

    /**
     * 在 [-10, 10] 区间以 0.5 为步长采样，检查是否存在非法值
     */
    _sampleHasNaN(expression) {
        try {
            const fn = new Function('x', `try { return (${expression}); } catch(e) { return NaN; }`);
            for (let x = -10; x <= 10; x += 0.5) {
                const val = fn(x);
                if (!isFinite(val) || isNaN(val)) return true;
            }
        } catch (e) {
            return true;
        }
        return false;
    }

    speak(situation, mood = 'neutral') {
        const lines = this.dialogues[situation];
        if (!lines || lines.length === 0) return;

        const line = lines[Math.floor(Math.random() * lines.length)];

        this.setExpression(mood);
        this.messageBox.textContent = '';
        this.messageBox.classList.add('visible');

        if (window.audioManager && typeof window.audioManager.playSummaTalkSequence === 'function') {
            // 传入回调，逐字同步显示文本
            window.audioManager.playSummaTalkSequence(line, mood, (ch) => {
                this.messageBox.textContent += ch;
            });
        } else {
            // 降级：直接显示全部文本
            this.messageBox.textContent = line;
        }

        if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
        this.bubbleTimeout = setTimeout(() => {
            this.messageBox.classList.remove('visible');
        }, 5000);
    }

    // ── 游戏事件快捷接口 ─────────────────────────────────
    reactStart() { this.speak('startGame', 'determined'); }
    reactAiThink() { this.speak('aiThink', 'thinking'); }

    reactAiPlay({ expression } = {}) {
        this.speak('aiPlay', 'determined');
    }

    reactPlayerAction(phase) {
        if (phase === 'select_target' || phase === 'set_forbidden' || phase === 'set_locks') {
            return;
        }
        this.speak('playerAction', 'neutral');
    }

    reactAiSuccess({ hitTarget, hitForbidden, targetCount, expression } = {}) {
        if (targetCount > 1) {
            this.speak('aiSuccess_Multiple', 'happy');
        } else if (expression && (
            expression.includes('abs') || expression.includes('cos') ||
            expression.includes('sin') || expression.includes('exp')
        )) {
            // 检查表达式是否有间断点
            if (this._hasDiscontinuity(expression)) {
                this.speak('aiSuccess_Discontinuous', 'exhausted');
            } else {
                this.speak('aiSuccess_Complex', 'happy');
            }
        } else {
            this.speak('aiSuccess', 'happy');
        }
    }

    reactAiError() { this.speak('aiError', 'surprised'); }
    reactPlayerSuccess() { this.speak('playerSuccess', 'surprised'); }
    reactPlayerError() { this.speak('playerError', 'neutral'); }
    reactWin() { this.speak('win', 'happy'); }
    reactLose() { this.speak('lose', 'sad'); }

    /**
     * 显示自定义消息（非预设对话）
     * @param {string} message - 要显示的消息
     * @param {string} mood - 情绪（影响立绘）
     */
    say(message, mood = 'neutral') {
        if (!this.messageBox) return;

        this.setExpression(mood);
        this.messageBox.textContent = message;
        this.messageBox.classList.add('visible');

        if (window.audioManager && typeof window.audioManager.playSummaTalkSequence === 'function') {
            window.audioManager.playSummaTalkSequence(message, mood);
        }

        if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
        this.bubbleTimeout = setTimeout(() => {
            this.messageBox.classList.remove('visible');
        }, 5000);
    }
}

window.SummaCharacter = SummaCharacter;
