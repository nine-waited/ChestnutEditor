import { describe, expect, it } from "vitest";
import {
  codeBlockViewOutOfSync,
  isCodeBlockNodeName,
  normalizeCodeText,
} from "./markdown-code-block-sync.js";

describe("markdown-code-block-sync", () => {
  it("recognizes commonmark / crepe code-block node names", () => {
    expect(isCodeBlockNodeName("code_block")).toBe(true);
    expect(isCodeBlockNodeName("code-block")).toBe(true);
    expect(isCodeBlockNodeName("codeBlock")).toBe(true);
    expect(isCodeBlockNodeName("paragraph")).toBe(false);
    expect(isCodeBlockNodeName("image-block")).toBe(false);
  });

  it("treats CRLF vs LF as the same code text", () => {
    expect(normalizeCodeText("a\r\nb")).toBe("a\nb");
    expect(codeBlockViewOutOfSync("a\r\nb", "a\nb")).toBe(false);
  });

  it("flags empty live widget when the ProseMirror node still has source", () => {
    expect(codeBlockViewOutOfSync("", "print(1)")).toBe(true);
    expect(codeBlockViewOutOfSync("print(1)", "print(1)")).toBe(false);
    expect(codeBlockViewOutOfSync("", "")).toBe(false);
  });
});
