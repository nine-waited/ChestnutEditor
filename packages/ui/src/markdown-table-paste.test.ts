import { describe, expect, it } from "vitest";
import { spreadsheetClipboardToMarkdown, flattenTableCellPaste } from "./markdown-table-paste.js";

describe("spreadsheetClipboardToMarkdown", () => {
  it("converts TSV into a GFM table", () => {
    const md = spreadsheetClipboardToMarkdown("Name\tAge\nAda\t36\nBob\t21");
    expect(md).toBe(
      ["| Name | Age |", "| --- | --- |", "| Ada | 36 |", "| Bob | 21 |"].join("\n"),
    );
  });

  it("leaves an existing GFM table unchanged", () => {
    const source = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    expect(spreadsheetClipboardToMarkdown(source)).toBeNull();
  });

  it("ignores ordinary paragraphs", () => {
    expect(spreadsheetClipboardToMarkdown("just a line")).toBeNull();
    expect(spreadsheetClipboardToMarkdown("two\nlines")).toBeNull();
  });

  it("escapes pipes inside cells", () => {
    const md = spreadsheetClipboardToMarkdown("a|b\tc\nx\ty");
    expect(md).toContain("| a\\|b | c |");
  });
});

describe("flattenTableCellPaste", () => {
  it("turns newlines into spaces", () => {
    expect(flattenTableCellPaste("a\nb\r\nc")).toBe("a b c");
  });
});
