import { type KeyboardEvent, type ReactNode, useId } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

/* Degradado de la captura (índigo → violeta).
   Para el del brief usa: "bg-gradient-to-r from-blue-600 to-indigo-600" y "hover:from-blue-500 hover:to-indigo-500" */
export const GRADIENT_BG = "bg-gradient-to-r from-indigo-600 to-violet-600";
const GRADIENT_HOVER = "hover:from-indigo-500 hover:to-violet-500";

/* ───────── Tarjeta flotante ───────── */
export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div
      {...props}
      className={`rounded-3xl border border-[#1e293b] bg-[#131a2a]/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

/* ───────── Pestañas a todo el ancho, cápsula activa con degradado y glow ───────── */
export function PillTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { id: T; label: string; icon: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-2xl border border-[#1e293b] bg-[#131a2a]/60 p-2 shadow-[0_0_40px_rgba(79,70,229,0.12)] backdrop-blur-xl">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            data-tab-id={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            onDragEnter={(e) => {
              e.preventDefault();
              onChange(t.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              onChange(t.id);
            }}
            className={`relative isolate flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-semibold transition-colors ${
              active ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                transition={spring}
                className={`absolute inset-0 -z-10 rounded-xl ${GRADIENT_BG} shadow-[0_10px_30px_-8px_rgba(99,102,241,0.65)]`}
              />
            )}
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── Selector segmentado: contenedor azulado, chip activo oscuro con texto índigo ───────── */
export function Segmented<T extends string>({
  label, value, options, onChange, disabled, labels,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
  labels?: Partial<Record<T, string>>;
}) {
  const id = useId();
  return (
    <div>
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <div className="relative inline-flex max-w-full flex-wrap rounded-2xl bg-[#23284f]/60 p-1.5">
        {options.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o)}
              className="relative isolate rounded-xl px-5 py-2 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {active && (
                <motion.span
                  layoutId={`seg-${id}`}
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-xl bg-[#0e1122] shadow-inner"
                />
              )}
              <span className={active ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}>
                {labels?.[o] ?? o.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Cuadro informativo ───────── */
export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-[#23284f]/60 px-5 py-4 text-[15px] leading-relaxed text-slate-400">{children}</div>;
}

/* ───────── Botones ───────── */
export function GradientButton({
  children, onClick, disabled, loading, className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const off = disabled || loading;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={off}
      whileHover={off ? undefined : { scale: 1.03 }}
      whileTap={off ? undefined : { scale: 0.96 }}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl ${GRADIENT_BG} ${GRADIENT_HOVER} px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition-shadow hover:shadow-indigo-700/50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
}

export function SecondaryButton({
  children, onClick, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className="rounded-2xl bg-[#23284f]/70 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#2c3262] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </motion.button>
  );
}

/* ───────── Progreso (value=null → indeterminada) ───────── */
export function ProgressBar({ value }: { value?: number | null }) {
  const isDeterminate = typeof value === "number" && Number.isFinite(value);
  const clamped = isDeterminate ? Math.min(100, Math.max(0, value!)) : 0;

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-[#23284f]">
      {isDeterminate ? (
        <motion.div
          key="determinate"
          className={`h-full rounded-full ${GRADIENT_BG} ${clamped > 0 ? "shadow-[0_0_14px_rgba(124,58,237,0.7)]" : ""}`}
          initial={false}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{ transform: "none" }}
        />
      ) : (
        <motion.div
          key="indeterminate"
          className={`h-full w-1/3 rounded-full ${GRADIENT_BG}`}
          animate={{ x: ["-100%", "300%"] }}
          transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#23284f]/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums text-slate-100">{value}</p>
    </div>
  );
}

/* ───────── Avisos ───────── */
const TONES = {
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
} as const;

export function Notice({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </motion.div>
  );
}

/* ───────── Zona de arrastre con aspecto del input oscuro de la captura ───────── */
export function DropZone({
  hover, icon, title, subtitle, onBrowse, disabled, children,
}: {
  hover: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onBrowse: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled) onBrowse();
    }
  };
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onBrowse}
      onKeyDown={key}
      initial={false}
      animate={{ scale: hover ? 1.012 : 1, borderColor: hover ? "#6366f1" : "#23284f" }}
      transition={{ duration: 0.15 }}
      className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
        hover ? "bg-indigo-600/10" : "bg-[#0e1122]/80 hover:bg-[#0e1122]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {children ?? (
        <>
          <div className="rounded-2xl bg-indigo-600/15 p-3 text-indigo-300">{icon}</div>
          <p className="text-base font-medium text-slate-200">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </>
      )}
    </motion.div>
  );
}
