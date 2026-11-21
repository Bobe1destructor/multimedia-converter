# Código Fuente Completo - Multimedia Converter v0.3.8


## package.json

``json
{
  "name": "multimedia-converter",
  "private": true,
  "version": "0.3.8",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "build:app": "powershell -ExecutionPolicy Bypass -File ./build_signed.ps1"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2.8.3",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-process": "^2.4.0",
    "@tauri-apps/plugin-updater": "^2.14.1",
    "framer-motion": "^14.6.0",
    "lucide-react": "^1.61.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^6.0.2",
    "cross-env": "^10.1.0",
    "typescript": "~6.0.3",
    "vite": "^8.0.16"
  }
}
``

## build_signed.ps1

``powershell
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

Write-Host "Obteniendo versión de tauri.conf.json..." -ForegroundColor Cyan
$tauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$currentVer = $tauriConf.version

Write-Host "Generando latest.json para la versión $currentVer..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ./generate_latest_json.ps1 -Version "$currentVer" -Notes "Actualizaciones nativas y nuevas mejoras"


``

## generate_latest_json.ps1

``powershell
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
            url = "https://github.com/Bobe1destructor/multimedia-converter/releases/download/${Version}/multimedia-converter_${Version}_x64-setup.nsis.zip"
        }
    }
}

$jsonOutput = $latest | ConvertTo-Json -Depth 5
Set-Content -Path "src-tauri\target\release\bundle\nsis\latest.json" -Value $jsonOutput -Encoding UTF8
Write-Host "Creado con exito src-tauri\target\release\bundle\nsis\latest.json" -ForegroundColor Green

``

## src-tauri/Cargo.toml

``toml
[package]
name = "multimedia-converter"
version = "0.3.8"
description = "Convertidor multimedia"
authors = ["you"]
edition = "2021"

[lib]
name = "multimedia_converter_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
tokio = { version = "1", features = ["process", "io-util", "sync", "time", "rt", "rt-multi-thread", "macros", "fs"] }
rayon = "1"
image = { version = "0.25", default-features = false, features = ["png", "jpeg", "webp"] }
webp = "0.3"
zip = { version = "2.2", default-features = false, features = ["deflate"] }
flate2 = "1"
lopdf = "0.34"
pdf-extract = "0.7"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
``

## src-tauri/tauri.conf.json

``json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "multimedia-converter",
  "version": "0.3.8",
  "identifier": "com.raul.multimedia-converter",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "multimedia-converter",
        "width": 1360,
        "height": 840,
        "minWidth": 960,
        "minHeight": 640
      }
    ],
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "**"
        ]
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": "v1Compatible",
    "resources": [
      "binaries/ffmpeg.exe",
      "binaries/ffprobe.exe"
    ],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDU0RDM1NTc3NzMzRjM4NzIKUldSeU9EOXpkMVhUVk1pWHZTZUN6bHdYSXdmWlVVQ3NoaStrQmtNV0duZHJvOExXeGloN3F6dlMK",
      "endpoints": [
        "https://github.com/Bobe1destructor/multimedia-converter/releases/latest/download/latest.json"
      ]
    }
  }
}
``

## src-tauri/src/commands.rs

``rust
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    ffi::OsString,
    fs::File,
    hash::{Hash, Hasher},
    io::BufWriter,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ExtendedColorType, ImageEncoder,
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, UserAttentionType};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
    sync::{Notify, OnceCell},
    time::timeout,
};

// ───────────────────────────── Errores ─────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Msg(String),
    #[error("E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("Imagen: {0}")]
    Image(#[from] image::ImageError),
    /// El usuario canceló la conversión (el frontend compara con "CANCELLED")
    #[error("CANCELLED")]
    Cancelled,
}

// Tauri exige que el error sea Serialize; lo enviamos como texto al frontend
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type Res<T> = Result<T, AppError>;

fn err<T>(m: impl Into<String>) -> Res<T> {
    Err(AppError::Msg(m.into()))
}

// ─────────────────── Utilidades de rutas, hilos y caché ───────────────────

fn thumb_cache_dir() -> PathBuf {
    std::env::temp_dir().join("multimedia-converter-thumbs")
}

/// Calcula cuántos hilos lógicos usar según el modo elegido en Ajustes ("auto" | "half" | "two").
fn compute_thread_limit(mode: Option<&str>) -> Option<usize> {
    let total = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    match mode {
        Some("half") => Some((total / 3).max(2).min(total)),
        Some("two") => Some(1.max(total.min(2) - 1)),
        _ => None, // "auto" = usar todos los núcleos disponibles
    }
}

/// Ejecuta un cierre paralelo dentro de un ThreadPool de Rayon limitado si el usuario eligió ahorrar CPU.
fn run_in_rayon_pool<F, R>(thread_mode: Option<&str>, op: F) -> R
where
    F: FnOnce() -> R + Send,
    R: Send,
{
    if let Some(n) = compute_thread_limit(thread_mode) {
        if let Ok(pool) = rayon::ThreadPoolBuilder::new().num_threads(n).build() {
            return pool.install(op);
        }
    }
    op()
}

/// Si `overwrite` es `false` y el archivo ya existe en disco (o coincide con el origen),
/// busca `nombre_2.ext`, `nombre_3.ext`… para no sobrescribir nada.
fn resolve_dest_path(src: &Path, desired: &Path, overwrite: bool) -> PathBuf {
    if overwrite && src != desired {
        return desired.to_path_buf();
    }
    if !desired.exists() && src != desired {
        return desired.to_path_buf();
    }
    let parent = desired.parent().unwrap_or_else(|| Path::new(""));
    let stem = desired
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("salida");
    let ext = desired.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut n = 2usize;
    loop {
        let file_name = if ext.is_empty() {
            format!("{stem}_{n}")
        } else {
            format!("{stem}_{n}.{ext}")
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() && candidate != src {
            return candidate;
        }
        n += 1;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbCacheInfo {
    pub count: usize,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn get_thumb_cache_info() -> Result<ThumbCacheInfo, AppError> {
    tokio::task::spawn_blocking(|| {
        let dir = thumb_cache_dir();
        if !dir.is_dir() {
            return Ok(ThumbCacheInfo { count: 0, size_bytes: 0 });
        }
        let mut count = 0usize;
        let mut size_bytes = 0u64;
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        count += 1;
                        size_bytes += meta.len();
                    }
                }
            }
        }
        Ok(ThumbCacheInfo { count, size_bytes })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Error leyendo caché: {e}")))?
}

#[tauri::command]
pub async fn clear_thumb_cache() -> Result<ThumbCacheInfo, AppError> {
    tokio::task::spawn_blocking(|| {
        let dir = thumb_cache_dir();
        if dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        Ok(ThumbCacheInfo { count: 0, size_bytes: 0 })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Error limpiando caché: {e}")))?
}

// ─────────────────── Tipos compartidos con el frontend ───────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwAccel {
    Nvenc,        // NVIDIA (Windows / Linux)
    Amf,          // AMD Radeon RX / Ryzen APU (Windows / Linux con driver AMDGPU-PRO)
    Qsv,          // Intel Quick Sync Video: UHD / Iris Xe / Arc (Windows / Linux)
    Vaapi,        // Intel / AMD Mesa VA-API nativo (Linux)
    Videotoolbox, // Apple Silicon / macOS
    Cpu,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec {
    H264,
    Hevc, // H.265
    Av1,
    Vp9, // siempre por CPU (libvpx-vp9)
}

/// Mejor aceleración por códec (una GPU puede soportar H.264 pero no HEVC ni AV1).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct HwProfile {
    pub h264: HwAccel,
    pub hevc: HwAccel,
    pub av1: HwAccel,
}

impl HwProfile {
    fn for_codec(&self, c: VideoCodec) -> HwAccel {
        match c {
            VideoCodec::H264 => self.h264,
            VideoCodec::Hevc => self.hevc,
            VideoCodec::Av1 => self.av1,
            VideoCodec::Vp9 => HwAccel::Cpu,
        }
    }
}

/// Tamaño de salida elegido en el frontend (ya con la proporción original y valores pares).
#[derive(Deserialize)]
pub struct TargetSize {
    width: u32,
    height: u32,
}

#[derive(Default)]
pub struct HwCache(OnceCell<HwProfile>);

/// Conversiones en curso: permite cancelarlas por `job_id`.
#[derive(Default)]
pub struct JobRegistry(Mutex<HashMap<String, Arc<Notify>>>);

// ───────────────────── Utilidades de subprocesos ─────────────────────

/// FFmpeg/FFprobe: primero el "sidecar" empaquetado junto al ejecutable (también en `tauri dev`);
/// si no existe, el que haya en el PATH del sistema.
fn bin_path(name: &str) -> OsString {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
            let candidates = [
                dir.join(&file),
                dir.join("resources").join(&file),
                dir.join("resources").join("binaries").join(&file),
                dir.join("binaries").join(&file),
                dir.join("../../binaries").join(&file),
            ];
            for c in candidates {
                if c.is_file() {
                    return c.into_os_string();
                }
            }
        }
    }
    OsString::from(name)
}

fn cmd(bin: &str) -> Command {
    cmd_with_priority(bin, false)
}

fn cmd_with_priority(bin: &str, low_priority: bool) -> Command {
    let mut c = Command::new(bin_path(bin));
    // kill_on_drop: si el futuro se cancela, FFmpeg no queda huérfano
    c.kill_on_drop(true).stdin(Stdio::null());
    // CREATE_NO_WINDOW (0x0800_0000) + opcional BELOW_NORMAL_PRIORITY_CLASS (0x0000_4000) en Windows
    #[cfg(windows)]
    {
        let flags = if low_priority {
            0x0800_0000 | 0x0000_4000
        } else {
            0x0800_0000
        };
        c.creation_flags(flags);
    }
    #[cfg(not(windows))]
    let _ = low_priority;
    c
}

async fn ensure_ffmpeg() -> Res<()> {
    match cmd("ffmpeg").arg("-version").output().await {
        Ok(o) if o.status.success() => Ok(()),
        _ => err("No se encontró FFmpeg. Instálalo y agrégalo al PATH, o incluye ffmpeg y ffprobe como sidecar (src-tauri/binaries)."),
    }
}

fn sv(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

// ───────────────────── Encoders, calidad y GPU (NVIDIA / AMD / Intel) ─────────────────────

/// En Linux busca el primer nodo `/dev/dri/renderD*` disponible (renderD128, renderD129…).
fn detect_vaapi_device() -> String {
    if let Ok(entries) = std::fs::read_dir("/dev/dri") {
        let mut nodes: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.starts_with("renderD"))
                    .unwrap_or(false)
            })
            .collect();
        nodes.sort();
        if let Some(first) = nodes.into_iter().next() {
            return first.to_string_lossy().into_owned();
        }
    }
    "/dev/dri/renderD128".to_string()
}

impl HwAccel {
    fn encoder(self, codec: VideoCodec) -> &'static str {
        use HwAccel::*;
        use VideoCodec::*;
        match (self, codec) {
            (_, Vp9) => "libvpx-vp9",
            // NVIDIA NVENC
            (Nvenc, H264) => "h264_nvenc",
            (Nvenc, Hevc) => "hevc_nvenc",
            (Nvenc, Av1) => "av1_nvenc",
            // AMD AMF (Radeon dedicada o integrada Ryzen)
            (Amf, H264) => "h264_amf",
            (Amf, Hevc) => "hevc_amf",
            (Amf, Av1) => "av1_amf",
            // Intel Quick Sync Video (Intel UHD, Iris Xe, Arc)
            (Qsv, H264) => "h264_qsv",
            (Qsv, Hevc) => "hevc_qsv",
            (Qsv, Av1) => "av1_qsv",
            // Linux VA-API (AMD Radeon / Intel en Linux)
            (Vaapi, H264) => "h264_vaapi",
            (Vaapi, Hevc) => "hevc_vaapi",
            (Vaapi, Av1) => "av1_vaapi",
            // Apple VideoToolbox (macOS)
            (Videotoolbox, H264) => "h264_videotoolbox",
            (Videotoolbox, Hevc) => "hevc_videotoolbox",
            (Videotoolbox, Av1) => "libsvtav1",
            // CPU Software
            (Cpu, H264) => "libx264",
            (Cpu, Hevc) => "libx265",
            (Cpu, Av1) => "libsvtav1",
        }
    }
}

/// Calidad 1..=100 → CQ/QP de GPU: 100 % → 18 (alta calidad) · 1 % → 45 (archivo ligero).
/// Mantén estas fórmulas iguales a `gpuCq`/`cpuCrf` en VideoTab.tsx.
fn gpu_cq(quality: u8) -> u32 {
    let q = quality.clamp(1, 100) as f64;
    (45.0 - (q - 1.0) * 27.0 / 99.0).round() as u32
}

/// Calidad 1..=100 → CRF de CPU: 100 % → 18 · 1 % → 42.
fn cpu_crf(quality: u8) -> u32 {
    let q = quality.clamp(1, 100) as f64;
    (42.0 - (q - 1.0) * 24.0 / 99.0).round() as u32
}

/// AV1 usa una escala de CRF más alta que x264/x265 para una calidad equivalente (+6).
fn cpu_crf_for(codec: VideoCodec, quality: u8) -> u32 {
    cpu_crf(quality) + if codec == VideoCodec::Av1 { 6 } else { 0 }
}

/// Candidatos por sistema operativo, en orden de prioridad:
/// En Windows prueba primero NVIDIA (NVENC), luego AMD Radeon (AMF) y luego Intel (QSV).
/// Si un PC tiene gráficos integrados Intel/AMD + dedicada, o solo gráficos integrados, detecta automáticamente el que funcione.
fn candidates() -> &'static [HwAccel] {
    if cfg!(target_os = "windows") {
        &[HwAccel::Nvenc, HwAccel::Amf, HwAccel::Qsv]
    } else if cfg!(target_os = "linux") {
        &[HwAccel::Nvenc, HwAccel::Vaapi, HwAccel::Qsv, HwAccel::Amf]
    } else if cfg!(target_os = "macos") {
        &[HwAccel::Videotoolbox]
    } else {
        &[]
    }
}

/// Control de tasa del encoder.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Rate {
    Quality(u8),  // calidad constante (1-100 %)
    Bitrate(u32), // bitrate de vídeo objetivo en kbps (modo "tamaño objetivo")
}

/// Qué hacer con el archivo.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Mode {
    Encode { rate: Rate, scale: Option<(u32, u32)> },
    Remux,    // -c copy: solo cambia el contenedor
    AudioMp3, // descarta el vídeo y guarda MP3
}

/// Devuelve (args antes de `-i`, args de codificación) para cada backend (NVIDIA, AMD, Intel, CPU).
fn encoder_args(
    accel: HwAccel,
    codec: VideoCodec,
    rate: Rate,
    scale: Option<(u32, u32)>,
    threads: Option<usize>,
) -> (Vec<String>, Vec<String>) {
    // VP9 (y AV1 en VideoToolbox) solo se codifican por CPU
    let accel = if codec == VideoCodec::Vp9
        || (accel == HwAccel::Videotoolbox && codec == VideoCodec::Av1)
    {
        HwAccel::Cpu
    } else {
        accel
    };
    let enc = accel.encoder(codec);
    let q = match rate {
        Rate::Quality(q) => q,
        Rate::Bitrate(_) => 80, // no se usa en este modo
    };
    let cq = gpu_cq(q).to_string();
    let crf = cpu_crf_for(codec, q).to_string();
    let vt_q = q.clamp(1, 100).to_string();

    // Filtros de vídeo: escalado (lanczos = buena nitidez al reducir) y, en VA-API, subida a la GPU
    let mut filters: Vec<String> = Vec::new();
    if let Some((w, h)) = scale {
        filters.push(format!("scale={w}:{h}:flags=lanczos"));
    }
    let mut pre: Vec<String> = Vec::new();
    // Limitar hilos del DECODIFICADOR antes de `-i`
    if let Some(t) = threads {
        let ts = t.to_string();
        pre.extend(sv(&["-threads", &ts]));
    }
    if accel == HwAccel::Vaapi {
        let dev = detect_vaapi_device();
        pre.extend(sv(&["-vaapi_device", &dev]));
        filters.push("format=nv12,hwupload".to_string());
    }

    let mut post: Vec<String> = Vec::new();
    if let Some(t) = threads {
        let ts = t.to_string();
        post.extend(sv(&["-filter_threads", &ts, "-filter_complex_threads", &ts]));
    }
    if !filters.is_empty() {
        post.push("-vf".to_string());
        post.push(filters.join(","));
    }

    // (prefijo del encoder, parámetros de calidad constante, formato de píxel)
    let (mut prefix, quality_args, suffix): (Vec<String>, Vec<String>, Vec<String>) = match accel {
        HwAccel::Nvenc => (
            sv(&["-c:v", enc, "-preset", "p4", "-rc", "vbr"]),
            sv(&["-cq", cq.as_str(), "-b:v", "0"]),
            sv(&["-pix_fmt", "yuv420p"]),
        ),
        HwAccel::Amf => {
            // En AMD AMF (Radeon RX / Ryzen iGPU), el modo CQP controla la cuantización con -qp_i y -qp_p
            let quality_preset = if codec == VideoCodec::Av1 { "high_quality" } else { "quality" };
            let qp_args = if codec == VideoCodec::Av1 {
                sv(&["-rc", "cqp", "-qp_i", cq.as_str(), "-qp_p", cq.as_str()])
            } else {
                sv(&[
                    "-rc",
                    "cqp",
                    "-qp_i",
                    cq.as_str(),
                    "-qp_p",
                    cq.as_str(),
                    "-qp_b",
                    cq.as_str(),
                ])
            };
            (
                sv(&["-c:v", enc, "-quality", quality_preset]),
                qp_args,
                sv(&["-pix_fmt", "yuv420p"]),
            )
        }
        HwAccel::Qsv => (
            // En Intel Quick Sync (UHD / Iris Xe / Arc), ICQ usa -global_quality con formato nv12
            sv(&["-c:v", enc, "-preset", "medium"]),
            sv(&["-global_quality", cq.as_str()]),
            sv(&["-pix_fmt", "nv12"]),
        ),
        HwAccel::Vaapi => (sv(&["-c:v", enc]), sv(&["-qp", cq.as_str()]), vec![]),
        HwAccel::Videotoolbox => (
            sv(&["-c:v", enc]),
            sv(&["-q:v", vt_q.as_str()]),
            sv(&["-pix_fmt", "yuv420p"]),
        ),
        HwAccel::Cpu => match codec {
            VideoCodec::Vp9 => (
                sv(&["-c:v", enc, "-deadline", "good", "-cpu-used", "4", "-row-mt", "1"]),
                sv(&["-crf", crf.as_str(), "-b:v", "0"]),
                sv(&["-pix_fmt", "yuv420p"]),
            ),
            VideoCodec::Av1 => (
                sv(&["-c:v", enc, "-preset", "8"]),
                sv(&["-crf", crf.as_str()]),
                sv(&["-pix_fmt", "yuv420p"]),
            ),
            _ => (
                sv(&["-c:v", enc, "-preset", "medium"]),
                sv(&["-crf", crf.as_str()]),
                sv(&["-pix_fmt", "yuv420p"]),
            ),
        },
    };

    // Limitar hilos del ENCODER de salida (incluyendo parámetros específicos de libx265 y SVT-AV1)
    if let Some(t) = threads {
        let ts = t.to_string();
        prefix.extend(sv(&["-threads", &ts]));
        if accel == HwAccel::Cpu {
            match codec {
                VideoCodec::Hevc => {
                    let frames = t.min(4);
                    prefix.extend(sv(&["-x265-params", &format!("pools={t}:frame-threads={frames}")]));
                }
                VideoCodec::Av1 => {
                    prefix.extend(sv(&["-svtav1-params", &format!("lp={t}")]));
                }
                _ => {}
            }
        }
    }

    let rate_args: Vec<String> = match rate {
        Rate::Quality(_) => quality_args,
        Rate::Bitrate(k) => {
            let b = format!("{k}k");
            let buf = format!("{}k", k * 2);
            if accel == HwAccel::Cpu && codec == VideoCodec::Av1 {
                // SVT-AV1 no admite maxrate/bufsize en modo bitrate
                sv(&["-b:v", b.as_str()])
            } else if accel == HwAccel::Amf {
                sv(&["-rc", "vbr_peak", "-b:v", b.as_str(), "-maxrate", b.as_str(), "-bufsize", buf.as_str()])
            } else {
                sv(&["-b:v", b.as_str(), "-maxrate", b.as_str(), "-bufsize", buf.as_str()])
            }
        }
    };

    post.extend(prefix);
    post.extend(rate_args);
    post.extend(suffix);
    (pre, post)
}

/// Prueba real: codifica 0.2 s de vídeo negro con ese encoder.
/// Que el encoder aparezca en `ffmpeg -encoders` NO garantiza que haya GPU/driver.
async fn probe(accel: HwAccel, codec: VideoCodec) -> bool {
    let (pre, post) = encoder_args(accel, codec, Rate::Quality(80), None, None);
    let mut c = cmd("ffmpeg");
    c.args(["-hide_banner", "-loglevel", "error", "-y"]);
    c.args(&pre);
    c.args(["-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.2:r=10"]);
    c.args(&post);
    c.args(["-an", "-f", "null", "-"]);
    c.stdout(Stdio::null()).stderr(Stdio::null());

    match timeout(Duration::from_secs(8), c.status()).await {
        Ok(Ok(st)) => st.success(),
        _ => false,
    }
}

async fn best_accel(codec: VideoCodec) -> HwAccel {
    for &a in candidates() {
        if probe(a, codec).await {
            return a;
        }
    }
    HwAccel::Cpu
}

async fn detect_profile() -> Res<HwProfile> {
    ensure_ffmpeg().await?;
    let (h264, hevc, av1) = tokio::join!(
        best_accel(VideoCodec::H264),
        best_accel(VideoCodec::Hevc),
        best_accel(VideoCodec::Av1)
    );
    Ok(HwProfile { h264, hevc, av1 })
}

#[tauri::command]
pub async fn detect_hw_accel(hw: State<'_, HwCache>) -> Result<HwProfile, AppError> {
    // get_or_try_init: si FFmpeg falta, no se cachea el error
    Ok(*hw.inner().0.get_or_try_init(detect_profile).await?)
}

// ───────────────────── Metadatos del vídeo (ffprobe + miniatura) ─────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    codec: String,
    width: u32,
    height: u32,
    fps: Option<f64>,
    bit_rate: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    codec: String,
    channels: Option<u32>,
    sample_rate: Option<u32>,
    bit_rate: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    duration_secs: Option<f64>,
    size_bytes: Option<u64>,
    bit_rate: Option<u64>, // bitrate total del archivo
    video: Option<VideoStreamInfo>,
    audio: Option<AudioStreamInfo>,
    thumbnail: Option<String>, // ruta a la miniatura JPG generada en temp_dir
}

/// ffprobe entrega unos campos como número y otros como texto: aceptamos ambos.
fn jnum(v: &Value, key: &str) -> Option<f64> {
    let x = v.get(key)?;
    x.as_f64().or_else(|| x.as_str()?.parse::<f64>().ok())
}

fn jstr(v: &Value, key: &str) -> Option<String> {
    v.get(key)?.as_str().map(str::to_string)
}

/// "30000/1001" → 29.97
fn parse_fps(s: &str) -> Option<f64> {
    let (a, b) = s.split_once('/')?;
    let (a, b): (f64, f64) = (a.parse().ok()?, b.parse().ok()?);
    if a > 0.0 && b > 0.0 {
        Some(a / b)
    } else {
        None
    }
}

async fn ffprobe_json(source: &str) -> Res<Value> {
    let out = cmd("ffprobe")
        .args(["-v", "error", "-print_format", "json", "-show_streams", "-show_format", source])
        .output()
        .await
        .map_err(|e| AppError::Msg(format!("No se pudo ejecutar ffprobe: {e}")))?;

    if !out.status.success() {
        return err(format!(
            "ffprobe no pudo leer el archivo: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Msg(format!("Respuesta de ffprobe inválida: {e}")))
}

/// Extrae un fotograma ligero (160px de ancho) al 10% del video (máx. segundo 3) y lo cachea en temp_dir.
async fn extract_video_thumbnail(source: &str, duration: Option<f64>, disk_size: Option<u64>) -> Option<String> {
    let dir = thumb_cache_dir();
    let _ = tokio::fs::create_dir_all(&dir).await;

    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    disk_size.unwrap_or(0).hash(&mut hasher);
    let dest = dir.join(format!("vthumb_{:016x}.jpg", hasher.finish()));

    if dest.is_file() {
        return Some(dest.to_string_lossy().into_owned());
    }

    let dest_str = dest.to_string_lossy().into_owned();
    let seek = duration.map(|d| (d * 0.1).clamp(0.0, 3.0)).unwrap_or(0.0);

    let mut c = cmd("ffmpeg");
    c.args(["-hide_banner", "-loglevel", "error", "-y"]);
    if seek > 0.05 {
        c.args(["-ss", &format!("{seek:.2}")]);
    }
    c.args([
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=160:-2",
        "-q:v",
        "5",
        &dest_str,
    ]);
    c.stdout(Stdio::null()).stderr(Stdio::null());

    if let Ok(Ok(st)) = timeout(Duration::from_secs(5), c.status()).await {
        if st.success() && dest.is_file() {
            return Some(dest_str);
        }
    }
    None
}

#[tauri::command]
pub async fn get_video_metadata(source: String) -> Result<VideoMetadata, AppError> {
    let root = ffprobe_json(&source).await?;

    let empty: Vec<Value> = Vec::new();
    let streams = root.get("streams").and_then(Value::as_array).unwrap_or(&empty);

    // Ignora las carátulas incrustadas (attached_pic), que ffprobe lista como "video"
    let video = streams.iter().find(|s| {
        s.get("codec_type").and_then(Value::as_str) == Some("video")
            && s.pointer("/disposition/attached_pic").and_then(Value::as_i64) != Some(1)
    });
    let audio = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("audio"));
    let fmt = root.get("format");

    let duration_secs = fmt.and_then(|f| jnum(f, "duration"));
    // El tamaño real en disco es más fiable que el que reporta el contenedor
    let disk_size = tokio::fs::metadata(&source).await.ok().map(|m| m.len());
    let size_bytes = disk_size.or_else(|| fmt.and_then(|f| jnum(f, "size")).map(|n| n as u64));

    let thumbnail = if video.is_some() {
        extract_video_thumbnail(&source, duration_secs, size_bytes).await
    } else {
        None
    };

    Ok(VideoMetadata {
        duration_secs,
        size_bytes,
        bit_rate: fmt.and_then(|f| jnum(f, "bit_rate")).map(|n| n as u64),
        video: video.map(|s| VideoStreamInfo {
            codec: jstr(s, "codec_name").unwrap_or_else(|| "desconocido".into()),
            width: jnum(s, "width").unwrap_or(0.0) as u32,
            height: jnum(s, "height").unwrap_or(0.0) as u32,
            fps: jstr(s, "avg_frame_rate")
                .and_then(|r| parse_fps(&r))
                .or_else(|| jstr(s, "r_frame_rate").and_then(|r| parse_fps(&r))),
            bit_rate: jnum(s, "bit_rate").map(|n| n as u64),
        }),
        audio: audio.map(|s| AudioStreamInfo {
            codec: jstr(s, "codec_name").unwrap_or_else(|| "desconocido".into()),
            channels: jnum(s, "channels").map(|n| n as u32),
            sample_rate: jnum(s, "sample_rate").map(|n| n as u32),
            bit_rate: jnum(s, "bit_rate").map(|n| n as u64),
        }),
        thumbnail,
    })
}

/// (duración en segundos, ¿tiene pista de audio?) — `None` si ffprobe no pudo leer el dato.
async fn probe_info(source: &str) -> (Option<f64>, Option<bool>) {
    let Ok(root) = ffprobe_json(source).await else {
        return (None, None);
    };
    let duration = root.get("format").and_then(|f| jnum(f, "duration"));
    let has_audio = root.get("streams").and_then(Value::as_array).map(|streams| {
        streams
            .iter()
            .any(|s| s.get("codec_type").and_then(Value::as_str) == Some("audio"))
    });
    (duration, has_audio)
}

// ───────────────────────────── Tamaño objetivo y recorte ─────────────────────────────

/// Margen de seguridad: el contenedor y el encoder suelen pasarse unos puntos del bitrate pedido.
/// Mantén estas constantes iguales a las de VideoTab.tsx.
const SIZE_SAFETY: f64 = 0.97;
const AUDIO_KBPS: u32 = 128;
const MIN_VIDEO_KBPS: f64 = 50.0;

/// Duración efectiva teniendo en cuenta el recorte de inicio y fin.
fn effective_duration(total: Option<f64>, start: Option<f64>, end: Option<f64>) -> Option<f64> {
    let s = start.unwrap_or(0.0).max(0.0);
    match (total, end) {
        (Some(d), Some(e)) => Some((e.min(d) - s).max(0.1)),
        (None, Some(e)) => Some((e - s).max(0.1)),
        (Some(d), None) => Some((d - s).max(0.1)),
        (None, None) => None,
    }
}

/// Tamaño objetivo (MB) → bitrate de vídeo (kbps):
/// total (kbps) = MB × 8192 / duración(s) · margen; al total se le resta el audio (si hay).
fn target_video_kbps(target_mb: f64, duration: Option<f64>, has_audio: bool) -> Res<u32> {
    let Some(d) = duration.filter(|d| *d > 0.0) else {
        return err("No se pudo leer la duración del video, necesaria para el tamaño objetivo.");
    };
    let total = target_mb * 8192.0 / d * SIZE_SAFETY;
    let video = total - if has_audio { AUDIO_KBPS as f64 } else { 0.0 };
    if video < MIN_VIDEO_KBPS {
        return err(format!(
            "{target_mb} MB es muy poco para {d:.0} s de video (quedarían {:.0} kbps para la imagen). Sube el tamaño objetivo.",
            video.max(0.0)
        ));
    }
    Ok(video.round() as u32)
}

// ───────────────────────────── Conversión de vídeo ─────────────────────────────

/// Evento `convert-progress`. En JS: { jobId, percent, processedSecs, speed, encoder, stage }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    job_id: String,
    percent: Option<f64>, // None si no se pudo obtener la duración total
    processed_secs: f64,  // segundos de VIDEO procesados (no es tiempo real)
    speed: Option<String>,
    encoder: &'static str,
    stage: &'static str, // "running" | "fallback" | "done"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertVideoResponse {
    pub output: String,
    pub size_bytes: Option<u64>,
}

struct Container {
    muxer: &'static str,
    faststart: bool,
}

fn container(fmt: &str) -> Option<Container> {
    Some(match fmt {
        "mp4" => Container { muxer: "mp4", faststart: true },
        "mov" => Container { muxer: "mov", faststart: true },
        "mkv" => Container { muxer: "matroska", faststart: false },
        "webm" => Container { muxer: "webm", faststart: false },
        "avi" => Container { muxer: "avi", faststart: false },
        _ => return None,
    })
}

/// Matriz de compatibilidad contenedor/códec (igual a `SUPPORT` en types.ts).
fn supports(fmt: &str, codec: VideoCodec) -> bool {
    use VideoCodec::*;
    match fmt {
        "mp4" => matches!(codec, H264 | Hevc | Av1),
        "mov" => matches!(codec, H264 | Hevc),
        "mkv" => true,
        "webm" => matches!(codec, Vp9 | Av1),
        "avi" => codec == H264,
        _ => false,
    }
}

/// Audio al recodificar. `kbps`: si se indica, sustituye al bitrate por defecto del códec.
fn audio_args(fmt: &str, codec: VideoCodec, kbps: Option<u32>) -> Vec<String> {
    let (name, default) = match (fmt, codec) {
        ("webm", _) | ("mkv", VideoCodec::Vp9) => ("libopus", 128),
        ("avi", _) => ("libmp3lame", 192),
        _ => ("aac", 192),
    };
    vec![
        "-c:a".to_string(),
        name.to_string(),
        "-b:a".to_string(),
        format!("{}k", kbps.unwrap_or(default)),
    ]
}

struct VideoJob {
    app: AppHandle,
    job_id: String,
    source: String,
    dest: String,
    muxer: &'static str,
    audio: Vec<String>,
    mute: bool,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    threads: Option<usize>,
    faststart: bool,
    codec: VideoCodec,
    mode: Mode,
    duration: Option<f64>,
    cancel: Arc<Notify>,
}

impl VideoJob {
    /// Nombre que se muestra como "encoder" en el progreso.
    fn label(&self, accel: HwAccel) -> &'static str {
        match self.mode {
            Mode::Remux => "copy (remux)",
            Mode::AudioMp3 => "libmp3lame",
            Mode::Encode { .. } => accel.encoder(self.codec),
        }
    }

    fn emit(&self, accel: HwAccel, secs: f64, speed: Option<String>, stage: &'static str) {
        let percent = match (stage, self.duration) {
            ("done", _) => Some(100.0),
            (_, Some(d)) if d > 0.0 => Some((secs / d * 100.0).clamp(0.0, 100.0)),
            _ => None,
        };
        let _ = self.app.emit(
            "convert-progress",
            ProgressPayload {
                job_id: self.job_id.clone(),
                percent,
                processed_secs: secs,
                speed,
                encoder: self.label(accel),
                stage,
            },
        );
    }

    fn container_flags(&self, c: &mut Command) {
        if self.faststart {
            c.args(["-movflags", "+faststart"]);
            if self.codec == VideoCodec::Hevc && matches!(self.mode, Mode::Encode { .. }) {
                c.args(["-tag:v", "hvc1"]); // compatibilidad con Apple/QuickTime
            }
        }
    }

    /// Añade argumentos de recorte (`-ss` y `-to`) antes de `-i` para búsqueda rápida por keyframes.
    fn trim_flags(&self, c: &mut Command) {
        if let Some(ss) = self.trim_start.filter(|v| *v > 0.0) {
            c.args(["-ss", &format!("{ss:.3}")]);
        }
        if let Some(to) = self.trim_end.filter(|v| *v > 0.0) {
            c.args(["-to", &format!("{to:.3}")]);
        }
    }

    async fn run(&self, accel: HwAccel) -> Res<()> {
        let mut c = cmd_with_priority("ffmpeg", self.threads.is_some());
        c.args(["-hide_banner", "-loglevel", "error", "-y", "-progress", "pipe:1", "-nostats"]);

        match self.mode {
            Mode::Encode { rate, scale } => {
                let (pre, post) = encoder_args(accel, self.codec, rate, scale, self.threads);
                c.args(&pre);
                self.trim_flags(&mut c);
                c.args(["-i", self.source.as_str(), "-map", "0:v:0"]);
                if self.mute {
                    c.arg("-an");
                } else {
                    c.args(["-map", "0:a?"]);
                }
                c.args(&post);
                if !self.mute {
                    c.args(&self.audio);
                }
                self.container_flags(&mut c);
            }
            Mode::Remux => {
                // Copia los streams tal cual: sin recodificar, sin GPU y sin pérdida
                self.trim_flags(&mut c);
                c.args(["-i", self.source.as_str(), "-map", "0:v:0"]);
                if self.mute {
                    c.args(["-an", "-c:v", "copy"]);
                } else {
                    c.args(["-map", "0:a?", "-c", "copy"]);
                }
                self.container_flags(&mut c);
            }
            Mode::AudioMp3 => {
                // Solo audio: descarta el vídeo y codifica MP3 VBR de alta calidad (~190 kbps)
                if let Some(t) = self.threads {
                    c.args(["-threads", &t.to_string()]);
                }
                self.trim_flags(&mut c);
                c.args([
                    "-i",
                    self.source.as_str(),
                    "-vn",
                    "-map",
                    "0:a:0",
                    "-c:a",
                    "libmp3lame",
                    "-q:a",
                    "2",
                    "-id3v2_version",
                    "3",
                ]);
            }
        }
        c.args(["-f", self.muxer, self.dest.as_str()]);
        c.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = c
            .spawn()
            .map_err(|e| AppError::Msg(format!("No se pudo lanzar FFmpeg: {e}")))?;
        let stdout = child.stdout.take().ok_or_else(|| AppError::Msg("sin stdout".into()))?;
        let stderr = child.stderr.take().ok_or_else(|| AppError::Msg("sin stderr".into()))?;

        // Drenar stderr en paralelo evita bloqueos si el pipe se llena
        let err_task = tokio::spawn(async move {
            let mut s = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut s).await;
            s
        });

        self.emit(accel, 0.0, None, "running");

        // `-progress` emite bloques clave=valor que terminan en `progress=continue|end`
        let mut lines = BufReader::new(stdout).lines();
        let reader = async {
            let (mut secs, mut speed) = (0.0_f64, None::<String>);
            let mut last_emit = std::time::Instant::now() - Duration::from_millis(500);
            while let Ok(Some(line)) = lines.next_line().await {
                let Some((k, v)) = line.split_once('=') else { continue };
                let v = v.trim();
                match k {
                    // out_time_ms también viene en microsegundos (bug histórico de FFmpeg)
                    "out_time_us" | "out_time_ms" => {
                        if let Ok(us) = v.parse::<i64>() {
                            secs = us.max(0) as f64 / 1_000_000.0;
                        }
                    }
                    "speed" => speed = Some(v.to_string()),
                    "progress" => {
                        let is_end = v == "end";
                        let now = std::time::Instant::now();
                        // Limitar emisiones a cada 100ms evita saturar IPC y re-renderizar React en exceso
                        if is_end || now.duration_since(last_emit) >= Duration::from_millis(100) {
                            last_emit = now;
                            self.emit(accel, secs, speed.clone(), "running");
                        }
                    }
                    _ => {}
                }
            }
        };

        // Espera a que FFmpeg termine… o a que el usuario cancele
        let cancelled = tokio::select! {
            _ = reader => false,
            _ = self.cancel.notified() => true,
        };

        if cancelled {
            let _ = child.kill().await; // termina el proceso y espera a que salga
            let _ = tokio::fs::remove_file(&self.dest).await; // no dejar archivos a medias
            return Err(AppError::Cancelled);
        }

        let status = child.wait().await?;
        let stderr_txt = err_task.await.unwrap_or_default();

        if status.success() {
            Ok(())
        } else {
            let _ = tokio::fs::remove_file(&self.dest).await;
            let tail: Vec<&str> = stderr_txt.lines().rev().take(5).collect();
            let tail = tail.into_iter().rev().collect::<Vec<_>>().join("\n");
            err(format!("FFmpeg falló ({status}) con {}:\n{tail}", self.label(accel)))
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn convert_video_inner(
    app: AppHandle,
    hw: &HwCache,
    job_id: String,
    source: String,
    dest: String,
    format: String,
    codec: VideoCodec,
    quality: u8,
    scale: Option<TargetSize>,
    remux_copy: bool,
    target_size_mb: Option<f64>,
    extract_audio_mp3: bool,
    mute: bool,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    overwrite: bool,
    force_cpu: bool,
    thread_mode: Option<String>,
    cancel: Arc<Notify>,
) -> Res<ConvertVideoResponse> {
    if !Path::new(&source).is_file() {
        return err(format!("El archivo de origen no existe: {source}"));
    }

    if let (Some(s), Some(e)) = (trim_start, trim_end) {
        if e <= s {
            return err("El tiempo de fin debe ser mayor que el tiempo de inicio.");
        }
    }

    let fmt = format.to_lowercase();
    let (raw_duration, has_audio) = probe_info(&source).await;

    if let (Some(d), Some(s)) = (raw_duration, trim_start) {
        if s >= d {
            return err("El tiempo de inicio supera la duración total del video.");
        }
    }

    let duration = effective_duration(raw_duration, trim_start, trim_end);
    let effective_has_audio = !mute && has_audio.unwrap_or(true);

    // Prioridad de modos: solo audio > copiar sin recodificar > recodificar
    let (muxer, faststart, mode, audio): (&'static str, bool, Mode, Vec<String>) = if extract_audio_mp3 {
        if has_audio == Some(false) {
            return err("Este video no tiene pista de audio que extraer.");
        }
        ("mp3", false, Mode::AudioMp3, Vec::new())
    } else {
        let Some(ct) = container(&fmt) else {
            return err(format!("Formato de vídeo no soportado: {fmt}"));
        };
        if remux_copy {
            (ct.muxer, ct.faststart, Mode::Remux, Vec::new())
        } else {
            if !supports(&fmt, codec) {
                return err(format!(
                    "El contenedor .{fmt} no admite ese códec. Elige otro formato o códec."
                ));
            }

            // El tamaño objetivo anula la calidad porcentual
            let target = target_size_mb.filter(|mb| *mb > 0.0);
            let rate = match target {
                Some(mb) => Rate::Bitrate(target_video_kbps(mb, duration, effective_has_audio)?),
                None => Rate::Quality(quality.clamp(1, 100)),
            };
            // Dimensiones acotadas y siempre pares (los códecs 4:2:0 lo exigen)
            let scale = scale.map(|s| (s.width.clamp(64, 8192) & !1, s.height.clamp(64, 8192) & !1));
            (
                ct.muxer,
                ct.faststart,
                Mode::Encode { rate, scale },
                if mute { Vec::new() } else { audio_args(&fmt, codec, target.map(|_| AUDIO_KBPS)) },
            )
        }
    };

    // Si `force_cpu` está activo en Ajustes, se ignora la aceleración por GPU
    let accel = match mode {
        Mode::Encode { .. } if !force_cpu => {
            let profile = *hw.0.get_or_try_init(detect_profile).await?;
            profile.for_codec(codec)
        }
        _ => HwAccel::Cpu,
    };

    let final_dest_path = resolve_dest_path(Path::new(&source), Path::new(&dest), overwrite);
    let final_dest = final_dest_path.to_string_lossy().into_owned();

    // La carpeta de salida elegida puede no existir todavía
    if let Some(parent) = final_dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    let threads = compute_thread_limit(thread_mode.as_deref());

    let job = VideoJob {
        app,
        job_id,
        source,
        dest: final_dest,
        muxer,
        audio,
        mute: mute && !extract_audio_mp3,
        trim_start,
        trim_end,
        threads,
        faststart,
        codec,
        mode,
        duration,
        cancel,
    };

    let outcome = async {
        if let Err(e) = job.run(accel).await {
            // Si se canceló o ya íbamos por CPU (o en modo copia/audio), no hay reintento
            if accel == HwAccel::Cpu || matches!(e, AppError::Cancelled) {
                return Err(e);
            }
            // Algunas fuentes (10 bits, 4:2:2…) fallan en NVENC/AMF/QSV/VAAPI → reintento automático por CPU
            job.emit(HwAccel::Cpu, 0.0, None, "fallback");
            job.run(HwAccel::Cpu).await?;
            job.emit(HwAccel::Cpu, 0.0, None, "done");
        } else {
            job.emit(accel, 0.0, None, "done");
        }
        Ok::<(), AppError>(())
    }
    .await;

    outcome?;
    let size_bytes = tokio::fs::metadata(&job.dest).await.ok().map(|m| m.len());
    Ok(ConvertVideoResponse {
        output: job.dest,
        size_bytes,
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn convert_video(
    app: AppHandle,
    hw: State<'_, HwCache>,
    reg: State<'_, JobRegistry>,
    job_id: String,
    source: String,
    dest: String,
    format: String,
    codec: VideoCodec,
    quality: u8,
    scale: Option<TargetSize>,
    remux_copy: bool,
    target_size_mb: Option<f64>,
    extract_audio_mp3: bool,
    mute: bool,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    overwrite: Option<bool>,
    force_cpu: Option<bool>,
    thread_mode: Option<String>,
) -> Result<ConvertVideoResponse, AppError> {
    // Se registra desde el principio para que `cancel_conversion` funcione en cualquier momento
    let cancel = Arc::new(Notify::new());
    reg.inner().0.lock().unwrap().insert(job_id.clone(), cancel.clone());

    let result = convert_video_inner(
        app,
        hw.inner(),
        job_id.clone(),
        source,
        dest,
        format,
        codec,
        quality,
        scale,
        remux_copy,
        target_size_mb,
        extract_audio_mp3,
        mute,
        trim_start,
        trim_end,
        overwrite.unwrap_or(false),
        force_cpu.unwrap_or(false),
        thread_mode,
        cancel,
    )
    .await;

    reg.inner().0.lock().unwrap().remove(&job_id);
    result
}

/// Cancela una conversión en curso: FFmpeg se detiene y se borra el archivo parcial.
#[tauri::command]
pub fn cancel_conversion(reg: State<'_, JobRegistry>, job_id: String) {
    if let Some(n) = reg.inner().0.lock().unwrap().get(&job_id) {
        n.notify_one();
    }
}

// ───────────────── Metadatos de imagen (con inspección EXIF/GPS/XMP) ─────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub color_type: String,
    pub has_alpha: bool,
    pub size_bytes: u64,
    pub has_exif: bool,
    pub has_gps: bool,
    pub has_xmp: bool,
    pub has_iptc: bool,
    pub has_icc: bool,
    pub has_comments: bool,
    pub removable_bytes: u64,
}

#[derive(Default)]
struct RawMetaScan {
    has_exif: bool,
    has_gps: bool,
    has_xmp: bool,
    has_iptc: bool,
    has_icc: bool,
    has_comments: bool,
    removable_bytes: u64,
}

/// Detecta si un bloque TIFF/EXIF contiene un puntero al sub-IFD de GPS (`0x8825`).
fn tiff_has_gps(tiff: &[u8]) -> bool {
    let le = match tiff.get(..2) {
        Some(b"II") => true,
        Some(b"MM") => false,
        _ => return false,
    };
    let u16_at = |o: usize| -> Option<u16> {
        let b: [u8; 2] = tiff.get(o..o + 2)?.try_into().ok()?;
        Some(if le { u16::from_le_bytes(b) } else { u16::from_be_bytes(b) })
    };
    let u32_at = |o: usize| -> Option<u32> {
        let b: [u8; 4] = tiff.get(o..o + 4)?.try_into().ok()?;
        Some(if le { u32::from_le_bytes(b) } else { u32::from_be_bytes(b) })
    };
    let Some(ifd) = u32_at(4).map(|x| x as usize) else { return false };
    let Some(n) = u16_at(ifd).map(|x| x as usize) else { return false };
    for i in 0..n {
        let e = ifd + 2 + i * 12;
        if u16_at(e) == Some(0x8825) {
            return true;
        }
    }
    false
}

/// Escanea los segmentos binarios de JPEG, PNG o WebP para saber exactamente qué metadatos tiene.
fn scan_image_metadata(d: &[u8]) -> RawMetaScan {
    let mut s = RawMetaScan::default();
    if d.starts_with(&[0xFF, 0xD8, 0xFF]) {
        let mut i = 2;
        while i + 4 <= d.len() && d[i] == 0xFF {
            let m = d[i + 1];
            if m == 0xFF {
                i += 1;
                continue;
            }
            if m == 0xDA {
                let tail = &d[i..];
                if let Some(pos) = tail.windows(2).position(|w| w == [0xFF, 0xD9]) {
                    let extra = tail.len().saturating_sub(pos + 2);
                    s.removable_bytes += extra as u64;
                }
                break;
            }
            if m == 0x01 || (0xD0..=0xD9).contains(&m) {
                i += 2;
                continue;
            }
            let len = u16::from_be_bytes([d[i + 2], d[i + 3]]) as usize;
            let end = i + 2 + len;
            if len < 2 || end > d.len() {
                break;
            }
            let payload = &d[i + 4..end];
            match m {
                0xE1 => {
                    s.removable_bytes += (end - i) as u64;
                    if let Some(tiff) = payload.strip_prefix(b"Exif\0\0") {
                        s.has_exif = true;
                        if tiff_has_gps(tiff) {
                            s.has_gps = true;
                        }
                    } else if payload.starts_with(b"http://ns.adobe.com/xap/")
                        || payload.windows(3).any(|w| w == b"xmp" || w == b"XMP")
                    {
                        s.has_xmp = true;
                    } else {
                        s.has_exif = true;
                    }
                }
                0xED => {
                    s.has_iptc = true;
                    s.removable_bytes += (end - i) as u64;
                }
                0xE2 if payload.starts_with(b"ICC_PROFILE\0") => {
                    s.has_icc = true;
                }
                0xFE => {
                    s.has_comments = true;
                    s.removable_bytes += (end - i) as u64;
                }
                0xE2..=0xEF if m != 0xEE => {
                    s.removable_bytes += (end - i) as u64;
                }
                _ => {}
            }
            i = end;
        }
    } else if d.starts_with(b"\x89PNG\r\n\x1a\n") {
        const KEEP: &[&[u8]] = &[
            b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP",
            b"sBIT", b"bKGD", b"pHYs", b"cICP", b"acTL", b"fcTL", b"fdAT",
        ];
        let mut i = 8;
        while i + 12 <= d.len() {
            let len = u32::from_be_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]]) as usize;
            let end = i + 12 + len;
            if end > d.len() {
                break;
            }
            let kind = &d[i + 4..i + 8];
            let payload = &d[i + 8..i + 8 + len];
            if kind == b"iCCP" {
                s.has_icc = true;
            } else if kind == b"eXIf" {
                s.has_exif = true;
                if tiff_has_gps(payload) {
                    s.has_gps = true;
                }
                s.removable_bytes += (end - i) as u64;
            } else if kind == b"tEXt" || kind == b"iTXt" || kind == b"zTXt" {
                if payload.windows(3).any(|w| w == b"XMP" || w == b"xmp") {
                    s.has_xmp = true;
                } else {
                    s.has_comments = true;
                }
                s.removable_bytes += (end - i) as u64;
            } else if !KEEP.iter().any(|k| *k == kind) {
                s.removable_bytes += (end - i) as u64;
            }
            if kind == b"IEND" {
                if end < d.len() {
                    s.removable_bytes += (d.len() - end) as u64;
                }
                break;
            }
            i = end;
        }
    } else if d.len() >= 12 && &d[..4] == b"RIFF" && &d[8..12] == b"WEBP" {
        let mut i = 12;
        while i + 8 <= d.len() {
            let size = u32::from_le_bytes([d[i + 4], d[i + 5], d[i + 6], d[i + 7]]) as usize;
            let data_end = i + 8 + size;
            if data_end > d.len() {
                break;
            }
            let end = (data_end + (size & 1)).min(d.len());
            let payload = &d[i + 8..data_end];
            match &d[i..i + 4] {
                b"EXIF" => {
                    s.has_exif = true;
                    let tiff = payload.strip_prefix(b"Exif\0\0").unwrap_or(payload);
                    if tiff_has_gps(tiff) {
                        s.has_gps = true;
                    }
                    s.removable_bytes += (end - i) as u64;
                }
                b"XMP " => {
                    s.has_xmp = true;
                    s.removable_bytes += (end - i) as u64;
                }
                b"ICCP" => {
                    s.has_icc = true;
                }
                _ => {}
            }
            i = end;
        }
    }
    s
}

#[tauri::command]
pub async fn get_image_metadata(source: String) -> Result<ImageMetadata, AppError> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&source);
        let raw_bytes = std::fs::read(path)?;
        let size_bytes = raw_bytes.len() as u64;
        let scan = scan_image_metadata(&raw_bytes);

        let (width, height) = image::image_dimensions(path)?;

        let reader = image::ImageReader::open(path)?.with_guessed_format()?;
        let format_name = reader
            .format()
            .map(|f| match f {
                image::ImageFormat::Jpeg => "JPG".to_string(),
                other => format!("{:?}", other).to_uppercase(),
            })
            .unwrap_or_else(|| "DESCONOCIDO".into());

        let (color_type, has_alpha) = match image::load_from_memory(&raw_bytes) {
            Ok(img) => {
                let color = img.color();
                (format!("{:?}", color), color.has_alpha())
            }
            Err(_) => ("Rgb8".into(), false),
        };

        Ok(ImageMetadata {
            width,
            height,
            format: format_name,
            color_type,
            has_alpha,
            size_bytes,
            has_exif: scan.has_exif,
            has_gps: scan.has_gps,
            has_xmp: scan.has_xmp,
            has_iptc: scan.has_iptc,
            has_icc: scan.has_icc,
            has_comments: scan.has_comments,
            removable_bytes: scan.removable_bytes,
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Error leyendo metadatos: {e}")))?
}

// ───────────────────────────── Imágenes ─────────────────────────────

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImgFormat {
    Png,
    #[serde(alias = "jpeg")]
    Jpg,
    Webp,
}

fn ensure_parent_dir(dest: &Path) -> Res<()> {
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    Ok(())
}

/// Convierte, redimensiona (opcional, con Lanczos3) y codifica en PNG, JPG o WebP (con calidad 1-100).
fn convert_image_sync(
    src: &Path,
    desired_dest: &Path,
    fmt: ImgFormat,
    quality: u8,
    scale: Option<u8>,
    overwrite: bool,
) -> Res<(String, u64)> {
    let dest = resolve_dest_path(src, desired_dest, overwrite);
    ensure_parent_dir(&dest)?;
    let mut img = image::open(src)?;

    // Redimensionado porcentual de alta calidad con filtro Lanczos3
    if let Some(pct) = scale.filter(|&p| p > 0 && p < 100) {
        let new_w = ((img.width() as u64 * pct as u64) / 100).max(1) as u32;
        let new_h = ((img.height() as u64 * pct as u64) / 100).max(1) as u32;
        img = img.resize_exact(new_w, new_h, FilterType::Lanczos3);
    }

    let q = quality.clamp(1, 100);

    match fmt {
        ImgFormat::Png => img.save_with_format(&dest, image::ImageFormat::Png)?,
        ImgFormat::Webp => {
            if q >= 100 {
                // 100 % = WebP sin pérdida (Lossless)
                DynamicImage::ImageRgba8(img.to_rgba8())
                    .save_with_format(&dest, image::ImageFormat::WebP)?;
            } else {
                // 1..=99 % = WebP con compresión ajustable (libwebp vía crate `webp`)
                let has_alpha = img.color().has_alpha();
                let webp_mem = if has_alpha {
                    let rgba = img.to_rgba8();
                    webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
                        .encode(q as f32)
                } else {
                    let rgb = img.to_rgb8();
                    webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height())
                        .encode(q as f32)
                };
                std::fs::write(&dest, &*webp_mem)?;
            }
        }
        ImgFormat::Jpg => {
            // JPEG no tiene canal alfa → aplanar a RGB
            let rgb = img.to_rgb8();
            let mut w = BufWriter::new(File::create(&dest)?);
            JpegEncoder::new_with_quality(&mut w, q).write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                ExtendedColorType::Rgb8,
            )?;
        }
    }

    let size_bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok((dest.to_string_lossy().into_owned(), size_bytes))
}

#[derive(Deserialize)]
pub struct ImageJob {
    source: String,
    dest: String,
    format: Option<ImgFormat>,
    quality: Option<u8>,
    scale: Option<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResult {
    source: String,
    dest: String,
    ok: bool,
    error: Option<String>,
    size_bytes: Option<u64>,
}

/// Una imagen. Se ejecuta en un hilo bloqueante para no frenar el runtime async.
#[tauri::command]
pub async fn convert_image(
    source: String,
    dest: String,
    format: ImgFormat,
    quality: Option<u8>,
    scale: Option<u8>,
    overwrite: Option<bool>,
) -> Result<ImageResult, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        match convert_image_sync(
            Path::new(&source),
            Path::new(&dest),
            format,
            quality.unwrap_or(90),
            scale,
            ow,
        ) {
            Ok((final_dest, bytes)) => Ok(ImageResult {
                source,
                dest: final_dest,
                ok: true,
                error: None,
                size_bytes: Some(bytes),
            }),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))?
}

/// Evento `image-progress`: { done, total }
#[derive(Serialize, Clone)]
struct ImageProgress {
    done: usize,
    total: usize,
}

/// Lote de imágenes en paralelo con Rayon (respetando el límite de núcleos elegido en Ajustes).
#[tauri::command]
pub async fn convert_images_batch(
    app: AppHandle,
    jobs: Vec<ImageJob>,
    format: ImgFormat,
    quality: Option<u8>,
    scale: Option<u8>,
    overwrite: Option<bool>,
    thread_mode: Option<String>,
) -> Result<Vec<ImageResult>, AppError> {
    let q = quality.unwrap_or(90);
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        run_in_rayon_pool(thread_mode.as_deref(), || {
            let total = jobs.len();
            let done = AtomicUsize::new(0);
            jobs.par_iter()
                .map(|j| {
                    let fmt = j.format.unwrap_or(format);
                    let qual = j.quality.unwrap_or(q);
                    let sc = j.scale.or(scale);
                    let r = convert_image_sync(Path::new(&j.source), Path::new(&j.dest), fmt, qual, sc, ow);
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    let _ = app.emit("image-progress", ImageProgress { done: n, total });
                    match r {
                        Ok((final_dest, bytes)) => ImageResult {
                            source: j.source.clone(),
                            dest: final_dest,
                            ok: true,
                            error: None,
                            size_bytes: Some(bytes),
                        },
                        Err(e) => ImageResult {
                            source: j.source.clone(),
                            dest: j.dest.clone(),
                            ok: false,
                            error: Some(e.to_string()),
                            size_bytes: None,
                        },
                    }
                })
                .collect::<Vec<ImageResult>>()
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))
}

// ───────────────── Quitar metadatos (sin recodificar) ─────────────────

/// Lee la orientación EXIF (1..=8) de un segmento APP1 "Exif".
fn exif_orientation(app1: &[u8]) -> Option<u16> {
    let tiff = app1.strip_prefix(b"Exif\0\0")?;
    let le = match tiff.get(..2)? {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let u16_at = |o: usize| -> Option<u16> {
        let b: [u8; 2] = tiff.get(o..o + 2)?.try_into().ok()?;
        Some(if le { u16::from_le_bytes(b) } else { u16::from_be_bytes(b) })
    };
    let u32_at = |o: usize| -> Option<u32> {
        let b: [u8; 4] = tiff.get(o..o + 4)?.try_into().ok()?;
        Some(if le { u32::from_le_bytes(b) } else { u32::from_be_bytes(b) })
    };
    let ifd = u32_at(4)? as usize;
    let n = u16_at(ifd)? as usize;
    for i in 0..n {
        let e = ifd + 2 + i * 12;
        if u16_at(e)? == 0x0112 {
            let v = u16_at(e + 8)?;
            return (1..=8).contains(&v).then_some(v);
        }
    }
    None
}

/// Segmento APP1 mínimo que contiene SOLO la orientación (sin datos personales).
fn orientation_segment(o: u16) -> Vec<u8> {
    let mut tiff: Vec<u8> = vec![b'I', b'I', 42, 0, 8, 0, 0, 0]; // cabecera + offset al IFD0
    tiff.extend([1u8, 0]); // una entrada
    tiff.extend(0x0112u16.to_le_bytes()); // etiqueta Orientation
    tiff.extend(3u16.to_le_bytes()); // tipo SHORT
    tiff.extend(1u32.to_le_bytes()); // cantidad
    tiff.extend(o.to_le_bytes());
    tiff.extend([0u8, 0]); // relleno del valor
    tiff.extend(0u32.to_le_bytes()); // sin siguiente IFD
    let mut seg: Vec<u8> = vec![0xFF, 0xE1];
    seg.extend(((2 + 6 + tiff.len()) as u16).to_be_bytes());
    seg.extend(b"Exif\0\0");
    seg.extend(tiff);
    seg
}

/// JPEG: copia los segmentos necesarios para ver la imagen y descarta EXIF/XMP, IPTC,
/// comentarios y datos añadidos tras el final (p. ej. el video de las "fotos en movimiento").
fn strip_jpeg(d: &[u8]) -> Res<Vec<u8>> {
    if d.len() < 4 || d[0] != 0xFF || d[1] != 0xD8 {
        return err("El archivo no es un JPEG válido.");
    }
    let mut out: Vec<u8> = vec![0xFF, 0xD8];
    let mut after_app0 = 2;
    let mut orientation: Option<u16> = None;
    let mut i = 2;
    loop {
        if i + 4 > d.len() || d[i] != 0xFF {
            return err("Estructura JPEG inesperada.");
        }
        let m = d[i + 1];
        if m == 0xFF {
            i += 1; // relleno
            continue;
        }
        if m == 0xDA {
            // Inicio del scan: el resto son datos de imagen hasta el primer EOI
            let tail = &d[i..];
            let cut = tail.windows(2).position(|w| w == [0xFF, 0xD9]).map(|p| p + 2).unwrap_or(tail.len());
            out.extend_from_slice(&tail[..cut]);
            break;
        }
        if m == 0x01 || (0xD0..=0xD9).contains(&m) {
            out.extend_from_slice(&d[i..i + 2]); // marcadores sin longitud
            i += 2;
            continue;
        }
        let len = u16::from_be_bytes([d[i + 2], d[i + 3]]) as usize;
        let end = i + 2 + len;
        if len < 2 || end > d.len() {
            return err("JPEG truncado o dañado.");
        }
        let payload = &d[i + 4..end];
        match m {
            0xE1 => {
                if orientation.is_none() {
                    orientation = exif_orientation(payload);
                }
            }
            0xE0 => {
                out.extend_from_slice(&d[i..end]); // JFIF
                after_app0 = out.len();
            }
            0xE2 if payload.starts_with(b"ICC_PROFILE\0") => out.extend_from_slice(&d[i..end]), // perfil de color
            0xEE => out.extend_from_slice(&d[i..end]), // Adobe (necesario para decodificar bien algunos JPEG)
            0xE2..=0xEF | 0xFE => {} // resto de APPn (IPTC, XMP, MPF…) y comentarios
            _ => out.extend_from_slice(&d[i..end]), // tablas, SOF, etc.
        }
        i = end;
    }
    if let Some(o) = orientation.filter(|o| *o != 1) {
        drop(out.splice(after_app0..after_app0, orientation_segment(o)));
    }
    Ok(out)
}

/// PNG: conserva solo los bloques necesarios para dibujar la imagen (copiados tal cual, con su CRC).
fn strip_png(d: &[u8]) -> Res<Vec<u8>> {
    const SIG: &[u8] = b"\x89PNG\r\n\x1a\n";
    const KEEP: &[&[u8]] = &[
        b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"sBIT",
        b"bKGD", b"pHYs", b"cICP", b"acTL", b"fcTL", b"fdAT",
    ];
    if !d.starts_with(SIG) {
        return err("El archivo no es un PNG válido.");
    }
    let mut out = SIG.to_vec();
    let mut i = SIG.len();
    let mut ended = false;
    while i + 12 <= d.len() {
        let len = u32::from_be_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]]) as usize;
        let end = i + 12 + len;
        if end > d.len() {
            return err("PNG truncado o dañado.");
        }
        let kind = &d[i + 4..i + 8];
        if KEEP.iter().any(|k| *k == kind) {
            out.extend_from_slice(&d[i..end]);
        }
        if kind == b"IEND" {
            ended = true;
            break; // lo que haya después del final se descarta
        }
        i = end;
    }
    if !ended {
        return err("PNG sin bloque final (IEND): archivo dañado.");
    }
    Ok(out)
}

/// WebP: elimina los bloques EXIF y XMP, apaga sus banderas en VP8X y recalcula el tamaño RIFF.
fn strip_webp(d: &[u8]) -> Res<Vec<u8>> {
    if d.len() < 12 || &d[..4] != b"RIFF" || &d[8..12] != b"WEBP" {
        return err("El archivo no es un WebP válido.");
    }
    let mut out = d[..12].to_vec();
    let mut i = 12;
    while i + 8 <= d.len() {
        let size = u32::from_le_bytes([d[i + 4], d[i + 5], d[i + 6], d[i + 7]]) as usize;
        let data_end = i + 8 + size;
        if data_end > d.len() {
            return err("WebP truncado o dañado.");
        }
        let end = (data_end + (size & 1)).min(d.len()); // los bloques se alinean a par
        match &d[i..i + 4] {
            b"EXIF" | b"XMP " => {}
            b"VP8X" => {
                let mut chunk = d[i..end].to_vec();
                if chunk.len() > 8 {
                    chunk[8] &= !0x0C; // bandera EXIF (0x08) y XMP (0x04)
                }
                out.extend(chunk);
            }
            _ => out.extend_from_slice(&d[i..end]),
        }
        i = end;
    }
    let riff = (out.len() - 8) as u32;
    out[4..8].copy_from_slice(&riff.to_le_bytes());
    Ok(out)
}

/// Detecta el formato por su contenido (no por la extensión) y escribe la copia limpia.
fn strip_metadata_sync(src: &Path, desired_dest: &Path, overwrite: bool) -> Res<(String, u64)> {
    let dest = resolve_dest_path(src, desired_dest, overwrite);
    if src == dest {
        return err("El destino coincide con el origen.");
    }
    ensure_parent_dir(&dest)?;
    let data = std::fs::read(src)?;
    let clean = if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        strip_jpeg(&data)?
    } else if data.starts_with(b"\x89PNG") {
        strip_png(&data)?
    } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        strip_webp(&data)?
    } else {
        return err("Formato no compatible: solo PNG, JPG y WebP.");
    };
    let len = clean.len() as u64;
    std::fs::write(&dest, clean)?;
    Ok((dest.to_string_lossy().into_owned(), len))
}

/// Lote de imágenes: crea una copia sin metadatos y en el mismo formato (en paralelo con Rayon).
#[tauri::command]
pub async fn strip_images_metadata(
    app: AppHandle,
    jobs: Vec<ImageJob>,
    overwrite: Option<bool>,
    thread_mode: Option<String>,
) -> Result<Vec<ImageResult>, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        run_in_rayon_pool(thread_mode.as_deref(), || {
            let total = jobs.len();
            let done = AtomicUsize::new(0);
            jobs.par_iter()
                .map(|j| {
                    let r = strip_metadata_sync(Path::new(&j.source), Path::new(&j.dest), ow);
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    let _ = app.emit("image-progress", ImageProgress { done: n, total });
                    match r {
                        Ok((final_dest, bytes)) => ImageResult {
                            source: j.source.clone(),
                            dest: final_dest,
                            ok: true,
                            error: None,
                            size_bytes: Some(bytes),
                        },
                        Err(e) => ImageResult {
                            source: j.source.clone(),
                            dest: j.dest.clone(),
                            ok: false,
                            error: Some(e.to_string()),
                            size_bytes: None,
                        },
                    }
                })
                .collect::<Vec<ImageResult>>()
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))
}

fn to_base64(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

const APP_ICON_PNG_BYTES: &[u8] = include_bytes!("../icons/128x128.png");
const APP_ICON_ICO_BYTES: &[u8] = include_bytes!("../icons/icon.ico");

fn ensure_app_assets() -> (Option<std::path::PathBuf>, Option<std::path::PathBuf>) {
    let temp_dir = std::env::temp_dir();
    let temp_png = temp_dir.join("multimedia-converter-logo.png");
    if !temp_png.exists() {
        let _ = std::fs::write(&temp_png, APP_ICON_PNG_BYTES);
    }
    let temp_ico = temp_dir.join("multimedia-converter-icon.ico");
    if !temp_ico.exists() {
        let _ = std::fs::write(&temp_ico, APP_ICON_ICO_BYTES);
    }
    (
        if temp_png.exists() { Some(temp_png) } else { None },
        if temp_ico.exists() { Some(temp_ico) } else { None },
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn show_system_notification(title: &str, message: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command as StdCommand;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let (png_opt, ico_opt) = ensure_app_assets();
        let png_path = png_opt
            .map(|p| p.to_string_lossy().into_owned().replace('\'', "''"))
            .unwrap_or_default();
        let ico_path = ico_opt
            .map(|p| p.to_string_lossy().into_owned().replace('\'', "''"))
            .unwrap_or_default();

        let safe_title_xml = xml_escape(title);
        let safe_msg_xml = xml_escape(message);

        let safe_title_ps = title.replace('\'', "''");
        let safe_msg_ps = message.replace('\'', "''");

        // Construir script PowerShell con una sola línea de comandos para evitar problemas de terminador here-string
        let script = format!(
            r#"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; $shown = $false; $png = '{png_path}'; $k1 = 'HKCU:\\Software\\Classes\\AppUserModelId\\com.raul.multimedia-converter'; $k2 = 'HKCU:\\Software\\Classes\\AppUserModelId\\Multimedia.Converter'; if (!(Test-Path $k1)) {{ New-Item -Path $k1 -Force | Out-Null }}; if (!(Test-Path $k2)) {{ New-Item -Path $k2 -Force | Out-Null }}; Set-ItemProperty -Path $k1 -Name 'DisplayName' -Value 'Multimedia Converter' -Force; Set-ItemProperty -Path $k2 -Name 'DisplayName' -Value 'Multimedia Converter' -Force; if ($png -ne '') {{ Set-ItemProperty -Path $k1 -Name 'IconUri' -Value $png -Force; Set-ItemProperty -Path $k2 -Name 'IconUri' -Value $png -Force }}; if ($png -ne '' -and (Test-Path $png)) {{ $xml = "<toast><visual><binding template='ToastGeneric'><text>{safe_title_xml}</text><text>{safe_msg_xml}</text><image placement='appLogoOverride' src='$png' /></binding></visual></toast>"; try {{ $doc = New-Object Windows.Data.Xml.Dom.XmlDocument; $doc.LoadXml($xml); $toast = [Windows.UI.Notifications.ToastNotification]::new($doc); try {{ $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('com.raul.multimedia-converter'); $notifier.Show($toast); $shown = $true }} catch {{ $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Multimedia.Converter'); $notifier.Show($toast); $shown = $true }} }} catch {{ try {{ $appId = '{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\WindowsPowerShell\v1.0\powershell.exe'; $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId); $notifier.Show($toast); $shown = $true }} catch {{}} }} }}; if (-not $shown) {{ Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b = New-Object System.Windows.Forms.NotifyIcon; $ico = '{ico_path}'; if ($ico -ne '' -and (Test-Path $ico)) {{ try {{ $b.Icon = New-Object System.Drawing.Icon($ico) }} catch {{}} }}; if ($null -eq $b.Icon) {{ $b.Icon = [System.Drawing.SystemIcons]::Application }}; $b.BalloonTipTitle = '{safe_title_ps}'; $b.BalloonTipText = '{safe_msg_ps}'; $b.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::None; $b.Visible = $true; $b.ShowBalloonTip(4500); Start-Sleep -Milliseconds 1500; $b.Dispose() }}"#
        );

        let utf16: Vec<u16> = script.encode_utf16().collect();
        let mut bytes = Vec::with_capacity(utf16.len() * 2);
        for u in utf16 {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let b64 = to_base64(&bytes);

        let _ = StdCommand::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", &b64])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
}

/// Dispara una notificación de escritorio en el sistema si la aplicación no está en primer plano (minimizada o en segundo plano).
/// Si `force` es true, dispara la notificación incluso si la ventana tiene el foco (para pruebas).
#[tauri::command]
pub async fn notify_completion_if_unfocused(
    app: AppHandle,
    title: Option<String>,
    message: Option<String>,
    force: Option<bool>,
) -> Result<bool, AppError> {
    let should_force = force.unwrap_or(false);

    let win = app.get_webview_window("main").or_else(|| {
        app.webview_windows().into_values().next()
    });

    if let Some(w) = win {
        let is_focused = w.is_focused().unwrap_or(false);
        if !should_force && is_focused {
            return Ok(false);
        }
        let _ = w.request_user_attention(Some(UserAttentionType::Informational));
    }

    let t = title.unwrap_or_else(|| "Conversor Multimedia".to_string());
    let m = message.unwrap_or_else(|| "¡La conversión ya está lista!".to_string());

    std::thread::spawn(move || {
        show_system_notification(&t, &m);
    });

    Ok(true)
}
``

## src-tauri/src/docs.rs

``rust
use std::{
    collections::HashMap,
    fs::File,
    io::{BufReader, BufWriter, Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
};

use lopdf::{dictionary, Document as PdfDoc, Object, ObjectId, Stream};
use flate2::read::{DeflateDecoder, ZlibDecoder};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

use crate::commands::AppError;

type Res<T> = Result<T, AppError>;

fn err<T>(m: impl Into<String>) -> Res<T> {
    Err(AppError::Msg(m.into()))
}

static DOC_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
static WORD_COM_MUTEX: Mutex<()> = Mutex::new(());
static WORD_INSTALLED: OnceLock<bool> = OnceLock::new();
static EXCEL_INSTALLED: OnceLock<bool> = OnceLock::new();
static LIBREOFFICE_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Genera una ruta temporal única e inmune a colisiones entre procesos y hilos concurrentes.
fn unique_temp_path(prefix: &str, ext: &str) -> PathBuf {
    let id = DOC_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}_{}_{}_{}.{ext}", std::process::id(), id, now))
}

#[cfg(windows)]
fn is_word_installed() -> bool {
    *WORD_INSTALLED.get_or_init(|| {
        let candidates = [
            r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
            r"C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE",
            r"C:\Program Files\Microsoft Office\Office16\WINWORD.EXE",
            r"C:\Program Files (x86)\Microsoft Office\Office16\WINWORD.EXE",
            r"C:\Program Files\Microsoft Office\Office15\WINWORD.EXE",
            r"C:\Program Files (x86)\Microsoft Office\Office15\WINWORD.EXE",
        ];
        if candidates.iter().any(|p| Path::new(p).exists()) {
            return true;
        }
        let mut c = Command::new("powershell");
        c.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "if ([Type]::GetTypeFromProgID('Word.Application')) { exit 0 } else { exit 1 }",
        ]);
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c.status().map(|st| st.success()).unwrap_or(false)
    })
}

#[cfg(windows)]
fn is_excel_installed() -> bool {
    *EXCEL_INSTALLED.get_or_init(|| {
        let candidates = [
            r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE",
            r"C:\Program Files (x86)\Microsoft Office\root\Office16\EXCEL.EXE",
            r"C:\Program Files\Microsoft Office\Office16\EXCEL.EXE",
            r"C:\Program Files (x86)\Microsoft Office\Office16\EXCEL.EXE",
            r"C:\Program Files\Microsoft Office\Office15\EXCEL.EXE",
            r"C:\Program Files (x86)\Microsoft Office\Office15\EXCEL.EXE",
        ];
        if candidates.iter().any(|p| Path::new(p).exists()) {
            return true;
        }
        let mut c = Command::new("powershell");
        c.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "if ([Type]::GetTypeFromProgID('Excel.Application')) { exit 0 } else { exit 1 }",
        ]);
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c.status().map(|st| st.success()).unwrap_or(false)
    })
}

#[cfg(not(windows))]
fn is_word_installed() -> bool {
    false
}

#[cfg(not(windows))]
fn is_excel_installed() -> bool {
    false
}

fn find_libreoffice_bin() -> Option<&'static Path> {
    LIBREOFFICE_PATH
        .get_or_init(|| {
            let candidates = if cfg!(windows) {
                vec![
                    r"C:\Program Files\LibreOffice\program\soffice.exe",
                    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
                ]
            } else {
                vec!["/usr/bin/libreoffice", "/usr/bin/soffice", "/usr/local/bin/soffice"]
            };
            for p in candidates {
                let path = Path::new(p);
                if path.is_file() {
                    return Some(path.to_path_buf());
                }
            }
            None
        })
        .as_deref()
}

// ─────────────────── Tipos de Documentos ───────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DocFormat {
    Pdf,
    Docx,
    Xlsx,
    Txt,
    Md,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMetadata {
    pub format: String,
    pub size_bytes: u64,
    pub pages: Option<u32>,
    pub words: usize,
    pub chars: usize,
    pub author: Option<String>,
    pub creator: Option<String>,
    pub title: Option<String>,
    pub has_metadata: bool,
    pub embedded_images: usize,
    pub preview: String,
}

#[derive(Deserialize)]
pub struct DocJob {
    pub source: String,
    pub dest: String,
    pub format: Option<DocFormat>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocResult {
    pub source: String,
    pub dest: String,
    pub ok: bool,
    pub error: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Serialize, Clone)]
struct DocProgress {
    done: usize,
    total: usize,
}

// ─────────────────── Utilidades de rutas y paralelismo ───────────────────

fn compute_thread_limit(mode: Option<&str>) -> Option<usize> {
    let total = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    match mode {
        Some("half") => Some((total / 3).max(2).min(total)),
        Some("two") => Some(1.max(total.min(2) - 1)),
        _ => None,
    }
}

fn run_in_rayon_pool<F, R>(thread_mode: Option<&str>, op: F) -> R
where
    F: FnOnce() -> R + Send,
    R: Send,
{
    if let Some(n) = compute_thread_limit(thread_mode) {
        if let Ok(pool) = rayon::ThreadPoolBuilder::new().num_threads(n).build() {
            return pool.install(op);
        }
    }
    op()
}

fn resolve_dest_path(src: &Path, desired: &Path, overwrite: bool) -> PathBuf {
    if overwrite && src != desired {
        return desired.to_path_buf();
    }
    if !desired.exists() && src != desired {
        return desired.to_path_buf();
    }
    let parent = desired.parent().unwrap_or_else(|| Path::new(""));
    let stem = desired
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento");
    let ext = desired.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut n = 2usize;
    loop {
        let file_name = if ext.is_empty() {
            format!("{stem}_{n}")
        } else {
            format!("{stem}_{n}.{ext}")
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() && candidate != src {
            return candidate;
        }
        n += 1;
    }
}

fn ensure_parent_dir(dest: &Path) -> Res<()> {
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    Ok(())
}

// ─────────────────── Lectura y extracción de DOCX / PDF / TXT / MD ───────────────────

fn xml_unescape(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Extrae el valor entre `<tag>...</tag>` en un XML sencillo (como `docProps/core.xml`).
fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open_pat = format!("<{tag}");
    let close_pat = format!("</{tag}>");
    let start_idx = xml.find(&open_pat)?;
    let after_open = &xml[start_idx + open_pat.len()..];
    let gt = after_open.find('>')?;
    if gt > 0 && after_open.as_bytes()[gt - 1] == b'/' {
        return None; // etiqueta vacía <tag/>
    }
    let content_start = &after_open[gt + 1..];
    let end_idx = content_start.find(&close_pat)?;
    let val = xml_unescape(content_start[..end_idx].trim());
    (!val.is_empty()).then_some(val)
}

/// Convierte el XML principal de Word (`word/document.xml`) en párrafos limpios.
fn parse_docx_document_xml(xml: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    for p_block in xml.split("</w:p>") {
        let mut p_text = String::new();
        let mut rest = p_block;
        while let Some(idx) = rest.find("<w:t") {
            let after = &rest[idx + 4..];
            // Asegurar que la etiqueta es estrictamente <w:t> o <w:t ...>
            // y NUNCA <w:tab>, <w:tabs>, <w:tag>, <w:tbl>, <w:tc>
            if !after.starts_with('>') && !after.starts_with(' ') {
                if let Some(gt) = after.find('>') {
                    rest = &after[gt + 1..];
                    continue;
                }
                break;
            }

            if let Some(gt) = after.find('>') {
                if gt > 0 && after.as_bytes()[gt - 1] == b'/' {
                    rest = &after[gt + 1..];
                    continue;
                }
                let inner = &after[gt + 1..];
                if let Some(end_t) = inner.find("</w:t>") {
                    p_text.push_str(&xml_unescape(&inner[..end_t]));
                    rest = &inner[end_t + 6..];
                    continue;
                }
            }
            break;
        }
        let trimmed = p_text.trim();
        if !trimmed.is_empty() {
            paragraphs.push(trimmed.to_string());
        }
    }
    paragraphs
}

struct ExtractedDoc {
    format: String,
    pages: Option<u32>,
    paragraphs: Vec<String>,
    author: Option<String>,
    creator: Option<String>,
    title: Option<String>,
    has_metadata: bool,
    embedded_images: usize,
}

fn read_docx_info(path: &Path) -> Res<ExtractedDoc> {
    let file = File::open(path)?;
    let mut zip = ZipArchive::new(BufReader::new(file))
        .map_err(|e| AppError::Msg(format!("El archivo DOCX no es válido: {e}")))?;

    let mut doc_xml = String::new();
    if let Ok(mut f) = zip.by_name("word/document.xml") {
        let _ = f.read_to_string(&mut doc_xml);
    } else {
        return err("El archivo DOCX no contiene word/document.xml.");
    }

    let mut core_xml = String::new();
    if let Ok(mut f) = zip.by_name("docProps/core.xml") {
        let _ = f.read_to_string(&mut core_xml);
    }

    let mut app_xml = String::new();
    if let Ok(mut f) = zip.by_name("docProps/app.xml") {
        let _ = f.read_to_string(&mut app_xml);
    }

    let author = extract_xml_tag(&core_xml, "dc:creator")
        .or_else(|| extract_xml_tag(&core_xml, "cp:lastModifiedBy"));
    let title = extract_xml_tag(&core_xml, "dc:title");
    let creator =
        extract_xml_tag(&app_xml, "Application").or_else(|| extract_xml_tag(&app_xml, "Company"));
    let pages = extract_xml_tag(&app_xml, "Pages").and_then(|p| p.parse::<u32>().ok());

    let mut embedded_images = 0usize;
    for i in 0..zip.len() {
        if let Ok(f) = zip.by_index(i) {
            if f.name().starts_with("word/media/") && !f.name().ends_with('/') {
                embedded_images += 1;
            }
        }
    }

    let paragraphs = parse_docx_document_xml(&doc_xml);
    let words: usize = paragraphs
        .iter()
        .map(|p| p.split_whitespace().count())
        .sum();
    let estimated_pages = pages.or_else(|| Some(((words / 280) + 1) as u32));
    let has_metadata = author.is_some()
        || creator.is_some()
        || title.is_some()
        || extract_xml_tag(&core_xml, "dcterms:created").is_some();

    Ok(ExtractedDoc {
        format: "DOCX".into(),
        pages: estimated_pages,
        paragraphs,
        author,
        creator,
        title,
        has_metadata,
        embedded_images,
    })
}

fn pdf_obj_to_string(obj: &Object) -> Option<String> {
    match obj {
        Object::String(bytes, _) => {
            let s = String::from_utf8_lossy(bytes).trim().to_string();
            (!s.is_empty()).then_some(s)
        }
        _ => None,
    }
}

fn read_pdf_info(path: &Path) -> Res<ExtractedDoc> {
    let doc =
        PdfDoc::load(path).map_err(|e| AppError::Msg(format!("No se pudo abrir el PDF: {e}")))?;
    let pages_count = doc.get_pages().len() as u32;

    let mut author = None;
    let mut creator = None;
    let mut title = None;
    let mut has_metadata = false;

    if let Ok(info_ref) = doc.trailer.get(b"Info").and_then(Object::as_reference) {
        if let Ok(info_dict) = doc.get_object(info_ref).and_then(Object::as_dict) {
            author = info_dict.get(b"Author").ok().and_then(pdf_obj_to_string);
            creator = info_dict
                .get(b"Creator")
                .ok()
                .and_then(pdf_obj_to_string)
                .or_else(|| info_dict.get(b"Producer").ok().and_then(pdf_obj_to_string));
            title = info_dict.get(b"Title").ok().and_then(pdf_obj_to_string);
            has_metadata = !info_dict.is_empty();
        }
    }

    if let Ok(cat) = doc.catalog() {
        if cat.has(b"Metadata") {
            has_metadata = true;
        }
    }

    // Contar imágenes incrustadas (/Subtype /Image)
    let mut embedded_images = 0usize;
    for obj in doc.objects.values() {
        if let Ok(stream) = obj.as_stream() {
            if let Ok(sub) = stream.dict.get(b"Subtype").and_then(Object::as_name_str) {
                if sub == "Image" {
                    embedded_images += 1;
                }
            }
        }
    }

    // Extraer texto del PDF
    let raw_text = pdf_extract::extract_text(path).unwrap_or_default();
    let paragraphs: Vec<String> = raw_text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();

    Ok(ExtractedDoc {
        format: "PDF".into(),
        pages: Some(pages_count.max(1)),
        paragraphs,
        author,
        creator,
        title,
        has_metadata,
        embedded_images,
    })
}

fn read_text_info(path: &Path, fmt_label: &str) -> Res<ExtractedDoc> {
    let content = std::fs::read_to_string(path)?;
    let paragraphs: Vec<String> = content
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.trim().is_empty())
        .map(String::from)
        .collect();
    let words: usize = paragraphs
        .iter()
        .map(|p| p.split_whitespace().count())
        .sum();
    Ok(ExtractedDoc {
        format: fmt_label.to_string(),
        pages: Some(((words / 300) + 1) as u32),
        paragraphs,
        author: None,
        creator: None,
        title: None,
        has_metadata: false,
        embedded_images: 0,
    })
}

fn extract_any_doc(path: &Path) -> Res<ExtractedDoc> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "docx" => read_docx_info(path),
        "pdf" => read_pdf_info(path),
        "md" | "markdown" => read_text_info(path, "MD"),
        "txt" => read_text_info(path, "TXT"),
        _ => err(format!("Formato de documento no soportado: .{ext}")),
    }
}

// ─────────────────── Generadores nativos (DOCX y PDF) ───────────────────

/// Construye un archivo `.docx` OpenXML válido y limpio desde cero con los párrafos dados.

// ─────────────────── Motor avanzado PDF -> DOCX (Fiel al diseño original) ───────────────────

#[derive(Clone)]
struct DocxImage {
    rel_id: String,
    filename: String,
    data: Vec<u8>,
    width: u32,
    height: u32,
}

#[derive(Clone)]
enum DocxElement {
    Header(String),
    CoverLogo(DocxImage),
    CoverTitle(String),
    CoverFieldHeader(String),
    CoverFieldValue(String),
    PrimaryBanner(String),
    SecondaryBanner(String),
    Bullet(String),
    Caption(String),
    Paragraph(String),
    PageBreak,
    Image(DocxImage),
}

fn compute_emu(width: u32, height: u32) -> (u64, u64) {
    let max_w = 4_800_000.0_f64; // ~13.5 cm
    let max_h = 3_600_000.0_f64; // ~10 cm
    let w = width.max(1) as f64;
    let h = height.max(1) as f64;
    let emu_w = w * 9525.0;
    let emu_h = h * 9525.0;
    let scale = (max_w / emu_w).min(max_h / emu_h).min(1.0);
    let cx = ((emu_w * scale) as u64).clamp(914_400, 4_800_000);
    let cy = ((emu_h * scale) as u64).clamp(914_400, 3_800_000);
    (cx, cy)
}

fn compute_logo_emu(width: u32, height: u32) -> (u64, u64) {
    let max_w = 2_200_000.0_f64; // ~6 cm de ancho para logo de portada
    let max_h = 2_200_000.0_f64;
    let w = width.max(1) as f64;
    let h = height.max(1) as f64;
    let emu_w = w * 9525.0;
    let emu_h = h * 9525.0;
    let scale = (max_w / emu_w).min(max_h / emu_h).min(1.0);
    let cx = ((emu_w * scale) as u64).clamp(914_400, 2_400_000);
    let cy = ((emu_h * scale) as u64).clamp(914_400, 2_400_000);
    (cx, cy)
}

fn decompress_zlib(data: &[u8]) -> Option<Vec<u8>> {
    let mut decoder = ZlibDecoder::new(data);
    let mut buf = Vec::new();
    if decoder.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
        Some(buf)
    } else {
        let mut def = DeflateDecoder::new(data);
        let mut buf2 = Vec::new();
        if def.read_to_end(&mut buf2).is_ok() && !buf2.is_empty() {
            Some(buf2)
        } else {
            None
        }
    }
}

fn is_primary_banner(s: &str) -> bool {
    let u = s.trim().to_uppercase();
    u == "TITULO"
        || u == "TÍTULO"
        || u == "OBJETIVO"
        || u == "MATERIALES"
        || u == "DESCRIPCIÓN DE ACTIVIDADES"
        || u == "DESCRIPCION DE ACTIVIDADES"
        || u == "CONCLUSIONES"
        || u == "CONCLUSIÓN"
        || u == "CONCLUSION"
}

fn is_secondary_banner(s: &str) -> bool {
    let t = s.trim();
    if t.len() > 45 {
        return false;
    }
    let u = t.to_uppercase();
    if (u.starts_with("ACTIVIDAD") || u.starts_with("ACTIVIDAD:"))
        && (u.contains('1') || u.contains('2') || u.contains('3') || u.contains('4'))
        && (t.ends_with(':') || t.len() < 20)
    {
        return true;
    }
    if (u.starts_with("ESTUDIANTE") || u.starts_with("ESTUDIANTES"))
        && (u.contains('1') || u.contains('2') || u.contains('3') || u.contains('4'))
    {
        return true;
    }
    false
}

fn is_heading_line(line: &str) -> bool {
    is_primary_banner(line) || is_secondary_banner(line)
}

fn extract_image_from_stream(doc: &PdfDoc, stream: &Stream) -> Option<(Vec<u8>, &'static str, u32, u32)> {
    let dict = &stream.dict;
    let subtype = dict.get(b"Subtype").ok()?.as_name_str().ok()?;
    if subtype != "Image" {
        return None;
    }

    let width = dict.get(b"Width").ok()?.as_i64().ok()? as u32;
    let height = dict.get(b"Height").ok()?.as_i64().ok()? as u32;

    if width < 10 || height < 10 {
        return None;
    }

    let filter = dict.get(b"Filter").ok();
    let is_dct = match filter {
        Some(Object::Name(ref name)) => name == b"DCTDecode",
        Some(Object::Array(ref arr)) => arr.iter().any(|o| matches!(o, Object::Name(ref n) if n == b"DCTDecode")),
        _ => false,
    };

    if is_dct && stream.content.starts_with(&[0xFF, 0xD8]) {
        return Some((stream.content.clone(), "jpeg", width, height));
    }

    let decompressed = stream
        .decompressed_content()
        .ok()
        .or_else(|| decompress_zlib(&stream.content))?;

    if decompressed.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some((decompressed.to_vec(), "png", width, height));
    }
    if decompressed.starts_with(&[0xFF, 0xD8]) {
        return Some((decompressed.to_vec(), "jpeg", width, height));
    }

    let cs = dict.get(b"ColorSpace").ok();
    let bpc = dict.get(b"BitsPerComponent").ok().and_then(|o| o.as_i64().ok()).unwrap_or(8);

    // Decodificación de espacio de color indexado (ej. escudo / logo con paleta)
    if let Some(Object::Array(ref arr)) = cs {
        if arr.first().and_then(|o| o.as_name().ok()) == Some(b"Indexed") {
            let lookup_data = match arr.get(3) {
                Some(Object::Reference(r)) => {
                    if let Ok(pal_stream) = doc.get_object(*r).and_then(Object::as_stream) {
                        decompress_zlib(&pal_stream.content).unwrap_or_else(|| pal_stream.content.clone())
                    } else if let Ok(s) = doc.get_object(*r).and_then(Object::as_str) {
                        s.to_vec()
                    } else {
                        Vec::new()
                    }
                }
                Some(Object::String(bytes, _)) => bytes.clone(),
                _ => Vec::new(),
            };

            if !lookup_data.is_empty() {
                let mut rgb = Vec::with_capacity((width * height * 3) as usize);
                for &idx in &decompressed {
                    let i = (idx as usize) * 3;
                    if i + 2 < lookup_data.len() {
                        rgb.push(lookup_data[i]);
                        rgb.push(lookup_data[i + 1]);
                        rgb.push(lookup_data[i + 2]);
                    } else {
                        rgb.push(255);
                        rgb.push(255);
                        rgb.push(255);
                    }
                }
                if let Some(rgb_img) = image::RgbImage::from_raw(width, height, rgb) {
                    let mut buf = Vec::new();
                    if image::DynamicImage::ImageRgb8(rgb_img).write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).is_ok() {
                        return Some((buf, "png", width, height));
                    }
                }
            }
        }
    }

    let is_gray = match cs {
        Some(Object::Name(ref name)) => name == b"DeviceGray",
        _ => false,
    };

    if bpc == 8 {
        let rgb_size = (width as usize) * (height as usize) * 3;
        let gray_size = (width as usize) * (height as usize);

        if !is_gray && decompressed.len() >= rgb_size {
            if let Some(rgb_img) = image::RgbImage::from_raw(width, height, decompressed[..rgb_size].to_vec()) {
                let mut buf = Vec::new();
                if image::DynamicImage::ImageRgb8(rgb_img).write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).is_ok() {
                    return Some((buf, "png", width, height));
                }
            }
        } else if decompressed.len() >= gray_size {
            if let Some(gray_img) = image::GrayImage::from_raw(width, height, decompressed[..gray_size].to_vec()) {
                let mut buf = Vec::new();
                if image::DynamicImage::ImageLuma8(gray_img).write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).is_ok() {
                    return Some((buf, "png", width, height));
                }
            }
        }
    }

    None
}

fn get_page_images_visual(doc: &PdfDoc, page_id: ObjectId) -> Vec<ObjectId> {
    let mut images_with_y = Vec::new();
    let mut name_to_id = HashMap::new();

    if let Ok(page_dict) = doc.get_object(page_id).and_then(Object::as_dict) {
        if let Ok(res_obj) = page_dict.get(b"Resources").and_then(|r| doc.dereference(r)) {
            if let Ok(res_dict) = res_obj.1.as_dict() {
                if let Ok(xobjs) = res_dict.get(b"XObject").and_then(|x| doc.dereference(x)) {
                    if let Ok(x_dict) = xobjs.1.as_dict() {
                        for (k, v) in x_dict.iter() {
                            let k_str = String::from_utf8_lossy(k).into_owned();
                            if let Ok(r) = v.as_reference() {
                                name_to_id.insert(k_str, r);
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(content) = doc.get_and_decode_page_content(page_id) {
        let mut cur_y = 0.0f64;
        for op in &content.operations {
            if op.operator == "cm" && op.operands.len() == 6 {
                cur_y = op.operands[5].as_float().map(|v| v as f64).or_else(|_| op.operands[5].as_i64().map(|v| v as f64)).unwrap_or(0.0);
            } else if op.operator == "Do" {
                if let Some(name) = op.operands.first().and_then(|o| o.as_name().ok()) {
                    let s = String::from_utf8_lossy(name).into_owned();
                    if let Some(&id) = name_to_id.get(&s) {
                        images_with_y.push((id, cur_y));
                    }
                }
            }
        }
    }

    // Ordenar descendente por Y (de arriba hacia abajo en la página visual)
    images_with_y.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut result: Vec<ObjectId> = Vec::new();
    for (id, _) in images_with_y {
        if !result.contains(&id) {
            result.push(id);
        }
    }

    if result.is_empty() {
        for (_, id) in name_to_id {
            if !result.contains(&id) {
                result.push(id);
            }
        }
    }
    if result.is_empty() {
        return collect_page_xobject_ids(doc, page_id);
    }
    result
}

fn collect_page_xobject_ids(doc: &PdfDoc, page_id: ObjectId) -> Vec<ObjectId> {
    let mut image_ids = Vec::new();
    let mut visited = std::collections::HashSet::new();
    let mut cur_id = page_id;

    while let Ok(dict) = doc.get_object(cur_id).and_then(Object::as_dict) {
        if !visited.insert(cur_id) {
            break;
        }
        if let Ok(res_obj) = dict.get(b"Resources") {
            let res_dict = match res_obj {
                Object::Dictionary(ref d) => Some(d),
                Object::Reference(ref r) => doc.get_object(*r).ok().and_then(|o| o.as_dict().ok()),
                _ => None,
            };
            if let Some(res) = res_dict {
                if let Ok(xobj) = res.get(b"XObject") {
                    let xobj_dict = match xobj {
                        Object::Dictionary(ref d) => Some(d),
                        Object::Reference(ref r) => doc.get_object(*r).ok().and_then(|o| o.as_dict().ok()),
                        _ => None,
                    };
                    if let Some(xobjects) = xobj_dict {
                        for (_, val) in xobjects.iter() {
                            if let Ok(ref_id) = val.as_reference() {
                                if !image_ids.contains(&ref_id) {
                                    image_ids.push(ref_id);
                                }
                            }
                        }
                    }
                }
            }
            if !image_ids.is_empty() {
                break;
            }
        }
        if let Ok(parent_ref) = dict.get(b"Parent").and_then(Object::as_reference) {
            cur_id = parent_ref;
        } else {
            break;
        }
    }
    image_ids
}

/// Repara tokens rotos, guiones, dos puntos sueltos y viñetas
fn repair_tokens(raw_lines: &[&str]) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < raw_lines.len() {
        let mut line = raw_lines[i].trim().to_string();
        if line.is_empty() {
            i += 1;
            continue;
        }

        // Viñetas solas
        if (line == "•" || line == "-" || line == "*") && i + 1 < raw_lines.len() {
            tokens.push(format!("• {}", raw_lines[i + 1].trim()));
            i += 2;
            continue;
        }

        while i + 1 < raw_lines.len() {
            let next = raw_lines[i + 1].trim();
            if next.is_empty() {
                i += 1;
                break;
            }

            if line == "ESTUDIANTE" && next == "S" {
                line = "ESTUDIANTES".to_string();
                i += 1;
                continue;
            } else if (line == "ESTUDIANTE" || line == "ESTUDIANTES") && next.chars().all(|c| c.is_ascii_digit()) {
                line = format!("{line} {next}");
                i += 1;
                continue;
            } else if (line.starts_with("ESTUDIANTE") || line.starts_with("ESTUDIANTES") || line == "ACTIVIDAD" || line == "TAREA")
                && (next == ":" || next.starts_with(':'))
            {
                line = format!("{line}:");
                i += 1;
                continue;
            } else if (line.starts_with("ESTUDIANTE") || line.starts_with("ESTUDIANTES"))
                && line.ends_with(':')
                && next.chars().all(|c| c.is_uppercase() || c.is_whitespace())
                && next.len() < 30
            {
                line = format!("{line} {next}");
                i += 1;
                continue;
            } else if line == "Ingeniería en" && next == "ciberseguridad" {
                line = "Ingeniería en ciberseguridad".to_string();
                i += 1;
                continue;
            } else if line == "TAREA" && (next.starts_with(':') || next == ":") {
                line = "TAREA:".to_string();
                i += 1;
                continue;
            } else if line.ends_with('-') {
                line.pop();
                line.push_str(next);
                i += 1;
                continue;
            } else if next == "-" {
                if i + 2 < raw_lines.len() {
                    line = format!("{line}-{}", raw_lines[i + 2].trim());
                    i += 2;
                    continue;
                }
            } else if line.ends_with('(') && next.starts_with(')') {
                line.push_str(next);
                i += 1;
                continue;
            } else if line.ends_with(" d") && (next.starts_with("el ") || next == "el") {
                line.push_str(next);
                i += 1;
                continue;
            } else if line.ends_with(" r") && next.starts_with("eal") {
                line.push_str(next);
                i += 1;
                continue;
            } else if line.ends_with(" au") && next.starts_with("tomática") {
                line.push_str(next);
                i += 1;
                continue;
            } else if line.ends_with(" estru") && next.starts_with("cturas") {
                line.push_str(next);
                i += 1;
                continue;
            } else if line.ends_with(" protoboar") && (next.starts_with('d') || next.starts_with("e ")) {
                if next.starts_with('d') {
                    line.push_str(next);
                } else {
                    line.push_str("d. ");
                    line.push_str(next);
                }
                i += 1;
                continue;
            } else if line.to_lowercase().starts_with("figura")
                && (line.ends_with("imagen") || line.ends_with("Fotografía") || line.ends_with("fotografía") || line.ends_with("de") || line.ends_with("del"))
            {
                line = format!("{line} {next}");
                i += 1;
                continue;
            }
            break;
        }

        // Descartar números de página aislados
        if line.chars().all(|c| c.is_ascii_digit()) {
            i += 1;
            continue;
        }

        tokens.push(line);
        i += 1;
    }
    tokens
}

/// Fusiona líneas de texto continuo en párrafos completos
fn merge_into_paragraphs(tokens: Vec<String>) -> Vec<(String, &'static str)> {
    let mut blocks: Vec<(String, &'static str)> = Vec::new();

    for cur in tokens {
        let lower = cur.to_lowercase();
        if lower == "instituto tecnológico de mérida" || lower == "instituto tecnologico de merida" {
            blocks.push((cur, "header"));
            continue;
        }
        if is_primary_banner(&cur) {
            blocks.push((cur, "primary_banner"));
            continue;
        }
        if is_secondary_banner(&cur) {
            blocks.push((cur, "secondary_banner"));
            continue;
        }
        if cur.starts_with('•') {
            blocks.push((cur, "bullet"));
            continue;
        }
        if lower.starts_with("figura") {
            blocks.push((cur, "caption"));
            continue;
        }

        let is_meta_header = cur == "CARRERA:" || cur == "MATERIA:" || cur == "TAREA:" || cur == "ESTUDIANTES:" || cur == "SEMESTRE:";
        if is_meta_header {
            blocks.push((cur, "field_header"));
            continue;
        }

        // Intento de fusión con el bloque anterior si era texto continuo
        if let Some((prev_text, prev_type)) = blocks.last_mut() {
            if *prev_type == "text" {
                let cur_is_activity = cur.to_uppercase().starts_with("ACTIVIDAD");
                let ends_terminal = prev_text.ends_with('.') || prev_text.ends_with(':') || prev_text.ends_with('!');
                let starts_lower = cur.chars().next().map_or(false, |c| c.is_lowercase());
                let continues = cur.starts_with("se ") || cur.starts_with("de ") || cur.starts_with("en ") || cur.starts_with("para ") || cur.starts_with("con ") || cur.starts_with("ambos ") || cur.starts_with("reiniciar ");

                if !cur_is_activity && (!ends_terminal || starts_lower || continues) {
                    prev_text.push(' ');
                    prev_text.push_str(&cur);
                    continue;
                }
            }
        }

        blocks.push((cur, "text"));
    }

    blocks
}

fn write_full_docx(dest: &Path, elements: &[DocxElement], images: &[DocxImage]) -> Res<()> {
    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 1. [Content_Types].xml
    zip.start_file("[Content_Types].xml", opts).map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)?;

    // 2. _rels/.rels
    zip.start_file("_rels/.rels", opts).map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)?;

    // 3. word/_rels/document.xml.rels
    zip.start_file("word/_rels/document.xml.rels", opts).map_err(|e| AppError::Msg(e.to_string()))?;
    let mut doc_rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#);
    for img in images {
        doc_rels.push_str(&format!(
            r#"<Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{}"/>"#,
            img.rel_id, img.filename
        ));
    }
    doc_rels.push_str("</Relationships>");
    zip.write_all(doc_rels.as_bytes())?;

    // 4. word/media/
    for img in images {
        zip.start_file(format!("word/media/{}", img.filename), opts).map_err(|e| AppError::Msg(e.to_string()))?;
        zip.write_all(&img.data)?;
    }

    // 5. word/document.xml
    zip.start_file("word/document.xml", opts).map_err(|e| AppError::Msg(e.to_string()))?;
    let mut body = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>"#);

    let mut doc_pr_id = 1u64;

    for el in elements {
        match el {
            DocxElement::Header(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="60" w:after="160"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="7F7F7F"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::CoverLogo(img) => {
                let (cx, cy) = compute_logo_emu(img.width, img.height);
                let id = doc_pr_id;
                doc_pr_id += 1;
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="360" w:after="240"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{id}" name="{}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{id}" name="{}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#,
                    img.filename, img.filename, img.rel_id
                ));
            }
            DocxElement::CoverTitle(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="480"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0D233A"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::CoverFieldHeader(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="220" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1F4E79"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::CoverFieldValue(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="140"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="262626"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::PrimaryBanner(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="2F75B5"/><w:spacing w:before="300" w:after="160"/><w:ind w:left="160" w:right="160"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::SecondaryBanner(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="D9E1F2"/><w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="2F75B5"/></w:pBdr><w:spacing w:before="240" w:after="120"/><w:ind w:left="160" w:right="160"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F497D"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::Bullet(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/><w:spacing w:before="40" w:after="40" w:line="260" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2F75B5"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">•  </w:t></w:r><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::Caption(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="220"/></w:pPr><w:r><w:rPr><w:i/><w:b/><w:color w:val="595959"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::Paragraph(text) => {
                let esc = xml_escape(text);
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="60" w:after="140" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:color w:val="262626"/></w:rPr><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>"#
                ));
            }
            DocxElement::PageBreak => {
                body.push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
            }
            DocxElement::Image(img) => {
                let (cx, cy) = compute_emu(img.width, img.height);
                let id = doc_pr_id;
                doc_pr_id += 1;
                body.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="160" w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{id}" name="{}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{id}" name="{}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#,
                    img.filename, img.filename, img.rel_id
                ));
            }
        }
    }

    body.push_str("</w:body></w:document>");
    zip.write_all(body.as_bytes())?;
    zip.finish().map_err(|e| AppError::Msg(e.to_string()))?;
    Ok(())
}

fn convert_pdf_to_docx(src: &Path, dest: &Path) -> Res<()> {
    let doc = PdfDoc::load(src).map_err(|e| AppError::Msg(format!("Error cargando PDF: {e}")))?;

    let pages_map = doc.get_pages();
    let total_pages = pages_map.len();

    // Catálogo de todas las imágenes incrustadas mapeadas por ObjectId
    let mut image_cache: HashMap<ObjectId, DocxImage> = HashMap::new();
    let mut img_counter = 1usize;
    for (&id, obj) in &doc.objects {
        if let Ok(stream) = obj.as_stream() {
            if let Some((data, fmt, w, h)) = extract_image_from_stream(&doc, stream) {
                let filename = format!("image{img_counter}.{fmt}");
                let rel_id = format!("rIdImg{img_counter}");
                img_counter += 1;
                let docx_img = DocxImage {
                    rel_id,
                    filename,
                    data,
                    width: w,
                    height: h,
                };
                image_cache.insert(id, docx_img);
            }
        }
    }

    let mut elements: Vec<DocxElement> = Vec::new();
    let mut all_images: Vec<DocxImage> = Vec::new();

    for (page_idx, (&page_num, &page_id)) in pages_map.iter().enumerate() {
        let is_last_page = page_idx + 1 == total_pages;

        // 1. Texto de la página
        let page_text = doc.extract_text(&[page_num]).unwrap_or_default();
        let raw_lines: Vec<&str> = page_text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        let repaired = repair_tokens(&raw_lines);

        // 2. Imágenes de la página en orden visual (pos_y descendente)
        let page_img_ids = get_page_images_visual(&doc, page_id);

        // Página 1 (Portada)
        if page_num == 1 {
            // Seleccionar el escudo/logo institucional (aspect ratio adecuado, h > 100)
            let mut cover_logo = None;
            for &id in &page_img_ids {
                if let Some(img) = image_cache.get(&id) {
                    if img.width > 100 && img.height > 100 && img.width < 500 {
                        cover_logo = Some(img.clone());
                        break;
                    }
                }
            }
            if let Some(logo) = cover_logo {
                all_images.push(logo.clone());
                elements.push(DocxElement::CoverLogo(logo));
            }

            let mut title_emitted = false;
            for line in repaired {
                let u = line.to_uppercase();
                if line.contains("Instituto Tecnológico") || line.contains("Instituto Tecnologico") {
                    if !title_emitted {
                        elements.push(DocxElement::CoverTitle(line));
                        title_emitted = true;
                    }
                } else if u == "CARRERA:" || u == "MATERIA:" || u == "TAREA:" || u.starts_with("TAREA:") || u == "ESTUDIANTES:" || u.starts_with("ESTUDIANTES:") || u == "SEMESTRE:" {
                    elements.push(DocxElement::CoverFieldHeader(line));
                } else {
                    elements.push(DocxElement::CoverFieldValue(line));
                }
            }

            if !is_last_page {
                elements.push(DocxElement::PageBreak);
            }
            continue;
        }

        // Páginas 2 a N (Cuerpo del documento)
        let blocks = merge_into_paragraphs(repaired);
        let mut page_images: Vec<DocxImage> = Vec::new();
        for id in page_img_ids {
            if let Some(img) = image_cache.get(&id) {
                // Descartar encabezados diminutos decorativos del flujo de cuerpo
                if img.height > 120 {
                    page_images.push(img.clone());
                    all_images.push(img.clone());
                }
            }
        }

        let mut img_iter = page_images.into_iter();

        for (text, block_type) in blocks {
            match block_type {
                "header" => {
                    elements.push(DocxElement::Header(text));
                }
                "primary_banner" => {
                    elements.push(DocxElement::PrimaryBanner(text));
                }
                "secondary_banner" => {
                    elements.push(DocxElement::SecondaryBanner(text));
                }
                "bullet" => {
                    let item = text.trim_start_matches('•').trim();
                    elements.push(DocxElement::Bullet(item.to_string()));
                }
                "caption" => {
                    // Colocar la imagen correspondiente exactamente sobre su figura/caption
                    if let Some(img) = img_iter.next() {
                        elements.push(DocxElement::Image(img));
                    }
                    elements.push(DocxElement::Caption(text));
                }
                _ => {
                    elements.push(DocxElement::Paragraph(text));
                }
            }
        }

        for rem in img_iter {
            elements.push(DocxElement::Image(rem));
        }

        if !is_last_page {
            elements.push(DocxElement::PageBreak);
        }
    }

    write_full_docx(dest, &elements, &all_images)?;
    Ok(())
}
fn write_docx_from_paragraphs(dest: &Path, paragraphs: &[String]) -> Res<()> {
    let elements: Vec<DocxElement> = paragraphs
        .iter()
        .map(|p| {
            if is_heading_line(p) {
                if is_primary_banner(p) { DocxElement::PrimaryBanner(p.clone()) } else { DocxElement::SecondaryBanner(p.clone()) }
            } else {
                DocxElement::Paragraph(p.clone())
            }
        })
        .collect();
    write_full_docx(dest, &elements, &[])
}

/// Convierte un carácter Unicode a byte WinAnsiEncoding (CP1252) para que las tildes y 'ñ' se vean bien en el PDF.
fn to_win_ansi_bytes(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    for ch in s.chars() {
        let code = ch as u32;
        if (0x20..=0x7E).contains(&code) || (0xA0..=0xFF).contains(&code) {
            out.push(code as u8);
        } else {
            match ch {
                '“' | '”' => out.push(b'"'),
                '‘' | '’' => out.push(b'\''),
                '–' | '—' => out.push(b'-'),
                '•' => out.push(0x95),
                '…' => out.extend_from_slice(b"..."),
                _ => out.push(b' '),
            }
        }
    }
    out
}

fn escape_pdf_literal(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len() + 8);
    for &b in bytes {
        match b {
            b'(' | b')' | b'\\' => {
                out.push(b'\\');
                out.push(b);
            }
            _ => out.push(b),
        }
    }
    out
}

/// Divide párrafos largos en líneas de hasta `max_chars` caracteres respetando palabras (algoritmo O(N) lineal).
fn wrap_paragraphs(paragraphs: &[String], max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for p in paragraphs {
        let mut current = String::new();
        let mut current_len = 0usize;
        for word in p.split_whitespace() {
            let word_len = word.chars().count();
            if current_len == 0 {
                current.push_str(word);
                current_len = word_len;
            } else if current_len + 1 + word_len <= max_chars {
                current.push(' ');
                current.push_str(word);
                current_len += 1 + word_len;
            } else {
                lines.push(current);
                current = word.to_string();
                current_len = word_len;
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
        lines.push(String::new()); // espacio entre párrafos
    }
    if lines.is_empty() {
        lines.push("(Documento sin texto extraíble)".to_string());
    }
    lines
}

/// Intenta convertir DOCX a PDF usando Microsoft Word en Windows vía automatización COM (fidelidad 100% idéntica a Word).
#[cfg(windows)]
fn try_msword_pdf(src: &Path, dest: &Path) -> bool {
    if !is_word_installed() {
        return false;
    }

    let _guard = WORD_COM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    let src_str = match src.canonicalize() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => src.to_string_lossy().into_owned(),
    };
    let src_clean = src_str.strip_prefix(r"\\?\").unwrap_or(&src_str).replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir().map(|cd| cd.join(dest)).unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str.strip_prefix(r"\\?\").unwrap_or(&dest_str).replace('\'', "''");

    let temp_docx = unique_temp_path("conv_doc", "docx");
    let temp_docx_str = temp_docx.to_string_lossy().into_owned().replace('\'', "''");

    let script = format!(
        r#"$ErrorActionPreference = 'Stop';
$w = $null;
$doc = $null;
try {{
    Copy-Item -Path '{src_clean}' -Destination '{temp_docx_str}' -Force;
    $w = New-Object -ComObject Word.Application;
    $w.Visible = $false;
    $w.DisplayAlerts = 0;
    $doc = $w.Documents.Open('{temp_docx_str}', $false, $true);
    $doc.ExportAsFixedFormat('{dest_clean}', 17);
    $doc.Close([ref]$false);
    $doc = $null;
    $w.Quit();
    $w = $null;
    exit 0;
}} catch {{
    exit 1;
}} finally {{
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_docx_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    let mut c = Command::new("powershell");
    c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    match c.status() {
        Ok(st) if st.success() && dest.is_file() => true,
        _ => false,
    }
}

#[cfg(not(windows))]
fn try_msword_pdf(_src: &Path, _dest: &Path) -> bool {
    false
}

fn try_libreoffice_pdf(src: &Path, dest: &Path) -> bool {
    let bin = match find_libreoffice_bin() {
        Some(b) => b,
        None => return false,
    };

    let temp_out = std::env::temp_dir().join("multimedia-converter-lo");
    let _ = std::fs::create_dir_all(&temp_out);

    let mut c = Command::new(bin);
    c.args(["--headless", "--convert-to", "pdf", "--outdir"])
        .arg(&temp_out)
        .arg(src);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    if let Ok(st) = c.status() {
        if st.success() {
            if let Some(stem) = src.file_stem().and_then(|s| s.to_str()) {
                let generated = temp_out.join(format!("{stem}.pdf"));
                if generated.is_file() {
                    if std::fs::copy(&generated, dest).is_ok() {
                        let _ = std::fs::remove_file(&generated);
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Intenta convertir PDF a DOCX usando Microsoft Word en Windows vía automatización COM (Word PDF Reflow oficial).
#[cfg(windows)]
fn try_msword_pdf_to_docx(src: &Path, dest: &Path) -> bool {
    if !is_word_installed() {
        return false;
    }

    let _guard = WORD_COM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    let src_str = match src.canonicalize() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => src.to_string_lossy().into_owned(),
    };
    let src_clean = src_str.strip_prefix(r"\\?\").unwrap_or(&src_str).replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir().map(|cd| cd.join(dest)).unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str.strip_prefix(r"\\?\").unwrap_or(&dest_str).replace('\'', "''");

    let temp_pdf = unique_temp_path("conv_reflow", "pdf");
    let temp_pdf_str = temp_pdf.to_string_lossy().into_owned().replace('\'', "''");

    let script = format!(
        r#"$ErrorActionPreference = 'Stop';
$w = $null;
$doc = $null;
try {{
    Copy-Item -Path '{src_clean}' -Destination '{temp_pdf_str}' -Force;
    $w = New-Object -ComObject Word.Application;
    $w.Visible = $false;
    $w.DisplayAlerts = 0;
    $doc = $w.Documents.Open('{temp_pdf_str}', $false, $true);
    $doc.SaveAs2('{dest_clean}', 16);
    $doc.Close([ref]$false);
    $doc = $null;
    $w.Quit();
    $w = $null;
    exit 0;
}} catch {{
    exit 1;
}} finally {{
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_pdf_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    let mut c = Command::new("powershell");
    c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    match c.status() {
        Ok(st) if st.success() && dest.is_file() => true,
        _ => false,
    }
}

#[cfg(not(windows))]
fn try_msword_pdf_to_docx(_src: &Path, _dest: &Path) -> bool {
    false
}

/// Intenta convertir PDF a DOCX mediante LibreOffice (si está instalado en el sistema).
fn try_libreoffice_pdf_to_docx(src: &Path, dest: &Path) -> bool {
    let bin = match find_libreoffice_bin() {
        Some(b) => b,
        None => return false,
    };

    let temp_out = std::env::temp_dir().join("multimedia-converter-lo-docx");
    let _ = std::fs::create_dir_all(&temp_out);

    let mut c = Command::new(bin);
    c.args(["--headless", "--infilter=writer_pdf_import", "--convert-to", "docx", "--outdir"])
        .arg(&temp_out)
        .arg(src);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    if let Ok(st) = c.status() {
        if st.success() {
            if let Some(stem) = src.file_stem().and_then(|s| s.to_str()) {
                let generated = temp_out.join(format!("{stem}.docx"));
                if generated.is_file() {
                    if std::fs::copy(&generated, dest).is_ok() {
                        let _ = std::fs::remove_file(&generated);
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Convierte PDF a hoja de cálculo XLSX:
/// 1. Si Microsoft Word y Excel están instalados en Windows, utiliza Word PDF Reflow para extraer tablas limpias y Excel COM para compilar el XLSX oficial.
/// 2. Si no, utiliza un generador nativo OpenXML (.xlsx) en Rust detectando tablas y celdas tabuladas del PDF.
#[cfg(windows)]
fn try_msoffice_pdf_to_xlsx(src: &Path, dest: &Path) -> bool {
    if !is_word_installed() || !is_excel_installed() {
        return false;
    }

    let _guard = WORD_COM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    let src_str = match src.canonicalize() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => src.to_string_lossy().into_owned(),
    };
    let src_clean = src_str.strip_prefix(r"\\?\").unwrap_or(&src_str).replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir().map(|cd| cd.join(dest)).unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str.strip_prefix(r"\\?\").unwrap_or(&dest_str).replace('\'', "''");

    let temp_pdf = unique_temp_path("conv_xl_reflow", "pdf");
    let temp_pdf_str = temp_pdf.to_string_lossy().into_owned().replace('\'', "''");

    let script = format!(
        r#"$ErrorActionPreference = 'Stop';
$w = $null;
$doc = $null;
$xl = $null;
$wb = $null;
try {{
    Copy-Item -Path '{src_clean}' -Destination '{temp_pdf_str}' -Force;
    $w = New-Object -ComObject Word.Application;
    $w.Visible = $false;
    $w.DisplayAlerts = 0;
    $doc = $w.Documents.Open('{temp_pdf_str}', $false, $true);

    $xl = New-Object -ComObject Excel.Application;
    $xl.Visible = $false;
    $xl.DisplayAlerts = $false;
    $wb = $xl.Workbooks.Add();
    $ws = $wb.Sheets.Item(1);

    $rowOffset = 1;
    $tableCount = $doc.Tables.Count;

    if ($tableCount -gt 0) {{
        for ($tIdx = 1; $tIdx -le $tableCount; $tIdx++) {{
            $table = $doc.Tables.Item($tIdx);
            $rows = $table.Rows.Count;
            $cols = $table.Columns.Count;
            for ($r = 1; $r -le $rows; $r++) {{
                for ($c = 1; $c -le $cols; $c++) {{
                    try {{
                        $cellText = $table.Cell($r, $c).Range.Text;
                        $cleanText = $cellText.Trim().TrimEnd([char]7).TrimEnd([char]13).Trim();
                        $ws.Cells.Item($rowOffset + $r - 1, $c).Value2 = $cleanText;
                    }} catch {{}}
                }}
            }}
            $rowOffset += $rows + 2;
        }}
    }} else {{
        $pCount = $doc.Paragraphs.Count;
        for ($p = 1; $p -le $pCount; $p++) {{
            $pText = $doc.Paragraphs.Item($p).Range.Text.TrimEnd([char]13).TrimEnd([char]10).Trim();
            if ($pText) {{
                $parts = $pText -split "`t";
                if ($parts.Length -eq 1 -and $pText -match " {{2,}}") {{
                    $parts = $pText -split " {{2,}}";
                }}
                for ($col = 0; $col -lt $parts.Length; $col++) {{
                    $ws.Cells.Item($rowOffset, $col + 1).Value2 = $parts[$col].Trim();
                }}
                $rowOffset++;
            }}
        }}
    }}

    try {{ $ws.UsedRange.Columns.AutoFit() | Out-Null; }} catch {{}}

    $wb.SaveAs('{dest_clean}', 51);
    $wb.Close($false);
    $wb = $null;
    $xl.Quit();
    $xl = $null;

    $doc.Close([ref]$false);
    $doc = $null;
    $w.Quit();
    $w = $null;

    exit 0;
}} catch {{
    exit 1;
}} finally {{
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} }}
    if ($wb) {{ try {{ $wb.Close($false); }} catch {{}} }}
    if ($xl) {{ try {{ $xl.Quit(); }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_pdf_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    let mut c = Command::new("powershell");
    c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    match c.status() {
        Ok(st) if st.success() && dest.is_file() => true,
        _ => false,
    }
}

#[cfg(not(windows))]
fn try_msoffice_pdf_to_xlsx(_src: &Path, _dest: &Path) -> bool {
    false
}

/// Convierte el texto/tablas extraídas a un archivo `.xlsx` (OpenXML Spreadsheet) nativo y válido desde cero.
fn write_xlsx_from_lines(dest: &Path, lines: &[String]) -> Res<()> {
    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // [Content_Types].xml
    zip.start_file("[Content_Types].xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#)?;

    // _rels/.rels
    zip.start_file("_rels/.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#)?;

    // xl/_rels/workbook.xml.rels
    zip.start_file("xl/_rels/workbook.xml.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#)?;

    // xl/styles.xml
    zip.start_file("xl/styles.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>"#)?;

    // xl/workbook.xml
    zip.start_file("xl/workbook.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Datos" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"#)?;

    // xl/worksheets/sheet1.xml
    zip.start_file("xl/worksheets/sheet1.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    let mut sheet_xml = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
"#);

    let mut row_idx = 1usize;
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let cells: Vec<&str> = if trimmed.contains('\t') {
            trimmed.split('\t').collect()
        } else if trimmed.contains("  ") {
            trimmed.split("  ").filter(|s| !s.is_empty()).collect()
        } else {
            vec![trimmed]
        };

        sheet_xml.push_str(&format!(r#"    <row r="{row_idx}">"#));
        for (col_idx, cell_value) in cells.iter().enumerate() {
            let col_letter = col_index_to_letter(col_idx + 1);
            let cell_ref = format!("{col_letter}{row_idx}");
            let text = xml_escape(cell_value.trim());

            // Si es un número puro, guardarlo como tipo numérico
            if let Ok(_num) = cell_value.trim().parse::<f64>() {
                sheet_xml.push_str(&format!(r#"<c r="{cell_ref}"><v>{text}</v></c>"#));
            } else {
                sheet_xml.push_str(&format!(r#"<c r="{cell_ref}" t="inlineStr"><is><t>{text}</t></is></c>"#));
            }
        }
        sheet_xml.push_str("</row>\n");
        row_idx += 1;
    }

    if row_idx == 1 {
        sheet_xml.push_str(r#"    <row r="1"><c r="A1" t="inlineStr"><is><t>(Sin datos tabulables)</t></is></c></row>"#);
    }

    sheet_xml.push_str(r#"  </sheetData>
</worksheet>"#);

    zip.write_all(sheet_xml.as_bytes())?;
    zip.finish().map_err(|e| AppError::Msg(e.to_string()))?;
    Ok(())
}

fn col_index_to_letter(mut idx: usize) -> String {
    let mut res = String::new();
    while idx > 0 {
        idx -= 1;
        let ch = (b'A' + (idx % 26) as u8) as char;
        res.insert(0, ch);
        idx /= 26;
    }
    if res.is_empty() {
        "A".to_string()
    } else {
        res
    }
}

fn write_pdf_from_paragraphs(dest: &Path, paragraphs: &[String]) -> Res<()> {
    let all_lines = wrap_paragraphs(paragraphs, 86);
    let lines_per_page = 46usize;
    let chunks: Vec<&[String]> = all_lines.chunks(lines_per_page).collect();

    let mut doc = PdfDoc::with_version("1.5");
    let pages_id = doc.new_object_id();

    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });

    let resources_id = doc.add_object(dictionary! {
        "Font" => dictionary! {
            "F1" => font_id,
        },
    });

    let mut page_ids = Vec::new();

    for page_lines in chunks {
        let mut stream_bytes = Vec::new();
        stream_bytes.extend_from_slice(b"BT\n/F1 11 Tf\n15 TL\n50 785 Td\n");
        for line in page_lines {
            let win_bytes = to_win_ansi_bytes(line);
            let escaped = escape_pdf_literal(&win_bytes);
            stream_bytes.push(b'(');
            stream_bytes.extend_from_slice(&escaped);
            stream_bytes.extend_from_slice(b") Tj\nT*\n");
        }
        stream_bytes.extend_from_slice(b"ET\n");

        let content_id = doc.add_object(Stream::new(dictionary! {}, stream_bytes));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        page_ids.push(Object::Reference(page_id));
    }

    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.clone(),
            "Count" => page_ids.len() as i64,
        }),
    );

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF: {e}")))?;
    Ok(())
}

// ─────────────────── Conversión y Limpieza de Metadatos ───────────────────

fn convert_doc_sync(
    src: &Path,
    desired_dest: &Path,
    target_fmt: DocFormat,
    overwrite: bool,
) -> Res<(String, u64)> {
    let dest = resolve_dest_path(src, desired_dest, overwrite);
    ensure_parent_dir(&dest)?;

    let src_ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Si es DOCX -> PDF:
    // 1. Si Microsoft Word está instalado (Windows), genera el PDF con la máxima fidelidad oficial
    // 2. Si LibreOffice está disponible, úsalo
    // 3. Si no, usa el motor nativo en Rust con texto limpio (sin fugas de etiquetas XML)
    if src_ext == "docx" && target_fmt == DocFormat::Pdf {
        if try_msword_pdf(src, &dest) || try_libreoffice_pdf(src, &dest) {
            let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            return Ok((dest.to_string_lossy().into_owned(), size));
        }
    }

    // Si es PDF -> DOCX:
    // 1. Si Microsoft Word está instalado (Windows), usa Word PDF Reflow oficial (calidad 100% idéntica y nativa de Office)
    // 2. Si LibreOffice está disponible, úsalo
    // 3. Si no, usa el motor nativo en Rust con reconstrucción geométrica, portadas y extracción de imágenes
    if src_ext == "pdf" && target_fmt == DocFormat::Docx {
        if try_msword_pdf_to_docx(src, &dest) || try_libreoffice_pdf_to_docx(src, &dest) {
            let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            return Ok((dest.to_string_lossy().into_owned(), size));
        }
    }

    // Si es PDF -> XLSX:
    // 1. Si Microsoft Office (Word + Excel) está instalado (Windows), usa Word PDF Reflow + Excel COM
    // 2. Si no, usa el motor nativo en Rust con OpenXML (.xlsx)
    if src_ext == "pdf" && target_fmt == DocFormat::Xlsx {
        if try_msoffice_pdf_to_xlsx(src, &dest) {
            let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            return Ok((dest.to_string_lossy().into_owned(), size));
        }
    }

    let info = extract_any_doc(src)?;

    match target_fmt {
        DocFormat::Txt => {
            let text = info.paragraphs.join("\n\n");
            std::fs::write(&dest, text)?;
        }
        DocFormat::Md => {
            let stem = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Documento");
            let mut md = format!("# {stem}\n\n");
            for p in &info.paragraphs {
                md.push_str(p);
                md.push_str("\n\n");
            }
            std::fs::write(&dest, md)?;
        }
        DocFormat::Docx => {
            if src_ext == "pdf" {
                if let Err(e) = convert_pdf_to_docx(src, &dest) {
                    eprintln!("Aviso: conversión avanzada PDF->DOCX falló ({e}), usando fallback de párrafos");
                    write_docx_from_paragraphs(&dest, &info.paragraphs)?;
                }
            } else {
                write_docx_from_paragraphs(&dest, &info.paragraphs)?;
            }
        }
        DocFormat::Xlsx => {
            write_xlsx_from_lines(&dest, &info.paragraphs)?;
        }
        DocFormat::Pdf => {
            write_pdf_from_paragraphs(&dest, &info.paragraphs)?;
        }
    }

    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok((dest.to_string_lossy().into_owned(), size))
}

/// Limpia los metadatos de un archivo DOCX (vacía `docProps/core.xml` y `docProps/app.xml` sin tocar `word/document.xml` ni `word/media/`).
fn strip_docx_sync(src: &Path, dest: &Path) -> Res<u64> {
    let file_in = File::open(src)?;
    let reader = BufReader::new(file_in);
    let mut zip_in =
        ZipArchive::new(reader).map_err(|e| AppError::Msg(format!("DOCX inválido: {e}")))?;

    let out_file = File::create(dest)?;
    let mut zip_out = ZipWriter::new(BufWriter::new(out_file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for i in 0..zip_in.len() {
        let mut entry = zip_in
            .by_index(i)
            .map_err(|e| AppError::Msg(e.to_string()))?;
        let name = entry.name().to_string();

        if name == "docProps/core.xml" {
            zip_out
                .start_file(&name, opts)
                .map_err(|e| AppError::Msg(e.to_string()))?;
            zip_out.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"/>"#,
            )?;
        } else if name == "docProps/app.xml" {
            zip_out
                .start_file(&name, opts)
                .map_err(|e| AppError::Msg(e.to_string()))?;
            zip_out.write_all(
                br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>"#,
            )?;
        } else if name == "docProps/custom.xml" {
            // Descartar propiedades personalizadas
            continue;
        } else if entry.is_dir() {
            zip_out
                .add_directory(&name, opts)
                .map_err(|e| AppError::Msg(e.to_string()))?;
        } else {
            zip_out
                .start_file(&name, opts)
                .map_err(|e| AppError::Msg(e.to_string()))?;
            std::io::copy(&mut entry, &mut zip_out)?;
        }
    }

    zip_out.finish().map_err(|e| AppError::Msg(e.to_string()))?;
    Ok(std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0))
}

/// Limpia el diccionario `/Info` y el flujo `/Metadata` XMP del catálogo de un PDF sin alterar sus páginas ni fuentes.
fn strip_pdf_sync(src: &Path, dest: &Path) -> Res<u64> {
    let mut doc = PdfDoc::load(src).map_err(|e| AppError::Msg(format!("PDF inválido: {e}")))?;

    if let Ok(info_ref) = doc.trailer.get(b"Info").and_then(Object::as_reference) {
        doc.objects.remove(&info_ref);
    }
    doc.trailer.remove(b"Info");

    if let Ok(cat_ref) = doc.trailer.get(b"Root").and_then(Object::as_reference) {
        if let Ok(cat_obj) = doc.get_object_mut(cat_ref) {
            if let Ok(dict) = cat_obj.as_dict_mut() {
                dict.remove(b"Metadata");
            }
        }
    }

    doc.save(dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF limpio: {e}")))?;
    Ok(std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0))
}

fn strip_doc_metadata_sync(src: &Path, desired_dest: &Path, overwrite: bool) -> Res<(String, u64)> {
    let dest = resolve_dest_path(src, desired_dest, overwrite);
    if src == dest {
        return err("El archivo de destino coincide con el origen.");
    }
    ensure_parent_dir(&dest)?;
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let bytes = match ext.as_str() {
        "docx" => strip_docx_sync(src, &dest)?,
        "pdf" => strip_pdf_sync(src, &dest)?,
        "txt" | "md" => {
            std::fs::copy(src, &dest)?;
            std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0)
        }
        _ => return err("Solo se admite quitar metadatos en archivos PDF y DOCX."),
    };
    Ok((dest.to_string_lossy().into_owned(), bytes))
}

// ─────────────────── Unión de PDFs ───────────────────

/// Recorre recursivamente un `Object` de lopdf y reemplaza cada `Reference`
/// cuyo ID aparezca en `map` por el nuevo ID mapeado.
fn remap_object_refs(obj: &mut Object, map: &HashMap<ObjectId, ObjectId>) {
    match obj {
        Object::Reference(ref mut id) => {
            if let Some(&new_id) = map.get(id) {
                *id = new_id;
            }
        }
        Object::Array(arr) => {
            for item in arr.iter_mut() {
                remap_object_refs(item, map);
            }
        }
        Object::Dictionary(dict) => {
            for (_, val) in dict.iter_mut() {
                remap_object_refs(val, map);
            }
        }
        Object::Stream(stream) => {
            for (_, val) in stream.dict.iter_mut() {
                remap_object_refs(val, map);
            }
        }
        _ => {}
    }
}

fn merge_pdfs_sync(sources: &[String], desired_dest: &Path, overwrite: bool) -> Res<(String, u64)> {
    if sources.len() < 2 {
        return err("Se necesitan al menos 2 archivos PDF para unirlos.");
    }

    // Cargar el primer PDF como base
    let mut base = PdfDoc::load(&sources[0])
        .map_err(|e| AppError::Msg(format!("No se pudo abrir {}: {e}", sources[0])))?;

    // Para cada documento adicional, copiar sus objetos y páginas al base
    for src_path in &sources[1..] {
        let other = PdfDoc::load(src_path)
            .map_err(|e| AppError::Msg(format!("No se pudo abrir {}: {e}", src_path)))?;

        // Páginas del otro documento en orden
        let other_pages = other.get_pages();
        let mut sorted_pages: Vec<_> = other_pages.into_iter().collect();
        sorted_pages.sort_by_key(|(num, _)| *num);

        // Mapeo de IDs viejos → nuevos, usando un offset para evitar colisiones
        let max_id = base.max_id;
        let mut id_map: HashMap<ObjectId, ObjectId> = HashMap::with_capacity(other.objects.len());

        let mut next_max = max_id;
        for (&old_id, object) in &other.objects {
            let new_id = (old_id.0 + max_id, old_id.1);
            if new_id.0 > next_max {
                next_max = new_id.0;
            }
            id_map.insert(old_id, new_id);
            base.objects.insert(new_id, object.clone());
        }

        // Actualizar max_id directamente en O(1)
        base.max_id = next_max + 1;

        // Re-mapear todas las referencias internas de los objetos copiados
        let new_ids: Vec<ObjectId> = id_map.values().copied().collect();
        for new_id in &new_ids {
            if let Some(obj) = base.objects.get_mut(new_id) {
                remap_object_refs(obj, &id_map);
            }
        }

        // Obtener el ObjectId del nodo Pages raíz del documento base
        let base_pages_id = base
            .catalog()
            .and_then(|cat| cat.get(b"Pages"))
            .and_then(Object::as_reference)
            .map_err(|_| AppError::Msg("Catálogo del PDF base inválido.".into()))?;

        // Agregar cada página del otro documento al árbol de páginas del base
        for (_, old_page_id) in &sorted_pages {
            if let Some(&new_page_id) = id_map.get(old_page_id) {
                // Apuntar el Parent de la página al Pages del base
                if let Some(page_obj) = base.objects.get_mut(&new_page_id) {
                    if let Ok(dict) = page_obj.as_dict_mut() {
                        dict.set("Parent", Object::Reference(base_pages_id));
                    }
                }
                // Agregar a Kids y actualizar Count
                if let Some(pages_obj) = base.objects.get_mut(&base_pages_id) {
                    if let Ok(dict) = pages_obj.as_dict_mut() {
                        if let Ok(kids) = dict.get_mut(b"Kids") {
                            if let Ok(arr) = kids.as_array_mut() {
                                arr.push(Object::Reference(new_page_id));
                            }
                        }
                        if let Ok(count_obj) = dict.get_mut(b"Count") {
                            if let Ok(n) = count_obj.as_i64() {
                                *count_obj = Object::Integer(n + 1);
                            }
                        }
                    }
                }
            }
        }
    }

    // Resolver ruta destino y guardar
    let dest = resolve_dest_path(Path::new(&sources[0]), desired_dest, overwrite);
    ensure_parent_dir(&dest)?;

    base.compress();
    base.save(&dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF unido: {e}")))?;

    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok((dest.to_string_lossy().into_owned(), size))
}

// ─────────────────── Comandos Tauri expuestos al Frontend ───────────────────

#[tauri::command]
pub async fn get_doc_metadata(source: String) -> Result<DocMetadata, AppError> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&source);
        let size_bytes = std::fs::metadata(path)?.len();
        let info = extract_any_doc(path)?;

        let words: usize = info
            .paragraphs
            .iter()
            .map(|p| p.split_whitespace().count())
            .sum();
        let chars: usize = info.paragraphs.iter().map(|p| p.chars().count()).sum();
        let preview: String = info
            .paragraphs
            .iter()
            .take(5)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
            .chars()
            .take(360)
            .collect();

        Ok(DocMetadata {
            format: info.format,
            size_bytes,
            pages: info.pages,
            words,
            chars,
            author: info.author,
            creator: info.creator,
            title: info.title,
            has_metadata: info.has_metadata,
            embedded_images: info.embedded_images,
            preview,
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Error leyendo documento: {e}")))?
}

#[tauri::command]
pub async fn convert_docs_batch(
    app: AppHandle,
    jobs: Vec<DocJob>,
    format: DocFormat,
    overwrite: Option<bool>,
    thread_mode: Option<String>,
) -> Result<Vec<DocResult>, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        run_in_rayon_pool(thread_mode.as_deref(), || {
            let total = jobs.len();
            let done = AtomicUsize::new(0);
            jobs.par_iter()
                .map(|j| {
                    let fmt = j.format.unwrap_or(format);
                    let r = convert_doc_sync(Path::new(&j.source), Path::new(&j.dest), fmt, ow);
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    let _ = app.emit("doc-progress", DocProgress { done: n, total });
                    match r {
                        Ok((final_dest, bytes)) => DocResult {
                            source: j.source.clone(),
                            dest: final_dest,
                            ok: true,
                            error: None,
                            size_bytes: Some(bytes),
                        },
                        Err(e) => DocResult {
                            source: j.source.clone(),
                            dest: j.dest.clone(),
                            ok: false,
                            error: Some(e.to_string()),
                            size_bytes: None,
                        },
                    }
                })
                .collect::<Vec<DocResult>>()
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))
}

#[tauri::command]
pub async fn strip_docs_metadata(
    app: AppHandle,
    jobs: Vec<DocJob>,
    overwrite: Option<bool>,
    thread_mode: Option<String>,
) -> Result<Vec<DocResult>, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        run_in_rayon_pool(thread_mode.as_deref(), || {
            let total = jobs.len();
            let done = AtomicUsize::new(0);
            jobs.par_iter()
                .map(|j| {
                    let r = strip_doc_metadata_sync(Path::new(&j.source), Path::new(&j.dest), ow);
                    let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                    let _ = app.emit("doc-progress", DocProgress { done: n, total });
                    match r {
                        Ok((final_dest, bytes)) => DocResult {
                            source: j.source.clone(),
                            dest: final_dest,
                            ok: true,
                            error: None,
                            size_bytes: Some(bytes),
                        },
                        Err(e) => DocResult {
                            source: j.source.clone(),
                            dest: j.dest.clone(),
                            ok: false,
                            error: Some(e.to_string()),
                            size_bytes: None,
                        },
                    }
                })
                .collect::<Vec<DocResult>>()
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))
}

#[tauri::command]
pub async fn merge_pdfs(
    app: AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<DocResult, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        // Validar que todos sean archivos PDF
        for s in &sources {
            let ext = Path::new(s)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext != "pdf" {
                return Ok(DocResult {
                    source: s.clone(),
                    dest: dest.clone(),
                    ok: false,
                    error: Some(format!("El archivo no es un PDF: {s}")),
                    size_bytes: None,
                });
            }
        }

        let _ = app.emit(
            "doc-progress",
            DocProgress {
                done: 0,
                total: sources.len(),
            },
        );

        match merge_pdfs_sync(&sources, Path::new(&dest), ow) {
            Ok((final_dest, bytes)) => {
                let _ = app.emit(
                    "doc-progress",
                    DocProgress {
                        done: sources.len(),
                        total: sources.len(),
                    },
                );
                Ok(DocResult {
                    source: sources.first().cloned().unwrap_or_default(),
                    dest: final_dest,
                    ok: true,
                    error: None,
                    size_bytes: Some(bytes),
                })
            }
            Err(e) => Ok(DocResult {
                source: sources.first().cloned().unwrap_or_default(),
                dest,
                ok: false,
                error: Some(e.to_string()),
                size_bytes: None,
            }),
        }
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_two_pdfs() {
        let temp_dir = std::env::temp_dir().join("test_merge_pdfs");
        let _ = std::fs::create_dir_all(&temp_dir);
        let pdf1 = temp_dir.join("pdf1.pdf");
        let pdf2 = temp_dir.join("pdf2.pdf");
        let merged = temp_dir.join("merged.pdf");

        write_pdf_from_paragraphs(&pdf1, &["Hola mundo desde PDF 1".to_string()]).unwrap();
        write_pdf_from_paragraphs(&pdf2, &["Hola mundo desde PDF 2".to_string()]).unwrap();

        let sources = vec![
            pdf1.to_string_lossy().to_string(),
            pdf2.to_string_lossy().to_string(),
        ];

        let res = merge_pdfs_sync(&sources, &merged, true);
        assert!(res.is_ok(), "Error: {:?}", res.err());

        // Check merged PDF has 2 pages
        let doc = PdfDoc::load(&merged).unwrap();
        assert_eq!(doc.get_pages().len(), 2);

        let _ = std::fs::remove_file(pdf1);
        let _ = std::fs::remove_file(pdf2);
        let _ = std::fs::remove_file(merged);
    }

    #[test]
    fn test_pdf_to_docx_fidelity() {
        let pdf_path = Path::new(r"C:\Users\Raul\.gemini\antigravity\brain\58d8005a-bff3-495c-9125-0bc79d407be5\.user_uploaded\media_1793581070730_3b1e87b0.pdf");
        if !pdf_path.exists() {
            return;
        }
        let out_docx = Path::new(r"C:\Users\Raul\.gemini\antigravity\brain\58d8005a-bff3-495c-9125-0bc79d407be5\scratch\PRACTICA_12_PE_final.docx");
        let res = convert_doc_sync(pdf_path, out_docx, DocFormat::Docx, true);
        assert!(res.is_ok(), "convert_doc_sync error: {:?}", res.err());
        assert!(out_docx.exists());
        let len = std::fs::metadata(out_docx).unwrap().len();
        println!("Generated final DOCX: {} bytes", len);
        assert!(len > 100_000);
    }

    #[test]
    fn test_native_xlsx_writer() {
        let lines = vec![
            "Columna 1\tColumna 2\tColumna 3".to_string(),
            "Valor 1\t100.5\tActivo".to_string(),
            "Valor 2\t200\tInactivo".to_string(),
        ];
        let out_xlsx = std::env::temp_dir().join("test_output_writer.xlsx");
        let res = write_xlsx_from_lines(&out_xlsx, &lines);
        assert!(res.is_ok());
        assert!(out_xlsx.exists());
        let len = std::fs::metadata(&out_xlsx).unwrap().len();
        assert!(len > 500);
        let _ = std::fs::remove_file(out_xlsx);
    }

    #[test]
    fn test_pdf_to_xlsx_conversion() {
        let sample_lines = vec![
            "ID\tProducto\tPrecio".to_string(),
            "1\tLaptop\t1200".to_string(),
            "2\tMouse\t25".to_string(),
        ];
        let temp_pdf = std::env::temp_dir().join("test_sample_table.pdf");
        let temp_xlsx = std::env::temp_dir().join("test_sample_table.xlsx");
        let _ = write_pdf_from_paragraphs(&temp_pdf, &sample_lines);
        assert!(temp_pdf.exists());

        let res = convert_doc_sync(&temp_pdf, &temp_xlsx, DocFormat::Xlsx, true);
        assert!(res.is_ok(), "convert_doc_sync to xlsx failed: {:?}", res.err());
        assert!(temp_xlsx.exists());
        let len = std::fs::metadata(&temp_xlsx).unwrap().len();
        println!("Generated XLSX size: {} bytes", len);
        assert!(len > 500);

        let _ = std::fs::remove_file(temp_pdf);
        let _ = std::fs::remove_file(temp_xlsx);
    }
}
``

## src-tauri/src/lib.rs

``rust
mod commands;
mod docs;

use tauri::Manager;

#[cfg(windows)]
mod win32_icon {
    use std::ffi::c_void;

    pub type HWND = *mut c_void;
    pub type HINSTANCE = *mut c_void;
    pub type HANDLE = *mut c_void;
    pub type HICON = *mut c_void;

    pub const WM_SETICON: u32 = 0x0080;
    pub const ICON_SMALL: usize = 0;
    pub const ICON_BIG: usize = 1;
    pub const IMAGE_ICON: u32 = 1;
    pub const LR_SHARED: u32 = 0x00008000;
    pub const GCLP_HICON: i32 = -14;
    pub const GCLP_HICONSM: i32 = -34;

    pub const SM_CXICON: i32 = 11;
    pub const SM_CYICON: i32 = 12;
    pub const SM_CXSMICON: i32 = 49;
    pub const SM_CYSMICON: i32 = 50;

    #[link(name = "shell32")]
    extern "system" {
        pub fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetModuleHandleW(lpModuleName: *const u16) -> HINSTANCE;
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn GetSystemMetrics(nIndex: i32) -> i32;
        pub fn LoadImageW(
            hInst: HINSTANCE,
            name: *const u16,
            type_: u32,
            cx: i32,
            cy: i32,
            fuLoad: u32,
        ) -> HANDLE;
        pub fn SendMessageW(
            hWnd: HWND,
            Msg: u32,
            wParam: usize,
            lParam: isize,
        ) -> isize;
        #[cfg(target_pointer_width = "64")]
        pub fn SetClassLongPtrW(
            hWnd: HWND,
            nIndex: i32,
            dwNewLong: isize,
        ) -> usize;
        #[cfg(target_pointer_width = "32")]
        pub fn SetClassLongW(
            hWnd: HWND,
            nIndex: i32,
            dwNewLong: i32,
        ) -> u32;
        pub fn CreateIcon(
            hInstance: HINSTANCE,
            nWidth: i32,
            nHeight: i32,
            cPlanes: u8,
            cBitsPixel: u8,
            lpbANDbits: *const u8,
            lpbXORbits: *const u8,
        ) -> HICON;
    }

    pub fn set_process_aumid(id: &str) {
        let utf16: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(utf16.as_ptr());
        }
    }

    pub fn apply_taskbar_icon(hwnd_raw: *mut c_void, icon_bytes: &[u8]) {
        if hwnd_raw.is_null() {
            return;
        }
        unsafe {
            let hinst = GetModuleHandleW(std::ptr::null());

            let cx_big = GetSystemMetrics(SM_CXICON);
            let cy_big = GetSystemMetrics(SM_CYICON);
            let cx_sm = GetSystemMetrics(SM_CXSMICON);
            let cy_sm = GetSystemMetrics(SM_CYSMICON);

            // Intentar cargar desde el recurso 32512 del ejecutable (generado por tauri-build a partir de icon.ico)
            let mut hicon_big: HICON = LoadImageW(
                hinst,
                32512 as usize as *const u16,
                IMAGE_ICON,
                if cx_big > 0 { cx_big } else { 32 },
                if cy_big > 0 { cy_big } else { 32 },
                LR_SHARED,
            );
            let mut hicon_small: HICON = LoadImageW(
                hinst,
                32512 as usize as *const u16,
                IMAGE_ICON,
                if cx_sm > 0 { cx_sm } else { 16 },
                if cy_sm > 0 { cy_sm } else { 16 },
                LR_SHARED,
            );

            // Fallback si no está en recursos PE: generar icono desde PNG en memoria
            if hicon_big.is_null() {
                if let Ok(img) = image::load_from_memory(icon_bytes) {
                    let rgba = img.to_rgba8();
                    let (w, h) = rgba.dimensions();
                    let raw = rgba.into_raw();
                    let pixel_count = (w * h) as usize;
                    let mut and_mask = vec![0u8; (pixel_count + 7) / 8];
                    let mut bgra = Vec::with_capacity(pixel_count * 4);
                    for i in 0..pixel_count {
                        let r = raw[i * 4];
                        let g = raw[i * 4 + 1];
                        let b = raw[i * 4 + 2];
                        let a = raw[i * 4 + 3];
                        bgra.push(b);
                        bgra.push(g);
                        bgra.push(r);
                        bgra.push(a);
                        if a < 128 {
                            and_mask[i / 8] |= 1 << (7 - (i % 8));
                        }
                    }
                    let hicon = CreateIcon(
                        hinst,
                        w as i32,
                        h as i32,
                        1,
                        32,
                        and_mask.as_ptr(),
                        bgra.as_ptr(),
                    );
                    if !hicon.is_null() {
                        hicon_big = hicon;
                        hicon_small = hicon;
                    }
                }
            }

            if !hicon_big.is_null() {
                SendMessageW(hwnd_raw, WM_SETICON, ICON_BIG, hicon_big as isize);
                #[cfg(target_pointer_width = "64")]
                SetClassLongPtrW(hwnd_raw, GCLP_HICON, hicon_big as isize);
                #[cfg(target_pointer_width = "32")]
                SetClassLongW(hwnd_raw, GCLP_HICON, hicon_big as i32);
            }

            if !hicon_small.is_null() {
                SendMessageW(hwnd_raw, WM_SETICON, ICON_SMALL, hicon_small as isize);
                #[cfg(target_pointer_width = "64")]
                SetClassLongPtrW(hwnd_raw, GCLP_HICONSM, hicon_small as isize);
                #[cfg(target_pointer_width = "32")]
                SetClassLongW(hwnd_raw, GCLP_HICONSM, hicon_small as i32);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    win32_icon::set_process_aumid("com.raul.multimedia-converter");

    tauri::Builder::default()
        .setup(|app| {
            let win = app.get_webview_window("main").or_else(|| {
                app.webview_windows().into_values().next()
            });
            if let Some(w) = win {
                let icon_bytes = include_bytes!("../icons/128x128.png");
                if let Ok(img) = image::load_from_memory(icon_bytes) {
                    let rgba = img.to_rgba8();
                    let (width, height) = rgba.dimensions();
                    let tauri_img = tauri::image::Image::new_owned(rgba.into_raw(), width, height);
                    let _ = w.set_icon(tauri_img);
                } else if let Some(icon) = app.default_window_icon() {
                    let _ = w.set_icon(icon.clone());
                }

                #[cfg(windows)]
                {
                    if let Ok(hwnd) = w.hwnd() {
                        win32_icon::apply_taskbar_icon(hwnd.0 as _, icon_bytes);
                    }
                    let w_clone = w.clone();
                    w.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(true) = event {
                            if let Ok(hwnd) = w_clone.hwnd() {
                                win32_icon::apply_taskbar_icon(hwnd.0 as _, icon_bytes);
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Caché de la detección de GPU: se calcula una sola vez por sesión
        .manage(commands::HwCache::default())
        // Conversiones en curso (para poder cancelarlas)
        .manage(commands::JobRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::detect_hw_accel,
            commands::get_video_metadata,
            commands::convert_video,
            commands::cancel_conversion,
            commands::get_image_metadata,
            commands::convert_image,
            commands::convert_images_batch,
            commands::strip_images_metadata,
            commands::get_thumb_cache_info,
            commands::clear_thumb_cache,
            commands::notify_completion_if_unfocused,
            docs::get_doc_metadata,
            docs::convert_docs_batch,
            docs::strip_docs_metadata,
            docs::merge_pdfs
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
``

## src-tauri/src/main.rs

``rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    multimedia_converter_lib::run()
}
``

## src/App.css

``css
@import "tailwindcss";

@theme {
  --color-indigo-200: var(--accent-200);
  --color-indigo-300: var(--accent-300);
  --color-indigo-400: var(--accent-400);
  --color-indigo-500: var(--accent-500);
  --color-indigo-600: var(--accent-600);
  --color-indigo-700: var(--accent-700);
  --color-indigo-900: var(--accent-900);
  --color-violet-500: var(--accent-sec-500);
  --color-violet-600: var(--accent-sec-600);
}

:root {
  color-scheme: dark;
  --accent-rgb: 99, 102, 241;
  --accent-sec-rgb: 124, 58, 237;
  --accent-200: #c7d2fe;
  --accent-300: #a5b4fc;
  --accent-400: #818cf8;
  --accent-500: #6366f1;
  --accent-600: #4f46e5;
  --accent-700: #4338ca;
  --accent-900: #312e81;
  --accent-sec-500: #8b5cf6;
  --accent-sec-600: #7c3aed;
}

html, body, #root { min-height: 100%; }
body {
  margin: 0;
  font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(900px 520px at 0% 0%, rgba(var(--accent-rgb), 0.16), transparent 60%),
    radial-gradient(900px 520px at 100% 0%, rgba(var(--accent-sec-rgb), 0.18), transparent 60%),
    #0b0f19;
  background-attachment: fixed;
}
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 9999px; }
``

## src/App.tsx

``tsx
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Film, Image as ImageIcon, Settings } from "lucide-react";
import "./App.css";

import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { useAppSettings } from "./hooks/useAppSettings";
import { useHwProfile } from "./hooks/useHwProfile";
import { useVideoConverter } from "./hooks/useVideoConverter";
import { useImageConverter } from "./hooks/useImageConverter";
import { useDocConverter } from "./hooks/useDocConverter";
import { PillTabs } from "./components/ui";
import { VideoTab } from "./components/VideoTab";
import { ImageTab } from "./components/ImageTab";
import { DocTab } from "./components/DocTab";
const SettingsModal = lazy(() => import("./components/SettingsModal").then((m) => ({ default: m.SettingsModal })));
import { ToastContainer, type ToastItem } from "./components/Toast";
import { playErrorSound, splitPath } from "./lib/utils";
import type { IncompatibleHandler } from "./types";
import { checkForNativeUpdate, type UpdateStatus } from "./lib/nativeUpdater";
import { NativeUpdateBanner } from "./components/NativeUpdateBanner";

type TabId = "video" | "image" | "doc";

const TABS = [
  { id: "video" as const, label: "Video", icon: <Film size={18} /> },
  { id: "image" as const, label: "Imágenes", icon: <ImageIcon size={18} /> },
  { id: "doc" as const, label: "Documentos", icon: <FileText size={18} /> },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("video");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nativeUpdate, setNativeUpdate] = useState<UpdateStatus | null>(null);

  // Buscar actualizaciones nativas al abrir la app
  useEffect(() => {
    let cancelled = false;
    checkForNativeUpdate().then((status) => {
      if (!cancelled && status.available) {
        setNativeUpdate(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Configuración persistente (color RGB, carpeta predeterminada y memoria de la última conversión)
  const appSettings = useAppSettings();

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleIncompatible: IncompatibleHandler = useCallback(
    (files: string[], section: "video" | "image" | "doc", customReason?: string) => {
      playErrorSound();

      const count = files.length;
      const firstFileName = splitPath(files[0]).file;
      const firstExt = splitPath(files[0]).ext.toUpperCase() || "desconocido";

      let sectionName = "";
      let formats = "";
      if (section === "video") {
        sectionName = "Video";
        formats = "MP4, MKV, MOV, WebM, AVI...";
      } else if (section === "image") {
        sectionName = "Imágenes";
        formats = "PNG, JPG, WebP";
      } else {
        sectionName = "Documentos";
        formats = "PDF, DOCX, TXT, Markdown";
      }

      const title = count === 1 ? "Formato no compatible" : "Formatos no compatibles";
      const message =
        customReason ??
        (count === 1
          ? `No fue posible añadir «${firstFileName}» (.${firstExt.toLowerCase()}) porque el formato de archivo no es el correcto para el apartado de ${sectionName}. Formatos admitidos: ${formats}.`
          : `No fue posible añadir ${count} archivos porque sus formatos no son los correctos para el apartado de ${sectionName}. Formatos admitidos: ${formats}.`);

      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, message, tone: "error" }]);
    },
    [],
  );

  // El estado vive aquí para no perder progreso ni archivos al cambiar de pestaña
  const hw = useHwProfile();
  const video = useVideoConverter(appSettings, handleIncompatible);
  const image = useImageConverter(appSettings, handleIncompatible);
  const doc = useDocConverter(appSettings, handleIncompatible);

  // Al arrastrar archivos desde el explorador, si el cursor pasa sobre los botones de pestañas,
  // cambiamos automáticamente la pestaña activa para recibir el archivo en la sección correspondiente.
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "over" || p.type === "enter") {
          const x = p.position.x / window.devicePixelRatio;
          const y = p.position.y / window.devicePixelRatio;

          const buttons = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-id]"));
          for (const btn of buttons) {
            const r = btn.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
              const target = btn.getAttribute("data-tab-id") as TabId;
              if (target && target !== tabRef.current) {
                setTab(target);
              }
              break;
            }
          }
        }
      })
      .then((f) => {
        if (cancelled) f();
        else un = f;
      });

    return () => {
      cancelled = true;
      un?.();
    };
  }, []);

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30">
      {/* Ancho completo de la ventana (hasta 1800 px) */}
      <main className="mx-auto w-full max-w-[1800px] px-6 pb-8 pt-5">
        {/* Encabezado compacto: título a la izquierda, pestañas + botón Ajustes a la derecha */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-500">Conversor Multimedia</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Video, imágenes y documentos · Aceleración por GPU y procesamiento paralelo
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div className="flex-1 sm:w-[480px] [&_button]:py-2.5">
              <PillTabs tabs={TABS} value={tab} onChange={setTab} />
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir ajustes"
              title="Ajustes del programa"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#1e293b] bg-[#131a2a]/80 px-4 py-3 text-sm font-semibold text-slate-300 shadow-lg transition-colors hover:border-indigo-500/40 hover:text-white"
            >
              <Settings size={18} className="text-indigo-400" />
              <span className="hidden md:inline">Ajustes</span>
            </button>
          </div>
        </header>

        {/* Banner de actualización nativa automática (descarga y reinicia) */}
        {nativeUpdate && (
          <NativeUpdateBanner
            status={nativeUpdate}
            onDismiss={() => setNativeUpdate(null)}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {tab === "video" ? (
              <VideoTab vc={video} hw={hw} />
            ) : tab === "image" ? (
              <ImageTab ic={image} />
            ) : (
              <DocTab dc={doc} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={appSettings} />
        </Suspense>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
``

## src/assets/react.svg

``xml
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="35.93" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 228"><path fill="#00D8FF" d="M210.483 73.824a171.49 171.49 0 0 0-8.24-2.597c.465-1.9.893-3.777 1.273-5.621c6.238-30.281 2.16-54.676-11.769-62.708c-13.355-7.7-35.196.329-57.254 19.526a171.23 171.23 0 0 0-6.375 5.848a155.866 155.866 0 0 0-4.241-3.917C100.759 3.829 77.587-4.822 63.673 3.233C50.33 10.957 46.379 33.89 51.995 62.588a170.974 170.974 0 0 0 1.892 8.48c-3.28.932-6.445 1.924-9.474 2.98C17.309 83.498 0 98.307 0 113.668c0 15.865 18.582 31.778 46.812 41.427a145.52 145.52 0 0 0 6.921 2.165a167.467 167.467 0 0 0-2.01 9.138c-5.354 28.2-1.173 50.591 12.134 58.266c13.744 7.926 36.812-.22 59.273-19.855a145.567 145.567 0 0 0 5.342-4.923a168.064 168.064 0 0 0 6.92 6.314c21.758 18.722 43.246 26.282 56.54 18.586c13.731-7.949 18.194-32.003 12.4-61.268a145.016 145.016 0 0 0-1.535-6.842c1.62-.48 3.21-.974 4.76-1.488c29.348-9.723 48.443-25.443 48.443-41.52c0-15.417-17.868-30.326-45.517-39.844Zm-6.365 70.984c-1.4.463-2.836.91-4.3 1.345c-3.24-10.257-7.612-21.163-12.963-32.432c5.106-11 9.31-21.767 12.459-31.957c2.619.758 5.16 1.557 7.61 2.4c23.69 8.156 38.14 20.213 38.14 29.504c0 9.896-15.606 22.743-40.946 31.14Zm-10.514 20.834c2.562 12.94 2.927 24.64 1.23 33.787c-1.524 8.219-4.59 13.698-8.382 15.893c-8.067 4.67-25.32-1.4-43.927-17.412a156.726 156.726 0 0 1-6.437-5.87c7.214-7.889 14.423-17.06 21.459-27.246c12.376-1.098 24.068-2.894 34.671-5.345a134.17 134.17 0 0 1 1.386 6.193ZM87.276 214.515c-7.882 2.783-14.16 2.863-17.955.675c-8.075-4.657-11.432-22.636-6.853-46.752a156.923 156.923 0 0 1 1.869-8.499c10.486 2.32 22.093 3.988 34.498 4.994c7.084 9.967 14.501 19.128 21.976 27.15a134.668 134.668 0 0 1-4.877 4.492c-9.933 8.682-19.886 14.842-28.658 17.94ZM50.35 144.747c-12.483-4.267-22.792-9.812-29.858-15.863c-6.35-5.437-9.555-10.836-9.555-15.216c0-9.322 13.897-21.212 37.076-29.293c2.813-.98 5.757-1.905 8.812-2.773c3.204 10.42 7.406 21.315 12.477 32.332c-5.137 11.18-9.399 22.249-12.634 32.792a134.718 134.718 0 0 1-6.318-1.979Zm12.378-84.26c-4.811-24.587-1.616-43.134 6.425-47.789c8.564-4.958 27.502 2.111 47.463 19.835a144.318 144.318 0 0 1 3.841 3.545c-7.438 7.987-14.787 17.08-21.808 26.988c-12.04 1.116-23.565 2.908-34.161 5.309a160.342 160.342 0 0 1-1.76-7.887Zm110.427 27.268a347.8 347.8 0 0 0-7.785-12.803c8.168 1.033 15.994 2.404 23.343 4.08c-2.206 7.072-4.956 14.465-8.193 22.045a381.151 381.151 0 0 0-7.365-13.322Zm-45.032-43.861c5.044 5.465 10.096 11.566 15.065 18.186a322.04 322.04 0 0 0-30.257-.006c4.974-6.559 10.069-12.652 15.192-18.18ZM82.802 87.83a323.167 323.167 0 0 0-7.227 13.238c-3.184-7.553-5.909-14.98-8.134-22.152c7.304-1.634 15.093-2.97 23.209-3.984a321.524 321.524 0 0 0-7.848 12.897Zm8.081 65.352c-8.385-.936-16.291-2.203-23.593-3.793c2.26-7.3 5.045-14.885 8.298-22.6a321.187 321.187 0 0 0 7.257 13.246c2.594 4.48 5.28 8.868 8.038 13.147Zm37.542 31.03c-5.184-5.592-10.354-11.779-15.403-18.433c4.902.192 9.899.29 14.978.29c5.218 0 10.376-.117 15.453-.343c-4.985 6.774-10.018 12.97-15.028 18.486Zm52.198-57.817c3.422 7.8 6.306 15.345 8.596 22.52c-7.422 1.694-15.436 3.058-23.88 4.071a382.417 382.417 0 0 0 7.859-13.026a347.403 347.403 0 0 0 7.425-13.565Zm-16.898 8.101a358.557 358.557 0 0 1-12.281 19.815a329.4 329.4 0 0 1-23.444.823c-7.967 0-15.716-.248-23.178-.732a310.202 310.202 0 0 1-12.513-19.846h.001a307.41 307.41 0 0 1-10.923-20.627a310.278 310.278 0 0 1 10.89-20.637l-.001.001a307.318 307.318 0 0 1 12.413-19.761c7.613-.576 15.42-.876 23.31-.876H128c7.926 0 15.743.303 23.354.883a329.357 329.357 0 0 1 12.335 19.695a358.489 358.489 0 0 1 11.036 20.54a329.472 329.472 0 0 1-11 20.722Zm22.56-122.124c8.572 4.944 11.906 24.881 6.52 51.026c-.344 1.668-.73 3.367-1.15 5.09c-10.622-2.452-22.155-4.275-34.23-5.408c-7.034-10.017-14.323-19.124-21.64-27.008a160.789 160.789 0 0 1 5.888-5.4c18.9-16.447 36.564-22.941 44.612-18.3ZM128 90.808c12.625 0 22.86 10.235 22.86 22.86s-10.235 22.86-22.86 22.86s-22.86-10.235-22.86-22.86s10.235-22.86 22.86-22.86Z"></path></svg>
``

## src/components/DocTab.tsx

``tsx
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Combine,
  FileText,
  FolderOpen,
  HelpCircle,
  Plus,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocConverter, DocMode, DocQueueItem } from "../hooks/useDocConverter";
import { useTauriDrop } from "../hooks/tauri";
import type { DocFormat } from "../types";
import { splitPath } from "../lib/utils";
import { Card, DropZone, GradientButton, Notice, ProgressBar, Segmented, SecondaryButton, Stat } from "./ui";

const DOC_FORMATS: readonly DocFormat[] = ["pdf", "docx", "xlsx", "txt", "md"] as const;
const DOC_FORMAT_LABEL: Record<DocFormat, string> = {
  pdf: "PDF",
  docx: "DOCX (Word)",
  xlsx: "XLSX (Excel)",
  txt: "TXT (Texto)",
  md: "Markdown (.md)",
};

const MODES: readonly DocMode[] = ["convert", "strip", "merge"] as const;
const MODE_LABEL: Record<DocMode, string> = {
  convert: "Convertir formato",
  strip: "Quitar metadatos",
  merge: "Unir PDFs",
};

function formatBytes(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
        {n}
      </span>
      <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</span>
    </div>
  );
}

function LabelWithHelp({ label, active, onHelp }: { label: string; active: boolean; onHelp: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <button
        type="button"
        onClick={onHelp}
        aria-label={`Abrir el glosario: ${label}`}
        title="Ver glosario"
        className={`rounded-full p-0.5 transition-colors ${active ? "text-indigo-300" : "text-slate-500 hover:text-indigo-300"}`}
      >
        <HelpCircle size={14} />
      </button>
    </div>
  );
}

function Row({ label, from, to }: { label: string; from: string; to: string }) {
  const changed = from !== to;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
        <span className="truncate text-slate-300" title={from}>
          {from}
        </span>
        <span className={`truncate ${changed ? "font-medium text-indigo-300" : "text-slate-300"}`} title={to}>
          {to}
        </span>
      </div>
    </div>
  );
}

/** Insignia visual por extensión de documento (PDF en rojo, DOCX en azul, MD en púrpura, TXT en esmeralda). */
function DocBadgeInternal({ ext }: { ext: string }) {
  const clean = ext.toUpperCase();
  const cls =
    clean === "PDF"
      ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
      : clean === "DOCX"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : clean === "XLSX"
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          : clean === "MD"
            ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
            : "border-teal-500/40 bg-teal-500/15 text-teal-300";

  return (
    <div className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold tracking-tight ${cls}`}>
      {clean || "DOC"}
    </div>
  );
}



const DocBadge = memo(DocBadgeInternal);

function DocQueueRowInternal({
  it,
  index,
  total,
  isSelected,
  merge,
  mode,
  running,
  resItem,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  it: DocQueueItem;
  index: number;
  total: number;
  isSelected: boolean;
  merge: boolean;
  mode: DocMode;
  running: boolean;
  resItem?: { ok: boolean; dest: string; sizeBytes?: number | null };
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const f = splitPath(it.path);
  const isPdf = f.ext.toLowerCase() === "pdf";
  const sub =
    it.metaState === "loading"
      ? "Leyendo propiedades…"
      : it.metaState === "error"
        ? it.metaError ?? "No se pudo leer el archivo"
        : it.meta
          ? [
              it.meta.pages ? `${it.meta.pages} página${it.meta.pages === 1 ? "" : "s"}` : null,
              it.meta.words ? `≈ ${it.meta.words.toLocaleString()} palabras` : null,
              it.meta.sizeBytes ? formatBytes(it.meta.sizeBytes) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : f.dir || "—";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      onClick={() => onSelect(it.id)}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-600/10"
          : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
      }`}
    >
      {merge && (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600/25 text-xs font-bold text-indigo-300"
          title={`Posición ${index + 1} en el documento final`}
        >
          {index + 1}
        </span>
      )}
      <DocBadge ext={f.ext} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
            {f.file}
          </p>
          {mode === "convert" && (
            <span
              className="inline-flex shrink-0 items-center rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 uppercase"
              title={`Formato de salida: ${it.targetFormat ? DOC_FORMAT_LABEL[it.targetFormat] : "PDF"}`}
            >
              ➔ {(it.targetFormat ?? "pdf").toUpperCase()}
            </span>
          )}
          {merge && !isPdf && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
              <AlertTriangle size={11} /> No es PDF
            </span>
          )}
        </div>
        <p className={`truncate text-xs ${it.metaState === "error" || (merge && !isPdf) ? "text-rose-300" : "text-slate-500"}`}>
          {merge && !isPdf ? "Solo los archivos PDF pueden unirse" : sub}
        </p>
        {resItem?.ok && resItem.sizeBytes != null && (
          <p className="truncate text-xs font-medium text-emerald-300">
            ✓ {merge ? "PDF generado" : "Salida real"}: {formatBytes(resItem.sizeBytes)} ({splitPath(resItem.dest).ext.toUpperCase()})
          </p>
        )}
      </div>

      {/* Controles de orden para el modo unir */}
      {merge && total > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={running || index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(it.id);
            }}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
            aria-label="Mover hacia arriba"
            title="Mover hacia arriba"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            disabled={running || index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(it.id);
            }}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
            aria-label="Mover hacia abajo"
            title="Mover hacia abajo"
          >
            <ArrowDown size={13} />
          </button>
        </div>
      )}

      {resItem?.ok && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            revealItemInDir(resItem.dest).catch(() => {});
          }}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
          aria-label="Mostrar en carpeta"
          title="Mostrar en carpeta"
        >
          <FolderOpen size={14} />
        </button>
      )}
      <button
        type="button"
        disabled={running}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(it.id);
        }}
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
        aria-label="Quitar"
      >
        <X size={14} />
      </button>
    </motion.li>
  );


}

const DocQueueRow = memo(DocQueueRowInternal);

/* ───────────────────────── Glosario de Documentos ───────────────────────── */

type DocGlossaryTab = "mode" | "format";

const DOC_FORMAT_GLOSSARY: Record<
  DocFormat,
  { tagline: string; pros: string; structure: string; useWhen: string }
> = {
  pdf: {
    tagline: "Formato de documento portátil universal.",
    pros: "Se ve exactamente igual en cualquier pantalla o impresora sin que nadie mueva accidentalmente los párrafos.",
    structure: "Páginas fijas A4 · Compatible con cualquier navegador o lector.",
    useWhen: "vas a entregar un trabajo, reporte, contrato o documento listo para leer o imprimir.",
  },
  docx: {
    tagline: "El estándar editable de Microsoft Word y LibreOffice.",
    pros: "Permite abrir y editar libremente el texto en Word, Google Docs o Writer.",
    structure: "Paquete comprimido OpenXML (ZIP) con párrafos fluidos.",
    useWhen: "quieres extraer el contenido de un PDF o archivo de texto para seguir redactándolo en Word.",
  },
  xlsx: {
    tagline: "Libro de cálculo de Microsoft Excel y hojas electrónicas.",
    pros: "Extrae tablas, filas y columnas estructuradas para análisis numérico y fórmulas.",
    structure: "Libro de cálculo OpenXML (.xlsx) con celdas, filas y columnas autoajustadas.",
    useWhen: "tienes tablas, estados de cuenta, listas o reportes tabulados en PDF y necesitas editarlos en Excel.",
  },
  txt: {
    tagline: "Texto plano puro sin formato.",
    pros: "Ultrarrápido, ocupa pocos kilobytes y lo abre cualquier editor de código o bloc de notas.",
    structure: "Párrafos separados por saltos de línea sin estilos ni metadatos ocultos.",
    useWhen: "necesitas extraer únicamente el texto limpio de un PDF o DOCX para copiarlo o procesarlo.",
  },
  md: {
    tagline: "Texto estructurado Markdown para desarrolladores, notas y documentación.",
    pros: "Legible como texto plano y compatible con GitHub, Obsidian, Notion e inteligencia artificial.",
    structure: "Encabezados y párrafos limpios en sintaxis Markdown.",
    useWhen: "conviertes documentos de Word o PDF para tu base de notas o repositorios técnicos.",
  },
};

function DocGlossaryDrawer({
  tab,
  onTab,
  onClose,
  mode,
  format,
}: {
  tab: DocGlossaryTab | null;
  onTab: (t: DocGlossaryTab) => void;
  onClose: () => void;
  mode: DocMode;
  format: DocFormat;
}) {
  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          key="doc-glossary-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/45"
        />
      )}
      {tab && (
        <motion.aside
          key="doc-glossary-drawer"
          role="dialog"
          aria-label="Glosario de documentos"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1e293b] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Glosario de documentos</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  Conversión de texto estructurado y limpieza de privacidad en archivos PDF y Word.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar glosario"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 pt-4">
            <div className="relative inline-flex rounded-xl bg-[#23284f]/60 p-1">
              {(
                [
                  ["mode", "Modos y diferencias"],
                  ["format", "Formatos de salida"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTab(id)}
                  className="relative isolate rounded-lg px-4 py-1.5 text-sm font-semibold"
                >
                  {tab === id && (
                    <motion.span
                      layoutId="doc-glossary-tab"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 -z-10 rounded-lg bg-[#0e1122] shadow-inner"
                    />
                  )}
                  <span className={tab === id ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-4">
            {tab === "mode" ? (
              <>
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-600/10 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Diferencia clave entre los tres modos
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      • <span className="font-semibold text-indigo-200">Convertir formato</span>{" "}
                      <span className="text-slate-400">
                        extrae los párrafos y reconstruye un documento nuevo en el formato elegido (PDF, DOCX, TXT o Markdown). Si conviertes de DOCX a PDF y tienes LibreOffice instalado, lo utiliza automáticamente para preservar tablas y estilos complejos.
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Quitar metadatos</span>{" "}
                      <span className="text-slate-400">
                        conserva intactas las páginas, fuentes, tablas e imágenes del PDF o DOCX original, eliminando únicamente el autor, empresa, programa creador y fechas ocultas.
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Unir PDFs</span>{" "}
                      <span className="text-slate-400">
                        combina múltiples archivos PDF en un solo documento final. Las páginas se agregan en el mismo orden en que aparecen en la lista de archivos. No se modifica el contenido de ninguna página.
                      </span>
                    </li>
                  </ul>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "convert" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Convertir formato</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Ideal para pasar de Word (DOCX) a PDF, extraer el texto de un PDF hacia un archivo editable DOCX/TXT/MD, o generar un PDF limpio a partir de notas en texto o Markdown.
                  </p>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "strip" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Quitar metadatos</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Borra el diccionario <span className="font-mono text-slate-200">/Info</span> y{" "}
                    <span className="font-mono text-slate-200">/Metadata</span> en archivos PDF, y limpia{" "}
                    <span className="font-mono text-slate-200">docProps/core.xml</span> y{" "}
                    <span className="font-mono text-slate-200">app.xml</span> en archivos Word (nombre de usuario de tu PC, empresa, tiempos de edición y revisiones).
                  </p>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "merge" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Unir PDFs</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Combina múltiples archivos PDF en un solo documento final. Las páginas se agregan en el mismo orden en que aparecen en la lista de archivos. No se modifica el contenido de ninguna página.
                  </p>
                </div>
              </>
            ) : (
              DOC_FORMATS.map((f) => {
                const e = DOC_FORMAT_GLOSSARY[f];
                const active = mode === "convert" && f === format;
                return (
                  <div
                    key={f}
                    className={`rounded-2xl border px-4 py-3 ${
                      active ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-white">{DOC_FORMAT_LABEL[f]}</h4>
                      {active && (
                        <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                          En uso
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-indigo-200">{e.tagline}</p>
                    <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                      <div>
                        <dt className="inline font-semibold text-slate-300">Ventajas: </dt>
                        <dd className="inline text-slate-400">{e.pros}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-slate-300">Estructura: </dt>
                        <dd className="inline text-slate-400">{e.structure}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
                        <dd className="inline text-slate-400">{e.useWhen}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────── Columna 3: Inspección de Documento ───────────────── */

function DocInspectionPanel({ dc }: { dc: DocConverter }) {
  const sel = dc.selected;
  const meta = sel?.meta ?? null;
  const strip = dc.mode === "strip";
  const merge = dc.mode === "merge";
  const doneItem = sel ? dc.results?.find((r) => r.source === sel.path && r.ok) ?? null : null;

  const state = !sel
    ? "empty"
    : sel.metaState === "loading"
      ? "loading"
      : sel.metaState === "error"
        ? "error"
        : meta
          ? "ready"
          : "empty";

  let body: React.ReactNode = null;

  if (merge) {
    /* ── Vista especial para modo "Unir PDFs" ── */
    const readyItems = dc.items.filter((it) => it.metaState === "ready" && it.meta);
    const totalPages = readyItems.reduce((sum, it) => sum + (it.meta?.pages ?? 0), 0);
    const totalSize = readyItems.reduce((sum, it) => sum + (it.meta?.sizeBytes ?? 0), 0);
    const mergeResult = dc.results?.[0];

    body = (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Combine size={16} className="text-indigo-300" />
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Resumen de unión</p>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {dc.items.length === 0
              ? "Añade archivos PDF para combinarlos en un solo documento"
              : dc.items.length === 1
                ? "Necesitas al menos 2 archivos PDF para unirlos"
                : `Se unirán ${dc.items.length} archivos PDF en orden`}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Las páginas se agregan secuencialmente respetando el orden de la lista.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Archivos" value={`${dc.items.length}`} />
          <Stat label="Páginas totales" value={totalPages > 0 ? `${totalPages}` : "—"} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tamaño combinado" value={totalSize > 0 ? formatBytes(totalSize) : "—"} />
          <Stat label="Salida estimada" value={mergeResult?.sizeBytes ? formatBytes(mergeResult.sizeBytes) : "≈ Variable"} />
        </div>

        {dc.items.length > 0 && (
          <div className="rounded-2xl border border-[#23284f] bg-[#0e1122]/90 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Orden de las páginas
            </p>
            <ol className="mt-1.5 space-y-1">
              {dc.items.map((it, idx) => {
                const f = splitPath(it.path);
                return (
                  <li key={it.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600/20 text-[10px] font-bold text-indigo-300">
                      {idx + 1}
                    </span>
                    <span className="truncate" title={it.path}>{f.file}</span>
                    {it.meta?.pages != null && (
                      <span className="ml-auto shrink-0 text-slate-500">{it.meta.pages} pág.</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    );
  } else if (state === "empty") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-indigo-600/10 p-4 text-indigo-300/70">
          <FileText size={28} />
        </div>
        <p className="max-w-[260px] text-sm text-slate-500">
          Añade documentos PDF, DOCX, TXT o Markdown para inspeccionar su contenido, páginas y metadatos.
        </p>
      </div>
    );
  } else if (state === "loading") {
    body = (
      <div className="space-y-4 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-2.5 w-20 rounded bg-[#23284f]" />
            <div className="h-4 w-full rounded bg-[#23284f]/70" />
          </div>
        ))}
      </div>
    );
  } else if (state === "error") {
    body = <Notice tone="error">{sel?.metaError}</Notice>;
  } else if (meta && sel) {
    if (strip) {
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida limpia" : "Qué se hará"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={`${meta.format} (Intacto)`} />
          <Row label="Páginas" from={meta.pages ? `${meta.pages}` : "—"} to={meta.pages ? `${meta.pages}` : "—"} />
          <Row
            label="Autor registrado"
            from={meta.author ?? "No contiene"}
            to={meta.author ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Aplicación / Creador"
            from={meta.creator ?? "No contiene"}
            to={meta.creator ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Título interno"
            from={meta.title ?? "No contiene"}
            to={meta.title ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(meta.sizeBytes)}`}
          />

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={meta.hasMetadata ? "text-indigo-300" : "text-emerald-300"} />
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Diagnóstico de privacidad</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {meta.hasMetadata
                ? "Metadatos de autor/software detectados en el documento"
                : "Este documento no presenta metadatos personales visibles"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Se eliminan las propiedades ocultas conservando el diseño, texto e imágenes del documento original.
            </p>
          </div>
        </div>
      );
    } else {
      const outFmt = merge ? "PDF (Unido)" : dc.format.toUpperCase();
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida final" : "Salida estimada"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={outFmt} />
          <Row
            label="Páginas estimadas"
            from={meta.pages ? `${meta.pages}` : "—"}
            to={dc.format === "txt" || dc.format === "md" ? "Flujo continuo" : meta.pages ? `≈ ${meta.pages}` : "—"}
          />
          <Row
            label="Palabras / Caracteres"
            from={`${meta.words.toLocaleString("en-US")} pal. · ${meta.chars.toLocaleString("en-US")} car.`}
            to="100 % conservados"
          />
          <Row
            label="Imágenes incrustadas"
            from={meta.embeddedImages > 0 ? `${meta.embeddedImages} detectada(s)` : "Ninguna"}
            to={
              meta.embeddedImages > 0
                ? dc.format === "txt" || dc.format === "md"
                  ? "Solo texto"
                  : "Extracción de texto"
                : "Ninguna"
            }
          />
          <Row
            label="Metadatos de autor"
            from={meta.author ?? (meta.hasMetadata ? "Detectados" : "Ninguno")}
            to="Descartados al convertir"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : "Variable según formato"}
          />

          {/* Vista previa de las primeras líneas del documento */}
          <div className="rounded-2xl border border-[#23284f] bg-[#0e1122]/90 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Vista previa de texto extraído
            </p>
            <p className="mt-1.5 line-clamp-5 whitespace-pre-line font-mono text-xs leading-relaxed text-slate-300">
              {meta.preview || "(El documento no contiene texto seleccionable o es un PDF escaneado como imagen)"}
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">Inspección de documento</h3>
      </div>
      {sel && !merge && (
        <p className="truncate text-xs text-slate-500" title={sel.path}>
          {splitPath(sel.path).file}
        </p>
      )}
      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${merge ? "merge" : state}-${merge ? "all" : sel?.id ?? ""}-${dc.mode}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="flex flex-1 flex-col"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ───────────────── Pestaña de Documentos (3 columnas) ───────────────── */

export function DocTab({ dc }: { dc: DocConverter }) {
  const hover = useTauriDrop(dc.addFiles);
  const running = dc.status === "running";
  const strip = dc.mode === "strip";
  const merge = dc.mode === "merge";
  const n = dc.items.length;
  const isBatch = n > 1;

  const [glossary, setGlossary] = useState<DocGlossaryTab | null>(null);

  useEffect(() => {
    if (!glossary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossary(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossary]);

  const handleSelect = useCallback((id: string) => dc.select(id), [dc.select]);
  const handleRemove = useCallback((id: string) => dc.removeFile(id), [dc.removeFile]);
  const handleMoveUp = useCallback((id: string) => dc.moveItem(id, "up"), [dc.moveItem]);
  const handleMoveDown = useCallback((id: string) => dc.moveItem(id, "down"), [dc.moveItem]);
  const resultsMap = useMemo(() => {
    if (!dc.results) return null;
    const m = new Map<string, (typeof dc.results)[number]>();
    for (const r of dc.results) m.set(r.source, r);
    return m;
  }, [dc.results]);

  const pct =
    dc.status === "done"
      ? 100
      : dc.progress
        ? (dc.progress.done / Math.max(dc.progress.total, 1)) * 100
        : null;

  const okCount = dc.results?.filter((r) => r.ok).length ?? 0;
  const failed = dc.results?.filter((r) => !r.ok) ?? [];
  const firstOk = dc.results?.find((r) => r.ok);

  const startLabel = running
    ? merge
      ? "Uniendo PDFs…"
      : strip
        ? "Limpiando…"
        : "Convirtiendo…"
    : merge
      ? isBatch
        ? `Unir PDFs (${n})`
        : "Unir PDFs"
      : strip
        ? isBatch
          ? `Quitar metadatos (${n})`
          : "Quitar metadatos"
        : isBatch
          ? `Convertir lote (${n})`
          : "Convertir documento";

  const startDisabled = merge ? n < 2 : n === 0;

  const noInternalLabel = "[&>div>span:first-child]:hidden";

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* ───── Columna 1: Documentos de origen ───── */}
      <Card data-drop-zone="true" className="flex flex-col gap-5">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Step n={1}>Documentos de origen</Step>
            {n > 0 && (
              <div className="flex items-center gap-2">
                <motion.span
                  key={isBatch ? "batch" : "single"}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-full border border-indigo-500/30 bg-indigo-600/15 px-3 py-1 text-xs font-medium text-indigo-200"
                >
                  {isBatch ? `Lote · ${n} archivos` : "Individual"}
                </motion.span>
                <button
                  type="button"
                  disabled={running}
                  onClick={dc.pick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/15 disabled:opacity-40"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            )}
          </div>

          {n > 0 && (
            <p className="text-xs text-slate-500">
              Haz clic en un documento para inspeccionar <span className="text-slate-300">sus páginas, palabras y vista previa</span>.
            </p>
          )}

          {/* Carpeta de salida */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Carpeta de salida</span>
              {n > 1 && <span className="text-[11px] text-indigo-300/80">para todo el lote</span>}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 text-sm text-slate-300"
                title={dc.outputDir ?? undefined}
              >
                {dc.outputDir ?? <span className="text-slate-500">Misma carpeta que el origen</span>}
              </div>
              <button
                type="button"
                disabled={running}
                onClick={dc.pickOutputDir}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#23284f]/70 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen size={15} /> Examinar
              </button>
              {dc.outputDir && (
                <button
                  type="button"
                  disabled={running}
                  onClick={dc.clearOutputDir}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                  aria-label="Volver a la carpeta del origen"
                  title="Volver a la carpeta del origen"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {n === 0 ? (
            <div className="flex flex-1 flex-col [&>*]:flex-1">
              <DropZone
                hover={hover}
                disabled={running}
                onBrowse={dc.pick}
                icon={<UploadCloud size={28} />}
                title="Arrastra documentos aquí o haz clic para elegirlos"
                subtitle="PDF, DOCX (Word), TXT o Markdown (.md)"
              />
            </div>
          ) : (
            <div
              className={`min-h-[200px] flex-1 rounded-2xl border-2 border-dashed p-2 transition-colors ${
                hover ? "border-indigo-500 bg-indigo-600/10" : "border-transparent"
              }`}
            >
              {hover && <p className="pb-2 text-center text-xs text-indigo-300">Suelta aquí para añadirlos</p>}
              <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {dc.items.map((it: DocQueueItem, index: number) => (
                    <DocQueueRow
                      key={it.id}
                      it={it}
                      index={index}
                      total={n}
                      isSelected={dc.selected?.id === it.id}
                      merge={merge}
                      mode={dc.mode}
                      running={running}
                      resItem={resultsMap?.get(it.path)}
                      onSelect={handleSelect}
                      onRemove={handleRemove}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  ))}
                  {false && ([] as any[]).map((it: any, index: any) => {
                    const f = splitPath(it.path);
                    const isSelected = dc.selected?.id === it.id;
                    const resItem = dc.results?.find((r) => r.source === it.path);
                    const isPdf = f.ext === "pdf";

                    const sub =
                      it.metaState === "loading"
                        ? "Analizando documento…"
                        : it.metaState === "error"
                          ? it.metaError ?? "No se pudo leer el archivo"
                          : it.meta
                            ? [
                                it.meta.pages ? `${it.meta.pages} pág.` : null,
                                `${it.meta.words.toLocaleString("en-US")} palabras`,
                                formatBytes(it.meta.sizeBytes),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : f.dir || "—";

                    return (
                      <motion.li
                        key={it.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        onClick={() => dc.select(it.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                          isSelected
                            ? "border-indigo-500/60 bg-indigo-600/10"
                            : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
                        }`}
                      >
                        {merge && (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600/25 text-xs font-bold text-indigo-300"
                            title={`Posición ${index + 1} en el documento final`}
                          >
                            {index + 1}
                          </span>
                        )}
                        <DocBadge ext={f.ext} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
                              {f.file}
                            </p>
                            {merge && !isPdf && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                                <AlertTriangle size={11} /> No es PDF
                              </span>
                            )}
                          </div>
                          <p className={`truncate text-xs ${it.metaState === "error" || (merge && !isPdf) ? "text-rose-300" : "text-slate-500"}`}>
                            {merge && !isPdf ? "Solo los archivos PDF pueden unirse" : sub}
                          </p>
                          {resItem?.ok && resItem.sizeBytes != null && (
                            <p className="truncate text-xs font-medium text-emerald-300">
                              ✓ {merge ? "PDF generado" : "Salida real"}: {formatBytes(resItem.sizeBytes)} ({splitPath(resItem.dest).ext.toUpperCase()})
                            </p>
                          )}
                        </div>

                        {/* Controles de orden para el modo unir */}
                        {merge && n > 1 && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={running || index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                dc.moveItem(it.id, "up");
                              }}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
                              aria-label="Mover hacia arriba"
                              title="Mover hacia arriba"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={running || index === n - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                dc.moveItem(it.id, "down");
                              }}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
                              aria-label="Mover hacia abajo"
                              title="Mover hacia abajo"
                            >
                              <ArrowDown size={13} />
                            </button>
                          </div>
                        )}

                        {resItem?.ok && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              revealItemInDir(resItem.dest).catch(() => {});
                            }}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
                            aria-label="Mostrar en carpeta"
                            title="Mostrar en carpeta"
                          >
                            <FolderOpen size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={running}
                          onClick={(e) => {
                            e.stopPropagation();
                            dc.removeFile(it.id);
                          }}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                          aria-label="Quitar"
                        >
                          <X size={14} />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </section>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3">
          <GradientButton onClick={dc.start} disabled={startDisabled} loading={running}>
            {startLabel}
          </GradientButton>
          <SecondaryButton onClick={dc.clear} disabled={running || (n === 0 && dc.status === "idle")}>
            Limpiar
          </SecondaryButton>
        </div>

        {/* Progreso */}
        <AnimatePresence>
          {dc.status !== "idle" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="space-y-4 border-t border-[#1e293b] pt-5"
            >
              <span className="text-sm font-medium text-slate-200">
                {running
                  ? merge
                    ? "Uniendo PDFs…"
                    : strip
                      ? "Limpiando metadatos…"
                      : "Convirtiendo documentos…"
                  : dc.status === "done"
                    ? merge
                      ? "PDFs unidos"
                      : strip
                        ? "Limpieza completada"
                        : "Conversión completada"
                    : "Operación fallida"}
              </span>

              {dc.status !== "error" && <ProgressBar value={pct} />}

              {isBatch && !merge && dc.status !== "error" && (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Completados" value={`${dc.progress?.done ?? 0} / ${dc.progress?.total ?? n}`} />
                  <Stat label="Progreso" value={`${(pct ?? 0).toFixed(0)}%`} />
                </div>
              )}

              {dc.status === "error" && <Notice tone="error">{dc.error}</Notice>}

              {dc.status === "done" && (
                <>
                  <Notice tone={failed.length ? "warn" : "ok"}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {merge
                          ? `Documento PDF unido con éxito (${n} archivos combinados)`
                          : `${okCount} ${strip ? "limpiado" : "convertido"}${okCount === 1 ? "" : "s"}`}
                        {failed.length > 0 && ` · ${failed.length} con error`}
                      </span>
                      {firstOk && (
                        <button
                          type="button"
                          onClick={() => revealItemInDir(firstOk.dest).catch(() => {})}
                          className="inline-flex items-center gap-2 rounded-lg border border-current/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                        >
                          <FolderOpen size={14} /> Mostrar en carpeta
                        </button>
                      )}
                    </div>
                  </Notice>
                  {failed.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-300">
                      {failed.map((r) => (
                        <li key={r.source} className="rounded-lg bg-red-500/10 px-3 py-2">
                          <span className="font-medium">{splitPath(r.source).file}</span>: {r.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ───── Columna 2: Opciones de salida ───── */}
      <Card className="flex flex-col gap-5 min-h-[460px]">
        <div className="flex items-center justify-between gap-3">
          <Step n={2}>
            Opciones de salida{dc.mode === "convert" ? (dc.isIndividual ? " · por documento" : " · para todos") : ""}
          </Step>
          <button
            type="button"
            onClick={() => setGlossary((g) => (g ? null : "mode"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#23284f]/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-[#23284f]/80"
          >
            <BookOpen size={14} /> Glosario
          </button>
        </div>

        {/* Aclara a qué documento pertenecen estas opciones (mismo estilo armonioso que VideoTab) */}
        {dc.mode === "convert" && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              {dc.selected
                ? dc.isIndividual
                  ? "Configurando solo este documento"
                  : "Configuración para todos los documentos"
                : "Ningún documento seleccionado"}
            </p>
            {dc.selected && (
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={dc.selected.path}>
                {splitPath(dc.selected.path).file}
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {dc.selected
                ? dc.isIndividual
                  ? "Cada documento tiene sus propias opciones: selecciona otro en la lista para configurarlo por separado."
                  : "Las opciones de salida se aplicarán a todos los documentos de la cola."
                : "Añade un documento para configurar sus opciones."}
            </p>
            {dc.selected && (
              <div className="mt-2.5">
                {!dc.isIndividual ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => dc.setIsIndividual(true)}
                    title="Permite configurar formato de salida diferente para cada documento"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Configuración individual
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={running}
                    onClick={dc.applyToAll}
                    title="Aplica estas opciones a todos los documentos"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar estas opciones a todos los documentos
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <LabelWithHelp
            label="Modo"
            active={glossary === "mode"}
            onHelp={() => setGlossary((g) => (g === "mode" ? null : "mode"))}
          />
          <div className={noInternalLabel}>
            <Segmented label="" value={dc.mode} options={MODES} labels={MODE_LABEL} onChange={dc.setMode} disabled={running} />
          </div>
        </div>

        {dc.mode === "convert" && (
          <div>
            <LabelWithHelp
              label="Formato de salida"
              active={glossary === "format"}
              onHelp={() => setGlossary((g) => (g === "format" ? null : "format"))}
            />
              <div className={noInternalLabel}>
                <Segmented
                  label=""
                  value={dc.format}
                  options={DOC_FORMATS}
                  labels={DOC_FORMAT_LABEL}
                  onChange={dc.setFormat}
                  disabled={running}
                />
              </div>
            </div>
        )}

</Card>

      {/* ───── Columna 3: Inspección de documento ───── */}
      <DocInspectionPanel dc={dc} />

      {/* Glosario de documentos */}
      <DocGlossaryDrawer
        tab={glossary}
        onTab={setGlossary}
        onClose={() => setGlossary(null)}
        mode={dc.mode}
        format={dc.format}
      />
    </div>
  );
}
``

## src/components/ImageTab.tsx

``tsx
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Eye, FolderOpen, HelpCircle, Image as ImageIcon, Plus, ShieldCheck, UploadCloud, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ImageConverter, ImageMode, ImageQueueItem } from "../hooks/useImageConverter";
import { useTauriDrop } from "../hooks/tauri";
import type { ImageMetadata, ImgFormat, ImgScale } from "../types";
import { splitPath } from "../lib/utils";
import { detectAspect } from "../lib/resolution";
import { Card, DropZone, GradientButton, Notice, ProgressBar, Segmented, SecondaryButton, Stat } from "./ui";
import { PreviewModal, type PreviewTarget } from "./PreviewModal";

const FORMATS = ["png", "jpg", "webp"] as const;
const FORMAT_LABEL: Record<ImgFormat, string> = {
  png: "PNG",
  jpg: "JPG",
  webp: "WebP",
};

const SCALES: readonly ImgScale[] = ["100", "75", "50", "25"] as const;
const SCALE_LABEL: Record<ImgScale, string> = {
  "100": "100% (Original)",
  "75": "75%",
  "50": "50%",
  "25": "25%",
};

const MODES = ["convert", "strip"] as const;
const MODE_LABEL: Record<ImageMode, string> = {
  convert: "Convertir formato",
  strip: "Quitar metadatos",
};

function formatBytes(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
        {n}
      </span>
      <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</span>
    </div>
  );
}

/** Etiqueta de un selector con un botón «?» que abre el glosario de imágenes. */
function LabelWithHelp({ label, active, onHelp }: { label: string; active: boolean; onHelp: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <button
        type="button"
        onClick={onHelp}
        aria-label={`Abrir el glosario: ${label}`}
        title="Ver glosario"
        className={`rounded-full p-0.5 transition-colors ${active ? "text-indigo-300" : "text-slate-500 hover:text-indigo-300"}`}
      >
        <HelpCircle size={14} />
      </button>
    </div>
  );
}

function Row({ label, from, to }: { label: string; from: string; to: string }) {
  const changed = from !== to;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
        <span className="text-slate-300">{from}</span>
        <span className={changed ? "font-medium text-indigo-300" : "text-slate-300"}>{to}</span>
      </div>
    </div>
  );
}

/** Miniatura cuadrada (40×40 px) con fallback elegante si el navegador no puede renderizar el archivo. */
function ImageThumbInternal({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#23284f] bg-[#0e1122] text-indigo-300">
        <ImageIcon size={18} />
      </div>
    );
  }

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0e1122] shadow-sm">
      <img
        src={convertFileSrc(path)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}



const ImageThumb = memo(ImageThumbInternal);

function ImageQueueRowInternal({
  it,
  isSelected,
  resItem,
  locked,
  onSelect,
  onRemove,
  onPreview,
}: {
  it: ImageQueueItem;
  isSelected: boolean;
  resItem?: { ok: boolean; dest: string; sizeBytes?: number | null };
  locked: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (it: ImageQueueItem) => void;
}) {
  const f = splitPath(it.path);
  const realDiff =
    resItem?.ok && resItem.sizeBytes && it.meta?.sizeBytes
      ? (resItem.sizeBytes / it.meta.sizeBytes - 1) * 100
      : null;

  const sub =
    it.metaState === "loading"
      ? "Leyendo propiedades…"
      : it.metaState === "error"
        ? it.metaError ?? "No se pudo leer el archivo"
        : it.meta
          ? `${it.meta.width}×${it.meta.height} · ${formatBytes(it.meta.sizeBytes)}`
          : f.dir || "—";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      onClick={() => onSelect(it.id)}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-600/10"
          : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
      }`}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onPreview(it);
        }}
        className="group relative cursor-pointer"
        title="Ver vista previa / Comparar"
      >
        <ImageThumb path={it.path} />
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye size={14} className="text-white" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
          {f.file}
        </p>
        <p className={`truncate text-xs ${it.metaState === "error" ? "text-red-300" : "text-slate-500"}`}>
          {sub}
        </p>
        {resItem?.ok && resItem.sizeBytes != null && (
          <p className="truncate text-xs font-medium text-emerald-300">
            ✓ Salida real: {formatBytes(resItem.sizeBytes)}
            {realDiff !== null && ` (${realDiff <= 0 ? "−" : "+"}${Math.abs(realDiff).toFixed(0)}%)`}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview(it);
        }}
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-indigo-300"
        aria-label="Vista previa"
        title="Vista previa"
      >
        <Eye size={14} />
      </button>
      {resItem?.ok && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            revealItemInDir(resItem.dest).catch(() => {});
          }}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
          aria-label="Mostrar en carpeta"
          title="Mostrar en carpeta"
        >
          <FolderOpen size={14} />
        </button>
      )}
      <button
        type="button"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(it.id);
        }}
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
        aria-label="Quitar"
      >
        <X size={14} />
      </button>
    </motion.li>
  );


}
const ImageQueueRow = memo(ImageQueueRowInternal);
function scaledDimensions(meta: ImageMetadata, mode: ImageMode, scale: ImgScale) {
  const pct = mode === "strip" ? 100 : Number(scale);
  const w = Math.max(1, Math.floor((meta.width * pct) / 100));
  const h = Math.max(1, Math.floor((meta.height * pct) / 100));
  return { w, h, pct };
}

function estimateImageSize(
  meta: ImageMetadata,
  mode: ImageMode,
  format: ImgFormat,
  quality: number,
  scale: ImgScale,
): number {
  if (mode === "strip") {
    return Math.max(256, meta.sizeBytes - meta.removableBytes);
  }
  const { w, h } = scaledDimensions(meta, mode, scale);
  const pixels = w * h;
  if (format === "png") {
    return Math.round(pixels * (meta.hasAlpha ? 2.4 : 1.9));
  }
  if (format === "webp") {
    if (quality >= 100) return Math.round(pixels * 1.15);
    const bpp = 0.03 + ((quality - 1) * (0.24 - 0.03)) / 98;
    return Math.round(pixels * bpp);
  }
  const bpp = 0.05 + ((quality - 1) * (0.35 - 0.05)) / 99;
  return Math.round(pixels * bpp);
}

/** Lista legible de los bloques de metadatos detectados en el archivo original. */
function detectedMetaSummary(m: ImageMetadata): string {
  const tags: string[] = [];
  if (m.hasExif) tags.push("EXIF");
  if (m.hasGps) tags.push("GPS");
  if (m.hasXmp) tags.push("XMP");
  if (m.hasIptc) tags.push("IPTC");
  if (m.hasComments) tags.push("Comentarios");
  if (!tags.length) {
    return m.removableBytes > 0 ? `Datos extra (${formatBytes(m.removableBytes)})` : "Ninguno (Limpia)";
  }
  return `${tags.join(" + ")} (${formatBytes(m.removableBytes)})`;
}

/* ───────────────────────── Glosario de imágenes ───────────────────────── */

type ImageGlossaryTab = "mode" | "format";

interface ModeGlossaryEntry {
  tagline: string;
  howItWorks: string;
  pixelsAndQuality: string;
  useWhen: string;
}

interface FormatGlossaryEntry {
  tagline: string;
  pros: string;
  alphaAndCompression: string;
  useWhen: string;
}

const MODE_GLOSSARY: Record<ImageMode, ModeGlossaryEntry> = {
  convert: {
    tagline: "Decodifica la imagen y genera un archivo nuevo en el formato, tamaño y calidad elegidos.",
    howItWorks:
      "Lee el mapa de píxeles, aplica el redimensionado Lanczos3 (si elegiste 75%, 50% o 25%) y vuelve a comprimir la imagen como PNG, JPG o WebP.",
    pixelsAndQuality:
      "Los píxeles se recodifican. Además, al crear un archivo nuevo desde cero, todos los metadatos ocultos (EXIF, GPS, XMP) se descartan automáticamente.",
    useWhen:
      "necesitas cambiar de formato (ej. PNG a WebP), reducir la resolución o comprimir el peso en MB para web o envío rápido.",
  },
  strip: {
    tagline: "Cirugía binaria: borra los bloques de datos privados sin tocar ni volver a comprimir los píxeles.",
    howItWorks:
      "Analiza la estructura interna del archivo (segmentos APP en JPG, chunks en PNG y RIFF en WebP) y filtra únicamente EXIF, coordenadas GPS, XMP, IPTC y comentarios.",
    pixelsAndQuality:
      "100 % idéntica al original bit a bit. No hay pérdida por generación (ni siquiera en JPG), conserva el perfil de color ICC y mantiene la orientación para que las fotos verticales no salgan giradas.",
    useWhen:
      "quieres compartir fotos originales protegiendo tu privacidad (ubicación GPS, serie de cámara, fecha) sin alterar su formato ni perder absolutamente nada de calidad.",
  },
};

const IMG_FORMAT_GLOSSARY: Record<ImgFormat, FormatGlossaryEntry> = {
  png: {
    tagline: "El estándar sin pérdida para gráficos nítidos y transparencias.",
    pros: "No introduce artefactos ni bordes borrosos en textos, capturas de pantalla, logotipos o ilustraciones.",
    alphaAndCompression: "Compresión sin pérdida (Lossless) · Soporta canal alfa completo (transparencia).",
    useWhen: "guardas capturas de pantalla, iconos, diseños con fondo transparente o imágenes que vas a seguir editando.",
  },
  jpg: {
    tagline: "El formato fotográfico más universal.",
    pros: "Se abre en cualquier dispositivo, cámara o programa existente y logra archivos pequeños en fotografías reales.",
    alphaAndCompression:
      "Compresión con pérdida ajustable (1–100%) · NO soporta transparencia (los fondos transparentes se aplanan a RGB).",
    useWhen: "compartes fotografías sin transparencia y necesitas compatibilidad total con cualquier plataforma.",
  },
  webp: {
    tagline: "El formato moderno todo-en-uno para web y almacenamiento eficiente.",
    pros: "Combina lo mejor de JPG y PNG: permite compresión con pérdida muy ligera (1–99%) o sin pérdida (100%) manteniendo la transparencia.",
    alphaAndCompression:
      "Con pérdida (1–99%) o Lossless (100%) · Soporta transparencia (canal alfa) en ambos modos.",
    useWhen: "buscas el menor peso posible con excelente calidad visual o necesitas transparencia ocupando mucho menos que un PNG.",
  },
};

function ModeGlossaryCard({ name, active, e }: { name: string; active: boolean; e: ModeGlossaryEntry }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-bold text-white">{name}</h4>
        {active && (
          <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">En uso</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-indigo-200">{e.tagline}</p>
      <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
        <div>
          <dt className="inline font-semibold text-slate-300">Cómo funciona: </dt>
          <dd className="inline text-slate-400">{e.howItWorks}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Píxeles y calidad: </dt>
          <dd className="inline text-slate-400">{e.pixelsAndQuality}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
          <dd className="inline text-slate-400">{e.useWhen}</dd>
        </div>
      </dl>
    </div>
  );
}

function FormatGlossaryCard({ name, active, e }: { name: string; active: boolean; e: FormatGlossaryEntry }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-bold text-white">{name}</h4>
        {active && (
          <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">En uso</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-indigo-200">{e.tagline}</p>
      <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
        <div>
          <dt className="inline font-semibold text-slate-300">Ventajas: </dt>
          <dd className="inline text-slate-400">{e.pros}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Compresión y transparencia: </dt>
          <dd className="inline text-slate-400">{e.alphaAndCompression}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
          <dd className="inline text-slate-400">{e.useWhen}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Panel lateral flotante con el glosario de imágenes (Modos + Diferencia clave y Formatos de salida). */
function ImageGlossaryDrawer({
  tab,
  onTab,
  onClose,
  mode,
  format,
}: {
  tab: ImageGlossaryTab | null;
  onTab: (t: ImageGlossaryTab) => void;
  onClose: () => void;
  mode: ImageMode;
  format: ImgFormat;
}) {
  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          key="img-glossary-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/45"
        />
      )}
      {tab && (
        <motion.aside
          key="img-glossary-drawer"
          role="dialog"
          aria-label="Glosario de imágenes"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1e293b] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Glosario de imágenes</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  Diferencias entre recodificar píxeles y limpiar metadatos, y guía de formatos.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar glosario"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 pt-4">
            <div className="relative inline-flex rounded-xl bg-[#23284f]/60 p-1">
              {(
                [
                  ["mode", "Modos y diferencias"],
                  ["format", "Formatos de salida"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTab(id)}
                  className="relative isolate rounded-lg px-4 py-1.5 text-sm font-semibold"
                >
                  {tab === id && (
                    <motion.span
                      layoutId="img-glossary-tab"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 -z-10 rounded-lg bg-[#0e1122] shadow-inner"
                    />
                  )}
                  <span className={tab === id ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-4">
            {tab === "mode" ? (
              <>
                {/* Cuadro comparativo directo entre ambos modos */}
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-600/10 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Diferencia clave entre ambos modos
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    Ambos entregan un archivo final <span className="font-semibold text-white">sin metadatos personales</span>, pero trabajan de forma opuesta:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      • <span className="font-semibold text-indigo-200">Convertir formato</span>{" "}
                      <span className="text-slate-400">
                        reprocesa y vuelve a comprimir los píxeles (permite cambiar formato, resolución y peso, pero recodifica la imagen).
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Quitar metadatos</span>{" "}
                      <span className="text-slate-400">
                        NO recodifica los píxeles: copia los datos visuales intactos byte por byte y solo recorta los bloques EXIF/GPS/XMP (0% pérdida de calidad y ultrarrápido).
                      </span>
                    </li>
                  </ul>
                </div>

                {MODES.map((m) => (
                  <ModeGlossaryCard key={m} name={MODE_LABEL[m]} active={m === mode} e={MODE_GLOSSARY[m]} />
                ))}
              </>
            ) : (
              FORMATS.map((f) => (
                <FormatGlossaryCard
                  key={f}
                  name={FORMAT_LABEL[f]}
                  active={mode === "convert" && f === format}
                  e={IMG_FORMAT_GLOSSARY[f]}
                />
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────── Columna 3: Inspección de imagen ───────────────── */

function ImageInspectionPanel({ ic }: { ic: ImageConverter }) {
  const sel = ic.selected;
  const meta = sel?.meta ?? null;
  const strip = ic.mode === "strip";
  const doneItem = sel ? ic.results?.find((r) => r.source === sel.path && r.ok) ?? null : null;

  const state = !sel
    ? "empty"
    : sel.metaState === "loading"
      ? "loading"
      : sel.metaState === "error"
        ? "error"
        : meta
          ? "ready"
          : "empty";

  let body: React.ReactNode = null;

  if (state === "empty") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-indigo-600/10 p-4 text-indigo-300/70">
          <ImageIcon size={28} />
        </div>
        <p className="max-w-[260px] text-sm text-slate-500">
          Añade imágenes para ver sus propiedades, metadatos y cómo quedarán al procesarlas.
        </p>
      </div>
    );
  } else if (state === "loading") {
    body = (
      <div className="space-y-4 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-2.5 w-20 rounded bg-[#23284f]" />
            <div className="h-4 w-full rounded bg-[#23284f]/70" />
          </div>
        ))}
      </div>
    );
  } else if (state === "error") {
    body = <Notice tone="error">{sel?.metaError}</Notice>;
  } else if (meta && sel) {
    const aspect = detectAspect(meta.width, meta.height);
    const { w: outW, h: outH } = scaledDimensions(meta, ic.mode, ic.scale);
    const estBytes = estimateImageSize(meta, ic.mode, ic.format, ic.quality, ic.scale);
    const finalBytes = doneItem?.sizeBytes ?? estBytes;
    const diff = meta.sizeBytes ? (finalBytes / meta.sizeBytes - 1) * 100 : null;
    const metaSummary = detectedMetaSummary(meta);
    const hasAnyRemovable = meta.hasExif || meta.hasGps || meta.hasXmp || meta.hasIptc || meta.hasComments || meta.removableBytes > 0;

    if (strip) {
      // Vista dedicada para el modo "Quitar metadatos": muestra exactamente qué tiene el original y qué se va a quitar
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida limpia" : "Qué se hará"}</span>
          </div>

          <Row
            label="Formato y resolución"
            from={`${meta.format} · ${meta.width}×${meta.height}`}
            to={`${meta.format} · ${meta.width}×${meta.height} (Intactos)`}
          />
          <Row
            label="Cámara / EXIF"
            from={meta.hasExif ? "Detectado (Cámara / Fecha)" : "No contiene"}
            to={meta.hasExif ? "Se eliminará (salvo orientación)" : "Limpio"}
          />
          <Row
            label="Ubicación GPS"
            from={meta.hasGps ? "Detectada (Coordenadas)" : "No contiene"}
            to={meta.hasGps ? "Se eliminará por completo" : "Limpio"}
          />
          <Row
            label="XMP / IPTC / Comentarios"
            from={
              meta.hasXmp || meta.hasIptc || meta.hasComments
                ? [meta.hasXmp ? "XMP" : null, meta.hasIptc ? "IPTC" : null, meta.hasComments ? "Comentarios" : null]
                    .filter(Boolean)
                    .join(" + ")
                : "No contiene"
            }
            to={meta.hasXmp || meta.hasIptc || meta.hasComments ? "Se eliminarán" : "Limpio"}
          />
          <Row
            label="Perfil de color (ICC)"
            from={meta.hasIcc ? "Incrustado" : "Estándar (sRGB)"}
            to={meta.hasIcc ? "Conservado (colores fieles)" : "Estándar (sRGB)"}
          />
          <Row
            label="Peso de metadatos"
            from={hasAnyRemovable ? formatBytes(meta.removableBytes) : "0 B"}
            to="0 B (Eliminados)"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(estBytes)}`}
          />

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={hasAnyRemovable ? "text-indigo-300" : "text-emerald-300"} />
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Diagnóstico de privacidad</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {hasAnyRemovable ? `Metadatos detectados: ${metaSummary}` : "Esta imagen ya está limpia de metadatos"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Limpieza binaria sin recodificar: conserva el 100 % de la calidad original de los píxeles.
            </p>
          </div>
        </div>
      );
    } else {
      const outFormat = ic.format.toUpperCase();
      const outAlpha =
        ic.format === "jpg" ? "Se aplanará (RGB)" : meta.hasAlpha ? "Conservada" : "No (Opaco)";
      const outColor = ic.format === "jpg" ? "Rgb8" : meta.hasAlpha ? "Rgba8" : "Rgb8";

      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida final" : "Salida estimada"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={outFormat} />
          <Row
            label="Resolución"
            from={`${meta.width} × ${meta.height} px`}
            to={`${outW} × ${outH} px${ic.scale !== "100" ? ` (${ic.scale}%)` : ""}`}
          />
          <Row label="Relación de aspecto" from={aspect.label} to={aspect.label} />
          <Row label="Transparencia" from={meta.hasAlpha ? "Sí (Canal alfa)" : "No (Opaco)"} to={outAlpha} />
          <Row label="Espacio de color" from={meta.colorType} to={outColor} />
          <Row
            label="Metadatos detectados"
            from={hasAnyRemovable ? `Sí (${metaSummary})` : "Ninguno"}
            to="Descartados al convertir"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(estBytes)}`}
          />

          {diff !== null && (
            <p className={`text-sm font-medium ${diff <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
              {doneItem ? "" : "≈ "}
              {diff <= 0 ? "−" : "+"}
              {Math.abs(diff).toFixed(0)} % respecto al original
            </p>
          )}

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Compresión y escalado</p>
            <p className="mt-1 text-base font-semibold text-slate-100">
              {ic.format === "png"
                ? "Sin pérdida (PNG Lossless)"
                : ic.format === "webp"
                  ? ic.quality >= 100
                    ? "Sin pérdida (WebP Lossless 100%)"
                    : `WebP Calidad ${ic.quality}%`
                  : `JPG Calidad ${ic.quality}%`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {ic.scale !== "100"
                ? `Redimensionado al ${ic.scale}% (${outW}×${outH} px) con filtro Lanczos3`
                : ic.format === "png" || (ic.format === "webp" && ic.quality >= 100)
                  ? "Conserva el 100 % de la fidelidad visual"
                  : "Compresión ajustable para reducir el peso en disco"}
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Estimación orientativa: el peso real varía según el detalle y colores de la imagen.
          </p>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <ImageIcon size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">Inspección de imagen</h3>
      </div>
      {sel && (
        <p className="truncate text-xs text-slate-500" title={sel.path}>
          {splitPath(sel.path).file}
        </p>
      )}
      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state}-${sel?.id ?? ""}-${ic.mode}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="flex flex-1 flex-col"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ───────────────── Pestaña de imagen (3 columnas) ───────────────── */

export function ImageTab({ ic }: { ic: ImageConverter }) {
  const hover = useTauriDrop(ic.addFiles);
  const running = ic.status === "running";
  const strip = ic.mode === "strip";
  const n = ic.items.length;
  const isBatch = n > 1;
  const handleSelect = useCallback((id: string) => ic.select(id), [ic.select]);
  const handleRemove = useCallback((id: string) => ic.removeFile(id), [ic.removeFile]);
  const resultsMap = useMemo(() => {
    if (!ic.results) return null;
    const m = new Map<string, (typeof ic.results)[number]>();
    for (const r of ic.results) m.set(r.source, r);
    return m;
  }, [ic.results]);

  // Estado local del glosario de imágenes ("mode" | "format" | null)
  const [glossary, setGlossary] = useState<ImageGlossaryTab | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  const handleOpenPreview = useCallback((it: ImageQueueItem) => {
    const res = resultsMap?.get(it.path);
    setPreviewTarget({
      type: "image",
      title: splitPath(it.path).file,
      originalPath: it.path,
      outputPath: res?.ok ? res.dest : null,
      originalSize: it.meta?.sizeBytes ?? undefined,
      outputSize: res?.sizeBytes ?? undefined,
    });
  }, [resultsMap]);

  // Cerrar el glosario con la tecla Esc
  useEffect(() => {
    if (!glossary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossary(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossary]);

  // Individual: sin evento de progreso → barra indeterminada. Lote: done/total.
  const pct =
    ic.status === "done"
      ? 100
      : isBatch
        ? ic.progress
          ? (ic.progress.done / Math.max(ic.progress.total, 1)) * 100
          : 0
        : null;

  const okCount = ic.results?.filter((r) => r.ok).length ?? 0;
  const failed = ic.results?.filter((r) => !r.ok) ?? [];
  const firstOk = ic.results?.find((r) => r.ok);

  const startLabel = running
    ? strip
      ? "Limpiando…"
      : "Convirtiendo…"
    : strip
      ? isBatch
        ? `Quitar metadatos (${n})`
        : "Quitar metadatos"
      : isBatch
        ? `Convertir lote (${n})`
        : "Convertir imagen";

  const selMeta = ic.selected?.meta ?? null;
  const scaledPreview = selMeta ? scaledDimensions(selMeta, ic.mode, ic.scale) : null;

  // Oculta la etiqueta interna de <Segmented> cuando usamos <LabelWithHelp> encima
  const noInternalLabel = "[&>div>span:first-child]:hidden";

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* ───── Columna 1: Imágenes de origen ───── */}
      <Card data-drop-zone="true" className="flex flex-col gap-5">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Step n={1}>Imágenes de origen</Step>
            {n > 0 && (
              <div className="flex items-center gap-2">
                <motion.span
                  key={isBatch ? "batch" : "single"}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-full border border-indigo-500/30 bg-indigo-600/15 px-3 py-1 text-xs font-medium text-indigo-200"
                >
                  {isBatch ? `Lote · ${n} archivos` : "Individual"}
                </motion.span>
                <button
                  type="button"
                  disabled={running}
                  onClick={ic.pick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/15 disabled:opacity-40"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            )}
          </div>

          {n > 0 && (
            <p className="text-xs text-slate-500">
              Haz clic en una imagen para inspeccionar <span className="text-slate-300">sus dimensiones y metadatos</span>. El lote se procesa en paralelo.
            </p>
          )}

          {/* Selector de carpeta de salida (homologado con VideoTab) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Carpeta de salida</span>
              {n > 1 && <span className="text-[11px] text-indigo-300/80">para todo el lote</span>}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 text-sm text-slate-300"
                title={ic.outputDir ?? undefined}
              >
                {ic.outputDir ?? <span className="text-slate-500">Misma carpeta que el origen</span>}
              </div>
              <button
                type="button"
                disabled={running}
                onClick={ic.pickOutputDir}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#23284f]/70 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen size={15} /> Examinar
              </button>
              {ic.outputDir && (
                <button
                  type="button"
                  disabled={running}
                  onClick={ic.clearOutputDir}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                  aria-label="Volver a la carpeta del origen"
                  title="Volver a la carpeta del origen"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {n === 0 ? (
            <div className="flex flex-1 flex-col [&>*]:flex-1">
              <DropZone
                hover={hover}
                disabled={running}
                onBrowse={ic.pick}
                icon={<UploadCloud size={28} />}
                title="Arrastra imágenes aquí o haz clic para elegirlas"
                subtitle="Una sola o varias a la vez · PNG, JPG, WebP"
              />
            </div>
          ) : (
            <div
              className={`min-h-[200px] flex-1 rounded-2xl border-2 border-dashed p-2 transition-colors ${
                hover ? "border-indigo-500 bg-indigo-600/10" : "border-transparent"
              }`}
            >
              {hover && <p className="pb-2 text-center text-xs text-indigo-300">Suelta aquí para añadirlas</p>}
              <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {ic.items.map((it: ImageQueueItem) => (
                    <ImageQueueRow
                      key={it.id}
                      it={it}
                      isSelected={ic.selected?.id === it.id}
                      resItem={resultsMap?.get(it.path)}
                      locked={running}
                      onSelect={handleSelect}
                      onRemove={handleRemove}
                      onPreview={handleOpenPreview}
                    />
                  ))}
                  {false && ([] as any[]).map((it: any) => {
                    const f = splitPath(it.path);
                    const isSelected = ic.selected?.id === it.id;
                    const resItem = ic.results?.find((r) => r.source === it.path);
                    const realDiff =
                      resItem?.ok && resItem.sizeBytes && it.meta?.sizeBytes
                        ? (resItem.sizeBytes / it.meta.sizeBytes - 1) * 100
                        : null;

                    const sub =
                      it.metaState === "loading"
                        ? "Leyendo propiedades…"
                        : it.metaState === "error"
                          ? it.metaError ?? "No se pudo leer el archivo"
                          : it.meta
                            ? `${it.meta.width}×${it.meta.height} · ${formatBytes(it.meta.sizeBytes)}`
                            : f.dir || "—";

                    return (
                      <motion.li
                        key={it.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        onClick={() => ic.select(it.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                          isSelected
                            ? "border-indigo-500/60 bg-indigo-600/10"
                            : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
                        }`}
                      >
                        <ImageThumb path={it.path} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
                            {f.file}
                          </p>
                          <p className={`truncate text-xs ${it.metaState === "error" ? "text-red-300" : "text-slate-500"}`}>
                            {sub}
                          </p>
                          {resItem?.ok && resItem.sizeBytes != null && (
                            <p className="truncate text-xs font-medium text-emerald-300">
                              ✓ Salida real: {formatBytes(resItem.sizeBytes)}
                              {realDiff !== null && ` (${realDiff <= 0 ? "−" : "+"}${Math.abs(realDiff).toFixed(0)}%)`}
                            </p>
                          )}
                        </div>
                        {resItem?.ok && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              revealItemInDir(resItem.dest).catch(() => {});
                            }}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
                            aria-label="Mostrar en carpeta"
                            title="Mostrar en carpeta"
                          >
                            <FolderOpen size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={running}
                          onClick={(e) => {
                            e.stopPropagation();
                            ic.removeFile(it.id);
                          }}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                          aria-label="Quitar"
                        >
                          <X size={14} />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </section>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3">
          <GradientButton onClick={ic.start} disabled={n === 0} loading={running}>
            {startLabel}
          </GradientButton>
          <SecondaryButton onClick={ic.clear} disabled={running || (n === 0 && ic.status === "idle")}>
            Limpiar
          </SecondaryButton>
        </div>

        {/* Progreso */}
        <AnimatePresence>
          {ic.status !== "idle" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="space-y-4 border-t border-[#1e293b] pt-5"
            >
              <span className="text-sm font-medium text-slate-200">
                {running
                  ? strip
                    ? "Limpiando…"
                    : "Convirtiendo…"
                  : ic.status === "done"
                    ? strip
                      ? "Limpieza completada"
                      : "Conversión completada"
                    : "Operación fallida"}
              </span>

              {ic.status !== "error" && <ProgressBar value={pct} />}

              {isBatch && ic.status !== "error" && (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Completadas" value={`${ic.progress?.done ?? 0} / ${ic.progress?.total ?? n}`} />
                  <Stat label="Progreso" value={`${(pct ?? 0).toFixed(0)}%`} />
                </div>
              )}

              {ic.status === "error" && <Notice tone="error">{ic.error}</Notice>}

              {ic.status === "done" && (
                <>
                  <Notice tone={failed.length ? "warn" : "ok"}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {okCount} {strip ? "limpiada" : "convertida"}
                        {okCount === 1 ? "" : "s"}
                        {failed.length > 0 && ` · ${failed.length} con error`}
                      </span>
                      {firstOk && (
                        <button
                          type="button"
                          onClick={() => revealItemInDir(firstOk.dest).catch(() => {})}
                          className="inline-flex items-center gap-2 rounded-lg border border-current/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                        >
                          <FolderOpen size={14} /> Mostrar en carpeta
                        </button>
                      )}
                    </div>
                  </Notice>
                  {failed.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-300">
                      {failed.map((r) => (
                        <li key={r.source} className="rounded-lg bg-red-500/10 px-3 py-2">
                          <span className="font-medium">{splitPath(r.source).file}</span>: {r.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ───── Columna 2: Opciones de salida ───── */}
      <Card className="flex flex-col gap-5 min-h-[460px]">
        <div className="flex items-center justify-between gap-3">
          <Step n={2}>
            Opciones de salida{ic.mode === "convert" ? (ic.isIndividual ? " · por imagen" : " · para todas") : ""}
          </Step>
          <button
            type="button"
            onClick={() => setGlossary((g) => (g ? null : "mode"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#23284f]/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-[#23284f]/80"
          >
            <BookOpen size={14} /> Glosario
          </button>
        </div>

        {/* Aclara a qué imagen pertenecen estas opciones (mismo estilo armonioso que VideoTab) */}
        {ic.mode === "convert" && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              {ic.selected
                ? ic.isIndividual
                  ? "Configurando solo esta imagen"
                  : "Configuración para todas las imágenes"
                : "Ninguna imagen seleccionada"}
            </p>
            {ic.selected && (
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={ic.selected.path}>
                {splitPath(ic.selected.path).file}
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {ic.selected
                ? ic.isIndividual
                  ? "Cada imagen tiene sus propias opciones: selecciona otra en la lista para configurarla por separado."
                  : "Las opciones de salida se aplicarán a todas las imágenes de la cola."
                : "Añade una imagen para configurar sus opciones."}
            </p>
            {ic.selected && (
              <div className="mt-2.5">
                {!ic.isIndividual ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => ic.setIsIndividual(true)}
                    title="Permite configurar formato, escala y calidad individual para cada imagen"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Configuración individual
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={running}
                    onClick={ic.applyToAll}
                    title="Aplica estas opciones a todas las imágenes"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar estas opciones a todas las imágenes
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <LabelWithHelp
            label="Modo"
            active={glossary === "mode"}
            onHelp={() => setGlossary((g) => (g === "mode" ? null : "mode"))}
          />
          <div className={noInternalLabel}>
            <Segmented label="" value={ic.mode} options={MODES} labels={MODE_LABEL} onChange={ic.setMode} disabled={running} />
          </div>
        </div>

        {!strip && (
          <>
            <div>
              <LabelWithHelp
                label="Formato de salida"
                active={glossary === "format"}
                onHelp={() => setGlossary((g) => (g === "format" ? null : "format"))}
              />
              <div className={noInternalLabel}>
                <Segmented label="" value={ic.format} options={FORMATS} labels={FORMAT_LABEL} onChange={ic.setFormat} disabled={running} />
              </div>
            </div>

            {/* Redimensionado / Escala con Lanczos3 */}
            <div className="[&_button]:px-4 [&_button]:py-1.5 [&_button]:text-sm">
              <Segmented
                label="Escala / Resolución (Lanczos3)"
                value={ic.scale}
                options={SCALES}
                labels={SCALE_LABEL}
                onChange={ic.setScale}
                disabled={running}
              />
              {selMeta && scaledPreview && (
                <p className="mt-2 text-xs text-slate-500">
                  Imagen seleccionada:{" "}
                  <span className="font-mono text-slate-300">
                    {selMeta.width}×{selMeta.height} px
                  </span>{" "}
                  → Salida:{" "}
                  <span className="font-mono text-indigo-300">
                    {scaledPreview.w}×{scaledPreview.h} px
                  </span>
                </p>
              )}
            </div>

            {/* Slider de calidad tanto para JPG como para WebP */}
            <AnimatePresence initial={false}>
              {(ic.format === "jpg" || ic.format === "webp") && (
                <motion.div
                  key="quality"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Calidad {ic.format.toUpperCase()}
                    </span>
                    <span className="font-mono text-sm text-indigo-300">
                      {ic.format === "webp" && ic.quality === 100 ? "100% (Lossless)" : `${ic.quality}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={ic.quality}
                    disabled={running}
                    onChange={(e) => ic.setQuality(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-indigo-500 disabled:cursor-not-allowed"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>Menor tamaño</span>
                    <span>{ic.format === "webp" ? "100% = Sin pérdida" : "Mayor calidad"}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-xs text-slate-500">
              Al convertir de formato, los metadatos personales (EXIF/GPS/XMP) se descartan automáticamente.
            </p>
          </>
        )}
      </Card>

      {/* ───── Columna 3: Inspección de imagen ───── */}
      <ImageInspectionPanel ic={ic} />

      {/* Glosario de imágenes (panel lateral flotante) */}
      <ImageGlossaryDrawer
        tab={glossary}
        onTab={setGlossary}
        onClose={() => setGlossary(null)}
        mode={ic.mode}
        format={ic.format}
      />

      {/* Modal interactivo de Vista Previa y Comparación */}
      {previewTarget && (
        <PreviewModal
          target={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
``

## src/components/NativeUpdateBanner.tsx

``tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Sparkles, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "../lib/nativeUpdater";
import { installNativeUpdate } from "../lib/nativeUpdater";

interface NativeUpdateBannerProps {
  status: UpdateStatus;
  onDismiss: () => void;
}

export function NativeUpdateBanner({ status, onDismiss }: NativeUpdateBannerProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleInstall = async () => {
    if (!status.rawUpdate || installing) return;
    setInstalling(true);
    setErrorMsg(null);
    setProgress(0);

    try {
      await installNativeUpdate(status.rawUpdate, (pct) => {
        setProgress(pct);
      });
    } catch (err: unknown) {
      console.error("Error al actualizar:", err);
      setInstalling(false);
      setProgress(null);
      setErrorMsg("Ocurrió un error al descargar e instalar el parche.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="mb-4 overflow-hidden rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/90 via-[#131a2a]/95 to-indigo-950/90 p-4 shadow-xl backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  ¡Nueva versión disponible! (v{status.version})
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Instalación automática
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {installing
                  ? progress !== null && progress < 100
                    ? `Descargando e instalando parche… (${progress}%)`
                    : "Reiniciando la aplicación…"
                  : "Se actualizará y reiniciará el programa automáticamente sin salir de la app."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status.body && !installing && (
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <span>Novedades</span>
                {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}

            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-indigo-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>{progress !== null ? `${progress}%` : "Instalando…"}</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Actualizar y reiniciar</span>
                </>
              )}
            </button>

            {!installing && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Cerrar aviso"
                className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de progreso visual si está instalando */}
        {installing && progress !== null && (
          <div className="mt-3 overflow-hidden rounded-full bg-slate-800/80 p-0.5">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Mensaje de error si falla */}
        {errorMsg && (
          <p className="mt-2 text-xs text-rose-400">{errorMsg}</p>
        )}

        {/* Notas de la versión desplegables */}
        {showNotes && status.body && !installing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300"
          >
            <p className="mb-1 font-semibold text-indigo-300">Notas de la versión:</p>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">
              {status.body}
            </pre>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

``

## src/components/PreviewModal.tsx

``tsx
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
  Film,
  Image as ImageIcon,
} from "lucide-react";

export type PreviewTarget =
  | {
      type: "image";
      title: string;
      originalPath: string;
      outputPath?: string | null;
      originalSize?: number;
      outputSize?: number;
    }
  | {
      type: "video";
      title: string;
      originalPath: string;
      outputPath?: string | null;
      originalSize?: number;
      outputSize?: number;
    };

interface PreviewModalProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

function formatBytes(n?: number | null) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function PreviewModal({ target, onClose }: PreviewModalProps) {
  // Estado para el comparador de imágenes (porcentaje de la barra deslizante 0-100)
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Estado para el reproductor de video
  const [activeVideoTab, setActiveVideoTab] = useState<"original" | "output">("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Resetear estados al cambiar de target
  useEffect(() => {
    if (target) {
      setSliderPos(50);
      setActiveVideoTab(target.outputPath ? "output" : "original");
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [target]);

  // Manejador del arrastre para la barra comparadora
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };

  if (!target) return null;

  const hasOutput = Boolean(target.outputPath);
  const currentVideoSrc =
    target.type === "video"
      ? convertFileSrc(activeVideoTab === "output" && target.outputPath ? target.outputPath : target.originalPath)
      : "";

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* Fondo oscuro con desenfoque */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Ventana modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative z-10 flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0f1424]/95 shadow-2xl shadow-black/80 backdrop-blur-xl"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
                {target.type === "video" ? <Film size={18} /> : <ImageIcon size={18} />}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-white" title={target.title}>
                  {target.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Original: {formatBytes(target.originalSize)}</span>
                  {hasOutput && target.outputSize && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-emerald-400">
                        Convertido: {formatBytes(target.outputSize)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Pestañas de video si hay resultado */}
              {target.type === "video" && hasOutput && (
                <div className="mr-2 flex rounded-xl bg-[#1e293b]/70 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("original")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      activeVideoTab === "original"
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("output")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      activeVideoTab === "output"
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Convertido
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar vista previa"
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Área visual central */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#070a13] p-4">
            {target.type === "image" ? (
              hasOutput ? (
                /* COMPARADOR ANTES VS DESPUÉS (SPLIT SLIDER) */
                <div
                  className="relative h-full w-full select-none overflow-hidden rounded-2xl touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setIsDragging(false)}
                  onPointerLeave={() => setIsDragging(false)}
                >
                  {/* Capa de fondo: Imagen de SALIDA (Convertida) */}
                  <img
                    src={convertFileSrc(target.outputPath!)}
                    alt="Salida"
                    className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                  />
                  <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-emerald-300 backdrop-blur-md">
                    Convertida ({formatBytes(target.outputSize)})
                  </div>

                  {/* Capa superior recortada: Imagen ORIGINAL */}
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                  >
                    <img
                      src={convertFileSrc(target.originalPath)}
                      alt="Original"
                      className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                    />
                    <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-indigo-300 backdrop-blur-md">
                      Original ({formatBytes(target.originalSize)})
                    </div>
                  </div>

                  {/* Línea divisoria vertical */}
                  <div
                    className="absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                    style={{ left: `${sliderPos}%` }}
                  >
                    <div className="absolute top-1/2 -ml-3.5 -mt-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-indigo-600 text-white shadow-xl cursor-ew-resize">
                      <Sliders size={13} className="rotate-90" />
                    </div>
                  </div>

                  {/* Indicación inferior */}
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur-md">
                    ← Desliza para comparar calidad →
                  </div>
                </div>
              ) : (
                /* IMAGEN INDIVIDUAL (Aún no convertida) */
                <div className="relative flex h-full w-full items-center justify-center">
                  <img
                    src={convertFileSrc(target.originalPath)}
                    alt={target.title}
                    className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                  />
                  <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-slate-300 backdrop-blur-md">
                    Vista previa original
                  </div>
                </div>
              )
            ) : (
              /* REPRODUCTOR DE VIDEO */
              <div className="relative flex h-full w-full flex-col items-center justify-center">
                <video
                  ref={videoRef}
                  key={currentVideoSrc}
                  src={currentVideoSrc}
                  muted={isMuted}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setDuration(videoRef.current.duration);
                  }}
                  onEnded={() => setIsPlaying(false)}
                  onClick={() => {
                    if (!videoRef.current) return;
                    if (isPlaying) videoRef.current.pause();
                    else videoRef.current.play();
                    setIsPlaying(!isPlaying);
                  }}
                  className="max-h-[65vh] w-full rounded-2xl object-contain cursor-pointer"
                />

                {/* Controles de reproducción flotantes */}
                <div className="mt-3 flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-[#131a2a]/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      if (!videoRef.current) return;
                      if (isPlaying) videoRef.current.pause();
                      else videoRef.current.play();
                      setIsPlaying(!isPlaying);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500"
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                  </button>

                  {/* Barra de tiempo */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500 outline-none"
                  />

                  {/* Tiempo transcurrido */}
                  <span className="font-mono text-xs text-slate-400">
                    {Math.floor(currentTime / 60)}:
                    {Math.floor(currentTime % 60)
                      .toString()
                      .padStart(2, "0")}{" "}
                    / {Math.floor(duration / 60)}:
                    {Math.floor(duration % 60)
                      .toString()
                      .padStart(2, "0")}
                  </span>

                  {/* Mute */}
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:text-white"
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}
``

## src/components/SettingsModal.tsx

``tsx
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Cpu,
  Download,
  FileSignature,
  Files,
  FolderOpen,
  History,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  type AppSettings,
  type PostAction,
  type ThreadMode,
} from "../hooks/useAppSettings";
import { playCompletionChime } from "../lib/utils";
import { CURRENT_VERSION } from "../lib/updater";
import {
  checkForNativeUpdate,
  installNativeUpdate,
  type UpdateStatus,
} from "../lib/nativeUpdater";

interface ThumbCacheInfo {
  count: number;
  sizeBytes: number;
}

function formatBytes(n: number) {
  if (n === 0) return "0 KB";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/* ───────────── Utilidades de conversión RGB <-> HSL <-> HEX ligeras ───────────── */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [99, 102, 241];
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${((1 << 24) | (cr << 16) | (cg << 8) | cb).toString(16).slice(1)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const POST_ACTIONS: { id: PostAction; label: string }[] = [
  { id: "none", label: "Nada" },
  { id: "sound", label: "Sonido" },
  { id: "open_folder", label: "Abrir carpeta" },
  { id: "both", label: "Ambos" },
];

const THREAD_OPTIONS: { id: ThreadMode; label: string; hint: string }[] = [
  { id: "auto", label: "Máximo (100%)", hint: "Usa todos los hilos del CPU" },
  { id: "half", label: "Equilibrado (50%)", hint: "Mitad de núcleos libres" },
  { id: "two", label: "Silencioso (2 hilos)", hint: "Mínimo consumo en 2.º plano" },
];

export function SettingsModal({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
}) {
  const [cacheInfo, setCacheInfo] = useState<ThumbCacheInfo | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [showCustomRgb, setShowCustomRgb] = useState(false);

  // Estado del comprobador de actualizaciones
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<UpdateStatus | null>(null);
  const [manualChecked, setManualChecked] = useState(false);
  const [installingNative, setInstallingNative] = useState(false);
  const [installProgress, setInstallProgress] = useState<number | null>(null);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    setManualChecked(false);
    setNativeStatus(null);
    try {
      const status = await checkForNativeUpdate();
      setNativeStatus(status);
      setManualChecked(true);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTriggerNativeInstall = async () => {
    if (!nativeStatus?.rawUpdate || installingNative) return;
    setInstallingNative(true);
    try {
      await installNativeUpdate(nativeStatus.rawUpdate, (pct) => {
        setInstallProgress(pct);
      });
    } catch {
      setInstallingNative(false);
      setInstallProgress(null);
    }
  };

  // Estado local aislado para el selector RGB: mueve la barra arcoíris a 144 FPS sin recalcular el DOM global hasta soltar
  const [rgb, setRgb] = useState<[number, number, number]>(() => hexToRgb(settings.accentHex));
  const [hsl, setHsl] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(settings.accentHex);
    return rgbToHsl(r, g, b);
  });

  useEffect(() => {
    const nextRgb = hexToRgb(settings.accentHex);
    setRgb(nextRgb);
    setHsl(rgbToHsl(nextRgb[0], nextRgb[1], nextRgb[2]));
  }, [settings.accentHex]);

  const previewHex = rgbToHex(rgb[0], rgb[1], rgb[2]);

  const handleHueSlide = (newHue: number) => {
    const s = Math.max(hsl[1], 65);
    const l = Math.min(Math.max(hsl[2], 45), 62);
    const nextRgb = hslToRgb(newHue, s, l);
    setHsl([newHue, s, l]);
    setRgb(nextRgb);
  };

  const handleLightnessSlide = (newL: number) => {
    const nextRgb = hslToRgb(hsl[0], Math.max(hsl[1], 60), newL);
    setHsl([hsl[0], Math.max(hsl[1], 60), newL]);
    setRgb(nextRgb);
  };

  const handleRgbChannel = (idx: 0 | 1 | 2, val: number) => {
    const clamped = Math.max(0, Math.min(255, Number.isFinite(val) ? Math.round(val) : 0));
    const next: [number, number, number] = [...rgb] as [number, number, number];
    next[idx] = clamped;
    setRgb(next);
    setHsl(rgbToHsl(next[0], next[1], next[2]));
    settings.setAccentHex(rgbToHex(next[0], next[1], next[2]));
  };

  const commitPreviewColor = () => {
    settings.setAccentHex(previewHex);
  };

  const loadCacheInfo = useCallback(() => {
    invoke<ThumbCacheInfo>("get_thumb_cache_info")
      .then(setCacheInfo)
      .catch(() => setCacheInfo({ count: 0, sizeBytes: 0 }));
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCacheInfo();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, loadCacheInfo]);

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const info = await invoke<ThumbCacheInfo>("clear_thumb_cache");
      setCacheInfo(info);
    } finally {
      setClearingCache(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/55"
        />
      )}
      {open && (
        <motion.aside
          key="settings-drawer"
          role="dialog"
          aria-label="Ajustes del programa"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(510px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
        >
          {/* Encabezado */}
          <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <Settings size={18} />
              </div>
              <h3 className="text-base font-bold text-white">Ajustes del programa</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ajustes"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          {/* Contenido desplazable */}
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* 1. Color de la interfaz */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Palette size={16} className="text-indigo-400" />
                <span>Color de la interfaz</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((p) => {
                  const active = settings.accentHex.toLowerCase() === p.hex.toLowerCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => settings.setAccentHex(p.hex)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-600/20 text-white"
                          : "border-[#23284f] bg-[#0e1122] text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className="h-3.5 w-3.5 rounded-full shadow-sm" style={{ backgroundColor: p.hex }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-[#23284f] bg-[#0e1122]/90 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 shrink-0 rounded-lg border border-white/20 shadow-inner"
                      style={{ backgroundColor: previewHex }}
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Personalizado</p>
                      <p className="font-mono text-[11px] uppercase text-indigo-300">{previewHex}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomRgb((v) => !v)}
                    className="rounded-lg border border-indigo-500/40 bg-indigo-600/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/25"
                  >
                    {showCustomRgb ? "Ocultar" : "Personalizar RGB"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showCustomRgb && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3.5 space-y-3 border-t border-[#1e293b] pt-3">
                        {/* Barra arcoíris de Tono */}
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                            <span>Tono</span>
                            <span className="font-mono text-slate-300">{hsl[0]}°</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={hsl[0]}
                            onChange={(e) => handleHueSlide(Number(e.target.value))}
                            onPointerUp={commitPreviewColor}
                            onKeyUp={commitPreviewColor}
                            style={{
                              background:
                                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                            }}
                            className="h-3 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow-md"
                          />
                        </div>

                        {/* Barra de Brillo */}
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                            <span>Brillo</span>
                            <span className="font-mono text-slate-300">{hsl[2]}%</span>
                          </div>
                          <input
                            type="range"
                            min={25}
                            max={75}
                            value={hsl[2]}
                            onChange={(e) => handleLightnessSlide(Number(e.target.value))}
                            onPointerUp={commitPreviewColor}
                            onKeyUp={commitPreviewColor}
                            style={{
                              background: `linear-gradient(to right, #0f172a, hsl(${hsl[0]}, 85%, 55%), #e2e8f0)`,
                            }}
                            className="h-2.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow-md"
                          />
                        </div>

                        {/* Cajas numéricas R, G, B */}
                        <div className="grid grid-cols-3 gap-2.5 pt-1">
                          {(
                            [
                              [0, "Rojo"],
                              [1, "Verde"],
                              [2, "Azul"],
                            ] as const
                          ).map(([idx, label]) => (
                            <div key={label}>
                              <label className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {label}
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={3}
                                value={rgb[idx]}
                                onKeyDown={(e) => {
                                  if (
                                    !/[0-9]/.test(e.key) &&
                                    !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                                    !e.ctrlKey &&
                                    !e.metaKey
                                  ) {
                                    e.preventDefault();
                                  }
                                }}
                                onChange={(e) => {
                                  const clean = e.target.value.replace(/\D/g, "");
                                  let num = clean === "" ? 0 : parseInt(clean, 10);
                                  if (isNaN(num)) num = 0;
                                  if (num > 255) num = 255;
                                  e.target.value = String(num);
                                  handleRgbChannel(idx, num);
                                }}
                                className="w-full rounded-lg border border-[#23284f] bg-[#131a2a] py-1.5 text-center font-mono text-xs text-white outline-none focus:border-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* 2. Carpeta de salida predeterminada */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FolderOpen size={16} className="text-indigo-400" />
                <span>Carpeta de salida predeterminada</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div
                  className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-2 text-xs text-slate-200"
                  title={settings.defaultOutputDir ?? undefined}
                >
                  {settings.defaultOutputDir ?? (
                    <span className="text-slate-500">Misma carpeta que el archivo original</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={settings.pickDefaultOutputDir}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#23284f]/80 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#2c3262]"
                >
                  <FolderOpen size={14} /> Elegir
                </button>
                {settings.defaultOutputDir && (
                  <button
                    type="button"
                    onClick={() => settings.setDefaultOutputDir(null)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
                    aria-label="Restaurar a carpeta de origen"
                    title="Restaurar a carpeta de origen"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </section>

            {/* 3. Recordar última configuración */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <History size={16} className="text-indigo-400" />
                  <span>Recordar opciones de conversión</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.rememberLastSettings}
                  onClick={() => settings.setRememberLastSettings(!settings.rememberLastSettings)}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    settings.rememberLastSettings ? "justify-end bg-indigo-500" : "justify-start bg-slate-600/60"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="h-5 w-5 rounded-full bg-white shadow"
                  />
                </button>
              </div>

              {settings.rememberLastSettings && (
                settings.lastVideo || settings.lastImage || settings.lastDoc ? (
                  <div className="mt-3 space-y-1.5 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2 text-[11px] text-slate-400">
                    {settings.lastVideo && (
                      <p>
                        • <span className="font-semibold text-slate-200">Video:</span>{" "}
                        {settings.lastVideo.format.toUpperCase()} · {settings.lastVideo.codec.toUpperCase()} ·{" "}
                        {settings.lastVideo.quality}%
                        {settings.lastVideo.remuxCopy ? " (Copia directa)" : ""}
                        {settings.lastVideo.extractAudioMp3 ? " (Solo audio MP3)" : ""}
                      </p>
                    )}
                    {settings.lastImage && (
                      <p>
                        • <span className="font-semibold text-slate-200">Imagen:</span>{" "}
                        {settings.lastImage.mode === "strip"
                          ? "Quitar metadatos"
                          : `${settings.lastImage.format.toUpperCase()} · ${settings.lastImage.quality}% · Escala ${settings.lastImage.scale}%`}
                      </p>
                    )}
                    {settings.lastDoc && (
                      <p>
                        • <span className="font-semibold text-slate-200">Documento:</span>{" "}
                        {settings.lastDoc.mode === "strip"
                          ? "Quitar metadatos"
                          : settings.lastDoc.mode === "merge"
                            ? "Unir PDFs"
                            : `Convertir a ${settings.lastDoc.format.toUpperCase()}`}
                      </p>
                    )}
                  </div>
                ) : null
              )}
            </section>

            {/* 4. Sufijo de archivos generados */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileSignature size={16} className="text-indigo-400" />
                <span>Sufijo de archivos generados</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Al convertir
                  </label>
                  <input
                    type="text"
                    value={settings.customSuffix}
                    placeholder="convertido"
                    onChange={(e) => settings.setCustomSuffix(e.target.value)}
                    className="w-full rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Al quitar metadatos
                  </label>
                  <input
                    type="text"
                    value={settings.stripSuffix}
                    placeholder="sin_metadatos"
                    onChange={(e) => settings.setStripSuffix(e.target.value)}
                    className="w-full rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2">
                <span className="text-xs text-slate-300">
                  Omitir sufijo al guardar en una carpeta distinta a la original
                </span>
                <input
                  type="checkbox"
                  checked={settings.omitSuffixInCustomDir}
                  onChange={(e) => settings.setOmitSuffixInCustomDir(e.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
              </label>
            </section>

            {/* 5. Al finalizar conversión */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Bell size={16} className="text-indigo-400" />
                  <span>Al finalizar conversión</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={playCompletionChime}
                    className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Probar sonido
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={settings.testNotification}
                    className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    Probar aviso
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-[#0e1122] p-1">
                {POST_ACTIONS.map((a) => {
                  const active = settings.onCompleteAction === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => settings.setOnCompleteAction(a.id)}
                      className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                        active ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>

              {/* Notificación en segundo plano */}
              <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[#23284f]/60 pt-3">
                <span className="text-xs font-semibold text-slate-200">
                  Notificación del sistema en segundo plano
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.notifyOnComplete}
                  onClick={() => settings.setNotifyOnComplete(!settings.notifyOnComplete)}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    settings.notifyOnComplete ? "justify-end bg-indigo-500" : "justify-start bg-slate-600/60"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="h-5 w-5 rounded-full bg-white shadow"
                  />
                </button>
              </div>
            </section>

            {/* 6. Si el archivo ya existe */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Files size={16} className="text-indigo-400" />
                <span>Si el archivo ya existe en disco</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => settings.setOverwriteExisting(false)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    !settings.overwriteExisting
                      ? "border-indigo-500 bg-indigo-600/15 text-white"
                      : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <p className="text-xs font-bold">Numerar (_2, _3…)</p>
                </button>
                <button
                  type="button"
                  onClick={() => settings.setOverwriteExisting(true)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    settings.overwriteExisting
                      ? "border-indigo-500 bg-indigo-600/15 text-white"
                      : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <p className="text-xs font-bold">Sobrescribir</p>
                </button>
              </div>
            </section>

            {/* 7. Rendimiento */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Cpu size={16} className="text-indigo-400" />
                <span>Rendimiento y CPU</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {THREAD_OPTIONS.map((t) => {
                  const active = settings.threadMode === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => settings.setThreadMode(t.id)}
                      className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-600/15 text-white"
                          : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <p className="text-xs font-bold">{t.label}</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{t.hint}</p>
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-200">
                  Forzar codificación por CPU (ignorar GPU)
                </span>
                <input
                  type="checkbox"
                  checked={settings.forceCpu}
                  onChange={(e) => settings.setForceCpu(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-indigo-500"
                />
              </label>
            </section>

            {/* 8. Caché de miniaturas temporales */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Trash2 size={16} className="text-indigo-400" />
                    <span>Caché de miniaturas de video</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {cacheInfo
                      ? `${cacheInfo.count} miniatura${cacheInfo.count === 1 ? "" : "s"} (${formatBytes(cacheInfo.sizeBytes)})`
                      : "Calculando espacio…"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={clearingCache || !cacheInfo || cacheInfo.count === 0}
                  onClick={handleClearCache}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} /> Vaciar caché
                </button>
              </div>
            </section>

            {/* 9. Actualizaciones */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sparkles size={16} className="text-indigo-400" />
                    <span>Actualizaciones</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Versión instalada: <span className="font-semibold text-slate-200">v{CURRENT_VERSION}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={handleManualCheckUpdate}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={13} className={checkingUpdate ? "animate-spin" : ""} />
                  {checkingUpdate ? "Buscando…" : "Buscar actualizaciones"}
                </button>
              </div>

              {/* Resultado de búsqueda manual */}
              {manualChecked && (
                <div className="mt-3">
                  {nativeStatus?.available ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-white">
                            ¡Nueva versión v{nativeStatus.version} disponible!
                          </p>
                          <p className="text-[11px] text-slate-300">
                            {installingNative
                              ? installProgress !== null && installProgress < 100
                                ? `Descargando parche… (${installProgress}%)`
                                : "Reiniciando…"
                              : "Se instalará y reiniciará automáticamente."}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={installingNative}
                          onClick={handleTriggerNativeInstall}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {installingNative ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>{installProgress !== null ? `${installProgress}%` : "Instalando…"}</span>
                            </>
                          ) : (
                            <>
                              <Download size={13} />
                              <span>Actualizar y reiniciar</span>
                            </>
                          )}
                        </button>
                      </div>

                      {installingNative && installProgress !== null && (
                        <div className="mt-1 overflow-hidden rounded-full bg-slate-800 p-0.5">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${installProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
                      ✓ Ya tienes instalada la versión más reciente (v{CURRENT_VERSION}).
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Pie del modal */}
          <div className="flex items-center justify-between border-t border-[#1e293b] px-6 py-4">
            <button
              type="button"
              onClick={settings.resetAllSettings}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <RotateCcw size={14} /> Restablecer ajustes de fábrica
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Listo
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
``

## src/components/Toast.tsx

``tsx
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  tone?: "error" | "warn" | "info";
  durationMs?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, onDismiss }: ToastProps) {
  const duration = toast.durationMs ?? 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  const tone = toast.tone ?? "error";
  const icon =
    tone === "error" ? (
      <AlertCircle size={18} className="text-rose-400" />
    ) : tone === "warn" ? (
      <AlertTriangle size={18} className="text-amber-400" />
    ) : (
      <Info size={18} className="text-sky-400" />
    );

  const borderCls =
    tone === "error"
      ? "border-rose-500/40 shadow-rose-950/40"
      : tone === "warn"
        ? "border-amber-500/40 shadow-amber-950/40"
        : "border-sky-500/40 shadow-sky-950/40";

  const barCls =
    tone === "error" ? "bg-rose-500/60" : tone === "warn" ? "bg-amber-500/60" : "bg-sky-500/60";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 25, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-[#0d1222]/95 p-4 shadow-2xl backdrop-blur-xl ${borderCls}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">{toast.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Cerrar notificación"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>

      {/* Barra de progreso de tiempo restante */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: duration / 1000, ease: "linear" }}
          className={`h-full ${barCls}`}
        />
      </div>
    </motion.div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2.5"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </aside>
  );
}

``

## src/components/ui.tsx

``tsx
import { type KeyboardEvent, type ReactNode, useId } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

/* Degradado de la captura (índigo → violeta).
   Para el del brief usa: "bg-gradient-to-r from-blue-600 to-indigo-600" y "hover:from-blue-500 hover:to-indigo-500" */
export const GRADIENT_BG = "bg-gradient-to-r from-indigo-600 to-violet-600";
const GRADIENT_HOVER = "hover:from-indigo-500 hover:to-violet-500";

/* ───────── Tarjeta flotante ───────── */
export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div
      {...props}
      className={`rounded-3xl border border-[#1e293b] bg-[#131a2a]/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/* ───────── Pestañas a todo el ancho, cápsula activa con degradado y glow ───────── */
export function PillTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { id: T; label: string; icon: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-2xl border border-[#1e293b] bg-[#131a2a]/60 p-2 shadow-[0_0_40px_rgba(79,70,229,0.12)] backdrop-blur-xl">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            data-tab-id={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            onDragEnter={(e) => {
              e.preventDefault();
              onChange(t.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              onChange(t.id);
            }}
            className={`relative isolate flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-semibold transition-colors ${
              active ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                transition={spring}
                className={`absolute inset-0 -z-10 rounded-xl ${GRADIENT_BG} shadow-[0_10px_30px_-8px_rgba(99,102,241,0.65)]`}
              />
            )}
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── Selector segmentado: contenedor azulado, chip activo oscuro con texto índigo ───────── */
export function Segmented<T extends string>({
  label, value, options, onChange, disabled, labels,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
  labels?: Partial<Record<T, string>>;
}) {
  const id = useId();
  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <div className="relative inline-flex max-w-full flex-wrap rounded-2xl bg-[#23284f]/60 p-1.5">
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o)}
              className="relative isolate rounded-xl px-5 py-2 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {active && (
                <motion.span
                  layoutId={`seg-${id}`}
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-xl bg-[#0e1122] shadow-inner"
                />
              )}
              <span className={active ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}>
                {labels?.[o] ?? o.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Cuadro informativo ───────── */
export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-[#23284f]/60 px-5 py-4 text-[15px] leading-relaxed text-slate-400">{children}</div>;
}

/* ───────── Botones ───────── */
export function GradientButton({
  children, onClick, disabled, loading, className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const off = disabled || loading;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={off}
      whileHover={off ? undefined : { scale: 1.03 }}
      whileTap={off ? undefined : { scale: 0.96 }}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl ${GRADIENT_BG} ${GRADIENT_HOVER} px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition-shadow hover:shadow-indigo-700/50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
}

export function SecondaryButton({
  children, onClick, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className="rounded-2xl bg-[#23284f]/70 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </motion.button>
  );
}

/* ───────── Progreso (value=null → indeterminada) ───────── */
export function ProgressBar({ value }: { value?: number | null }) {
  const isDeterminate = typeof value === "number" && Number.isFinite(value);
  const clamped = isDeterminate ? Math.min(100, Math.max(0, value!)) : 0;

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-[#23284f]">
      {isDeterminate ? (
        <motion.div
          key="determinate"
          className={`h-full rounded-full ${GRADIENT_BG} ${clamped > 0 ? "shadow-[0_0_14px_rgba(124,58,237,0.7)]" : ""}`}
          initial={false}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{ transform: "none" }}
        />
      ) : (
        <motion.div
          key="indeterminate"
          className={`h-full w-1/3 rounded-full ${GRADIENT_BG}`}
          animate={{ x: ["-100%", "300%"] }}
          transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums text-slate-100">{value}</p>
    </div>
  );
}

/* ───────── Avisos ───────── */
const TONES = {
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
} as const;

export function Notice({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </motion.div>
  );
}

/* ───────── Zona de arrastre con aspecto del input oscuro de la captura ───────── */
export function DropZone({
  hover, icon, title, subtitle, onBrowse, disabled, children,
}: {
  hover: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onBrowse: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled) onBrowse();
    }
  };
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onBrowse}
      onKeyDown={key}
      initial={false}
      animate={{ scale: hover ? 1.012 : 1, borderColor: hover ? "#6366f1" : "#23284f" }}
      transition={{ duration: 0.15 }}
      className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
        hover ? "bg-indigo-600/10" : "bg-[#0e1122]/80 hover:bg-[#0e1122]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {children ?? (
        <>
          <div className="rounded-2xl bg-indigo-600/15 p-3 text-indigo-300">{icon}</div>
          <p className="text-base font-medium text-slate-200">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </>
      )}
    </motion.div>
  );
}
``

## src/components/UpdateBanner.tsx

``tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import type { UpdateInfo } from "../lib/updater";
import { openDownloadLink } from "../lib/updater";

interface UpdateBannerProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    await openDownloadLink(update.downloadUrl);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="mb-4 overflow-hidden rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/90 via-[#131a2a]/95 to-indigo-950/90 p-4 shadow-xl backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  ¡Nueva versión disponible! (v{update.version})
                </span>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                  Actualización
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Una versión más reciente de Multimedia Converter está lista para descargar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {update.body && (
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <span>Novedades</span>
                {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-indigo-500/25 active:scale-95"
            >
              <Download size={15} />
              <span>{downloading ? "Abriendo..." : "Descargar actualización"}</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Cerrar aviso"
              className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notas de la versión desplegables */}
        {showNotes && update.body && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300"
          >
            <p className="font-semibold text-indigo-300 mb-1">Notas de la versión:</p>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto">
              {update.body}
            </pre>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

``

## src/components/VideoTab.tsx

``tsx
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, Eye, Film, FolderOpen, HelpCircle, Plus, Scissors, Square, UploadCloud, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { HwState } from "../hooks/useHwProfile";
import type { QueueItem, VideoConverter } from "../hooks/useVideoConverter";
import { useTauriDrop } from "../hooks/tauri";
import {
  CODEC_LABEL,
  FORMAT_LABEL,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  modeOf,
  type ConvertMode,
  type HwAccel,
  type VideoCodec,
  type VideoFormat,
  type VideoMetadata,
  type VideoSettings,
} from "../types";
import { formatTime, parseTimeInput, splitPath } from "../lib/utils";
import { detectAspect, resolutionOptions, resolveTarget } from "../lib/resolution";
import { VIDEO_PRESETS } from "../lib/presets";
import { Card, DropZone, GradientButton, Notice, ProgressBar, Segmented, SecondaryButton, Stat } from "./ui";
import { PreviewModal, type PreviewTarget } from "./PreviewModal";

/* ───────────────────────── Helpers ───────────────────────── */

const LABEL = "mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500";

const ACCEL_LABEL: Record<HwAccel, string> = {
  nvenc: "NVIDIA NVENC",
  amf: "AMD AMF (Radeon)",
  qsv: "Intel Quick Sync",
  vaapi: "Intel/AMD VA-API",
  videotoolbox: "Apple VideoToolbox",
  cpu: "CPU",
};

/** Colores distintivos por marca de hardware (NVIDIA = verde, AMD = rojo, Intel = azul, Mac = púrpura, CPU = ámbar). */
const ACCEL_THEME: Record<HwAccel, { dot: string; cls: string }> = {
  nvenc: {
    dot: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
    cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  },
  amf: {
    dot: "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
    cls: "border-rose-500/35 bg-rose-500/10 text-rose-300",
  },
  qsv: {
    dot: "bg-sky-400 shadow-[0_0_8px_#38bdf8]",
    cls: "border-sky-500/35 bg-sky-500/10 text-sky-300",
  },
  vaapi: {
    dot: "bg-cyan-400 shadow-[0_0_8px_#22d3ee]",
    cls: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300",
  },
  videotoolbox: {
    dot: "bg-purple-400 shadow-[0_0_8px_#c084fc]",
    cls: "border-purple-500/35 bg-purple-500/10 text-purple-300",
  },
  cpu: {
    dot: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
    cls: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  },
};

/** Calidad 1-100 → valor nativo (misma fórmula que `gpu_cq` / `cpu_crf_for` en commands.rs). */
const gpuCq = (q: number) => Math.round(45 - ((q - 1) * 27) / 99);
const cpuCrf = (q: number, codec: VideoCodec) => Math.round(42 - ((q - 1) * 24) / 99) + (codec === "av1" ? 6 : 0);
const nativeQuality = (accel: HwAccel, codec: VideoCodec, q: number) => {
  if (accel === "cpu") return `CRF ${cpuCrf(q, codec)}`;
  if (accel === "amf" || accel === "vaapi") return `QP ${gpuCq(q)}`;
  if (accel === "qsv") return `ICQ ${gpuCq(q)}`;
  if (accel === "videotoolbox") return `Q ${q}`;
  return `CQ ${gpuCq(q)}`;
};

/** Mismas constantes que en commands.rs. */
const SIZE_SAFETY = 0.97;
const AUDIO_KBPS = 128;
const MIN_VIDEO_KBPS = 50;
const MP3_KBPS = 190; // -q:a 2 ≈ 190 kbps (VBR)

/** Duración efectiva tras aplicar recorte de inicio y fin. */
function getEffectiveDuration(meta: VideoMetadata | null, s: VideoSettings): number | null {
  const raw = meta?.durationSecs ?? null;
  const start = parseTimeInput(s.trimStart);
  const end = parseTimeInput(s.trimEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) return raw;
  const st = Math.max(0, start ?? 0);
  if (raw !== null && end !== null) return Math.max(0, Math.min(raw, end) - st);
  if (raw !== null && end === null) return Math.max(0, raw - st);
  if (raw === null && end !== null) return Math.max(0, end - st);
  return null;
}

/** Tamaño objetivo (MB) → bitrate de video (kbps), igual que `target_video_kbps` en Rust. */
const targetVideoKbps = (mb: number, durationSecs: number, hasAudio: boolean) =>
  (mb * 8192 * SIZE_SAFETY) / durationSecs - (hasAudio ? AUDIO_KBPS : 0);

function qualityTier(q: number) {
  if (q >= 90) return "Casi sin pérdida visible";
  if (q >= 70) return "Alta";
  if (q >= 45) return "Media";
  if (q >= 20) return "Baja";
  return "Mínima · archivo muy ligero";
}

function encoderName(accel: HwAccel, codec: VideoCodec) {
  if (codec === "vp9") return "libvpx-vp9";
  if (accel === "cpu" || (accel === "videotoolbox" && codec === "av1")) {
    return codec === "h264" ? "libx264" : codec === "hevc" ? "libx265" : "libsvtav1";
  }
  return `${codec}_${accel}`;
}

/** Acelerador que se usará para un códec (VP9 o CPU forzado en Ajustes siempre van por CPU). */
function accelFor(profile: HwState["profile"], codec: VideoCodec, forceCpu?: boolean): HwAccel {
  if (forceCpu || codec === "vp9") return "cpu";
  return profile ? profile[codec] : "cpu";
}

function audioOut(format: VideoFormat, codec: VideoCodec, targetSize: boolean) {
  const base =
    format === "webm" || (format === "mkv" && codec === "vp9")
      ? { name: "Opus", kbps: 128 }
      : format === "avi"
        ? { name: "MP3", kbps: 192 }
        : { name: "AAC", kbps: 192 };
  return targetSize ? { ...base, kbps: AUDIO_KBPS } : base;
}

const SRC_CODEC: Record<string, string> = {
  h264: "H.264", hevc: "H.265 (HEVC)", vp9: "VP9", vp8: "VP8", av1: "AV1", mpeg4: "MPEG-4",
  mpeg2video: "MPEG-2", prores: "ProRes", aac: "AAC", mp3: "MP3", opus: "Opus", vorbis: "Vorbis",
  ac3: "AC-3", eac3: "E-AC-3", flac: "FLAC", pcm_s16le: "PCM", alac: "ALAC",
};
const prettyCodec = (name: string) => SRC_CODEC[name] ?? name.toUpperCase();

function formatBitrate(bps: number | null | undefined) {
  if (!bps) return "—";
  return `${Math.round(bps / 1000).toLocaleString("en-US")} kbps`;
}

function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const folderName = (dir: string) => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;

function sourceVideoBps(m: VideoMetadata) {
  return m.video?.bitRate ?? (m.bitRate ? Math.max(m.bitRate - (m.audio?.bitRate ?? 0), 0) : null);
}

const BPP_AT_80: Record<VideoCodec, number> = { h264: 0.085, hevc: 0.052, av1: 0.045, vp9: 0.06 };

interface Estimate {
  videoBps: number | null;
  sizeBytes: number | null;
  tooSmall: boolean;
}

function estimate(m: VideoMetadata, s: VideoSettings, width: number, height: number): Estimate | null {
  const v = m.video;
  if (!v || !v.width || !v.height) return null;
  const mode = modeOf(s);
  const effDur = getEffectiveDuration(m, s);
  const durRatio = m.durationSecs && effDur !== null && m.durationSecs > 0 ? effDur / m.durationSecs : 1;
  const hasAudioOut = !!m.audio && !s.mute;

  if (mode === "copy") {
    const vBps = sourceVideoBps(m);
    const aBps = hasAudioOut ? (m.audio?.bitRate ?? 128_000) : 0;
    const estSize =
      effDur !== null && vBps
        ? ((vBps + aBps) * effDur) / 8
        : m.sizeBytes
          ? m.sizeBytes * durRatio * (s.mute ? 0.92 : 1)
          : null;
    return { videoBps: vBps, sizeBytes: estSize, tooSmall: false };
  }
  if (mode === "audio") {
    return { videoBps: null, sizeBytes: effDur ? (effDur * MP3_KBPS * 1000) / 8 : null, tooSmall: false };
  }

  if (s.targetSizeMb && effDur && effDur > 0) {
    const k = targetVideoKbps(s.targetSizeMb, effDur, hasAudioOut);
    return { videoBps: Math.max(k, 0) * 1000, sizeBytes: s.targetSizeMb * 1024 * 1024, tooSmall: k < MIN_VIDEO_KBPS };
  }

  const fps = v.fps ?? 30;
  const areaRatio = (width * height) / (v.width * v.height);
  let videoBps = width * height * fps * BPP_AT_80[s.codec] * Math.pow(2, (s.quality - 80) / 24.75);
  const src = sourceVideoBps(m);
  if (src) videoBps = Math.min(videoBps, src * 1.25 * areaRatio);
  const audioBps = hasAudioOut ? audioOut(s.format, s.codec, false).kbps * 1000 : 0;
  const sizeBytes = effDur ? (((videoBps + audioBps) * effDur) / 8) * 1.01 : null;
  return { videoBps, sizeBytes, tooSmall: false };
}

const COPY_OK: Partial<Record<VideoFormat, { v: string[]; a: string[] }>> = {
  mp4: { v: ["h264", "hevc", "av1", "vp9", "mpeg4"], a: ["aac", "mp3", "ac3", "eac3", "opus", "alac", "flac"] },
  mov: { v: ["h264", "hevc", "mpeg4", "prores"], a: ["aac", "mp3", "ac3", "alac", "pcm_s16le"] },
  webm: { v: ["vp8", "vp9", "av1"], a: ["opus", "vorbis"] },
  avi: { v: ["h264", "mpeg4", "mpeg2video"], a: ["mp3", "ac3", "aac", "pcm_s16le"] },
};

function copyWarning(meta: VideoMetadata | null, format: VideoFormat, mute: boolean) {
  const ok = COPY_OK[format];
  if (!ok || !meta?.video) return null;
  const bad: string[] = [];
  if (!ok.v.includes(meta.video.codec)) bad.push(`video ${prettyCodec(meta.video.codec)}`);
  if (!mute && meta.audio && !ok.a.includes(meta.audio.codec)) bad.push(`audio ${prettyCodec(meta.audio.codec)}`);
  return bad.length
    ? `El ${bad.join(" y el ")} de este archivo podría no ser compatible con ${FORMAT_LABEL[format]}; si falla, usa MKV, que acepta casi todo.`
    : null;
}

function estimateEta(
  pct: number | null,
  elapsed: number,
  speed: string | null,
  processed: number,
  total: number | null,
) {
  if (pct === null || pct < 1) return null;
  const s = speed ? parseFloat(speed) : NaN;
  if (total && s > 0) return Math.max(0, (total - processed) / s);
  return (elapsed * (100 - pct)) / pct;
}

function settingsSummary(it: QueueItem) {
  const s = it.settings;
  const where = s.outputDir ? ` · en «${folderName(s.outputDir)}»` : "";
  const trimTxt =
    s.trimStart.trim() || s.trimEnd.trim()
      ? ` · Recorte ${s.trimStart.trim() || "00:00"}–${s.trimEnd.trim() || "fin"}`
      : "";
  const muteTxt = s.mute && !s.extractAudioMp3 ? " · Sin audio" : "";
  const mode = modeOf(s);
  if (mode === "audio") return `Solo audio · MP3${trimTxt}${where}`;
  if (mode === "copy") return `Remux · ${FORMAT_LABEL[s.format]} · sin recodificar${muteTxt}${trimTxt}${where}`;
  const t = resolveTarget(it.meta, s.resolution);
  const q = s.targetSizeMb ? `≤ ${s.targetSizeMb} MB` : `${s.quality}%`;
  return `${FORMAT_LABEL[s.format]} · ${CODEC_LABEL[s.codec]} · ${q} · ${t ? `${t.width}×${t.height}` : "res. original"}${muteTxt}${trimTxt}${where}`;
}

/* ───────────────────────── Glosario multimedia ───────────────────────── */

type GlossaryTab = "format" | "codec";

interface GlossaryEntry {
  tagline: string;
  pros: string;
  compat: string;
  useWhen: string;
}

const FORMAT_GLOSSARY: Record<VideoFormat, GlossaryEntry> = {
  mp4: {
    tagline: "El contenedor más universal.",
    pros: "Se reproduce en casi cualquier móvil, TV, navegador y red social. Aquí admite H.264, H.265 y AV1.",
    compat: "Excelente.",
    useWhen: "vas a compartir o subir el video a cualquier plataforma.",
  },
  mkv: {
    tagline: "El más flexible.",
    pros: "Admite casi cualquier códec, varias pistas de audio y subtítulos. Es el más seguro para copiar sin recodificar.",
    compat: "Buena en PC (VLC, Plex…); limitada en móviles, TV antiguas y algunos editores.",
    useWhen: "archivas, o el códec no cabe en MP4 (por ejemplo VP9).",
  },
  mov: {
    tagline: "El formato de Apple (QuickTime).",
    pros: "Muy bien integrado con Mac, iPhone y editores como Final Cut. Aquí admite H.264 y H.265.",
    compat: "Excelente en el ecosistema Apple; menos habitual fuera de él.",
    useWhen: "editas en Mac o trabajas con material de iPhone y cámaras.",
  },
  webm: {
    tagline: "El formato abierto para la web.",
    pros: "Ligero y pensado para navegadores. Aquí usa VP9 o AV1 con audio Opus.",
    compat: "Muy buena en navegadores y Android; limitada en iOS antiguos, TV y editores.",
    useWhen: "vas a incrustar el video en un sitio web.",
  },
  avi: {
    tagline: "Un formato antiguo (1992).",
    pros: "Lo leen equipos y reproductores muy viejos. Aquí solo admite H.264 con audio MP3.",
    compat: "Amplia pero anticuada; sin soporte moderno para streaming.",
    useWhen: "un equipo antiguo lo exige. En cualquier otro caso, mejor MP4.",
  },
};

const CODEC_GLOSSARY: Record<VideoCodec, GlossaryEntry> = {
  h264: {
    tagline: "El estándar universal.",
    pros: "Compatible con prácticamente todo y muy rápido de codificar con cualquier GPU (NVIDIA NVENC, AMD AMF o Intel Quick Sync).",
    compat: "Excelente en cualquier dispositivo o navegador.",
    useWhen: "quieres máxima compatibilidad sin complicaciones.",
  },
  hevc: {
    tagline: "El sucesor de H.264.",
    pros: "Archivos aprox. 30-50 % más pequeños con calidad similar. Se acelera por hardware en gráficas NVIDIA, AMD Radeon e Intel integradas/Arc.",
    compat: "Buena en dispositivos recientes (iPhone, TV 4K, PC moderna); algunos navegadores y reproductores antiguos no lo abren.",
    useWhen: "quieres ahorrar espacio en videos 1080p o 4K.",
  },
  av1: {
    tagline: "El más eficiente y de código abierto.",
    pros: "Aprox. 20-30 % más compacto que H.265 y libre de regalías. Se acelera por GPU en RTX 40+, Radeon RX 7000+ o Intel Arc; en otras GPUs usa CPU (SVT-AV1).",
    compat: "En crecimiento: navegadores y dispositivos recientes. Los antiguos lo reproducen mal.",
    useWhen: "archivas o publicas en la web y tu GPU lo acelera.",
  },
  vp9: {
    tagline: "El códec abierto de Google.",
    pros: "Eficiencia parecida a H.265; es el estándar de WebM y YouTube. Aquí siempre se codifica por CPU (más lento).",
    compat: "Muy buena en navegadores y Android; limitada en productos Apple y TV antiguas.",
    useWhen: "generas WebM para la web.",
  },
};

function GlossaryCard({ name, active, e }: { name: string; active: boolean; e: GlossaryEntry }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-bold text-white">{name}</h4>
        {active && (
          <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">En uso</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-indigo-200">{e.tagline}</p>
      <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
        <div>
          <dt className="inline font-semibold text-slate-300">Ventajas: </dt>
          <dd className="inline text-slate-400">{e.pros}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Compatibilidad: </dt>
          <dd className="inline text-slate-400">{e.compat}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
          <dd className="inline text-slate-400">{e.useWhen}</dd>
        </div>
      </dl>
    </div>
  );
}

function GlossaryDrawer({
  tab, onTab, onClose, format, codec,
}: {
  tab: GlossaryTab | null;
  onTab: (t: GlossaryTab) => void;
  onClose: () => void;
  format: VideoFormat;
  codec: VideoCodec;
}) {
  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          key="glossary-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/45"
        />
      )}
      {tab && (
        <motion.aside
          key="glossary-drawer"
          role="dialog"
          aria-label="Glosario multimedia"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1e293b] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Glosario multimedia</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  El formato es la «caja» del archivo; el códec es cómo se comprime la imagen.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar glosario"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 pt-4">
            <div className="relative inline-flex rounded-xl bg-[#23284f]/60 p-1">
              {(
                [
                  ["format", "Formatos"],
                  ["codec", "Códecs"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTab(id)}
                  className="relative isolate rounded-lg px-4 py-1.5 text-sm font-semibold"
                >
                  {tab === id && (
                    <motion.span
                      layoutId="glossary-tab"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 -z-10 rounded-lg bg-[#0e1122] shadow-inner"
                    />
                  )}
                  <span className={tab === id ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-4">
            {tab === "format"
              ? VIDEO_FORMATS.map((f) => (
                  <GlossaryCard key={f} name={FORMAT_LABEL[f]} active={f === format} e={FORMAT_GLOSSARY[f]} />
                ))
              : VIDEO_CODECS.map((c) => (
                  <GlossaryCard key={c} name={CODEC_LABEL[c]} active={c === codec} e={CODEC_GLOSSARY[c]} />
                ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────────────── Piezas de UI ───────────────────────── */

function HwBadge({
  hw,
  codec,
  mode,
  forceCpu,
}: {
  hw: HwState;
  codec: VideoCodec;
  mode: ConvertMode;
  forceCpu: boolean;
}) {
  let text = "Detectando hardware…";
  let dot = "bg-slate-400 animate-pulse";
  let cls = "border-slate-600/40 bg-slate-500/10 text-slate-300";

  if (mode === "copy") {
    text = "Copia directa · sin codificar";
    dot = "bg-teal-400 shadow-[0_0_8px_#2dd4bf]";
    cls = "border-teal-500/35 bg-teal-500/10 text-teal-300";
  } else if (mode === "audio") {
    text = "Audio MP3 · por CPU";
    dot = ACCEL_THEME.cpu.dot;
    cls = ACCEL_THEME.cpu.cls;
  } else if (hw.error) {
    text = "FFmpeg no disponible";
    dot = "bg-red-500";
    cls = "border-red-500/40 bg-red-500/10 text-red-300";
  } else if (forceCpu) {
    text = "Modo: CPU forzado (Ajustes)";
    dot = ACCEL_THEME.cpu.dot;
    cls = ACCEL_THEME.cpu.cls;
  } else if (hw.profile) {
    const accel = accelFor(hw.profile, codec, false);
    const theme = ACCEL_THEME[accel];
    dot = theme.dot;
    cls = theme.cls;

    if (accel === "cpu") {
      text =
        codec === "vp9"
          ? "Modo: CPU (VP9)"
          : codec === "av1"
            ? "Modo: CPU (SVT-AV1)"
            : "Modo: CPU";
    } else {
      text = `Aceleración activa: ${ACCEL_LABEL[accel]}`;
    }
  }

  return (
    <motion.div
      key={text}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      title={hw.error ?? undefined}
      className={`inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm ${cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </motion.div>
  );
}

function Toggle({
  checked, onChange, disabled, title, hint,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-indigo-500/50 bg-indigo-600/15" : "border-[#23284f] bg-[#23284f]/30 hover:bg-[#23284f]/60"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "justify-end bg-indigo-500" : "justify-start bg-slate-600/60"
        }`}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className="h-4 w-4 rounded-full bg-white shadow" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

function LabelWithHelp({ label, active, onHelp }: { label: string; active: boolean; onHelp: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <button
        type="button"
        onClick={onHelp}
        aria-label={`Abrir el glosario: ${label}`}
        title="Ver glosario"
        className={`rounded-full p-0.5 transition-colors ${active ? "text-indigo-300" : "text-slate-500 hover:text-indigo-300"}`}
      >
        <HelpCircle size={14} />
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
        {n}
      </span>
      <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</span>
    </div>
  );
}

function Row({ label, from, to }: { label: string; from: string; to: string }) {
  const changed = from !== to;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
        <span className="text-slate-300">{from}</span>
        <span className={changed ? "font-medium text-indigo-300" : "text-slate-300"}>{to}</span>
      </div>
    </div>
  );
}

function StatusChip({ it }: { it: QueueItem }) {
  const map = {
    pending: ["En cola", "bg-slate-500/15 text-slate-300"],
    running: [
      it.progress?.percent != null ? `${it.progress.percent.toFixed(0)}%` : "En curso",
      "bg-indigo-500/20 text-indigo-200",
    ],
    done: ["Listo", "bg-emerald-500/15 text-emerald-300"],
    error: ["Error", "bg-red-500/15 text-red-300"],
    cancelled: ["Cancelado", "bg-amber-500/15 text-amber-300"],
  } as const;
  const [text, cls] = map[it.status];
  return <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

function VideoThumbInternal({ thumb }: { thumb: string | null | undefined }) {
  const [failed, setFailed] = useState(false);

  if (!thumb || failed) {
    return (
      <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-[#23284f] bg-[#0e1122] text-indigo-300">
        <Film size={16} />
      </div>
    );
  }

  return (
    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0e1122] shadow-sm">
      <img
        src={convertFileSrc(thumb)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}



const VideoThumb = memo(VideoThumbInternal);

function QueueRowInternal({
  it, selected, locked, onSelect, onRemove, onPreview,
}: {
  it: QueueItem;
  selected: boolean;
  locked: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (it: QueueItem) => void;
}) {
  const v = it.meta?.video ?? null;
  const sub =
    it.metaState === "loading"
      ? "Leyendo propiedades…"
      : it.metaState === "error"
        ? it.metaError ?? "No se pudo leer el archivo"
        : [
            v ? `${v.width}×${v.height}` : null,
            it.meta?.durationSecs ? formatTime(it.meta.durationSecs) : null,
            it.meta?.sizeBytes ? formatBytes(it.meta.sizeBytes) : null,
          ]
            .filter(Boolean)
            .join(" · ");

  const realDiff =
    it.status === "done" && it.outputBytes && it.meta?.sizeBytes
      ? ((it.outputBytes / it.meta.sizeBytes - 1) * 100)
      : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 8 }}
      onClick={() => onSelect(it.id)}
      className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
        selected ? "border-indigo-500/60 bg-indigo-600/10" : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPreview(it);
          }}
          className="group relative cursor-pointer"
          title="Ver vista previa"
        >
          <VideoThumb thumb={it.meta?.thumbnail} />
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Eye size={14} className="text-white" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100" title={it.path}>
            {splitPath(it.path).file}
          </p>
          <p className={`truncate text-xs ${it.metaState === "error" ? "text-red-300" : "text-slate-500"}`}>{sub}</p>
          {it.status === "done" && it.outputBytes ? (
            <p className="truncate text-xs font-medium text-emerald-300">
              ✓ Salida real: {formatBytes(it.outputBytes)}
              {realDiff !== null && ` (${realDiff <= 0 ? "−" : "+"}${Math.abs(realDiff).toFixed(0)}%)`}
            </p>
          ) : (
            it.metaState !== "error" && (
              <p className="truncate text-xs text-indigo-300/80" title={`Opciones de este video: ${settingsSummary(it)}`}>
                → {settingsSummary(it)}
              </p>
            )
          )}
        </div>
        <StatusChip it={it} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(it);
          }}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-indigo-300"
          aria-label="Vista previa"
          title="Vista previa"
        >
          <Eye size={15} />
        </button>
        {it.status === "done" && it.output && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              revealItemInDir(it.output!).catch(() => {});
            }}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
            aria-label="Mostrar en carpeta"
            title="Mostrar en carpeta"
          >
            <FolderOpen size={15} />
          </button>
        )}
        <button
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(it.id);
          }}
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-30"
          aria-label="Quitar de la cola"
        >
          <X size={15} />
        </button>
      </div>
      {it.status === "running" && (
        <div className="mt-2">
          <ProgressBar value={it.progress?.percent ?? null} />
        </div>
      )}
    </motion.li>
  );
}

/* ───────────────────── Panel de inspección: Original vs. Salida estimada ───────────────────── */



const QueueRow = memo(QueueRowInternal);

function InspectionPanelInternal({ vc, hw }: { vc: VideoConverter; hw: HwState }) {
  const sel = vc.selected;
  const meta = sel?.meta ?? null;
  const v = meta?.video ?? null;
  const a = meta?.audio ?? null;

  const state = !sel
    ? "empty"
    : sel.metaState === "loading"
      ? "loading"
      : sel.metaState === "error"
        ? "error"
        : meta && v
          ? "ready"
          : "empty";

  let body: React.ReactNode = null;

  if (state === "empty") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-indigo-600/10 p-4 text-indigo-300/70">
          <Film size={28} />
        </div>
        <p className="max-w-[260px] text-sm text-slate-500">
          Añade videos para ver sus propiedades y cómo quedarán al convertirlos.
        </p>
      </div>
    );
  } else if (state === "loading") {
    body = (
      <div className="space-y-4 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-2.5 w-20 rounded bg-[#23284f]" />
            <div className="h-4 w-full rounded bg-[#23284f]/70" />
          </div>
        ))}
      </div>
    );
  } else if (state === "error") {
    body = <Notice tone="error">{sel?.metaError}</Notice>;
  } else if (sel && meta && v) {
    const s = sel.settings;
    const mode = modeOf(s);
    const accel = accelFor(hw.profile, s.codec, vc.forceCpu);
    const target = mode === "encode" ? resolveTarget(meta, s.resolution) : null;
    const outW = target?.width ?? v.width;
    const outH = target?.height ?? v.height;
    const aspect = detectAspect(v.width, v.height);
    const est = estimate(meta, s, outW, outH);
    const out = audioOut(s.format, s.codec, mode === "encode" && s.targetSizeMb !== null);
    const origDur = meta.durationSecs ? formatTime(meta.durationSecs) : "—";
    const effDurSecs = getEffectiveDuration(meta, s);
    const outDur = effDurSecs !== null ? formatTime(effDurSecs) : origDur;

    const finalBytes = sel.status === "done" && sel.outputBytes ? sel.outputBytes : est?.sizeBytes ?? null;
    const diff = finalBytes && meta.sizeBytes ? (finalBytes / meta.sizeBytes - 1) * 100 : null;

    let boxTitle = `${s.quality}% · ${qualityTier(s.quality)}`;
    let boxSub = `${encoderName(accel, s.codec)} · ${nativeQuality(accel, s.codec, s.quality)}`;
    let boxLabel = "Calidad objetivo";
    if (mode === "copy") {
      boxLabel = "Modo";
      boxTitle = "Sin pérdida · copia directa";
      boxSub = s.mute ? "ffmpeg -c:v copy -an" : "ffmpeg -c copy";
    } else if (mode === "audio") {
      boxLabel = "Modo";
      boxTitle = "Solo audio · MP3";
      boxSub = "libmp3lame -q:a 2 (VBR alta calidad)";
    } else if (s.targetSizeMb) {
      boxLabel = "Tamaño objetivo";
      boxTitle = `${s.targetSizeMb} MB`;
      boxSub = est?.tooSmall
        ? "Demasiado pequeño para esta duración"
        : `video ≈ ${Math.round((est?.videoBps ?? 0) / 1000)} kbps · audio ${a && !s.mute ? AUDIO_KBPS : 0} kbps`;
    }

    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
          <span className="text-slate-400">Original</span>
          <span className="text-indigo-300">{sel.status === "done" ? "Salida final" : "Salida estimada"}</span>
        </div>

        <Row
          label="Contenedor"
          from={splitPath(sel.path).ext.toUpperCase() || "—"}
          to={mode === "audio" ? "MP3" : FORMAT_LABEL[s.format]}
        />
        <Row label="Relación de aspecto" from={aspect.label} to={mode === "audio" ? "—" : aspect.label} />
        <Row label="Resolución" from={`${v.width}×${v.height}`} to={mode === "audio" ? "—" : `${outW}×${outH}`} />
        <Row
          label="Códec de video"
          from={prettyCodec(v.codec)}
          to={mode === "audio" ? "Descartado" : mode === "copy" ? "Copia directa" : CODEC_LABEL[s.codec]}
        />
        <Row
          label="Códec de audio"
          from={a ? prettyCodec(a.codec) : "Sin audio"}
          to={
            !a
              ? "Sin audio"
              : s.mute && mode !== "audio"
                ? "Silenciado (-an)"
                : mode === "audio"
                  ? `MP3 ≈ ${MP3_KBPS} kbps`
                  : mode === "copy"
                    ? "Copia directa"
                    : `${out.name} ${out.kbps} kbps`
          }
        />
        <Row
          label="Bitrate de video"
          from={formatBitrate(sourceVideoBps(meta))}
          to={mode === "audio" ? "—" : mode === "copy" ? formatBitrate(sourceVideoBps(meta)) : est ? `≈ ${formatBitrate(est.videoBps)}` : "—"}
        />
        <Row label="Duración" from={origDur} to={outDur} />
        <Row
          label="Tamaño en disco"
          from={formatBytes(meta.sizeBytes)}
          to={
            sel.status === "done" && sel.outputBytes
              ? formatBytes(sel.outputBytes)
              : est?.sizeBytes
                ? `≈ ${formatBytes(est.sizeBytes)}`
                : "—"
          }
        />

        {diff !== null && (mode !== "copy" || effDurSecs !== meta.durationSecs || s.mute || sel.status === "done") && (
          <p className={`text-sm font-medium ${diff <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
            {sel.status === "done" ? "" : "≈ "}
            {diff <= 0 ? "−" : "+"}
            {Math.abs(diff).toFixed(0)} % respecto al original
          </p>
        )}

        <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">{boxLabel}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{boxTitle}</p>
          <p className={`mt-0.5 font-mono text-xs ${est?.tooSmall && mode === "encode" ? "text-amber-300" : "text-slate-400"}`}>
            {boxSub}
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Estimación aproximada: el bitrate y el tamaño reales dependen del contenido del video.
        </p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <Film size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">Inspección de video</h3>
      </div>
      {sel && (
        <p className="truncate text-xs text-slate-500" title={sel.path}>
          {splitPath(sel.path).file}
        </p>
      )}
      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state}-${sel?.id ?? ""}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="flex flex-1 flex-col"
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}



const InspectionPanel = memo(InspectionPanelInternal);

export function VideoTab({ vc, hw }: { vc: VideoConverter; hw: HwState }) {
  const hover = useTauriDrop(vc.addFiles);
  const running = vc.running;
  const mode = vc.mode;
  const handleSelect = useCallback((id: string) => vc.select(id), [vc.select]);
  const handleRemove = useCallback((id: string) => vc.removeItem(id), [vc.removeItem]);

  const [presetsOpen, setPresetsOpen] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryTab | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  const handleOpenPreview = useCallback((it: QueueItem) => {
    setPreviewTarget({
      type: "video",
      title: splitPath(it.path).file,
      originalPath: it.path,
      outputPath: it.output ?? null,
      originalSize: it.meta?.sizeBytes ?? undefined,
      outputSize: it.outputBytes ?? undefined,
    });
  }, []);

  useEffect(() => {
    if (!glossary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossary(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossary]);

  const locked = running || !vc.hasSelection;
  const formatLocked = locked || mode === "audio";
  const encodeLocked = locked || mode !== "encode";
  const qualityLocked = encodeLocked || vc.targetSizeMb !== null;

  const accel = accelFor(hw.profile, vc.codec, vc.forceCpu);
  const activePreset = VIDEO_PRESETS.find((p) => p.id === vc.presetId) ?? null;
  const selMeta = vc.selected?.meta ?? null;
  const copyWarn = mode === "copy" ? copyWarning(selMeta, vc.format, vc.mute) : null;

  const effDuration = vc.selected ? getEffectiveDuration(selMeta, vc.selected.settings) : null;
  const tStartParsed = parseTimeInput(vc.trimStart);
  const tEndParsed = parseTimeInput(vc.trimEnd);
  const trimInvalid =
    Number.isNaN(tStartParsed) ||
    Number.isNaN(tEndParsed) ||
    (tStartParsed !== null && tEndParsed !== null && tEndParsed <= tStartParsed) ||
    (tStartParsed !== null && selMeta?.durationSecs != null && tStartParsed >= selMeta.durationSecs);

  const targetKbps =
    vc.targetSizeMb && effDuration && effDuration > 0
      ? targetVideoKbps(vc.targetSizeMb, effDuration, !!selMeta?.audio && !vc.mute)
      : null;

  const ready = vc.items.filter((i) => i.metaState === "ready");
  const todo = ready.filter((i) => i.status !== "done");
  const anyLoading = vc.items.some((i) => i.metaState === "loading");
  const startLabel = running
    ? "Convirtiendo…"
    : todo.length === 0 && ready.length > 0
      ? "Convertir de nuevo"
      : todo.length > 1
        ? `Convertir ${todo.length} videos`
        : "Convertir video";

  const current = vc.current;
  const cur = current?.progress ?? null;
  const curPct = cur?.percent ?? null;
  const curTotal = current ? getEffectiveDuration(current.meta, current.settings) : null;
  const curElapsed = current ? vc.elapsedOf(current) : 0;
  const curProcessed = cur?.processedSecs ?? 0;
  const curEta = current ? estimateEta(curPct, curElapsed, cur?.speed ?? null, curProcessed, curTotal) : null;
  const speed = cur?.speed && cur.speed !== "N/A" ? cur.speed : "—";

  const finished = vc.items.filter((i) => i.status === "done").length;
  const failed = vc.items.filter((i) => i.status === "error");
  const cancelled = vc.items.filter((i) => i.status === "cancelled").length;
  const showProgress = running || finished + failed.length + cancelled > 0;

  const sv = selMeta?.video ?? null;
  const options = useMemo(() => (sv ? resolutionOptions(sv.width, sv.height) : []), [sv?.width, sv?.height]);
  const aspect = useMemo(() => (sv ? detectAspect(sv.width, sv.height) : null), [sv?.width, sv?.height]);
  const target = useMemo(() => (vc.selected ? resolveTarget(vc.selected.meta, vc.resolution) : null), [vc.selected?.meta, vc.resolution]);
  const selectedOpt = useMemo(() => (target ? options.find((o) => o.width === target.width && o.height === target.height) ?? null : null), [target, options]);
  const resIds = useMemo(() => ["original", ...options.map((o) => o.id)], [options]);
  const resLabels = useMemo<Record<string, string>>(() => ({
    original: "Original",
    ...Object.fromEntries(options.map((o) => [o.id, o.label])),
  }), [options]);

  const compactNoLabel =
    "[&_button]:px-3.5 [&_button]:py-1.5 [&_button]:text-sm [&>div>span:first-child]:hidden";

  return (
    <div className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* ───── Columna 1: videos de origen → acciones → progreso ───── */}
        <Card data-drop-zone="true" className="flex flex-col gap-5">
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <Step n={1}>Videos de origen</Step>
              {vc.items.length > 0 && (
                <button
                  type="button"
                  disabled={running}
                  onClick={vc.pick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/15 disabled:opacity-40"
                >
                  <Plus size={14} /> Añadir
                </button>
              )}
            </div>

            {vc.items.length > 0 && (
              <p className="text-xs text-slate-500">
                Haz clic en un video para ver y editar <span className="text-slate-300">sus propias opciones</span>. Cada
                uno se convierte con la configuración que le asignes.
              </p>
            )}

            {/* Carpeta de salida (del video seleccionado) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Carpeta de salida</span>
                {vc.selected && (
                  <span className="min-w-0 truncate text-[11px] text-indigo-300/80" title={vc.selected.path}>
                    para «{splitPath(vc.selected.path).file}»
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 text-sm text-slate-300"
                  title={vc.outputDir ?? undefined}
                >
                  {vc.outputDir ?? <span className="text-slate-500">Misma carpeta que el origen</span>}
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={vc.pickOutputDir}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#23284f]/70 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FolderOpen size={15} /> Examinar
                </button>
                {vc.outputDir && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={vc.clearOutputDir}
                    className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                    aria-label="Volver a la carpeta del origen"
                    title="Volver a la carpeta del origen"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {vc.items.length === 0 ? (
              <div className="flex flex-1 flex-col [&>*]:flex-1">
                <DropZone
                  hover={hover}
                  disabled={running}
                  onBrowse={vc.pick}
                  icon={<UploadCloud size={28} />}
                  title="Arrastra uno o varios videos aquí, o haz clic para elegirlos"
                  subtitle="MP4, MKV, MOV, AVI, WebM…"
                />
              </div>
            ) : (
              <div
                className={`min-h-[200px] flex-1 rounded-2xl border-2 border-dashed p-2 transition-colors ${
                  hover ? "border-indigo-500 bg-indigo-600/10" : "border-transparent"
                }`}
              >
                {hover && <p className="pb-2 text-center text-xs text-indigo-300">Suelta aquí para añadirlos a la cola</p>}
                <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                  <AnimatePresence initial={false}>
                    {vc.items.map((it) => (
                      <QueueRow
                        key={it.id}
                        it={it}
                        selected={vc.selected?.id === it.id}
                        locked={running}
                        onSelect={handleSelect}
                        onRemove={handleRemove}
                        onPreview={handleOpenPreview}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            )}
          </section>

          {/* Acciones */}
          <div className="flex flex-wrap gap-3">
            <GradientButton onClick={vc.start} disabled={vc.items.length === 0 || anyLoading || !!hw.error} loading={running}>
              {startLabel}
            </GradientButton>
            {running && (
              <motion.button
                type="button"
                onClick={vc.cancel}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-7 py-3.5 text-base font-semibold text-red-300 transition-colors hover:bg-red-500/20"
              >
                <Square size={15} className="fill-current" /> Cancelar
              </motion.button>
            )}
            <SecondaryButton onClick={vc.clear} disabled={running || vc.items.length === 0}>
              Limpiar
            </SecondaryButton>
          </div>

          {/* Progreso y resumen */}
          <AnimatePresence>
            {showProgress && (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="space-y-4 border-t border-[#1e293b] pt-5"
              >
                {running && current ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-200">
                        Convirtiendo: {splitPath(current.path).file}
                      </span>
                      <span className="flex items-center gap-2">
                        {vc.runInfo && vc.runInfo.total > 1 && (
                          <span className="rounded-lg bg-indigo-600/20 px-2 py-0.5 text-xs font-semibold text-indigo-200">
                            Video {Math.min(vc.runInfo.done + 1, vc.runInfo.total)} de {vc.runInfo.total}
                          </span>
                        )}
                        {cur && (
                          <span className="rounded-lg bg-[#23284f]/60 px-2 py-0.5 font-mono text-xs text-slate-400">
                            {cur.encoder}
                          </span>
                        )}
                      </span>
                    </div>

                    <ProgressBar value={curPct} />
                    <div className="grid grid-cols-2 gap-3">
                      <Stat label="Progreso" value={curPct !== null ? `${curPct.toFixed(1)}%` : "—"} />
                      <Stat label="Velocidad" value={speed} />
                      <Stat label="Transcurrido" value={formatTime(curElapsed)} />
                      <Stat label="Restante" value={curEta !== null ? formatTime(curEta) : "—"} />
                    </div>
                    <p className="text-xs text-slate-500">
                      Video procesado: {formatTime(curProcessed)}
                      {curTotal ? ` de ${formatTime(curTotal)}` : ""}
                    </p>

                    {vc.runInfo && vc.runInfo.total > 1 && vc.overallPct !== null && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Progreso total de la cola</span>
                          <span className="font-mono text-slate-300">{vc.overallPct.toFixed(0)}%</span>
                        </div>
                        <ProgressBar value={vc.overallPct} />
                      </div>
                    )}
                  </>
                ) : (
                  <Notice tone={failed.length || cancelled ? "warn" : "ok"}>
                    {finished} completado{finished === 1 ? "" : "s"}
                    {failed.length > 0 && ` · ${failed.length} con error`}
                    {cancelled > 0 && ` · ${cancelled} cancelado${cancelled === 1 ? "" : "s"}`}
                    {cancelled > 0 && " · pulsa Convertir para continuar con los pendientes"}
                  </Notice>
                )}

                {vc.items.some((i) => i.fellBack) && (
                  <Notice tone="warn">
                    El encoder por hardware falló con algún archivo; se reintentó automáticamente por CPU.
                  </Notice>
                )}

                {!running &&
                  failed.map((it) => (
                    <Notice key={it.id} tone="error">
                      <p className="font-semibold">{splitPath(it.path).file}</p>
                      <pre className="mt-1 whitespace-pre-wrap font-sans">{it.error}</pre>
                    </Notice>
                  ))}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* ───── Columna 2: opciones de salida del video SELECCIONADO ───── */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Step n={2}>Opciones de salida · por video</Step>
            <button
              type="button"
              onClick={() => setGlossary((g) => (g ? null : "format"))}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#23284f]/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-[#23284f]/80"
            >
              <BookOpen size={14} /> Glosario
            </button>
          </div>

          {/* Aclara a qué video pertenecen estas opciones */}
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              {vc.selected ? "Configurando solo este video" : "Ningún video seleccionado"}
            </p>
            {vc.selected && (
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={vc.selected.path}>
                {splitPath(vc.selected.path).file}
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {vc.selected
                ? "Cada video tiene sus propias opciones (incluida la carpeta de salida): selecciona otro en la lista para configurarlo por separado."
                : "Añade un video para configurar sus opciones."}
            </p>
            {vc.items.length > 1 && (
              <button
                type="button"
                disabled={running}
                onClick={vc.applyToAll}
                title="Copia estas opciones a todos los videos de la cola"
                className="mt-2.5 inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aplicar estas opciones a todos los videos
              </button>
            )}
          </div>

          {/* Presets: acordeón colapsado por defecto */}
          <div>
            <button
              type="button"
              onClick={() => setPresetsOpen((o) => !o)}
              aria-expanded={presetsOpen}
              aria-controls="presets-panel"
              className="flex w-full items-center justify-between gap-3 rounded-lg py-0.5 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Preset rápido</span>
                {activePreset && (
                  <span className="truncate rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                    {activePreset.name}
                  </span>
                )}
              </span>
              <motion.span
                animate={{ rotate: presetsOpen ? 180 : 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="shrink-0 text-slate-400"
              >
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {presetsOpen && (
                <motion.div
                  id="presets-panel"
                  key="presets"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 pt-3">
                    {VIDEO_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={locked}
                        title={p.hint}
                        onClick={() => vc.applyPreset(p)}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          vc.presetId === p.id
                            ? "border-indigo-500/60 bg-indigo-600/20 text-indigo-200"
                            : "border-[#23284f] bg-[#23284f]/40 text-slate-300 hover:bg-[#23284f]/80"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Modos especiales y silencio */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Toggle
              checked={vc.remuxCopy}
              onChange={vc.setRemuxCopy}
              disabled={locked}
              title="Copiar sin recodificar"
              hint="Cambia contenedor o recorta al instante sin perder calidad."
            />
            <Toggle
              checked={vc.extractAudioMp3}
              onChange={vc.setExtractAudioMp3}
              disabled={locked}
              title="Extraer solo audio"
              hint="Descarta el video y guarda un .mp3 de alta calidad."
            />
            <Toggle
              checked={vc.mute}
              onChange={vc.setMute}
              disabled={locked || mode === "audio"}
              title="Silenciar video"
              hint="Elimina la pista de audio (-an) para clips de web o redes."
            />
          </div>

          <AnimatePresence initial={false} mode="wait">
            {mode === "copy" && (
              <motion.div
                key="copy"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3"
              >
                <p className="text-sm font-semibold text-emerald-200">Remux instantáneo sin pérdida ni consumo de GPU/CPU</p>
                <p className="mt-0.5 text-xs leading-relaxed text-emerald-300/80">
                  Solo cambia el contenedor a {FORMAT_LABEL[vc.format]} (admite recorte y silenciar). Códec, calidad y resolución no se aplican.
                </p>
                {copyWarn && <p className="mt-1.5 text-xs text-amber-300">{copyWarn}</p>}
              </motion.div>
            )}
            {mode === "audio" && (
              <motion.div
                key="audio"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3"
              >
                <p className="text-sm font-semibold text-indigo-200">Solo audio · se guardará como .mp3</p>
                <p className="mt-0.5 text-xs leading-relaxed text-indigo-300/80">
                  MP3 de alta calidad (VBR, ≈ {MP3_KBPS} kbps). También puedes usar el recorte por tiempo debajo.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recorte rápido por tiempo (Trim / Cut) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
                <Scissors size={13} className="text-indigo-400" /> Recorte por tiempo (opcional)
              </span>
              {(vc.trimStart || vc.trimEnd) && !locked && (
                <button
                  type="button"
                  onClick={vc.clearTrim}
                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
                >
                  Restablecer recorte
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Inicio</span>
                <input
                  type="text"
                  placeholder="00:00"
                  value={vc.trimStart}
                  disabled={locked}
                  onChange={(e) => vc.setTrimStart(e.target.value)}
                  className="w-24 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 font-mono text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500/60 disabled:opacity-40"
                />
              </div>
              <span className="text-slate-600">→</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Fin</span>
                <input
                  type="text"
                  placeholder={selMeta?.durationSecs ? formatTime(selMeta.durationSecs) : "Fin"}
                  value={vc.trimEnd}
                  disabled={locked}
                  onChange={(e) => vc.setTrimEnd(e.target.value)}
                  className="w-24 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 font-mono text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500/60 disabled:opacity-40"
                />
              </div>
              {selMeta?.durationSecs && !trimInvalid && (vc.trimStart.trim() || vc.trimEnd.trim()) && effDuration !== null && (
                <span className="rounded-lg bg-indigo-500/15 px-2.5 py-1 font-mono text-xs text-indigo-300">
                  Duración: {formatTime(effDuration)}
                </span>
              )}
            </div>
            {trimInvalid && (
              <p className="mt-1.5 text-xs text-amber-300">
                Verifica el rango: usa formato MM:SS o HH:MM:SS y asegúrate de que el fin sea mayor que el inicio.
              </p>
            )}
          </div>

          {/* Formato y códec, cada uno con su botón «?» que abre el glosario */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
            <div>
              <LabelWithHelp
                label="Formato"
                active={glossary === "format"}
                onHelp={() => setGlossary((g) => (g === "format" ? null : "format"))}
              />
              <div className={compactNoLabel}>
                <Segmented label="" value={vc.format} options={VIDEO_FORMATS} labels={FORMAT_LABEL} onChange={vc.setFormat} disabled={formatLocked} />
              </div>
            </div>
            <div>
              <LabelWithHelp
                label="Códec"
                active={glossary === "codec"}
                onHelp={() => setGlossary((g) => (g === "codec" ? null : "codec"))}
              />
              <div className={compactNoLabel}>
                <Segmented label="" value={vc.codec} options={VIDEO_CODECS} labels={CODEC_LABEL} onChange={vc.setCodec} disabled={encodeLocked} />
              </div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {vc.note && (
              <motion.p
                key={vc.note}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300"
              >
                {vc.note}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Resolución de salida: opciones según la relación de aspecto de este video */}
          <div className="[&_button]:px-3.5 [&_button]:py-1.5 [&_button]:text-sm">
            {sv && aspect ? (
              options.length > 0 ? (
                <>
                  <Segmented
                    label="Resolución de salida"
                    value={selectedOpt ? selectedOpt.id : "original"}
                    options={resIds}
                    labels={resLabels}
                    onChange={vc.setResolution}
                    disabled={encodeLocked}
                  />
                  {mode === "encode" && (
                    <p className="mt-2 text-xs text-slate-500">
                      Relación de aspecto <span className="text-slate-300">{aspect.label}</span> · Salida de este video:{" "}
                      <span className="font-mono text-indigo-300">
                        {selectedOpt
                          ? `${selectedOpt.width}×${selectedOpt.height}${selectedOpt.name ? ` (${selectedOpt.name})` : ""}`
                          : `${sv.width}×${sv.height} (original)`}
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span className={LABEL}>Resolución de salida</span>
                  <p className="text-xs text-slate-500">
                    Este video ya tiene una resolución baja ({sv.width}×{sv.height}), no hay tamaños menores disponibles.
                  </p>
                </>
              )
            ) : (
              <>
                <span className={LABEL}>Resolución de salida</span>
                <p className="text-xs text-slate-500">
                  Selecciona un video para ver las resoluciones disponibles según su relación de aspecto.
                </p>
              </>
            )}
          </div>

          {/* Calidad y tamaño objetivo: el tamaño objetivo anula el slider */}
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Calidad de video</span>
                <span className="font-mono text-sm text-indigo-300">
                  {mode === "encode" && vc.targetSizeMb !== null ? "anulada" : `${vc.quality}%`}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={vc.quality}
                disabled={qualityLocked}
                onChange={(e) => vc.setQuality(Number(e.target.value))}
                className="h-2 w-full cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>Menor tamaño</span>
                <span className="font-mono">
                  {encoderName(accel, vc.codec)} · {nativeQuality(accel, vc.codec, vc.quality)}
                </span>
                <span>Mayor calidad</span>
              </div>
            </div>

            <div>
              <span className={LABEL}>Tamaño objetivo (opcional)</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    step="any"
                    inputMode="decimal"
                    placeholder="Ej. 25"
                    value={vc.targetSizeMb ?? ""}
                    disabled={encodeLocked}
                    onChange={(e) => vc.setTargetSizeMb(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-28 rounded-xl border border-[#23284f] bg-[#0e1122]/80 py-2 pl-3 pr-10 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">MB</span>
                </div>
                {[10, 25, 50, 100].map((mb) => (
                  <button
                    key={mb}
                    type="button"
                    disabled={encodeLocked}
                    onClick={() => vc.setTargetSizeMb(vc.targetSizeMb === mb ? null : mb)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      vc.targetSizeMb === mb
                        ? "border-indigo-500/60 bg-indigo-600/20 text-indigo-200"
                        : "border-[#23284f] bg-[#23284f]/40 text-slate-300 hover:bg-[#23284f]/80"
                    }`}
                  >
                    {mb} MB
                  </button>
                ))}
                {vc.targetSizeMb !== null && !encodeLocked && (
                  <button
                    type="button"
                    onClick={() => vc.setTargetSizeMb(null)}
                    className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
                    aria-label="Quitar tamaño objetivo"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {mode === "encode" && targetKbps !== null && (
                <p className={`mt-1.5 text-xs ${targetKbps < MIN_VIDEO_KBPS ? "text-amber-300" : "text-slate-500"}`}>
                  {targetKbps < MIN_VIDEO_KBPS
                    ? "Demasiado pequeño para la duración de este video: sube el tamaño objetivo."
                    : `Video ≈ ${Math.round(targetKbps)} kbps + audio ${selMeta?.audio && !vc.mute ? AUDIO_KBPS : 0} kbps`}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ───── Columna 3: inspección del video seleccionado ───── */}
        <InspectionPanel vc={vc} hw={hw} />
      </div>

      {/* ───── Barra inferior izquierda: Estado de aceleración por hardware ───── */}
      <div className="flex items-center justify-start pt-1">
        <HwBadge hw={hw} codec={vc.codec} mode={mode} forceCpu={vc.forceCpu} />
      </div>

      {/* Glosario multimedia (panel lateral flotante) */}
      <GlossaryDrawer
        tab={glossary}
        onTab={setGlossary}
        onClose={() => setGlossary(null)}
        format={vc.format}
        codec={vc.codec}
      />

      {/* Modal interactivo de Vista Previa y Comparación */}
      {previewTarget && (
        <PreviewModal
          target={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
``

## src/hooks/tauri.ts

``typescript
import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Suscripción a un evento de Tauri con limpieza segura (compatible con StrictMode). */
export function useTauriEvent<T>(name: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;
    listen<T>(name, (e) => ref.current(e.payload)).then((f) => {
      if (cancelled) f();
      else un = f;
    });
    return () => {
      cancelled = true;
      un?.();
    };
  }, [name]);
}

/**
 * Drag & drop nativo con restricción espacial:
 * - El estado hover solo se activa si el cursor está sobre la zona designada ([data-drop-zone="true"]).
 * - Pasa (paths, isInside) al callback para que los archivos compatibles solo se añadan si cayeron en la zona,
 *   mientras que los archivos incompatibles disparan la notificación de advertencia correspondiente.
 */
export function useTauriDrop(onDrop: (paths: string[], isInside: boolean) => void) {
  const [hover, setHover] = useState(false);
  const ref = useRef(onDrop);
  ref.current = onDrop;
  const hoverRef = useRef(false);

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;

    const isInsideDropZone = (pos?: { x: number; y: number }): boolean => {
      if (!pos) return false;
      const zones = Array.from(document.querySelectorAll<HTMLElement>('[data-drop-zone="true"]'));
      if (zones.length === 0) return true;

      const dpr = window.devicePixelRatio || 1;
      const candidates = [
        { x: pos.x, y: pos.y },
        { x: pos.x / dpr, y: pos.y / dpr },
      ];

      for (const { x, y } of candidates) {
        for (const zone of zones) {
          const rect = zone.getBoundingClientRect();
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
          }
        }
        const el = document.elementFromPoint(x, y);
        if (el?.closest('[data-drop-zone="true"]')) {
          return true;
        }
      }

      return false;
    };

    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") {
          const inside = isInsideDropZone(p.position);
          hoverRef.current = inside;
          setHover(inside);
        } else if (p.type === "drop") {
          const inside = hoverRef.current || isInsideDropZone(p.position);
          hoverRef.current = false;
          setHover(false);
          ref.current(p.paths, inside);
        } else {
          hoverRef.current = false;
          setHover(false);
        }
      })
      .then((f) => {
        if (cancelled) f();
        else un = f;
      });

    return () => {
      cancelled = true;
      un?.();
    };
  }, []);

  return hover;
}
``

## src/hooks/useAppSettings.ts

``typescript
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocFormat, ImgFormat, ImgScale, VideoCodec, VideoFormat } from "../types";
import { playCompletionChime } from "../lib/utils";
import type { ImageMode } from "./useImageConverter";
import type { DocMode } from "./useDocConverter";

export interface SavedDocPrefs {
  mode: DocMode;
  format: DocFormat;
}

const STORAGE_KEY = "multimedia-converter:settings:v1";

export type PostAction = "none" | "sound" | "open_folder" | "both";
export type ThreadMode = "auto" | "half" | "two";

export interface SavedVideoPrefs {
  format: VideoFormat;
  codec: VideoCodec;
  quality: number;
  resolution: string;
  remuxCopy: boolean;
  extractAudioMp3: boolean;
  mute: boolean;
}

export interface SavedImagePrefs {
  mode: ImageMode;
  format: ImgFormat;
  quality: number;
  scale: ImgScale;
}

export interface AppSettingsData {
  accentHex: string;
  defaultOutputDir: string | null;
  rememberLastSettings: boolean;
  customSuffix: string;
  stripSuffix: string;
  omitSuffixInCustomDir: boolean;
  onCompleteAction: PostAction;
  notifyOnComplete: boolean;
  overwriteExisting: boolean;
  forceCpu: boolean;
  threadMode: ThreadMode;
  lastVideo: SavedVideoPrefs | null;
  lastImage: SavedImagePrefs | null;
  lastDoc: SavedDocPrefs | null;
}

const DEFAULT_APP_SETTINGS: AppSettingsData = {
  accentHex: "#6366f1",
  defaultOutputDir: null,
  rememberLastSettings: true,
  customSuffix: "convertido",
  stripSuffix: "sin_metadatos",
  omitSuffixInCustomDir: false,
  onCompleteAction: "none",
  notifyOnComplete: true,
  overwriteExisting: false,
  forceCpu: false,
  threadMode: "auto",
  lastVideo: null,
  lastImage: null,
  lastDoc: null,
};

export const ACCENT_PRESETS = [
  { id: "indigo", name: "Índigo", hex: "#6366f1" },
  { id: "blue", name: "Azul", hex: "#3b82f6" },
  { id: "cyan", name: "Cian", hex: "#06b6d4" },
  { id: "emerald", name: "Esmeralda", hex: "#10b981" },
  { id: "amber", name: "Ámbar", hex: "#f59e0b" },
  { id: "rose", name: "Rosa", hex: "#f43f5e" },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [99, 102, 241];
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: [number, number, number], b: [number, number, number], weightB: number): string {
  const wA = 1 - weightB;
  const r = Math.round(a[0] * wA + b[0] * weightB);
  const g = Math.round(a[1] * wA + b[1] * weightB);
  const bl = Math.round(a[2] * wA + b[2] * weightB);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Inyecta toda la escala derivada de un color Hex/RGB en las variables CSS de `:root` (sin re-renderizar React). */
export function applyAccentPalette(hex: string) {
  const rgb = hexToRgb(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [10, 14, 26];
  const secRgb: [number, number, number] = [
    Math.min(255, Math.round(rgb[0] * 0.85 + 35)),
    Math.max(0, Math.round(rgb[1] * 0.78)),
    Math.min(255, Math.round(rgb[2] * 0.95 + 15)),
  ];

  const root = document.documentElement;
  root.style.setProperty("--accent-rgb", `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
  root.style.setProperty("--accent-sec-rgb", `${secRgb[0]}, ${secRgb[1]}, ${secRgb[2]}`);
  root.style.setProperty("--accent-200", mixRgb(rgb, white, 0.62));
  root.style.setProperty("--accent-300", mixRgb(rgb, white, 0.42));
  root.style.setProperty("--accent-400", mixRgb(rgb, white, 0.22));
  root.style.setProperty("--accent-500", mixRgb(rgb, white, 0.0));
  root.style.setProperty("--accent-600", mixRgb(rgb, black, 0.14));
  root.style.setProperty("--accent-700", mixRgb(rgb, black, 0.28));
  root.style.setProperty("--accent-900", mixRgb(rgb, black, 0.58));
  root.style.setProperty("--accent-sec-500", mixRgb(secRgb, white, 0.06));
  root.style.setProperty("--accent-sec-600", mixRgb(secRgb, black, 0.12));
}

function loadSettings(): AppSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettingsData>;
    return {
      accentHex: typeof parsed.accentHex === "string" ? parsed.accentHex : DEFAULT_APP_SETTINGS.accentHex,
      defaultOutputDir: typeof parsed.defaultOutputDir === "string" ? parsed.defaultOutputDir : null,
      rememberLastSettings:
        typeof parsed.rememberLastSettings === "boolean"
          ? parsed.rememberLastSettings
          : DEFAULT_APP_SETTINGS.rememberLastSettings,
      customSuffix: typeof parsed.customSuffix === "string" ? parsed.customSuffix : DEFAULT_APP_SETTINGS.customSuffix,
      stripSuffix: typeof parsed.stripSuffix === "string" ? parsed.stripSuffix : DEFAULT_APP_SETTINGS.stripSuffix,
      omitSuffixInCustomDir:
        typeof parsed.omitSuffixInCustomDir === "boolean"
          ? parsed.omitSuffixInCustomDir
          : DEFAULT_APP_SETTINGS.omitSuffixInCustomDir,
      onCompleteAction:
        parsed.onCompleteAction === "sound" ||
        parsed.onCompleteAction === "open_folder" ||
        parsed.onCompleteAction === "both"
          ? parsed.onCompleteAction
          : "none",
      notifyOnComplete:
        typeof parsed.notifyOnComplete === "boolean"
          ? parsed.notifyOnComplete
          : DEFAULT_APP_SETTINGS.notifyOnComplete,
      overwriteExisting:
        typeof parsed.overwriteExisting === "boolean"
          ? parsed.overwriteExisting
          : DEFAULT_APP_SETTINGS.overwriteExisting,
      forceCpu: typeof parsed.forceCpu === "boolean" ? parsed.forceCpu : DEFAULT_APP_SETTINGS.forceCpu,
      threadMode:
        parsed.threadMode === "half" || parsed.threadMode === "two" ? parsed.threadMode : DEFAULT_APP_SETTINGS.threadMode,
      lastVideo: parsed.lastVideo ?? null,
      lastImage: parsed.lastImage ?? null,
      lastDoc: parsed.lastDoc ?? null,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export type AppSettings = ReturnType<typeof useAppSettings>;

export function useAppSettings() {
  const [data, setData] = useState<AppSettingsData>(loadSettings);

  // Aplica la paleta inmediatamente
  useEffect(() => {
    applyAccentPalette(data.accentHex);
  }, [data.accentHex]);

  // Guarda en localStorage inmediatamente ante cualquier cambio
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignorar si el almacenamiento está bloqueado
    }
  }, [data]);

  const setAccentHex = useCallback((hex: string) => {
    setData((prev) => (prev.accentHex === hex ? prev : { ...prev, accentHex: hex }));
  }, []);

  const setDefaultOutputDir = useCallback((dir: string | null) => {
    setData((prev) => ({ ...prev, defaultOutputDir: dir }));
  }, []);

  const pickDefaultOutputDir = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setData((prev) => ({ ...prev, defaultOutputDir: sel }));
    }
  }, []);

  const setRememberLastSettings = useCallback((on: boolean) => {
    setData((prev) => ({
      ...prev,
      rememberLastSettings: on,
      lastVideo: on ? prev.lastVideo : null,
      lastImage: on ? prev.lastImage : null,
      lastDoc: on ? prev.lastDoc : null,
    }));
  }, []);

  const setCustomSuffix = useCallback((val: string) => {
    setData((prev) => ({ ...prev, customSuffix: val }));
  }, []);

  const setStripSuffix = useCallback((val: string) => {
    setData((prev) => ({ ...prev, stripSuffix: val }));
  }, []);

  const setOmitSuffixInCustomDir = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, omitSuffixInCustomDir: on }));
  }, []);

  const setOnCompleteAction = useCallback((action: PostAction) => {
    setData((prev) => ({ ...prev, onCompleteAction: action }));
  }, []);

  const setNotifyOnComplete = useCallback((val: boolean) => {
    setData((prev) => ({ ...prev, notifyOnComplete: val }));
  }, []);

  const setOverwriteExisting = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, overwriteExisting: on }));
  }, []);

  const setForceCpu = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, forceCpu: on }));
  }, []);

  const setThreadMode = useCallback((mode: ThreadMode) => {
    setData((prev) => ({ ...prev, threadMode: mode }));
  }, []);

  const recordLastVideo = useCallback((prefs: SavedVideoPrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastVideo: prefs } : prev));
  }, []);

  const recordLastImage = useCallback((prefs: SavedImagePrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastImage: prefs } : prev));
  }, []);

  const recordLastDoc = useCallback((prefs: SavedDocPrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastDoc: prefs } : prev));
  }, []);

  const resolveSuffix = useCallback(
    (isStrip: boolean, hasCustomOutDir: boolean) => {
      if (hasCustomOutDir && data.omitSuffixInCustomDir) return "";
      const raw = isStrip ? data.stripSuffix.trim() : data.customSuffix.trim();
      return raw || (isStrip ? "sin_metadatos" : "convertido");
    },
    [data.customSuffix, data.stripSuffix, data.omitSuffixInCustomDir],
  );

  const runPostAction = useCallback(
    (firstOutputPath: string | null, details?: { title?: string; message?: string }) => {
      if (data.onCompleteAction === "sound" || data.onCompleteAction === "both") {
        playCompletionChime();
      }
      if ((data.onCompleteAction === "open_folder" || data.onCompleteAction === "both") && firstOutputPath) {
        revealItemInDir(firstOutputPath).catch(() => {});
      }
      if (data.notifyOnComplete) {
        invoke("notify_completion_if_unfocused", {
          title: details?.title ?? "Conversor Multimedia",
          message: details?.message ?? "¡La conversión ya está lista!",
        }).catch(() => {});
      }
    },
    [data.onCompleteAction, data.notifyOnComplete],
  );

  const testNotification = useCallback(() => {
    invoke("notify_completion_if_unfocused", {
      title: "Conversor Multimedia",
      message: "¡Notificación de prueba con el icono oficial!",
      force: true,
    }).catch(() => {});
  }, []);

  const resetAllSettings = useCallback(() => {
    setData(DEFAULT_APP_SETTINGS);
  }, []);

  return {
    ...data,
    setAccentHex,
    setDefaultOutputDir,
    pickDefaultOutputDir,
    setRememberLastSettings,
    setCustomSuffix,
    setStripSuffix,
    setOmitSuffixInCustomDir,
    setOnCompleteAction,
    setNotifyOnComplete,
    setOverwriteExisting,
    setForceCpu,
    setThreadMode,
    recordLastVideo,
    recordLastImage,
    recordLastDoc,
    resolveSuffix,
    runPostAction,
    testNotification,
    resetAllSettings,
  };
}
``

## src/hooks/useDocConverter.ts

``typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DocFormat, DocJob, DocMetadata, DocProgress, DocResult, IncompatibleHandler, JobStatus } from "../types";
import { DOC_EXTS, buildDest, splitPath } from "../lib/utils";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

export type DocMode = "convert" | "strip" | "merge";

export interface DocQueueItem {
  id: string;
  path: string;
  meta: DocMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  targetFormat?: DocFormat;
}

export type DocConverter = ReturnType<typeof useDocConverter>;

export function useDocConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const saved = appSettings.rememberLastSettings ? appSettings.lastDoc : null;

  const [items, setItems] = useState<DocQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mode, setModeState] = useState<DocMode>(() => saved?.mode ?? "convert");
  const [format, setFormatState] = useState<DocFormat>(() => saved?.format ?? "pdf");
  const [isIndividual, setIsIndividualState] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(() => appSettings.defaultOutputDir);

  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState<DocProgress | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  useEffect(() => {
    setOutputDir(appSettings.defaultOutputDir);
  }, [appSettings.defaultOutputDir]);

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const effectiveFormat = (isIndividual && selected?.targetFormat) ? selected.targetFormat : format;

  useTauriEvent<DocProgress>("doc-progress", (p) => {
    if (busy.current) setProgress(p);
  });

  const resetResult = () => {
    setStatus("idle");
    setProgress(null);
    setResults(null);
    setError(null);
  };

  const setMode = useCallback((m: DocMode) => {
    if (busy.current) return;
    setModeState(m);
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      const curFmt = isIndividual && selected?.targetFormat ? selected.targetFormat : format;
      cfg.recordLastDoc({ mode: m, format: curFmt });
    }
  }, [isIndividual, selected, format]);

  const setFormat = useCallback((f: DocFormat) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, targetFormat: f } : it)));
    } else {
      setFormatState(f);
      setItems((prev) => prev.map((it) => ({ ...it, targetFormat: f })));
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastDoc({ mode, format: f });
    }
  }, [isIndividual, selected, mode]);

  const setIsIndividual = useCallback((val: boolean) => {
    if (busy.current) return;
    setIsIndividualState(val);
    if (val) {
      setItems((prev) => prev.map((it) => ({ ...it, targetFormat: it.targetFormat ?? format })));
    }
    resetResult();
  }, [format]);

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const curItem = itemsRef.current.find((i) => i.id === selected?.id) ?? selected;
    const curFmt = curItem?.targetFormat ?? format;
    setFormatState(curFmt);
    setItems((prev) => prev.map((it) => ({ ...it, targetFormat: curFmt })));
    setIsIndividualState(false);
    resetResult();
  }, [selected, format]);

  const pickOutputDir = useCallback(async () => {
    if (busy.current) return;
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setOutputDir(sel);
      resetResult();
    }
  }, []);

  const clearOutputDir = useCallback(() => {
    if (busy.current) return;
    setOutputDir(null);
    resetResult();
  }, []);

  const patch = useCallback((id: string, p: Partial<DocQueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<DocMetadata>("get_doc_metadata", { source: path });
        patch(id, { meta: m, metaState: "ready", metaError: null });
      } catch (e) {
        patch(id, { metaState: "error", metaError: String(e) });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (paths: string[], isInside = true) => {
      if (busy.current) return;
      const known = new Set(itemsRef.current.map((i) => i.path.toLowerCase()));
      const fresh: DocQueueItem[] = [];
      const rejected: string[] = [];
      const isMerge = modeRef.current === "merge";

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (isMerge ? ext !== "pdf" : !DOC_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);

        fresh.push({
          id: `doc-${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          meta: null,
          metaState: "loading",
          metaError: null,
          targetFormat: format,
        });
      }

      if (rejected.length > 0) {
        onIncompatibleRef.current?.(
          rejected,
          "doc",
          isMerge ? "El modo «Unir PDFs» solo admite archivos PDF." : undefined,
        );
      }

      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      setSelectedId((cur) => cur ?? fresh[0].id);
      resetResult();

      void (async () => {
        const queue = [...fresh];
        const concurrency = Math.min(queue.length, 4);
        const workers = Array.from({ length: concurrency }, async () => {
          while (queue.length > 0) {
            const it = queue.shift();
            if (it) await loadMeta(it.id, it.path);
          }
        });
        await Promise.all(workers);
      })();
    },
    [loadMeta, format],
  );

  const pick = useCallback(async () => {
    const isMerge = mode === "merge";
    const sel = await open({
      multiple: true,
      filters: isMerge
        ? [{ name: "Archivos PDF (*.pdf)", extensions: ["pdf"] }]
        : [{ name: "Documentos (PDF, DOCX, TXT, MD)", extensions: DOC_EXTS }],
    });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles, mode]);

  const moveItem = useCallback((id: string, direction: "up" | "down") => {
    if (busy.current) return;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    resetResult();
  }, []);

  const removeFile = useCallback((id: string) => {
    if (busy.current) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    resetResult();
  }, []);

  const clear = useCallback(() => {
    if (busy.current) return;
    setItems([]);
    setSelectedId(null);
    resetResult();
  }, []);

  const start = useCallback(async () => {
    if (!items.length || busy.current) return;
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      const curFmt = isIndividual && selected?.targetFormat ? selected.targetFormat : format;
      cfg.recordLastDoc({ mode, format: curFmt });
    }

    busy.current = true;
    setStatus("running");
    setResults(null);
    setError(null);

    const used = new Set<string>();
    const effectiveOutDir = outputDir ?? cfg.defaultOutputDir;
    const isMerge = mode === "merge";
    const isStrip = mode === "strip";
    const suffix = cfg.resolveSuffix(isStrip, Boolean(effectiveOutDir));
    const overwrite = cfg.overwriteExisting;
    const threadMode = cfg.threadMode;

    if (isMerge) {
      const pdfItems = items.filter((it) => splitPath(it.path).ext.toLowerCase() === "pdf");
      if (pdfItems.length < 2) {
        setError("Se necesitan al menos 2 archivos PDF para unir.");
        setStatus("error");
        busy.current = false;
        return;
      }
      if (pdfItems.length !== items.length) {
        setError("Solo se pueden unir archivos PDF. Quita los archivos que no sean PDF de la lista.");
        setStatus("error");
        busy.current = false;
        return;
      }

      const sources = pdfItems.map((it) => it.path);
      const mergeSuffix = cfg.resolveSuffix(false, Boolean(effectiveOutDir));
      const effectiveSuffix = mergeSuffix === "convertido" ? "unido" : mergeSuffix || "unido";
      const dest = buildDest(pdfItems[0].path, "pdf", used, effectiveSuffix, effectiveOutDir);
      setProgress({ done: 0, total: 1 });

      try {
        const result = await invoke<DocResult>("merge_pdfs", { sources, dest, overwrite });
        setResults([result]);

        if (result.ok) {
          setStatus("done");
          const totalPdfs = sources.length;
          cfg.runPostAction(result.dest, {
            title: "PDFs unidos con éxito",
            message:
              totalPdfs === 2
                ? "Se unieron los 2 archivos PDF en un solo documento."
                : `Se unieron los ${totalPdfs} archivos PDF en un solo documento.`,
          });
        } else {
          setError(result.error ?? "No se pudieron unir los archivos PDF.");
          setStatus("error");
        }
      } catch (e) {
        setError(String(e));
        setStatus("error");
      } finally {
        busy.current = false;
      }
      return;
    }

    const jobs: DocJob[] = items.map((it) => {
      const itemFmt = (isIndividual && it.targetFormat) ? it.targetFormat : format;
      return {
        source: it.path,
        dest: isStrip
          ? buildDest(it.path, splitPath(it.path).ext || "pdf", used, suffix, effectiveOutDir)
          : buildDest(it.path, itemFmt, used, suffix, effectiveOutDir),
        format: itemFmt,
      };
    });
    setProgress({ done: 0, total: jobs.length });

    try {
      const finalRes = isStrip
        ? await invoke<DocResult[]>("strip_docs_metadata", { jobs, overwrite, threadMode })
        : await invoke<DocResult[]>("convert_docs_batch", {
            jobs,
            format,
            overwrite,
            threadMode,
          });
      setResults(finalRes);
      setStatus("done");

      const firstOk = finalRes.find((r) => r.ok);
      if (firstOk) {
        const okCount = finalRes.filter((r) => r.ok).length;
        const isStrip = mode === "strip";
        const title = isStrip ? "Metadatos eliminados" : "Conversión de documentos lista";
        const msg = isStrip
          ? okCount === 1
            ? "Se eliminaron los metadatos del documento."
            : `Se eliminaron los metadatos de ${okCount} documentos.`
          : okCount === 1
            ? `El documento se ha convertido a ${format.toUpperCase()}.`
            : `Se han convertido ${okCount} documentos a ${format.toUpperCase()}.`;
        cfg.runPostAction(firstOk.dest, { title, message: msg });
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, [items, mode, format, isIndividual, outputDir]);

  return {
    items,
    selected,
    select: setSelectedId,
    mode,
    setMode,
    format: effectiveFormat,
    rawFormat: format,
    setFormat,
    isIndividual,
    setIsIndividual,
    applyToAll,
    outputDir,
    pickOutputDir,
    clearOutputDir,
    status,
    progress,
    results,
    error,
    pick,
    addFiles,
    moveItem,
    removeFile,
    clear,
    start,
  };
}
``

## src/hooks/useHwProfile.ts

``typescript
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HwProfile } from "../types";

export type HwState = ReturnType<typeof useHwProfile>;

export function useHwProfile() {
  const [profile, setProfile] = useState<HwProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HwProfile>("detect_hw_accel")
      .then(setProfile)
      .catch((e) => setError(String(e)));
  }, []);

  return { profile, error };
}
``

## src/hooks/useImageConverter.ts

``typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImageJob, ImageMetadata, ImageProgress, ImageResult, ImgFormat, ImgScale, IncompatibleHandler, JobStatus } from "../types";
import { IMAGE_EXTS, buildDest, splitPath } from "../lib/utils";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

/** convert = cambiar de formato · strip = quitar metadatos sin recodificar */
export type ImageMode = "convert" | "strip";

export interface ImageSettings {
  format: ImgFormat;
  quality: number;
  scale: ImgScale;
}

export interface ImageQueueItem {
  id: string;
  path: string;
  meta: ImageMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  settings?: ImageSettings;
}

export type ImageConverter = ReturnType<typeof useImageConverter>;

export function useImageConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const saved = appSettings.rememberLastSettings ? appSettings.lastImage : null;

  const [items, setItems] = useState<ImageQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mode, setModeState] = useState<ImageMode>(() => saved?.mode ?? "convert");
  const [format, setFormatState] = useState<ImgFormat>(() => saved?.format ?? "webp");
  const [quality, setQualityState] = useState(() => saved?.quality ?? 90);
  const [scale, setScaleState] = useState<ImgScale>(() => saved?.scale ?? "100");
  const [isIndividual, setIsIndividualState] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(() => appSettings.defaultOutputDir);

  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState<ImageProgress | null>(null);
  const [results, setResults] = useState<ImageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  useEffect(() => {
    setOutputDir(appSettings.defaultOutputDir);
  }, [appSettings.defaultOutputDir]);

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const effectiveFormat = (isIndividual && selected?.settings) ? selected.settings.format : format;
  const effectiveQuality = (isIndividual && selected?.settings) ? selected.settings.quality : quality;
  const effectiveScale = (isIndividual && selected?.settings) ? selected.settings.scale : scale;

  useTauriEvent<ImageProgress>("image-progress", (p) => {
    if (busy.current) setProgress(p);
  });

  const resetResult = () => {
    setStatus("idle");
    setProgress(null);
    setResults(null);
    setError(null);
  };

  const setMode = useCallback((m: ImageMode) => {
    if (busy.current) return;
    setModeState(m);
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode: m, format: effectiveFormat, quality: effectiveQuality, scale: effectiveScale });
    }
  }, [effectiveFormat, effectiveQuality, effectiveScale]);

  const setFormat = useCallback((f: ImgFormat) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: f,
                  quality: it.settings?.quality ?? quality,
                  scale: it.settings?.scale ?? scale,
                },
              }
            : it,
        ),
      );
    } else {
      setFormatState(f);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: f,
            quality: it.settings?.quality ?? quality,
            scale: it.settings?.scale ?? scale,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: f, quality: effectiveQuality, scale: effectiveScale });
    }
  }, [isIndividual, selected, quality, scale, mode, effectiveQuality, effectiveScale]);

  const setQuality = useCallback((q: number) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: it.settings?.format ?? format,
                  quality: q,
                  scale: it.settings?.scale ?? scale,
                },
              }
            : it,
        ),
      );
    } else {
      setQualityState(q);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: it.settings?.format ?? format,
            quality: q,
            scale: it.settings?.scale ?? scale,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: q, scale: effectiveScale });
    }
  }, [isIndividual, selected, format, scale, mode, effectiveFormat, effectiveScale]);

  const setScale = useCallback((s: ImgScale) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: it.settings?.format ?? format,
                  quality: it.settings?.quality ?? quality,
                  scale: s,
                },
              }
            : it,
        ),
      );
    } else {
      setScaleState(s);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: it.settings?.format ?? format,
            quality: it.settings?.quality ?? quality,
            scale: s,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: effectiveQuality, scale: s });
    }
  }, [isIndividual, selected, format, quality, mode, effectiveFormat, effectiveQuality]);

  const setIsIndividual = useCallback((val: boolean) => {
    if (busy.current) return;
    setIsIndividualState(val);
    if (val) {
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: it.settings ?? { format, quality, scale },
        })),
      );
    }
    resetResult();
  }, [format, quality, scale]);

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const curItem = itemsRef.current.find((i) => i.id === selected?.id) ?? selected;
    const curSettings: ImageSettings = curItem?.settings ?? { format, quality, scale };
    setFormatState(curSettings.format);
    setQualityState(curSettings.quality);
    setScaleState(curSettings.scale);
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        settings: { ...curSettings },
      })),
    );
    setIsIndividualState(false);
    resetResult();
  }, [selected, format, quality, scale]);

  const pickOutputDir = useCallback(async () => {
    if (busy.current) return;
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setOutputDir(sel);
      resetResult();
    }
  }, []);

  const clearOutputDir = useCallback(() => {
    if (busy.current) return;
    setOutputDir(null);
    resetResult();
  }, []);

  const patch = useCallback((id: string, p: Partial<ImageQueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<ImageMetadata>("get_image_metadata", { source: path });
        patch(id, { meta: m, metaState: "ready", metaError: null });
      } catch (e) {
        patch(id, { metaState: "error", metaError: String(e) });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (paths: string[], isInside = true) => {
      if (busy.current) return;
      const known = new Set(itemsRef.current.map((i) => i.path.toLowerCase()));
      const fresh: ImageQueueItem[] = [];
      const rejected: string[] = [];

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (!IMAGE_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);

        fresh.push({
          id: `img-${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          meta: null,
          metaState: "loading",
          metaError: null,
          settings: { format, quality, scale },
        });
      }

      if (rejected.length > 0) {
        onIncompatibleRef.current?.(rejected, "image");
      }

      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      setSelectedId((cur) => cur ?? fresh[0].id);
      resetResult();

      void (async () => {
        const queue = [...fresh];
        const concurrency = Math.min(queue.length, 4);
        const workers = Array.from({ length: concurrency }, async () => {
          while (queue.length > 0) {
            const it = queue.shift();
            if (it) await loadMeta(it.id, it.path);
          }
        });
        await Promise.all(workers);
      })();
    },
    [loadMeta, format, quality, scale],
  );

  const pick = useCallback(async () => {
    const sel = await open({ multiple: true, filters: [{ name: "Imágenes", extensions: IMAGE_EXTS }] });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    if (busy.current) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    resetResult();
  }, []);

  const clear = useCallback(() => {
    if (busy.current) return;
    setItems([]);
    setSelectedId(null);
    resetResult();
  }, []);

  const start = useCallback(async () => {
    if (!items.length || busy.current) return;

    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: effectiveQuality, scale: effectiveScale });
    }

    busy.current = true;
    setStatus("running");
    setResults(null);
    setError(null);

    const used = new Set<string>();
    const effectiveOutDir = outputDir ?? cfg.defaultOutputDir;
    const isStrip = mode === "strip";
    const suffix = cfg.resolveSuffix(isStrip, Boolean(effectiveOutDir));
    const overwrite = cfg.overwriteExisting;
    const threadMode = cfg.threadMode;

    const jobs: ImageJob[] = items.map((it) => {
      const s = (isIndividual && it.settings) ? it.settings : { format, quality, scale };
      const scaleNum = Number(s.scale);
      return {
        source: it.path,
        dest: isStrip
          ? buildDest(it.path, splitPath(it.path).ext || "png", used, suffix, effectiveOutDir)
          : buildDest(it.path, s.format, used, suffix, effectiveOutDir),
        format: s.format,
        quality: s.quality,
        scale: scaleNum,
      };
    });
    setProgress({ done: 0, total: jobs.length });

    try {
      let finalRes: ImageResult[] = [];
      if (isStrip) {
        finalRes = await invoke<ImageResult[]>("strip_images_metadata", {
          jobs,
          overwrite,
          threadMode,
        });
      } else if (jobs.length === 1) {
        const [j] = jobs;
        const singleRes = await invoke<ImageResult>("convert_image", {
          source: j.source,
          dest: j.dest,
          format: j.format ?? format,
          quality: j.quality ?? quality,
          scale: j.scale ?? Number(scale),
          overwrite,
        });
        finalRes = [singleRes];
      } else {
        finalRes = await invoke<ImageResult[]>("convert_images_batch", {
          jobs,
          format,
          quality,
          scale: Number(scale),
          overwrite,
          threadMode,
        });
      }
      setResults(finalRes);
      setStatus("done");

      const firstOk = finalRes.find((r) => r.ok);
      if (firstOk) {
        const okCount = finalRes.filter((r) => r.ok).length;
        const isStrip = mode === "strip";
        const title = isStrip ? "Metadatos eliminados" : "Conversión de imágenes lista";
        const msg = isStrip
          ? okCount === 1
            ? "Se eliminaron los metadatos de la imagen."
            : `Se eliminaron los metadatos de ${okCount} imágenes.`
          : okCount === 1
            ? `La imagen se ha convertido a ${format.toUpperCase()}.`
            : `Se han convertido ${okCount} imágenes a ${format.toUpperCase()}.`;
        cfg.runPostAction(firstOk.dest, { title, message: msg });
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, [items, mode, format, quality, scale, isIndividual, outputDir]);

  return {
    items,
    selected,
    select: setSelectedId,
    mode,
    setMode,
    format: effectiveFormat,
    rawFormat: format,
    setFormat,
    quality: effectiveQuality,
    rawQuality: quality,
    setQuality,
    scale: effectiveScale,
    rawScale: scale,
    setScale,
    isIndividual,
    setIsIndividual,
    applyToAll,
    outputDir,
    pickOutputDir,
    clearOutputDir,
    status,
    progress,
    results,
    error,
    pick,
    addFiles,
    removeFile,
    clear,
    start,
  };
}
``

## src/hooks/useVideoConverter.ts

``typescript
import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CODEC_LABEL,
  DEFAULT_SETTINGS,
  FORMAT_LABEL,
  PREFERRED_FORMAT,
  defaultCodecFor,
  modeOf,
  supports,
  type ConvertProgress,
  type IncompatibleHandler,
  type ConvertVideoResponse,
  type VideoCodec,
  type VideoFormat,
  type VideoMetadata,
  type VideoSettings,
} from "../types";
import { VIDEO_EXTS, buildDest, parseTimeInput, splitPath } from "../lib/utils";
import { resolveTarget } from "../lib/resolution";
import type { VideoPreset } from "../lib/presets";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

export type ItemStatus = "pending" | "running" | "done" | "error" | "cancelled";

/** Un video de la cola. El `id` también se usa como `jobId` en el backend. */
export interface QueueItem {
  id: string;
  path: string;
  settings: VideoSettings;
  meta: VideoMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  status: ItemStatus;
  progress: ConvertProgress | null;
  fellBack: boolean;
  error: string | null;
  output: string | null;
  outputBytes: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const RESET = {
  status: "pending",
  progress: null,
  error: null,
  output: null,
  outputBytes: null,
  fellBack: false,
  startedAt: null,
  finishedAt: null,
} as const;

const same = (a: VideoSettings, b: VideoSettings) => JSON.stringify(a) === JSON.stringify(b);

export type VideoConverter = ReturnType<typeof useVideoConverter>;

export function useVideoConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runInfo, setRunInfo] = useState<{ total: number; done: number } | null>(null);

  const busy = useRef(false);
  const cancelRequested = useRef(false);
  const currentId = useRef<string | null>(null);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.id ?? null;

  const patch = useCallback((id: string, p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  useTauriEvent<ConvertProgress>("convert-progress", (p) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === p.jobId ? { ...it, progress: p, fellBack: it.fellBack || p.stage === "fallback" } : it,
      ),
    );
  });

  const elapsedOf = useCallback(
    (it: QueueItem) => (it.startedAt ? ((it.finishedAt ?? Date.now()) - it.startedAt) / 1000 : 0),
    [],
  );

  /* ───── Metadatos (ffprobe) ───── */
  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<VideoMetadata>("get_video_metadata", { source: path });
        if (!m.video) {
          patch(id, { meta: m, metaState: "error", metaError: "El archivo no contiene una pista de video." });
        } else {
          patch(id, { meta: m, metaState: "ready", metaError: null });
        }
      } catch (e) {
        patch(id, { metaState: "error", metaError: String(e) });
      }
    },
    [patch],
  );

  /* ───── Gestión de la cola ───── */
  const addFiles = useCallback(
    (paths: string[], isInside = true) => {
      if (busy.current) return;
      const known = new Set(itemsRef.current.map((i) => i.path.toLowerCase()));
      const fresh: QueueItem[] = [];
      const cfg = appSettingsRef.current;
      const saved = cfg.rememberLastSettings ? cfg.lastVideo : null;

      const initialSettings: VideoSettings = {
        ...DEFAULT_SETTINGS,
        ...(saved ?? {}),
        outputDir: cfg.defaultOutputDir,
      };

      const rejected: string[] = [];

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (!VIDEO_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);
        fresh.push({
          id: `v${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          settings: { ...initialSettings },
          meta: null,
          metaState: "loading",
          metaError: null,
          status: "pending",
          progress: null,
          fellBack: false,
          error: null,
          output: null,
          outputBytes: null,
          startedAt: null,
          finishedAt: null,
        });
      }
      if (rejected.length > 0) {
        onIncompatibleRef.current?.(rejected, "video");
      }

      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      setSelectedId((cur) => cur ?? fresh[0].id);
      void (async () => {
        for (const it of fresh) await loadMeta(it.id, it.path);
      })();
    },
    [loadMeta],
  );

  const pick = useCallback(async () => {
    const sel = await open({ multiple: true, filters: [{ name: "Video", extensions: VIDEO_EXTS }] });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    if (busy.current) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    if (busy.current) return;
    setItems([]);
    setSelectedId(null);
    setRunInfo(null);
  }, []);

  /* ───── Opciones: todas editan SOLO el video seleccionado ───── */
  const updateSelected = useCallback((fn: (s: VideoSettings) => VideoSettings) => {
    if (busy.current) return;
    const id = selectedRef.current;
    if (!id) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = fn(it.settings);
        const cfg = appSettingsRef.current;
        if (cfg.rememberLastSettings) {
          cfg.recordLastVideo({
            format: next.format,
            codec: next.codec,
            quality: next.quality,
            resolution: next.resolution,
            remuxCopy: next.remuxCopy,
            extractAudioMp3: next.extractAudioMp3,
            mute: next.mute,
          });
        }
        return same(next, it.settings) ? it : { ...it, ...RESET, settings: next };
      }),
    );
  }, []);

  const setFormat = useCallback(
    (f: VideoFormat) =>
      updateSelected((s) => {
        if (s.remuxCopy || s.extractAudioMp3 || supports(f, s.codec)) {
          return { ...s, format: f, presetId: null, note: null };
        }
        const next = defaultCodecFor(f);
        return {
          ...s,
          format: f,
          codec: next,
          presetId: null,
          note: `${FORMAT_LABEL[f]} no admite ${CODEC_LABEL[s.codec]}: se cambió el códec a ${CODEC_LABEL[next]}.`,
        };
      }),
    [updateSelected],
  );

  const setCodec = useCallback(
    (c: VideoCodec) =>
      updateSelected((s) => {
        if (supports(s.format, c)) return { ...s, codec: c, presetId: null, note: null };
        const next = PREFERRED_FORMAT[c];
        return {
          ...s,
          codec: c,
          format: next,
          presetId: null,
          note: `${FORMAT_LABEL[s.format]} no admite ${CODEC_LABEL[c]}: se cambió el formato a ${FORMAT_LABEL[next]}.`,
        };
      }),
    [updateSelected],
  );

  const setQuality = useCallback(
    (q: number) => updateSelected((s) => ({ ...s, quality: q, presetId: null })),
    [updateSelected],
  );

  const setResolution = useCallback(
    (r: string) => updateSelected((s) => ({ ...s, resolution: r, presetId: null })),
    [updateSelected],
  );

  const setRemuxCopy = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        remuxCopy: on,
        extractAudioMp3: on ? false : s.extractAudioMp3,
        presetId: null,
      })),
    [updateSelected],
  );

  const setExtractAudioMp3 = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        extractAudioMp3: on,
        remuxCopy: on ? false : s.remuxCopy,
        mute: on ? false : s.mute,
        presetId: null,
      })),
    [updateSelected],
  );

  const setMute = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        mute: on,
        extractAudioMp3: on ? false : s.extractAudioMp3,
        presetId: null,
      })),
    [updateSelected],
  );

  const setTrimStart = useCallback(
    (val: string) => updateSelected((s) => ({ ...s, trimStart: val })),
    [updateSelected],
  );

  const setTrimEnd = useCallback(
    (val: string) => updateSelected((s) => ({ ...s, trimEnd: val })),
    [updateSelected],
  );

  const clearTrim = useCallback(
    () => updateSelected((s) => ({ ...s, trimStart: "", trimEnd: "" })),
    [updateSelected],
  );

  const setTargetSizeMb = useCallback(
    (mb: number | null) =>
      updateSelected((s) => ({
        ...s,
        targetSizeMb: mb !== null && Number.isFinite(mb) && mb > 0 ? mb : null,
        presetId: null,
      })),
    [updateSelected],
  );

  const pickOutputDir = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") updateSelected((s) => ({ ...s, outputDir: sel }));
  }, [updateSelected]);

  const clearOutputDir = useCallback(
    () => updateSelected((s) => ({ ...s, outputDir: null })),
    [updateSelected],
  );

  const applyPreset = useCallback(
    (p: VideoPreset) =>
      updateSelected((s) => ({
        ...s,
        format: p.format,
        codec: p.codec,
        quality: p.quality,
        resolution: p.maxShortSide ? String(p.maxShortSide) : "original",
        remuxCopy: false,
        extractAudioMp3: false,
        targetSizeMb: null,
        presetId: p.id,
        note: null,
      })),
    [updateSelected],
  );

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const src = itemsRef.current.find((i) => i.id === selectedRef.current)?.settings;
    if (!src) return;
    setItems((prev) =>
      prev.map((it) => (same(it.settings, src) ? it : { ...it, ...RESET, settings: { ...src } })),
    );
  }, []);

  /* ───── Conversión de la cola y guardado de última configuración ───── */
  const start = useCallback(async () => {
    if (busy.current) return;
    const all = itemsRef.current;
    let targets = all.filter((i) => i.metaState === "ready" && i.status !== "done");
    if (!targets.length) targets = all.filter((i) => i.metaState === "ready");
    if (!targets.length) return;

    const cfg = appSettingsRef.current;
    const refSettings = (itemsRef.current.find((i) => i.id === selectedRef.current) ?? targets[0]).settings;
    cfg.recordLastVideo({
      format: refSettings.format,
      codec: refSettings.codec,
      quality: refSettings.quality,
      resolution: refSettings.resolution,
      remuxCopy: refSettings.remuxCopy,
      extractAudioMp3: refSettings.extractAudioMp3,
      mute: refSettings.mute,
    });

    busy.current = true;
    cancelRequested.current = false;
    const ids = targets.map((i) => i.id);
    setRunning(true);
    setRunInfo({ total: ids.length, done: 0 });
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, ...RESET } : it)));

    const used = new Set<string>();
    let done = 0;
    let firstSuccessOutput: string | null = null;

    for (const id of ids) {
      if (cancelRequested.current) break;
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) continue;
      const s = it.settings;
      const mode = modeOf(s);
      const effectiveOutDir = s.outputDir ?? appSettingsRef.current.defaultOutputDir;
      const suffix = appSettingsRef.current.resolveSuffix(false, Boolean(effectiveOutDir));

      const tStart = parseTimeInput(s.trimStart);
      const tEnd = parseTimeInput(s.trimEnd);

      currentId.current = id;
      patch(id, {
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        progress: it.meta?.durationSecs
          ? {
              jobId: id,
              percent: 0,
              processedSecs: 0,
              speed: null,
              encoder: s.codec,
              stage: "running",
            }
          : null,
      });

      if (Number.isNaN(tStart) || Number.isNaN(tEnd)) {
        patch(id, {
          status: "error",
          error: "Formato de tiempo de recorte inválido. Usa MM:SS o HH:MM:SS.",
          finishedAt: Date.now(),
        });
        done += 1;
        setRunInfo({ total: ids.length, done });
        continue;
      }

      try {
        const res = await invoke<ConvertVideoResponse>("convert_video", {
          jobId: id,
          source: it.path,
          dest: buildDest(it.path, mode === "audio" ? "mp3" : s.format, used, suffix, effectiveOutDir),
          format: s.format,
          codec: s.codec,
          quality: s.quality,
          scale: mode === "encode" ? resolveTarget(it.meta, s.resolution) : null,
          remuxCopy: s.remuxCopy,
          targetSizeMb: mode === "encode" ? s.targetSizeMb : null,
          extractAudioMp3: s.extractAudioMp3,
          mute: s.mute,
          trimStart: tStart,
          trimEnd: tEnd,
          overwrite: appSettingsRef.current.overwriteExisting,
          forceCpu: appSettingsRef.current.forceCpu,
          threadMode: appSettingsRef.current.threadMode,
        });
        if (!firstSuccessOutput) firstSuccessOutput = res.output;
        patch(id, {
          status: "done",
          output: res.output,
          outputBytes: res.sizeBytes,
          finishedAt: Date.now(),
        });
      } catch (e) {
        const msg = String(e);
        if (msg === "CANCELLED") patch(id, { status: "cancelled", finishedAt: Date.now() });
        else patch(id, { status: "error", error: msg, finishedAt: Date.now() });
      }
      done += 1;
      setRunInfo({ total: ids.length, done });
    }

    const wasCancelled = cancelRequested.current;
    currentId.current = null;
    busy.current = false;
    setRunning(false);
    setRunInfo(null);

    if (!wasCancelled && firstSuccessOutput) {
      const count = targets.length;
      const allAudio = targets.every((t) => t.settings.extractAudioMp3);
      const allRemux = targets.every((t) => t.settings.remuxCopy);
      const allCompress = targets.every((t) => t.settings.targetSizeMb != null);

      let title = "Conversión de video lista";
      let msg =
        count === 1
          ? `El video se ha convertido a ${targets[0].settings.format.toUpperCase()}.`
          : `Se han convertido ${count} videos correctamente.`;

      if (allAudio) {
        title = "Audio extraído con éxito";
        msg =
          count === 1
            ? "Se extrajo la pista de audio en formato MP3."
            : `Se extrajo el audio en MP3 de ${count} videos.`;
      } else if (allRemux) {
        title = "Copia directa lista";
        msg =
          count === 1
            ? "El contenedor del video se cambió sin recodificar."
            : `Se procesaron ${count} videos con copia directa.`;
      } else if (allCompress) {
        title = "Compresión de video lista";
        msg =
          count === 1
            ? "El video se ha comprimido al tamaño objetivo."
            : `Se comprimieron ${count} videos al tamaño deseado.`;
      }

      appSettingsRef.current.runPostAction(firstSuccessOutput, {
        title,
        message: msg,
      });
    }
  }, [patch]);

  const cancel = useCallback(async () => {
    cancelRequested.current = true;
    const id = currentId.current;
    if (id) await invoke("cancel_conversion", { jobId: id }).catch(() => {});
  }, []);

  /* ───── Valores derivados ───── */
  const current = items.find((i) => i.status === "running") ?? null;
  const overallPct = runInfo
    ? ((runInfo.done + (current?.progress?.percent ?? 0) / 100) / runInfo.total) * 100
    : null;
  const fallbackSettings: VideoSettings = {
    ...DEFAULT_SETTINGS,
    ...(appSettings.rememberLastSettings ? appSettings.lastVideo ?? {} : {}),
    outputDir: appSettings.defaultOutputDir,
  };
  const s = selected?.settings ?? fallbackSettings;

  return {
    items, selected, hasSelection: selected !== null, select: setSelectedId,
    current, runInfo, overallPct, running, elapsedOf,
    forceCpu: appSettings.forceCpu,
    format: s.format, codec: s.codec, quality: s.quality, resolution: s.resolution,
    remuxCopy: s.remuxCopy, extractAudioMp3: s.extractAudioMp3, mute: s.mute,
    trimStart: s.trimStart, trimEnd: s.trimEnd,
    targetSizeMb: s.targetSizeMb, outputDir: s.outputDir ?? appSettings.defaultOutputDir, presetId: s.presetId, note: s.note, mode: modeOf(s),
    setFormat, setCodec, setQuality, setResolution,
    setRemuxCopy, setExtractAudioMp3, setMute,
    setTrimStart, setTrimEnd, clearTrim,
    setTargetSizeMb, pickOutputDir, clearOutputDir, applyPreset, applyToAll,
    pick, addFiles, removeItem, clear, start, cancel,
  };
}
``

## src/lib/nativeUpdater.ts

``typescript
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateStatus {
  available: boolean;
  version?: string;
  body?: string;
  rawUpdate?: Update;
}

/**
 * Consulta el endpoint oficial de Tauri Updater (GitHub latest.json)
 * y verifica la firma criptográfica con tu pubkey.
 */
export async function checkForNativeUpdate(): Promise<UpdateStatus> {
  try {
    const update = await check();
    if (update?.available) {
      return {
        available: true,
        version: update.version,
        body: update.body ?? "",
        rawUpdate: update,
      };
    }
    return { available: false };
  } catch (err) {
    console.debug("[Updater] No se pudo comprobar actualización nativa:", err);
    return { available: false };
  }
}

/**
 * Descarga el parche en segundo plano, reemplaza los archivos del programa
 * y solicita confirmación para reiniciar la aplicación.
 */
export async function installNativeUpdate(
  update: Update,
  onProgress?: (progressPercent: number) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0 && onProgress) {
          const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress(pct);
        }
        break;
      case "Finished":
        if (onProgress) onProgress(100);
        break;
    }
  });

  // Reiniciar el programa inmediatamente con los archivos reemplazados
  await relaunch();
}

``

## src/lib/presets.ts

``typescript
import type { VideoCodec, VideoFormat } from "../types";

export interface VideoPreset {
  id: string;
  name: string;
  hint: string; // descripción corta que se muestra bajo los botones
  format: VideoFormat;
  codec: VideoCodec;
  quality: number; // 1-100
  maxShortSide: number | null; // tope del lado corto en px; null = resolución original
}

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "youtube",
    name: "YouTube 1080p",
    hint: "MP4 · H.264 · calidad 85 % · máx. 1080p",
    format: "mp4",
    codec: "h264",
    quality: 85,
    maxShortSide: 1080,
  },
  {
    id: "whatsapp",
    name: "WhatsApp / móvil",
    hint: "MP4 · H.264 · calidad 60 % · máx. 720p (archivo ligero)",
    format: "mp4",
    codec: "h264",
    quality: 60,
    maxShortSide: 720,
  },
  {
    id: "social",
    name: "Redes sociales",
    hint: "MP4 · H.264 · calidad 75 % · máx. 1080p (sirve también para videos verticales)",
    format: "mp4",
    codec: "h264",
    quality: 75,
    maxShortSide: 1080,
  },
  {
    id: "web",
    name: "Web ligera",
    hint: "WebM · VP9 · calidad 70 % · máx. 720p (se codifica por CPU)",
    format: "webm",
    codec: "vp9",
    quality: 70,
    maxShortSide: 720,
  },
  {
    id: "archive",
    name: "Archivo (alta calidad)",
    hint: "MKV · H.265 · calidad 92 % · resolución original",
    format: "mkv",
    codec: "hevc",
    quality: 92,
    maxShortSide: null,
  },
  {
    id: "save",
    name: "Ahorrar espacio",
    hint: "MP4 · H.265 · calidad 55 % · máx. 1080p",
    format: "mp4",
    codec: "hevc",
    quality: 55,
    maxShortSide: 1080,
  },
];
``

## src/lib/resolution.ts

``typescript
import type { VideoMetadata } from "../types";

/** Tamaño de salida en píxeles (se envía a Rust como `scale`). */
export interface TargetSize {
  width: number;
  height: number;
}

export interface ResolutionOption extends TargetSize {
  id: string; // lado corto en píxeles, p. ej. "1080"
  label: string; // "1080p"
  name?: string; // "Full HD", "UWQHD"…
}

export interface AspectInfo {
  id: string | null; // null = relación no estándar
  label: string;
  portrait: boolean;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Relaciones de aspecto conocidas (horizontales y verticales). */
const FAMILIES = [
  { id: "21:9", ratio: 21 / 9, label: "21:9 (ultrapanorámico / cine)" },
  { id: "16:9", ratio: 16 / 9, label: "16:9" },
  { id: "16:10", ratio: 16 / 10, label: "16:10" },
  { id: "3:2", ratio: 3 / 2, label: "3:2" },
  { id: "4:3", ratio: 4 / 3, label: "4:3" },
  { id: "5:4", ratio: 5 / 4, label: "5:4" },
  { id: "1:1", ratio: 1, label: "1:1 (cuadrado)" },
  { id: "9:21", ratio: 9 / 21, label: "9:21 (vertical ultrapanorámico)" },
  { id: "9:16", ratio: 9 / 16, label: "9:16 (vertical)" },
  { id: "10:16", ratio: 10 / 16, label: "10:16 (vertical)" },
  { id: "2:3", ratio: 2 / 3, label: "2:3 (vertical)" },
  { id: "3:4", ratio: 3 / 4, label: "3:4 (vertical)" },
  { id: "4:5", ratio: 4 / 5, label: "4:5 (vertical)" },
] as const;

/** Detecta la relación de aspecto más cercana (tolerancia del 3 %). */
export function detectAspect(w: number, h: number): AspectInfo {
  const ratio = w / h;
  const portrait = h > w;
  let best: (typeof FAMILIES)[number] | null = null;
  let bestErr = Infinity;
  for (const f of FAMILIES) {
    const err = Math.abs(ratio - f.ratio) / f.ratio;
    if (err < bestErr) {
      best = f;
      bestErr = err;
    }
  }
  if (best && bestErr <= 0.03) return { id: best.id, label: best.label, portrait };
  const txt = ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
  return { id: null, label: `Personalizada (≈ ${txt})`, portrait };
}

/* ───── Escalas por relación de aspecto, definidas por el LADO CORTO ───── */

interface Preset {
  s: number;
  name?: string;
}

const GENERIC: Preset[] = [{ s: 2160, name: "4K" }, { s: 1440 }, { s: 1080 }, { s: 720 }, { s: 480 }, { s: 360 }];

const L_16_9: Preset[] = [
  { s: 2160, name: "4K UHD" },
  { s: 1440, name: "QHD" },
  { s: 1080, name: "Full HD" },
  { s: 720, name: "HD" },
  { s: 480, name: "SD" },
  { s: 360 },
];

const L_21_9: Preset[] = [
  { s: 1600, name: "UW 4K" },
  { s: 1440, name: "UWQHD" },
  { s: 1080, name: "UWFHD" },
  { s: 720 },
  { s: 540 },
];

const L_16_10: Preset[] = [
  { s: 1600, name: "WQXGA" },
  { s: 1200, name: "WUXGA" },
  { s: 1050, name: "WSXGA+" },
  { s: 900, name: "WXGA+" },
  { s: 800, name: "WXGA" },
  { s: 720 },
];

const L_4_3: Preset[] = [
  { s: 1536, name: "QXGA" },
  { s: 1200, name: "UXGA" },
  { s: 1080 },
  { s: 960 },
  { s: 768, name: "XGA" },
  { s: 600, name: "SVGA" },
  { s: 480, name: "VGA" },
];

const L_3_2: Preset[] = [{ s: 2160 }, { s: 1440 }, { s: 1080 }, { s: 720 }, { s: 480 }];

const L_5_4: Preset[] = [{ s: 1600 }, { s: 1280 }, { s: 1024, name: "SXGA" }, { s: 800 }, { s: 600 }];

const PRESETS: Record<string, Preset[]> = {
  "16:9": L_16_9,
  "9:16": L_16_9,
  "21:9": L_21_9,
  "9:21": L_21_9,
  "16:10": L_16_10,
  "10:16": L_16_10,
  "4:3": L_4_3,
  "3:4": L_4_3,
  "3:2": L_3_2,
  "2:3": L_3_2,
  "5:4": L_5_4,
  "4:5": L_5_4,
  "1:1": GENERIC,
};

/**
 * Opciones de resolución para un video de `w`×`h`: solo tamaños menores al original,
 * conservando la proporción exacta del video (ancho/alto pares, sin deformar).
 * En videos verticales el "lado corto" es el ancho. Ordenadas de mayor a menor.
 */
export function resolutionOptions(w: number, h: number): ResolutionOption[] {
  if (!w || !h) return [];
  const { id, portrait } = detectAspect(w, h);
  const ladder = (id && PRESETS[id]) || GENERIC;
  const short = Math.min(w, h);

  return ladder
    .filter((p) => p.s < short)
    .map((p) => {
      const other = even(p.s * (portrait ? h / w : w / h));
      return {
        id: String(p.s),
        label: `${p.s}p`,
        name: p.name,
        width: portrait ? p.s : other,
        height: portrait ? other : p.s,
      };
    });
}

/**
 * Convierte el tope elegido ("original" o un lado corto, p. ej. "1080") en el tamaño de salida
 * de ESTE video: la escala igual o inmediata inferior disponible para su relación de aspecto.
 * Si el video ya es igual o menor que el tope, se mantiene la resolución original (null).
 */
export function resolveTarget(meta: VideoMetadata | null, cap: string): TargetSize | null {
  const v = meta?.video;
  if (!v || cap === "original") return null;
  const limit = Number(cap);
  if (!Number.isFinite(limit) || limit >= Math.min(v.width, v.height)) return null;
  const best = resolutionOptions(v.width, v.height).find((o) => Number(o.id) <= limit);
  return best ? { width: best.width, height: best.height } : null;
}
``

## src/lib/updater.ts

``typescript
import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_REPO = "Bobe1destructor/multimedia-converter";
export const CURRENT_VERSION = "0.3.8";

export interface UpdateInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  downloadUrl: string;
  releaseUrl: string;
}

/**
 * Compara dos versiones semánticas (ej. "0.4.0" > "0.3.1")
 * Devuelve 1 si v1 > v2, -1 si v1 < v2, 0 si son iguales.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/i, "").trim();
  const clean2 = v2.replace(/^v/i, "").trim();

  const parts1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Consulta la API pública de GitHub Releases para ver si hay una versión más reciente.
 * Es completamente seguro ante fallas: si no hay internet o el repo no existe, devuelve null.
 */
export async function checkForAppUpdates(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const tag = (data.tag_name || data.name || "").trim();
    if (!tag) return null;

    const hasUpdate = compareSemver(tag, CURRENT_VERSION) > 0;
    if (!hasUpdate) return null;

    // Buscar si hay un instalador de Windows (.exe o .msi) en los assets
    let downloadUrl = data.html_url;
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      const exeAsset = data.assets.find(
        (a: { name?: string; browser_download_url?: string }) =>
          typeof a.name === "string" && (a.name.endsWith(".exe") || a.name.endsWith(".msi")),
      );
      if (exeAsset?.browser_download_url) {
        downloadUrl = exeAsset.browser_download_url;
      }
    }

    return {
      version: tag.replace(/^v/i, ""),
      name: data.name || tag,
      body: data.body || "",
      publishedAt: data.published_at || "",
      downloadUrl,
      releaseUrl: data.html_url,
    };
  } catch {
    // Si no hay conexión o falla la red, ignorar en silencio
    return null;
  }
}

/**
 * Abre la URL de descarga o release en el navegador predeterminado del sistema.
 */
export async function openDownloadLink(url: string) {
  try {
    await openUrl(url);
  } catch (err) {
    // Respaldo en caso de que el plugin falle
    window.open(url, "_blank");
  }
}

``

## src/lib/utils.ts

``typescript
export const VIDEO_EXTS = ["mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "3gp"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
export const DOC_EXTS = ["pdf", "docx", "txt", "md"];

const sepIdx = (p: string) => Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));

/** Separa una ruta (Windows o Unix) en carpeta, archivo, nombre sin extensión y extensión. */
export function splitPath(p: string) {
  const i = sepIdx(p);
  const dir = p.slice(0, i + 1); // incluye el separador final
  const file = p.slice(i + 1);
  const dot = file.lastIndexOf(".");
  return {
    dir,
    file,
    stem: dot > 0 ? file.slice(0, dot) : file,
    ext: dot > 0 ? file.slice(dot + 1).toLowerCase() : "",
  };
}

function normalizeDir(d: string) {
  return d.replace(/[\\/]+$/, "").toLowerCase();
}

/**
 * Construye la ruta de salida:
 * - Si hay `outputDir`, usa esa carpeta.
 * - Si el sufijo está vacío y el destino no choca con el archivo de origen, guarda como `nombre.ext`.
 */
export function buildDest(
  source: string,
  ext: string,
  used?: Set<string>,
  suffix = "convertido",
  outputDir: string | null = null,
) {
  const { dir, stem, ext: srcExt } = splitPath(source);
  const base = outputDir
    ? /[\\/]$/.test(outputDir)
      ? outputDir
      : outputDir + (outputDir.includes("\\") ? "\\" : "/")
    : dir;

  const cleanSuffix = suffix.trim().replace(/^_+/, "");
  const sameFolder = normalizeDir(base) === normalizeDir(dir);
  const sameExt = ext.toLowerCase() === srcExt.toLowerCase();

  // Si está en la misma carpeta y tiene la misma extensión, nunca puede quedar sin sufijo (pisaría al origen)
  const effectiveSuffix = !cleanSuffix && sameFolder && sameExt ? "convertido" : cleanSuffix;
  const tag = effectiveSuffix ? `_${effectiveSuffix}` : "";

  let dest = `${base}${stem}${tag}.${ext}`;
  if (used) {
    let n = 2;
    while (used.has(dest.toLowerCase())) {
      dest = `${base}${stem}${tag}_${n++}.${ext}`;
    }
    used.add(dest.toLowerCase());
  }
  return dest;
}

/** 83 → "01:23" · 3725 → "1:02:05" */
export function formatTime(secs: number) {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Convierte "90", "01:30" o "01:02:03.5" en segundos (null si está vacío, NaN si el formato es inválido). */
export function parseTimeInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p.trim())) return NaN;
    total = total * 60 + Number(p);
  }
  return Number.isFinite(total) && total >= 0 ? total : NaN;
}

/** Emite un acorde suave de finalización usando Web Audio API (sin archivos externos). */
export function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // Do5 - Mi5 - Sol5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.08;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  } catch {
    // Ignorar si el navegador bloquea el audio
  }
}

/** Emite un sonido suave y sutil de error usando Web Audio API (sin archivos externos). */
export function playErrorSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Primer pulso suave
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(320, now);
    osc1.frequency.exponentialRampToValueAtTime(260, now + 0.09);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Segundo pulso suave descendente
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(240, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 0.22);
    gain2.gain.setValueAtTime(0.001, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  } catch {
    // Ignorar si el navegador bloquea el audio
  }
}
``

## src/main.tsx

``tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
``

## src/types.ts

``typescript
export type HwAccel = "nvenc" | "amf" | "qsv" | "vaapi" | "videotoolbox" | "cpu";
export type VideoCodec = "h264" | "hevc" | "av1" | "vp9";
export type VideoFormat = "mp4" | "mkv" | "mov" | "webm" | "avi";
export type ImgFormat = "png" | "jpg" | "webp";
export type ImgScale = "100" | "75" | "50" | "25";
export type DocFormat = "pdf" | "docx" | "xlsx" | "txt" | "md";
export type JobStatus = "idle" | "running" | "done" | "error";

/** Espejo de `HwProfile` en commands.rs (VP9 siempre va por CPU) */
export interface HwProfile {
  h264: HwAccel;
  hevc: HwAccel;
  av1: HwAccel;
}

/** Evento `convert-progress` (ProgressPayload, serializado en camelCase) */
export interface ConvertProgress {
  jobId: string;
  percent: number | null;
  processedSecs: number;
  speed: string | null;
  encoder: string;
  stage: "running" | "fallback" | "done";
}

/** Respuesta de `convert_video` */
export interface ConvertVideoResponse {
  output: string;
  sizeBytes: number | null;
}

/** Respuesta de `get_video_metadata` (ffprobe + miniatura) */
export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  fps: number | null;
  bitRate: number | null;
}
export interface AudioStreamInfo {
  codec: string;
  channels: number | null;
  sampleRate: number | null;
  bitRate: number | null;
}
export interface VideoMetadata {
  durationSecs: number | null;
  sizeBytes: number | null;
  bitRate: number | null; // bitrate total del archivo
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo | null;
  thumbnail: string | null; // ruta al JPG temporal extraído por FFmpeg
}

/** Respuesta de `get_image_metadata` */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  colorType: string;
  hasAlpha: boolean;
  sizeBytes: number;
  hasExif: boolean;
  hasGps: boolean;
  hasXmp: boolean;
  hasIptc: boolean;
  hasIcc: boolean;
  hasComments: boolean;
  removableBytes: number;
}

/** Entrada de `convert_images_batch` y `strip_images_metadata` */
export interface ImageJob {
  source: string;
  dest: string;
  format?: ImgFormat;
  quality?: number;
  scale?: number;
}

/** Salida de `convert_image`, `convert_images_batch` y `strip_images_metadata` */
export interface ImageResult {
  source: string;
  dest: string;
  ok: boolean;
  error: string | null;
  sizeBytes: number | null;
}

/** Evento `image-progress` */
export interface ImageProgress {
  done: number;
  total: number;
}

/** Respuesta de `get_doc_metadata` */
export interface DocMetadata {
  format: string;
  sizeBytes: number;
  pages: number | null;
  words: number;
  chars: number;
  author: string | null;
  creator: string | null;
  title: string | null;
  hasMetadata: boolean;
  embeddedImages: number;
  preview: string;
}

export interface DocJob {
  source: string;
  dest: string;
  format?: DocFormat;
}

export interface DocResult {
  source: string;
  dest: string;
  ok: boolean;
  error: string | null;
  sizeBytes: number | null;
}

export interface DocProgress {
  done: number;
  total: number;
}

/* ───────────── Constantes de formatos y códecs de video ───────────── */

export const VIDEO_FORMATS = ["mp4", "mkv", "mov", "webm", "avi"] as const;
export const VIDEO_CODECS = ["h264", "hevc", "av1", "vp9"] as const;

export const FORMAT_LABEL: Record<VideoFormat, string> = {
  mp4: "MP4",
  mkv: "MKV",
  mov: "MOV",
  webm: "WebM",
  avi: "AVI",
};

export const CODEC_LABEL: Record<VideoCodec, string> = {
  h264: "H.264",
  hevc: "H.265 (HEVC)",
  av1: "AV1",
  vp9: "VP9",
};

const SUPPORT: Record<VideoFormat, readonly VideoCodec[]> = {
  mp4: ["h264", "hevc", "av1"],
  mkv: ["h264", "hevc", "av1", "vp9"],
  mov: ["h264", "hevc"],
  webm: ["vp9", "av1"],
  avi: ["h264"],
};

export const supports = (f: VideoFormat, c: VideoCodec) => SUPPORT[f].includes(c);
export const defaultCodecFor = (f: VideoFormat): VideoCodec => SUPPORT[f][0];

export const PREFERRED_FORMAT: Record<VideoCodec, VideoFormat> = {
  h264: "mp4",
  hevc: "mp4",
  av1: "mp4",
  vp9: "webm",
};

export type ConvertMode = "encode" | "copy" | "audio";

export interface VideoSettings {
  format: VideoFormat;
  codec: VideoCodec;
  quality: number;
  resolution: string;
  remuxCopy: boolean;
  extractAudioMp3: boolean;
  mute: boolean;
  trimStart: string;
  trimEnd: string;
  targetSizeMb: number | null;
  outputDir: string | null;
  presetId: string | null;
  note: string | null;
}

export const DEFAULT_SETTINGS: VideoSettings = {
  format: "mp4",
  codec: "h264",
  quality: 80,
  resolution: "original",
  remuxCopy: false,
  extractAudioMp3: false,
  mute: false,
  trimStart: "",
  trimEnd: "",
  targetSizeMb: null,
  outputDir: null,
  presetId: null,
  note: null,
};

export const modeOf = (s: VideoSettings): ConvertMode =>
  s.extractAudioMp3 ? "audio" : s.remuxCopy ? "copy" : "encode";

export type IncompatibleHandler = (
  files: string[],
  section: "video" | "image" | "doc",
  customReason?: string,
) => void;
``

## src/vite-env.d.ts

``typescript
/// <reference types="vite/client" />
``
