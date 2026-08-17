import type { VaultAdapter, VaultEntry } from "../types.js";
import { normalizePath } from "../types.js";

/**
 * In-memory VaultAdapter for data-safety / VaultService contract tests.
 * Uses kind "tauri" so production branches that only check adapter.kind stay quiet.
 */
export class InMemoryVaultAdapter implements VaultAdapter {
  readonly kind = "tauri" as const;
  readonly id = "memory";
  readonly name = "Memory";

  private files = new Map<string, string>();
  private binaries = new Map<string, Uint8Array>();
  private dirs = new Set<string>([""]);

  async read(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const content = this.files.get(normalized);
    if (content === undefined) throw new Error(`ENOENT: ${normalized}`);
    return content;
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const normalized = normalizePath(path);
    const content = this.binaries.get(normalized);
    if (content === undefined) throw new Error(`ENOENT: ${normalized}`);
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    this.ensureParentDirs(normalized);
    this.files.set(normalized, content);
    this.binaries.delete(normalized);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const normalized = normalizePath(path);
    this.ensureParentDirs(normalized);
    this.binaries.set(normalized, content);
    this.files.delete(normalized);
  }

  async delete(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (this.dirs.has(normalized) && normalized !== "") {
      const prefix = `${normalized}/`;
      for (const file of [...this.files.keys()]) {
        if (file === normalized || file.startsWith(prefix)) this.files.delete(file);
      }
      for (const file of [...this.binaries.keys()]) {
        if (file === normalized || file.startsWith(prefix)) this.binaries.delete(file);
      }
      for (const dir of [...this.dirs]) {
        if (dir === normalized || dir.startsWith(prefix)) this.dirs.delete(dir);
      }
      return;
    }
    this.files.delete(normalized);
    this.binaries.delete(normalized);
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    const from = normalizePath(fromPath);
    const to = normalizePath(toPath);
    if (this.files.has(from)) {
      this.ensureParentDirs(to);
      this.files.set(to, this.files.get(from)!);
      this.files.delete(from);
      return;
    }
    if (this.binaries.has(from)) {
      this.ensureParentDirs(to);
      this.binaries.set(to, this.binaries.get(from)!);
      this.binaries.delete(from);
      return;
    }
    throw new Error(`ENOENT: ${from}`);
  }

  async list(dir = ""): Promise<VaultEntry[]> {
    const base = normalizePath(dir);
    const prefix = base ? `${base}/` : "";
    const names = new Map<string, VaultEntry>();

    const consider = (full: string, kind: "file" | "directory", size?: number) => {
      if (base) {
        if (full !== base && !full.startsWith(prefix)) return;
        if (full === base) return;
      } else if (!full) {
        return;
      }
      const rest = base ? full.slice(prefix.length) : full;
      const name = rest.split("/")[0];
      if (!name) return;
      const childPath = base ? `${base}/${name}` : name;
      if (names.has(childPath)) return;
      const isDirectFile = rest === name && kind === "file";
      names.set(childPath, {
        path: childPath,
        name,
        kind: isDirectFile ? "file" : "directory",
        size: isDirectFile ? size : undefined,
      });
    };

    for (const [path, content] of this.files) {
      consider(path, "file", content.length);
    }
    for (const [path, content] of this.binaries) {
      consider(path, "file", content.byteLength);
    }
    for (const path of this.dirs) {
      if (path) consider(path, "directory");
    }

    return [...names.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async mkdir(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized) return;
    const parts = normalized.split("/");
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      this.dirs.add(cur);
    }
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (!normalized) return true;
    return this.files.has(normalized) || this.binaries.has(normalized) || this.dirs.has(normalized);
  }

  async getAssetUrl(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const text = this.files.get(normalized);
    if (text !== undefined) {
      return `data:text/plain;base64,${Buffer.from(text, "utf8").toString("base64")}`;
    }
    const bin = this.binaries.get(normalized);
    if (bin) {
      return `data:application/octet-stream;base64,${Buffer.from(bin).toString("base64")}`;
    }
    throw new Error(`ENOENT: ${normalized}`);
  }

  private ensureParentDirs(filePath: string): void {
    const parts = filePath.split("/");
    if (parts.length < 2) return;
    parts.pop();
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      this.dirs.add(cur);
    }
  }
}
