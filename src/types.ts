export type HwAccel = "nvenc" | "amf" | "qsv" | "vaapi" | "videotoolbox" | "cpu";
export type VideoCodec = "h264" | "hevc" | "av1" | "vp9";
export type VideoFormat = "mp4" | "mkv" | "mov" | "webm" | "avi";
export type ImgFormat = "png" | "jpg" | "webp";
export type ImgScale = "100" | "75" | "50" | "25";
export type DocFormat = "pdf" | "docx" | "txt" | "md";
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
