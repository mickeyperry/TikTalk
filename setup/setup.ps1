<#
  TikTalk - one-time engine setup.
  Downloads ffmpeg, whisper.cpp (CPU) and a Whisper model into ..\bin\.
  (The panel's "Download engine" button runs this same script.)

  Usage (from PowerShell):
      cd "<this folder>"
      powershell -ExecutionPolicy Bypass -File .\setup.ps1            # base model
      powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Model small
  Valid models: tiny base small medium large-v3  (and .en variants, e.g. base.en)
#>
param([string]$Model = "base")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root   = Split-Path -Parent $PSScriptRoot
$bin    = Join-Path $root "bin"
$models = Join-Path $bin  "models"
New-Item -ItemType Directory -Force -Path $bin    | Out-Null
New-Item -ItemType Directory -Force -Path $models | Out-Null

function Get-Zip($url, $dest) {
    $zip = Join-Path $env:TEMP ("pt_" + [guid]::NewGuid().ToString("N") + ".zip")
    Write-Host "  downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Write-Host "  extracting..."
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Remove-Item $zip -Force
}

# Returns the full path of an exe already installed on this machine (PATH), or $null.
function Find-OnPath($name) {
    $c = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Source }
    return $null
}

# ---------- ffmpeg ----------
$ffmpegExe = Join-Path $bin "ffmpeg.exe"
$ffmpegSys = Find-OnPath "ffmpeg.exe"
if (Test-Path $ffmpegExe) {
    Write-Host "ffmpeg: already present."
} elseif ($ffmpegSys) {
    $ffmpegExe = $ffmpegSys
    Write-Host "ffmpeg: found on this PC, skipping download ($ffmpegSys)."
} else {
    Write-Host "ffmpeg: installing..."
    $tmp = Join-Path $env:TEMP ("ff_" + [guid]::NewGuid().ToString("N"))
    Get-Zip "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" $tmp
    $exe = Get-ChildItem $tmp -Recurse -Filter ffmpeg.exe | Select-Object -First 1
    Copy-Item $exe.FullName $ffmpegExe -Force
    Remove-Item $tmp -Recurse -Force
    Write-Host "  -> $ffmpegExe"
}

# ---------- whisper.cpp ----------
$whisperExe = Join-Path $bin "whisper-cli.exe"
$whisperSys = Find-OnPath "whisper-cli.exe"
if (Test-Path $whisperExe) {
    Write-Host "whisper.cpp: already present."
} elseif ($whisperSys) {
    $whisperExe = $whisperSys
    Write-Host "whisper.cpp: found on this PC, skipping download ($whisperSys)."
} else {
    Write-Host "whisper.cpp: installing..."
    # Not every release ships binaries (tagged vX.Y.Z ones are often empty), so walk
    # back through recent releases until one has the plain CPU x64 build.
    $rels = Invoke-RestMethod "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30" `
        -Headers @{ "User-Agent" = "tiktalk" } -UseBasicParsing
    $asset = $null
    foreach ($rel in $rels) {
        $asset = $rel.assets | Where-Object { $_.name -eq "whisper-bin-x64.zip" } | Select-Object -First 1
        if (-not $asset) {
            $asset = $rel.assets | Where-Object { $_.name -match "bin.*x64.*\.zip$" -and $_.name -notmatch "cublas|cuda|blas|arm" } | Select-Object -First 1
        }
        if ($asset) { Write-Host "  using release $($rel.tag_name)"; break }
    }
    if (-not $asset) { throw "Could not find a Windows x64 whisper.cpp build in recent releases. Download manually into $bin." }

    $tmp = Join-Path $env:TEMP ("wh_" + [guid]::NewGuid().ToString("N"))
    Get-Zip $asset.browser_download_url $tmp

    # Copy the whole folder that contains the exe (it ships ggml/whisper DLLs alongside).
    $found = Get-ChildItem $tmp -Recurse -Include "whisper-cli.exe", "main.exe" | Select-Object -First 1
    if (-not $found) { throw "Extracted whisper build but found no whisper-cli.exe / main.exe in $tmp" }
    Copy-Item (Join-Path $found.DirectoryName "*") $bin -Recurse -Force

    if (-not (Test-Path $whisperExe)) {
        $mainExe = Join-Path $bin "main.exe"
        if (Test-Path $mainExe) { Copy-Item $mainExe $whisperExe -Force }  # older builds call it main.exe
    }
    Remove-Item $tmp -Recurse -Force
    Write-Host "  -> $whisperExe"
}

# ---------- model ----------
$modelFile = Join-Path $models ("ggml-" + $Model + ".bin")
if (Test-Path $modelFile) {
    Write-Host "model: ggml-$Model.bin already present."
} else {
    Write-Host "model: downloading ggml-$Model.bin (this can be large)..."
    $murl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$Model.bin"
    Invoke-WebRequest -Uri $murl -OutFile $modelFile -UseBasicParsing
    Write-Host "  -> $modelFile"
}

Write-Host ""
Write-Host "Done. Paths for the panel's Settings (or click 'Auto-fill from bin/'):" -ForegroundColor Green
Write-Host "  whisper-cli : $whisperExe"
Write-Host "  model       : $modelFile"
Write-Host "  ffmpeg      : $ffmpegExe"
