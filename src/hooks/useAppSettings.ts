import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DocFormat, ImgFormat, ImgScale, VideoCodec, VideoFormat } from "../types";
import { playCompletionChime } from "../lib/utils";
import type { ImageMode } from "./useImageConverter";
import type { DocMode } from "./useDocConverter";

export interface SavedDocPrefs {
  mode: DocMode;
  format: DocFormat;
}

const STORAGE_KEY = "multimedia-converter:settings:v1";

export type PostAction = "none" | "sound" | "open_folder" | "both";
export type ThreadMode = "auto" | "half" | "two";

export interface SavedVideoPrefs {
  format: VideoFormat;
  codec: VideoCodec;
  quality: number;
  resolution: string;
  remuxCopy: boolean;
  extractAudioMp3: boolean;
  mute: boolean;
}

export interface SavedImagePrefs {
  mode: ImageMode;
  format: ImgFormat;
  quality: number;
  scale: ImgScale;
}

export interface AppSettingsData {
  accentHex: string;
  defaultOutputDir: string | null;
  rememberLastSettings: boolean;
  customSuffix: string;
  stripSuffix: string;
  omitSuffixInCustomDir: boolean;
  onCompleteAction: PostAction;
  notifyOnComplete: boolean;
  overwriteExisting: boolean;
  forceCpu: boolean;
  threadMode: ThreadMode;
  lastVideo: SavedVideoPrefs | null;
  lastImage: SavedImagePrefs | null;
  lastDoc: SavedDocPrefs | null;
}

const DEFAULT_APP_SETTINGS: AppSettingsData = {
  accentHex: "#6366f1",
  defaultOutputDir: null,
  rememberLastSettings: true,
  customSuffix: "convertido",
  stripSuffix: "sin_metadatos",
  omitSuffixInCustomDir: false,
  onCompleteAction: "none",
  notifyOnComplete: true,
  overwriteExisting: false,
  forceCpu: false,
  threadMode: "auto",
  lastVideo: null,
  lastImage: null,
  lastDoc: null,
};

export const ACCENT_PRESETS = [
  { id: "indigo", name: "Índigo", hex: "#6366f1" },
  { id: "blue", name: "Azul", hex: "#3b82f6" },
  { id: "cyan", name: "Cian", hex: "#06b6d4" },
  { id: "emerald", name: "Esmeralda", hex: "#10b981" },
  { id: "amber", name: "Ámbar", hex: "#f59e0b" },
  { id: "rose", name: "Rosa", hex: "#f43f5e" },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [99, 102, 241];
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: [number, number, number], b: [number, number, number], weightB: number): string {
  const wA = 1 - weightB;
  const r = Math.round(a[0] * wA + b[0] * weightB);
  const g = Math.round(a[1] * wA + b[1] * weightB);
  const bl = Math.round(a[2] * wA + b[2] * weightB);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Inyecta toda la escala derivada de un color Hex/RGB en las variables CSS de `:root` (sin re-renderizar React). */
export function applyAccentPalette(hex: string) {
  const rgb = hexToRgb(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [10, 14, 26];
  const secRgb: [number, number, number] = [
    Math.min(255, Math.round(rgb[0] * 0.85 + 35)),
    Math.max(0, Math.round(rgb[1] * 0.78)),
    Math.min(255, Math.round(rgb[2] * 0.95 + 15)),
  ];

  const root = document.documentElement;
  root.style.setProperty("--accent-rgb", `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
  root.style.setProperty("--accent-sec-rgb", `${secRgb[0]}, ${secRgb[1]}, ${secRgb[2]}`);
  root.style.setProperty("--accent-200", mixRgb(rgb, white, 0.62));
  root.style.setProperty("--accent-300", mixRgb(rgb, white, 0.42));
  root.style.setProperty("--accent-400", mixRgb(rgb, white, 0.22));
  root.style.setProperty("--accent-500", mixRgb(rgb, white, 0.0));
  root.style.setProperty("--accent-600", mixRgb(rgb, black, 0.14));
  root.style.setProperty("--accent-700", mixRgb(rgb, black, 0.28));
  root.style.setProperty("--accent-900", mixRgb(rgb, black, 0.58));
  root.style.setProperty("--accent-sec-500", mixRgb(secRgb, white, 0.06));
  root.style.setProperty("--accent-sec-600", mixRgb(secRgb, black, 0.12));
}

function loadSettings(): AppSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettingsData>;
    return {
      accentHex: typeof parsed.accentHex === "string" ? parsed.accentHex : DEFAULT_APP_SETTINGS.accentHex,
      defaultOutputDir: typeof parsed.defaultOutputDir === "string" ? parsed.defaultOutputDir : null,
      rememberLastSettings:
        typeof parsed.rememberLastSettings === "boolean"
          ? parsed.rememberLastSettings
          : DEFAULT_APP_SETTINGS.rememberLastSettings,
      customSuffix: typeof parsed.customSuffix === "string" ? parsed.customSuffix : DEFAULT_APP_SETTINGS.customSuffix,
      stripSuffix: typeof parsed.stripSuffix === "string" ? parsed.stripSuffix : DEFAULT_APP_SETTINGS.stripSuffix,
      omitSuffixInCustomDir:
        typeof parsed.omitSuffixInCustomDir === "boolean"
          ? parsed.omitSuffixInCustomDir
          : DEFAULT_APP_SETTINGS.omitSuffixInCustomDir,
      onCompleteAction:
        parsed.onCompleteAction === "sound" ||
        parsed.onCompleteAction === "open_folder" ||
        parsed.onCompleteAction === "both"
          ? parsed.onCompleteAction
          : "none",
      notifyOnComplete:
        typeof parsed.notifyOnComplete === "boolean"
          ? parsed.notifyOnComplete
          : DEFAULT_APP_SETTINGS.notifyOnComplete,
      overwriteExisting:
        typeof parsed.overwriteExisting === "boolean"
          ? parsed.overwriteExisting
          : DEFAULT_APP_SETTINGS.overwriteExisting,
      forceCpu: typeof parsed.forceCpu === "boolean" ? parsed.forceCpu : DEFAULT_APP_SETTINGS.forceCpu,
      threadMode:
        parsed.threadMode === "half" || parsed.threadMode === "two" ? parsed.threadMode : DEFAULT_APP_SETTINGS.threadMode,
      lastVideo: parsed.lastVideo ?? null,
      lastImage: parsed.lastImage ?? null,
      lastDoc: parsed.lastDoc ?? null,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export type AppSettings = ReturnType<typeof useAppSettings>;

export function useAppSettings() {
  const [data, setData] = useState<AppSettingsData>(loadSettings);

  // Aplica la paleta inmediatamente
  useEffect(() => {
    applyAccentPalette(data.accentHex);
  }, [data.accentHex]);

  // Guarda en localStorage inmediatamente ante cualquier cambio
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignorar si el almacenamiento está bloqueado
    }
  }, [data]);

  const setAccentHex = useCallback((hex: string) => {
    setData((prev) => (prev.accentHex === hex ? prev : { ...prev, accentHex: hex }));
  }, []);

  const setDefaultOutputDir = useCallback((dir: string | null) => {
    setData((prev) => ({ ...prev, defaultOutputDir: dir }));
  }, []);

  const pickDefaultOutputDir = useCallback(async () => {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setData((prev) => ({ ...prev, defaultOutputDir: sel }));
    }
  }, []);

  const setRememberLastSettings = useCallback((on: boolean) => {
    setData((prev) => ({
      ...prev,
      rememberLastSettings: on,
      lastVideo: on ? prev.lastVideo : null,
      lastImage: on ? prev.lastImage : null,
      lastDoc: on ? prev.lastDoc : null,
    }));
  }, []);

  const setCustomSuffix = useCallback((val: string) => {
    setData((prev) => ({ ...prev, customSuffix: val }));
  }, []);

  const setStripSuffix = useCallback((val: string) => {
    setData((prev) => ({ ...prev, stripSuffix: val }));
  }, []);

  const setOmitSuffixInCustomDir = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, omitSuffixInCustomDir: on }));
  }, []);

  const setOnCompleteAction = useCallback((action: PostAction) => {
    setData((prev) => ({ ...prev, onCompleteAction: action }));
  }, []);

  const setNotifyOnComplete = useCallback((val: boolean) => {
    setData((prev) => ({ ...prev, notifyOnComplete: val }));
  }, []);

  const setOverwriteExisting = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, overwriteExisting: on }));
  }, []);

  const setForceCpu = useCallback((on: boolean) => {
    setData((prev) => ({ ...prev, forceCpu: on }));
  }, []);

  const setThreadMode = useCallback((mode: ThreadMode) => {
    setData((prev) => ({ ...prev, threadMode: mode }));
  }, []);

  const recordLastVideo = useCallback((prefs: SavedVideoPrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastVideo: prefs } : prev));
  }, []);

  const recordLastImage = useCallback((prefs: SavedImagePrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastImage: prefs } : prev));
  }, []);

  const recordLastDoc = useCallback((prefs: SavedDocPrefs) => {
    setData((prev) => (prev.rememberLastSettings ? { ...prev, lastDoc: prefs } : prev));
  }, []);

  const resolveSuffix = useCallback(
    (isStrip: boolean, hasCustomOutDir: boolean) => {
      if (hasCustomOutDir && data.omitSuffixInCustomDir) return "";
      const raw = isStrip ? data.stripSuffix.trim() : data.customSuffix.trim();
      return raw || (isStrip ? "sin_metadatos" : "convertido");
    },
    [data.customSuffix, data.stripSuffix, data.omitSuffixInCustomDir],
  );

  const runPostAction = useCallback(
    (firstOutputPath: string | null, details?: { title?: string; message?: string }) => {
      if (data.onCompleteAction === "sound" || data.onCompleteAction === "both") {
        playCompletionChime();
      }
      if ((data.onCompleteAction === "open_folder" || data.onCompleteAction === "both") && firstOutputPath) {
        revealItemInDir(firstOutputPath).catch(() => {});
      }
      if (data.notifyOnComplete) {
        invoke("notify_completion_if_unfocused", {
          title: details?.title ?? "Conversor Multimedia",
          message: details?.message ?? "¡La conversión ya está lista!",
        }).catch(() => {});
      }
    },
    [data.onCompleteAction, data.notifyOnComplete],
  );

  const testNotification = useCallback(() => {
    invoke("notify_completion_if_unfocused", {
      title: "Conversor Multimedia",
      message: "¡Notificación de prueba con el icono oficial!",
      force: true,
    }).catch(() => {});
  }, []);

  const resetAllSettings = useCallback(() => {
    setData(DEFAULT_APP_SETTINGS);
  }, []);

  return {
    ...data,
    setAccentHex,
    setDefaultOutputDir,
    pickDefaultOutputDir,
    setRememberLastSettings,
    setCustomSuffix,
    setStripSuffix,
    setOmitSuffixInCustomDir,
    setOnCompleteAction,
    setNotifyOnComplete,
    setOverwriteExisting,
    setForceCpu,
    setThreadMode,
    recordLastVideo,
    recordLastImage,
    recordLastDoc,
    resolveSuffix,
    runPostAction,
    testNotification,
    resetAllSettings,
  };
}