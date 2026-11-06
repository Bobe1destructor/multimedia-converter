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