import { $prose } from "@milkdown/utils";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

export function findActiveHeadingAtSelection(
  state: EditorState,
): { innerPos: number; level: number } | null {
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return null;

  const $from = selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "heading") continue;
    const level = Number(node.attrs.level);
    if (!Number.isFinite(level)) return null;
    return {
      innerPos: $from.start(depth),
      level: Math.min(6, Math.max(1, level)),
    };
  }
  return null;
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

export function buildHeadingLevelHintDecorations(state: EditorState): DecorationSet {
  const heading = findActiveHeadingAtSelection(state);
  if (!heading) return DecorationSet.empty;

  const { innerPos, level } = heading;
  return DecorationSet.create(state.doc, [
    Decoration.widget(
      innerPos,
      () => createHeadingPrefixHintElement(level),
      { side: -1, key: `heading-level-hint-${innerPos}-${level}` },
    ),
  ]);
}

/** Live: show gray `#` prefix while the caret is on a heading line. */
export const headingLevelHintPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("chestnut-heading-level-hint"),
      state: {
        init(_, state) {
          return buildHeadingLevelHintDecorations(state);
        },
        apply(tr, value, _oldState, newState) {
          if (tr.selectionSet || tr.docChanged) {
            return buildHeadingLevelHintDecorations(newState);
          }
          return value;
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
);
