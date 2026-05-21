# Deploy Firestore security rules only.
# Usage: .\scripts\deploy-firestore-rules.ps1 -ProjectId letaicook

param(
    [string]$ProjectId = "letaicook"
)

& (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "scripts\deploy-hosting.ps1") @PSBoundParameters
