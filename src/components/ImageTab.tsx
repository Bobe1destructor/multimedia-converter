import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, FolderOpen, HelpCircle, Image as ImageIcon, Plus, ShieldCheck, UploadCloud, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ImageConverter, ImageMode, ImageQueueItem } from "../hooks/useImageConverter";
import { useTauriDrop } from "../hooks/tauri";
import type { ImageMetadata, ImgFormat, ImgScale } from "../types";
import { splitPath } from "../lib/utils";
import { detectAspect } from "../lib/resolution";
import { Card, DropZone, GradientButton, Notice, ProgressBar, Segmented, SecondaryButton, Stat } from "./ui";

const FORMATS = ["png", "jpg", "webp"] as const;
const FORMAT_LABEL: Record<ImgFormat, string> = {
  png: "PNG",
  jpg: "JPG",
  webp: "WebP",
};

const SCALES: readonly ImgScale[] = ["100", "75", "50", "25"] as const;
const SCALE_LABEL: Record<ImgScale, string> = {
  "100": "100% (Original)",
  "75": "75%",
  "50": "50%",
  "25": "25%",
};

const MODES = ["convert", "strip"] as const;
const MODE_LABEL: Record<ImageMode, string> = {
  convert: "Convertir formato",
  strip: "Quitar metadatos",
};

function formatBytes(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
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

/** Etiqueta de un selector con un botón «?» que abre el glosario de imágenes. */
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

/** Miniatura cuadrada (40×40 px) con fallback elegante si el navegador no puede renderizar el archivo. */
function ImageThumbInternal({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#23284f] bg-[#0e1122] text-indigo-300">
        <ImageIcon size={18} />
      </div>
    );
  }

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0e1122] shadow-sm">
      <img
        src={convertFileSrc(path)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}



const ImageThumb = memo(ImageThumbInternal);

function ImageQueueRowInternal({
  it,
  isSelected,
  resItem,
  locked,
  onSelect,
  onRemove,
}: {
  it: ImageQueueItem;
  isSelected: boolean;
  resItem?: { ok: boolean; dest: string; sizeBytes?: number | null };
  locked: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const f = splitPath(it.path);
  const realDiff =
    resItem?.ok && resItem.sizeBytes && it.meta?.sizeBytes
      ? (resItem.sizeBytes / it.meta.sizeBytes - 1) * 100
      : null;

  const sub =
    it.metaState === "loading"
      ? "Leyendo propiedades…"
      : it.metaState === "error"
        ? it.metaError ?? "No se pudo leer el archivo"
        : it.meta
          ? `${it.meta.width}×${it.meta.height} · ${formatBytes(it.meta.sizeBytes)}`
          : f.dir || "—";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      onClick={() => onSelect(it.id)}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-600/10"
          : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
      }`}
    >
      <ImageThumb path={it.path} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
          {f.file}
        </p>
        <p className={`truncate text-xs ${it.metaState === "error" ? "text-red-300" : "text-slate-500"}`}>
          {sub}
        </p>
        {resItem?.ok && resItem.sizeBytes != null && (
          <p className="truncate text-xs font-medium text-emerald-300">
            ✓ Salida real: {formatBytes(resItem.sizeBytes)}
            {realDiff !== null && ` (${realDiff <= 0 ? "−" : "+"}${Math.abs(realDiff).toFixed(0)}%)`}
          </p>
        )}
      </div>
      {resItem?.ok && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            revealItemInDir(resItem.dest).catch(() => {});
          }}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
          aria-label="Mostrar en carpeta"
          title="Mostrar en carpeta"
        >
          <FolderOpen size={14} />
        </button>
      )}
      <button
        type="button"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(it.id);
        }}
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
        aria-label="Quitar"
      >
        <X size={14} />
      </button>
    </motion.li>
  );


}
const ImageQueueRow = memo(ImageQueueRowInternal);
function scaledDimensions(meta: ImageMetadata, mode: ImageMode, scale: ImgScale) {
  const pct = mode === "strip" ? 100 : Number(scale);
  const w = Math.max(1, Math.floor((meta.width * pct) / 100));
  const h = Math.max(1, Math.floor((meta.height * pct) / 100));
  return { w, h, pct };
}

function estimateImageSize(
  meta: ImageMetadata,
  mode: ImageMode,
  format: ImgFormat,
  quality: number,
  scale: ImgScale,
): number {
  if (mode === "strip") {
    return Math.max(256, meta.sizeBytes - meta.removableBytes);
  }
  const { w, h } = scaledDimensions(meta, mode, scale);
  const pixels = w * h;
  if (format === "png") {
    return Math.round(pixels * (meta.hasAlpha ? 2.4 : 1.9));
  }
  if (format === "webp") {
    if (quality >= 100) return Math.round(pixels * 1.15);
    const bpp = 0.03 + ((quality - 1) * (0.24 - 0.03)) / 98;
    return Math.round(pixels * bpp);
  }
  const bpp = 0.05 + ((quality - 1) * (0.35 - 0.05)) / 99;
  return Math.round(pixels * bpp);
}

/** Lista legible de los bloques de metadatos detectados en el archivo original. */
function detectedMetaSummary(m: ImageMetadata): string {
  const tags: string[] = [];
  if (m.hasExif) tags.push("EXIF");
  if (m.hasGps) tags.push("GPS");
  if (m.hasXmp) tags.push("XMP");
  if (m.hasIptc) tags.push("IPTC");
  if (m.hasComments) tags.push("Comentarios");
  if (!tags.length) {
    return m.removableBytes > 0 ? `Datos extra (${formatBytes(m.removableBytes)})` : "Ninguno (Limpia)";
  }
  return `${tags.join(" + ")} (${formatBytes(m.removableBytes)})`;
}

/* ───────────────────────── Glosario de imágenes ───────────────────────── */

type ImageGlossaryTab = "mode" | "format";

interface ModeGlossaryEntry {
  tagline: string;
  howItWorks: string;
  pixelsAndQuality: string;
  useWhen: string;
}

interface FormatGlossaryEntry {
  tagline: string;
  pros: string;
  alphaAndCompression: string;
  useWhen: string;
}

const MODE_GLOSSARY: Record<ImageMode, ModeGlossaryEntry> = {
  convert: {
    tagline: "Decodifica la imagen y genera un archivo nuevo en el formato, tamaño y calidad elegidos.",
    howItWorks:
      "Lee el mapa de píxeles, aplica el redimensionado Lanczos3 (si elegiste 75%, 50% o 25%) y vuelve a comprimir la imagen como PNG, JPG o WebP.",
    pixelsAndQuality:
      "Los píxeles se recodifican. Además, al crear un archivo nuevo desde cero, todos los metadatos ocultos (EXIF, GPS, XMP) se descartan automáticamente.",
    useWhen:
      "necesitas cambiar de formato (ej. PNG a WebP), reducir la resolución o comprimir el peso en MB para web o envío rápido.",
  },
  strip: {
    tagline: "Cirugía binaria: borra los bloques de datos privados sin tocar ni volver a comprimir los píxeles.",
    howItWorks:
      "Analiza la estructura interna del archivo (segmentos APP en JPG, chunks en PNG y RIFF en WebP) y filtra únicamente EXIF, coordenadas GPS, XMP, IPTC y comentarios.",
    pixelsAndQuality:
      "100 % idéntica al original bit a bit. No hay pérdida por generación (ni siquiera en JPG), conserva el perfil de color ICC y mantiene la orientación para que las fotos verticales no salgan giradas.",
    useWhen:
      "quieres compartir fotos originales protegiendo tu privacidad (ubicación GPS, serie de cámara, fecha) sin alterar su formato ni perder absolutamente nada de calidad.",
  },
};

const IMG_FORMAT_GLOSSARY: Record<ImgFormat, FormatGlossaryEntry> = {
  png: {
    tagline: "El estándar sin pérdida para gráficos nítidos y transparencias.",
    pros: "No introduce artefactos ni bordes borrosos en textos, capturas de pantalla, logotipos o ilustraciones.",
    alphaAndCompression: "Compresión sin pérdida (Lossless) · Soporta canal alfa completo (transparencia).",
    useWhen: "guardas capturas de pantalla, iconos, diseños con fondo transparente o imágenes que vas a seguir editando.",
  },
  jpg: {
    tagline: "El formato fotográfico más universal.",
    pros: "Se abre en cualquier dispositivo, cámara o programa existente y logra archivos pequeños en fotografías reales.",
    alphaAndCompression:
      "Compresión con pérdida ajustable (1–100%) · NO soporta transparencia (los fondos transparentes se aplanan a RGB).",
    useWhen: "compartes fotografías sin transparencia y necesitas compatibilidad total con cualquier plataforma.",
  },
  webp: {
    tagline: "El formato moderno todo-en-uno para web y almacenamiento eficiente.",
    pros: "Combina lo mejor de JPG y PNG: permite compresión con pérdida muy ligera (1–99%) o sin pérdida (100%) manteniendo la transparencia.",
    alphaAndCompression:
      "Con pérdida (1–99%) o Lossless (100%) · Soporta transparencia (canal alfa) en ambos modos.",
    useWhen: "buscas el menor peso posible con excelente calidad visual o necesitas transparencia ocupando mucho menos que un PNG.",
  },
};

function ModeGlossaryCard({ name, active, e }: { name: string; active: boolean; e: ModeGlossaryEntry }) {
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
          <dt className="inline font-semibold text-slate-300">Cómo funciona: </dt>
          <dd className="inline text-slate-400">{e.howItWorks}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Píxeles y calidad: </dt>
          <dd className="inline text-slate-400">{e.pixelsAndQuality}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
          <dd className="inline text-slate-400">{e.useWhen}</dd>
        </div>
      </dl>
    </div>
  );
}

function FormatGlossaryCard({ name, active, e }: { name: string; active: boolean; e: FormatGlossaryEntry }) {
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
          <dt className="inline font-semibold text-slate-300">Compresión y transparencia: </dt>
          <dd className="inline text-slate-400">{e.alphaAndCompression}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
          <dd className="inline text-slate-400">{e.useWhen}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Panel lateral flotante con el glosario de imágenes (Modos + Diferencia clave y Formatos de salida). */
function ImageGlossaryDrawer({
  tab,
  onTab,
  onClose,
  mode,
  format,
}: {
  tab: ImageGlossaryTab | null;
  onTab: (t: ImageGlossaryTab) => void;
  onClose: () => void;
  mode: ImageMode;
  format: ImgFormat;
}) {
  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          key="img-glossary-backdrop"
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
          key="img-glossary-drawer"
          role="dialog"
          aria-label="Glosario de imágenes"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1e293b] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Glosario de imágenes</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  Diferencias entre recodificar píxeles y limpiar metadatos, y guía de formatos.
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
                  ["mode", "Modos y diferencias"],
                  ["format", "Formatos de salida"],
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
                      layoutId="img-glossary-tab"
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
            {tab === "mode" ? (
              <>
                {/* Cuadro comparativo directo entre ambos modos */}
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-600/10 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Diferencia clave entre ambos modos
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    Ambos entregan un archivo final <span className="font-semibold text-white">sin metadatos personales</span>, pero trabajan de forma opuesta:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      • <span className="font-semibold text-indigo-200">Convertir formato</span>{" "}
                      <span className="text-slate-400">
                        reprocesa y vuelve a comprimir los píxeles (permite cambiar formato, resolución y peso, pero recodifica la imagen).
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Quitar metadatos</span>{" "}
                      <span className="text-slate-400">
                        NO recodifica los píxeles: copia los datos visuales intactos byte por byte y solo recorta los bloques EXIF/GPS/XMP (0% pérdida de calidad y ultrarrápido).
                      </span>
                    </li>
                  </ul>
                </div>

                {MODES.map((m) => (
                  <ModeGlossaryCard key={m} name={MODE_LABEL[m]} active={m === mode} e={MODE_GLOSSARY[m]} />
                ))}
              </>
            ) : (
              FORMATS.map((f) => (
                <FormatGlossaryCard
                  key={f}
                  name={FORMAT_LABEL[f]}
                  active={mode === "convert" && f === format}
                  e={IMG_FORMAT_GLOSSARY[f]}
                />
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────── Columna 3: Inspección de imagen ───────────────── */

function ImageInspectionPanel({ ic }: { ic: ImageConverter }) {
  const sel = ic.selected;
  const meta = sel?.meta ?? null;
  const strip = ic.mode === "strip";
  const doneItem = sel ? ic.results?.find((r) => r.source === sel.path && r.ok) ?? null : null;

  const state = !sel
    ? "empty"
    : sel.metaState === "loading"
      ? "loading"
      : sel.metaState === "error"
        ? "error"
        : meta
          ? "ready"
          : "empty";

  let body: React.ReactNode = null;

  if (state === "empty") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-indigo-600/10 p-4 text-indigo-300/70">
          <ImageIcon size={28} />
        </div>
        <p className="max-w-[260px] text-sm text-slate-500">
          Añade imágenes para ver sus propiedades, metadatos y cómo quedarán al procesarlas.
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
  } else if (meta && sel) {
    const aspect = detectAspect(meta.width, meta.height);
    const { w: outW, h: outH } = scaledDimensions(meta, ic.mode, ic.scale);
    const estBytes = estimateImageSize(meta, ic.mode, ic.format, ic.quality, ic.scale);
    const finalBytes = doneItem?.sizeBytes ?? estBytes;
    const diff = meta.sizeBytes ? (finalBytes / meta.sizeBytes - 1) * 100 : null;
    const metaSummary = detectedMetaSummary(meta);
    const hasAnyRemovable = meta.hasExif || meta.hasGps || meta.hasXmp || meta.hasIptc || meta.hasComments || meta.removableBytes > 0;

    if (strip) {
      // Vista dedicada para el modo "Quitar metadatos": muestra exactamente qué tiene el original y qué se va a quitar
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida limpia" : "Qué se hará"}</span>
          </div>

          <Row
            label="Formato y resolución"
            from={`${meta.format} · ${meta.width}×${meta.height}`}
            to={`${meta.format} · ${meta.width}×${meta.height} (Intactos)`}
          />
          <Row
            label="Cámara / EXIF"
            from={meta.hasExif ? "Detectado (Cámara / Fecha)" : "No contiene"}
            to={meta.hasExif ? "Se eliminará (salvo orientación)" : "Limpio"}
          />
          <Row
            label="Ubicación GPS"
            from={meta.hasGps ? "Detectada (Coordenadas)" : "No contiene"}
            to={meta.hasGps ? "Se eliminará por completo" : "Limpio"}
          />
          <Row
            label="XMP / IPTC / Comentarios"
            from={
              meta.hasXmp || meta.hasIptc || meta.hasComments
                ? [meta.hasXmp ? "XMP" : null, meta.hasIptc ? "IPTC" : null, meta.hasComments ? "Comentarios" : null]
                    .filter(Boolean)
                    .join(" + ")
                : "No contiene"
            }
            to={meta.hasXmp || meta.hasIptc || meta.hasComments ? "Se eliminarán" : "Limpio"}
          />
          <Row
            label="Perfil de color (ICC)"
            from={meta.hasIcc ? "Incrustado" : "Estándar (sRGB)"}
            to={meta.hasIcc ? "Conservado (colores fieles)" : "Estándar (sRGB)"}
          />
          <Row
            label="Peso de metadatos"
            from={hasAnyRemovable ? formatBytes(meta.removableBytes) : "0 B"}
            to="0 B (Eliminados)"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(estBytes)}`}
          />

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={hasAnyRemovable ? "text-indigo-300" : "text-emerald-300"} />
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Diagnóstico de privacidad</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {hasAnyRemovable ? `Metadatos detectados: ${metaSummary}` : "Esta imagen ya está limpia de metadatos"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Limpieza binaria sin recodificar: conserva el 100 % de la calidad original de los píxeles.
            </p>
          </div>
        </div>
      );
    } else {
      const outFormat = ic.format.toUpperCase();
      const outAlpha =
        ic.format === "jpg" ? "Se aplanará (RGB)" : meta.hasAlpha ? "Conservada" : "No (Opaco)";
      const outColor = ic.format === "jpg" ? "Rgb8" : meta.hasAlpha ? "Rgba8" : "Rgb8";

      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida final" : "Salida estimada"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={outFormat} />
          <Row
            label="Resolución"
            from={`${meta.width} × ${meta.height} px`}
            to={`${outW} × ${outH} px${ic.scale !== "100" ? ` (${ic.scale}%)` : ""}`}
          />
          <Row label="Relación de aspecto" from={aspect.label} to={aspect.label} />
          <Row label="Transparencia" from={meta.hasAlpha ? "Sí (Canal alfa)" : "No (Opaco)"} to={outAlpha} />
          <Row label="Espacio de color" from={meta.colorType} to={outColor} />
          <Row
            label="Metadatos detectados"
            from={hasAnyRemovable ? `Sí (${metaSummary})` : "Ninguno"}
            to="Descartados al convertir"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(estBytes)}`}
          />

          {diff !== null && (
            <p className={`text-sm font-medium ${diff <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
              {doneItem ? "" : "≈ "}
              {diff <= 0 ? "−" : "+"}
              {Math.abs(diff).toFixed(0)} % respecto al original
            </p>
          )}

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Compresión y escalado</p>
            <p className="mt-1 text-base font-semibold text-slate-100">
              {ic.format === "png"
                ? "Sin pérdida (PNG Lossless)"
                : ic.format === "webp"
                  ? ic.quality >= 100
                    ? "Sin pérdida (WebP Lossless 100%)"
                    : `WebP Calidad ${ic.quality}%`
                  : `JPG Calidad ${ic.quality}%`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {ic.scale !== "100"
                ? `Redimensionado al ${ic.scale}% (${outW}×${outH} px) con filtro Lanczos3`
                : ic.format === "png" || (ic.format === "webp" && ic.quality >= 100)
                  ? "Conserva el 100 % de la fidelidad visual"
                  : "Compresión ajustable para reducir el peso en disco"}
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Estimación orientativa: el peso real varía según el detalle y colores de la imagen.
          </p>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <ImageIcon size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">Inspección de imagen</h3>
      </div>
      {sel && (
        <p className="truncate text-xs text-slate-500" title={sel.path}>
          {splitPath(sel.path).file}
        </p>
      )}
      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state}-${sel?.id ?? ""}-${ic.mode}`}
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

/* ───────────────── Pestaña de imagen (3 columnas) ───────────────── */

export function ImageTab({ ic }: { ic: ImageConverter }) {
  const hover = useTauriDrop(ic.addFiles);
  const running = ic.status === "running";
  const strip = ic.mode === "strip";
  const n = ic.items.length;
  const isBatch = n > 1;
  const handleSelect = useCallback((id: string) => ic.select(id), [ic.select]);
  const handleRemove = useCallback((id: string) => ic.removeFile(id), [ic.removeFile]);
  const resultsMap = useMemo(() => {
    if (!ic.results) return null;
    const m = new Map<string, (typeof ic.results)[number]>();
    for (const r of ic.results) m.set(r.source, r);
    return m;
  }, [ic.results]);

  // Estado local del glosario de imágenes ("mode" | "format" | null)
  const [glossary, setGlossary] = useState<ImageGlossaryTab | null>(null);

  // Cerrar el glosario con la tecla Esc
  useEffect(() => {
    if (!glossary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossary(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossary]);

  // Individual: sin evento de progreso → barra indeterminada. Lote: done/total.
  const pct =
    ic.status === "done"
      ? 100
      : isBatch
        ? ic.progress
          ? (ic.progress.done / Math.max(ic.progress.total, 1)) * 100
          : 0
        : null;

  const okCount = ic.results?.filter((r) => r.ok).length ?? 0;
  const failed = ic.results?.filter((r) => !r.ok) ?? [];
  const firstOk = ic.results?.find((r) => r.ok);

  const startLabel = running
    ? strip
      ? "Limpiando…"
      : "Convirtiendo…"
    : strip
      ? isBatch
        ? `Quitar metadatos (${n})`
        : "Quitar metadatos"
      : isBatch
        ? `Convertir lote (${n})`
        : "Convertir imagen";

  const selMeta = ic.selected?.meta ?? null;
  const scaledPreview = selMeta ? scaledDimensions(selMeta, ic.mode, ic.scale) : null;

  // Oculta la etiqueta interna de <Segmented> cuando usamos <LabelWithHelp> encima
  const noInternalLabel = "[&>div>span:first-child]:hidden";

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* ───── Columna 1: Imágenes de origen ───── */}
      <Card data-drop-zone="true" className="flex flex-col gap-5">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Step n={1}>Imágenes de origen</Step>
            {n > 0 && (
              <div className="flex items-center gap-2">
                <motion.span
                  key={isBatch ? "batch" : "single"}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-full border border-indigo-500/30 bg-indigo-600/15 px-3 py-1 text-xs font-medium text-indigo-200"
                >
                  {isBatch ? `Lote · ${n} archivos` : "Individual"}
                </motion.span>
                <button
                  type="button"
                  disabled={running}
                  onClick={ic.pick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/15 disabled:opacity-40"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            )}
          </div>

          {n > 0 && (
            <p className="text-xs text-slate-500">
              Haz clic en una imagen para inspeccionar <span className="text-slate-300">sus dimensiones y metadatos</span>. El lote se procesa en paralelo.
            </p>
          )}

          {/* Selector de carpeta de salida (homologado con VideoTab) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Carpeta de salida</span>
              {n > 1 && <span className="text-[11px] text-indigo-300/80">para todo el lote</span>}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 text-sm text-slate-300"
                title={ic.outputDir ?? undefined}
              >
                {ic.outputDir ?? <span className="text-slate-500">Misma carpeta que el origen</span>}
              </div>
              <button
                type="button"
                disabled={running}
                onClick={ic.pickOutputDir}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#23284f]/70 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen size={15} /> Examinar
              </button>
              {ic.outputDir && (
                <button
                  type="button"
                  disabled={running}
                  onClick={ic.clearOutputDir}
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                  aria-label="Volver a la carpeta del origen"
                  title="Volver a la carpeta del origen"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {n === 0 ? (
            <div className="flex flex-1 flex-col [&>*]:flex-1">
              <DropZone
                hover={hover}
                disabled={running}
                onBrowse={ic.pick}
                icon={<UploadCloud size={28} />}
                title="Arrastra imágenes aquí o haz clic para elegirlas"
                subtitle="Una sola o varias a la vez · PNG, JPG, WebP"
              />
            </div>
          ) : (
            <div
              className={`min-h-[200px] flex-1 rounded-2xl border-2 border-dashed p-2 transition-colors ${
                hover ? "border-indigo-500 bg-indigo-600/10" : "border-transparent"
              }`}
            >
              {hover && <p className="pb-2 text-center text-xs text-indigo-300">Suelta aquí para añadirlas</p>}
              <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {ic.items.map((it: ImageQueueItem) => (
                    <ImageQueueRow
                      key={it.id}
                      it={it}
                      isSelected={ic.selected?.id === it.id}
                      resItem={resultsMap?.get(it.path)}
                      locked={running}
                      onSelect={handleSelect}
                      onRemove={handleRemove}
                    />
                  ))}
                  {false && ([] as any[]).map((it: any) => {
                    const f = splitPath(it.path);
                    const isSelected = ic.selected?.id === it.id;
                    const resItem = ic.results?.find((r) => r.source === it.path);
                    const realDiff =
                      resItem?.ok && resItem.sizeBytes && it.meta?.sizeBytes
                        ? (resItem.sizeBytes / it.meta.sizeBytes - 1) * 100
                        : null;

                    const sub =
                      it.metaState === "loading"
                        ? "Leyendo propiedades…"
                        : it.metaState === "error"
                          ? it.metaError ?? "No se pudo leer el archivo"
                          : it.meta
                            ? `${it.meta.width}×${it.meta.height} · ${formatBytes(it.meta.sizeBytes)}`
                            : f.dir || "—";

                    return (
                      <motion.li
                        key={it.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        onClick={() => ic.select(it.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                          isSelected
                            ? "border-indigo-500/60 bg-indigo-600/10"
                            : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
                        }`}
                      >
                        <ImageThumb path={it.path} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
                            {f.file}
                          </p>
                          <p className={`truncate text-xs ${it.metaState === "error" ? "text-red-300" : "text-slate-500"}`}>
                            {sub}
                          </p>
                          {resItem?.ok && resItem.sizeBytes != null && (
                            <p className="truncate text-xs font-medium text-emerald-300">
                              ✓ Salida real: {formatBytes(resItem.sizeBytes)}
                              {realDiff !== null && ` (${realDiff <= 0 ? "−" : "+"}${Math.abs(realDiff).toFixed(0)}%)`}
                            </p>
                          )}
                        </div>
                        {resItem?.ok && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              revealItemInDir(resItem.dest).catch(() => {});
                            }}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
                            aria-label="Mostrar en carpeta"
                            title="Mostrar en carpeta"
                          >
                            <FolderOpen size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={running}
                          onClick={(e) => {
                            e.stopPropagation();
                            ic.removeFile(it.id);
                          }}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200 disabled:opacity-40"
                          aria-label="Quitar"
                        >
                          <X size={14} />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </section>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3">
          <GradientButton onClick={ic.start} disabled={n === 0} loading={running}>
            {startLabel}
          </GradientButton>
          <SecondaryButton onClick={ic.clear} disabled={running || (n === 0 && ic.status === "idle")}>
            Limpiar
          </SecondaryButton>
        </div>

        {/* Progreso */}
        <AnimatePresence>
          {ic.status !== "idle" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="space-y-4 border-t border-[#1e293b] pt-5"
            >
              <span className="text-sm font-medium text-slate-200">
                {running
                  ? strip
                    ? "Limpiando…"
                    : "Convirtiendo…"
                  : ic.status === "done"
                    ? strip
                      ? "Limpieza completada"
                      : "Conversión completada"
                    : "Operación fallida"}
              </span>

              {ic.status !== "error" && <ProgressBar value={pct} />}

              {isBatch && ic.status !== "error" && (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Completadas" value={`${ic.progress?.done ?? 0} / ${ic.progress?.total ?? n}`} />
                  <Stat label="Progreso" value={`${(pct ?? 0).toFixed(0)}%`} />
                </div>
              )}

              {ic.status === "error" && <Notice tone="error">{ic.error}</Notice>}

              {ic.status === "done" && (
                <>
                  <Notice tone={failed.length ? "warn" : "ok"}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {okCount} {strip ? "limpiada" : "convertida"}
                        {okCount === 1 ? "" : "s"}
                        {failed.length > 0 && ` · ${failed.length} con error`}
                      </span>
                      {firstOk && (
                        <button
                          type="button"
                          onClick={() => revealItemInDir(firstOk.dest).catch(() => {})}
                          className="inline-flex items-center gap-2 rounded-lg border border-current/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                        >
                          <FolderOpen size={14} /> Mostrar en carpeta
                        </button>
                      )}
                    </div>
                  </Notice>
                  {failed.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-300">
                      {failed.map((r) => (
                        <li key={r.source} className="rounded-lg bg-red-500/10 px-3 py-2">
                          <span className="font-medium">{splitPath(r.source).file}</span>: {r.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ───── Columna 2: Opciones de salida ───── */}
      <Card className="flex flex-col gap-5 min-h-[460px]">
        <div className="flex items-center justify-between gap-3">
          <Step n={2}>
            Opciones de salida{ic.mode === "convert" ? (ic.isIndividual ? " · por imagen" : " · para todas") : ""}
          </Step>
          <button
            type="button"
            onClick={() => setGlossary((g) => (g ? null : "mode"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#23284f]/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-[#23284f]/80"
          >
            <BookOpen size={14} /> Glosario
          </button>
        </div>

        {/* Aclara a qué imagen pertenecen estas opciones (mismo estilo armonioso que VideoTab) */}
        {ic.mode === "convert" && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              {ic.selected
                ? ic.isIndividual
                  ? "Configurando solo esta imagen"
                  : "Configuración para todas las imágenes"
                : "Ninguna imagen seleccionada"}
            </p>
            {ic.selected && (
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={ic.selected.path}>
                {splitPath(ic.selected.path).file}
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {ic.selected
                ? ic.isIndividual
                  ? "Cada imagen tiene sus propias opciones: selecciona otra en la lista para configurarla por separado."
                  : "Las opciones de salida se aplicarán a todas las imágenes de la cola."
                : "Añade una imagen para configurar sus opciones."}
            </p>
            {ic.selected && (
              <div className="mt-2.5">
                {!ic.isIndividual ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => ic.setIsIndividual(true)}
                    title="Permite configurar formato, escala y calidad individual para cada imagen"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Configuración individual
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={running}
                    onClick={ic.applyToAll}
                    title="Aplica estas opciones a todas las imágenes"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar estas opciones a todas las imágenes
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <LabelWithHelp
            label="Modo"
            active={glossary === "mode"}
            onHelp={() => setGlossary((g) => (g === "mode" ? null : "mode"))}
          />
          <div className={noInternalLabel}>
            <Segmented label="" value={ic.mode} options={MODES} labels={MODE_LABEL} onChange={ic.setMode} disabled={running} />
          </div>
        </div>

        {!strip && (
          <>
            <div>
              <LabelWithHelp
                label="Formato de salida"
                active={glossary === "format"}
                onHelp={() => setGlossary((g) => (g === "format" ? null : "format"))}
              />
              <div className={noInternalLabel}>
                <Segmented label="" value={ic.format} options={FORMATS} labels={FORMAT_LABEL} onChange={ic.setFormat} disabled={running} />
              </div>
            </div>

            {/* Redimensionado / Escala con Lanczos3 */}
            <div className="[&_button]:px-4 [&_button]:py-1.5 [&_button]:text-sm">
              <Segmented
                label="Escala / Resolución (Lanczos3)"
                value={ic.scale}
                options={SCALES}
                labels={SCALE_LABEL}
                onChange={ic.setScale}
                disabled={running}
              />
              {selMeta && scaledPreview && (
                <p className="mt-2 text-xs text-slate-500">
                  Imagen seleccionada:{" "}
                  <span className="font-mono text-slate-300">
                    {selMeta.width}×{selMeta.height} px
                  </span>{" "}
                  → Salida:{" "}
                  <span className="font-mono text-indigo-300">
                    {scaledPreview.w}×{scaledPreview.h} px
                  </span>
                </p>
              )}
            </div>

            {/* Slider de calidad tanto para JPG como para WebP */}
            <AnimatePresence initial={false}>
              {(ic.format === "jpg" || ic.format === "webp") && (
                <motion.div
                  key="quality"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Calidad {ic.format.toUpperCase()}
                    </span>
                    <span className="font-mono text-sm text-indigo-300">
                      {ic.format === "webp" && ic.quality === 100 ? "100% (Lossless)" : `${ic.quality}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={ic.quality}
                    disabled={running}
                    onChange={(e) => ic.setQuality(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-indigo-500 disabled:cursor-not-allowed"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>Menor tamaño</span>
                    <span>{ic.format === "webp" ? "100% = Sin pérdida" : "Mayor calidad"}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-xs text-slate-500">
              Al convertir de formato, los metadatos personales (EXIF/GPS/XMP) se descartan automáticamente.
            </p>
          </>
        )}
      </Card>

      {/* ───── Columna 3: Inspección de imagen ───── */}
      <ImageInspectionPanel ic={ic} />

      {/* Glosario de imágenes (panel lateral flotante) */}
      <ImageGlossaryDrawer
        tab={glossary}
        onTab={setGlossary}
        onClose={() => setGlossary(null)}
        mode={ic.mode}
        format={ic.format}
      />
    </div>
  );
}