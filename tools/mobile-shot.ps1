param(
  [string]$Url   = 'http://127.0.0.1:8123/tools/_frame.html?ch=1',
  [string]$Out   = 'e:\Partial Drivative\docs\fig-7-mobile.png',
  [int]$CssW     = 390,
  [int]$CssH     = 740
)
# 1 · shoot the wrapper page (headless window is clamped to ~492px, never below)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'C:\pdprof'
$raw  = Join-Path $env:TEMP '_mobile_raw.png'
$line = '--headless=new --disable-gpu --enable-unsafe-swiftshader --no-first-run ' +
        '--no-default-browser-check --hide-scrollbars --user-data-dir="' + $prof + '" ' +
        '--virtual-time-budget=9000 --window-size=492,' + ($CssH + 20) +
        ' --screenshot="' + $raw + '" "' + $Url + '"'
Start-Process -FilePath $edge -ArgumentList $line -NoNewWindow -Wait `
  -RedirectStandardOutput (Join-Path $env:TEMP '_m.out') `
  -RedirectStandardError  (Join-Path $env:TEMP '_m.err')

# 2 · crop to the iframe box, so the figure is exactly the phone viewport
Add-Type -AssemblyName System.Drawing
$src  = [System.Drawing.Image]::FromFile($raw)
$bmp  = New-Object System.Drawing.Bitmap $CssW, $CssH
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src,
  (New-Object System.Drawing.Rectangle 0, 0, $CssW, $CssH),
  (New-Object System.Drawing.Rectangle 0, 0, $CssW, $CssH),
  [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Remove-Item -LiteralPath $raw -Force -ErrorAction SilentlyContinue
'{0} {1}×{2} {3:N0} KB' -f (Split-Path -Leaf $Out), $CssW, $CssH, ((Get-Item $Out).Length / 1KB)
