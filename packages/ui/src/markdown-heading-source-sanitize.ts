import { Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isAtxHeadingLine, sanitizeHeadingTitle } from "./markdown-heading-sanitize.js";

export const headingSanitizeAnnotation = Annotation.define<boolean>();

/** Escape-only rewrite of ATX heading titles after Source edits. */
export function sanitizeHeadingLinesInView(view: EditorView): boolean {
  const doc = view.state.doc;
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
    const line = doc.line(lineNo);
    if (!isAtxHeadingLine(line.text)) continue;
    const match = line.text.match(/^(#{1,6}\s+)(.*)$/);
    if (!match) continue;
    const sanitized = sanitizeHeadingTitle(match[2]);
    if (sanitized === match[2]) continue;
    changes.push({
      from: line.from + match[1].length,
      to: line.to,
      insert: sanitized,
    });
  }

  if (!changes.length) return false;

  view.dispatch({
    changes,
    annotations: headingSanitizeAnnotation.of(true),
  });
  return true;
}

export function shouldSkipHeadingSanitize(update: {
  transactions: readonly { annotation: (a: typeof headingSanitizeAnnotation) => boolean | undefined }[];
}): boolean {
  return update.transactions.some((tr) => tr.annotation(headingSanitizeAnnotation));
}
