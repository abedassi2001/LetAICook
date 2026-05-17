#!/usr/bin/env bash
# Build and deploy FastAPI to Google Cloud Run.
# Usage: ./scripts/deploy-api-cloudrun.sh [project_id] [region]

set -euo pipefail
PROJECT_ID="${1:-letaicook}"
REGION="${2:-us-central1}"
SERVICE="${3:-letaicook-api}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Project: $PROJECT_ID  Region: $REGION  Service: $SERVICE"
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com --quiet

if ! gcloud artifacts repositories describe letaicook --location="$REGION" &>/dev/null; then
  gcloud artifacts repositories create letaicook \
    --repository-format=docker \
    --location="$REGION"
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/letaicook/${SERVICE}:latest"
docker build -f apps/api/Dockerfile.prod -t "$IMAGE" apps/api
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker push "$IMAGE"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo ""
echo "API URL: $URL"
echo "Set NEXT_PUBLIC_API_BASE_URL=$URL in apps/web/.env.production.local"
echo "Then: firebase deploy --only firestore:rules,hosting --project $PROJECT_ID"
