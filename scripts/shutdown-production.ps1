# Take letAIcook production offline (Firebase Hosting + Cloud Run API).
# Usage: .\scripts\shutdown-production.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [string]$Service = "letaicook-api"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: firebase CLI not found. npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

Write-Host "Shutting down production for project: $ProjectId"
Write-Host ""

Write-Host "1/2 Cloud Run: block public API ($Service) ..."
& $Gcloud run services update $Service `
    --project $ProjectId `
    --region $Region `
    --ingress internal `
    --quiet

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "2/2 Firebase Hosting: disable site ..."
firebase hosting:disable --project $ProjectId --force

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Production is offline."
Write-Host "  https://${ProjectId}.web.app will not serve the app until you redeploy."
Write-Host "  Cloud Run API is internal-only (not reachable from the public internet)."
Write-Host ""
Write-Host "To bring it back after fixes:"
Write-Host "  .\scripts\redeploy-production.ps1 -ProjectId $ProjectId"
