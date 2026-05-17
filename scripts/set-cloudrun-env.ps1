# Apply Cloud Run env vars from YAML (fixes comma-in-CORS gcloud parsing on Windows).
# Usage:
#   1. Copy deploy/cloudrun-env.sample.yaml -> deploy/cloudrun-env.yaml
#   2. Edit deploy/cloudrun-env.yaml (GOOGLE_API_KEY, CORS_ORIGINS)
#   3. .\scripts\set-cloudrun-env.ps1

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [string]$Service = "letaicook-api",
    [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

if (-not $EnvFile) {
    $EnvFile = Join-Path $RepoRoot "deploy\cloudrun-env.yaml"
}

if (-not (Test-Path $EnvFile)) {
    $sample = Join-Path $RepoRoot "deploy\cloudrun-env.sample.yaml"
    Write-Host "ERROR: Missing $EnvFile" -ForegroundColor Red
    Write-Host "Copy $sample to deploy\cloudrun-env.yaml and add your GOOGLE_API_KEY." -ForegroundColor Yellow
    exit 1
}

if ((Get-Content $EnvFile -Raw) -match "YOUR_GEMINI") {
    Write-Host "ERROR: Replace YOUR_GEMINI_API_KEY in deploy\cloudrun-env.yaml before running." -ForegroundColor Red
    exit 1
}

Write-Host "Applying env from $EnvFile to $Service ($Region) ..."
& $Gcloud run services update $Service `
    --project $ProjectId `
    --region $Region `
    --env-vars-file $EnvFile

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$Url = & $Gcloud run services describe $Service --region $Region --project $ProjectId --format="value(status.url)"
Write-Host ""
Write-Host "Done. API URL: $Url"
Write-Host "Use this for NEXT_PUBLIC_API_BASE_URL in apps/web/.env.production.local"
