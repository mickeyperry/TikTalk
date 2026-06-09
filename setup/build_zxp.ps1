<#
  TikTalk — build a .zxp package signed with a SELF-SIGNED certificate.
  No paid Adobe certification needed: ZXPSignCmd generates the cert itself.

  Notes:
    - The .zxp installs with any ZXP installer (e.g. aescripts ZXP Installer,
      Anastasiy's Extension Manager). Because the cert is self-signed, users
      still need PlayerDebugMode=1 OR an installer that handles that — which
      is why install.bat remains the recommended path.
    - The engine (bin/) is NOT packaged; the panel downloads it on first run.

  Usage:
      powershell -ExecutionPolicy Bypass -File .\build_zxp.ps1
  Output:
      dist\TikTalk.zxp
#>
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# ---------- ZXPSignCmd (Adobe's free signing tool) ----------
$signer = Join-Path $dist "ZXPSignCmd.exe"
if (-not (Test-Path $signer)) {
    Write-Host "Downloading ZXPSignCmd (Adobe CEP-Resources)..."
    $url = "https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.2/win64/ZXPSignCmd.exe"
    Invoke-WebRequest -Uri $url -OutFile $signer -UseBasicParsing
}

# ---------- self-signed certificate ----------
$cert = Join-Path $dist "tiktalk-selfsigned.p12"
$pass = "tiktalk"
if (-not (Test-Path $cert)) {
    Write-Host "Creating self-signed certificate..."
    & $signer -selfSignedCert IL TLV "Mickey Perry" "Mickey Perry" $pass $cert | Out-Host
    if (-not (Test-Path $cert)) { throw "Certificate creation failed." }
}

# ---------- stage files (exclude dev clutter + the big engine) ----------
$stage = Join-Path $env:TEMP ("tiktalk_zxp_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null
$exclude = @(".git", "dist", "bin", "node_modules", ".debug")
Get-ChildItem $root -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName -Destination $stage -Recurse -Force
}

# ---------- sign ----------
$zxp = Join-Path $dist "TikTalk.zxp"
if (Test-Path $zxp) { Remove-Item $zxp -Force }
Write-Host "Signing..."
& $signer -sign $stage $zxp $cert $pass -tsa "http://timestamp.digicert.com" | Out-Host
Remove-Item $stage -Recurse -Force

if (Test-Path $zxp) {
    Write-Host ""
    Write-Host "Built: $zxp" -ForegroundColor Green
    Write-Host "Install it with any ZXP installer, or just use install.bat." -ForegroundColor DarkGray
} else {
    throw "Signing failed - see ZXPSignCmd output above."
}
