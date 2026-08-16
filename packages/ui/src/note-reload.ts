import type { PaneId } from "@chestnut/core";
import { confirmAction } from "./confirm-dialog.js";
import { getT } from "./i18n/index.js";
import { useAppStore, vaultService, workspaceStore } from "./store.js";
import { clearNoteUnsaved, isNoteUnsaved } from "./unsaved-notes.js";

type NoteReloadListener = (path: string) => void;

const listeners = new Set<NoteReloadListener>();

/** Subscribe to Markdown note reload-from-disk requests (UI-only). */
export function subscribeNoteReload(listener: NoteReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNoteReload(path: string): void {
  for (const listener of listeners) listener(path);
}

/** Tab context menu: re-read Markdown from disk into the open editor. */
export async function requestRefreshMarkdownTab(tabId: string, paneId: PaneId): Promise<void> {
  const leaf = workspaceStore.getState().panes[paneId].leaves.find((l) => l.id === tabId);
  if (!leaf || leaf.type !== "markdown" || !leaf.path) return;

  const path = leaf.path;
  const t = getT();

  if (useAppStore.getState().markdownSaveMode === "interval" && isNoteUnsaved(path)) {
    const confirmed = await confirmAction({
      title: t("tab.refreshUnsavedTitle"),
      message: t("tab.refreshUnsavedMessage"),
      confirmLabel: t("tab.refreshUnsavedConfirm"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!confirmed) return;
  }

  workspaceStore.setActive(tabId);
  vaultService.discardPendingWrite(path);
  clearNoteUnsaved(path);
  emitNoteReload(path);
}
