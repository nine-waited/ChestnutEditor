import { beforeEach, describe, expect, it } from "vitest";
import {
  fileTreeSelection,
  resolveNewItemParentDir,
} from "./file-tree-selection.js";

describe("fileTreeSelection.selectExclusiveOrClear", () => {
  beforeEach(() => {
    fileTreeSelection.clear();
  });

  it("selects a path on first click", () => {
    expect(fileTreeSelection.selectExclusiveOrClear("notes/a.md", "file")).toBe(false);
    expect(fileTreeSelection.isSelected("notes/a.md")).toBe(true);
    expect(fileTreeSelection.getPrimaryPath()).toBe("notes/a.md");
  });

  it("clears when clicking the sole focused item again", () => {
    fileTreeSelection.selectExclusive("notes/a.md", "file");
    expect(fileTreeSelection.selectExclusiveOrClear("notes/a.md", "file")).toBe(true);
    expect(fileTreeSelection.hasSelection()).toBe(false);
    expect(fileTreeSelection.getPrimaryPath()).toBeNull();
    expect(fileTreeSelection.shouldSuppressRevealFocus("notes/a.md")).toBe(true);
  });

  it("lets reveal restore focus after switching to another file", () => {
    fileTreeSelection.selectExclusive("notes/a.md", "file");
    fileTreeSelection.selectExclusiveOrClear("notes/a.md", "file");
    expect(fileTreeSelection.getSuppressRevealFocusPath()).toBe("notes/a.md");
    expect(fileTreeSelection.shouldSuppressRevealFocus("notes/b.md")).toBe(false);
    fileTreeSelection.clearRevealFocusSuppress();
    expect(fileTreeSelection.shouldSuppressRevealFocus("notes/a.md")).toBe(false);
  });

  it("narrows multi-selection to the clicked path instead of clearing", () => {
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.togglePath("b.md", "file");
    expect(fileTreeSelection.selectExclusiveOrClear("a.md", "file")).toBe(false);
    expect(fileTreeSelection.getSelectedEntries()).toEqual([{ path: "a.md", kind: "file" }]);
  });
});

describe("resolveNewItemParentDir", () => {
  beforeEach(() => {
    fileTreeSelection.clear();
  });

  it("returns vault root when nothing is focused", () => {
    expect(resolveNewItemParentDir()).toBe("");
  });

  it("uses the selected folder when focused", () => {
    fileTreeSelection.selectExclusive("docs", "directory");
    expect(resolveNewItemParentDir()).toBe("docs");
  });

  it("uses the parent of a focused file", () => {
    fileTreeSelection.selectExclusive("docs/readme.md", "file");
    expect(resolveNewItemParentDir()).toBe("docs");
  });
});

describe("fileTreeSelection plain click vs multi-select", () => {
  beforeEach(() => {
    fileTreeSelection.clear();
  });

  it("plain click keeps a single focus even across kinds", () => {
    fileTreeSelection.selectExclusive("docs", "directory");
    fileTreeSelection.selectExclusiveOrClear("a.md", "file");
    expect(fileTreeSelection.getSelectedEntries()).toEqual([{ path: "a.md", kind: "file" }]);
  });

  it("allows mixed file and folder focus in multi-select", () => {
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.togglePath("docs", "directory");
    expect(fileTreeSelection.getSelectedEntries()).toEqual([
      { path: "a.md", kind: "file" },
      { path: "docs", kind: "directory" },
    ]);
  });
});
