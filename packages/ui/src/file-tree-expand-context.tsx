import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isExcalidraw, isImage, isMarkdown, isPdf } from "@chestnut/core";
import { fileTreeExpanded } from "./file-tree-expanded.js";
import { fileTreeSelection, type FileTreeSelectionKind } from "./file-tree-selection.js";
import { workspaceStore } from "./store.js";

interface FileTreeExpandContextValue {
  collapseAll: () => void;
  revealGeneration: number;
  revealTargetPath: string | null;
  revealActiveFile: () => void;
}

const FileTreeExpandContext = createContext<FileTreeExpandContextValue | null>(null);

let revealPathInTree: ((path: string) => void) | null = null;

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function selectionKindForPath(path: string): FileTreeSelectionKind {
  if (isMarkdown(path) || isExcalidraw(path) || isImage(path) || isPdf(path)) return "file";
  const name = path.split("/").pop() ?? path;
  if (/\.[a-z0-9]+$/i.test(name)) return "file";
  return "directory";
}

/** Exclusive tree focus on the revealed path; clears any previous selection highlight. */
function focusRevealedPath(path: string): void {
  const kind = selectionKindForPath(path);
  const selected = fileTreeSelection.getSelectedEntries();
  if (selected.length === 1 && selected[0]?.path === path && selected[0]?.kind === kind) {
    return;
  }
  fileTreeSelection.selectExclusive(path, kind);
}

/** Expand every parent folder of `path` so nested rows can mount. */
export function expandAncestorFolders(path: string): void {
  const normalized = normalizeVaultPath(path);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    fileTreeExpanded.setExpanded(acc, true);
  }
}

function queryFileTreeRow(path: string): HTMLElement | null {
  const normalized = normalizeVaultPath(path);
  const el = document.querySelector(`[data-file-tree-path="${CSS.escape(normalized)}"]`);
  return el instanceof HTMLElement ? el : null;
}

function isRowVisibleInFileTreeScroller(el: HTMLElement): boolean {
  const scroller = el.closest(".boke-file-tree-scroll");
  if (!(scroller instanceof HTMLElement)) return false;
  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (scrollerRect.height < 8) return false;
  return elRect.top >= scrollerRect.top - 2 && elRect.bottom <= scrollerRect.bottom + 2;
}

/** Scroll a file-tree row into the nested `.boke-file-tree-scroll` viewport. */
export function scrollFileTreeElementIntoView(
  el: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void {
  const scroller = el.closest(".boke-file-tree-scroll");
  if (!(scroller instanceof HTMLElement)) {
    el.scrollIntoView({ block: "nearest", behavior });
    return;
  }

  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (scrollerRect.height < 8) return;

  const padding = 8;
  let delta = 0;
  if (elRect.top < scrollerRect.top + padding) {
    delta = elRect.top - scrollerRect.top - padding;
  } else if (elRect.bottom > scrollerRect.bottom - padding) {
    delta = elRect.bottom - scrollerRect.bottom + padding;
  }
  if (delta === 0) return;
  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior });
}

function markWorkspaceActiveRow(path: string): void {
  const root = document.querySelector(".boke-file-tree");
  if (!(root instanceof HTMLElement)) return;
  for (const el of root.querySelectorAll(".boke-file-tree-item.is-workspace-active")) {
    el.classList.remove("is-workspace-active");
  }
  const target = queryFileTreeRow(path);
  target?.classList.add("is-workspace-active");
}

/** Scroll the file tree to `path`, expanding parent folders as needed. */
export function revealFileInTree(path: string): void {
  const normalized = normalizeVaultPath(path);
  expandAncestorFolders(normalized);
  focusRevealedPath(normalized);
  revealPathInTree?.(normalized);
}

/** Reveal after async tree refresh; retries until folders expand and the row mounts. */
export async function revealFileInTreeWhenReady(path: string): Promise<void> {
  const normalized = normalizeVaultPath(path);
  if (!normalized) return;

  expandAncestorFolders(normalized);
  focusRevealedPath(normalized);
  revealFileInTree(normalized);

  for (let attempt = 0; attempt < 12; attempt++) {
    expandAncestorFolders(normalized);
    revealFileInTree(normalized);

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const row = queryFileTreeRow(normalized);
    if (!row) continue;

    scrollFileTreeElementIntoView(row, "auto");
    markWorkspaceActiveRow(normalized);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (isRowVisibleInFileTreeScroller(row)) return;
  }
}

export function FileTreeExpandProvider({ children }: { children: ReactNode }) {
  const [revealGeneration, setRevealGeneration] = useState(0);
  const [revealTargetPath, setRevealTargetPath] = useState<string | null>(null);

  const collapseAll = useCallback(() => {
    fileTreeExpanded.collapseAll();
  }, []);

  const revealFile = useCallback((path: string) => {
    const normalized = normalizeVaultPath(path);
    expandAncestorFolders(normalized);
    focusRevealedPath(normalized);
    setRevealTargetPath(normalized);
    setRevealGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    revealPathInTree = revealFile;
    return () => {
      revealPathInTree = null;
    };
  }, [revealFile]);

  const revealActiveFile = useCallback(() => {
    const path = workspaceStore.getActivePath();
    if (!path) return;
    void revealFileInTreeWhenReady(path);
  }, []);

  return (
    <FileTreeExpandContext.Provider
      value={{
        collapseAll,
        revealGeneration,
        revealTargetPath,
        revealActiveFile,
      }}
    >
      {children}
    </FileTreeExpandContext.Provider>
  );
}

export function useFileTreeExpand(): FileTreeExpandContextValue {
  const ctx = useContext(FileTreeExpandContext);
  if (!ctx) {
    throw new Error("useFileTreeExpand must be used within FileTreeExpandProvider");
  }
  return ctx;
}

export function useFileTreeReveal(): Pick<FileTreeExpandContextValue, "revealGeneration" | "revealTargetPath"> {
  const { revealGeneration, revealTargetPath } = useFileTreeExpand();
  return { revealGeneration, revealTargetPath };
}
