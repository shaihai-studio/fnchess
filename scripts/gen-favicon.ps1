Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('E:\WorkbuddyData\fnchess\resources\icon.png')
$bmp = New-Object System.Drawing.Bitmap(64, 64)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, 64, 64)
$g.Dispose()
$bmp.Save('E:\WorkbuddyData\fnchess\files\images\favicon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()
Write-Host 'favicon OK'
