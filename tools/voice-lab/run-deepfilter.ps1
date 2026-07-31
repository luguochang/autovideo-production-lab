param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$projectDir = Join-Path $PSScriptRoot "DeepFilterNet"
$command = Join-Path $projectDir ".venv\Scripts\deepFilter.exe"
$resolvedInput = (Resolve-Path $InputPath).Path

if (-not (Test-Path $command)) {
    throw "DeepFilterNet command is missing: $command"
}

if (-not $OutputDir) {
    $OutputDir = Join-Path (Split-Path $resolvedInput -Parent) "deepfilter-output"
}
New-Item -ItemType Directory -Force $OutputDir | Out-Null

& $command $resolvedInput --output-dir $OutputDir --log-level info
if ($LASTEXITCODE -ne 0) {
    throw "DeepFilterNet failed with exit code $LASTEXITCODE"
}

Write-Host "Enhanced audio written to: $((Resolve-Path $OutputDir).Path)"

