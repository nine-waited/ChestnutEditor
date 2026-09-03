import {
  useSyncExternalStore,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useMemo,
  useCallback,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isTauri, TauriFsAdapter } from "@chestnut/storage-adapters";
import type { Leaf, LeafMode, PaneId } from "@chestnut/core";
import { normalizeLeafMode, resolvePaneMarkdownMountPaths } from "@chestnut/core";
import { TabBar } from "./components/TabBar.js";
import { FileTree } from "./components/FileTree.js";
import { FileTreeExpandProvider } from "./file-tree-expand-context.js";
import { SidebarNav } from "./components/SidebarNav.js";
import { SidebarBoundaryControl } from "./components/SidebarBoundaryControl.js";
import { NotePane } from "./components/NotePane.js";
import { ImageView } from "./components/ImageView.js";
import { PdfView } from "./components/PdfView.js";
import { GraphView } from "./components/GraphView.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { PublishPanel } from "./components/PublishPanel.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { SearchPanel } from "./components/SearchPanel.js";
import { GlobalKeyboardShortcuts } from "./components/GlobalKeyboardShortcuts.js";
import { ToolbarVaultPath } from "./components/ToolbarVaultPath.js";
import { openStartupDebugPanel, logStartup } from "./startup-debug.js";
import { CHESTNUT_APP_VERSION } from "./app-version.js";
import { ToolbarIconButton } from "./components/ToolbarIconButton.js";
import { ToolbarAlwaysOnTopButton } from "./components/ToolbarAlwaysOnTopButton.js";
import { ToolbarSplitButton } from "./components/ToolbarSplitButton.js";
import { ToolbarImportMarkdownButton } from "./components/ToolbarImportMarkdownButton.js";
import { ToolbarCheckUpdateButton } from "./components/ToolbarCheckUpdateButton.js";
import { QuickOpenIcon, SearchIcon, SettingsIcon, DebugIcon } from "./icons/toolbar-icons.js";
import { formatShortcutLabel } from "./keyboard-shortcuts.js";
import { useT } from "./i18n/index.js";
import {
  useAppStore,
  workspaceStore,
  vaultService,
  commandRegistry,
  editorPaneLru,
} from "./store.js";
import { clearSourceEditorHistory } from "./source-editor-history-cache.js";
import { registerCoreCommands } from "./commands.js";
import { ConfirmDialogHost } from "./confirm-dialog.js";
import { ExportProgressHost } from "./export-progress.js";
import { UpdateCheckDialogHost } from "./update-check-dialog.js";
import { restoreTreeFocusFromEditor } from "./file-tree-expand-context.js";
import { useMarkdownFileDropImport } from "./markdown-drop-import.js";

const ExcalidrawView = lazy(() =>
  import("./components/ExcalidrawView.js").then((m) => ({ default: m.ExcalidrawView })),
);

let commandsRegistered = false;

interface EditorMountSnapshot {
  activeId: string;
  activeType: Leaf["type"] | undefined;
  activePath: string | null;
  markdownLeaves: Leaf[];
  markdownKey: string;
  lruKey: string;
  otherMarkdownKey: string;
  paneKey: string;
}

const cachedEditorMountByPane = new Map<PaneId, EditorMountSnapshot>();

function otherPaneId(paneId: PaneId): PaneId {
  return paneId === "left" ? "right" : "left";
}

function markdownOpenPaths(paneId: PaneId): string[] {
  return workspaceStore
    .getState()
    .panes[paneId].leaves.filter((leaf) => leaf.type === "markdown" && leaf.path)
    .map((leaf) => leaf.path!);
}

function getEditorMountSnapshot(paneId: PaneId): EditorMountSnapshot {
  const state = workspaceStore.getState();
  const pane = state.panes[paneId];
  const markdownLeaves = pane.leaves.filter((leaf) => leaf.type === "markdown" && leaf.path);
  const markdownKey = markdownLeaves
    .map((leaf) => `${leaf.path}\0${normalizeLeafMode(leaf.mode)}\0${leaf.viewOnly ? 1 : 0}`)
    .join("\n");
  const paneLru = editorPaneLru.forPane(paneId);
  const lruKey = paneLru.getSnapshot().join("\n");
  const otherMarkdownKey = markdownOpenPaths(otherPaneId(paneId)).join("\n");
  const activePath = pane.active?.path ?? null;
  const activeType = pane.active?.type;
  const paneKey = `${pane.activeId}\0${activeType}\0${activePath}`;
  const prev = cachedEditorMountByPane.get(paneId) ?? null;
  if (
    prev &&
    prev.activeId === pane.activeId &&
    prev.activeType === activeType &&
    prev.activePath === activePath &&
    prev.markdownKey === markdownKey &&
    prev.lruKey === lruKey &&
    prev.otherMarkdownKey === otherMarkdownKey &&
    prev.paneKey === paneKey
  ) {
    return prev;
  }
  const next: EditorMountSnapshot = {
    activeId: pane.activeId,
    activeType,
    activePath,
    markdownLeaves,
    markdownKey,
    lruKey,
    otherMarkdownKey,
    paneKey,
  };
  cachedEditorMountByPane.set(paneId, next);
  return next;
}

function subscribeEditorMount(onStoreChange: () => void): () => void {
  const unsubWs = workspaceStore.subscribe(onStoreChange);
  const unsubLru = editorPaneLru.subscribe(onStoreChange);
  return () => {
    unsubWs();
    unsubLru();
  };
}

function EditorContent({ paneId }: { paneId: PaneId }) {
  const t = useT();
  const mount = useSyncExternalStore(subscribeEditorMount, () => getEditorMountSnapshot(paneId));
  const vaultMounted = useAppStore((s) => s.vaultMounted);

  const lastModeByPathRef = useRef(new Map<string, LeafMode>());
  const loggedLoadingRef = useRef(false);
  for (const leaf of mount.markdownLeaves) {
    if (leaf.path) {
      lastModeByPathRef.current.set(leaf.path, normalizeLeafMode(leaf.mode));
    }
  }

  useEffect(() => {
    if (mount.activeType === "markdown" && mount.activePath) {
      editorPaneLru.forPane(paneId).touch(mount.activePath);
    }
  }, [mount.activeId, mount.activeType, mount.activePath, paneId]);

  useEffect(() => {
    if (vaultMounted) return;
    editorPaneLru.clear();
    clearSourceEditorHistory();
  }, [vaultMounted]);

  const leafByPath = useMemo(() => {
    const map = new Map<string, Leaf>();
    for (const leaf of mount.markdownLeaves) {
      if (leaf.path) map.set(leaf.path, leaf);
    }
    return map;
  }, [mount.markdownLeaves]);

  if (!vaultMounted) {
    if (!loggedLoadingRef.current) {
      loggedLoadingRef.current = true;
      logStartup("dom: vault loading screen painted");
    }
    return <div className="boke-vault-loading">{t("vault.loading")}</div>;
  }

  if (!mount.activeType || mount.activeType === "empty") {
    return <div className="boke-editor-blank" aria-hidden="true" />;
  }

  const activeMarkdownPath = mount.activeType === "markdown" ? mount.activePath : null;
  const ownLeafPaths = mount.markdownLeaves.map((leaf) => leaf.path!);
  const mountPaths = resolvePaneMarkdownMountPaths({
    ownLeafPaths,
    lruPaths: editorPaneLru.forPane(paneId).resolveMountPaths(activeMarkdownPath),
    otherPaneOpenPaths: markdownOpenPaths(otherPaneId(paneId)),
  });
  const markdownVisible = mount.activeType === "markdown";

  let nonMarkdown: ReactNode = null;
  switch (mount.activeType) {
    case "markdown":
      break;
    case "excalidraw":
      nonMarkdown = mount.activePath ? (
        <Suspense fallback={<div style={{ padding: 24 }}>{t("excalidraw.loadingApp")}</div>}>
          <ExcalidrawView key={mount.activePath} path={mount.activePath} />
        </Suspense>
      ) : null;
      break;
    case "image":
      nonMarkdown = mount.activePath ? <ImageView path={mount.activePath} /> : null;
      break;
    case "pdf":
      nonMarkdown = mount.activePath ? <PdfView path={mount.activePath} /> : null;
      break;
    case "graph":
      nonMarkdown = <GraphView />;
      break;
    case "settings":
      nonMarkdown = <SettingsPanel />;
      break;
    case "publish":
      nonMarkdown = <PublishPanel />;
      break;
    default:
      nonMarkdown = null;
  }

  return (
    <>
      {mountPaths.length > 0 && (
        <div
          className="boke-markdown-shell"
          hidden={!markdownVisible}
          aria-hidden={!markdownVisible}
        >
          {mountPaths.map((path) => {
            const leaf = leafByPath.get(path);
            const isActive = markdownVisible && mount.activePath === path;
            const mode = leaf
              ? normalizeLeafMode(leaf.mode)
              : (lastModeByPathRef.current.get(path) ?? "live");
            return (
              <div
                key={path}
                className={`boke-note-pane-slot${isActive ? " is-active" : ""}`}
                aria-hidden={!isActive}
              >
                <NotePane
                  path={path}
                  mode={mode}
                  leafId={leaf?.id ?? `parked:${path}`}
                  paneId={paneId}
                  isActive={isActive}
                  viewOnly={Boolean(leaf?.viewOnly)}
                />
              </div>
            );
          })}
        </div>
      )}
      {nonMarkdown}
    </>
  );
}

function EditorColumn({ paneId }: { paneId: PaneId }) {
  const focusedPane = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getState().focusedPane,
  );
  const split = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getState().split,
  );
  const isFocused = !split || focusedPane === paneId;

  return (
    <div
      className={`boke-editor-pane${isFocused ? " is-focused" : ""}`}
      data-pane={paneId}
      onMouseDownCapture={() => workspaceStore.setFocusedPane(paneId)}
    >
      <TabBar paneId={paneId} />
      <div
        className="boke-content"
        data-pane={paneId}
        tabIndex={-1}
        onMouseDownCapture={() => restoreTreeFocusFromEditor(paneId)}
        onFocusCapture={() => restoreTreeFocusFromEditor(paneId)}
      >
        <EditorContent paneId={paneId} />
      </div>
    </div>
  );
}

function SplitResizeHandle() {
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const area = handle.parentElement;
      if (!area) return;
      dragging.current = true;
      handle.setPointerCapture(event.pointerId);

      const onMove = (e: PointerEvent) => {
        if (!dragging.current) return;
        const rect = area.getBoundingClientRect();
        if (rect.width <= 0) return;
        setSplitRatio((e.clientX - rect.left) / rect.width);
      };
      const onUp = (e: PointerEvent) => {
        dragging.current = false;
        handle.releasePointerCapture(e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSplitRatio],
  );

  return (
    <div
      className="boke-split-resize-handle"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
    />
  );
}

export function App() {
  const t = useT();
  const vaultMounted = useAppStore((s) => s.vaultMounted);
  const locale = useAppStore((s) => s.locale);
  const mountVault = useAppStore((s) => s.mountVault);
  const localVaultPath = useAppStore((s) => s.localVaultPath);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const statusText = useAppStore((s) => s.statusText);
  const keyboardShortcuts = useAppStore((s) => s.keyboardShortcuts);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const syncOutlineDefaultsForSplit = useAppStore((s) => s.syncOutlineDefaultsForSplit);
  const autoMountStarted = useRef(false);
  const loggedAppRender = useRef(false);
  useMarkdownFileDropImport();
  if (!loggedAppRender.current) {
    loggedAppRender.current = true;
    logStartup("dom: App first render");
  }
  const split = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getState().split,
  );
  const wasSplitRef = useRef(split);

  useEffect(() => {
    if (wasSplitRef.current && !split) {
      syncOutlineDefaultsForSplit(false);
    }
    wasSplitRef.current = split;
  }, [split, syncOutlineDefaultsForSplit]);

  useEffect(() => {
    if (!commandsRegistered) {
      registerCoreCommands();
      commandsRegistered = true;
    }
  }, []);

  useEffect(() => {
    registerCoreCommands();
  }, [locale]);

  useEffect(() => {
    if (!isTauri() || vaultMounted || autoMountStarted.current) return;
    autoMountStarted.current = true;
    logStartup("app: auto-mount start", localVaultPath ?? "(default ~/.chestnut)");
    (async () => {
      try {
        const adapter = localVaultPath
          ? new TauriFsAdapter(localVaultPath)
          : await TauriFsAdapter.default();
        logStartup("app: adapter ready", adapter.getRootPath());
        await mountVault(adapter);
        logStartup("app: auto-mount finished");
      } catch (err) {
        console.error("Failed to open default vault:", err);
        logStartup("app: auto-mount failed", err instanceof Error ? err.message : String(err), "error");
        autoMountStarted.current = false;
      }
    })();
  }, [vaultMounted, localVaultPath, mountVault]);

  return (
    <div
      className={`boke-app${sidebarCollapsed ? " boke-app--sidebar-collapsed" : ""}`}
      style={
        {
          "--boke-sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <div className={`boke-toolbar${vaultMounted ? " boke-toolbar--vault-mounted" : ""}`}>
        <div className="boke-toolbar-side">
          <div className="boke-toolbar-leading">
            <div className="boke-toolbar-brand-group">
              <span className="boke-toolbar-brand">Chestnut</span>
              <span className="boke-toolbar-version">v{CHESTNUT_APP_VERSION}</span>
            </div>
            <ToolbarVaultPath />
          </div>
        </div>
        <div className="boke-toolbar-center">
          <div className="boke-toolbar-actions">
            <ToolbarIconButton
              label={t("toolbar.quickOpenTooltip", {
                shortcut: formatShortcutLabel(keyboardShortcuts["quick-open"]),
              })}
              onClick={() => setCommandPaletteOpen(true)}
            >
              <QuickOpenIcon />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("toolbar.searchTooltip", {
                shortcut: formatShortcutLabel(keyboardShortcuts.search),
              })}
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("toolbar.settingsTooltip")}
              onClick={() => commandRegistry.run("chestnut:open-settings")}
            >
              <SettingsIcon />
            </ToolbarIconButton>
            <ToolbarImportMarkdownButton />
            <ToolbarAlwaysOnTopButton />
            <ToolbarSplitButton />
          </div>
        </div>
        <div className="boke-toolbar-end">
          <ToolbarCheckUpdateButton />
          <ToolbarIconButton
            label={t("toolbar.startupDebugTooltip")}
            onClick={() => openStartupDebugPanel()}
          >
            <DebugIcon />
          </ToolbarIconButton>
        </div>
      </div>

      <div className="boke-main">
        {vaultMounted && (
          <div className={`boke-sidebar-shell${sidebarCollapsed ? " is-collapsed" : ""}`}>
            <div className="boke-sidebar-panel">
              <aside className="boke-sidebar">
                <FileTreeExpandProvider>
                  <SidebarNav />
                  <div className="boke-sidebar-content">
                    <FileTree />
                  </div>
                </FileTreeExpandProvider>
              </aside>
            </div>
            <SidebarBoundaryControl
              collapsed={sidebarCollapsed}
              width={sidebarWidth}
              onWidthChange={setSidebarWidth}
              onToggleCollapsed={toggleSidebarCollapsed}
            />
          </div>
        )}

        <div
          className={`boke-editor-area${split ? " is-split" : ""}`}
          style={
            split
              ? ({
                  gridTemplateColumns: `${splitRatio}fr 5px ${1 - splitRatio}fr`,
                } as CSSProperties)
              : undefined
          }
        >
          {vaultMounted ? (
            split ? (
              <>
                <EditorColumn paneId="left" />
                <SplitResizeHandle />
                <EditorColumn paneId="right" />
              </>
            ) : (
              <EditorColumn paneId="left" />
            )
          ) : (
            <div className="boke-content" tabIndex={-1}>
              <EditorContent paneId="left" />
            </div>
          )}
        </div>
      </div>

      <div className="boke-statusbar">{statusText || t("status.ready")}</div>

      <CommandPalette />
      <SearchPanel />
      <ConfirmDialogHost />
      <ExportProgressHost />
      <UpdateCheckDialogHost />
      <GlobalKeyboardShortcuts />
    </div>
  );
}

export { useAppStore, vaultService, workspaceStore, commandRegistry } from "./store.js";
