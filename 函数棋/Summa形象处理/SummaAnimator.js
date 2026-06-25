/**
 * SummaAnimator.js
 * 驱动 Summa 形象的所有动画：眨眼、眼珠追踪、链式物理拖拽（重力+双端）、待机弹跳
 *
 * 物理模型：
 *   ptA = 头部质点（根中心上方 CHAIN_HALF px）
 *   ptB = 脚部质点（根中心下方 CHAIN_HALF px）
 *   两点通过弹簧约束连接，自由端受重力影响
 *   抓头 → ptA 固定在鼠标，ptB 自由下垂晃动
 *   抓脚 → ptB 固定在鼠标，ptA 因重力挂到下方
 *   松手 → 两点带速度飞出，受重力弯曲，锚点弹簧拉回原位
 */
class SummaAnimator {
    /**
     * @param {{
     *   root: HTMLElement,        // #summa-root
     *   body: HTMLElement,        // #summa-body
     *   eyeLeft: HTMLElement,     // .summa-eye-left
     *   eyeRight: HTMLElement,    // .summa-eye-right
     *   pupilLeft: HTMLElement,   // #summa-pupil-left
     *   pupilRight: HTMLElement,  // #summa-pupil-right
     *   eyelidLeft: HTMLElement,  // #summa-eyelid-left
     *   eyelidRight: HTMLElement  // #summa-eyelid-right
     * }} elements
     */
    constructor(elements) {
        this.root         = elements.root;
        this.body         = elements.body;
        this.eyeLeft      = elements.eyeLeft;
        this.eyeRight     = elements.eyeRight;
        this.pupilLeft    = elements.pupilLeft;
        this.pupilRight   = elements.pupilRight;
        this.eyelidLeft   = elements.eyelidLeft;
        this.eyelidRight  = elements.eyelidRight;

        // ── 眨眼状态机 ──────────────────────────────────────────────────
        this.blinkPhase    = 'open';    // 'open' | 'closing' | 'closed' | 'opening'
        this.blinkProgress = 0;         // 0=全开, 1=全闭（眼皮 scaleY）
        this.blinkTimer    = this._nextBlinkInterval();
        this.blinkMood     = 'normal';  // 'normal' | 'excited' | 'tired'
        this.BLINK_CLOSE_MS = 100;
        this.BLINK_HOLD_MS  = 50;
        this.BLINK_OPEN_MS  = 130;

        // ── 眼珠追踪 ────────────────────────────────────────────────────
        this.lookMode   = 'mouse';      // 'mouse' | 'expression' | 'canvas' | 'idle'
        this.mouseX     = window.innerWidth  / 2;
        this.mouseY     = window.innerHeight / 2;
        this.pupilL     = { x: 0, y: 0 };
        this.pupilR     = { x: 0, y: 0 };
        this.PUPIL_LERP   = 0.09;
        this.PUPIL_RADIUS = 7;
        this.idleEyeTimer  = 0;
        this.idleEyeTarget = { x: 0, y: 0 };

        // ── 链式物理参数 ─────────────────────────────────────────────────
        this.CHAIN_HALF  = 90;    // 脚到角色中心的距离（px）
        this.HEAD_OFFSET = -5;    // 头部质点向上偏移量（px），即 -CHAIN_HALF - 5
        this.CHAIN_REST  = 185;   // 头尾自然间距（CHAIN_HALF + (CHAIN_HALF - HEAD_OFFSET)）
        this.CHAIN_K     = 0.05;  // 链条弹簧刚度（下调极大降低刚性，使其可以大幅拉伸缩短韧性）
        this.ANCHOR_K    = 0.025; // 锚点弹簧刚度（下调导致松手后缓慢悠荡而不生硬拉回）
        this.GRAVITY_DRAG  = 1.5;  // 拖拽时重力加速度（px/帧²）
        this.GRAVITY_FREE  = 0.10; // 非拖拽时的微弱重力（产生轻微自然下垂）
        this.VEL_DAMP_DRAG = 0.89; // 拖拽时速度衰减
        this.VEL_DAMP_FREE = 0.95; // 非拖拽时速度衰减（减小阻尼，让扔出后像布娃娃一样自由晃更久）
        
        // ── 弹性形变约束参数 ────────────────────────────────────────────────────────
        this.MAX_STRETCH   = 2.00; // 被拉极长时的放大比例上限
        this.MIN_STRETCH   = 0.50; // 被挤压极短时的缩小比例下限
        this.SKEW_MULT     = 2.0;  // 晃动两端速度差造成的弯曲形变放大率
        this.MAX_VELOCITY  = 80;   // 质点内部最大运行速度（防止崩坏）

        // ── 链式物理状态（根中心相对坐标）────────────────────────────────
        this.ptA = { x: 0, y: -this.CHAIN_HALF + this.HEAD_OFFSET, vx: 0, vy: 0 }; // 头
        this.ptB = { x: 0, y: +this.CHAIN_HALF, vx: 0, vy: 0 }; // 脚

        // ── 拖拽状态 ─────────────────────────────────────────────────────
        this.isDragging      = false;
        this.dragOffsetX     = 0;       // 鼠标到 root 左边的距离
        this.dragOffsetY     = 0;       // 鼠标到 root 顶边的距离
        this.grabT            = 0.5;   // 抓取点在链条上的参数（0=头顶, 1=脚底）
        this.grabOffsetRelX  = 0;       // 抓取点相对根中心的 X 偏移
        this.grabOffsetRelY  = 0;       // 抓取点相对根中心的 Y 偏移
        this.rootCX          = 0;       // 根元素中心世界坐标 X（拖拽时更新）
        this.rootCY          = 0;       // 根元素中心世界坐标 Y
        this.rootVelX        = 0;       // 抛出后根元素飞行横向速度
        this.rootVelY        = 0;       // 抛出后根元素飞行纵向速度
        this.rootFlying      = false;   // 松手后根元素是否在飞行/下落中

        // 拖拽开始 / 结束回调（由外部赋値，如 SummaCharacter 表情动画）
        this.onDragStart = null;
        this.onDragEnd   = null;

        // ── 鼠标速度追踪 ────────────────────────────────────────────────
        this.mouseVelX = 0;
        this.mouseVelY = 0;

        // ── 待机弹跳 ─────────────────────────────────────────────────────
        this.stillCounter  = 0;
        this.idleActive    = false;
        this.idleTimer     = this._nextIdleInterval();

        // 待机走动状态
        this.walkActive   = false;
        this.walkVelX     = 0;
        this.walkHopTimer = 0;
        this.walkDuration = 0;
        this._facingDir   = 1;  // 1=朝右, -1=朝左

        // ── 音效节流时间戳 ─────────────────────────────────────────────────────
        this._dragSoundNext  = 0;  // 拖拽音效可播放时间戳
        this._flingSoundNext = 0;  // 甩动音效可播放时间戳

        // ── 物理初始化标志 ──────────────────────────────────────────────
        this._physicsReady = false;

        this.lastTime = performance.now();
        this._bindEvents();
        this._loop(this.lastTime);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  物理初始化（根元素首次可见时调用）
    // ═══════════════════════════════════════════════════════════════════════
    initPhysicsPositions() {
        const rect = this.root.getBoundingClientRect();
        const rW = rect.width, rH = rect.height;

        // 直接定位到右下角（距边缓10px）
        this.rootCX = window.innerWidth  - rW / 2 - 20;
        this.rootCY = window.innerHeight - rH / 2 - 10;

        this.ptA = { x: 0, y: -this.CHAIN_HALF + this.HEAD_OFFSET, vx: 0, vy: 0 };
        this.ptB = { x: 0, y: +this.CHAIN_HALF, vx: 0, vy: 0 };
        this._physicsReady = true;

        // 将 CSS 定位切换为 JS 像素定位，避免 transform 叠加
        this.root.style.left      = (this.rootCX - rW / 2) + 'px';
        this.root.style.top       = (this.rootCY - rH / 2) + 'px';
        this.root.style.right     = 'auto';
        this.root.style.bottom    = 'auto';
        this.root.style.transform = 'none';
        // rootFlying 保持 false：Summa 直接居于右下角，无需下落动画
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  事件绑定
    // ═══════════════════════════════════════════════════════════════════════
    _bindEvents() {
        // 全局鼠标位置 + 速度追踪
        document.addEventListener('mousemove', (e) => {
            this.mouseVelX = e.clientX - this.mouseX;
            this.mouseVelY = e.clientY - this.mouseY;
            this.mouseX    = e.clientX;
            this.mouseY    = e.clientY;
        });

        // ── 鼠标按下：检测抓取区域 ──────────────────────────────────────
        this.root.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            this._startDrag(e.clientX, e.clientY);
            e.preventDefault();
        });

        // ── 鼠标移动：更新 root 位置，同时修正自由质点的世界坐标 ───────────
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this._moveDrag(e.clientX, e.clientY);
        });

        // ── 鼠标松开：注入速度，产生甩出效果 ─────────────────────────────
        document.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this._endDrag();
        });

        // ── 触摸支持 ─────────────────────────────────────────────────────
        this.root.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            this.mouseVelX = 0;
            this.mouseVelY = 0;
            this.mouseX    = t.clientX;
            this.mouseY    = t.clientY;
            this._startDrag(t.clientX, t.clientY);
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;
            const t = e.touches[0];
            this.mouseVelX = t.clientX - this.mouseX;
            this.mouseVelY = t.clientY - this.mouseY;
            this.mouseX    = t.clientX;
            this.mouseY    = t.clientY;
            this._moveDrag(t.clientX, t.clientY);
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (!this.isDragging) return;
            this._endDrag();
        });
    }

    // ── 开始拖拽 ─────────────────────────────────────────────────────────
    _startDrag(clientX, clientY) {
        this.isDragging   = true;
        this.idleActive   = false;
        this.stillCounter = 0;
        this.mouseVelX    = 0;
        this.mouseVelY    = 0;
        this.root.classList.add('dragging');

        // 抓取音效
        if (window.audioManager) window.audioManager.playSummaGrab();
        this._dragSoundNext  = 0;
        this._flingSoundNext = 0;
        this.rootVelX  = 0;     // 抓取时清除飞行残留速度
        this.rootVelY  = 0;
        this.rootFlying  = false;
        this.walkActive  = false;  // 抓取时停止走动

        const rect = this.root.getBoundingClientRect();

        // 关键修复：将 root 从 CSS 定位（含 translateY(-50%) 等 transform）
        // 切换为精确的绝对像素定位，否则 style.top 设置后 transform 仍叠加导致闪现
        this.root.style.left      = rect.left + 'px';
        this.root.style.top       = rect.top  + 'px';
        this.root.style.right     = 'auto';
        this.root.style.bottom    = 'auto';
        this.root.style.transform = 'none';  // 清除 translateY(-50%) 等初始定位 transform

        this.dragOffsetX    = clientX - rect.left;
        this.dragOffsetY    = clientY - rect.top;

        // 计算抓取点在链条上的参数 t：0=头顶, 1=脚底，任意位置均可抓取
        this.grabT = this.dragOffsetY / rect.height;

        // 启动冲量：连续函数覆盖所有抓取位置，无需分段判断
        //   upStr    = max(0, 1-2t)  → t=0(头)时=1, t≥0.5时=0
        //              给尾部向上冲量，避免抓头时尾部静止不动
        //   spreadStr = sin(π·t)    → t=0.5(中)时=1, 两端=0
        //              给两端反向横向冲量，抓中间时展开成 ^ 形
        const _side      = (Math.random() < 0.5 ? 1 : -1);
        const _upStr     = Math.max(0, 1.0 - 2.0 * this.grabT);
        const _spreadStr = Math.sin(Math.PI * this.grabT);
        this.ptB.vy -= _upStr * 5.0;                       // 头部抓取：尾部向上
        this.ptA.vx += _side * _spreadStr * 8.0;           // 中间抓取：横向展开
        this.ptB.vx -= _side * _spreadStr * 8.0;
        this.ptB.vy -= _spreadStr * 9.0;                   // ptB 上抬至抓取点高度
        this.ptA.vy += _spreadStr * 2.0;                   // ptA 略微下坠

        // 抓取点相对根中心的偏移
        this.grabOffsetRelX = this.dragOffsetX - rect.width  / 2;
        this.grabOffsetRelY = this.dragOffsetY - rect.height / 2;

        // 记录当前根中心世界坐标
        this.rootCX = rect.left + rect.width  / 2;
        this.rootCY = rect.top  + rect.height / 2;

        // 触发外部回调（如表情切换动画）
        if (this.onDragStart) this.onDragStart();
    }

    // ── 拖拽移动 ─────────────────────────────────────────────────────────
    _moveDrag(clientX, clientY) {
        const rootW = this.root.offsetWidth;
        const rootH = this.root.offsetHeight;
        let newLeft = clientX - this.dragOffsetX;
        let newTop  = clientY - this.dragOffsetY;
        newLeft = Math.max(10, Math.min(window.innerWidth  - rootW - 10, newLeft));
        newTop  = Math.max(10, Math.min(window.innerHeight - rootH - 10, newTop));

        // 根元素新中心
        const newRootCX = newLeft + rootW / 2;
        const newRootCY = newTop  + rootH / 2;

        // 根元素位移量（世界坐标）
        const dRootX = newRootCX - this.rootCX;
        const dRootY = newRootCY - this.rootCY;

        // 两个质点均保持世界坐标不变，约束力在 _updateChain 中处理抓取点的固定
        this.ptA.x -= dRootX;
        this.ptA.y -= dRootY;
        this.ptB.x -= dRootX;
        this.ptB.y -= dRootY;

        this.rootCX = newRootCX;
        this.rootCY = newRootCY;

        this.root.style.left   = newLeft + 'px';
        this.root.style.top    = newTop  + 'px';
        this.root.style.right  = 'auto';
        this.root.style.bottom = 'auto';

    }

    // ── 松开拖拽 ─────────────────────────────────────────────────────────
    _endDrag() {
        this.isDragging = false;
        this.root.classList.remove('dragging');

        // 抛出音效：根据松手时鼠标速度选择音效
        const _throwSpd = Math.sqrt(this.mouseVelX * this.mouseVelX + this.mouseVelY * this.mouseVelY);
        if (window.audioManager) {
            if (_throwSpd > 7) window.audioManager.playSummaFling();
            else               window.audioManager.playSummaThrow();
        }

        // 根元素承担平移速度 —— 角色实际飞向新位置
        this.rootVelX  = this.mouseVelX;
        this.rootVelY  = this.mouseVelY;
        this.rootFlying = true;  // 无论是否有甩出速度，松手后都启用重力下落
        
        // 微小差速扰动：头尾反向横向冲量 → 飞行中身体摇摘
        // 非对称锚点弹簧保证头部摄幅大于尾部
        const _swayMag = _throwSpd * 0.18 + 1.2;
        const _swayDir = Math.random() < 0.5 ? 1 : -1;
        this.ptA.vx += _swayDir * _swayMag;
        this.ptB.vx -= _swayDir * _swayMag;

        // 触发外部回调（如表情切换动画）
        if (this.onDragEnd) this.onDragEnd();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  主循环
    // ═══════════════════════════════════════════════════════════════════════
    _loop(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        // 懒初始化：根元素首次可见时初始化物理位置
        if (!this._physicsReady && this.root.offsetWidth > 0) {
            this.initPhysicsPositions();
        }

        this._updateChain(dt);
        this._updateIdle(dt);
        // this._updateBlink(dt);   // 暂时注释眨眼
        // this._updatePupil(dt);   // 暂时注释眼珠追踪
        this._applyTransforms();

        requestAnimationFrame((t) => this._loop(t));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  眨眼系统
    // ═══════════════════════════════════════════════════════════════════════
    _updateBlink(dt) {
        this.blinkTimer -= dt * 1000;
        if (this.blinkTimer <= 0 && this.blinkPhase === 'open') {
            this.blinkPhase    = 'closing';
            this.blinkProgress = 0;
        }

        if (this.blinkPhase === 'closing') {
            this.blinkProgress += dt * 1000 / this.BLINK_CLOSE_MS;
            if (this.blinkProgress >= 1) {
                this.blinkProgress = 1;
                this.blinkPhase    = 'closed';
                this.blinkTimer    = this.BLINK_HOLD_MS;
            }
        } else if (this.blinkPhase === 'closed') {
            this.blinkTimer -= dt * 1000;
            if (this.blinkTimer <= 0) {
                this.blinkPhase    = 'opening';
                this.blinkProgress = 1;
            }
        } else if (this.blinkPhase === 'opening') {
            this.blinkProgress -= dt * 1000 / this.BLINK_OPEN_MS;
            if (this.blinkProgress <= 0) {
                this.blinkProgress = 0;
                this.blinkPhase    = 'open';
                this.blinkTimer    = this._nextBlinkInterval();
            }
        }
    }

    _nextBlinkInterval() {
        if (this.blinkMood === 'excited') return 500  + Math.random() * 1500;
        if (this.blinkMood === 'tired')   return 1000 + Math.random() * 2000;
        return 2000 + Math.random() * 4000;
    }

    triggerBlink() {
        if (this.blinkPhase === 'open') {
            this.blinkTimer = 0;
        }
    }

    setBlinkMood(mood) {
        this.blinkMood = mood;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  眼珠追踪系统
    // ═══════════════════════════════════════════════════════════════════════
    _updatePupil(dt) {
        let targetLX = 0, targetLY = 0;
        let targetRX = 0, targetRY = 0;

        if (this.lookMode === 'mouse') {
            const rectL = this.eyeLeft.getBoundingClientRect();
            const rectR = this.eyeRight.getBoundingClientRect();
            const lCX = rectL.left + rectL.width  / 2;
            const lCY = rectL.top  + rectL.height / 2;
            const rCX = rectR.left + rectR.width  / 2;
            const rCY = rectR.top  + rectR.height / 2;
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const r = this.PUPIL_RADIUS;
            targetLX = clamp(this.mouseX - lCX, -r, r);
            targetLY = clamp(this.mouseY - lCY, -r, r);
            targetRX = clamp(this.mouseX - rCX, -r, r);
            targetRY = clamp(this.mouseY - rCY, -r, r);

        } else if (this.lookMode === 'expression') {
            // 看向左侧输入区域
            targetLX = -this.PUPIL_RADIUS * 0.7;
            targetLY = 0;
            targetRX = -this.PUPIL_RADIUS * 0.7;
            targetRY = 0;

        } else if (this.lookMode === 'canvas') {
            // 看向右侧棋盘区域
            targetLX = +this.PUPIL_RADIUS * 0.7;
            targetLY = 0;
            targetRX = +this.PUPIL_RADIUS * 0.7;
            targetRY = 0;

        } else if (this.lookMode === 'idle') {
            this.idleEyeTimer -= dt * 1000;
            if (this.idleEyeTimer <= 0) {
                const r = this.PUPIL_RADIUS * 0.8;
                this.idleEyeTarget = {
                    x: (Math.random() - 0.5) * 2 * r,
                    y: (Math.random() - 0.5) * 2 * r
                };
                this.idleEyeTimer = 1500 + Math.random() * 2000;
            }
            targetLX = this.idleEyeTarget.x;
            targetLY = this.idleEyeTarget.y;
            targetRX = this.idleEyeTarget.x;
            targetRY = this.idleEyeTarget.y;
        }

        const lerp = this.PUPIL_LERP;
        this.pupilL.x += (targetLX - this.pupilL.x) * lerp;
        this.pupilL.y += (targetLY - this.pupilL.y) * lerp;
        this.pupilR.x += (targetRX - this.pupilR.x) * lerp;
        this.pupilR.y += (targetRY - this.pupilR.y) * lerp;
    }

    setLookMode(mode) {
        this.lookMode = mode;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  链式物理（核心）
    // ═══════════════════════════════════════════════════════════════════════
    _updateChain(dt) {
        const grav = this.isDragging ? this.GRAVITY_DRAG : this.GRAVITY_FREE;

        // 将抓取质点强制固定到抓取位置（根中心相对坐标）
        this.ptA.vy += grav;
        this.ptB.vy += grav;

        // chain spring - maintain head/feet distance
        const cdx    = this.ptB.x - this.ptA.x;

        // ── 重力 ────────────────────────────────────────────────────────
        // 拖拽时用完整重力，松手后用微弱重力（产生自然弯曲感，但不会持续下坠）

        // ── 链条弹簧：维持头尾间距 ──────────────────────────────────────
        const cdy    = this.ptB.y - this.ptA.y;
        const cdist  = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        const cstret = cdist - this.CHAIN_REST;
        const cfx    = (cdx / cdist) * cstret * this.CHAIN_K;
        const cfy    = (cdy / cdist) * cstret * this.CHAIN_K;

        this.ptA.vx += cfx; this.ptA.vy += cfy;
        this.ptB.vx -= cfx; this.ptB.vy -= cfy;

        // grab constraint: any-point, distributed to both ends by t
        if (this.isDragging) {
            const t    = this.grabT;
            const cx   = (1 - t) * this.ptA.x + t * this.ptB.x;
            const cy   = (1 - t) * this.ptA.y + t * this.ptB.y;
            const errX = this.grabOffsetRelX - cx;
            const errY = this.grabOffsetRelY - cy;
            const k    = 0.85;
            this.ptA.vx += (1 - t) * errX * k;
            this.ptA.vy += (1 - t) * errY * k;
            this.ptB.vx += t       * errX * k;
            this.ptB.vy += t       * errY * k;
        }

        // ── 锚点弹簧：松手后拉回自然站立位置 ───────────────────────────
        if (!this.isDragging) {
            const ak_head = this.ANCHOR_K * 0.5;   // 头部：弱弹簧，滚后、过冲、摄动幅度大
            const ak_foot = this.ANCHOR_K * 1.3;   // 尾部：强弹簧，先回弹停稳
            this.ptA.vx += (0                                    - this.ptA.x) * ak_head;
            this.ptA.vy += (-this.CHAIN_HALF + this.HEAD_OFFSET - this.ptA.y) * ak_head;
            this.ptB.vx += (0               - this.ptB.x) * ak_foot;
            this.ptB.vy += (+this.CHAIN_HALF - this.ptB.y) * ak_foot;
        }

        // ── 速度衰减与极限裁切 ─────────────────────────────────────────────────────
        const damp = this.isDragging ? this.VEL_DAMP_DRAG : this.VEL_DAMP_FREE;
        this.ptA.vx *= damp; this.ptA.vy *= damp;
        this.ptB.vx *= damp; this.ptB.vy *= damp;
        
        // 限制最大绝对速度
        const clampV = (val, max) => Math.max(-max, Math.min(max, val));
        this.ptA.vx = clampV(this.ptA.vx, this.MAX_VELOCITY);
        this.ptA.vy = clampV(this.ptA.vy, this.MAX_VELOCITY);
        this.ptB.vx = clampV(this.ptB.vx, this.MAX_VELOCITY);
        this.ptB.vy = clampV(this.ptB.vy, this.MAX_VELOCITY);
        
        this.ptA.x  += this.ptA.vx;   this.ptA.y  += this.ptA.vy;
        this.ptB.x  += this.ptB.vx;   this.ptB.y  += this.ptB.vy;

        // ── 根元素飞行 / 重力下落 ───────────────────────────────────────────────
        // rootFlying = true：松手后始终启用，无论是否有甩出速度，都受重力下落
        if (!this.isDragging && this.rootFlying) {
            const rW = this.root.offsetWidth, rH = this.root.offsetHeight;
            const minX = 10 + rW/2, maxX = window.innerWidth  - rW/2 - 10;
            const minY = 10 + rH/2, maxY = window.innerHeight - rH/2 - 10;

            this.rootVelY += this.GRAVITY_DRAG * 0.15;  // 根元素重力（0.225 px/帧²），下落感自然
            this.rootVelX *= 0.97;
            this.rootVelY *= 0.97;
            this.rootCX   += this.rootVelX;
            this.rootCY   += this.rootVelY;

            if (this.rootCX < minX) { this.rootCX = minX; this.rootVelX = 0; }
            if (this.rootCX > maxX) { this.rootCX = maxX; this.rootVelX = 0; }
            if (this.rootCY < minY) { this.rootCY = minY; this.rootVelY = 0; }
            if (this.rootCY >= maxY) {
                this.rootCY    = maxY;
                this.rootVelX  = 0;
                this.rootVelY  = 0;
                this.rootFlying = false;  // 落地，停止飞行状态
            }

            this.root.style.left = (this.rootCX - rW/2) + 'px';
            this.root.style.top  = (this.rootCY - rH/2) + 'px';
        }

        // ── 待机走动：沿屏底横向移动 + 弹跳步态 ───────────────────
        if (!this.isDragging && this.walkActive && !this.rootFlying) {
            const rW = this.root.offsetWidth;
            const minX = 10 + rW / 2;
            const maxX = window.innerWidth - rW / 2 - 10;

            this.rootCX += this.walkVelX;
            if (this.rootCX <= minX) { this.rootCX = minX; this.walkVelX =  Math.abs(this.walkVelX); }
            if (this.rootCX >= maxX) { this.rootCX = maxX; this.walkVelX = -Math.abs(this.walkVelX); }
            this.root.style.left = (this.rootCX - rW / 2) + 'px';

            // 朝向检测：方向改变时对脸型容器做 scaleX 翻转（CSS transition 自动播放压扯动画）
            const newDir = this.walkVelX > 0 ? 1 : -1;
            if (newDir !== this._facingDir) {
                this._facingDir = newDir;
                const fw = this.root.querySelector('#summa-face-wrap');
                if (fw) fw.style.transform = newDir === 1 ? 'scaleX(1)' : 'scaleX(-1)';
            }

            // 弹跳冲量：定期向头尾施加向上冲量，产生弹性步态
            this.walkHopTimer--;
            if (this.walkHopTimer <= 0) {
                this.ptA.vy -= 4.5;
                this.ptB.vy -= 4.0;
                this.ptA.vx += this.walkVelX * 0.3;  // 轻微倒向，加强走动感
                this.walkHopTimer = 20 + Math.floor(Math.random() * 10);
            }

            // 走动时间倒计
            this.walkDuration--;
            if (this.walkDuration <= 0) {
                this.walkActive = false;
            }
        }

        // ── 静止检测（用于待机激活）─────────────────────────────────────
        const spd = Math.abs(this.ptA.vx) + Math.abs(this.ptA.vy)
                  + Math.abs(this.ptB.vx) + Math.abs(this.ptB.vy);
        if (!this.isDragging && spd < 0.35) {
            this.stillCounter++;
        } else {
            this.stillCounter = 0;
            if (spd > 0.8) this.idleActive = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  待机弹跳
    // ═══════════════════════════════════════════════════════════════════════
    _updateIdle(dt) {
        if (this.stillCounter > 120) this.idleActive = true;
        if (!this.idleActive || this.isDragging) return;

        // 走动中不需要额外待机冲量，加速计时就好
        if (this.walkActive) {
            this.idleTimer -= dt * 1000;
            if (this.idleTimer <= 0) this.idleTimer = this._nextIdleInterval();
            return;
        }

        this.idleTimer -= dt * 1000;
        if (this.idleTimer <= 0) {
            if (Math.random() < 0.4) {
                // 40%：开始走动
                this.walkActive   = true;
                this.walkVelX     = (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.0);
                this.walkHopTimer = 8;   // 开始时立刻弹跳
                this.walkDuration = 150 + Math.floor(Math.random() * 150);  // 2.5≈5s @60fps
            } else {
                // 60%：就地弹跳
                this.ptA.vy -= 5.2;
                this.ptB.vy -= 4.6;
                this.ptA.vx += (Math.random() - 0.5) * 1.6;
                this.ptB.vx += (Math.random() - 0.5) * 1.0;
            }
            this.stillCounter = 0;
            this.idleTimer = this._nextIdleInterval();
        }
    }

    _nextIdleInterval() {
        return 2200 + Math.random() * 1800;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  应用变换到 DOM
    // ═══════════════════════════════════════════════════════════════════════
    _applyTransforms() {
        // ── 身体：由 ptA/ptB 决定位置、旋转角、拉伸/压缩 ───────────────
        const midX = (this.ptA.x + this.ptB.x) / 2;
        const midY = (this.ptA.y + this.ptB.y) / 2;

        // 头到脚的向量
        const dx = this.ptA.x - this.ptB.x;  // 正常站立时 ≈ 0
        const dy = this.ptA.y - this.ptB.y;  // 正常站立时 < 0（头在脚上方）

        // 角色倾斜角：0 = 正立，atan2(dx, -dy)
        // 正立时：dx≈0, dy<0 → atan2(0, 正数) = 0 ✓
        // 头倒挂：dx≈0, dy>0 → atan2(0, 负数) = 180° ✓
        const charAngle = Math.atan2(dx, -dy) * 180 / Math.PI;

        // 拉伸/压缩：头尾距离相对于自然距离的比值
        const dist      = Math.sqrt(dx * dx + dy * dy) || this.CHAIN_REST;
        const stretchY  = Math.max(this.MIN_STRETCH, Math.min(this.MAX_STRETCH, dist / this.CHAIN_REST)); 
        const squashX   = Math.max(0.40, 1 / Math.sqrt(stretchY));
        
        // 追加惯性弯曲（模拟非刚体弯折）：根据两端点的横向速度差计算形变
        const dvx = this.ptA.vx - this.ptB.vx;
        const skewAngle = Math.max(-45, Math.min(45, dvx * this.SKEW_MULT)); // 放大速度差带来的偏移

        this.body.style.transform =
            `translate(${midX.toFixed(2)}px, ${midY.toFixed(2)}px) ` +
            `rotate(${charAngle.toFixed(2)}deg) ` +
            `skewX(${skewAngle.toFixed(2)}deg) ` +
            `scaleX(${squashX.toFixed(3)}) scaleY(${stretchY.toFixed(3)})`;

        // ── 眼皮（眨眼）────────────────────────────────────────────────
        // 眼皮眨眼 —— 暂时注释
        // this.eyelidLeft.style.transform  = `scaleY(${this.blinkProgress.toFixed(3)})`;
        // this.eyelidRight.style.transform = `scaleY(${this.blinkProgress.toFixed(3)})`;

        // 眼珠追踪 —— 暂时注释
        // this.pupilLeft.style.transform  = `translate(${this.pupilL.x.toFixed(2)}px, ${this.pupilL.y.toFixed(2)}px)`;
        // this.pupilRight.style.transform = `translate(${this.pupilR.x.toFixed(2)}px, ${this.pupilR.y.toFixed(2)}px)`;
    }
}
