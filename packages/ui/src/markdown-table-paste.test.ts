import { describe, expect, it } from "vitest";
import {
  spreadsheetClipboardToMarkdown,
  flattenTableCellPaste,
  isGfmTableMarkdown,
  looksLikeMarkdownDocument,
} from "./markdown-table-paste.js";

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

  it("does not wrap a markdown document that contains a table", () => {
    const source = [
      "# Title",
      "",
      "Intro, with a comma.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "More text, also with commas.",
    ].join("\n");
    expect(looksLikeMarkdownDocument(source)).toBe(true);
    expect(isGfmTableMarkdown(source)).toBe(false);
    expect(spreadsheetClipboardToMarkdown(source)).toBeNull();
    expect(
      spreadsheetClipboardToMarkdown(
        source,
        "<h1>Title</h1><p>Intro</p><table><tr><th>a</th><th>b</th></tr></table><p>More</p>",
      ),
    ).toBeNull();
  });

  it("does not treat comma-separated prose as a spreadsheet", () => {
    expect(spreadsheetClipboardToMarkdown("Hello, world.\nAnother line, here.")).toBeNull();
  });

  it("still converts a consistent three-column CSV", () => {
    const md = spreadsheetClipboardToMarkdown("a,b,c\n1,2,3");
    expect(md).toBe(
      ["| a | b | c |", "| --- | --- | --- |", "| 1 | 2 | 3 |"].join("\n"),
    );
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
