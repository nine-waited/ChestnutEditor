import type { Leaf, PaneId } from "@chestnut/core";
import { confirmAction } from "./confirm-dialog.js";
import { getT } from "./i18n/index.js";
import { useAppStore, workspaceStore } from "./store.js";
import { clearNoteUnsaved, isNoteUnsaved } from "./unsaved-notes.js";

function paneForLeafId(tabId: string) {
  const state = workspaceStore.getState();
  if (state.panes.left.leaves.some((l) => l.id === tabId)) return state.panes.left;
  if (state.panes.right.leaves.some((l) => l.id === tabId)) return state.panes.right;
  return null;
}

function findLeafById(id: string): Leaf | undefined {
  const state = workspaceStore.getState();
  return (
    state.panes.left.leaves.find((l) => l.id === id) ??
    state.panes.right.leaves.find((l) => l.id === id)
  );
}

function leavesNeedingCloseConfirm(leaves: Leaf[]): Leaf[] {
  if (useAppStore.getState().markdownSaveMode !== "interval") return [];
  return leaves.filter(
    (leaf) =>
      (leaf.type === "markdown" || leaf.type === "excalidraw") && isNoteUnsaved(leaf.path),
  );
}

async function confirmCloseUnsaved(leaves: Leaf[]): Promise<boolean> {
  const unsaved = leavesNeedingCloseConfirm(leaves);
  if (unsaved.length === 0) return true;

  const t = getT();
  const confirmed = await confirmAction({
    title: t("tab.closeUnsavedTitle"),
    message:
      unsaved.length === 1
        ? t("tab.closeUnsavedMessage")
        : t("tab.closeUnsavedMultipleMessage", { count: unsaved.length }),
    confirmLabel: t("tab.closeUnsavedConfirm"),
    cancelLabel: t("common.cancel"),
    danger: true,
  });
  if (!confirmed) return false;

  for (const leaf of unsaved) {
    if (leaf.path) clearNoteUnsaved(leaf.path);
  }
  return true;
}

export async function requestCloseTab(tabId: string): Promise<void> {
  const leaf = findLeafById(tabId);
  if (!(await confirmCloseUnsaved(leaf ? [leaf] : []))) return;
  workspaceStore.closeTab(tabId);
}

export async function requestCloseOtherTabs(tabId: string): Promise<void> {
  const pane = paneForLeafId(tabId);
  if (!pane) return;
  const toClose = pane.leaves.filter((l) => l.id !== tabId);
  if (!(await confirmCloseUnsaved(toClose))) return;
  workspaceStore.closeOtherTabs(tabId);
}

export async function requestCloseTabsToLeft(tabId: string): Promise<void> {
  const pane = paneForLeafId(tabId);
  if (!pane) return;
  const idx = pane.leaves.findIndex((l) => l.id === tabId);
  if (idx <= 0) return;
  if (!(await confirmCloseUnsaved(pane.leaves.slice(0, idx)))) return;
  workspaceStore.closeTabsToLeft(tabId);
}

export async function requestCloseTabsToRight(tabId: string): Promise<void> {
  const pane = paneForLeafId(tabId);
  if (!pane) return;
  const idx = pane.leaves.findIndex((l) => l.id === tabId);
  if (idx < 0 || idx >= pane.leaves.length - 1) return;
  if (!(await confirmCloseUnsaved(pane.leaves.slice(idx + 1)))) return;
  workspaceStore.closeTabsToRight(tabId);
}

export async function requestCloseAllTabs(paneId: PaneId): Promise<void> {
  const pane = workspaceStore.getState().panes[paneId];
  if (!(await confirmCloseUnsaved(pane.leaves))) return;
  workspaceStore.closeAllTabs(paneId);
}
