import { isMarkdown, joinPath, normalizePath, resolvePathSegments } from "@chestnut/core";
import { workspaceStore } from "./store.js";

/** Resolve a relative markdown href against the current note into a vault path. */
export function resolveNoteMarkdownLinkHref(href: string, notePath: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (/^(https?:|mailto:|tel:|data:|#)/i.test(raw)) return null;

  const withoutHash = raw.split("#")[0]?.split("?")[0] ?? "";
  if (!withoutHash) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(withoutHash);
    } catch {
      return withoutHash;
    }
  })();

  const noteDir = normalizePath(notePath).includes("/")
    ? normalizePath(notePath).replace(/\/[^/]+$/, "")
    : "";
  const joined = decoded.startsWith("/")
    ? normalizePath(decoded.replace(/^\/+/, ""))
    : noteDir
      ? joinPath(noteDir, decoded)
      : normalizePath(decoded);
  const vaultPath = resolvePathSegments(joined);
  if (!vaultPath) return null;
  if (isMarkdown(vaultPath) || vaultPath.toLowerCase().endsWith(".excalidraw")) {
    return vaultPath;
  }
  // Bare note name without extension → assume Markdown.
  if (!/\.[a-z0-9]+$/i.test(vaultPath)) return `${vaultPath}.md`;
  return null;
}

/**
 * In the live editor, open vault-relative `.md` / `.excalidraw` links in-app
 * instead of navigating the webview.
 */
export function attachLiveEditorNoteLinkClicks(
  root: HTMLElement,
  getNotePath: () => string,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || !root.contains(anchor)) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    const vaultPath = resolveNoteMarkdownLinkHref(href, getNotePath());
    if (!vaultPath) return;

    event.preventDefault();
    event.stopPropagation();
    workspaceStore.openFile(vaultPath);
  };

  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}
