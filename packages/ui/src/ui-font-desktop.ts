import { isTauri } from "@chestnut/storage-adapters";
import { isDownloadableUiFont, type BuiltinUiFont, type UiFont } from "./ui-font.js";

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

export interface CustomUiFontFile {
  /** File name under the custom fonts dir, e.g. `MyFont.ttf`. */
  id: string;
  name: string;
}

export async function listCustomUiFonts(): Promise<CustomUiFontFile[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<CustomUiFontFile[]>("list_custom_ui_fonts");
  } catch {
    return [];
  }
}

/** Opens a file picker; resolves `null` when the user cancels. */
export async function importCustomUiFont(): Promise<CustomUiFontFile | null> {
  try {
    return await invoke<CustomUiFontFile>("pick_and_import_custom_ui_font");
  } catch (err) {
    if (String(err) === "cancelled") return null;
    throw err;
  }
}

export async function customUiFontAssetUrl(id: string): Promise<string> {
  return invoke<string>("custom_ui_font_asset_url", { id });
}

export async function removeCustomUiFont(id: string): Promise<void> {
  await invoke("remove_custom_ui_font", { id });
}

export interface UiFontDownloadProgress {
  id: string;
  received: number;
  total: number;
}

export const UI_FONT_DOWNLOAD_BYTES: Record<Exclude<BuiltinUiFont, "microsoft-yahei">, number> = {
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
