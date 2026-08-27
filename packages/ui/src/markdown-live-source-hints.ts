import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

const pluginKey = new PluginKey<LiveSourceHintPluginState>("chestnut-live-source-hints");

const HINT_MARKS: Record<string, { token: string; order: number }> = {
  inlineCode: { token: "`", order: 0 },
  code_inline: { token: "`", order: 0 },
  code: { token: "`", order: 0 },
  strike_through: { token: "~~", order: 1 },
  strikethrough: { token: "~~", order: 1 },
  strong: { token: "**", order: 2 },
  emphasis: { token: "*", order: 3 },
};

export interface LiveSourceHintSpec {
  pos: number;
  side: -1 | 1;
  text: string;
  kind: "heading" | "mark";
}

export interface MarkHintRange {
  from: number;
  to: number;
  token: string;
  order: number;
}

interface LiveSourceHintPluginState {
  hoverPos: number | null;
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
  const open = new Map<string, { from: number; token: string; order: number }>();
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
        if (!open.has(name)) open.set(name, { from, token: spec.token, order: spec.order });
      } else if (open.has(name)) {
        const opened = open.get(name)!;
        closed.push({ from: opened.from, to: from, token: opened.token, order: opened.order });
        open.delete(name);
      }
    }
    offset += child.nodeSize;
  });

  const end = start + offset;
  for (const opened of open.values()) {
    closed.push({ from: opened.from, to: end, token: opened.token, order: opened.order });
  }

  return closed.filter((range) => range.from < range.to && range.from <= pos && pos <= range.to);
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
      if (el.closest(".boke-live-source-hint, .boke-heading-prefix-hint")) continue;
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
  const endpoints: Array<{ pos: number; side: -1 | 1; token: string; order: number }> = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    const key = `${range.from}:${range.to}:${range.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ pos: range.from, side: -1, token: range.token, order: range.order });
    endpoints.push({ pos: range.to, side: 1, token: range.token, order: range.order });
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
    specs.push({ pos, side, text, kind: "mark" });
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
      specs.push({
        pos: heading.innerPos,
        side: -1,
        text: `${"#".repeat(heading.level)} `,
        kind: "heading",
      });
    }
    markRanges.push(...collectMarkHintRanges(state.doc, pos));
  }

  for (const range of highlightRanges) {
    markRanges.push({ from: range.from, to: range.to, token: "==", order: 4 });
  }

  specs.push(...specsFromMarkRanges(markRanges));
  return specs;
}

function createHeadingPrefixHintElement(level: number): HTMLElement {
  const span = document.createElement("span");
  span.className = "boke-heading-prefix-hint";
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";

  const hashes = document.createElement("span");
  hashes.className = "boke-heading-prefix-hint__hashes";
  hashes.textContent = "#".repeat(level);
  span.append(hashes, document.createTextNode(" "));
  return span;
}

function createMarkHintElement(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "boke-live-source-hint";
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";
  span.textContent = text;
  return span;
}

export function buildLiveSourceHintDecorations(
  state: EditorState,
  hoverPos: number | null,
  view: EditorView | null,
): DecorationSet {
  const highlight: Array<{ from: number; to: number }> = [];
  if (view) {
    for (const pos of targetPositions(state, hoverPos)) {
      highlight.push(...collectHighlightHintRanges(view, pos));
    }
  }

  const specs = collectLiveSourceHintSpecs(state, hoverPos, outermostRanges(highlight));
  if (specs.length === 0) return DecorationSet.empty;

  return DecorationSet.create(
    state.doc,
    specs.map((spec) => {
      const key = `${spec.kind}-${spec.pos}-${spec.side}-${spec.text}`;
      if (spec.kind === "heading") {
        const level = spec.text.trim().length;
        return Decoration.widget(spec.pos, () => createHeadingPrefixHintElement(level), {
          side: spec.side,
          key,
          ignoreSelection: true,
        });
      }
      return Decoration.widget(spec.pos, () => createMarkHintElement(spec.text), {
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

/** Live: gray markdown delimiters while the caret or pointer is on that format. */
export const liveSourceHintsPlugin = $prose(() => {
  let editorView: EditorView | null = null;

  return new Plugin({
    key: pluginKey,
    view(view) {
      editorView = view;
      return {
        destroy() {
          editorView = null;
        },
      };
    },
    state: {
      init(_, state): LiveSourceHintPluginState {
        return {
          hoverPos: null,
          decorations: buildLiveSourceHintDecorations(state, null, editorView),
        };
      },
      apply(tr, value, _oldState, newState): LiveSourceHintPluginState {
        const hoverPos = mapHoverPos(value.hoverPos, tr);
        const meta = tr.getMeta(pluginKey);
        if (!tr.selectionSet && !tr.docChanged && !meta) return value;
        return {
          hoverPos,
          decorations: buildLiveSourceHintDecorations(newState, hoverPos, editorView),
        };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
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
