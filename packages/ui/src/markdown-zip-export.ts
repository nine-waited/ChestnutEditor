import JSZip from "jszip";
import {
  fileBaseName,
  markdownExportDirPath,
  zipPathForMarkdown,
} from "@chestnut/core";
import { isTauri } from "@chestnut/storage-adapters";
import { useExportProgressStore } from "./export-progress.js";
import { materializeMarkdownExportBundle } from "./markdown-md-export.js";
import { vaultService } from "./store.js";

/**
 * Export Markdown as `target/<name>.zip`.
 *
 * Strategy: reuse the same folder export as “Export as Markdown”, then zip it.
 * - If `target/<name>/` already existed before this run → keep the folder after zipping
 *   (user may still want the unpacked bundle).
 * - If this run created the folder solely for ZIP → delete the folder after a successful zip
 *   (avoid littering target with a duplicate of the archive).
 * Cleanup uses the adapter delete (not vaultService.deletePath) so write-suppression
 * does not block a later “Export as Markdown” to the same path.
 */
export async function exportMarkdownZip(relativePath: string): Promise<string> {
  if (!isTauri()) throw new Error("ZIP export requires desktop app");

  const adapter = vaultService.getAdapter();
  if (!adapter) throw new Error("No vault mounted");

  const exportDir = markdownExportDirPath(relativePath);
  const zipPath = zipPathForMarkdown(relativePath);
  const leafName = fileBaseName(relativePath);
  const progress = useExportProgressStore.getState();
  const existedBefore = await adapter.exists(exportDir);

  progress.start({
    fileName: `${leafName}.zip`,
    titleKey: "exportZip.title",
    phasePrefix: "exportZip",
  });

  try {
    const { exportDir: writtenDir } = await materializeMarkdownExportBundle(
      relativePath,
      (pct, phase) => {
        // Reserve the top of the bar for zip packing.
        const scaled = Math.min(82, Math.round(pct * 0.82));
        progress.setProgress(scaled, phase);
      },
    );

    progress.setProgress(86, "generate");
    const entries = await vaultService.listTree(writtenDir);
    const zip = new JSZip();
    const folder = zip.folder(leafName);
    if (!folder) throw new Error("Failed to create zip folder");

    const files = entries.filter((entry) => entry.kind === "file");
    let packed = 0;
    for (const entry of files) {
      const bytes = await vaultService.readBinary(entry.path);
      const name = entry.path.split("/").pop() ?? entry.name;
      folder.file(name, bytes);
      packed += 1;
      const pct = 86 + Math.round((packed / Math.max(files.length, 1)) * 8);
      progress.setProgress(pct, "generate");
    }

    progress.setProgress(96, "save");
    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    await vaultService.writeBinary(zipPath, blob);

    if (!existedBefore) {
      // Staging-only folder: remove after successful zip. Avoid deletePath suppressWrites.
      await adapter.delete(writtenDir);
    }

    await progress.finishSuccess();
    return zipPath;
  } catch (err) {
    progress.fail();
    throw err;
  }
}
