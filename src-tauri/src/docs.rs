use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::File,
    io::{BufReader, BufWriter, Cursor, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

use flate2::{
    read::{DeflateDecoder, ZlibDecoder},
    write::ZlibEncoder,
    Compression,
};
use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ExtendedColorType, ImageEncoder,
};
use lopdf::{dictionary, Document as PdfDoc, Object, ObjectId, Stream};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

use crate::{commands::AppError, logger};

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
    std::env::temp_dir().join(format!(
        "{prefix}_{}_{}_{}.{ext}",
        std::process::id(),
        id,
        now
    ))
}

/// Guardia RAII para garantizar la terminación limpia de procesos PowerShell / Office COM si hay timeout o cancelación.
#[cfg(windows)]
struct ComWatchdogGuard {
    child: Option<std::process::Child>,
    temp_files: Vec<PathBuf>,
}

#[cfg(windows)]
impl ComWatchdogGuard {
    fn new(child: std::process::Child, temp_files: Vec<PathBuf>) -> Self {
        Self {
            child: Some(child),
            temp_files,
        }
    }

    fn kill_tree(pid: u32) {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    fn wait_with_timeout(&mut self, timeout: Duration, context: &str) -> bool {
        let Some(ref mut child) = self.child else {
            return false;
        };
        let pid = child.id();
        let start = Instant::now();

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut stderr_msg = String::new();
                    if let Some(mut err_pipe) = child.stderr.take() {
                        let _ = err_pipe.read_to_string(&mut stderr_msg);
                    }
                    let _ = self.child.take();
                    if !status.success() {
                        logger::log_warn(
                            "office-com",
                            &format!(
                                "{context} terminó con código {:?}: {}",
                                status.code(),
                                stderr_msg.trim()
                            ),
                        );
                    }
                    return status.success();
                }
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        logger::log_error(
                            "office-com",
                            &format!(
                                "Timeout ({}s) en {context} (PID {pid}); terminando árbol de procesos COM.",
                                timeout.as_secs()
                            ),
                        );
                        Self::kill_tree(pid);
                        let _ = child.wait();
                        let _ = self.child.take();
                        return false;
                    }
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(e) => {
                    logger::log_error("office-com", &format!("Error esperando {context}: {e}"));
                    Self::kill_tree(pid);
                    let _ = child.wait();
                    let _ = self.child.take();
                    return false;
                }
            }
        }
    }
}

#[cfg(windows)]
impl Drop for ComWatchdogGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            Self::kill_tree(child.id());
            let _ = child.wait();
        }
        for path in &self.temp_files {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(windows)]
fn run_ps_com_script(
    script: &str,
    temp_files: Vec<PathBuf>,
    timeout_secs: u64,
    context: &str,
) -> bool {
    use std::os::windows::process::CommandExt;

    let mut c = Command::new("powershell");
    c.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    c.creation_flags(0x0800_0000);
    c.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    match c.spawn() {
        Ok(child) => {
            let mut guard = ComWatchdogGuard::new(child, temp_files);
            guard.wait_with_timeout(Duration::from_secs(timeout_secs), context)
        }
        Err(e) => {
            logger::log_error(
                "office-com",
                &format!("No se pudo lanzar PowerShell para {context}: {e}"),
            );
            for p in temp_files {
                let _ = std::fs::remove_file(p);
            }
            false
        }
    }
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
                vec![
                    "/usr/bin/libreoffice",
                    "/usr/bin/soffice",
                    "/usr/local/bin/soffice",
                ]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitMode {
    Extract, // Extrae las páginas/rangos indicados en un único PDF
    Burst,   // Separa cada página en un archivo PDF individual
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfCompressLevel {
    Low,    // Ligera (alta calidad visual, máx. 2000 px, JPEG 85)
    Medium, // Equilibrada (máx. 1400 px, JPEG 72)
    High,   // Fuerte (ideal para correo/classroom, máx. 1000 px, JPEG 55)
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitPdfResult {
    pub source: String,
    pub outputs: Vec<String>,
    pub ok: bool,
    pub error: Option<String>,
    pub total_size_bytes: Option<u64>,
    pub pages_extracted: usize,
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

// ─────────────────── Lectura y extracción de DOCX / XLSX / PDF / TXT / MD / Imágenes ───────────────────

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

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open_pat = format!("<{tag}");
    let close_pat = format!("</{tag}>");
    let start_idx = xml.find(&open_pat)?;
    let after_open = &xml[start_idx + open_pat.len()..];
    let gt = after_open.find('>')?;
    if gt > 0 && after_open.as_bytes()[gt - 1] == b'/' {
        return None;
    }
    let content_start = &after_open[gt + 1..];
    let end_idx = content_start.find(&close_pat)?;
    let val = xml_unescape(content_start[..end_idx].trim());
    (!val.is_empty()).then_some(val)
}

fn parse_docx_document_xml(xml: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    for p_block in xml.split("</w:p>") {
        let mut p_text = String::new();
        let mut rest = p_block;
        while let Some(idx) = rest.find("<w:t") {
            let after = &rest[idx + 4..];
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

fn read_xlsx_info(path: &Path) -> Res<ExtractedDoc> {
    let file = File::open(path)?;
    let mut zip = ZipArchive::new(BufReader::new(file))
        .map_err(|e| AppError::Msg(format!("El archivo XLSX no es válido: {e}")))?;

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

    let mut sheet_count = 0u32;
    let mut embedded_images = 0usize;
    let mut shared_strings = Vec::new();
    let mut paragraphs = Vec::new();

    if let Ok(mut f) = zip.by_name("xl/sharedStrings.xml") {
        let mut ss_xml = String::new();
        let _ = f.read_to_string(&mut ss_xml);
        for si in ss_xml.split("</si>") {
            let mut val = String::new();
            let mut rest = si;
            while let Some(idx) = rest.find("<t") {
                let after = &rest[idx + 2..];
                if let Some(gt) = after.find('>') {
                    let inner = &after[gt + 1..];
                    if let Some(end_t) = inner.find("</t>") {
                        val.push_str(&xml_unescape(&inner[..end_t]));
                        rest = &inner[end_t + 4..];
                        continue;
                    }
                }
                break;
            }
            if !val.trim().is_empty() {
                shared_strings.push(val.trim().to_string());
            }
        }
    }

    for i in 0..zip.len() {
        if let Ok(f) = zip.by_index(i) {
            let name = f.name().to_string();
            if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                sheet_count += 1;
            } else if name.starts_with("xl/media/") && !name.ends_with('/') {
                embedded_images += 1;
            }
        }
    }

    if !shared_strings.is_empty() {
        paragraphs.extend(shared_strings.into_iter().take(40));
    } else if let Ok(mut f) = zip.by_name("xl/worksheets/sheet1.xml") {
        let mut s1 = String::new();
        let _ = f.read_to_string(&mut s1);
        let mut rest = s1.as_str();
        while let Some(idx) = rest.find("<t>") {
            let inner = &rest[idx + 3..];
            if let Some(end_t) = inner.find("</t>") {
                let txt = xml_unescape(inner[..end_t].trim());
                if !txt.is_empty() {
                    paragraphs.push(txt);
                    if paragraphs.len() >= 40 {
                        break;
                    }
                }
                rest = &inner[end_t + 4..];
            } else {
                break;
            }
        }
    }

    let has_metadata = author.is_some()
        || creator.is_some()
        || title.is_some()
        || extract_xml_tag(&core_xml, "dcterms:created").is_some();

    Ok(ExtractedDoc {
        format: "XLSX".into(),
        pages: Some(sheet_count.max(1)),
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

    for obj in doc.objects.values() {
        if let Ok(stream) = obj.as_stream() {
            if stream.dict.has(b"Metadata") {
                has_metadata = true;
                break;
            }
            if let Ok(t) = stream.dict.get(b"Type").and_then(Object::as_name_str) {
                if t == "Metadata" {
                    has_metadata = true;
                    break;
                }
            }
        }
    }

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

fn read_image_as_doc_info(path: &Path, fmt_label: &str) -> Res<ExtractedDoc> {
    let (w, h) = image::image_dimensions(path)?;
    Ok(ExtractedDoc {
        format: fmt_label.to_string(),
        pages: Some(1),
        paragraphs: vec![format!("Imagen {w}×{h} px · Lista para compilar a PDF A4")],
        author: None,
        creator: None,
        title: None,
        has_metadata: false,
        embedded_images: 1,
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
        "xlsx" => read_xlsx_info(path),
        "pdf" => read_pdf_info(path),
        "md" | "markdown" => read_text_info(path, "MD"),
        "txt" => read_text_info(path, "TXT"),
        "jpg" | "jpeg" => read_image_as_doc_info(path, "JPG"),
        "png" => read_image_as_doc_info(path, "PNG"),
        "webp" => read_image_as_doc_info(path, "WEBP"),
        _ => err(format!("Formato de documento no soportado: .{ext}")),
    }
}

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
    let max_w = 4_800_000.0_f64;
    let max_h = 3_600_000.0_f64;
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
    let max_w = 2_200_000.0_f64;
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

fn extract_image_from_stream(
    doc: &PdfDoc,
    stream: &Stream,
) -> Option<(Vec<u8>, &'static str, u32, u32)> {
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
        Some(Object::Array(ref arr)) => arr
            .iter()
            .any(|o| matches!(o, Object::Name(ref n) if n == b"DCTDecode")),
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
    let bpc = dict
        .get(b"BitsPerComponent")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .unwrap_or(8);

    if let Some(Object::Array(ref arr)) = cs {
        if arr.first().and_then(|o| o.as_name().ok()) == Some(b"Indexed") {
            let lookup_data = match arr.get(3) {
                Some(Object::Reference(r)) => {
                    if let Ok(pal_stream) = doc.get_object(*r).and_then(Object::as_stream) {
                        decompress_zlib(&pal_stream.content)
                            .unwrap_or_else(|| pal_stream.content.clone())
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
                    if image::DynamicImage::ImageRgb8(rgb_img)
                        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                        .is_ok()
                    {
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
            if let Some(rgb_img) =
                image::RgbImage::from_raw(width, height, decompressed[..rgb_size].to_vec())
            {
                let mut buf = Vec::new();
                if image::DynamicImage::ImageRgb8(rgb_img)
                    .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                    .is_ok()
                {
                    return Some((buf, "png", width, height));
                }
            }
        } else if decompressed.len() >= gray_size {
            if let Some(gray_img) =
                image::GrayImage::from_raw(width, height, decompressed[..gray_size].to_vec())
            {
                let mut buf = Vec::new();
                if image::DynamicImage::ImageLuma8(gray_img)
                    .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                    .is_ok()
                {
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
                cur_y = op.operands[5]
                    .as_float()
                    .map(|v| v as f64)
                    .or_else(|_| op.operands[5].as_i64().map(|v| v as f64))
                    .unwrap_or(0.0);
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
    let mut visited = HashSet::new();
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
                        Object::Reference(ref r) => {
                            doc.get_object(*r).ok().and_then(|o| o.as_dict().ok())
                        }
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

fn repair_tokens(raw_lines: &[&str]) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < raw_lines.len() {
        let mut line = raw_lines[i].trim().to_string();
        if line.is_empty() {
            i += 1;
            continue;
        }

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
            } else if (line == "ESTUDIANTE" || line == "ESTUDIANTES")
                && next.chars().all(|c| c.is_ascii_digit())
            {
                line = format!("{line} {next}");
                i += 1;
                continue;
            } else if (line.starts_with("ESTUDIANTE")
                || line.starts_with("ESTUDIANTES")
                || line == "ACTIVIDAD"
                || line == "TAREA")
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
            } else if line.ends_with(" protoboar")
                && (next.starts_with('d') || next.starts_with("e "))
            {
                if next.starts_with('d') {
                    line.push_str(next);
                } else {
                    line.push_str("d. ");
                    line.push_str(next);
                }
                i += 1;
                continue;
            } else if line.to_lowercase().starts_with("figura")
                && (line.ends_with("imagen")
                    || line.ends_with("Fotografía")
                    || line.ends_with("fotografía")
                    || line.ends_with("de")
                    || line.ends_with("del"))
            {
                line = format!("{line} {next}");
                i += 1;
                continue;
            }
            break;
        }

        if line.chars().all(|c| c.is_ascii_digit()) {
            i += 1;
            continue;
        }

        tokens.push(line);
        i += 1;
    }
    tokens
}

fn merge_into_paragraphs(tokens: Vec<String>) -> Vec<(String, &'static str)> {
    let mut blocks: Vec<(String, &'static str)> = Vec::new();

    for cur in tokens {
        let lower = cur.to_lowercase();
        if lower == "instituto tecnológico de mérida" || lower == "instituto tecnologico de merida"
        {
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

        let is_meta_header = cur == "CARRERA:"
            || cur == "MATERIA:"
            || cur == "TAREA:"
            || cur == "ESTUDIANTES:"
            || cur == "SEMESTRE:";
        if is_meta_header {
            blocks.push((cur, "field_header"));
            continue;
        }

        if let Some((prev_text, prev_type)) = blocks.last_mut() {
            if *prev_type == "text" {
                let cur_is_activity = cur.to_uppercase().starts_with("ACTIVIDAD");
                let ends_terminal = prev_text.ends_with('.')
                    || prev_text.ends_with(':')
                    || prev_text.ends_with('!');
                let starts_lower = cur.chars().next().map_or(false, |c| c.is_lowercase());
                let continues = cur.starts_with("se ")
                    || cur.starts_with("de ")
                    || cur.starts_with("en ")
                    || cur.starts_with("para ")
                    || cur.starts_with("con ")
                    || cur.starts_with("ambos ")
                    || cur.starts_with("reiniciar ");

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

    zip.start_file("[Content_Types].xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)?;

    zip.start_file("_rels/.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)?;

    zip.start_file("word/_rels/document.xml.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    let mut doc_rels = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
    );
    for img in images {
        doc_rels.push_str(&format!(
            r#"<Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{}"/>"#,
            img.rel_id, img.filename
        ));
    }
    doc_rels.push_str("</Relationships>");
    zip.write_all(doc_rels.as_bytes())?;

    for img in images {
        zip.start_file(format!("word/media/{}", img.filename), opts)
            .map_err(|e| AppError::Msg(e.to_string()))?;
        zip.write_all(&img.data)?;
    }

    zip.start_file("word/document.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    let mut body = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>"#,
    );

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

        let page_text = doc.extract_text(&[page_num]).unwrap_or_default();
        let raw_lines: Vec<&str> = page_text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        let repaired = repair_tokens(&raw_lines);

        let page_img_ids = get_page_images_visual(&doc, page_id);

        if page_num == 1 {
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
                if line.contains("Instituto Tecnológico") || line.contains("Instituto Tecnologico")
                {
                    if !title_emitted {
                        elements.push(DocxElement::CoverTitle(line));
                        title_emitted = true;
                    }
                } else if u == "CARRERA:"
                    || u == "MATERIA:"
                    || u == "TAREA:"
                    || u.starts_with("TAREA:")
                    || u == "ESTUDIANTES:"
                    || u.starts_with("ESTUDIANTES:")
                    || u == "SEMESTRE:"
                {
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

        let blocks = merge_into_paragraphs(repaired);
        let mut page_images: Vec<DocxImage> = Vec::new();
        for id in page_img_ids {
            if let Some(img) = image_cache.get(&id) {
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
                if is_primary_banner(p) {
                    DocxElement::PrimaryBanner(p.clone())
                } else {
                    DocxElement::SecondaryBanner(p.clone())
                }
            } else {
                DocxElement::Paragraph(p.clone())
            }
        })
        .collect();
    write_full_docx(dest, &elements, &[])
}

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
        lines.push(String::new());
    }
    if lines.is_empty() {
        lines.push("(Documento sin texto extraíble)".to_string());
    }
    lines
}

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
    let src_clean = src_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&src_str)
        .replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cd| cd.join(dest))
            .unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&dest_str)
        .replace('\'', "''");

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
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null;
    $doc = $null;
    $w.Quit();
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null;
    $w = $null;
    exit 0;
}} catch {{
    Write-Error $_.Exception.Message;
    exit 1;
}} finally {{
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null; }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null; }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_docx_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    run_ps_com_script(&script, vec![temp_docx], 45, "Word DOCX->PDF") && dest.is_file()
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
    let src_clean = src_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&src_str)
        .replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cd| cd.join(dest))
            .unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&dest_str)
        .replace('\'', "''");

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
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null;
    $doc = $null;
    $w.Quit();
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null;
    $w = $null;
    exit 0;
}} catch {{
    Write-Error $_.Exception.Message;
    exit 1;
}} finally {{
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null; }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null; }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_pdf_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    run_ps_com_script(&script, vec![temp_pdf], 45, "Word PDF->DOCX") && dest.is_file()
}

#[cfg(not(windows))]
fn try_msword_pdf_to_docx(_src: &Path, _dest: &Path) -> bool {
    false
}

fn try_libreoffice_pdf_to_docx(src: &Path, dest: &Path) -> bool {
    let bin = match find_libreoffice_bin() {
        Some(b) => b,
        None => return false,
    };

    let temp_out = std::env::temp_dir().join("multimedia-converter-lo-docx");
    let _ = std::fs::create_dir_all(&temp_out);

    let mut c = Command::new(bin);
    c.args([
        "--headless",
        "--infilter=writer_pdf_import",
        "--convert-to",
        "docx",
        "--outdir",
    ])
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
    let src_clean = src_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&src_str)
        .replace('\'', "''");

    let dest_buf = if dest.is_absolute() {
        dest.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cd| cd.join(dest))
            .unwrap_or_else(|_| dest.to_path_buf())
    };
    let dest_str = dest_buf.to_string_lossy().into_owned();
    let dest_clean = dest_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&dest_str)
        .replace('\'', "''");

    let temp_pdf = unique_temp_path("conv_xl_reflow", "pdf");
    let temp_pdf_str = temp_pdf.to_string_lossy().into_owned().replace('\'', "''");

    let script = format!(
        r#"$ErrorActionPreference = 'Stop';
$w = $null;
$doc = $null;
$xl = $null;
$wb = $null;
$ws = $null;
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
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($wb) | Out-Null;
    $wb = $null;
    $xl.Quit();
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($xl) | Out-Null;
    $xl = $null;

    $doc.Close([ref]$false);
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null;
    $doc = $null;
    $w.Quit();
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null;
    $w = $null;

    exit 0;
}} catch {{
    Write-Error $_.Exception.Message;
    exit 1;
}} finally {{
    if ($ws) {{ try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($ws) | Out-Null; }} catch {{}} }}
    if ($doc) {{ try {{ $doc.Close([ref]$false); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null; }} catch {{}} }}
    if ($w) {{ try {{ $w.Quit(); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($w) | Out-Null; }} catch {{}} }}
    if ($wb) {{ try {{ $wb.Close($false); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($wb) | Out-Null; }} catch {{}} }}
    if ($xl) {{ try {{ $xl.Quit(); }} catch {{}} try {{ [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($xl) | Out-Null; }} catch {{}} }}
    [GC]::Collect();
    [GC]::WaitForPendingFinalizers();
    Remove-Item -Path '{temp_pdf_str}' -Force -ErrorAction SilentlyContinue;
}}"#
    );

    run_ps_com_script(&script, vec![temp_pdf], 60, "Office PDF->XLSX") && dest.is_file()
}

#[cfg(not(windows))]
fn try_msoffice_pdf_to_xlsx(_src: &Path, _dest: &Path) -> bool {
    false
}

fn write_xlsx_from_lines(dest: &Path, lines: &[String]) -> Res<()> {
    let file = File::create(dest)?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

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

    zip.start_file("_rels/.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#)?;

    zip.start_file("xl/_rels/workbook.xml.rels", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#)?;

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

    zip.start_file("xl/workbook.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Datos" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"#)?;

    zip.start_file("xl/worksheets/sheet1.xml", opts)
        .map_err(|e| AppError::Msg(e.to_string()))?;
    let mut sheet_xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
"#,
    );

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

            if cell_value.trim().parse::<f64>().is_ok() {
                sheet_xml.push_str(&format!(r#"<c r="{cell_ref}"><v>{text}</v></c>"#));
            } else {
                sheet_xml.push_str(&format!(
                    r#"<c r="{cell_ref}" t="inlineStr"><is><t>{text}</t></is></c>"#
                ));
            }
        }
        sheet_xml.push_str("</row>\n");
        row_idx += 1;
    }

    if row_idx == 1 {
        sheet_xml.push_str(
            r#"    <row r="1"><c r="A1" t="inlineStr"><is><t>(Sin datos tabulables)</t></is></c></row>"#,
        );
    }

    sheet_xml.push_str(
        r#"  </sheetData>
</worksheet>"#,
    );

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
    let src_ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if target_fmt == DocFormat::Xlsx && matches!(src_ext.as_str(), "txt" | "md" | "markdown") {
        return err(
            "La conversión a Excel (.xlsx) solo está disponible desde documentos PDF o DOCX con tablas/datos estructurados.",
        );
    }

    let dest = resolve_dest_path(src, desired_dest, overwrite);
    ensure_parent_dir(&dest)?;

    if src_ext == "xlsx" && target_fmt == DocFormat::Xlsx {
        std::fs::copy(src, &dest)?;
        let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        return Ok((dest.to_string_lossy().into_owned(), size));
    }

    if src_ext == "docx" && target_fmt == DocFormat::Pdf {
        if try_msword_pdf(src, &dest) || try_libreoffice_pdf(src, &dest) {
            let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            return Ok((dest.to_string_lossy().into_owned(), size));
        }
    }

    if src_ext == "pdf" && target_fmt == DocFormat::Docx {
        if try_msword_pdf_to_docx(src, &dest) || try_libreoffice_pdf_to_docx(src, &dest) {
            let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            return Ok((dest.to_string_lossy().into_owned(), size));
        }
    }

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
                    logger::log_warn(
                        "docs",
                        &format!("Conversión avanzada PDF->DOCX falló ({e}), usando fallback de párrafos"),
                    );
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

fn strip_openxml_sync(src: &Path, dest: &Path, label: &str) -> Res<u64> {
    let file_in = File::open(src)?;
    let reader = BufReader::new(file_in);
    let mut zip_in = ZipArchive::new(reader)
        .map_err(|e| AppError::Msg(format!("Archivo {label} inválido: {e}")))?;

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
        } else if name == "docProps/custom.xml" || name.starts_with("docProps/thumbnail.") {
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

    let mut xmp_ids = Vec::new();
    for (&id, obj) in &doc.objects {
        if let Ok(stream) = obj.as_stream() {
            let is_meta_type = stream
                .dict
                .get(b"Type")
                .and_then(Object::as_name_str)
                .map(|n| n == "Metadata")
                .unwrap_or(false);
            let is_xml_subtype = stream
                .dict
                .get(b"Subtype")
                .and_then(Object::as_name_str)
                .map(|n| n == "XML")
                .unwrap_or(false);
            if is_meta_type || is_xml_subtype {
                xmp_ids.push(id);
            }
        }
    }
    for id in xmp_ids {
        doc.objects.remove(&id);
    }

    for obj in doc.objects.values_mut() {
        match obj {
            Object::Dictionary(ref mut dict) => {
                dict.remove(b"Metadata");
            }
            Object::Stream(ref mut stream) => {
                stream.dict.remove(b"Metadata");
            }
            _ => {}
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
        "docx" => strip_openxml_sync(src, &dest, "DOCX")?,
        "xlsx" => strip_openxml_sync(src, &dest, "XLSX")?,
        "pdf" => strip_pdf_sync(src, &dest)?,
        "txt" | "md" => {
            std::fs::copy(src, &dest)?;
            std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0)
        }
        _ => return err("Solo se admite quitar metadatos en archivos PDF, DOCX y XLSX."),
    };
    Ok((dest.to_string_lossy().into_owned(), bytes))
}

// ─────────────────── Unión de PDFs ───────────────────

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

    let mut base = PdfDoc::load(&sources[0])
        .map_err(|e| AppError::Msg(format!("No se pudo abrir {}: {e}", sources[0])))?;

    for src_path in &sources[1..] {
        let other = PdfDoc::load(src_path)
            .map_err(|e| AppError::Msg(format!("No se pudo abrir {}: {e}", src_path)))?;

        let other_pages = other.get_pages();
        let mut sorted_pages: Vec<_> = other_pages.into_iter().collect();
        sorted_pages.sort_by_key(|(num, _)| *num);

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

        base.max_id = next_max + 1;

        let new_ids: Vec<ObjectId> = id_map.values().copied().collect();
        for new_id in &new_ids {
            if let Some(obj) = base.objects.get_mut(new_id) {
                remap_object_refs(obj, &id_map);
            }
        }

        let base_pages_id = base
            .catalog()
            .and_then(|cat| cat.get(b"Pages"))
            .and_then(Object::as_reference)
            .map_err(|_| AppError::Msg("Catálogo del PDF base inválido.".into()))?;

        for (_, old_page_id) in &sorted_pages {
            if let Some(&new_page_id) = id_map.get(old_page_id) {
                if let Some(page_obj) = base.objects.get_mut(&new_page_id) {
                    if let Ok(dict) = page_obj.as_dict_mut() {
                        dict.set("Parent", Object::Reference(base_pages_id));
                    }
                }
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

    let dest = resolve_dest_path(Path::new(&sources[0]), desired_dest, overwrite);
    ensure_parent_dir(&dest)?;

    base.compress();
    base.save(&dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF unido: {e}")))?;

    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok((dest.to_string_lossy().into_owned(), size))
}

// ─────────────────── Dividir PDF y extraer páginas (Split) ───────────────────

/// Parsea rangos como `"1-3, 5, 8-10"` validando contra `total_pages`.
fn parse_page_ranges(spec: &str, total_pages: u32, allow_empty_all: bool) -> Res<Vec<u32>> {
    let trimmed = spec.trim();
    if trimmed.is_empty() {
        if allow_empty_all {
            return Ok((1..=total_pages).collect());
        }
        return err("Escribe las páginas o rangos a extraer (por ejemplo: 1-3, 5, 8-10).");
    }

    let mut pages = Vec::new();
    for raw_part in trimmed.split(&[',', ';'][..]) {
        let part = raw_part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((start_s, end_s)) = part.split_once('-') {
            let start: u32 = start_s
                .trim()
                .parse()
                .map_err(|_| AppError::Msg(format!("Número de página inválido en «{part}».")))?;
            let end: u32 = end_s
                .trim()
                .parse()
                .map_err(|_| AppError::Msg(format!("Número de página inválido en «{part}».")))?;
            if start == 0 || end == 0 || start > end || end > total_pages {
                return err(format!(
                    "El rango «{part}» está fuera de los límites del documento (1 a {total_pages})."
                ));
            }
            pages.extend(start..=end);
        } else {
            let page: u32 = part
                .parse()
                .map_err(|_| AppError::Msg(format!("Número de página inválido: «{part}».")))?;
            if page == 0 || page > total_pages {
                return err(format!(
                    "La página {page} no existe (el documento tiene {total_pages} páginas)."
                ));
            }
            pages.push(page);
        }
    }

    if pages.is_empty() {
        return err("No se especificó ninguna página válida.");
    }
    Ok(pages)
}

fn collect_object_refs(
    obj: &Object,
    queue: &mut VecDeque<ObjectId>,
    visited: &HashSet<ObjectId>,
    is_page_root: bool,
) {
    match obj {
        Object::Reference(id) => {
            if !visited.contains(id) {
                queue.push_back(*id);
            }
        }
        Object::Array(arr) => {
            for item in arr {
                collect_object_refs(item, queue, visited, false);
            }
        }
        Object::Dictionary(dict) => {
            for (k, val) in dict.iter() {
                if is_page_root && k == b"Parent" {
                    continue; // Evita arrastrar el árbol completo de páginas del PDF origen
                }
                collect_object_refs(val, queue, visited, false);
            }
        }
        Object::Stream(stream) => {
            for (_, val) in stream.dict.iter() {
                collect_object_refs(val, queue, visited, false);
            }
        }
        _ => {}
    }
}

/// Busca un atributo heredable (`/Resources`, `/MediaBox`, `/CropBox`, `/Rotate`) subiendo por `/Parent`.
fn find_inherited_attr(doc: &PdfDoc, page_id: ObjectId, key: &[u8]) -> Option<Object> {
    let mut cur = page_id;
    let mut seen = HashSet::new();
    while let Ok(dict) = doc.get_object(cur).and_then(Object::as_dict) {
        if !seen.insert(cur) {
            break;
        }
        if let Ok(val) = dict.get(key) {
            return Some(val.clone());
        }
        if let Ok(parent_ref) = dict.get(b"Parent").and_then(Object::as_reference) {
            cur = parent_ref;
        } else {
            break;
        }
    }
    None
}

/// Construye y guarda un PDF nuevo con exactamente las páginas `selected_pages` (1-indexed) de `src_doc`.
fn write_pdf_subset(src_doc: &PdfDoc, selected_pages: &[u32], dest: &Path) -> Res<u64> {
    let pages_map = src_doc.get_pages();
    let mut out = PdfDoc::with_version(src_doc.version.clone());
    let mut visited: HashSet<ObjectId> = HashSet::new();
    let mut queue: VecDeque<ObjectId> = VecDeque::new();
    let mut max_id = 1u32;

    let mut page_id_sequence = Vec::with_capacity(selected_pages.len());
    for &pnum in selected_pages {
        let &pid = pages_map
            .get(&pnum)
            .ok_or_else(|| AppError::Msg(format!("Página {pnum} no encontrada en el PDF.")))?;
        page_id_sequence.push(pid);
        if !visited.contains(&pid) {
            queue.push_back(pid);
        }
    }

    // Recorrer únicamente los objetos alcanzables desde las páginas seleccionadas
    let page_roots: HashSet<ObjectId> = page_id_sequence.iter().copied().collect();
    while let Some(id) = queue.pop_front() {
        if !visited.insert(id) {
            continue;
        }
        if id.0 >= max_id {
            max_id = id.0 + 1;
        }
        if let Ok(mut obj) = src_doc.get_object(id).cloned() {
            let is_page = page_roots.contains(&id);
            if is_page {
                // Materializar atributos heredados antes de desconectar /Parent
                for inherited_key in [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"] {
                    let has_key = obj.as_dict().map(|d| d.has(inherited_key)).unwrap_or(false);
                    if !has_key {
                        if let Some(val) = find_inherited_attr(src_doc, id, inherited_key) {
                            if let Ok(d) = obj.as_dict_mut() {
                                d.set(inherited_key, val);
                            }
                        }
                    }
                }
            }
            collect_object_refs(&obj, &mut queue, &visited, is_page);
            out.objects.insert(id, obj);
        }
    }

    out.max_id = max_id;
    let pages_id = out.new_object_id();

    let mut kids = Vec::with_capacity(page_id_sequence.len());
    let mut used_page_ids = HashSet::new();

    for pid in page_id_sequence {
        let final_pid = if used_page_ids.insert(pid) {
            pid
        } else {
            // Si el usuario pidió la misma página dos veces (ej. "1, 1"), clonar el diccionario de página
            let new_pid = out.new_object_id();
            if let Some(cloned_page) = out.objects.get(&pid).cloned() {
                out.objects.insert(new_pid, cloned_page);
            }
            new_pid
        };

        if let Some(page_obj) = out.objects.get_mut(&final_pid) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                dict.set("Parent", Object::Reference(pages_id));
            }
        }
        kids.push(Object::Reference(final_pid));
    }

    let kids_count = kids.len() as i64;
    out.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => kids_count,
        }),
    );

    let catalog_id = out.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    out.trailer.set("Root", catalog_id);
    out.compress();
    out.save(dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF dividido: {e}")))?;

    Ok(std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0))
}

fn split_pdf_sync(
    src: &Path,
    output_dir: Option<&Path>,
    mode: SplitMode,
    page_range: &str,
    overwrite: bool,
) -> Res<(Vec<String>, u64, usize)> {
    let doc =
        PdfDoc::load(src).map_err(|e| AppError::Msg(format!("No se pudo abrir el PDF: {e}")))?;
    let total_pages = doc.get_pages().len() as u32;
    if total_pages == 0 {
        return err("El PDF no contiene páginas.");
    }

    let target_dir = output_dir
        .filter(|p| !p.as_os_str().is_empty())
        .or_else(|| src.parent())
        .unwrap_or_else(|| Path::new(""));
    std::fs::create_dir_all(target_dir)?;

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("documento");

    match mode {
        SplitMode::Extract => {
            let pages = parse_page_ranges(page_range, total_pages, false)?;
            let desired = target_dir.join(format!("{stem}_paginas.pdf"));
            let dest = resolve_dest_path(src, &desired, overwrite);
            let bytes = write_pdf_subset(&doc, &pages, &dest)?;
            Ok((
                vec![dest.to_string_lossy().into_owned()],
                bytes,
                pages.len(),
            ))
        }
        SplitMode::Burst => {
            let raw_pages = parse_page_ranges(page_range, total_pages, true)?;
            let mut seen = HashSet::new();
            let pages: Vec<u32> = raw_pages.into_iter().filter(|p| seen.insert(*p)).collect();

            let mut outputs = Vec::with_capacity(pages.len());
            let mut total_bytes = 0u64;
            let pad_width = total_pages.to_string().len();

            for p in &pages {
                let desired =
                    target_dir.join(format!("{stem}_pag_{:0width$}.pdf", p, width = pad_width));
                let dest = resolve_dest_path(src, &desired, overwrite);
                let bytes = write_pdf_subset(&doc, &[*p], &dest)?;
                total_bytes += bytes;
                outputs.push(dest.to_string_lossy().into_owned());
            }

            Ok((outputs, total_bytes, pages.len()))
        }
    }
}

// ─────────────────── Compilar Imágenes a PDF A4 ───────────────────

fn tiff_orientation_inline(tiff: &[u8]) -> Option<u16> {
    let le = match tiff.get(..2)? {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let u16_at = |o: usize| -> Option<u16> {
        let b: [u8; 2] = tiff.get(o..o + 2)?.try_into().ok()?;
        Some(if le {
            u16::from_le_bytes(b)
        } else {
            u16::from_be_bytes(b)
        })
    };
    let u32_at = |o: usize| -> Option<u32> {
        let b: [u8; 4] = tiff.get(o..o + 4)?.try_into().ok()?;
        Some(if le {
            u32::from_le_bytes(b)
        } else {
            u32::from_be_bytes(b)
        })
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

fn detect_jpeg_exif_orientation(d: &[u8]) -> u16 {
    if !d.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return 1;
    }
    let mut i = 2;
    while i + 4 <= d.len() && d[i] == 0xFF {
        let m = d[i + 1];
        if m == 0xFF {
            i += 1;
            continue;
        }
        if m == 0xDA || m == 0xD9 {
            break;
        }
        if m == 0x01 || (0xD0..=0xD8).contains(&m) {
            i += 2;
            continue;
        }
        let len = u16::from_be_bytes([d[i + 2], d[i + 3]]) as usize;
        let end = i + 2 + len;
        if len < 2 || end > d.len() {
            break;
        }
        if m == 0xE1 {
            if let Some(tiff) = d[i + 4..end].strip_prefix(b"Exif\0\0") {
                if let Some(o) = tiff_orientation_inline(tiff) {
                    return o;
                }
            }
        }
        i = end;
    }
    1
}

fn apply_orientation(img: DynamicImage, o: u16) -> DynamicImage {
    match o {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// Compone una imagen con canal alfa sobre fondo blanco (papel A4) para incrustarla en PDF sin artefactos.
fn flatten_to_rgb8(img: &DynamicImage) -> image::RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut rgb = image::RgbImage::new(w, h);
    for (x, y, px) in rgba.enumerate_pixels() {
        let a = px[3] as u32;
        let inv = 255 - a;
        let r = ((px[0] as u32 * a + 255 * inv) / 255) as u8;
        let g = ((px[1] as u32 * a + 255 * inv) / 255) as u8;
        let b = ((px[2] as u32 * a + 255 * inv) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([r, g, b]));
    }
    rgb
}

fn images_to_pdf_sync(
    sources: &[String],
    desired_dest: &Path,
    overwrite: bool,
) -> Res<(String, u64)> {
    if sources.is_empty() {
        return err("Añade al menos una imagen (JPG, PNG o WebP) para crear el PDF.");
    }

    let mut doc = PdfDoc::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut page_ids = Vec::with_capacity(sources.len());

    // Dimensiones estándar A4 en puntos PDF (72 DPI): 595 × 842 pt con margen de 36 pt (~12.7 mm)
    let page_w = 595.0_f64;
    let page_h = 842.0_f64;
    let margin = 36.0_f64;
    let max_w = page_w - margin * 2.0;
    let max_h = page_h - margin * 2.0;

    for src_str in sources {
        let src_path = Path::new(src_str);
        let raw_bytes = std::fs::read(src_path)?;
        let orientation = detect_jpeg_exif_orientation(&raw_bytes);
        let is_plain_jpeg = raw_bytes.starts_with(&[0xFF, 0xD8, 0xFF]) && orientation == 1;

        let (width, height, filter_name, encoded_stream) = if is_plain_jpeg {
            let (w, h) = image::image_dimensions(src_path)?;
            (w, h, "DCTDecode", raw_bytes)
        } else {
            let mut img = image::load_from_memory(&raw_bytes)?;
            if orientation != 1 {
                img = apply_orientation(img, orientation);
            }
            let rgb = flatten_to_rgb8(&img);
            let (w, h) = rgb.dimensions();
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(rgb.as_raw())?;
            let compressed = encoder.finish()?;
            (w, h, "FlateDecode", compressed)
        };

        let iw = width.max(1) as f64;
        let ih = height.max(1) as f64;
        let scale = (max_w / iw).min(max_h / ih);
        let draw_w = iw * scale;
        let draw_h = ih * scale;
        let x = (page_w - draw_w) / 2.0;
        let y = (page_h - draw_h) / 2.0;

        let img_id = doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => width as i64,
                "Height" => height as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
                "Filter" => filter_name,
            },
            encoded_stream,
        ));

        let resources_id = doc.add_object(dictionary! {
            "XObject" => dictionary! {
                "Im1" => img_id,
            },
        });

        let content_cmd = format!("q\n{draw_w:.2} 0 0 {draw_h:.2} {x:.2} {y:.2} cm\n/Im1 Do\nQ\n");
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_cmd.into_bytes()));

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

    let dest = resolve_dest_path(Path::new(&sources[0]), desired_dest, overwrite);
    ensure_parent_dir(&dest)?;
    doc.save(&dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF generado: {e}")))?;

    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok((dest.to_string_lossy().into_owned(), size))
}

// ─────────────────── Compresor de PDF (Recomprimir imágenes pesadas + flujos) ───────────────────

fn compress_pdf_sync(
    src: &Path,
    desired_dest: &Path,
    level: PdfCompressLevel,
    overwrite: bool,
) -> Res<(String, u64)> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "pdf" {
        return err("La compresión solo está disponible para archivos PDF.");
    }

    let (max_dim, jpeg_quality, min_bytes): (u32, u8, usize) = match level {
        PdfCompressLevel::Low => (2000, 85, 60_000),
        PdfCompressLevel::Medium => (1400, 72, 35_000),
        PdfCompressLevel::High => (1000, 55, 20_000),
    };

    let dest = resolve_dest_path(src, desired_dest, overwrite);
    ensure_parent_dir(&dest)?;

    let mut doc =
        PdfDoc::load(src).map_err(|e| AppError::Msg(format!("No se pudo abrir el PDF: {e}")))?;

    let obj_ids: Vec<ObjectId> = doc.objects.keys().copied().collect();

    for id in obj_ids {
        let candidate = {
            let Ok(stream) = doc.get_object(id).and_then(Object::as_stream) else {
                continue;
            };
            let is_image = stream
                .dict
                .get(b"Subtype")
                .and_then(Object::as_name_str)
                .map(|s| s == "Image")
                .unwrap_or(false);
            if !is_image {
                continue;
            }

            // Conservar intactas máscaras binarias o imágenes con canal alfa /SMask (logotipos/firmas)
            let is_mask = stream
                .dict
                .get(b"ImageMask")
                .and_then(Object::as_bool)
                .unwrap_or(false);
            if is_mask || stream.dict.has(b"SMask") || stream.dict.has(b"Mask") {
                continue;
            }

            let w = stream
                .dict
                .get(b"Width")
                .and_then(Object::as_i64)
                .unwrap_or(0) as u32;
            let h = stream
                .dict
                .get(b"Height")
                .and_then(Object::as_i64)
                .unwrap_or(0) as u32;

            if w < 96 || h < 96 {
                continue;
            }
            if stream.content.len() < min_bytes && w <= max_dim && h <= max_dim {
                continue;
            }

            extract_image_from_stream(&doc, stream)
                .map(|(img_bytes, _, _, _)| (img_bytes, stream.content.len()))
        };

        let Some((decoded_bytes, orig_stream_len)) = candidate else {
            continue;
        };

        let Ok(mut img) = image::load_from_memory(&decoded_bytes) else {
            continue;
        };

        if img.width() > max_dim || img.height() > max_dim {
            img = img.resize(max_dim, max_dim, FilterType::Lanczos3);
        }

        let rgb = flatten_to_rgb8(&img);
        let (new_w, new_h) = rgb.dimensions();
        let mut jpeg_buf = Vec::new();
        if JpegEncoder::new_with_quality(&mut jpeg_buf, jpeg_quality)
            .write_image(rgb.as_raw(), new_w, new_h, ExtendedColorType::Rgb8)
            .is_err()
        {
            continue;
        }

        // Solo reemplazar si realmente reduce el peso del flujo
        if jpeg_buf.len() + 64 < orig_stream_len {
            if let Ok(stream_mut) = doc.get_object_mut(id).and_then(Object::as_stream_mut) {
                stream_mut.set_content(jpeg_buf);
                stream_mut.dict.set("Width", new_w as i64);
                stream_mut.dict.set("Height", new_h as i64);
                stream_mut.dict.set("ColorSpace", "DeviceRGB");
                stream_mut.dict.set("BitsPerComponent", 8);
                stream_mut.dict.set("Filter", "DCTDecode");
                stream_mut.dict.remove(b"DecodeParms");
            }
        }
    }

    doc.compress();
    doc.save(&dest)
        .map_err(|e| AppError::Msg(format!("No se pudo guardar el PDF comprimido: {e}")))?;

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
                        Err(e) => {
                            logger::log_error(
                                "docs",
                                &format!("Error convirtiendo {}: {e}", j.source),
                            );
                            DocResult {
                                source: j.source.clone(),
                                dest: j.dest.clone(),
                                ok: false,
                                error: Some(e.to_string()),
                                size_bytes: None,
                            }
                        }
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
                        Err(e) => {
                            logger::log_error(
                                "docs",
                                &format!("Error limpiando metadatos de {}: {e}", j.source),
                            );
                            DocResult {
                                source: j.source.clone(),
                                dest: j.dest.clone(),
                                ok: false,
                                error: Some(e.to_string()),
                                size_bytes: None,
                            }
                        }
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
            Err(e) => {
                logger::log_error("docs", &format!("Error uniendo PDFs: {e}"));
                Ok(DocResult {
                    source: sources.first().cloned().unwrap_or_default(),
                    dest,
                    ok: false,
                    error: Some(e.to_string()),
                    size_bytes: None,
                })
            }
        }
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))?
}

#[tauri::command]
pub async fn split_pdf(
    app: AppHandle,
    source: String,
    output_dir: Option<String>,
    mode: SplitMode,
    page_range: String,
    overwrite: Option<bool>,
) -> Result<SplitPdfResult, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        let ext = Path::new(&source)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext != "pdf" {
            return Ok(SplitPdfResult {
                source,
                outputs: Vec::new(),
                ok: false,
                error: Some("Solo se pueden dividir archivos PDF.".into()),
                total_size_bytes: None,
                pages_extracted: 0,
            });
        }

        let _ = app.emit("doc-progress", DocProgress { done: 0, total: 1 });
        let out_dir_path = output_dir.as_deref().map(Path::new);

        match split_pdf_sync(Path::new(&source), out_dir_path, mode, &page_range, ow) {
            Ok((outputs, total_bytes, pages_extracted)) => {
                let _ = app.emit("doc-progress", DocProgress { done: 1, total: 1 });
                Ok(SplitPdfResult {
                    source,
                    outputs,
                    ok: true,
                    error: None,
                    total_size_bytes: Some(total_bytes),
                    pages_extracted,
                })
            }
            Err(e) => {
                logger::log_error("docs", &format!("Error dividiendo PDF {source}: {e}"));
                Ok(SplitPdfResult {
                    source,
                    outputs: Vec::new(),
                    ok: false,
                    error: Some(e.to_string()),
                    total_size_bytes: None,
                    pages_extracted: 0,
                })
            }
        }
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))?
}

#[tauri::command]
pub async fn images_to_pdf(
    app: AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<DocResult, AppError> {
    let ow = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        for s in &sources {
            let ext = Path::new(s)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
                return Ok(DocResult {
                    source: s.clone(),
                    dest: dest.clone(),
                    ok: false,
                    error: Some(format!("Archivo de imagen no compatible: {s}")),
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

        match images_to_pdf_sync(&sources, Path::new(&dest), ow) {
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
            Err(e) => {
                logger::log_error("docs", &format!("Error compilando imágenes a PDF: {e}"));
                Ok(DocResult {
                    source: sources.first().cloned().unwrap_or_default(),
                    dest,
                    ok: false,
                    error: Some(e.to_string()),
                    size_bytes: None,
                })
            }
        }
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))?
}

#[tauri::command]
pub async fn compress_pdfs_batch(
    app: AppHandle,
    jobs: Vec<DocJob>,
    level: PdfCompressLevel,
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
                    let r = compress_pdf_sync(Path::new(&j.source), Path::new(&j.dest), level, ow);
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
                        Err(e) => {
                            logger::log_error(
                                "docs",
                                &format!("Error comprimiendo PDF {}: {e}", j.source),
                            );
                            DocResult {
                                source: j.source.clone(),
                                dest: j.dest.clone(),
                                ok: false,
                                error: Some(e.to_string()),
                                size_bytes: None,
                            }
                        }
                    }
                })
                .collect::<Vec<DocResult>>()
        })
    })
    .await
    .map_err(|e| AppError::Msg(format!("Tarea interrumpida: {e}")))
}
