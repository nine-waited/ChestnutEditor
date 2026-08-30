import type { PluginManifest } from "@chestnut/plugin-sdk";

export type DroppedPluginFile = {
  path: string;
  file: File;
};

const TEXT_FILE = /\.(js|mjs|cjs|json|css|md|html|txt|svg|ya?ml)$/i;
const PLUGIN_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(ok: (file: File) => void, err?: (error: Error) => void): void;
  createReader?(): {
    readEntries(ok: (entries: FileSystemEntryLike[]) => void, err?: (error: Error) => void): void;
  };
};

export function isTextPluginFile(name: string): boolean {
  return TEXT_FILE.test(name);
}

export function parsePluginManifest(raw: string): PluginManifest {
  const data = JSON.parse(raw) as PluginManifest;
  if (!data || typeof data !== "object") throw new Error("Invalid manifest");
  if (typeof data.id !== "string" || !PLUGIN_ID.test(data.id)) throw new Error("Invalid plugin id");
  if (typeof data.name !== "string" || !data.name.trim()) throw new Error("Invalid plugin name");
  if (typeof data.version !== "string" || !data.version.trim()) throw new Error("Invalid plugin version");
  return data;
}

export async function readPluginImport(files: DroppedPluginFile[]): Promise<{
  manifest: PluginManifest;
  writes: DroppedPluginFile[];
}> {
  if (!files.length) throw new Error("No files");
  const normalized = files.map((item) => ({
    path: item.path.replace(/\\/g, "/").replace(/^\/+/, ""),
    file: item.file,
  }));
  const manifests = normalized.filter((item) => /(^|\/)manifest\.json$/i.test(item.path));
  if (!manifests.length) throw new Error("Missing manifest.json");
  manifests.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  const manifestFile = manifests[0]!;
  const base = manifestFile.path.replace(/\/?manifest\.json$/i, "");
  const prefix = base ? `${base}/` : "";
  const writes = normalized
    .filter((item) => (prefix ? item.path.startsWith(prefix) || item.path === manifestFile.path : true))
    .map((item) => ({
      path: prefix ? item.path.slice(prefix.length) : item.path,
      file: item.file,
    }))
    .filter((item) => item.path && !item.path.split("/").includes(".."));
  const manifestEntry = writes.find((item) => item.path.toLowerCase() === "manifest.json");
  if (!manifestEntry) throw new Error("Missing manifest.json");
  const manifest = parsePluginManifest(await manifestEntry.file.text());
  const main = manifest.main ?? "main.js";
  if (!writes.some((item) => item.path === main)) throw new Error(`Missing ${main}`);
  return { manifest, writes };
}

export function filesFromInput(list: FileList | null): DroppedPluginFile[] {
  return [...(list ?? [])].map((file) => ({
    path: file.webkitRelativePath || file.name,
    file,
  }));
}

export async function filesFromDataTransfer(data: DataTransfer | null): Promise<DroppedPluginFile[]> {
  if (!data) return [];
  const items = [...data.items];
  const fromEntries: DroppedPluginFile[] = [];
  for (const item of items) {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry?.();
    if (entry) await walkEntry(entry, "", fromEntries);
  }
  if (fromEntries.length) return fromEntries;
  return [...data.files].map((file) => ({
    path: file.webkitRelativePath || file.name,
    file,
  }));
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string, out: DroppedPluginFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    out.push({ path, file });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    for (const child of children) await walkEntry(child, path, out);
  }
}

function readAllEntries(reader: {
  readEntries(ok: (entries: FileSystemEntryLike[]) => void, err?: (error: Error) => void): void;
}): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const next = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    };
    next();
  });
}
