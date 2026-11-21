use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::Command,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::commands::AppError;

const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024; // 2 MB por archivo antes de rotar
static LOG_MUTEX: Mutex<()> = Mutex::new(());
static LOG_DIR_CACHE: OnceLock<PathBuf> = OnceLock::new();

pub fn logs_dir() -> PathBuf {
    LOG_DIR_CACHE
        .get_or_init(|| {
            let base = std::env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(std::env::temp_dir);
            base.join("multimedia-converter").join("logs")
        })
        .clone()
}

fn format_timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Fecha/hora UTC legible sin dependencias externas
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

/// Algoritmo de Howard Hinnant para convertir días desde 1970-01-01 a (año, mes, día).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

fn write_entry(level: &str, module: &str, message: &str) {
    let _guard = LOG_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let dir = logs_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let current = dir.join("app.log");
    if let Ok(meta) = fs::metadata(&current) {
        if meta.len() >= MAX_LOG_BYTES {
            let backup = dir.join("app.prev.log");
            let _ = fs::remove_file(&backup);
            let _ = fs::rename(&current, &backup);
        }
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&current) {
        let ts = format_timestamp();
        let clean_msg = message.trim().replace("\r\n", "\n");
        let _ = writeln!(file, "[{ts}] [{level}] [{module}] {clean_msg}");
    }
}

pub fn log_info(module: &str, message: &str) {
    write_entry("INFO", module, message);
}

pub fn log_warn(module: &str, message: &str) {
    write_entry("WARN", module, message);
}

pub fn log_error(module: &str, message: &str) {
    write_entry("ERROR", module, message);
}

#[tauri::command]
pub fn open_logs_dir() -> Result<(), AppError> {
    let dir = logs_dir();
    fs::create_dir_all(&dir)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| AppError::Msg(format!("No se pudo abrir la carpeta de logs: {e}")))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| AppError::Msg(format!("No se pudo abrir la carpeta de logs: {e}")))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| AppError::Msg(format!("No se pudo abrir la carpeta de logs: {e}")))?;
    }

    Ok(())
}
