param(
    [string]$Version = "",
    [string]$Notes = "Correcciones de estabilidad, limpieza forense PDF/XLSX, orientacion EXIF y diagnostico local"
)

$ErrorActionPreference = "Stop"

$keyPath = "$HOME\.tauri\multimedia-converter.key"

if (-not (Test-Path $keyPath)) {
    Write-Host "Error: No se encontro la clave privada en: $keyPath" -ForegroundColor Red
    exit 1
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tauriConfPath = Join-Path (Get-Location) "src-tauri\tauri.conf.json"
$pkgJsonPath = Join-Path (Get-Location) "package.json"
$cargoTomlPath = Join-Path (Get-Location) "src-tauri\Cargo.toml"

$tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $tauriConf.version
}

Write-Host "Sincronizando version v$Version en tauri.conf.json, package.json y Cargo.toml..." -ForegroundColor Cyan

# 1. Sincronizar src-tauri/tauri.conf.json (UTF-8 sin BOM)
$tauriRaw = Get-Content $tauriConfPath -Raw
$tauriRaw = [regex]::Replace($tauriRaw, '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`"", 1)
[System.IO.File]::WriteAllText($tauriConfPath, $tauriRaw, $utf8NoBom)

# 2. Sincronizar package.json (UTF-8 sin BOM)
$pkgRaw = Get-Content $pkgJsonPath -Raw
$pkgRaw = [regex]::Replace($pkgRaw, '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`"", 1)
[System.IO.File]::WriteAllText($pkgJsonPath, $pkgRaw, $utf8NoBom)

# 3. Sincronizar src-tauri/Cargo.toml (UTF-8 sin BOM; Tauri actualiza Cargo.lock al compilar)
$cargoRaw = Get-Content $cargoTomlPath -Raw
$cargoRaw = [regex]::Replace($cargoRaw, '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`"", 1)
[System.IO.File]::WriteAllText($cargoTomlPath, $cargoRaw, $utf8NoBom)

$privateKey = Get-Content $keyPath -Raw

Write-Host "Compilando y firmando Multimedia Converter v$Version..." -ForegroundColor Cyan

$env:TAURI_SIGNING_PRIVATE_KEY = $privateKey
$ErrorActionPreference = "Continue"
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error durante la compilacion de Tauri (codigo $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}
$ErrorActionPreference = "Stop"

Write-Host "Generando latest.json para la version $Version..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ./generate_latest_json.ps1 -Version "$Version" -Notes "$Notes"