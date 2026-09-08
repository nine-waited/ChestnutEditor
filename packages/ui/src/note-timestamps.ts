import { eventBus, isMarkdown, normalizePath } from "@chestnut/core";

export const NOTE_TIMES_STORAGE_PREFIX = "chestnut-note-times:";

export interface NoteTimeRecord {
  createdAt: number;
  updatedAt: number;
}

export interface NoteTimesPersist {
  read(vaultKey: string): Promise<string | null>;
  write(vaultKey: string, json: string): Promise<void>;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local wall-clock `YYYY-MM-DD HH:mm:ss`. */
export function formatNoteTimestamp(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function parseRecords(raw: string | null): Map<string, NoteTimeRecord> {
  const out = new Map<string, NoteTimeRecord>();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [path, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const rec = value as { createdAt?: unknown; updatedAt?: unknown };
      const createdAt = Number(rec.createdAt);
      const updatedAt = Number(rec.updatedAt);
      if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) continue;
      out.set(normalizePath(path), { createdAt, updatedAt });
    }
  } catch {
    return out;
  }
  return out;
}

export class NoteTimestampStore {
  private vaultKey = "";
  private records = new Map<string, NoteTimeRecord>();
  private persist: NoteTimesPersist | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private unsubs: Array<() => void> = [];

  setPersist(persist: NoteTimesPersist | null): void {
    this.persist = persist;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async mount(vaultKey: string): Promise<void> {
    this.unmount();
    this.vaultKey = vaultKey;
    this.records = parseRecords(this.persist ? await this.persist.read(vaultKey) : null);
    this.bindEvents();
    this.emit();
  }

  unmount(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const stop of this.unsubs) stop();
    this.unsubs = [];
    this.records = new Map();
    this.vaultKey = "";
  }

  get(path: string): NoteTimeRecord | null {
    return this.records.get(normalizePath(path)) ?? null;
  }

  /** Create a record with the current clock when the note has none yet. */
  ensure(path: string, now = Date.now()): NoteTimeRecord {
    const normalized = normalizePath(path);
    const existing = this.records.get(normalized);
    if (existing) return existing;
    const rec: NoteTimeRecord = { createdAt: now, updatedAt: now };
    this.records.set(normalized, rec);
    this.schedulePersist();
    this.emit();
    return rec;
  }

  touchUpdated(path: string, now = Date.now()): NoteTimeRecord {
    const rec = this.ensure(path, now);
    if (now >= rec.updatedAt) rec.updatedAt = now;
    this.schedulePersist();
    this.emit();
    return rec;
  }

  private bindEvents(): void {
    this.unsubs.push(
      eventBus.on("file-create", ({ path }) => {
        if (isMarkdown(path)) this.ensure(path);
      }),
      eventBus.on("file-save", ({ path }) => {
        if (isMarkdown(path)) this.touchUpdated(path);
      }),
      eventBus.on("file-rename", ({ from, to }) => {
        this.remap(from, to);
      }),
      eventBus.on("file-delete", ({ path }) => {
        this.remove(path);
      }),
    );
  }

  private remap(from: string, to: string): void {
    const src = normalizePath(from);
    const dest = normalizePath(to);
    const rec = this.records.get(src);
    if (rec) {
      this.records.delete(src);
      if (isMarkdown(dest)) this.records.set(dest, rec);
      this.schedulePersist();
      this.emit();
      return;
    }
    const prefix = `${src}/`;
    let changed = false;
    for (const [path, value] of [...this.records.entries()]) {
      if (!path.startsWith(prefix)) continue;
      this.records.delete(path);
      const next = `${dest}/${path.slice(prefix.length)}`;
      if (isMarkdown(next)) this.records.set(next, value);
      changed = true;
    }
    if (changed) {
      this.schedulePersist();
      this.emit();
    }
  }

  private remove(path: string): void {
    const normalized = normalizePath(path);
    const prefix = `${normalized}/`;
    let changed = this.records.delete(normalized);
    for (const key of [...this.records.keys()]) {
      if (key.startsWith(prefix)) {
        this.records.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.schedulePersist();
      this.emit();
    }
  }

  private schedulePersist(): void {
    if (!this.persist || !this.vaultKey) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const json = JSON.stringify(Object.fromEntries(this.records));
      void this.persist?.write(this.vaultKey, json);
    }, 200);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const noteTimestamps = new NoteTimestampStore();
