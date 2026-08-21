import type { VaultAdapter, VaultEntry } from "@chestnut/core";
import { joinPath, normalizePath } from "@chestnut/core";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new Error("Tauri is not available");
  const { invoke: tauriInvoke } = await import(
    /* @vite-ignore */ "@tauri-apps/api/core"
  );
  return tauriInvoke<T>(cmd, args);
}

export class TauriFsAdapter implements VaultAdapter {
  readonly kind = "tauri" as const;
  readonly id: string;
  readonly name: string;
  private rootPath: string;
  private assetUrls = new Map<string, string>();

  constructor(rootPath: string, displayName?: string) {
    this.rootPath = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
    this.id = `tauri-${btoa(unescape(encodeURIComponent(this.rootPath))).slice(0, 12)}`;
    this.name = displayName ?? this.rootPath.split("/").pop() ?? "Vault";
  }

  static isAvailable(): boolean {
    return isTauriRuntime();
  }

  static async default(): Promise<TauriFsAdapter> {
    const path = await invoke<string>("default_vault_path");
    return new TauriFsAdapter(path, ".chestnut");
  }

  static async open(path: string): Promise<TauriFsAdapter> {
    const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
    await invoke("vault_mkdir", { path: normalized });
    return new TauriFsAdapter(normalized);
  }

  static async pick(defaultPath?: string): Promise<TauriFsAdapter> {
    const path = await invoke<string>("pick_vault_folder", {
      defaultPath: defaultPath ?? null,
    });
    return new TauriFsAdapter(path);
  }

  getRootPath(): string {
    return this.rootPath;
  }

  getAbsolutePath(path: string): string {
    return this.abs(path);
  }

  private abs(path: string): string {
    const rel = normalizePath(path);
    return rel ? `${this.rootPath}/${rel}` : this.rootPath;
  }

  async read(path: string): Promise<string> {
    return invoke<string>("vault_read_text", { path: this.abs(path) });
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const data = await invoke<number[]>("vault_read_binary", { path: this.abs(path) });
    return new Uint8Array(data);
  }

  async write(path: string, content: string): Promise<void> {
    await invoke("vault_write_text", { path: this.abs(path), content });
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    await invoke("vault_write_binary", { path: this.abs(path), content: Array.from(content) });
  }

  async delete(path: string): Promise<void> {
    await invoke("vault_delete", { path: this.abs(path) });
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    await invoke("vault_rename", { from: this.abs(fromPath), to: this.abs(toPath) });
  }

  async list(dir = ""): Promise<VaultEntry[]> {
    return invoke<VaultEntry[]>("vault_list", { root: this.rootPath, dir: normalizePath(dir) });
  }

  async mkdir(path: string): Promise<void> {
    await invoke("vault_mkdir", { path: this.abs(path) });
  }

  async exists(path: string): Promise<boolean> {
    return invoke<boolean>("vault_exists", { path: this.abs(path) });
  }

  async getAssetUrl(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const cached = this.assetUrls.get(normalized);
    if (cached) return cached;
    const url = await invoke<string>("vault_asset_url", { path: this.abs(normalized) });
    this.assetUrls.set(normalized, url);
    return url;
  }

  invalidateAssetUrl(path: string): void {
    this.assetUrls.delete(normalizePath(path));
  }
}

export function isTauri(): boolean {
  return isTauriRuntime();
}

export async function openVaultFolderInExplorer(path: string): Promise<void> {
  await invoke("open_vault_folder", { path });
}

/** Open an http(s) URL in the OS default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  await invoke("open_url", { url });
}

export async function revealVaultEntry(
  vaultRoot: string,
  entryPath?: string | null,
): Promise<void> {
  await invoke("reveal_vault_entry", {
    vaultRoot,
    entryPath: entryPath ?? null,
  });
}

/** Put absolute file paths on the OS clipboard so Explorer can paste the files. */
export async function writeClipboardFiles(absolutePaths: string[]): Promise<void> {
  await invoke("clipboard_write_files", { paths: absolutePaths });
}

/** Absolute file/folder paths currently on the OS clipboard (CF_HDROP). Empty when none. */
export async function readClipboardFiles(): Promise<string[]> {
  return invoke<string[]>("clipboard_read_files");
}

export async function hasClipboardFiles(): Promise<boolean> {
  const paths = await readClipboardFiles();
  return paths.length > 0;
}

/** Copy absolute files/folders into an absolute destination directory. Returns created paths. */
export async function copyPathsIntoDir(
  absoluteSources: string[],
  absoluteDestDir: string,
): Promise<string[]> {
  return invoke<string[]>("copy_paths_into_dir", {
    sources: absoluteSources,
    destDir: absoluteDestDir,
  });
}

export interface ExternalFsEntry {
  name: string;
  kind: "file" | "directory";
}

export async function pickFolder(defaultPath?: string): Promise<string> {
  return invoke<string>("pick_vault_folder", { defaultPath: defaultPath ?? null });
}

export async function listDirectory(path: string): Promise<ExternalFsEntry[]> {
  return invoke<ExternalFsEntry[]>("list_directory", { path });
}

export async function readExternalText(path: string): Promise<string> {
  return invoke<string>("vault_read_text", { path });
}

export async function readExternalBinary(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("vault_read_binary", { path });
  return new Uint8Array(data);
}

export async function externalPathExists(path: string): Promise<boolean> {
  return invoke<boolean>("vault_exists", { path });
}