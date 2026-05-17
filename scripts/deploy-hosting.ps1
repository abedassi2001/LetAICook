# Deploy Firestore rules + Firebase Hosting (Next.js).
# Prerequisite: apps/web/.env.production.local with Firebase + NEXT_PUBLIC_API_BASE_URL
# Usage: .\scripts\deploy-hosting.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Error "Install Firebase CLI: npm install -g firebase-tools"
}

Write-Host "Deploying Firestore rules + Hosting to $ProjectId ..."
firebase deploy --only firestore:rules,hosting --project $ProjectId

Write-Host ""
Write-Host "Live URLs:"
Write-Host "  https://${ProjectId}.web.app"
Write-Host "  https://${ProjectId}.firebaseapp.com"
