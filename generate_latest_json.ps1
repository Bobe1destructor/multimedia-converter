param(
    [string]$Version = "0.3.9",
    [string]$Notes = "Actualizacion v0.3.9",
    [string]$TagPrefix = ""
)

$sigFile = "src-tauri\target\release\bundle\nsis\multimedia-converter_${Version}_x64-setup.nsis.zip.sig"

if (-not (Test-Path $sigFile)) {
    Write-Host "Error: No se encontro el archivo de firma: $sigFile" -ForegroundColor Red
    exit 1
}

$signature = (Get-Content $sigFile -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$releaseTag = "${TagPrefix}${Version}"

$latest = @{
    version  = $Version
    notes    = $Notes
    pub_date = $pubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url       = "https://github.com/Bobe1destructor/multimedia-converter/releases/download/${releaseTag}/multimedia-converter_${Version}_x64-setup.nsis.zip"
        }
    }
}

$jsonOutput = $latest | ConvertTo-Json -Depth 5
$outPath = Join-Path (Get-Location) "src-tauri\target\release\bundle\nsis\latest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, $jsonOutput, $utf8NoBom)

Write-Host "Creado sin BOM: $outPath" -ForegroundColor Green