param(
    [string]$Version = "0.3.5",
    [string]$Notes = "Actualizacion v0.3.5"
)

$sigFile = "src-tauri\target\release\bundle\nsis\multimedia-converter_${Version}_x64-setup.nsis.zip.sig"

if (-not (Test-Path $sigFile)) {
    Write-Host "Error: No se encontro el archivo de firma: $sigFile" -ForegroundColor Red
    exit 1
}

$signature = (Get-Content $sigFile -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$latest = @{
    version = $Version
    notes = $Notes
    pub_date = $pubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url = "https://github.com/Bobe1destructor/multimedia-converter/releases/download/v${Version}/multimedia-converter_${Version}_x64-setup.nsis.zip"
        }
    }
}

$jsonOutput = $latest | ConvertTo-Json -Depth 5
Set-Content -Path "src-tauri\target\release\bundle\nsis\latest.json" -Value $jsonOutput -Encoding UTF8
Write-Host "Creado con exito src-tauri\target\release\bundle\nsis\latest.json" -ForegroundColor Green
