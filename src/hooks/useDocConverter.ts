import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DocFormat, DocJob, DocMetadata, DocProgress, DocResult, IncompatibleHandler, JobStatus } from "../types";
import { DOC_EXTS, buildDest, splitPath } from "../lib/utils";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

export type DocMode = "convert" | "strip" | "merge";

export interface DocQueueItem {
  id: string;
  path: string;
  meta: DocMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  targetFormat?: DocFormat;
}

export type DocConverter = ReturnType<typeof useDocConverter>;

export function useDocConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const saved = appSettings.rememberLastSettings ? appSettings.lastDoc : null;

  const [items, setItems] = useState<DocQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mode, setModeState] = useState<DocMode>(() => saved?.mode ?? "convert");
  const [format, setFormatState] = useState<DocFormat>(() => saved?.format ?? "pdf");
  const [isIndividual, setIsIndividualState] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(() => appSettings.defaultOutputDir);

  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState<DocProgress | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  useEffect(() => {
    setOutputDir(appSettings.defaultOutputDir);
  }, [appSettings.defaultOutputDir]);

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const effectiveFormat = (isIndividual && selected?.targetFormat) ? selected.targetFormat : format;

  useTauriEvent<DocProgress>("doc-progress", (p) => {
    if (busy.current) setProgress(p);
  });

  const resetResult = () => {
    setStatus("idle");
    setProgress(null);
    setResults(null);
    setError(null);
  };

  const setMode = useCallback((m: DocMode) => {
    if (busy.current) return;
    setModeState(m);
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      const curFmt = isIndividual && selected?.targetFormat ? selected.targetFormat : format;
      cfg.recordLastDoc({ mode: m, format: curFmt });
    }
  }, [isIndividual, selected, format]);

  const setFormat = useCallback((f: DocFormat) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, targetFormat: f } : it)));
    } else {
      setFormatState(f);
      setItems((prev) => prev.map((it) => ({ ...it, targetFormat: f })));
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastDoc({ mode, format: f });
    }
  }, [isIndividual, selected, mode]);

  const setIsIndividual = useCallback((val: boolean) => {
    if (busy.current) return;
    setIsIndividualState(val);
    if (val) {
      setItems((prev) => prev.map((it) => ({ ...it, targetFormat: it.targetFormat ?? format })));
    }
    resetResult();
  }, [format]);

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const curItem = itemsRef.current.find((i) => i.id === selected?.id) ?? selected;
    const curFmt = curItem?.targetFormat ?? format;
    setFormatState(curFmt);
    setItems((prev) => prev.map((it) => ({ ...it, targetFormat: curFmt })));
    setIsIndividualState(false);
    resetResult();
  }, [selected, format]);

  const pickOutputDir = useCallback(async () => {
    if (busy.current) return;
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setOutputDir(sel);
      resetResult();
    }
  }, []);

  const clearOutputDir = useCallback(() => {
    if (busy.current) return;
    setOutputDir(null);
    resetResult();
  }, []);

  const patch = useCallback((id: string, p: Partial<DocQueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<DocMetadata>("get_doc_metadata", { source: path });
        patch(id, { meta: m, metaState: "ready", metaError: null });
      } catch (e) {
        patch(id, { metaState: "error", metaError: String(e) });
      }
    },
    [patch],
  );

  const addFiles = useCallback(
    (paths: string[], isInside = true) => {
      if (busy.current) return;
      const known = new Set(itemsRef.current.map((i) => i.path.toLowerCase()));
      const fresh: DocQueueItem[] = [];
      const rejected: string[] = [];
      const isMerge = modeRef.current === "merge";

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (isMerge ? ext !== "pdf" : !DOC_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);

        fresh.push({
          id: `doc-${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          meta: null,
          metaState: "loading",
          metaError: null,
          targetFormat: format,
        });
      }

      if (rejected.length > 0) {
        onIncompatibleRef.current?.(
          rejected,
          "doc",
          isMerge ? "El modo «Unir PDFs» solo admite archivos PDF." : undefined,
        );
      }

      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      setSelectedId((cur) => cur ?? fresh[0].id);
      resetResult();

      void (async () => {
        const queue = [...fresh];
        const concurrency = Math.min(queue.length, 4);
        const workers = Array.from({ length: concurrency }, async () => {
          while (queue.length > 0) {
            const it = queue.shift();
            if (it) await loadMeta(it.id, it.path);
          }
        });
        await Promise.all(workers);
      })();
    },
    [loadMeta, format],
  );

  const pick = useCallback(async () => {
    const isMerge = mode === "merge";
    const sel = await open({
      multiple: true,
      filters: isMerge
        ? [{ name: "Archivos PDF (*.pdf)", extensions: ["pdf"] }]
        : [{ name: "Documentos (PDF, DOCX, TXT, MD)", extensions: DOC_EXTS }],
    });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles, mode]);

  const moveItem = useCallback((id: string, direction: "up" | "down") => {
    if (busy.current) return;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    resetResult();
  }, []);

  const removeFile = useCallback((id: string) => {
    if (busy.current) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    resetResult();
  }, []);

  const clear = useCallback(() => {
    if (busy.current) return;
    setItems([]);
    setSelectedId(null);
    resetResult();
  }, []);

  const start = useCallback(async () => {
    if (!items.length || busy.current) return;
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      const curFmt = isIndividual && selected?.targetFormat ? selected.targetFormat : format;
      cfg.recordLastDoc({ mode, format: curFmt });
    }

    busy.current = true;
    setStatus("running");
    setResults(null);
    setError(null);

    const used = new Set<string>();
    const effectiveOutDir = outputDir ?? cfg.defaultOutputDir;
    const isMerge = mode === "merge";
    const isStrip = mode === "strip";
    const suffix = cfg.resolveSuffix(isStrip, Boolean(effectiveOutDir));
    const overwrite = cfg.overwriteExisting;
    const threadMode = cfg.threadMode;

    if (isMerge) {
      const pdfItems = items.filter((it) => splitPath(it.path).ext.toLowerCase() === "pdf");
      if (pdfItems.length < 2) {
        setError("Se necesitan al menos 2 archivos PDF para unir.");
        setStatus("error");
        busy.current = false;
        return;
      }
      if (pdfItems.length !== items.length) {
        setError("Solo se pueden unir archivos PDF. Quita los archivos que no sean PDF de la lista.");
        setStatus("error");
        busy.current = false;
        return;
      }

      const sources = pdfItems.map((it) => it.path);
      const mergeSuffix = cfg.resolveSuffix(false, Boolean(effectiveOutDir));
      const effectiveSuffix = mergeSuffix === "convertido" ? "unido" : mergeSuffix || "unido";
      const dest = buildDest(pdfItems[0].path, "pdf", used, effectiveSuffix, effectiveOutDir);
      setProgress({ done: 0, total: 1 });

      try {
        const result = await invoke<DocResult>("merge_pdfs", { sources, dest, overwrite });
        setResults([result]);

        if (result.ok) {
          setStatus("done");
          const totalPdfs = sources.length;
          cfg.runPostAction(result.dest, {
            title: "PDFs unidos con éxito",
            message:
              totalPdfs === 2
                ? "Se unieron los 2 archivos PDF en un solo documento."
                : `Se unieron los ${totalPdfs} archivos PDF en un solo documento.`,
          });
        } else {
          setError(result.error ?? "No se pudieron unir los archivos PDF.");
          setStatus("error");
        }
      } catch (e) {
        setError(String(e));
        setStatus("error");
      } finally {
        busy.current = false;
      }
      return;
    }

    const jobs: DocJob[] = items.map((it) => {
      const itemFmt = (isIndividual && it.targetFormat) ? it.targetFormat : format;
      return {
        source: it.path,
        dest: isStrip
          ? buildDest(it.path, splitPath(it.path).ext || "pdf", used, suffix, effectiveOutDir)
          : buildDest(it.path, itemFmt, used, suffix, effectiveOutDir),
        format: itemFmt,
      };
    });
    setProgress({ done: 0, total: jobs.length });

    try {
      const finalRes = isStrip
        ? await invoke<DocResult[]>("strip_docs_metadata", { jobs, overwrite, threadMode })
        : await invoke<DocResult[]>("convert_docs_batch", {
            jobs,
            format,
            overwrite,
            threadMode,
          });
      setResults(finalRes);
      setStatus("done");

      const firstOk = finalRes.find((r) => r.ok);
      if (firstOk) {
        const okCount = finalRes.filter((r) => r.ok).length;
        const isStrip = mode === "strip";
        const title = isStrip ? "Metadatos eliminados" : "Conversión de documentos lista";
        const msg = isStrip
          ? okCount === 1
            ? "Se eliminaron los metadatos del documento."
            : `Se eliminaron los metadatos de ${okCount} documentos.`
          : okCount === 1
            ? `El documento se ha convertido a ${format.toUpperCase()}.`
            : `Se han convertido ${okCount} documentos a ${format.toUpperCase()}.`;
        cfg.runPostAction(firstOk.dest, { title, message: msg });
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, [items, mode, format, isIndividual, outputDir]);

  return {
    items,
    selected,
    select: setSelectedId,
    mode,
    setMode,
    format: effectiveFormat,
    rawFormat: format,
    setFormat,
    isIndividual,
    setIsIndividual,
    applyToAll,
    outputDir,
    pickOutputDir,
    clearOutputDir,
    status,
    progress,
    results,
    error,
    pick,
    addFiles,
    moveItem,
    removeFile,
    clear,
    start,
  };
}
