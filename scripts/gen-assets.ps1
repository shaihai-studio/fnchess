# gen-assets.ps1 — 离线生成 Android/iOS 全部图标与启动屏资源（System.Drawing，无需 sharp）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/gen-assets.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root 'resources\icon.png'
if (-not (Test-Path $iconPath)) { throw "缺少 resources\icon.png（1024x1024 源图标）" }

$bgColor = [System.Drawing.Color]::FromArgb(255, 11, 16, 32)  # #0B1020

function New-Canvas([int]$w, [int]$h, $src, [double]$scale, [bool]$fillBg, [bool]$transparent) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    if ($fillBg) { $g.Clear($bgColor) }
    elseif ($transparent) { $g.Clear([System.Drawing.Color]::Transparent) }
    if ($null -ne $src) {
        $side = [int]([Math]::Min($w, $h) * $scale)
        $x = [int](($w - $side) / 2)
        $y = [int](($h - $side) / 2)
        $g.DrawImage($src, $x, $y, $side, $side)
    }
    $g.Dispose()
    return $bmp
}

function Save-Png($bmp, [string]$path) {
    $dir = Split-Path -Parent $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  ✓ $($path.Replace($root, ''))"
}

$icon = [System.Drawing.Image]::FromFile($iconPath)

Write-Host '[gen-assets] Android 启动图标 ...'
$androidRes = Join-Path $root 'android\app\src\main\res'
$dpiMap = @(
    @{ name = 'mdpi';    icon = 48;  fore = 108 },
    @{ name = 'hdpi';    icon = 72;  fore = 162 },
    @{ name = 'xhdpi';   icon = 96;  fore = 216 },
    @{ name = 'xxhdpi';  icon = 144; fore = 324 },
    @{ name = 'xxxhdpi'; icon = 192; fore = 432 }
)
foreach ($d in $dpiMap) {
    $mip = Join-Path $androidRes "mipmap-$($d.name)"
    Save-Png (New-Canvas $d.icon $d.icon $icon 1.0 $true $false) (Join-Path $mip 'ic_launcher.png')
    Save-Png (New-Canvas $d.icon $d.icon $icon 1.0 $true $false) (Join-Path $mip 'ic_launcher_round.png')
    Save-Png (New-Canvas $d.fore $d.fore $icon 0.66 $false $true) (Join-Path $mip 'ic_launcher_foreground.png')
}

Write-Host '[gen-assets] Android 启动屏 ...'
$splashMap = @(
    @{ dir = 'drawable-port-mdpi';    w = 320;  h = 480 },
    @{ dir = 'drawable-port-hdpi';    w = 480;  h = 800 },
    @{ dir = 'drawable-port-xhdpi';   w = 720;  h = 1280 },
    @{ dir = 'drawable-port-xxhdpi';  w = 960;  h = 1600 },
    @{ dir = 'drawable-port-xxxhdpi'; w = 1280; h = 1920 },
    @{ dir = 'drawable-land-mdpi';    w = 480;  h = 320 },
    @{ dir = 'drawable-land-hdpi';    w = 800;  h = 480 },
    @{ dir = 'drawable-land-xhdpi';   w = 1280; h = 720 },
    @{ dir = 'drawable-land-xxhdpi';  w = 1600; h = 960 },
    @{ dir = 'drawable-land-xxxhdpi'; w = 1920; h = 1280 }
)
foreach ($s in $splashMap) {
    Save-Png (New-Canvas $s.w $s.h $icon 0.42 $true $false) (Join-Path (Join-Path $androidRes $s.dir) 'splash.png')
}
# 基础 drawable 兜底
Save-Png (New-Canvas 720 1280 $icon 0.42 $true $false) (Join-Path $androidRes 'drawable\splash.png')

Write-Host '[gen-assets] iOS 图标与启动屏 ...'
$iosAssets = Join-Path $root 'ios\App\App\Assets.xcassets'
Save-Png (New-Canvas 1024 1024 $icon 1.0 $true $false) (Join-Path $iosAssets 'AppIcon.appiconset\AppIcon-512@2x.png')
foreach ($suffix in @('', '-1', '-2')) {
    Save-Png (New-Canvas 2732 2732 $icon 0.38 $true $false) (Join-Path $iosAssets "Splash.imageset\splash-2732x2732$suffix.png")
}

$icon.Dispose()
Write-Host '[gen-assets] 全部完成'
