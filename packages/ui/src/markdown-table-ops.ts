import type { Ctx } from "@milkdown/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
  selectColCommand,
  selectRowCommand,
  selectTableCommand,
} from "@milkdown/kit/preset/gfm";
import type { Node, ResolvedPos } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  CellSelection,
  cellAround,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { applyTableAggregateState } from "./markdown-table-aggregate.js";

export type TableAlignment = "left" | "center" | "right";

export type TableMenuOp =
  | "rowBefore"
  | "rowAfter"
  | "colBefore"
  | "colAfter"
  | "deleteRow"
  | "deleteCol"
  | "deleteTable"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "sum"
  | "average";

export function ctxSelectionIsInTable(ctx: Ctx): boolean {
  try {
    return isInTable(ctx.get(editorViewCtx).state);
  } catch {
    return false;
  }
}

export function tablePosFromSelection(state: EditorState): number | null {
  const $cell = cellAround(state.selection.$head);
  if (!$cell) return null;
  for (let depth = $cell.depth; depth > 0; depth--) {
    if ($cell.node(depth).type.name === "table") return $cell.before(depth);
  }
  return null;
}

export function tableElementFromView(view: EditorView): HTMLTableElement | null {
  const pos = tablePosFromSelection(view.state);
  if (pos == null) return null;
  const node = view.nodeDOM(pos);
  if (node instanceof HTMLTableElement) return node;
  if (node instanceof HTMLElement) return node.querySelector("table");
  return null;
}

function isTableCellNode(node: Node | null | undefined): node is Node {
  return node?.type.name === "table_header" || node?.type.name === "table_cell";
}

function tableCellAtResolved($pos: ResolvedPos): Node | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isTableCellNode(node)) return node;
  }
  if (isTableCellNode($pos.nodeAfter)) return $pos.nodeAfter;
  if (isTableCellNode($pos.nodeBefore)) return $pos.nodeBefore;
  return null;
}

/** Text caret inside a table cell, including clicks that land on the cell node itself. */
export function caretPosForTableClick($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name !== "table_header" && name !== "table_cell") continue;
    if ($pos.parent.inlineContent) return $pos.pos;
    return $pos.start(depth) + 1;
  }
  const after = $pos.nodeAfter;
  if (isTableCellNode(after)) return $pos.pos + 2;
  const before = $pos.nodeBefore;
  if (isTableCellNode(before)) return $pos.pos - before.nodeSize + 2;
  return null;
}

/** Force a text caret for empty cells or clicks on cell chrome; leave filled-text clicks to PM. */
export function forceCaretPosForTableClick($pos: ResolvedPos): number | null {
  const caret = caretPosForTableClick($pos);
  if (caret == null) return null;
  const cell = tableCellAtResolved($pos);
  if (cell && cell.content.size > 2 && $pos.parent.inlineContent) return null;
  return caret;
}

export function placeTableCellCaretFromPos(view: EditorView, pos: number): boolean {
  if (!view.editable) return false;
  if (view.state.selection instanceof CellSelection) return false;
  const max = view.state.doc.content.size;
  const resolved = Math.min(Math.max(pos, 0), max);
  const caret = forceCaretPosForTableClick(view.state.doc.resolve(resolved));
  if (caret == null) return false;
  if (view.state.selection.empty && view.state.selection.from === caret) return false;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));
  return true;
}

export function placeTableCellCaret(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || event.button !== 0 || event.shiftKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const cellEl = target.closest("th, td");
  if (!(cellEl instanceof HTMLElement) || !view.dom.contains(cellEl)) return false;

  const tryPos = (pos: number): boolean => placeTableCellCaretFromPos(view, pos);

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (coords) {
    const inside = coords.inside >= 0 ? coords.inside : coords.pos;
    if (tryPos(inside) || tryPos(coords.pos)) {
      view.focus();
      return true;
    }
    if (forceCaretPosForTableClick(view.state.doc.resolve(inside)) == null) return false;
  }
  try {
    if (tryPos(view.posAtDOM(cellEl, 0))) {
      view.focus();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Put a text caret in the table cell under the pointer, including filled cells and right-click. */
export function placeTableCellCaretAtPointer(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const cellEl = target.closest("th, td");
  if (!(cellEl instanceof HTMLElement) || !view.dom.contains(cellEl)) return false;

  const applyCaret = (pos: number): boolean => {
    const max = view.state.doc.content.size;
    const resolved = Math.min(Math.max(pos, 0), max);
    const caret = caretPosForTableClick(view.state.doc.resolve(resolved));
    if (caret == null) return false;
    if (view.state.selection.empty && view.state.selection.from === caret) {
      view.focus();
      return true;
    }
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));
    view.focus();
    return true;
  };

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (coords) {
    const inside = coords.inside >= 0 ? coords.inside : coords.pos;
    if (applyCaret(inside) || applyCaret(coords.pos)) return true;
  }
  try {
    return applyCaret(view.posAtDOM(cellEl, 0));
  } catch {
    return false;
  }
}

/** GFM stores align on every cell; Milkdown copies header → body, so set the whole column. */
export function applyColumnAlignmentState(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  alignment: TableAlignment,
): boolean {
  if (!isInTable(state)) return false;
  let rect;
  try {
    rect = selectedRect(state);
  } catch {
    return false;
  }
  const { map, tableStart } = rect;
  const col = rect.left;
  const { tr, doc } = state;
  for (let row = 0; row < map.height; row++) {
    const pos = tableStart + map.map[row * map.width + col]!;
    const cell = doc.nodeAt(pos);
    if (!cell) continue;
    if (cell.attrs.alignment === alignment) continue;
    tr.setNodeMarkup(pos, undefined, { ...cell.attrs, alignment });
  }
  if (!tr.docChanged) return true;
  dispatch(tr.scrollIntoView());
  return true;
}

export function applyColumnAlignment(view: EditorView, alignment: TableAlignment): boolean {
  if (!view.editable) return false;
  return applyColumnAlignmentState(view.state, (tr) => view.dispatch(tr), alignment);
}

export function runTableMenuOp(ctx: Ctx, op: TableMenuOp): boolean {
  const view = ctx.get(editorViewCtx);
  if (!view.editable) return false;
  if (!isInTable(view.state) && op !== "deleteTable") return false;

  const commands = ctx.get(commandsCtx);

  const call = (ran: boolean): boolean => {
    view.focus();
    return ran;
  };

  switch (op) {
    case "rowBefore":
      return call(Boolean(commands.call(addRowBeforeCommand.key)));
    case "rowAfter":
      return call(Boolean(commands.call(addRowAfterCommand.key)));
    case "colBefore":
      return call(Boolean(commands.call(addColBeforeCommand.key)));
    case "colAfter":
      return call(Boolean(commands.call(addColAfterCommand.key)));
    case "deleteRow": {
      let index = 0;
      try {
        index = selectedRect(view.state).top;
      } catch {
        index = 0;
      }
      commands.call(selectRowCommand.key, { index });
      return call(
        Boolean(commands.call(deleteSelectedCellsCommand.key)) || deleteRow(view.state, view.dispatch),
      );
    }
    case "deleteCol": {
      let index = 0;
      try {
        index = selectedRect(view.state).left;
      } catch {
        index = 0;
      }
      commands.call(selectColCommand.key, { index });
      return call(
        Boolean(commands.call(deleteSelectedCellsCommand.key)) ||
          deleteColumn(view.state, view.dispatch),
      );
    }
    case "deleteTable":
      commands.call(selectTableCommand.key);
      return call(
        Boolean(commands.call(deleteSelectedCellsCommand.key)) || deleteTable(view.state, view.dispatch),
      );
    case "alignLeft":
      return call(applyColumnAlignment(view, "left"));
    case "alignCenter":
      return call(applyColumnAlignment(view, "center"));
    case "alignRight":
      return call(applyColumnAlignment(view, "right"));
    case "sum":
      return call(applyTableAggregateState(view.state, (tr) => view.dispatch(tr), "sum"));
    case "average":
      return call(applyTableAggregateState(view.state, (tr) => view.dispatch(tr), "average"));
    default:
      return false;
  }
}
