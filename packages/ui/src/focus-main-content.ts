import { fileTreeSelection } from "./file-tree-selection.js";
import { workspaceStore } from "./store.js";

const FILE_TREE_SHELL_SELECTOR = ".boke-file-tree-shell";
const FILE_TREE_ROOT_SELECTOR = ".boke-file-tree-shell .boke-file-tree";

export function isFileTreeShellFocused(): boolean {
  const el = document.activeElement;
  return el instanceof Element && Boolean(el.closest(FILE_TREE_SHELL_SELECTOR));
}

/** True while the user is interacting with the file tree / pinned bar. */
export function shouldPreserveFileTreeFocus(): boolean {
  return fileTreeSelection.shouldKeepKeyboardFocus() || isFileTreeShellFocused();
}

export function refocusFileTree(): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
  document.querySelector<HTMLElement>(FILE_TREE_ROOT_SELECTOR)?.focus({ preventScroll: true });
}

/** Focus the main editor surface after hiding the file sidebar. */
export function focusMainContent(paneId?: "left" | "right"): void {
  requestAnimationFrame(() => {
    if (shouldPreserveFileTreeFocus()) {
      refocusFileTree();
      return;
    }

    const id = paneId ?? workspaceStore.getFocusedPane();
    const root =
      document.querySelector<HTMLElement>(`.boke-content[data-pane="${id}"]`) ??
      document.querySelector<HTMLElement>(".boke-content");
    if (!root) return;

    root.focus({ preventScroll: true });

    const activeSlot = root.querySelector<HTMLElement>(".boke-note-pane-slot.is-active");
    const scope = activeSlot ?? root;
    const editor =
      scope.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]') ??
      scope.querySelector<HTMLElement>(".cm-content") ??
      root.querySelector<HTMLElement>(".boke-excalidraw-wrap") ??
      root.querySelector<HTMLElement>(".boke-image-view") ??
      root.querySelector<HTMLElement>(".boke-pdf-view");

    editor?.focus({ preventScroll: true });
  });
}

export function isFileContentTab(type: string): boolean {
  return type === "markdown" || type === "excalidraw" || type === "image" || type === "pdf";
}
