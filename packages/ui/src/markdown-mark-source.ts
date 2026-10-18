import { SchemaReady, parserCtx, prosePluginsCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import type { Ctx, MilkdownPlugin } from "@milkdown/kit/ctx";
import { Fragment, type Mark, type Node, type Schema } from "@milkdown/kit/prose/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

export const MARK_SOURCE_META = "chestnut-mark-source";

/** Converts inline content to Markdown text and back with the editor's own parser. */
export interface InlineSourceCodec {
  serialize(content: Fragment): string;
  /** Returns null when the text would not stay a single paragraph. */
  parse(text: string): Fragment | null;
}

interface ExpandedSource {
  from: number;
  to: number;
}

interface MarkSourcePluginState {
  expanded: ExpandedSource | null;
  decorations: DecorationSet;
}

type EnterMode = "pointer" | "key";

const pluginKey = new PluginKey<MarkSourcePluginState>("chestnut-mark-source");

const SOURCE_MARKS = new Set([
  "strong",
  "emphasis",
  "strike_through",
  "strikethrough",
  "highlight",
  "inlineCode",
  "code_inline",
]);

const MARK_CLASSES: Record<string, string> = {
  strong: "chestnut-expanded-strong",
  emphasis: "chestnut-expanded-emphasis",
  strike_through: "chestnut-expanded-strike",
  strikethrough: "chestnut-expanded-strike",
  highlight: "chestnut-expanded-highlight",
  inlineCode: "chestnut-expanded-code",
  code_inline: "chestnut-expanded-code",
};

const MARKER_CLASS = "chestnut-heading-source-prefix";

function isMathNode(node: Node): boolean {
  return node.type.name === "math_inline" || node.type.name === "inlineMath";
}

function isSourceFormatted(node: Node): boolean {
  return isMathNode(node) || (node.isText && node.marks.some((mark) => SOURCE_MARKS.has(mark.type.name)));
}

/** Contiguous run of formatted inline content touching `pos`. */
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
    offset += child.nodeSize;
    segs.push({ from, to: from + child.nodeSize, formatted: isSourceFormatted(child) });
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

interface Unit {
  /** Offset of the unit inside its fragment. */
  offset: number;
  size: number;
  text: string;
  marks: readonly Mark[];
  math: boolean;
}

function unitsOf(content: Fragment): Unit[] {
  const units: Unit[] = [];
  content.forEach((node, offset) => {
    if (node.isText) {
      const text = node.text ?? "";
      for (let i = 0; i < text.length; i++) {
        units.push({ offset: offset + i, size: 1, text: text[i]!, marks: node.marks, math: false });
      }
      return;
    }
    const math = isMathNode(node);
    units.push({
      offset,
      size: node.nodeSize,
      text: math ? String(node.attrs.value ?? "") : "",
      marks: node.marks,
      math,
    });
  });
  return units;
}

/** Map each unit onto the source characters that produce it; null when they do not line up. */
function alignUnits(source: string, units: Unit[]): Array<{ start: number; end: number }> | null {
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const unit of units) {
    let start = -1;
    for (const ch of unit.text) {
      while (cursor < source.length && source[cursor] !== ch) cursor += 1;
      if (cursor >= source.length) return null;
      if (start < 0) start = cursor;
      cursor += 1;
    }
    if (start < 0) start = cursor;
    let end = cursor;
    if (unit.math) {
      if (source[start - 1] === "$") start -= 1;
      if (source[end] === "$") end += 1;
      cursor = end;
    }
    spans.push({ start, end });
  }
  return spans;
}

function sourceOffsetForCaret(
  source: string,
  units: Unit[],
  caretOffset: number,
  spanSize: number,
  mode: EnterMode,
): number {
  const spans = alignUnits(source, units);
  if (!spans || spans.length === 0) return Math.max(0, Math.min(caretOffset, source.length));
  if (caretOffset <= 0) {
    if (mode === "key") return 0;
    return units[0]!.math ? spans[0]!.start + 1 : spans[0]!.start;
  }
  if (caretOffset >= spanSize) {
    if (mode === "key") return source.length;
    return units[units.length - 1]!.math ? spans[spans.length - 1]!.end - 1 : spans[spans.length - 1]!.end;
  }
  const index = units.findIndex((unit) => unit.offset === caretOffset);
  if (index >= 0) {
    const unit = units[index]!;
    return unit.math && mode === "pointer" ? spans[index]!.start + 1 : spans[index]!.start;
  }
  const inside = units.findIndex((unit) => unit.offset < caretOffset && caretOffset < unit.offset + unit.size);
  return inside >= 0 ? spans[inside]!.end : source.length;
}

/** Replace a formatted span with its Markdown source as plain text. */
export function expandFormattedSpan(
  tr: Transaction,
  codec: InlineSourceCodec,
  span: { from: number; to: number },
  caret: number,
  mode: EnterMode,
): ExpandedSource | null {
  const content = tr.doc.slice(span.from, span.to).content;
  let source: string;
  try {
    source = codec.serialize(content);
  } catch {
    return null;
  }
  if (!source) return null;
  const units = unitsOf(content);
  const offset = sourceOffsetForCaret(source, units, caret - span.from, span.to - span.from, mode);
  const schema = tr.doc.type.schema;
  const spans = alignUnits(source, units);
  if (spans) {
    // Insert only the delimiter text so history can still map earlier edits.
    tr.removeMark(span.from, span.to);
    const gapAfter = (index: number) =>
      source.slice(spans[index]!.end, index + 1 < spans.length ? spans[index + 1]!.start : source.length);
    for (let index = units.length - 1; index >= 0; index--) {
      const unit = units[index]!;
      const unitFrom = span.from + unit.offset;
      const gap = gapAfter(index);
      if (gap) tr.insert(unitFrom + unit.size, schema.text(gap));
      if (unit.math) tr.replaceWith(unitFrom, unitFrom + unit.size, schema.text(source.slice(spans[index]!.start, spans[index]!.end)));
    }
    const lead = source.slice(0, spans[0]?.start ?? source.length);
    if (lead) tr.insert(span.from, schema.text(lead));
  } else {
    tr.replaceWith(span.from, span.to, schema.text(source));
  }
  tr.setStoredMarks([]);
  tr.setSelection(TextSelection.create(tr.doc, span.from + offset));
  return { from: span.from, to: span.from + source.length };
}

function textblockSegments(doc: Node, from: number, to: number): Array<{ from: number; to: number }> {
  const segments: Array<{ from: number; to: number }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const segFrom = Math.max(from, pos + 1);
    const segTo = Math.min(to, pos + node.nodeSize - 1);
    if (segFrom < segTo) segments.push({ from: segFrom, to: segTo });
    return false;
  });
  return segments;
}

/** Parse the expanded source back into formatted content. */
export function collapseExpandedSource(tr: Transaction, codec: InlineSourceCodec, expanded: ExpandedSource): void {
  const size = tr.doc.content.size;
  const from = Math.max(0, Math.min(expanded.from, size));
  const to = Math.max(from, Math.min(expanded.to, size));
  for (const seg of textblockSegments(tr.doc, from, to).reverse()) {
    const content = tr.doc.slice(seg.from, seg.to).content;
    let parsed: Fragment | null;
    try {
      parsed = codec.parse(codec.serialize(content));
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.eq(content)) continue;
    applyParsedSource(tr, seg, content, parsed);
  }
}

/** Delete delimiter characters and restyle the rest instead of replacing the whole run. */
function applyParsedSource(tr: Transaction, seg: { from: number; to: number }, content: Fragment, parsed: Fragment): void {
  let plainText = true;
  content.forEach((node) => {
    if (!node.isText) plainText = false;
  });
  const source = tr.doc.textBetween(seg.from, seg.to, "", "\uFFFC");
  const units = unitsOf(parsed);
  const spans = plainText && source.length === seg.to - seg.from ? alignUnits(source, units) : null;
  if (!spans) {
    tr.replaceWith(seg.from, seg.to, parsed);
    return;
  }
  const keep = new Array<boolean>(source.length).fill(false);
  units.forEach((unit, index) => {
    if (unit.math) return;
    const { start, end } = spans[index]!;
    for (let i = start; i < end; i++) keep[i] = true;
    if (start >= end) return;
    tr.removeMark(seg.from + start, seg.from + end);
    for (const mark of unit.marks) tr.addMark(seg.from + start, seg.from + end, mark);
  });
  const edits: Array<{ from: number; to: number; node: Node | null }> = [];
  units.forEach((unit, index) => {
    if (!unit.math) return;
    const { start, end } = spans[index]!;
    for (let i = start; i < end; i++) keep[i] = true;
    let math: Node | null = null;
    parsed.forEach((node, offset) => {
      if (offset === unit.offset) math = node;
    });
    if (math) edits.push({ from: start, to: end, node: math });
  });
  let run = -1;
  for (let i = 0; i <= source.length; i++) {
    if (i < source.length && !keep[i]) {
      if (run < 0) run = i;
      continue;
    }
    if (run >= 0) {
      edits.push({ from: run, to: i, node: null });
      run = -1;
    }
  }
  edits.sort((a, b) => b.from - a.from);
  for (const edit of edits) {
    if (edit.node) tr.replaceWith(seg.from + edit.from, seg.from + edit.to, edit.node);
    else tr.delete(seg.from + edit.from, seg.from + edit.to);
  }
}

function classForMarks(marks: readonly Mark[]): string {
  return marks
    .map((mark) => MARK_CLASSES[mark.type.name])
    .filter(Boolean)
    .join(" ");
}

function buildDecorations(doc: Node, codec: InlineSourceCodec, expanded: ExpandedSource | null): DecorationSet {
  if (!expanded) return DecorationSet.empty;
  const size = doc.content.size;
  const from = Math.max(0, Math.min(expanded.from, size));
  const to = Math.max(from, Math.min(expanded.to, size));
  const decorations: Decoration[] = [];
  for (const seg of textblockSegments(doc, from, to)) {
    const source = doc.textBetween(seg.from, seg.to, "", "\uFFFC");
    if (source.length !== seg.to - seg.from) continue;
    let parsed: Fragment | null = null;
    try {
      parsed = codec.parse(source);
    } catch {
      parsed = null;
    }
    if (!parsed) continue;
    const units = unitsOf(parsed);
    const spans = alignUnits(source, units);
    if (!spans) continue;
    // Per source character: marker class, a content class, or "" for plain text.
    const classes = new Array<string>(source.length).fill(MARKER_CLASS);
    units.forEach((unit, index) => {
      const span = spans[index]!;
      if (unit.math) {
        for (let i = span.start; i < span.end; i++) classes[i] = "";
        if (source[span.start] === "$") classes[span.start] = MARKER_CLASS;
        if (source[span.end - 1] === "$" && span.end - 1 > span.start) classes[span.end - 1] = MARKER_CLASS;
        return;
      }
      const className = classForMarks(unit.marks);
      for (let i = span.start; i < span.end; i++) classes[i] = className;
    });
    let runStart = 0;
    for (let i = 1; i <= source.length; i++) {
      if (i < source.length && classes[i] === classes[runStart]) continue;
      const className = classes[runStart];
      if (className) decorations.push(Decoration.inline(seg.from + runStart, seg.from + i, { class: className }));
      runStart = i;
    }
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** True while the selection sits inside the revealed Markdown source. */
export function isEditingMarkSource(state: EditorState): boolean {
  const expanded = pluginKey.getState(state)?.expanded;
  if (!expanded) return false;
  return expanded.from <= state.selection.from && state.selection.to <= expanded.to;
}

function selectionInside(state: EditorState, expanded: ExpandedSource): boolean {
  return expanded.from <= state.selection.from && state.selection.to <= expanded.to;
}

/** Turn revealed source back into formatting, e.g. before a toggle-format shortcut. */
export function collapseMarkSource(view: EditorView): void {
  const expanded = pluginKey.getState(view.state)?.expanded;
  const codec = (pluginKey.get(view.state)?.spec as { codec?: InlineSourceCodec } | undefined)?.codec;
  if (!expanded || !codec) return;
  const tr = view.state.tr;
  collapseExpandedSource(tr, codec, expanded);
  view.dispatch(tr.setMeta(MARK_SOURCE_META, { expanded: null }).setMeta("addToHistory", false));
}

export function createMarkSourcePlugin(codec: InlineSourceCodec): Plugin {
  let editorView: EditorView | null = null;
  let lastInput: EnterMode = "key";
  let pointerDown = false;

  return new Plugin<MarkSourcePluginState>({
    key: pluginKey,
    codec,
    view(view) {
      editorView = view;
      const doc = view.dom.ownerDocument;
      // Decide reveal/collapse once the press ends so the text does not shift mid-drag.
      const onPointerUp = () => {
        if (!pointerDown) return;
        pointerDown = false;
        if (!editorView) return;
        const state = editorView.state;
        editorView.dispatch(state.tr.setSelection(state.selection).setMeta("addToHistory", false));
      };
      doc.addEventListener("mouseup", onPointerUp, true);
      return {
        destroy() {
          doc.removeEventListener("mouseup", onPointerUp, true);
          editorView = null;
        },
      };
    },
    state: {
      init(): MarkSourcePluginState {
        return { expanded: null, decorations: DecorationSet.empty };
      },
      apply(tr, value, _old, newState): MarkSourcePluginState {
        const meta = tr.getMeta(MARK_SOURCE_META) as { expanded?: ExpandedSource | null } | undefined;
        let expanded = value.expanded;
        if (meta && "expanded" in meta) expanded = meta.expanded ?? null;
        else if (expanded && tr.docChanged) {
          expanded = { from: tr.mapping.map(expanded.from, -1), to: tr.mapping.map(expanded.to, 1) };
        }
        if (expanded === value.expanded && !tr.docChanged) return value;
        return { expanded, decorations: buildDecorations(newState.doc, codec, expanded) };
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        mousedown(_view, event) {
          lastInput = "pointer";
          if (event.button === 0) pointerDown = true;
          return false;
        },
        keydown() {
          lastInput = "key";
          return false;
        },
      },
      // Revealed delimiters are plain text: skip Markdown input rules so typing
      // `*` next to `**bold**` does not restyle the source mid-edit.
      handleTextInput(view, from, to, text) {
        if (!view.editable) return false;
        const expanded = pluginKey.getState(view.state)?.expanded;
        if (!expanded || from < expanded.from || to > expanded.to) return false;
        view.dispatch(view.state.tr.insertText(text, from, to));
        return true;
      },
    },
    appendTransaction(transactions, _old, newState) {
      if (transactions.some((tr) => tr.getMeta(MARK_SOURCE_META))) return null;
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
      if (editorView?.composing || pointerDown) return null;
      const editable = editorView ? editorView.editable : true;
      const expanded = pluginKey.getState(newState)?.expanded ?? null;
      if (expanded && editable && selectionInside(newState, expanded)) return null;

      const tr = newState.tr;
      let changed = false;
      if (expanded) {
        collapseExpandedSource(tr, codec, expanded);
        changed = true;
      }

      let next: ExpandedSource | null = null;
      const selection = tr.selection;
      const mathSelected = selection instanceof NodeSelection && isMathNode(selection.node);
      if (editable && (selection.empty || mathSelected)) {
        const caret = selection.from;
        const span = findFormattedSpan(tr.doc, caret);
        if (span) next = expandFormattedSpan(tr, codec, span, caret, mathSelected ? "pointer" : lastInput);
      }
      if (!changed && !next) return null;
      return tr.setMeta(MARK_SOURCE_META, { expanded: next }).setMeta("addToHistory", false);
    },
  });
}

export interface MarkdownDocCodec {
  schema(): Schema;
  parseDoc(markdown: string): Node;
  serializeDoc(doc: Node): string;
}

/** Inline codec over a whole-document Markdown parser and serializer. */
export function createInlineSourceCodec(env: MarkdownDocCodec): InlineSourceCodec {
  return {
    serialize(content) {
      const schema = env.schema();
      const paragraph = schema.nodes.paragraph!.create(null, content);
      const doc = schema.topNodeType.create(null, paragraph);
      return env.serializeDoc(doc).replace(/\n+$/, "");
    },
    parse(text) {
      const schema = env.schema();
      const lead = /^\s*/.exec(text)?.[0] ?? "";
      const rest = text.slice(lead.length);
      const trail = /\s*$/.exec(rest)?.[0] ?? "";
      const core = rest.slice(0, rest.length - trail.length);
      if (!core) return Fragment.from(text ? schema.text(text) : []);
      if (core.includes("\uFFFC")) return null;
      const doc = env.parseDoc(core);
      const first = doc.firstChild;
      if (doc.childCount !== 1 || !first || first.type !== schema.nodes.paragraph) return null;
      let content = first.content;
      if (lead) content = Fragment.from(schema.text(lead)).append(content);
      if (trail) content = content.append(Fragment.from(schema.text(trail)));
      return content;
    },
  };
}

export function milkdownInlineSourceCodec(ctx: Ctx): InlineSourceCodec {
  return createInlineSourceCodec({
    schema: () => ctx.get(schemaCtx),
    parseDoc: (markdown) => ctx.get(parserCtx)(markdown),
    serializeDoc: (doc) => ctx.get(serializerCtx)(doc),
  });
}

export const markSourceTextPlugin: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(SchemaReady);
  const plugin = createMarkSourcePlugin(milkdownInlineSourceCodec(ctx));
  // Run before Markdown input rules and the opening-delimiter helper.
  ctx.update(prosePluginsCtx, (plugins) => [plugin, ...plugins]);
  return () => {
    ctx.update(prosePluginsCtx, (plugins) => plugins.filter((item) => item !== plugin));
  };
};
