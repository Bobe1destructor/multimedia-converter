import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_REPO = "Bobe1destructor/multimedia-converter";
export const CURRENT_VERSION = "0.3.5";

export interface UpdateInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  downloadUrl: string;
  releaseUrl: string;
}

/**
 * Compara dos versiones semánticas (ej. "0.4.0" > "0.3.1")
 * Devuelve 1 si v1 > v2, -1 si v1 < v2, 0 si son iguales.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/i, "").trim();
  const clean2 = v2.replace(/^v/i, "").trim();

  const parts1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Consulta la API pública de GitHub Releases para ver si hay una versión más reciente.
 * Es completamente seguro ante fallas: si no hay internet o el repo no existe, devuelve null.
 */
export async function checkForAppUpdates(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const tag = (data.tag_name || data.name || "").trim();
    if (!tag) return null;

    const hasUpdate = compareSemver(tag, CURRENT_VERSION) > 0;
    if (!hasUpdate) return null;

    // Buscar si hay un instalador de Windows (.exe o .msi) en los assets
    let downloadUrl = data.html_url;
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      const exeAsset = data.assets.find(
        (a: { name?: string; browser_download_url?: string }) =>
          typeof a.name === "string" && (a.name.endsWith(".exe") || a.name.endsWith(".msi")),
      );
      if (exeAsset?.browser_download_url) {
        downloadUrl = exeAsset.browser_download_url;
      }
    }

    return {
      version: tag.replace(/^v/i, ""),
      name: data.name || tag,
      body: data.body || "",
      publishedAt: data.published_at || "",
      downloadUrl,
      releaseUrl: data.html_url,
    };
  } catch {
    // Si no hay conexión o falla la red, ignorar en silencio
    return null;
  }
}

/**
 * Abre la URL de descarga o release en el navegador predeterminado del sistema.
 */
export async function openDownloadLink(url: string) {
  try {
    await openUrl(url);
  } catch (err) {
    // Respaldo en caso de que el plugin falle
    window.open(url, "_blank");
  }
}

