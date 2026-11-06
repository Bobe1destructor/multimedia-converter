import type { VideoMetadata } from "../types";

/** Tamaño de salida en píxeles (se envía a Rust como `scale`). */
export interface TargetSize {
  width: number;
  height: number;
}

export interface ResolutionOption extends TargetSize {
  id: string; // lado corto en píxeles, p. ej. "1080"
  label: string; // "1080p"
  name?: string; // "Full HD", "UWQHD"…
}

export interface AspectInfo {
  id: string | null; // null = relación no estándar
  label: string;
  portrait: boolean;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Relaciones de aspecto conocidas (horizontales y verticales). */
const FAMILIES = [
  { id: "21:9", ratio: 21 / 9, label: "21:9 (ultrapanorámico / cine)" },
  { id: "16:9", ratio: 16 / 9, label: "16:9" },
  { id: "16:10", ratio: 16 / 10, label: "16:10" },
  { id: "3:2", ratio: 3 / 2, label: "3:2" },
  { id: "4:3", ratio: 4 / 3, label: "4:3" },
  { id: "5:4", ratio: 5 / 4, label: "5:4" },
  { id: "1:1", ratio: 1, label: "1:1 (cuadrado)" },
  { id: "9:21", ratio: 9 / 21, label: "9:21 (vertical ultrapanorámico)" },
  { id: "9:16", ratio: 9 / 16, label: "9:16 (vertical)" },
  { id: "10:16", ratio: 10 / 16, label: "10:16 (vertical)" },
  { id: "2:3", ratio: 2 / 3, label: "2:3 (vertical)" },
  { id: "3:4", ratio: 3 / 4, label: "3:4 (vertical)" },
  { id: "4:5", ratio: 4 / 5, label: "4:5 (vertical)" },
] as const;

/** Detecta la relación de aspecto más cercana (tolerancia del 3 %). */
export function detectAspect(w: number, h: number): AspectInfo {
  const ratio = w / h;
  const portrait = h > w;
  let best: (typeof FAMILIES)[number] | null = null;
  let bestErr = Infinity;
  for (const f of FAMILIES) {
    const err = Math.abs(ratio - f.ratio) / f.ratio;
    if (err < bestErr) {
      best = f;
      bestErr = err;
    }
  }
  if (best && bestErr <= 0.03) return { id: best.id, label: best.label, portrait };
  const txt = ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
  return { id: null, label: `Personalizada (≈ ${txt})`, portrait };
}

/* ───── Escalas por relación de aspecto, definidas por el LADO CORTO ───── */

interface Preset {
  s: number;
  name?: string;
}

const GENERIC: Preset[] = [{ s: 2160, name: "4K" }, { s: 1440 }, { s: 1080 }, { s: 720 }, { s: 480 }, { s: 360 }];

const L_16_9: Preset[] = [
  { s: 2160, name: "4K UHD" },
  { s: 1440, name: "QHD" },
  { s: 1080, name: "Full HD" },
  { s: 720, name: "HD" },
  { s: 480, name: "SD" },
  { s: 360 },
];

const L_21_9: Preset[] = [
  { s: 1600, name: "UW 4K" },
  { s: 1440, name: "UWQHD" },
  { s: 1080, name: "UWFHD" },
  { s: 720 },
  { s: 540 },
];

const L_16_10: Preset[] = [
  { s: 1600, name: "WQXGA" },
  { s: 1200, name: "WUXGA" },
  { s: 1050, name: "WSXGA+" },
  { s: 900, name: "WXGA+" },
  { s: 800, name: "WXGA" },
  { s: 720 },
];

const L_4_3: Preset[] = [
  { s: 1536, name: "QXGA" },
  { s: 1200, name: "UXGA" },
  { s: 1080 },
  { s: 960 },
  { s: 768, name: "XGA" },
  { s: 600, name: "SVGA" },
  { s: 480, name: "VGA" },
];

const L_3_2: Preset[] = [{ s: 2160 }, { s: 1440 }, { s: 1080 }, { s: 720 }, { s: 480 }];

const L_5_4: Preset[] = [{ s: 1600 }, { s: 1280 }, { s: 1024, name: "SXGA" }, { s: 800 }, { s: 600 }];

const PRESETS: Record<string, Preset[]> = {
  "16:9": L_16_9,
  "9:16": L_16_9,
  "21:9": L_21_9,
  "9:21": L_21_9,
  "16:10": L_16_10,
  "10:16": L_16_10,
  "4:3": L_4_3,
  "3:4": L_4_3,
  "3:2": L_3_2,
  "2:3": L_3_2,
  "5:4": L_5_4,
  "4:5": L_5_4,
  "1:1": GENERIC,
};

/**
 * Opciones de resolución para un video de `w`×`h`: solo tamaños menores al original,
 * conservando la proporción exacta del video (ancho/alto pares, sin deformar).
 * En videos verticales el "lado corto" es el ancho. Ordenadas de mayor a menor.
 */
export function resolutionOptions(w: number, h: number): ResolutionOption[] {
  if (!w || !h) return [];
  const { id, portrait } = detectAspect(w, h);
  const ladder = (id && PRESETS[id]) || GENERIC;
  const short = Math.min(w, h);

  return ladder
    .filter((p) => p.s < short)
    .map((p) => {
      const other = even(p.s * (portrait ? h / w : w / h));
      return {
        id: String(p.s),
        label: `${p.s}p`,
        name: p.name,
        width: portrait ? p.s : other,
        height: portrait ? other : p.s,
      };
    });
}

/**
 * Convierte el tope elegido ("original" o un lado corto, p. ej. "1080") en el tamaño de salida
 * de ESTE video: la escala igual o inmediata inferior disponible para su relación de aspecto.
 * Si el video ya es igual o menor que el tope, se mantiene la resolución original (null).
 */
export function resolveTarget(meta: VideoMetadata | null, cap: string): TargetSize | null {
  const v = meta?.video;
  if (!v || cap === "original") return null;
  const limit = Number(cap);
  if (!Number.isFinite(limit) || limit >= Math.min(v.width, v.height)) return null;
  const best = resolutionOptions(v.width, v.height).find((o) => Number(o.id) <= limit);
  return best ? { width: best.width, height: best.height } : null;
}