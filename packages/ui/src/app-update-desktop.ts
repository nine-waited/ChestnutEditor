import { isTauri } from "@chestnut/storage-adapters";

export async function fetchAppGithubReleasesJson(): Promise<string> {
  if (!isTauri()) throw new Error("Tauri is not available");
  const { invoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  return invoke<string>("fetch_app_github_releases");
}
