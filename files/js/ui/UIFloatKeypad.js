// Auto-split from UIController.js — 悬浮计算器式输入栏（UIFloatKeypad）
// 唯一的输入栏（原底部元素栏 / 移动端内联面板已删除）；可拖动 / 收起为圆形按钮。
// 加载顺序需在 UIController.js 之后（index.html 已置于 ui 脚本区）
if (typeof UIController === 'undefined') {
    console.error('[UIFloatKeypad] UIController must be loaded before this file');
}

// initFloatKeypad
    UIController.prototype.initFloatKeypad = function() {
        const el = document.getElementById('float-keypad');
        if (!el) return;

        this.floatKeypad = el;
        this.floatKeypadHeader = document.getElementById('float-keypad-header');
        this.floatKeypadBody = document.getElementById('float-keypad-body');
        this.floatKeypadDisplay = document.getElementById('float-keypad-display');
        this.floatKeypadCollapseBtn = document.getElementById('float-keypad-collapse');
        this.floatKeypadSubmit = document.getElementById('float-keypad-submit');
        this.floatKeypadFx = document.getElementById('float-keypad-fx');
        this.floatKeypadLeft = document.getElementById('float-keypad-left');
        this.floatKeypadRight = document.getElementById('float-keypad-right');
        this.floatKeypadFab = document.getElementById('float-keypad-fab');

        this._floatKeypadCollapsed = false;  // 收起为圆形按钮

        // —— 尺寸调节：统一缩放比例因子 scale ——
        // 最小窗口 = 默认尺寸（scale=1，220px 宽 × 基准高）；最大窗口 = 默认 × 固定倍数；
        // 宽高同乘 scale 保持宽高比恒定，按钮 / 字号 / 间距随之等比例缩放
        this._kpMinScale = 1;           // 最小 scale（横屏/桌面）= 默认尺寸
        this._kpPortraitMinScale = 0.5; // 竖屏最小 scale = 默认尺寸的 50%（110px 宽）
        this._kpMaxScale = 2.2;         // 最大 scale = 默认 × 2.2（220 × 2.2 = 484px 宽）
        this._kpSizeFactor = 1.12;      // 每次点击 ±12%，连续点击平滑缩放
        this._floatKeypadScale = null;      // null = 未调节（scale=1，默认尺寸）
        this._floatKeypadBaseH = null;      // 基准高（scale=1 时内容自适应高度，首次可见时记录）
        // scale 夹取：下限按屏幕方向取 _kpPortraitMinScale / _kpMinScale（见 _kpMinScaleFor），
        // 上限受 _kpMaxScale 与视口双约束
        //（实现抽到原型方法 _clampFloatKeypadScale，按钮 hidden 判断也复用同一套约束）
        const clampUserScale = (scale) => this._clampFloatKeypadScale(scale);

        // 初始化一次缩放（窄屏时字号随宽度自适应）
        this.updateKeypadScale();

        // —— 拖动（按住标题栏） ——
        let drag = null;
        const header = this.floatKeypadHeader;
        header.addEventListener('pointerdown', (e) => {
            // 按钮等交互控件不触发拖动（避免 preventDefault 吞掉点击）
            if (e.target.closest('button')) return;
            e.preventDefault();
            el.classList.remove('kp-sizing'); // 开始拖动：取消尺寸过渡，避免位置跟随延迟
            const r = el.getBoundingClientRect();
            drag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
            try { header.setPointerCapture(e.pointerId); } catch (err) {}
        });
        header.addEventListener('pointermove', (e) => {
            if (!drag) return;
            el.style.left = (drag.left + e.clientX - drag.sx) + 'px';
            // 自由纵向拖动：上下都跟随指针；高度变化由 _clampFloatKeypad 保持底边界、向上延展
            el.style.top = (drag.top + e.clientY - drag.sy) + 'px';
            el.style.transform = 'none'; // 拖动后取消居中 transform
            this._clampFloatKeypad();     // 防止拖出屏幕
            this.updateKeypadScale();     // 位置/尺寸变化 → 重新计算缩放
        });
        const endDrag = () => { drag = null; };
        header.addEventListener('pointerup', endDrag);
        header.addEventListener('pointercancel', endDrag);

        // —— 窗口尺寸/方向变化：自动夹回屏幕内 + 重算字号缩放 + 函数名自适应 ——
        window.addEventListener('resize', () => {
            // 用户调节的 scale 若超出新视口允许的范围（含横竖屏切换导致的下限变化），先重新夹定再定位
            if (this._floatKeypadScale) {
                const clamped = clampUserScale(this._floatKeypadScale);
                if (clamped !== this._floatKeypadScale) {
                    this._floatKeypadScale = clamped;
                    this._applyFloatKeypadUserSize();
                    this._updateFloatKeypadSizeButtons();
                }
            }
            this._clampFloatKeypad();
            this.updateKeypadScale();
            this._clampFloatKeypadFab();
            if (this._floatKeypadFxOpen) this._fitFloatFxFonts();
        });

        // —— 收起为圆形按钮（×） ——
        this.floatKeypadCollapseBtn.addEventListener('click', () => {
            if (window.audioManager) window.audioManager.playClick();
            this._floatKeypadCollapsed = true;
            // 收起时仅移除 fx-open 类（面板此时隐藏），
            // 但保留 _floatKeypadFxOpen 标志：下次展开输入栏时函数栏仍保持打开
            el.classList.remove('fx-open');
            // 收起后重新展开时位置由 FAB 决定：重置底边/右边界锚点，避免沿用旧锚点
            this._floatKeypadBottom = null;
            this._floatKeypadHeight = null;
            this._floatKeypadRight = null;
            this._floatKeypadWidth = null;
            // 圆形按钮出现在原输入栏位置
            const r = el.getBoundingClientRect();
            if (this.floatKeypadFab) {
                this.floatKeypadFab.style.left = r.left + 'px';
                this.floatKeypadFab.style.top = r.top + 'px';
            }
            this._applyFloatKeypadVisibility();
            // 收起后立即刷新 y= 预览（定位到按钮右侧）
            this._updateFloatKeypadFabPreview();
        });

        // —— 圆形按钮：点击展开 / 可拖动 ——
        if (this.floatKeypadFab) {
            const fab = this.floatKeypadFab;
            // 拖动标志：pointermove 位移超过阈值视为拖动；click 时若发生过拖动则跳过展开（只有单击才展开）
            fab._fabDragMoved = false;
            fab.addEventListener('click', () => {
                if (fab._fabDragMoved) return; // 拖动后松开：不展开输入栏
                if (window.audioManager) window.audioManager.playClick();
                this._floatKeypadCollapsed = false;
                // 记录圆形按钮当前（拖动后）的左上角位置，展开时输入栏左上角与之对齐
                //（与收起时按钮左上角 = 输入栏左上角的相对关系一致）
                const fr = fab.getBoundingClientRect();
                this._floatKeypadOpenFromFab = { x: fr.left, y: fr.top };
                this._applyFloatKeypadVisibility();
                requestAnimationFrame(() => {
                    // 输入栏左上角对齐按钮左上角；若该位置会导致出界，_clampFloatKeypad 会把它
                    // 夹到离该位置最近的合法位置（与圆形按钮共用同一套视口 clamp）
                    const el = this.floatKeypad;
                    if (el && this._floatKeypadOpenFromFab) {
                        el.style.transform = 'none';
                        el.style.left = this._floatKeypadOpenFromFab.x + 'px';
                        el.style.top = this._floatKeypadOpenFromFab.y + 'px';
                        this._floatKeypadOpenFromFab = null;
                    }
                    this._clampFloatKeypad();
                    this.updateKeypadScale();
                });
            });
            let fabDrag = null;
            fab.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                fab._fabDragMoved = false;
                const r = fab.getBoundingClientRect();
                fabDrag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
                try { fab.setPointerCapture(e.pointerId); } catch (err) {}
            });
            fab.addEventListener('pointermove', (e) => {
                if (!fabDrag) return;
                // 位移超过 5px 判定为拖动（区别于单击）
                if (Math.abs(e.clientX - fabDrag.sx) > 5 || Math.abs(e.clientY - fabDrag.sy) > 5) {
                    fab._fabDragMoved = true;
                }
                fab.style.left = (fabDrag.left + e.clientX - fabDrag.sx) + 'px';
                fab.style.top = (fabDrag.top + e.clientY - fabDrag.sy) + 'px';
                this._clampFloatKeypadFab();
                // 拖动时 y= 表达式预览跟随按钮移动
                this._updateFloatKeypadFabPreview();
            });
            const endFabDrag = () => { fabDrag = null; };
            fab.addEventListener('pointerup', endFabDrag);
            fab.addEventListener('pointercancel', endFabDrag);
        }

        // —— 提交函数（与主确认按钮一致的语义：当前阶段确认） ——
        if (this.floatKeypadSubmit) {
            this.floatKeypadSubmit.addEventListener('click', () => {
                this.handleConfirm(); // 音效在 handleConfirm 内播放一次，避免重复
            });
            const refreshSubmit = () => {
                const cb = this.confirmBtn;
                if (cb) this.floatKeypadSubmit.disabled = !!cb.disabled;
            };
            refreshSubmit();
            // 阶段切换 / 锁更新时同步：委托给 updatePhaseUI 在末尾统一调一下
            this._refreshFloatKeypadSubmit = refreshSubmit;
        }

        // —— fx 按钮：展开/收起左侧函数面板（3×3） ——
        if (this.floatKeypadFx) {
            this._floatKeypadFxOpen = false;
            this.floatKeypadFx.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._floatKeypadFxOpen = !this._floatKeypadFxOpen;
                el.classList.toggle('fx-open', this._floatKeypadFxOpen);
                this.floatKeypadFx.classList.toggle('active', this._floatKeypadFxOpen);
                // fx 展开/收起时宽度基准（220→360）变化，scale 上限随之改变 → 重夹用户 scale
                if (this._floatKeypadScale) {
                    const clamped = this._clampFloatKeypadScale(this._floatKeypadScale);
                    if (clamped !== this._floatKeypadScale) this._floatKeypadScale = clamped;
                }
                // 高度切换：fx 展开交给内容自适应、收起恢复 基准高 × scale（scale 未设置时 _applyFloatKeypadUserSize 直接 return）
                this._applyFloatKeypadUserSize();
                // 展开后宽度变化 → 夹回屏幕内 + 重算字号缩放 + 函数名自适应
                requestAnimationFrame(() => {
                    this._clampFloatKeypad();
                    this.updateKeypadScale();
                    this._updateFloatKeypadSizeButtons();
                    if (this._floatKeypadFxOpen) this._fitFloatFxFonts();
                });
            });
        }

        // —— 背景模式按钮：循环切换 透明 / 遮光 / 模糊 ——
        this.floatKeypadModeBtn = document.getElementById('float-keypad-mode');
        if (this.floatKeypadModeBtn) {
            // 三种模式及对应背景类
            this._keypadBgModes = [
                { name: '透明', cls: 'keypad-bg-transparent' },
                { name: '遮光', cls: 'keypad-bg-shade' },
                { name: '模糊', cls: 'keypad-bg-blur' }
            ];
            this._keypadBgIndex = 1; // 默认遮光
            const applyBgMode = (index) => {
                const mode = this._keypadBgModes[index];
                // 先移除所有背景类，再加当前模式类（遮光 = 基础样式，透明/模糊为覆盖类）
                el.classList.remove('keypad-bg-transparent', 'keypad-bg-shade', 'keypad-bg-blur');
                el.classList.add(mode.cls);
                this.floatKeypadModeBtn.textContent = mode.name;
            };
            this.floatKeypadModeBtn.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._keypadBgIndex = (this._keypadBgIndex + 1) % this._keypadBgModes.length;
                applyBgMode(this._keypadBgIndex);
            });
            applyBgMode(this._keypadBgIndex); // 初始化
        }

        // —— 输入栏尺寸调节按钮：缩小 / 增大（统一 scale 等比缩放宽高与内部元素，平滑过渡） ——
        this.floatKeypadShrinkBtn = document.getElementById('float-keypad-shrink');
        this.floatKeypadGrowBtn = document.getElementById('float-keypad-grow');
        if (this.floatKeypadShrinkBtn && this.floatKeypadGrowBtn) {
            const resizeKeypad = (factor) => {
                if (window.audioManager) window.audioManager.playClick();
                // 快速连续点击：先取消上一次收尾定时器，避免位置 / 尺寸抖动
                if (this._kpSizingTimer) { clearTimeout(this._kpSizingTimer); this._kpSizingTimer = null; }
                // 过渡期间启用 kp-sizing（width/height/left/top 平滑过渡）
                el.classList.add('kp-sizing');
                const r = el.getBoundingClientRect();
                // 首次调节时记录基准高（scale=1 时内容自适应高度；fx 展开时高度不同，等收起态再记录）
                if (this._floatKeypadBaseH == null && !this._floatKeypadFxOpen) {
                    this._floatKeypadBaseH = el.offsetHeight || 320;
                }
                // 统一 scale：最小窗口 = 默认尺寸，最大窗口 = 默认 × MAX_SCALE，宽高同乘保持宽高比
                const next = clampUserScale((this._floatKeypadScale || 1) * factor);
                this._floatKeypadScale = next;
                // 以当前右 / 下边界为锚：扩大时左上角上移、缩小时左上角下移，底边 / 右边保持不动
                const narrow = window.matchMedia('(max-width: 480px), (orientation: portrait) and (max-width: 767px)').matches;
                const baseW = this._floatKeypadFxOpen ? (narrow ? 330 : 360) : 220;
                const nextW = Math.round(baseW * next);
                const nextH = Math.round((this._floatKeypadBaseH || 320) * next);
                el.style.left = (r.right - nextW) + 'px';
                el.style.top = (r.bottom - nextH) + 'px';
                // 过渡期间先固定高度（fx 展开时高度交给内容自适应，不固定避免截断）
                if (!this._floatKeypadFxOpen) el.style.height = nextH + 'px';
                el.style.transform = 'none';
                // 宽高交给 CSS：--kp-w-scale / --kp-h-scale 驱动 calc(base * scale)，
                // 宽度 / 高度 / 按钮 / 字号 / 间距全部等比缩放
                this.updateKeypadScale();
                this._updateFloatKeypadSizeButtons();
                // 过渡结束后：移除过渡类、夹回屏内（宽度可能已超出视口）
                this._kpSizingTimer = setTimeout(() => {
                    this._kpSizingTimer = null;
                    el.classList.remove('kp-sizing');
                    this._applyFloatKeypadUserSize();
                    this._clampFloatKeypad();
                    this.updateKeypadScale();
                    this._updateFloatKeypadSizeButtons();
                }, 330); // 匹配 CSS 过渡 0.28s + 余量
            };
            this.floatKeypadShrinkBtn.addEventListener('click', () => resizeKeypad(1 / this._kpSizeFactor));
            this.floatKeypadGrowBtn.addEventListener('click', () => resizeKeypad(this._kpSizeFactor));
            this._updateFloatKeypadSizeButtons(); // 初始化：scale=1 时隐藏缩小按钮
        }

        // —— 数学预览缩放按钮：点击循环切换缩放级别（缩小 → 放大回原尺寸） ——
        this.floatKeypadMathZoom = document.getElementById('float-keypad-math-zoom');
        if (this.floatKeypadMathZoom) {
            // 缩放级别：100% / 80% / 60% / 45%
            this._mathPreviewZoom = 1;
            this._mathPreviewZoomLevels = [1, 0.8, 0.6, 0.45];
            this._mathPreviewZoomIndex = 0;
            const updateZoomBtnLabel = () => {
                const pct = Math.round(this._mathPreviewZoom * 100);
                this.floatKeypadMathZoom.textContent = pct + '%';
            };
            this.floatKeypadMathZoom.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playClick();
                this._mathPreviewZoomIndex = (this._mathPreviewZoomIndex + 1) % this._mathPreviewZoomLevels.length;
                this._mathPreviewZoom = this._mathPreviewZoomLevels[this._mathPreviewZoomIndex];
                updateZoomBtnLabel();
                this._fitMathPreviewFont();
            });
            updateZoomBtnLabel();
        }

        // —— 底部 ◀ ▶：左右移动光标（与键盘 ArrowLeft/ArrowRight 一致） ——
        const moveCursor = (delta) => {
            if (this.gameController.currentPhase !== 'input_function') return;
            if (this._isSpectating) return;
            const n = this.expressionElements.length;
            if (delta < 0 && this.cursorIndex > 0) {
                this.cursorIndex--;
                this.updateExpressionDisplay();
            } else if (delta > 0 && this.cursorIndex < n) {
                this.cursorIndex++;
                this.updateExpressionDisplay();
            }
        };
        if (this.floatKeypadLeft) {
            this.floatKeypadLeft.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playElementClick();
                moveCursor(-1);
            });
        }
        if (this.floatKeypadRight) {
            this.floatKeypadRight.addEventListener('click', () => {
                if (window.audioManager) window.audioManager.playElementClick();
                moveCursor(1);
            });
        }

        // —— 悬浮栏顶部表达式区：点击定位光标 / 点击元素删除（原 expression-display 栏目已隐藏，交互搬到这里） ——
        if (this.floatKeypadDisplay) {
            this.floatKeypadDisplay.addEventListener('click', (e) => this.handleExpressionClick(e));
        }

        // 初始同步一次可见性（此时 currentPhase='init'，输入栏隐藏）
        this._applyFloatKeypadVisibility();
    }
;

// _floatKeypadRelevant — 仅在需要元素输入的阶段显示（与原输入栏显示时机一致）；
//                       关卡编辑器打开时隐藏悬浮栏与圆形按钮
    UIController.prototype._floatKeypadRelevant = function() {
        const gc = this.gameController;
        if (!gc) return false;
        // 关卡编辑器打开：不显示悬浮输入栏/圆形按钮
        const editorView = document.getElementById('editor-view');
        if (editorView && editorView.style.display !== 'none') return false;
        const phase = gc.currentPhase;
        if (gc.isTestMode && gc.isTestMode()) return true;
        return phase === 'input_function' || phase === 'set_locks';
    }
;

// _applyFloatKeypadVisibility — 悬浮栏是唯一输入栏：相关阶段显示；收起时显示圆形按钮
    UIController.prototype._applyFloatKeypadVisibility = function() {
        const relevant = this._floatKeypadRelevant();
        const showKeypad = relevant && !this._floatKeypadCollapsed;
        const showFab = relevant && this._floatKeypadCollapsed;
        if (this.floatKeypad) this.floatKeypad.hidden = !showKeypad;
        if (this.floatKeypadFab) this.floatKeypadFab.hidden = !showFab;
        // 相关阶段：隐藏原输入栏与右侧表达式区（body 类 + 永久 CSS 双保险）
        document.body.classList.toggle('float-keypad-mode', relevant);
        if (showKeypad) {
            // 2026-08-12 修复：展开输入栏时显式隐藏 y= 预览，避免收起时残留
            const prev = document.getElementById('float-keypad-fab-preview');
            if (prev) prev.hidden = true;
            this.renderFloatKeypad();
            // 首次显示时夹回屏幕内（小屏可能溢出）
            requestAnimationFrame(() => {
                // 收起再展开后保持用户自定义尺寸（fx 展开过窄时宽度交给 fx-open 规则）
                this._applyFloatKeypadUserSize();
                this._clampFloatKeypad();
                this.updateKeypadScale();
                this._updateFloatKeypadSizeButtons();
                // 同步「提交」按钮的可用态（与主确认按钮一致）
                if (this._refreshFloatKeypadSubmit) this._refreshFloatKeypadSubmit();
            });
        }
        if (showFab) {
            // 圆形按钮显示时也夹回屏幕内（任何界面/模式下均不越界，与输入栏一致）
            requestAnimationFrame(() => {
                this._clampFloatKeypadFab();
                // 收起状态：y= 表达式预览显示在按钮右侧并随拖动移动
                this._updateFloatKeypadFabPreview();
            });
        }
    }
;

// _updateFloatKeypadFabPreview — 悬浮键盘收起为圆形按钮时，y= 表达式预览显示在按钮右侧并随拖动移动
    UIController.prototype._updateFloatKeypadFabPreview = function() {
        const fab = this.floatKeypadFab;
        const preview = document.getElementById('float-keypad-fab-preview');
        if (!fab || !preview) return;
        if (!this._floatKeypadCollapsed) { preview.hidden = true; return; }
        // 2026-08-12 修复：只取 .expression-element 节点文本，排除 "y =" 前缀与光标，
        // 避免预览显示成 "y = y = ..."
        let text = '';
        if (this.expressionDisplay) {
            text = Array.from(this.expressionDisplay.querySelectorAll('.expression-element'))
                .map((s) => s.textContent).join('').trim();
        }
        if (!text) { preview.hidden = true; return; }
        preview.textContent = 'y = ' + text;
        preview.hidden = false;
        const fr = fab.getBoundingClientRect();
        const ph = preview.offsetHeight;
        preview.style.left = (fr.right + 10) + 'px';
        preview.style.top = (fr.top + fr.height / 2 - ph / 2) + 'px';
    }
;

// _clampToViewport — 公共边界约束：把任意 fixed 定位元素夹回视口内（输入栏与圆形按钮共用同一套逻辑）。
//                     margin 为视口安全边距；centerIfUnpositioned=true 时未定位过的元素默认居中（输入栏），
//                     false 时默认落到右下角（圆形按钮）。
    UIController.prototype._clampToViewport = function(el, margin, centerIfUnpositioned) {
        if (!el) return;
        margin = margin || 8;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = parseFloat(el.style.left);
        let top = parseFloat(el.style.top);
        if (Number.isNaN(left)) {
            // 输入栏默认位置按屏幕方向自适应：横屏偏左、竖屏水平居中
            left = centerIfUnpositioned ? (vw > vh ? margin : (vw - el.offsetWidth) / 2) : vw - el.offsetWidth - 16;
        }
        if (Number.isNaN(top)) {
            // 横屏垂直居中、竖屏偏下（贴近底边留出安全间距）
            top = centerIfUnpositioned ? (vw > vh ? (vh - el.offsetHeight) / 2 : vh - el.offsetHeight - margin) : vh - el.offsetHeight - 16;
        }
        left = Math.max(margin, Math.min(left, vw - margin - el.offsetWidth));
        top = Math.max(margin, Math.min(top, vh - margin - el.offsetHeight));
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }
;

// _clampFloatKeypadFab — 圆形按钮夹回屏幕内（复用公共 clamp，行为与输入栏一致；默认右下角）
    UIController.prototype._clampFloatKeypadFab = function() {
        const fab = this.floatKeypadFab;
        if (!fab || fab.hidden) return;
        this._clampToViewport(fab, 8, false);
    }
;

// _kpMinScaleFor — 当前屏幕方向下的最小 scale：竖屏可缩至默认尺寸的 50%（_kpPortraitMinScale），
//                  横屏/桌面保持默认尺寸（_kpMinScale）。随方向切换即时生效。
    UIController.prototype._kpMinScaleFor = function() {
        return (window.matchMedia('(orientation: portrait)').matches && !window.matchMedia('(min-width: 1024px)').matches)
            ? this._kpPortraitMinScale
            : this._kpMinScale;
    }
;

// _clampFloatKeypadScale — scale 夹取：下限按方向取 _kpPortraitMinScale / _kpMinScale、
//                          上限受 _kpMaxScale 与视口双约束。
//                          fx 展开时函数面板需要额外宽度（360px 基准），最大 scale 相应收紧。
//                          构造函数内闭包 clampUserScale 与按钮 hidden 判断共用此实现，保证单一数据源。
    UIController.prototype._clampFloatKeypadScale = function(scale) {
        const el = this.floatKeypad;
        const vw = window.innerWidth, vh = window.innerHeight;
        const baseH = this._floatKeypadBaseH || (el && el.offsetHeight) || 320;
        // fx 展开时函数面板需要额外宽度，最大 scale 相应收紧（桌面 360px 基准，窄屏横屏 330px）
        const narrow = window.matchMedia('(max-width: 480px), (orientation: portrait) and (max-width: 767px)').matches;
        const baseW = this._floatKeypadFxOpen ? (narrow ? 330 : 360) : 220;
        const maxByVw = (vw * 0.92) / baseW;
        const maxByVh = (vh * 0.92) / baseH;
        const maxScale = Math.min(this._kpMaxScale, maxByVw, maxByVh);
        return Math.max(this._kpMinScaleFor(), Math.min(maxScale, scale));
    }
;

// updateKeypadScale — 更新 --kp-w-scale / --kp-h-scale，驱动 CSS 中 calc(base * scale)
//                      的字号 / 间距 / 按钮尺寸随统一缩放因子等比缩放。
//                      注意：--kp-w-scale 直接用用户 scale，宽度由 CSS min(calc(220px*scale), 92vw)
//                      处理视口夹取——不可用 el.offsetWidth 反推（宽度本身依赖该变量，会循环取 1）。
//                      未调节（scale=null）时沿用旧逻辑：窄屏被 92vw 压缩时字号自适应收缩。
    UIController.prototype.updateKeypadScale = function() {
        const el = this.floatKeypad;
        if (!el) return;
        const userScale = this._floatKeypadScale || 1;
        let wScale;
        if (this._floatKeypadScale) {
            // 用户已调节：统一等比（视口约束已由 _clampFloatKeypadScale 保证 220*scale ≤ 92vw）
            wScale = userScale;
        } else {
            // 未调节：保留窄屏字号自适应（宽度可能被 92vw 压缩，字号随实际宽度收缩）
            const w = el.offsetWidth;
            wScale = Math.min(1, Math.max(0.72, (w || 220) / 220));
        }
        el.style.setProperty('--kp-w-scale', wScale.toFixed(3));
        el.style.setProperty('--kp-h-scale', userScale.toFixed(3));
    }
;

// _applyFloatKeypadUserSize — 把用户通过「增大/缩小」按钮设定的 scale 应用回输入栏。
//                             宽度由 CSS 驱动（calc(220px * --kp-w-scale)，fx 展开 360px）；
//                             高度：收起时固定为 基准高 × scale（宽高比恒定 + 过渡平滑），
//                             fx 展开时函数面板与主键盘上下堆叠、整体变高 → 交给内容自适应。
    UIController.prototype._applyFloatKeypadUserSize = function() {
        const el = this.floatKeypad;
        if (!el) return;
        const scale = this._floatKeypadScale;
        if (!scale) return;
        if (this._floatKeypadFxOpen) {
            el.style.height = '';
        } else {
            // 基准高优先取记录值；未记录（首次调节恰在 fx 展开态）时用当前收起态实际高度
            const baseH = this._floatKeypadBaseH || el.offsetHeight || 320;
            el.style.height = Math.round(baseH * scale) + 'px';
        }
    }
;

// _updateFloatKeypadSizeButtons — 根据当前 scale 同步「增大/缩小」按钮可用态：
//                                 达到最大窗口隐藏增大按钮，缩到当前方向允许的最小隐藏缩小按钮。
    UIController.prototype._updateFloatKeypadSizeButtons = function() {
        const shrink = this.floatKeypadShrinkBtn;
        const grow = this.floatKeypadGrowBtn;
        if (!shrink && !grow) return;
        const scale = this._floatKeypadScale || 1;
        const maxScale = this._clampFloatKeypadScale(this._kpMaxScale);
        const EPS = 1e-6;
        if (shrink) shrink.hidden = scale <= this._kpMinScaleFor() + EPS;
        if (grow) grow.hidden = scale >= maxScale - EPS;
        if (shrink) shrink.title = shrink.hidden ? '' : '缩小输入栏';
        if (grow) grow.title = grow.hidden ? '' : '增大输入栏';
    }
;

// _clampFloatKeypad — 夹回屏幕内（位置 + 尺寸；复用公共 clamp，行为与圆形按钮一致；默认居中）。
//                     高度变化时保持底边界不动：上边界随高度上移；宽度变化（如 fx 面板展开）时
//                     保持右边界不动：左边界左移。若调整后超出屏幕则夹到离目标位置最近的合法位置。
    UIController.prototype._clampFloatKeypad = function() {
        const el = this.floatKeypad;
        if (!el || el.hidden) return;
        const h = el.offsetHeight;
        const w = el.offsetWidth;
        // 高度发生变化时：保持底边界位置不变（上边界 = 原底边 − 当前高）
        if (this._floatKeypadBottom != null && this._floatKeypadHeight !== h) {
            el.style.top = (this._floatKeypadBottom - h) + 'px';
        }
        // 宽度发生变化时（如 fx 面板展开/收起）：保持右边界不动（左边界 = 原右边 − 当前宽）
        if (this._floatKeypadRight != null && this._floatKeypadWidth !== w) {
            el.style.left = (this._floatKeypadRight - w) + 'px';
        }
        this._clampToViewport(el, 8, true);
        el.style.transform = 'none'; // 消除居中 transform，确保 left/top 定位生效
        // 记录当前底边界与右边界，供下次尺寸变化时保持（clamp 后为最近合法位置）
        this._floatKeypadBottom = (parseFloat(el.style.top) || 0) + h;
        this._floatKeypadRight = (parseFloat(el.style.left) || 0) + w;
        this._floatKeypadHeight = h;
        this._floatKeypadWidth = w;
    }
;

// renderFloatKeypad — 按当前阶段渲染（input → 计算器键盘；set_locks → 锁定选择视图）。
//                     锁定视图与输入栏布局完全一致（fx 按钮可见、函数收进 fx 面板，点击 fx 才展开）
    UIController.prototype.renderFloatKeypad = function() {
        if (!this.floatKeypadBody) return;
        const phase = this.gameController && this.gameController.currentPhase;
        if (phase === 'set_locks') {
            this._renderFloatLockView();
        } else {
            this._renderFloatKeypadInput();
        }
        // 锁定阶段无表达式：隐藏数学预览区域；输入阶段显示
        const mathEl = document.getElementById('float-keypad-math');
        if (mathEl) mathEl.style.display = (phase === 'set_locks') ? 'none' : '';
        // fx 面板展开时：函数名长度自适应（渲染后布局确定再执行）
        if (this._floatKeypadFxOpen) {
            requestAnimationFrame(() => this._fitFloatFxFonts());
        }
    }
;

// _renderFloatKeypadInput — 计算器式键盘（5 列主键盘；函数收进 fx 面板 3×3，默认隐藏，
//                           点击「fx」按钮展开到左侧；锁定元素正常显示 🔒）
    UIController.prototype._renderFloatKeypadInput = function() {
        const body = this.floatKeypadBody;
        if (!body) return;
        body.innerHTML = '';

        // 键盘内联图标（SVG 替代 emoji/特殊字符，避免字体渲染不一致）
        const LOCK_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        const BACKSPACE_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>';

        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const roundLocked = (state.roundState && state.roundState.lockedElements) || [];
        const spectating = !!this._isSpectating;
        const isAiTurn = this.gameController.gameMode === 'ai' && state.currentPlayer === 'B';
        const notMyTurn = this.isP2PMode && !this._isMyTurn();
        const blockInput = spectating || isAiTurn || notMyTurn;

        const funcNames = { 'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'asin': 'asin', 'acos': 'acos', 'atan': 'atan', 'abs': 'abs', 'ln': 'ln', 'sqrt': '√' };
        const lockBtn = (btn, display) => {
            btn.classList.add('locked');
            btn.innerHTML = `${display} <span class="lock-icon">${LOCK_SVG}</span>`;
            btn.title = '本回合被锁定';
            if (blockInput) {
                // 观战 / AI 回合 / 对方回合：保持完全禁用
                btn.disabled = true;
            } else {
                // 锁定元素被点击：播放错误音效
                //（disabled 按钮不会触发 click 事件，故保持可点击并拦截）
                btn.addEventListener('click', () => {
                    if (window.audioManager) window.audioManager.playError();
                });
            }
        };

        const main = document.createElement('div');
        main.className = 'float-keypad-main';

        // —— 左侧函数面板（3×3 网格，默认隐藏；fx 展开时显示） ——
        const funcValues = ['sin', 'cos', 'tan', 'ln', 'sqrt', 'abs'];
        const inverseTrig = ['asin', 'acos', 'atan'];
        const fxPanel = document.createElement('div');
        fxPanel.className = 'float-keypad-fx-panel';
        const addFuncBtn = (v, item) => {
            const display = funcNames[v] || v;
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = display;
            btn.dataset.value = v;
            if (roundLocked.includes(v) || item.locked) {
                lockBtn(btn, display);
            } else if (blockInput) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => this.addElementToExpression(v));
            }
            fxPanel.appendChild(btn);
        };
        for (const v of funcValues) {
            const item = (elements.functions || []).find(f => f.value === v);
            if (item) addFuncBtn(v, item);
        }
        // 反三角函数：可见才显示；未解锁时锁定样式但可点击弹解锁提示
        for (const v of inverseTrig) {
            const item = (elements.functions || []).find(f => f.value === v);
            if (!item) continue;
            const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(v);
            if (isInverseTrig && this.shouldHideInverseTrigElement()) continue;
            const display = funcNames[v] || v;
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = display;
            btn.dataset.value = v;
            if (isInverseTrig && !this.isInverseTrigUnlocked()) {
                btn.classList.add('locked', 'inverse-trig-locked');
                btn.innerHTML = `${display} <span class="lock-icon">${LOCK_SVG}</span>`;
                btn.title = '需通关全部分数关解锁';
                if (!blockInput) btn.addEventListener('click', () => this.showInverseTrigLockedDialog());
                fxPanel.appendChild(btn);
                continue;
            }
            addFuncBtn(v, item);
        }
        main.appendChild(fxPanel);

        // —— 右侧主键盘（5 列计算器式） ——
        const keyMap = [
            ['7', '8', '9', '/', 'back'],
            ['4', '5', '6', '*', '('],
            ['1', '2', '3', '-', ')'],
            ['0', '.', 'π', '+', '^'],
            ['x', 'e', 'i', '!', 'clear']
        ];
        const grid = document.createElement('div');
        grid.className = 'float-keypad-grid';
        for (const row of keyMap) {
            for (const key of row) {
                const btn = document.createElement('button');
                btn.className = 'element-btn';
                if (key === 'back') {
                    btn.innerHTML = BACKSPACE_SVG;
                    btn.dataset.action = 'back';
                    btn.title = '删除光标前一个元素';
                    if (!blockInput) btn.addEventListener('click', () => this.floatKeypadBackspace());
                } else if (key === 'clear') {
                    btn.textContent = 'AC';
                    btn.dataset.action = 'clear';
                    btn.title = '清空表达式';
                    if (!blockInput) btn.addEventListener('click', () => this.handleClear());
                } else {
                    const display = this.getDisplaySymbol(key);
                    btn.textContent = display;
                    btn.dataset.value = key;
                    if (roundLocked.includes(key)) {
                        lockBtn(btn, display);
                    } else if (blockInput) {
                        btn.disabled = true;
                    } else {
                        btn.addEventListener('click', () => this.addElementToExpression(key));
                    }
                }
                if (blockInput) btn.disabled = true; // ⌫ / C 在对方回合同样禁用
                grid.appendChild(btn);
            }
        }
        main.appendChild(grid);
        body.appendChild(main);

        // 恢复 fx 面板展开态（收起时已复位，展开态保持）
        const el = this.floatKeypad;
        if (el && this._floatKeypadFxOpen) {
            el.classList.add('fx-open');
            if (this.floatKeypadFx) this.floatKeypadFx.classList.add('active');
        }
    }
;

// _fitFloatFxFonts — 函数按钮字号自适应：函数名较长时自动缩小字号，
//                    确保函数名称始终完整显示在按钮内部（不发生溢出/截断）
    UIController.prototype._fitFloatFxFonts = function() {
        const panel = this.floatKeypadBody && this.floatKeypadBody.querySelector('.float-keypad-fx-panel');
        if (!panel || panel.offsetWidth <= 0) return; // 面板未展开（width:0）时跳过
        const kpEl = this.floatKeypad;
        const wScale = kpEl ? (parseFloat(kpEl.style.getPropertyValue('--kp-w-scale')) || 1) : 1;
        const narrow = window.matchMedia('(max-width: 480px), (orientation: portrait) and (max-width: 767px)').matches;
        // 与 CSS 一致的基础字号（乘上 width 缩放），另设下限避免过小
        const baseSize = (narrow ? 11 : 12) * wScale;
        const minSize = (narrow ? 8 : 9) * wScale;
        panel.querySelectorAll('.element-btn').forEach((btn) => {
            if (!btn.textContent) return;
            btn.style.whiteSpace = 'nowrap';
            btn.style.fontSize = baseSize + 'px';
            let size = baseSize;
            // 循环缩小，直到文本不再溢出按钮（scrollWidth 超出 clientWidth 视为溢出）
            while (size > minSize && btn.scrollWidth > btn.clientWidth) {
                size -= 0.5;
                btn.style.fontSize = size + 'px';
            }
        });
    }
;

// _renderFloatLockView — 锁定选择视图：布局与输入栏完全一致——fx 按钮可见，
//                        函数收进 fx 面板（点击 fx 才展开），主键盘放数字/运算符。
//                        点击按钮 = 切换该元素的锁定状态。
    UIController.prototype._renderFloatLockView = function() {
        const body = this.floatKeypadBody;
        if (!body) return;
        body.innerHTML = '';

        const elements = this.parser.getAvailableElements();
        const state = this.gameController.getGameState();
        const alreadyLocked = state.roundState.lockedElements || [];
        const spectating = !!this._isSpectating;
        const isAiTurn = this.gameController.gameMode === 'ai' && state.currentPlayer === 'B';
        const blockInput = spectating || isAiTurn || (this.isP2PMode && !this._isMyTurn());

        const lockFuncDisplayNames = {
            'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
            'abs': 'abs', 'exp': 'exp', 'ln': 'ln', 'log': 'log'
        };
        const getDisplay = (v) => lockFuncDisplayNames[v] || this.getDisplaySymbol(v);

        // 通用：装饰锁定按钮（选中 / 已达上限 / 受保护 / 对方回合）并绑定点击切换
        const decorate = (btn, element) => {
            const lockCount = state.getElementLockCount ? state.getElementLockCount(element) : 0;
            const isMaxLocked = lockCount >= 2;
            if (alreadyLocked.includes(element)) {
                btn.classList.add('selected');
                btn.style.background = 'rgba(239, 68, 68, 0.5)';
            }
            if (isMaxLocked) {
                btn.style.opacity = '0.4';
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.title = `${this.getDisplaySymbol(element)} 已达到最大锁定次数 (2/2)`;
            }
            btn.addEventListener('mouseenter', (e) => this.showLockCountTooltip(e, element, lockCount));
            btn.addEventListener('mouseleave', () => this.hideLockCountTooltip());
            const isProtectedInEasyMode = state.difficulty === 'easy' && ['+', '-', '*', '/'].includes(element);
            if (isProtectedInEasyMode) {
                btn.classList.add('protected');
                btn.disabled = true;
                btn.title = '四则运算无法被锁定';
            } else if (blockInput) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => this.toggleLockElement(element, btn));
            }
        };

        const title = document.createElement('div');
        title.className = 'float-keypad-lock-label';
        title.textContent = `选择要锁定的元素 (${alreadyLocked.length}/${state.maxLocks})`;
        body.appendChild(title);

        const main = document.createElement('div');
        main.className = 'float-keypad-main';

        // 左侧函数面板（3×3，默认隐藏；fx 展开时显示）
        const fxPanel = document.createElement('div');
        fxPanel.className = 'float-keypad-fx-panel';
        const addFuncBtn = (v) => {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = getDisplay(v);
            btn.dataset.value = v;
            decorate(btn, v);
            fxPanel.appendChild(btn);
        };
        for (const v of ['sin', 'cos', 'tan', 'ln', 'sqrt', 'abs']) {
            if (elements.functions && elements.functions.some(f => f.value === v)) addFuncBtn(v);
        }
        for (const v of ['asin', 'acos', 'atan']) {
            const item = (elements.functions || []).find(f => f.value === v);
            if (!item) continue;
            const isInverseTrig = Array.isArray(this.inverseTrigElements) && this.inverseTrigElements.includes(v);
            if (isInverseTrig && this._shouldSkipInverseTrigInLockView()) continue;
            addFuncBtn(v);
        }
        main.appendChild(fxPanel);

        // 右侧主键盘（5 列）：数字 + 运算符（与输入栏主键盘布局一致）
        const lockValues = [
            ...elements.numbers.map(e => e.value),  // 包含 π, e, i
            ...elements.basicOperators.map(e => e.value),
            ...elements.operators.filter(e => e.value !== 'x' && e.value !== '(' && e.value !== ')').map(e => e.value)
        ];
        const grid = document.createElement('div');
        grid.className = 'float-keypad-grid';
        for (const element of lockValues) {
            const btn = document.createElement('button');
            btn.className = 'element-btn';
            btn.textContent = getDisplay(element);
            btn.dataset.value = element;
            decorate(btn, element);
            grid.appendChild(btn);
        }
        main.appendChild(grid);
        body.appendChild(main);

        // 恢复 fx 面板展开态（与输入栏一致：收起时复位，展开态保持）
        const el = this.floatKeypad;
        if (el && this._floatKeypadFxOpen) {
            el.classList.add('fx-open');
            if (this.floatKeypadFx) this.floatKeypadFx.classList.add('active');
        }
    }
;

// floatKeypadBackspace — ⌫ 删除光标前一个元素（与键盘 Backspace 一致）
    UIController.prototype.floatKeypadBackspace = function() {
        if (this._isSpectating) return;
        if (this.gameController.currentPhase !== 'input_function') return;
        if (this.cursorIndex > 0) {
            if (window.audioManager) window.audioManager.playElementClick();
            this.expressionElements.splice(this.cursorIndex - 1, 1);
            this.cursorIndex--;
            this.updateExpressionDisplay();
        }
    }
;

// _syncFloatKeypadDisplay — 悬浮栏表达式显示镜像主输入区；
//                          镜像后输入栏高度可能变化，按底边界锚定重新夹回屏内
    UIController.prototype._syncFloatKeypadDisplay = function() {
        if (this.floatKeypadDisplay) {
            this.floatKeypadDisplay.innerHTML = this.expressionDisplay.innerHTML;
            // 待布局完成后重算位置：高度变化时保持底边界不动
            requestAnimationFrame(() => this._clampFloatKeypad());
        }
        // 收起状态下表达式变化时同步刷新 y= 预览
        if (this._floatKeypadCollapsed) this._updateFloatKeypadFabPreview();
    }
;
