import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImageJob, ImageMetadata, ImageProgress, ImageResult, ImgFormat, ImgScale, IncompatibleHandler, JobStatus } from "../types";
import { IMAGE_EXTS, buildDest, splitPath } from "../lib/utils";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

/** convert = cambiar de formato · strip = quitar metadatos sin recodificar */
export type ImageMode = "convert" | "strip";

export interface ImageSettings {
  format: ImgFormat;
  quality: number;
  scale: ImgScale;
}

export interface ImageQueueItem {
  id: string;
  path: string;
  meta: ImageMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  settings?: ImageSettings;
}

export type ImageConverter = ReturnType<typeof useImageConverter>;

export function useImageConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const saved = appSettings.rememberLastSettings ? appSettings.lastImage : null;

  const [items, setItems] = useState<ImageQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mode, setModeState] = useState<ImageMode>(() => saved?.mode ?? "convert");
  const [format, setFormatState] = useState<ImgFormat>(() => saved?.format ?? "webp");
  const [quality, setQualityState] = useState(() => saved?.quality ?? 90);
  const [scale, setScaleState] = useState<ImgScale>(() => saved?.scale ?? "100");
  const [isIndividual, setIsIndividualState] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(() => appSettings.defaultOutputDir);

  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState<ImageProgress | null>(null);
  const [results, setResults] = useState<ImageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  useEffect(() => {
    setOutputDir(appSettings.defaultOutputDir);
  }, [appSettings.defaultOutputDir]);

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const effectiveFormat = (isIndividual && selected?.settings) ? selected.settings.format : format;
  const effectiveQuality = (isIndividual && selected?.settings) ? selected.settings.quality : quality;
  const effectiveScale = (isIndividual && selected?.settings) ? selected.settings.scale : scale;

  useTauriEvent<ImageProgress>("image-progress", (p) => {
    if (busy.current) setProgress(p);
  });

  const resetResult = () => {
    setStatus("idle");
    setProgress(null);
    setResults(null);
    setError(null);
  };

  const setMode = useCallback((m: ImageMode) => {
    if (busy.current) return;
    setModeState(m);
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode: m, format: effectiveFormat, quality: effectiveQuality, scale: effectiveScale });
    }
  }, [effectiveFormat, effectiveQuality, effectiveScale]);

  const setFormat = useCallback((f: ImgFormat) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: f,
                  quality: it.settings?.quality ?? quality,
                  scale: it.settings?.scale ?? scale,
                },
              }
            : it,
        ),
      );
    } else {
      setFormatState(f);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: f,
            quality: it.settings?.quality ?? quality,
            scale: it.settings?.scale ?? scale,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: f, quality: effectiveQuality, scale: effectiveScale });
    }
  }, [isIndividual, selected, quality, scale, mode, effectiveQuality, effectiveScale]);

  const setQuality = useCallback((q: number) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: it.settings?.format ?? format,
                  quality: q,
                  scale: it.settings?.scale ?? scale,
                },
              }
            : it,
        ),
      );
    } else {
      setQualityState(q);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: it.settings?.format ?? format,
            quality: q,
            scale: it.settings?.scale ?? scale,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: q, scale: effectiveScale });
    }
  }, [isIndividual, selected, format, scale, mode, effectiveFormat, effectiveScale]);

  const setScale = useCallback((s: ImgScale) => {
    if (busy.current) return;
    if (isIndividual && selected) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id
            ? {
                ...it,
                settings: {
                  format: it.settings?.format ?? format,
                  quality: it.settings?.quality ?? quality,
                  scale: s,
                },
              }
            : it,
        ),
      );
    } else {
      setScaleState(s);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: {
            format: it.settings?.format ?? format,
            quality: it.settings?.quality ?? quality,
            scale: s,
          },
        })),
      );
    }
    resetResult();
    const cfg = appSettingsRef.current;
    if (cfg.rememberLastSettings) {
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: effectiveQuality, scale: s });
    }
  }, [isIndividual, selected, format, quality, mode, effectiveFormat, effectiveQuality]);

  const setIsIndividual = useCallback((val: boolean) => {
    if (busy.current) return;
    setIsIndividualState(val);
    if (val) {
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          settings: it.settings ?? { format, quality, scale },
        })),
      );
    }
    resetResult();
  }, [format, quality, scale]);

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const curItem = itemsRef.current.find((i) => i.id === selected?.id) ?? selected;
    const curSettings: ImageSettings = curItem?.settings ?? { format, quality, scale };
    setFormatState(curSettings.format);
    setQualityState(curSettings.quality);
    setScaleState(curSettings.scale);
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        settings: { ...curSettings },
      })),
    );
    setIsIndividualState(false);
    resetResult();
  }, [selected, format, quality, scale]);

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

  const patch = useCallback((id: string, p: Partial<ImageQueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<ImageMetadata>("get_image_metadata", { source: path });
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
      const fresh: ImageQueueItem[] = [];
      const rejected: string[] = [];

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (!IMAGE_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);

        fresh.push({
          id: `img-${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          meta: null,
          metaState: "loading",
          metaError: null,
          settings: { format, quality, scale },
        });
      }

      if (rejected.length > 0) {
        onIncompatibleRef.current?.(rejected, "image");
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
    [loadMeta, format, quality, scale],
  );

  const pick = useCallback(async () => {
    const sel = await open({ multiple: true, filters: [{ name: "Imágenes", extensions: IMAGE_EXTS }] });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles]);

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
      cfg.recordLastImage({ mode, format: effectiveFormat, quality: effectiveQuality, scale: effectiveScale });
    }

    busy.current = true;
    setStatus("running");
    setResults(null);
    setError(null);

    const used = new Set<string>();
    const effectiveOutDir = outputDir ?? cfg.defaultOutputDir;
    const isStrip = mode === "strip";
    const suffix = cfg.resolveSuffix(isStrip, Boolean(effectiveOutDir));
    const overwrite = cfg.overwriteExisting;
    const threadMode = cfg.threadMode;

    const jobs: ImageJob[] = items.map((it) => {
      const s = (isIndividual && it.settings) ? it.settings : { format, quality, scale };
      const scaleNum = Number(s.scale);
      return {
        source: it.path,
        dest: isStrip
          ? buildDest(it.path, splitPath(it.path).ext || "png", used, suffix, effectiveOutDir)
          : buildDest(it.path, s.format, used, suffix, effectiveOutDir),
        format: s.format,
        quality: s.quality,
        scale: scaleNum,
      };
    });
    setProgress({ done: 0, total: jobs.length });

    try {
      let finalRes: ImageResult[] = [];
      if (isStrip) {
        finalRes = await invoke<ImageResult[]>("strip_images_metadata", {
          jobs,
          overwrite,
          threadMode,
        });
      } else if (jobs.length === 1) {
        const [j] = jobs;
        const singleRes = await invoke<ImageResult>("convert_image", {
          source: j.source,
          dest: j.dest,
          format: j.format ?? format,
          quality: j.quality ?? quality,
          scale: j.scale ?? Number(scale),
          overwrite,
        });
        finalRes = [singleRes];
      } else {
        finalRes = await invoke<ImageResult[]>("convert_images_batch", {
          jobs,
          format,
          quality,
          scale: Number(scale),
          overwrite,
          threadMode,
        });
      }
      setResults(finalRes);
      setStatus("done");

      const firstOk = finalRes.find((r) => r.ok);
      if (firstOk) {
        const okCount = finalRes.filter((r) => r.ok).length;
        const isStrip = mode === "strip";
        const title = isStrip ? "Metadatos eliminados" : "Conversión de imágenes lista";
        const msg = isStrip
          ? okCount === 1
            ? "Se eliminaron los metadatos de la imagen."
            : `Se eliminaron los metadatos de ${okCount} imágenes.`
          : okCount === 1
            ? `La imagen se ha convertido a ${format.toUpperCase()}.`
            : `Se han convertido ${okCount} imágenes a ${format.toUpperCase()}.`;
        cfg.runPostAction(firstOk.dest, { title, message: msg });
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, [items, mode, format, quality, scale, isIndividual, outputDir]);

  return {
    items,
    selected,
    select: setSelectedId,
    mode,
    setMode,
    format: effectiveFormat,
    rawFormat: format,
    setFormat,
    quality: effectiveQuality,
    rawQuality: quality,
    setQuality,
    scale: effectiveScale,
    rawScale: scale,
    setScale,
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
    removeFile,
    clear,
    start,
  };
}
