import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { eventBus, useAppStore, vaultService, MARKDOWN_SAVE_INTERVAL_MS } from "../store.js";
import { useT } from "../i18n/index.js";
import { parseExcalidrawFile, serializeExcalidrawScene } from "../excalidraw-persist.js";
import { setNoteUnsaved } from "../unsaved-notes.js";
import { SaveStatusBadge, type SaveIndicator } from "./SaveStatusBadge.js";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

const Excalidraw = lazy(() =>
  Promise.all([
    import("@excalidraw/excalidraw"),
    import("@excalidraw/excalidraw/index.css"),
  ]).then(([m]) => ({ default: m.Excalidraw })),
);

interface ExcalidrawViewProps {
  path: string;
}

type SceneSnapshot = {
  path: string;
  elements: readonly unknown[];
  appState: unknown;
  files: unknown;
};

function serializeScene(scene: Pick<SceneSnapshot, "elements" | "appState" | "files">): string {
  return serializeExcalidrawScene(scene.elements, scene.appState, scene.files);
}

export function ExcalidrawView({ path }: ExcalidrawViewProps) {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const locale = useAppStore((s) => s.locale);
  const saveMode = useAppStore((s) => s.markdownSaveMode);
  /** Only set when `initialData` belongs to this exact vault path. */
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveIndicator>("saved");

  const latestScene = useRef<SceneSnapshot | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef(path);
  const readyPathRef = useRef<string | null>(null);
  const lastSavedRef = useRef("");
  const scheduledSaveRef = useRef("");
  const pendingSaveKindRef = useRef<"manual" | "auto">("auto");
  const saveStatusRef = useRef(saveStatus);
  const baselinedRef = useRef(false);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  pathRef.current = path;
  readyPathRef.current = readyPath;
  saveStatusRef.current = saveStatus;

  const clearRealtimeTimer = () => {
    if (realtimeTimer.current) {
      clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
    }
  };

  const writeScene = useCallback(async (scene: SceneSnapshot, immediate: boolean) => {
    if (vaultService.isWriteSuppressed(scene.path)) return;
    const payload = serializeScene(scene);
    scheduledSaveRef.current = payload;
    await vaultService.write(scene.path, payload, immediate);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReadyPath(null);
    setInitialData(null);
    setSaveStatus("saved");
    latestScene.current = null;
    lastSavedRef.current = "";
    scheduledSaveRef.current = "";
    baselinedRef.current = false;
    clearRealtimeTimer();

    void vaultService.read(path).then((raw) => {
      if (cancelled) return;
      setInitialData(parseExcalidrawFile(raw));
      setReadyPath(path);
    });

    return () => {
      cancelled = true;
      clearRealtimeTimer();
      const pending = latestScene.current;
      latestScene.current = null;
      if (!pending || pending.path !== path) return;
      const payload = serializeScene(pending);
      if (payload === lastSavedRef.current) return;
      pendingSaveKindRef.current = "auto";
      scheduledSaveRef.current = payload;
      void vaultService.write(path, payload, true);
    };
  }, [path]);

  useEffect(() => {
    const unsub = eventBus.on("file-save", ({ path: savedPath }) => {
      if (savedPath !== path) return;
      const current = latestScene.current ? serializeScene(latestScene.current) : scheduledSaveRef.current;
      if (current !== scheduledSaveRef.current) return;
      lastSavedRef.current = current;
      const kind = pendingSaveKindRef.current;
      pendingSaveKindRef.current = "auto";
      setSaveStatus(kind === "manual" ? "saved" : "autosaved");
    });
    return unsub;
  }, [path]);

  useEffect(() => {
    if (saveMode !== "interval") {
      setNoteUnsaved(path, false);
      return;
    }
    setNoteUnsaved(path, saveStatus === "dirty");
  }, [path, saveStatus, saveMode]);

  useEffect(() => {
    const tracked = path;
    return () => setNoteUnsaved(tracked, false);
  }, [path]);

  useEffect(() => {
    if (saveMode === "realtime") return;
    clearRealtimeTimer();
  }, [saveMode]);

  useEffect(() => {
    if (saveMode !== "interval") return;
    const timer = window.setInterval(() => {
      if (saveStatusRef.current !== "dirty") return;
      const scene = latestScene.current;
      if (!scene || scene.path !== path) return;
      if (vaultService.isWriteSuppressed(path)) return;
      const payload = serializeScene(scene);
      if (payload === lastSavedRef.current) return;
      pendingSaveKindRef.current = "auto";
      void writeScene(scene, true);
    }, MARKDOWN_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [saveMode, path, writeScene]);

  const saveNow = useCallback(
    (kind: "manual" | "auto" = "manual") => {
      const scene = latestScene.current;
      if (!scene || scene.path !== pathRef.current) return;
      clearRealtimeTimer();
      pendingSaveKindRef.current = kind;
      if (kind === "manual") {
        const payload = serializeScene(scene);
        lastSavedRef.current = payload;
        scheduledSaveRef.current = payload;
        setSaveStatus("saved");
      }
      void writeScene(scene, true);
    },
    [writeScene],
  );

  const scheduleSave = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const currentPath = pathRef.current;
      if (readyPathRef.current !== currentPath) return;

      const scene: SceneSnapshot = { path: currentPath, elements, appState, files };
      latestScene.current = scene;
      const payload = serializeScene(scene);

      // First onChange after load is Excalidraw's mount baseline — not a user edit.
      if (!baselinedRef.current) {
        baselinedRef.current = true;
        lastSavedRef.current = payload;
        scheduledSaveRef.current = payload;
        setSaveStatus("saved");
        return;
      }

      const dirty = payload !== lastSavedRef.current;
      setSaveStatus(dirty ? "dirty" : "saved");
      if (!dirty || vaultService.isWriteSuppressed(currentPath)) return;

      if (saveMode === "realtime") {
        pendingSaveKindRef.current = "auto";
        clearRealtimeTimer();
        realtimeTimer.current = setTimeout(() => {
          realtimeTimer.current = null;
          const latest = latestScene.current;
          if (!latest || latest.path !== currentPath) return;
          void writeScene(latest, true);
        }, 600);
      }
    },
    [saveMode, writeScene],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      if (!wrapRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      saveNow("manual");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [saveNow]);

  if (!initialData || readyPath !== path) {
    return <div style={{ padding: 24, color: "var(--boke-text-muted)" }}>{t("excalidraw.loading")}</div>;
  }

  const fileName = path.split("/").pop() ?? path;

  return (
    <div ref={wrapRef} className="boke-excalidraw-wrap" tabIndex={-1}>
      <SaveStatusBadge status={saveStatus} saveMode={saveMode} />
      <Suspense fallback={<div style={{ padding: 24 }}>{t("excalidraw.loadingApp")}</div>}>
        <Excalidraw
          key={`${path}-${theme}-${locale}`}
          name={fileName}
          theme={theme}
          langCode={locale}
          initialData={initialData}
          onChange={(elements, appState, files) => scheduleSave(elements, appState, files)}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              export: { saveFileToDisk: false },
            },
          }}
        />
      </Suspense>
    </div>
  );
}
