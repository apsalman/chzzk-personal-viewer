$connections = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3131 -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $connections) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
    if ($processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match 'server\.mjs') {
        Stop-Process -Id $connection.OwningProcess
    }
}
