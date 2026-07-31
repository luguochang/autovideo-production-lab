param(
    [string]$Device = "cuda",
    [string]$Output = "",
    [switch]$CheckOnly,
    [switch]$VerifyHash
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$Script = Join-Path $Root "voice_design_mature_female.py"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "VoxCPM virtual environment is missing: $Python"
}

$Arguments = @($Script, "--device", $Device)
if ($Output) {
    $Arguments += @("--output", $Output)
}
if ($CheckOnly) {
    $Arguments += "--check-only"
}
if ($VerifyHash) {
    $Arguments += "--verify-hash"
}

& $Python @Arguments
exit $LASTEXITCODE
