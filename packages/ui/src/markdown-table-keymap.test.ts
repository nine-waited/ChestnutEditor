import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { tableNodes, TableMap, isInTable } from "@milkdown/kit/prose/tables";
import {
  isEntireTableSelected,
  moveTableCellByEnter,
  moveTableCellByTab,
  type TableCommandTarget,
} from "./markdown-table-keymap.js";
import { tablePosFromSelection } from "./markdown-table-ops.js";

const table = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: {},
});

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    ...table,
  },
});

function cell(text: string, header = false) {
  const type = header ? "table_header" : "table_cell";
  return schema.node(type, null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

function makeDoc() {
  return schema.node("doc", null, [
    schema.node("table", null, [
      schema.node("table_row", null, [cell("A", true), cell("B", true)]),
      schema.node("table_row", null, [cell("c"), cell("d")]),
    ]),
  ]);
}

function tableInfo(doc: ReturnType<typeof makeDoc>) {
  let pos = 0;
  const node = doc.firstChild!;
  doc.descendants((child, childPos) => {
    if (child.type.name === "table") {
      pos = childPos;
      return false;
    }
  });
  return { node, pos, map: TableMap.get(node), tableStart: pos + 1 };
}

function caretInCell(row: number, col: number) {
  const doc = makeDoc();
  const info = tableInfo(doc);
  const rel = info.map.map[row * info.map.width + col]!;
  const cellPos = info.tableStart + rel;
  const inner = cellPos + 2;
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, inner),
  });
  return mutableTarget(state);
}

function mutableTarget(initial: EditorState): TableCommandTarget & { getState: () => EditorState } {
  let state = initial;
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
    getState() {
      return state;
    },
  };
}

function cellCount(state: EditorState): number {
  let count = 0;
  state.doc.descendants((node) => {
    if (node.type.name === "table_cell" || node.type.name === "table_header") count++;
  });
  return count;
}

function rowCount(state: EditorState): number {
  let count = 0;
  state.doc.descendants((node) => {
    if (node.type.name === "table_row") count++;
  });
  return count;
}

describe("table spreadsheet keymap", () => {
  it("keeps Tab inside the table", () => {
    const target = caretInCell(0, 0);
    expect(isInTable(target.state)).toBe(true);
    moveTableCellByTab(target, 1);
    expect(isInTable(target.state)).toBe(true);
    expect(cellCount(target.state)).toBe(4);
  });

  it("adds a row when Tab is pressed in the last cell", () => {
    const target = caretInCell(1, 1);
    expect(rowCount(target.state)).toBe(2);
    moveTableCellByTab(target, 1);
    expect(rowCount(target.state)).toBe(3);
    expect(isInTable(target.state)).toBe(true);
  });

  it("adds a row when Enter is pressed in the last row", () => {
    const target = caretInCell(1, 0);
    expect(rowCount(target.state)).toBe(2);
    moveTableCellByEnter(target);
    expect(rowCount(target.state)).toBe(3);
    expect(isInTable(target.state)).toBe(true);
  });

  it("does not treat a caret in a cell as an entire-table selection", () => {
    const target = caretInCell(0, 0);
    expect(isEntireTableSelected(target.state)).toBe(false);
  });

  it("resolves the table position from a cell caret", () => {
    const target = caretInCell(1, 0);
    expect(tablePosFromSelection(target.state)).toBe(0);
  });
});
