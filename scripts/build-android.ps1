$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidRoot = Join-Path $ProjectRoot "android-app"
$ToolsRoot = Join-Path $ProjectRoot ".android-build-tools"
$JdkRoot = Join-Path $ToolsRoot "jdk-17"
$GradleVersion = "8.13"
$GradleRoot = Join-Path $ToolsRoot "gradle-$GradleVersion"
$Version = (Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json).version
$AndroidSdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$BundledJdkCandidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "E:\Program Files\Android\Android Studio\jbr"
)
$JavaHome = $BundledJdkCandidates | Where-Object { Test-Path (Join-Path $_ "bin\java.exe") } | Select-Object -First 1

New-Item -ItemType Directory -Force -Path $ToolsRoot, (Join-Path $ProjectRoot "release") | Out-Null

if (-not $JavaHome -and -not (Test-Path (Join-Path $JdkRoot "bin\java.exe"))) {
    $JdkArchive = Join-Path $ToolsRoot "temurin17.zip"
    $JdkExtract = Join-Path $ToolsRoot "jdk-extract"
    Write-Host "Downloading portable Eclipse Temurin JDK 17..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $JdkArchive
    if (Test-Path $JdkExtract) { Remove-Item -Recurse -Force $JdkExtract }
    Expand-Archive -Path $JdkArchive -DestinationPath $JdkExtract -Force
    $ExtractedJdk = Get-ChildItem $JdkExtract -Directory | Select-Object -First 1
    Move-Item -LiteralPath $ExtractedJdk.FullName -Destination $JdkRoot
    Remove-Item -Recurse -Force $JdkExtract
}
if (-not $JavaHome) { $JavaHome = $JdkRoot }

if (-not (Test-Path (Join-Path $GradleRoot "bin\gradle.bat"))) {
    $GradleArchive = Join-Path $ToolsRoot "gradle-$GradleVersion-bin.zip"
    Write-Host "Downloading Gradle $GradleVersion..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://downloads.gradle.org/distributions/gradle-$GradleVersion-bin.zip" -OutFile $GradleArchive
    Expand-Archive -Path $GradleArchive -DestinationPath $ToolsRoot -Force
}

if (-not (Test-Path (Join-Path $AndroidSdk "platforms\android-36.1"))) {
    throw "Android SDK Platform 36.1 is missing: $AndroidSdk"
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:Path = "$(Join-Path $JavaHome 'bin');$(Join-Path $AndroidSdk 'platform-tools');$env:Path"

Set-Location $AndroidRoot
if (-not (Test-Path ".\gradlew.bat")) {
    & (Join-Path $GradleRoot "bin\gradle.bat") wrapper --gradle-version $GradleVersion --distribution-type bin
    if ($LASTEXITCODE -ne 0) { throw "Gradle wrapper generation failed with exit code $LASTEXITCODE" }
    (Get-Content ".\gradle\wrapper\gradle-wrapper.properties") `
        -replace "^distributionUrl=.*$", "distributionUrl=https\://downloads.gradle.org/distributions/gradle-$GradleVersion-bin.zip" |
        Set-Content ".\gradle\wrapper\gradle-wrapper.properties" -Encoding ASCII
}

& .\gradlew.bat --no-daemon clean assembleRelease
if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE" }

$SigningRoot = Join-Path $ToolsRoot "signing"
$Keystore = Join-Path $SigningRoot "deepseek-harness-release.p12"
$PasswordFile = Join-Path $SigningRoot "password.txt"
$KeyPasswordFile = Join-Path $SigningRoot "key-password.txt"
New-Item -ItemType Directory -Force -Path $SigningRoot | Out-Null

if (-not (Test-Path $Keystore) -or -not (Test-Path $PasswordFile)) {
    $RandomBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($RandomBytes)
    $Password = [Convert]::ToBase64String($RandomBytes).TrimEnd("=").Replace("+", "A").Replace("/", "B")
    Set-Content -LiteralPath $PasswordFile -Value $Password -Encoding ASCII -NoNewline
    & (Join-Path $JavaHome "bin\keytool.exe") `
        -genkeypair -noprompt `
        -keystore $Keystore -storetype PKCS12 `
        -storepass $Password -keypass $Password `
        -alias "deepseek-harness" -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=DeepSeek Harness, OU=Desktop Client, O=luoboovo, L=Local, ST=Local, C=CN"
    if ($LASTEXITCODE -ne 0) { throw "Android signing key generation failed with exit code $LASTEXITCODE" }
}
Copy-Item -LiteralPath $PasswordFile -Destination $KeyPasswordFile -Force

$BuildTools = if (Test-Path (Join-Path $AndroidSdk "build-tools\36.1.0")) {
    Join-Path $AndroidSdk "build-tools\36.1.0"
} else {
    (Get-ChildItem (Join-Path $AndroidSdk "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
}
$SourceApk = Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release-unsigned.apk"
$AlignedApk = Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release-aligned.apk"
$TargetApk = Join-Path $ProjectRoot "release\DeepSeekHarnessMobile-$Version.apk"

& (Join-Path $BuildTools "zipalign.exe") -f -p 4 $SourceApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "Android zipalign failed with exit code $LASTEXITCODE" }
& (Join-Path $BuildTools "apksigner.bat") sign `
    --ks $Keystore --ks-key-alias "deepseek-harness" `
    --ks-pass "file:$PasswordFile" --key-pass "file:$KeyPasswordFile" `
    --out $TargetApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "Android signing failed with exit code $LASTEXITCODE" }
& (Join-Path $BuildTools "apksigner.bat") verify --verbose $TargetApk
if ($LASTEXITCODE -ne 0) { throw "Android signature verification failed with exit code $LASTEXITCODE" }

Write-Host "Android APK: $TargetApk"
