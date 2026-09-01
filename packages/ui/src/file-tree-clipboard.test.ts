import { describe, expect, it } from "vitest";
import { fileTreeClipboard } from "./file-tree-clipboard.js";

describe("fileTreeClipboard", () => {
  it("marks cut files and nested paths, then clears", () => {
    fileTreeClipboard.clearCut();
    fileTreeClipboard.setCut(["notes", "a.md"]);
    expect(fileTreeClipboard.isCut("a.md")).toBe(true);
    expect(fileTreeClipboard.isCut("notes")).toBe(true);
    expect(fileTreeClipboard.isCut("notes/b.md")).toBe(true);
    expect(fileTreeClipboard.isCut("other.md")).toBe(false);
    fileTreeClipboard.clearCut();
    expect(fileTreeClipboard.isCut("a.md")).toBe(false);
    expect(fileTreeClipboard.isCut("notes/b.md")).toBe(false);
  });
});
