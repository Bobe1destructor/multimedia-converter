import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Film, Image as ImageIcon, Settings } from "lucide-react";
import "./App.css";

import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { useAppSettings } from "./hooks/useAppSettings";
import { useHwProfile } from "./hooks/useHwProfile";
import { useVideoConverter } from "./hooks/useVideoConverter";
import { useImageConverter } from "./hooks/useImageConverter";
import { useDocConverter } from "./hooks/useDocConverter";
import { PillTabs } from "./components/ui";
import { VideoTab } from "./components/VideoTab";
import { ImageTab } from "./components/ImageTab";
import { DocTab } from "./components/DocTab";
const SettingsModal = lazy(() => import("./components/SettingsModal").then((m) => ({ default: m.SettingsModal })));
import { ToastContainer, type ToastItem } from "./components/Toast";
import { playErrorSound, splitPath } from "./lib/utils";
import type { IncompatibleHandler } from "./types";
import { checkForNativeUpdate, type UpdateStatus } from "./lib/nativeUpdater";
import { NativeUpdateBanner } from "./components/NativeUpdateBanner";

type TabId = "video" | "image" | "doc";

const TABS = [
  { id: "video" as const, label: "Video", icon: <Film size={18} /> },
  { id: "image" as const, label: "Imágenes", icon: <ImageIcon size={18} /> },
  { id: "doc" as const, label: "Documentos", icon: <FileText size={18} /> },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("video");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nativeUpdate, setNativeUpdate] = useState<UpdateStatus | null>(null);

  // Buscar actualizaciones nativas al abrir la app
  useEffect(() => {
    let cancelled = false;
    checkForNativeUpdate().then((status) => {
      if (!cancelled && status.available) {
        setNativeUpdate(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Configuración persistente (color RGB, carpeta predeterminada y memoria de la última conversión)
  const appSettings = useAppSettings();

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleIncompatible: IncompatibleHandler = useCallback(
    (files: string[], section: "video" | "image" | "doc", customReason?: string) => {
      playErrorSound();

      const count = files.length;
      const firstFileName = splitPath(files[0]).file;
      const firstExt = splitPath(files[0]).ext.toUpperCase() || "desconocido";

      let sectionName = "";
      let formats = "";
      if (section === "video") {
        sectionName = "Video";
        formats = "MP4, MKV, MOV, WebM, AVI...";
      } else if (section === "image") {
        sectionName = "Imágenes";
        formats = "PNG, JPG, WebP";
      } else {
        sectionName = "Documentos";
        formats = "PDF, DOCX, TXT, Markdown";
      }

      const title = count === 1 ? "Formato no compatible" : "Formatos no compatibles";
      const message =
        customReason ??
        (count === 1
          ? `No fue posible añadir «${firstFileName}» (.${firstExt.toLowerCase()}) porque el formato de archivo no es el correcto para el apartado de ${sectionName}. Formatos admitidos: ${formats}.`
          : `No fue posible añadir ${count} archivos porque sus formatos no son los correctos para el apartado de ${sectionName}. Formatos admitidos: ${formats}.`);

      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, message, tone: "error" }]);
    },
    [],
  );

  // El estado vive aquí para no perder progreso ni archivos al cambiar de pestaña
  const hw = useHwProfile();
  const video = useVideoConverter(appSettings, handleIncompatible);
  const image = useImageConverter(appSettings, handleIncompatible);
  const doc = useDocConverter(appSettings, handleIncompatible);

  // Al arrastrar archivos desde el explorador, si el cursor pasa sobre los botones de pestañas,
  // cambiamos automáticamente la pestaña activa para recibir el archivo en la sección correspondiente.
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "over" || p.type === "enter") {
          const x = p.position.x / window.devicePixelRatio;
          const y = p.position.y / window.devicePixelRatio;

          const buttons = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-id]"));
          for (const btn of buttons) {
            const r = btn.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
              const target = btn.getAttribute("data-tab-id") as TabId;
              if (target && target !== tabRef.current) {
                setTab(target);
              }
              break;
            }
          }
        }
      })
      .then((f) => {
        if (cancelled) f();
        else un = f;
      });

    return () => {
      cancelled = true;
      un?.();
    };
  }, []);

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30">
      {/* Ancho completo de la ventana (hasta 1800 px) */}
      <main className="mx-auto w-full max-w-[1800px] px-6 pb-8 pt-5">
        {/* Encabezado compacto: título a la izquierda, pestañas + botón Ajustes a la derecha */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-500">Conversor Multimedia</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Video, imágenes y documentos · Aceleración por GPU y procesamiento paralelo
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div className="flex-1 sm:w-[480px] [&_button]:py-2.5">
              <PillTabs tabs={TABS} value={tab} onChange={setTab} />
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir ajustes"
              title="Ajustes del programa"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#1e293b] bg-[#131a2a]/80 px-4 py-3 text-sm font-semibold text-slate-300 shadow-lg transition-colors hover:border-indigo-500/40 hover:text-white"
            >
              <Settings size={18} className="text-indigo-400" />
              <span className="hidden md:inline">Ajustes</span>
            </button>
          </div>
        </header>

        {/* Banner de actualización nativa automática (descarga y reinicia) */}
        {nativeUpdate && (
          <NativeUpdateBanner
            status={nativeUpdate}
            onDismiss={() => setNativeUpdate(null)}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {tab === "video" ? (
              <VideoTab vc={video} hw={hw} />
            ) : tab === "image" ? (
              <ImageTab ic={image} />
            ) : (
              <DocTab dc={doc} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={appSettings} />
        </Suspense>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}