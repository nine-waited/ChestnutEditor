import type { PaneId } from "./store.js";

/** Soft hot set size (prefer keeping these fully warm). */
export const EDITOR_KEEP_ALIVE_LIMIT = 5;

/**
 * Max markdown panes kept mounted.
 * Covers keep-alive + cold slots so ~5 recent docs retain undo stacks.
 */
export const EDITOR_HISTORY_CACHE_LIMIT = 5;

export const EDITOR_PANE_MOUNT_LIMIT = EDITOR_HISTORY_CACHE_LIMIT;

/**
 * LRU of markdown **paths** by last activation.
 * Paths can stay mounted briefly after a tab is closed or replaced,
 * so undo survives file-tree navigation that reuses a leaf.
 */
export class EditorPaneLru {
  private order: string[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly limit: number;

  constructor(limit = EDITOR_PANE_MOUNT_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): readonly string[] {
    return this.order;
  }

  touch(path: string): void {
    if (!path) return;
    const next = [...this.order.filter((x) => x !== path), path];
    while (next.length > this.limit) next.shift();
    if (sameOrder(this.order, next)) return;
    this.order = next;
    this.emit();
  }

  remove(path: string): void {
    if (!this.order.includes(path)) return;
    this.order = this.order.filter((x) => x !== path);
    this.emit();
  }

  /** Drop a path and any nested paths (folder delete). */
  removeUnder(prefix: string): void {
    if (!prefix) {
      this.clear();
      return;
    }
    const next = this.order.filter((p) => p !== prefix && !p.startsWith(`${prefix}/`));
    if (sameOrder(this.order, next)) return;
    this.order = next;
    this.emit();
  }

  clear(): void {
    if (this.order.length === 0) return;
    this.order = [];
    this.emit();
  }

  /**
   * Paths that should stay mounted (including recently replaced/closed ghosts).
   * Always pins `activePath` when provided.
   */
  resolveMountPaths(activePath: string | null): string[] {
    let order = [...this.order];
    if (activePath) {
      order = [...order.filter((p) => p !== activePath), activePath];
    }
    while (order.length > this.limit) order.shift();
    return order;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Per-pane markdown keep-alive LRUs.
 * Split view must not share one LRU — otherwise the same path mounts in both
 * columns and interval/manual save can overwrite with a stale buffer.
 */
export class EditorPaneLruHost {
  private readonly panes: Record<PaneId, EditorPaneLru>;

  constructor(limit = EDITOR_PANE_MOUNT_LIMIT) {
    this.panes = {
      left: new EditorPaneLru(limit),
      right: new EditorPaneLru(limit),
    };
  }

  forPane(paneId: PaneId): EditorPaneLru {
    return this.panes[paneId];
  }

  remove(path: string): void {
    this.panes.left.remove(path);
    this.panes.right.remove(path);
  }

  removeUnder(prefix: string): void {
    this.panes.left.removeUnder(prefix);
    this.panes.right.removeUnder(prefix);
  }

  clear(): void {
    this.panes.left.clear();
    this.panes.right.clear();
  }

  subscribe(listener: () => void): () => void {
    const unsubLeft = this.panes.left.subscribe(listener);
    const unsubRight = this.panes.right.subscribe(listener);
    return () => {
      unsubLeft();
      unsubRight();
    };
  }
}

/**
 * Build mount paths for one editor column.
 * Own tab leaves always mount; LRU ghosts are skipped when the other split
 * pane already has that markdown open (avoids duplicate NotePane instances).
 */
export function resolvePaneMarkdownMountPaths(options: {
  ownLeafPaths: readonly string[];
  lruPaths: readonly string[];
  otherPaneOpenPaths: readonly string[];
}): string[] {
  const own = new Set(options.ownLeafPaths.filter(Boolean));
  const otherOpen = new Set(options.otherPaneOpenPaths.filter(Boolean));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of [...options.ownLeafPaths, ...options.lruPaths]) {
    if (!path || seen.has(path)) continue;
    if (!own.has(path) && otherOpen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
