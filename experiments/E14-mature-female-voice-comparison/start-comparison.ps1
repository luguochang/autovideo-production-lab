param([int]$Port = 8771)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root "..\..\tools\voice-lab\bootstrap\Scripts\python.exe"
$url = "http://127.0.0.1:$Port/"
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "Comparison page is already listening at $url (PID $($listener[0].OwningProcess))."
    return
}

New-Item -ItemType Directory -Force (Join-Path $root "logs") | Out-Null
$process = Start-Process -FilePath $python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $root) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $root "logs\server.stdout.log") `
    -RedirectStandardError (Join-Path $root "logs\server.stderr.log")
$process.Id | Set-Content -Encoding ascii (Join-Path $root "logs\server.pid")
Write-Host "Comparison page starting at $url (PID $($process.Id))."
