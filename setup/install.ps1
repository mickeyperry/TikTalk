<#
  TikTalk — register the panel with After Effects. No Adobe certification,
  no ZXP installer, no admin rights needed.

  What it does:
    1. Enables CEP PlayerDebugMode (lets unsigned panels load) for CSXS 9-13.
    2. Installs the panel into the per-user CEP extensions directory.
       -Mode copy : copies the files there (default — for normal installs)
       -Mode link : junction-links this folder (for development; edits are live)

  Usage:
      powershell -ExecutionPolicy Bypass -File .\install.ps1
      powershell -ExecutionPolicy Bypass -File .\install.ps1 -Mode link
  Then fully quit and reopen After Effects:
      Window > Extensions > TikTalk
#>
param([ValidateSet("copy", "link")][string]$Mode = "copy")

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$id   = "com.mickeyperry.tiktalk"
$oldId = "com.proceduraltitles.panel"

Write-Host ""
Write-Host "  TikTalk installer" -ForegroundColor Magenta
Write-Host "  keeping up with the kids, one caption at a time" -ForegroundColor DarkGray
Write-Host ""

# 1. Allow unsigned extensions (per-user, no admin).
foreach ($v in 9..13) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1"
}
Write-Host "  [1/2] Unsigned panels enabled (PlayerDebugMode, CSXS 9-13)." -ForegroundColor Green

# 2. Install into the per-user CEP extensions folder.
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Remove any previous install (old name or new), junction or real folder.
foreach ($name in @($id, $oldId)) {
    $existing = Join-Path $dest $name
    if (Test-Path $existing) {
        $item = Get-Item $existing -Force
        if ($item.LinkType) { $item.Delete() }            # junction/symlink: remove link only
        else { Remove-Item $existing -Recurse -Force }    # real folder: remove copy
        Write-Host "        removed previous install: $name" -ForegroundColor DarkGray
    }
}

$target = Join-Path $dest $id
if ($Mode -eq "link") {
    New-Item -ItemType Junction -Path $target -Target $root | Out-Null
    Write-Host "  [2/2] Linked (dev mode): $target -> $root" -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    # Copy everything except dev clutter. bin/ is included if you already
    # downloaded the engine, so it doesn't re-download after reinstalling.
    $exclude = @(".git", "dist", "node_modules")
    Get-ChildItem $root -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
        Copy-Item $_.FullName -Destination $target -Recurse -Force
    }
    Write-Host "  [2/2] Installed to: $target" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Done! Now restart After Effects completely, then:" -ForegroundColor Magenta
Write-Host "  Window > Extensions > TikTalk" -ForegroundColor White
Write-Host ""
Write-Host "  First time? Click 'Download engine' inside the panel" -ForegroundColor DarkGray
Write-Host "  (or run setup\setup.ps1) to fetch whisper + ffmpeg + model." -ForegroundColor DarkGray
Write-Host ""
