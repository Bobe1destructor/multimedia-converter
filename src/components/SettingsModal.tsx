import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Cpu,
  Download,
  FileSignature,
  Files,
  FolderOpen,
  History,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  ACCENT_PRESETS,
  type AppSettings,
  type PostAction,
  type ThreadMode,
} from "../hooks/useAppSettings";
import { playCompletionChime } from "../lib/utils";
import { CURRENT_VERSION } from "../lib/updater";
import {
  checkForNativeUpdate,
  installNativeUpdate,
  type UpdateStatus,
} from "../lib/nativeUpdater";

interface ThumbCacheInfo {
  count: number;
  sizeBytes: number;
}

function formatBytes(n: number) {
  if (n === 0) return "0 KB";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/* ───────────── Utilidades de conversión RGB <-> HSL <-> HEX ligeras ───────────── */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [99, 102, 241];
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${((1 << 24) | (cr << 16) | (cg << 8) | cb).toString(16).slice(1)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const POST_ACTIONS: { id: PostAction; label: string }[] = [
  { id: "none", label: "Nada" },
  { id: "sound", label: "Sonido" },
  { id: "open_folder", label: "Abrir carpeta" },
  { id: "both", label: "Ambos" },
];

const THREAD_OPTIONS: { id: ThreadMode; label: string; hint: string }[] = [
  { id: "auto", label: "Máximo (100%)", hint: "Usa todos los hilos del CPU" },
  { id: "half", label: "Equilibrado (50%)", hint: "Mitad de núcleos libres" },
  { id: "two", label: "Silencioso (2 hilos)", hint: "Mínimo consumo en 2.º plano" },
];

export function SettingsModal({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
}) {
  const [cacheInfo, setCacheInfo] = useState<ThumbCacheInfo | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [showCustomRgb, setShowCustomRgb] = useState(false);

  // Estado del comprobador de actualizaciones
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [nativeStatus, setNativeStatus] = useState<UpdateStatus | null>(null);
  const [manualChecked, setManualChecked] = useState(false);
  const [installingNative, setInstallingNative] = useState(false);
  const [installProgress, setInstallProgress] = useState<number | null>(null);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    setManualChecked(false);
    setNativeStatus(null);
    try {
      const status = await checkForNativeUpdate();
      setNativeStatus(status);
      setManualChecked(true);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTriggerNativeInstall = async () => {
    if (!nativeStatus?.rawUpdate || installingNative) return;
    setInstallingNative(true);
    try {
      await installNativeUpdate(nativeStatus.rawUpdate, (pct) => {
        setInstallProgress(pct);
      });
    } catch {
      setInstallingNative(false);
      setInstallProgress(null);
    }
  };

  // Estado local aislado para el selector RGB: mueve la barra arcoíris a 144 FPS sin recalcular el DOM global hasta soltar
  const [rgb, setRgb] = useState<[number, number, number]>(() => hexToRgb(settings.accentHex));
  const [hsl, setHsl] = useState<[number, number, number]>(() => {
    const [r, g, b] = hexToRgb(settings.accentHex);
    return rgbToHsl(r, g, b);
  });

  useEffect(() => {
    const nextRgb = hexToRgb(settings.accentHex);
    setRgb(nextRgb);
    setHsl(rgbToHsl(nextRgb[0], nextRgb[1], nextRgb[2]));
  }, [settings.accentHex]);

  const previewHex = rgbToHex(rgb[0], rgb[1], rgb[2]);

  const handleHueSlide = (newHue: number) => {
    const s = Math.max(hsl[1], 65);
    const l = Math.min(Math.max(hsl[2], 45), 62);
    const nextRgb = hslToRgb(newHue, s, l);
    setHsl([newHue, s, l]);
    setRgb(nextRgb);
  };

  const handleLightnessSlide = (newL: number) => {
    const nextRgb = hslToRgb(hsl[0], Math.max(hsl[1], 60), newL);
    setHsl([hsl[0], Math.max(hsl[1], 60), newL]);
    setRgb(nextRgb);
  };

  const handleRgbChannel = (idx: 0 | 1 | 2, val: number) => {
    const clamped = Math.max(0, Math.min(255, Number.isFinite(val) ? Math.round(val) : 0));
    const next: [number, number, number] = [...rgb] as [number, number, number];
    next[idx] = clamped;
    setRgb(next);
    setHsl(rgbToHsl(next[0], next[1], next[2]));
    settings.setAccentHex(rgbToHex(next[0], next[1], next[2]));
  };

  const commitPreviewColor = () => {
    settings.setAccentHex(previewHex);
  };

  const loadCacheInfo = useCallback(() => {
    invoke<ThumbCacheInfo>("get_thumb_cache_info")
      .then(setCacheInfo)
      .catch(() => setCacheInfo({ count: 0, sizeBytes: 0 }));
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCacheInfo();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, loadCacheInfo]);

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const info = await invoke<ThumbCacheInfo>("clear_thumb_cache");
      setCacheInfo(info);
    } finally {
      setClearingCache(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/55"
        />
      )}
      {open && (
        <motion.aside
          key="settings-drawer"
          role="dialog"
          aria-label="Ajustes del programa"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(510px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[#1e293b] bg-[#0f1424]/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
        >
          {/* Encabezado */}
          <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300">
                <Settings size={18} />
              </div>
              <h3 className="text-base font-bold text-white">Ajustes del programa</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ajustes"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          {/* Contenido desplazable */}
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* 1. Color de la interfaz */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Palette size={16} className="text-indigo-400" />
                <span>Color de la interfaz</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((p) => {
                  const active = settings.accentHex.toLowerCase() === p.hex.toLowerCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => settings.setAccentHex(p.hex)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-600/20 text-white"
                          : "border-[#23284f] bg-[#0e1122] text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className="h-3.5 w-3.5 rounded-full shadow-sm" style={{ backgroundColor: p.hex }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-[#23284f] bg-[#0e1122]/90 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 shrink-0 rounded-lg border border-white/20 shadow-inner"
                      style={{ backgroundColor: previewHex }}
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Personalizado</p>
                      <p className="font-mono text-[11px] uppercase text-indigo-300">{previewHex}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomRgb((v) => !v)}
                    className="rounded-lg border border-indigo-500/40 bg-indigo-600/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/25"
                  >
                    {showCustomRgb ? "Ocultar" : "Personalizar RGB"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showCustomRgb && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3.5 space-y-3 border-t border-[#1e293b] pt-3">
                        {/* Barra arcoíris de Tono */}
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                            <span>Tono</span>
                            <span className="font-mono text-slate-300">{hsl[0]}°</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={hsl[0]}
                            onChange={(e) => handleHueSlide(Number(e.target.value))}
                            onPointerUp={commitPreviewColor}
                            onKeyUp={commitPreviewColor}
                            style={{
                              background:
                                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                            }}
                            className="h-3 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow-md"
                          />
                        </div>

                        {/* Barra de Brillo */}
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                            <span>Brillo</span>
                            <span className="font-mono text-slate-300">{hsl[2]}%</span>
                          </div>
                          <input
                            type="range"
                            min={25}
                            max={75}
                            value={hsl[2]}
                            onChange={(e) => handleLightnessSlide(Number(e.target.value))}
                            onPointerUp={commitPreviewColor}
                            onKeyUp={commitPreviewColor}
                            style={{
                              background: `linear-gradient(to right, #0f172a, hsl(${hsl[0]}, 85%, 55%), #e2e8f0)`,
                            }}
                            className="h-2.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow-md"
                          />
                        </div>

                        {/* Cajas numéricas R, G, B */}
                        <div className="grid grid-cols-3 gap-2.5 pt-1">
                          {(
                            [
                              [0, "Rojo"],
                              [1, "Verde"],
                              [2, "Azul"],
                            ] as const
                          ).map(([idx, label]) => (
                            <div key={label}>
                              <label className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {label}
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={3}
                                value={rgb[idx]}
                                onKeyDown={(e) => {
                                  if (
                                    !/[0-9]/.test(e.key) &&
                                    !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                                    !e.ctrlKey &&
                                    !e.metaKey
                                  ) {
                                    e.preventDefault();
                                  }
                                }}
                                onChange={(e) => {
                                  const clean = e.target.value.replace(/\D/g, "");
                                  let num = clean === "" ? 0 : parseInt(clean, 10);
                                  if (isNaN(num)) num = 0;
                                  if (num > 255) num = 255;
                                  e.target.value = String(num);
                                  handleRgbChannel(idx, num);
                                }}
                                className="w-full rounded-lg border border-[#23284f] bg-[#131a2a] py-1.5 text-center font-mono text-xs text-white outline-none focus:border-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* 2. Carpeta de salida predeterminada */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FolderOpen size={16} className="text-indigo-400" />
                <span>Carpeta de salida predeterminada</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div
                  className="min-w-0 flex-1 truncate rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-2 text-xs text-slate-200"
                  title={settings.defaultOutputDir ?? undefined}
                >
                  {settings.defaultOutputDir ?? (
                    <span className="text-slate-500">Misma carpeta que el archivo original</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={settings.pickDefaultOutputDir}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#23284f]/80 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#2c3262]"
                >
                  <FolderOpen size={14} /> Elegir
                </button>
                {settings.defaultOutputDir && (
                  <button
                    type="button"
                    onClick={() => settings.setDefaultOutputDir(null)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-slate-100"
                    aria-label="Restaurar a carpeta de origen"
                    title="Restaurar a carpeta de origen"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </section>

            {/* 3. Recordar última configuración */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <History size={16} className="text-indigo-400" />
                  <span>Recordar opciones de conversión</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.rememberLastSettings}
                  onClick={() => settings.setRememberLastSettings(!settings.rememberLastSettings)}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    settings.rememberLastSettings ? "justify-end bg-indigo-500" : "justify-start bg-slate-600/60"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="h-5 w-5 rounded-full bg-white shadow"
                  />
                </button>
              </div>

              {settings.rememberLastSettings && (
                settings.lastVideo || settings.lastImage || settings.lastDoc ? (
                  <div className="mt-3 space-y-1.5 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2 text-[11px] text-slate-400">
                    {settings.lastVideo && (
                      <p>
                        • <span className="font-semibold text-slate-200">Video:</span>{" "}
                        {settings.lastVideo.format.toUpperCase()} · {settings.lastVideo.codec.toUpperCase()} ·{" "}
                        {settings.lastVideo.quality}%
                        {settings.lastVideo.remuxCopy ? " (Copia directa)" : ""}
                        {settings.lastVideo.extractAudioMp3 ? " (Solo audio MP3)" : ""}
                      </p>
                    )}
                    {settings.lastImage && (
                      <p>
                        • <span className="font-semibold text-slate-200">Imagen:</span>{" "}
                        {settings.lastImage.mode === "strip"
                          ? "Quitar metadatos"
                          : `${settings.lastImage.format.toUpperCase()} · ${settings.lastImage.quality}% · Escala ${settings.lastImage.scale}%`}
                      </p>
                    )}
                    {settings.lastDoc && (
                      <p>
                        • <span className="font-semibold text-slate-200">Documento:</span>{" "}
                        {settings.lastDoc.mode === "strip"
                          ? "Quitar metadatos"
                          : settings.lastDoc.mode === "merge"
                            ? "Unir PDFs"
                            : `Convertir a ${settings.lastDoc.format.toUpperCase()}`}
                      </p>
                    )}
                  </div>
                ) : null
              )}
            </section>

            {/* 4. Sufijo de archivos generados */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileSignature size={16} className="text-indigo-400" />
                <span>Sufijo de archivos generados</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Al convertir
                  </label>
                  <input
                    type="text"
                    value={settings.customSuffix}
                    placeholder="convertido"
                    onChange={(e) => settings.setCustomSuffix(e.target.value)}
                    className="w-full rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Al quitar metadatos
                  </label>
                  <input
                    type="text"
                    value={settings.stripSuffix}
                    placeholder="sin_metadatos"
                    onChange={(e) => settings.setStripSuffix(e.target.value)}
                    className="w-full rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2">
                <span className="text-xs text-slate-300">
                  Omitir sufijo al guardar en una carpeta distinta a la original
                </span>
                <input
                  type="checkbox"
                  checked={settings.omitSuffixInCustomDir}
                  onChange={(e) => settings.setOmitSuffixInCustomDir(e.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
              </label>
            </section>

            {/* 5. Al finalizar conversión */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Bell size={16} className="text-indigo-400" />
                  <span>Al finalizar conversión</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={playCompletionChime}
                    className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Probar sonido
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={settings.testNotification}
                    className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    Probar aviso
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-[#0e1122] p-1">
                {POST_ACTIONS.map((a) => {
                  const active = settings.onCompleteAction === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => settings.setOnCompleteAction(a.id)}
                      className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                        active ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>

              {/* Notificación en segundo plano */}
              <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[#23284f]/60 pt-3">
                <span className="text-xs font-semibold text-slate-200">
                  Notificación del sistema en segundo plano
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.notifyOnComplete}
                  onClick={() => settings.setNotifyOnComplete(!settings.notifyOnComplete)}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    settings.notifyOnComplete ? "justify-end bg-indigo-500" : "justify-start bg-slate-600/60"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className="h-5 w-5 rounded-full bg-white shadow"
                  />
                </button>
              </div>
            </section>

            {/* 6. Si el archivo ya existe */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Files size={16} className="text-indigo-400" />
                <span>Si el archivo ya existe en disco</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => settings.setOverwriteExisting(false)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    !settings.overwriteExisting
                      ? "border-indigo-500 bg-indigo-600/15 text-white"
                      : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <p className="text-xs font-bold">Numerar (_2, _3…)</p>
                </button>
                <button
                  type="button"
                  onClick={() => settings.setOverwriteExisting(true)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    settings.overwriteExisting
                      ? "border-indigo-500 bg-indigo-600/15 text-white"
                      : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <p className="text-xs font-bold">Sobrescribir</p>
                </button>
              </div>
            </section>

            {/* 7. Rendimiento */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Cpu size={16} className="text-indigo-400" />
                <span>Rendimiento y CPU</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {THREAD_OPTIONS.map((t) => {
                  const active = settings.threadMode === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => settings.setThreadMode(t.id)}
                      className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-600/15 text-white"
                          : "border-[#23284f] bg-[#0e1122] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <p className="text-xs font-bold">{t.label}</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{t.hint}</p>
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#23284f] bg-[#0e1122]/80 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-200">
                  Forzar codificación por CPU (ignorar GPU)
                </span>
                <input
                  type="checkbox"
                  checked={settings.forceCpu}
                  onChange={(e) => settings.setForceCpu(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-indigo-500"
                />
              </label>
            </section>

            {/* 8. Caché de miniaturas temporales */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Trash2 size={16} className="text-indigo-400" />
                    <span>Caché de miniaturas de video</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {cacheInfo
                      ? `${cacheInfo.count} miniatura${cacheInfo.count === 1 ? "" : "s"} (${formatBytes(cacheInfo.sizeBytes)})`
                      : "Calculando espacio…"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={clearingCache || !cacheInfo || cacheInfo.count === 0}
                  onClick={handleClearCache}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#23284f] bg-[#0e1122] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} /> Vaciar caché
                </button>
              </div>
            </section>

            {/* 9. Actualizaciones */}
            <section className="rounded-2xl border border-[#23284f] bg-[#131a2a]/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sparkles size={16} className="text-indigo-400" />
                    <span>Actualizaciones</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Versión instalada: <span className="font-semibold text-slate-200">v{CURRENT_VERSION}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={handleManualCheckUpdate}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={13} className={checkingUpdate ? "animate-spin" : ""} />
                  {checkingUpdate ? "Buscando…" : "Buscar actualizaciones"}
                </button>
              </div>

              {/* Resultado de búsqueda manual */}
              {manualChecked && (
                <div className="mt-3">
                  {nativeStatus?.available ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-white">
                            ¡Nueva versión v{nativeStatus.version} disponible!
                          </p>
                          <p className="text-[11px] text-slate-300">
                            {installingNative
                              ? installProgress !== null && installProgress < 100
                                ? `Descargando parche… (${installProgress}%)`
                                : "Reiniciando…"
                              : "Se instalará y reiniciará automáticamente."}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={installingNative}
                          onClick={handleTriggerNativeInstall}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {installingNative ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>{installProgress !== null ? `${installProgress}%` : "Instalando…"}</span>
                            </>
                          ) : (
                            <>
                              <Download size={13} />
                              <span>Actualizar y reiniciar</span>
                            </>
                          )}
                        </button>
                      </div>

                      {installingNative && installProgress !== null && (
                        <div className="mt-1 overflow-hidden rounded-full bg-slate-800 p-0.5">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${installProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
                      ✓ Ya tienes instalada la versión más reciente (v{CURRENT_VERSION}).
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Pie del modal */}
          <div className="flex items-center justify-between border-t border-[#1e293b] px-6 py-4">
            <button
              type="button"
              onClick={settings.resetAllSettings}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <RotateCcw size={14} /> Restablecer ajustes de fábrica
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Listo
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}