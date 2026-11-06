import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import type { UpdateInfo } from "../lib/updater";
import { openDownloadLink } from "../lib/updater";

interface UpdateBannerProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    await openDownloadLink(update.downloadUrl);
    setTimeout(() => setDownloading(false), 2000);
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
                  ¡Nueva versión disponible! (v{update.version})
                </span>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                  Actualización
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Una versión más reciente de Multimedia Converter está lista para descargar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {update.body && (
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
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-indigo-500/25 active:scale-95"
            >
              <Download size={15} />
              <span>{downloading ? "Abriendo..." : "Descargar actualización"}</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Cerrar aviso"
              className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notas de la versión desplegables */}
        {showNotes && update.body && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300"
          >
            <p className="font-semibold text-indigo-300 mb-1">Notas de la versión:</p>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto">
              {update.body}
            </pre>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

