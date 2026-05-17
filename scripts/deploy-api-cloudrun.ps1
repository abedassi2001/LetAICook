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

. (Join-Path $RepoRoot "scripts\lib\gcloud-path.ps1")
$Gcloud = Assert-GcloudInstalled

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not on PATH. Install Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

Write-Host "Project: $ProjectId  Region: $Region  Service: $Service"
Write-Host "Using gcloud: $Gcloud"

& $Gcloud config set project $ProjectId
& $Gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

# NOT_FOUND is expected when the repo does not exist yet — do not treat as fatal.
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $Gcloud artifacts repositories describe letaicook --location=$Region 2>$null | Out-Null
$repoExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevErrorAction

if (-not $repoExists) {
    Write-Host "Creating Artifact Registry repository 'letaicook' in $Region ..."
    & $Gcloud artifacts repositories create letaicook `
        --repository-format=docker `
        --location=$Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create Artifact Registry repository." -ForegroundColor Red
        exit 1
    }
}

$Image = "${Region}-docker.pkg.dev/${ProjectId}/letaicook/${Service}:latest"
Write-Host "Building $Image ..."
docker build -f apps/api/Dockerfile.prod -t $Image apps/api

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
    --memory 512Mi `
    --cpu 1

$Url = & $Gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "API URL: $Url"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Set API secrets (avoids comma/CORS gcloud errors on Windows):"
Write-Host "       copy deploy\cloudrun-env.sample.yaml deploy\cloudrun-env.yaml"
Write-Host "       Edit GOOGLE_API_KEY, then: .\scripts\set-cloudrun-env.ps1"
Write-Host "  2. Deploy website:"
Write-Host "       .\scripts\deploy-hosting.ps1 -ProjectId $ProjectId"
Write-Host "     (auto-fills apps/web/.env.production.local with API URL $Url)"
