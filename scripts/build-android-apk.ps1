<#
.SYNOPSIS
    一键构建函数棋 Android 调试包（APK）。
.DESCRIPTION
    1) 同步 web 产物（www/ → android/app/src/main/assets/public）
    2) 注入本地 JDK / Android SDK（仓库 tools/ 下自带，无需系统全局配置）
    3) 执行 gradlew assembleDebug
    产物：android/app/build/outputs/apk/debug/app-debug.apk
.PARAMETER Clean
    构建前先 clean（排除缓存导致的诡异问题，耗时更长）
.PARAMETER SkipCopy
    跳过 cap copy（已手动同步过 www/ 时使用）
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\build-android-apk.ps1
#>
param(
    [switch]$Clean,
    [switch]$SkipCopy
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$apk = Join-Path $android 'app\build\outputs\apk\debug\app-debug.apk'

Write-Host '[1/3] 同步 web 产物 → android 工程'
Set-Location $root
if (-not $SkipCopy) {
    npx cap copy android
    if ($LASTEXITCODE -ne 0) { throw 'cap copy android 失败（如被安全软件拦截，可重试一次）' }
}

Write-Host '[2/3] 注入 JDK / Android SDK 环境'
$jdk = Join-Path $root 'tools\jdk-21.0.12.1+1'
$sdk = Join-Path $root 'tools\android-sdk'
if (Test-Path $jdk) {
    $env:JAVA_HOME = $jdk
    Write-Host "  JAVA_HOME=$jdk"
} else {
    Write-Warning "未找到 $jdk，沿用系统 JAVA_HOME=$env:JAVA_HOME"
}
if (Test-Path $sdk) {
    $env:ANDROID_SDK_ROOT = $sdk
    $env:ANDROID_HOME = $sdk
    Write-Host "  ANDROID_SDK_ROOT=$sdk"
} else {
    Write-Warning "未找到 $sdk（构建需要 Android SDK）"
}

Write-Host '[3/3] Gradle assembleDebug（首次较慢，请耐心等待）'
$gradlew = Join-Path $android 'gradlew.bat'
$gradleArgs = @('-p', $android, '--console=plain')
if ($Clean) { $gradleArgs += 'clean' }
$gradleArgs += 'assembleDebug'
& $gradlew @gradleArgs
if ($LASTEXITCODE -ne 0) { throw "Gradle 构建失败（exit=$LASTEXITCODE）" }

if (Test-Path $apk) {
    $size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
    Write-Host ''
    Write-Host "APK 已生成: $apk ($size MB)"
    Write-Host '安装: adb install -r <上述路径>（或把文件传到手机直接安装，需允许「未知来源」）'
} else {
    throw "未找到产物: $apk"
}
