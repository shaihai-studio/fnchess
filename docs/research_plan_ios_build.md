# 研究计划：函数棋 iOS 安装包制作进度与可行性

## 背景与目标
用户问题有两部分：
1. 将 APK 下载页面发布到已开通的 GitHub Pages 站点（`happycshi/shaihai-studio.github.io`，source = main/docs）。
2. 了解 iOS 版本编译进度，以及现在能否制作苹果安装包（.ipa）。

第一部分为实操任务：将本地 `docs/index.html` 上传至 `happycshi/shaihai-studio.github.io` 仓库的 `main` 分支 `docs/` 目录，等待 Pages 构建后即可访问。

第二部分为研究任务：评估函数棋（Capacitor 8 项目，Windows 开发机）产出 iOS 安装包的路径、进度与缺口。

## 已知事实（来自本地工程与 GitHub API）
- iOS 原生工程 `ios/App`（App.xcodeproj、CapApp-SPM，Capacitor 8 SPM 方案）已生成并提交。
- `.github/workflows/ios-build.yml` 已就位，支持 verify（编译验证，免签名）/ ipa（产安装包，需签名）/ testflight（传 TestFlight，需 API Key）三模式，运行在 macOS 26 + Xcode 26 runner。
- 2026-09-01 07:54Z 的 push 触发 verify 模式，结论 success（云端编译通过）；07:36/07:38 两次失败为修复前旧 workflow。
- 仓库 GitHub Actions Secrets 数量为 0：签名材料（Distribution 证书 p12、描述文件、Team ID、App Store Connect API Key）均未配置。
- 文档 `docs/CI-IOS-BUILD.md` 已写明签名材料准备步骤与 Secret 配置清单。

## 研究子任务（delegated to research_subagent）
1. 确认 2026 年 Apple 对 iOS 构建/上架的最新硬性要求（Xcode 26、iOS 26 SDK、2026-04-28 时限等），核实文档中的说法。
2. 无 Mac 环境下产出可分发 .ipa 的可行路径：GitHub Actions macOS runner（本项目采用）、Codemagic、EAS、App Center 等云构建现状（2026）。
3. 免费 Apple ID 是否可生成可分发 .ipa（无付费开发者账号）？有效期/签名限制；是否需要 Mac。
4. 无 Mac 情况下如何准备签名材料：Distribution 证书 p12、App Store 描述文件、Team ID；是否存在纯云端/网页方式。
5. 综合判断：用户当前离"制作出苹果安装包"还差哪些必要材料与步骤，给出最小行动清单。

## 信息检索策略
- 使用 `wechat-article-search` skill 检索微信公众文章中关于 iOS 上架/签名/云构建的实操经验（2025-2026）。
- 使用 web_search / web_fetch 检索 Apple 官方文档、GitHub Actions、Codemagic 等官方资料。
- 结合本地 `docs/CI-IOS-BUILD.md` 与 `docs/RELEASE-GUIDE.md` 中已固化的项目信息。
- 微信文章与官方/Web 结果交叉验证，优先官方一手资料与近期（2026 年）信息。

## 产出
- `research_report_ios_build.md`：报告「页面发布结果 + iOS 编译进度 + 是否能出安装包 + 缺口清单与行动步骤」。
