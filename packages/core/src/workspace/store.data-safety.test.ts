import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./store.js";

/** DS-007: at most one editable leaf for a markdown path across both panes. */
function editableMarkdownCount(store: WorkspaceStore, path: string): number {
  const state = store.getState();
  return [...state.panes.left.leaves, ...state.panes.right.leaves].filter(
    (l) => l.type === "markdown" && l.path === path && !l.viewOnly,
  ).length;
}

describe("WorkspaceStore data-safety (single writer)", () => {
  it("DS-007: opening the same md on both panes leaves exactly one writer", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openFile("a.md");
    expect(editableMarkdownCount(store, "a.md")).toBe(1);
    const leftA = store.getState().panes.left.leaves.find((l) => l.path === "a.md");
    const rightA = store.getState().panes.right.leaves.find((l) => l.path === "a.md");
    expect(leftA?.viewOnly).toBeFalsy();
    expect(rightA?.viewOnly).toBe(true);
  });

  it("DS-004/DS-007: setMarkdownViewOnly always keeps exactly one writer", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openFile("a.md");

    const leftId = store.getState().panes.left.leaves.find((l) => l.path === "a.md")!.id;
    const rightId = store.getState().panes.right.leaves.find((l) => l.path === "a.md")!.id;

    store.setMarkdownViewOnly(rightId, false);
    expect(editableMarkdownCount(store, "a.md")).toBe(1);
    expect(store.getState().panes.right.leaves.find((l) => l.id === rightId)?.viewOnly).toBeFalsy();
    expect(store.getState().panes.left.leaves.find((l) => l.id === leftId)?.viewOnly).toBe(true);

    store.setMarkdownViewOnly(leftId, false);
    expect(editableMarkdownCount(store, "a.md")).toBe(1);
    expect(store.getState().panes.left.leaves.find((l) => l.id === leftId)?.viewOnly).toBeFalsy();
    expect(store.getState().panes.right.leaves.find((l) => l.id === rightId)?.viewOnly).toBe(true);
  });

  it("DS-007: closing one twin restores a single editable sole copy", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openFile("a.md");
    store.closeTab(store.getState().panes.right.activeId);
    expect(editableMarkdownCount(store, "a.md")).toBe(1);
    expect(store.getState().panes.left.leaves.find((l) => l.path === "a.md")?.viewOnly).toBeFalsy();
  });

  it("DS-007: exiting split merges twin and clears view-only", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openFile("a.md");
    store.setSplit(false);
    const copies = store.getState().panes.left.leaves.filter((l) => l.path === "a.md");
    expect(copies).toHaveLength(1);
    expect(copies[0].viewOnly).toBeFalsy();
    expect(editableMarkdownCount(store, "a.md")).toBe(1);
  });

  it("DS-007: non-markdown paths cannot open as twins on both panes", () => {
    const store = new WorkspaceStore();
    store.openExcalidraw("a.excalidraw", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openExcalidraw("a.excalidraw");
    expect(store.getState().focusedPane).toBe("left");
    expect(store.getState().panes.right.leaves.filter((l) => l.path === "a.excalidraw")).toHaveLength(
      0,
    );
  });
});

describe("WorkspaceStore data-safety (clearPathsForDelete)", () => {
  it("DS-009: deleting a file clears matching leaf path so keep-alive cannot target it", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.clearPathsForDelete("a.md", false);
    const leaf = store.getState().panes.left.leaves[0];
    expect(leaf.type).toBe("empty");
    expect(leaf.path).toBeUndefined();
  });

  it("DS-009: deleting a directory clears nested leaf paths", () => {
    const store = new WorkspaceStore();
    store.openFile("notes/a.md", { newTab: true });
    store.openFile("notes/b.md", { newTab: true });
    store.openFile("other.md", { newTab: true });
    store.clearPathsForDelete("notes", true);
    const leaves = store.getState().panes.left.leaves;
    const notesLeaves = leaves.filter((l) => l.id && !l.path && l.type === "empty");
    // Both notes/* leaves cleared; other.md remains
    expect(leaves.some((l) => l.path === "other.md")).toBe(true);
    expect(leaves.some((l) => l.path === "notes/a.md" || l.path === "notes/b.md")).toBe(false);
    expect(notesLeaves.length).toBeGreaterThanOrEqual(2);
  });

  it("DS-009: clears both panes for the same deleted path", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.setSplit(true);
    store.setFocusedPane("right");
    store.openFile("a.md");
    store.clearPathsForDelete("a.md", false);
    for (const pane of [store.getState().panes.left, store.getState().panes.right]) {
      for (const leaf of pane.leaves) {
        if (leaf.type === "empty") {
          expect(leaf.path).toBeUndefined();
        } else {
          expect(leaf.path).not.toBe("a.md");
        }
      }
    }
    expect(
      [...store.getState().panes.left.leaves, ...store.getState().panes.right.leaves].some(
        (l) => l.path === "a.md",
      ),
    ).toBe(false);
  });
});
