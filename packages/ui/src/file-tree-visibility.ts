import { isHiddenPath, isMarkdown, isNotePicFolder, isPdf, isZip } from "@chestnut/core";
import type { VaultEntry } from "@chestnut/core";

/** Files the sidebar tree lists: notes, PDFs, and ZIP exports. */
export function isFileTreeListedFile(path: string): boolean {
  return isMarkdown(path) || isPdf(path) || isZip(path);
}

export function isFileTreeEntryVisible(entry: VaultEntry, showNotePicFolders: boolean): boolean {
  if (isHiddenPath(entry.path)) return false;
  if (entry.kind === "directory") {
    if (!showNotePicFolders && isNotePicFolder(entry.path)) return false;
    return true;
  }
  return isFileTreeListedFile(entry.path);
}
