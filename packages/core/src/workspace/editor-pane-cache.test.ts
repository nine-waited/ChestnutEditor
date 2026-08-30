import { describe, expect, it } from "vitest";
import {
  EditorPaneLru,
  EditorPaneLruHost,
  EDITOR_PANE_MOUNT_LIMIT,
  resolvePaneMarkdownMountPaths,
} from "./editor-pane-cache.js";

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

  it("remap follows a renamed path and drops the duplicate slot", () => {
    const lru = new EditorPaneLru(5);
    lru.touch("未命名.md");
    lru.touch("会议纪要.md");
    lru.remap("未命名.md", "会议纪要.md");
    expect([...lru.getSnapshot()]).toEqual(["会议纪要.md"]);
  });

  it("remap is a no-op when neither path is mounted", () => {
    const lru = new EditorPaneLru(3);
    lru.touch("a.md");
    lru.remap("missing.md", "other.md");
    expect([...lru.getSnapshot()]).toEqual(["a.md"]);
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

describe("EditorPaneLruHost", () => {
  it("keeps left and right LRU histories independent", () => {
    const host = new EditorPaneLruHost(3);
    host.forPane("left").touch("left.md");
    host.forPane("right").touch("right.md");
    expect([...host.forPane("left").getSnapshot()]).toEqual(["left.md"]);
    expect([...host.forPane("right").getSnapshot()]).toEqual(["right.md"]);
  });

  it("remove clears a path from both panes", () => {
    const host = new EditorPaneLruHost(3);
    host.forPane("left").touch("shared.md");
    host.forPane("right").touch("shared.md");
    host.remove("shared.md");
    expect([...host.forPane("left").getSnapshot()]).toEqual([]);
    expect([...host.forPane("right").getSnapshot()]).toEqual([]);
  });

  it("remap updates both panes", () => {
    const host = new EditorPaneLruHost(3);
    host.forPane("left").touch("未命名.md");
    host.forPane("right").touch("未命名.md");
    host.remap("未命名.md", "会议纪要.md");
    expect([...host.forPane("left").getSnapshot()]).toEqual(["会议纪要.md"]);
    expect([...host.forPane("right").getSnapshot()]).toEqual(["会议纪要.md"]);
  });
});

describe("resolvePaneMarkdownMountPaths", () => {
  it("always keeps own leaf paths even if open in the other pane", () => {
    expect(
      resolvePaneMarkdownMountPaths({
        ownLeafPaths: ["a.md"],
        lruPaths: [],
        otherPaneOpenPaths: ["a.md"],
      }),
    ).toEqual(["a.md"]);
  });

  it("drops LRU ghosts that are already open in the other split pane", () => {
    expect(
      resolvePaneMarkdownMountPaths({
        ownLeafPaths: ["left.md"],
        lruPaths: ["left.md", "moved.md", "ghost.md"],
        otherPaneOpenPaths: ["moved.md"],
      }),
    ).toEqual(["left.md", "ghost.md"]);
  });
});
