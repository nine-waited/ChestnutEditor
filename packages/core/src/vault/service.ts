import type { VaultAdapter } from "./types.js";
import {
  isAttachment,
  isExcalidraw,
  isMarkdown,
  isPdf,
  listAllFiles,
  normalizePath,
  joinPath,
} from "./types.js";
import {
  notePicDirPath,
  isInNotePicFolder,
  isNotePicFolder,
  rewriteNotePicPaths,
  sanitizeImageFileName,
  toMarkdownAssetPath,
} from "./note-images.js";
import {
  exportTargetDirPath,
  isExportTargetFolder,
  isInExportTargetFolder,
} from "./export-target.js";
import { metadataCache } from "../metadata/cache.js";
import { searchIndex } from "../search/index.js";
import { eventBus } from "../plugins/host.js";

export class VaultService {
  private adapter: VaultAdapter | null = null;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Paths (and folder prefixes) that must not be recreated by keep-alive autosave. */
  private suppressedWrites = new Set<string>();

  getAdapter(): VaultAdapter | null {
    return this.adapter;
  }

  async mount(adapter: VaultAdapter): Promise<void> {
    this.adapter = adapter;
    this.suppressedWrites.clear();
    await this.reindex();
  }

  async unmount(): Promise<void> {
    this.adapter = null;
    this.suppressedWrites.clear();
    metadataCache.getAll().forEach((f) => metadataCache.remove(f.path));
    searchIndex.clear();
  }

  async reindex(): Promise<void> {
    if (!this.adapter) return;
    searchIndex.clear();
    const files = await listAllFiles(this.adapter);
    for (const file of files) {
      if (!isMarkdown(file.path)) continue;
      try {
        const content = await this.adapter.read(file.path);
        const cache = metadataCache.set(file.path, content);
        const { body } = stripFrontmatter(content);
        searchIndex.indexFile(cache, body);
      } catch (err) {
        console.warn(`[Chestnut] failed to index ${file.path}:`, err);
      }
    }
  }

  async read(path: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    return this.adapter.read(normalizePath(path));
  }

  async write(path: string, content: string, immediate = false): Promise<void> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    if (this.isWriteSuppressed(normalized)) return;
    if (immediate) {
      await this.adapter.write(normalized, content);
      this.afterSave(normalized, content);
      return;
    }
    const existing = this.saveTimers.get(normalized);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(
      normalized,
      setTimeout(async () => {
        this.saveTimers.delete(normalized);
        if (this.isWriteSuppressed(normalized) || !this.adapter) return;
        await this.adapter.write(normalized, content);
        this.afterSave(normalized, content);
      }, 400),
    );
  }

  async flushPending(): Promise<void> {
    const pending = [...this.saveTimers.entries()];
    this.saveTimers.clear();
    for (const [path, timer] of pending) {
      clearTimeout(timer);
    }
  }

  async deletePath(path: string, kind: "file" | "directory"): Promise<void> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    if (kind === "directory" && isNotePicFolder(normalized)) {
      throw new Error("Cannot delete a note image folder");
    }
    this.suppressWritesAfterDelete(normalized, kind);
    const pathsToDelete = [normalized];

    if (kind === "file" && isMarkdown(normalized)) {
      const picDir = notePicDirPath(normalized);
      if (await this.adapter.exists(picDir)) {
        pathsToDelete.push(picDir);
        this.suppressedWrites.add(picDir);
      }
    }

    const allFiles = await listAllFiles(this.adapter);
    for (const targetPath of pathsToDelete) {
      const prefix = `${targetPath}/`;
      for (const file of allFiles) {
        if (file.path !== targetPath && !file.path.startsWith(prefix)) continue;
        const pending = this.saveTimers.get(file.path);
        if (pending) {
          clearTimeout(pending);
          this.saveTimers.delete(file.path);
        }
        if (isMarkdown(file.path)) {
          metadataCache.remove(file.path);
          searchIndex.removeFile(file.path);
        }
      }

      if (targetPath === normalized && kind === "file") {
        const pending = this.saveTimers.get(normalized);
        if (pending) {
          clearTimeout(pending);
          this.saveTimers.delete(normalized);
        }
        if (isMarkdown(normalized)) {
          metadataCache.remove(normalized);
          searchIndex.removeFile(normalized);
        }
      }
    }

    for (const targetPath of pathsToDelete) {
      await this.adapter.delete(targetPath);
    }
  }

  async notePicDirIfExists(mdPath: string): Promise<string | null> {
    if (!this.adapter || !isMarkdown(mdPath)) return null;
    const picDir = notePicDirPath(normalizePath(mdPath));
    return (await this.adapter.exists(picDir)) ? picDir : null;
  }

  async listTree(dir = ""): Promise<import("./types.js").VaultEntry[]> {
    if (!this.adapter) return [];
    return this.adapter.list(dir);
  }

  async listMarkdown(): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
    if (!this.adapter) return [];
    const files = await listAllFiles(this.adapter);
    return files
      .filter((f) => isMarkdown(f.path))
      .map((f) => ({ path: f.path, size: f.size ?? 0, mtimeMs: f.mtimeMs ?? 0 }));
  }

  async listQuickOpenFiles(): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
    if (!this.adapter) return [];
    const files = await listAllFiles(this.adapter);
    return files
      .filter((f) => isMarkdown(f.path) || isExcalidraw(f.path) || isPdf(f.path))
      .map((f) => ({ path: f.path, size: f.size ?? 0, mtimeMs: f.mtimeMs ?? 0 }));
  }

  async listAttachments(): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
    if (!this.adapter) return [];
    const files = await listAllFiles(this.adapter);
    return files
      .filter((f) => isAttachment(f.path))
      .map((f) => ({ path: f.path, size: f.size ?? 0, mtimeMs: f.mtimeMs ?? 0 }));
  }

  async createNote(dir = "", title = "Untitled"): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const base = normalizePath(dir);
    if (isInNotePicFolder(base)) throw new Error("Cannot create in a note image folder");
    if (isInExportTargetFolder(base)) throw new Error("Cannot create in the export folder");
    if (base) await this.adapter.mkdir(base);
    let path = joinPath(base, `${title}.md`);
    let i = 1;
    while (await this.adapter.exists(path)) {
      path = joinPath(base, `${title} ${i}.md`);
      i++;
    }
    const content = "";
    this.clearWriteSuppression(path);
    await this.adapter.write(path, content);
    this.afterSave(path, content);
    return path;
  }

  async renameFile(path: string, newTitle: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    let ext: string;
    if (isMarkdown(normalized)) ext = ".md";
    else if (isExcalidraw(normalized)) ext = ".excalidraw";
    else throw new Error("Unsupported file type");

    const safe = sanitizeNoteTitle(newTitle);
    const currentBase = fileBaseName(normalized);
    if (safe === currentBase) return normalized;

    const dir = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    let nextPath = dir ? `${dir}/${safe}${ext}` : `${safe}${ext}`;
    let i = 1;
    while ((await this.adapter.exists(nextPath)) && nextPath !== normalized) {
      nextPath = dir ? `${dir}/${safe} ${i}${ext}` : `${safe} ${i}${ext}`;
      i++;
    }
    if (nextPath === normalized) return normalized;

    const pending = this.saveTimers.get(normalized);
    if (pending) {
      clearTimeout(pending);
      this.saveTimers.delete(normalized);
    }

    let content = await this.adapter.read(normalized);
    if (isMarkdown(normalized)) {
      const oldPicDir = notePicDirPath(normalized);
      const newPicDir = notePicDirPath(nextPath);
      if (oldPicDir !== newPicDir && (await this.adapter.exists(oldPicDir))) {
        await this.adapter.rename(oldPicDir, newPicDir);
      }
      content = rewriteNotePicPaths(
        content,
        oldPicDir,
        newPicDir,
        this.resolveAbsolutePath(oldPicDir),
        this.resolveAbsolutePath(newPicDir),
      );
    }

    this.clearWriteSuppression(nextPath);
    await this.adapter.write(nextPath, content);
    await this.adapter.delete(normalized);

    if (isMarkdown(normalized)) {
      metadataCache.remove(normalized);
      searchIndex.removeFile(normalized);
      this.afterSave(nextPath, content);
    }
    eventBus.emit("file-rename", { from: normalized, to: nextPath });
    return nextPath;
  }

  async renameNote(path: string, newTitle: string): Promise<string> {
    return this.renameFile(path, newTitle);
  }

  async renameFolder(path: string, newName: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    if (isNotePicFolder(normalized)) throw new Error("Cannot rename a note image folder");
    if (isInExportTargetFolder(normalized)) throw new Error("Cannot rename inside the export folder");
    const safe = sanitizeFolderName(newName);
    const currentName = normalized.split("/").pop() ?? normalized;
    if (safe === currentName) return normalized;

    const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    let nextPath = parent ? `${parent}/${safe}` : safe;
    let i = 1;
    while ((await this.adapter.exists(nextPath)) && nextPath !== normalized) {
      nextPath = parent ? `${parent}/${safe} ${i}` : `${safe} ${i}`;
      i++;
    }
    if (nextPath === normalized) return normalized;

    const prefix = `${normalized}/`;
    const allFiles = await listAllFiles(this.adapter);
    const affected = allFiles.filter((f) => f.path === normalized || f.path.startsWith(prefix));

    for (const file of affected) {
      const pending = this.saveTimers.get(file.path);
      if (pending) {
        clearTimeout(pending);
        this.saveTimers.delete(file.path);
      }
      if (isMarkdown(file.path)) {
        metadataCache.remove(file.path);
        searchIndex.removeFile(file.path);
      }
    }

    await this.adapter.rename(normalized, nextPath);

    for (const file of affected) {
      if (!isMarkdown(file.path)) continue;
      const newFilePath =
        file.path === normalized ? nextPath : `${nextPath}${file.path.slice(normalized.length)}`;
      const content = await this.adapter.read(newFilePath);
      this.afterSave(newFilePath, content);
      eventBus.emit("file-rename", { from: file.path, to: newFilePath });
    }

    return nextPath;
  }

  async moveEntry(
    path: string,
    kind: "file" | "directory",
    targetDir: string,
  ): Promise<string> {
    return kind === "directory"
      ? this.moveFolder(path, targetDir)
      : this.moveFileToDir(path, targetDir);
  }

  async moveFileToDir(path: string, targetDir: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    const target = normalizePath(targetDir);
    if (isInNotePicFolder(normalized)) throw new Error("Cannot move from a note image folder");
    if (isInExportTargetFolder(normalized)) throw new Error("Cannot move from the export folder");
    if (target && isInNotePicFolder(target)) throw new Error("Cannot move into a note image folder");
    if (target && isInExportTargetFolder(target)) throw new Error("Cannot move into the export folder");

    const parent = parentDir(normalized);
    if (parent === target) return normalized;

    const fileName = normalized.split("/").pop() ?? normalized;
    const nextPath = await uniqueSiblingPath(
      target ? joinPath(target, fileName) : fileName,
      (candidate) => this.adapter!.exists(candidate),
      normalized,
    );
    if (nextPath === normalized) return normalized;

    const pending = this.saveTimers.get(normalized);
    if (pending) {
      clearTimeout(pending);
      this.saveTimers.delete(normalized);
    }

    if (isMarkdown(normalized)) {
      const oldPicDir = notePicDirPath(normalized);
      const newPicDir = notePicDirPath(nextPath);
      if (oldPicDir !== newPicDir && (await this.adapter.exists(oldPicDir))) {
        const movedPicDir = await uniqueSiblingPath(
          newPicDir,
          (candidate) => this.adapter!.exists(candidate),
          oldPicDir,
        );
        await this.adapter.rename(oldPicDir, movedPicDir);
        const content = rewriteNotePicPaths(
          await this.adapter.read(normalized),
          oldPicDir,
          movedPicDir,
          this.resolveAbsolutePath(oldPicDir),
          this.resolveAbsolutePath(movedPicDir),
        );
        await this.adapter.write(nextPath, content);
        await this.adapter.delete(normalized);
        metadataCache.remove(normalized);
        searchIndex.removeFile(normalized);
        this.afterSave(nextPath, content);
      } else {
        let content = await this.adapter.read(normalized);
        if (oldPicDir !== newPicDir) {
          content = rewriteNotePicPaths(
            content,
            oldPicDir,
            newPicDir,
            this.resolveAbsolutePath(oldPicDir),
            this.resolveAbsolutePath(newPicDir),
          );
        }
        await this.adapter.write(nextPath, content);
        await this.adapter.delete(normalized);
        metadataCache.remove(normalized);
        searchIndex.removeFile(normalized);
        this.afterSave(nextPath, content);
      }
    } else {
      await this.adapter.rename(normalized, nextPath);
    }

    eventBus.emit("file-rename", { from: normalized, to: nextPath });
    return nextPath;
  }

  async moveFolder(path: string, targetDir: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    const target = normalizePath(targetDir);
    if (isNotePicFolder(normalized)) throw new Error("Cannot move a note image folder");
    if (isExportTargetFolder(normalized)) throw new Error("Cannot move the export folder");
    if (target && (target === normalized || target.startsWith(`${normalized}/`))) {
      throw new Error("Cannot move a folder into itself");
    }
    if (target && isInNotePicFolder(target)) throw new Error("Cannot move into a note image folder");
    if (target && isInExportTargetFolder(target)) throw new Error("Cannot move into the export folder");

    const parent = parentDir(normalized);
    if (parent === target) return normalized;

    const folderName = normalized.split("/").pop() ?? normalized;
    const nextPath = await uniqueSiblingPath(
      target ? joinPath(target, folderName) : folderName,
      (candidate) => this.adapter!.exists(candidate),
      normalized,
    );
    if (nextPath === normalized) return normalized;

    const prefix = `${normalized}/`;
    const allFiles = await listAllFiles(this.adapter);
    const affected = allFiles.filter((f) => f.path === normalized || f.path.startsWith(prefix));

    for (const file of affected) {
      const pending = this.saveTimers.get(file.path);
      if (pending) {
        clearTimeout(pending);
        this.saveTimers.delete(file.path);
      }
      if (isMarkdown(file.path)) {
        metadataCache.remove(file.path);
        searchIndex.removeFile(file.path);
      }
    }

    await this.adapter.rename(normalized, nextPath);

    for (const file of affected) {
      if (!isMarkdown(file.path)) continue;
      const newFilePath =
        file.path === normalized ? nextPath : `${nextPath}${file.path.slice(normalized.length)}`;
      const content = await this.adapter.read(newFilePath);
      this.afterSave(newFilePath, content);
      eventBus.emit("file-rename", { from: file.path, to: newFilePath });
    }

    return nextPath;
  }

  async createFolder(dir = "", title = "New folder"): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const parent = normalizePath(dir);
    if (isInNotePicFolder(parent)) throw new Error("Cannot create in a note image folder");
    if (isInExportTargetFolder(parent)) throw new Error("Cannot create in the export folder");
    if (parent) await this.adapter.mkdir(parent);
    const safe = sanitizeFolderName(title);
    let path = parent ? `${parent}/${safe}` : safe;
    let i = 1;
    while (await this.adapter.exists(path)) {
      path = parent ? `${parent}/${safe} ${i}` : `${safe} ${i}`;
      i++;
    }
    await this.adapter.mkdir(path);
    this.clearWriteSuppression(path);
    return path;
  }

  async createExcalidraw(dir = "", title = "Drawing"): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const base = normalizePath(dir);
    if (isInNotePicFolder(base)) throw new Error("Cannot create in a note image folder");
    if (isInExportTargetFolder(base)) throw new Error("Cannot create in the export folder");
    if (base) await this.adapter.mkdir(base);
    let path = joinPath(base, `${title}.excalidraw`);
    let i = 1;
    while (await this.adapter.exists(path)) {
      path = joinPath(base, `${title} ${i}.excalidraw`);
      i++;
    }
    const empty = JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        source: "Chestnut",
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
      null,
      2,
    );
    this.clearWriteSuppression(path);
    await this.adapter.write(path, empty);
    return path;
  }

  async saveAttachment(file: File): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    await this.adapter.mkdir("attachments");
    const safeName = file.name.replace(/[^\w.\-()\u4e00-\u9fff]/g, "_");
    let path = `attachments/${safeName}`;
    let i = 1;
    while (await this.adapter.exists(path)) {
      const ext = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")) : "";
      const base = ext ? safeName.slice(0, -ext.length) : safeName;
      path = `attachments/${base}-${i}${ext}`;
      i++;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    await this.adapter.writeBinary(path, buf);
    return path;
  }

  resolveAbsolutePath(vaultRelativePath: string): string | null {
    if (!this.adapter?.getAbsolutePath) return null;
    return toMarkdownAssetPath(this.adapter.getAbsolutePath(normalizePath(vaultRelativePath)));
  }

  /** Copy a vault file into `targetDir` (unique name). Markdown notes also copy `_pic` and rewrite image paths. */
  async copyFileIntoDir(path: string, targetDir: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    const target = normalizePath(targetDir);
    if (!(await this.adapter.exists(normalized))) throw new Error(`path not found: ${normalized}`);
    if (target && isInNotePicFolder(target)) throw new Error("Cannot copy into a note image folder");
    if (target && isInExportTargetFolder(target)) throw new Error("Cannot copy into the export folder");

    const fileName = normalized.split("/").pop() ?? normalized;
    const nextPath = await uniqueSiblingPath(
      target ? joinPath(target, fileName) : fileName,
      (candidate) => this.adapter!.exists(candidate),
    );

    if (isMarkdown(normalized)) {
      const oldPicDir = notePicDirPath(normalized);
      let content = await this.adapter.read(normalized);

      if (await this.adapter.exists(oldPicDir)) {
        const desiredPicDir = notePicDirPath(nextPath);
        const copiedPicDir = await uniqueSiblingPath(
          desiredPicDir,
          (candidate) => this.adapter!.exists(candidate),
        );
        await this.copyDirRecursive(oldPicDir, copiedPicDir);
        content = rewriteNotePicPaths(
          content,
          oldPicDir,
          copiedPicDir,
          this.resolveAbsolutePath(oldPicDir),
          this.resolveAbsolutePath(copiedPicDir),
        );
      } else {
        const newPicDir = notePicDirPath(nextPath);
        if (oldPicDir !== newPicDir) {
          content = rewriteNotePicPaths(
            content,
            oldPicDir,
            newPicDir,
            this.resolveAbsolutePath(oldPicDir),
            this.resolveAbsolutePath(newPicDir),
          );
        }
      }

      await this.adapter.write(nextPath, content);
      this.afterSave(nextPath, content);
      return nextPath;
    }

    const bytes = await this.adapter.readBinary(normalized);
    await this.adapter.writeBinary(nextPath, bytes);
    return nextPath;
  }

  /** Copy a vault folder into `targetDir` (unique name). Note `_pic` folders cannot be copied alone this way. */
  async copyFolderIntoDir(path: string, targetDir: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    const target = normalizePath(targetDir);
    if (isNotePicFolder(normalized)) throw new Error("Cannot copy a note image folder by itself");
    if (target && isInNotePicFolder(target)) throw new Error("Cannot copy into a note image folder");
    if (target && isInExportTargetFolder(target)) throw new Error("Cannot copy into the export folder");
    if (target === normalized || target.startsWith(`${normalized}/`)) {
      throw new Error("Cannot copy a folder into itself");
    }

    const folderName = normalized.split("/").pop() ?? normalized;
    const nextPath = await uniqueSiblingPath(
      target ? joinPath(target, folderName) : folderName,
      (candidate) => this.adapter!.exists(candidate),
    );
    await this.copyDirRecursive(normalized, nextPath);

    const allFiles = await listAllFiles(this.adapter);
    for (const file of allFiles) {
      if (!file.path.startsWith(`${nextPath}/`)) continue;
      if (!isMarkdown(file.path)) continue;
      const content = await this.adapter.read(file.path);
      this.afterSave(file.path, content);
    }
    return nextPath;
  }

  private async copyDirRecursive(fromPath: string, toPath: string): Promise<void> {
    if (!this.adapter) throw new Error("No vault mounted");
    await this.adapter.mkdir(toPath);
    const entries = await this.adapter.list(fromPath);
    for (const entry of entries) {
      const dest = joinPath(toPath, entry.name);
      if (entry.kind === "directory") {
        await this.copyDirRecursive(entry.path, dest);
      } else {
        const bytes = await this.adapter.readBinary(entry.path);
        await this.adapter.writeBinary(dest, bytes);
      }
    }
  }

  /** Save an image next to the note in `{noteBase}_pic/` and return the markdown link path. */
  async saveNoteImage(mdPath: string, file: File | Blob, suggestedName?: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    const picDir = notePicDirPath(mdPath);
    await this.adapter.mkdir(picDir);

    const mime = file.type || "image/png";
    const sourceName =
      file instanceof File ? file.name : suggestedName ?? "image.png";
    const safeName = sanitizeImageFileName(suggestedName ?? sourceName, mime);
    let vaultPath = joinPath(picDir, safeName);
    let i = 1;
    while (await this.adapter.exists(vaultPath)) {
      const ext = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")) : "";
      const base = ext ? safeName.slice(0, -ext.length) : safeName;
      vaultPath = joinPath(picDir, `${base}-${i}${ext}`);
      i++;
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    await this.adapter.writeBinary(vaultPath, buf);

    const absolute = this.resolveAbsolutePath(vaultPath);
    return absolute ?? vaultPath;
  }

  async getAssetUrl(path: string): Promise<string> {
    if (!this.adapter) throw new Error("No vault mounted");
    return this.adapter.getAssetUrl(normalizePath(path));
  }

  async readBinary(path: string): Promise<Uint8Array> {
    if (!this.adapter) throw new Error("No vault mounted");
    return this.adapter.readBinary(normalizePath(path));
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    if (!this.adapter) throw new Error("No vault mounted");
    const normalized = normalizePath(path);
    if (this.isWriteSuppressed(normalized)) return;
    await this.adapter.writeBinary(normalized, content);
  }

  /** True when keep-alive autosave must not recreate this path after delete. */
  isWriteSuppressed(path: string): boolean {
    const normalized = normalizePath(path);
    if (this.suppressedWrites.has(normalized)) return true;
    for (const suppressed of this.suppressedWrites) {
      if (normalized.startsWith(`${suppressed}/`)) return true;
    }
    return false;
  }

  private suppressWritesAfterDelete(path: string, kind: "file" | "directory"): void {
    // Only block keep-alive recreation of notes/folders. Image orphan deletes must
    // still allow undo restore via writeBinary.
    if (kind === "directory" || isMarkdown(path)) {
      this.suppressedWrites.add(path);
    }
    if (kind === "directory") {
      for (const timerPath of [...this.saveTimers.keys()]) {
        if (timerPath === path || timerPath.startsWith(`${path}/`)) {
          const pending = this.saveTimers.get(timerPath);
          if (pending) clearTimeout(pending);
          this.saveTimers.delete(timerPath);
        }
      }
    }
  }

  /** Allow intentional recreate (new note / folder / drawing) after a delete. */
  private clearWriteSuppression(path: string): void {
    const normalized = normalizePath(path);
    this.suppressedWrites.delete(normalized);
    for (const suppressed of [...this.suppressedWrites]) {
      if (normalized === suppressed || normalized.startsWith(`${suppressed}/`)) {
        this.suppressedWrites.delete(suppressed);
      }
    }
  }

  async ensureExportTargetDir(): Promise<void> {
    if (!this.adapter) throw new Error("No vault mounted");
    await this.adapter.mkdir(exportTargetDirPath());
  }

  async getPublishableNotes(): Promise<
    Array<{ path: string; title: string; slug: string; date: string; tags: string[] }>
  > {
    const result: Array<{ path: string; title: string; slug: string; date: string; tags: string[] }> = [];
    for (const cache of metadataCache.getAll()) {
      if (cache.frontmatter.publish !== true && cache.frontmatter.publish !== "true") continue;
      const title =
        (typeof cache.frontmatter.title === "string" && cache.frontmatter.title) ||
        cache.path.split("/").pop()?.replace(/\.md$/, "") ||
        cache.path;
      const slug =
        (typeof cache.frontmatter.slug === "string" && cache.frontmatter.slug) ||
        title.toLowerCase().replace(/\s+/g, "-");
      const date =
        (typeof cache.frontmatter.date === "string" && cache.frontmatter.date) ||
        new Date().toISOString().slice(0, 10);
      result.push({ path: cache.path, title, slug, date, tags: cache.tags });
    }
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }

  private afterSave(path: string, content: string): void {
    if (isMarkdown(path)) {
      const cache = metadataCache.set(path, content);
      const { body } = stripFrontmatter(content);
      searchIndex.removeFile(path);
      searchIndex.indexFile(cache, body);
    }
    eventBus.emit("file-save", { path });
  }
}


function stripFrontmatter(content: string): { body: string } {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return { body: match ? content.slice(match[0].length) : content };
}

function parentDir(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

async function uniqueSiblingPath(
  desired: string,
  exists: (path: string) => Promise<boolean>,
  currentPath?: string,
): Promise<string> {
  const normalized = normalizePath(desired);
  if (!(await exists(normalized)) || normalized === currentPath) return normalized;

  const parts = normalized.split("/");
  const name = parts.pop() ?? normalized;
  const dir = parts.join("/");
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  let i = 1;
  while (true) {
    const candidateName = `${stem} ${i}${ext}`;
    const candidate = dir ? `${dir}/${candidateName}` : candidateName;
    if (!(await exists(candidate)) || candidate === currentPath) return candidate;
    i++;
  }
}

export function fileBaseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(md|excalidraw|pdf)$/i, "");
}

export function noteBaseName(path: string): string {
  return fileBaseName(path);
}

export function sanitizeNoteTitle(title: string): string {
  const trimmed = title.replace(/[\\/:*?"<>|]/g, "").trim();
  return trimmed || "Untitled";
}

export function sanitizeFolderName(title: string): string {
  const trimmed = title.replace(/[\\/:*?"<>|]/g, "").trim();
  return trimmed || "New folder";
}

export const vaultService = new VaultService();

export { isExcalidraw, isMarkdown, isAttachment };
export {
  NOTE_PIC_SUFFIX,
  notePicDirPath,
  formatImageMarkdown,
  toMarkdownAssetPath,
} from "./note-images.js";
export {
  EXPORT_TARGET_DIR,
  exportTargetDirPath,
  isExportTargetFolder,
  isInExportTargetFolder,
  pdfPathForMarkdown,
  markdownExportDirPath,
  markdownExportFilePath,
  sortFileTreeEntries,
} from "./export-target.js";
