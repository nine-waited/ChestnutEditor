import { isTauri } from "@chestnut/storage-adapters";

export async function fetchAppGithubReleasesJson(): Promise<string> {
  if (!isTauri()) throw new Error("Tauri is not available");
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
