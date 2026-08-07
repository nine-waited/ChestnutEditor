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

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
