<div align="center">

# 🎬 Multimedia Converter

**Un convertidor multimedia de escritorio rápido, moderno y seguro para Windows.**  
Procesa video, imágenes y documentos con aceleración por hardware (GPU) y procesamiento paralelo en hilos.

[![Release](https://img.shields.io/github/v/release/Bobe1destructor/multimedia-converter?style=for-the-badge&color=6366f1)](https://github.com/Bobe1destructor/multimedia-converter/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d4?style=for-the-badge&logo=windows)](https://github.com/Bobe1destructor/multimedia-converter/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_v2-24c8db?style=for-the-badge&logo=tauri)](https://v2.tauri.app)

<br />

[📥 Descargar última versión (.exe)](https://github.com/Bobe1destructor/multimedia-converter/releases/latest) · [✨ Características](#-características) · [💻 Tecnologías](#-stack-tecnológico)

</div>

---

## ⚡ Características Principales

### 🎥 Conversor de Video
- **Formatos admitidos**: MP4, MKV, WebM, MOV, AVI, etc.
- **Aceleración por GPU**: Detección automática de **NVIDIA (NVENC)**, **Intel (QSV)** y **AMD (AMF)**.
- **Códecs modernos**: H.264, H.265 (HEVC), AV1, VP9.
- **Opciones avanzadas**: Copia directa (remuxing sin pérdida instantáneo), extracción de audio a MP3 y selector de calidad/resolución.

### 🖼️ Conversor de Imágenes
- Conversión por lotes a alta velocidad con multihilos (Rayon).
- Soporte para **PNG, JPG y WebP**.
- Escala de resolución personalizada y ajuste de calidad de compresión.
- Herramienta para **eliminar metadatos EXIF** para privacidad.

### 📄 Conversor de Documentos
- Conversión entre **PDF, DOCX, TXT y Markdown**.
- **Unión de archivos PDF** en un solo documento.
- Limpieza de metadatos de documentos.

### 🎨 Experiencia y Personalización
- **Actualizaciones automáticas integradas**: Notifica al abrir la app cuando hay una nueva versión en GitHub para descargarla con un clic.
- **Paleta de colores fluida**: Temas predefinidos y mezclador de color RGB personalizado.
- **Arrastrar y soltar (Drag & Drop)**: Arrastra tus archivos directamente a la ventana para empezar a convertir.
- **Notificaciones del sistema**: Avisos sonoros y notificaciones nativas de Windows al terminar tareas en segundo plano.

---

## 📥 Instalación

1. Dirígete a la sección de [Releases](https://github.com/Bobe1destructor/multimedia-converter/releases/latest).
2. Descarga el instalador ejecutable `multimedia-converter_..._setup.exe`.
3. Ejecuta el archivo y sigue el asistente de instalación.

> [!NOTE]
> **Aviso de Windows SmartScreen**: Al ser un instalador nuevo y sin certificado comercial de pago, Windows puede mostrar la ventana azul *"Windows protegió su PC"*.  
> Solo haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**. El software es 100% de código abierto y seguro.

---

## 🛠️ Stack Tecnológico

- **Core / Backend**: [Rust](https://www.rust-lang.org/) + [Tauri v2](https://v2.tauri.app/) (alto rendimiento, bajo consumo de RAM).
- **Procesamiento de Video**: [FFmpeg](https://ffmpeg.org/) integrado.
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/).
- **Animaciones**: [Framer Motion](https://www.framer.com/motion/).
- **Iconos**: [Lucide Icons](https://lucide.dev/).

---

## 🏗️ Compilar desde el código fuente

Si deseas clonar y compilar el proyecto en tu propia máquina:

### Requisitos previos:
- [Node.js](https://nodejs.org/) (versión 18 o superior).
- [Rust & Cargo](https://rustup.rs/).
- Carga de binarios de `ffmpeg.exe` y `ffprobe.exe` en `src-tauri/binaries/`.

### Pasos:

```bash
# 1. Clonar el repositorio
git clone https://github.com/Bobe1destructor/multimedia-converter.git
cd multimedia-converter

# 2. Instalar dependencias de frontend
npm install

# 3. Ejecutar en modo desarrollo
npm run tauri dev

# 4. Generar instalador para producción
npm run tauri build
```

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
