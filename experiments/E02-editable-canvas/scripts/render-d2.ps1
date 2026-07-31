$ErrorActionPreference = "Stop"

$version = "v0.7.1"
$experimentRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $env:TEMP "autovideo-e02-d2-$version"
$archive = Join-Path $env:TEMP "d2-$version-windows-amd64.tar.gz"
$executable = Join-Path $toolRoot "bin\d2.exe"
$outputRoot = Join-Path $experimentRoot "output"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

if (-not (Test-Path -LiteralPath $executable)) {
  New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
  if (-not (Test-Path -LiteralPath $archive)) {
    $url = "https://github.com/terrastruct/d2/releases/download/$version/d2-$version-windows-amd64.tar.gz"
    Invoke-WebRequest -Uri $url -OutFile $archive
  }
  tar -xzf $archive -C $toolRoot --strip-components=1
}

& $executable --version
& $executable --layout=elk `
  (Join-Path $experimentRoot "fixtures\diagram.d2") `
  (Join-Path $outputRoot "d2.svg")
