import type { Node } from "@milkdown/kit/prose/model";
import { type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  CellSelection,
  addColumn,
  selectedRect,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";

export type TableAggregateKind = "sum" | "average";

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function parseTableNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!NUMBER_RE.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function formatTableNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number.parseFloat(value.toFixed(10));
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

export function tableAggregateLabel(kind: TableAggregateKind): "Sum" | "Avg" {
  return kind === "sum" ? "Sum" : "Avg";
}

export function isTableHeaderCell(node: Node): boolean {
  return node.type.name === "table_header" || node.type.spec.tableRole === "header_cell";
}

function aggregateValues(values: number[], kind: TableAggregateKind): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, item) => total + item, 0);
  return kind === "sum" ? sum : sum / values.length;
}

function cellAt(table: Node, map: TableMap, row: number, col: number): Node | null {
  return table.nodeAt(map.map[row * map.width + col]!);
}

interface AggregatePlan {
  rect: TableRect;
  dataRows: number[];
  dataCols: number[];
  rowResults: Map<number, number>;
  colResults: Map<number, number>;
  grand: number;
}

function planTableAggregate(state: EditorState, kind: TableAggregateKind): AggregatePlan | null {
  if (!(state.selection instanceof CellSelection)) return null;

  let rect: TableRect;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }

  const { table, map, left, right, top, bottom } = rect;
  const rowValues = new Map<number, number[]>();
  const colValues = new Map<number, number[]>();
  const all: number[] = [];

  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const cell = cellAt(table, map, row, col);
      if (!cell || isTableHeaderCell(cell)) continue;
      const parsed = parseTableNumber(cell.textContent);
      if (parsed == null) return null;
      all.push(parsed);
      const byRow = rowValues.get(row) ?? [];
      byRow.push(parsed);
      rowValues.set(row, byRow);
      const byCol = colValues.get(col) ?? [];
      byCol.push(parsed);
      colValues.set(col, byCol);
    }
  }

  if (all.length === 0) return null;

  const dataRows = [...rowValues.keys()].sort((a, b) => a - b);
  const dataCols = [...colValues.keys()].sort((a, b) => a - b);
  const rowResults = new Map<number, number>();
  for (const row of dataRows) {
    rowResults.set(row, aggregateValues(rowValues.get(row)!, kind));
  }
  const colResults = new Map<number, number>();
  for (const col of dataCols) {
    colResults.set(col, aggregateValues(colValues.get(col)!, kind));
  }

  return {
    rect,
    dataRows,
    dataCols,
    rowResults,
    colResults,
    grand: aggregateValues(all, kind),
  };
}

function insertBodyRow(tr: Transaction, tableStart: number, table: Node, row: number): Transaction {
  const schema = table.type.schema;
  const rowType = schema.nodes.table_row;
  const cellType = schema.nodes.table_cell;
  if (!rowType || !cellType) return tr;

  let rowPos = tableStart;
  for (let i = 0; i < row; i++) {
    rowPos += table.child(i).nodeSize;
  }

  const map = TableMap.get(table);
  const cells = [];
  for (let col = 0; col < map.width; col++) {
    const header = table.nodeAt(map.map[col]!);
    const alignment = header?.attrs.alignment;
    const created = cellType.createAndFill(alignment != null ? { alignment } : null);
    if (created) cells.push(created);
  }
  if (cells.length === 0) return tr;
  tr.insert(rowPos, rowType.create(null, cells));
  return tr;
}

function setCellPlainText(tr: Transaction, cellPos: number, text: string, bold = false): void {
  const cell = tr.doc.nodeAt(cellPos);
  if (!cell) return;
  const schema = tr.doc.type.schema;
  const paraType = schema.nodes.paragraph;
  if (!paraType) return;
  const marks = bold && schema.marks.strong ? [schema.marks.strong.create()] : undefined;
  const content = text ? [schema.text(text, marks)] : [];
  tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, paraType.create(null, content));
}

export function applyTableAggregateState(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  kind: TableAggregateKind,
): boolean {
  const plan = planTableAggregate(state, kind);
  if (!plan) return false;

  const { rect } = plan;
  const addCol = plan.dataCols.length !== 1 || plan.dataRows.length === 1;
  const addRow = plan.dataRows.length > 1;
  const addLeftLabelCol = addRow && rect.left === 0;
  const colShift = addLeftLabelCol ? 1 : 0;
  const label = tableAggregateLabel(kind);

  let tr = state.tr;
  if (addCol) {
    tr = addColumn(tr, rect, rect.right);
  }
  if (addLeftLabelCol) {
    tr = addColumn(tr, rect, 0);
  }
  const tableAfterCol = tr.doc.nodeAt(rect.tableStart - 1);
  if (!tableAfterCol) return false;
  if (addRow) {
    tr = insertBodyRow(tr, rect.tableStart, tableAfterCol, rect.bottom);
  }

  const tableFinal = tr.doc.nodeAt(rect.tableStart - 1);
  if (!tableFinal) return false;
  const map = TableMap.get(tableFinal);
  const resultCol = rect.right + colShift;
  const resultRow = rect.bottom;

  const writes: Array<{ row: number; col: number; text: string; bold?: boolean }> = [];
  if (addCol) {
    writes.push({ row: 0, col: resultCol, text: label, bold: true });
    for (const row of plan.dataRows) {
      writes.push({ row, col: resultCol, text: formatTableNumber(plan.rowResults.get(row)!) });
    }
  }
  if (addRow) {
    for (const col of plan.dataCols) {
      writes.push({
        row: resultRow,
        col: col + colShift,
        text: formatTableNumber(plan.colResults.get(col)!),
      });
    }
    writes.push({ row: resultRow, col: 0, text: label, bold: true });
    if (addCol) {
      writes.push({ row: resultRow, col: resultCol, text: formatTableNumber(plan.grand) });
    }
  }
  writes.sort((a, b) => map.map[b.row * map.width + b.col]! - map.map[a.row * map.width + a.col]!);

  for (const write of writes) {
    const pos = rect.tableStart + map.map[write.row * map.width + write.col]!;
    setCellPlainText(tr, pos, write.text, write.bold);
  }

  dispatch(tr.scrollIntoView());
  return true;
}

export function readTableGrid(state: EditorState): string[][] | null {
  try {
    const rect = selectedRect(state);
    const { table, map } = rect;
    const rows: string[][] = [];
    for (let row = 0; row < map.height; row++) {
      const cells: string[] = [];
      for (let col = 0; col < map.width; col++) {
        cells.push(cellAt(table, map, row, col)?.textContent ?? "");
      }
      rows.push(cells);
    }
    return rows;
  } catch {
    return null;
  }
}
