export type LeafType =
  | "empty"
  | "markdown"
  | "excalidraw"
  | "image"
  | "pdf"
  | "graph"
  | "settings"
  | "publish";

export type LeafMode = "live" | "source";

export type PaneId = "left" | "right";

export function normalizeLeafMode(mode?: string): LeafMode {
  return mode === "source" ? "source" : "live";
}

export interface Leaf {
  id: string;
  type: LeafType;
  path?: string;
  mode?: LeafMode;
  pinned?: boolean;
}

export type WorkspaceListener = () => void;

export interface PaneState {
  leaves: Leaf[];
  activeId: string;
  active: Leaf | null;
}

export interface WorkspaceState {
  split: boolean;
  focusedPane: PaneId;
  panes: { left: PaneState; right: PaneState };
  /** Focused pane leaves (compat for existing callers). */
  leaves: Leaf[];
  activeId: string;
  active: Leaf | null;
}

interface PaneData {
  leaves: Leaf[];
  activeId: string;
}

let nextId = 1;
function uid(): string {
  return `leaf-${nextId++}`;
}

function emptyPane(): PaneData {
  const leaf: Leaf = { id: uid(), type: "empty" };
  return { leaves: [leaf], activeId: leaf.id };
}

function paneSnapshot(pane: PaneData): PaneState {
  return {
    leaves: [...pane.leaves],
    activeId: pane.activeId,
    active: pane.leaves.find((l) => l.id === pane.activeId) ?? null,
  };
}

function otherPaneId(paneId: PaneId): PaneId {
  return paneId === "left" ? "right" : "left";
}

function leafPathKey(leaf: Leaf): string | null {
  if (leaf.path) return `path:${leaf.path}`;
  if (leaf.type === "graph" || leaf.type === "settings" || leaf.type === "publish") {
    return `type:${leaf.type}`;
  }
  return null;
}

export class WorkspaceStore {
  private split = false;
  private focusedPane: PaneId = "left";
  private panes: { left: PaneData; right: PaneData } = {
    left: emptyPane(),
    right: emptyPane(),
  };
  private listeners = new Set<WorkspaceListener>();
  private snapshot: WorkspaceState = this.buildSnapshot();

  private buildSnapshot(): WorkspaceState {
    const left = paneSnapshot(this.panes.left);
    const right = paneSnapshot(this.panes.right);
    const focused = this.focusedPane === "left" ? left : right;
    return {
      split: this.split,
      focusedPane: this.focusedPane,
      panes: { left, right },
      leaves: focused.leaves,
      activeId: focused.activeId,
      active: focused.active,
    };
  }

  getState(): WorkspaceState {
    return this.snapshot;
  }

  subscribe(listener: WorkspaceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  getFocusedPane(): PaneId {
    return this.focusedPane;
  }

  isSplit(): boolean {
    return this.split;
  }

  setFocusedPane(paneId: PaneId): void {
    if (!this.split && paneId === "right") return;
    if (this.focusedPane === paneId) return;
    this.focusedPane = paneId;
    this.notify();
  }

  toggleSplit(): void {
    if (this.split) this.exitSplit();
    else this.enterSplit();
  }

  setSplit(enabled: boolean): void {
    if (enabled === this.split) return;
    if (enabled) this.enterSplit();
    else this.exitSplit();
  }

  private enterSplit(): void {
    const left = this.panes.left;
    const active = left.leaves.find((l) => l.id === left.activeId) ?? null;
    const contentCount = left.leaves.filter((l) => l.type !== "empty").length;

    if (active && active.type !== "empty" && contentCount > 1) {
      const activeIndex = left.leaves.findIndex((l) => l.id === active.id);
      left.leaves = left.leaves.filter((l) => l.id !== active.id);
      if (left.leaves.length === 0) {
        const empty = emptyPane();
        left.leaves = empty.leaves;
        left.activeId = empty.activeId;
      } else {
        left.activeId = this.pickNeighborActiveId(left.leaves, activeIndex, active.id);
      }
      this.panes.right = { leaves: [active], activeId: active.id };
      this.focusedPane = "right";
    } else {
      this.panes.right = emptyPane();
      this.focusedPane = "left";
    }
    this.split = true;
    this.notify();
  }

  private exitSplit(): void {
    const focused = this.focusedPane;
    const focusActive =
      this.panes[focused].leaves.find((l) => l.id === this.panes[focused].activeId) ?? null;
    const order: PaneId[] = focused === "left" ? ["left", "right"] : ["right", "left"];
    const merged: Leaf[] = [];
    const seen = new Set<string>();

    for (const paneId of order) {
      for (const leaf of this.panes[paneId].leaves) {
        if (leaf.type === "empty") continue;
        const key = leafPathKey(leaf);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        merged.push(leaf);
      }
    }

    if (merged.length === 0) {
      this.panes.left = emptyPane();
    } else {
      let activeId = merged[0].id;
      if (focusActive) {
        const byId = merged.find((l) => l.id === focusActive.id);
        if (byId) activeId = byId.id;
        else if (focusActive.path) {
          const byPath = merged.find((l) => l.path === focusActive.path);
          if (byPath) activeId = byPath.id;
        } else {
          const byType = merged.find((l) => l.type === focusActive.type && !l.path);
          if (byType) activeId = byType.id;
        }
      }
      this.panes.left = { leaves: merged, activeId };
    }
    this.panes.right = emptyPane();
    this.split = false;
    this.focusedPane = "left";
    this.notify();
  }

  /** Prefer the tab left of the removed index; else the tab that landed at that index. */
  private pickNeighborActiveId(leaves: Leaf[], removedIndex: number, _removedId: string): string {
    for (let i = Math.min(removedIndex - 1, leaves.length - 1); i >= 0; i--) {
      if (leaves[i]) return leaves[i].id;
    }
    return leaves[0]?.id ?? emptyPane().activeId;
  }

  private findPaneIdForLeaf(leafId: string): PaneId | null {
    if (this.panes.left.leaves.some((l) => l.id === leafId)) return "left";
    if (this.panes.right.leaves.some((l) => l.id === leafId)) return "right";
    return null;
  }

  private findLeafByPath(
    path: string,
    type: LeafType,
  ): { paneId: PaneId; leaf: Leaf } | null {
    for (const paneId of ["left", "right"] as PaneId[]) {
      const leaf = this.panes[paneId].leaves.find((l) => l.type === type && l.path === path);
      if (leaf) return { paneId, leaf };
    }
    return null;
  }

  private findSingleton(type: "graph" | "settings" | "publish"): { paneId: PaneId; leaf: Leaf } | null {
    for (const paneId of ["left", "right"] as PaneId[]) {
      const leaf = this.panes[paneId].leaves.find((l) => l.type === type);
      if (leaf) return { paneId, leaf };
    }
    return null;
  }

  private activateLeaf(paneId: PaneId, leafId: string): void {
    this.focusedPane = paneId;
    this.panes[paneId].activeId = leafId;
  }

  private openPathLeaf(
    type: "markdown" | "excalidraw" | "image" | "pdf",
    path: string,
    opts?: { newTab?: boolean; mode?: LeafMode; pane?: PaneId },
  ): string {
    const targetPane = opts?.pane ?? this.focusedPane;

    // Never open the same path on both panes (even with newTab).
    const existing = this.findLeafByPath(path, type);
    if (existing && !opts?.newTab) {
      if (type === "markdown" && opts?.mode) {
        existing.leaf.mode = normalizeLeafMode(opts.mode);
      }
      this.activateLeaf(existing.paneId, existing.leaf.id);
      this.notify();
      return existing.leaf.id;
    }
    if (existing && opts?.newTab) {
      if (type === "markdown" && opts?.mode) {
        existing.leaf.mode = normalizeLeafMode(opts.mode);
      }
      this.activateLeaf(existing.paneId, existing.leaf.id);
      this.notify();
      return existing.leaf.id;
    }

    if (!this.split && targetPane === "right") {
      return this.openPathLeaf(type, path, { ...opts, pane: "left" });
    }

    const pane = this.panes[targetPane];
    this.focusedPane = targetPane;

    if (!opts?.newTab) {
      const active = pane.leaves.find((l) => l.id === pane.activeId);
      // Only reuse an empty welcome leaf. Never replace an open file tab in-place
      // (Markdown / Excalidraw / image / PDF all open incrementally).
      if (active && !active.pinned && active.type === "empty") {
        active.type = type;
        active.path = path;
        active.mode = type === "markdown" ? (opts?.mode ?? "live") : undefined;
        this.notify();
        return active.id;
      }
    }

    const leaf: Leaf = {
      id: uid(),
      type,
      path,
      mode: type === "markdown" ? (opts?.mode ?? "live") : undefined,
    };
    pane.leaves.push(leaf);
    pane.activeId = leaf.id;
    this.notify();
    return leaf.id;
  }

  openFile(path: string, opts?: { newTab?: boolean; mode?: LeafMode; pane?: PaneId }): string {
    return this.openPathLeaf("markdown", path, opts);
  }

  openExcalidraw(path: string, opts?: { newTab?: boolean; pane?: PaneId }): string {
    return this.openPathLeaf("excalidraw", path, opts);
  }

  openImage(path: string, opts?: { newTab?: boolean; pane?: PaneId }): string {
    return this.openPathLeaf("image", path, opts);
  }

  openPdf(path: string, opts?: { newTab?: boolean; pane?: PaneId }): string {
    return this.openPathLeaf("pdf", path, opts);
  }

  private openSingleton(type: "graph" | "settings" | "publish"): string {
    const existing = this.findSingleton(type);
    if (existing) {
      this.activateLeaf(existing.paneId, existing.leaf.id);
      this.notify();
      return existing.leaf.id;
    }
    const paneId = this.focusedPane;
    const pane = this.panes[paneId];
    const leaf: Leaf = { id: uid(), type };
    pane.leaves.push(leaf);
    pane.activeId = leaf.id;
    this.notify();
    return leaf.id;
  }

  openGraph(): string {
    return this.openSingleton("graph");
  }

  openSettings(): string {
    return this.openSingleton("settings");
  }

  openPublish(): string {
    return this.openSingleton("publish");
  }

  setActive(id: string): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    this.activateLeaf(paneId, id);
    this.notify();
  }

  closeTab(id: string): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    const pane = this.panes[paneId];
    if (pane.leaves.length <= 1) {
      const leaf = pane.leaves[0];
      if (!leaf || leaf.id !== id || leaf.type === "empty") return;
      const empty: Leaf = { id: uid(), type: "empty" };
      pane.leaves = [empty];
      pane.activeId = empty.id;
      if (this.maybeExitSplitIfPaneEmpty(paneId)) return;
      this.notify();
      return;
    }
    this.closeTabsInPane(paneId, [id]);
  }

  closeOtherTabs(id: string): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    const pane = this.panes[paneId];
    const toClose = pane.leaves.filter((l) => l.id !== id).map((l) => l.id);
    if (toClose.length === 0) return;
    pane.activeId = id;
    this.closeTabsInPane(paneId, toClose);
  }

  closeTabsToLeft(id: string): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    const pane = this.panes[paneId];
    const idx = pane.leaves.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    this.closeTabsInPane(
      paneId,
      pane.leaves.slice(0, idx).map((l) => l.id),
    );
  }

  closeTabsToRight(id: string): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    const pane = this.panes[paneId];
    const idx = pane.leaves.findIndex((l) => l.id === id);
    if (idx < 0 || idx >= pane.leaves.length - 1) return;
    this.closeTabsInPane(
      paneId,
      pane.leaves.slice(idx + 1).map((l) => l.id),
    );
  }

  /** Close all tabs in one pane. Exits split if that pane becomes empty. Defaults to focused pane. */
  closeAllTabs(paneId?: PaneId): void {
    const id = paneId ?? this.focusedPane;
    this.closeTabsInPane(
      id,
      this.panes[id].leaves.map((l) => l.id),
    );
  }

  private paneHasContent(paneId: PaneId): boolean {
    return this.panes[paneId].leaves.some((l) => l.type !== "empty");
  }

  /** Exit split when a pane no longer has any content tabs. Returns true if split was exited. */
  private maybeExitSplitIfPaneEmpty(paneId: PaneId): boolean {
    if (!this.split || this.paneHasContent(paneId)) return false;
    this.exitSplit();
    return true;
  }

  private closeTabsInPane(paneId: PaneId, idsToClose: string[]): void {
    if (idsToClose.length === 0) return;
    const pane = this.panes[paneId];
    const closeSet = new Set(idsToClose);
    const next = pane.leaves.filter((l) => !closeSet.has(l.id));
    if (next.length === pane.leaves.length) return;

    if (next.length === 0) {
      const empty: Leaf = { id: uid(), type: "empty" };
      pane.leaves = [empty];
      pane.activeId = empty.id;
      if (this.maybeExitSplitIfPaneEmpty(paneId)) return;
      this.notify();
      return;
    }

    if (closeSet.has(pane.activeId)) {
      const oldIdx = pane.leaves.findIndex((l) => l.id === pane.activeId);
      let nextActiveId = next[0].id;
      for (let i = oldIdx; i >= 0; i--) {
        const leaf = pane.leaves[i];
        if (!closeSet.has(leaf.id)) {
          nextActiveId = leaf.id;
          break;
        }
      }
      pane.activeId = nextActiveId;
    }

    pane.leaves = next;
    if (this.maybeExitSplitIfPaneEmpty(paneId)) return;
    this.notify();
  }

  /**
   * Enter split view by moving `leafId` to the right pane.
   * Used when dragging a tab to the right edge in single-pane mode.
   */
  splitWithLeaf(leafId: string): boolean {
    if (this.split) {
      this.moveLeafToPane(leafId, "right");
      return true;
    }
    const from = this.findPaneIdForLeaf(leafId);
    if (from !== "left") return false;
    const left = this.panes.left;
    const leafIndex = left.leaves.findIndex((l) => l.id === leafId);
    if (leafIndex < 0) return false;
    const leaf = left.leaves[leafIndex];
    if (leaf.type === "empty") return false;

    left.leaves.splice(leafIndex, 1);
    if (left.leaves.length === 0) {
      const empty = emptyPane();
      left.leaves = empty.leaves;
      left.activeId = empty.activeId;
    } else if (left.activeId === leafId) {
      left.activeId = this.pickNeighborActiveId(left.leaves, leafIndex, leafId);
    }

    this.panes.right = { leaves: [leaf], activeId: leaf.id };
    this.focusedPane = "right";
    this.split = true;
    this.notify();
    return true;
  }

  /**
   * Move a tab to another pane. Same-path conflict activates the existing tab
   * on the target and removes the dragged leaf from the source.
   * Exits split when the source pane has no content tabs left.
   */
  moveLeafToPane(leafId: string, to: PaneId): void {
    if (!this.split) return;
    const from = this.findPaneIdForLeaf(leafId);
    if (!from || from === to) return;
    const fromPane = this.panes[from];
    const toPane = this.panes[to];
    const leafIndex = fromPane.leaves.findIndex((l) => l.id === leafId);
    if (leafIndex < 0) return;
    const leaf = fromPane.leaves[leafIndex];
    if (leaf.type === "empty") return;

    const key = leafPathKey(leaf);
    if (key) {
      const conflict = toPane.leaves.find((l) => leafPathKey(l) === key);
      if (conflict) {
        this.closeTabsInPane(from, [leafId]);
        // closeTabsInPane may have exited split after emptying the source pane.
        if (!this.split) return;
        this.activateLeaf(to, conflict.id);
        this.notify();
        return;
      }
    }

    fromPane.leaves.splice(leafIndex, 1);
    if (fromPane.leaves.length === 0) {
      const empty: Leaf = { id: uid(), type: "empty" };
      fromPane.leaves = [empty];
      fromPane.activeId = empty.id;
    } else if (fromPane.activeId === leafId) {
      fromPane.activeId = this.pickNeighborActiveId(fromPane.leaves, leafIndex, leafId);
    }

    toPane.leaves = toPane.leaves.filter((l) => l.type !== "empty");
    toPane.leaves.push(leaf);
    toPane.activeId = leaf.id;
    this.focusedPane = to;
    if (this.maybeExitSplitIfPaneEmpty(from)) return;
    this.notify();
  }

  setMode(id: string, mode: LeafMode): void {
    const paneId = this.findPaneIdForLeaf(id);
    if (!paneId) return;
    const leaf = this.panes[paneId].leaves.find((l) => l.id === id);
    if (leaf && leaf.type === "markdown") {
      leaf.mode = normalizeLeafMode(mode);
      this.notify();
    }
  }

  updatePath(leafId: string, newPath: string): void {
    const paneId = this.findPaneIdForLeaf(leafId);
    if (!paneId) return;
    const leaf = this.panes[paneId].leaves.find((l) => l.id === leafId);
    if (leaf && leaf.path) {
      const other = otherPaneId(paneId);
      const conflict = this.panes[other].leaves.find((l) => l.path === newPath);
      if (conflict) {
        leaf.type = "empty";
        leaf.path = undefined;
        leaf.mode = undefined;
        this.notify();
        return;
      }
      leaf.path = newPath;
      this.notify();
    }
  }

  private forEachLeaf(fn: (leaf: Leaf) => void): void {
    for (const leaf of this.panes.left.leaves) fn(leaf);
    for (const leaf of this.panes.right.leaves) fn(leaf);
  }

  renamePath(oldPath: string, newPath: string): void {
    let changed = false;
    this.forEachLeaf((leaf) => {
      if (leaf.path === oldPath) {
        leaf.path = newPath;
        changed = true;
      }
    });
    if (changed) this.dedupeAfterPathChange();
  }

  renamePathPrefix(oldPrefix: string, newPrefix: string): void {
    let changed = false;
    const prefix = `${oldPrefix}/`;
    this.forEachLeaf((leaf) => {
      if (!leaf.path) return;
      if (leaf.path === oldPrefix || leaf.path.startsWith(prefix)) {
        leaf.path = `${newPrefix}${leaf.path.slice(oldPrefix.length)}`;
        changed = true;
      }
    });
    if (changed) this.dedupeAfterPathChange();
  }

  /** After renames, drop duplicate paths keeping left-first order then notify. */
  private dedupeAfterPathChange(): void {
    const seen = new Set<string>();
    for (const paneId of ["left", "right"] as PaneId[]) {
      const pane = this.panes[paneId];
      const next: Leaf[] = [];
      for (const leaf of pane.leaves) {
        if (leaf.path && seen.has(leaf.path)) continue;
        if (leaf.path) seen.add(leaf.path);
        next.push(leaf);
      }
      if (next.length === 0) {
        const empty = emptyPane();
        pane.leaves = empty.leaves;
        pane.activeId = empty.activeId;
      } else {
        if (!next.some((l) => l.id === pane.activeId)) {
          pane.activeId = next[0].id;
        }
        pane.leaves = next;
      }
    }
    this.notify();
  }

  clearPathsForDelete(deletedPath: string, isDirectory: boolean): void {
    let changed = false;
    const prefix = `${deletedPath}/`;
    this.forEachLeaf((leaf) => {
      if (!leaf.path) return;
      const hit = isDirectory
        ? leaf.path === deletedPath || leaf.path.startsWith(prefix)
        : leaf.path === deletedPath;
      if (!hit) return;
      leaf.type = "empty";
      leaf.path = undefined;
      leaf.mode = undefined;
      changed = true;
    });
    if (changed) this.notify();
  }

  getActivePath(): string | null {
    const pane = this.panes[this.focusedPane];
    const active = pane.leaves.find((l) => l.id === pane.activeId);
    return active?.path ?? null;
  }

  /** All markdown leaves across panes (for editor keep-alive). */
  getAllMarkdownLeaves(): Leaf[] {
    return [...this.panes.left.leaves, ...this.panes.right.leaves].filter(
      (l) => l.type === "markdown" && l.path,
    );
  }
}

export const workspaceStore = new WorkspaceStore();
