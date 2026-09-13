import { describe, expect, it } from "vitest";
import {
  escapeOverflowPipesInGfmRow,
  sanitizeGfmTablePipes,
  splitGfmTableRow,
} from "./markdown-table-gfm-pipes.js";

const encodingTable = [
  "List<Int>",
  "[1, 2, 3, 4, 5, 5, 6, 7, 2, 3]",
  "[8]",
  "",
  "Value:     1  2  3  4  5  5  6  7  2  3    8",
  "rep:    0  1  1  1  1  1  1  1  1  1    0",
  "def:    3  3  3  3  3  3  3  3  3  3    3",
  "",
  "| run | 含义     | header (count<<1)|0 | 值（1 字节） | 字节    |",
  "| --- | ------ | ------------------- | ------- | ----- |",
  "| 1   | 1 个 0  | (1<<1)|0 = 2        | 00      | 02 00 |",
  "| 2   | 10 个 1 | (10<<1)|0 = 20      | 01      | 14 01 |",
  "| 3   | 1 个 0  | (1<<1)|0 = 2        | 00      | 02 00 |",
].join("\n");

describe("sanitizeGfmTablePipes", () => {
  it("escapes bitwise-or pipes so a 5-column table stays a table", async () => {
    const out = sanitizeGfmTablePipes(encodingTable);
    expect(out).toContain("header (count<<1)\\|0");
    expect(out).toContain("(1<<1)\\|0 = 2");
    expect(out).toContain("(10<<1)\\|0 = 20");
    const header = out.split("\n").find((line) => line.includes("header"));
    expect(splitGfmTableRow(header!)).toHaveLength(5);
    expect(out).toContain("List<Int>");
    expect(out).toContain("def:    3  3  3  3  3  3  3  3  3  3    3");

    const { unified } = await import("unified");
    const remarkParse = (await import("remark-parse")).default;
    const remarkGfm = (await import("remark-gfm")).default;
    const tree = unified().use(remarkParse).use(remarkGfm).parse(out);
    const table = tree.children.find((node) => node.type === "table");
    expect(table?.type).toBe("table");
    expect(table && "children" in table ? table.children.length : 0).toBe(4);
    const widths = table && "children" in table
      ? table.children.map((row) => ("children" in row ? row.children.length : 0))
      : [];
    expect(widths).toEqual([5, 5, 5, 5]);
  });

  it("does not parse the unsanitized encoding table as a GFM table", async () => {
    const { unified } = await import("unified");
    const remarkParse = (await import("remark-parse")).default;
    const remarkGfm = (await import("remark-gfm")).default;
    const tree = unified().use(remarkParse).use(remarkGfm).parse(encodingTable);
    expect(tree.children.some((node) => node.type === "table")).toBe(false);
  });

  it("leaves already-escaped pipes intact", () => {
    const source = [
      "| run | header (count<<1)\\|0 | val |",
      "| --- | ------------------- | --- |",
      "| 1 | (1<<1)\\|0 = 2 | 00 |",
    ].join("\n");
    expect(sanitizeGfmTablePipes(source)).toBe(source);
  });

  it("does not rewrite fenced code that looks like a table", () => {
    const source = ["```", "| a | b |", "| --- | --- |", "| 1|2 | 3 |", "```"].join("\n");
    expect(sanitizeGfmTablePipes(source)).toBe(source);
  });

  it("leaves a well-formed table unchanged", () => {
    const source = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    expect(sanitizeGfmTablePipes(source)).toBe(source);
  });
});

describe("escapeOverflowPipesInGfmRow", () => {
  it("escapes a tight pipe when the row is one column too wide", () => {
    const line = "| 1 | (1<<1)|0 = 2 | 00 |";
    expect(escapeOverflowPipesInGfmRow(line, 3)).toContain("(1<<1)\\|0 = 2");
    expect(splitGfmTableRow(escapeOverflowPipesInGfmRow(line, 3))).toHaveLength(3);
  });
});
