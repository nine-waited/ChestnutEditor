import {
  extractMarkdownImageRefs,
  fileBaseName,
  joinPath,
  notePicDirPath,
  rewriteBundleImagesForNote,
  resolveImportableImageRef,
  notePicMarkdownPrefix,
} from "@chestnut/core";
import JSZip from "jszip";
import { isTauri, readExternalBinary } from "@chestnut/storage-adapters";
import { fetchMarkdownImageBytes } from "./markdown-remote-images.js";
import { vaultService } from "./store.js";

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

export function normalizeZipEntryPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function isSafeZipEntryPath(path: string): boolean {
  const parts = normalizeZipEntryPath(path).split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === "__MACOSX")) return false;
  const name = parts[parts.length - 1] ?? "";
  return Boolean(name) && !name.startsWith("._");
}

export function zipEntryParentDir(path: string): string {
  const normalized = normalizeZipEntryPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

export function zipJoin(dir: string, rel: string): string {
  const parent = normalizeZipEntryPath(dir);
  const child = normalizeZipEntryPath(rel);
  if (!parent) return child;
  if (!child) return parent;
  return `${parent}/${child}`;
}

export function listZipMarkdownPaths(entryNames: readonly string[]): string[] {
  return entryNames.filter((name) => isSafeZipEntryPath(name) && /\.md$/i.test(normalizeZipEntryPath(name)));
}

export function lookupZipFile(files: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array | undefined {
  const norm = normalizeZipEntryPath(path);
  const direct = files.get(norm);
  if (direct) return direct;
  const lower = norm.toLowerCase();
  for (const [key, value] of files) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

async function copyImportableImagesFromZip(
  content: string,
  mdParent: string,
  notePath: string,
  files: ReadonlyMap<string, Uint8Array>,
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

    if (importable.kind !== "local") continue;
    const bytes = lookupZipFile(files, zipJoin(mdParent, importable.relativePath));
    if (!bytes) continue;
    const destName = uniqueDestImageName(importable.fileName, usedNames);
    fileNameMap.set(ref, destName);
    await vaultService.writeBinary(joinPath(picDir, destName), bytes);
  }

  return rewriteBundleImagesForNote(content, picPrefix, fileNameMap);
}

export async function loadZipEntryBytes(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes);
  const files = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !isSafeZipEntryPath(name)) continue;
    files.set(normalizeZipEntryPath(name), await entry.async("uint8array"));
  }
  return files;
}

/** Unzip an exported Chestnut ZIP and import each markdown note into `destDir`. */
export async function importMarkdownNotesFromZipBytes(
  bytes: Uint8Array,
  destDir: string,
  onNote?: (imported: number, total: number) => void,
): Promise<string[]> {
  const files = await loadZipEntryBytes(bytes);
  const mdPaths = listZipMarkdownPaths([...files.keys()]);
  if (mdPaths.length === 0) throw new Error("No markdown file found in zip");

  const imported: string[] = [];
  for (const [index, mdPath] of mdPaths.entries()) {
    const raw = lookupZipFile(files, mdPath);
    if (!raw) continue;
    const content = new TextDecoder("utf-8").decode(raw);
    const title = fileBaseName(mdPath.split("/").pop() ?? mdPath);
    const notePath = await vaultService.createNote(destDir, title);
    const rewritten = await copyImportableImagesFromZip(content, zipEntryParentDir(mdPath), notePath, files);
    await vaultService.write(notePath, rewritten, true);
    imported.push(notePath);
    onNote?.(index + 1, mdPaths.length);
  }
  return imported;
}

export async function importMarkdownNotesFromZipPath(
  zipAbsPath: string,
  destDir: string,
  onNote?: (imported: number, total: number) => void,
): Promise<string[]> {
  if (!isTauri()) throw new Error("ZIP import requires desktop app");
  const bytes = await readExternalBinary(zipAbsPath);
  return importMarkdownNotesFromZipBytes(bytes, destDir, onNote);
}
