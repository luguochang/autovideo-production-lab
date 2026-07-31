param(
    [int]$Port = 8501,
    [switch]$Foreground,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$projectDir = Join-Path $PSScriptRoot "ClearerVoice-Studio"
$python = Join-Path $projectDir ".venv\Scripts\python.exe"
$app = Join-Path $projectDir "clearvoice\streamlit_app.py"
$logDir = Join-Path $projectDir "logs"
$url = "http://127.0.0.1:$Port"

if (-not (Test-Path $python)) { throw "ClearerVoice Python environment is missing: $python" }
if (-not (Test-Path $app)) { throw "ClearerVoice Streamlit app is missing: $app" }

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "ClearerVoice is already listening at $url (PID $($listener[0].OwningProcess))."
    if ($OpenBrowser) { Start-Process $url }
    return
}

New-Item -ItemType Directory -Force $logDir | Out-Null
$env:STREAMLIT_BROWSER_GATHER_USAGE_STATS = "false"
$arguments = @("-m", "streamlit", "run", "clearvoice\streamlit_app.py", "--server.address", "127.0.0.1", "--server.port", "$Port", "--server.headless", "true", "--browser.gatherUsageStats", "false")

if ($Foreground) {
    Push-Location $projectDir
    try { & $python @arguments } finally { Pop-Location }
    return
}

$stdout = Join-Path $logDir "streamlit-$Port.stdout.log"
$stderr = Join-Path $logDir "streamlit-$Port.stderr.log"
$process = Start-Process -FilePath $python -ArgumentList $arguments `
    -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$process.Id | Set-Content -Encoding ascii (Join-Path $logDir "streamlit-$Port.pid")

Write-Host "ClearerVoice starting at $url (PID $($process.Id))."
Write-Host "Logs: $stdout and $stderr"
if ($OpenBrowser) { Start-Process $url }

