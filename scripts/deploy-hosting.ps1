# Deploy Firestore rules + Firebase Hosting (Next.js).
# Usage: .\scripts\deploy-hosting.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook",
    [switch]$SkipPrepare
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "Install Firebase CLI: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

if (-not $SkipPrepare) {
    Write-Host "Preparing apps/web/.env.production.local ..."
    & (Join-Path $RepoRoot "scripts\prepare-hosting-deploy.ps1") -ProjectId $ProjectId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$prodEnv = Join-Path $RepoRoot "apps\web\.env.production.local"
if (-not (Test-Path $prodEnv)) {
    Write-Host "ERROR: Missing $prodEnv - run prepare-hosting-deploy.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Deploying Firestore rules + Hosting to $ProjectId (this may take several minutes) ..."
firebase deploy --only firestore:rules,hosting --project $ProjectId

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Live app (share with customers):"
Write-Host "  https://${ProjectId}.web.app"
Write-Host "  https://${ProjectId}.firebaseapp.com"
Write-Host ""
Write-Host "Test sign in, Planning chat, Tasks, and System Designer."
