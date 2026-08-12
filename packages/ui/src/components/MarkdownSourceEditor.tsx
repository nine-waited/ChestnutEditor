import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle, useState } from "react";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { Decoration, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { formatImageMarkdown, getClipboardImageFile, savePastedNoteImage } from "../note-images.js";
import { getSourceSelectionPlainText } from "../markdown-editor-clipboard.js";
import { buildSourceEditorShortcutKeymap } from "../markdown-editor-keymap.js";
import { buildSourceEditorTheme } from "../source-editor-theme.js";
import { CopyIcon } from "../markdown-editor-block-icons.js";
import { writeSystemClipboardText } from "../system-clipboard.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import {
  putSourceEditorHistory,
  sourceHistoryCacheKey,
  takeSourceEditorHistory,
} from "../source-editor-history-cache.js";
import { ContextMenuFrame } from "./ContextMenuFrame.js";

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildWikilinkDecorations(view);
    }
    update(update: import("@codemirror/view").ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildWikilinkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function buildWikilinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const wikilink = /\[\[([^\]]+)\]\]/g;
  const tag = /(?:^|\s)#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff/-]*)/g;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;
    wikilink.lastIndex = 0;
    while ((m = wikilink.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      builder.add(start, end, Decoration.mark({ class: "cm-wikilink" }));
    }
    tag.lastIndex = 0;
    while ((m = tag.exec(text))) {
      const start = from + m.index + (m[0].startsWith(" ") ? 1 : 0);
      const end = start + m[0].trim().length;
      builder.add(start, end, Decoration.mark({ class: "cm-tag" }));
    }
  }
  return builder.finish();
}

interface MarkdownSourceEditorProps {
  content: string;
  notePath: string;
  leafId: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  /** When false, skip external content sync (inactive keep-alive slot). */
  active?: boolean;
  /** View-only: no edits, selection/copy still allowed. */
  readOnly?: boolean;
}

export interface MarkdownSourceEditorHandle {
  goToDocLine(docLine: number): void;
}

export const MarkdownSourceEditor = forwardRef<MarkdownSourceEditorHandle, MarkdownSourceEditorProps>(
  function MarkdownSourceEditor({ content, notePath, leafId: _leafId, onChange, onSave, active = true, readOnly = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const themeCompartmentRef = useRef(new Compartment());
    const readOnlyCompartmentRef = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    const onSaveRef = useRef(onSave);
    const notePathRef = useRef(notePath);
    const contentRef = useRef(content);
    const openContextMenuRef = useRef<(x: number, y: number) => void>(() => {});
    const appTheme = useAppStore((s) => s.theme);
    const t = useT();
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    openContextMenuRef.current = (x, y) => setContextMenu({ x, y });
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    notePathRef.current = notePath;
    contentRef.current = content;

    useImperativeHandle(ref, () => ({
      goToDocLine(docLine: number) {
        const view = viewRef.current;
        if (!view) return;
        const lineNo = Math.min(Math.max(docLine + 1, 1), view.state.doc.lines);
        const lineObj = view.state.doc.line(lineNo);
        view.dispatch({
          selection: { anchor: lineObj.from, head: lineObj.from },
          effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
        });
        view.focus();
      },
    }));

    const initEditor = useCallback(() => {
      if (!containerRef.current || viewRef.current) return;

      const cacheKey = sourceHistoryCacheKey(notePath);
      const restored = takeSourceEditorHistory(cacheKey);
      if (restored && restored.state.doc.toString() === contentRef.current) {
        themeCompartmentRef.current = restored.themeCompartment;
        readOnlyCompartmentRef.current = new Compartment();
        viewRef.current = new EditorView({ state: restored.state, parent: containerRef.current });
        viewRef.current.dispatch({
          effects: StateEffect.appendConfig.of(
            readOnlyCompartmentRef.current.of([
              EditorState.readOnly.of(false),
              EditorView.editable.of(true),
            ]),
          ),
        });
        return;
      }

      themeCompartmentRef.current = new Compartment();
      readOnlyCompartmentRef.current = new Compartment();
      const saveKeymap = keymap.of([
        {
          key: "Mod-s",
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]);

      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          markdown({ base: markdownLanguage }),
          wikilinkPlugin,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          buildSourceEditorShortcutKeymap(() => contentRef.current),
          saveKeymap,
          themeCompartmentRef.current.of(buildSourceEditorTheme(useAppStore.getState().theme)),
          readOnlyCompartmentRef.current.of([
            EditorState.readOnly.of(false),
            EditorView.editable.of(true),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            contextmenu(event, view) {
              const { from, to } = view.state.selection.main;
              if (from === to) return false;
              event.preventDefault();
              openContextMenuRef.current(event.clientX, event.clientY);
              return true;
            },
            paste(event, view) {
              if (view.state.readOnly) return true;
              const file = getClipboardImageFile(event.clipboardData);
              const mdPath = notePathRef.current;
              if (!file || !mdPath) return false;
              event.preventDefault();
              void (async () => {
                const imagePath = await savePastedNoteImage(mdPath, file);
                const markdown = formatImageMarkdown(imagePath);
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: markdown },
                  selection: { anchor: from + markdown.length },
                });
              })();
              return true;
            },
          }),
        ],
      });

      viewRef.current = new EditorView({ state, parent: containerRef.current });
    }, [notePath]);

    useEffect(() => {
      initEditor();
      return () => {
        const view = viewRef.current;
        if (view) {
          putSourceEditorHistory(sourceHistoryCacheKey(notePath), {
            state: view.state,
            themeCompartment: themeCompartmentRef.current,
          });
          view.destroy();
        }
        viewRef.current = null;
      };
    }, [initEditor, notePath]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: themeCompartmentRef.current.reconfigure(buildSourceEditorTheme(appTheme)),
      });
    }, [appTheme]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: readOnlyCompartmentRef.current.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    }, [readOnly]);

    useEffect(() => {
      if (!active) return;
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === content) return;
      // External updates from live mode / disk must apply even when this editor
      // still has undo history — otherwise live and source diverge.
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }, [content, active]);

    useEffect(() => {
      if (!active) return;
      const view = viewRef.current;
      if (!view) return;
      const id = requestAnimationFrame(() => view.focus());
      return () => cancelAnimationFrame(id);
    }, [active]);

    useEffect(() => {
      if (!contextMenu) return;
      const close = () => setContextMenu(null);
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
      return () => {
        window.removeEventListener("click", close);
        window.removeEventListener("scroll", close, true);
      };
    }, [contextMenu]);

    return (
      <>
        <div className="boke-source-editor-inner">
          <div ref={containerRef} className="boke-source-editor" />
        </div>
        {contextMenu && (
          <ContextMenuFrame
            x={contextMenu.x}
            y={contextMenu.y}
            className="boke-context-menu boke-md-editor-context-menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              className="boke-md-editor-context-menu-item"
              onClick={() => {
                const view = viewRef.current;
                if (!view) return;
                const { from, to } = view.state.selection.main;
                const text = getSourceSelectionPlainText(from, to, view.state.doc.toString());
                if (text) void writeSystemClipboardText(text);
                setContextMenu(null);
              }}
            >
              <span className="boke-md-editor-context-menu-item__icon">
                <CopyIcon />
              </span>
              <span className="boke-md-editor-context-menu-item__label">{t("note.editorContextMenuCopyPlain")}</span>
            </button>
          </ContextMenuFrame>
        )}
      </>
    );
  },
);
