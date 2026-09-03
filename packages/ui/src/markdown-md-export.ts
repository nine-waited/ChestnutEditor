import {
  fileBaseName,
  formatMarkdownImageRef,
  joinPath,
  markdownExportDirPath,
  markdownExportFilePath,
  resolveMarkdownImageExportSource,
  relativizeNoteImageRefs,
  transformMarkdownImageRefs,
} from "@chestnut/core";
import { isTauri, readExternalBinary } from "@chestnut/storage-adapters";
import { useExportProgressStore, type ExportPhase } from "./export-progress.js";
import { fetchMarkdownImageBytes } from "./markdown-remote-images.js";
import { ingestExternalImagesForNote } from "./note-image-ingest.js";
import { emitNoteReload, flushNoteWriters } from "./note-reload-registry.js";
import { useAppStore, vaultService } from "./store.js";

function vaultRootPath(): string | null {
  const adapter = vaultService.getAdapter?.();
  if (!adapter || adapter.kind !== "tauri" || !("getRootPath" in adapter)) return null;
  return (adapter as { getRootPath(): string }).getRootPath().replace(/\\/g, "/").replace(/\/$/, "");
}

function uniqueExportFileName(name: string, used: Set<string>): string {
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

function parseMarkdownImageParts(full: string): { alt: string; title?: string } {
  const altMatch = full.match(/^!\[([^\]]*)\]/);
  const titleMatch = full.match(/\)\s*"([^"]*)"\s*\)$/);
  return {
    alt: altMatch?.[1] ?? "",
    title: titleMatch?.[1],
  };
}

export type MaterializeMarkdownExportResult = {
  exportDir: string;
  exportMdPath: string;
};

/**
 * Write the Markdown export folder under `target/` (md + images).
 * Progress callbacks are optional so ZIP export can own the progress UI.
 */
export async function materializeMarkdownExportBundle(
  relativePath: string,
  onProgress?: (progress: number, phase: ExportPhase) => void,
): Promise<MaterializeMarkdownExportResult> {
  if (!isTauri()) throw new Error("Markdown export requires desktop app");

  const exportMdPath = markdownExportFilePath(relativePath);
  const exportDir = markdownExportDirPath(relativePath);

  onProgress?.(8, "prepare");
  await vaultService.ensureExportTargetDir();
  await flushNoteWriters(relativePath);
  const keepNetwork = useAppStore.getState().keepNetworkImageLinks;
  let content = await vaultService.read(relativePath);
  const vaultRoot = vaultRootPath();
  const ingested = relativizeNoteImageRefs(
    await ingestExternalImagesForNote(relativePath, content, keepNetwork),
    relativePath,
    vaultRoot,
  );
  if (ingested !== content) {
    await vaultService.write(relativePath, ingested, true);
    content = ingested;
    emitNoteReload(relativePath);
  }
  onProgress?.(18, "prepare");

  onProgress?.(28, "render");
  const vaultPathToFileName = new Map<string, string>();
  const remoteRefToFileName = new Map<string, string>();
  const externalPathToFileName = new Map<string, string>();
  const remoteDownloads: Array<{ ref: string; fileName: string }> = [];
  const usedNames = new Set<string>();

  const rewritten = transformMarkdownImageRefs(content, (ref, full) => {
    const source = resolveMarkdownImageExportSource(ref, relativePath, vaultRoot);
    if (!source) return undefined;

    let fileName: string;
    if (source.kind === "vault") {
      fileName = vaultPathToFileName.get(source.vaultPath) ?? "";
      if (!fileName) {
        const base = source.vaultPath.split("/").pop() ?? "image.png";
        fileName = uniqueExportFileName(base, usedNames);
        vaultPathToFileName.set(source.vaultPath, fileName);
      }
    } else if (source.kind === "external") {
      fileName = externalPathToFileName.get(source.absPath) ?? "";
      if (!fileName) {
        fileName = uniqueExportFileName(source.suggestedFileName, usedNames);
        externalPathToFileName.set(source.absPath, fileName);
      }
    } else {
      fileName = remoteRefToFileName.get(source.url) ?? "";
      if (!fileName) {
        fileName = uniqueExportFileName(source.suggestedFileName, usedNames);
        remoteRefToFileName.set(source.url, fileName);
        remoteDownloads.push({ ref: source.url, fileName });
      }
    }

    const { alt, title: imageTitle } = parseMarkdownImageParts(full);
    return formatMarkdownImageRef(alt, fileName, imageTitle);
  });

  onProgress?.(42, "images");
  const vaultEntries = [...vaultPathToFileName.entries()];
  const externalEntries = [...externalPathToFileName.entries()];
  const totalImages = vaultEntries.length + externalEntries.length + remoteDownloads.length;
  let processed = 0;

  for (const [vaultPath, fileName] of vaultEntries) {
    const destPath = joinPath(exportDir, fileName);
    const bytes = await vaultService.readBinary(vaultPath);
    await vaultService.writeBinary(destPath, bytes);
    processed += 1;
    const pct = 42 + Math.round((processed / Math.max(totalImages, 1)) * 38);
    onProgress?.(pct, "images");
  }

  for (const [absPath, fileName] of externalEntries) {
    const destPath = joinPath(exportDir, fileName);
    const bytes = await readExternalBinary(absPath);
    await vaultService.writeBinary(destPath, bytes);
    processed += 1;
    const pct = 42 + Math.round((processed / Math.max(totalImages, 1)) * 38);
    onProgress?.(pct, "images");
  }

  for (const { ref, fileName } of remoteDownloads) {
    const destPath = joinPath(exportDir, fileName);
    const bytes = await fetchMarkdownImageBytes(ref);
    await vaultService.writeBinary(destPath, bytes);
    processed += 1;
    const pct = 42 + Math.round((processed / Math.max(totalImages, 1)) * 38);
    onProgress?.(pct, "images");
  }

  onProgress?.(88, "save");
  await vaultService.write(exportMdPath, rewritten, true);

  return { exportDir, exportMdPath };
}

export async function exportMarkdownBundle(relativePath: string): Promise<string> {
  const title = fileBaseName(relativePath);
  const progress = useExportProgressStore.getState();

  progress.start({
    fileName: `${title}.md`,
    titleKey: "exportMarkdown.title",
    phasePrefix: "exportMarkdown",
  });

  try {
    const { exportMdPath } = await materializeMarkdownExportBundle(relativePath, (pct, phase) => {
      progress.setProgress(pct, phase);
    });
    await progress.finishSuccess();
    return exportMdPath;
  } catch (err) {
    progress.fail();
    throw err;
  }
}
