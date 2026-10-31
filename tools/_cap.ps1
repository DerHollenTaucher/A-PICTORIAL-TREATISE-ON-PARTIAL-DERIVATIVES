param(
  [string]$Url = 'http://127.0.0.1:8123/index.html?selftest=1',
  [string]$Out = 'e:\Partial Drivative\_dump.html',
  [int]$W = 1440,
  [int]$H = 900,
  [switch]$Shot,
  [string]$ShotPath = 'e:\Partial Drivative\_shot.png'
)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'C:\pdprof'
if (-not (Test-Path $prof)) { New-Item -ItemType Directory -Path $prof | Out-Null }
$common = '--headless=new --disable-gpu --enable-unsafe-swiftshader --no-first-run --no-default-browser-check --hide-scrollbars --user-data-dir="' + $prof + '" --virtual-time-budget=9000 --window-size=' + $W + ',' + $H
if ($Shot) {
  $line = $common + ' --screenshot="' + $ShotPath + '" "' + $Url + '"'
  Start-Process -FilePath $edge -ArgumentList $line -NoNewWindow -Wait -RedirectStandardOutput ($ShotPath + '.out') -RedirectStandardError ($ShotPath + '.err')
} else {
  $line = $common + ' --dump-dom "' + $Url + '"'
  Start-Process -FilePath $edge -ArgumentList $line -NoNewWindow -Wait -RedirectStandardOutput $Out -RedirectStandardError ($Out + '.err')
}
'script finished'
