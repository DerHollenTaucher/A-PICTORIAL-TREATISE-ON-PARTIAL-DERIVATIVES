param(
  [string]$Base = 'http://127.0.0.1:8123/index.html'
)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'C:\pdprof'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $prof)) { New-Item -ItemType Directory -Path $prof | Out-Null }
$tmp = $env:TEMP
$common = '--headless=new --disable-gpu --enable-unsafe-swiftshader --no-first-run --no-default-browser-check --hide-scrollbars --user-data-dir="' + $prof + '" --virtual-time-budget=9000'

# name, query, width, height
$shots = @(
  @('fig-1-partial',     '?ch=1',              1440, 900),
  @('fig-2-gradient',    '?ch=2',              1440, 900),
  @('fig-3-directional', '?ch=3',              1440, 900),
  @('fig-4-tangent',     '?ch=4',              1440, 900),
  @('fig-5-english',     '?ch=1&lang=en',      1440, 900),
  @('fig-6-tablet',      '?ch=2',               820, 1180),
  @('fig-7-mobile',      '?ch=1',               390, 844)
)

$log = Join-Path $PSScriptRoot '_shots.log'
Set-Content -LiteralPath $log -Value ('start ' + (Get-Date -Format 'HH:mm:ss'))
''
foreach ($s in $shots) {
  $path = Join-Path $root ('docs\' + $s[0] + '.png')
  $line = $common + ' --window-size=' + $s[2] + ',' + $s[3] + ' --screenshot="' + $path + '" "' + $Base + $s[1] + '"'
  Start-Process -FilePath $edge -ArgumentList $line -NoNewWindow -Wait `
    -RedirectStandardOutput (Join-Path $tmp '_shot.out') `
    -RedirectStandardError  (Join-Path $tmp '_shot.err')
  if (Test-Path $path) {
    Add-Content -LiteralPath $log -Value ('{0,-20} {1,7:N0} KB' -f $s[0], ((Get-Item $path).Length / 1KB))
  } else {
    Add-Content -LiteralPath $log -Value ('FAILED ' + $s[0])
  }
}
Add-Content -LiteralPath $log -Value 'done'
