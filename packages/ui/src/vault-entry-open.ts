import { isExcalidraw, isImage, isMarkdown, isPdf, type PaneId } from "@chestnut/core";
import { focusMainContent, isFileContentTab } from "./focus-main-content.js";
import { workspaceStore } from "./store.js";

export function isOpenableVaultFile(path: string): boolean {
  return isMarkdown(path) || isExcalidraw(path) || isImage(path) || isPdf(path);
}

export function openVaultEntry(
  path: string,
  opts?: { pane?: PaneId; newTab?: boolean },
): string | null {
  let id: string | undefined;
  if (isExcalidraw(path)) {
    id = workspaceStore.openExcalidraw(path, opts);
  } else if (isImage(path)) {
    id = workspaceStore.openImage(path, opts);
  } else if (isPdf(path)) {
    id = workspaceStore.openPdf(path, opts);
  } else if (isMarkdown(path)) {
    id = workspaceStore.openFile(path, opts);
  } else {
    return null;
  }
  const active = workspaceStore.getState().active;
  if (active && isFileContentTab(active.type)) focusMainContent(opts?.pane);
  return id;
}
