import { describe, expect, it } from "vitest";
import { droppedPathsFromOsDropPayload } from "@chestnut/storage-adapters";
import { classifyExplorerFileDrop, pathFromDroppedUri } from "./markdown-drop-import.js";

describe("classifyExplorerFileDrop", () => {
  it("accepts markdown files", () => {
    expect(classifyExplorerFileDrop(["C:/notes/a.md", "D:\\drafts\\b.MD"])).toEqual({
      kind: "import",
      markdown: ["C:/notes/a.md", "D:\\drafts\\b.MD"],
      zip: [],
    });
  });

  it("accepts exported zip archives", () => {
    expect(classifyExplorerFileDrop(["C:/target/Note.zip"])).toEqual({
      kind: "import",
      markdown: [],
      zip: ["C:/target/Note.zip"],
    });
  });

  it("accepts a mix of markdown and zip", () => {
    expect(classifyExplorerFileDrop(["C:/a.md", "C:/Note.zip"])).toEqual({
      kind: "import",
      markdown: ["C:/a.md"],
      zip: ["C:/Note.zip"],
    });
  });

  it("rejects other files even when mixed with markdown", () => {
    expect(classifyExplorerFileDrop(["C:/notes/a.md", "C:/notes/a.png"])).toEqual({ kind: "reject" });
    expect(classifyExplorerFileDrop(["C:/notes/photo.png"])).toEqual({ kind: "reject" });
    expect(classifyExplorerFileDrop(["C:/notes"])).toEqual({ kind: "reject" });
  });

  it("ignores empty drops", () => {
    expect(classifyExplorerFileDrop([])).toEqual({ kind: "empty" });
    expect(classifyExplorerFileDrop(["", "  "])).toEqual({ kind: "empty" });
  });
});

describe("droppedPathsFromOsDropPayload", () => {
  it("reads paths from a drop payload and ignores hover events", () => {
    expect(
      droppedPathsFromOsDropPayload({
        type: "drop",
        paths: ["C:\\Desktop\\a.md", "D:/notes/b.md"],
      }),
    ).toEqual(["C:\\Desktop\\a.md", "D:/notes/b.md"]);
    expect(droppedPathsFromOsDropPayload({ type: "enter", paths: ["C:\\Desktop\\a.md"] })).toEqual([]);
    expect(droppedPathsFromOsDropPayload({ type: "over", position: { x: 1, y: 2 } })).toEqual([]);
    expect(droppedPathsFromOsDropPayload({ paths: ["C:\\Desktop\\a.md"] })).toEqual(["C:\\Desktop\\a.md"]);
  });
});

describe("pathFromDroppedUri", () => {
  it("parses file URLs and Windows paths from explorer drops", () => {
    expect(pathFromDroppedUri("file:///C:/Users/me/Desktop/note.md")).toBe("C:/Users/me/Desktop/note.md");
    expect(pathFromDroppedUri("C:\\Users\\me\\Desktop\\note.md")).toBe("C:\\Users\\me\\Desktop\\note.md");
    expect(pathFromDroppedUri("#comment")).toBeNull();
    expect(pathFromDroppedUri("https://example.com/a.md")).toBeNull();
  });
});
