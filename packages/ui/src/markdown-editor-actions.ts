import type { Ctx } from "@milkdown/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  headingSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorShortcutId } from "./keyboard-shortcuts.js";
import { insertMarkdownBlock } from "./markdown-editor-insert.js";
import { extractHeadings } from "./markdown-outline.js";
import { headingDisplayText } from "./markdown-heading-sanitize.js";
import { stripInlineMarkdownFormat } from "./markdown-strip-inline.js";

function normalizeLineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findHeadingPos(view: EditorView, markdown: string, docLine: number): number | null {
  const lines = markdown.split(/\r?\n/);
  const match = (lines[docLine] ?? "").trim().match(/^#{1,6}\s+(.+?)\s*$/);
  if (!match) return null;

  const title = headingDisplayText(match[1]);
  let occurrence = 0;
  for (let i = 0; i < docLine; i++) {
    const prev = (lines[i] ?? "").trim().match(/^#{1,6}\s+(.+?)\s*$/);
    if (prev && headingDisplayText(prev[1]) === title) occurrence++;
  }

  const headings = view.dom.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let seen = 0;
  for (const el of headings) {
    if (headingDisplayText(el.textContent ?? "") !== title) continue;
    if (seen === occurrence) {
      try {
        return view.posAtDOM(el, 0);
      } catch {
        return null;
      }
    }
    seen++;
  }
  return null;
}

/** Locate a non-heading body line in the live editor by matching block text. */
function findBodyLinePos(view: EditorView, markdown: string, docLine: number): number | null {
  const lines = markdown.split(/\r?\n/);
  const target = normalizeLineText(lines[docLine] ?? "");
  if (!target) return null;

  let occurrence = 0;
  for (let i = 0; i < docLine; i++) {
    if (normalizeLineText(lines[i] ?? "") === target) occurrence++;
  }

  const blocks = view.dom.querySelectorAll("p, li, pre, blockquote, td, th, h1, h2, h3, h4, h5, h6");
  let seen = 0;
  for (const el of blocks) {
    const text = normalizeLineText(el.textContent ?? "");
    if (!text) continue;
    const matched = text === target || text.includes(target) || target.includes(text);
    if (!matched) continue;
    if (seen === occurrence) {
      try {
        return view.posAtDOM(el, 0);
      } catch {
        return null;
      }
    }
    seen++;
  }
  return null;
}

/** Resolve an editor position for any document line (heading or body). */
function findDocLinePos(view: EditorView, markdown: string, docLine: number): number | null {
  return findHeadingPos(view, markdown, docLine) ?? findBodyLinePos(view, markdown, docLine);
}

function getLiveHeadingIndex(view: EditorView): number {
  const headings = [...view.dom.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  const sel = view.state.selection.from;
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    try {
      const pos = view.posAtDOM(headings[i], 0);
      if (pos <= sel) idx = i;
    } catch {
      // ignore invalid DOM positions
    }
  }
  return idx;
}

function jumpToHeading(view: EditorView, markdown: string, docLine: number): void {
  const pos = findDocLinePos(view, markdown, docLine);
  if (pos === null) return;
  const safePos = Math.min(Math.max(pos, 0), view.state.doc.content.size);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, safePos)));
  view.focus();
}

function navigateHeading(view: EditorView, markdown: string, direction: "prev" | "next"): void {
  const headings = extractHeadings("", markdown);
  if (!headings.length) return;

  const currentIdx = getLiveHeadingIndex(view);
  const targetIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
  if (targetIdx < 0 || targetIdx >= headings.length) return;

  jumpToHeading(view, markdown, headings[targetIdx].docLine);
}

function toggleExecCommand(view: EditorView, command: "underline" | "hiliteColor", value?: string): void {
  view.focus();
  document.execCommand(command, false, value ?? "");
}

function clearInlineFormatsInHeadings(view: EditorView): void {
  const { $from, from, to } = view.state.selection;
  const headings: Array<{ innerFrom: number; innerTo: number; text: string }> = [];

  const collect = (pos: number, node: { type: { name: string }; nodeSize: number; textContent: string }) => {
    if (node.type.name !== "heading") return;
    // Promote path: strip bold/italic/highlight wraps and drop marks via plain text.
    const text = stripInlineMarkdownFormat(node.textContent);
    headings.push({
      innerFrom: pos + 1,
      innerTo: pos + node.nodeSize - 1,
      text,
    });
  };

  if (from === to) {
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "heading") {
        collect($from.before(depth), node);
        break;
      }
    }
  } else {
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      collect(pos, node);
    });
  }

  if (!headings.length) return;

  let tr = view.state.tr;
  for (const heading of headings.sort((a, b) => b.innerFrom - a.innerFrom)) {
    tr = tr.replaceWith(
      heading.innerFrom,
      heading.innerTo,
      heading.text ? view.state.schema.text(heading.text) : [],
    );
  }
  view.dispatch(tr);
}

function setHeadingLevel(ctx: Ctx, level: number): void {
  const commands = ctx.get(commandsCtx);
  commands.call(setBlockTypeCommand.key, {
    nodeType: headingSchema.type(ctx),
    attrs: { level },
  });
  clearInlineFormatsInHeadings(ctx.get(editorViewCtx));
}

export function runLiveEditorShortcut(
  ctx: Ctx,
  shortcutId: EditorShortcutId,
  markdown: string,
): boolean {
  const view = ctx.get(editorViewCtx);
  const commands = ctx.get(commandsCtx);

  switch (shortcutId) {
    case "md-bold":
      commands.call(toggleStrongCommand.key);
      return true;
    case "md-italic":
      commands.call(toggleEmphasisCommand.key);
      return true;
    case "md-underline":
      toggleExecCommand(view, "underline");
      return true;
    case "md-strikethrough":
      commands.call(toggleStrikethroughCommand.key);
      return true;
    case "md-highlight":
      toggleExecCommand(view, "hiliteColor", "#ffe066");
      return true;
    case "md-heading-1":
      setHeadingLevel(ctx, 1);
      return true;
    case "md-heading-2":
      setHeadingLevel(ctx, 2);
      return true;
    case "md-heading-3":
      setHeadingLevel(ctx, 3);
      return true;
    case "md-heading-4":
      setHeadingLevel(ctx, 4);
      return true;
    case "md-heading-5":
      setHeadingLevel(ctx, 5);
      return true;
    case "md-heading-6":
      setHeadingLevel(ctx, 6);
      return true;
    case "md-prev-heading":
      navigateHeading(view, markdown, "prev");
      return true;
    case "md-next-heading":
      navigateHeading(view, markdown, "next");
      return true;
    case "md-task-list":
      insertMarkdownBlock(ctx, "taskList");
      return true;
    case "md-code-block":
      insertMarkdownBlock(ctx, "code");
      return true;
    case "md-table":
      insertMarkdownBlock(ctx, "table");
      return true;
    default:
      return false;
  }
}

export { findHeadingPos, findDocLinePos, jumpToHeading };
