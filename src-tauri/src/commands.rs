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
