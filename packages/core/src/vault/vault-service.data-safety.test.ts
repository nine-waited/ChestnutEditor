import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultService } from "./service.js";
import { InMemoryVaultAdapter } from "./testing/in-memory-adapter.js";
import {
  planExternalDiskSync,
  shouldSkipWriteOverExternalDisk,
} from "./external-write-guard.js";

describe("VaultService data-safety", () => {
  let vault: VaultService;
  let adapter: InMemoryVaultAdapter;

  beforeEach(async () => {
    vi.useFakeTimers();
    vault = new VaultService();
    adapter = new InMemoryVaultAdapter();
    await vault.mount(adapter);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await vault.unmount();
  });

  it("DS-006: deletePath suppresses later writes so keep-alive cannot recreate the note", async () => {
    await vault.write("notes/a.md", "keep", true);
    expect(await adapter.exists("notes/a.md")).toBe(true);

    await vault.deletePath("notes/a.md", "file");
    expect(vault.isWriteSuppressed("notes/a.md")).toBe(true);
    expect(await adapter.exists("notes/a.md")).toBe(false);

    await vault.write("notes/a.md", "should-not-land", true);
    expect(await adapter.exists("notes/a.md")).toBe(false);

    await vault.write("notes/a.md", "debounced-also-blocked", false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await adapter.exists("notes/a.md")).toBe(false);
  });

  it("DS-011: deleted markdown also blocks writeBinary recreate", async () => {
    await vault.write("a.md", "text", true);
    await vault.deletePath("a.md", "file");
    await vault.writeBinary("a.md", new Uint8Array([1, 2, 3]));
    expect(await adapter.exists("a.md")).toBe(false);
  });

  it("DS-011: deleting an image does not suppress writeBinary undo restore", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    await vault.writeBinary("notes/a_pic/x.png", bytes);
    await vault.deletePath("notes/a_pic/x.png", "file");
    expect(vault.isWriteSuppressed("notes/a_pic/x.png")).toBe(false);
    await vault.writeBinary("notes/a_pic/x.png", bytes);
    expect(await adapter.exists("notes/a_pic/x.png")).toBe(true);
  });

  it("write(..., true) persists immediately without waiting for debounce", async () => {
    await vault.write("a.md", "immediate", true);
    expect(await vault.read("a.md")).toBe("immediate");
  });

  it("debounced writes merge: only the last buffer is persisted", async () => {
    await vault.write("a.md", "v1", true);
    await vault.write("a.md", "v2", false);
    await vault.write("a.md", "v3", false);
    expect(await vault.read("a.md")).toBe("v1");
    await vi.advanceTimersByTimeAsync(500);
    expect(await vault.read("a.md")).toBe("v3");
  });

  it("write(..., true) cancels a pending debounce so stale buffer cannot overwrite", async () => {
    await vault.write("a.md", "v1", true);
    await vault.write("a.md", "stale-pending", false);
    await vault.write("a.md", "flushed", true);
    expect(await vault.read("a.md")).toBe("flushed");
    await vi.advanceTimersByTimeAsync(500);
    expect(await vault.read("a.md")).toBe("flushed");
  });

  it("DS-002: discardPendingWrite drops a debounced buffer so reload cannot be overwritten", async () => {
    await vault.write("a.md", "on-disk", true);
    await vault.write("a.md", "stale-buffer", false);
    vault.discardPendingWrite("a.md");
    await vi.advanceTimersByTimeAsync(500);
    expect(await vault.read("a.md")).toBe("on-disk");
  });

  it("debounced write eventually persists when not discarded or suppressed", async () => {
    await vault.write("a.md", "v1", true);
    await vault.write("a.md", "v2", false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await vault.read("a.md")).toBe("v2");
  });

  it("createNote unique-names siblings as Title, Title 1, Title 2", async () => {
    const first = await vault.createNote("", "未命名");
    const second = await vault.createNote("", "未命名");
    const third = await vault.createNote("", "未命名");
    expect(first).toBe("未命名.md");
    expect(second).toBe("未命名 1.md");
    expect(third).toBe("未命名 2.md");
  });

  it("createNote ignores other existing note names", async () => {
    await vault.write("会议纪要.md", "open", true);
    const path = await vault.createNote("", "未命名");
    expect(path).toBe("未命名.md");
    expect(await vault.read("会议纪要.md")).toBe("open");
  });

  it("createNote clears write suppression so intentional recreate works", async () => {
    await vault.write("a.md", "old", true);
    await vault.deletePath("a.md", "file");
    expect(vault.isWriteSuppressed("a.md")).toBe(true);
    const path = await vault.createNote("", "a");
    expect(path).toBe("a.md");
    expect(vault.isWriteSuppressed("a.md")).toBe(false);
    expect(await vault.read("a.md")).toBe("");
  });

  it("DS-010: renameFile cancels pending write so old path is not recreated", async () => {
    await vault.write("a.md", "on-disk", true);
    await vault.write("a.md", "stale-pending", false);
    const next = await vault.renameFile("a.md", "b");
    expect(next).toBe("b.md");
    await vi.advanceTimersByTimeAsync(500);
    expect(await adapter.exists("a.md")).toBe(false);
    expect(await vault.read("b.md")).toBe("on-disk");
  });

  it("DS-010: moveFileToDir cancels pending write so old path is not recreated", async () => {
    await adapter.mkdir("folder");
    await vault.write("a.md", "on-disk", true);
    await vault.write("a.md", "stale-pending", false);
    const next = await vault.moveFileToDir("a.md", "folder");
    expect(next).toBe("folder/a.md");
    await vi.advanceTimersByTimeAsync(500);
    expect(await adapter.exists("a.md")).toBe(false);
    expect(await vault.read("folder/a.md")).toBe("on-disk");
  });

  it("DS-013: autosave does not overwrite a file changed on disk by another editor", async () => {
    await vault.write("a.md", "chestnut", true);
    await adapter.write("a.md", "vscode");
    const wrote = await vault.write("a.md", "chestnut", true);
    expect(wrote).toBe(false);
    expect(await vault.read("a.md")).toBe("vscode");
  });

  it("DS-013: debounced write is dropped when disk diverged", async () => {
    await vault.write("a.md", "chestnut", true);
    await adapter.write("a.md", "vscode");
    await vault.write("a.md", "chestnut-typed", false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await vault.read("a.md")).toBe("vscode");
  });

  it("DS-013: overwriteExternal still writes after an external edit", async () => {
    await vault.write("a.md", "chestnut", true);
    await adapter.write("a.md", "vscode");
    const wrote = await vault.write("a.md", "chestnut-force", true, { overwriteExternal: true });
    expect(wrote).toBe(true);
    expect(await vault.read("a.md")).toBe("chestnut-force");
  });
});

describe("external-write-guard", () => {
  it("skips only when disk diverged from last known and is not the incoming buffer", () => {
    expect(
      shouldSkipWriteOverExternalDisk({ disk: "B", lastKnown: "A", incoming: "A" }),
    ).toBe(true);
    expect(
      shouldSkipWriteOverExternalDisk({ disk: "A", lastKnown: "A", incoming: "C" }),
    ).toBe(false);
    expect(
      shouldSkipWriteOverExternalDisk({ disk: "B", lastKnown: "A", incoming: "B" }),
    ).toBe(false);
    expect(
      shouldSkipWriteOverExternalDisk({ disk: null, lastKnown: "A", incoming: "A" }),
    ).toBe(false);
  });

  it("plans reload when Chestnut is clean and disk changed", () => {
    expect(planExternalDiskSync({ buffer: "A", lastSaved: "A", disk: "B" })).toBe("reload");
    expect(planExternalDiskSync({ buffer: "A", lastSaved: "A", disk: "A" })).toBe("ignore");
    expect(planExternalDiskSync({ buffer: "C", lastSaved: "A", disk: "B" })).toBe("conflict");
    expect(planExternalDiskSync({ disk: "B" })).toBe("reload");
  });
});
