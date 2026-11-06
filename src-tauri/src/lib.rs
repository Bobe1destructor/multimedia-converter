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
