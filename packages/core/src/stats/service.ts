import type { VaultAdapter } from "../vault/types.js";
import {
  isExcalidraw,
  isImage,
  isMarkdown,
  listAllFiles,
  normalizePath,
} from "../vault/types.js";
import { eventBus } from "../plugins/host.js";
import { countWritingUnits, localDateKey } from "./writing-units.js";

export const WRITING_STATS_PATH = ".chestnut/writing-stats.json";

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
  private localDate = localDateKey();
  private todayInsertedUnits = 0;
  private fileUnits = new Map<string, number>();
  private buffers = new Map<string, string>();
  private unsavedUnits = new Map<string, number>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private inventoryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: Array<() => void> = [];

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
    this.bindEvents();
    await this.loadPersisted();
    this.rotateDateIfNeeded();
    await this.reindex();
    this.emit();
  }

  async unmount(): Promise<void> {
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
    const files = await listAllFiles(this.adapter);
    const nextUnits = new Map<string, number>();
    let markdownFiles = 0;
    let excalidrawFiles = 0;
    let imageFiles = 0;
    for (const file of files) {
      if (isMarkdown(file.path)) {
        markdownFiles += 1;
        try {
          const content = await this.adapter.read(file.path);
          nextUnits.set(file.path, countWritingUnits(content));
        } catch (err) {
          console.warn(`[Chestnut] failed to count ${file.path}:`, err);
        }
      } else if (isExcalidraw(file.path)) {
        excalidrawFiles += 1;
      } else if (isImage(file.path)) {
        imageFiles += 1;
      }
    }
    this.fileUnits = nextUnits;
    this.cachedInventory = { markdownFiles, excalidrawFiles, imageFiles };
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

  private async refreshInventory(): Promise<void> {
    if (!this.adapter) return;
    const files = await listAllFiles(this.adapter);
    let markdownFiles = 0;
    let excalidrawFiles = 0;
    let imageFiles = 0;
    for (const file of files) {
      if (isMarkdown(file.path)) markdownFiles += 1;
      else if (isExcalidraw(file.path)) excalidrawFiles += 1;
      else if (isImage(file.path)) imageFiles += 1;
    }
    this.cachedInventory = { markdownFiles, excalidrawFiles, imageFiles };
    this.emitAndPersist();
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
      const raw = await this.adapter.read(WRITING_STATS_PATH);
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
    try {
      await this.adapter.mkdir(".chestnut");
      await this.adapter.write(WRITING_STATS_PATH, JSON.stringify(body, null, 2));
    } catch (err) {
      console.warn("[Chestnut] failed to persist writing stats:", err);
    }
  }
}

export const writingStats = new WritingStats();
