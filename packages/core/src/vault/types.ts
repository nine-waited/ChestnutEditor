export type VaultKind = "tauri" | "remote";

export interface VaultEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  mtimeMs?: number;
}

export interface VaultAdapter {
  readonly kind: VaultKind;
  readonly id: string;
  readonly name: string;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  rename(fromPath: string, toPath: string): Promise<void>;
  list(dir?: string): Promise<VaultEntry[]>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Returns a blob URL or data URL for binary assets */
  getAssetUrl(path: string): Promise<string>;
  /** Returns an absolute filesystem path when supported (desktop vault). */
  getAbsolutePath?(path: string): string;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

/** Vault-relative trash destination for soft-deleted items. */
export function vaultTrashPath(originalPath: string, stamp?: string): string {
  const normalized = normalizePath(originalPath);
  const bucket = stamp ?? String(Date.now());
  return joinPath(".chestnut/trash", bucket, normalized);
}

export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function isExcalidraw(path: string): boolean {
  return path.toLowerCase().endsWith(".excalidraw");
}

export function isImage(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(path);
}

export function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function isZip(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

export function isAttachment(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.startsWith("attachments/") &&
    /\.(png|jpe?g|gif|webp|svg|pdf|mp4|webm)$/i.test(lower)
  );
}

const HIDDEN = new Set([".chestnut", ".boke", ".obsidian", ".git", "node_modules"]);

export function isHiddenPath(path: string): boolean {
  const parts = normalizePath(path).split("/");
  return parts.some((p) => p.startsWith(".") && HIDDEN.has(p));
}

export async function listAllFiles(
  adapter: VaultAdapter,
  dir = "",
): Promise<VaultEntry[]> {
  const entries = await adapter.list(dir);
  const result: VaultEntry[] = [];
  for (const entry of entries) {
    if (isHiddenPath(entry.path)) continue;
    if (entry.kind === "directory") {
      result.push(...(await listAllFiles(adapter, entry.path)));
    } else {
      result.push(entry);
    }
  }
  return result;
}
