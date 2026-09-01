# iOS 云端构建指南（GitHub Actions）

无需 Mac 电脑，用 GitHub 托管的 Apple Silicon 机器（macOS 26 + Xcode 26）完成 iOS 编译、打包与 TestFlight 上传。

---

## 一、三种构建模式

在 GitHub → Actions →「iOS 构建」→ Run workflow 中选择：

| 模式 | 需要签名 | 产出 | 用途 |
|---|---|---|---|
| `verify` | ❌ 否 | 无产物，仅编译日志 | **第一次先跑这个**，验证 iOS 工程在云端能编译通过 |
| `ipa` | ✅ 是 | 可下载的 IPA 文件 | 拿到安装包，可本地分发给测试设备 |
| `testflight` | ✅ 是 + API Key | 直接上传到 TestFlight | 正式内测/提审 |

---

## 二、第一次使用：先跑 verify（0 配置）

1. 把代码推送到 GitHub（`origin` 已配置为 `shaihai-studio/fnchess`）
2. 打开仓库 → **Actions** → 左侧选「iOS 构建」→ 右上角 **Run workflow**
3. 模式选 `verify` → 点绿色 Run workflow
4. 等待约 5–10 分钟，绿色对勾即表示 iOS 工程编译通过

> 此模式不需要任何证书，可以直接验证云端链路是否连通。

---

## 三、需要签名时：准备 4 份材料

### 1. 签名证书（Distribution）

- 登录 [Apple Developer](https://developer.apple.com/account/resources/certificates/list) → Certificates → `+`
- 选择 **Apple Distribution** → 上传 CSR（用 Mac 钥匙串生成，或用在线工具生成 CSR 文件）
- 下载 `.cer` → **双击导入 Mac 钥匙串** → 在钥匙串中右键该证书 → **导出为 .p12**（设置导出密码）

> 没有 Mac？可让有 Mac 的同事帮你导出，或使用 App Store Connect API + 云签名服务替代。

### 2. Provisioning Profile（描述文件）

- Apple Developer → Profiles → `+` → **App Store Connect** 类型
- App ID 选 `cn.shaihai.fnchess` → 关联上面的 Distribution 证书
- 下载 `.mobileprovision`，记住**文件名**（如 `fnchess AppStore 2026`）

### 3. App Store Connect API Key（仅 testflight 模式需要）

- 登录 [App Store Connect](https://appstoreconnect.apple.com/access/api) → 用户与访问 → 密钥 → `+`
- 角色选 **App 管理**或更高 → 下载 `.p8` 私钥文件（**只能下载一次，务必保存好**）
- 记录 **Issuer ID**（页面顶部）和 **Key ID**

### 4. Team ID

- Apple Developer 页面右上角账户名下方，或 Membership 页面，10 位字符，如 `A1B2C3D4E5`

---

## 四、配置 GitHub Secrets

仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，逐个添加：

| Secret 名称 | 值 | 获取方式 |
|---|---|---|
| `IOS_CERTIFICATE_P12` | p12 文件的 base64 内容 | `base64 -i Certificates.p12 \| pbcopy`（Mac）<br>Windows PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.p12"))` |
| `IOS_CERTIFICATE_PASSWORD` | 导出 p12 时设置的密码 | — |
| `KEYCHAIN_PASSWORD` | 任意自定义字符串 | 如 `fnchess-ci-2026`（CI 临时钥匙串密码，随便设） |
| `IOS_PROVISION_PROFILE` | .mobileprovision 的 base64 | 同上方式转 base64 |
| `IOS_PROFILE_NAME` | 描述文件名称 | 如 `fnchess AppStore 2026` |
| `APPLE_TEAM_ID` | 10 位 Team ID | Apple Developer 账户页 |
| `APPSTORE_ISSUER_ID` | Issuer ID | App Store Connect → 用户与访问 → 密钥 |
| `APPSTORE_API_KEY_ID` | Key ID | 同上 |
| `APPSTORE_API_PRIVATE_KEY` | .p8 文件**全部文本内容** | 用文本编辑器打开 p8，整段复制（含 `-----BEGIN PRIVATE KEY-----` 和结尾） |

> 安全提示：以上均为仓库加密 Secret，日志中会被自动打码，且 `.gitignore` 已排除 `*.p12`、`*.mobileprovision`。

---

## 五、上传到 TestFlight

1. 先确保 App Store Connect 中已创建 App（Bundle ID `cn.shaihai.fnchess`，若未创建需先在 Mac 或网页端创建）
2. 配齐上述 9 个 Secrets
3. 触发 workflow，模式选 `testflight`
4. 完成后在 App Store Connect → TestFlight 中即可看到构建版本

---

## 六、常见问题

**Q: verify 模式失败，提示 scheme 找不到**
A: 确认仓库中 `ios/App/App.xcodeproj` 已提交（未被 gitignore 排除）。Capacitor 工程的 scheme 名为 `App`。

**Q: 归档成功但导出 IPA 失败**
A: 99% 是证书或描述文件不匹配。检查：描述文件的 App ID 是否为 `cn.shaihai.fnchess`、证书是否过期、`IOS_PROFILE_NAME` 是否与下载的文件名**完全一致**。

**Q: 上传 TestFlight 报 401/403**
A: API Key 权限不足（需 App 管理及以上），或 `.p8` 内容复制不完整（必须包含首尾的 BEGIN/END 行）。

**Q: 为什么必须用 Xcode 26**
A: Apple 规定自 2026-04-28 起，上传 App Store Connect 的包必须由 Xcode 26 + iOS 26 SDK 构建。`macos-26` runner 预装的正是 Xcode 26。

---

## 七、成本

- **公共仓库**：完全免费
- **私有仓库**：macOS runner 按分钟计费（约为 Linux 的 10 倍），单次构建约 5–15 分钟，一个月几次的成本很低
- 账号费用：Apple Developer Program ¥688/年（上架必需）
