import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const HEADING_LINE_RE = /^(#{1,6})(\s)/;

export function buildActiveHeadingHashDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const match = HEADING_LINE_RE.exec(line.text);
  if (!match) return builder.finish();

  const hashStart = line.from;
  const hashEnd = line.from + match[1].length;
  builder.add(hashStart, hashEnd, Decoration.mark({ class: "cm-heading-level-hashes" }));
  return builder.finish();
}

/** Source: gray out `#` on the active heading line. */
export const sourceHeadingLevelHintPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildActiveHeadingHashDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildActiveHeadingHashDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
