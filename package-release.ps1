$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$runtimeRoot = Join-Path $PSScriptRoot 'dist\ChzzkViewer'
$zipPath = Join-Path $PSScriptRoot 'ChzzkViewer-Windows-x64.zip'
if (Test-Path -LiteralPath $zipPath) { throw "ZIP already exists: $zipPath" }
# Include runtime files and application source explicitly. Never walk the profile.
$runtimeFiles = @(
    'ChzzkViewer.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
    'd3dcompiler_47.dll', 'dxcompiler.dll', 'electron_wer.dll', 'ffmpeg.dll',
    'icudtl.dat', 'LICENSE', 'LICENSES.chromium.html', 'resources.pak',
    'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version',
    'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll', 'electron-version.txt'
)
$appFiles = @(
    'package.json', 'server.mjs', 'desktop\main.cjs', 'desktop\preload.cjs',
    'desktop\account.cjs', 'desktop\following.cjs', 'desktop\login-return.cjs',
    'desktop\navigation.cjs', 'desktop\window-settings.cjs', 'desktop\network.cjs', 'desktop\recorder.cjs', 'desktop\vod-download.cjs', 'desktop\pip-geometry.cjs', 'desktop\pip-preload.cjs', 'public\pip.html', 'public\pip.js', 'public\pip.css', 'public\player-keys.js', 'public\seekbar.js', 'public\live-handoff.js', 'public\capture.js', 'public\vod-chat.js', 'public\vod-download.js', 'public\app.js', 'public\index.html', 'public\style.css',
    'public\assets\logo.svg', 'public\assets\app.ico', 'public\assets\app.png', 'public\vendor\hls.min.js', 'public\vendor\hls.LICENSE'
)
$files = @()
foreach ($relative in $runtimeFiles) {
    $files += [pscustomobject]@{ Source = Join-Path $runtimeRoot $relative; Entry = 'ChzzkViewer/' + $relative }
}
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $runtimeRoot 'locales') -File -Filter '*.pak') {
    $files += [pscustomobject]@{ Source = $file.FullName; Entry = 'ChzzkViewer/locales/' + $file.Name }
}
foreach ($relative in $appFiles) {
    $files += [pscustomobject]@{ Source = Join-Path $runtimeRoot "resources\app\$relative"; Entry = 'ChzzkViewer/resources/app/' + $relative.Replace('\', '/') }
}
foreach ($file in $files) { if (-not (Test-Path -LiteralPath $file.Source -PathType Leaf)) { throw "Missing required file: $($file.Source)" } }
$archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.Source, $file.Entry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    $entry = $archive.CreateEntry('ChzzkViewer/README.txt')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try {
        $writer.Write(@'
치지직 로컬 뷰어 · Windows x64

1. ZIP 전체를 쓰기 가능한 폴더에 압축 해제하세요.
2. ChzzkViewer.exe를 실행하세요. EXE와 리소스 파일을 함께 유지하세요.
3. 방송 주소를 입력하거나, 네이버 로그인 후 팔로우 라이브를 선택하세요.

처음 실행하면 주소창은 비어 있습니다. 로그인 및 마지막 방송 주소 등 사용 데이터는
실행 파일 옆의 profile 폴더에 새로 저장됩니다. 다른 사람에게 재배포할 때는
profile 폴더를 포함하지 마세요.
녹화·리플레이는 FFmpeg가 필요합니다. FFmpeg를 설치하거나 tools/ffmpeg.exe에 넣으세요.
녹화 결과는 Recordings 폴더에 저장되며 이 폴더도 재배포 시 제외하세요.
다시보기에는 VOD 전체 다운로드 버튼이 표시됩니다. FFmpeg가 필요하며,
선택한 화질의 전체 영상을 Downloads 폴더에 MP4로 저장합니다.
Downloads 폴더도 개인 데이터이므로 재배포 시 제외하세요.

기능: 공식 채팅, 팔로우 라이브, 화질 선택, m3u8 주소 편집,
LIVE 버튼으로 최신 위치 이동, 채팅 경계선 드래그 크기 조절.

이 배포본에는 제작자의 로그인 프로필, 쿠키, 연결 기록, 시청 주소,
스크린샷을 포함하지 않았습니다. 네이버/치지직의 비공식 뷰어입니다.
Electron 및 Chromium의 라이선스는 LICENSE / LICENSES.chromium.html,
HLS.js 라이선스는 resources/app/public/vendor/hls.LICENSE에 있습니다.
'@)
    } finally { $writer.Dispose() }
} finally { $archive.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($check.Entries.FullName)
    $forbidden = $entries | Where-Object { $_ -match '(?i)(^|/)(profile|Recordings|Downloads|\.buffer|\.desktop-profile|\.build-cache)(/|$)|last-address\.json|login-diagnostics|\.log$|preview\.png$|Cookies|Local Storage|Login Data' }
    if ($forbidden) { throw "Unexpected personal data paths in archive: $($forbidden -join ', ')" }
    if ($entries.Count -ne $files.Count + 1) { throw 'Archive entry count mismatch' }
    if ($entries -notcontains 'ChzzkViewer/ChzzkViewer.exe' -or $entries -notcontains 'ChzzkViewer/resources/app/desktop/main.cjs') { throw 'Archive missing app entry points' }
    [pscustomobject]@{ Zip = $zipPath; Files = $entries.Count; SizeMB = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1); PersonalDataPaths = 0 } | ConvertTo-Json
} finally { $check.Dispose() }
