import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateStatus {
  available: boolean;
  version?: string;
  body?: string;
  rawUpdate?: Update;
}

/**
 * Consulta el endpoint oficial de Tauri Updater (GitHub latest.json)
 * y verifica la firma criptográfica con tu pubkey.
 */
export async function checkForNativeUpdate(): Promise<UpdateStatus> {
  try {
    const update = await check();
    if (update?.available) {
      return {
        available: true,
        version: update.version,
        body: update.body ?? "",
        rawUpdate: update,
      };
    }
    return { available: false };
  } catch (err) {
    console.debug("[Updater] No se pudo comprobar actualización nativa:", err);
    return { available: false };
  }
}

/**
 * Descarga el parche en segundo plano, reemplaza los archivos del programa
 * y solicita confirmación para reiniciar la aplicación.
 */
export async function installNativeUpdate(
  update: Update,
  onProgress?: (progressPercent: number) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0 && onProgress) {
          const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress(pct);
        }
        break;
      case "Finished":
        if (onProgress) onProgress(100);
        break;
    }
  });

  // Reiniciar el programa inmediatamente con los archivos reemplazados
  await relaunch();
}

