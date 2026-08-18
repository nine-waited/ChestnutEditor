import { describe, expect, it } from "vitest";
import { WorkspaceStore, type Leaf } from "./store.js";
import { reorderLeavesById } from "./tab-order.js";

function tabs(...ids: string[]): Leaf[] {
  return ids.map((id) => ({ id, type: "markdown", path: `${id}.md` }));
}

describe("reorderLeavesById", () => {
  it("moves a tab to the end", () => {
    const next = reorderLeavesById(tabs("a", "b", "c"), "a", null);
    expect(next?.map((leaf) => leaf.id)).toEqual(["b", "c", "a"]);
  });

  it("moves a tab before another", () => {
    const next = reorderLeavesById(tabs("a", "b", "c"), "c", "a");
    expect(next?.map((leaf) => leaf.id)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when already in place", () => {
    expect(reorderLeavesById(tabs("a", "b", "c"), "a", "b")).toBeNull();
    expect(reorderLeavesById(tabs("a", "b", "c"), "c", null)).toBeNull();
    expect(reorderLeavesById(tabs("a", "b", "c"), "b", "c")).toBeNull();
  });

  it("ignores empty leaves and unknown ids", () => {
    const empty: Leaf = { id: "empty", type: "empty" };
    expect(reorderLeavesById([empty, ...tabs("a")], "empty", null)).toBeNull();
    expect(reorderLeavesById(tabs("a", "b"), "missing", null)).toBeNull();
    expect(reorderLeavesById(tabs("a", "b"), "a", "missing")).toBeNull();
  });
});

describe("WorkspaceStore.reorderLeaf", () => {
  it("reorders tabs in the same pane without changing the active tab", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("a.md");
    const b = store.openFile("b.md", { newTab: true });
    const c = store.openFile("c.md", { newTab: true });
    expect(store.getState().activeId).toBe(c);

    expect(store.reorderLeaf(c, a)).toBe(true);
    expect(store.getState().leaves.map((leaf) => leaf.id)).toEqual([c, a, b]);
    expect(store.getState().activeId).toBe(c);
  });

  it("returns false when the order is unchanged", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("a.md");
    const b = store.openFile("b.md", { newTab: true });
    expect(store.reorderLeaf(a, b)).toBe(false);
  });

  it("inserts a newly opened tab before an existing one", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md");
    const b = store.openFile("b.md", { newTab: true });
    const c = store.openFile("c.md", { newTab: true });
    expect(store.reorderLeaf(c, b)).toBe(true);
    expect(store.getState().leaves.map((leaf) => leaf.path)).toEqual(["a.md", "c.md", "b.md"]);
  });
});
