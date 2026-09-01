import type { Ctx } from "@milkdown/ctx";
import { isSingleMarkdownImageLine } from "@chestnut/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown, insert } from "@milkdown/utils";
import { findImageNodeAtDom } from "./note-image-caption.js";
import { getImageVaultPathFromView } from "./note-image-delete.js";
import { markdownToPlainText } from "./markdown-strip-inline.js";
import { getClipboardImageFile } from "./note-images.js";
import { isInTable } from "@milkdown/kit/prose/tables";
import {
  spreadsheetClipboardToMarkdown,
  isGfmTableMarkdown,
  flattenTableCellPaste,
  shouldInsertClipboardAsBlock,
} from "./markdown-table-paste.js";
import { tablePosFromSelection } from "./markdown-table-ops.js";
import { vaultService } from "./store.js";
import {
  readSystemClipboardText,
  writeSystemClipboardImage,
  writeSystemClipboardImageElement,
} from "./system-clipboard.js";

export interface EditorSelectionRange {
  from: number;
  to: number;
}

function mimeFromImagePath(path: string): string {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    default:
      return "image/png";
  }
}

/** Drop the trailing newline serializers add for a virtual one-block doc. */
function normalizeClipboardMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, "\n");
  if (text.endsWith("\n") && !text.endsWith("\n\n")) {
    text = text.slice(0, -1);
  }
  return text;
}

export function hasEditorTextSelection(range: EditorSelectionRange): boolean {
  return range.from !== range.to;
}

export function restoreEditorSelection(ctx: Ctx, range: EditorSelectionRange): void {
  const view = ctx.get(editorViewCtx);
  const max = view.state.doc.content.size;
  const from = Math.min(Math.max(range.from, 0), max);
  const to = Math.min(Math.max(range.to, 0), max);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
  );
}

/** Read clipboard for paste. Uses native API in Tauri to avoid permission prompts. */
export async function readClipboardForPaste(): Promise<string | null> {
  return readSystemClipboardText();
}

/**
 * Paste markdown at the caret / selection.
 * Single-line content joins the current block; documents and tables insert as blocks.
 */
export function pasteMarkdownIntoEditor(
  ctx: Ctx,
  range: EditorSelectionRange,
  markdown: string,
  html?: string,
): void {
  const view = ctx.get(editorViewCtx);
  const max = view.state.doc.content.size;
  const from = Math.min(Math.max(range.from, 0), max);
  const to = Math.min(Math.max(range.to, 0), max);
  const text = normalizeClipboardMarkdown(markdown);
  if (!text) {
    view.focus();
    return;
  }

  const $from = view.state.doc.resolve(from);
  if ($from.parent.type.spec.code) {
    view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
    view.focus();
    return;
  }

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  const tableMarkdown = spreadsheetClipboardToMarkdown(text, html);
  const asBlock =
    Boolean(tableMarkdown) || isGfmTableMarkdown(text) || shouldInsertClipboardAsBlock(text);

  if (isInTable(view.state) && !asBlock) {
    const flattened = flattenTableCellPaste(text);
    if (flattened) {
      view.dispatch(view.state.tr.insertText(flattened, from, to).scrollIntoView());
    }
    view.focus();
    return;
  }

  if (isInTable(view.state) && asBlock) {
    const tablePos = tablePosFromSelection(view.state);
    const tableNode = tablePos != null ? view.state.doc.nodeAt(tablePos) : null;
    if (tablePos != null && tableNode) {
      const after = Math.min(tablePos + tableNode.nodeSize, view.state.doc.content.size);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after, after)));
    }
  }

  if (asBlock) {
    insert(tableMarkdown ?? text)(ctx);
  } else {
    insert(text, true)(ctx);
  }
  view.focus();
}

/** Serialize the saved selection as markdown (context menu “Copy as Markdown”). */
export function getEditorSelectionMarkdown(ctx: Ctx, range: EditorSelectionRange): string | null {
  if (!hasEditorTextSelection(range)) return null;
  restoreEditorSelection(ctx, range);
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  const markdown = getMarkdown({ from, to })(ctx);
  if (!markdown) return null;
  return normalizeClipboardMarkdown(markdown);
}

/** Plain text for the selection: no bold, headings, list markers, etc. (Ctrl+C default). */
export function getEditorSelectionPlainText(ctx: Ctx, range: EditorSelectionRange): string | null {
  if (!hasEditorTextSelection(range)) return null;
  restoreEditorSelection(ctx, range);
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  const text = view.state.doc.textBetween(from, to, "\n\n", "\n").trimEnd();
  if (text) return text;
  const markdown = getMarkdown({ from, to })(ctx);
  return markdown ? markdownToPlainText(markdown) : null;
}

export function getSourceSelectionPlainText(from: number, to: number, doc: string): string | null {
  if (from === to) return null;
  return markdownToPlainText(doc.slice(from, to));
}

export function selectImageNodeAtDom(view: EditorView, img: HTMLImageElement): boolean {
  const found = findImageNodeAtDom(view, img);
  if (!found) return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, found.pos)));
  view.focus();
  return true;
}

/** Markdown for a single image node (block or inline). */
export function getImageMarkdownFromDom(ctx: Ctx, img: HTMLImageElement): string | null {
  const view = ctx.get(editorViewCtx);
  const found = findImageNodeAtDom(view, img);
  if (!found) return null;
  const markdown = getMarkdown({ from: found.pos, to: found.pos + found.nodeSize })(ctx);
  return markdown?.trim() ? markdown.trim() : null;
}

/** Copy image pixels to the clipboard (vault bytes first, then DOM rasterization). */
export async function copyImageBinaryFromDom(
  view: EditorView,
  img: HTMLImageElement,
  notePath: string,
): Promise<boolean> {
  const vaultPath = getImageVaultPathFromView(view, img, notePath);
  if (vaultPath) {
    try {
      const bytes = await vaultService.readBinary(vaultPath);
      if (await writeSystemClipboardImage(bytes, mimeFromImagePath(vaultPath))) {
        return true;
      }
    } catch {
      // Fall through to DOM rasterization.
    }
  }
  return writeSystemClipboardImageElement(img);
}

export function hasClipboardText(text: string | null): text is string {
  return text !== null && text.length > 0;
}

/**
 * Live editor clipboard:
 * - copy / cut → plain text only (no `**` / `#` / list markers)
 * - paste → insert clipboard text (markdown syntax still works if present)
 * Avoids Milkdown's HTML paste path that re-escapes `*_[]` etc.
 */
export function attachLiveEditorMarkdownClipboard(
  editorEl: HTMLElement,
  run: (fn: (ctx: Ctx) => void) => void,
): () => void {
  const writeSelectionPlainText = (event: ClipboardEvent, isCut: boolean): void => {
    if (event.defaultPrevented || !event.clipboardData) return;

    run((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (isCut && !view.editable) return;
      // Image node selection keeps binary / default copy behavior.
      if (view.state.selection instanceof NodeSelection) return;

      const { from, to } = view.state.selection;
      if (from === to) return;

      const plain =
        view.state.doc.textBetween(from, to, "\n\n", "\n").trimEnd() ||
        (() => {
          const markdown = getMarkdown({ from, to })(ctx);
          return markdown ? markdownToPlainText(normalizeClipboardMarkdown(markdown)) : "";
        })();
      if (!plain) return;

      event.clipboardData!.setData("text/plain", plain);
      // Prefer plain text on paste; drop HTML so Milkdown won't re-parse DOM.
      try {
        event.clipboardData!.setData("text/html", "");
      } catch {
        // Some platforms reject clearing HTML; our paste handler still prefers text/plain.
      }
      event.preventDefault();
      event.stopPropagation();

      if (isCut) {
        view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
        view.focus();
      }
    });
  };

  const onCopy = (event: ClipboardEvent) => writeSelectionPlainText(event, false);
  const onCut = (event: ClipboardEvent) => writeSelectionPlainText(event, true);

  const onPaste = (event: ClipboardEvent) => {
    if (event.defaultPrevented || !event.clipboardData) return;
    // Image binary paste (upload) stays on the default / upload plugin path.
    if (getClipboardImageFile(event.clipboardData)) return;

    const text = event.clipboardData.getData("text/plain");
    if (!text) return;

    event.preventDefault();
    event.stopPropagation();

    const html = event.clipboardData.getData("text/html") || undefined;
    const markdown = isSingleMarkdownImageLine(text) ? text.trim() : text;
    run((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      pasteMarkdownIntoEditor(ctx, { from, to }, markdown, html);
    });
  };

  editorEl.addEventListener("copy", onCopy, true);
  editorEl.addEventListener("cut", onCut, true);
  editorEl.addEventListener("paste", onPaste, true);
  return () => {
    editorEl.removeEventListener("copy", onCopy, true);
    editorEl.removeEventListener("cut", onCut, true);
    editorEl.removeEventListener("paste", onPaste, true);
  };
}
