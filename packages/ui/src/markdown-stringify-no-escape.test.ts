import { describe, expect, it } from "vitest";
import { stringifyMarkdownText } from "./markdown-stringify-no-escape.js";

describe("stringifyMarkdownText", () => {
  it("does not auto-escape emphasis markers in paragraphs", () => {
    expect(stringifyMarkdownText({ value: "a * b" })).toBe("a * b");
  });

  it("escapes pipes inside table cells", () => {
    expect(
      stringifyMarkdownText({ value: "(1<<1)|0 = 2" }, undefined, { stack: ["table", "tableRow", "tableCell"] }),
    ).toBe("(1<<1)\\|0 = 2");
  });

  it("does not double-escape an already escaped pipe in a cell", () => {
    expect(
      stringifyMarkdownText({ value: "a\\|b" }, undefined, { stack: ["tableCell"] }),
    ).toBe("a\\|b");
  });
});
