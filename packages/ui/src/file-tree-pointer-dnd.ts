import { normalizePath, type PaneId } from "@chestnut/core";
import {
  canDropFileTreeEntry,
  type FileTreeDragKind,
  type FileTreeDragPayload,
} from "./file-tree-move.js";
import { parentDirOfFileTreePath } from "./file-tree-order.js";
import { isPinnableVaultFile } from "./file-tree-pinned.js";
import {
  findDropTabPaneId,
  isInSplitDropZone,
} from "./tab-drop-zone.js";
import { isOpenableVaultFile } from "./vault-entry-open.js";
import { workspaceStore } from "./store.js";

export const FILE_TREE_DROP_ATTR = "data-file-tree-drop";
export const FILE_TREE_PARENT_ATTR = "data-file-tree-parent";
export const FILE_TREE_PATH_ATTR = "data-file-tree-path";
export const FILE_TREE_KIND_ATTR = "data-file-tree-kind";
export const FILE_TREE_PIN_DROP_ATTR = "data-file-tree-pin-drop";
export const FILE_TREE_ROOT_SELECTOR = ".boke-file-tree";
export const FILE_TREE_PIN_DROP_SELECTOR = `[${FILE_TREE_PIN_DROP_ATTR}]`;

export const FILE_TREE_DRAG_MOVE_PX = 6;
export const FILE_TREE_DRAG_LONG_PRESS_MS = 450;

export type FileTreeDropIntent =
  | {
      type: "reorder";
      parentDir: string;
      insertBeforePath: string | null;
      highlightBeforePath: string | null;
      highlightAfterPath: string | null;
    }
  | {
      type: "moveInto";
      targetDir: string;
      insertBeforePath: null;
      highlightBeforePath: null;
      highlightAfterPath: null;
    }
  | {
      type: "moveBefore";
      targetDir: string;
      insertBeforePath: string;
      highlightBeforePath: string;
      highlightAfterPath: null;
    }
  | { type: "pin" }
  | { type: "openTab"; pane: PaneId }
  | { type: "openSplit" }
  | { type: "invalid" };

/** Resolve folder drop target under the pointer; `""` = vault root, `null` = no valid target. */
export function findDropFolderAt(clientX: number, clientY: number): string | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const el of elements) {
    const folderItem = el.closest(`.boke-file-tree-dir[${FILE_TREE_DROP_ATTR}]`);
    if (folderItem instanceof HTMLElement) {
      return folderItem.getAttribute(FILE_TREE_DROP_ATTR) ?? "";
    }
  }

  for (const el of elements) {
    const fileItem = el.closest(`.boke-file-tree-file[${FILE_TREE_PARENT_ATTR}]`);
    if (fileItem instanceof HTMLElement) {
      return fileItem.getAttribute(FILE_TREE_PARENT_ATTR) ?? "";
    }
  }

  const root = document.querySelector(FILE_TREE_ROOT_SELECTOR);
  const top = document.elementFromPoint(clientX, clientY);
  if (root instanceof HTMLElement && top && root.contains(top)) {
    return "";
  }

  return "";
}

function findRowAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const row = el.closest(`[${FILE_TREE_PATH_ATTR}]`);
    if (row instanceof HTMLElement && row.getAttribute(FILE_TREE_PATH_ATTR)) {
      return row;
    }
  }
  return null;
}

function isTopHalf(clientY: number, el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2;
}

function siblingParentOfRow(row: HTMLElement, kind: FileTreeDragKind, path: string): string {
  if (kind === "file") {
    return normalizePath(row.getAttribute(FILE_TREE_PARENT_ATTR) ?? parentDirOfFileTreePath(path));
  }
  return parentDirOfFileTreePath(path);
}

/**
 * Resolve drop intent for file-tree pointer DnD:
 * - pinned area + pinnable file → logical pin to top
 * - same parent + same kind + top edge → logical reorder
 * - different parent + top edge on same kind → FS move + logical insert before
 * - folder body / bottom half → FS move into that folder
 */
export function resolveFileTreeDropIntent(
  clientX: number,
  clientY: number,
  payload: FileTreeDragPayload,
): FileTreeDropIntent {
  const source = normalizePath(payload.path);
  const sourceKind = payload.kind;
  const sourceParent = parentDirOfFileTreePath(source);

  // Prefer pinning when hovering the pinned area with a Markdown/Excalidraw file.
  if (sourceKind === "file" && isPinnableVaultFile(source)) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      if (el instanceof Element && el.closest(FILE_TREE_PIN_DROP_SELECTOR)) {
        return { type: "pin" };
      }
    }
  }

  // Openable files can be dropped on the tab bar or the right-edge split zone.
  if (sourceKind === "file" && isOpenableVaultFile(source)) {
    if (!workspaceStore.isSplit() && isInSplitDropZone(clientX, clientY)) {
      return { type: "openSplit" };
    }
    const tabPane = findDropTabPaneId(clientX, clientY);
    if (tabPane) {
      return { type: "openTab", pane: tabPane };
    }
  }

  const row = findRowAtPoint(clientX, clientY);
  if (row) {
    const targetPath = normalizePath(row.getAttribute(FILE_TREE_PATH_ATTR) ?? "");
    const targetKindAttr = row.getAttribute(FILE_TREE_KIND_ATTR);
    const targetKind: FileTreeDragKind | null =
      targetKindAttr === "file" || targetKindAttr === "directory" ? targetKindAttr : null;

    if (targetPath && targetKind) {
      if (targetPath === source) return { type: "invalid" };

      const top = isTopHalf(clientY, row);
      const targetSiblingParent = siblingParentOfRow(row, targetKind, targetPath);

      // Same-parent logical reorder (same kind only, top half = before).
      if (targetSiblingParent === sourceParent && top && targetKind === sourceKind) {
        return {
          type: "reorder",
          parentDir: sourceParent,
          insertBeforePath: targetPath,
          highlightBeforePath: targetPath,
          highlightAfterPath: null,
        };
      }

      // Same-parent: bottom half of same-kind item → insert after (= before next, handled as after highlight).
      if (targetSiblingParent === sourceParent && !top && targetKind === sourceKind) {
        return {
          type: "reorder",
          parentDir: sourceParent,
          insertBeforePath: null, // resolved relative to "after this" below via highlightAfter
          highlightBeforePath: null,
          highlightAfterPath: targetPath,
        };
      }

      // Cross-directory: top half on same-kind sibling in another folder → move + insert before.
      if (targetSiblingParent !== sourceParent && top && targetKind === sourceKind) {
        if (!canDropFileTreeEntry(source, sourceKind, targetSiblingParent)) {
          return { type: "invalid" };
        }
        return {
          type: "moveBefore",
          targetDir: targetSiblingParent,
          insertBeforePath: targetPath,
          highlightBeforePath: targetPath,
          highlightAfterPath: null,
        };
      }

      // Folder body / bottom half: move into this folder.
      if (targetKind === "directory" && (!top || targetKind !== sourceKind)) {
        if (!canDropFileTreeEntry(source, sourceKind, targetPath)) {
          return { type: "invalid" };
        }
        return {
          type: "moveInto",
          targetDir: targetPath,
          insertBeforePath: null,
          highlightBeforePath: null,
          highlightAfterPath: null,
        };
      }

      // Top half on opposite kind in another parent: treat folder top as enter if source is file? Prefer invalid for dir→file top.
      if (targetKind === "directory" && top && sourceKind === "file") {
        // Entering via top of folder when kinds differ — still allow move-into folder.
        if (!canDropFileTreeEntry(source, sourceKind, targetPath)) {
          return { type: "invalid" };
        }
        return {
          type: "moveInto",
          targetDir: targetPath,
          insertBeforePath: null,
          highlightBeforePath: null,
          highlightAfterPath: null,
        };
      }

      return { type: "invalid" };
    }
  }

  // Empty area / root: move into vault root when parent differs.
  const root = document.querySelector(FILE_TREE_ROOT_SELECTOR);
  const topEl = document.elementFromPoint(clientX, clientY);
  if (root instanceof HTMLElement && topEl && root.contains(topEl)) {
    if (sourceParent === "") return { type: "invalid" };
    if (!canDropFileTreeEntry(source, sourceKind, "")) return { type: "invalid" };
    return {
      type: "moveInto",
      targetDir: "",
      insertBeforePath: null,
      highlightBeforePath: null,
      highlightAfterPath: null,
    };
  }

  return { type: "invalid" };
}

/**
 * Convert "insert after path" reorder intents into insertBeforePath using sibling display order.
 */
export function normalizeReorderInsertBefore(
  intent: Extract<FileTreeDropIntent, { type: "reorder" }>,
  displayPaths: string[],
  sourcePath: string,
): string | null {
  if (intent.highlightBeforePath) return intent.highlightBeforePath;
  if (intent.highlightAfterPath) {
    const after = intent.highlightAfterPath;
    const idx = displayPaths.indexOf(after);
    if (idx < 0) return null;
    for (let i = idx + 1; i < displayPaths.length; i++) {
      if (displayPaths[i] !== sourcePath) return displayPaths[i]!;
    }
    return null;
  }
  return intent.insertBeforePath;
}

export interface FileTreePointerDragSession {
  payload: FileTreeDragPayload;
  pointerId: number;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  sourceElement: HTMLElement;
  active: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  didDrag: boolean;
}

export function createPointerDragSession(
  payload: FileTreeDragPayload,
  pointerId: number,
  clientX: number,
  clientY: number,
  sourceElement: HTMLElement,
): FileTreePointerDragSession {
  return {
    payload,
    pointerId,
    startX: clientX,
    startY: clientY,
    lastClientX: clientX,
    lastClientY: clientY,
    sourceElement,
    active: false,
    longPressTimer: null,
    didDrag: false,
  };
}

export function pointerDragMovedEnough(
  session: FileTreePointerDragSession,
  clientX: number,
  clientY: number,
): boolean {
  const dx = clientX - session.startX;
  const dy = clientY - session.startY;
  return Math.hypot(dx, dy) >= FILE_TREE_DRAG_MOVE_PX;
}
