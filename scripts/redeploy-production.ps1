# Full production redeploy: API env + Cloud Run API (web: deploy-web-cloudrun.ps1).
# Usage: .\scripts\redeploy-production.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [switch]$SkipEnv
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

if (-not $SkipEnv) {
    $envFile = Join-Path $RepoRoot "deploy\cloudrun-env.yaml"
    if (Test-Path $envFile) {
        Write-Host "Applying Cloud Run env from deploy\cloudrun-env.yaml ..."
        & (Join-Path $RepoRoot "scripts\set-cloudrun-env.ps1") -ProjectId $ProjectId -Region $Region
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        Write-Host "WARN: deploy\cloudrun-env.yaml missing. Copy from deploy\cloudrun-env.sample.yaml" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Deploying API to Cloud Run ..."
& (Join-Path $RepoRoot "scripts\deploy-api-cloudrun.ps1") -ProjectId $ProjectId -Region $Region
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

Write-Host "Restoring public API access (ingress=all) ..."
& $Gcloud run services update letaicook-api `
    --project $ProjectId `
    --region $Region `
    --ingress all `
    --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$WebUrl = & $Gcloud run services describe letaicook-web --project $ProjectId --region $Region --format="value(status.url)" 2>$null
if ($WebUrl) {
    Write-Host ""
    Write-Host "Setting API CORS for Cloud Run web + local dev ..."
    $env:CORS_ORIGINS = "$WebUrl,http://localhost:3000"
    python (Join-Path $RepoRoot "scripts\ci-merge-cloudrun-env.py") letaicook-api $Region $ProjectId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ApiUrl = & $Gcloud run services describe letaicook-api --project $ProjectId --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "API redeployed: $ApiUrl"
if ($WebUrl) {
    Write-Host "Web app (production): $WebUrl"
} else {
    Write-Host "Web: run .\scripts\deploy-web-cloudrun.ps1"
}
Write-Host "Firestore rules: .\scripts\deploy-firestore-rules.ps1"
