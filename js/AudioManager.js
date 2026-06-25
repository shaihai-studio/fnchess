class AudioManager {
    constructor() {
        this.enabled = true;
        this.masterVolume = 0.6;
        
        // 本地音效文件目录
        this.localBaseUrl = "sounds/";
        
        // 映射所有的动作音效
        this.sounds = {
            click: 'snap.mp3',
            elementClick: 'button_push.mp3',
            tick: 'tap.mp3',
            error: 'computer_error.mp3',
            success: 'glass.mp3',
            win: 'door_bell.mp3',
            phaseChange: 'water_droplet.mp3'
        };
        
        // 使用纯 HTML Audio 元素（兼容 file:// 协议）
        this._audioPool = {};
        this.isLoaded = false;
        
        // 预加载所有音效
        this._preloadAllSounds();
        
        // 尝试初始化 Web Audio API（用于合成音效）
        this._audioCtx = null;
        this._initWebAudio();
    }
    
    /**
     * 尝试初始化 Web Audio API（用于风声合成）
     */
    _initWebAudio() {
        try {
            const AudioCtx = window.AudioContext || window['webkitAudioContext'];
            this._audioCtx = AudioCtx ? new AudioCtx() : null;
            console.log('[Audio] Web Audio API 已就绪');
        } catch (e) {
            console.log('[Audio] Web Audio API 不可用，风声合成将跳过');
        }
    }
    
    /**
     * 预加载所有音效 - 使用纯 HTML Audio 元素
     * 兼容 file:// 协议
     */
    _preloadAllSounds() {
        for (const [key, filename] of Object.entries(this.sounds)) {
            const audio = new Audio();
            audio.src = this.localBaseUrl + filename;
            audio.preload = 'auto';
            this._audioPool[key] = audio;
        }
        
        this.isLoaded = true;
        console.log(`[Audio] HTML Audio 元素已创建 (${Object.keys(this.sounds).length} 个音效)`);
    }
    
    /**
     * 核心播放方法 - 使用 HTML Audio 元素
     */
    playSound(key, volume = 1.0) {
        if (!this.enabled) return;
        
        if (this._audioPool && this._audioPool[key]) {
            try {
                const snd = this._audioPool[key].cloneNode(true);
                snd.volume = this.masterVolume * volume;
                snd.play().catch(() => {}); // 忽略自动播放被阻止
                snd.onended = () => snd.remove();
            } catch (e) {
                console.warn('[Audio] 播放异常:', e);
            }
        }
    }

    // --- 具体场景接口 ---
    playClick() { this.playSound('click', 0.8); }
    playElementClick() { this.playSound('elementClick', 0.7); }
    playTick() { this.playSound('tick', 0.5); }
    playError() { this.playSound('error', 0.9); }
    playSuccess() { this.playSound('success', 1.0); }
    playGameWin() { this.playSound('win', 1.0); }
    playPhaseChange() { this.playSound('phaseChange', 0.6); }
    playSummaGrab() { this.playSound('elementClick', 0.45); }
    playSummaDrag() { this.playSound('tick', 0.25); }
    playSummaThrow() { this.playSound('phaseChange', 0.45); }

    // Undertale 风格文本音：适合女生角色的轻柔高音 blip
    playSummaTalkBlip(options = {}) {
        const ctx = this._audioCtx;
        if (!ctx) return;
        try {
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const {
                baseFrequency = 640,
                intensity = 1,
                pitchShift = 0,
                duration = 0.045,
                waveType = 'square'
            } = options;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = waveType;
            const startFreq = Math.max(120, baseFrequency + pitchShift + (Math.random() * 16 - 8));
            const endFreq = Math.max(120, baseFrequency - 24 + pitchShift + (Math.random() * 12 - 6));
            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

            filter.type = 'highpass';
            filter.frequency.setValueAtTime(420, now);
            filter.Q.value = 0.9;

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(this.masterVolume * 0.045 * intensity, now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + duration + 0.005);
        } catch (e) {
            console.warn('[Audio] Summa talk blip 失败:', e);
        }
    }

    playSummaTalkSequence(text = '', mood = 'neutral', onChar = null) {
        const src = String(text || '');
        if (!src) return;

        const moodMap = {
            happy: { base: 700, spread: 42, delay: 0.08, waveType: 'triangle' },
            surprised: { base: 720, spread: 50, delay: 0.08, waveType: 'square' },
            angry: { base: 600, spread: 30, delay: 0.08, waveType: 'sawtooth' },
            sad: { base: 560, spread: 26, delay: 0.08, waveType: 'triangle' },
            thinking: { base: 620, spread: 24, delay: 0.08, waveType: 'square' },
            determined: { base: 650, spread: 22, delay: 0.08, waveType: 'square' },
            smug: { base: 670, spread: 18, delay: 0.08, waveType: 'square' },
            neutral: { base: 640, spread: 28, delay: 0.08, waveType: 'square' }
        };
        const voice = moodMap[mood] || moodMap.neutral;

        const chars = [...src];
        let delay = 0.5;
        for (const ch of chars) {
            if (/\s/.test(ch)) {
                // 空格也触发回调，用于同步显示
                if (onChar) {
                    const currentDelay = delay;
                    setTimeout(() => onChar(ch), currentDelay * 1000);
                }
                delay += 0.05;
                continue;
            }
            const punctuationBoost = /[，。！？!?]/.test(ch) ? 1.35 : /[,.]/.test(ch) ? 0.88 : 1.0;
            const pitchShift = /[，。！？!?]/.test(ch) ? -14 : /[,.]/.test(ch) ? -6 : 0;
            const charDelay = delay;
            setTimeout(() => {
                this.playSummaTalkBlip({
                    baseFrequency: voice.base + (Math.random() * voice.spread - voice.spread / 2),
                    intensity: punctuationBoost,
                    pitchShift,
                    duration: /[，。！？!?]/.test(ch) ? 0.055 : 0.045,
                    waveType: voice.waveType
                });
                if (onChar) onChar(ch);
            }, charDelay * 1000);
            delay += voice.delay + (/[，。！？!?]/.test(ch) ? 0.05 : 0);
        }
    }
    
    // 甩动：风声合成
    playSummaFling() {
        const ctx = this._audioCtx;
        if (!ctx) return;
        
        try {
            if (ctx.state === 'suspended') ctx.resume();
            const dur = 0.38;
            
            // 白噪声
            const sampleCount = Math.ceil(ctx.sampleRate * dur);
            const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;
            
            const source = ctx.createBufferSource();
            source.buffer = noiseBuf;
            
            // 带通滤波器
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur);
            filter.Q.value = 0.75;
            
            // 包络
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(this.masterVolume * 0.65, ctx.currentTime + 0.03);
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
}

// 挂载到全局
window.audioManager = new AudioManager();
