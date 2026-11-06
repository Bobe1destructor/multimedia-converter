export const VIDEO_EXTS = ["mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "3gp"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
export const DOC_EXTS = ["pdf", "docx", "txt", "md"];

const sepIdx = (p: string) => Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));

/** Separa una ruta (Windows o Unix) en carpeta, archivo, nombre sin extensión y extensión. */
export function splitPath(p: string) {
  const i = sepIdx(p);
  const dir = p.slice(0, i + 1); // incluye el separador final
  const file = p.slice(i + 1);
  const dot = file.lastIndexOf(".");
  return {
    dir,
    file,
    stem: dot > 0 ? file.slice(0, dot) : file,
    ext: dot > 0 ? file.slice(dot + 1).toLowerCase() : "",
  };
}

function normalizeDir(d: string) {
  return d.replace(/[\\/]+$/, "").toLowerCase();
}

/**
 * Construye la ruta de salida:
 * - Si hay `outputDir`, usa esa carpeta.
 * - Si el sufijo está vacío y el destino no choca con el archivo de origen, guarda como `nombre.ext`.
 */
export function buildDest(
  source: string,
  ext: string,
  used?: Set<string>,
  suffix = "convertido",
  outputDir: string | null = null,
) {
  const { dir, stem, ext: srcExt } = splitPath(source);
  const base = outputDir
    ? /[\\/]$/.test(outputDir)
      ? outputDir
      : outputDir + (outputDir.includes("\\") ? "\\" : "/")
    : dir;

  const cleanSuffix = suffix.trim().replace(/^_+/, "");
  const sameFolder = normalizeDir(base) === normalizeDir(dir);
  const sameExt = ext.toLowerCase() === srcExt.toLowerCase();

  // Si está en la misma carpeta y tiene la misma extensión, nunca puede quedar sin sufijo (pisaría al origen)
  const effectiveSuffix = !cleanSuffix && sameFolder && sameExt ? "convertido" : cleanSuffix;
  const tag = effectiveSuffix ? `_${effectiveSuffix}` : "";

  let dest = `${base}${stem}${tag}.${ext}`;
  if (used) {
    let n = 2;
    while (used.has(dest.toLowerCase())) {
      dest = `${base}${stem}${tag}_${n++}.${ext}`;
    }
    used.add(dest.toLowerCase());
  }
  return dest;
}

/** 83 → "01:23" · 3725 → "1:02:05" */
export function formatTime(secs: number) {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Convierte "90", "01:30" o "01:02:03.5" en segundos (null si está vacío, NaN si el formato es inválido). */
export function parseTimeInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p.trim())) return NaN;
    total = total * 60 + Number(p);
  }
  return Number.isFinite(total) && total >= 0 ? total : NaN;
}

/** Emite un acorde suave de finalización usando Web Audio API (sin archivos externos). */
export function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // Do5 - Mi5 - Sol5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.08;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  } catch {
    // Ignorar si el navegador bloquea el audio
  }
}

/** Emite un sonido suave y sutil de error usando Web Audio API (sin archivos externos). */
export function playErrorSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Primer pulso suave
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(320, now);
    osc1.frequency.exponentialRampToValueAtTime(260, now + 0.09);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Segundo pulso suave descendente
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(240, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 0.22);
    gain2.gain.setValueAtTime(0.001, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  } catch {
    // Ignorar si el navegador bloquea el audio
  }
}
