class AudioManager {
    constructor() {
        this.enabled = true;
        this.masterVolume = 0.6;
        
        // 本地音效文件目录（优先使用，对 file:// 协议友好，无需网络）
        this.localBaseUrl = "sounds/";
        // CDN 备用音效资源库（源自 ion-sound，本地文件不可用时回退）
        this.baseUrl = 'https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/';
        
        // 映射所有的动作音效
        this.sounds = {
            click: 'snap.mp3',              // 常规点击：清脆的响板/啪声
            elementClick: 'button_push.mp3', // 元素操作：实体按钮按下的声音
            tick: 'tap.mp3',                // 倒计时：滴答声
            error: 'computer_error.mp3',    // 失败/错误：经典的电脑错误提示音
            success: 'glass.mp3',           // 命中成功：清脆悦耳的玻璃杯碰杯声
            win: 'door_bell.mp3',           // 获胜：清脆上扬的门铃叮咚声
            phaseChange: 'water_droplet.mp3'// 切换：水滴声
        };
        
        // 性能优化：改用 Web Audio API（去掉 HTML Audio 元素的天生延迟）
        // Web Audio API 将音效预加载为 AudioBuffer 存入内存，播放时直接读内存、几乎零延迟
        this.audioCtx = null;
        this.buffers = {};        // key -> AudioBuffer（全部预加载完毕后存入）
        this.isLoaded = false;
        
        // 浏览器要求必须先有用户交互才能创建 AudioContext
        // 注册一次性事件，首次交互时自动初始化并预加载所有音效
        this._boundInit = this._initAudioContext.bind(this);
        document.addEventListener('click', this._boundInit, { once: true });
        document.addEventListener('keydown', this._boundInit, { once: true });
    }
    
    /**
     * 首次用户交互时初始化 AudioContext 并预加载所有音效
     */
    _initAudioContext() {
        if (this.audioCtx) return;
        
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[Audio] AudioContext 已创建，开始预加载音效...');
            this._loadAllSounds();
        } catch (e) {
            console.warn('[Audio] Web Audio API 不可用，降级为 HTML Audio', e);
            this._initFallback();
        }
    }
    
    /**
     * 并行预加载所有音效为 AudioBuffer（存入内存，播放时零延迟）
     * 优先使用本地文件（对 file:// 协议友好），CDN 作为备用
     */
    async _loadAllSounds() {
        const tryFetch = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        };
        
        const promises = Object.entries(this.sounds).map(async ([key, filename]) => {
            // 优先尝试本地文件
            try {
                const response = await tryFetch(this.localBaseUrl + filename);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                this.buffers[key] = audioBuffer;
                return;
            } catch (e) {
                console.log(`[Audio] 本地加载失败，尝试 CDN: ${filename}`);
            }
            // 回退到 CDN
            try {
                const response = await tryFetch(this.baseUrl + filename);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                this.buffers[key] = audioBuffer;
            } catch (e) {
                console.warn(`[Audio] 加载音效失败: ${filename}`, e);
            }
        });
        
        await Promise.all(promises);
        this.isLoaded = true;
        const loadedCount = Object.keys(this.buffers).length;
        console.log(`[Audio] 音效预加载完毕（${loadedCount}/${Object.keys(this.sounds).length}），播放将不再有延迟`);
    }
    
    /**
     * 降级方案：当 Web Audio API 不可用时，回退为 HTML Audio
     * 优先使用本地文件，加载失败则切换为 CDN
     */
    _initFallback() {
        this.audioPool = {};
        for (const [key, filename] of Object.entries(this.sounds)) {
            const audio = new Audio(this.localBaseUrl + filename);
            audio.preload = 'auto';
            // 本地文件加载失败时回退到 CDN
            audio.addEventListener('error', () => {
                console.log(`[Audio] 本地音频加载失败，切换为 CDN: ${filename}`);
                audio.src = this.baseUrl + filename;
            }, { once: true });
            this.audioPool[key] = audio;
        }
        this.isLoaded = true;
        console.log('[Audio] 已初始化 HTML Audio 备用方案（本地优先）');
    }
    
    /**
     * 核心播放方法
     * 使用 Web Audio API：直接读内存中的 AudioBuffer，几乎零延迟
     * @param {string} key - 音效的标识符
     * @param {number} volume - 个体音量调整 (0.0 到 1.0)
     */
    playSound(key, volume = 1.0) {
        if (!this.enabled) return;
        
        // Web Audio API 路径（首选）
        if (this.audioCtx && this.buffers[key]) {
            try {
                // 自动恢复被浏览器暂停的 AudioContext
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }
                
                // 创建音源节点并直接连接到输出（支持同一音效并发）
                const source = this.audioCtx.createBufferSource();
                source.buffer = this.buffers[key];
                
                const gainNode = this.audioCtx.createGain();
                gainNode.gain.value = this.masterVolume * volume;
                
                source.connect(gainNode);
                gainNode.connect(this.audioCtx.destination);
                source.start(0); // 立即播放，零延迟
            } catch (e) {
                console.error('[Audio] Web Audio 播放异常:', e);
            }
            return;
        }
        
        // 降级方案：使用 HTML Audio
        if (this.audioPool && this.audioPool[key]) {
            try {
                const snd = this.audioPool[key].cloneNode(true);
                snd.volume = this.masterVolume * volume;
                const playPromise = snd.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn('[Audio] HTML Audio 播放被拦截 (需先点击页面):', err);
                    });
                }
                snd.onended = () => snd.remove();
            } catch (e) {
                console.error('[Audio] HTML Audio 播放异常:', e);
            }
        }
    }

    // --- 具体场景接口 ---
    
    // UI 点击
    playClick() {
        this.playSound('click', 0.8);
    }
    
    // 增加/删除公式元素的动作
    playElementClick() {
        this.playSound('elementClick', 0.7);
    }
    
    // 倒计时提示
    playTick() {
        this.playSound('tick', 0.5);
    }
    
    // 错误、扣分或者进入了禁止区
    playError() {
        this.playSound('error', 0.9);
    }
    
    // 击中目标，成功获取分数
    playSuccess() {
        this.playSound('success', 1.0);
    }
    
    // 游戏结束，胜利发放
    playGameWin() {
        this.playSound('win', 1.0);
    }
    
    // 回合或阶段轮转
    playPhaseChange() {
        this.playSound('phaseChange', 0.6);
    }

    // ── Summa 形象交互音效 ──────────────────────────────────────────────
    // 抓取：手指捏住的感觉
    playSummaGrab() {
        this.playSound('elementClick', 0.45);
    }
    // 拖拽移动中（节流后调用）：轻微摩擦感
    playSummaDrag() {
        this.playSound('tick', 0.25);
    }
    // 甩动：合成风声（白噪声 + 扩频带通滤波器高→低扫频）
    playSummaFling() {
        this._playWhoosh(0.65);
    }

    /**
     * 内部：合成风声（扫频白噪声）
     * @param {number} volume
     */
    _playWhoosh(volume = 1.0) {
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const ctx = this.audioCtx;
            const dur = 0.38;

            // 白噪声 buffer
            const sampleCount = Math.ceil(ctx.sampleRate * dur);
            const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

            const source = ctx.createBufferSource();
            source.buffer = noiseBuf;

            // 带通滤波器：1400Hz→220Hz 扩频 —— 产生破风感
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur);
            filter.Q.value = 0.75;

            // 包络：快起 / 滑衰
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(this.masterVolume * volume, ctx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start(ctx.currentTime);
            source.stop(ctx.currentTime + dur + 0.01);
        } catch (e) {
            console.warn('[Audio] 风声合成失败:', e);
        }
    }
    // 抛出松手：轻柔的水滴飞出声
    playSummaThrow() {
        this.playSound('phaseChange', 0.45);
    }
}

// 挂载到全局
window.audioManager = new AudioManager();
