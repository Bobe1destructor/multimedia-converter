$ErrorActionPreference = "Stop"

$keyPath = "$HOME\.tauri\multimedia-converter.key"

if (-not (Test-Path $keyPath)) {
    Write-Host "Error: No se encontró la clave privada en: $keyPath" -ForegroundColor Red
    exit 1
}

$privateKey = Get-Content $keyPath -Raw

Write-Host "Compilando y firmando Multimedia Converter..." -ForegroundColor Cyan

$env:TAURI_SIGNING_PRIVATE_KEY = $privateKey
npx tauri build

