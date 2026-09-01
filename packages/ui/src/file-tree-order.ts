import { isExportTargetFolder, normalizePath, type VaultEntry } from "@chestnut/core";
import { remapVaultPathUnderPrefix } from "./vault-path-remap.js";

export type FileTreeChildOrderMap = Record<string, string[]>;

function parentDirOf(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

function normalizePathList(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of paths) {
    if (typeof item !== "string" || !item || seen.has(item)) continue;
    seen.add(item);
    next.push(normalizePath(item));
  }
  return next;
}

export function normalizeFileTreeChildOrder(raw: unknown): FileTreeChildOrderMap {
  if (!raw || typeof raw !== "object") return {};
  const next: FileTreeChildOrderMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parent = normalizePath(key);
    const list = normalizePathList(value);
    if (list.length > 0) next[parent] = list;
  }
  return next;
}

function orderKeyEqual(a: FileTreeChildOrderMap, b: FileTreeChildOrderMap): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    const la = a[keysA[i]!] ?? [];
    const lb = b[keysB[i]!] ?? [];
    if (la.join("\0") !== lb.join("\0")) return false;
  }
  return true;
}

/** Apply saved sibling order; directories always before files; root export target stays last. */
export function applyFileTreeChildOrder(
  entries: VaultEntry[],
  parentDir: string,
  orderMap: FileTreeChildOrderMap,
): VaultEntry[] {
  if (entries.length <= 1) return entries;

  const parent = normalizePath(parentDir);
  const targetEntry =
    parent === ""
      ? entries.find((entry) => entry.kind === "directory" && isExportTargetFolder(entry.path))
      : undefined;
  const working = targetEntry ? entries.filter((entry) => entry !== targetEntry) : entries;

  const byPath = new Map(working.map((entry) => [entry.path, entry]));
  const saved = (orderMap[parent] ?? []).filter((path) => byPath.has(path));

  const orderedDirs: VaultEntry[] = [];
  const orderedFiles: VaultEntry[] = [];
  const used = new Set<string>();

  for (const path of saved) {
    const entry = byPath.get(path);
    if (!entry || used.has(path)) continue;
    used.add(path);
    if (entry.kind === "directory") orderedDirs.push(entry);
    else orderedFiles.push(entry);
  }

  const restDirs: VaultEntry[] = [];
  const restFiles: VaultEntry[] = [];
  for (const entry of working) {
    if (used.has(entry.path)) continue;
    if (entry.kind === "directory") restDirs.push(entry);
    else restFiles.push(entry);
  }

  const next = [...orderedDirs, ...restDirs, ...orderedFiles, ...restFiles];
  return targetEntry ? [...next, targetEntry] : next;
}

function setParentOrder(
  orderMap: FileTreeChildOrderMap,
  parentDir: string,
  paths: string[],
): FileTreeChildOrderMap {
  const parent = normalizePath(parentDir);
  const list = normalizePathList(paths);
  const next = { ...orderMap };
  if (list.length === 0) delete next[parent];
  else next[parent] = list;
  return next;
}

/**
 * Reorder `path` within `displayPaths` (current sibling display order).
 * `insertBeforePath` null = move to end of the same-kind block.
 */
export function reorderFileTreeChildPaths(
  orderMap: FileTreeChildOrderMap,
  parentDir: string,
  displayPaths: string[],
  path: string,
  insertBeforePath: string | null,
  pathKind: "file" | "directory",
  kindByPath: Record<string, "file" | "directory">,
): FileTreeChildOrderMap {
  const source = normalizePath(path);
  if (!displayPaths.includes(source)) return orderMap;
  if (insertBeforePath !== null) {
    const before = normalizePath(insertBeforePath);
    if (before === source) return orderMap;
    if (kindByPath[before] !== pathKind) return orderMap;
  }

  const without = displayPaths.filter((item) => item !== source);
  let insertAt = without.length;
  if (insertBeforePath !== null) {
    const idx = without.indexOf(normalizePath(insertBeforePath));
    if (idx >= 0) insertAt = idx;
  } else {
    // End of same-kind block: after last same-kind item in `without`.
    let lastSame = -1;
    for (let i = 0; i < without.length; i++) {
      if (kindByPath[without[i]!] === pathKind) lastSame = i;
    }
    insertAt = lastSame + 1;
  }

  // Keep dirs before files: clamp insertAt into the kind segment.
  let kindStart = 0;
  let kindEnd = without.length;
  if (pathKind === "directory") {
    kindEnd = without.findIndex((item) => kindByPath[item] === "file");
    if (kindEnd < 0) kindEnd = without.length;
  } else {
    kindStart = without.findIndex((item) => kindByPath[item] === "file");
    if (kindStart < 0) kindStart = without.length;
  }
  insertAt = Math.max(kindStart, Math.min(insertAt, kindEnd));

  const nextPaths = without.slice();
  nextPaths.splice(insertAt, 0, source);
  return setParentOrder(orderMap, parentDir, nextPaths);
}

/**
 * Reorder several same-kind siblings as one block, preserving their relative order.
 * `insertBeforePath` null = move the block to the end of the same-kind segment.
 */
export function reorderFileTreeChildPathBlock(
  orderMap: FileTreeChildOrderMap,
  parentDir: string,
  displayPaths: string[],
  paths: string[],
  insertBeforePath: string | null,
  pathKind: "file" | "directory",
  kindByPath: Record<string, "file" | "directory">,
): FileTreeChildOrderMap {
  const seen = new Set<string>();
  const moving: string[] = [];
  for (const path of paths) {
    const source = normalizePath(path);
    if (seen.has(source) || !displayPaths.includes(source)) continue;
    if (kindByPath[source] !== pathKind) continue;
    seen.add(source);
    moving.push(source);
  }
  if (moving.length === 0) return orderMap;
  if (moving.length === 1) {
    return reorderFileTreeChildPaths(
      orderMap,
      parentDir,
      displayPaths,
      moving[0]!,
      insertBeforePath,
      pathKind,
      kindByPath,
    );
  }

  const movingSet = new Set(moving);
  const without = displayPaths.filter((item) => !movingSet.has(item));
  let insertAt = without.length;
  if (insertBeforePath !== null) {
    const before = normalizePath(insertBeforePath);
    if (!movingSet.has(before) && kindByPath[before] === pathKind) {
      const idx = without.indexOf(before);
      if (idx >= 0) insertAt = idx;
    }
  } else {
    let lastSame = -1;
    for (let i = 0; i < without.length; i++) {
      if (kindByPath[without[i]!] === pathKind) lastSame = i;
    }
    insertAt = lastSame + 1;
  }

  let kindStart = 0;
  let kindEnd = without.length;
  if (pathKind === "directory") {
    kindEnd = without.findIndex((item) => kindByPath[item] === "file");
    if (kindEnd < 0) kindEnd = without.length;
  } else {
    kindStart = without.findIndex((item) => kindByPath[item] === "file");
    if (kindStart < 0) kindStart = without.length;
  }
  insertAt = Math.max(kindStart, Math.min(insertAt, kindEnd));

  const nextPaths = without.slice();
  nextPaths.splice(insertAt, 0, ...moving);
  return setParentOrder(orderMap, parentDir, nextPaths);
}

/** After a real move: remove from old parent and place under new parent. */
export function placeFileTreeChildAfterMove(
  orderMap: FileTreeChildOrderMap,
  oldPath: string,
  newPath: string,
  insertBeforePath: string | null,
  pathKind: "file" | "directory",
): FileTreeChildOrderMap {
  const oldParent = parentDirOf(oldPath);
  const newParent = parentDirOf(newPath);
  let next = { ...orderMap };

  const stripFrom = (parent: string, path: string) => {
    const list = next[parent];
    if (!list) return;
    const filtered = list.filter(
      (item) => item !== path && (pathKind !== "directory" || !item.startsWith(`${path}/`)),
    );
    next = setParentOrder(next, parent, filtered);
  };

  stripFrom(oldParent, normalizePath(oldPath));
  if (oldParent !== newParent) {
    // Also drop stale references if any
  }

  const dest = next[newParent] ? next[newParent].slice() : [];
  const cleaned = dest.filter((item) => item !== normalizePath(newPath));
  let insertAt = cleaned.length;
  if (insertBeforePath) {
    const idx = cleaned.indexOf(normalizePath(insertBeforePath));
    if (idx >= 0) insertAt = idx;
  }
  cleaned.splice(insertAt, 0, normalizePath(newPath));
  next = setParentOrder(next, newParent, cleaned);
  return next;
}

export function remapFileTreeChildOrderPath(
  orderMap: FileTreeChildOrderMap,
  oldPath: string,
  newPath: string,
): FileTreeChildOrderMap {
  const oldP = normalizePath(oldPath);
  const newP = normalizePath(newPath);
  if (oldP === newP) return orderMap;

  const oldParent = parentDirOf(oldP);
  const newParent = parentDirOf(newP);
  let changed = false;
  const next: FileTreeChildOrderMap = {};

  for (const [parent, list] of Object.entries(orderMap)) {
    let mappedParent = parent;
    if (parent === oldP) {
      mappedParent = newP;
      changed = true;
    }

    const mapped = list.map((path) => {
      if (path === oldP) {
        changed = true;
        return newP;
      }
      return path;
    });

    if (oldParent !== newParent && parent === oldParent) {
      const filtered = mapped.filter((path) => path !== newP);
      if (filtered.length !== mapped.length) changed = true;
      if (filtered.length > 0) next[mappedParent] = filtered;
      continue;
    }

    if (mapped.length > 0) next[mappedParent] = mapped;
  }

  if (oldParent !== newParent) {
    const dest = next[newParent] ? next[newParent].slice() : [];
    if (!dest.includes(newP)) {
      dest.push(newP);
      changed = true;
    }
    if (dest.length > 0) next[newParent] = dest;
    else delete next[newParent];
  }

  return changed ? next : orderMap;
}

export function remapFileTreeChildOrderPrefix(
  orderMap: FileTreeChildOrderMap,
  oldPrefix: string,
  newPrefix: string,
): FileTreeChildOrderMap {
  const oldP = normalizePath(oldPrefix);
  const newP = normalizePath(newPrefix);
  if (oldP === newP) return orderMap;

  let changed = false;
  const next: FileTreeChildOrderMap = {};

  for (const [parent, list] of Object.entries(orderMap)) {
    const mappedParent = remapVaultPathUnderPrefix(parent, oldP, newP);
    if (mappedParent !== parent) changed = true;
    const mapped = list.map((path) => {
      const remapped = remapVaultPathUnderPrefix(path, oldP, newP);
      if (remapped !== path) changed = true;
      return remapped;
    });
    if (mapped.length > 0) next[mappedParent] = mapped;
  }

  return changed ? next : orderMap;
}

export function removeFileTreeChildOrderUnder(
  orderMap: FileTreeChildOrderMap,
  deletedPath: string,
  isDirectory: boolean,
): FileTreeChildOrderMap {
  const deleted = normalizePath(deletedPath);
  let changed = false;
  const next: FileTreeChildOrderMap = {};

  for (const [parent, list] of Object.entries(orderMap)) {
    if (isDirectory && (parent === deleted || parent.startsWith(`${deleted}/`))) {
      changed = true;
      continue;
    }
    const filtered = list.filter((path) => {
      if (path === deleted) return false;
      if (isDirectory && path.startsWith(`${deleted}/`)) return false;
      return true;
    });
    if (filtered.length !== list.length) changed = true;
    // Also remove the deleted entry from its parent list (already filtered)
    if (parent === parentDirOf(deleted) || filtered.length > 0) {
      if (filtered.length > 0) next[parent] = filtered;
      else if (list.length > 0) changed = true;
    }
  }

  return changed ? next : orderMap;
}

export function fileTreeChildOrderEquals(
  a: FileTreeChildOrderMap,
  b: FileTreeChildOrderMap,
): boolean {
  return orderKeyEqual(a, b);
}

export { parentDirOf as parentDirOfFileTreePath };
