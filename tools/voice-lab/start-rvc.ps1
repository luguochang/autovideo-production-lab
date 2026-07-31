param(
    [int]$Port = 7862,
    [switch]$Foreground,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$projectDir = Join-Path $PSScriptRoot "RVC-WebUI"
$python = Join-Path $projectDir ".venv\Scripts\python.exe"
$runtimeDir = Join-Path $projectDir ".runtime"
$url = "http://127.0.0.1:$Port"

if (-not (Test-Path $python)) {
    throw "RVC Python environment is missing: $python"
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "RVC is already listening at $url (PID $($listener[0].OwningProcess))."
    if ($OpenBrowser) { Start-Process $url }
    return
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
$env:GRADIO_ANALYTICS_ENABLED = "False"
$arguments = @("infer-web.py", "--port", "$Port", "--noautoopen")

if ($Foreground) {
    Push-Location $projectDir
    try {
        & $python @arguments
    } finally {
        Pop-Location
    }
    return
}

$stdout = Join-Path $runtimeDir "stdout.log"
$stderr = Join-Path $runtimeDir "stderr.log"
$process = Start-Process -FilePath $python -ArgumentList $arguments `
    -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$process.Id | Set-Content -Encoding ascii (Join-Path $runtimeDir "server.pid")

Write-Host "RVC starting at $url (PID $($process.Id))."
Write-Host "Logs: $stdout and $stderr"
if ($OpenBrowser) { Start-Process $url }

