import type { PaneId } from "@chestnut/core";
import { confirmAction } from "./confirm-dialog.js";
import { getT } from "./i18n/index.js";
import { planMarkdownTabRefresh } from "./note-reload-plan.js";
import {
  emitNoteReload,
  flushNoteWriters,
  registerNoteFlusher,
  resetNoteReloadForTests,
  subscribeNoteReload,
} from "./note-reload-registry.js";
import { useAppStore, vaultService, workspaceStore } from "./store.js";
import { clearNoteUnsaved, isNoteUnsaved } from "./unsaved-notes.js";

export {
  emitNoteReload,
  flushNoteWriters,
  registerNoteFlusher,
  resetNoteReloadForTests,
  subscribeNoteReload,
};

/** Tab context menu: re-read Markdown from disk into the open editor. */
export async function requestRefreshMarkdownTab(tabId: string, paneId: PaneId): Promise<void> {
  const leaf = workspaceStore.getState().panes[paneId].leaves.find((l) => l.id === tabId);
  if (!leaf || leaf.type !== "markdown" || !leaf.path) return;

  const path = leaf.path;
  const t = getT();
  const saveMode = useAppStore.getState().markdownSaveMode;
  const unsaved = isNoteUnsaved(path);
  let plan = planMarkdownTabRefresh({ saveMode, isUnsaved: unsaved });

  if (plan === "abort") {
    const confirmed = await confirmAction({
      title: t("tab.refreshUnsavedTitle"),
      message: t("tab.refreshUnsavedMessage"),
      confirmLabel: t("tab.refreshUnsavedConfirm"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    plan = planMarkdownTabRefresh({
      saveMode,
      isUnsaved: unsaved,
      discardConfirmed: confirmed,
    });
    if (plan === "abort") return;
  }

  if (plan === "discard-no-flush") {
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
