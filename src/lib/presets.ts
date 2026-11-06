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