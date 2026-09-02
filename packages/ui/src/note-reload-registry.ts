type NoteReloadListener = (path: string) => void;
type NoteFlusher = () => Promise<void>;

export interface NoteWriteSnapshot {
  buffer: string;
  lastSaved: string;
}

type NoteWriter = {
  flush: NoteFlusher;
  snapshot?: () => NoteWriteSnapshot;
};

const listeners = new Set<NoteReloadListener>();
/** path → leafId → writer (editable panes). */
const writersByPath = new Map<string, Map<string, NoteWriter>>();

/** Subscribe to Markdown note reload-from-disk requests (UI-only). */
export function subscribeNoteReload(listener: NoteReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNoteReload(path: string): void {
  for (const listener of listeners) listener(path);
}

/** Editable NotePane registers so view-only swaps can flush before reload. */
export function registerNoteFlusher(
  path: string,
  leafId: string,
  flush: NoteFlusher,
  snapshot?: () => NoteWriteSnapshot,
): () => void {
  let byLeaf = writersByPath.get(path);
  if (!byLeaf) {
    byLeaf = new Map();
    writersByPath.set(path, byLeaf);
  }
  byLeaf.set(leafId, { flush, snapshot });
  return () => {
    const map = writersByPath.get(path);
    if (!map) return;
    map.delete(leafId);
    if (map.size === 0) writersByPath.delete(path);
  };
}

export async function flushNoteWriters(path: string): Promise<void> {
  const map = writersByPath.get(path);
  if (!map || map.size === 0) return;
  await Promise.all([...map.values()].map((writer) => writer.flush()));
}

/** In-memory buffer vs last Chestnut save, for refresh vs external-disk compare. */
export function getNoteWriteSnapshot(path: string): NoteWriteSnapshot | null {
  const map = writersByPath.get(path);
  if (!map) return null;
  for (const writer of map.values()) {
    if (writer.snapshot) return writer.snapshot();
  }
  return null;
}

/** Test helper: clear flusher / listener registry between cases. */
export function resetNoteReloadForTests(): void {
  writersByPath.clear();
  listeners.clear();
}
