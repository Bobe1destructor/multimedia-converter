import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Suscripción a un evento de Tauri con limpieza segura (compatible con StrictMode). */
export function useTauriEvent<T>(name: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;
    listen<T>(name, (e) => ref.current(e.payload)).then((f) => {
      if (cancelled) f();
      else un = f;
    });
    return () => {
      cancelled = true;
      un?.();
    };
  }, [name]);
}

/**
 * Drag & drop nativo con restricción espacial:
 * - El estado hover solo se activa si el cursor está sobre la zona designada ([data-drop-zone="true"]).
 * - Pasa (paths, isInside) al callback para que los archivos compatibles solo se añadan si cayeron en la zona,
 *   mientras que los archivos incompatibles disparan la notificación de advertencia correspondiente.
 */
export function useTauriDrop(onDrop: (paths: string[], isInside: boolean) => void) {
  const [hover, setHover] = useState(false);
  const ref = useRef(onDrop);
  ref.current = onDrop;
  const hoverRef = useRef(false);

  useEffect(() => {
    let un: UnlistenFn | undefined;
    let cancelled = false;

    const isInsideDropZone = (pos?: { x: number; y: number }): boolean => {
      if (!pos) return false;
      const zones = Array.from(document.querySelectorAll<HTMLElement>('[data-drop-zone="true"]'));
      if (zones.length === 0) return true;

      const dpr = window.devicePixelRatio || 1;
      const candidates = [
        { x: pos.x, y: pos.y },
        { x: pos.x / dpr, y: pos.y / dpr },
      ];

      for (const { x, y } of candidates) {
        for (const zone of zones) {
          const rect = zone.getBoundingClientRect();
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
          }
        }
        const el = document.elementFromPoint(x, y);
        if (el?.closest('[data-drop-zone="true"]')) {
          return true;
        }
      }

      return false;
    };

    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") {
          const inside = isInsideDropZone(p.position);
          hoverRef.current = inside;
          setHover(inside);
        } else if (p.type === "drop") {
          const inside = hoverRef.current || isInsideDropZone(p.position);
          hoverRef.current = false;
          setHover(false);
          ref.current(p.paths, inside);
        } else {
          hoverRef.current = false;
          setHover(false);
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

  return hover;
}