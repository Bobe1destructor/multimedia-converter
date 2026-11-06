import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CODEC_LABEL,
  DEFAULT_SETTINGS,
  FORMAT_LABEL,
  PREFERRED_FORMAT,
  defaultCodecFor,
  modeOf,
  supports,
  type ConvertProgress,
  type IncompatibleHandler,
  type ConvertVideoResponse,
  type VideoCodec,
  type VideoFormat,
  type VideoMetadata,
  type VideoSettings,
} from "../types";
import { VIDEO_EXTS, buildDest, parseTimeInput, splitPath } from "../lib/utils";
import { resolveTarget } from "../lib/resolution";
import type { VideoPreset } from "../lib/presets";
import type { AppSettings } from "./useAppSettings";
import { useTauriEvent } from "./tauri";

export type ItemStatus = "pending" | "running" | "done" | "error" | "cancelled";

/** Un video de la cola. El `id` también se usa como `jobId` en el backend. */
export interface QueueItem {
  id: string;
  path: string;
  settings: VideoSettings;
  meta: VideoMetadata | null;
  metaState: "loading" | "ready" | "error";
  metaError: string | null;
  status: ItemStatus;
  progress: ConvertProgress | null;
  fellBack: boolean;
  error: string | null;
  output: string | null;
  outputBytes: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const RESET = {
  status: "pending",
  progress: null,
  error: null,
  output: null,
  outputBytes: null,
  fellBack: false,
  startedAt: null,
  finishedAt: null,
} as const;

const same = (a: VideoSettings, b: VideoSettings) => JSON.stringify(a) === JSON.stringify(b);

export type VideoConverter = ReturnType<typeof useVideoConverter>;

export function useVideoConverter(appSettings: AppSettings, onIncompatible?: IncompatibleHandler) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runInfo, setRunInfo] = useState<{ total: number; done: number } | null>(null);

  const busy = useRef(false);
  const cancelRequested = useRef(false);
  const currentId = useRef<string | null>(null);
  const counter = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onIncompatibleRef = useRef(onIncompatible);
  onIncompatibleRef.current = onIncompatible;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.id ?? null;

  const patch = useCallback((id: string, p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  useTauriEvent<ConvertProgress>("convert-progress", (p) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === p.jobId ? { ...it, progress: p, fellBack: it.fellBack || p.stage === "fallback" } : it,
      ),
    );
  });

  const elapsedOf = useCallback(
    (it: QueueItem) => (it.startedAt ? ((it.finishedAt ?? Date.now()) - it.startedAt) / 1000 : 0),
    [],
  );

  /* ───── Metadatos (ffprobe) ───── */
  const loadMeta = useCallback(
    async (id: string, path: string) => {
      try {
        const m = await invoke<VideoMetadata>("get_video_metadata", { source: path });
        if (!m.video) {
          patch(id, { meta: m, metaState: "error", metaError: "El archivo no contiene una pista de video." });
        } else {
          patch(id, { meta: m, metaState: "ready", metaError: null });
        }
      } catch (e) {
        patch(id, { metaState: "error", metaError: String(e) });
      }
    },
    [patch],
  );

  /* ───── Gestión de la cola ───── */
  const addFiles = useCallback(
    (paths: string[], isInside = true) => {
      if (busy.current) return;
      const known = new Set(itemsRef.current.map((i) => i.path.toLowerCase()));
      const fresh: QueueItem[] = [];
      const cfg = appSettingsRef.current;
      const saved = cfg.rememberLastSettings ? cfg.lastVideo : null;

      const initialSettings: VideoSettings = {
        ...DEFAULT_SETTINGS,
        ...(saved ?? {}),
        outputDir: cfg.defaultOutputDir,
      };

      const rejected: string[] = [];

      for (const p of paths) {
        const ext = splitPath(p).ext.toLowerCase();
        if (!VIDEO_EXTS.includes(ext)) {
          rejected.push(p);
          continue;
        }
        if (!isInside) continue;
        const key = p.toLowerCase();
        if (known.has(key)) continue;
        known.add(key);
        fresh.push({
          id: `v${++counter.current}-${Date.now().toString(36)}`,
          path: p,
          settings: { ...initialSettings },
          meta: null,
          metaState: "loading",
          metaError: null,
          status: "pending",
          progress: null,
          fellBack: false,
          error: null,
          output: null,
          outputBytes: null,
          startedAt: null,
          finishedAt: null,
        });
      }
      if (rejected.length > 0) {
        onIncompatibleRef.current?.(rejected, "video");
      }

      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      setSelectedId((cur) => cur ?? fresh[0].id);
      void (async () => {
        for (const it of fresh) await loadMeta(it.id, it.path);
      })();
    },
    [loadMeta],
  );

  const pick = useCallback(async () => {
    const sel = await open({ multiple: true, filters: [{ name: "Video", extensions: VIDEO_EXTS }] });
    if (Array.isArray(sel)) addFiles(sel);
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    if (busy.current) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    if (busy.current) return;
    setItems([]);
    setSelectedId(null);
    setRunInfo(null);
  }, []);

  /* ───── Opciones: todas editan SOLO el video seleccionado ───── */
  const updateSelected = useCallback((fn: (s: VideoSettings) => VideoSettings) => {
    if (busy.current) return;
    const id = selectedRef.current;
    if (!id) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = fn(it.settings);
        const cfg = appSettingsRef.current;
        if (cfg.rememberLastSettings) {
          cfg.recordLastVideo({
            format: next.format,
            codec: next.codec,
            quality: next.quality,
            resolution: next.resolution,
            remuxCopy: next.remuxCopy,
            extractAudioMp3: next.extractAudioMp3,
            mute: next.mute,
          });
        }
        return same(next, it.settings) ? it : { ...it, ...RESET, settings: next };
      }),
    );
  }, []);

  const setFormat = useCallback(
    (f: VideoFormat) =>
      updateSelected((s) => {
        if (s.remuxCopy || s.extractAudioMp3 || supports(f, s.codec)) {
          return { ...s, format: f, presetId: null, note: null };
        }
        const next = defaultCodecFor(f);
        return {
          ...s,
          format: f,
          codec: next,
          presetId: null,
          note: `${FORMAT_LABEL[f]} no admite ${CODEC_LABEL[s.codec]}: se cambió el códec a ${CODEC_LABEL[next]}.`,
        };
      }),
    [updateSelected],
  );

  const setCodec = useCallback(
    (c: VideoCodec) =>
      updateSelected((s) => {
        if (supports(s.format, c)) return { ...s, codec: c, presetId: null, note: null };
        const next = PREFERRED_FORMAT[c];
        return {
          ...s,
          codec: c,
          format: next,
          presetId: null,
          note: `${FORMAT_LABEL[s.format]} no admite ${CODEC_LABEL[c]}: se cambió el formato a ${FORMAT_LABEL[next]}.`,
        };
      }),
    [updateSelected],
  );

  const setQuality = useCallback(
    (q: number) => updateSelected((s) => ({ ...s, quality: q, presetId: null })),
    [updateSelected],
  );

  const setResolution = useCallback(
    (r: string) => updateSelected((s) => ({ ...s, resolution: r, presetId: null })),
    [updateSelected],
  );

  const setRemuxCopy = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        remuxCopy: on,
        extractAudioMp3: on ? false : s.extractAudioMp3,
        presetId: null,
      })),
    [updateSelected],
  );

  const setExtractAudioMp3 = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        extractAudioMp3: on,
        remuxCopy: on ? false : s.remuxCopy,
        mute: on ? false : s.mute,
        presetId: null,
      })),
    [updateSelected],
  );

  const setMute = useCallback(
    (on: boolean) =>
      updateSelected((s) => ({
        ...s,
        mute: on,
        extractAudioMp3: on ? false : s.extractAudioMp3,
        presetId: null,
      })),
    [updateSelected],
  );

  const setTrimStart = useCallback(
    (val: string) => updateSelected((s) => ({ ...s, trimStart: val })),
    [updateSelected],
  );

  const setTrimEnd = useCallback(
    (val: string) => updateSelected((s) => ({ ...s, trimEnd: val })),
    [updateSelected],
  );

  const clearTrim = useCallback(
    () => updateSelected((s) => ({ ...s, trimStart: "", trimEnd: "" })),
    [updateSelected],
  );

  const setTargetSizeMb = useCallback(
    (mb: number | null) =>
      updateSelected((s) => ({
        ...s,
        targetSizeMb: mb !== null && Number.isFinite(mb) && mb > 0 ? mb : null,
        presetId: null,
      })),
    [updateSelected],
  );

  const pickOutputDir = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") updateSelected((s) => ({ ...s, outputDir: sel }));
  }, [updateSelected]);

  const clearOutputDir = useCallback(
    () => updateSelected((s) => ({ ...s, outputDir: null })),
    [updateSelected],
  );

  const applyPreset = useCallback(
    (p: VideoPreset) =>
      updateSelected((s) => ({
        ...s,
        format: p.format,
        codec: p.codec,
        quality: p.quality,
        resolution: p.maxShortSide ? String(p.maxShortSide) : "original",
        remuxCopy: false,
        extractAudioMp3: false,
        targetSizeMb: null,
        presetId: p.id,
        note: null,
      })),
    [updateSelected],
  );

  const applyToAll = useCallback(() => {
    if (busy.current) return;
    const src = itemsRef.current.find((i) => i.id === selectedRef.current)?.settings;
    if (!src) return;
    setItems((prev) =>
      prev.map((it) => (same(it.settings, src) ? it : { ...it, ...RESET, settings: { ...src } })),
    );
  }, []);

  /* ───── Conversión de la cola y guardado de última configuración ───── */
  const start = useCallback(async () => {
    if (busy.current) return;
    const all = itemsRef.current;
    let targets = all.filter((i) => i.metaState === "ready" && i.status !== "done");
    if (!targets.length) targets = all.filter((i) => i.metaState === "ready");
    if (!targets.length) return;

    const cfg = appSettingsRef.current;
    const refSettings = (itemsRef.current.find((i) => i.id === selectedRef.current) ?? targets[0]).settings;
    cfg.recordLastVideo({
      format: refSettings.format,
      codec: refSettings.codec,
      quality: refSettings.quality,
      resolution: refSettings.resolution,
      remuxCopy: refSettings.remuxCopy,
      extractAudioMp3: refSettings.extractAudioMp3,
      mute: refSettings.mute,
    });

    busy.current = true;
    cancelRequested.current = false;
    const ids = targets.map((i) => i.id);
    setRunning(true);
    setRunInfo({ total: ids.length, done: 0 });
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, ...RESET } : it)));

    const used = new Set<string>();
    let done = 0;
    let firstSuccessOutput: string | null = null;

    for (const id of ids) {
      if (cancelRequested.current) break;
      const it = itemsRef.current.find((x) => x.id === id);
      if (!it) continue;
      const s = it.settings;
      const mode = modeOf(s);
      const effectiveOutDir = s.outputDir ?? appSettingsRef.current.defaultOutputDir;
      const suffix = appSettingsRef.current.resolveSuffix(false, Boolean(effectiveOutDir));

      const tStart = parseTimeInput(s.trimStart);
      const tEnd = parseTimeInput(s.trimEnd);

      currentId.current = id;
      patch(id, {
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        progress: it.meta?.durationSecs
          ? {
              jobId: id,
              percent: 0,
              processedSecs: 0,
              speed: null,
              encoder: s.codec,
              stage: "running",
            }
          : null,
      });

      if (Number.isNaN(tStart) || Number.isNaN(tEnd)) {
        patch(id, {
          status: "error",
          error: "Formato de tiempo de recorte inválido. Usa MM:SS o HH:MM:SS.",
          finishedAt: Date.now(),
        });
        done += 1;
        setRunInfo({ total: ids.length, done });
        continue;
      }

      try {
        const res = await invoke<ConvertVideoResponse>("convert_video", {
          jobId: id,
          source: it.path,
          dest: buildDest(it.path, mode === "audio" ? "mp3" : s.format, used, suffix, effectiveOutDir),
          format: s.format,
          codec: s.codec,
          quality: s.quality,
          scale: mode === "encode" ? resolveTarget(it.meta, s.resolution) : null,
          remuxCopy: s.remuxCopy,
          targetSizeMb: mode === "encode" ? s.targetSizeMb : null,
          extractAudioMp3: s.extractAudioMp3,
          mute: s.mute,
          trimStart: tStart,
          trimEnd: tEnd,
          overwrite: appSettingsRef.current.overwriteExisting,
          forceCpu: appSettingsRef.current.forceCpu,
          threadMode: appSettingsRef.current.threadMode,
        });
        if (!firstSuccessOutput) firstSuccessOutput = res.output;
        patch(id, {
          status: "done",
          output: res.output,
          outputBytes: res.sizeBytes,
          finishedAt: Date.now(),
        });
      } catch (e) {
        const msg = String(e);
        if (msg === "CANCELLED") patch(id, { status: "cancelled", finishedAt: Date.now() });
        else patch(id, { status: "error", error: msg, finishedAt: Date.now() });
      }
      done += 1;
      setRunInfo({ total: ids.length, done });
    }

    const wasCancelled = cancelRequested.current;
    currentId.current = null;
    busy.current = false;
    setRunning(false);
    setRunInfo(null);

    if (!wasCancelled && firstSuccessOutput) {
      const count = targets.length;
      const allAudio = targets.every((t) => t.settings.extractAudioMp3);
      const allRemux = targets.every((t) => t.settings.remuxCopy);
      const allCompress = targets.every((t) => t.settings.targetSizeMb != null);

      let title = "Conversión de video lista";
      let msg =
        count === 1
          ? `El video se ha convertido a ${targets[0].settings.format.toUpperCase()}.`
          : `Se han convertido ${count} videos correctamente.`;

      if (allAudio) {
        title = "Audio extraído con éxito";
        msg =
          count === 1
            ? "Se extrajo la pista de audio en formato MP3."
            : `Se extrajo el audio en MP3 de ${count} videos.`;
      } else if (allRemux) {
        title = "Copia directa lista";
        msg =
          count === 1
            ? "El contenedor del video se cambió sin recodificar."
            : `Se procesaron ${count} videos con copia directa.`;
      } else if (allCompress) {
        title = "Compresión de video lista";
        msg =
          count === 1
            ? "El video se ha comprimido al tamaño objetivo."
            : `Se comprimieron ${count} videos al tamaño deseado.`;
      }

      appSettingsRef.current.runPostAction(firstSuccessOutput, {
        title,
        message: msg,
      });
    }
  }, [patch]);

  const cancel = useCallback(async () => {
    cancelRequested.current = true;
    const id = currentId.current;
    if (id) await invoke("cancel_conversion", { jobId: id }).catch(() => {});
  }, []);

  /* ───── Valores derivados ───── */
  const current = items.find((i) => i.status === "running") ?? null;
  const overallPct = runInfo
    ? ((runInfo.done + (current?.progress?.percent ?? 0) / 100) / runInfo.total) * 100
    : null;
  const fallbackSettings: VideoSettings = {
    ...DEFAULT_SETTINGS,
    ...(appSettings.rememberLastSettings ? appSettings.lastVideo ?? {} : {}),
    outputDir: appSettings.defaultOutputDir,
  };
  const s = selected?.settings ?? fallbackSettings;

  return {
    items, selected, hasSelection: selected !== null, select: setSelectedId,
    current, runInfo, overallPct, running, elapsedOf,
    forceCpu: appSettings.forceCpu,
    format: s.format, codec: s.codec, quality: s.quality, resolution: s.resolution,
    remuxCopy: s.remuxCopy, extractAudioMp3: s.extractAudioMp3, mute: s.mute,
    trimStart: s.trimStart, trimEnd: s.trimEnd,
    targetSizeMb: s.targetSizeMb, outputDir: s.outputDir ?? appSettings.defaultOutputDir, presetId: s.presetId, note: s.note, mode: modeOf(s),
    setFormat, setCodec, setQuality, setResolution,
    setRemuxCopy, setExtractAudioMp3, setMute,
    setTrimStart, setTrimEnd, clearTrim,
    setTargetSizeMb, pickOutputDir, clearOutputDir, applyPreset, applyToAll,
    pick, addFiles, removeItem, clear, start, cancel,
  };
}