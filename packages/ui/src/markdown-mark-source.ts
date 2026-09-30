import { $prose } from "@milkdown/utils";
import type { Mark, MarkType, Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

export const MARK_SOURCE_META = "chestnut-mark-source";

export interface MarkSourceEnter {
  side: -1 | 1;
  offset: number;
  from?: number;
  to?: number;
}

interface ExpandedSource {
  from: number;
  to: number;
}

interface MarkSourcePluginState {
  expanded: ExpandedSource | null;
  decorations: DecorationSet;
}

const pluginKey = new PluginKey<MarkSourcePluginState>("chestnut-mark-source");
const TOKEN_ORDER = ["==", "~~", "**", "__", "$", "*", "_"];

function isMathNode(node: Node): boolean {
  return node.type.name === "math_inline" || node.type.name === "inlineMath";
}

function isTargetMark(mark: Mark): boolean {
  const name = mark.type.name;
  return name === "strong" || name === "emphasis" || name === "strike_through" || name === "strikethrough";
}

function tokenForMark(mark: Mark): string | null {
  const marker = typeof mark.attrs?.marker === "string" ? mark.attrs.marker : "*";
  if (mark.type.name === "strong") return marker === "_" ? "__" : "**";
  if (mark.type.name === "emphasis") return marker === "_" ? "_" : "*";
  if (mark.type.name === "strike_through" || mark.type.name === "strikethrough") return "~~";
  return null;
}

function matchTokenAt(text: string, index: number): string | null {
  const rest = text.slice(index);
  return TOKEN_ORDER.find((token) => rest.startsWith(token)) ?? null;
}

function leadingTokenLength(text: string): number {
  let index = 0;
  while (index < text.length) {
    const token = matchTokenAt(text, index);
    if (!token) break;
    index += token.length;
  }
  return index;
}

function trailingTokenLength(text: string): number {
  let index = text.length;
  while (index > 0) {
    const token = TOKEN_ORDER.find((item) => text.slice(0, index).endsWith(item));
    if (!token) break;
    index -= token.length;
  }
  return text.length - index;
}

function outerWrapper(text: string): string | null {
  for (const token of ["==", "~~", "**", "__", "$"]) {
    if (text.startsWith(token) && text.endsWith(token) && text.length >= token.length * 2 + 1) return token;
  }
  if (text.startsWith("**") || text.startsWith("__")) return null;
  if (text.startsWith("*") && text.endsWith("*") && text.length >= 3) return "*";
  if (text.startsWith("_") && text.endsWith("_") && text.length >= 3) return "_";
  return null;
}

export function findFormattedSpan(doc: Node, pos: number): { from: number; to: number } | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "code_block" || name === "heading") return null;
  }
  if (!$pos.parent.inlineContent) return null;
  const start = $pos.start();
  const segs: Array<{ from: number; to: number; formatted: boolean }> = [];
  let offset = 0;
  $pos.parent.forEach((child) => {
    const from = start + offset;
    const to = from + child.nodeSize;
    offset += child.nodeSize;
    segs.push({
      from,
      to,
      formatted: isMathNode(child) || (child.isText && child.marks.some(isTargetMark)),
    });
  });
  const hits = segs.filter((seg) => seg.formatted && seg.from <= pos && pos <= seg.to);
  if (hits.length === 0) return null;
  let from = Math.min(...hits.map((seg) => seg.from));
  let to = Math.max(...hits.map((seg) => seg.to));
  let grew = true;
  while (grew) {
    grew = false;
    for (const seg of segs) {
      if (!seg.formatted || seg.to < from || seg.from > to) continue;
      if (seg.from < from || seg.to > to) {
        from = Math.min(from, seg.from);
        to = Math.max(to, seg.to);
        grew = true;
      }
    }
  }
  return from < to ? { from, to } : null;
}

function tokensOf(marks: readonly Mark[]): string[] {
  const list: Array<{ token: string; order: number }> = [];
  for (const mark of marks) {
    const token = tokenForMark(mark);
    if (!token) continue;
    const order = token === "~~" ? 1 : token === "**" || token === "__" ? 2 : 3;
    list.push({ token, order });
  }
  list.sort((a, b) => a.order - b.order);
  return list.map((item) => item.token);
}

function serializeRange(doc: Node, from: number, to: number): string {
  const $from = doc.resolve(from);
  const parent = $from.parent;
  const start = $from.start();
  const segments: Array<{ text: string; tokens: string[] }> = [];
  let offset = 0;
  parent.forEach((child) => {
    const childFrom = start + offset;
    const childTo = childFrom + child.nodeSize;
    offset += child.nodeSize;
    if (childTo <= from || childFrom >= to) return;
    if (isMathNode(child)) {
      segments.push({ text: String(child.attrs.value ?? ""), tokens: ["$"] });
      return;
    }
    if (!child.isText) return;
    const sliceFrom = Math.max(from, childFrom);
    const sliceTo = Math.min(to, childTo);
    const text = child.text?.slice(sliceFrom - childFrom, sliceTo - childFrom) ?? "";
    if (!text) return;
    const tokens = tokensOf(child.marks);
    const prev = segments[segments.length - 1];
    if (prev && prev.tokens.join() === tokens.join()) prev.text += text;
    else segments.push({ text, tokens });
  });
  const common = segments.reduce<string[] | null>((shared, seg) => {
    if (shared === null) return [...seg.tokens];
    return shared.filter((token) => seg.tokens.includes(token));
  }, null) ?? [];
  const inner = segments
    .map((seg) => {
      const extra = seg.tokens.filter((token) => !common.includes(token));
      return `${extra.join("")}${seg.text}${[...extra].reverse().join("")}`;
    })
    .join("");
  return `${common.join("")}${inner}${[...common].reverse().join("")}`;
}

function markTypeForToken(schema: Node["type"]["schema"], token: string): MarkType | null {
  if (token === "**" || token === "__") return schema.marks.strong ?? null;
  if (token === "*" || token === "_") return schema.marks.emphasis ?? null;
  if (token === "~~") return schema.marks.strike_through ?? schema.marks.strikethrough ?? null;
  return null;
}

function createSourceMark(type: MarkType, token: string): Mark {
  if (type.spec.attrs && Object.prototype.hasOwnProperty.call(type.spec.attrs, "marker")) {
    return type.create({ marker: token.includes("_") ? "_" : "*" });
  }
  return type.create();
}

function parseSourceText(schema: Node["type"]["schema"], text: string): Node[] {
  const token = outerWrapper(text);
  if (token) {
    const inner = text.slice(token.length, text.length - token.length);
    if (token === "$") {
      const math = schema.nodes.math_inline ?? schema.nodes.inlineMath;
      if (math) return [math.create({ value: inner })];
    }
    const parsed = inner ? parseSourceText(schema, inner) : [];
    const markType = markTypeForToken(schema, token);
    if (!markType) return parsed;
    return parsed.map((node) =>
      node.isText ? node.mark([...node.marks, createSourceMark(markType, token)]) : node,
    );
  }
  const nodes: Node[] = [];
  let index = 0;
  while (index < text.length) {
    const nextToken = matchTokenAt(text, index);
    const close = nextToken ? text.indexOf(nextToken, index + nextToken.length) : -1;
    if (nextToken && close > index) {
      nodes.push(...parseSourceText(schema, text.slice(index, close + nextToken.length)));
      index = close + nextToken.length;
      continue;
    }
    let next = index + 1;
    while (next < text.length && !matchTokenAt(text, next)) next += 1;
    const plain = text.slice(index, next);
    if (plain) nodes.push(schema.text(plain));
    index = next;
  }
  return nodes;
}

export function expandFormattedText(
  state: EditorState,
  span: { from: number; to: number },
  caret: number,
  enter: MarkSourceEnter | null,
  highlight = false,
): Transaction | null {
  let text = serializeRange(state.doc, span.from, span.to);
  if (highlight && !text.startsWith("==")) text = `==${text}==`;
  if (!text || text === state.doc.textBetween(span.from, span.to, "")) return null;
  const open = leadingTokenLength(text);
  const close = trailingTokenLength(text);
  let tr = state.tr.setStoredMarks([]);
  tr = tr.replaceWith(span.from, span.to, state.schema.text(text));
  const nextTo = span.from + text.length;
  let at = span.from + open + Math.max(0, caret - span.from);
  if (enter) {
    at = enter.side === -1 ? span.from + enter.offset : span.from + text.length - close + enter.offset;
  }
  at = Math.max(span.from, Math.min(at, nextTo));
  tr = tr.setSelection(TextSelection.create(tr.doc, at));
  return tr
    .setMeta(MARK_SOURCE_META, { sync: true, expanded: { from: span.from, to: nextTo } })
    .setMeta("addToHistory", false);
}

export function collapseFormattedText(state: EditorState, expanded: ExpandedSource): Transaction | null {
  const text = state.doc.textBetween(expanded.from, expanded.to, "");
  const nodes = parseSourceText(state.schema, text);
  if (nodes.length === 0) return null;
  if (text === nodes.map((node) => node.textContent || "").join("") && nodes.every((node) => node.isText && node.marks.length === 0)) {
    return state.tr.setMeta(MARK_SOURCE_META, { sync: true, clear: true }).setMeta("addToHistory", false);
  }
  let tr = state.tr.setStoredMarks([]);
  tr = tr.replaceWith(expanded.from, expanded.to, nodes);
  return tr.setMeta(MARK_SOURCE_META, { sync: true, clear: true }).setMeta("addToHistory", false);
}

function styleClass(text: string): string {
  const classes: string[] = [];
  if (text.includes("**") || text.includes("__")) classes.push("chestnut-expanded-strong");
  if (/(^|[^*])\*(?!\*)/.test(text) || /(^|[^_])_(?!_)/.test(text)) classes.push("chestnut-expanded-emphasis");
  if (text.includes("~~")) classes.push("chestnut-expanded-strike");
  if (text.includes("==")) classes.push("chestnut-expanded-highlight");
  return classes.join(" ");
}

function buildDecorations(doc: Node, expanded: ExpandedSource | null): DecorationSet {
  if (!expanded || expanded.from >= expanded.to) return DecorationSet.empty;
  const text = doc.textBetween(expanded.from, expanded.to, "");
  const open = leadingTokenLength(text);
  const close = trailingTokenLength(text);
  if (open <= 0 || close <= 0 || open + close >= text.length) return DecorationSet.empty;
  const decorations = [
    Decoration.inline(expanded.from, expanded.from + open, { class: "chestnut-heading-source-prefix" }),
    Decoration.inline(expanded.to - close, expanded.to, { class: "chestnut-heading-source-prefix" }),
  ];
  const className = styleClass(text);
  if (className) {
    decorations.push(
      Decoration.inline(expanded.from + open, expanded.to - close, { class: className }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

function caretInSourcePrefix(view: EditorView, prefix: HTMLElement, clientX: number): number | null {
  const start = view.posAtDOM(prefix, 0);
  const walker = document.createTreeWalker(prefix, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let seen = 0;
  while (node) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && clientX >= rect.left && clientX <= rect.right + 1) {
        return start + seen + (clientX > rect.left + rect.width / 2 ? 1 : 0);
      }
      seen += 1;
    }
    node = walker.nextNode();
  }
  const rect = prefix.getBoundingClientRect();
  if (clientX >= rect.right - 1) return view.posAtDOM(prefix, prefix.childNodes.length);
  return null;
}

function caretInside(expanded: ExpandedSource, pos: number): boolean {
  return expanded.from <= pos && pos <= expanded.to;
}

function unionSpan(
  left: { from: number; to: number } | null,
  right: { from: number; to: number } | null,
): { from: number; to: number } | null {
  if (!left) return right;
  if (!right) return left;
  return { from: Math.min(left.from, right.from), to: Math.max(left.to, right.to) };
}

function covers(outer: { from: number; to: number }, inner: { from: number; to: number }): boolean {
  return outer.from <= inner.from && inner.to <= outer.to;
}

function clearDomHighlight(view: EditorView): void {
  const selection = view.state.selection;
  try {
    document.execCommand("hiliteColor", false, "transparent");
  } catch {
    return;
  }
  if (!selection.empty || selection.from !== view.state.selection.from) {
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(MARK_SOURCE_META, { sync: true })
        .setMeta("addToHistory", false),
    );
  }
}

function highlightSpanAt(view: EditorView, pos: number): { from: number; to: number } | null {
  try {
    const els = view.dom.querySelectorAll('span[style*="background"], font[style*="background"], mark');
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest(".chestnut-live-source-hint, .chestnut-heading-prefix-hint, .katex")) continue;
      const from = view.posAtDOM(el, 0);
      const to = view.posAtDOM(el, el.childNodes.length);
      if (from < to && from <= pos && pos <= to) return { from, to };
    }
  } catch {
    return null;
  }
  return null;
}

export function createMarkSourcePlugin(): Plugin {
  let editorView: EditorView | null = null;
  let pendingHighlight: { from: number; to: number } | null = null;
  return new Plugin({
    key: pluginKey,
    view(view) {
      editorView = view;
      return {
        update(view) {
          const expanded = pluginKey.getState(view.state)?.expanded;
          if (!expanded && view.state.selection.empty && !pendingHighlight) {
            const highlight = highlightSpanAt(view, view.state.selection.from);
            if (highlight) {
              const tr = expandFormattedText(view.state, highlight, view.state.selection.from, null, true);
              if (tr) {
                view.dispatch(tr);
                clearDomHighlight(view);
                return;
              }
            }
          }
          if (expanded && highlightSpanAt(view, view.state.selection.from)) clearDomHighlight(view);
          const range = pendingHighlight;
          if (!range) return;
          pendingHighlight = null;
          try {
            const doc = view.state.doc;
            const from = Math.max(0, Math.min(range.from, doc.content.size));
            const to = Math.max(from, Math.min(range.to, doc.content.size));
            if (from === to) return;
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.create(doc, from, to))
                .setMeta(MARK_SOURCE_META, { sync: true })
                .setMeta("addToHistory", false),
            );
            document.execCommand("hiliteColor", false, "#ffe066");
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.create(view.state.doc, to))
                .setMeta(MARK_SOURCE_META, { sync: true })
                .setMeta("addToHistory", false),
            );
          } catch {
            // Highlight restore can fail while the view is remapping.
          }
        },
        destroy() {
          editorView = null;
        },
      };
    },
    state: {
      init(): MarkSourcePluginState {
        return { expanded: null, decorations: DecorationSet.empty };
      },
      apply(tr, value, _old, newState): MarkSourcePluginState {
        const meta = tr.getMeta(MARK_SOURCE_META) as
          | { expanded?: ExpandedSource; clear?: boolean }
          | undefined;
        let expanded = value.expanded;
        if (meta?.clear) expanded = null;
        else if (meta?.expanded) expanded = meta.expanded;
        else if (expanded && tr.docChanged) {
          expanded = {
            from: tr.mapping.map(expanded.from, -1),
            to: tr.mapping.map(expanded.to, 1),
          };
        }
        return { expanded, decorations: buildDecorations(newState.doc, expanded) };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        mousedown(view, event) {
          if (!view.editable) return false;
          const target = event.target instanceof HTMLElement ? event.target : event.target?.parentElement;
          if (!(target instanceof HTMLElement)) return false;
          const prefix = target.closest(".chestnut-heading-source-prefix");
          if (!(prefix instanceof HTMLElement)) return false;
          const at = caretInSourcePrefix(view, prefix, event.clientX);
          if (at == null) return false;
          event.preventDefault();
          view.focus();
          view.dispatch(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, at)).scrollIntoView(),
          );
          return true;
        },
      },
    },
    appendTransaction(transactions, _old, newState) {
      if (transactions.some((tr) => tr.getMeta(MARK_SOURCE_META)?.sync)) return null;
      const entered = transactions.some((tr) => tr.getMeta(MARK_SOURCE_META)?.enter);
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet || entered)) return null;
      const expanded = pluginKey.getState(newState)?.expanded ?? null;
      if (editorView?.editable === false || !newState.selection.empty) {
        return expanded ? collapseFormattedText(newState, expanded) : null;
      }
      const pos = newState.selection.from;
      if (expanded && caretInside(expanded, pos)) return null;
      if (expanded) {
        const text = newState.doc.textBetween(expanded.from, expanded.to, "");
        if (text.startsWith("==") && text.endsWith("==") && text.length >= 5) {
          pendingHighlight = {
            from: expanded.from,
            to: expanded.from + text.length - 4,
          };
        }
        return collapseFormattedText(newState, expanded);
      }
      const enter =
        transactions
          .map((tr) => tr.getMeta(MARK_SOURCE_META)?.enter as MarkSourceEnter | undefined)
          .find((item) => item != null) ?? null;
      const enteredSpan =
        enter?.from != null && enter.to != null && enter.from < enter.to
          ? { from: enter.from, to: enter.to }
          : null;
      const highlight = editorView ? highlightSpanAt(editorView, pos) : null;
      const formatted = findFormattedSpan(newState.doc, pos);
      const span = unionSpan(unionSpan(formatted, highlight), enteredSpan);
      if (!span) return null;
      const highlightWrap =
        (highlight != null && covers(highlight, span)) ||
        (enteredSpan != null && formatted == null && (highlight == null || covers(enteredSpan, span)));
      return expandFormattedText(newState, span, pos, enter, highlightWrap);
    },
  });
}

export const markSourceTextPlugin = $prose(() => createMarkSourcePlugin());
