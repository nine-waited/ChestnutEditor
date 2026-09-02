import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { eventBus, useAppStore, vaultService, MARKDOWN_SAVE_INTERVAL_MS } from "../store.js";
import { useT } from "../i18n/index.js";
import { parseExcalidrawFile, serializeExcalidrawScene } from "../excalidraw-persist.js";
import { loadExcalidrawModule } from "../excalidraw-loader.js";
import { setNoteUnsaved } from "../unsaved-notes.js";
import { SaveStatusBadge, type SaveIndicator } from "./SaveStatusBadge.js";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

const Excalidraw = lazy(() =>
  loadExcalidrawModule().then((mod) => ({ default: mod.Excalidraw })),
);

/**
 * Excalidraw 0.18 switches to mobile chrome under ~730px editor width (common in
 * split panes). `useApp` is not a public export, so locate the App instance via
 * the React fiber and pin the desktop breakpoint.
 */
type ExcalidrawAppHost = {
  isMobileBreakpoint: (width: number, height: number) => boolean;
  refreshEditorBreakpoints: () => boolean | void;
  refreshViewportBreakpoints: () => boolean | void;
  setState: (state: Record<string, never>) => void;
};

function findExcalidrawAppHost(fromEl: HTMLElement): ExcalidrawAppHost | null {
  const fiberKey = Object.keys(fromEl).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let fiber: { stateNode?: unknown; return: unknown } | null = (
    fromEl as unknown as Record<string, unknown>
  )[fiberKey] as { stateNode?: unknown; return: unknown } | null;

  while (fiber) {
    const node = fiber.stateNode as ExcalidrawAppHost | null | undefined;
    if (
      node &&
      typeof node.isMobileBreakpoint === "function" &&
      typeof node.refreshEditorBreakpoints === "function" &&
      typeof node.setState === "function"
    ) {
      return node;
    }
    fiber = fiber.return as typeof fiber;
  }
  return null;
}

function pinExcalidrawDesktopUi(root: HTMLElement): (() => void) | null {
  const host = findExcalidrawAppHost(root);
  if (!host) return null;
  const previous = host.isMobileBreakpoint.bind(host);
  host.isMobileBreakpoint = () => false;
  host.refreshEditorBreakpoints();
  host.refreshViewportBreakpoints?.();
  host.setState({});
  return () => {
    host.isMobileBreakpoint = previous;
  };
}

interface ExcalidrawViewProps {
  path: string;
}

type SceneSnapshot = {
  path: string;
  elements: readonly unknown[];
  appState: unknown;
  files: unknown;
};

async function serializeScene(scene: Pick<SceneSnapshot, "elements" | "appState" | "files">): Promise<string> {
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

  const writeScene = useCallback(
    async (scene: SceneSnapshot, immediate: boolean, overwriteExternal = false) => {
      if (vaultService.isWriteSuppressed(scene.path)) return;
      const payload = await serializeScene(scene);
      scheduledSaveRef.current = payload;
      await vaultService.write(scene.path, payload, immediate, { overwriteExternal });
    },
    [],
  );

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

    void vaultService.read(path).then(async (raw) => {
      if (cancelled) return;
      vaultService.rememberLoaded(path, raw);
      const data = await parseExcalidrawFile(raw);
      if (cancelled) return;
      setInitialData(data);
      setReadyPath(path);
    });

    return () => {
      cancelled = true;
      clearRealtimeTimer();
      const pending = latestScene.current;
      latestScene.current = null;
      if (!pending || pending.path !== path) return;
      void serializeScene(pending).then((payload) => {
        if (payload === lastSavedRef.current) return;
        pendingSaveKindRef.current = "auto";
        scheduledSaveRef.current = payload;
        void writeScene({ path, elements: pending.elements, appState: pending.appState, files: pending.files }, true, false);
      });
    };
  }, [path]);

  useEffect(() => {
    const unsub = eventBus.on("file-save", ({ path: savedPath }) => {
      if (savedPath !== path) return;
      void (async () => {
        const current = latestScene.current
          ? await serializeScene(latestScene.current)
          : scheduledSaveRef.current;
        if (current !== scheduledSaveRef.current) return;
        lastSavedRef.current = current;
        const kind = pendingSaveKindRef.current;
        pendingSaveKindRef.current = "auto";
        setSaveStatus(kind === "manual" ? "saved" : "autosaved");
      })();
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
      void serializeScene(scene).then((payload) => {
        if (payload === lastSavedRef.current) return;
        pendingSaveKindRef.current = "auto";
        void writeScene(scene, true, false);
      });
    }, MARKDOWN_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [saveMode, path, writeScene]);

  useLayoutEffect(() => {
    if (!initialData || readyPath !== path) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    let cancelled = false;
    let restore: (() => void) | null = null;

    const tryPin = (): boolean => {
      if (cancelled || restore) return restore != null;
      const root = wrap.querySelector(".excalidraw");
      if (!(root instanceof HTMLElement)) return false;
      restore = pinExcalidrawDesktopUi(root);
      return restore != null;
    };

    if (tryPin()) {
      return () => {
        cancelled = true;
        restore?.();
      };
    }

    const observer = new MutationObserver(() => {
      if (tryPin()) observer.disconnect();
    });
    observer.observe(wrap, { childList: true, subtree: true });
    const raf = requestAnimationFrame(() => {
      if (tryPin()) observer.disconnect();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      restore?.();
    };
  }, [initialData, readyPath, path, theme, locale]);

  const saveNow = useCallback(
    (kind: "manual" | "auto" = "manual") => {
      const scene = latestScene.current;
      if (!scene || scene.path !== pathRef.current) return;
      clearRealtimeTimer();
      pendingSaveKindRef.current = kind;
      void serializeScene(scene).then((payload) => {
        const dirty = payload !== lastSavedRef.current;
        lastSavedRef.current = payload;
        scheduledSaveRef.current = payload;
        if (kind === "manual") {
          setSaveStatus("saved");
        }
        void writeScene(scene, true, kind === "manual" && dirty);
      });
    },
    [writeScene],
  );

  const scheduleSave = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const currentPath = pathRef.current;
      if (readyPathRef.current !== currentPath) return;

      const scene: SceneSnapshot = { path: currentPath, elements, appState, files };
      latestScene.current = scene;

      void serializeScene(scene).then((payload) => {
        if (readyPathRef.current !== currentPath) return;

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
            void writeScene(latest, true, false);
          }, 600);
        }
      });
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
