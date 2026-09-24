<#
.SYNOPSIS
    生成 Android 发布签名密钥（仅首次）并写好 android/keystore.properties。
.DESCRIPTION
    · 密钥库默认生成到 android/fnchess-release.keystore（已被 .gitignore 忽略，切勿入库）
    · 未指定 -Password 时随机生成强口令，同时备份到 .secrets/android-keystore.txt（同样不入库）
    · ⚠️ 密钥库 + 口令一旦丢失，就无法再给「已上架」的应用发布新版本，请务必离线备份
.PARAMETER Password
    自定义密钥库口令（不传则随机生成 24 位）
.PARAMETER Alias
    密钥别名，默认 fnchess
.PARAMETER Force
    已存在时覆盖重建（危险：等于换了签名，已上架应用将无法升级）
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\gen-android-keystore.ps1
#>
param(
    [string]$Password,
    [string]$Alias = 'fnchess',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$keystore = Join-Path $android 'fnchess-release.keystore'
$props = Join-Path $android 'keystore.properties'
$secretsDir = Join-Path $root '.secrets'
$secretsFile = Join-Path $secretsDir 'android-keystore.txt'

if ((Test-Path $keystore) -and -not $Force) {
    throw "密钥库已存在：$keystore`n如需重建请加 -Force（注意：会导致已上架应用无法升级，务必确认）"
}

if (-not $Password) {
    $bytes = New-Object byte[] 18
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Password = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
}

$jdk = Join-Path $root 'tools\jdk-21.0.12.1+1'
$keytool = Join-Path $jdk 'bin\keytool.exe'
if (-not (Test-Path $keytool)) {
    $keytool = 'keytool'
    Write-Warning "未找到仓库自带 JDK，尝试使用系统 keytool"
}

Write-Host "[1/3] 生成密钥库 → $keystore"
& $keytool -genkeypair -v -keystore $keystore -alias $Alias -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $Password -keypass $Password `
    -dname "CN=fnchess, OU=Shaihai Studio, O=Shaihai Studio, L=Shanghai, ST=Shanghai, C=CN"
if ($LASTEXITCODE -ne 0) { throw "keytool 失败（exit=$LASTEXITCODE）" }

Write-Host '[2/3] 写入 android/keystore.properties（已忽略入库）'
@"
storeFile=../fnchess-release.keystore
storePassword=$Password
keyAlias=$Alias
keyPassword=$Password
"@ | Set-Content -Path $props -Encoding ASCII

Write-Host "[3/3] 备份口令 → $secretsFile"
New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null
@"
# 函数棋 Android 发布签名（生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')）
keystore      = $keystore
alias         = $Alias
storePassword = $Password
keyPassword   = $Password
# ⚠️ 密钥库文件 + 此口令请立刻备份到密码管理器 / 离线介质；丢失将无法为已上架应用发新版本
"@ | Set-Content -Path $secretsFile -Encoding UTF8

Write-Host ''
Write-Host '完成。下一步：'
Write-Host "  · 签名文件： $keystore"
Write-Host "  · 签名配置： $props"
Write-Host "  · 口令备份： $secretsFile"
Write-Host '  · 构建发布包： powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1'
