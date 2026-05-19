# Build and deploy Next.js web app to Google Cloud Run (gcloud + Docker).
# Usage: .\scripts\deploy-web-cloudrun.ps1 -ProjectId letaicook -Region us-central1

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [string]$Service = "letaicook-web"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WebDir = Join-Path $RepoRoot "apps\web"
Set-Location $RepoRoot

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not on PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Preparing apps/web/.env.production.local ..."
& (Join-Path $RepoRoot "scripts\prepare-hosting-deploy.ps1") -ProjectId $ProjectId -Region $Region
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ProdEnv = Join-Path $WebDir ".env.production.local"
if (-not (Test-Path $ProdEnv)) {
    Write-Host "ERROR: Missing $ProdEnv" -ForegroundColor Red
    exit 1
}

Write-Host "Project: $ProjectId  Region: $Region  Service: $Service"
Write-Host "Using gcloud: $Gcloud"

& $Gcloud config set project $ProjectId
& $Gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

$Image = "${Region}-docker.pkg.dev/${ProjectId}/letaicook/${Service}:latest"
Write-Host "Building $Image (from apps/web) ..."
Set-Location $WebDir
docker build -f Dockerfile.prod -t $Image .

& $Gcloud auth configure-docker "${Region}-docker.pkg.dev" --quiet
docker push $Image

Write-Host "Deploying to Cloud Run..."
& $Gcloud run deploy $Service `
    --image $Image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --ingress all `
    --port 8080 `
    --memory 1Gi `
    --cpu 1

$Url = & $Gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "Web URL: $Url"
$hostName = ([Uri]$Url).Host
Write-Host ""
Write-Host "=== Firebase Auth (required or sign-in fails with invalid-credential) ===" -ForegroundColor Yellow
Write-Host "1. Firebase Console -> Authentication -> Settings -> Authorized domains"
Write-Host "   Add: $hostName"
Write-Host "2. Google Cloud Console -> APIs & Credentials -> OAuth 2.0 Web client (Firebase)"
Write-Host "   Authorized JavaScript origins: $Url"
Write-Host "   Authorized redirect URIs: https://letaicook.firebaseapp.com/__/auth/handler"
Write-Host "3. Authentication -> Sign-in method: enable Email/Password and Google"
Write-Host ""
Write-Host "Add $Url to API CORS in deploy/cloudrun-env.yaml, then:"
Write-Host "  .\scripts\set-cloudrun-env.ps1"
