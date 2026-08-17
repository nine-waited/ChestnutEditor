type NoteReloadListener = (path: string) => void;
type NoteFlusher = () => Promise<void>;

const listeners = new Set<NoteReloadListener>();
/** path → leafId → flush (editable panes only). */
const flushersByPath = new Map<string, Map<string, NoteFlusher>>();

/** Subscribe to Markdown note reload-from-disk requests (UI-only). */
export function subscribeNoteReload(listener: NoteReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNoteReload(path: string): void {
  for (const listener of listeners) listener(path);
}

/** Editable NotePane registers so view-only swaps can flush before reload. */
export function registerNoteFlusher(path: string, leafId: string, flush: NoteFlusher): () => void {
  let byLeaf = flushersByPath.get(path);
  if (!byLeaf) {
    byLeaf = new Map();
    flushersByPath.set(path, byLeaf);
  }
  byLeaf.set(leafId, flush);
  return () => {
    const map = flushersByPath.get(path);
    if (!map) return;
    map.delete(leafId);
    if (map.size === 0) flushersByPath.delete(path);
  };
}

export async function flushNoteWriters(path: string): Promise<void> {
  const map = flushersByPath.get(path);
  if (!map || map.size === 0) return;
  await Promise.all([...map.values()].map((flush) => flush()));
}

/** Test helper: clear flusher / listener registry between cases. */
export function resetNoteReloadForTests(): void {
  flushersByPath.clear();
  listeners.clear();
}
