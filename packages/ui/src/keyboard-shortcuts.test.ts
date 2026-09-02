import { describe, expect, it } from "vitest";
import { matchesShortcut, physicalKeyFromCode } from "./keyboard-shortcuts.js";

function chord(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key" | "code">): KeyboardEvent {
  return {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...partial,
  } as KeyboardEvent;
}

describe("physicalKeyFromCode", () => {
  it("maps letter and digit codes", () => {
    expect(physicalKeyFromCode("KeyF")).toBe("f");
    expect(physicalKeyFromCode("Digit1")).toBe("1");
    expect(physicalKeyFromCode("ArrowUp")).toBe("arrowup");
    expect(physicalKeyFromCode("Tab")).toBe("tab");
  });
});

describe("matchesShortcut", () => {
  it("matches Ctrl+Shift+F from event.key", () => {
    expect(
      matchesShortcut(
        chord({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true }),
        "Ctrl+Shift+F",
      ),
    ).toBe(true);
  });

  it("matches Ctrl+Shift+F when IME reports Process", () => {
    expect(
      matchesShortcut(
        chord({ key: "Process", code: "KeyF", ctrlKey: true, shiftKey: true }),
        "Ctrl+Shift+F",
      ),
    ).toBe(true);
  });

  it("does not match Ctrl+F as Ctrl+Shift+F", () => {
    expect(
      matchesShortcut(chord({ key: "f", code: "KeyF", ctrlKey: true }), "Ctrl+Shift+F"),
    ).toBe(false);
  });

  it("matches Ctrl+Tab from event.key and event.code", () => {
    expect(
      matchesShortcut(chord({ key: "Tab", code: "Tab", ctrlKey: true }), "Ctrl+Tab"),
    ).toBe(true);
    expect(
      matchesShortcut(
        chord({ key: "Unidentified", code: "Tab", ctrlKey: true }),
        "Ctrl+Tab",
      ),
    ).toBe(true);
    expect(
      matchesShortcut(chord({ key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true }), "Ctrl+Tab"),
    ).toBe(false);
  });
});
