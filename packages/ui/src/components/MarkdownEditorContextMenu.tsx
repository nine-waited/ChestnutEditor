import { useEffect, type ReactNode } from "react";
import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { insertMarkdownBlock, type MarkdownInsertBlock } from "../markdown-editor-insert.js";
import { ctxSelectionIsInTable, runTableMenuOp, type TableMenuOp } from "../markdown-table-ops.js";
import {
  CodeBlockIcon,
  CopyIcon,
  MathBlockIcon,
  PasteIcon,
  TableBlockIcon,
  TaskListBlockIcon,
} from "../markdown-editor-block-icons.js";
import {
  copyImageBinaryFromDom,
  getEditorSelectionMarkdown,
  getEditorSelectionPlainText,
  getImageMarkdownFromDom,
  hasClipboardText,
  hasEditorTextSelection,
  pasteMarkdownIntoEditor,
  readClipboardForPaste,
  restoreEditorSelection,
  selectImageNodeAtDom,
  type EditorSelectionRange,
} from "../markdown-editor-clipboard.js";
import { writeSystemClipboardText } from "../system-clipboard.js";
import { useT } from "../i18n/index.js";
import { ContextMenuFrame } from "./ContextMenuFrame.js";

interface MarkdownEditorContextMenuProps {
  x: number;
  y: number;
  selection: EditorSelectionRange;
  clipboardText: string | null;
  targetImage: HTMLImageElement | null;
  target?: EventTarget | null;
  notePath: string;
  crepe: Crepe | null;
  readOnly?: boolean;
  onClose: () => void;
}

interface MenuItemProps {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

function MenuItem({ label, icon, disabled = false, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      className={`boke-md-editor-context-menu-item${disabled ? " boke-md-editor-context-menu-item--disabled" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect();
      }}
    >
      <span className="boke-md-editor-context-menu-item__icon">{icon}</span>
      <span className="boke-md-editor-context-menu-item__label">{label}</span>
    </button>
  );
}

function RowAddIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 5h18v3H3V5zm0 5h18v3H3v-3zm0 5h10v3H3v-3zm14.5 0v-2h2v2h2v2h-2v2h-2v-2h-2v-2h2z"
      />
    </svg>
  );
}

function ColAddIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 4h4v16H3V4zm6 0h4v16H9V4zm6 0h2v7h-2V4zm4.5 9v-2h2v2h2v2h-2v2h-2v-2h-2v-2h2z"
      />
    </svg>
  );
}

function TableDeleteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6 7h12v2H6V7zm2 3h2v8H8v-8zm6 0h2v8h-2v-8zm-3 0h2v8h-2v-8zM9 4h6l1 2h4v2H4V6h4l1-2z"
      />
    </svg>
  );
}

function isTableDomTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("td, th, table, .milkdown-table-block"));
}

function crepeSelectionInTable(crepe: Crepe | null): boolean {
  if (!crepe) return false;
  let inTable = false;
  try {
    crepe.editor.action((ctx) => {
      inTable = ctxSelectionIsInTable(ctx);
    });
  } catch {
    inTable = false;
  }
  return inTable;
}

export function MarkdownEditorContextMenu({
  x,
  y,
  selection,
  clipboardText,
  targetImage,
  target = null,
  notePath,
  crepe,
  readOnly = false,
  onClose,
}: MarkdownEditorContextMenuProps) {
  const t = useT();
  const canCopyText = hasEditorTextSelection(selection);
  const canCopy = Boolean(targetImage) || canCopyText;
  const canPaste = !readOnly && hasClipboardText(clipboardText);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  const insert = (block: MarkdownInsertBlock) => {
    if (!crepe) return;
    crepe.editor.action((ctx) => insertMarkdownBlock(ctx, block));
  };

  const inTable = crepeSelectionInTable(crepe) || isTableDomTarget(target);

  const tableOp = (op: TableMenuOp) => {
    if (!crepe) return;
    crepe.editor.action((ctx) => {
      restoreEditorSelection(ctx, selection);
      runTableMenuOp(ctx, op);
    });
  };

  return (
    <ContextMenuFrame
      x={x}
      y={y}
      className="boke-context-menu boke-md-editor-context-menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuItem
        label={t("note.editorContextMenuCopy")}
        icon={<CopyIcon />}
        disabled={!canCopy}
        onSelect={() => {
          if (!crepe || !canCopy) return;
          void (async () => {
            if (targetImage) {
              let view: EditorView | null = null;
              crepe.editor.action((ctx) => {
                view = ctx.get(editorViewCtx);
                selectImageNodeAtDom(view, targetImage);
              });
              if (view) {
                await copyImageBinaryFromDom(view, targetImage, notePath);
              }
              onClose();
              return;
            }
            let text: string | null = null;
            crepe.editor.action((ctx) => {
              text = getEditorSelectionPlainText(ctx, selection);
            });
            if (text) {
              await writeSystemClipboardText(text);
            }
            onClose();
          })();
        }}
      />
      <MenuItem
        label={t("note.editorContextMenuCopyMarkdown")}
        icon={<CopyIcon />}
        disabled={!canCopy}
        onSelect={() => {
          if (!crepe || !canCopy) return;
          void (async () => {
            if (targetImage) {
              let link: string | null = null;
              crepe.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                selectImageNodeAtDom(view, targetImage);
                link = getImageMarkdownFromDom(ctx, targetImage);
              });
              if (link) {
                await writeSystemClipboardText(link);
              }
              onClose();
              return;
            }
            let text: string | null = null;
            crepe.editor.action((ctx) => {
              text = getEditorSelectionMarkdown(ctx, selection);
            });
            if (text) {
              await writeSystemClipboardText(text);
            }
            onClose();
          })();
        }}
      />
      <MenuItem
        label={t("note.editorContextMenuPaste")}
        icon={<PasteIcon />}
        disabled={!canPaste}
        onSelect={() => {
          if (readOnly || !crepe) return;
          void (async () => {
            const text = (await readClipboardForPaste()) ?? clipboardText;
            if (!text) {
              onClose();
              return;
            }
            crepe.editor.action((ctx) => pasteMarkdownIntoEditor(ctx, selection, text));
            onClose();
          })();
        }}
      />
      {!readOnly && inTable && (
        <>
          <div className="boke-md-editor-context-menu-sep" />
          <MenuItem
            label={t("note.editorContextMenuTableRowAbove")}
            icon={<RowAddIcon />}
            onSelect={() => run(() => tableOp("rowBefore"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableRowBelow")}
            icon={<RowAddIcon />}
            onSelect={() => run(() => tableOp("rowAfter"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableColLeft")}
            icon={<ColAddIcon />}
            onSelect={() => run(() => tableOp("colBefore"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableColRight")}
            icon={<ColAddIcon />}
            onSelect={() => run(() => tableOp("colAfter"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableAlignLeft")}
            icon={<TableBlockIcon />}
            onSelect={() => run(() => tableOp("alignLeft"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableAlignCenter")}
            icon={<TableBlockIcon />}
            onSelect={() => run(() => tableOp("alignCenter"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableAlignRight")}
            icon={<TableBlockIcon />}
            onSelect={() => run(() => tableOp("alignRight"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableDeleteRow")}
            icon={<TableDeleteIcon />}
            onSelect={() => run(() => tableOp("deleteRow"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableDeleteCol")}
            icon={<TableDeleteIcon />}
            onSelect={() => run(() => tableOp("deleteCol"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTableDelete")}
            icon={<TableDeleteIcon />}
            onSelect={() => run(() => tableOp("deleteTable"))}
          />
        </>
      )}
      {!readOnly && (
        <>
          {!inTable && (
            <MenuItem
              label={t("note.editorContextMenuTable")}
              icon={<TableBlockIcon />}
              onSelect={() => run(() => insert("table"))}
            />
          )}
          <MenuItem
            label={t("note.editorContextMenuCode")}
            icon={<CodeBlockIcon />}
            onSelect={() => run(() => insert("code"))}
          />
          <MenuItem
            label={t("note.editorContextMenuMath")}
            icon={<MathBlockIcon />}
            onSelect={() => run(() => insert("math"))}
          />
          <MenuItem
            label={t("note.editorContextMenuTaskList")}
            icon={<TaskListBlockIcon />}
            onSelect={() => run(() => insert("taskList"))}
          />
        </>
      )}
    </ContextMenuFrame>
  );
}
