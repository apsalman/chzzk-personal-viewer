param([switch]$EnableGpu)
$ErrorActionPreference = 'Stop'
$captionRoot = Join-Path $env:LOCALAPPDATA 'AZZZT\captions'
$captionPython = Join-Path $captionRoot 'runtime\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $captionPython)) {
    $pythonCandidates = @(
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
    )
    $pythonCandidates += @(Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch 'WindowsApps' } | Select-Object -ExpandProperty Source)
    $sourcePython = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $sourcePython) { throw 'Python 3.10 이상을 설치하고 다시 실행하세요: https://www.python.org/downloads/windows/' }
    New-Item -ItemType Directory -Force $captionRoot | Out-Null
    & $sourcePython -m venv (Join-Path $captionRoot 'runtime')
    if ($LASTEXITCODE -ne 0) { throw '자막 전용 Python 환경 생성 실패' }
}
& $captionPython -m pip install --disable-pip-version-check 'faster-whisper==1.2.1'
if ($LASTEXITCODE -ne 0) { throw '음성 인식 패키지 설치 실패' }
if ($EnableGpu) {
    & $captionPython -m pip install --disable-pip-version-check 'nvidia-cublas-cu12==12.4.5.8' 'nvidia-cudnn-cu12==9.1.0.70'
    if ($LASTEXITCODE -ne 0) { throw 'GPU 라이브러리 설치 실패' }
}
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
& $captionPython -c 'import os; from faster_whisper.utils import download_model; root=os.path.join(os.environ["LOCALAPPDATA"],"AZZZT","captions","models"); [download_model(name,output_dir=os.path.join(root,name)) for name in ("base","small")]; print("Korean caption models ready (base/small).")'
if ($LASTEXITCODE -ne 0) { throw '모델 다운로드 실패. 인터넷 연결을 확인하고 다시 실행하세요.' }
Write-Host '설치 완료. 앱에서 한국어 자막 켜기를 누르세요. 사용료와 API 키는 필요하지 않습니다.'
