$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$PackageJson = Get-Content -Raw -LiteralPath (Join-Path $RepoRoot 'package.json') | ConvertFrom-Json
$Version = [string]$PackageJson.version
if (-not $Version) {
  throw 'package.json version is missing.'
}

npm run dist

$ReleaseDir = Join-Path $RepoRoot 'release-tauri'
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

$BundleDir = Join-Path $RepoRoot 'src-tauri\target\release\bundle\nsis'
$InstallerSource = Get-ChildItem -LiteralPath $BundleDir -Filter "*_${Version}_x64-setup.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$PortableSource = Join-Path $RepoRoot 'src-tauri\target\release\project-box.exe'

if (-not $InstallerSource) {
  throw "Installer was not found in $BundleDir for version $Version."
}

if (-not (Test-Path -LiteralPath $PortableSource)) {
  throw "Portable exe was not found: $PortableSource"
}

$InstallerTarget = Join-Path $ReleaseDir $InstallerSource.Name
$PortableTarget = Join-Path $ReleaseDir "project-box-${Version}.exe"

Copy-Item -LiteralPath $InstallerSource.FullName -Destination $InstallerTarget -Force
Copy-Item -LiteralPath $PortableSource -Destination $PortableTarget -Force

Get-Item -LiteralPath $InstallerTarget, $PortableTarget |
  Select-Object FullName, Length, LastWriteTime |
  Format-Table -AutoSize
