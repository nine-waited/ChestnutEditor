import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n/index.js";
import { searchIndex, workspaceStore, useAppStore } from "../store.js";
import { fileTreeSelection } from "../file-tree-selection.js";
import { revealFileInTree, revealFileInTreeWhenReady } from "../file-tree-expand-context.js";
import { resolveVaultEntryClipboardPath } from "../note-actions.js";
import { requestEditorReveal } from "../pending-editor-reveal.js";

type HighlightPart = { text: string; match: boolean };

/** Split `text` into plain / matched parts for case-insensitive query terms. */
export function splitSearchHighlight(text: string, query: string): HighlightPart[] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
    .sort((a, b) => b.length - a.length);
  if (!text || terms.length === 0) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const marks: Array<{ start: number; end: number }> = [];
  for (const term of terms) {
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(term, from);
      if (i < 0) break;
      marks.push({ start: i, end: i + term.length });
      from = i + term.length;
    }
  }
  if (marks.length === 0) return [{ text, match: false }];

  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const mark of marks) {
    const last = merged[merged.length - 1];
    if (last && mark.start <= last.end) {
      last.end = Math.max(last.end, mark.end);
    } else {
      merged.push({ ...mark });
    }
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const mark of merged) {
    if (mark.start > cursor) {
      parts.push({ text: text.slice(cursor, mark.start), match: false });
    }
    parts.push({ text: text.slice(mark.start, mark.end), match: true });
    cursor = mark.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
}

function SearchSnippet({ text, query }: { text: string; query: string }): ReactNode {
  const parts = useMemo(() => splitSearchHighlight(text, query), [text, query]);
  if (!text) return null;
  return (
    <div className="chestnut-palette-snippet" title={text}>
      {parts.map((part, i) =>
        part.match ? (
          <strong key={i} className="chestnut-palette-snippet-match">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}

export function SearchPanel() {
  const t = useT();
  const open = useAppStore((s) => s.searchOpen);
  const setOpen = useAppStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [results, setResults] = useState<ReturnType<typeof searchIndex.search>>([]);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const openResult = useCallback(
    (path: string, bodyLine: number | null) => {
      if (bodyLine !== null) requestEditorReveal(path, bodyLine);
      fileTreeSelection.selectExclusive(path, "file");
      workspaceStore.openFile(path);
      setOpen(false);
      revealFileInTree(path);
      void revealFileInTreeWhenReady(path);
    },
    [setOpen],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
  }, [open]);

  useEffect(() => {
    setResults(searchIndex.search(query));
    setSelected(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected, open, results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return;
      }
      if (e.key === "Enter" && results[selected]) {
        e.preventDefault();
        openResult(results[selected].path, results[selected].bodyLine);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected, setOpen, openResult]);

  if (!open) return null;

  return (
    <div className="chestnut-modal-overlay" onClick={() => setOpen(false)}>
      <div className="chestnut-palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={t("palette.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chestnut-palette-list">
          {results.map((r, i) => (
            <div
              key={r.path}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`chestnut-palette-item${i === selected ? " selected" : ""}`}
              onClick={() => openResult(r.path, r.bodyLine)}
              onMouseEnter={() => setSelected(i)}
            >
              <div className="chestnut-palette-item-main">
                <div className="chestnut-palette-item-title">{r.title}</div>
                {r.snippet ? <SearchSnippet text={r.snippet} query={query} /> : null}
                <small className="chestnut-palette-item-path">
                  {resolveVaultEntryClipboardPath(r.path)}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
