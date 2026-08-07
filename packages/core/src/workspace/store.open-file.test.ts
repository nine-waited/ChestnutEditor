import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./store.js";

describe("WorkspaceStore.openFile", () => {
  it("activates an existing tab for the same path instead of replacing the active leaf", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("notes/a.md", { newTab: true });
    const b = store.openFile("notes/b.md", { newTab: true });
    expect(store.getState().activeId).toBe(b);

    const again = store.openFile("notes/a.md");
    expect(again).toBe(a);
    expect(store.getState().activeId).toBe(a);
    expect(store.getState().leaves.filter((l) => l.type === "markdown")).toHaveLength(2);
  });

  it("opens a new tab when the active leaf already has another markdown file", () => {
    const store = new WorkspaceStore();
    const a = store.openFile("notes/a.md");
    const b = store.openFile("notes/b.md");
    expect(b).not.toBe(a);
    expect(store.getState().active?.path).toBe("notes/b.md");
    expect(store.getState().leaves.filter((l) => l.type === "markdown")).toHaveLength(2);
  });

  it("reuses an empty welcome leaf for the first file", () => {
    const store = new WorkspaceStore();
    const emptyId = store.getState().activeId;
    const id = store.openFile("notes/a.md");
    expect(id).toBe(emptyId);
    expect(store.getState().active?.path).toBe("notes/a.md");
  });
});

describe("WorkspaceStore.openExcalidraw", () => {
  it("opens a new tab when the active leaf already has another drawing", () => {
    const store = new WorkspaceStore();
    const a = store.openExcalidraw("draw/a.excalidraw");
    const b = store.openExcalidraw("draw/b.excalidraw");
    expect(b).not.toBe(a);
    expect(store.getState().active?.path).toBe("draw/b.excalidraw");
    expect(store.getState().leaves.filter((l) => l.type === "excalidraw")).toHaveLength(2);
  });

  it("activates an existing drawing tab for the same path", () => {
    const store = new WorkspaceStore();
    const a = store.openExcalidraw("draw/a.excalidraw");
    store.openExcalidraw("draw/b.excalidraw");
    const again = store.openExcalidraw("draw/a.excalidraw");
    expect(again).toBe(a);
    expect(store.getState().activeId).toBe(a);
    expect(store.getState().leaves.filter((l) => l.type === "excalidraw")).toHaveLength(2);
  });
});

describe("WorkspaceStore.closeTab", () => {
  it("closes the last content tab and leaves an empty welcome leaf", () => {
    const store = new WorkspaceStore();
    const id = store.openFile("notes/a.md");
    store.closeTab(id);
    expect(store.getState().leaves).toHaveLength(1);
    expect(store.getState().active?.type).toBe("empty");
    expect(store.getState().active?.path).toBeUndefined();
  });

  it("does nothing when closing the sole empty welcome tab", () => {
    const store = new WorkspaceStore();
    const id = store.getState().activeId;
    store.closeTab(id);
    expect(store.getState().leaves).toHaveLength(1);
    expect(store.getState().active?.type).toBe("empty");
    expect(store.getState().activeId).toBe(id);
  });
});
