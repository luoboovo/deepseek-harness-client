$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

New-Item -ItemType Directory -Force -Path ".npm-cache", ".electron-cache", ".electron-builder-cache" | Out-Null
$Version = (Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json).version
$BuildOutput = Join-Path $ProjectRoot ".electron-builder-output\$Version"
$ReleaseOutput = Join-Path $ProjectRoot "release"
New-Item -ItemType Directory -Force -Path $BuildOutput, $ReleaseOutput | Out-Null

$env:npm_config_cache = (Resolve-Path ".npm-cache").Path
$env:electron_config_cache = (Resolve-Path ".electron-cache").Path
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:ELECTRON_BUILDER_CACHE = (Resolve-Path ".electron-builder-cache").Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

if (-not (Test-Path ".\node_modules")) {
    npm install
}

if (-not (Test-Path ".\node_modules\electron\dist\electron.exe")) {
    node .\node_modules\electron\install.js
}

npm run dist:installer -- --config.directories.output="$BuildOutput"
if ($LASTEXITCODE -ne 0) { throw "Windows installer build failed with exit code $LASTEXITCODE" }

$InstallerName = "DeepSeekHarnessModern-Setup-$Version.exe"
$BuiltInstaller = Join-Path $BuildOutput $InstallerName
if (-not (Test-Path -LiteralPath $BuiltInstaller)) { throw "Windows installer was not created: $BuiltInstaller" }
Copy-Item -LiteralPath $BuiltInstaller -Destination (Join-Path $ReleaseOutput $InstallerName) -Force
Write-Host "Windows installer: $(Join-Path $ReleaseOutput $InstallerName)"
