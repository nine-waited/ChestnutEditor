import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { tableNodes, TableMap, selectedRect } from "@milkdown/kit/prose/tables";
import { applyColumnAlignmentState, caretPosForTableClick, forceCaretPosForTableClick } from "./markdown-table-ops.js";

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
});

function cell(text: string, header = false) {
  const type = header ? "table_header" : "table_cell";
  return schema.node(type, { alignment: "left" }, [
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

function caretInCell(row: number, col: number) {
  const doc = makeDoc();
  let tablePos = 0;
  doc.descendants((child, childPos) => {
    if (child.type.name === "table") {
      tablePos = childPos;
      return false;
    }
  });
  const node = doc.firstChild!;
  const map = TableMap.get(node);
  const cellPos = tablePos + 1 + map.map[row * map.width + col]!;
  const inner = cellPos + 2;
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

function cellPos(doc: ReturnType<typeof makeDoc>, row: number, col: number): number {
  let tablePos = 0;
  doc.descendants((child, childPos) => {
    if (child.type.name === "table") {
      tablePos = childPos;
      return false;
    }
  });
  const map = TableMap.get(doc.firstChild!);
  return tablePos + 1 + map.map[row * map.width + col]!;
}

function alignments(state: EditorState): string[] {
  const values: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === "table_cell" || node.type.name === "table_header") {
      values.push(String(node.attrs.alignment ?? "left"));
    }
  });
  return values;
}

describe("caretPosForTableClick", () => {
  it("puts the caret inside an empty header when the pos is the cell node", () => {
    const doc = schema.node("doc", null, [
      schema.node("table", null, [
        schema.node("table_row", null, [cell("", true), cell("B", true)]),
        schema.node("table_row", null, [cell("c"), cell("d")]),
      ]),
    ]);
    const headerPos = cellPos(doc, 0, 0);
    expect(caretPosForTableClick(doc.resolve(headerPos))).toBe(headerPos + 2);
    expect(forceCaretPosForTableClick(doc.resolve(headerPos))).toBe(headerPos + 2);
    expect(caretPosForTableClick(doc.resolve(headerPos + 1))).toBe(headerPos + 2);
  });

  it("does not steal a click that already landed in filled header text", () => {
    const doc = makeDoc();
    const headerPos = cellPos(doc, 0, 0);
    const inText = headerPos + 2;
    expect(caretPosForTableClick(doc.resolve(inText))).toBe(inText);
    expect(forceCaretPosForTableClick(doc.resolve(inText))).toBeNull();
  });
});

describe("table caret location", () => {
  it("selectedRect follows the caret cell as the current row and column", () => {
    const target = caretInCell(1, 1);
    const rect = selectedRect(target.state);
    expect(rect.top).toBe(1);
    expect(rect.left).toBe(1);
    expect(rect.bottom).toBe(2);
    expect(rect.right).toBe(2);
  });
});

describe("applyColumnAlignmentState", () => {
  it("sets alignment on every cell in the current column", () => {
    const target = caretInCell(1, 0);
    expect(applyColumnAlignmentState(target.state, target.dispatch, "center")).toBe(true);
    expect(alignments(target.state)).toEqual(["center", "left", "center", "left"]);
  });

  it("can align the header column to the right", () => {
    const target = caretInCell(0, 1);
    expect(applyColumnAlignmentState(target.state, target.dispatch, "right")).toBe(true);
    expect(alignments(target.state)).toEqual(["left", "right", "left", "right"]);
  });
});
