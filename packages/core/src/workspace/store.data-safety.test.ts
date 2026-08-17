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
});
