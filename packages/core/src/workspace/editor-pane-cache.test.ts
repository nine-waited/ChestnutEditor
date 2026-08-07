import { describe, expect, it } from "vitest";
import { EditorPaneLru, EDITOR_PANE_MOUNT_LIMIT } from "./editor-pane-cache.js";

describe("EditorPaneLru", () => {
  it("touches paths in LRU order and trims to limit", () => {
    const lru = new EditorPaneLru(3);
    lru.touch("a.md");
    lru.touch("b.md");
    lru.touch("c.md");
    lru.touch("d.md");
    expect([...lru.getSnapshot()]).toEqual(["b.md", "c.md", "d.md"]);
    lru.touch("b.md");
    expect([...lru.getSnapshot()]).toEqual(["c.md", "d.md", "b.md"]);
  });

  it("resolveMountPaths keeps ghost paths and pins active", () => {
    const lru = new EditorPaneLru(3);
    for (const path of ["a.md", "b.md", "c.md"]) lru.touch(path);
    // a.md is no longer an open tab, but stays warm until evicted
    expect(lru.resolveMountPaths("d.md")).toEqual(["b.md", "c.md", "d.md"]);
    expect(lru.resolveMountPaths(null)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("remove drops a path", () => {
    const lru = new EditorPaneLru(EDITOR_PANE_MOUNT_LIMIT);
    lru.touch("a.md");
    lru.touch("b.md");
    lru.remove("a.md");
    expect([...lru.getSnapshot()]).toEqual(["b.md"]);
  });

  it("removeUnder drops a path and nested paths", () => {
    const lru = new EditorPaneLru(5);
    lru.touch("keep.md");
    lru.touch("folder/a.md");
    lru.touch("folder/nested/b.md");
    lru.touch("folder.md");
    lru.removeUnder("folder");
    expect([...lru.getSnapshot()]).toEqual(["keep.md", "folder.md"]);
  });
});
