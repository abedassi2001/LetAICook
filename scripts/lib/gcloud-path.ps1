# Resolve gcloud on Windows when it is installed but not on PATH.

function Resolve-GcloudCommand {
    $cmd = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $candidates = @(
        "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return $path
        }
    }

    return $null
}

function Assert-GcloudInstalled {
    $gcloud = Resolve-GcloudCommand
    if (-not $gcloud) {
        Write-Host ""
        Write-Host "ERROR: Google Cloud SDK (gcloud) is not installed or not on PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "Install on Windows:" -ForegroundColor Yellow
        Write-Host "  1. Download: https://cloud.google.com/sdk/docs/install#windows"
        Write-Host "  2. Run the installer (check 'Add gcloud to PATH')."
        Write-Host "  3. Close and reopen PowerShell, then run:"
        Write-Host "       gcloud init"
        Write-Host "       gcloud auth login"
        Write-Host "  4. Re-run this deploy script."
        Write-Host ""
        Write-Host "Also required: Docker Desktop running (for building the API image)."
        Write-Host ""
        exit 1
    }
    return $gcloud
}
