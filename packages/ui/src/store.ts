import { create } from "zustand";
import type { VaultAdapter } from "@chestnut/core";
import {
  commandRegistry,
  EditorPaneLruHost,
  eventBus,
  metadataCache,
  searchIndex,
  vaultService,
  workspaceStore,
  writingStats,
} from "@chestnut/core";
import type { PluginApi, PluginManifest } from "@chestnut/plugin-sdk";
import { APP_VERSION } from "@chestnut/plugin-sdk";
import { PluginHost } from "@chestnut/core";
import type { RemoteConfig } from "@chestnut/storage-adapters";
import { ensureDefaultReadme } from "./default-readme.js";
import {
  appPluginResourceUrl,
  installAppPluginFromFile,
  listAppPlugins,
  uninstallAppPlugin as uninstallAppPluginDir,
  readAppPluginText,
  rememberPluginBlob,
  revokePluginBlobs,
  writeAppPluginText,
} from "./app-plugins.js";
import { isTauri } from "@chestnut/storage-adapters";
import { remapSourceEditorHistory } from "./source-editor-history-cache.js";
import {
  DEFAULT_SHORTCUTS,
  loadKeyboardShortcuts,
  loadAppKeyboardShortcuts,
  loadConfigurableEditorKeyboardShortcuts,
  applyFixedEditorShortcuts,
  isFixedEditorShortcut,
  type KeyboardShortcuts,
  type ShortcutId,
} from "./keyboard-shortcuts.js";
import { applyDocumentLang, detectLocale, type Locale } from "./i18n/messages.js";
import { SIDEBAR_WIDTH_DEFAULT, clampSidebarWidth } from "./sidebar-layout.js";
import {
  clampOutlineWidth,
  type OutlineLayouts,
  normalizeOutlineLayouts,
} from "./outline-layout.js";
import type { PaneId } from "@chestnut/core";
import { fileTreeSelection } from "./file-tree-selection.js";
import { DEFAULT_UI_FONT, applyUiFont, resolveUiFont, type UiFont } from "./ui-font.js";
import { DEFAULT_APP_THEME, applyAppTheme, resolveAppTheme, type AppTheme } from "./ui-theme.js";
import {
  isPinnableVaultFile,
  normalizePinnedFilePaths,
  remapPinnedFilePath as remapPinnedPath,
  remapPinnedFilePathPrefix as remapPinnedPrefix,
  removePinnedFilePathsUnder as removePinnedUnder,
  reorderPinnedFilePaths as reorderPinnedPaths,
} from "./file-tree-pinned.js";
import {
  type FileTreeChildOrderMap,
  fileTreeChildOrderEquals,
  normalizeFileTreeChildOrder,
  placeFileTreeChildAfterMove as placeChildAfterMove,
  remapFileTreeChildOrderPath as remapChildOrderPath,
  remapFileTreeChildOrderPrefix as remapChildOrderPrefix,
  removeFileTreeChildOrderUnder as removeChildOrderUnder,
  reorderFileTreeChildPaths,
} from "./file-tree-order.js";
import {
  fileTreeExpanded,
  normalizeFileTreeExpandedPaths,
} from "./file-tree-expanded.js";

export interface AppState {
  vaultMounted: boolean;
  vaultName: string;
  vaultKind: string;
  treeVersion: number;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  enabledPlugins: string[];
  installedPlugins: PluginManifest[];
  remoteConfig: RemoteConfig | null;
  localVaultPath: string | null;
  keyboardShortcuts: KeyboardShortcuts;
  editorZoom: number;
  locale: Locale;
  uiFont: UiFont;
  theme: AppTheme;
  deleteImageFilesOnRemove: boolean;
  keepNetworkImageLinks: boolean;
  markdownSaveMode: MarkdownSaveMode;
  statusText: string;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  outlineLayouts: OutlineLayouts;
  showNotePicFolders: boolean;
  pinnedFilePaths: string[];
  fileTreeExpandedPaths: string[];
  fileTreeChildOrder: FileTreeChildOrderMap;
  splitRatio: number;
}

export interface AppActions {
  mountVault: (adapter: VaultAdapter) => Promise<void>;
  unmountVault: () => Promise<void>;
  refreshTree: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setEnabledPlugins: (ids: string[]) => void;
  togglePluginEnabled: (id: string, enabled: boolean) => Promise<void>;
  setActivePlugin: (id: string | null) => Promise<void>;
  importAppPlugin: (file: File) => Promise<void>;
  uninstallAppPlugin: (id: string) => Promise<void>;
  refreshInstalledPlugins: () => Promise<void>;
  setRemoteConfig: (config: RemoteConfig | null) => void;
  setKeyboardShortcut: (id: ShortcutId, shortcut: string) => void;
  resetKeyboardShortcuts: () => void;
  resetAppKeyboardShortcuts: () => void;
  resetEditorKeyboardShortcuts: () => void;
  setEditorZoom: (zoom: number) => void;
  setLocale: (locale: Locale) => void;
  setUiFont: (font: UiFont) => void;
  setTheme: (theme: AppTheme) => void;
  setDeleteImageFilesOnRemove: (enabled: boolean) => void;
  setKeepNetworkImageLinks: (enabled: boolean) => void;
  setMarkdownSaveMode: (mode: MarkdownSaveMode) => void;
  setStatusText: (text: string) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setOutlineWidth: (paneId: PaneId, width: number) => void;
  setOutlineCollapsed: (paneId: PaneId, collapsed: boolean) => void;
  toggleOutlineCollapsed: (paneId: PaneId) => void;
  /** Collapse both outlines in split; expand left outline in single pane. */
  syncOutlineDefaultsForSplit: (split: boolean) => void;
  setShowNotePicFolders: (show: boolean) => void;
  toggleShowNotePicFolders: () => void;
  pinFilePath: (path: string) => void;
  pinFilePathToTop: (path: string) => void;
  unpinFilePath: (path: string) => void;
  unpinFilePaths: (paths: string[]) => void;
  togglePinnedFilePath: (path: string) => void;
  remapPinnedFilePath: (oldPath: string, newPath: string) => void;
  remapPinnedFilePathPrefix: (oldPrefix: string, newPrefix: string) => void;
  removePinnedFilePathsUnder: (path: string, isDirectory: boolean) => void;
  reorderPinnedFilePaths: (path: string, insertBeforeIndex: number) => void;
  reorderFileTreeChild: (
    parentDir: string,
    displayPaths: string[],
    path: string,
    insertBeforePath: string | null,
    pathKind: "file" | "directory",
    kindByPath: Record<string, "file" | "directory">,
  ) => void;
  placeFileTreeChildAfterMove: (
    oldPath: string,
    newPath: string,
    insertBeforePath: string | null,
    pathKind: "file" | "directory",
  ) => void;
  remapFileTreeChildOrderPath: (oldPath: string, newPath: string) => void;
  remapFileTreeChildOrderPrefix: (oldPrefix: string, newPrefix: string) => void;
  removeFileTreeChildOrderUnder: (path: string, isDirectory: boolean) => void;
  setSplitRatio: (ratio: number) => void;
}

const SETTINGS_KEY = "chestnut-app-settings";
const LEGACY_SETTINGS_KEY = "boke-app-settings";

export type MarkdownSaveMode = "realtime" | "interval";

/** Interval autosave delay when save mode is `interval` (Markdown + Excalidraw). */
export const MARKDOWN_SAVE_INTERVAL_MS = 15_000;

export function resolveMarkdownSaveMode(value: unknown): MarkdownSaveMode {
  return value === "realtime" ? "realtime" : "interval";
}

interface PersistedSettings {
  enabledPlugins?: string[];
  remoteConfig?: RemoteConfig | null;
  localVaultPath?: string | null;
  keyboardShortcuts?: Partial<KeyboardShortcuts>;
  editorZoom?: number;
  locale?: Locale;
  uiFont?: UiFont;
  theme?: AppTheme;
  deleteImageFilesOnRemove?: boolean;
  keepNetworkImageLinks?: boolean;
  markdownSaveMode?: MarkdownSaveMode;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  outlineLayouts?: OutlineLayouts;
  /** @deprecated migrated into outlineLayouts.left */
  outlineWidth?: number;
  /** @deprecated migrated into outlineLayouts.left */
  outlineCollapsed?: boolean;
  showNotePicFolders?: boolean;
  pinnedFilePaths?: string[];
  fileTreeExpandedPaths?: string[];
  fileTreeChildOrder?: FileTreeChildOrderMap;
  splitRatio?: number;
}

function loadSettings(): PersistedSettings {
  try {
    const raw =
      localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as PersistedSettings) : {};
  } catch {
    return {};
  }
}

function saveSettings(state: AppState): void {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      enabledPlugins: state.enabledPlugins,
      remoteConfig: state.remoteConfig,
      localVaultPath: state.localVaultPath,
      keyboardShortcuts: state.keyboardShortcuts,
      editorZoom: state.editorZoom,
      locale: state.locale,
      uiFont: state.uiFont,
      theme: state.theme,
      deleteImageFilesOnRemove: state.deleteImageFilesOnRemove,
      keepNetworkImageLinks: state.keepNetworkImageLinks,
      markdownSaveMode: state.markdownSaveMode,
      sidebarWidth: state.sidebarWidth,
      sidebarCollapsed: state.sidebarCollapsed,
      outlineLayouts: state.outlineLayouts,
      showNotePicFolders: state.showNotePicFolders,
      pinnedFilePaths: state.pinnedFilePaths,
      fileTreeExpandedPaths: state.fileTreeExpandedPaths,
      fileTreeChildOrder: state.fileTreeChildOrder,
      splitRatio: state.splitRatio,
    }),
  );
}

function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(0.8, Math.max(0.2, ratio));
}

const pluginHost = new PluginHost({
  buildApi: (pluginId) => buildPluginApi(pluginId),
  readPluginModule: async (pluginId, main) => {
    const code = await readAppPluginText(pluginId, main);
    const blob = new Blob([code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    rememberPluginBlob(pluginId, url);
    return (await import(/* @vite-ignore */ url)) as import("@chestnut/plugin-sdk").PluginExports;
  },
  listInstalledPlugins: async () => {
    if (!isTauri()) return [];
    return listAppPlugins();
  },
  loadPluginData: async (pluginId) => {
    try {
      const raw = await readAppPluginText(pluginId, "data.json");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  savePluginData: async (pluginId, data) => {
    await writeAppPluginText(pluginId, "data.json", JSON.stringify(data, null, 2));
  },
});

function buildPluginApi(pluginId: string): PluginApi {
  const adapter = vaultService.getAdapter();
  return {
    commands: commandRegistry,
    workspace: {
      openFile: (path, opts) => workspaceStore.openFile(path, opts),
      openExcalidraw: (path, opts) => workspaceStore.openExcalidraw(path, opts),
      openImage: (path, opts) => workspaceStore.openImage(path, opts),
      openGraph: (opts) => workspaceStore.openGraph(),
      openSettings: () => workspaceStore.openSettings(),
      getActivePath: () => workspaceStore.getActivePath(),
    },
    vault: {
      active: {
        id: adapter?.id ?? "",
        name: adapter?.name ?? "",
        kind: adapter?.kind ?? "tauri",
      },
      read: (path) => vaultService.read(path),
      write: (path, content) => vaultService.write(path, content, true),
      listMarkdown: () => vaultService.listMarkdown(),
      listAttachments: () => vaultService.listAttachments(),
    },
    metadataCache: {
      getFileCache: (path) => metadataCache.get(path),
      getBacklinks: (path) => metadataCache.getBacklinks(path),
      getAllTags: () => metadataCache.getAllTags(),
    },
    events: {
      on: (event, listener) => eventBus.on(event, listener),
    },
    stats: {
      getSnapshot: () => writingStats.getSnapshot(),
    },
    getResourceUrl: (relPath) => appPluginResourceUrl(pluginId, relPath),
    statusBar: {
      add: (opts) => {
        useAppStore.getState().setStatusText(opts?.text ?? "");
        return {
          setText: (text) => useAppStore.getState().setStatusText(text),
          setTooltip: () => {},
          setOnClick: () => {},
          remove: () => useAppStore.getState().setStatusText(""),
        };
      },
    },
    chestnut: { version: APP_VERSION },
    loadData: () => pluginHost.loadData(pluginId) as Promise<null>,
    saveData: (data) => pluginHost.saveData(pluginId, data),
    addSettingsTab: () => () => {},
    log: (...args) => console.log(`[plugin:${pluginId}]`, ...args),
  };
}

const saved = loadSettings();
if (saved.locale) {
  applyDocumentLang(saved.locale);
}
applyUiFont(resolveUiFont(saved.uiFont));
applyAppTheme(resolveAppTheme(saved.theme));

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  vaultMounted: false,
  vaultName: "",
  vaultKind: "",
  treeVersion: 0,
  commandPaletteOpen: false,
  searchOpen: false,
  enabledPlugins: saved.enabledPlugins ?? [],
  installedPlugins: [],
  remoteConfig: saved.remoteConfig ?? null,
  localVaultPath: saved.localVaultPath ?? null,
  keyboardShortcuts: loadKeyboardShortcuts(saved.keyboardShortcuts),
  editorZoom: saved.editorZoom ?? 100,
  locale: saved.locale ?? detectLocale(),
  uiFont: resolveUiFont(saved.uiFont),
  theme: resolveAppTheme(saved.theme),
  deleteImageFilesOnRemove: saved.deleteImageFilesOnRemove ?? true,
  keepNetworkImageLinks: saved.keepNetworkImageLinks ?? true,
  markdownSaveMode: resolveMarkdownSaveMode(saved.markdownSaveMode),
  statusText: "",
  sidebarWidth: clampSidebarWidth(saved.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT),
  sidebarCollapsed: saved.sidebarCollapsed ?? false,
  outlineLayouts: normalizeOutlineLayouts(saved.outlineLayouts, {
    width: saved.outlineWidth,
    collapsed: saved.outlineCollapsed,
  }),
  showNotePicFolders: saved.showNotePicFolders ?? true,
  pinnedFilePaths: normalizePinnedFilePaths(saved.pinnedFilePaths),
  fileTreeExpandedPaths: normalizeFileTreeExpandedPaths(saved.fileTreeExpandedPaths),
  fileTreeChildOrder: normalizeFileTreeChildOrder(saved.fileTreeChildOrder),
  splitRatio: clampSplitRatio(saved.splitRatio ?? 0.5),

  mountVault: async (adapter) => {
    await vaultService.mount(adapter);
    await writingStats.mount(adapter);
    const vaultAdapter = vaultService.getAdapter();
    if (vaultAdapter) {
      const created = await ensureDefaultReadme(
        (path) => vaultAdapter.exists(path),
        (path, content) => vaultService.write(path, content, true),
      );
      if (created) {
        await vaultService.reindex();
        await writingStats.mount(adapter);
      }
    }
    const localVaultPath =
      adapter.kind === "tauri" && "getRootPath" in adapter
        ? (adapter as { getRootPath: () => string }).getRootPath()
        : get().localVaultPath;
    let enabled = get().enabledPlugins.slice(0, 1);
    const installed = isTauri() ? await listAppPlugins() : [];
    for (const id of enabled) {
      try {
        const raw = await readAppPluginText(id, "manifest.json");
        const manifest = JSON.parse(raw) as import("@chestnut/plugin-sdk").PluginManifest;
        await pluginHost.enable(id, manifest);
      } catch (err) {
        console.warn(`Failed to enable plugin ${id}:`, err);
      }
    }
    set({
      vaultMounted: true,
      vaultName: adapter.name,
      vaultKind: adapter.kind,
      localVaultPath,
      enabledPlugins: enabled,
      installedPlugins: installed,
      treeVersion: get().treeVersion + 1,
    });
    saveSettings(get());
  },

  unmountVault: async () => {
    await writingStats.unmount();
    await vaultService.unmount();
    set({ vaultMounted: false, vaultName: "", vaultKind: "" });
  },

  refreshTree: () => set({ treeVersion: get().treeVersion + 1 }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setEnabledPlugins: (ids) => {
    set({ enabledPlugins: ids });
    saveSettings(get());
  },
  togglePluginEnabled: async (id, enabled) => {
    await get().setActivePlugin(enabled ? id : null);
  },
  setActivePlugin: async (id) => {
    const current = get().enabledPlugins[0] ?? null;
    const next = id && id === current ? null : id;
    for (const loaded of pluginHost.getEnabledIds()) {
      if (loaded !== next) {
        try {
          await pluginHost.disable(loaded);
        } catch (err) {
          console.warn(`Failed to unload plugin ${loaded}:`, err);
        }
        revokePluginBlobs(loaded);
      }
    }
    if (next) {
      try {
        await pluginHost.enable(next);
      } catch (err) {
        console.warn(`Failed to enable plugin ${next}:`, err);
        set({ enabledPlugins: [] });
        saveSettings(get());
        return;
      }
    }
    set({ enabledPlugins: next ? [next] : [] });
    saveSettings(get());
  },
  importAppPlugin: async (file) => {
    if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Need a .zip plugin pack");
    await installAppPluginFromFile(file);
    set({ installedPlugins: await listAppPlugins() });
  },
  uninstallAppPlugin: async (id) => {
    if (get().enabledPlugins[0] === id) {
      await get().setActivePlugin(null);
    } else if (pluginHost.isEnabled(id)) {
      try {
        await pluginHost.disable(id);
      } catch (err) {
        console.warn(`Failed to unload plugin ${id}:`, err);
      }
      revokePluginBlobs(id);
    }
    await uninstallAppPluginDir(id);
    const enabledPlugins = get().enabledPlugins.filter((item) => item !== id);
    set({
      installedPlugins: await listAppPlugins(),
      enabledPlugins,
    });
    saveSettings(get());
  },
  refreshInstalledPlugins: async () => {
    if (!isTauri()) {
      set({ installedPlugins: [] });
      return;
    }
    const installed = await listAppPlugins();
    set({ installedPlugins: installed });
    const id = get().enabledPlugins[0];
    if (id && !pluginHost.isEnabled(id)) {
      try {
        await pluginHost.enable(id);
      } catch (err) {
        console.warn(`Failed to enable plugin ${id}:`, err);
      }
    }
  },
  setRemoteConfig: (config) => {
    set({ remoteConfig: config });
    saveSettings(get());
  },
  setKeyboardShortcut: (id, shortcut) => {
    if (isFixedEditorShortcut(id)) return;
    set({
      keyboardShortcuts: applyFixedEditorShortcuts({
        ...get().keyboardShortcuts,
        [id]: shortcut,
      }),
    });
    saveSettings(get());
  },
  resetKeyboardShortcuts: () => {
    set({ keyboardShortcuts: { ...DEFAULT_SHORTCUTS } });
    saveSettings(get());
  },
  resetAppKeyboardShortcuts: () => {
    set({ keyboardShortcuts: { ...get().keyboardShortcuts, ...loadAppKeyboardShortcuts(DEFAULT_SHORTCUTS) } });
    saveSettings(get());
  },
  resetEditorKeyboardShortcuts: () => {
    set({
      keyboardShortcuts: applyFixedEditorShortcuts({
        ...get().keyboardShortcuts,
        ...loadConfigurableEditorKeyboardShortcuts(DEFAULT_SHORTCUTS),
      }),
    });
    saveSettings(get());
  },
  setEditorZoom: (zoom) => {
    const clamped = Math.min(200, Math.max(50, Math.round(zoom)));
    set({ editorZoom: clamped });
    saveSettings(get());
  },
  setLocale: (locale) => {
    set({ locale });
    applyDocumentLang(locale);
    saveSettings(get());
  },
  setUiFont: (font) => {
    set({ uiFont: font });
    applyUiFont(font);
    saveSettings(get());
  },
  setTheme: (theme) => {
    set({ theme });
    applyAppTheme(theme);
    saveSettings(get());
  },
  setDeleteImageFilesOnRemove: (enabled) => {
    set({ deleteImageFilesOnRemove: enabled });
    saveSettings(get());
  },
  setKeepNetworkImageLinks: (enabled) => {
    set({ keepNetworkImageLinks: enabled });
    saveSettings(get());
  },
  setMarkdownSaveMode: (mode) => {
    set({ markdownSaveMode: resolveMarkdownSaveMode(mode) });
    saveSettings(get());
  },
  setStatusText: (text) => set({ statusText: text }),
  setSidebarWidth: (width) => {
    set({ sidebarWidth: clampSidebarWidth(width) });
    saveSettings(get());
  },
  setSidebarCollapsed: (collapsed) => {
    if (get().sidebarCollapsed === collapsed) return;
    set({ sidebarCollapsed: collapsed });
    saveSettings(get());
  },
  toggleSidebarCollapsed: () => {
    set({ sidebarCollapsed: !get().sidebarCollapsed });
    saveSettings(get());
  },
  setOutlineWidth: (paneId, width) => {
    const nextWidth = clampOutlineWidth(width);
    const prev = get().outlineLayouts[paneId];
    if (prev.width === nextWidth) return;
    set({
      outlineLayouts: {
        ...get().outlineLayouts,
        [paneId]: { ...prev, width: nextWidth },
      },
    });
    saveSettings(get());
  },
  setOutlineCollapsed: (paneId, collapsed) => {
    const prev = get().outlineLayouts[paneId];
    if (prev.collapsed === collapsed) return;
    set({
      outlineLayouts: {
        ...get().outlineLayouts,
        [paneId]: { ...prev, collapsed },
      },
    });
    saveSettings(get());
  },
  toggleOutlineCollapsed: (paneId) => {
    const prev = get().outlineLayouts[paneId];
    set({
      outlineLayouts: {
        ...get().outlineLayouts,
        [paneId]: { ...prev, collapsed: !prev.collapsed },
      },
    });
    saveSettings(get());
  },
  syncOutlineDefaultsForSplit: (split) => {
    const layouts = get().outlineLayouts;
    if (split) {
      if (layouts.left.collapsed && layouts.right.collapsed) return;
      set({
        outlineLayouts: {
          left: { ...layouts.left, collapsed: true },
          right: { ...layouts.right, collapsed: true },
        },
      });
    } else {
      if (!layouts.left.collapsed) return;
      set({
        outlineLayouts: {
          ...layouts,
          left: { ...layouts.left, collapsed: false },
        },
      });
    }
    saveSettings(get());
  },
  setShowNotePicFolders: (show) => {
    if (get().showNotePicFolders === show) return;
    set({ showNotePicFolders: show });
    if (!show) {
      fileTreeSelection.deselectNotePicFolders();
    }
    saveSettings(get());
  },
  toggleShowNotePicFolders: () => {
    get().setShowNotePicFolders(!get().showNotePicFolders);
  },
  pinFilePath: (path) => {
    if (!isPinnableVaultFile(path)) return;
    const pinnedFilePaths = get().pinnedFilePaths;
    if (pinnedFilePaths.includes(path)) return;
    set({ pinnedFilePaths: [path, ...pinnedFilePaths] });
    saveSettings(get());
  },
  pinFilePathToTop: (path) => {
    if (!isPinnableVaultFile(path)) return;
    const pinnedFilePaths = get().pinnedFilePaths;
    if (pinnedFilePaths[0] === path) return;
    if (pinnedFilePaths.includes(path)) {
      const next = reorderPinnedPaths(pinnedFilePaths, path, 0);
      if (next.join("\0") === pinnedFilePaths.join("\0")) return;
      set({ pinnedFilePaths: next });
    } else {
      set({ pinnedFilePaths: [path, ...pinnedFilePaths] });
    }
    saveSettings(get());
  },
  unpinFilePath: (path) => {
    const pinnedFilePaths = get().pinnedFilePaths.filter((item) => item !== path);
    if (pinnedFilePaths.length === get().pinnedFilePaths.length) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  unpinFilePaths: (paths) => {
    if (paths.length === 0) return;
    if (paths.length === 1) {
      get().unpinFilePath(paths[0]!);
      return;
    }
    const remove = new Set(paths);
    const pinnedFilePaths = get().pinnedFilePaths.filter((item) => !remove.has(item));
    if (pinnedFilePaths.length === get().pinnedFilePaths.length) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  togglePinnedFilePath: (path) => {
    if (get().pinnedFilePaths.includes(path)) get().unpinFilePath(path);
    else get().pinFilePath(path);
  },
  remapPinnedFilePath: (oldPath, newPath) => {
    const pinnedFilePaths = remapPinnedPath(get().pinnedFilePaths, oldPath, newPath);
    if (pinnedFilePaths === get().pinnedFilePaths) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  remapPinnedFilePathPrefix: (oldPrefix, newPrefix) => {
    const pinnedFilePaths = remapPinnedPrefix(get().pinnedFilePaths, oldPrefix, newPrefix);
    if (pinnedFilePaths.join("\0") === get().pinnedFilePaths.join("\0")) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  removePinnedFilePathsUnder: (path, isDirectory) => {
    const pinnedFilePaths = removePinnedUnder(get().pinnedFilePaths, path, isDirectory);
    if (pinnedFilePaths.length === get().pinnedFilePaths.length) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  reorderPinnedFilePaths: (path, insertBeforeIndex) => {
    const pinnedFilePaths = reorderPinnedPaths(get().pinnedFilePaths, path, insertBeforeIndex);
    if (pinnedFilePaths === get().pinnedFilePaths) return;
    if (pinnedFilePaths.join("\0") === get().pinnedFilePaths.join("\0")) return;
    set({ pinnedFilePaths });
    saveSettings(get());
  },
  reorderFileTreeChild: (parentDir, displayPaths, path, insertBeforePath, pathKind, kindByPath) => {
    const fileTreeChildOrder = reorderFileTreeChildPaths(
      get().fileTreeChildOrder,
      parentDir,
      displayPaths,
      path,
      insertBeforePath,
      pathKind,
      kindByPath,
    );
    if (fileTreeChildOrderEquals(fileTreeChildOrder, get().fileTreeChildOrder)) return;
    set({ fileTreeChildOrder });
    saveSettings(get());
  },
  placeFileTreeChildAfterMove: (oldPath, newPath, insertBeforePath, pathKind) => {
    const fileTreeChildOrder = placeChildAfterMove(
      get().fileTreeChildOrder,
      oldPath,
      newPath,
      insertBeforePath,
      pathKind,
    );
    if (fileTreeChildOrderEquals(fileTreeChildOrder, get().fileTreeChildOrder)) return;
    set({ fileTreeChildOrder });
    saveSettings(get());
  },
  remapFileTreeChildOrderPath: (oldPath, newPath) => {
    const fileTreeChildOrder = remapChildOrderPath(get().fileTreeChildOrder, oldPath, newPath);
    if (fileTreeChildOrderEquals(fileTreeChildOrder, get().fileTreeChildOrder)) return;
    set({ fileTreeChildOrder });
    saveSettings(get());
  },
  remapFileTreeChildOrderPrefix: (oldPrefix, newPrefix) => {
    const fileTreeChildOrder = remapChildOrderPrefix(
      get().fileTreeChildOrder,
      oldPrefix,
      newPrefix,
    );
    if (fileTreeChildOrderEquals(fileTreeChildOrder, get().fileTreeChildOrder)) return;
    set({ fileTreeChildOrder });
    saveSettings(get());
  },
  removeFileTreeChildOrderUnder: (path, isDirectory) => {
    const fileTreeChildOrder = removeChildOrderUnder(
      get().fileTreeChildOrder,
      path,
      isDirectory,
    );
    if (fileTreeChildOrderEquals(fileTreeChildOrder, get().fileTreeChildOrder)) return;
    set({ fileTreeChildOrder });
    saveSettings(get());
  },
  setSplitRatio: (ratio) => {
    const splitRatio = clampSplitRatio(ratio);
    if (splitRatio === get().splitRatio) return;
    set({ splitRatio });
    saveSettings(get());
  },
}));

export const editorPaneLru = new EditorPaneLruHost();

eventBus.on("file-rename", ({ from, to }) => {
  editorPaneLru.remap(from, to);
  remapSourceEditorHistory(from, to);
});

fileTreeExpanded.hydrate(useAppStore.getState().fileTreeExpandedPaths);
fileTreeExpanded.setPersistHandler((paths) => {
  const next = normalizeFileTreeExpandedPaths(paths);
  const prev = useAppStore.getState().fileTreeExpandedPaths;
  if (
    next.length === prev.length &&
    next.every((path) => prev.includes(path)) &&
    prev.every((path) => next.includes(path))
  ) {
    return;
  }
  useAppStore.setState({ fileTreeExpandedPaths: next });
  saveSettings(useAppStore.getState());
});

export { pluginHost, commandRegistry, workspaceStore, vaultService, writingStats, metadataCache, searchIndex, eventBus };
