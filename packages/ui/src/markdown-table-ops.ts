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
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from "@milkdown/kit/prose/tables";

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
  | "alignRight";

export function ctxSelectionIsInTable(ctx: Ctx): boolean {
  try {
    return isInTable(ctx.get(editorViewCtx).state);
  } catch {
    return false;
  }
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
      return call(
        Boolean(commands.call(addRowBeforeCommand.key)) || addRowBefore(view.state, view.dispatch),
      );
    case "rowAfter":
      return call(
        Boolean(commands.call(addRowAfterCommand.key)) || addRowAfter(view.state, view.dispatch),
      );
    case "colBefore":
      return call(
        Boolean(commands.call(addColBeforeCommand.key)) || addColumnBefore(view.state, view.dispatch),
      );
    case "colAfter":
      return call(
        Boolean(commands.call(addColAfterCommand.key)) || addColumnAfter(view.state, view.dispatch),
      );
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
      return call(Boolean(commands.call(setAlignCommand.key, "left")));
    case "alignCenter":
      return call(Boolean(commands.call(setAlignCommand.key, "center")));
    case "alignRight":
      return call(Boolean(commands.call(setAlignCommand.key, "right")));
    default:
      return false;
  }
}
