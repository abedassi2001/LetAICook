# Build and deploy FastAPI to Google Cloud Run.
# Usage: .\scripts\deploy-api-cloudrun.ps1 -ProjectId letaicook -Region us-central1

param(
    [string]$ProjectId = "letaicook",
    [string]$Region = "us-central1",
    [string]$Service = "letaicook-api"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

Write-Host "Project: $ProjectId  Region: $Region  Service: $Service"

gcloud config set project $ProjectId
gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

$repoExists = gcloud artifacts repositories describe letaicook --location=$Region 2>$null
if (-not $repoExists) {
    gcloud artifacts repositories create letaicook `
        --repository-format=docker `
        --location=$Region
}

$Image = "${Region}-docker.pkg.dev/${ProjectId}/letaicook/${Service}:latest"
Write-Host "Building $Image ..."
docker build -f apps/api/Dockerfile.prod -t $Image apps/api

gcloud auth configure-docker "${Region}-docker.pkg.dev" --quiet
docker push $Image

Write-Host "Deploying to Cloud Run..."
gcloud run deploy $Service `
    --image $Image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1

$Url = gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "API URL: $Url"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Set secrets:"
Write-Host "     gcloud run services update $Service --region $Region --set-env-vars GOOGLE_API_KEY=YOUR_KEY"
Write-Host "     gcloud run services update $Service --region $Region --set-env-vars CORS_ORIGINS=https://${ProjectId}.web.app,https://${ProjectId}.firebaseapp.com,http://localhost:3000"
Write-Host "  2. Set apps/web/.env.production.local NEXT_PUBLIC_API_BASE_URL=$Url"
Write-Host "  3. firebase deploy --only firestore:rules,hosting --project $ProjectId"
