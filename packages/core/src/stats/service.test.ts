import { afterEach, describe, expect, it } from "vitest";
import { InMemoryVaultAdapter } from "../vault/testing/in-memory-adapter.js";
import { eventBus } from "../plugins/host.js";
import { WritingStats } from "./service.js";

describe("WritingStats", () => {
  const stats = new WritingStats();

  afterEach(async () => {
    await stats.unmount();
  });

  it("indexes markdown units and inventory on mount", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "今天 hello");
    await adapter.write("draw.excalidraw", "{}");
    await adapter.writeBinary("pic.png", new Uint8Array([1, 2, 3]));
    await stats.mount(adapter);
    const snap = stats.getSnapshot();
    expect(snap.totalMarkdownUnits).toBe(3);
    expect(snap.inventory.markdownFiles).toBe(1);
    expect(snap.inventory.excalidrawFiles).toBe(1);
    expect(snap.inventory.imageFiles).toBe(1);
    expect(snap.todayInsertedUnits).toBe(0);
  });

  it("counts only positive editor diffs as today's input", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "今");
    await stats.mount(adapter);
    stats.seedBuffer("a.md", "今");
    stats.recordEdit("a.md", "今天 hello");
    expect(stats.getSnapshot().todayInsertedUnits).toBe(2);
    stats.recordEdit("a.md", "今");
    expect(stats.getSnapshot().todayInsertedUnits).toBe(2);
    expect(stats.getSnapshot().totalMarkdownUnits).toBe(1);
  });

  it("does not count the first seed as input", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "hello world");
    await stats.mount(adapter);
    stats.seedBuffer("a.md", "hello world");
    expect(stats.getSnapshot().todayInsertedUnits).toBe(0);
    expect(stats.getSnapshot().totalMarkdownUnits).toBe(2);
  });

  it("updates after file-save events", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "hi");
    await stats.mount(adapter);
    await adapter.write("a.md", "hi there friend");
    eventBus.emit("file-save", { path: "a.md", content: "hi there friend" });
    await new Promise((r) => setTimeout(r, 20));
    expect(stats.getSnapshot().totalMarkdownUnits).toBe(3);
  });
});
