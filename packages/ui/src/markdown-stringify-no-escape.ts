import type { Options } from "remark-stringify";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/ctx";
import { escapeUnescapedTablePipes } from "./markdown-table-gfm-pipes.js";

/**
 * Milkdown's default text handler calls `state.safe()`, which auto-escapes
 * `* _ [ ]` etc. Disable that so users control escaping with `\`.
 * Table cells still escape `|` — otherwise GFM treats it as a new column and
 * the table falls back to a paragraph on the next parse.
 */
export function stringifyMarkdownText(
  node: { value?: string | null },
  _parent?: unknown,
  state?: { stack?: string[] },
): string {
  const value = node.value ?? "";
  if (state?.stack?.includes("tableCell")) {
    return escapeUnescapedTablePipes(value);
  }
  return value;
}

export function disableMarkdownAutoEscape(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev: Options) => ({
    ...prev,
    encode: [],
    handlers: {
      ...prev.handlers,
      text: stringifyMarkdownText,
    },
  }));
}
