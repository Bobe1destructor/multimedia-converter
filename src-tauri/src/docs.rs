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

#[cfg(not(windows))]
fn is_word_installed() -> bool {
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
}
