import { afterEach, describe, expect, it } from "vitest";
import { InMemoryVaultAdapter } from "../vault/testing/in-memory-adapter.js";
import { eventBus } from "../plugins/host.js";
import { WritingStats } from "./service.js";

describe("WritingStats", () => {
  const stats = new WritingStats();

  afterEach(async () => {
    await stats.unmount();
    stats.setPersist(null);
  });

  it("indexes markdown units and inventory on mount", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "今天 hello");
    await adapter.write("draw.excalidraw", "{}");
    await adapter.writeBinary("pic.png", new Uint8Array([1, 2, 3]));
    await stats.mount(adapter);
    await stats.reindexFromVault();
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

  it("does not mkdir .chestnut in the vault when persisting", async () => {
    const adapter = new InMemoryVaultAdapter();
    const mkdir = adapter.mkdir.bind(adapter);
    const mkdirPaths: string[] = [];
    adapter.mkdir = async (path: string) => {
      mkdirPaths.push(path);
      return mkdir(path);
    };
    const store = new Map<string, string>();
    stats.setPersist({
      async read(key) {
        return store.get(key) ?? null;
      },
      async write(key, json) {
        store.set(key, json);
      },
    });
    await adapter.write("a.md", "hello");
    await stats.mount(adapter);
    stats.seedBuffer("a.md", "hello");
    stats.recordEdit("a.md", "hello world");
    await stats.unmount();
    expect(mkdirPaths).toEqual([]);
    expect(store.size).toBe(1);
    expect(await adapter.exists(".chestnut")).toBe(false);
    expect(await adapter.exists(".chestnut/writing-stats.json")).toBe(false);
  });

  it("does not write writing-stats into a tauri vault without persist", async () => {
    const adapter = new InMemoryVaultAdapter();
    await adapter.write("a.md", "hello");
    await stats.mount(adapter);
    stats.seedBuffer("a.md", "hello");
    stats.recordEdit("a.md", "hello world");
    await stats.unmount();
    expect(await adapter.exists(".chestnut")).toBe(false);
    expect(await adapter.exists(".chestnut/writing-stats.json")).toBe(false);
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
