import { $prose } from "@milkdown/utils";
import type { MarkType, Node, Schema } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import {
  clickOffsetFromClientX,
  diffMarkPieces,
  editTokenText,
  headingHintDisplayText,
  isDelimiterInsertChar,
  piecesAfterDiff,
  type HintMarkName,
  type HintMarkPiece,
  type TokenTextEdit,
} from "./markdown-live-source-hint-edit.js";
import { HEADING_SOURCE_PREFIX_META, headingHasSourcePrefix } from "./markdown-heading-source-prefix.js";

const pluginKey = new PluginKey<LiveSourceHintPluginState>("chestnut-live-source-hints");

const HINT_MARKS: Record<string, { token: string; order: number; markName: HintMarkName }> = {
  inlineCode: { token: "`", order: 0, markName: "inlineCode" },
  code_inline: { token: "`", order: 0, markName: "inlineCode" },
  code: { token: "`", order: 0, markName: "inlineCode" },
  strike_through: { token: "~~", order: 1, markName: "strike_through" },
  strikethrough: { token: "~~", order: 1, markName: "strike_through" },
  strong: { token: "**", order: 2, markName: "strong" },
  emphasis: { token: "*", order: 3, markName: "emphasis" },
};

export interface LiveSourceHintSpec {
  pos: number;
  side: -1 | 1;
  text: string;
  kind: "heading" | "mark";
  pieces: HintMarkPiece[];
}

export interface MarkHintRange {
  from: number;
  to: number;
  token: string;
  order: number;
  markName: HintMarkName;
}

export interface TokenCaret extends LiveSourceHintSpec {
  offset: number;
}

interface LiveSourceHintPluginState {
  hoverPos: number | null;
  tokenCaret: TokenCaret | null;
  decorations: DecorationSet;
}

export function findHeadingAtPos(doc: Node, pos: number): { innerPos: number; level: number } | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== "heading") continue;
    const level = Number(node.attrs.level);
    if (!Number.isFinite(level)) return null;
    return {
      innerPos: $pos.start(depth),
      level: Math.min(6, Math.max(1, level)),
    };
  }
  return null;
}

function headingBlockAt(doc: Node, innerPos: number): { pos: number; node: Node } | null {
  const safe = Math.max(0, Math.min(innerPos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== "heading") continue;
    return { pos: $pos.before(depth), node };
  }
  return null;
}

function isInsideHintSkipBlock(doc: Node, pos: number): boolean {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "heading" || name === "code_block") return true;
  }
  return false;
}

export function collectMarkHintRanges(doc: Node, pos: number): MarkHintRange[] {
  if (isInsideHintSkipBlock(doc, pos)) return [];

  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  const parent = $pos.parent;
  if (!parent.inlineContent) return [];

  const start = $pos.start();
  const open = new Map<string, { from: number; token: string; order: number; markName: HintMarkName }>();
  const closed: MarkHintRange[] = [];
  let offset = 0;

  parent.forEach((child) => {
    const from = start + offset;
    const present = new Set<string>();
    if (child.isText) {
      for (const mark of child.marks) {
        if (HINT_MARKS[mark.type.name]) present.add(mark.type.name);
      }
    }
    for (const name of Object.keys(HINT_MARKS)) {
      const spec = HINT_MARKS[name];
      if (present.has(name)) {
        if (!open.has(name)) {
          open.set(name, { from, token: spec.token, order: spec.order, markName: spec.markName });
        }
      } else if (open.has(name)) {
        const opened = open.get(name)!;
        closed.push({
          from: opened.from,
          to: from,
          token: opened.token,
          order: opened.order,
          markName: opened.markName,
        });
        open.delete(name);
      }
    }
    offset += child.nodeSize;
  });

  const end = start + offset;
  for (const opened of open.values()) {
    closed.push({
      from: opened.from,
      to: end,
      token: opened.token,
      order: opened.order,
      markName: opened.markName,
    });
  }

  return closed.filter((range) => range.from < range.to && range.from <= pos && pos <= range.to);
}

function isMathInlineNode(node: Node): boolean {
  return node.type.name === "math_inline" || node.type.name === "inlineMath";
}

export function collectMathHintRanges(doc: Node, pos: number): MarkHintRange[] {
  if (isInsideHintSkipBlock(doc, pos)) return [];

  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  const parent = $pos.parent;
  if (!parent.inlineContent) return [];

  const start = $pos.start();
  const found: MarkHintRange[] = [];
  let offset = 0;
  parent.forEach((child) => {
    const from = start + offset;
    const to = from + child.nodeSize;
    if (isMathInlineNode(child) && from <= pos && pos <= to) {
      found.push({
        from,
        to,
        token: "$",
        order: -1,
        markName: "math",
      });
    }
    offset += child.nodeSize;
  });
  return found;
}

function outermostRanges<T extends { from: number; to: number }>(ranges: T[]): T[] {
  return ranges.filter(
    (range) =>
      !ranges.some(
        (other) =>
          other !== range &&
          other.from <= range.from &&
          range.to <= other.to &&
          (other.from < range.from || range.to < other.to),
      ),
  );
}

export function collectHighlightHintRanges(
  view: EditorView,
  pos: number,
): Array<{ from: number; to: number }> {
  if (isInsideHintSkipBlock(view.state.doc, pos)) return [];

  const found: Array<{ from: number; to: number }> = [];
  const seen = new Set<string>();
  try {
    const els = view.dom.querySelectorAll(
      'span[style*="background"], font[style*="background"], mark',
    );
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('.boke-live-source-hint, .boke-heading-prefix-hint, [data-type="math_inline"], .katex')) {
        continue;
      }
      const style = el.getAttribute("style") ?? "";
      if (
        el.tagName !== "MARK" &&
        /background(?:-color)?\s*:\s*(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0)/i.test(style)
      ) {
        continue;
      }
      const from = view.posAtDOM(el, 0);
      const to = view.posAtDOM(el, el.childNodes.length);
      if (from >= to || pos < from || pos > to) continue;
      const key = `${from}:${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ from, to });
    }
  } catch {
    return [];
  }
  return outermostRanges(found);
}

function targetPositions(state: EditorState, hoverPos: number | null): number[] {
  const positions = [state.selection.from];
  if (hoverPos != null && hoverPos !== state.selection.from) positions.push(hoverPos);
  return positions;
}

function specsFromMarkRanges(ranges: MarkHintRange[]): LiveSourceHintSpec[] {
  const endpoints: Array<{
    pos: number;
    side: -1 | 1;
    token: string;
    order: number;
    from: number;
    to: number;
    markName: HintMarkName;
  }> = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    const key = `${range.from}:${range.to}:${range.token}:${range.markName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({
      pos: range.from,
      side: -1,
      token: range.token,
      order: range.order,
      from: range.from,
      to: range.to,
      markName: range.markName,
    });
    endpoints.push({
      pos: range.to,
      side: 1,
      token: range.token,
      order: range.order,
      from: range.from,
      to: range.to,
      markName: range.markName,
    });
  }

  const grouped = new Map<string, typeof endpoints>();
  for (const endpoint of endpoints) {
    const key = `${endpoint.pos}:${endpoint.side}`;
    const list = grouped.get(key);
    if (list) list.push(endpoint);
    else grouped.set(key, [endpoint]);
  }

  const specs: LiveSourceHintSpec[] = [];
  for (const group of grouped.values()) {
    const side = group[0]!.side;
    const pos = group[0]!.pos;
    const ordered = [...group].sort((a, b) =>
      side === -1 ? a.order - b.order : b.order - a.order,
    );
    const text = ordered.map((item) => item.token).join("");
    if (!text) continue;
    specs.push({
      pos,
      side,
      text,
      kind: "mark",
      pieces: ordered.map((item) => ({
        token: item.token,
        markName: item.markName,
        from: item.from,
        to: item.to,
      })),
    });
  }
  return specs;
}

export function collectLiveSourceHintSpecs(
  state: EditorState,
  hoverPos: number | null,
  highlightRanges: Array<{ from: number; to: number }> = [],
): LiveSourceHintSpec[] {
  const specs: LiveSourceHintSpec[] = [];
  const seenHeadings = new Set<number>();
  const markRanges: MarkHintRange[] = [];

  for (const pos of targetPositions(state, hoverPos)) {
    const heading = findHeadingAtPos(state.doc, pos);
    if (heading && !seenHeadings.has(heading.innerPos)) {
      seenHeadings.add(heading.innerPos);
      const block = headingBlockAt(state.doc, heading.innerPos);
      if (!block || !headingHasSourcePrefix(block.node.textContent)) {
        specs.push({
          pos: heading.innerPos,
          side: -1,
          text: headingHintDisplayText(heading.level),
          kind: "heading",
          pieces: [],
        });
      }
    }
    markRanges.push(...collectMarkHintRanges(state.doc, pos));
    markRanges.push(...collectMathHintRanges(state.doc, pos));
  }

  for (const range of highlightRanges) {
    markRanges.push({
      from: range.from,
      to: range.to,
      token: "==",
      order: 4,
      markName: "highlight",
    });
  }

  specs.push(...specsFromMarkRanges(markRanges));
  return specs;
}

function markSpecsAtPos(state: EditorState, view: EditorView | null, pos: number): LiveSourceHintSpec[] {
  const highlight = view ? collectHighlightHintRanges(view, pos) : [];
  const markRanges: MarkHintRange[] = [
    ...collectMarkHintRanges(state.doc, pos),
    ...collectMathHintRanges(state.doc, pos),
    ...outermostRanges(highlight).map((range) => ({
      from: range.from,
      to: range.to,
      token: "==" as const,
      order: 4,
      markName: "highlight" as const,
    })),
  ];
  return specsFromMarkRanges(markRanges);
}

function schemaMark(schema: Schema, name: HintMarkName): MarkType | null {
  if (name === "highlight" || name === "math") return null;
  if (name === "strike_through") {
    return schema.marks.strike_through ?? schema.marks.strikethrough ?? null;
  }
  if (name === "inlineCode") {
    return schema.marks.inlineCode ?? schema.marks.code_inline ?? schema.marks.code ?? null;
  }
  return schema.marks[name] ?? null;
}

function applyHighlightRange(view: EditorView, from: number, to: number, on: boolean): void {
  const size = view.state.doc.content.size;
  const safeFrom = Math.max(0, Math.min(from, size));
  const safeTo = Math.max(safeFrom, Math.min(to, size));
  if (safeFrom >= safeTo) return;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, safeFrom, safeTo))
      .setMeta("addToHistory", false),
  );
  view.focus();
  document.execCommand("hiliteColor", false, on ? "#ffe066" : "transparent");
}

function unwrapMathInline(view: EditorView, from: number): boolean {
  const node = view.state.doc.nodeAt(from);
  if (!node || !isMathInlineNode(node)) return false;
  const value = String(node.attrs.value ?? "");
  const end = from + node.nodeSize;
  let tr = view.state.tr;
  if (value) {
    tr = tr.replaceWith(from, end, view.state.schema.text(value));
    tr = tr.setSelection(TextSelection.create(tr.doc, from, from + value.length));
  } else {
    tr = tr.delete(from, end);
    tr = tr.setSelection(TextSelection.create(tr.doc, from));
  }
  tr.setMeta(pluginKey, { tokenCaret: null });
  view.dispatch(tr.scrollIntoView());
  return true;
}

function applyMarkTokenEdit(
  view: EditorView,
  spec: LiveSourceHintSpec,
  edited: TokenTextEdit,
  keepCaret: boolean,
): boolean {
  const diff = diffMarkPieces(spec.pieces, edited.text);
  const mathOff = diff.remove.find((piece) => piece.markName === "math");
  if (mathOff) return unwrapMathInline(view, mathOff.from);

  let tr = view.state.tr;
  const schema = view.state.schema;
  let changed = false;

  for (const piece of diff.remove) {
    const type = schemaMark(schema, piece.markName);
    if (!type) continue;
    tr = tr.removeMark(piece.from, piece.to, type);
    changed = true;
  }
  for (const piece of diff.add) {
    const type = schemaMark(schema, piece.markName);
    if (!type) continue;
    tr = tr.addMark(piece.from, piece.to, type.create());
    changed = true;
  }

  const mappedPos = tr.mapping.map(spec.pos);
  tr = tr.setSelection(TextSelection.create(tr.doc, mappedPos));
  const nextCaret: TokenCaret | null =
    keepCaret && edited.text.length > 0
      ? {
          ...spec,
          pos: mappedPos,
          text: edited.text,
          offset: Math.max(0, Math.min(edited.offset, edited.text.length)),
          pieces: piecesAfterDiff(spec.pieces, edited.text),
        }
      : null;
  tr.setMeta(pluginKey, { tokenCaret: nextCaret });
  if (changed || keepCaret) view.dispatch(tr.scrollIntoView());
  else if (nextCaret == null) view.dispatch(tr.setMeta(pluginKey, { tokenCaret: null }));

  const highlightOff = diff.remove.filter((piece) => piece.markName === "highlight");
  const highlightOn = diff.add.filter((piece) => piece.markName === "highlight");
  if (highlightOff.length || highlightOn.length) {
    for (const piece of highlightOff) applyHighlightRange(view, piece.from, piece.to, false);
    for (const piece of highlightOn) applyHighlightRange(view, piece.from, piece.to, true);
    if (nextCaret) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, nextCaret.pos))
          .setMeta(pluginKey, { tokenCaret: nextCaret })
          .setMeta("addToHistory", false),
      );
    }
  }
  return true;
}

function beginTokenEdit(view: EditorView, spec: LiveSourceHintSpec, offset: number): void {
  if (spec.kind === "heading") {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, spec.pos))
        .setMeta(HEADING_SOURCE_PREFIX_META, { enterOffset: offset })
        .setMeta("addToHistory", false),
    );
    return;
  }
  const caret: TokenCaret = {
    ...spec,
    text: spec.text,
    offset: Math.max(0, Math.min(offset, spec.text.length)),
  };
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, spec.pos))
      .setMeta(pluginKey, { tokenCaret: caret })
      .setMeta("addToHistory", false),
  );
}

function clearTokenCaret(view: EditorView): void {
  if (!pluginKey.getState(view.state)?.tokenCaret) return;
  view.dispatch(view.state.tr.setMeta(pluginKey, { tokenCaret: null }).setMeta("addToHistory", false));
}

function createCaretElement(): HTMLElement {
  const caret = document.createElement("span");
  caret.className = "boke-live-source-hint__caret";
  caret.setAttribute("aria-hidden", "true");
  return caret;
}

function fillHintCharacters(
  host: HTMLElement,
  text: string,
  caretOffset: number | null,
  hashClass?: string,
): void {
  for (let i = 0; i < text.length; i++) {
    if (caretOffset === i) host.append(createCaretElement());
    const ch = document.createElement("span");
    ch.className = hashClass && text[i] === "#" ? hashClass : "boke-live-source-hint__ch";
    ch.dataset.hintIndex = String(i);
    ch.textContent = text[i] ?? "";
    host.append(ch);
  }
  if (caretOffset === text.length) host.append(createCaretElement());
}

function createHintElement(
  spec: LiveSourceHintSpec,
  view: EditorView,
  tokenCaret: TokenCaret | null,
): HTMLElement {
  const editing =
    tokenCaret != null && tokenCaret.pos === spec.pos && tokenCaret.side === spec.side;
  const span = document.createElement("span");
  span.className = spec.kind === "heading" ? "boke-heading-prefix-hint" : "boke-live-source-hint";
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";
  if (editing) span.classList.add("is-editing");

  const text = editing ? tokenCaret.text : spec.kind === "heading" ? spec.text.replace(/\s+$/, "") : spec.text;
  const caretOffset = editing ? tokenCaret.offset : null;
  fillHintCharacters(
    span,
    text,
    caretOffset,
    spec.kind === "heading" ? "boke-heading-prefix-hint__hashes" : undefined,
  );
  if (spec.kind === "heading") {
    const space = document.createElement("span");
    space.className = "boke-heading-prefix-hint__space";
    space.dataset.hintEnd = "1";
    space.textContent = " ";
    span.append(space);
  }

  if (view.editable) {
    span.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      const offset = clickOffsetFromClientX(event.target, event.clientX, text.length);
      beginTokenEdit(view, spec, offset);
    });
  }
  return span;
}

function overlayTokenCaret(specs: LiveSourceHintSpec[], tokenCaret: TokenCaret | null): LiveSourceHintSpec[] {
  if (!tokenCaret) return specs;
  const has = specs.some((spec) => spec.pos === tokenCaret.pos && spec.side === tokenCaret.side);
  if (has) return specs;
  return [...specs, tokenCaret];
}

export function buildLiveSourceHintDecorations(
  state: EditorState,
  hoverPos: number | null,
  view: EditorView | null,
  tokenCaret: TokenCaret | null = null,
): DecorationSet {
  const highlight: Array<{ from: number; to: number }> = [];
  if (view) {
    for (const pos of targetPositions(state, hoverPos)) {
      highlight.push(...collectHighlightHintRanges(view, pos));
    }
  }

  const specs = overlayTokenCaret(
    collectLiveSourceHintSpecs(state, hoverPos, outermostRanges(highlight)),
    tokenCaret,
  );
  if (specs.length === 0) return DecorationSet.empty;

  return DecorationSet.create(
    state.doc,
    specs.map((spec) => {
      const editing = tokenCaret && tokenCaret.pos === spec.pos && tokenCaret.side === spec.side;
      const key = `${spec.kind}-${spec.pos}-${spec.side}-${spec.text}-${editing ? tokenCaret.offset : ""}`;
      return Decoration.widget(spec.pos, (editorView) => createHintElement(spec, editorView, tokenCaret), {
        side: spec.side,
        key,
        ignoreSelection: true,
      });
    }),
  );
}

function mapHoverPos(
  prev: number | null,
  tr: { docChanged: boolean; mapping: { map: (pos: number) => number }; getMeta: (key: PluginKey) => unknown },
): number | null {
  const meta = tr.getMeta(pluginKey) as { hoverPos?: number | null } | undefined;
  if (meta && "hoverPos" in meta) return meta.hoverPos ?? null;
  if (prev == null || !tr.docChanged) return prev;
  return tr.mapping.map(prev);
}

function mapTokenCaret(
  prev: TokenCaret | null,
  tr: {
    docChanged: boolean;
    selectionSet: boolean;
    mapping: { map: (pos: number, assoc?: number) => number };
    getMeta: (key: PluginKey) => unknown;
  },
): TokenCaret | null {
  const meta = tr.getMeta(pluginKey) as { tokenCaret?: TokenCaret | null } | undefined;
  if (meta && "tokenCaret" in meta) return meta.tokenCaret ?? null;
  if (tr.selectionSet && !meta) return null;
  if (prev == null) return null;
  if (!tr.docChanged) return prev;
  return {
    ...prev,
    pos: tr.mapping.map(prev.pos, prev.side),
    pieces: prev.pieces.map((piece) => ({
      ...piece,
      from: tr.mapping.map(piece.from, -1),
      to: tr.mapping.map(piece.to, 1),
    })),
  };
}

function handleTokenCaretKey(view: EditorView, event: KeyboardEvent, caret: TokenCaret): boolean {
  if (event.key === "Escape") {
    clearTokenCaret(view);
    return true;
  }
  if (event.key === "ArrowLeft") {
    if (caret.offset > 0) {
      beginTokenEdit(view, caret, caret.offset - 1);
      return true;
    }
    clearTokenCaret(view);
    return false;
  }
  if (event.key === "ArrowRight") {
    if (caret.offset < caret.text.length) {
      beginTokenEdit(view, caret, caret.offset + 1);
      return true;
    }
    clearTokenCaret(view);
    return false;
  }
  if (event.key === "Home") {
    beginTokenEdit(view, caret, 0);
    return true;
  }
  if (event.key === "End") {
    beginTokenEdit(view, caret, caret.text.length);
    return true;
  }
  if (event.key === "Backspace") {
    if (caret.offset <= 0) {
      clearTokenCaret(view);
      return false;
    }
    const edited = editTokenText(caret.text, caret.offset, { type: "backspace" });
    return applyMarkTokenEdit(view, caret, edited, true);
  }
  if (event.key === "Delete") {
    if (caret.offset >= caret.text.length) {
      clearTokenCaret(view);
      return false;
    }
    const edited = editTokenText(caret.text, caret.offset, { type: "delete" });
    return applyMarkTokenEdit(view, caret, edited, true);
  }
  if (event.key === "Enter" || event.key === "Tab") {
    clearTokenCaret(view);
    return false;
  }
  return false;
}

function handleBoundaryBackspace(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;
  const pos = selection.from;

  const left = markSpecsAtPos(state, view, pos).find((spec) => spec.kind === "mark" && spec.side === -1 && spec.pos === pos);
  if (!left) return false;
  const edited = editTokenText(left.text, left.text.length, { type: "backspace" });
  return applyMarkTokenEdit(view, left, edited, edited.text.length > 0);
}

function handleBoundaryDelete(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;
  const pos = selection.from;
  const right = markSpecsAtPos(state, view, pos).find((spec) => spec.kind === "mark" && spec.side === 1 && spec.pos === pos);
  if (!right) return false;
  const edited = editTokenText(right.text, 0, { type: "delete" });
  return applyMarkTokenEdit(view, right, edited, edited.text.length > 0);
}

/** Live: gray markdown delimiters while the caret or pointer is on that format. */
export const liveSourceHintsPlugin = $prose(() => {
  let editorView: EditorView | null = null;

  return new Plugin({
    key: pluginKey,
    view(view) {
      editorView = view;
      return {
        update() {
          const caret = pluginKey.getState(view.state)?.tokenCaret;
          view.dom.classList.toggle("boke-token-editing", Boolean(caret));
        },
        destroy() {
          view.dom.classList.remove("boke-token-editing");
          editorView = null;
        },
      };
    },
    state: {
      init(_, state): LiveSourceHintPluginState {
        return {
          hoverPos: null,
          tokenCaret: null,
          decorations: buildLiveSourceHintDecorations(state, null, editorView, null),
        };
      },
      apply(tr, value, _oldState, newState): LiveSourceHintPluginState {
        const hoverPos = mapHoverPos(value.hoverPos, tr);
        const tokenCaret = mapTokenCaret(value.tokenCaret, tr);
        const meta = tr.getMeta(pluginKey);
        if (!tr.selectionSet && !tr.docChanged && !meta) return value;
        return {
          hoverPos,
          tokenCaret,
          decorations: buildLiveSourceHintDecorations(newState, hoverPos, editorView, tokenCaret),
        };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleTextInput(view, _from, _to, text) {
        if (!view.editable) return false;
        const caret = pluginKey.getState(view.state)?.tokenCaret;
        if (!caret || !text) return false;
        if ([...text].every(isDelimiterInsertChar) && !text.includes("#")) {
          const edited = editTokenText(caret.text, caret.offset, { type: "insert", char: text });
          return applyMarkTokenEdit(view, caret, edited, true);
        }
        clearTokenCaret(view);
        return false;
      },
      handleKeyDown(view, event) {
        if (!view.editable || event.defaultPrevented || event.isComposing) return false;
        if (event.altKey || event.ctrlKey || event.metaKey) return false;
        const caret = pluginKey.getState(view.state)?.tokenCaret;
        if (caret) return handleTokenCaretKey(view, event, caret);
        if (event.key === "Backspace") return handleBoundaryBackspace(view);
        if (event.key === "Delete") return handleBoundaryDelete(view);
        return false;
      },
      handleDOMEvents: {
        pointermove(view, event) {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const hoverPos = coords?.pos ?? null;
          const current = pluginKey.getState(view.state)?.hoverPos ?? null;
          if (hoverPos === current) return false;
          view.dispatch(view.state.tr.setMeta(pluginKey, { hoverPos }).setMeta("addToHistory", false));
          return false;
        },
        pointerleave(view, event) {
          const related = event.relatedTarget;
          if (related && view.dom.contains(related as globalThis.Node)) {
            return false;
          }
          if (pluginKey.getState(view.state)?.hoverPos == null) return false;
          view.dispatch(view.state.tr.setMeta(pluginKey, { hoverPos: null }).setMeta("addToHistory", false));
          return false;
        },
      },
    },
  });
});
