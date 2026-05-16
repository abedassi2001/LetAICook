# Restart Next dev with a clean .next cache (fixes /login, /tasks 404 in dev).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
if (Test-Path .next) {
  Remove-Item -Recurse -Force .next
  Write-Host "Removed .next cache"
}
npm run dev
