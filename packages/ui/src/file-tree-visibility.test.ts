import { describe, expect, it } from "vitest";
import type { VaultEntry } from "@chestnut/core";
import { isFileTreeEntryVisible, isFileTreeListedFile } from "./file-tree-visibility.js";

function file(path: string): VaultEntry {
  return { path, name: path.split("/").pop() ?? path, kind: "file" };
}

function dir(path: string): VaultEntry {
  return { path, name: path.split("/").pop() ?? path, kind: "directory" };
}

describe("isFileTreeListedFile", () => {
  it("allows markdown, pdf, and zip", () => {
    expect(isFileTreeListedFile("notes/a.md")).toBe(true);
    expect(isFileTreeListedFile("export/Doc.PDF")).toBe(true);
    expect(isFileTreeListedFile("target/bundle.ZIP")).toBe(true);
  });

  it("hides other files including extensionless text", () => {
    expect(isFileTreeListedFile("notes/a.excalidraw")).toBe(false);
    expect(isFileTreeListedFile("notes/a_pic/photo.png")).toBe(false);
    expect(isFileTreeListedFile("notes/todo.txt")).toBe(false);
    expect(isFileTreeListedFile("notes/LICENSE")).toBe(false);
    expect(isFileTreeListedFile("notes/README")).toBe(false);
  });
});

describe("isFileTreeEntryVisible", () => {
  it("keeps folders except hidden _pic when that setting is off", () => {
    expect(isFileTreeEntryVisible(dir("notes"), false)).toBe(true);
    expect(isFileTreeEntryVisible(dir("notes/a_pic"), false)).toBe(false);
    expect(isFileTreeEntryVisible(dir("notes/a_pic"), true)).toBe(true);
  });

  it("lists only md, pdf, and zip files", () => {
    expect(isFileTreeEntryVisible(file("a.md"), true)).toBe(true);
    expect(isFileTreeEntryVisible(file("a.pdf"), true)).toBe(true);
    expect(isFileTreeEntryVisible(file("a.zip"), true)).toBe(true);
    expect(isFileTreeEntryVisible(file("LICENSE"), true)).toBe(false);
    expect(isFileTreeEntryVisible(file("sketch.excalidraw"), true)).toBe(false);
    expect(isFileTreeEntryVisible(file("photo.png"), true)).toBe(false);
  });
});
