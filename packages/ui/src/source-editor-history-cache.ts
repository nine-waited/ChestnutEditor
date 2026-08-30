import type { Compartment, EditorState } from "@codemirror/state";
import { EDITOR_HISTORY_CACHE_LIMIT } from "@chestnut/core";

export interface ParkedSourceEditor {
  state: EditorState;
  themeCompartment: Compartment;
}

/**
 * Parks CodeMirror EditorState (incl. history) when a source pane unmounts
 * so reopen within the LRU window can restore undo.
 * Keyed by note path (not leaf id) so file-tree leaf reuse still matches.
 */
const parked = new Map<string, ParkedSourceEditor>();
const order: string[] = [];

export function sourceHistoryCacheKey(path: string): string {
  return path;
}

export function takeSourceEditorHistory(key: string): ParkedSourceEditor | undefined {
  const entry = parked.get(key);
  if (!entry) return undefined;
  parked.delete(key);
  const idx = order.indexOf(key);
  if (idx >= 0) order.splice(idx, 1);
  return entry;
}

export function putSourceEditorHistory(key: string, entry: ParkedSourceEditor): void {
  if (parked.has(key)) {
    const idx = order.indexOf(key);
    if (idx >= 0) order.splice(idx, 1);
  }
  parked.set(key, entry);
  order.push(key);
  while (order.length > EDITOR_HISTORY_CACHE_LIMIT) {
    const evict = order.shift();
    if (evict) parked.delete(evict);
  }
}

export function clearSourceEditorHistory(): void {
  parked.clear();
  order.length = 0;
}

export function clearSourceEditorHistoryForPath(path: string): void {
  if (!parked.has(path)) return;
  parked.delete(path);
  const idx = order.indexOf(path);
  if (idx >= 0) order.splice(idx, 1);
}

/** Follow a rename so parked undo is not stuck on the old Untitled path. */
export function remapSourceEditorHistory(oldPath: string, newPath: string): void {
  if (!oldPath || !newPath || oldPath === newPath) return;
  const entry = parked.get(oldPath);
  if (!entry) return;
  parked.delete(oldPath);
  const idx = order.indexOf(oldPath);
  if (idx >= 0) order.splice(idx, 1);
  putSourceEditorHistory(newPath, entry);
}

/** Drop parked source history for a path or any nested path under a folder. */
export function clearSourceEditorHistoryUnder(prefix: string): void {
  if (!prefix) {
    clearSourceEditorHistory();
    return;
  }
  const doomed = order.filter((p) => p === prefix || p.startsWith(`${prefix}/`));
  for (const path of doomed) {
    parked.delete(path);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const path = order[i];
    if (path === prefix || path.startsWith(`${prefix}/`)) order.splice(i, 1);
  }
}
