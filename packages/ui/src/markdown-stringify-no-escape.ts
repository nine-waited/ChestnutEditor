import type { Options } from "remark-stringify";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/ctx";

/**
 * Milkdown's default text handler calls `state.safe()`, which auto-escapes
 * `* _ [ ]` etc. Disable that so users control escaping with `\`.
 */
export function disableMarkdownAutoEscape(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev: Options) => ({
    ...prev,
    encode: [],
    handlers: {
      ...prev.handlers,
      text: (node) => node.value,
    },
  }));
}
