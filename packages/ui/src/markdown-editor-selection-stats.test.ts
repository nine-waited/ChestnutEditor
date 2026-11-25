import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap, tableNodes } from "@milkdown/kit/prose/tables";
import {
  countCharactersWithoutSpaces,
  countWordUnits,
  parseSpreadsheetNumber,
} from "./editor-selection-stats.js";
import {
  getLiveEditorSelectionStats,
  getSourceEditorSelectionStats,
} from "./markdown-editor-selection-stats.js";

const tableSpec = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: {},
});

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    ...tableSpec,
  },
});

function cell(text: string, header = false) {
  return schema.node(header ? "table_header" : "table_cell", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

function tableDoc() {
  return schema.node("doc", null, [
    schema.node("table", null, [
      schema.node("table_row", null, [cell("A", true), cell("B", true)]),
      schema.node("table_row", null, [cell("1"), cell("2")]),
      schema.node("table_row", null, [cell("3"), cell("x")]),
    ]),
  ]);
}

function tableCellPos(doc: ReturnType<typeof tableDoc>, row: number, column: number): number {
  const table = doc.firstChild!;
  const map = TableMap.get(table);
  return 1 + map.map[row * map.width + column]!;
}

describe("Word-style text counts", () => {
  it("counts each CJK character and each alphanumeric word", () => {
    expect(countWordUnits("你好 Chestnut Editor 2.0")).toBe(5);
    expect(countCharactersWithoutSpaces("你 好\nAB")).toBe(4);
  });

  it("reports selected words against the plain-text document total", () => {
    const stats = getSourceEditorSelectionStats("# 你好\n\nChestnut Editor", 2, 4);
    expect(stats).toMatchObject({
      kind: "text",
      totalWords: 4,
      selectedWords: 2,
      selectedCharacters: 2,
    });
  });

  it("does not count Markdown table pipes or empty HTML breaks as words", () => {
    const markdown = "| <br /> | 2 |\n| --- | --- |\n| 你好 | <br /> |";
    expect(getSourceEditorSelectionStats(markdown, 0, 0).totalWords).toBe(3);
  });
});

describe("Excel-style table counts", () => {
  it("recognizes grouped numbers, decimals, and percentages", () => {
    expect(parseSpreadsheetNumber("1,234.5")).toBe(1234.5);
    expect(parseSpreadsheetNumber("25%")).toBe(0.25);
    expect(parseSpreadsheetNumber("12 items")).toBeNull();
  });

  it("reports the selected rectangle and numeric aggregates", () => {
    const doc = tableDoc();
    const state = EditorState.create({
      doc,
      selection: CellSelection.create(
        doc,
        tableCellPos(doc, 1, 0),
        tableCellPos(doc, 2, 1),
      ),
    });
    expect(getLiveEditorSelectionStats(state)).toEqual({
      kind: "table",
      rows: 2,
      columns: 2,
      cells: 4,
      nonEmptyCells: 4,
      numericCells: 3,
      sum: 6,
      average: 2,
    });
  });

  it("uses document text for an ordinary text selection", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello world")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6),
    });
    expect(getLiveEditorSelectionStats(state)).toMatchObject({
      kind: "text",
      totalWords: 2,
      selectedWords: 1,
      selectedCharacters: 5,
    });
  });
});

