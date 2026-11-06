import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Combine,
  FileText,
  FolderOpen,
  HelpCircle,
  Plus,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocConverter, DocMode, DocQueueItem } from "../hooks/useDocConverter";
import { useTauriDrop } from "../hooks/tauri";
import type { DocFormat } from "../types";
import { splitPath } from "../lib/utils";
import { Card, DropZone, GradientButton, Notice, ProgressBar, Segmented, SecondaryButton, Stat } from "./ui";

const DOC_FORMATS: readonly DocFormat[] = ["pdf", "docx", "txt", "md"] as const;
const DOC_FORMAT_LABEL: Record<DocFormat, string> = {
  pdf: "PDF",
  docx: "DOCX (Word)",
  txt: "TXT (Texto)",
  md: "Markdown (.md)",
};

const MODES: readonly DocMode[] = ["convert", "strip", "merge"] as const;
const MODE_LABEL: Record<DocMode, string> = {
  convert: "Convertir formato",
  strip: "Quitar metadatos",
  merge: "Unir PDFs",
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
        <span className="truncate text-slate-300" title={from}>
          {from}
        </span>
        <span className={`truncate ${changed ? "font-medium text-indigo-300" : "text-slate-300"}`} title={to}>
          {to}
        </span>
      </div>
    </div>
  );
}

/** Insignia visual por extensión de documento (PDF en rojo, DOCX en azul, MD en púrpura, TXT en esmeralda). */
function DocBadgeInternal({ ext }: { ext: string }) {
  const clean = ext.toUpperCase();
  const cls =
    clean === "PDF"
      ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
      : clean === "DOCX"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : clean === "MD"
          ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
          : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";

  return (
    <div className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold tracking-tight ${cls}`}>
      {clean || "DOC"}
    </div>
  );
}



const DocBadge = memo(DocBadgeInternal);

function DocQueueRowInternal({
  it,
  index,
  total,
  isSelected,
  merge,
  mode,
  running,
  resItem,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  it: DocQueueItem;
  index: number;
  total: number;
  isSelected: boolean;
  merge: boolean;
  mode: DocMode;
  running: boolean;
  resItem?: { ok: boolean; dest: string; sizeBytes?: number | null };
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const f = splitPath(it.path);
  const isPdf = f.ext.toLowerCase() === "pdf";
  const sub =
    it.metaState === "loading"
      ? "Leyendo propiedades…"
      : it.metaState === "error"
        ? it.metaError ?? "No se pudo leer el archivo"
        : it.meta
          ? [
              it.meta.pages ? `${it.meta.pages} página${it.meta.pages === 1 ? "" : "s"}` : null,
              it.meta.words ? `≈ ${it.meta.words.toLocaleString()} palabras` : null,
              it.meta.sizeBytes ? formatBytes(it.meta.sizeBytes) : null,
            ]
              .filter(Boolean)
              .join(" · ")
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
      {merge && (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600/25 text-xs font-bold text-indigo-300"
          title={`Posición ${index + 1} en el documento final`}
        >
          {index + 1}
        </span>
      )}
      <DocBadge ext={f.ext} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
            {f.file}
          </p>
          {mode === "convert" && (
            <span
              className="inline-flex shrink-0 items-center rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 uppercase"
              title={`Formato de salida: ${it.targetFormat ? DOC_FORMAT_LABEL[it.targetFormat] : "PDF"}`}
            >
              ➔ {(it.targetFormat ?? "pdf").toUpperCase()}
            </span>
          )}
          {merge && !isPdf && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
              <AlertTriangle size={11} /> No es PDF
            </span>
          )}
        </div>
        <p className={`truncate text-xs ${it.metaState === "error" || (merge && !isPdf) ? "text-rose-300" : "text-slate-500"}`}>
          {merge && !isPdf ? "Solo los archivos PDF pueden unirse" : sub}
        </p>
        {resItem?.ok && resItem.sizeBytes != null && (
          <p className="truncate text-xs font-medium text-emerald-300">
            ✓ {merge ? "PDF generado" : "Salida real"}: {formatBytes(resItem.sizeBytes)} ({splitPath(resItem.dest).ext.toUpperCase()})
          </p>
        )}
      </div>

      {/* Controles de orden para el modo unir */}
      {merge && total > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={running || index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(it.id);
            }}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
            aria-label="Mover hacia arriba"
            title="Mover hacia arriba"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            disabled={running || index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(it.id);
            }}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
            aria-label="Mover hacia abajo"
            title="Mover hacia abajo"
          >
            <ArrowDown size={13} />
          </button>
        </div>
      )}

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

const DocQueueRow = memo(DocQueueRowInternal);

/* ───────────────────────── Glosario de Documentos ───────────────────────── */

type DocGlossaryTab = "mode" | "format";

const DOC_FORMAT_GLOSSARY: Record<
  DocFormat,
  { tagline: string; pros: string; structure: string; useWhen: string }
> = {
  pdf: {
    tagline: "Formato de documento portátil universal.",
    pros: "Se ve exactamente igual en cualquier pantalla o impresora sin que nadie mueva accidentalmente los párrafos.",
    structure: "Páginas fijas A4 · Compatible con cualquier navegador o lector.",
    useWhen: "vas a entregar un trabajo, reporte, contrato o documento listo para leer o imprimir.",
  },
  docx: {
    tagline: "El estándar editable de Microsoft Word y LibreOffice.",
    pros: "Permite abrir y editar libremente el texto en Word, Google Docs o Writer.",
    structure: "Paquete comprimido OpenXML (ZIP) con párrafos fluidos.",
    useWhen: "quieres extraer el contenido de un PDF o archivo de texto para seguir redactándolo en Word.",
  },
  txt: {
    tagline: "Texto plano puro sin formato.",
    pros: "Ultrarrápido, ocupa pocos kilobytes y lo abre cualquier editor de código o bloc de notas.",
    structure: "Párrafos separados por saltos de línea sin estilos ni metadatos ocultos.",
    useWhen: "necesitas extraer únicamente el texto limpio de un PDF o DOCX para copiarlo o procesarlo.",
  },
  md: {
    tagline: "Texto estructurado Markdown para desarrolladores, notas y documentación.",
    pros: "Legible como texto plano y compatible con GitHub, Obsidian, Notion e inteligencia artificial.",
    structure: "Encabezados y párrafos limpios en sintaxis Markdown.",
    useWhen: "conviertes documentos de Word o PDF para tu base de notas o repositorios técnicos.",
  },
};

function DocGlossaryDrawer({
  tab,
  onTab,
  onClose,
  mode,
  format,
}: {
  tab: DocGlossaryTab | null;
  onTab: (t: DocGlossaryTab) => void;
  onClose: () => void;
  mode: DocMode;
  format: DocFormat;
}) {
  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          key="doc-glossary-backdrop"
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
          key="doc-glossary-drawer"
          role="dialog"
          aria-label="Glosario de documentos"
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
                <h3 className="text-lg font-bold text-white">Glosario de documentos</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  Conversión de texto estructurado y limpieza de privacidad en archivos PDF y Word.
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
                      layoutId="doc-glossary-tab"
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
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-600/10 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Diferencia clave entre los tres modos
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                    <li>
                      • <span className="font-semibold text-indigo-200">Convertir formato</span>{" "}
                      <span className="text-slate-400">
                        extrae los párrafos y reconstruye un documento nuevo en el formato elegido (PDF, DOCX, TXT o Markdown). Si conviertes de DOCX a PDF y tienes LibreOffice instalado, lo utiliza automáticamente para preservar tablas y estilos complejos.
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Quitar metadatos</span>{" "}
                      <span className="text-slate-400">
                        conserva intactas las páginas, fuentes, tablas e imágenes del PDF o DOCX original, eliminando únicamente el autor, empresa, programa creador y fechas ocultas.
                      </span>
                    </li>
                    <li>
                      • <span className="font-semibold text-indigo-200">Unir PDFs</span>{" "}
                      <span className="text-slate-400">
                        combina múltiples archivos PDF en un solo documento final. Las páginas se agregan en el mismo orden en que aparecen en la lista de archivos. No se modifica el contenido de ninguna página.
                      </span>
                    </li>
                  </ul>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "convert" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Convertir formato</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Ideal para pasar de Word (DOCX) a PDF, extraer el texto de un PDF hacia un archivo editable DOCX/TXT/MD, o generar un PDF limpio a partir de notas en texto o Markdown.
                  </p>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "strip" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Quitar metadatos</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Borra el diccionario <span className="font-mono text-slate-200">/Info</span> y{" "}
                    <span className="font-mono text-slate-200">/Metadata</span> en archivos PDF, y limpia{" "}
                    <span className="font-mono text-slate-200">docProps/core.xml</span> y{" "}
                    <span className="font-mono text-slate-200">app.xml</span> en archivos Word (nombre de usuario de tu PC, empresa, tiempos de edición y revisiones).
                  </p>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    mode === "merge" ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                  }`}
                >
                  <h4 className="text-base font-bold text-white">Unir PDFs</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Combina múltiples archivos PDF en un solo documento final. Las páginas se agregan en el mismo orden en que aparecen en la lista de archivos. No se modifica el contenido de ninguna página.
                  </p>
                </div>
              </>
            ) : (
              DOC_FORMATS.map((f) => {
                const e = DOC_FORMAT_GLOSSARY[f];
                const active = mode === "convert" && f === format;
                return (
                  <div
                    key={f}
                    className={`rounded-2xl border px-4 py-3 ${
                      active ? "border-indigo-500/50 bg-indigo-600/10" : "border-[#23284f] bg-[#23284f]/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-white">{DOC_FORMAT_LABEL[f]}</h4>
                      {active && (
                        <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                          En uso
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-indigo-200">{e.tagline}</p>
                    <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                      <div>
                        <dt className="inline font-semibold text-slate-300">Ventajas: </dt>
                        <dd className="inline text-slate-400">{e.pros}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-slate-300">Estructura: </dt>
                        <dd className="inline text-slate-400">{e.structure}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-slate-300">Conviene cuando </dt>
                        <dd className="inline text-slate-400">{e.useWhen}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────── Columna 3: Inspección de Documento ───────────────── */

function DocInspectionPanel({ dc }: { dc: DocConverter }) {
  const sel = dc.selected;
  const meta = sel?.meta ?? null;
  const strip = dc.mode === "strip";
  const merge = dc.mode === "merge";
  const doneItem = sel ? dc.results?.find((r) => r.source === sel.path && r.ok) ?? null : null;

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

  if (merge) {
    /* ── Vista especial para modo "Unir PDFs" ── */
    const readyItems = dc.items.filter((it) => it.metaState === "ready" && it.meta);
    const totalPages = readyItems.reduce((sum, it) => sum + (it.meta?.pages ?? 0), 0);
    const totalSize = readyItems.reduce((sum, it) => sum + (it.meta?.sizeBytes ?? 0), 0);
    const mergeResult = dc.results?.[0];

    body = (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Combine size={16} className="text-indigo-300" />
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Resumen de unión</p>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {dc.items.length === 0
              ? "Añade archivos PDF para combinarlos en un solo documento"
              : dc.items.length === 1
                ? "Necesitas al menos 2 archivos PDF para unirlos"
                : `Se unirán ${dc.items.length} archivos PDF en orden`}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Las páginas se agregan secuencialmente respetando el orden de la lista.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Archivos" value={`${dc.items.length}`} />
          <Stat label="Páginas totales" value={totalPages > 0 ? `${totalPages}` : "—"} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tamaño combinado" value={totalSize > 0 ? formatBytes(totalSize) : "—"} />
          <Stat label="Salida estimada" value={mergeResult?.sizeBytes ? formatBytes(mergeResult.sizeBytes) : "≈ Variable"} />
        </div>

        {dc.items.length > 0 && (
          <div className="rounded-2xl border border-[#23284f] bg-[#0e1122]/90 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Orden de las páginas
            </p>
            <ol className="mt-1.5 space-y-1">
              {dc.items.map((it, idx) => {
                const f = splitPath(it.path);
                return (
                  <li key={it.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600/20 text-[10px] font-bold text-indigo-300">
                      {idx + 1}
                    </span>
                    <span className="truncate" title={it.path}>{f.file}</span>
                    {it.meta?.pages != null && (
                      <span className="ml-auto shrink-0 text-slate-500">{it.meta.pages} pág.</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    );
  } else if (state === "empty") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="rounded-2xl bg-indigo-600/10 p-4 text-indigo-300/70">
          <FileText size={28} />
        </div>
        <p className="max-w-[260px] text-sm text-slate-500">
          Añade documentos PDF, DOCX, TXT o Markdown para inspeccionar su contenido, páginas y metadatos.
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
    if (strip) {
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida limpia" : "Qué se hará"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={`${meta.format} (Intacto)`} />
          <Row label="Páginas" from={meta.pages ? `${meta.pages}` : "—"} to={meta.pages ? `${meta.pages}` : "—"} />
          <Row
            label="Autor registrado"
            from={meta.author ?? "No contiene"}
            to={meta.author ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Aplicación / Creador"
            from={meta.creator ?? "No contiene"}
            to={meta.creator ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Título interno"
            from={meta.title ?? "No contiene"}
            to={meta.title ? "Se eliminará" : "Limpio"}
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : `≈ ${formatBytes(meta.sizeBytes)}`}
          />

          <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={meta.hasMetadata ? "text-indigo-300" : "text-emerald-300"} />
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Diagnóstico de privacidad</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {meta.hasMetadata
                ? "Metadatos de autor/software detectados en el documento"
                : "Este documento no presenta metadatos personales visibles"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Se eliminan las propiedades ocultas conservando el diseño, texto e imágenes del documento original.
            </p>
          </div>
        </div>
      );
    } else {
      const outFmt = merge ? "PDF (Unido)" : dc.format.toUpperCase();
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 border-b border-[#1e293b] pb-2 text-xs font-semibold uppercase tracking-wider">
            <span className="text-slate-400">Original</span>
            <span className="text-indigo-300">{doneItem ? "Salida final" : "Salida estimada"}</span>
          </div>

          <Row label="Formato" from={meta.format} to={outFmt} />
          <Row
            label="Páginas estimadas"
            from={meta.pages ? `${meta.pages}` : "—"}
            to={dc.format === "txt" || dc.format === "md" ? "Flujo continuo" : meta.pages ? `≈ ${meta.pages}` : "—"}
          />
          <Row
            label="Palabras / Caracteres"
            from={`${meta.words.toLocaleString("en-US")} pal. · ${meta.chars.toLocaleString("en-US")} car.`}
            to="100 % conservados"
          />
          <Row
            label="Imágenes incrustadas"
            from={meta.embeddedImages > 0 ? `${meta.embeddedImages} detectada(s)` : "Ninguna"}
            to={
              meta.embeddedImages > 0
                ? dc.format === "txt" || dc.format === "md"
                  ? "Solo texto"
                  : "Extracción de texto"
                : "Ninguna"
            }
          />
          <Row
            label="Metadatos de autor"
            from={meta.author ?? (meta.hasMetadata ? "Detectados" : "Ninguno")}
            to="Descartados al convertir"
          />
          <Row
            label="Tamaño en disco"
            from={formatBytes(meta.sizeBytes)}
            to={doneItem?.sizeBytes ? formatBytes(doneItem.sizeBytes) : "Variable según formato"}
          />

          {/* Vista previa de las primeras líneas del documento */}
          <div className="rounded-2xl border border-[#23284f] bg-[#0e1122]/90 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Vista previa de texto extraído
            </p>
            <p className="mt-1.5 line-clamp-5 whitespace-pre-line font-mono text-xs leading-relaxed text-slate-300">
              {meta.preview || "(El documento no contiene texto seleccionable o es un PDF escaneado como imagen)"}
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-indigo-300" />
        <h3 className="text-lg font-bold text-white">Inspección de documento</h3>
      </div>
      {sel && !merge && (
        <p className="truncate text-xs text-slate-500" title={sel.path}>
          {splitPath(sel.path).file}
        </p>
      )}
      <div className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${merge ? "merge" : state}-${merge ? "all" : sel?.id ?? ""}-${dc.mode}`}
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

/* ───────────────── Pestaña de Documentos (3 columnas) ───────────────── */

export function DocTab({ dc }: { dc: DocConverter }) {
  const hover = useTauriDrop(dc.addFiles);
  const running = dc.status === "running";
  const strip = dc.mode === "strip";
  const merge = dc.mode === "merge";
  const n = dc.items.length;
  const isBatch = n > 1;

  const [glossary, setGlossary] = useState<DocGlossaryTab | null>(null);

  useEffect(() => {
    if (!glossary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossary(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossary]);

  const handleSelect = useCallback((id: string) => dc.select(id), [dc.select]);
  const handleRemove = useCallback((id: string) => dc.removeFile(id), [dc.removeFile]);
  const handleMoveUp = useCallback((id: string) => dc.moveItem(id, "up"), [dc.moveItem]);
  const handleMoveDown = useCallback((id: string) => dc.moveItem(id, "down"), [dc.moveItem]);
  const resultsMap = useMemo(() => {
    if (!dc.results) return null;
    const m = new Map<string, (typeof dc.results)[number]>();
    for (const r of dc.results) m.set(r.source, r);
    return m;
  }, [dc.results]);

  const pct =
    dc.status === "done"
      ? 100
      : dc.progress
        ? (dc.progress.done / Math.max(dc.progress.total, 1)) * 100
        : null;

  const okCount = dc.results?.filter((r) => r.ok).length ?? 0;
  const failed = dc.results?.filter((r) => !r.ok) ?? [];
  const firstOk = dc.results?.find((r) => r.ok);

  const startLabel = running
    ? merge
      ? "Uniendo PDFs…"
      : strip
        ? "Limpiando…"
        : "Convirtiendo…"
    : merge
      ? isBatch
        ? `Unir PDFs (${n})`
        : "Unir PDFs"
      : strip
        ? isBatch
          ? `Quitar metadatos (${n})`
          : "Quitar metadatos"
        : isBatch
          ? `Convertir lote (${n})`
          : "Convertir documento";

  const startDisabled = merge ? n < 2 : n === 0;

  const noInternalLabel = "[&>div>span:first-child]:hidden";

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* ───── Columna 1: Documentos de origen ───── */}
      <Card data-drop-zone="true" className="flex flex-col gap-5">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Step n={1}>Documentos de origen</Step>
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
                  onClick={dc.pick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/15 disabled:opacity-40"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            )}
          </div>

          {n > 0 && (
            <p className="text-xs text-slate-500">
              Haz clic en un documento para inspeccionar <span className="text-slate-300">sus páginas, palabras y vista previa</span>.
            </p>
          )}

          {/* Carpeta de salida */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Carpeta de salida</span>
              {n > 1 && <span className="text-[11px] text-indigo-300/80">para todo el lote</span>}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-1.5 text-sm text-slate-300"
                title={dc.outputDir ?? undefined}
              >
                {dc.outputDir ?? <span className="text-slate-500">Misma carpeta que el origen</span>}
              </div>
              <button
                type="button"
                disabled={running}
                onClick={dc.pickOutputDir}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#23284f]/70 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen size={15} /> Examinar
              </button>
              {dc.outputDir && (
                <button
                  type="button"
                  disabled={running}
                  onClick={dc.clearOutputDir}
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
                onBrowse={dc.pick}
                icon={<UploadCloud size={28} />}
                title="Arrastra documentos aquí o haz clic para elegirlos"
                subtitle="PDF, DOCX (Word), TXT o Markdown (.md)"
              />
            </div>
          ) : (
            <div
              className={`min-h-[200px] flex-1 rounded-2xl border-2 border-dashed p-2 transition-colors ${
                hover ? "border-indigo-500 bg-indigo-600/10" : "border-transparent"
              }`}
            >
              {hover && <p className="pb-2 text-center text-xs text-indigo-300">Suelta aquí para añadirlos</p>}
              <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {dc.items.map((it: DocQueueItem, index: number) => (
                    <DocQueueRow
                      key={it.id}
                      it={it}
                      index={index}
                      total={n}
                      isSelected={dc.selected?.id === it.id}
                      merge={merge}
                      mode={dc.mode}
                      running={running}
                      resItem={resultsMap?.get(it.path)}
                      onSelect={handleSelect}
                      onRemove={handleRemove}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  ))}
                  {false && ([] as any[]).map((it: any, index: any) => {
                    const f = splitPath(it.path);
                    const isSelected = dc.selected?.id === it.id;
                    const resItem = dc.results?.find((r) => r.source === it.path);
                    const isPdf = f.ext === "pdf";

                    const sub =
                      it.metaState === "loading"
                        ? "Analizando documento…"
                        : it.metaState === "error"
                          ? it.metaError ?? "No se pudo leer el archivo"
                          : it.meta
                            ? [
                                it.meta.pages ? `${it.meta.pages} pág.` : null,
                                `${it.meta.words.toLocaleString("en-US")} palabras`,
                                formatBytes(it.meta.sizeBytes),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : f.dir || "—";

                    return (
                      <motion.li
                        key={it.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        onClick={() => dc.select(it.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                          isSelected
                            ? "border-indigo-500/60 bg-indigo-600/10"
                            : "border-transparent bg-[#23284f]/40 hover:bg-[#23284f]/70"
                        }`}
                      >
                        {merge && (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600/25 text-xs font-bold text-indigo-300"
                            title={`Posición ${index + 1} en el documento final`}
                          >
                            {index + 1}
                          </span>
                        )}
                        <DocBadge ext={f.ext} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-slate-200" title={it.path}>
                              {f.file}
                            </p>
                            {merge && !isPdf && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                                <AlertTriangle size={11} /> No es PDF
                              </span>
                            )}
                          </div>
                          <p className={`truncate text-xs ${it.metaState === "error" || (merge && !isPdf) ? "text-rose-300" : "text-slate-500"}`}>
                            {merge && !isPdf ? "Solo los archivos PDF pueden unirse" : sub}
                          </p>
                          {resItem?.ok && resItem.sizeBytes != null && (
                            <p className="truncate text-xs font-medium text-emerald-300">
                              ✓ {merge ? "PDF generado" : "Salida real"}: {formatBytes(resItem.sizeBytes)} ({splitPath(resItem.dest).ext.toUpperCase()})
                            </p>
                          )}
                        </div>

                        {/* Controles de orden para el modo unir */}
                        {merge && n > 1 && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={running || index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                dc.moveItem(it.id, "up");
                              }}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
                              aria-label="Mover hacia arriba"
                              title="Mover hacia arriba"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={running || index === n - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                dc.moveItem(it.id, "down");
                              }}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-20"
                              aria-label="Mover hacia abajo"
                              title="Mover hacia abajo"
                            >
                              <ArrowDown size={13} />
                            </button>
                          </div>
                        )}

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
                            dc.removeFile(it.id);
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
          <GradientButton onClick={dc.start} disabled={startDisabled} loading={running}>
            {startLabel}
          </GradientButton>
          <SecondaryButton onClick={dc.clear} disabled={running || (n === 0 && dc.status === "idle")}>
            Limpiar
          </SecondaryButton>
        </div>

        {/* Progreso */}
        <AnimatePresence>
          {dc.status !== "idle" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="space-y-4 border-t border-[#1e293b] pt-5"
            >
              <span className="text-sm font-medium text-slate-200">
                {running
                  ? merge
                    ? "Uniendo PDFs…"
                    : strip
                      ? "Limpiando metadatos…"
                      : "Convirtiendo documentos…"
                  : dc.status === "done"
                    ? merge
                      ? "PDFs unidos"
                      : strip
                        ? "Limpieza completada"
                        : "Conversión completada"
                    : "Operación fallida"}
              </span>

              {dc.status !== "error" && <ProgressBar value={pct} />}

              {isBatch && !merge && dc.status !== "error" && (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Completados" value={`${dc.progress?.done ?? 0} / ${dc.progress?.total ?? n}`} />
                  <Stat label="Progreso" value={`${(pct ?? 0).toFixed(0)}%`} />
                </div>
              )}

              {dc.status === "error" && <Notice tone="error">{dc.error}</Notice>}

              {dc.status === "done" && (
                <>
                  <Notice tone={failed.length ? "warn" : "ok"}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {merge
                          ? `Documento PDF unido con éxito (${n} archivos combinados)`
                          : `${okCount} ${strip ? "limpiado" : "convertido"}${okCount === 1 ? "" : "s"}`}
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
            Opciones de salida{dc.mode === "convert" ? (dc.isIndividual ? " · por documento" : " · para todos") : ""}
          </Step>
          <button
            type="button"
            onClick={() => setGlossary((g) => (g ? null : "mode"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#23284f]/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-[#23284f]/80"
          >
            <BookOpen size={14} /> Glosario
          </button>
        </div>

        {/* Aclara a qué documento pertenecen estas opciones (mismo estilo armonioso que VideoTab) */}
        {dc.mode === "convert" && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-600/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              {dc.selected
                ? dc.isIndividual
                  ? "Configurando solo este documento"
                  : "Configuración para todos los documentos"
                : "Ningún documento seleccionado"}
            </p>
            {dc.selected && (
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={dc.selected.path}>
                {splitPath(dc.selected.path).file}
              </p>
            )}
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {dc.selected
                ? dc.isIndividual
                  ? "Cada documento tiene sus propias opciones: selecciona otro en la lista para configurarlo por separado."
                  : "Las opciones de salida se aplicarán a todos los documentos de la cola."
                : "Añade un documento para configurar sus opciones."}
            </p>
            {dc.selected && (
              <div className="mt-2.5">
                {!dc.isIndividual ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => dc.setIsIndividual(true)}
                    title="Permite configurar formato de salida diferente para cada documento"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Configuración individual
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={running}
                    onClick={dc.applyToAll}
                    title="Aplica estas opciones a todos los documentos"
                    className="inline-flex rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aplicar estas opciones a todos los documentos
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
            <Segmented label="" value={dc.mode} options={MODES} labels={MODE_LABEL} onChange={dc.setMode} disabled={running} />
          </div>
        </div>

        {dc.mode === "convert" && (
          <div>
            <LabelWithHelp
              label="Formato de salida"
              active={glossary === "format"}
              onHelp={() => setGlossary((g) => (g === "format" ? null : "format"))}
            />
              <div className={noInternalLabel}>
                <Segmented
                  label=""
                  value={dc.format}
                  options={DOC_FORMATS}
                  labels={DOC_FORMAT_LABEL}
                  onChange={dc.setFormat}
                  disabled={running}
                />
              </div>
            </div>
        )}

</Card>

      {/* ───── Columna 3: Inspección de documento ───── */}
      <DocInspectionPanel dc={dc} />

      {/* Glosario de documentos */}
      <DocGlossaryDrawer
        tab={glossary}
        onTab={setGlossary}
        onClose={() => setGlossary(null)}
        mode={dc.mode}
        format={dc.format}
      />
    </div>
  );
}
