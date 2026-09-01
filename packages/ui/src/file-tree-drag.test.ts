import { beforeEach, describe, expect, it } from "vitest";
import {
  canDropFileTreePayload,
  fileTreeDragEntries,
  isFileTreeDragSourcePath,
  resolveFileTreeDragEntries,
  sortVaultEntriesByVisibleOrder,
} from "./file-tree-move.js";
import { fileTreeSelection } from "./file-tree-selection.js";

describe("resolveFileTreeDragEntries", () => {
  beforeEach(() => {
    fileTreeSelection.clear();
  });

  it("drags only the source when it is not in a multi-selection", () => {
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.togglePath("b.md", "file");
    expect(resolveFileTreeDragEntries("c.md", "file")).toEqual([{ path: "c.md", kind: "file" }]);
  });

  it("drags every selected item when the source is selected", () => {
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.togglePath("b.md", "file");
    fileTreeSelection.togglePath("docs", "directory");
    expect(resolveFileTreeDragEntries("b.md", "file")).toEqual([
      { path: "a.md", kind: "file" },
      { path: "b.md", kind: "file" },
      { path: "docs", kind: "directory" },
    ]);
  });

  it("drops nested files when an ancestor folder is also selected", () => {
    fileTreeSelection.selectExclusive("docs", "directory");
    fileTreeSelection.togglePath("docs/a.md", "file");
    expect(resolveFileTreeDragEntries("docs/a.md", "file")).toEqual([
      { path: "docs", kind: "directory" },
    ]);
  });
});

describe("sortVaultEntriesByVisibleOrder", () => {
  it("orders selected entries by the visible tree sequence", () => {
    const selected = [
      { path: "c.md", kind: "file" as const },
      { path: "a.md", kind: "file" as const },
    ];
    const visible = [
      { path: "a.md", kind: "file" as const },
      { path: "b.md", kind: "file" as const },
      { path: "c.md", kind: "file" as const },
    ];
    expect(sortVaultEntriesByVisibleOrder(selected, visible)).toEqual([
      { path: "a.md", kind: "file" },
      { path: "c.md", kind: "file" },
    ]);
  });
});

describe("fileTreeDrag payload helpers", () => {
  it("treats descendants of a dragged folder as sources", () => {
    const payload = {
      path: "docs",
      kind: "directory" as const,
      entries: [{ path: "docs", kind: "directory" as const }],
    };
    expect(isFileTreeDragSourcePath(payload, "docs")).toBe(true);
    expect(isFileTreeDragSourcePath(payload, "docs/a.md")).toBe(true);
    expect(isFileTreeDragSourcePath(payload, "other.md")).toBe(false);
  });

  it("allows dropping a multi-selection into a folder if any item can move", () => {
    const payload = {
      path: "a.md",
      kind: "file" as const,
      entries: [
        { path: "a.md", kind: "file" as const },
        { path: "notes/b.md", kind: "file" as const },
      ],
    };
    expect(canDropFileTreePayload(payload, "notes")).toBe(true);
    expect(canDropFileTreePayload(payload, "")).toBe(true);
    expect(fileTreeDragEntries(payload)).toHaveLength(2);
  });

  it("rejects dropping a folder into itself", () => {
    const payload = {
      path: "docs",
      kind: "directory" as const,
      entries: [
        { path: "docs", kind: "directory" as const },
        { path: "a.md", kind: "file" as const },
      ],
    };
    expect(canDropFileTreePayload(payload, "docs")).toBe(false);
    expect(canDropFileTreePayload(payload, "docs/sub")).toBe(false);
  });
});
