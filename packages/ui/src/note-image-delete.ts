import {
  isInNotePicFolder,
  markdownReferencesImage,
  normalizePath,
  notePicDirPath,
  type VaultAdapter,
} from "@chestnut/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { resolveImageVaultPath, trackImageDisplayUrl } from "./image-open.js";
import { useAppStore, vaultService } from "./store.js";

/** Session cache so Ctrl+Z can restore disk files removed with "delete on remove". */
const removedImageBytes = new Map<string, Uint8Array>();

function getVaultRoot(): string | null {
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri" || !("getRootPath" in adapter)) return null;
  return (adapter as { getRootPath(): string }).getRootPath().replace(/\\/g, "/").replace(/\/$/, "");
}

export function getImageSrcFromView(view: EditorView, img: HTMLImageElement): string | null {
  let srcFromNode: string | null = null;
  view.state.doc.descendants((node, pos) => {
    if (srcFromNode) return false;
    if (!node.type.name.toLowerCase().includes("image")) return;
    const domNode = view.nodeDOM(pos);
    if (domNode === img || (domNode instanceof HTMLElement && domNode.contains(img))) {
      const src = typeof node.attrs.src === "string" ? node.attrs.src.trim() : "";
      srcFromNode = src || null;
      return false;
    }
    return undefined;
  });
  if (srcFromNode) return srcFromNode;
  const attr = img.getAttribute("src")?.trim();
  if (attr) return attr;
  const current = img.currentSrc?.trim();
  return current || null;
}

export function getImageVaultPathFromView(
  view: EditorView,
  img: HTMLImageElement,
  notePath: string,
): string | null {
  const srcFromNode = getImageSrcFromView(view, img);
  const vaultRoot = getVaultRoot();
  if (srcFromNode) {
    return resolveImageVaultPath(srcFromNode, notePath, vaultRoot);
  }

  return null;
}

async function ensureParentDir(vaultPath: string): Promise<void> {
  const adapter = vaultService.getAdapter();
  if (!adapter) return;
  const slash = vaultPath.lastIndexOf("/");
  if (slash <= 0) return;
  const parent = vaultPath.slice(0, slash);
  if (!(await adapter.exists(parent))) {
    await adapter.mkdir(parent);
  }
}

function invalidateAssetUrl(vaultPath: string): void {
  const adapter = vaultService.getAdapter() as
    | (VaultAdapter & { invalidateAssetUrl?: (p: string) => void })
    | null;
  adapter?.invalidateAssetUrl?.(vaultPath);
}

async function reloadDisplayedImages(vaultPath: string): Promise<void> {
  const normalized = normalizePath(vaultPath);
  let freshUrl: string;
  try {
    invalidateAssetUrl(normalized);
    freshUrl = await vaultService.getAssetUrl(normalized);
    trackImageDisplayUrl(freshUrl, normalized);
  } catch {
    return;
  }

  for (const img of document.querySelectorAll("img")) {
    if (!(img instanceof HTMLImageElement)) continue;
    const dataPath = img.dataset.vaultPath || img.dataset.embed;
    if (dataPath && normalizePath(dataPath) === normalized) {
      img.src = freshUrl;
      continue;
    }
    const src = img.getAttribute("src");
    if (!src) continue;
    const resolved = resolveImageVaultPath(src, undefined, getVaultRoot());
    if (resolved === normalized) {
      img.src = freshUrl;
    }
  }
}

export async function deleteNoteImageFileOnRemove(
  vaultPath: string,
  notePath: string,
  noteContentAfterRemove: string,
): Promise<void> {
  if (!useAppStore.getState().deleteImageFilesOnRemove) return;

  const normalized = normalizePath(vaultPath);
  if (!isInNotePicFolder(normalized)) return;

  const picDir = normalizePath(notePicDirPath(notePath));
  if (normalized !== picDir && !normalized.startsWith(`${picDir}/`)) return;

  const vaultRoot = getVaultRoot();
  if (markdownReferencesImage(noteContentAfterRemove, normalized, notePath, vaultRoot)) return;

  const mdFiles = await vaultService.listMarkdown();
  for (const { path } of mdFiles) {
    if (normalizePath(path) === normalizePath(notePath)) continue;
    const content = await vaultService.read(path);
    if (markdownReferencesImage(content, normalized, path, vaultRoot)) return;
  }

  const adapter = vaultService.getAdapter();
  if (!adapter || !(await adapter.exists(normalized))) return;

  try {
    const bytes = await vaultService.readBinary(normalized);
    removedImageBytes.set(normalized, bytes);
  } catch (err) {
    console.warn("[Chestnut] failed to cache image before delete:", err);
  }

  await vaultService.deletePath(normalized, "file");
  invalidateAssetUrl(normalized);
  useAppStore.getState().refreshTree();
}

/**
 * After undo/content change: if markdown references an image we deleted this session
 * and the file is gone from disk, write the cached bytes back.
 */
export async function restoreRemovedNoteImagesIfNeeded(
  notePath: string,
  noteContent: string,
): Promise<void> {
  if (removedImageBytes.size === 0) return;

  const vaultRoot = getVaultRoot();
  const adapter = vaultService.getAdapter();
  if (!adapter) return;

  let restored = false;
  for (const [vaultPath, bytes] of [...removedImageBytes]) {
    if (!markdownReferencesImage(noteContent, vaultPath, notePath, vaultRoot)) continue;

    if (await adapter.exists(vaultPath)) {
      removedImageBytes.delete(vaultPath);
      continue;
    }

    try {
      await ensureParentDir(vaultPath);
      await vaultService.writeBinary(vaultPath, bytes);
      removedImageBytes.delete(vaultPath);
      restored = true;
      await reloadDisplayedImages(vaultPath);
    } catch (err) {
      console.warn("[Chestnut] failed to restore removed image:", vaultPath, err);
    }
  }

  if (restored) {
    useAppStore.getState().refreshTree();
  }
}
