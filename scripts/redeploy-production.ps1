# Full production redeploy: API env + Cloud Run + web hosting.
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

Write-Host ""
Write-Host "Preparing web production env and deploying Hosting ..."
& (Join-Path $RepoRoot "scripts\prepare-hosting-deploy.ps1") -ProjectId $ProjectId -Region $Region
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $RepoRoot "scripts\deploy-hosting.ps1") -ProjectId $ProjectId -SkipPrepare
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Production is live again at https://${ProjectId}.web.app"
