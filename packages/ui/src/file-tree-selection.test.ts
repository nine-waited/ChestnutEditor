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

  it("clearFocus drops all selection and suppresses reveal for the primary path", () => {
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.togglePath("b.md", "file");
    fileTreeSelection.clearFocus();
    expect(fileTreeSelection.hasSelection()).toBe(false);
    expect(fileTreeSelection.shouldSuppressRevealFocus("b.md")).toBe(true);
  });

  it("keeps suppress while multi-selecting other files after clearing the open file", () => {
    fileTreeSelection.selectExclusive("open.md", "file");
    fileTreeSelection.selectExclusiveOrClear("open.md", "file");
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(true);

    fileTreeSelection.togglePath("b.md", "file");
    fileTreeSelection.togglePath("c.md", "file");

    expect(fileTreeSelection.getSelectedEntries()).toEqual([
      { path: "b.md", kind: "file" },
      { path: "c.md", kind: "file" },
    ]);
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(true);
    expect(fileTreeSelection.isSelected("open.md")).toBe(false);
  });

  it("clears suppress when the dismissed file is explicitly toggled back in", () => {
    fileTreeSelection.selectExclusive("open.md", "file");
    fileTreeSelection.selectExclusiveOrClear("open.md", "file");
    fileTreeSelection.togglePath("b.md", "file");
    fileTreeSelection.togglePath("open.md", "file");

    expect(fileTreeSelection.isSelected("open.md")).toBe(true);
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(false);
  });

  it("Shift range skips the dismissed open file between other files", () => {
    const visible = [
      { path: "a.md", kind: "file" as const },
      { path: "open.md", kind: "file" as const },
      { path: "b.md", kind: "file" as const },
      { path: "c.md", kind: "file" as const },
    ];
    fileTreeSelection.selectExclusive("open.md", "file");
    fileTreeSelection.selectExclusiveOrClear("open.md", "file");
    fileTreeSelection.togglePath("a.md", "file");
    fileTreeSelection.selectRange(visible, "c.md", "file");

    expect(fileTreeSelection.getSelectedEntries()).toEqual([
      { path: "a.md", kind: "file" },
      { path: "b.md", kind: "file" },
      { path: "c.md", kind: "file" },
    ]);
    expect(fileTreeSelection.isSelected("open.md")).toBe(false);
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(true);
  });

  it("keeps suppress after exclusive-selecting another file then Shift ranging", () => {
    const visible = [
      { path: "a.md", kind: "file" as const },
      { path: "open.md", kind: "file" as const },
      { path: "b.md", kind: "file" as const },
    ];
    fileTreeSelection.selectExclusive("open.md", "file");
    fileTreeSelection.selectExclusiveOrClear("open.md", "file");
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.selectRange(visible, "b.md", "file");

    expect(fileTreeSelection.isSelected("open.md")).toBe(false);
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(true);
    expect(fileTreeSelection.getSelectedEntries()).toEqual([
      { path: "a.md", kind: "file" },
      { path: "b.md", kind: "file" },
    ]);
  });

  it("can suppress an open file when focus moves to a folder without clearing first", () => {
    const visible = [
      { path: "docs", kind: "directory" as const },
      { path: "open.md", kind: "file" as const },
      { path: "notes", kind: "directory" as const },
    ];
    fileTreeSelection.selectExclusive("open.md", "file");
    fileTreeSelection.selectExclusive("docs", "directory");
    fileTreeSelection.suppressRevealFocusFor("open.md");
    fileTreeSelection.selectRange(visible, "notes", "directory");

    expect(fileTreeSelection.isSelected("open.md")).toBe(false);
    expect(fileTreeSelection.shouldSuppressRevealFocus("open.md")).toBe(true);
    expect(fileTreeSelection.getSelectedEntries().map((e) => e.path)).toEqual(["docs", "notes"]);
  });
});

describe("fileTreeSelection keepKeyboardFocus", () => {
  beforeEach(() => {
    fileTreeSelection.clear();
    fileTreeSelection.setKeepKeyboardFocus(false);
  });

  it("defaults to false", () => {
    expect(fileTreeSelection.shouldKeepKeyboardFocus()).toBe(false);
  });

  it("remembers the file-tree keyboard-focus lock", () => {
    fileTreeSelection.setKeepKeyboardFocus(true);
    expect(fileTreeSelection.shouldKeepKeyboardFocus()).toBe(true);
    fileTreeSelection.setKeepKeyboardFocus(false);
    expect(fileTreeSelection.shouldKeepKeyboardFocus()).toBe(false);
  });

  it("does not clear the lock when selection is cleared", () => {
    fileTreeSelection.setKeepKeyboardFocus(true);
    fileTreeSelection.selectExclusive("a.md", "file");
    fileTreeSelection.clear();
    expect(fileTreeSelection.shouldKeepKeyboardFocus()).toBe(true);
  });
});
