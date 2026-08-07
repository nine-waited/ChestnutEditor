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
import { eventBus, useAppStore, vaultService, workspaceStore, MARKDOWN_SAVE_INTERVAL_MS } from "../store.js";
import { restoreRemovedNoteImagesIfNeeded } from "../note-image-delete.js";
import { consumeEditorReveal, subscribeEditorReveal } from "../pending-editor-reveal.js";
import { setNoteUnsaved } from "../unsaved-notes.js";

interface NotePaneProps {
  path: string;
  mode: LeafMode | string;
  leafId: string;
  paneId?: PaneId;
  /** When false, pane is keep-alive hidden; editors stay mounted. */
  isActive?: boolean;
}

const MODE_OPTIONS = [
  { id: "live" as const, key: "note.modeLive" },
  { id: "source" as const, key: "note.modeSource" },
];

type SaveIndicator = "dirty" | "saved" | "autosaved";

function SaveStatusBadge({
  status,
  saveMode,
}: {
  status: SaveIndicator;
  saveMode: "realtime" | "interval";
}) {
  const t = useT();
  const realtime = saveMode === "realtime";
  const label = realtime
    ? t("note.saveRealtime")
    : status === "dirty"
      ? t("note.saveUnsaved")
      : status === "autosaved"
        ? t("note.saveAutosaved")
        : t("note.saveSaved");
  const dirty = !realtime && status === "dirty";
  return (
    <div
      className={`boke-note-save-status${dirty ? " is-dirty" : " is-saved"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="boke-note-save-status__icon" aria-hidden="true">
        {dirty ? (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path
              d="M8 4.4v4.2"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="8" cy="11.15" r="0.95" fill="#fff" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path
              d="M4.75 8.15 6.9 10.3 11.35 5.7"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="boke-note-save-status__text">{label}</span>
    </div>
  );
}

function NoteTitleBar({
  path,
  leafId,
  mode,
  flushContent,
  isActive,
  saveStatus,
  saveMode,
}: {
  path: string;
  leafId: string;
  mode: LeafMode | string;
  flushContent: () => Promise<void>;
  isActive: boolean;
  saveStatus: SaveIndicator;
  saveMode: "realtime" | "interval";
}) {
  const t = useT();
  const locale = useLocale();
  const refreshTree = useAppStore((s) => s.refreshTree);
  const baseName = noteBaseName(path);
  const [draft, setDraft] = useState(baseName);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    setDraft(noteBaseName(path));
  }, [path]);

  useEffect(() => {
    if (!isActive) return;
    if (isDefaultUntitledName(baseName, locale)) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [path, baseName, locale, isActive]);

  const commitTitle = useCallback(async () => {
    if (committingRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed || sanitizeNoteTitle(trimmed) === noteBaseName(path)) return;

    committingRef.current = true;
    try {
      await flushContent();
      const newPath = await vaultService.renameNote(path, trimmed);
      if (newPath !== path) {
        workspaceStore.updatePath(leafId, newPath);
        refreshTree();
      }
    } catch (err) {
      console.warn("[Chestnut] rename failed:", err);
      setDraft(noteBaseName(path));
    } finally {
      committingRef.current = false;
    }
  }, [draft, path, leafId, flushContent, refreshTree]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitTitle();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setDraft(noteBaseName(path));
      inputRef.current?.blur();
    }
  };

  return (
    <div className="boke-note-title-bar">
      <ModeToggle leafId={leafId} mode={mode} />
      <SaveStatusBadge status={saveStatus} saveMode={saveMode} />
      <input
        ref={inputRef}
        className="boke-note-title-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
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
  contentRef.current = content;
  saveStatusRef.current = saveStatus;

  useEffect(() => {
    let cancelled = false;
    // Avoid unmounting editors on keep-alive revisit — only block UI on first load.
    if (!loadedOnceRef.current) setLoading(true);
    vaultService
      .read(path)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        lastSavedRef.current = text;
        scheduledSaveRef.current = text;
        setSaveStatus("saved");
        loadedOnceRef.current = true;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    eventBus.emit("file-open", { path });
    return () => {
      cancelled = true;
    };
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
    if (markdownSaveMode !== "interval") {
      setNoteUnsaved(path, false);
      return;
    }
    setNoteUnsaved(path, saveStatus === "dirty");
  }, [path, saveStatus, markdownSaveMode]);

  useEffect(() => {
    const tracked = path;
    return () => setNoteUnsaved(tracked, false);
  }, [path]);

  useEffect(() => {
    if (markdownSaveMode !== "interval") return;
    // Keep a fixed 15s tick; only write when the note is currently unsaved.
    const timer = window.setInterval(() => {
      if (saveStatusRef.current !== "dirty") return;
      if (vaultService.isWriteSuppressed(path)) return;
      const next = contentRef.current;
      if (next === lastSavedRef.current) return;
      pendingSaveKindRef.current = "auto";
      scheduledSaveRef.current = next;
      void vaultService.write(path, next, true);
    }, MARKDOWN_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [markdownSaveMode, path]);

  const onChange = useCallback(
    (next: string) => {
      setContent(next);
      setSaveStatus(next === lastSavedRef.current ? "saved" : "dirty");
      if (vaultService.isWriteSuppressed(path)) return;
      if (markdownSaveMode === "realtime") {
        pendingSaveKindRef.current = "auto";
        scheduledSaveRef.current = next;
        vaultService.write(path, next);
      }
      void restoreRemovedNoteImagesIfNeeded(path, next);
    },
    [path, markdownSaveMode],
  );

  const onSave = useCallback(() => {
    if (vaultService.isWriteSuppressed(path)) return;
    pendingSaveKindRef.current = "manual";
    scheduledSaveRef.current = content;
    lastSavedRef.current = content;
    setSaveStatus("saved");
    void vaultService.write(path, content, true);
  }, [path, content]);

  const flushContent = useCallback(async () => {
    if (vaultService.isWriteSuppressed(path)) return;
    const next = contentRef.current;
    pendingSaveKindRef.current = "manual";
    scheduledSaveRef.current = next;
    lastSavedRef.current = next;
    setSaveStatus("saved");
    await vaultService.write(path, next, true);
  }, [path]);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
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
        />
        <EditorZoomHost>
          <div ref={notePaneRef} className={`boke-note-pane boke-note-pane--${viewMode}`}>
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
