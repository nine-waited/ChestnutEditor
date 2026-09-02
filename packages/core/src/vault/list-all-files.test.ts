import { describe, expect, it } from "vitest";
import { listAllFiles, MAX_VAULT_LIST_DEPTH, type VaultAdapter, type VaultEntry } from "./types.js";

function dir(path: string): VaultEntry {
  const name = path.split("/").pop() ?? path;
  return { path, name, kind: "directory" };
}

function file(path: string): VaultEntry {
  const name = path.split("/").pop() ?? path;
  return { path, name, kind: "file" };
}

function nestedLoopAdapter(): VaultAdapter {
  return {
    kind: "tauri",
    id: "test",
    name: "test",
    async list(dirPath = "") {
      const next = dirPath ? `${dirPath}/loop` : "loop";
      return [dir(next), file(`${next}/note.md`)];
    },
    async read() {
      return "";
    },
    async readBinary() {
      return new Uint8Array();
    },
    async write() {},
    async writeBinary() {},
    async delete() {},
    async rename() {},
    async mkdir() {},
    async exists() {
      return false;
    },
    async getAssetUrl() {
      return "";
    },
  };
}

describe("listAllFiles", () => {
  it("stops walking after MAX_VAULT_LIST_DEPTH so junction loops cannot hang mount", async () => {
    const files = await listAllFiles(nestedLoopAdapter());
    expect(files.length).toBeLessThanOrEqual(MAX_VAULT_LIST_DEPTH + 1);
    expect(files.some((entry) => entry.path.endsWith("note.md"))).toBe(true);
  });

  it("collects only markdown into the file array and still counts other types", async () => {
    const adapter: VaultAdapter = {
      kind: "tauri",
      id: "test",
      name: "test",
      async list(dirPath = "") {
        if (dirPath) return [];
        return [
          file("note.md"),
          file("sketch.excalidraw"),
          file("photo.png"),
          file("app.ts"),
        ];
      },
      async read() {
        return "";
      },
      async readBinary() {
        return new Uint8Array();
      },
      async write() {},
      async writeBinary() {},
      async delete() {},
      async rename() {},
      async mkdir() {},
      async exists() {
        return false;
      },
      async getAssetUrl() {
        return "";
      },
    };
    const counts = { markdownFiles: 0, excalidrawFiles: 0, imageFiles: 0 };
    const files = await listAllFiles(adapter, "", 0, "markdown", counts);
    expect(files.map((entry) => entry.path)).toEqual(["note.md"]);
    expect(counts).toEqual({ markdownFiles: 1, excalidrawFiles: 1, imageFiles: 1 });
  });
});
