using namespace System.Drawing
using namespace System.Drawing.Drawing2D
using namespace System.Drawing.Imaging

Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path (Split-Path $PSScriptRoot -Parent) "build"

# ============================================================
#  Helper: draw decorative elements (circles + accent line)
# ============================================================
function Draw-Decorations {
    param([Graphics]$g, [int]$W, [int]$H, [int]$Alpha = 25)

    # Large translucent circles for depth
    $b1 = [SolidBrush]::new([Color]::FromArgb($Alpha, 255, 255, 255))
    $g.FillEllipse($b1, [Rectangle]::new(-60, [int]($H*0.55), [int]($W*1.5), [int]($H*0.7)))
    $b1.Color = [Color]::FromArgb([int]($Alpha*0.6), 255, 255, 255)
    $g.FillEllipse($b1, [Rectangle]::new([int]($W*0.2), [int]($H*0.72), [int]($W*1.2), [int]($H*0.6)))
    $b1.Color = [Color]::FromArgb([int]($Alpha*0.35), 255, 255, 255)
    $g.FillEllipse($b1, [Rectangle]::new([int]($W*0.5), -20, [int]($W*0.8), [int]($H*0.35)))
    $b1.Dispose()

    # Thin accent line near bottom
    $lineY = [int]($H * 0.91)
    $pen = [Pen]::new([Color]::FromArgb(70, 255, 255, 255), 1)
    $g.DrawLine($pen, [int]($W*0.18), $lineY, [int]($W*0.82), $lineY)
    $pen.Dispose()
}

# ============================================================
#  Sidebar bitmap (164 x 314)
# ============================================================
function New-Sidebar {
    param(
        [string]$OutPath,
        [Color]$C1, [Color]$C2,
        [string]$Title, [string]$Sub, [int]$TitleY,
        [float]$Angle = 135.0
    )

    $bmp = New-Object Bitmap(164, 314)
    $g = [Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAlias'

    # Diagonal gradient
    $rect = [Rectangle]::new(0, 0, 164, 314)
    $gb = [LinearGradientBrush]::new($rect, $C1, $C2, $Angle)
    $g.FillRectangle($gb, $rect)
    $gb.Dispose()

    Draw-Decorations -g $g -W 164 -H 314

    # Title with subtle shadow
    $sf = [StringFormat]::new()
    $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
    $titleFont = [Font]::new("Microsoft YaHei UI", 26, [FontStyle]::Bold)

    $shadow = [SolidBrush]::new([Color]::FromArgb(50, 0, 0, 0))
    $g.DrawString($Title, $titleFont, $shadow, [RectangleF]::new(1, $TitleY+2, 164, 58), $sf)
    $white = [SolidBrush]::new([Color]::White)
    $g.DrawString($Title, $titleFont, $white, [RectangleF]::new(0, $TitleY, 164, 58), $sf)
    $titleFont.Dispose(); $shadow.Dispose(); $white.Dispose()

    # Subtitle
    $subFont = [Font]::new("Microsoft YaHei UI", 9.5, [FontStyle]::Regular)
    $dim = [SolidBrush]::new([Color]::FromArgb(180, 255, 255, 255))
    $g.DrawString($Sub, $subFont, $dim, [RectangleF]::new(0, ($TitleY+62), 164, 22), $sf)
    $subFont.Dispose(); $dim.Dispose()

    $sf.Dispose(); $g.Dispose()
    $bmp.Save($OutPath, [ImageFormat]::Bmp)
    $bmp.Dispose()
    Write-Host "  sidebar -> $OutPath"
}

# ============================================================
#  Header banner (150 x 57)
# ============================================================
function New-Header {
    param([string]$OutPath, [Color]$C1, [Color]$C2)

    $bmp = New-Object Bitmap(150, 57)
    $g = [Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'

    $rect = [Rectangle]::new(0, 0, 150, 57)
    $gb = [LinearGradientBrush]::new($rect, $C1, $C2, 0.0)
    $g.FillRectangle($gb, $rect)
    $gb.Dispose()

    # Subtle bottom highlight line
    $pen = [Pen]::new([Color]::FromArgb(40, 255, 255, 255), 1)
    $g.DrawLine($pen, 0, 56, 149, 56)
    $pen.Dispose()

    $g.Dispose()
    $bmp.Save($OutPath, [ImageFormat]::Bmp)
    $bmp.Dispose()
    Write-Host "  header  -> $OutPath"
}

# ============================================================
#  Generate all assets
# ============================================================
Write-Host "`nGenerating installer bitmaps..."

$title = [string][char]0x51FD + [char]0x6570 + [char]0x68CB       # 函数棋
$uninstall = [string][char]0x5378 + [char]0x8F7D + [char]0x7A0B + [char]0x5E8F  # 卸载程序

# Installer sidebar — vivid purple → blue
New-Sidebar `
    -OutPath (Join-Path $buildDir "installer-sidebar.bmp") `
    -C1 ([Color]::FromArgb(88, 28, 135)) `
    -C2 ([Color]::FromArgb(21, 101, 192)) `
    -Title $title -Sub "fnchess" -TitleY 88 -Angle 150.0

# Installer header — matching gradient
New-Header `
    -OutPath (Join-Path $buildDir "installer-header.bmp") `
    -C1 ([Color]::FromArgb(88, 28, 135)) `
    -C2 ([Color]::FromArgb(21, 101, 192))

# Uninstaller sidebar — dark blue-gray
New-Sidebar `
    -OutPath (Join-Path $buildDir "uninstaller-sidebar.bmp") `
    -C1 ([Color]::FromArgb(55, 71, 79)) `
    -C2 ([Color]::FromArgb(38, 50, 56)) `
    -Title $title -Sub $uninstall -TitleY 100 -Angle 160.0

# Uninstaller header
New-Header `
    -OutPath (Join-Path $buildDir "uninstaller-header.bmp") `
    -C1 ([Color]::FromArgb(55, 71, 79)) `
    -C2 ([Color]::FromArgb(38, 50, 56))

Write-Host "Done.`n"
