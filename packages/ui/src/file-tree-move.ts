import { fileTreeSelection } from "./file-tree-selection.js";
import {
  isExportTargetFolder,
  isInExportTargetFolder,
  isInNotePicFolder,
  isNotePicFolder,
  normalizePath,
} from "@chestnut/core";

export type FileTreeDragKind = "file" | "directory";

function parentDir(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

export function canDragFileTreeEntry(path: string, kind: FileTreeDragKind): boolean {
  const normalized = normalizePath(path);
  if (kind === "directory") {
    if (isNotePicFolder(normalized) || isExportTargetFolder(normalized)) return false;
  }
  if (isInNotePicFolder(normalized) || isInExportTargetFolder(normalized)) return false;
  return true;
}

export function canDropFileTreeEntry(
  sourcePath: string,
  sourceKind: FileTreeDragKind,
  targetDir: string,
): boolean {
  const source = normalizePath(sourcePath);
  const target = normalizePath(targetDir);
  if (target && (isInNotePicFolder(target) || isInExportTargetFolder(target))) return false;
  if (sourceKind === "directory") {
    if (target === source || target.startsWith(`${source}/`)) return false;
  }
  // Real FS move requires a different parent directory.
  return parentDir(source) !== target;
}

/** Drop nested paths when an ancestor folder is also selected. */
export function pruneNestedVaultEntries<T extends FileTreeDragEntry>(entries: T[]): T[] {
  const sorted = [...entries].sort(
    (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
  );
  const kept: T[] = [];
  for (const entry of sorted) {
    const underKept = kept.some(
      (parent) =>
        parent.kind === "directory" &&
        (entry.path === parent.path || entry.path.startsWith(`${parent.path}/`)),
    );
    if (!underKept) kept.push(entry);
  }
  return kept;
}

export function filterMovableVaultEntries<T extends FileTreeDragEntry>(entries: T[]): T[] {
  return entries.filter((entry) => canDragFileTreeEntry(entry.path, entry.kind));
}

/** Keep visible-tree order so multi-drag/move inserts stay in the same sequence. */
export function sortVaultEntriesByVisibleOrder<T extends FileTreeDragEntry>(
  entries: T[],
  visible: T[],
): T[] {
  const index = new Map(visible.map((entry, i) => [entry.path, i]));
  return [...entries].sort(
    (a, b) => (index.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (index.get(b.path) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Items that a file-tree drag from `path` should carry.
 * Multi-selection is included only when the drag starts on a selected row.
 */
export function resolveFileTreeDragEntries(
  path: string,
  kind: FileTreeDragKind,
): FileTreeDragEntry[] {
  const selected = fileTreeSelection.getSelectedEntries();
  const inSelection = selected.some((entry) => entry.path === path);
  const raw = inSelection && selected.length > 1 ? selected : [{ path, kind }];
  const pruned = pruneNestedVaultEntries(filterMovableVaultEntries(raw));
  return pruned.length > 0 ? pruned : [{ path, kind }];
}

/** True when dropping would change the on-disk parent directory. */
export function isCrossDirectoryDrop(sourcePath: string, targetDir: string): boolean {
  return parentDir(normalizePath(sourcePath)) !== normalizePath(targetDir);
}

export const FILE_TREE_DRAG_MIME = "application/x-chestnut-file-tree";

export interface FileTreeDragEntry {
  path: string;
  kind: FileTreeDragKind;
}

export interface FileTreeDragPayload {
  path: string;
  kind: FileTreeDragKind;
  /** All items being dragged. Defaults to the primary `{ path, kind }`. */
  entries?: FileTreeDragEntry[];
}

export function fileTreeDragEntries(payload: FileTreeDragPayload): FileTreeDragEntry[] {
  if (payload.entries && payload.entries.length > 0) return payload.entries;
  return [{ path: payload.path, kind: payload.kind }];
}

export function isFileTreeDragSourcePath(payload: FileTreeDragPayload, path: string): boolean {
  const target = normalizePath(path);
  return fileTreeDragEntries(payload).some((entry) => {
    const source = normalizePath(entry.path);
    if (source === target) return true;
    return entry.kind === "directory" && target.startsWith(`${source}/`);
  });
}

/** True when the payload can move into `targetDir` (at least one item, none into itself). */
export function canDropFileTreePayload(payload: FileTreeDragPayload, targetDir: string): boolean {
  const target = normalizePath(targetDir);
  const entries = fileTreeDragEntries(payload);
  for (const entry of entries) {
    if (entry.kind !== "directory") continue;
    const source = normalizePath(entry.path);
    if (target === source || target.startsWith(`${source}/`)) return false;
  }
  return entries.some((entry) => canDropFileTreeEntry(entry.path, entry.kind, target));
}

export function encodeFileTreeDragPayload(payload: FileTreeDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeFileTreeDragPayload(raw: string): FileTreeDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as FileTreeDragPayload;
    if (
      parsed &&
      typeof parsed.path === "string" &&
      (parsed.kind === "file" || parsed.kind === "directory")
    ) {
      if (parsed.entries) {
        if (!Array.isArray(parsed.entries)) return null;
        for (const entry of parsed.entries) {
          if (
            !entry ||
            typeof entry.path !== "string" ||
            (entry.kind !== "file" && entry.kind !== "directory")
          ) {
            return null;
          }
        }
      }
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
