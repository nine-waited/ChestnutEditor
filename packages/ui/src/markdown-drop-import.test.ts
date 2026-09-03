import { describe, expect, it } from "vitest";
import { classifyExplorerFileDrop } from "./markdown-drop-import.js";

describe("classifyExplorerFileDrop", () => {
  it("accepts only markdown files", () => {
    expect(classifyExplorerFileDrop(["C:/notes/a.md", "D:\\drafts\\b.MD"])).toEqual({
      kind: "markdown",
      paths: ["C:/notes/a.md", "D:\\drafts\\b.MD"],
    });
  });

  it("rejects non-markdown files even when mixed with markdown", () => {
    expect(classifyExplorerFileDrop(["C:/notes/a.md", "C:/notes/a.png"])).toEqual({ kind: "reject" });
    expect(classifyExplorerFileDrop(["C:/notes/photo.png"])).toEqual({ kind: "reject" });
    expect(classifyExplorerFileDrop(["C:/notes"])).toEqual({ kind: "reject" });
  });

  it("ignores empty drops", () => {
    expect(classifyExplorerFileDrop([])).toEqual({ kind: "empty" });
    expect(classifyExplorerFileDrop(["", "  "])).toEqual({ kind: "empty" });
  });
});
