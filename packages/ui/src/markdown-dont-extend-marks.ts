import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Mark } from "@milkdown/kit/prose/model";

/** Marks that should not keep applying when typing past their end. */
const DONT_EXTEND = new Set(["strong", "emphasis", "strike_through"]);

function isAtEndOfMarks($from: { nodeAfter: { isText?: boolean; marks: readonly Mark[] } | null }, marks: readonly Mark[]): boolean {
  const after = $from.nodeAfter;
  if (after?.isText) {
    return !marks.some((mark) => mark.isInSet(after.marks));
  }
  return true;
}

function clearBrowserHighlightAtCaret(view: EditorView, from: number): void {
  try {
    const domPos = view.domAtPos(from);
    const node = domPos.node;
    const el =
      node instanceof HTMLElement
        ? node
        : node.parentElement instanceof HTMLElement
          ? node.parentElement
          : null;
    if (!el) return;

    const highlighted = el.closest(
      'span[style*="background"], font[style*="background"], mark',
    ) as HTMLElement | null;
    if (!highlighted || !view.dom.contains(highlighted)) return;

    const highlightEnd = view.posAtDOM(highlighted, highlighted.childNodes.length);
    if (from !== highlightEnd) return;

    document.execCommand("hiliteColor", false, "transparent");
  } catch {
    // DOM mapping can fail during IME / transient states.
  }
}

/**
 * Stop bold / italic / strike / browser highlight from continuing when the
 * caret is past the end of formatted text. Explicit toggle-then-type still works
 * because that path sets `storedMarks`.
 */
export const dontExtendInlineMarksPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("chestnut-dont-extend-inline-marks"),
      props: {
        handleTextInput(view, from, to) {
          if (from !== to) return false;

          clearBrowserHighlightAtCaret(view, from);

          const { state } = view;
          // Toggle-on-then-type sets storedMarks — keep those.
          if (state.storedMarks) return false;

          const $from = state.doc.resolve(from);
          const active = $from.marks();
          const toDrop = active.filter((m) => DONT_EXTEND.has(m.type.name));
          if (toDrop.length === 0) return false;
          if (!isAtEndOfMarks($from, toDrop)) return false;

          const kept = active.filter((m) => !DONT_EXTEND.has(m.type.name));
          view.dispatch(state.tr.setStoredMarks(kept));
          return false;
        },
      },
    }),
);
