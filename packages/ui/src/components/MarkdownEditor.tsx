import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { replaceAll, getMarkdown } from "@milkdown/utils";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import { resolveImageSrcForDisplay, savePastedNoteImage } from "../note-images.js";
import { attachNoteImageSelectHandlers, resolveNoteImage } from "../note-image-select.js";
import { deleteNoteImageFileOnRemove, getImageVaultPathFromView } from "../note-image-delete.js";
import {
  findImageNodeAtDom,
  hasImageWithSrc,
  normalizeInsertedImageCaption,
  readImageCaptionFromView,
  updateImageCaptionInView,
} from "../note-image-caption.js";
import { getT } from "../i18n/index.js";
import {
  attachMarkdownEditorContextMenu,
  type EditorContextMenuPoint,
} from "../markdown-editor-context-menu.js";
import type { EditorSelectionRange } from "../markdown-editor-clipboard.js";
import {
  copyImageBinaryFromDom,
  attachLiveEditorMarkdownClipboard,
  readClipboardForPaste,
  selectImageNodeAtDom,
} from "../markdown-editor-clipboard.js";
import { attachLiveEditorShortcutKeymap } from "../markdown-editor-keymap.js";
import { attachLiveEditorScrollLock } from "../markdown-editor-live-view.js";
import { attachDismissFormatToolbar } from "../markdown-editor-format-toolbar.js";
import { findDocLinePos } from "../markdown-editor-actions.js";
import {
  elementScrollRatio,
  scrollTopFromRatio,
  visibleDocLineFromLiveEditor,
} from "../markdown-mode-scroll-sync.js";
import { disableMarkdownAutoEscape } from "../markdown-stringify-no-escape.js";
import { headingPlainTextPlugin } from "../markdown-heading-plain-plugin.js";
import { liveSourceHintsPlugin } from "../markdown-live-source-hints.js";
import { attachTableSpreadsheetKeymap } from "../markdown-table-keymap.js";
import { tableToolbarPlugin } from "../markdown-table-toolbar.js";
import { placeTableCellCaretAtPointer } from "../markdown-table-ops.js";
import { sanitizeMarkdownHeadingLines } from "../markdown-heading-sanitize.js";
import { dontExtendInlineMarksPlugin } from "../markdown-dont-extend-marks.js";
import { lazyRenderMermaidCodePreview } from "../markdown-mermaid-lazy.js";
import { syncCodeBlockNodeViews } from "../markdown-code-block-sync.js";
import { attachLiveEditorLinkHandlers } from "../markdown-editor-links.js";
import { MarkdownEditorContextMenu } from "./MarkdownEditorContextMenu.js";
import { refocusFileTree, shouldPreserveFileTreeFocus } from "../focus-main-content.js";
import "../crepe-theme.css";

/** Crepe's default bullet SVG reuses one clipPath id per item; duplicates hide dots after reload. */
const LIST_BULLET_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>';
const LIST_CHECKED_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8l-9 9z"/></svg>';
const LIST_UNCHECKED_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>';

/** Ignore Crepe's post-mount trailing/doc sync so it cannot autosave a bad list serialize. */
const MOUNT_MARKDOWN_GUARD_MS = 400;

export interface MarkdownEditorHandle {
  goToDocLine(docLine: number, content: string): void;
  getVisibleDocLine(content: string): number | null;
  getScrollRatio(): number;
  scrollToDocLine(docLine: number, content: string): boolean;
  setScrollRatio(ratio: number): void;
}

interface MarkdownEditorProps {
  content: string;
  notePath: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  presentation?: "default" | "live";
  /** When false, skip external content sync (inactive keep-alive slot). */
  active?: boolean;
  /** View-only: no edits, selection/copy still allowed. */
  readOnly?: boolean;
}

interface MilkdownCrepeEditorProps extends MarkdownEditorProps {
  crepeRef: MutableRefObject<Crepe | null>;
  onOpenContextMenu: (state: EditorContextMenuState) => void;
}

interface EditorContextMenuState extends EditorContextMenuPoint {
  selection: EditorSelectionRange;
  clipboardText: string | null;
  targetImage: HTMLImageElement | null;
}

function deleteImageAtDom(view: EditorView, img: HTMLImageElement): boolean {
  let deleted = false;
  view.state.doc.descendants((node, pos) => {
    if (deleted) return false;
    const name = node.type.name.toLowerCase();
    if (!name.includes("image")) return;
    const domNode = view.nodeDOM(pos);
    if (domNode === img || (domNode instanceof HTMLElement && domNode.contains(img))) {
      view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      deleted = true;
      return false;
    }
    return undefined;
  });
  return deleted;
}

function insertLineBelowImageAtDom(view: EditorView, img: HTMLImageElement): boolean {
  const imageNode = findImageNodeAtDom(view, img);
  if (!imageNode) return false;

  const { state } = view;
  const insertPos = imageNode.pos + imageNode.nodeSize;
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  const nodeAfter = insertPos < state.doc.content.size ? state.doc.nodeAt(insertPos) : null;
  if (nodeAfter?.type === paragraphType && nodeAfter.content.size === 0) {
    const cursorPos = insertPos + 1;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));
    view.focus();
    return true;
  }

  const paragraph = paragraphType.create();
  const tr = state.tr.insert(insertPos, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  view.dispatch(tr);
  view.focus();
  return true;
}

function emitEditorMarkdown(ctx: Ctx, lastEmitted: { current: string }, onChange: (markdown: string) => void, skipExternalSync: { current: boolean }) {
  const markdown = sanitizeMarkdownHeadingLines(getMarkdown()(ctx));
  if (markdown === lastEmitted.current) return;
  lastEmitted.current = markdown;
  skipExternalSync.current = true;
  onChange(markdown);
}

function scheduleInsertedImageEmptyCaption(
  crepe: Crepe,
  srcPath: string,
  lastEmitted: { current: string },
  skipExternalSync: { current: boolean },
  onChange: (markdown: string) => void,
): void {
  let attempts = 0;
  const finalize = () => {
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!hasImageWithSrc(view, srcPath) && attempts < 12) {
        attempts += 1;
        requestAnimationFrame(finalize);
        return;
      }
      normalizeInsertedImageCaption(view, srcPath);
      emitEditorMarkdown(ctx, lastEmitted, onChange, skipExternalSync);
    });
  };
  requestAnimationFrame(finalize);
}

function MilkdownCrepeEditor({
  content,
  notePath,
  onChange,
  onSave,
  presentation = "default",
  active = true,
  readOnly = false,
  crepeRef,
  onOpenContextMenu,
}: MilkdownCrepeEditorProps) {
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const notePathRef = useRef(notePath);
  const lastEmitted = useRef(content);
  const skipExternalSync = useRef(false);
  /** Suppress markdownUpdated→onChange while applying React content (avoids serialize rewrite). */
  const suppressMarkdownEmit = useRef(false);
  const editorRootRef = useRef<HTMLElement | null>(null);
  const onOpenContextMenuRef = useRef(onOpenContextMenu);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  notePathRef.current = notePath;
  onOpenContextMenuRef.current = onOpenContextMenu;
  const activeRef = useRef(active);
  activeRef.current = active;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const initialContentRef = useRef(content);

  // Create Crepe once per mount. Avoid @milkdown/react useEditor — its provider
  // recreates the editor whenever loading flips, which wipes undo history.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.replaceChildren();
    editorRootRef.current = root;

    let crepe!: Crepe;
    const uploadImage = async (file: File) => {
      const path = await savePastedNoteImage(notePathRef.current, file);
      scheduleInsertedImageEmptyCaption(
        crepe,
        path,
        lastEmitted,
        skipExternalSync,
        onChangeRef.current,
      );
      return path;
    };

    const t = getT();
    crepe = new Crepe({
      root,
      defaultValue: initialContentRef.current,
      features: {
        [CrepeFeature.TopBar]: presentation !== "live",
        [CrepeFeature.BlockEdit]: false,
        [CrepeFeature.LinkTooltip]: false,
        // GFM <table> + overlay toolbar; Crepe table-block chrome stays off.
        [CrepeFeature.Table]: false,
      },
      featureConfigs: {
        [CrepeFeature.Toolbar]: {
          // LinkTooltip is off — remove the selection-toolbar link button that
          // would call a missing toggleLinkCommand.
          buildToolbar: (builder) => {
            for (const group of builder.build()) {
              group.items = group.items.filter((item) => item.key !== "link");
            }
          },
        },
        [CrepeFeature.Placeholder]: {
          text:
            presentation === "live" ? t("note.editorLivePlaceholder") : t("note.editorSourcePlaceholder"),
          mode: "block",
        },
        [CrepeFeature.ListItem]: {
          bulletIcon: LIST_BULLET_ICON,
          checkBoxCheckedIcon: LIST_CHECKED_ICON,
          checkBoxUncheckedIcon: LIST_UNCHECKED_ICON,
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: uploadImage,
          inlineOnUpload: uploadImage,
          blockOnUpload: uploadImage,
          proxyDomURL: (url) => resolveImageSrcForDisplay(url, notePathRef.current),
          blockCaptionIcon: "",
          blockCaptionPlaceholderText: t("note.imageCaptionPlaceholder"),
        },
        [CrepeFeature.CodeMirror]: {
          renderPreview: lazyRenderMermaidCodePreview,
          // Keep the fence editor visible; Crepe otherwise hides it in view-only
          // whenever renderPreview is async (mermaid), which looks like an empty block.
          previewOnlyByDefault: false,
        },
      },
    });

    crepe.editor.config((ctx) => {
      disableMarkdownAutoEscape(ctx);
    });
    crepe.editor.use(dontExtendInlineMarksPlugin);
    crepe.editor.use(headingPlainTextPlugin);
    crepe.editor.use(liveSourceHintsPlugin);
    crepe.editor.use(tableToolbarPlugin);

    let acceptMarkdownUpdates = false;
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (!acceptMarkdownUpdates) {
          lastEmitted.current = sanitizeMarkdownHeadingLines(markdown);
          return;
        }
        if (suppressMarkdownEmit.current) {
          return;
        }
        const sanitized = sanitizeMarkdownHeadingLines(markdown);
        if (sanitized === lastEmitted.current) return;
        lastEmitted.current = sanitized;
        skipExternalSync.current = true;
        onChangeRef.current(sanitized);
      });
    });

    crepeRef.current = crepe;
    let cancelled = false;
    let guardTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    void crepe
      .create()
      .then(() => {
        if (cancelled) return;
        try {
          crepe.editor.action((ctx) => {
            lastEmitted.current = getMarkdown()(ctx);
          });
        } catch {
          // Editor may still be wiring plugins.
        }
        crepe.setReadonly(readOnlyRef.current);
        setLoading(false);
        guardTimer = setTimeout(() => {
          if (!cancelled) acceptMarkdownUpdates = true;
        }, MOUNT_MARKDOWN_GUARD_MS);
      })
      .catch((err) => {
        console.error("[Chestnut] milkdown create failed:", err);
        if (!cancelled) {
          acceptMarkdownUpdates = true;
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (guardTimer) clearTimeout(guardTimer);
      void crepe.destroy().catch(() => {});
      if (crepeRef.current === crepe) crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep-alive remounts by path key
  }, [crepeRef, presentation]);

  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;
    crepe.setReadonly(readOnly);
  }, [loading, readOnly, crepeRef]);

  // Keep React content in sync with the editor.
  // External updates (source mode / disk) must always apply when this mode is active —
  // preserving undo here used to leave live/source showing different documents.
  useEffect(() => {
    if (loading || !active) return;
    const crepe = crepeRef.current;
    if (!crepe) return;

    if (skipExternalSync.current) {
      skipExternalSync.current = false;
      return;
    }

    if (content === lastEmitted.current) return;

    try {
      let editorMarkdown = "";
      crepe.editor.action((ctx) => {
        editorMarkdown = getMarkdown()(ctx);
      });

      if (editorMarkdown === content) {
        lastEmitted.current = content;
        crepe.editor.action((ctx) => {
          syncCodeBlockNodeViews(ctx.get(editorViewCtx));
        });
        return;
      }

      lastEmitted.current = content;
      suppressMarkdownEmit.current = true;
      crepe.editor.action(replaceAll(content, true));
      crepe.editor.action((ctx) => {
        syncCodeBlockNodeViews(ctx.get(editorViewCtx));
      });
      // Hold suppress until after node-view remounts so delayed plugin echoes
      // cannot rewrite React/source text; then clear so user edits still emit.
      requestAnimationFrame(() => {
        try {
          crepe.editor.action((ctx) => {
            syncCodeBlockNodeViews(ctx.get(editorViewCtx));
          });
        } catch {
          // Editor may still be initializing.
        }
        suppressMarkdownEmit.current = false;
      });
    } catch {
      suppressMarkdownEmit.current = false;
      // Editor may still be initializing.
    }
  }, [content, loading, active, crepeRef]);

  useEffect(() => {
    if (!active || loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;
    const id = requestAnimationFrame(() => {
      if (shouldPreserveFileTreeFocus()) {
        refocusFileTree();
        return;
      }
      try {
        crepe.editor.action((ctx) => {
          ctx.get(editorViewCtx).focus();
        });
      } catch {
        // Editor may still be initializing.
      }
    });
    return () => cancelAnimationFrame(id);
  }, [active, loading, crepeRef]);

  // Keep-alive / view-only: nested code-block CodeMirrors can stay empty after
  // the pane was visibility:hidden, even when Source already has the fence body.
  useEffect(() => {
    if (loading || !active) return;
    const crepe = crepeRef.current;
    if (!crepe) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try {
        crepe.editor.action((ctx) => {
          if (syncCodeBlockNodeViews(ctx.get(editorViewCtx)) > 0) {
            suppressMarkdownEmit.current = true;
          }
        });
      } catch {
        // Editor may still be initializing.
      }
    };
    run();
    const raf = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(() => {
        run();
        if (!cancelled) suppressMarkdownEmit.current = false;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      suppressMarkdownEmit.current = false;
    };
  }, [active, loading, readOnly, crepeRef]);

  useEffect(() => {
    if (loading || presentation !== "live" || !active) return;
    const crepe = crepeRef.current;
    if (!crepe) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let boundEditor: HTMLElement | null = null;

    const bindIfNeeded = () => {
      const root = editorRootRef.current;
      const editorEl =
        root?.querySelector<HTMLElement>(".ProseMirror") ??
        root?.closest<HTMLElement>(".ProseMirror") ??
        root;
      if (!(editorEl instanceof HTMLElement) || editorEl === boundEditor) return;

      cleanup?.();
      boundEditor = editorEl;
      const cleanups = [
        attachNoteImageSelectHandlers(editorEl, {
          viewOnly: readOnly,
          getImageCaption: (img) => {
            let caption = "";
            crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              caption = readImageCaptionFromView(view, img);
            });
            return caption;
          },
          onDelete: async (img) => {
            await crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const vaultPath = getImageVaultPathFromView(view, img, notePathRef.current);
              deleteImageAtDom(view, img);
              if (!vaultPath) return;
              const md = getMarkdown()(ctx);
              void deleteNoteImageFileOnRemove(vaultPath, notePathRef.current, md);
            });
          },
          onInsertLineBelow: (img) => {
            crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              insertLineBelowImageAtDom(view, img);
            });
          },
          onCopy: async (img) => {
            let view: EditorView | null = null;
            crepe.editor.action((ctx) => {
              view = ctx.get(editorViewCtx);
              selectImageNodeAtDom(view, img);
            });
            if (view) {
              await copyImageBinaryFromDom(view, img, notePathRef.current);
            }
          },
          onUpdateCaption: async (img, caption) => {
            await crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              if (!updateImageCaptionInView(ctx, view, img, caption)) return;
              emitEditorMarkdown(ctx, lastEmitted, onChangeRef.current, skipExternalSync);
            });
          },
        }),
        attachLiveEditorScrollLock(editorEl),
        attachDismissFormatToolbar(editorEl, () => {
          let view: EditorView | null = null;
          crepe.editor.action((ctx) => {
            view = ctx.get(editorViewCtx);
          });
          return view;
        }),
        attachLiveEditorLinkHandlers(editorEl, {
          getView: () => {
            let view: EditorView | null = null;
            crepe.editor.action((ctx) => {
              view = ctx.get(editorViewCtx);
            });
            return view;
          },
          collapseSelection: (caretPos) => {
            crepe.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const safe = Math.min(Math.max(caretPos, 0), view.state.doc.content.size);
              view.dispatch(
                view.state.tr.setSelection(TextSelection.create(view.state.doc, safe)),
              );
            });
          },
        }),
        attachLiveEditorMarkdownClipboard(editorEl, (fn) => {
          crepe.editor.action(fn);
        }),
        attachTableSpreadsheetKeymap(editorEl, (fn) => {
          crepe.editor.action(fn);
        }),
      ];
      cleanup = () => cleanups.forEach((fn) => fn());
    };

    const tryAttach = () => {
      if (cancelled) return;
      if (!editorRootRef.current?.querySelector(".ProseMirror")) {
        requestAnimationFrame(tryAttach);
        return;
      }
      bindIfNeeded();
    };

    tryAttach();

    const root = editorRootRef.current;
    const observer =
      root &&
      new MutationObserver(() => {
        if (cancelled) return;
        bindIfNeeded();
      });
    if (observer && root) {
      observer.observe(root, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanup?.();
      boundEditor = null;
    };
  }, [loading, presentation, crepeRef, readOnly, active]);

  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const tryAttach = () => {
      if (cancelled) return;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (!view?.dom) {
            requestAnimationFrame(tryAttach);
            return;
          }
          if (cleanup) return;
          cleanup = attachMarkdownEditorContextMenu(view.dom, (point) => {
            if (!view.editable) {
              const { from, to } = view.state.selection;
              const targetEl =
                point.target instanceof HTMLElement
                  ? point.target
                  : point.target instanceof Node && point.target.parentElement
                    ? point.target.parentElement
                    : null;
              const targetImage = targetEl ? resolveNoteImage(targetEl, view.dom) : null;
              if (from === to && !targetImage) return;
            }
            if (view.editable) {
              placeTableCellCaretAtPointer(view, point.event);
            }
            view.focus();
            const { from, to } = view.state.selection;
            const selection = { from, to };
            const targetEl =
              point.target instanceof HTMLElement
                ? point.target
                : point.target instanceof Node && point.target.parentElement
                  ? point.target.parentElement
                  : null;
            const targetImage = targetEl ? resolveNoteImage(targetEl, view.dom) : null;
            void readClipboardForPaste().then((clipboardText) => {
              onOpenContextMenuRef.current({ ...point, selection, clipboardText, targetImage });
            });
          });
        });
      } catch {
        requestAnimationFrame(tryAttach);
      }
    };

    tryAttach();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [loading, crepeRef]);

  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    const root = editorRootRef.current;
    if (!crepe || !root) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const tryAttach = () => {
      if (cancelled) return;
      const editorEl = root.querySelector<HTMLElement>(".ProseMirror");
      if (!editorEl) {
        requestAnimationFrame(tryAttach);
        return;
      }
      if (cleanup) return;
      cleanup = attachLiveEditorShortcutKeymap(root, crepe, () => lastEmitted.current);
    };

    tryAttach();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [loading, crepeRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <div ref={rootRef} data-milkdown-root className="milkdown" />;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ presentation = "default", content, ...props }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);

    const openContextMenu = useCallback((state: EditorContextMenuState) => {
      setContextMenu(state);
    }, []);

    const liveScrollEl = useCallback(
      () => wrapRef.current?.querySelector<HTMLElement>(".boke-live-scroll") ?? null,
      [],
    );

    const scrollLiveToPos = useCallback((view: EditorView, pos: number, align: "start" | "center") => {
      const scrollEl = liveScrollEl();
      if (!scrollEl) return;
      try {
        const coords = view.coordsAtPos(pos);
        const scrollRect = scrollEl.getBoundingClientRect();
        const offset = align === "center" ? scrollRect.height / 3 : 8;
        scrollEl.scrollTop += coords.top - scrollRect.top - offset;
      } catch {
        // ignore scroll errors
      }
    }, [liveScrollEl]);

    const goToDocLine = useCallback((docLine: number, markdown: string) => {
      const crepe = crepeRef.current;
      if (!crepe) return;

      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const pos = findDocLinePos(view, markdown, docLine);
        if (pos === null) return;

        const safePos = Math.min(Math.max(pos, 0), view.state.doc.content.size);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, safePos)));
        view.focus();
        scrollLiveToPos(view, safePos, "center");
      });
    }, [scrollLiveToPos]);

    const getVisibleDocLine = useCallback((markdown: string) => {
      const crepe = crepeRef.current;
      const scrollEl = liveScrollEl();
      if (!crepe || !scrollEl) return null;
      let line: number | null = null;
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        line = visibleDocLineFromLiveEditor(view, markdown, scrollEl);
      });
      return line;
    }, [liveScrollEl]);

    const getScrollRatio = useCallback(() => {
      const scrollEl = liveScrollEl();
      return scrollEl ? elementScrollRatio(scrollEl) : 0;
    }, [liveScrollEl]);

    const scrollToDocLine = useCallback((docLine: number, markdown: string) => {
      const crepe = crepeRef.current;
      if (!crepe) return false;
      let scrolled = false;
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const pos = findDocLinePos(view, markdown, docLine);
        if (pos === null) return;
        const safePos = Math.min(Math.max(pos, 0), view.state.doc.content.size);
        scrollLiveToPos(view, safePos, "start");
        scrolled = true;
      });
      return scrolled;
    }, [scrollLiveToPos]);

    const setScrollRatio = useCallback((ratio: number) => {
      const scrollEl = liveScrollEl();
      if (!scrollEl) return;
      scrollEl.scrollTop = scrollTopFromRatio(ratio, scrollEl.scrollHeight, scrollEl.clientHeight);
    }, [liveScrollEl]);

    useImperativeHandle(
      ref,
      () => ({ goToDocLine, getVisibleDocLine, getScrollRatio, scrollToDocLine, setScrollRatio }),
      [goToDocLine, getVisibleDocLine, getScrollRatio, scrollToDocLine, setScrollRatio],
    );

    const isLive = presentation === "live";

    return (
      <div ref={wrapRef} className={isLive ? "boke-milkdown-wrap boke-live-pane" : "boke-milkdown-wrap"}>
        {isLive ? (
          <div className="boke-live-scroll">
            <div className="boke-live-editor-inner">
              <MilkdownCrepeEditor
                crepeRef={crepeRef}
                presentation={presentation}
                content={content}
                onOpenContextMenu={openContextMenu}
                {...props}
              />
            </div>
          </div>
        ) : (
          <MilkdownCrepeEditor
            crepeRef={crepeRef}
            presentation={presentation}
            content={content}
            onOpenContextMenu={openContextMenu}
            {...props}
          />
        )}
        {contextMenu && (
          <MarkdownEditorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            selection={contextMenu.selection}
            clipboardText={contextMenu.clipboardText}
            targetImage={contextMenu.targetImage}
            target={contextMenu.target}
            notePath={props.notePath}
            crepe={crepeRef.current}
            readOnly={Boolean(props.readOnly)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  },
);
