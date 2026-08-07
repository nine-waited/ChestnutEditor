/** Tracks markdown paths with unsaved buffer (interval save mode only). */

const dirtyPaths = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setNoteUnsaved(path: string, unsaved: boolean): void {
  if (!path) return;
  const had = dirtyPaths.has(path);
  if (unsaved && !had) {
    dirtyPaths.add(path);
    emit();
  } else if (!unsaved && had) {
    dirtyPaths.delete(path);
    emit();
  }
}

export function isNoteUnsaved(path: string | undefined | null): boolean {
  if (!path) return false;
  return dirtyPaths.has(path);
}

export function clearNoteUnsaved(path: string): void {
  setNoteUnsaved(path, false);
}

export function subscribeNoteUnsaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable string snapshot for useSyncExternalStore. */
export function getNoteUnsavedSnapshot(): string {
  if (dirtyPaths.size === 0) return "";
  return [...dirtyPaths].sort().join("\n");
}
