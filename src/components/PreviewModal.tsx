import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
  Film,
  Image as ImageIcon,
} from "lucide-react";

export type PreviewTarget =
  | {
      type: "image";
      title: string;
      originalPath: string;
      outputPath?: string | null;
      originalSize?: number;
      outputSize?: number;
    }
  | {
      type: "video";
      title: string;
      originalPath: string;
      outputPath?: string | null;
      originalSize?: number;
      outputSize?: number;
    };

interface PreviewModalProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

function formatBytes(n?: number | null) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function PreviewModal({ target, onClose }: PreviewModalProps) {
  // Estado para el comparador de imágenes (porcentaje de la barra deslizante 0-100)
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Estado para el reproductor de video
  const [activeVideoTab, setActiveVideoTab] = useState<"original" | "output">("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Resetear estados al cambiar de target
  useEffect(() => {
    if (target) {
      setSliderPos(50);
      setActiveVideoTab(target.outputPath ? "output" : "original");
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [target]);

  // Manejador del arrastre para la barra comparadora
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };

  if (!target) return null;

  const hasOutput = Boolean(target.outputPath);
  const currentVideoSrc =
    target.type === "video"
      ? convertFileSrc(activeVideoTab === "output" && target.outputPath ? target.outputPath : target.originalPath)
      : "";

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* Fondo oscuro con desenfoque */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Ventana modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative z-10 flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0f1424]/95 shadow-2xl shadow-black/80 backdrop-blur-xl"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-[#1e293b] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
                {target.type === "video" ? <Film size={18} /> : <ImageIcon size={18} />}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-white" title={target.title}>
                  {target.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Original: {formatBytes(target.originalSize)}</span>
                  {hasOutput && target.outputSize && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-emerald-400">
                        Convertido: {formatBytes(target.outputSize)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Pestañas de video si hay resultado */}
              {target.type === "video" && hasOutput && (
                <div className="mr-2 flex rounded-xl bg-[#1e293b]/70 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("original")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      activeVideoTab === "original"
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("output")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      activeVideoTab === "output"
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Convertido
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar vista previa"
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Área visual central */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#070a13] p-4">
            {target.type === "image" ? (
              hasOutput ? (
                /* COMPARADOR ANTES VS DESPUÉS (SPLIT SLIDER) */
                <div
                  className="relative h-full w-full select-none overflow-hidden rounded-2xl touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setIsDragging(false)}
                  onPointerLeave={() => setIsDragging(false)}
                >
                  {/* Capa de fondo: Imagen de SALIDA (Convertida) */}
                  <img
                    src={convertFileSrc(target.outputPath!)}
                    alt="Salida"
                    className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                  />
                  <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-emerald-300 backdrop-blur-md">
                    Convertida ({formatBytes(target.outputSize)})
                  </div>

                  {/* Capa superior recortada: Imagen ORIGINAL */}
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                  >
                    <img
                      src={convertFileSrc(target.originalPath)}
                      alt="Original"
                      className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                    />
                    <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-indigo-300 backdrop-blur-md">
                      Original ({formatBytes(target.originalSize)})
                    </div>
                  </div>

                  {/* Línea divisoria vertical */}
                  <div
                    className="absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                    style={{ left: `${sliderPos}%` }}
                  >
                    <div className="absolute top-1/2 -ml-3.5 -mt-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-indigo-600 text-white shadow-xl cursor-ew-resize">
                      <Sliders size={13} className="rotate-90" />
                    </div>
                  </div>

                  {/* Indicación inferior */}
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur-md">
                    ← Desliza para comparar calidad →
                  </div>
                </div>
              ) : (
                /* IMAGEN INDIVIDUAL (Aún no convertida) */
                <div className="relative flex h-full w-full items-center justify-center">
                  <img
                    src={convertFileSrc(target.originalPath)}
                    alt={target.title}
                    className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                  />
                  <div className="absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-slate-300 backdrop-blur-md">
                    Vista previa original
                  </div>
                </div>
              )
            ) : (
              /* REPRODUCTOR DE VIDEO */
              <div className="relative flex h-full w-full flex-col items-center justify-center">
                <video
                  ref={videoRef}
                  key={currentVideoSrc}
                  src={currentVideoSrc}
                  muted={isMuted}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setDuration(videoRef.current.duration);
                  }}
                  onEnded={() => setIsPlaying(false)}
                  onClick={() => {
                    if (!videoRef.current) return;
                    if (isPlaying) videoRef.current.pause();
                    else videoRef.current.play();
                    setIsPlaying(!isPlaying);
                  }}
                  className="max-h-[65vh] w-full rounded-2xl object-contain cursor-pointer"
                />

                {/* Controles de reproducción flotantes */}
                <div className="mt-3 flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-[#131a2a]/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      if (!videoRef.current) return;
                      if (isPlaying) videoRef.current.pause();
                      else videoRef.current.play();
                      setIsPlaying(!isPlaying);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500"
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                  </button>

                  {/* Barra de tiempo */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500 outline-none"
                  />

                  {/* Tiempo transcurrido */}
                  <span className="font-mono text-xs text-slate-400">
                    {Math.floor(currentTime / 60)}:
                    {Math.floor(currentTime % 60)
                      .toString()
                      .padStart(2, "0")}{" "}
                    / {Math.floor(duration / 60)}:
                    {Math.floor(duration % 60)
                      .toString()
                      .padStart(2, "0")}
                  </span>

                  {/* Mute */}
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:text-white"
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}
