import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { undoDepth, redoDepth } from "@milkdown/kit/prose/history";
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
import { findDocLinePos } from "../markdown-editor-actions.js";
import { disableMarkdownAutoEscape } from "../markdown-stringify-no-escape.js";
import { dontExtendInlineMarksPlugin } from "../markdown-dont-extend-marks.js";
import { MarkdownEditorContextMenu } from "./MarkdownEditorContextMenu.js";
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
}

interface MarkdownEditorProps {
  content: string;
  notePath: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  presentation?: "default" | "live";
  /** When false, skip external content sync so hidden keep-alive undo stays intact. */
  active?: boolean;
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
  const markdown = getMarkdown()(ctx);
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
  crepeRef,
  onOpenContextMenu,
}: MilkdownCrepeEditorProps) {
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const notePathRef = useRef(notePath);
  const lastEmitted = useRef(content);
  const skipExternalSync = useRef(false);
  const editorRootRef = useRef<HTMLElement | null>(null);
  const onOpenContextMenuRef = useRef(onOpenContextMenu);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  notePathRef.current = notePath;
  onOpenContextMenuRef.current = onOpenContextMenu;
  const activeRef = useRef(active);
  activeRef.current = active;

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
      },
      featureConfigs: {
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
      },
    });

    crepe.editor.config((ctx) => {
      disableMarkdownAutoEscape(ctx);
    });
    crepe.editor.use(dontExtendInlineMarksPlugin);

    let acceptMarkdownUpdates = false;
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (!acceptMarkdownUpdates) {
          // Keep baseline in sync without pushing mount-time trailing edits to disk.
          lastEmitted.current = markdown;
          return;
        }
        if (markdown === lastEmitted.current) return;
        lastEmitted.current = markdown;
        skipExternalSync.current = true;
        onChangeRef.current(markdown);
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

  // Keep React content in sync with the editor without wiping undo history.
  // replaceAll clears ProseMirror history — never call it when undo/redo exists.
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
      let historyPending = false;
      let editorMarkdown = "";
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        historyPending = undoDepth(view.state) > 0 || redoDepth(view.state) > 0;
        editorMarkdown = getMarkdown()(ctx);
      });

      if (historyPending || editorMarkdown === content) {
        lastEmitted.current = editorMarkdown || content;
        return;
      }

      lastEmitted.current = content;
      crepe.editor.action(replaceAll(content, true));
    } catch {
      // Editor may still be initializing.
    }
  }, [content, loading, active, crepeRef]);

  useEffect(() => {
    if (!active || loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;
    const id = requestAnimationFrame(() => {
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

  useEffect(() => {
    if (loading || presentation !== "live") return;
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
        attachLiveEditorMarkdownClipboard(editorEl, (fn) => {
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
  }, [loading, presentation, crepeRef]);

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
            if (!view.editable) return;
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

    const goToDocLine = useCallback((docLine: number, markdown: string) => {
      const crepe = crepeRef.current;
      const scrollEl = wrapRef.current?.querySelector(".boke-live-scroll");
      if (!crepe) return;

      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const pos = findDocLinePos(view, markdown, docLine);
        if (pos === null) return;

        const safePos = Math.min(Math.max(pos, 0), view.state.doc.content.size);
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, safePos)));
        view.focus();

        try {
          const coords = view.coordsAtPos(safePos);
          if (scrollEl) {
            const scrollRect = scrollEl.getBoundingClientRect();
            scrollEl.scrollTop += coords.top - scrollRect.top - scrollRect.height / 3;
          }
        } catch {
          // ignore scroll errors
        }
      });
    }, []);

    useImperativeHandle(ref, () => ({ goToDocLine }), [goToDocLine]);

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
            notePath={props.notePath}
            crepe={crepeRef.current}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  },
);
