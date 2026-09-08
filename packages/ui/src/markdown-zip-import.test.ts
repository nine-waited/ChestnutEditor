import { describe, expect, it } from "vitest";
import {
  isSafeZipEntryPath,
  listZipMarkdownPaths,
  lookupZipFile,
  zipEntryParentDir,
  zipJoin,
} from "./markdown-zip-import.js";

describe("zip path helpers", () => {
  it("joins zip-relative image paths next to a markdown file", () => {
    expect(zipJoin("Note", "cover.png")).toBe("Note/cover.png");
    expect(zipJoin("", "cover.png")).toBe("cover.png");
    expect(zipJoin("Note", "Note_pic/a.png")).toBe("Note/Note_pic/a.png");
  });

  it("reads the parent folder of a zip entry", () => {
    expect(zipEntryParentDir("Note/Note.md")).toBe("Note");
    expect(zipEntryParentDir("Note.md")).toBe("");
  });

  it("skips traversal and macOS metadata entries", () => {
    expect(isSafeZipEntryPath("Note/Note.md")).toBe(true);
    expect(isSafeZipEntryPath("../secret.md")).toBe(false);
    expect(isSafeZipEntryPath("__MACOSX/Note.md")).toBe(false);
    expect(isSafeZipEntryPath("Note/._Note.md")).toBe(false);
  });

  it("lists markdown notes from a Chestnut export zip layout", () => {
    expect(listZipMarkdownPaths(["Note/Note.md", "Note/cover.png", "__MACOSX/foo.md"])).toEqual([
      "Note/Note.md",
    ]);
  });

  it("looks up zip files case-insensitively", () => {
    const files = new Map<string, Uint8Array>([["Note/Cover.PNG", new Uint8Array([1])]]);
    expect(lookupZipFile(files, "Note/cover.png")?.length).toBe(1);
  });
});
