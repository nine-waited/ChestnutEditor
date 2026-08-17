import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultService } from "./service.js";
import { InMemoryVaultAdapter } from "./testing/in-memory-adapter.js";

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

  it("createNote clears write suppression so intentional recreate works", async () => {
    await vault.write("a.md", "old", true);
    await vault.deletePath("a.md", "file");
    expect(vault.isWriteSuppressed("a.md")).toBe(true);
    const path = await vault.createNote("", "a");
    expect(path).toBe("a.md");
    expect(vault.isWriteSuppressed("a.md")).toBe(false);
    expect(await vault.read("a.md")).toBe("");
  });
});
