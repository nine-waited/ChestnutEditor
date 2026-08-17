import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leaf } from "@chestnut/core";
import { planMarkdownTabRefresh } from "./note-reload-plan.js";
import {
  flushNoteWriters,
  registerNoteFlusher,
  resetNoteReloadForTests,
} from "./note-reload-registry.js";
import { leavesNeedingCloseConfirm } from "./tab-close-plan.js";
import {
  clearNoteUnsaved,
  isNoteUnsaved,
  resetNoteUnsavedForTests,
  setNoteUnsaved,
} from "./unsaved-notes.js";

function leaf(partial: Partial<Leaf> & Pick<Leaf, "id" | "type">): Leaf {
  return { ...partial };
}

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

describe("tab-close-plan data-safety (DS-001)", () => {
  beforeEach(() => {
    resetNoteUnsavedForTests();
  });

  it("realtime never requires close confirm even when dirty", () => {
    setNoteUnsaved("a.md", true);
    const leaves = [leaf({ id: "1", type: "markdown", path: "a.md" })];
    expect(leavesNeedingCloseConfirm(leaves, "realtime", isNoteUnsaved)).toEqual([]);
  });

  it("interval + dirty markdown requires confirm", () => {
    setNoteUnsaved("a.md", true);
    const leaves = [leaf({ id: "1", type: "markdown", path: "a.md" })];
    expect(leavesNeedingCloseConfirm(leaves, "interval", isNoteUnsaved)).toHaveLength(1);
  });

  it("interval + dirty excalidraw requires confirm", () => {
    setNoteUnsaved("a.excalidraw", true);
    const leaves = [leaf({ id: "1", type: "excalidraw", path: "a.excalidraw" })];
    expect(leavesNeedingCloseConfirm(leaves, "interval", isNoteUnsaved)).toHaveLength(1);
  });

  it("interval + clean skips confirm", () => {
    const leaves = [leaf({ id: "1", type: "markdown", path: "a.md" })];
    expect(leavesNeedingCloseConfirm(leaves, "interval", isNoteUnsaved)).toEqual([]);
  });

  it("ignores non-note leaf types", () => {
    setNoteUnsaved("a.md", true);
    const leaves = [
      leaf({ id: "1", type: "settings" }),
      leaf({ id: "2", type: "image", path: "pic.png" }),
    ];
    expect(leavesNeedingCloseConfirm(leaves, "interval", isNoteUnsaved)).toEqual([]);
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
