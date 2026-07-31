param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [double]$TargetLufs = -16
)

$ErrorActionPreference = "Stop"
$inputFile = (Resolve-Path $InputPath).Path
$outputDirectory = Split-Path $OutputPath -Parent
if ($outputDirectory) {
    New-Item -ItemType Directory -Force $outputDirectory | Out-Null
}

$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$firstPass = (& ffmpeg -hide_banner -i $inputFile `
    -af "loudnorm=I=${TargetLufs}:TP=-1.5:LRA=11:print_format=json" `
    -f null NUL 2>&1) | Out-String
$firstPassExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($firstPassExitCode -ne 0) {
    throw "ffmpeg loudness measurement failed with exit code $firstPassExitCode"
}
$match = [regex]::Match($firstPass, '\{\s*"input_i"[\s\S]*?\}')
if (-not $match.Success) {
    throw "Could not parse ffmpeg loudnorm measurements for $inputFile"
}
$stats = $match.Value | ConvertFrom-Json
$filter = "loudnorm=I=${TargetLufs}:TP=-1.5:LRA=11:" +
    "measured_I=$($stats.input_i):measured_TP=$($stats.input_tp):" +
    "measured_LRA=$($stats.input_lra):measured_thresh=$($stats.input_thresh):" +
    "offset=$($stats.target_offset):linear=true:print_format=summary"

$ErrorActionPreference = "Continue"
& ffmpeg -y -hide_banner -loglevel warning -i $inputFile -af $filter `
    -ar 48000 -ac 1 -c:a pcm_s16le $OutputPath
$secondPassExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($secondPassExitCode -ne 0) {
    throw "ffmpeg loudness normalization failed with exit code $secondPassExitCode"
}

Write-Host "Normalized $inputFile -> $OutputPath"
