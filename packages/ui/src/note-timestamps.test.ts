import { describe, expect, it } from "vitest";
import { eventBus } from "@chestnut/core";
import {
  NoteTimestampStore,
  formatNoteTimestamp,
} from "./note-timestamps.js";

describe("formatNoteTimestamp", () => {
  it("formats local time as YYYY-MM-DD HH:mm:ss", () => {
    const ms = new Date(2026, 8, 7, 1, 15, 0).getTime();
    expect(formatNoteTimestamp(ms)).toBe("2026-09-07 01:15:00");
  });
});

describe("NoteTimestampStore", () => {
  it("initializes missing records with the current clock", () => {
    const store = new NoteTimestampStore();
    const rec = store.ensure("notes/old.md", 1_000);
    expect(rec).toEqual({ createdAt: 1_000, updatedAt: 1_000 });
    expect(store.ensure("notes/old.md", 5_000)).toEqual(rec);
  });

  it("keeps created time and bumps updated on save", () => {
    const store = new NoteTimestampStore();
    store.ensure("a.md", 1_000);
    store.touchUpdated("a.md", 2_000);
    expect(store.get("a.md")).toEqual({ createdAt: 1_000, updatedAt: 2_000 });
  });

  it("follows rename and delete events", async () => {
    const store = new NoteTimestampStore();
    await store.mount("vault-a");
    store.ensure("a.md", 1_000);
    eventBus.emit("file-rename", { from: "a.md", to: "b.md" });
    expect(store.get("a.md")).toBeNull();
    expect(store.get("b.md")).toEqual({ createdAt: 1_000, updatedAt: 1_000 });
    eventBus.emit("file-delete", { path: "b.md" });
    expect(store.get("b.md")).toBeNull();
    store.unmount();
  });
});
