import type { PaneId } from "@chestnut/core";
import { confirmAction } from "./confirm-dialog.js";
import { getT } from "./i18n/index.js";
import { planMarkdownTabRefresh, refreshConfirmIsConflict } from "./note-reload-plan.js";
import {
  emitNoteReload,
  flushNoteWriters,
  getNoteWriteSnapshot,
  registerNoteFlusher,
  resetNoteReloadForTests,
  subscribeNoteReload,
} from "./note-reload-registry.js";
import { useAppStore, vaultService, workspaceStore } from "./store.js";
import { clearNoteUnsaved, isNoteUnsaved } from "./unsaved-notes.js";

export {
  emitNoteReload,
  flushNoteWriters,
  getNoteWriteSnapshot,
  registerNoteFlusher,
  resetNoteReloadForTests,
  subscribeNoteReload,
};

async function readDiskOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await vaultService.read(path);
  } catch {
    return undefined;
  }
}

function reloadFromDisk(tabId: string, path: string): void {
  workspaceStore.setActive(tabId);
  vaultService.discardPendingWrite(path);
  clearNoteUnsaved(path);
  emitNoteReload(path);
}

/** Tab context menu: re-read Markdown from disk into the open editor. */
export async function requestRefreshMarkdownTab(tabId: string, paneId: PaneId): Promise<void> {
  const leaf = workspaceStore.getState().panes[paneId].leaves.find((l) => l.id === tabId);
  if (!leaf || leaf.type !== "markdown" || !leaf.path) return;

  const path = leaf.path;
  const t = getT();
  const saveMode = useAppStore.getState().markdownSaveMode;
  const unsaved = isNoteUnsaved(path);
  const snapshot = getNoteWriteSnapshot(path);
  const disk = await readDiskOrUndefined(path);
  const compare =
    snapshot && disk !== undefined
      ? { buffer: snapshot.buffer, lastSaved: snapshot.lastSaved, disk }
      : {};
  let plan = planMarkdownTabRefresh({ saveMode, isUnsaved: unsaved, ...compare });

  if (plan === "abort") {
    const conflict = refreshConfirmIsConflict(compare);
    const confirmed = await confirmAction({
      title: conflict ? t("tab.refreshConflictTitle") : t("tab.refreshUnsavedTitle"),
      message: conflict ? t("tab.refreshConflictMessage") : t("tab.refreshUnsavedMessage"),
      confirmLabel: t("tab.refreshUnsavedConfirm"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    plan = planMarkdownTabRefresh({
      saveMode,
      isUnsaved: unsaved,
      discardConfirmed: confirmed,
      ...compare,
    });
    if (plan === "abort") return;
  }

  if (plan === "discard-no-flush" || plan === "reload-no-flush") {
    // User chose disk (or Chestnut has nothing newer than last save) — do not write back.
    reloadFromDisk(tabId, path);
    return;
  }

  // Local edits still pending and disk is unchanged: persist debounce first.
  await flushNoteWriters(path);
  reloadFromDisk(tabId, path);
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
