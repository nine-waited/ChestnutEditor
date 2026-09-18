import { isTauri } from "@chestnut/storage-adapters";
import { CHESTNUT_UPDATE_CATALOG_URLS } from "./app-update.js";

async function fetchCatalogMirror(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) {
      console.debug(`[Chestnut] update catalog WebView ${url}: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.trimStart().startsWith("[")) return text;
    console.debug(`[Chestnut] update catalog WebView ${url}: unexpected response`);
  } catch (err) {
    console.debug(`[Chestnut] update catalog WebView ${url}:`, err);
  } finally {
    globalThis.clearTimeout(timer);
  }
  return null;
}

export async function fetchCatalogInWebview(): Promise<string | null> {
  try {
    return await Promise.any(
      CHESTNUT_UPDATE_CATALOG_URLS.map(async (url) => {
        const body = await fetchCatalogMirror(url);
        if (!body) throw new Error("catalog mirror unavailable");
        return body;
      }),
    );
  } catch {
    return null;
  }
}

export async function fetchAppGithubReleasesJson(): Promise<string> {
  if (!isTauri()) throw new Error("Tauri is not available");
  const fromWebview = await fetchCatalogInWebview();
  if (fromWebview) return fromWebview;
  const { invoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  return invoke<string>("fetch_app_github_releases");
}

export async function downloadAndOpenAppInstaller(url: string, fileName: string): Promise<void> {
  if (!isTauri()) throw new Error("Tauri is not available");
  const { invoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  await invoke("download_and_open_app_installer", { url, fileName });
}

export interface AppInstallerDownloadProgress {
  id: string;
  received: number;
  total: number;
}

export async function listenAppInstallerDownloadProgress(
  onProgress: (payload: AppInstallerDownloadProgress) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import(/* @vite-ignore */ "@tauri-apps/api/event");
  return listen<AppInstallerDownloadProgress>("app-installer-download-progress", (event) => {
    if (event.payload) onProgress(event.payload);
  });
}
