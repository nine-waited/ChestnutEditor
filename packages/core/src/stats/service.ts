import type { VaultAdapter } from "../vault/types.js";
import { isMarkdown, listAllFiles, normalizePath, type VaultListCounts } from "../vault/types.js";
import { eventBus } from "../plugins/host.js";
import { countWritingUnits, localDateKey } from "./writing-units.js";

export const WRITING_STATS_PATH = ".chestnut/writing-stats.json";

export interface WritingStatsPersist {
  read(vaultKey: string): Promise<string | null>;
  write(vaultKey: string, json: string): Promise<void>;
}

export interface WritingInventory {
  markdownFiles: number;
  excalidrawFiles: number;
  imageFiles: number;
}

export interface WritingStatsSnapshot {
  localDate: string;
  todayInsertedUnits: number;
  totalMarkdownUnits: number;
  inventory: WritingInventory;
}

interface PersistedWritingStats {
  localDate?: string;
  todayInsertedUnits?: number;
  fileUnits?: Record<string, number>;
  inventory?: WritingInventory;
}

const emptyInventory = (): WritingInventory => ({
  markdownFiles: 0,
  excalidrawFiles: 0,
  imageFiles: 0,
});

export class WritingStats {
  private adapter: VaultAdapter | null = null;
  private vaultKey = "";
  private persist: WritingStatsPersist | null = null;
  private localDate = localDateKey();
  private todayInsertedUnits = 0;
  private fileUnits = new Map<string, number>();
  private buffers = new Map<string, string>();
  private unsavedUnits = new Map<string, number>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private inventoryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: Array<() => void> = [];
  private reindexGen = 0;

  setPersist(persist: WritingStatsPersist | null): void {
    this.persist = persist;
  }

  getSnapshot(): WritingStatsSnapshot {
    this.rotateDateIfNeeded();
    return {
      localDate: this.localDate,
      todayInsertedUnits: this.todayInsertedUnits,
      totalMarkdownUnits: this.totalMarkdownUnits(),
      inventory: this.inventoryFromCache(),
    };
  }

  async mount(adapter: VaultAdapter): Promise<void> {
    await this.unmount();
    this.adapter = adapter;
    this.vaultKey =
      typeof adapter.getAbsolutePath === "function" ? adapter.getAbsolutePath("") : adapter.id;
    this.bindEvents();
    await this.loadPersisted();
    this.rotateDateIfNeeded();
    this.emit();
  }

  async reindexFromVault(): Promise<void> {
    await this.reindex();
  }

  async unmount(): Promise<void> {
    this.reindexGen += 1;
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      await this.flushPersist();
    }
    if (this.inventoryTimer) {
      clearTimeout(this.inventoryTimer);
      this.inventoryTimer = null;
    }
    this.adapter = null;
    this.vaultKey = "";
    this.buffers.clear();
    this.unsavedUnits.clear();
    this.fileUnits.clear();
    this.todayInsertedUnits = 0;
    this.localDate = localDateKey();
  }

  seedBuffer(path: string, content: string): void {
    const normalized = normalizePath(path);
    if (!isMarkdown(normalized)) return;
    this.rotateDateIfNeeded();
    if (!this.buffers.has(normalized)) {
      this.buffers.set(normalized, content);
      this.unsavedUnits.set(normalized, countWritingUnits(content));
      this.emit();
    }
  }

  recordEdit(path: string, next: string): void {
    const normalized = normalizePath(path);
    if (!isMarkdown(normalized)) return;
    this.rotateDateIfNeeded();
    const prev = this.buffers.get(normalized);
    if (prev === undefined) {
      this.buffers.set(normalized, next);
      this.unsavedUnits.set(normalized, countWritingUnits(next));
      this.emitAndPersist();
      return;
    }
    if (prev === next) return;
    const delta = countWritingUnits(next) - countWritingUnits(prev);
    if (delta > 0) this.todayInsertedUnits += delta;
    this.buffers.set(normalized, next);
    this.unsavedUnits.set(normalized, countWritingUnits(next));
    this.emitAndPersist();
  }

  clearBuffer(path: string): void {
    const normalized = normalizePath(path);
    this.buffers.delete(normalized);
    this.unsavedUnits.delete(normalized);
    this.emit();
  }

  private bindEvents(): void {
    this.unsubs.push(
      eventBus.on("file-save", ({ path, content }) => {
        void this.onFileSave(path, content);
      }),
      eventBus.on("file-rename", ({ from, to }) => {
        this.remapPath(from, to);
        this.scheduleInventory();
        this.emitAndPersist();
      }),
      eventBus.on("file-delete", ({ path }) => {
        this.removePath(path);
        this.scheduleInventory();
        this.emitAndPersist();
      }),
      eventBus.on("file-create", () => {
        this.scheduleInventory();
      }),
    );
  }

  private async onFileSave(path: string, content?: string): Promise<void> {
    const normalized = normalizePath(path);
    if (isMarkdown(normalized)) {
      let source = content;
      if (source === undefined && this.adapter) {
        try {
          source = await this.adapter.read(normalized);
        } catch {
          source = this.buffers.get(normalized);
        }
      }
      if (source !== undefined) {
        const units = countWritingUnits(source);
        this.fileUnits.set(normalized, units);
        if (!this.buffers.has(normalized)) this.unsavedUnits.set(normalized, units);
      }
    }
    this.scheduleInventory();
    this.emitAndPersist();
  }

  private remapPath(from: string, to: string): void {
    const src = normalizePath(from);
    const dest = normalizePath(to);
    const units = this.fileUnits.get(src);
    if (units !== undefined) {
      this.fileUnits.delete(src);
      this.fileUnits.set(dest, units);
    }
    const buf = this.buffers.get(src);
    if (buf !== undefined) {
      this.buffers.delete(src);
      this.buffers.set(dest, buf);
    }
    const unsaved = this.unsavedUnits.get(src);
    if (unsaved !== undefined) {
      this.unsavedUnits.delete(src);
      this.unsavedUnits.set(dest, unsaved);
    }
  }

  private removePath(path: string): void {
    const normalized = normalizePath(path);
    const prefix = `${normalized}/`;
    for (const key of [...this.fileUnits.keys()]) {
      if (key === normalized || key.startsWith(prefix)) this.fileUnits.delete(key);
    }
    for (const key of [...this.buffers.keys()]) {
      if (key === normalized || key.startsWith(prefix)) this.buffers.delete(key);
    }
    for (const key of [...this.unsavedUnits.keys()]) {
      if (key === normalized || key.startsWith(prefix)) this.unsavedUnits.delete(key);
    }
  }

  private async reindex(): Promise<void> {
    if (!this.adapter) return;
    const gen = ++this.reindexGen;
    const adapter = this.adapter;
    const counts: VaultListCounts = { markdownFiles: 0, excalidrawFiles: 0, imageFiles: 0 };
    const files = await listAllFiles(adapter, "", 0, "markdown", counts, () => {
      return gen !== this.reindexGen || this.adapter !== adapter;
    });
    if (gen !== this.reindexGen || this.adapter !== adapter) return;
    const nextUnits = new Map<string, number>();
    let n = 0;
    for (const file of files) {
      if (gen !== this.reindexGen || this.adapter !== adapter) return;
      try {
        const content = await adapter.read(file.path);
        nextUnits.set(file.path, countWritingUnits(content));
      } catch (err) {
        console.warn(`[Chestnut] failed to count ${file.path}:`, err);
      }
      n += 1;
      if (n % 8 === 0) await Promise.resolve();
    }
    if (gen !== this.reindexGen || this.adapter !== adapter) return;
    this.fileUnits = nextUnits;
    this.cachedInventory = { ...counts };
    this.emit();
  }

  private async refreshInventory(): Promise<void> {
    if (!this.adapter) return;
    const gen = this.reindexGen;
    const adapter = this.adapter;
    const counts: VaultListCounts = { markdownFiles: 0, excalidrawFiles: 0, imageFiles: 0 };
    await listAllFiles(adapter, "", 0, "markdown", counts, () => {
      return gen !== this.reindexGen || this.adapter !== adapter;
    });
    if (gen !== this.reindexGen || this.adapter !== adapter) return;
    this.cachedInventory = { ...counts };
    this.emitAndPersist();
  }

  private cachedInventory: WritingInventory = emptyInventory();

  private inventoryFromCache(): WritingInventory {
    return { ...this.cachedInventory };
  }

  private scheduleInventory(): void {
    if (this.inventoryTimer) clearTimeout(this.inventoryTimer);
    this.inventoryTimer = setTimeout(() => {
      this.inventoryTimer = null;
      void this.refreshInventory();
    }, 300);
  }

  private totalMarkdownUnits(): number {
    const units = new Map(this.fileUnits);
    for (const [path, count] of this.unsavedUnits) units.set(path, count);
    let total = 0;
    for (const count of units.values()) total += count;
    return total;
  }

  private rotateDateIfNeeded(now = new Date()): void {
    const today = localDateKey(now);
    if (today === this.localDate) return;
    this.localDate = today;
    this.todayInsertedUnits = 0;
  }

  private emit(): void {
    eventBus.emit("writing-stats", this.getSnapshot());
  }

  private emitAndPersist(): void {
    this.emit();
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersist();
    }, 2000);
  }

  private async loadPersisted(): Promise<void> {
    if (!this.adapter) return;
    try {
      let raw: string | null = null;
      if (this.persist && this.vaultKey) {
        raw = await this.persist.read(this.vaultKey);
      }
      if (raw == null) {
        try {
          raw = await this.adapter.read(WRITING_STATS_PATH);
        } catch {
          raw = null;
        }
      }
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedWritingStats;
      if (data.localDate === localDateKey()) {
        this.localDate = data.localDate;
        this.todayInsertedUnits = Math.max(0, Number(data.todayInsertedUnits) || 0);
      }
      if (data.inventory) this.cachedInventory = { ...emptyInventory(), ...data.inventory };
    } catch {
      /* first run */
    }
  }

  private async flushPersist(): Promise<void> {
    if (!this.adapter) return;
    const body: PersistedWritingStats = {
      localDate: this.localDate,
      todayInsertedUnits: this.todayInsertedUnits,
      fileUnits: Object.fromEntries(this.fileUnits),
      inventory: this.cachedInventory,
    };
    const json = JSON.stringify(body, null, 2);
    try {
      if (this.persist && this.vaultKey) {
        await this.persist.write(this.vaultKey, json);
        return;
      }
      // In-memory tests may persist on the adapter. Never mkdir `.chestnut` in a
      // real desktop vault — that pollutes the chosen working folder (or its parent).
      if (this.adapter.kind === "tauri") return;
      await this.adapter.write(WRITING_STATS_PATH, json);
    } catch (err) {
      console.warn("[Chestnut] failed to persist writing stats:", err);
    }
  }
}

export const writingStats = new WritingStats();
