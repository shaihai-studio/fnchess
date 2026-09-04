## fnchess 函数棋

【函数棋 fnchess】用函数打仗的数学策略游戏。
构造表达式让曲线穿过目标格，避开禁止区。表达式越短得分越高，只用一个 x 就能拿 5 分满分。

```powershell
npm install     # 安装依赖

# 桌面端（Electron）
npm start           # 本地启动桌面版
npm run build:desktop   # 桌面端安装包编译（Windows 在本机打 win+linux；macOS 可打三平台）

# 移动端（Capacitor）
npm run sync:android    # 构建 Web 资源并同步到 Android
npm run sync:ios        # 构建 Web 资源并同步到 iOS
npm run open:android    # 打开 Android Studio
npm run open:ios        # 打开 Xcode
```

- 自研 GeoGebra-lite 引擎，16 次递归二分
- AI 对手 Summa，4 级策略体系，复仇模式
- 闯关 + 竞速（Time Attack 分关榜单）+ 本地对战 / 人机对战 / P2P 联机排位
- 玻璃拟态 UI，全文得意黑字体

免费下载：shaihai.cn

B站：space.bilibili.com/3690976753223882

游戏规则：(点击)[https://github.com/shaihai-studio/fnchess/blob/main/%E5%87%BD%E6%95%B0%E6%A3%8B%E5%AE%8C%E6%95%B4%E6%B8%B8%E6%88%8F%E6%89%8B%E5%86%8C.txt]

> 注：桌面端打包（`electron-builder.json`）只含游戏本体文件，P2P 联机需另行部署 `server/` 信令服务器。
