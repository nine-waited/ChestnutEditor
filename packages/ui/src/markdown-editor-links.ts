import { isTauri, openExternalUrl } from "@chestnut/storage-adapters";

export const MD_LINK_MOD_CLASS = "boke-md-link-mod";

const BARE_URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const MD_LINK_URL_RE = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;

/** True for http(s) only — blocks javascript:/file:/etc. */
export function isSafeExternalHttpUrl(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeExternalHttpUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!isSafeExternalHttpUrl(trimmed)) return null;
  try {
    return new URL(trimmed).href;
  } catch {
    return null;
  }
}

/** Resolve URL under a source-mode caret/click offset (markdown link or bare URL). */
export function findExternalUrlAtOffset(text: string, offset: number): string | null {
  if (offset < 0 || offset > text.length) return null;

  for (const match of text.matchAll(MD_LINK_URL_RE)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      return normalizeExternalHttpUrl(match[1]);
    }
  }

  for (const match of text.matchAll(BARE_URL_RE)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    let raw = match[0];
    // Trim common trailing punctuation that is rarely part of the URL.
    raw = raw.replace(/[.,;:!?]+$/u, "");
    const end = start + raw.length;
    if (offset >= start && offset <= end) {
      return normalizeExternalHttpUrl(raw);
    }
  }

  return null;
}

const LINK_OPEN_DEDUP_MS = 500;
let lastOpenedLink: { url: string; at: number } | null = null;

/** Skip a follow-up click when pointerup already opened the same gesture. */
export function createLinkOpenOnce(): {
  noteOpenedFromPointerUp: () => void;
  skipDuplicateClick: () => boolean;
} {
  let openedFromPointerUp = false;
  return {
    noteOpenedFromPointerUp() {
      openedFromPointerUp = true;
    },
    skipDuplicateClick() {
      if (!openedFromPointerUp) return false;
      openedFromPointerUp = false;
      return true;
    },
  };
}

export async function openMarkdownExternalUrl(href: string): Promise<boolean> {
  const url = normalizeExternalHttpUrl(href);
  if (!url) return false;

  const now = Date.now();
  if (lastOpenedLink && lastOpenedLink.url === url && now - lastOpenedLink.at < LINK_OPEN_DEDUP_MS) {
    return true;
  }
  lastOpenedLink = { url, at: now };

  try {
    if (isTauri()) {
      await openExternalUrl(url);
      return true;
    }
  } catch (err) {
    console.warn("[Chestnut] openExternalUrl failed:", err);
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  return opened != null;
}

function isLinkModifier(event: KeyboardEvent | MouseEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function findSafeAnchor(target: EventTarget | null, root: HTMLElement): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || !root.contains(anchor)) return null;
  const href = anchor.getAttribute("href") ?? anchor.href;
  if (!isSafeExternalHttpUrl(href) && !isSafeExternalHttpUrl(anchor.href)) return null;
  return anchor;
}

function modClassHost(editorEl: HTMLElement): HTMLElement {
  return (
    editorEl.closest<HTMLElement>(".boke-note-pane") ??
    editorEl.closest<HTMLElement>(".boke-milkdown-wrap") ??
    editorEl
  );
}

/**
 * Live editor: Ctrl/Cmd+hover → pointer on http(s) links;
 * Ctrl/Cmd+click → open in the default browser without changing the editor selection.
 */
export function attachLiveEditorLinkHandlers(
  editorEl: HTMLElement,
  options?: {
    getView?: () => { state: { selection: { from: number }; doc: { content: { size: number } } }; posAtDOM: (node: Node, offset: number) => number } | null;
    collapseSelection?: (caretPos: number) => void;
  },
): () => void {
  const host = modClassHost(editorEl);

  const setMod = (on: boolean) => {
    host.classList.toggle(MD_LINK_MOD_CLASS, on);
  };

  const syncFromEvent = (event: KeyboardEvent | MouseEvent) => {
    setMod(isLinkModifier(event));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Control" || event.key === "Meta" || isLinkModifier(event)) {
      setMod(true);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Control" || event.key === "Meta" || !isLinkModifier(event)) {
      setMod(isLinkModifier(event));
    }
  };
  const clearMod = () => setMod(false);

  const openOnce = createLinkOpenOnce();
  /** Selection before Ctrl+press on a link; used to clear the gray select highlight after open. */
  let frozenCaret: number | null = null;

  const freezeSelection = () => {
    const view = options?.getView?.();
    if (!view) return;
    frozenCaret = view.state.selection.from;
  };

  const clearLinkSelectionHighlight = (anchor: HTMLAnchorElement) => {
    window.getSelection()?.removeAllRanges();
    const view = options?.getView?.();
    if (!view || !options?.collapseSelection) return;

    let pos = frozenCaret;
    if (pos == null) {
      try {
        pos = view.posAtDOM(anchor, 0);
      } catch {
        return;
      }
    }
    const safe = Math.min(Math.max(pos, 0), view.state.doc.content.size);
    options.collapseSelection(safe);
  };

  const openAnchor = (anchor: HTMLAnchorElement) => {
    void openMarkdownExternalUrl(anchor.getAttribute("href") || anchor.href);
    // Collapse after PM's own mouseup selection update paints the gray bar.
    clearLinkSelectionHighlight(anchor);
    requestAnimationFrame(() => {
      clearLinkSelectionHighlight(anchor);
      frozenCaret = null;
    });
  };

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const anchor = findSafeAnchor(event.target, editorEl);
    if (!anchor) return;
    // Always stop in-webview navigation for http(s) links.
    event.preventDefault();
    if (!isLinkModifier(event)) return;
    event.stopPropagation();
    if (openOnce.skipDuplicateClick()) return;
    openAnchor(anchor);
  };

  /** Ctrl/Cmd+press on a link must not start a text selection in ProseMirror. */
  const suppressLinkSelect = (event: Event) => {
    if (!host.classList.contains(MD_LINK_MOD_CLASS) && !(event instanceof MouseEvent && isLinkModifier(event))) {
      return;
    }
    if (event instanceof MouseEvent && event.button !== 0) return;
    if (!findSafeAnchor(event.target, editorEl)) return;
    freezeSelection();
    event.preventDefault();
    event.stopPropagation();
  };

  // Open on pointerup so we still navigate after mousedown preventDefault.
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || !isLinkModifier(event)) return;
    const anchor = findSafeAnchor(event.target, editorEl);
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    openOnce.noteOpenedFromPointerUp();
    openAnchor(anchor);
  };

  const onPointerMove = (event: PointerEvent) => {
    syncFromEvent(event);
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", clearMod);
  editorEl.addEventListener("click", onClick, true);
  editorEl.addEventListener("pointerup", onPointerUp, true);
  editorEl.addEventListener("pointerdown", suppressLinkSelect, true);
  editorEl.addEventListener("mousedown", suppressLinkSelect, true);
  editorEl.addEventListener("selectstart", suppressLinkSelect, true);
  editorEl.addEventListener("pointermove", onPointerMove);
  editorEl.addEventListener("pointerleave", clearMod);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", clearMod);
    editorEl.removeEventListener("click", onClick, true);
    editorEl.removeEventListener("pointerup", onPointerUp, true);
    editorEl.removeEventListener("pointerdown", suppressLinkSelect, true);
    editorEl.removeEventListener("mousedown", suppressLinkSelect, true);
    editorEl.removeEventListener("selectstart", suppressLinkSelect, true);
    editorEl.removeEventListener("pointermove", onPointerMove);
    editorEl.removeEventListener("pointerleave", clearMod);
    host.classList.remove(MD_LINK_MOD_CLASS);
  };
}

type SourceCoordsLookup = {
  posAtCoords: (coords: { x: number; y: number }) => number | null;
  state: { doc: { toString(): string } };
  dom: HTMLElement;
};

/**
 * Source editor: Ctrl/Cmd+hover over a bare/markdown URL → pointer;
 * Ctrl/Cmd+click → open in the default browser.
 */
export function attachSourceEditorLinkHandlers(view: SourceCoordsLookup): () => void {
  const host =
    view.dom.closest<HTMLElement>(".boke-note-pane") ??
    view.dom.closest<HTMLElement>(".boke-source-pane") ??
    view.dom;

  let lastPointer: { x: number; y: number } | null = null;

  const setMod = (on: boolean) => {
    host.classList.toggle(MD_LINK_MOD_CLASS, on);
  };

  const urlAtPointer = (): string | null => {
    if (!lastPointer) return null;
    const pos = view.posAtCoords({ x: lastPointer.x, y: lastPointer.y });
    if (pos == null) return null;
    return findExternalUrlAtOffset(view.state.doc.toString(), pos);
  };

  const updateCursor = () => {
    const modOn = host.classList.contains(MD_LINK_MOD_CLASS);
    view.dom.style.cursor = modOn && urlAtPointer() ? "pointer" : "";
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Control" || event.key === "Meta" || isLinkModifier(event)) {
      setMod(true);
      updateCursor();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    setMod(isLinkModifier(event));
    updateCursor();
  };
  const clearMod = () => {
    setMod(false);
    view.dom.style.cursor = "";
  };

  const onPointerMove = (event: PointerEvent) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    setMod(isLinkModifier(event));
    updateCursor();
  };

  const openOnce = createLinkOpenOnce();

  const onClick = (event: MouseEvent) => {
    if (!isLinkModifier(event) || event.button !== 0) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    const url = urlAtPointer();
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    if (openOnce.skipDuplicateClick()) return;
    void openMarkdownExternalUrl(url);
  };

  const suppressLinkSelect = (event: Event) => {
    if (!host.classList.contains(MD_LINK_MOD_CLASS) && !(event instanceof MouseEvent && isLinkModifier(event))) {
      return;
    }
    if (event instanceof MouseEvent) {
      if (event.button !== 0) return;
      lastPointer = { x: event.clientX, y: event.clientY };
    }
    if (!urlAtPointer()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!isLinkModifier(event) || event.button !== 0) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    const url = urlAtPointer();
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    openOnce.noteOpenedFromPointerUp();
    void openMarkdownExternalUrl(url);
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", clearMod);
  view.dom.addEventListener("click", onClick, true);
  view.dom.addEventListener("pointerup", onPointerUp, true);
  view.dom.addEventListener("pointerdown", suppressLinkSelect, true);
  view.dom.addEventListener("mousedown", suppressLinkSelect, true);
  view.dom.addEventListener("selectstart", suppressLinkSelect, true);
  view.dom.addEventListener("pointermove", onPointerMove);
  view.dom.addEventListener("pointerleave", clearMod);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", clearMod);
    view.dom.removeEventListener("click", onClick, true);
    view.dom.removeEventListener("pointerup", onPointerUp, true);
    view.dom.removeEventListener("pointerdown", suppressLinkSelect, true);
    view.dom.removeEventListener("mousedown", suppressLinkSelect, true);
    view.dom.removeEventListener("selectstart", suppressLinkSelect, true);
    view.dom.removeEventListener("pointermove", onPointerMove);
    view.dom.removeEventListener("pointerleave", clearMod);
    host.classList.remove(MD_LINK_MOD_CLASS);
    view.dom.style.cursor = "";
  };
}
