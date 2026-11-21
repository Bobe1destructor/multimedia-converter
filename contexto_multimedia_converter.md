# Contexto y Arquitectura del Proyecto: Multimedia Converter

## 1. Visión General
**Multimedia Converter** es una aplicación de escritorio nativa, ultrarrápida y moderna construida con **Tauri v2 (Rust)** en el backend y **React 19 + TypeScript + Vite + Tailwind CSS** en el frontend. Su objetivo es convertir, optimizar y manipular archivos multimedia (video, audio, imágenes y documentos) de forma local, segura y con aceleración de hardware.

* **Versión actual**: `0.3.8`
* **Licencia / Repositorio**: `Bobe1destructor/multimedia-converter` (GitHub)
* **Sistema Operativo Principal**: Windows 10 / 11 (x64)

---

## 2. Pila Tecnológica (Tech Stack)

### Frontend (`/src`)
* **Framework**: React 19 (`react`, `react-dom`) con TypeScript.
* **Empaquetador**: Vite + Rollup/Rolldown.
* **Estilos**: Tailwind CSS con paleta oscura personalizada (`#0e1122`, `#131a2a`, `#23284f`), animaciones suaves y soporte de colores de acento configurables en tiempo real (RGB / HSL).
* **Animaciones**: `framer-motion`.
* **Iconos**: `lucide-react`.
* **Integración Tauri**: `@tauri-apps/api`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-dialog`.

### Backend (`/src-tauri`)
* **Core**: Tauri v2 (`tauri = "2"`, `features = ["protocol-asset"]`).
* **Concurrencia**: Tokio (asíncrono) + Rayon (procesamiento en paralelo por lotes con límite configurable de hilos).
* **Video/Audio**: `ffmpeg` y `ffprobe` portables incluidos como recursos (`src-tauri/binaries/`). Detección automática de aceleración por GPU (NVIDIA NVENC, Intel QSV, AMD AMF, CPU fallback).
* **Imágenes**: Crate `image` para decodificación, compresión multihilo y eliminación de metadatos EXIF.
* **Documentos**: Crate `lopdf` (PDF), `zip` (OpenXML/DOCX/XLSX), más integración COM nativa con Microsoft Office (Word PDF Reflow y Excel COM) en Windows con fallback a generador OpenXML nativo.
* **Actualizador Nativo**: `tauri-plugin-updater` y `tauri-plugin-process` con firmas criptográficas Minisign.

---

## 3. Estructura de Directorios

```text
multimedia-converter/
├── package.json                   # Dependencias de Node, scripts y versión (0.3.8)
├── vite.config.ts                 # Configuración de Vite y plugins
├── tailwind.config.js / postcss   # Configuración de diseño
├── build_signed.ps1               # Script PowerShell para compilar, firmar y generar latest.json
├── generate_latest_json.ps1       # Generador del manifiesto de actualización firmado
├── src/                           # Código Frontend (React + TS)
│   ├── main.tsx                   # Punto de entrada de React
│   ├── App.tsx                    # Componente raíz, pestañas, banner de actualización y toasts
│   ├── types.ts                   # Interfaces y tipos globales (Video, Imagen, Doc, Metadatos)
│   ├── components/
│   │   ├── VideoTab.tsx           # Pestaña de conversión de Video / Audio
│   │   ├── ImageTab.tsx           # Pestaña de conversión y limpieza de Imágenes
│   │   ├── DocTab.tsx             # Pestaña de Documentos (PDF, DOCX, XLSX, TXT, MD)
│   │   ├── PreviewModal.tsx       # Reproductor integrado y comparador visual Antes/Después
│   │   ├── SettingsModal.tsx      # Configuración (Rendimiento, CPU/GPU, Color de acento, Actualizaciones)
│   │   ├── NativeUpdateBanner.tsx # Notificación elegante de actualización disponible
│   │   ├── Toast.tsx              # Notificaciones flotantes
│   │   └── ui.tsx                 # Componentes base reutilizables (Botones, Dropzone, ProgressBars)
│   ├── hooks/
│   │   ├── useVideoConverter.ts   # Estado, cola y lógica de video
│   │   ├── useImageConverter.ts   # Estado, cola y lógica de imágenes
│   │   ├── useDocConverter.ts     # Estado, cola y lógica de documentos
│   │   ├── useAppSettings.ts      # Persistencia en localStorage de preferencias
│   │   ├── useHwProfile.ts        # Hook para perfil de aceleración GPU
│   │   └── tauri.ts               # Hook de Drag & Drop nativo de Tauri
│   └── lib/
│       ├── nativeUpdater.ts       # Integración con plugin-updater de Tauri (check & install)
│       ├── updater.ts             # Comparador semver y fallback vía GitHub API
│       ├── presets.ts             # Presets de video (Web, Móvil, Alta fidelidad, etc.)
│       ├── resolution.ts          # Escalado y cálculo de resoluciones de video
│       └── utils.ts               # Formateo de bytes, rutas y chiming sonoro
│
└── src-tauri/                     # Backend en Rust
    ├── Cargo.toml                 # Dependencias de Rust y metadata
    ├── tauri.conf.json            # Configuración de Tauri, capacidades, bundle y firma
    ├── capabilities/
    │   └── default.json           # Permisos de plugins (dialog, updater, process, opener)
    ├── binaries/                  # Binarios portables ffmpeg.exe y ffprobe.exe
    └── src/
        ├── main.rs                # Punto de entrada de Tauri
        ├── lib.rs                 # Registro de comandos y plugins
        ├── commands.rs            # Comandos de video, audio, imágenes y detección de hardware GPU
        └── docs.rs                # Motor de lectura, conversión (Word/Excel/PDF) y limpieza de metadatos
```

---

## 4. Módulos Clave y Funcionalidades

### A. Documentos (`docs.rs` y `DocTab.tsx`)
* **Formatos soportados**:
  * Entrada: PDF, DOCX, TXT, MD.
  * Salida: PDF, DOCX, XLSX (Excel), TXT, MD.
* **Modos**:
  1. `convert`: Conversión entre formatos con soporte individual por archivo o por lote.
  2. `strip`: Limpieza completa de metadatos (limpia core.xml y app.xml en DOCX; limpia trailers e Info dict en PDF).
  3. `merge`: Fusión de múltiples PDFs en uno solo con ordenamiento interactivo (subir/bajar).
* **Conversión PDF a Word (DOCX)**:
  * Motor Primario: Word PDF Reflow oficial vía COM (Windows).
  * Motor Fallback: Reconstrucción geométrica y de texto nativa en Rust.
* **Conversión PDF a Excel (XLSX)**:
  * Motor Primario: Word PDF Reflow para extraer tablas y celdas limpias + Excel COM (`xlOpenXMLWorkbook = 51`) con autoajuste de columnas (`UsedRange.Columns.AutoFit()`).
  * Motor Fallback: Generador nativo OpenXML Spreadsheet (`.xlsx`) en Rust empaquetado en ZIP con tipos numéricos e inline strings.

### B. Video y Audio (`commands.rs` y `VideoTab.tsx`)
* Formatos: MP4, MKV, MOV, WEBM, AVI, y extracción de audio a MP3.
* Codecs: H.264, HEVC (H.265), AV1, VP9.
* Aceleración por hardware detectada automáticamente: NVIDIA NVENC, Intel QSV, AMD AMF o CPU.
* Copia directa (Remux / Stream Copy) sin recodificar cuando el códec coincide.
* Previsualización integrada con reproductor interactivo y comparación original vs. convertido.

### C. Imágenes (`commands.rs` y `ImageTab.tsx`)
* Formatos: PNG, JPG, WebP.
* Modos: Conversión, compresión de calidad, escalado porcentual (100%, 75%, 50%, 25%) y limpieza total de metadatos EXIF.
* Comparador visual interactivo tipo "Split Slider" (Antes vs. Después).

### D. Sistema de Actualizaciones Automáticas
* Basado en `@tauri-apps/plugin-updater`.
* Endpoint público: `https://github.com/Bobe1destructor/multimedia-converter/releases/latest/download/latest.json`.
* Clave pública Minisign configurada en `tauri.conf.json`.
* Al publicar una nueva versión, el script `build_signed.ps1` compila el paquete NSIS, firma el `.zip` y genera el `latest.json`.
* La app detecta la actualización al abrirse o mediante el botón en Ajustes, descarga el parche silenciosamente y reinicia la app con un clic.

---

## 5. Estado Actual del Repositorio y Próximos Pasos
* **Versión en desarrollo**: `0.3.8`.
* **Últimos cambios implementados**:
  1. Incorporación de conversión de PDF a Excel (.xlsx) con motor dual Office COM / Rust OpenXML.
  2. Automatización del script `build_signed.ps1` para sincronizar versiones automáticamente con `tauri.conf.json`.
  3. Integración en UI del selector, badges verdes y glosario para XLSX.
* **Flujo para compilar nueva versión**:
  ```powershell
  .\build_signed.ps1
  ```
