import { describe, expect, it } from "vitest";
import { resolveFolderRowDropZone } from "./file-tree-pointer-dnd.js";

describe("resolveFolderRowDropZone", () => {
  it("treats the top edge as insert before", () => {
    expect(resolveFolderRowDropZone(0, 0, 40)).toBe("before");
    expect(resolveFolderRowDropZone(9, 0, 40)).toBe("before");
  });

  it("treats the center band as move into", () => {
    expect(resolveFolderRowDropZone(20, 0, 40)).toBe("into");
    expect(resolveFolderRowDropZone(120, 100, 40)).toBe("into");
  });

  it("treats the bottom edge as insert after", () => {
    expect(resolveFolderRowDropZone(31, 0, 40)).toBe("after");
    expect(resolveFolderRowDropZone(39, 0, 40)).toBe("after");
  });
});
