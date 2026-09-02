import {
  absolutePathToVaultRelative,
  applyMarkdownImageRefRewrites,
  collectNoteImageIngestTargets,
  notePicMarkdownPrefix,
  suggestedImageFileNameFromRef,
} from "@chestnut/core";
import { isTauri, readExternalBinary } from "@chestnut/storage-adapters";
import { fetchMarkdownImageBytes } from "./markdown-remote-images.js";
import { useAppStore, vaultService } from "./store.js";

function vaultRootPath(): string | null {
  const adapter = vaultService.getAdapter?.();
  if (!adapter || adapter.kind !== "tauri" || !("getRootPath" in adapter)) return null;
  return (adapter as { getRootPath(): string }).getRootPath().replace(/\\/g, "/").replace(/\/$/, "");
}

function markdownDestForSavedImage(notePath: string, savedPath: string, vaultRoot: string | null): string {
  const rel = vaultRoot ? absolutePathToVaultRelative(savedPath, vaultRoot) : null;
  const fileName = (rel ?? savedPath).split("/").pop() ?? suggestedImageFileNameFromRef(savedPath);
  return `${notePicMarkdownPrefix(notePath)}/${fileName}`;
}

async function copyBytesToNotePic(
  notePath: string,
  bytes: Uint8Array,
  suggestedName: string,
  vaultRoot: string | null,
): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy]);
  const saved = await vaultService.saveNoteImage(notePath, blob, suggestedName);
  return markdownDestForSavedImage(notePath, saved, vaultRoot);
}

/** Copy external local images (and optionally network images) into this note's `_pic` and rewrite links. */
export async function ingestExternalImagesForNote(
  notePath: string,
  content: string,
  keepNetworkImageLinks: boolean,
): Promise<string> {
  if (!isTauri()) return content;

  const vaultRoot = vaultRootPath();
  const targets = collectNoteImageIngestTargets(content, notePath, vaultRoot, keepNetworkImageLinks);
  if (targets.length === 0) return content;

  const replacements = new Map<string, string>();
  for (const target of targets) {
    try {
      if (target.kind === "external-local") {
        const bytes = await readExternalBinary(target.absPath);
        const dest = await copyBytesToNotePic(
          notePath,
          bytes,
          suggestedImageFileNameFromRef(target.absPath),
          vaultRoot,
        );
        replacements.set(target.ref, dest);
        replacements.set(target.absPath, dest);
      } else {
        const bytes = await fetchMarkdownImageBytes(target.url);
        const dest = await copyBytesToNotePic(
          notePath,
          bytes,
          suggestedImageFileNameFromRef(target.url),
          vaultRoot,
        );
        replacements.set(target.ref, dest);
        replacements.set(target.url, dest);
      }
    } catch {
      // Leave the original link; display/export still try the source path.
    }
  }

  if (replacements.size === 0) return content;
  useAppStore.getState().refreshTree();
  return applyMarkdownImageRefRewrites(content, replacements);
}

export async function persistNoteMarkdown(
  notePath: string,
  content: string,
  immediate: boolean,
  options?: { overwriteExternal?: boolean },
): Promise<{ content: string; persisted: boolean }> {
  const keepNetwork = useAppStore.getState().keepNetworkImageLinks;
  const next = await ingestExternalImagesForNote(notePath, content, keepNetwork);
  const persisted = await vaultService.write(notePath, next, immediate, options);
  return { content: next, persisted };
}
