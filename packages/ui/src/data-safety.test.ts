import { beforeEach, describe, expect, it, vi } from "vitest";
import { planMarkdownTabRefresh } from "./note-reload-plan.js";
import {
  flushNoteWriters,
  registerNoteFlusher,
  resetNoteReloadForTests,
} from "./note-reload-registry.js";
import {
  clearNoteUnsaved,
  isNoteUnsaved,
  resetNoteUnsavedForTests,
  setNoteUnsaved,
} from "./unsaved-notes.js";

describe("unsaved-notes data-safety", () => {
  beforeEach(() => {
    resetNoteUnsavedForTests();
  });

  it("DS-001: dirty flag stays until explicitly cleared", () => {
    setNoteUnsaved("a.md", true);
    expect(isNoteUnsaved("a.md")).toBe(true);
    // View-only panes must not clear path-level dirty (DS-003).
    expect(isNoteUnsaved("a.md")).toBe(true);
    clearNoteUnsaved("a.md");
    expect(isNoteUnsaved("a.md")).toBe(false);
  });

  it("DS-003: clearing one path does not affect another", () => {
    setNoteUnsaved("a.md", true);
    setNoteUnsaved("b.md", true);
    clearNoteUnsaved("a.md");
    expect(isNoteUnsaved("a.md")).toBe(false);
    expect(isNoteUnsaved("b.md")).toBe(true);
  });
});

describe("note-reload-plan data-safety", () => {
  it("DS-002: realtime always flushes before reload", () => {
    expect(
      planMarkdownTabRefresh({ saveMode: "realtime", isUnsaved: true }),
    ).toBe("flush-then-reload");
  });

  it("DS-002: interval clean flushes before reload", () => {
    expect(
      planMarkdownTabRefresh({ saveMode: "interval", isUnsaved: false }),
    ).toBe("flush-then-reload");
  });

  it("DS-008: interval dirty without confirm aborts", () => {
    expect(
      planMarkdownTabRefresh({ saveMode: "interval", isUnsaved: true }),
    ).toBe("abort");
  });

  it("DS-008: interval dirty with discard confirm does not flush", () => {
    expect(
      planMarkdownTabRefresh({
        saveMode: "interval",
        isUnsaved: true,
        discardConfirmed: true,
      }),
    ).toBe("discard-no-flush");
  });

  it("DS-008: cancel confirm stays abort", () => {
    expect(
      planMarkdownTabRefresh({
        saveMode: "interval",
        isUnsaved: true,
        discardConfirmed: false,
      }),
    ).toBe("abort");
  });
});

describe("note-reload flushers data-safety", () => {
  beforeEach(() => {
    resetNoteReloadForTests();
  });

  it("DS-005: flushNoteWriters awaits registered flushers", async () => {
    const flush = vi.fn(async () => {});
    registerNoteFlusher("a.md", "leaf-1", flush);
    await flushNoteWriters("a.md");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("DS-004: multiple leaf flushers for same path all run", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    registerNoteFlusher("a.md", "leaf-1", a);
    registerNoteFlusher("a.md", "leaf-2", b);
    await flushNoteWriters("a.md");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unregister stops future flushes", async () => {
    const flush = vi.fn(async () => {});
    const unreg = registerNoteFlusher("a.md", "leaf-1", flush);
    unreg();
    await flushNoteWriters("a.md");
    expect(flush).not.toHaveBeenCalled();
  });
});
