param(
    [int]$Port = 8772,
    [switch]$Foreground,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$projectDir = Join-Path $PSScriptRoot "CosyVoice"
$python = Join-Path $projectDir ".venv\Scripts\python.exe"
$modelDir = Join-Path $projectDir "pretrained_models\CosyVoice-300M-SFT"
$runtimeDir = Join-Path $projectDir ".runtime\sft-webui"
$url = "http://127.0.0.1:$Port/"

if (-not (Test-Path -LiteralPath $python)) {
    throw "CosyVoice Python environment is missing: $python"
}
if (-not (Test-Path -LiteralPath $modelDir)) {
    throw "CosyVoice SFT model is missing: $modelDir"
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "CosyVoice SFT is already listening at $url (PID $($listener[0].OwningProcess))."
    if ($OpenBrowser) { Start-Process $url }
    return
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
$env:MODELSCOPE_CACHE = Join-Path $PSScriptRoot ".cache\modelscope"
$env:GRADIO_ANALYTICS_ENABLED = "False"
$env:NO_PROXY = "127.0.0.1,localhost"
$env:no_proxy = "127.0.0.1,localhost"
$arguments = @("webui.py", "--port", "$Port", "--model_dir", "$modelDir")

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

Write-Host "CosyVoice SFT starting at $url (PID $($process.Id))."
Write-Host "Model: $modelDir"
Write-Host "Logs: $stdout and $stderr"
if ($OpenBrowser) { Start-Process $url }
