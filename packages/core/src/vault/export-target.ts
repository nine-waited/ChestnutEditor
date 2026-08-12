import { compareNamesWithNumericSuffix, stripFileExtension } from "./name-sort.js";
import { isMarkdown, joinPath, normalizePath } from "./types.js";
import type { VaultEntry } from "./types.js";

export const EXPORT_TARGET_DIR = "target";

export function exportTargetDirPath(): string {
  return EXPORT_TARGET_DIR;
}

export function isExportTargetFolder(pathOrName: string): boolean {
  return normalizePath(pathOrName) === EXPORT_TARGET_DIR;
}

/** True when `path` is the export `target` folder or nested inside it. */
export function isInExportTargetFolder(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  return normalized === EXPORT_TARGET_DIR || normalized.startsWith(`${EXPORT_TARGET_DIR}/`);
}

/** Vault-relative PDF path under `target/`, using leaf filename only, e.g. `notes/foo.md` → `target/foo.pdf`. */
export function pdfPathForMarkdown(mdPath: string): string {
  const normalized = normalizePath(mdPath);
  const leaf = normalized.split("/").pop() ?? normalized;
  const pdfName = isMarkdown(leaf)
    ? leaf.replace(/\.md$/i, ".pdf")
    : `${leaf.replace(/\.[^./\\]+$/, "")}.pdf`;
  return joinPath(EXPORT_TARGET_DIR, pdfName);
}

function markdownExportLeafName(mdPath: string): string {
  const normalized = normalizePath(mdPath);
  const leaf = normalized.split("/").pop() ?? normalized;
  return isMarkdown(leaf) ? leaf.replace(/\.md$/i, "") : leaf.replace(/\.[^./\\]+$/, "");
}

/** Vault-relative export folder under `target/`, e.g. `notes/foo.md` → `target/foo`. */
export function markdownExportDirPath(mdPath: string): string {
  return joinPath(EXPORT_TARGET_DIR, markdownExportLeafName(mdPath));
}

/** Vault-relative exported markdown path, e.g. `notes/foo.md` → `target/foo/foo.md`. */
export function markdownExportFilePath(mdPath: string): string {
  const leafName = markdownExportLeafName(mdPath);
  return joinPath(markdownExportDirPath(mdPath), `${leafName}.md`);
}

/** Vault-relative zip path under `target/`, e.g. `notes/foo.md` → `target/foo.zip`. */
export function zipPathForMarkdown(mdPath: string): string {
  return joinPath(EXPORT_TARGET_DIR, `${markdownExportLeafName(mdPath)}.zip`);
}

function compareFileTreeEntries(a: VaultEntry, b: VaultEntry): number {
  if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
  const nameA = a.kind === "file" ? stripFileExtension(a.name) : a.name;
  const nameB = b.kind === "file" ? stripFileExtension(b.name) : b.name;
  return compareNamesWithNumericSuffix(nameA, nameB);
}

/** Keep the export `target` folder last at vault root so it stays out of the way. */
export function sortFileTreeEntries(entries: VaultEntry[], parentDir = ""): VaultEntry[] {
  if (normalizePath(parentDir) !== "") {
    return [...entries].sort(compareFileTreeEntries);
  }

  const targetEntry = entries.find(
    (entry) => entry.kind === "directory" && isExportTargetFolder(entry.path),
  );
  const rest = targetEntry ? entries.filter((entry) => entry !== targetEntry) : entries;
  const sorted = [...rest].sort(compareFileTreeEntries);
  return targetEntry ? [...sorted, targetEntry] : sorted;
}
