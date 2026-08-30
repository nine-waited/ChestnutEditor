import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { normalizeLeafMode, noteBaseName, sanitizeNoteTitle, type LeafMode, type PaneId } from "@chestnut/core";
import { EditorZoomHost } from "./EditorZoomHost.js";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor.js";
import { MarkdownSourceEditor, type MarkdownSourceEditorHandle } from "./MarkdownSourceEditor.js";
import { OutlinePanel } from "./OutlinePanel.js";
import { OutlineBoundaryControl } from "./OutlineBoundaryControl.js";
import { bodyLineToDocLine, type OutlineHeading } from "../markdown-outline.js";
import { formatImageMarkdown, savePastedNoteImage } from "../note-images.js";
import { isDefaultUntitledName, useLocale, useT } from "../i18n/index.js";
import { eventBus, useAppStore, vaultService, workspaceStore, writingStats, MARKDOWN_SAVE_INTERVAL_MS } from "../store.js";
import { restoreRemovedNoteImagesIfNeeded } from "../note-image-delete.js";
import { persistNoteMarkdown } from "../note-image-ingest.js";
import { consumeEditorReveal, subscribeEditorReveal } from "../pending-editor-reveal.js";
import { applyPaneUnsavedFlag, clearNoteUnsaved, setNoteUnsaved } from "../unsaved-notes.js";
import {
  flushNoteWriters,
  registerNoteFlusher,
  requestToggleMarkdownViewOnly,
  subscribeNoteReload,
} from "../note-reload.js";
import { SaveStatusBadge, type SaveIndicator } from "./SaveStatusBadge.js";

interface NotePaneProps {
  path: string;
  mode: LeafMode | string;
  leafId: string;
  paneId?: PaneId;
  /** When false, pane is keep-alive hidden; editors stay mounted. */
  isActive?: boolean;
  /** Split-pair / manual view-only from workspace leaf. */
  viewOnly?: boolean;
}

const MODE_OPTIONS = [
  { id: "live" as const, key: "note.modeLive" },
  { id: "source" as const, key: "note.modeSource" },
];

function NoteTitleBar({
  path,
  leafId,
  mode,
  flushContent,
  isActive,
  saveStatus,
  saveMode,
  viewOnly,
  onViewOnlyChange,
}: {
  path: string;
  leafId: string;
  mode: LeafMode | string;
  flushContent: () => Promise<void>;
  isActive: boolean;
  saveStatus: SaveIndicator;
  saveMode: "realtime" | "interval";
  viewOnly: boolean;
  onViewOnlyChange: (next: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const refreshTree = useAppStore((s) => s.refreshTree);
  const baseName = noteBaseName(path);
  const [draft, setDraft] = useState(baseName);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const dirtyRef = useRef(false);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    setDraft(noteBaseName(path));
    dirtyRef.current = false;
  }, [path]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      setDraft(noteBaseName(path));
      dirtyRef.current = false;
    }
    wasActiveRef.current = isActive;
  }, [isActive, path]);

  useEffect(() => {
    if (!isActive || viewOnly) return;
    if (isDefaultUntitledName(baseName, locale)) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [path, baseName, locale, isActive, viewOnly]);

  const commitTitle = useCallback(async () => {
    if (!isActive || viewOnly || committingRef.current || !dirtyRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed || sanitizeNoteTitle(trimmed) === noteBaseName(path)) return;

    committingRef.current = true;
    try {
      await flushContent();
      const newPath = await vaultService.renameNote(path, trimmed);
      dirtyRef.current = false;
      if (newPath !== path) {
        workspaceStore.updatePath(leafId, newPath);
        refreshTree();
      }
    } catch (err) {
      console.warn("[Chestnut] rename failed:", err);
      setDraft(noteBaseName(path));
      dirtyRef.current = false;
    } finally {
      committingRef.current = false;
    }
  }, [draft, path, leafId, flushContent, refreshTree, viewOnly, isActive]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (viewOnly) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commitTitle();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      dirtyRef.current = false;
      setDraft(noteBaseName(path));
      inputRef.current?.blur();
    }
  };

  return (
    <div className="boke-note-title-bar">
      <ModeToggle leafId={leafId} mode={mode} />
      {!viewOnly ? <SaveStatusBadge status={saveStatus} saveMode={saveMode} /> : null}
      <button
        type="button"
        className="boke-toolbar-icon-btn boke-note-view-only-btn"
        aria-pressed={viewOnly}
        aria-label={t("note.viewOnlyAria")}
        data-tooltip={t("note.viewOnly")}
        onClick={() => onViewOnlyChange(!viewOnly)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path
            d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <input
        ref={inputRef}
        className={`boke-note-title-input${viewOnly ? " is-view-only" : ""}`}
        type="text"
        value={draft}
        readOnly={viewOnly}
        onChange={(e) => {
          if (viewOnly) return;
          dirtyRef.current = true;
          setDraft(e.target.value);
        }}
        onBlur={() => void commitTitle()}
        onKeyDown={onKeyDown}
        placeholder={t("note.untitledPlaceholder")}
        spellCheck={false}
        aria-label={t("note.titleAria")}
      />
    </div>
  );
}

export const NotePane = memo(function NotePane({
  path,
  mode,
  leafId,
  paneId = "left",
  isActive = true,
  viewOnly = false,
}: NotePaneProps) {
  const t = useT();
  const markdownSaveMode = useAppStore((s) => s.markdownSaveMode);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveIndicator>("saved");
  const loadedOnceRef = useRef(false);
  const viewMode = normalizeLeafMode(mode);
  const [liveMounted, setLiveMounted] = useState(() => viewMode === "live");
  const [sourceMounted, setSourceMounted] = useState(() => viewMode === "source");
  const liveRef = useRef<MarkdownEditorHandle>(null);
  const sourceRef = useRef<MarkdownSourceEditorHandle>(null);
  const notePaneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  const lastSavedRef = useRef("");
  const scheduledSaveRef = useRef("");
  /** Distinguishes Ctrl+S / flush from debounced or interval autosave. */
  const pendingSaveKindRef = useRef<"manual" | "auto">("auto");
  const saveStatusRef = useRef(saveStatus);
  const viewOnlyRef = useRef(viewOnly);
  contentRef.current = content;
  saveStatusRef.current = saveStatus;
  viewOnlyRef.current = viewOnly;

  const applyIngestedMarkdown = (original: string, written: string) => {
    if (written === original || viewOnlyRef.current) return;
    contentRef.current = written;
    lastSavedRef.current = written;
    scheduledSaveRef.current = written;
    setContent(written);
  };

  useEffect(() => {
    let cancelled = false;
    // Avoid unmounting editors on keep-alive revisit — only block UI on first load.
    if (!loadedOnceRef.current) setLoading(true);
    void (async () => {
      // Persist editable twin buffer before this pane reads disk (view-only pair open).
      await flushNoteWriters(path);
      if (cancelled) return;
      try {
        const text = await vaultService.read(path);
        if (cancelled) return;
        setContent(text);
        lastSavedRef.current = text;
        scheduledSaveRef.current = text;
        setSaveStatus("saved");
        loadedOnceRef.current = true;
        writingStats.seedBuffer(path, text);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    eventBus.emit("file-open", { path });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    return subscribeNoteReload((reloadPath) => {
      if (reloadPath !== path) return;
      void vaultService.read(path).then((text) => {
        setContent(text);
        lastSavedRef.current = text;
        scheduledSaveRef.current = text;
        setSaveStatus("saved");
        clearNoteUnsaved(path);
        writingStats.seedBuffer(path, text);
      });
    });
  }, [path]);

  useEffect(() => {
    // Keep whichever modes the user has opened; never tear them down on tab hide.
    if (viewMode === "live") setLiveMounted(true);
    if (viewMode === "source") setSourceMounted(true);
  }, [viewMode]);

  useEffect(() => {
    const markSavedIfCurrent = (savedPath: string) => {
      if (savedPath !== path) return;
      if (contentRef.current !== scheduledSaveRef.current) return;
      lastSavedRef.current = contentRef.current;
      const kind = pendingSaveKindRef.current;
      pendingSaveKindRef.current = "auto";
      setSaveStatus(kind === "manual" ? "saved" : "autosaved");
    };
    const unsub = eventBus.on("file-save", ({ path: savedPath }) => {
      markSavedIfCurrent(savedPath);
    });
    return unsub;
  }, [path]);

  useEffect(() => {
    // View-only twin must never clear path-level dirty flags owned by the editable pane.
    applyPaneUnsavedFlag(path, {
      viewOnly,
      saveMode: markdownSaveMode,
      dirty: saveStatus === "dirty",
    });
  }, [path, saveStatus, markdownSaveMode, viewOnly]);

  useEffect(() => {
    if (viewOnly) return;
    const tracked = path;
    return () => setNoteUnsaved(tracked, false);
  }, [path, viewOnly]);

  useEffect(() => {
    if (viewOnly || markdownSaveMode !== "interval") return;
    // Keep a fixed 15s tick; only write when the note is currently unsaved.
    const timer = window.setInterval(() => {
      if (viewOnlyRef.current) return;
      if (saveStatusRef.current !== "dirty") return;
      if (vaultService.isWriteSuppressed(path)) return;
      const next = contentRef.current;
      if (next === lastSavedRef.current) return;
      pendingSaveKindRef.current = "auto";
      scheduledSaveRef.current = next;
      void persistNoteMarkdown(path, next, true).then((written) => {
        applyIngestedMarkdown(next, written);
      });
    }, MARKDOWN_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [markdownSaveMode, path, viewOnly]);

  const onChange = useCallback(
    (next: string) => {
      if (viewOnlyRef.current) return;
      setContent(next);
      setSaveStatus(next === lastSavedRef.current ? "saved" : "dirty");
      writingStats.recordEdit(path, next);
      if (vaultService.isWriteSuppressed(path)) return;
      if (markdownSaveMode === "realtime") {
        pendingSaveKindRef.current = "auto";
        scheduledSaveRef.current = next;
        void persistNoteMarkdown(path, next, false).then((written) => {
          applyIngestedMarkdown(next, written);
        });
      }
      void restoreRemovedNoteImagesIfNeeded(path, next);
    },
    [path, markdownSaveMode],
  );

  const onSave = useCallback(() => {
    if (viewOnlyRef.current) return;
    if (vaultService.isWriteSuppressed(path)) return;
    const next = contentRef.current;
    pendingSaveKindRef.current = "manual";
    scheduledSaveRef.current = next;
    lastSavedRef.current = next;
    setSaveStatus("saved");
    void persistNoteMarkdown(path, next, true).then((written) => {
      applyIngestedMarkdown(next, written);
    });
  }, [path]);

  const flushContent = useCallback(async () => {
    if (viewOnlyRef.current) return;
    if (vaultService.isWriteSuppressed(path)) return;
    const next = contentRef.current;
    pendingSaveKindRef.current = "manual";
    scheduledSaveRef.current = next;
    lastSavedRef.current = next;
    setSaveStatus("saved");
    const written = await persistNoteMarkdown(path, next, true);
    applyIngestedMarkdown(next, written);
  }, [path]);

  useEffect(() => {
    if (viewOnly) return;
    return registerNoteFlusher(path, leafId, flushContent);
  }, [viewOnly, path, leafId, flushContent]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (viewOnlyRef.current) return;
    const files = [...e.dataTransfer.files];
    let next = contentRef.current;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const imagePath = await savePastedNoteImage(path, file);
      next = `${next}\n${formatImageMarkdown(imagePath, "")}\n`;
    }
    if (next !== contentRef.current) {
      onChange(next);
    }
  }, [path, onChange]);

  const handleHeadingClick = useCallback(
    (heading: OutlineHeading) => {
      if (viewMode === "source") {
        sourceRef.current?.goToDocLine(heading.docLine);
      } else {
        liveRef.current?.goToDocLine(heading.docLine, content);
      }
    },
    [viewMode, content],
  );

  const [revealToken, setRevealToken] = useState(0);
  useEffect(() => subscribeEditorReveal(() => setRevealToken((n) => n + 1)), []);

  useEffect(() => {
    if (!isActive || loading) return;
    const bodyLine = consumeEditorReveal(path);
    if (bodyLine === null) return;

    const docLine = bodyLineToDocLine(content, bodyLine);
    const jump = () => {
      if (viewMode === "source") {
        sourceRef.current?.goToDocLine(docLine);
      } else {
        liveRef.current?.goToDocLine(docLine, content);
      }
    };

    const raf = requestAnimationFrame(jump);
    const t1 = window.setTimeout(jump, 80);
    const t2 = window.setTimeout(jump, 220);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isActive, loading, path, content, viewMode, revealToken]);

  const outlineCollapsed = useAppStore((s) => s.outlineLayouts[paneId].collapsed);
  const outlineWidth = useAppStore((s) => s.outlineLayouts[paneId].width);
  const setOutlineWidth = useAppStore((s) => s.setOutlineWidth);
  const toggleOutlineCollapsed = useAppStore((s) => s.toggleOutlineCollapsed);

  if (loading && !loadedOnceRef.current) {
    return <div style={{ padding: 24, color: "var(--boke-text-muted)" }}>{t("note.loading")}</div>;
  }

  return (
    <div className="boke-note-layout" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="boke-note-main">
        <NoteTitleBar
          path={path}
          leafId={leafId}
          mode={mode}
          flushContent={flushContent}
          isActive={isActive}
          saveStatus={saveStatus}
          saveMode={markdownSaveMode}
          viewOnly={viewOnly}
          onViewOnlyChange={(next) => void requestToggleMarkdownViewOnly(leafId, next)}
        />
        <EditorZoomHost>
          <div
            ref={notePaneRef}
            className={`boke-note-pane boke-note-pane--${viewMode}${viewOnly ? " is-view-only" : ""}`}
          >
            {liveMounted && (
              <div
                className={`boke-note-mode-slot${viewMode === "live" ? " is-active" : ""}`}
                aria-hidden={viewMode !== "live"}
              >
                <MarkdownEditor
                  ref={liveRef}
                  presentation="live"
                  notePath={path}
                  content={content}
                  onChange={onChange}
                  onSave={onSave}
                  active={isActive && viewMode === "live"}
                  readOnly={viewOnly}
                />
              </div>
            )}
            {sourceMounted && (
              <div
                className={`boke-note-mode-slot boke-source-pane${viewMode === "source" ? " is-active" : ""}`}
                aria-hidden={viewMode !== "source"}
              >
                <MarkdownSourceEditor
                  ref={sourceRef}
                  leafId={leafId}
                  notePath={path}
                  content={content}
                  onChange={onChange}
                  onSave={onSave}
                  active={isActive && viewMode === "source"}
                  readOnly={viewOnly}
                />
              </div>
            )}
          </div>
        </EditorZoomHost>
      </div>
      <div
        className={`boke-outline-shell${outlineCollapsed ? " is-collapsed" : ""}`}
        style={
          {
            "--boke-outline-width": outlineCollapsed ? "0px" : `${outlineWidth}px`,
          } as CSSProperties
        }
      >
        <OutlineBoundaryControl
          collapsed={outlineCollapsed}
          width={outlineWidth}
          onWidthChange={(width) => setOutlineWidth(paneId, width)}
          onToggleCollapsed={() => toggleOutlineCollapsed(paneId)}
        />
        <div className="boke-outline-panel">
          <OutlinePanel path={path} content={content} onHeadingClick={handleHeadingClick} />
        </div>
      </div>
    </div>
  );
});

export function ModeToggle({ leafId, mode }: { leafId: string; mode: string }) {
  const t = useT();
  const viewMode = normalizeLeafMode(mode);

  const toggleMode = () => {
    workspaceStore.setMode(leafId, viewMode === "live" ? "source" : "live");
  };

  return (
    <button
      type="button"
      className="boke-mode-switch"
      data-mode={viewMode}
      role="switch"
      aria-checked={viewMode === "source"}
      aria-label={t("note.modeSwitchAria")}
      onClick={toggleMode}
    >
      <span className="boke-mode-switch__thumb" aria-hidden="true" />
      {MODE_OPTIONS.map(({ id, key }) => (
        <span
          key={id}
          className={`boke-mode-switch__label${viewMode === id ? " is-active" : ""}`}
          aria-hidden="true"
        >
          {t(key)}
        </span>
      ))}
    </button>
  );
}
