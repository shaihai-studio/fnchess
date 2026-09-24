# 函数棋：下载页面上线结果与 iOS 安装包制作可行性研究报告

## 执行摘要

函数棋 v2.0.0.2 的 Android 下载页面已成功发布到 GitHub Pages 站点，当前地址为 https://happycshi.github.io/shaihai-studio.github.io/ ，页面正常渲染并已内置指向 GitHub Release 上 36.35MB APK 的下载按钮。iOS 方面，原生工程与云端构建链路已就绪，verify 模式于 2026-09-01 在 GitHub Actions 的 macOS 26 + Xcode 26 托管机器上编译通过；但仓库当前没有任何签名材料（Secrets 为 0），因此还不能产出可在 iPhone 上安装的 .ipa，核心缺口是付费 Apple Developer 账号（约 ¥688/年）及配套的 Distribution 证书、描述文件与 Team ID。补齐这些材料并配置到仓库 Secrets 后，在 Actions 里触发 ipa 模式即可在云端产出安装包。

## 背景

用户此前要求把编译好的 APK 上传到 GitHub 并提供下载页面，上一阶段已创建 GitHub Release v2.0.0.2（含资产 fnchess-v2.0.0.2.apk，36.35MB）并把美化下载页 docs/index.html 推送到 fnchess 仓库 main 分支；同时项目已建立 iOS 云端构建方案（docs/CI-IOS-BUILD.md），配置了 .github/workflows/ios-build.yml。本次需要确认页面是否随用户开通的 Pages 站点上线，并评估 iOS 版本能否产出安装包。

## 一、下载页面发布结果

通过排查发现，用户开通的 Pages 站点并非 fnchess 仓库，而是独立仓库 happycshi/shaihai-studio.github.io，其 Pages 源设置为 main 分支的 /docs 目录，但该仓库此前只有 README.md，没有 docs 目录。已将本地 docs/index.html 通过 GitHub contents API 上传到该仓库的 main 分支 docs/index.html（提交 sha 6ad2609），随后 Pages 自动构建完成（status=built）。

验证结果：https://happycshi.github.io/shaihai-studio.github.io/ 返回 HTTP 200，页面标题为「函数棋 - Android 下载」，页面内的「下载 Android APK」按钮指向 https://github.com/shaihai-studio/fnchess/releases/download/v2.0.0.2/fnchess-v2.0.0.2.apk ，对应 Release 资产完整存在（36.35MB）。即下载页已上线且下载链路完整。

需要注意 URL 形态：由于站点仓库位于 happycshi 账号名下（仓库名 shaihai-studio.github.io 属项目站点，非用户站点），实际地址是 https://happycshi.github.io/shaihai-studio.github.io/ ，而不是用户以为的 https://shaihai-studio.github.io/ 。后者在 GitHub 上解析不到（shaihai-studio 账号下不存在 shaihai-studio.github.io 仓库），返回 404。若想使用 shaihai-studio.github.io 域名，需要在该账号下新建同名仓库或将站点迁移过去。

## 二、iOS 编译进度

当前 iOS 工程状态如下。原生工程已生成并提交：ios/App 包含 App.xcodeproj、App 与 CapApp-SPM（Capacitor 8 默认 SPM 依赖方式），deployment target iOS 15.0，支持 iPhone 与 iPad。云端构建链路已配置：.github/workflows/ios-build.yml 运行在 macos-26 托管 runner（Apple Silicon，预装 Xcode 26），支持三种手动触发模式——verify（免签名仅编译验证）、ipa（归档并导出已签名 IPA）、testflight（上传 TestFlight）。该 workflow 也会在 main 分支的 ios、files、index.html、package.json 等变更时自动触发 verify。

从 GitHub Actions 运行记录看，2026-09-01 07:54:52Z 的一次 push 触发的 verify 构建结论为 success，即 iOS 工程已在云端 macOS 26 + Xcode 26 环境下完整编译通过；当天 07:36 与 07:38 的两次失败是修复前的旧 workflow 版本（曾存在 if 中引用 secrets 导致无效的问题），已被当前版本修复并验证。这证明从工程侧和工具链侧，iOS 编译本身没有问题。

## 三、能否制作苹果安装包

结论：工程可以编译，但当前不能产出可在 iPhone 上安装或可上架的 .ipa，唯一缺失项是签名材料。

签名是硬性前提。要产出可分发、可上架的 .ipa，必须具备付费 Apple Developer Program 账号（约 ¥688/年，$99/年）。免费 Apple ID 虽然也能签名，但证书与描述文件 7 天后过期、最多注册 3 台测试设备、且不支持 App Store、TestFlight、Ad Hoc 或企业分发，只能用于 7 天内的真机调试，不满足"拿到可安装安装包"的目标，因此被排除。Apple 还规定自 2026-04-28 起上传 App Store Connect（含 TestFlight）的包必须使用 Xcode 26 及以上并基于 iOS 26 SDK 构建，项目选用的 macos-26 runner 已天然满足该要求，无需改动。

仓库现状是 Secrets 数量为 0，即签名所需材料一个都没有。具体缺少：Apple Distribution 分发证书（.p12，含私钥）、App Store 类型的描述文件（.mobileprovision，App ID 为 cn.shaihai.fnchess）、Team ID；若走 testflight 模式还需 App Store Connect API Key（App Manager 及以上角色，含 .p8 私钥、Issuer ID、Key ID）。这些恰好是 ios-build.yml 的 ipa/testflight 模式所依赖的输入，因此当前触发 ipa 模式会因缺少 Secret 而失败。

一个利好是准备这些材料不需要 Mac。无 Mac 情况下，可以用 Windows 上的 OpenSSL 生成私钥与 CSR，再到 Apple Developer 网页后台上传 CSR 获取 Distribution 证书，用 openssl pkcs12 -export 合并导出 .p12，并在网页后台为 bundle id 创建 App Store 描述文件；也可以使用 Appuploader 这类 Windows 可视化工具代做 CSR 生成、证书申请、描述文件创建与 .p12 导出，全程不需要钥匙串访问。需要明确的是，Apple 官方没有"纯网页生成 .p12"的路径（私钥必须由申请方本地生成并保管），也不存在合法绕开付费账号的方法；第三方"云签名/超级签名"服务只能用于 Ad Hoc 或企业内部分发，不能用于 App Store 与 TestFlight 提交，且违反 Apple 条款，不应采用。

## 四、从当前状态到拿到 .ipa 的最小行动清单

按依赖顺序，全部步骤都不需要 Mac。第一步，注册并付费开通 Apple Developer Program（网页端，约 ¥688/年），记录 Team ID 并签署 Apple Developer 协议与 App Store Connect 付费协议。第二步，在网页后台创建 App ID（bundle id cn.shaihai.fnchess）。第三步，在 Windows 上用 OpenSSL（或 Appuploader）生成私钥与 CSR，上传 CSR 取得 Distribution 证书并导出 .p12（妥善保存私钥）。第四步，在网页后台为该 App ID 创建 App Store 分发描述文件。第五步，将 .p12 与 .mobileprovision 以 base64 存入仓库 GitHub Secrets，并配置 APPLE_TEAM_ID；testflight 模式再补 APPSTORE_ISSUER_ID、APPSTORE_API_KEY_ID、APPSTORE_API_PRIVATE_KEY。第六步，在 App Store Connect 网页端创建应用记录并填写合规信息（隐私、出口合规等，文档已确认 ITSAppUsesNonExemptEncryption=false 可免出口合规流程）。第七步，触发 workflow 的 ipa 模式产出已签名的 App Store 版 .ipa；若只想在 iPhone 上验收，用 testflight 模式上传到 TestFlight 外部测试组（支持最多 1 万名测试者，无需逐台登记设备 UDID）。第八步，若想脱离 CI 手动上传 .ipa，Windows 下可用 Appuploader 等工具配合 App 专用密码上传，注意 Apple 自 2023-11-01 起已停用 altool 旧协议。

## 分析与综合

两条研究路径（官方文档与实操文章）交叉验证后结论一致：技术上无 Mac 的团队完全可以完成 iOS 出包，成本主要是每年 ¥688 的开发者账号费用与 20 分钟左右一次的云端构建。构建侧需留意两个成本问题：macos-26 托管 runner 目前处于 public preview，不在 SLA 内；若仓库为私有，macOS 构建按分钟计费（macos-26 标准 4 核约 $0.062/分钟，约是 Linux 的 10 倍），而公共仓库的 Standard runner 完全免费，若追求零成本可考虑把仓库设为 public，或评估 Codemagic 的每月 500 分钟免费 macOS 构建额度作为备选。App Center 已于 2025-03-31 退役，不纳入选项；EAS Build 面向 Expo 项目，对纯 Capacitor 项目需额外改造，不推荐作为首选。

## 结论

下载页面已正式上线，用户可直接访问 https://happycshi.github.io/shaihai-studio.github.io/ 下载 v2.0.0.2 安装包（注意这是实际的站点地址，shaihai-studio.github.io 域名当前不可用）。iOS 编译进度为：工程与云端构建链路全部就绪，verify 编译已在云端通过；但尚未到"可以制作苹果安装包"的一步——唯一障碍是缺少付费开发者账号与签名材料（证书、描述文件、Team ID），这些可在 Windows 上完成准备并写入仓库 Secrets，之后在 GitHub Actions 触发 ipa 模式即可在云端产出 .ipa，全程不需要 Mac。

## 局限

本报告关于 iOS 的结论建立在官方文档、GitHub 文档与 2025-2026 年实操文章交叉验证之上，签名材料的具体申请细节可能随 Apple 后台改版微调；macos-26 runner 为 public preview，其可用性与计费政策可能变化。页面部分基于 GitHub API 与线上访问实测验证，均确凿。下载按钮指向的 APK 资产已确认存在，但本机网络无法直接完成整包下载验证，依赖标准 GitHub 分发通道。

## References

1. [Apple Developer - Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)
2. [Apple Developer 中文新闻 - 即将生效的 SDK 最低要求](https://developer.apple.com/cn/news/?id=ueeok6yw)
3. [Apple Developer - 比较会员资格](https://developer.apple.com/support/compare-memberships/)
4. [GitHub Docs - GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
5. [GitHub Docs - Actions runner 计费](https://docs.github.com/en/billing/reference/actions-runner-pricing)
6. [actions/runner-images - macos-26 Readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)
7. [Codemagic 官方定价页](https://codemagic.io/pricing/)
8. [Microsoft - App Center 退役公告](https://install.appcenter.ms/)
9. [掘金 - 没有 Mac 也能完成 iOS 上架（2025-11）](https://juejin.cn/post/7572382777837551656)
10. [掘金 - Windows 制作 iOS 证书方案对比（2026-06）](https://juejin.cn/post/7654577623028039714)
