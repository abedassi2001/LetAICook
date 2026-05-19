# Read apps/web/.env.production.local and produce docker --build-arg flags for Next.js.

function Read-WebDotEnv([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*#' -or $line -notmatch '^\s*([^#=]+)=(.*)$') { continue }
        $map[$Matches[1].Trim()] = $Matches[2].Trim()
    }
    return $map
}

function Get-RequiredWebProductionKeys() {
    return @(
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        "NEXT_PUBLIC_FIREBASE_APP_ID",
        "NEXT_PUBLIC_API_BASE_URL"
    )
}

function Get-OptionalWebProductionKeys() {
    return @("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID")
}

function Test-WebProductionEnv([hashtable]$Env) {
    $missing = @()
    foreach ($key in Get-RequiredWebProductionKeys) {
        if (-not $Env[$key] -or $Env[$key] -eq "") {
            $missing += $key
        }
    }
    return $missing
}

function Get-WebDockerBuildArgs([string]$ProdEnvPath) {
    $env = Read-WebDotEnv $ProdEnvPath
    $missing = Test-WebProductionEnv $env
    if ($missing.Count -gt 0) {
        throw "Missing in $ProdEnvPath : $($missing -join ', '). Fill apps/web/.env.local and run prepare-hosting-deploy.ps1, or set GitHub secrets for CI."
    }

    $args = @()
    foreach ($key in (Get-RequiredWebProductionKeys) + (Get-OptionalWebProductionKeys)) {
        $val = $env[$key]
        if ($val) {
            $args += "--build-arg"
            $args += "${key}=$val"
        }
    }
    return $args
}
