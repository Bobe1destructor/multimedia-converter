import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  tone?: "error" | "warn" | "info";
  durationMs?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, onDismiss }: ToastProps) {
  const duration = toast.durationMs ?? 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  const tone = toast.tone ?? "error";
  const icon =
    tone === "error" ? (
      <AlertCircle size={18} className="text-rose-400" />
    ) : tone === "warn" ? (
      <AlertTriangle size={18} className="text-amber-400" />
    ) : (
      <Info size={18} className="text-sky-400" />
    );

  const borderCls =
    tone === "error"
      ? "border-rose-500/40 shadow-rose-950/40"
      : tone === "warn"
        ? "border-amber-500/40 shadow-amber-950/40"
        : "border-sky-500/40 shadow-sky-950/40";

  const barCls =
    tone === "error" ? "bg-rose-500/60" : tone === "warn" ? "bg-amber-500/60" : "bg-sky-500/60";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 25, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-[#0d1222]/95 p-4 shadow-2xl backdrop-blur-xl ${borderCls}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">{toast.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Cerrar notificación"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>

      {/* Barra de progreso de tiempo restante */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: duration / 1000, ease: "linear" }}
          className={`h-full ${barCls}`}
        />
      </div>
    </motion.div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2.5"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </aside>
  );
}

