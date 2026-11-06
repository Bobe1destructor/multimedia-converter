import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Sparkles, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "../lib/nativeUpdater";
import { installNativeUpdate } from "../lib/nativeUpdater";

interface NativeUpdateBannerProps {
  status: UpdateStatus;
  onDismiss: () => void;
}

export function NativeUpdateBanner({ status, onDismiss }: NativeUpdateBannerProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleInstall = async () => {
    if (!status.rawUpdate || installing) return;
    setInstalling(true);
    setErrorMsg(null);
    setProgress(0);

    try {
      await installNativeUpdate(status.rawUpdate, (pct) => {
        setProgress(pct);
      });
    } catch (err: unknown) {
      console.error("Error al actualizar:", err);
      setInstalling(false);
      setProgress(null);
      setErrorMsg("Ocurrió un error al descargar e instalar el parche.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="mb-4 overflow-hidden rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/90 via-[#131a2a]/95 to-indigo-950/90 p-4 shadow-xl backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  ¡Nueva versión disponible! (v{status.version})
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Instalación automática
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {installing
                  ? progress !== null && progress < 100
                    ? `Descargando e instalando parche… (${progress}%)`
                    : "Reiniciando la aplicación…"
                  : "Se actualizará y reiniciará el programa automáticamente sin salir de la app."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status.body && !installing && (
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <span>Novedades</span>
                {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}

            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-indigo-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>{progress !== null ? `${progress}%` : "Instalando…"}</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Actualizar y reiniciar</span>
                </>
              )}
            </button>

            {!installing && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Cerrar aviso"
                className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de progreso visual si está instalando */}
        {installing && progress !== null && (
          <div className="mt-3 overflow-hidden rounded-full bg-slate-800/80 p-0.5">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Mensaje de error si falla */}
        {errorMsg && (
          <p className="mt-2 text-xs text-rose-400">{errorMsg}</p>
        )}

        {/* Notas de la versión desplegables */}
        {showNotes && status.body && !installing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300"
          >
            <p className="mb-1 font-semibold text-indigo-300">Notas de la versión:</p>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">
              {status.body}
            </pre>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

