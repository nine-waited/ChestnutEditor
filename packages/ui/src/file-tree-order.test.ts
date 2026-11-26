import { describe, expect, it } from "vitest";
import type { VaultEntry } from "@chestnut/core";
import {
  applyFileTreeChildOrder,
  attachNotePicFoldersToNotes,
  placeFileTreeChildAtTop,
  reorderFileTreeChildPathBlock,
  reorderFileTreeChildPaths,
} from "./file-tree-order.js";

const kinds: Record<string, "file" | "directory"> = {
  "a.md": "file",
  "b.md": "file",
  "c.md": "file",
  "d.md": "file",
  notes: "directory",
  docs: "directory",
};

function entry(path: string, kind: "file" | "directory"): VaultEntry {
  return { path, name: path.split("/").pop() ?? path, kind };
}

describe("applyFileTreeChildOrder", () => {
  it("keeps folders above files while honoring saved order inside each zone", () => {
    const entries = [
      entry("docs", "directory"),
      entry("notes", "directory"),
      entry("a.md", "file"),
      entry("b.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {
      "": ["b.md", "notes", "a.md", "docs"],
    });
    expect(next.map((item) => item.path)).toEqual(["notes", "docs", "b.md", "a.md"]);
  });

  it("lands a file saved among folders first in the file zone", () => {
    const entries = [
      entry("docs", "directory"),
      entry("notes", "directory"),
      entry("a.md", "file"),
      entry("b.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {
      "": ["docs", "b.md", "notes", "a.md"],
    });
    expect(next.map((item) => item.path)).toEqual(["docs", "notes", "b.md", "a.md"]);
  });

  it("lands a folder saved among files last in the folder zone", () => {
    const entries = [
      entry("docs", "directory"),
      entry("notes", "directory"),
      entry("a.md", "file"),
      entry("b.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {
      "": ["notes", "a.md", "docs", "b.md"],
    });
    expect(next.map((item) => item.path)).toEqual(["notes", "docs", "a.md", "b.md"]);
  });

  it("keeps the export target folder last at vault root", () => {
    const entries = [
      entry("docs", "directory"),
      entry("target", "directory"),
      entry("a.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {
      "": ["a.md", "docs", "target"],
    });
    expect(next.map((item) => item.path)).toEqual(["docs", "a.md", "target"]);
  });

  it("glues a _pic folder to its markdown even when saved order separates them", () => {
    const entries = [
      entry("docs", "directory"),
      entry("a_pic", "directory"),
      entry("a.md", "file"),
      entry("b.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {
      "": ["a_pic", "b.md", "a.md", "docs"],
    });
    expect(next.map((item) => item.path)).toEqual(["docs", "b.md", "a.md", "a_pic"]);
  });

  it("applies the same zones inside nested folders", () => {
    const entries = [
      entry("docs/x.md", "file"),
      entry("docs/sub", "directory"),
      entry("docs/x_pic", "directory"),
    ];
    const next = applyFileTreeChildOrder(entries, "docs", {
      docs: ["docs/x_pic", "docs/x.md", "docs/sub"],
    });
    expect(next.map((item) => item.path)).toEqual(["docs/sub", "docs/x.md", "docs/x_pic"]);
  });

  it("places _pic after its note by default when no custom order exists", () => {
    const entries = [
      entry("docs", "directory"),
      entry("a_pic", "directory"),
      entry("a.md", "file"),
      entry("b.md", "file"),
    ];
    const next = applyFileTreeChildOrder(entries, "", {});
    expect(next.map((item) => item.path)).toEqual(["docs", "a.md", "a_pic", "b.md"]);
  });
});

describe("attachNotePicFoldersToNotes", () => {
  it("follows the matching markdown and prefers it over an excalidraw twin", () => {
    const next = attachNotePicFoldersToNotes([
      entry("a.excalidraw", "file"),
      entry("a.md", "file"),
      entry("a_pic", "directory"),
    ]);
    expect(next.map((item) => item.path)).toEqual(["a.excalidraw", "a.md", "a_pic"]);
  });

  it("follows an excalidraw note when there is no markdown sibling", () => {
    const next = attachNotePicFoldersToNotes([
      entry("a_pic", "directory"),
      entry("a.excalidraw", "file"),
    ]);
    expect(next.map((item) => item.path)).toEqual(["a.excalidraw", "a_pic"]);
  });

  it("keeps orphan _pic folders after bound pairs", () => {
    const next = attachNotePicFoldersToNotes([
      entry("orphan_pic", "directory"),
      entry("a.md", "file"),
      entry("a_pic", "directory"),
    ]);
    expect(next.map((item) => item.path)).toEqual(["a.md", "a_pic", "orphan_pic"]);
  });
});

describe("placeFileTreeChildAtTop", () => {
  const entries = [
    entry("docs", "directory"),
    entry("notes", "directory"),
    entry("a.md", "file"),
    entry("b.md", "file"),
  ];
  const display = ["docs", "notes", "a.md", "b.md"];

  it("shows a new folder first in the folder zone", () => {
    const order = placeFileTreeChildAtTop({}, "", "new", display);
    const next = applyFileTreeChildOrder([...entries, entry("new", "directory")], "", order);
    expect(next.map((item) => item.path)).toEqual(["new", "docs", "notes", "a.md", "b.md"]);
  });

  it("shows a new file first in the file zone", () => {
    const order = placeFileTreeChildAtTop({}, "", "new.md", display);
    const next = applyFileTreeChildOrder([...entries, entry("new.md", "file")], "", order);
    expect(next.map((item) => item.path)).toEqual(["docs", "notes", "new.md", "a.md", "b.md"]);
  });
});

describe("reorderFileTreeChildPaths", () => {
  it("inserts a folder between files", () => {
    const next = reorderFileTreeChildPaths(
      {},
      "",
      ["docs", "notes", "a.md", "b.md"],
      "docs",
      "b.md",
      "directory",
      kinds,
    );
    expect(next[""]).toEqual(["notes", "a.md", "docs", "b.md"]);
  });

  it("inserts a folder after the last file", () => {
    const next = reorderFileTreeChildPaths(
      {},
      "",
      ["docs", "notes", "a.md", "b.md"],
      "notes",
      null,
      "directory",
      kinds,
    );
    expect(next[""]).toEqual(["docs", "a.md", "b.md", "notes"]);
  });
});

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

  it("moves several folders as one block before a file", () => {
    const next = reorderFileTreeChildPathBlock(
      {},
      "",
      ["docs", "notes", "a.md", "b.md"],
      ["docs", "notes"],
      "b.md",
      "directory",
      kinds,
    );
    expect(next[""]).toEqual(["a.md", "docs", "notes", "b.md"]);
  });
});
