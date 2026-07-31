[CmdletBinding()]
param(
    [switch]$IncludeResearchVendors
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OverlayRoot = Join-Path $RepoRoot 'tools\voice-lab\project-overlays'

function Install-PinnedRepository {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Commit,
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [string]$OverlayName
    )

    $target = Join-Path $RepoRoot $RelativePath
    if (Test-Path -LiteralPath $target) {
        Write-Host "SKIP ${Name}: target already exists at $RelativePath"
        return
    }

    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $parent -Force | Out-Null

    Write-Host "CLONE $Name"
    & git clone --filter=blob:none $Url $target
    if ($LASTEXITCODE -ne 0) {
        throw "git clone failed for $Name"
    }

    & git -C $target checkout --detach $Commit
    if ($LASTEXITCODE -ne 0) {
        throw "git checkout failed for $Name at $Commit"
    }

    if ($OverlayName) {
        $overlay = Join-Path $OverlayRoot $OverlayName
        if (Test-Path -LiteralPath $overlay) {
            Write-Host "OVERLAY $Name from tools/voice-lab/project-overlays/$OverlayName"
            Copy-Item -Path (Join-Path $overlay '*') -Destination $target -Recurse -Force
        }
    }

    $actual = (& git -C $target rev-parse HEAD).Trim()
    if ($actual -ne $Commit) {
        throw "$Name restored at unexpected commit $actual"
    }

    Write-Host "OK $Name @ $actual"
}

Install-PinnedRepository `
    -Name 'ClearerVoice-Studio' `
    -Url 'https://github.com/modelscope/ClearerVoice-Studio.git' `
    -Commit '6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61' `
    -RelativePath 'tools\voice-lab\ClearerVoice-Studio'

Install-PinnedRepository `
    -Name 'CosyVoice' `
    -Url 'https://github.com/FunAudioLLM/CosyVoice.git' `
    -Commit '074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc' `
    -RelativePath 'tools\voice-lab\CosyVoice' `
    -OverlayName 'CosyVoice'

Install-PinnedRepository `
    -Name 'Qwen3-TTS' `
    -Url 'https://github.com/QwenLM/Qwen3-TTS.git' `
    -Commit '022e286b98fbec7e1e916cb940cdf532cd9f488e' `
    -RelativePath 'tools\voice-lab\Qwen3-TTS' `
    -OverlayName 'Qwen3-TTS'

Install-PinnedRepository `
    -Name 'VoxCPM' `
    -Url 'https://github.com/OpenBMB/VoxCPM.git' `
    -Commit '616d3d3e630a9c96c2853250eef91b0f39dcd5fa' `
    -RelativePath 'tools\voice-lab\VoxCPM' `
    -OverlayName 'VoxCPM'

if ($IncludeResearchVendors) {
    Install-PinnedRepository `
        -Name 'HyperFrames' `
        -Url 'https://github.com/heygen-com/hyperframes.git' `
        -Commit '10b3351974766b0effd99dce6be356787c6af89c' `
        -RelativePath 'vendor\hyperframes'

    Install-PinnedRepository `
        -Name 'HyperFrames Student Kit' `
        -Url 'https://github.com/nateherkai/hyperframes-student-kit.git' `
        -Commit 'a89e704ffbad02ac71170755526e05432598be59' `
        -RelativePath 'vendor\hyperframes-student-kit'

    Install-PinnedRepository `
        -Name 'Motion Canvas' `
        -Url 'https://github.com/motion-canvas/motion-canvas.git' `
        -Commit '7b91435c301d530351dcf5ebb91dd139c002e405' `
        -RelativePath 'vendor\motion-canvas'

    Install-PinnedRepository `
        -Name 'Revideo' `
        -Url 'https://github.com/midrender/revideo.git' `
        -Commit 'b5de67a009a55aa2768a1e178b0446b2479a0b4e' `
        -RelativePath 'vendor\revideo'
}

Write-Host ''
Write-Host 'Third-party source restore complete.'
Write-Host 'Model weights and Python environments were intentionally not installed.'
Write-Host 'Next: read README.md for environment and model recovery steps.'
