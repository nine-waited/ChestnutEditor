import {
  extractMarkdownImageRefs,
  fileBaseName,
  isMarkdown,
  isZip,
  joinPath,
  notePicDirPath,
  rewriteBundleImagesForNote,
  resolveImportableImageRef,
  selectBundleMarkdownFile,
  notePicMarkdownPrefix,
} from "@chestnut/core";
import {
  externalPathExists,
  isTauri,
  listDirectory,
  pickFolder,
  pickMarkdownFiles,
  readExternalBinary,
  readExternalText,
} from "@chestnut/storage-adapters";
import { resolveNewItemParentDir, fileTreeSelection } from "./file-tree-selection.js";
import { revealFileInTreeWhenReady } from "./file-tree-expand-context.js";
import { getT } from "./i18n/index.js";
import { fetchMarkdownImageBytes } from "./markdown-remote-images.js";
import { useAppStore, vaultService, workspaceStore } from "./store.js";
import { useExportProgressStore, type ExportPhase } from "./export-progress.js";
import { importMarkdownNotesFromZipPath } from "./markdown-zip-import.js";

function joinAbsPath(dir: string, fileName: string): string {
  const trimmed = dir.replace(/[/\\]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${fileName.replace(/[/\\]/g, sep)}`;
}

function absParentDir(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash >= 0 ? trimmed.slice(0, slash) : trimmed;
}

function absFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function folderBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function uniqueDestImageName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (used.has(`${stem}-${index}${ext}`)) index += 1;
  const next = `${stem}-${index}${ext}`;
  used.add(next);
  return next;
}

async function copyImportableImages(
  content: string,
  sourceDir: string,
  notePath: string,
): Promise<string> {
  const picDir = notePicDirPath(notePath);
  const picPrefix = notePicMarkdownPrefix(notePath);
  const fileNameMap = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const ref of extractMarkdownImageRefs(content)) {
    if (fileNameMap.has(ref)) continue;

    const importable = resolveImportableImageRef(ref);
    if (!importable) continue;

    if (importable.kind === "remote") {
      const destName = uniqueDestImageName(importable.suggestedFileName, usedNames);
      fileNameMap.set(ref, destName);
      const bytes = await fetchMarkdownImageBytes(importable.url);
      await vaultService.writeBinary(joinPath(picDir, destName), bytes);
      continue;
    }

    const sourceAbs =
      importable.kind === "local-abs" ? importable.absPath : joinAbsPath(sourceDir, importable.relativePath);
    if (!(await externalPathExists(sourceAbs))) continue;

    const destName = uniqueDestImageName(importable.fileName, usedNames);
    fileNameMap.set(ref, destName);
    const bytes = await readExternalBinary(sourceAbs);
    await vaultService.writeBinary(joinPath(picDir, destName), bytes);
  }

  return rewriteBundleImagesForNote(content, picPrefix, fileNameMap);
}

function openImportedNote(notePath: string, count: number): void {
  useAppStore.getState().refreshTree();
  fileTreeSelection.setSelectedFilePath(notePath);
  void revealFileInTreeWhenReady(notePath);
  workspaceStore.openFile(notePath);
  const t = getT();
  useAppStore.getState().setStatusText(
    count > 1
      ? t("status.importMarkdownSuccessMultiple", { count })
      : t("status.importMarkdownSuccess", { path: notePath }),
  );
}

function importProgressLabel(paths: string[]): string {
  const names = paths.map((path) => path.replace(/\\/g, "/").split("/").pop() ?? path);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function importDroppedSourcesWithProgress(
  mdAbsPaths: string[],
  zipAbsPaths: string[],
  destDir: string,
): Promise<string[]> {
  const all = [...zipAbsPaths, ...mdAbsPaths];
  if (all.length === 0) return [];

  const progress = useExportProgressStore.getState();
  progress.start({
    fileName: importProgressLabel(all),
    titleKey: "importFiles.title",
    phasePrefix: "importFiles",
  });

  try {
    const notes: string[] = [];
    const total = all.length;
    let done = 0;
    const setSlice = (phase: ExportPhase, fraction: number) => {
      const pct = Math.round(((done + fraction) / total) * 92);
      progress.setProgress(Math.min(92, Math.max(4, pct)), phase);
    };

    progress.setProgress(4, "prepare");
    await yieldToUi();

    for (const zipAbsPath of zipAbsPaths) {
      setSlice("render", 0);
      const imported = await importMarkdownNotesFromZipPath(zipAbsPath, destDir, (i, n) => {
        setSlice("images", n > 0 ? i / n : 1);
      });
      notes.push(...imported);
      done += 1;
      setSlice("save", 0);
      await yieldToUi();
    }

    for (const mdAbsPath of mdAbsPaths) {
      setSlice("generate", 0);
      notes.push(await importMarkdownBundleFromMdPath(mdAbsPath, destDir));
      done += 1;
      await yieldToUi();
    }

    progress.setProgress(96, "save");
    await progress.finishSuccess();
    return notes;
  } catch (err) {
    progress.fail();
    throw err;
  }
}

/** Import a markdown file from disk, copying local/remote images into `{title}_pic`. */
export async function importMarkdownBundleFromMdPath(
  mdAbsPath: string,
  destDir = resolveNewItemParentDir(),
): Promise<string> {
  if (!isTauri()) throw new Error("Markdown import requires desktop app");

  const content = await readExternalText(mdAbsPath);
  const title = fileBaseName(absFileName(mdAbsPath));
  const notePath = await vaultService.createNote(destDir, title);
  const rewritten = await copyImportableImages(content, absParentDir(mdAbsPath), notePath);
  await vaultService.write(notePath, rewritten, true);
  return notePath;
}

export async function importMarkdownBundleFromFolder(
  destDir = resolveNewItemParentDir(),
): Promise<string> {
  if (!isTauri()) throw new Error("Markdown import requires desktop app");

  const folderPath = await pickFolder();
  const entries = await listDirectory(folderPath);
  const mdNames = entries
    .filter((entry) => entry.kind === "file" && /\.md$/i.test(entry.name))
    .map((entry) => entry.name);
  const mdName = selectBundleMarkdownFile(mdNames, folderBaseName(folderPath));
  if (!mdName) {
    throw new Error("No markdown file found in the selected folder");
  }

  return importMarkdownBundleFromMdPath(joinAbsPath(folderPath, mdName), destDir);
}

export async function importAndOpenMarkdownBundle(): Promise<void> {
  const notePath = await importMarkdownBundleFromFolder();
  openImportedNote(notePath, 1);
}

export async function importAndOpenDroppedMarkdownFiles(
  mdAbsPaths: string[],
  destDir = resolveNewItemParentDir(),
): Promise<void> {
  await importAndOpenDroppedSources(mdAbsPaths, [], destDir);
}

export async function importAndOpenDroppedSources(
  mdAbsPaths: string[],
  zipAbsPaths: string[],
  destDir = resolveNewItemParentDir(),
): Promise<void> {
  const notes = await importDroppedSourcesWithProgress(mdAbsPaths, zipAbsPaths, destDir);
  if (notes.length === 0) return;
  openImportedNote(notes[notes.length - 1]!, notes.length);
}

export async function importAndOpenPickedMarkdownFiles(
  destDir = resolveNewItemParentDir(),
): Promise<void> {
  const paths = await pickMarkdownFiles();
  const markdown = paths.filter((path) => isMarkdown(path));
  const zip = paths.filter((path) => isZip(path));
  try {
    await importAndOpenDroppedSources(markdown, zip, destDir);
  } catch (err) {
    console.error("[Chestnut] import picked files failed:", err);
    const failedZip = zip.length > 0 && markdown.length === 0;
    useAppStore.getState().setStatusText(
      getT()(failedZip ? "status.importZipFailed" : "status.importMarkdownFailed"),
    );
  }
}
