<#
.SYNOPSIS
    一键构建 Android 发布产物：签名 AAB（Google Play）+ 签名 APK（国内渠道 / 官网分发）。
.DESCRIPTION
    1) 重建 web 产物（www/）并同步进 android 工程
    2) 注入仓库自带 JDK / Android SDK
    3) gradlew bundleRelease（AAB）+ assembleRelease（APK）
    4) 用 apksigner 校验签名并打印版本信息（versionCode / versionName）
    前置：android/keystore.properties 必须存在（先跑 scripts\gen-android-keystore.ps1）
.PARAMETER SkipCopy
    跳过 npx cap copy android（已手动同步过 www/ 时使用）
.PARAMETER ApkOnly
    只出 APK（国内渠道 / 官网下载），不构建 AAB
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1
#>
param(
    [switch]$SkipCopy,
    [switch]$ApkOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$propsFile = Join-Path $android 'keystore.properties'
$aab = Join-Path $android 'app\build\outputs\bundle\release\app-release.aab'
$apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'

if (-not (Test-Path $propsFile)) {
    throw "缺少 android/keystore.properties —— 先执行：powershell -ExecutionPolicy Bypass -File scripts\gen-android-keystore.ps1"
}

Write-Host '[1/4] 同步 web 产物 → android 工程'
Set-Location $root
npm run build:web
if ($LASTEXITCODE -ne 0) { throw 'build:web 失败' }
if (-not $SkipCopy) {
    npx cap copy android
    if ($LASTEXITCODE -ne 0) { throw 'cap copy android 失败' }
}

Write-Host '[2/4] 注入 JDK / Android SDK 环境'
$jdk = Join-Path $root 'tools\jdk-21.0.12.1+1'
$sdk = Join-Path $root 'tools\android-sdk'
if (Test-Path $jdk) { $env:JAVA_HOME = $jdk; Write-Host "  JAVA_HOME=$jdk" } else { Write-Warning '未找到仓库自带 JDK，沿用系统 JAVA_HOME' }
if (Test-Path $sdk) { $env:ANDROID_SDK_ROOT = $sdk; $env:ANDROID_HOME = $sdk; Write-Host "  ANDROID_SDK_ROOT=$sdk" } else { Write-Warning '未找到仓库自带 Android SDK' }

Write-Host '[3/4] Gradle 构建发布产物'
$gradlew = Join-Path $android 'gradlew.bat'
$tasks = @('-p', $android, '--console=plain')
if (-not $ApkOnly) { $tasks += 'bundleRelease' }
$tasks += 'assembleRelease'
& $gradlew @tasks
if ($LASTEXITCODE -ne 0) { throw "Gradle 构建失败（exit=$LASTEXITCODE）" }

Write-Host '[4/4] 校验签名与版本信息'
$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
$aapt2 = if ($buildTools) { Join-Path $buildTools.FullName 'aapt2.exe' } else { $null }
$apksigner = if ($buildTools) { Join-Path $buildTools.FullName 'apksigner.bat' } else { $null }

# 原生工具会把信息写到 stderr，这里放宽错误策略，避免被 ErrorActionPreference=Stop 中断
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

foreach ($out in @($apk, $aab)) {
    if (-not (Test-Path $out)) { continue }
    $size = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host ''
    Write-Host "产物: $out  ($size MB)"
    if ($out -like '*.aab') {
        Write-Host '  （AAB 供 Google Play 使用；版本信息以同版本 APK 为准）'
        continue
    }
    if ($aapt2 -and (Test-Path $aapt2)) {
        $badging = & $aapt2 dump badging $out 2>$null | Select-String -Pattern '^package:' | Select-Object -First 1
        if ($badging) { Write-Host "  $($badging.Line.Trim())" }
    }
    if ($apksigner -and (Test-Path $apksigner)) {
        $sig = & $apksigner verify --print-certs $out 2>$null | Select-String -Pattern 'Signer #1 certificate (DN|SHA-256)' | Select-Object -First 2
        if ($sig) {
            Write-Host ('  签名: ' + (($sig | ForEach-Object { $_.Line.Trim() }) -join ' | '))
        } else {
            Write-Host '  签名: 未通过校验 —— 请检查 android/keystore.properties'
        }
    }
}

$ErrorActionPreference = $prevEap

Write-Host ''
Write-Host '完成。上架位置：'
Write-Host "  · Google Play（AAB）: $aab"
Write-Host "  · 国内渠道 / 官网（APK）: $apk"
