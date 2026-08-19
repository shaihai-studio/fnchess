/**
 * UICoreMisc —— UICore 模块切片（UIController.prototype 挂载）
 *
 * LR/TT Sigma、难度区间与名称、消息提示、函数类型名、可拖拽
 * 本文件是 files/js/ui/UICore.js 的物理拆分结果（批次11，2026-08-15）。
 * 所有方法仍挂载到 UIController.prototype，运行时行为与原单文件完全一致。
 * UICore 无顶层 const/IIFE，切片间无加载期依赖，顺序任意（按职责分组）。
 */

    UIController.prototype.calculateLRSigma = function(cleared, difficulty) {
        if (!cleared || cleared <= 0) return 0;
        let sum = 0;
        // 整数关卡 1..cleared
        for (let i = 1; i <= cleared; i++) {
            const best = this.getCampaignLevelBestRecord(i);
            if (best !== null && best > 0) {
                sum += 100 / (10 + best);
            }
        }
        // 分数关卡（1/2..1/20）
        if (difficulty === 'fraction' || (typeof this.getCampaignFractionClearedMax === 'function')) {
            const fracMax = typeof this.getCampaignFractionClearedMax === 'function'
                ? this.getCampaignFractionClearedMax() : 0;
            for (let denom = 2; denom <= fracMax && denom <= 20; denom++) {
                const best = this.getCampaignLevelBestRecord(`1/${denom}`);
                if (best !== null && best > 0) {
                    sum += 100 / (10 + best);
                }
            }
        }
        // 解锁通关惩罚：每关通过"解锁"通关（未保存最佳、LRΣ 不计该关）再额外扣 10 分；
        // 后续正常通关该关时会移除对应记录，扣分自动恢复。
        if (typeof this.getCampaignUnlockedPlaySet === 'function') {
            sum -= this.getCampaignUnlockedPlaySet().length * 10;
        }
        return Math.max(0, sum);
    }
;

// getDifficultyRange
    UIController.prototype.getDifficultyRange = function(diff) {
        if (diff === 'custom') return { start: 1, end: (this.importedCampaignPack && this.importedCampaignPack.levels ? this.importedCampaignPack.levels.length : 1), cls: 'custom', label: (this.importedCampaignName || '自制关卡') };
        if (diff === 'easy') return { start: 1, end: 29, cls: 'easy', label: '简单（1-29）' };
        if (diff === 'normal') return { start: 30, end: 53, cls: 'normal', label: '普通（30-53）' };
        if (diff === 'hard') return { start: 54, end: 69, cls: 'hard', label: '困难（54-69）' };
        if (diff === 'fraction') return { start: 2, end: 20, cls: 'fraction', label: '分数关（1/2-1/20）' };
        if (diff === 'expert') return { start: 70, end: 81, cls: 'expert', label: '专家（70-81）' };
        return { start: 82, end: 90, cls: 'unsolvable', label: '无解（82-90）' };
    }
;

// refreshUnsovableDifficultyVisibility
    UIController.prototype.refreshUnsovableDifficultyVisibility = function() {
        const grid = document.getElementById('campaign-difficulty-grid');
        if (!grid) return;
        const cleared = this.getCampaignClearedMax();
        const fractionCleared = (typeof this.getCampaignFractionClearedMax === 'function')
            ? this.getCampaignFractionClearedMax() : 0;
        const fractionBtn = document.getElementById('campaign-diff-fraction');
        const unsolvableBtn = document.getElementById('campaign-diff-unsolvable');
        // 分数系列关卡需在通关全部"简单"难度（1-29）后才解锁入口
        const easyEnd = (typeof this.getDifficultyRange === 'function') ? this.getDifficultyRange('easy').end : 29;
        const showFraction = fractionCleared >= 1 || cleared >= easyEnd;
        const showUnsolvable = cleared >= 81;
        if (fractionBtn) fractionBtn.style.display = showFraction ? '' : 'none';
        if (unsolvableBtn) unsolvableBtn.style.display = showUnsolvable ? '' : 'none';
        const customBtn = document.getElementById('campaign-diff-custom');
        if (customBtn) {
            customBtn.style.display = this.importedCampaignPack ? '' : 'none';
        }
        let visibleCount = 4; // easy / normal / hard / expert 始终可见
        if (showFraction) visibleCount++;
        if (showUnsolvable) visibleCount++;
        if (this.importedCampaignPack) visibleCount++; // 自定义关卡入口
        grid.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;
    }
;

// adjustRange
    UIController.prototype.adjustRange = function(step) {
        const newRange = this.gridSystem.range + step;
        // 严格限制在最小值和最大值之间
        const clampedRange = Math.max(
            this.gridSystem.minRange,
            Math.min(newRange, this.gridSystem.maxRange)
        );
        
        if (clampedRange !== this.gridSystem.range) {
            this.gridSystem.range = clampedRange;
            this.gridSystem.gridSize = clampedRange * 2;
            requestAnimationFrame(() => this.gridSystem.resize());
        }
        return this.gridSystem.range;
    }
;




// showMessage
    UIController.prototype.showMessage = function(message, type = 'info') {
        // 清除上一条消息可能残留的渐隐定时器（避免连续提示互相干扰，#24 移除死字段 messageTimeout）
        if (this.messageElement && this.messageElement._msgFade) {
            clearInterval(this.messageElement._msgFade);
            this.messageElement._msgFade = null;
        }

        // 手机端（≤767px）：维持单条消息替换显示；电脑端 + pad：终端式堆叠，新消息在最下、旧消息上移，最多近 3 条
        const isMobile = window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : false;
        let msgEl;
        if (isMobile) {
            // 若此前在桌面端已把 #message 从面板移除（堆叠用），先清空面板并放回，恢复单条模式
            if (this.messagePanel && this.messageElement && !this.messageElement.parentNode) {
                this.clearAllMessages();
                this.messagePanel.appendChild(this.messageElement);
            }
            msgEl = this.messageElement;
            msgEl.textContent = message;
            msgEl.style.opacity = '1';
            // #27：移动端单条模式复用同一元素，需先复位上一条的类型 class（桌面分支已在创建时设好）
            msgEl.className = 'message';
        } else {
            msgEl = document.createElement('div');
            msgEl.className = 'message';
            msgEl.textContent = message;
            msgEl.style.opacity = '1';
            if (this.messagePanel) {
                // 首次消息时移除初始的空 #message 占位行，避免堆叠残留空行
                if (this.messageElement && !this.messageElement.textContent && this.messagePanel.children.length <= 1) {
                    this.messageElement.remove();
                }
                // 新消息追加在最后 → 出现在面板最下方（贴左下角），旧消息自然上移
                this.messagePanel.appendChild(msgEl);
            }
            // 最多保留近 3 条（含当前），超出移除最旧的一条（并取消其待执行定时器）
            if (this.messagePanel) {
                while (this.messagePanel.children.length > 3) {
                    const oldest = this.messagePanel.firstElementChild;
                    if (oldest._msgTimer) clearTimeout(oldest._msgTimer);
                    if (oldest._msgFade) clearInterval(oldest._msgFade);
                    oldest.remove();
                }
            }
        }

        // 显示消息容器并设置样式（className 已在各分支设好，此处不再重复）
        if (this.messagePanel) this.messagePanel.classList.add('visible');
        if (type === 'error') {
            msgEl.classList.add('error');
        } else if (type === 'success') {
            msgEl.classList.add('success');
        }

        // 错误/警告类消息停留更久（便于用户读完），普通信息 2 秒后渐隐
        const duration = (type === 'error' || type === 'warning') ? 5000 : 2000;
        const timer = setTimeout(() => {
            this.fadeOutMessage(msgEl);
            msgEl._msgTimer = null;
        }, duration);
        msgEl._msgTimer = timer;
    }
;

// fadeOutMessage
    UIController.prototype.fadeOutMessage = function(msgEl) {
        const el = msgEl || this.messageElement;
        if (!el || !el.parentNode) return;
        let opacity = 1;
        const interval = setInterval(() => {
            opacity -= 0.05;
            if (opacity <= 0) {
                clearInterval(interval);
                if (el._msgFade) el._msgFade = null;
                // 手机端单条消息：清空文字；电脑端堆叠：整行移除
                if (el === this.messageElement) {
                    el.textContent = '';
                    el.className = 'message';
                    el.style.opacity = '1';
                } else {
                    el.remove();
                }
            } else {
                el.style.opacity = opacity.toString();
            }
        }, 50); // 每50ms减少0.05，总共1秒完成渐隐
        el._msgFade = interval;
    }
;

// clearAllMessages
    UIController.prototype.clearAllMessages = function() {
        if (this.messagePanel) {
            Array.from(this.messagePanel.children).forEach(child => {
                if (child._msgTimer) clearTimeout(child._msgTimer);
                if (child._msgFade) clearInterval(child._msgFade);
                if (child !== this.messageElement) child.remove();
            });
        }
        if (this.messageElement) {
            if (this.messageElement._msgTimer) { clearTimeout(this.messageElement._msgTimer); this.messageElement._msgTimer = null; }
            if (this.messageElement._msgFade) { clearInterval(this.messageElement._msgFade); this.messageElement._msgFade = null; }
            this.messageElement.textContent = '';
            this.messageElement.className = 'message';
            this.messageElement.style.opacity = '1';
        }
    }
;

// getDifficultyName
    UIController.prototype.getDifficultyName = function(difficulty) {
        const names = {
            'easy': '简单',
            'normal': '普通',
            'hard': '困难',
            'fraction': '分数关',
            'expert': '专家',
            'unsolvable': '无解',
            'test': '测试'
        };
        return names[difficulty] || difficulty;
    }
;

// getFunctionTypeName
    UIController.prototype.getFunctionTypeName = function(type) {
        const names = {
            'constant': '常值函数',
            'degree_1': '一次函数',
            'degree_2': '二次函数',
            'degree_3': '三次函数',
            'degree_4': '四次及以上',
            'fraction': '分式函数',
            'abs': '绝对值函数',
            'sin': '正弦函数',
            'cos': '余弦函数',
            'tan': '正切函数',
            'ln': '自然对数',
            'sqrt': '根号函数',
            'factorial': '阶乘函数',
            'euler': '欧拉公式'
        };
        return names[type] || type;
    }
;

// _makeDraggable
// 让常驻浮层（房间状态条 / 观战条 / P2P 等待回执条）可拖动，避免其固定在
// 顶部/底部时遮挡游戏内回合信息等关键内容。拖动后的位置用 localStorage 持久化。
UIController.prototype._makeDraggable = function(el) {
    if (!el || el._dragBound) return;
    el._dragBound = true;
    const KEY = 'dragpos:' + (el.id || 'banner');

    // 恢复上次保存的位置
    try {
        const saved = localStorage.getItem(KEY);
        if (saved) {
            const p = JSON.parse(saved);
            if (typeof p.left === 'number' && typeof p.top === 'number') {
                el.style.left = p.left + 'px';
                el.style.top = p.top + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                el.style.transform = 'none';
            }
        }
    } catch (e) {}

    let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;
    const pointFrom = (e) => (e.touches ? e.touches[0] : e);

    const onDown = (e) => {
        // 交互元素（按钮/开关/链接）不触发拖动
        if (e.target.closest && e.target.closest('button, input, label, a, .btn')) return;
        if (e.button !== undefined && e.button !== 0 && !e.touches) return; // 仅左键/触摸
        const pt = pointFrom(e);
        const rect = el.getBoundingClientRect();
        // 改为用 left/top 接管定位（覆盖 CSS 的居中 transform）
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        originLeft = rect.left;
        originTop = rect.top;
        startX = pt.clientX;
        startY = pt.clientY;
        dragging = true;
        el.classList.add('dragging');
        if (el.setPointerCapture && e.pointerId !== undefined) {
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
        }
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!dragging) return;
        const pt = pointFrom(e);
        let nl = originLeft + (pt.clientX - startX);
        let nt = originTop + (pt.clientY - startY);
        const w = el.offsetWidth, h = el.offsetHeight;
        nl = Math.max(0, Math.min(nl, window.innerWidth - w));
        nt = Math.max(0, Math.min(nt, window.innerHeight - h));
        el.style.left = nl + 'px';
        el.style.top = nt + 'px';
        if (e.cancelable) e.preventDefault();
    };

    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('dragging');
        try {
            localStorage.setItem(KEY, JSON.stringify({
                left: parseFloat(el.style.left) || 0,
                top: parseFloat(el.style.top) || 0
            }));
        } catch (e2) {}
    };

    if (window.PointerEvent) {
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
    } else {
        el.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }
};


