import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./store.js";

describe("WorkspaceStore split", () => {
  it("moves the active tab to the right when entering split with multiple tabs", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    expect(store.getState().active?.path).toBe("b.md");

    store.setSplit(true);
    const state = store.getState();
    expect(state.split).toBe(true);
    expect(state.panes.right.active?.path).toBe("b.md");
    expect(state.panes.left.leaves.some((l) => l.path === "a.md")).toBe(true);
    expect(state.panes.left.leaves.some((l) => l.path === "b.md")).toBe(false);
    expect(state.focusedPane).toBe("right");
  });

  it("keeps a single tab on the left and leaves the right empty", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md");
    store.setSplit(true);
    const state = store.getState();
    expect(state.split).toBe(true);
    expect(state.panes.left.active?.path).toBe("a.md");
    expect(state.panes.right.active?.type).toBe("empty");
    expect(state.focusedPane).toBe("left");
  });

  it("does not open the same path on both panes", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    // b is on right; try opening a on right focused pane
    store.setFocusedPane("right");
    store.openFile("a.md");
    const state = store.getState();
    expect(state.focusedPane).toBe("left");
    expect(state.panes.left.active?.path).toBe("a.md");
    expect(state.panes.right.leaves.filter((l) => l.path === "a.md")).toHaveLength(0);
  });

  it("closeAllTabs on one pane does not exit split", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    store.closeAllTabs("right");
    expect(store.getState().split).toBe(true);
    expect(store.getState().panes.right.active?.type).toBe("empty");
    expect(store.getState().panes.left.leaves.some((l) => l.path === "a.md")).toBe(true);
  });

  it("merges and dedupes when exiting split", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    store.setSplit(false);
    const state = store.getState();
    expect(state.split).toBe(false);
    const paths = state.panes.left.leaves.filter((l) => l.path).map((l) => l.path);
    expect(paths.sort()).toEqual(["a.md", "b.md"]);
  });

  it("moves a leaf from left to right", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    // After split, b is on right; a on left. Move a to right.
    store.moveLeafToPane(a, "right");
    const state = store.getState();
    expect(state.panes.right.leaves.some((l) => l.path === "a.md")).toBe(true);
    expect(state.panes.left.leaves.some((l) => l.path === "a.md")).toBe(false);
    expect(state.focusedPane).toBe("right");
  });

  it("splitWithLeaf moves the dragged tab to the right and enters split", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    expect(store.splitWithLeaf(a)).toBe(true);
    const state = store.getState();
    expect(state.split).toBe(true);
    expect(state.panes.right.active?.path).toBe("a.md");
    expect(state.panes.left.leaves.some((l) => l.path === "b.md")).toBe(true);
    expect(state.panes.left.leaves.some((l) => l.path === "a.md")).toBe(false);
    expect(state.focusedPane).toBe("right");
  });

  it("splitWithLeaf works with a single tab (left becomes empty)", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("a.md");
    expect(store.splitWithLeaf(a)).toBe(true);
    const state = store.getState();
    expect(state.split).toBe(true);
    expect(state.panes.right.active?.path).toBe("a.md");
    expect(state.panes.left.active?.type).toBe("empty");
    expect(state.focusedPane).toBe("right");
  });
});
