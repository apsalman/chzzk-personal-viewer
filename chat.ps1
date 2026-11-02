param([string]$Channel)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

function Get-ChannelId([string]$Value) {
    $value = $Value.Trim()
    if ($value -match '^[a-fA-F0-9]{32}$') { return $value.ToLowerInvariant() }
    $uri = $null
    if ([Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -and
        $uri.Scheme -eq 'https' -and $uri.Host -eq 'chzzk.naver.com' -and
        $uri.AbsolutePath -match '^/(?:live/([a-fA-F0-9]{32})(?:/chat)?|chat/([a-fA-F0-9]{32}))/?$') {
        if ($Matches[1]) { return $Matches[1].ToLowerInvariant() }
        return $Matches[2].ToLowerInvariant()
    }
    return $null
}

$browserPaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browserPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) {
    [System.Windows.Forms.MessageBox]::Show('Google Chrome 또는 Microsoft Edge를 설치해 주세요.', '치지직 채팅') | Out-Null
    exit 1
}

while ($true) {
    if (-not $Channel) {
        $Channel = [Microsoft.VisualBasic.Interaction]::InputBox(
            '치지직 방송 주소 또는 채널 ID를 붙여 넣으세요.', '치지직 채팅', '')
        if (-not $Channel) { exit }
    }
    $id = Get-ChannelId $Channel
    if ($id) { break }
    [System.Windows.Forms.MessageBox]::Show(
        'https://chzzk.naver.com/live/채널ID 형식의 주소 또는 32자리 채널 ID를 입력해 주세요.',
        '주소 확인') | Out-Null
    $Channel = ''
}

Start-Process -FilePath $browser -ArgumentList @(
    "--app=https://chzzk.naver.com/live/$id/chat",
    '--window-size=420,820'
)
