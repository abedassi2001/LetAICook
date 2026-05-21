# Disable Firebase Hosting (letaicook.web.app). Production web UI is Cloud Run only.
# Usage: .\scripts\disable-firebase-hosting.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "Install Firebase CLI: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

Write-Host "Disabling Firebase Hosting for project: $ProjectId"
Write-Host "(Web app URL is Cloud Run — see deploy/README.md)"
Write-Host ""
firebase hosting:disable --project $ProjectId --force

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Done. https://${ProjectId}.web.app should no longer serve the app."
Write-Host "Use your Cloud Run web URL (from deploy-web-cloudrun.ps1 or gcloud run services describe letaicook-web)."
