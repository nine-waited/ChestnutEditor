import { isTauri } from "@chestnut/storage-adapters";
import { isDownloadableUiFont, type UiFont } from "./ui-font.js";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("UI fonts require the desktop app");
  const { invoke: tauriInvoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function listInstalledUiFonts(): Promise<UiFont[]> {
  if (!isTauri()) return [];
  try {
    const ids = await invoke<string[]>("list_ui_fonts");
    return ids.filter((id): id is UiFont => isDownloadableUiFont(id));
  } catch {
    return [];
  }
}

export async function downloadUiFontFile(font: UiFont): Promise<void> {
  if (!isDownloadableUiFont(font)) return;
  await invoke("download_ui_font", { id: font });
}

export async function uninstallUiFontFile(font: UiFont): Promise<void> {
  if (!isDownloadableUiFont(font)) return;
  await invoke("uninstall_ui_font", { id: font });
}

export async function uiFontAssetUrl(font: UiFont): Promise<string> {
  return invoke<string>("ui_font_asset_url", { id: font });
}

export interface UiFontDownloadProgress {
  id: string;
  received: number;
  total: number;
}

export const UI_FONT_DOWNLOAD_BYTES: Record<Exclude<UiFont, "microsoft-yahei">, number> = {
  xiaolai: 22_220_806,
  yozai: 15_605_374,
};

export function formatUiFontDownloadProgress(received: number, total: number): string {
  const totalMb = Math.max(1, Math.round(total / (1024 * 1024)));
  const receivedMb = received / (1024 * 1024);
  const receivedLabel =
    receivedMb < 10 ? receivedMb.toFixed(1).replace(/\.0$/, "") : Math.round(receivedMb).toString();
  return `${receivedLabel}M / ${totalMb}M`;
}

export async function listenUiFontDownloadProgress(
  onProgress: (payload: UiFontDownloadProgress) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import(/* @vite-ignore */ "@tauri-apps/api/event");
  return listen<UiFontDownloadProgress>("ui-font-download-progress", (event) => {
    if (event.payload) onProgress(event.payload);
  });
}
