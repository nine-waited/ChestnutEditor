import type { EditorState } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { findHeadingAtPos, liveSourceHintsPlugin } from "./markdown-live-source-hints.js";

export function findActiveHeadingAtSelection(
  state: EditorState,
): { innerPos: number; level: number } | null {
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return null;
  return findHeadingAtPos(state.doc, selection.from);
}

/** Live: gray `#` / inline delimiters while the caret or pointer is on that format. */
export const headingLevelHintPlugin = liveSourceHintsPlugin;
