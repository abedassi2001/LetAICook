# Deploy Firestore rules only (Firebase Hosting retired — web is on Cloud Run).
# Usage: .\scripts\deploy-firestore-rules.ps1
#        .\scripts\deploy-hosting.ps1   # alias, same behavior

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

Write-Host ""
Write-Host "NOTE: Firebase Hosting (letaicook.web.app) is not used for the web UI." -ForegroundColor Yellow
Write-Host "      Deploy the app with: .\scripts\deploy-web-cloudrun.ps1" -ForegroundColor Yellow
Write-Host "      To disable old Hosting: .\scripts\disable-firebase-hosting.ps1" -ForegroundColor Yellow
Write-Host ""

Write-Host "Deploying Firestore rules to $ProjectId ..."
firebase deploy --only firestore:rules --project $ProjectId

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Firestore rules deployed."
