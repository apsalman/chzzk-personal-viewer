$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$meta = Invoke-RestMethod 'https://registry.npmjs.org/electron/latest'
$version = $meta.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Electron version' }
$archiveName = "electron-v$version-win32-x64.zip"
$cache = Join-Path $PSScriptRoot '.build-cache'
$output = Join-Path $PSScriptRoot 'dist\Azzzt'
$legacyOutput = Join-Path $PSScriptRoot 'dist\ChzzkViewer'
if ((Test-Path -LiteralPath $legacyOutput) -and -not (Test-Path -LiteralPath $output)) {
    $resolvedLegacy = (Resolve-Path -LiteralPath $legacyOutput).Path
    $resolvedOutput = [IO.Path]::GetFullPath($output)
    if ([IO.Path]::GetDirectoryName($resolvedLegacy) -ne [IO.Path]::GetDirectoryName($resolvedOutput)) { throw 'Unexpected application migration path' }
    Move-Item -LiteralPath $resolvedLegacy -Destination $resolvedOutput
    $legacyExecutable = Join-Path $resolvedOutput 'ChzzkViewer.exe'
    if (Test-Path -LiteralPath $legacyExecutable) { Rename-Item -LiteralPath $legacyExecutable -NewName 'Azzzt.exe' }
}
New-Item -ItemType Directory -Force $cache,$output | Out-Null
$archive = Join-Path $cache $archiveName
$release = "https://github.com/electron/electron/releases/download/v$version"
Write-Host "Downloading Electron $version..."
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri "$release/$archiveName" -OutFile $archive }
$checksums = (Invoke-WebRequest -Uri "$release/SHASUMS256.txt").Content
if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
$expected = ($checksums -split "`n" | Where-Object { $_ -match "\s+\*?$([regex]::Escape($archiveName))\s*$" }) -replace '\s+.*$', ''
if (-not $expected -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected.Trim()) { throw 'Electron checksum mismatch' }
Expand-Archive -LiteralPath $archive -DestinationPath $output -Force
Move-Item -LiteralPath (Join-Path $output 'electron.exe') -Destination (Join-Path $output 'Azzzt.exe') -Force
& (Join-Path $PSScriptRoot 'set-app-icon.ps1') -Executable (Join-Path $output 'Azzzt.exe')
$appMetadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
& (Join-Path $PSScriptRoot 'set-app-metadata.ps1') -Executable (Join-Path $output 'Azzzt.exe') -Version $appMetadata.version
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'setup-captions.ps1') -Destination $output -Force
$appRoot = Join-Path $output 'resources\app'
New-Item -ItemType Directory -Force $appRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'desktop'),(Join-Path $PSScriptRoot 'public') -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'server.mjs') -Destination $appRoot -Force
[pscustomobject]@{name=$appMetadata.name;productName=$appMetadata.productName;version=$appMetadata.version;main='desktop/main.cjs';type='module'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appRoot 'package.json') -Encoding UTF8
$version | Set-Content -LiteralPath (Join-Path $output 'electron-version.txt') -Encoding UTF8
Write-Host "Ready: $output\Azzzt.exe"
