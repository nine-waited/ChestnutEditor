import { describe, expect, it } from "vitest";
import { reorderFileTreeChildPathBlock, reorderFileTreeChildPaths } from "./file-tree-order.js";

const kinds: Record<string, "file" | "directory"> = {
  "a.md": "file",
  "b.md": "file",
  "c.md": "file",
  "d.md": "file",
  notes: "directory",
  docs: "directory",
};

describe("reorderFileTreeChildPathBlock", () => {
  it("moves several files as one block before a sibling", () => {
    const next = reorderFileTreeChildPathBlock(
      {},
      "",
      ["a.md", "b.md", "c.md", "d.md"],
      ["b.md", "d.md"],
      "c.md",
      "file",
      kinds,
    );
    expect(next[""]).toEqual(["a.md", "b.md", "d.md", "c.md"]);
  });

  it("delegates a single path to the existing reorder", () => {
    const display = ["a.md", "b.md", "c.md"];
    const block = reorderFileTreeChildPathBlock({}, "", display, ["b.md"], "c.md", "file", kinds);
    const single = reorderFileTreeChildPaths({}, "", display, "b.md", "c.md", "file", kinds);
    expect(block).toEqual(single);
  });
});
