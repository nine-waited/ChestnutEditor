import { describe, expect, it } from "vitest";
import {
  codeBlockPreviewMemoryKey,
  recalledCodeBlockPreviewOnly,
  rememberCodeBlockPreviewOnly,
} from "./markdown-code-block-preview-memory.js";

describe("code block preview memory", () => {
  it("keys by note and fence text, ignoring line endings and outer whitespace", () => {
    expect(codeBlockPreviewMemoryKey("a.md", "graph TD\r\nA-->B\n")).toBe(
      codeBlockPreviewMemoryKey("a.md", "graph TD\nA-->B"),
    );
    expect(codeBlockPreviewMemoryKey("a.md", "graph TD")).not.toBe(
      codeBlockPreviewMemoryKey("b.md", "graph TD"),
    );
  });

  it("recalls preview-only until the code is shown again", () => {
    const key = codeBlockPreviewMemoryKey("note.md", "graph LR\nX-->Y");
    expect(recalledCodeBlockPreviewOnly(key)).toBe(false);
    rememberCodeBlockPreviewOnly(key, true);
    expect(recalledCodeBlockPreviewOnly(key)).toBe(true);
    rememberCodeBlockPreviewOnly(key, false);
    expect(recalledCodeBlockPreviewOnly(key)).toBe(false);
  });
});
