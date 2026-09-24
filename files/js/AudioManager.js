class AudioManager {
    constructor() {
        this.enabled = true;
        this.masterVolume = 1.0;
        this.sfxVolume = 1.0;
        this.bgmVolume = 0.33;
        // #11：原 3.2 会把 sfxVolume*volume 放大后全部 Math.min 到 1，
        // 抹平音效层级且使滑杆仅 <31% 区间有区分度。降为 1.0 让滑杆与 volume 参数生效。
        this.sfxBoost = 1.0;
        this.bgmEnabled = true;
        
        // 本地音效文件目录
        this.localBaseUrl = "files/sounds/";
        this.bgmBaseUrl = "files/bgm/";
        
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
        this.syntheticSounds = new Set(['raceLaunch', 'raceCountdown', 'raceBeep', 'raceAlert', 'raceFinish', 'raceFanfare']);
        
        // 背景音乐列表：把音频文件放到 `函数棋 10.0/bgm/` 下即可自动随机播放
        this.bgmTracks = [
            'bgm1.mp3',
            'bgm2.mp3',
            'bgm3.mp3',
            'bgm4.mp3',
            'bgm5.mp3',
            'bgm6.mp3'
        ];
        this._bgmPlaylist = [];
        this._currentBgmIndex = -1;
        this._bgmAudio = null;
        this._bgmStarted = false;
        
        // 使用纯 HTML Audio 元素（兼容 file:// 协议）
        this._audioPool = {};
        this.isLoaded = false;
        
        // 预加载所有音效
        this._preloadAllSounds();
        this._initBgmPlayer();

        // 页面加载 1 秒后主动开始播放（绑定交互回退作为兜底）
        this._bindBgmUnlock();
        setTimeout(() => this.startBgm(), 1000);
        
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

    _initBgmPlayer() {
        this._bgmPlaylist = [...this.bgmTracks].filter(Boolean);
        if (this._bgmPlaylist.length === 0) return;

        if (!this._bgmAudio) {
            this._bgmAudio = new Audio();
            this._bgmAudio.preload = 'auto';
            this._bgmAudio.loop = false;
            this._bgmAudio.volume = this.masterVolume * this.bgmVolume;
            this._bgmAudio.addEventListener('ended', () => this._playNextBgm());
            this._bgmAudio.addEventListener('error', () => this._playNextBgm(true));
        }
    }
    
    /**
     * 核心播放方法 - 使用 HTML Audio 元素
     */
    playSound(key, volume = 1.0) {
        if (!this.enabled) return;
        if (this.syntheticSounds?.has(key)) {
            this.playSyntheticRaceSound(key, volume);
            return;
        }
        if (this._audioPool && this._audioPool[key]) {
            try {
                const snd = this._audioPool[key].cloneNode(true);
                snd.volume = this._sfxGain(volume);
                snd.play().catch(() => {});
                snd.onended = () => snd.remove();
            } catch (e) {
                console.warn('[Audio] 播放异常:', e);
            }
        }
    }

    /**
     * 统一计算音效增益：主音量 × 音效音量 × 补偿增益 × 单音 volume 参数，钳到 [0,1]。
     * 集中处理避免 4 处手写 Math.min 重复（#11 修复点统一在此）。
     */
    _sfxGain(volume = 1.0) {
        return Math.min(1, this.masterVolume * this.sfxVolume * this.sfxBoost * volume);
    }

    _pickRandomBgmIndex(excludeIndex = -1) {
        if (!this._bgmPlaylist.length) return -1;
        if (this._bgmPlaylist.length === 1) return 0;

        let nextIndex = excludeIndex;
        let guard = 0;
        while (nextIndex === excludeIndex && guard < 20) {
            nextIndex = Math.floor(Math.random() * this._bgmPlaylist.length);
            guard++;
        }
        return nextIndex;
    }

    _playNextBgm(forceSkipBroken = false) {
        if (!this.bgmEnabled || !this._bgmAudio || this._bgmPlaylist.length === 0) return;

        if (forceSkipBroken && this._currentBgmIndex >= 0 && this._currentBgmIndex < this._bgmPlaylist.length) {
            this._bgmPlaylist.splice(this._currentBgmIndex, 1);
            this._currentBgmIndex = -1;
            if (this._bgmPlaylist.length === 0) return;
        }

        const nextIndex = this._pickRandomBgmIndex(this._currentBgmIndex);
        if (nextIndex < 0) return;
        this._currentBgmIndex = nextIndex;
        this._bgmAudio.src = this.bgmBaseUrl + this._bgmPlaylist[nextIndex];
        this._bgmAudio.volume = this.masterVolume * this.bgmVolume;
        this._bgmAudio.play().catch(() => {
            // 用户未交互前可能被浏览器拦截，后续交互时会自动恢复
        });
    }

    _bindBgmUnlock() {
        const unlock = () => {
            this.startBgm();
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            window.removeEventListener('click', unlock, true);
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        window.addEventListener('click', unlock, true);
    }

    startBgm() {
        if (!this.bgmEnabled) return;
        if (this._bgmStarted && this._bgmAudio && !this._bgmAudio.paused) return;
        this._bgmStarted = true;

        // 尝试 resume AudioContext（部分浏览器要求 context 被 resume 后才允许 HTMLAudioElement play）
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
            this._audioCtx.resume().catch(() => {});
        }

        if (!this._bgmAudio) this._initBgmPlayer();
        if (this._bgmAudio) {
            this._playNextBgm();
        }
    }

    stopBgm() {
        this._bgmStarted = false;
        if (this._bgmAudio) {
            this._bgmAudio.pause();
            this._bgmAudio.currentTime = 0;
        }
    }

    setBgmEnabled(enabled) {
        this.bgmEnabled = !!enabled;
        if (!this.bgmEnabled) {
            this.stopBgm();
        } else {
            this.startBgm();
        }
    }

    setBgmVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume)));
        this.bgmVolume = v;
        if (this._bgmAudio) this._bgmAudio.volume = v;
    }

    setSfxVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume)));
        this.sfxVolume = v;
    }

    // #12：实现主音量控制（此前 masterVolume 为死字段，全库未使用）
    setMasterVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume)));
        this.masterVolume = v;
        if (this._bgmAudio) this._bgmAudio.volume = this.masterVolume * this.bgmVolume;
    }

    playSyntheticRaceSound(key, volume = 1.0) {
        const ctx = this._audioCtx;
        if (!ctx) return;
        try {
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const master = this._sfxGain(volume);
            const out = ctx.createGain();
            out.gain.value = master;
            out.connect(ctx.destination);

            const makeTone = (type, start, end, dur, gainValue, filterFreq) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                const f = ctx.createBiquadFilter();
                osc.type = type;
                osc.frequency.setValueAtTime(start, now);
                osc.frequency.exponentialRampToValueAtTime(end, now + dur);
                f.type = 'bandpass';
                f.frequency.setValueAtTime(filterFreq, now);
                f.Q.value = 0.7;
                g.gain.setValueAtTime(0.0001, now);
                g.gain.linearRampToValueAtTime(gainValue, now + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                osc.connect(f); f.connect(g); g.connect(out);
                osc.start(now); osc.stop(now + dur + 0.01);
            };

            if (key === 'raceCountdown') {
                makeTone('square', 760, 620, 0.08, 0.18, 2000);
            } else if (key === 'raceBeep') {
                makeTone('sine', 980, 980, 0.05, 0.12, 2000);
            } else if (key === 'raceAlert') {
                makeTone('triangle', 640, 880, 0.12, 0.16, 2000);
            } else if (key === 'raceFinish') {
                makeTone('sawtooth', 520, 980, 0.16, 0.20, 2000);
                makeTone('sine', 1320, 990, 0.09, 0.10, 2400);
            } else if (key === 'raceFanfare') {
                makeTone('triangle', 660, 880, 0.12, 0.16, 2000);
                setTimeout(() => makeTone('triangle', 880, 1170, 0.12, 0.14, 2000), 90);
                setTimeout(() => makeTone('triangle', 1170, 1480, 0.16, 0.12, 2000), 180);
            } else if (key === 'raceLaunch') {
                makeTone('sawtooth', 220, 660, 0.18, 0.22, 2000);
                setTimeout(() => makeTone('square', 660, 1100, 0.08, 0.10, 2000), 120);
            }
        } catch (e) {
            console.warn('[Audio] 合成竞速音效失败:', e);
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
    playSummaThrow() { this.playSound('phaseChange', 0.45); }
    playRaceCountdown() { this.playSound('raceCountdown', 0.95); }
    playRaceBeep() { this.playSound('raceBeep', 0.9); }
    playRaceAlert() { this.playSound('raceAlert', 0.9); }
    playRaceFinish() { this.playSound('raceFinish', 1.0); }
    playRaceFanfare() { this.playSound('raceFanfare', 1.0); }
    playRaceLaunch() { this.playSound('raceLaunch', 1.0); }

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
            gain.gain.linearRampToValueAtTime(this._sfxGain(0.045 * intensity), now + 0.004);
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
            gain.gain.linearRampToValueAtTime(this._sfxGain(0.65), ctx.currentTime + 0.03);
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
