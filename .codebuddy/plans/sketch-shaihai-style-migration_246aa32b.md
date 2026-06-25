---
name: sketch-shaihai-style-migration
overview: 将函数棋CSS风格迁移为Shaihai主站设计语言：引入SmileySans得意黑字体、调整配色为紫靛色调、增强毛玻璃拟态、添加按钮光流和涟漪特效。
design:
  architecture:
    framework: html
  styleKeywords:
    - 紫调深邃
    - 毛玻璃精致
    - 光效细腻
    - 科技感
  fontSystem:
    fontFamily: SmileySans, PingFang SC, Microsoft YaHei, sans-serif
    heading:
      size: 32px
      weight: 700
    subheading:
      size: 18px
      weight: 600
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#a78bfa"
      - "#818cf8"
      - "#22c55e"
    background:
      - "#1a0a2e"
      - "#211833"
      - "#1a1028"
    text:
      - "#f0f0ff"
      - "#e5e7eb"
      - "#94a3b8"
    functional:
      - "#22c55e"
      - "#ef4444"
      - "#f59e0b"
      - "#a78bfa"
todos:
  - id: add-font-face
    content: 在 style.css 顶部添加 @font-face 声明，引用 fonts/ 中的 SmileySans 字体
    status: completed
  - id: update-body-colors
    content: 修改 body 的 font-family 和背景渐变，将配色基调向紫色系迁移
    status: completed
    dependencies:
      - add-font-face
  - id: enhance-glassmorphism
    content: 为 .panel-card、.header、.canvas-section、.modal-content 添加 ::before 顶部渐变高光，提升 blur 强度，微调边框颜色
    status: completed
    dependencies:
      - update-body-colors
  - id: add-button-light-sweep
    content: 为 .btn、.btn-primary、.btn-secondary、.btn-exit、.mode-btn 添加 ::after 光流扫过伪元素动画
    status: completed
    dependencies:
      - update-body-colors
  - id: add-ripple-css-and-js
    content: 新增 .ripple CSS 类和 @keyframes rippleAnim；在 index.html 底部追加涟漪初始化脚本
    status: completed
    dependencies:
      - add-button-light-sweep
  - id: fine-tune-colors
    content: 微调 game-title 渐变、hover 阴影色、按钮激活态颜色，使其整体更协调
    status: completed
    dependencies:
      - enhance-glassmorphism
---

## 产品概述

为"函数棋 8.0max"游戏页面提供一套全新的视觉风格方案，模仿 Shaihai 主站的视觉设计语言，应用于现有游戏 UI。

## 核心功能

- **字体升级**：引入得意黑字体（SmileySans）替换系统默认字体
- **配色基调迁移**：从当前绿蓝色系向紫罗兰/靛紫色系迁移，整体氛围更梦幻深邃
- **毛玻璃增强**：所有玻璃面板增加伪元素（::before/::after）顶部渐变高光边框，提升层次感和精致度
- **按钮光流扫过效果**：按钮悬停时出现一道光从左向右扫过（light sweep animation）
- **涟漪点击效果**：点击按钮时产生圆形涟漪扩散动画

## 技术栈选型

- **CSS3**：纯 CSS 实现字体集成、配色、毛玻璃增强、光流动画
- **JavaScript (ES6)**：为涟漪点击效果添加少量 JS（复用现有代码模式）
- **字体**：SmileySans (得意黑) - 已存在于 fonts/ 目录

## 实现方案

### 总体策略

仅修改 `css/style.css` 文件（现有约 1625 行）实现所有视觉变更。涟漪点击效果的 JS 部分以简洁的 IIFE 形式内嵌于 `index.html`（参考 Shaihai 的 `<script>` 模式），或附加到现有 JS 初始化逻辑中。

### 关键设计决策

| 决策项 | 方案 | 理由 |
| --- | --- | --- |
| 字体路径 | `../fonts/SmileySans-Oblique.otf.woff2` | CSS 在 css/ 目录，字体在 fonts/ 目录 |
| 配色迁移 | 保留深色渐变基调，调高紫色/靛蓝分量 | 在不破坏游戏视觉层次的前提下贴近 Shaihai 风格 |
| 毛玻璃增强 | 使用伪元素 + linear-gradient 高光 | 纯 CSS 实现，零 JS 开销，复用 Shaihai 已验证的模式 |
| 按钮光流 | `::after` + `left: -100% → 100%` | 与 Shaihai 完全一致，零额外开销 |
| 涟漪效果 | CSS 定义 .ripple 类+动画；JS 少量代码动态创建 ripple 元素 | 涟漪需要 JS 创建 DOM 元素，但全部逻辑简洁可控 |


## 执行细节

### 性能考虑

- 所有新增特效均为 CSS GPU 加速（will-change / transform / opacity 动画），不影响游戏主循环帧率
- 光流和涟漪只在用户交互时触发，无持续开销
- 无需新增网络请求（字体已本地存在，使用 font-display: swap 确保加载期间文本可见）

### 防回归措施

- 不改动任何 HTML class 名称，只扩展或覆盖已有选择器的样式属性
- 不改动任何 JS 业务逻辑，涟漪 JS 独立新增，不影响现有事件
- 新增 CSS 规则放在文件末尾，避免意外覆盖关键布局属性
- 保留现有响应式断点，仅微调颜色/间距类属性

## 目录结构

```
c:/Users/admin/Desktop/函数棋 8.0max/
├── css/
│   └── style.css              # [MODIFY] 主要修改文件。新增 @font-face、配色变量、毛玻璃伪元素、光流按钮、涟漪动画
├── index.html                  # [MODIFY] 仅在底部 script 区域追加涟漪初始化代码（约 15 行 IIFE）
└── fonts/                      # [EXISTING] 得意黑字体文件，无需修改
```

## 关键 CSS 结构

### 字体定义

```css
@font-face {
    font-family: 'SmileySans';
    src: url('../fonts/SmileySans-Oblique.otf.woff2') format('woff2'),
         url('../fonts/SmileySans-Oblique.ttf.woff2') format('woff2');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
```

### 按钮光流伪元素

```css
/* 应用到 .btn, .btn-primary, .btn-secondary, .btn-exit, .mode-btn 等 */
.btn {
    position: relative;
    overflow: hidden;
}
.btn::after {
    content: '';
    position: absolute;
    top: 0; left: -100%;
    width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
    transition: left 0.6s ease;
    pointer-events: none;
}
.btn:hover::after {
    left: 100%;
}
```

### 涟漪效果

```css
.ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    transform: scale(0);
    animation: rippleAnim 0.6s ease-out forwards;
    pointer-events: none;
}
@keyframes rippleAnim {
    to { transform: scale(4); opacity: 0; }
}
```

## 设计方向

整体沿用函数棋现有的深色太空基调，但将色彩重心从绿蓝色系转移到紫色/靛蓝色系，营造类似 Shaihai 主站的梦幻深邃感。保持游戏 UI 的清晰可读性和功能层级，不改变布局结构。

## 设计风格关键词

紫色深邃、毛玻璃精致、光效细腻、科技感

## 页面改造详述

由于采用"中量级优化"，不修改 HTML 结构、不新增背景装饰元素，所有变化体现在视觉风格升级上：

### 1. 全局字体

- 引入得意黑（SmileySans）作为正文字体，替换 Segoe UI
- 等宽字体（.expression-display, .timer-value 等）保留 Courier New 不变

### 2. 配色迁移

- Body 背景渐变：从 `#020617 → #0f172a → #1e1b4b` 微调为 `#1a0a2e → #211833 → #1a1028`（加入更多紫色分量）
- 主色调迁移：绿色主题色（#22c55e）保留作为强调色，新增紫色系列作为辅助强调色（#a78bfa / #818cf8）
- .game-title 渐变：从绿色→蓝色改为紫色→紫色渐变（更统一）
- .panel-card / .header 背景：加入紫色调

### 3. 毛玻璃增强

- .panel-card 增加 ::before 伪元素，顶部渐变高光线
- .header 底部边框替换为渐变高光
- .modal-content 增加顶部渐变高光
- .canvas-section 增加顶部渐变高光
- backdrop-filter 强度从 blur(10px) 提升至 blur(20px)
- 边框颜色微调，加入紫色调

### 4. 按钮光流

- .btn, .btn-primary, .btn-secondary, .btn-exit, .mode-btn 均增加 ::after 光流伪元素
- 悬停时光从左向右扫过，过渡时间 0.6s
- 按钮悬停阴影加入紫色光晕分量

### 5. 涟漪效果

- 新增 .ripple 类定义和 @keyframes rippleAnim 动画
- 在 index.html 底部追加 IIFE 脚本，为所有 .btn 按钮绑定 click 涟漪生成逻辑
- 涟漪半径自适应按钮尺寸

## 响应式调整

保持现有响应式断点（1024px / 768px / 767px / 400px）不变，仅同步颜色和毛玻璃相关的属性到各断点。

## 不修改部分

- Summa 角色 UI（.summa-*）保持原样
- 闯关格子群（.campaign-*）保持原样
- 底部元素拖拽区（.elements-section）仅微调颜色
- 所有 JS 业务逻辑不变

## Agent Extensions

本计划不涉及媒体内容生成（不生成图片/视频/3D/PPT/PDF/Word/Excel/浏览器自动化），因此不启用任何技能扩展。代码探索通过直接读取目标文件完成，无需 SubAgent。