import { describe, expect, it } from "vitest";
import {
  createLinkOpenOnce,
  findExternalUrlAtOffset,
  isSafeExternalHttpUrl,
  normalizeExternalHttpUrl,
} from "./markdown-editor-links.js";

describe("markdown-editor-links", () => {
  it("allows only http(s) urls", () => {
    expect(isSafeExternalHttpUrl("https://example.com/a")).toBe(true);
    expect(isSafeExternalHttpUrl("http://example.com")).toBe(true);
    expect(isSafeExternalHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalHttpUrl("file:///tmp/x")).toBe(false);
    expect(isSafeExternalHttpUrl("/relative")).toBe(false);
    expect(isSafeExternalHttpUrl("https://example.com/\npath")).toBe(false);
  });

  it("normalizes absolute http(s) urls", () => {
    expect(normalizeExternalHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeExternalHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("finds markdown-link urls under the click offset", () => {
    const text = "see [docs](https://example.com/docs) please";
    const atLabel = text.indexOf("docs");
    const atUrl = text.indexOf("https");
    expect(findExternalUrlAtOffset(text, atLabel)).toBe("https://example.com/docs");
    expect(findExternalUrlAtOffset(text, atUrl)).toBe("https://example.com/docs");
    expect(findExternalUrlAtOffset(text, 0)).toBeNull();
  });

  it("finds bare urls under the click offset", () => {
    const text = "open https://example.com/path, next";
    const at = text.indexOf("example");
    expect(findExternalUrlAtOffset(text, at)).toBe("https://example.com/path");
  });

  it("skips the click that follows a pointerup open", () => {
    const once = createLinkOpenOnce();
    expect(once.skipDuplicateClick()).toBe(false);
    once.noteOpenedFromPointerUp();
    expect(once.skipDuplicateClick()).toBe(true);
    expect(once.skipDuplicateClick()).toBe(false);
  });
});
