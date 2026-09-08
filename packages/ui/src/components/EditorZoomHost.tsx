import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n/index.js";
import { wheelShortcutMatches } from "../markdown-editor-keymap.js";
import { useAppStore } from "../store.js";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

interface EditorZoomHostProps {
  children: ReactNode;
}

function findEditorScrollEl(host: HTMLElement): HTMLElement | null {
  return (
    host.querySelector<HTMLElement>(".chestnut-live-scroll") ??
    host.querySelector<HTMLElement>(".cm-scroller")
  );
}

export function EditorZoomHost({ children }: EditorZoomHostProps) {
  const t = useT();
  const editorZoom = useAppStore((s) => s.editorZoom);
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const keyboardShortcuts = useAppStore((s) => s.keyboardShortcuts);
  const hostRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<number | null>(null);
  const hintTimer = useRef<number | null>(null);

  const showHint = useCallback((value: number) => {
    setHint(value);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 1200);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      if (!wheelShortcutMatches(event, keyboardShortcuts)) return;
      event.preventDefault();

      const prev = useAppStore.getState().editorZoom;
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      if (next === prev) return;

      const scrollEl = findEditorScrollEl(host);
      let anchorY = 0;
      let offsetY = 0;
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        offsetY = event.clientY - rect.top;
        anchorY = scrollEl.scrollTop + offsetY;
      }

      setEditorZoom(next);
      showHint(next);

      if (!scrollEl) return;
      const ratio = next / prev;
      requestAnimationFrame(() => {
        scrollEl.scrollTop = anchorY * ratio - offsetY;
      });
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [keyboardShortcuts, setEditorZoom, showHint]);

  useEffect(() => {
    return () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
    };
  }, []);

  const scale = editorZoom / 100;

  return (
    <div ref={hostRef} className="chestnut-editor-zoom-host" style={{ ["--chestnut-editor-zoom" as string]: String(scale) }}>
      {children}
      {hint !== null && (
        <div className="chestnut-editor-zoom-hint" role="status" aria-live="polite">
          {t("note.editorZoomHint", { percent: hint })}
        </div>
      )}
    </div>
  );
}
