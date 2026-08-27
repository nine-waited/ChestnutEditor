import type { Ctx } from "@milkdown/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { addRowAfterCommand } from "@milkdown/kit/preset/gfm";
import { Selection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  CellSelection,
  addRowAfter,
  cellAround,
  deleteTable,
  goToNextCell,
  isInTable,
  nextCell,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

export interface TableCommandTarget {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

export function selectionIsInTable(state: EditorState): boolean {
  return isInTable(state);
}

export function isEntireTableSelected(state: EditorState): boolean {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) return false;
  return selection.isRowSelection() && selection.isColSelection();
}

function tryAddRowAfter(target: TableCommandTarget, ctx?: Ctx): boolean {
  if (ctx) {
    try {
      if (ctx.get(commandsCtx).call(addRowAfterCommand.key)) return true;
    } catch {
      // Commands may be unavailable in unit tests.
    }
  }
  return addRowAfter(target.state, target.dispatch);
}

/** Tab: next cell; last cell adds a row then moves into it. Shift+Tab: previous cell. */
export function moveTableCellByTab(target: TableCommandTarget, direction: 1 | -1, ctx?: Ctx): boolean {
  if (!isInTable(target.state)) return false;
  if (goToNextCell(direction)(target.state, target.dispatch)) return true;
  if (direction < 0) return true;
  if (!tryAddRowAfter(target, ctx)) return true;
  goToNextCell(1)(target.state, target.dispatch);
  return true;
}

/** Enter: same column, next row; last row adds a row then moves down. */
export function moveTableCellByEnter(target: TableCommandTarget, ctx?: Ctx): boolean {
  if (!isInTable(target.state)) return false;
  const $cell = cellAround(target.state.selection.$head);
  if (!$cell) return false;

  const below = nextCell($cell, "vert", 1);
  if (below) {
    target.dispatch(target.state.tr.setSelection(Selection.near(below, 1)).scrollIntoView());
    return true;
  }

  if (!tryAddRowAfter(target, ctx)) return true;
  const $cellAfter = cellAround(target.state.selection.$head);
  if (!$cellAfter) return true;
  const belowAfter = nextCell($cellAfter, "vert", 1);
  if (belowAfter) {
    target.dispatch(
      target.state.tr.setSelection(Selection.near(belowAfter, 1)).scrollIntoView(),
    );
  }
  return true;
}

export function handleTableSpreadsheetKeydown(
  view: EditorView,
  event: KeyboardEvent,
  ctx?: Ctx,
): boolean {
  if (!view.editable) return false;
  if (!isInTable(view.state)) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  if (event.key === "Tab") {
    moveTableCellByTab(view, event.shiftKey ? -1 : 1, ctx);
    return true;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    moveTableCellByEnter(view, ctx);
    return true;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && isEntireTableSelected(view.state)) {
    return deleteTable(view.state, view.dispatch);
  }

  return false;
}

/** Capture-phase on the editor DOM so GFM `Enter` → exitTable does not win. */
export function attachTableSpreadsheetKeymap(
  editorEl: HTMLElement,
  run: (fn: (ctx: Ctx) => void) => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" && event.key !== "Enter" && event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }
    let handled = false;
    run((ctx) => {
      const view = ctx.get(editorViewCtx);
      handled = handleTableSpreadsheetKeydown(view, event, ctx);
    });
    if (!handled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  editorEl.addEventListener("keydown", onKeyDown, true);
  return () => editorEl.removeEventListener("keydown", onKeyDown, true);
}
