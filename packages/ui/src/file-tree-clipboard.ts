type Listener = () => void;

class FileTreeClipboardStore {
  private cutPaths = new Set<string>();
  private listeners = new Set<Listener>();
  private revision = 0;

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getRevision = (): number => this.revision;

  isCut(path: string): boolean {
    if (this.cutPaths.has(path)) return true;
    for (const cut of this.cutPaths) {
      if (path.startsWith(`${cut}/`)) return true;
    }
    return false;
  }

  setCut(paths: string[]): void {
    this.cutPaths = new Set(paths.filter(Boolean));
    this.revision += 1;
    this.notify();
  }

  clearCut(): void {
    if (this.cutPaths.size === 0) return;
    this.cutPaths.clear();
    this.revision += 1;
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

export const fileTreeClipboard = new FileTreeClipboardStore();
