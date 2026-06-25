/**
 * ResponsiveLayout - 响应式布局管理器
 * 自动检测设备类型并调整布局
 */
class ResponsiveLayout {
    constructor() {
        // 设备类型
        this.DEVICE = {
            DESKTOP: 'desktop',
            TABLET: 'tablet',
            MOBILE: 'mobile'
        };
        
        // 当前设备
        this.currentDevice = null;
        
        // 断点配置
        this.breakpoints = {
            desktop: 1024,
            tablet: 768
        };
        
        // 初始化
        this.init();
    }
    
    /**
     * 检测设备类型
     */
    detectDevice() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        if (width >= this.breakpoints.desktop) {
            return this.DEVICE.DESKTOP;
        } else if (width >= this.breakpoints.tablet) {
            // 平板需要考虑横竖屏
            if (width > height && width >= 1024) {
                return this.DEVICE.DESKTOP;
            }
            return this.DEVICE.TABLET;
        }
        return this.DEVICE.MOBILE;
    }
    
    /**
     * 初始化
     */
    init() {
        // 初始检测
        this.updateLayout();
        
        // 监听窗口变化
        window.addEventListener('resize', this.debounce(() => {
            this.updateLayout();
        }, 150));
        
        // 监听屏幕方向变化（移动设备）
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.updateLayout(), 100);
        });
        
        console.log('[ResponsiveLayout] 已初始化');
    }
    
    /**
     * 防抖
     */
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    /**
     * 更新布局
     */
    updateLayout() {
        const newDevice = this.detectDevice();
        
        if (newDevice !== this.currentDevice) {
            this.currentDevice = newDevice;
            this.applyLayout();
            this.onDeviceChange(newDevice);
        }
        
        // 每次都重新调整 canvas 大小
        this.resizeCanvas();
    }
    
    /**
     * 应用布局
     */
    applyLayout() {
        // 移除旧的设备类
        document.body.classList.remove('device-desktop', 'device-tablet', 'device-mobile');
        
        // 添加新的设备类
        document.body.classList.add(`device-${this.currentDevice}`);
        
        console.log(`[ResponsiveLayout] 设备切换为: ${this.currentDevice}`);
    }
    
    /**
     * 设备变化回调（子类可重写）
     */
    onDeviceChange(device) {
        // 发布事件供其他模块监听
        window.dispatchEvent(new CustomEvent('devicechange', { 
            detail: { device } 
        }));
    }
    
    /**
     * 调整 Canvas 大小
     */
    resizeCanvas() {
        const canvas = document.getElementById('game-canvas');
        const canvasSection = document.querySelector('.canvas-section');
        
        if (!canvas || !canvasSection) return;
        
        // 获取 Canvas 渲染器实例（如果有）
        if (window.gameRenderer) {
            window.gameRenderer.resize();
        }
    }
    
    /**
     * 获取当前设备
     */
    getDevice() {
        return this.currentDevice;
    }
    
    /**
     * 是否是移动设备
     */
    isMobile() {
        return this.currentDevice === this.DEVICE.MOBILE;
    }
    
    /**
     * 是否是平板设备
     */
    isTablet() {
        return this.currentDevice === this.DEVICE.TABLET;
    }
    
    /**
     * 是否是桌面设备
     */
    isDesktop() {
        return this.currentDevice === this.DEVICE.DESKTOP;
    }
    
    /**
     * 获取屏幕尺寸信息
     */
    getScreenInfo() {
        return {
            device: this.currentDevice,
            width: window.innerWidth,
            height: window.innerHeight,
            isLandscape: window.innerWidth > window.innerHeight
        };
    }
}

// 创建全局实例
window.responsiveLayout = new ResponsiveLayout();
