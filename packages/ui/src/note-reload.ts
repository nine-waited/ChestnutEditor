import type { PaneId } from "@chestnut/core";
import { confirmAction } from "./confirm-dialog.js";
import { getT } from "./i18n/index.js";
import { useAppStore, vaultService, workspaceStore } from "./store.js";
import { clearNoteUnsaved, isNoteUnsaved } from "./unsaved-notes.js";

type NoteReloadListener = (path: string) => void;
type NoteFlusher = () => Promise<void>;

const listeners = new Set<NoteReloadListener>();
/** path → leafId → flush (editable panes only). */
const flushersByPath = new Map<string, Map<string, NoteFlusher>>();

/** Subscribe to Markdown note reload-from-disk requests (UI-only). */
export function subscribeNoteReload(listener: NoteReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNoteReload(path: string): void {
  for (const listener of listeners) listener(path);
}

/** Editable NotePane registers so view-only swaps can flush before reload. */
export function registerNoteFlusher(path: string, leafId: string, flush: NoteFlusher): () => void {
  let byLeaf = flushersByPath.get(path);
  if (!byLeaf) {
    byLeaf = new Map();
    flushersByPath.set(path, byLeaf);
  }
  byLeaf.set(leafId, flush);
  return () => {
    const map = flushersByPath.get(path);
    if (!map) return;
    map.delete(leafId);
    if (map.size === 0) flushersByPath.delete(path);
  };
}

export async function flushNoteWriters(path: string): Promise<void> {
  const map = flushersByPath.get(path);
  if (!map || map.size === 0) return;
  await Promise.all([...map.values()].map((flush) => flush()));
}

/** Tab context menu: re-read Markdown from disk into the open editor. */
export async function requestRefreshMarkdownTab(tabId: string, paneId: PaneId): Promise<void> {
  const leaf = workspaceStore.getState().panes[paneId].leaves.find((l) => l.id === tabId);
  if (!leaf || leaf.type !== "markdown" || !leaf.path) return;

  const path = leaf.path;
  const t = getT();
  const intervalDirty =
    useAppStore.getState().markdownSaveMode === "interval" && isNoteUnsaved(path);

  if (intervalDirty) {
    const confirmed = await confirmAction({
      title: t("tab.refreshUnsavedTitle"),
      message: t("tab.refreshUnsavedMessage"),
      confirmLabel: t("tab.refreshUnsavedConfirm"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    // User chose to discard the buffer — do not flush.
    workspaceStore.setActive(tabId);
    vaultService.discardPendingWrite(path);
    clearNoteUnsaved(path);
    emitNoteReload(path);
    return;
  }

  // Realtime / clean: persist debounced buffer first so reload cannot drop keystrokes.
  await flushNoteWriters(path);
  workspaceStore.setActive(tabId);
  vaultService.discardPendingWrite(path);
  clearNoteUnsaved(path);
  emitNoteReload(path);
}

/**
 * Toggle paired view-only for a split Markdown duplicate: flush writers, swap roles, reload both.
 */
export async function requestToggleMarkdownViewOnly(leafId: string, viewOnly: boolean): Promise<void> {
  const state = workspaceStore.getState();
  const leaf =
    state.panes.left.leaves.find((l) => l.id === leafId) ??
    state.panes.right.leaves.find((l) => l.id === leafId);
  if (!leaf || leaf.type !== "markdown" || !leaf.path) return;

  const path = leaf.path;
  // Flush while the current editable pane still owns the flusher / viewOnly=false.
  await flushNoteWriters(path);
  vaultService.discardPendingWrite(path);
  workspaceStore.setMarkdownViewOnly(leafId, viewOnly);
  clearNoteUnsaved(path);
  emitNoteReload(path);
}
