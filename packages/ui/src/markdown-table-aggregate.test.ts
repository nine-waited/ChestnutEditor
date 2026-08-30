import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { CellSelection, tableNodes, TableMap } from "@milkdown/kit/prose/tables";
import {
  applyTableAggregateState,
  formatTableNumber,
  parseTableNumber,
  readTableGrid,
} from "./markdown-table-aggregate.js";

const table = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: {
    alignment: {
      default: "left",
      getFromDOM: (dom) => (dom as HTMLElement).style.textAlign || "left",
      setDOMAttr: (value, attrs) => {
        attrs.style = `text-align: ${value || "left"}`;
      },
    },
  },
});

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    ...table,
  },
  marks: {
    strong: {},
  },
});

function cell(text: string, header = false) {
  const type = header ? "table_header" : "table_cell";
  return schema.node(type, { alignment: "left" }, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

function tableDoc(rows: string[][], header = true) {
  return schema.node("doc", null, [
    schema.node(
      "table",
      null,
      rows.map((row, rowIndex) =>
        schema.node(
          "table_row",
          null,
          row.map((text) => cell(text, header && rowIndex === 0)),
        ),
      ),
    ),
  ]);
}

function tableInfo(doc: ReturnType<typeof tableDoc>) {
  let pos = 0;
  doc.descendants((child, childPos) => {
    if (child.type.name === "table") {
      pos = childPos;
      return false;
    }
  });
  const node = doc.firstChild!;
  return { node, pos, map: TableMap.get(node), tableStart: pos + 1 };
}

function cellPos(doc: ReturnType<typeof tableDoc>, row: number, col: number): number {
  const info = tableInfo(doc);
  return info.tableStart + info.map.map[row * info.map.width + col]!;
}

function selectCells(doc: ReturnType<typeof tableDoc>, from: [number, number], to: [number, number]) {
  let state = EditorState.create({
    doc,
    selection: CellSelection.create(doc, cellPos(doc, from[0], from[1]), cellPos(doc, to[0], to[1])),
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
}

function cellIsBold(state: EditorState, row: number, col: number): boolean {
  const tableNode = state.doc.firstChild;
  if (!tableNode || tableNode.type.name !== "table") return false;
  const map = TableMap.get(tableNode);
  const cell = tableNode.nodeAt(map.map[row * map.width + col]!);
  if (!cell) return false;
  let bold = false;
  cell.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "strong")) bold = true;
  });
  return bold;
}

function caretIn(doc: ReturnType<typeof tableDoc>, row: number, col: number) {
  const inner = cellPos(doc, row, col) + 2;
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, inner),
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
}

describe("parseTableNumber", () => {
  it("treats blank and whitespace as zero", () => {
    expect(parseTableNumber("")).toBe(0);
    expect(parseTableNumber("   ")).toBe(0);
  });

  it("accepts integers and decimals", () => {
    expect(parseTableNumber("12")).toBe(12);
    expect(parseTableNumber(" -3.5 ")).toBe(-3.5);
    expect(parseTableNumber(".5")).toBe(0.5);
    expect(parseTableNumber("+2.0")).toBe(2);
  });

  it("rejects non-numeric text", () => {
    expect(parseTableNumber("12px")).toBeNull();
    expect(parseTableNumber("1e2")).toBeNull();
    expect(parseTableNumber("1,000")).toBeNull();
    expect(parseTableNumber("合计")).toBeNull();
  });
});

describe("formatTableNumber", () => {
  it("avoids floating-point dust", () => {
    expect(formatTableNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatTableNumber(3)).toBe("3");
    expect(formatTableNumber(-0)).toBe("0");
  });
});

describe("applyTableAggregateState", () => {
  const numeric = () =>
    tableDoc([
      ["A", "B", "C"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);

  it("does nothing without a cell selection", () => {
    const target = caretIn(numeric(), 1, 0);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(false);
    expect(readTableGrid(target.state)).toEqual([
      ["A", "B", "C"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("does nothing when only the header row is selected", () => {
    const target = selectCells(numeric(), [0, 0], [0, 2]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(false);
  });

  it("does nothing when a data cell is not a number", () => {
    const target = selectCells(
      tableDoc([
        ["A", "B"],
        ["1", "x"],
      ]),
      [1, 0],
      [1, 1],
    );
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(false);
  });

  it("inserts a sum column and row, labeling them Sum", () => {
    const target = selectCells(numeric(), [1, 0], [2, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["", "A", "B", "Sum", "C"],
      ["", "1", "2", "3", "3"],
      ["", "4", "5", "9", "6"],
      ["Sum", "5", "7", "12", ""],
    ]);
  });

  it("treats empty data cells as zero", () => {
    const target = selectCells(
      tableDoc([
        ["A", "B"],
        ["1", ""],
        ["  ", "3"],
      ]),
      [1, 0],
      [2, 1],
    );
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["", "A", "B", "Sum"],
      ["", "1", "", "1"],
      ["", "  ", "3", "3"],
      ["Sum", "1", "3", "4"],
    ]);
  });

  it("skips header cells in a mixed selection and labels the new column header", () => {
    const target = selectCells(numeric(), [0, 0], [2, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["", "A", "B", "Sum", "C"],
      ["", "1", "2", "3", "3"],
      ["", "4", "5", "9", "6"],
      ["Sum", "5", "7", "12", ""],
    ]);
  });

  it("writes row and column averages plus the overall average", () => {
    const target = selectCells(numeric(), [1, 0], [2, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "average")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["", "A", "B", "Avg", "C"],
      ["", "1", "2", "1.5", "3"],
      ["", "4", "5", "4.5", "6"],
      ["Avg", "2.5", "3.5", "3", ""],
    ]);
  });

  it("adds only a result column when the selection is a single data row", () => {
    const target = selectCells(numeric(), [1, 0], [1, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["A", "B", "Sum", "C"],
      ["1", "2", "3", "3"],
      ["4", "5", "", "6"],
    ]);
  });

  it("adds only a result row when the selection is a single data column", () => {
    const target = selectCells(numeric(), [1, 1], [2, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["A", "B", "C"],
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["Sum", "7", ""],
    ]);
  });

  it("treats a header-plus-one-data-row selection as a single row", () => {
    const target = selectCells(numeric(), [0, 0], [1, 1]);
    expect(applyTableAggregateState(target.state, target.dispatch, "average")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["A", "B", "Avg", "C"],
      ["1", "2", "1.5", "3"],
      ["4", "5", "", "6"],
    ]);
  });

  it("adds a left label column when a result row would overwrite the first selected column", () => {
    const target = selectCells(numeric(), [1, 0], [2, 0]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["", "A", "B", "C"],
      ["", "1", "2", "3"],
      ["", "4", "5", "6"],
      ["Sum", "5", "", ""],
    ]);
  });

  it("keeps Sum in the existing first column when the selection does not include it", () => {
    const target = selectCells(numeric(), [1, 1], [2, 2]);
    expect(applyTableAggregateState(target.state, target.dispatch, "sum")).toBe(true);
    expect(readTableGrid(target.state)).toEqual([
      ["A", "B", "C", "Sum"],
      ["1", "2", "3", "5"],
      ["4", "5", "6", "11"],
      ["Sum", "7", "9", "16"],
    ]);
  });

  it("bolds Sum and Avg labels but not numeric results", () => {
    const sumTarget = selectCells(numeric(), [1, 0], [2, 1]);
    expect(applyTableAggregateState(sumTarget.state, sumTarget.dispatch, "sum")).toBe(true);
    expect(cellIsBold(sumTarget.state, 0, 3)).toBe(true);
    expect(cellIsBold(sumTarget.state, 3, 0)).toBe(true);
    expect(cellIsBold(sumTarget.state, 1, 3)).toBe(false);
    expect(cellIsBold(sumTarget.state, 3, 1)).toBe(false);
    expect(cellIsBold(sumTarget.state, 3, 3)).toBe(false);

    const avgTarget = selectCells(numeric(), [1, 1], [2, 1]);
    expect(applyTableAggregateState(avgTarget.state, avgTarget.dispatch, "average")).toBe(true);
    expect(cellIsBold(avgTarget.state, 3, 0)).toBe(true);
    expect(cellIsBold(avgTarget.state, 3, 1)).toBe(false);
  });
});
