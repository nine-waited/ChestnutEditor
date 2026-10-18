import { SchemaReady, prosePluginsCtx } from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { MarkType, Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { isEditingMarkSource } from "./markdown-mark-source.js";

export type OpeningWrapMark = "inlineCode" | "emphasis" | "strong" | "strike_through";

export interface OpeningDelimiterWrap {
  token: string;
  markName: OpeningWrapMark;
  innerLength: number;
  prefixLength: number;
}

const TOKENS: Array<{ token: string; markName: OpeningWrapMark }> = [
  { token: "**", markName: "strong" },
  { token: "__", markName: "strong" },
  { token: "~~", markName: "strike_through" },
  { token: "*", markName: "emphasis" },
  { token: "_", markName: "emphasis" },
  { token: "`", markName: "inlineCode" },
];

function innerForbidden(token: string): string {
  if (token === "**" || token === "*") return "*";
  if (token === "__" || token === "_") return "_";
  if (token === "~~") return "~";
  return token;
}

function longerTokenPrefixing(token: string): string | null {
  if (token === "*") return "**";
  if (token === "_") return "__";
  if (token === "~") return "~~";
  return null;
}

export function matchOpeningDelimiterWrap(
  inserted: string,
  before: string,
  after: string,
): OpeningDelimiterWrap | null {
  if (!inserted) return null;

  for (const { token, markName } of TOKENS) {
    if (!token.endsWith(inserted)) continue;
    const prefix = token.slice(0, token.length - inserted.length);
    if (!before.endsWith(prefix)) continue;

    const closerAt = after.indexOf(token);
    if (closerAt <= 0) continue;
    const inner = after.slice(0, closerAt);
    if (!inner.trim()) continue;
    const forbidden = innerForbidden(token);
    if (forbidden && inner.includes(forbidden)) continue;
    const longer = longerTokenPrefixing(token);
    if (longer && after.slice(closerAt).startsWith(longer)) continue;

    return {
      token,
      markName,
      innerLength: inner.length,
      prefixLength: prefix.length,
    };
  }
  return null;
}

function inlineTextAround(doc: Node, pos: number): { before: string; after: string } | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "code_block") return null;
  }
  if (!$pos.parent.inlineContent) return null;
  return {
    before: doc.textBetween($pos.start(), pos, ""),
    after: doc.textBetween(pos, $pos.end(), ""),
  };
}

function markTypeForWrap(state: EditorState, name: OpeningWrapMark): MarkType | null {
  if (name === "inlineCode") {
    return state.schema.marks.inlineCode ?? state.schema.marks.code_inline ?? state.schema.marks.code ?? null;
  }
  if (name === "strike_through") {
    return state.schema.marks.strike_through ?? state.schema.marks.strikethrough ?? null;
  }
  return state.schema.marks[name] ?? null;
}

function markAttrs(wrap: OpeningDelimiterWrap): Record<string, string> | undefined {
  if (wrap.markName === "emphasis" || wrap.markName === "strong") {
    return { marker: wrap.token.startsWith("*") ? "*" : "_" };
  }
  return undefined;
}

/**
 * Typing `**text**` one star at a time lets the italic input rule claim `*text*`
 * before the second closing star arrives. Hold the first closing star as text,
 * then turn the whole span into strong on the second star.
 */
export function applyClosingStrongDelimiter(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  if (from !== to || (text !== "*" && text !== "_")) return null;
  const around = inlineTextAround(state.doc, from);
  if (!around) return null;

  const marker = text === "*" ? "*" : "_";
  const pair = marker + marker;
  const before = around.before;
  const closed = new RegExp(`(?:^|[^${marker}])\\${marker}{2}([^${marker}\\n]+)\\${marker}$`).exec(before);
  if (closed?.[1]) {
    const inner = closed[1];
    const full = closed[0];
    const lead = full.length - (pair.length + inner.length + 1);
    const openerFrom = from - full.length + lead;
    const innerFrom = openerFrom + pair.length;
    const pendingFrom = innerFrom + inner.length;
    if (openerFrom < 0 || pendingFrom !== from - 1) return null;
    const markType = markTypeForWrap(state, "strong");
    if (!markType) return null;

    let tr = state.tr.delete(pendingFrom, from).delete(openerFrom, innerFrom);
    const markedFrom = openerFrom;
    const markedTo = openerFrom + inner.length;
    tr = tr.addMark(markedFrom, markedTo, markType.create(markAttrs({
      token: pair,
      markName: "strong",
      innerLength: inner.length,
      prefixLength: 1,
    })));
    tr = tr.setStoredMarks([]);
    return tr.setSelection(TextSelection.create(tr.doc, markedTo));
  }

  if (new RegExp(`(?:^|[^${marker}])\\${marker}{2}([^${marker}\\n]+)$`).test(before)) {
    return state.tr.insertText(text, from, to);
  }
  return null;
}

/** Build a transaction that wraps existing closer-side text when an opener is typed. */
export function applyOpeningDelimiterWrap(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  if (from !== to || !text) return null;
  const around = inlineTextAround(state.doc, from);
  if (!around) return null;

  const wrap = matchOpeningDelimiterWrap(text, around.before, around.after);
  if (!wrap) return null;

  const markType = markTypeForWrap(state, wrap.markName);
  if (!markType) return null;

  const innerFrom = from;
  const innerTo = from + wrap.innerLength;
  const closerFrom = innerTo;
  const closerTo = innerTo + wrap.token.length;
  const openerFrom = from - wrap.prefixLength;
  if (openerFrom < 0 || closerTo > state.doc.content.size) return null;
  if (state.doc.rangeHasMark(innerFrom, innerTo, markType)) return null;

  let tr = state.tr;
  tr = tr.delete(closerFrom, closerTo);
  if (wrap.prefixLength > 0) {
    tr = tr.delete(openerFrom, from);
  }
  const mappedFrom = openerFrom;
  const mappedTo = openerFrom + wrap.innerLength;
  if (wrap.markName === "inlineCode") {
    for (const mark of Object.values(state.schema.marks)) {
      if (mark && mark !== markType) tr = tr.removeMark(mappedFrom, mappedTo, mark);
    }
  }
  tr = tr.addMark(mappedFrom, mappedTo, markType.create(markAttrs(wrap)));
  tr = tr.setStoredMarks([]);
  return tr;
}

export const openingDelimiterWrapPlugin: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const plugin = new Plugin({
    key: new PluginKey("chestnut-opening-delimiter-wrap"),
    props: {
      handleTextInput(view: EditorView, from, to, text) {
        if (!view.editable || isEditingMarkSource(view.state)) return false;
        const closing = applyClosingStrongDelimiter(view.state, from, to, text);
        if (closing) {
          view.dispatch(closing.scrollIntoView());
          return true;
        }
        const tr = applyOpeningDelimiterWrap(view.state, from, to, text);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
  // Commonmark input rules are registered first and would turn the first
  // closing star of `**text**` into italic. Handle those keystrokes before them.
  ctx.update(prosePluginsCtx, (plugins) => [plugin, ...plugins]);
  return () => {
    ctx.update(prosePluginsCtx, (plugins) => plugins.filter((item) => item !== plugin));
  };
};
