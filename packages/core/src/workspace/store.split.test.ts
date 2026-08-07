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

  it("exits split when all tabs on one pane are closed", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    store.closeAllTabs("right");
    expect(store.getState().split).toBe(false);
    expect(store.getState().panes.left.leaves.some((l) => l.path === "a.md")).toBe(true);
    expect(store.getState().focusedPane).toBe("left");
  });

  it("exits split when the last content tab on a pane is closed", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    const rightId = store.getState().panes.right.activeId;
    store.closeTab(rightId);
    expect(store.getState().split).toBe(false);
    expect(store.getState().panes.left.active?.path).toBe("a.md");
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
    // Moving the last left tab empties that pane and exits split.
    expect(state.split).toBe(false);
    expect(state.panes.left.leaves.some((l) => l.path === "a.md")).toBe(true);
    expect(state.panes.left.leaves.some((l) => l.path === "b.md")).toBe(true);
    expect(state.focusedPane).toBe("left");
  });

  it("exits split when the last tab is dragged to the other pane", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    const b = store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    expect(store.getState().panes.right.activeId).toBe(b);
    store.moveLeafToPane(b, "left");
    const state = store.getState();
    expect(state.split).toBe(false);
    expect(state.panes.left.leaves.map((l) => l.path).sort()).toEqual(["a.md", "b.md"]);
  });

  it("keeps split when a non-last tab is dragged to the other pane", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md", { newTab: true });
    const b = store.openFile("b.md", { newTab: true });
    store.openFile("c.md", { newTab: true });
    store.setSplit(true);
    // right has c; left has a,b. Move b to right — left still has a.
    store.moveLeafToPane(b, "right");
    const state = store.getState();
    expect(state.split).toBe(true);
    expect(state.panes.left.leaves.some((l) => l.path === "a.md")).toBe(true);
    expect(state.panes.right.leaves.some((l) => l.path === "b.md")).toBe(true);
    expect(state.panes.right.leaves.some((l) => l.path === "c.md")).toBe(true);
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
