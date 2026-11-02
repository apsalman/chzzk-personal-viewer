$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$node = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $node) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $node = $bundledNode }
}
if (-not $node) { Write-Host 'Node.js 22 이상을 설치해 주세요.'; Read-Host; exit 1 }
if (-not (Test-Path -LiteralPath 'public\vendor\hls.min.js')) {
    New-Item -ItemType Directory -Force -Path 'public\vendor' | Out-Null
    Write-Host 'HLS 재생기를 내려받는 중...'
    try { Invoke-WebRequest -UseBasicParsing -Uri 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js' -OutFile 'public\vendor\hls.min.js' }
    catch { Write-Host 'HLS 재생기를 내려받지 못했습니다. 인터넷 연결을 확인하고 다시 실행해 주세요.'; Read-Host; exit 1 }
}
$running = $false
try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3131/api/health' -TimeoutSec 2; $running = $health.ok -eq $true } catch {}
if ($running) { Start-Process 'http://127.0.0.1:3131'; exit }
$server = Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3131/api/health' -TimeoutSec 1
        if ($health.ok) { Start-Process 'http://127.0.0.1:3131'; exit }
    } catch {}
    if ($server.HasExited) { break }
}
Write-Host '서버를 시작하지 못했습니다. node server.mjs 로 실행해서 오류를 확인해 주세요.'
Read-Host
