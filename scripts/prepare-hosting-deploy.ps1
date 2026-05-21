# Prepare apps/web/.env.production.local for Cloud Run web deploy (legacy name: hosting).
# Fetches Cloud Run URL and merges Firebase vars from apps/web/.env.local when possible.

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [string]$Service = "letaicook-api"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WebDir = Join-Path $RepoRoot "apps\web"
$ProdEnv = Join-Path $WebDir ".env.production.local"
$LocalEnv = Join-Path $WebDir ".env.local"
$Sample = Join-Path $WebDir "production.env.sample"

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

$ApiUrl = & $Gcloud run services describe $Service `
    --project $ProjectId `
    --region $Region `
    --format="value(status.url)"

if (-not $ApiUrl) {
    Write-Host "ERROR: Could not read Cloud Run URL. Deploy API first." -ForegroundColor Red
    exit 1
}

Write-Host "Cloud Run API URL: $ApiUrl"

function Read-DotEnv([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    foreach ($line in Get-Content $path) {
        if ($line -match '^\s*#' -or $line -notmatch '^\s*([^#=]+)=(.*)$') { continue }
        $map[$Matches[1].Trim()] = $Matches[2].Trim()
    }
    return $map
}

function Set-Or-Add-Line([string]$content, [string]$key, [string]$value) {
    $pattern = "(?m)^$([regex]::Escape($key))=.*$"
    $line = "${key}=$value"
    if ($content -match $pattern) {
        return [regex]::Replace($content, $pattern, $line)
    }
    return ($content.TrimEnd() + "`n$line`n")
}

$prod = @{}
if (Test-Path $ProdEnv) {
    $prod = Read-DotEnv $ProdEnv
} elseif (Test-Path $Sample) {
    Copy-Item $Sample $ProdEnv
    Write-Host "Created $ProdEnv from production.env.sample"
    $prod = Read-DotEnv $ProdEnv
} else {
    Set-Content $ProdEnv "NEXT_PUBLIC_API_BASE_URL=$ApiUrl`n"
    $prod = Read-DotEnv $ProdEnv
}

$local = Read-DotEnv $LocalEnv
$firebaseKeys = @(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
)

$content = if (Test-Path $ProdEnv) { Get-Content $ProdEnv -Raw } else { "" }

foreach ($key in $firebaseKeys) {
    $val = $prod[$key]
    if ((-not $val -or $val -eq "") -and $local[$key]) {
        $content = Set-Or-Add-Line $content $key $local[$key]
    }
}

$content = Set-Or-Add-Line $content "NEXT_PUBLIC_API_BASE_URL" $ApiUrl
if ($content -match "NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true") {
    $content = $content -replace "(?m)^NEXT_PUBLIC_USE_FIREBASE_EMULATOR=.*$", ""
}

Set-Content -Path $ProdEnv -Value $content.TrimEnd() -NoNewline
Add-Content -Path $ProdEnv -Value ""

Write-Host "Updated $ProdEnv"
$check = Read-DotEnv $ProdEnv
. (Join-Path $RepoRoot "scripts\lib\web-production-env.ps1")
$missing = Test-WebProductionEnv $check
if ($missing.Count -gt 0) {
    Write-Host "ERROR: Missing in .env.production.local: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Fill apps/web/.env.local from firebase.web.env.sample, then re-run this script."
    Write-Host "Or copy values from Firebase Console -> Project settings -> Your apps"
    exit 1
}
Write-Host "Firebase + API URL ready for production build."
