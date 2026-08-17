import { EditorView } from "@codemirror/view";
import type { EditorShortcutId } from "./keyboard-shortcuts.js";
import { extractHeadings } from "./markdown-outline.js";
import {
  isAtxHeadingLine,
  sanitizeHeadingTitleOnPromote,
} from "./markdown-heading-sanitize.js";
import { sanitizeHeadingLinesInView } from "./markdown-heading-source-sanitize.js";

function getSelectionLineRange(view: EditorView): { fromLine: number; toLine: number } {
  const doc = view.state.doc;
  const selection = view.state.selection.main;
  return {
    fromLine: doc.lineAt(selection.from).number,
    toLine: doc.lineAt(selection.to).number,
  };
}

function replaceRange(view: EditorView, from: number, to: number, insert: string, cursorAt?: number): void {
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: cursorAt ?? from + insert.length },
  });
  view.focus();
}

function toggleInlineWrap(view: EditorView, open: string, close: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (from === to) {
    const insert = `${open}${close}`;
    replaceRange(view, from, to, insert, from + open.length);
  } else if (selected.startsWith(open) && selected.endsWith(close)) {
    replaceRange(view, from, to, selected.slice(open.length, selected.length - close.length));
  } else {
    replaceRange(view, from, to, `${open}${selected}${close}`);
  }

  // Already a heading: keep the wraps as literal characters via escape (not strip).
  const { fromLine, toLine } = getSelectionLineRange(view);
  for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
    if (isAtxHeadingLine(view.state.doc.line(lineNo).text)) {
      sanitizeHeadingLinesInView(view);
      return;
    }
  }
}

function setHeadingOnLines(view: EditorView, level: number): void {
  const doc = view.state.doc;
  const { fromLine, toLine } = getSelectionLineRange(view);
  const prefix = `${"#".repeat(level)} `;
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
    const line = doc.line(lineNo);
    const text = sanitizeHeadingTitleOnPromote(line.text.replace(/^#{1,6}\s+/, ""));
    changes.push({ from: line.from, to: line.to, insert: `${prefix}${text}` });
  }

  view.dispatch({ changes });
  view.focus();
}

function navigateHeading(view: EditorView, content: string, direction: "prev" | "next"): void {
  const doc = view.state.doc;
  const currentLine = doc.lineAt(view.state.selection.main.from).number - 1;
  const headings = extractHeadings("", content);
  if (!headings.length) return;

  const target =
    direction === "prev"
      ? [...headings].reverse().find((h) => h.docLine < currentLine)
      : headings.find((h) => h.docLine > currentLine);
  if (!target) return;

  const lineNo = Math.min(Math.max(target.docLine + 1, 1), doc.lines);
  const lineObj = doc.line(lineNo);
  view.dispatch({
    selection: { anchor: lineObj.from, head: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
  });
  view.focus();
}

function insertTaskList(view: EditorView): void {
  const doc = view.state.doc;
  const line = doc.lineAt(view.state.selection.main.from);
  const prefix = "- [ ] ";
  const insert = line.text.trim() ? `\n${prefix}` : prefix;
  replaceRange(view, line.to, line.to, insert, line.to + insert.length);
}

function insertCodeBlock(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const block = selected ? `\n\`\`\`\n${selected}\n\`\`\`\n` : "\n```\n\n```\n";
  replaceRange(view, from, to, block, from + (selected ? block.indexOf("\n") + 1 : 4));
}

function insertTable(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const table = "\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n";
  replaceRange(view, from, to, table, from + table.length);
}

export function runSourceEditorShortcut(
  view: EditorView,
  shortcutId: EditorShortcutId,
  content: string,
): boolean {
  switch (shortcutId) {
    case "md-bold":
      toggleInlineWrap(view, "**", "**");
      return true;
    case "md-italic":
      toggleInlineWrap(view, "*", "*");
      return true;
    case "md-underline":
      toggleInlineWrap(view, "<u>", "</u>");
      return true;
    case "md-strikethrough":
      toggleInlineWrap(view, "~~", "~~");
      return true;
    case "md-highlight":
      toggleInlineWrap(view, "==", "==");
      return true;
    case "md-heading-1":
      setHeadingOnLines(view, 1);
      return true;
    case "md-heading-2":
      setHeadingOnLines(view, 2);
      return true;
    case "md-heading-3":
      setHeadingOnLines(view, 3);
      return true;
    case "md-heading-4":
      setHeadingOnLines(view, 4);
      return true;
    case "md-heading-5":
      setHeadingOnLines(view, 5);
      return true;
    case "md-heading-6":
      setHeadingOnLines(view, 6);
      return true;
    case "md-prev-heading":
      navigateHeading(view, content, "prev");
      return true;
    case "md-next-heading":
      navigateHeading(view, content, "next");
      return true;
    case "md-task-list":
      insertTaskList(view);
      return true;
    case "md-code-block":
      insertCodeBlock(view);
      return true;
    case "md-table":
      insertTable(view);
      return true;
    default:
      return false;
  }
}
