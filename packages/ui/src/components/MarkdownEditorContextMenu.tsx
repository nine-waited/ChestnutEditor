import { useEffect, type ReactNode } from "react";
import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { insertMarkdownBlock, type MarkdownInsertBlock } from "../markdown-editor-insert.js";
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

export function MarkdownEditorContextMenu({
  x,
  y,
  selection,
  clipboardText,
  targetImage,
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
      {!readOnly && (
        <>
          <MenuItem
            label={t("note.editorContextMenuTable")}
            icon={<TableBlockIcon />}
            onSelect={() => run(() => insert("table"))}
          />
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
