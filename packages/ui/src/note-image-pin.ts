import { isTauri } from "@chestnut/storage-adapters";

const openPinLabels = new Set<string>();

function pinImageUrl(pinId: string): string {
  const url = new URL("pin-image.html", window.location.origin);
  url.searchParams.set("id", pinId);
  return url.toString();
}

export function isNoteImagePinAvailable(): boolean {
  return isTauri();
}

export async function pinNoteImageToDesktop(img: HTMLImageElement): Promise<void> {
  if (!isTauri()) return;

  const src = img.currentSrc || img.src;
  if (!src) throw new Error("missing image src");

  const pinId = crypto.randomUUID();
  const alt = img.getAttribute("alt")?.trim() || "";

  const { invoke } = await import(/* @vite-ignore */ "@tauri-apps/api/core");
  await invoke("store_pin_image_payload", { id: pinId, src, alt });

  const rect = img.getBoundingClientRect();
  const width = Math.round(Math.min(960, Math.max(240, rect.width + 16)));
  const height = Math.round(Math.min(720, Math.max(180, rect.height + 24)));

  const { getCurrentWindow } = await import(/* @vite-ignore */ "@tauri-apps/api/window");
  const { WebviewWindow } = await import(/* @vite-ignore */ "@tauri-apps/api/webviewWindow");
  const mainWindow = getCurrentWindow();
  const outerPosition = await mainWindow.outerPosition();
  const x = outerPosition.x + Math.round(rect.left);
  const y = outerPosition.y + Math.round(rect.top);

  const label = `chestnut-pin-${pinId}`;
  openPinLabels.add(label);

  const pinWindow = new WebviewWindow(label, {
    url: pinImageUrl(pinId),
    title: alt || "Chestnut Pin",
    width,
    height,
    x,
    y,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    focus: true,
    visible: true,
  });

  pinWindow.once("tauri://destroyed", () => {
    openPinLabels.delete(label);
  });

  await new Promise<void>((resolve, reject) => {
    pinWindow.once("tauri://created", () => resolve());
    pinWindow.once("tauri://error", (event) => {
      openPinLabels.delete(label);
      reject(new Error(String(event.payload)));
    });
  });
}
