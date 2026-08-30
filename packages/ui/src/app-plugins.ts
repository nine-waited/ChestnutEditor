import type { PluginManifest } from "@chestnut/plugin-sdk";
import { isTauri } from "@chestnut/storage-adapters";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Plugins require the desktop app");
  const { invoke: tauriInvoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

const blobUrls = new Map<string, string[]>();

export function rememberPluginBlob(pluginId: string, url: string): void {
  const list = blobUrls.get(pluginId) ?? [];
  list.push(url);
  blobUrls.set(pluginId, list);
}

export function revokePluginBlobs(pluginId: string): void {
  for (const url of blobUrls.get(pluginId) ?? []) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  blobUrls.delete(pluginId);
}

export async function getAppPluginsPath(): Promise<string> {
  return invoke<string>("app_plugins_path");
}

export async function listAppPlugins(): Promise<PluginManifest[]> {
  return invoke<PluginManifest[]>("list_app_plugins");
}

export async function installAppPluginFromFile(file: File): Promise<PluginManifest> {
  const path = fileSystemPath(file);
  if (path) {
    return invoke<PluginManifest>("install_app_plugin_zip_path", { path });
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("PLUGIN_ZIP_USE_PICKER");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<PluginManifest>("install_app_plugin_zip", { bytes: Array.from(bytes) });
}

export async function pickAndInstallAppPluginZip(): Promise<PluginManifest | null> {
  try {
    return await invoke<PluginManifest>("pick_and_install_app_plugin_zip");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("cancelled")) return null;
    throw err;
  }
}

export async function uninstallAppPlugin(pluginId: string): Promise<void> {
  await invoke("uninstall_app_plugin", { pluginId });
}

export async function readAppPluginText(pluginId: string, relPath: string): Promise<string> {
  return invoke<string>("app_plugin_read_text", { pluginId, relPath });
}

export async function writeAppPluginText(
  pluginId: string,
  relPath: string,
  content: string,
): Promise<void> {
  await invoke("app_plugin_write_text", { pluginId, relPath, content });
}

export async function appPluginAssetUrl(pluginId: string, relPath: string): Promise<string> {
  return invoke<string>("app_plugin_asset_url", { pluginId, relPath });
}

export async function appPluginResourceUrl(pluginId: string, relPath: string): Promise<string> {
  const rel = relPath.replace(/^\/+/, "");
  if (/\.(js|mjs|cjs|css)$/i.test(rel)) {
    const text = await readAppPluginText(pluginId, rel);
    const mime = rel.toLowerCase().endsWith(".css") ? "text/css" : "text/javascript";
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    rememberPluginBlob(pluginId, url);
    return url;
  }
  return appPluginAssetUrl(pluginId, rel);
}

export function pickZipFile(files: Array<{ path?: string; file: File } | File>): File | null {
  const list = files.map((item) => ("file" in item ? item.file : item));
  return list.find((file) => file.name.toLowerCase().endsWith(".zip")) ?? null;
}

function fileSystemPath(file: File): string | undefined {
  const path = (file as File & { path?: string }).path;
  if (typeof path === "string" && path.length > 1 && /\.zip$/i.test(path)) return path;
  return undefined;
}
