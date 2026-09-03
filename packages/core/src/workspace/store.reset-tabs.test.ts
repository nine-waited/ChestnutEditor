import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./store.js";

describe("WorkspaceStore.resetWorkspaceTabs", () => {
  it("closes every tab in both panes and exits split", () => {
    const store = new WorkspaceStore();
    store.openFile("a.md");
    store.openFile("b.md", { newTab: true });
    store.setSplit(true);
    store.openFile("c.md", { pane: "right", newTab: true });

    store.resetWorkspaceTabs();

    const state = store.getState();
    expect(state.split).toBe(false);
    expect(state.panes.left.leaves).toHaveLength(1);
    expect(state.panes.left.leaves[0]?.type).toBe("empty");
    expect(state.panes.right.leaves).toHaveLength(1);
    expect(state.panes.right.leaves[0]?.type).toBe("empty");
    expect(state.active?.type).toBe("empty");
  });
});
