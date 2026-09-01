import {
  absolutePathToVaultRelative,
  exportTargetDirPath,
  isInExportTargetFolder,
  isInNotePicFolder,
  isMarkdown,
  isNotePicFolder,
  notePicDirPath,
  normalizePath,
} from "@chestnut/core";
import { vaultService, workspaceStore, useAppStore, editorPaneLru } from "./store.js";
import { clearSourceEditorHistoryForPath, clearSourceEditorHistoryUnder } from "./source-editor-history-cache.js";
import { getDefaultTitle, getT } from "./i18n/index.js";
import { confirmAction } from "./confirm-dialog.js";
import {
  resolveNewItemParentDir,
  fileTreeSelection,
  type FileTreeSelectionEntry,
} from "./file-tree-selection.js";
import { fileTreeRename } from "./file-tree-rename.js";
import { fileTreeExpanded } from "./file-tree-expanded.js";
import { fileTreeClipboard } from "./file-tree-clipboard.js";
import { canDragFileTreeEntry, canDropFileTreeEntry } from "./file-tree-move.js";
import {
  isTauri,
  revealVaultEntry,
  writeClipboardFiles,
  readClipboardFiles,
  hasClipboardFiles,
  clipboardFilesAreCut,
  clearClipboardFiles,
  copyPathsIntoDir,
  movePathsIntoDir,
  TauriFsAdapter,
} from "@chestnut/storage-adapters";
import { exportMarkdownToPdf } from "./markdown-pdf-export.js";
import { exportMarkdownBundle } from "./markdown-md-export.js";
import { exportMarkdownZip } from "./markdown-zip-export.js";
import { revealFileInTree, revealFileInTreeWhenReady } from "./file-tree-expand-context.js";
import { writeSystemClipboardText } from "./system-clipboard.js";
import { formatNativePath } from "./vault-path-utils.js";

function refreshTree(): void {
  useAppStore.getState().refreshTree();
}

/** Drop keep-alive editor panes / parked undo so deletes cannot recreate files via autosave. */
function clearEditorKeepAliveForDelete(path: string, kind: "file" | "directory"): void {
  if (kind === "directory") {
    editorPaneLru.removeUnder(path);
    clearSourceEditorHistoryUnder(path);
  } else {
    editorPaneLru.remove(path);
    clearSourceEditorHistoryForPath(path);
  }
}

/** Drop nested paths when an ancestor folder is also selected. */
export function pruneNestedVaultEntries(entries: FileTreeSelectionEntry[]): FileTreeSelectionEntry[] {
  const sorted = [...entries].sort(
    (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
  );
  const kept: FileTreeSelectionEntry[] = [];
  for (const entry of sorted) {
    const underKept = kept.some(
      (parent) =>
        parent.kind === "directory" &&
        (entry.path === parent.path || entry.path.startsWith(`${parent.path}/`)),
    );
    if (!underKept) kept.push(entry);
  }
  return kept;
}

/** `_pic` folders cannot be deleted; files inside them remain deletable. */
export function filterDeletableVaultEntries(
  entries: FileTreeSelectionEntry[],
): FileTreeSelectionEntry[] {
  return entries.filter(
    (entry) => !(entry.kind === "directory" && isNotePicFolder(entry.path)),
  );
}

export function filterMovableVaultEntries(
  entries: FileTreeSelectionEntry[],
): FileTreeSelectionEntry[] {
  return entries.filter((entry) => canDragFileTreeEntry(entry.path, entry.kind));
}

function parentDirOf(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

export function applyVaultMoveSideEffects(
  oldPath: string,
  newPath: string,
  kind: "file" | "directory",
): void {
  if (oldPath === newPath) return;
  if (kind === "directory") {
    workspaceStore.renamePathPrefix(oldPath, newPath);
    fileTreeSelection.remapVaultPathPrefix(oldPath, newPath);
    fileTreeExpanded.remapVaultPathPrefix(oldPath, newPath);
    useAppStore.getState().remapPinnedFilePathPrefix(oldPath, newPath);
    useAppStore.getState().remapFileTreeChildOrderPrefix(oldPath, newPath);
  } else {
    workspaceStore.renamePath(oldPath, newPath);
    fileTreeSelection.remapVaultPath(oldPath, newPath);
    useAppStore.getState().remapPinnedFilePath(oldPath, newPath);
    useAppStore.getState().remapFileTreeChildOrderPath(oldPath, newPath);
  }
}

function entryLabel(path: string): string {
  return path.split("/").pop() ?? path;
}

function resolveCreateDir(dir?: string): string {
  return dir !== undefined ? dir : resolveNewItemParentDir();
}

function finishCreate(
  path: string,
  opts: { kind: "file" | "folder"; open?: () => void },
): void {
  refreshTree();
  if (opts.kind === "file") {
    fileTreeSelection.setSelectedFilePath(path);
  } else {
    fileTreeSelection.setSelectedFolderPath(path);
  }
  revealFileInTree(path);
  fileTreeRename.requestRename(path);
  opts.open?.();
  void revealFileInTreeWhenReady(path);
}

export async function createAndOpenNote(dir?: string): Promise<string> {
  const locale = useAppStore.getState().locale;
  const path = await vaultService.createNote(resolveCreateDir(dir), getDefaultTitle(locale, "note"));
  finishCreate(path, { kind: "file", open: () => workspaceStore.openFile(path) });
  return path;
}

export async function createAndOpenDrawing(dir?: string): Promise<string> {
  const locale = useAppStore.getState().locale;
  const path = await vaultService.createExcalidraw(resolveCreateDir(dir), getDefaultTitle(locale, "drawing"));
  finishCreate(path, { kind: "file", open: () => workspaceStore.openExcalidraw(path) });
  return path;
}

export async function createFolder(dir?: string): Promise<string> {
  const locale = useAppStore.getState().locale;
  const path = await vaultService.createFolder(resolveCreateDir(dir), getDefaultTitle(locale, "folder"));
  finishCreate(path, { kind: "folder" });
  return path;
}

export async function deleteVaultPath(path: string, kind: "file" | "directory"): Promise<void> {
  const picDir = kind === "file" ? await vaultService.notePicDirIfExists(path) : null;
  clearEditorKeepAliveForDelete(path, kind);
  if (picDir) clearEditorKeepAliveForDelete(picDir, "directory");
  await vaultService.deletePath(path, kind);
  workspaceStore.clearPathsForDelete(path, kind === "directory");
  useAppStore.getState().removePinnedFilePathsUnder(path, kind === "directory");
  useAppStore.getState().removeFileTreeChildOrderUnder(path, kind === "directory");
  if (picDir) {
    workspaceStore.clearPathsForDelete(picDir, true);
  }
  refreshTree();
}

async function deleteVaultEntryWithoutRefresh(
  path: string,
  kind: "file" | "directory",
): Promise<void> {
  const picDir = kind === "file" ? await vaultService.notePicDirIfExists(path) : null;
  clearEditorKeepAliveForDelete(path, kind);
  if (picDir) clearEditorKeepAliveForDelete(picDir, "directory");
  await vaultService.deletePath(path, kind);
  workspaceStore.clearPathsForDelete(path, kind === "directory");
  useAppStore.getState().removePinnedFilePathsUnder(path, kind === "directory");
  useAppStore.getState().removeFileTreeChildOrderUnder(path, kind === "directory");
  if (picDir) {
    workspaceStore.clearPathsForDelete(picDir, true);
  }
}

export async function confirmAndDeleteVaultPath(
  path: string,
  kind: "file" | "directory",
  label: string,
): Promise<boolean> {
  return confirmAndDeleteVaultEntries([{ path, kind }], label);
}

export async function confirmAndDeleteVaultEntries(
  entries: FileTreeSelectionEntry[],
  singleLabel?: string,
): Promise<boolean> {
  const t = getT();
  const pruned = pruneNestedVaultEntries(filterDeletableVaultEntries(entries));
  if (pruned.length === 0) return false;

  if (pruned.length === 1) {
    const entry = pruned[0];
    const label = singleLabel ?? entryLabel(entry.path);
    const picDir = entry.kind === "file" ? await vaultService.notePicDirIfExists(entry.path) : null;
    const picFolder = picDir?.split("/").pop() ?? "";
    const confirmed = await confirmAction({
      title: entry.kind === "directory" ? t("fileTree.deleteFolder") : t("fileTree.delete"),
      message: picDir
        ? t("fileTree.deleteNoteConfirm", { name: label, picFolder })
        : t("fileTree.deleteConfirm", { name: label }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!confirmed) return false;
    await deleteVaultPath(entry.path, entry.kind);
    fileTreeSelection.clear();
    return true;
  }

  const fileCount = pruned.filter((entry) => entry.kind === "file").length;
  const folderCount = pruned.filter((entry) => entry.kind === "directory").length;
  let title: string;
  let message: string;
  if (fileCount > 0 && folderCount > 0) {
    title = t("fileTree.deleteItems");
    message = t("fileTree.deleteMixedConfirm", { fileCount, folderCount });
  } else if (folderCount > 0) {
    title = t("fileTree.deleteFolders");
    message = t("fileTree.deleteFoldersConfirm", { count: folderCount });
  } else {
    title = t("fileTree.deleteFiles");
    message = t("fileTree.deleteFilesConfirm", { count: fileCount });
  }

  const confirmed = await confirmAction({
    title,
    message,
    confirmLabel: t("common.delete"),
    cancelLabel: t("common.cancel"),
    danger: true,
  });
  if (!confirmed) return false;

  const ordered = [...pruned].sort(
    (a, b) => b.path.length - a.path.length || b.path.localeCompare(a.path),
  );
  for (const entry of ordered) {
    await deleteVaultEntryWithoutRefresh(entry.path, entry.kind);
  }
  fileTreeSelection.clear();
  refreshTree();
  return true;
}

/** Absolute native path when on desktop; otherwise the vault-relative path. */
export function resolveVaultEntryClipboardPath(relativePath: string): string {
  const adapter = vaultService.getAdapter();
  if (adapter?.kind === "tauri" && "getAbsolutePath" in adapter) {
    return formatNativePath((adapter as TauriFsAdapter).getAbsolutePath(relativePath));
  }
  return relativePath.replace(/\\/g, "/");
}

export async function copyVaultEntryPath(relativePath: string): Promise<boolean> {
  const t = getT();
  const text = resolveVaultEntryClipboardPath(relativePath);
  const ok = await writeSystemClipboardText(text);
  useAppStore.getState().setStatusText(ok ? t("status.vaultPathCopied") : t("status.copyFailed"));
  return ok;
}

/** Copy the file itself onto the OS clipboard (Explorer paste). Desktop only. */
export async function copyVaultEntryFile(relativePath: string): Promise<boolean> {
  return copyVaultEntryFiles([relativePath]);
}

/** Copy one or more vault files onto the OS clipboard (Explorer paste). Desktop only. */
export async function copyVaultEntryFiles(relativePaths: string[]): Promise<boolean> {
  return copyVaultEntries(relativePaths.map((path) => ({ path, kind: "file" as const })));
}

/** Copy files and/or folders onto the OS clipboard (Explorer paste). Desktop only. */
export async function copyVaultEntries(entries: FileTreeSelectionEntry[]): Promise<boolean> {
  const t = getT();
  const pruned = pruneNestedVaultEntries(entries);
  if (pruned.length === 0) {
    useAppStore.getState().setStatusText(t("status.copyFailed"));
    return false;
  }
  if (!isTauri()) {
    useAppStore.getState().setStatusText(t("status.copyFileDesktopOnly"));
    return false;
  }
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri" || !("getAbsolutePath" in adapter)) {
    useAppStore.getState().setStatusText(t("status.copyFailed"));
    return false;
  }
  try {
    const absolutes = pruned.map((entry) =>
      formatNativePath((adapter as TauriFsAdapter).getAbsolutePath(entry.path)),
    );
    await writeClipboardFiles(absolutes);
    fileTreeClipboard.clearCut();
    useAppStore.getState().setStatusText(t("status.fileCopied"));
    return true;
  } catch (err) {
    console.error("[Chestnut] copy file failed:", err);
    useAppStore.getState().setStatusText(t("status.copyFailed"));
    return false;
  }
}

/** Cut files and/or folders onto the OS clipboard (Explorer paste moves). Desktop only. */
export async function cutVaultEntries(entries: FileTreeSelectionEntry[]): Promise<boolean> {
  const t = getT();
  const pruned = pruneNestedVaultEntries(filterMovableVaultEntries(entries));
  if (pruned.length === 0) {
    useAppStore.getState().setStatusText(t("status.cutNotAllowed"));
    return false;
  }
  if (!isTauri()) {
    useAppStore.getState().setStatusText(t("status.cutFileDesktopOnly"));
    return false;
  }
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri" || !("getAbsolutePath" in adapter)) {
    useAppStore.getState().setStatusText(t("status.cutFailed"));
    return false;
  }
  try {
    const absolutes = pruned.map((entry) =>
      formatNativePath((adapter as TauriFsAdapter).getAbsolutePath(entry.path)),
    );
    await writeClipboardFiles(absolutes, { cut: true });
    fileTreeClipboard.setCut(pruned.map((entry) => entry.path));
    useAppStore.getState().setStatusText(t("status.fileCut"));
    return true;
  } catch (err) {
    console.error("[Chestnut] cut file failed:", err);
    useAppStore.getState().setStatusText(t("status.cutFailed"));
    return false;
  }
}

/** Target folder for Ctrl+V paste: sole selected folder, else new-item parent dir. */
export function resolvePasteTargetDir(): string {
  const selected = fileTreeSelection.getSelectedEntries();
  const folders = selected.filter((entry) => entry.kind === "directory");
  if (folders.length === 1) return folders[0].path;
  return resolveNewItemParentDir();
}

export async function clipboardHasFilesToPaste(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await hasClipboardFiles();
  } catch {
    return false;
  }
}

/** Paste OS clipboard files/folders into a vault-relative directory. Desktop only. */
export async function pasteClipboardFilesIntoVaultDir(targetDir: string): Promise<boolean> {
  const t = getT();
  const destRel = normalizePath(targetDir);
  if (isInNotePicFolder(destRel) || isInExportTargetFolder(destRel) || isNotePicFolder(destRel)) {
    useAppStore.getState().setStatusText(t("status.pasteNotAllowedHere"));
    return false;
  }
  if (!isTauri()) {
    useAppStore.getState().setStatusText(t("status.pasteDesktopOnly"));
    return false;
  }
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri" || !("getAbsolutePath" in adapter)) {
    useAppStore.getState().setStatusText(t("status.pasteFailed"));
    return false;
  }
  try {
    const sources = await readClipboardFiles();
    if (sources.length === 0) {
      useAppStore.getState().setStatusText(t("status.pasteEmpty"));
      return false;
    }
    const cut = await clipboardFilesAreCut();
    const root = (adapter as TauriFsAdapter).getRootPath();
    const destAbs = formatNativePath((adapter as TauriFsAdapter).getAbsolutePath(destRel));
    const createdRel: string[] = [];

    // Markdown notes bring their `_pic` folders; skip those companions if also on the clipboard.
    const skipPicDirs = new Set<string>();
    for (const sourceAbs of sources) {
      const sourceRel = absolutePathToVaultRelative(sourceAbs, root);
      if (sourceRel && isMarkdown(sourceRel)) {
        skipPicDirs.add(normalizePath(notePicDirPath(sourceRel)));
      }
    }

    for (const sourceAbs of sources) {
      const sourceRel = absolutePathToVaultRelative(sourceAbs, root);
      if (sourceRel && skipPicDirs.has(normalizePath(sourceRel))) continue;

      if (sourceRel && (await adapter.exists(sourceRel))) {
        const kind = await vaultPathKind(sourceRel);
        if (cut) {
          if (!canDropFileTreeEntry(sourceRel, kind, destRel)) {
            if (parentDirOf(sourceRel) === destRel) createdRel.push(sourceRel);
            continue;
          }
          const newPath = await vaultService.moveEntry(sourceRel, kind, destRel);
          applyVaultMoveSideEffects(sourceRel, newPath, kind);
          createdRel.push(newPath);
        } else if (kind === "directory") {
          createdRel.push(await vaultService.copyFolderIntoDir(sourceRel, destRel));
        } else {
          createdRel.push(await vaultService.copyFileIntoDir(sourceRel, destRel));
        }
        continue;
      }

      // Outside the vault: plain filesystem copy/move (no note/_pic binding).
      const createdAbs = cut
        ? await movePathsIntoDir([sourceAbs], destAbs)
        : await copyPathsIntoDir([sourceAbs], destAbs);
      for (const abs of createdAbs) {
        const rel = absolutePathToVaultRelative(abs, root);
        if (rel) createdRel.push(rel);
      }
    }

    if (cut) {
      try {
        await clearClipboardFiles();
      } catch {
        /* ignore */
      }
      fileTreeClipboard.clearCut();
    }

    refreshTree();
    try {
      await vaultService.reindex();
    } catch (err) {
      console.warn("[Chestnut] reindex after paste failed:", err);
    }

    if (createdRel[0]) {
      revealFileInTree(createdRel[0]);
      void revealFileInTreeWhenReady(createdRel[0]);
    }
    useAppStore.getState().setStatusText(
      t("status.pasteSuccess", { count: String(Math.max(createdRel.length, 1)) }),
    );
    return createdRel.length > 0;
  } catch (err) {
    console.error("[Chestnut] paste files failed:", err);
    useAppStore.getState().setStatusText(t("status.pasteFailed"));
    return false;
  }
}

async function vaultPathKind(path: string): Promise<"file" | "directory"> {
  const adapter = vaultService.getAdapter();
  if (!adapter) return "file";
  try {
    await adapter.list(path);
    return "directory";
  } catch {
    return "file";
  }
}

export async function revealInFileManager(relativePath?: string): Promise<void> {
  if (!isTauri()) return;
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri") return;
  try {
    await revealVaultEntry(
      (adapter as TauriFsAdapter).getRootPath(),
      relativePath ?? null,
    );
  } catch (err) {
    console.error("[Chestnut] reveal in file manager failed:", err);
    useAppStore.getState().setStatusText(getT()("status.revealInFileManagerFailed"));
  }
}

async function waitForVaultTreeEntry(relativePath: string): Promise<void> {
  const parentDir = relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/"))
    : "";

  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await vaultService.listTree(parentDir);
    if (list.some((entry) => entry.path === relativePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function revealExportedPdfInFileManager(pdfPath: string): Promise<void> {
  try {
    await revealInFileManager(pdfPath);
  } catch (err) {
    console.error("[Chestnut] reveal exported pdf failed, opening target folder:", err);
    await revealInFileManager(exportTargetDirPath());
  }
}

export async function exportNoteToPdf(relativePath: string): Promise<void> {
  if (!isTauri()) return;
  const pdfPath = await exportMarkdownToPdf(relativePath);
  workspaceStore.openPdf(pdfPath);
  useAppStore.getState().refreshTree();
  await waitForVaultTreeEntry(pdfPath);
  await revealFileInTreeWhenReady(pdfPath);
  try {
    await revealExportedPdfInFileManager(pdfPath);
  } catch (err) {
    console.error("[Chestnut] reveal exported pdf in file manager failed:", err);
  }
  useAppStore.getState().setStatusText(getT()("status.exportPdfSuccess", { path: pdfPath }));
}

export async function exportNoteToMarkdown(relativePath: string): Promise<void> {
  if (!isTauri()) return;
  const mdPath = await exportMarkdownBundle(relativePath);
  useAppStore.getState().refreshTree();
  await waitForVaultTreeEntry(mdPath);
  fileTreeSelection.setSelectedFilePath(mdPath);
  await revealFileInTreeWhenReady(mdPath);
  try {
    await revealInFileManager(mdPath);
  } catch (err) {
    console.error("[Chestnut] reveal exported markdown in file manager failed:", err);
  }
  useAppStore.getState().setStatusText(getT()("status.exportMarkdownSuccess", { path: mdPath }));
}

export async function exportNoteToZip(relativePath: string): Promise<void> {
  if (!isTauri()) return;
  const zipPath = await exportMarkdownZip(relativePath);
  useAppStore.getState().refreshTree();
  await waitForVaultTreeEntry(zipPath);
  fileTreeSelection.setSelectedFilePath(zipPath);
  await revealFileInTreeWhenReady(zipPath);
  try {
    await revealInFileManager(zipPath);
  } catch (err) {
    console.error("[Chestnut] reveal exported zip in file manager failed:", err);
  }
  useAppStore.getState().setStatusText(getT()("status.exportZipSuccess", { path: zipPath }));
}
