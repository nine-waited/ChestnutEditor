import { isTauri } from "@chestnut/storage-adapters";

async function readTauriClipboardText(): Promise<string | null> {
  const { readText } = await import(
    /* @vite-ignore */ "@tauri-apps/plugin-clipboard-manager"
  );
  try {
    const text = await readText();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function writeTauriClipboardText(text: string): Promise<boolean> {
  const { writeText } = await import(
    /* @vite-ignore */ "@tauri-apps/plugin-clipboard-manager"
  );
  try {
    await writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function decodeBytesToRgba(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ rgba: Uint8Array; width: number; height: number } | null> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    rgba: new Uint8Array(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
}

function rasterizeImageElement(
  img: HTMLImageElement,
): { canvas: HTMLCanvasElement; rgba: Uint8Array; width: number; height: number } | null {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      canvas,
      rgba: new Uint8Array(imageData.data),
      width,
      height,
    };
  } catch {
    // Cross-origin <img> taints the canvas; getImageData then throws.
    return null;
  }
}

async function writeTauriClipboardRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<boolean> {
  const { writeImage } = await import(
    /* @vite-ignore */ "@tauri-apps/plugin-clipboard-manager"
  );
  const { Image } = await import(/* @vite-ignore */ "@tauri-apps/api/image");
  try {
    const image = await Image.new(rgba, width, height);
    await writeImage(image);
    return true;
  } catch {
    return false;
  }
}

async function writeWebClipboardPngBlob(blob: Blob): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Read plain text from the system clipboard without WebView permission prompts. */
export async function readSystemClipboardText(): Promise<string | null> {
  if (isTauri()) return readTauriClipboardText();

  if (!navigator.clipboard?.readText) return null;
  try {
    const text = await navigator.clipboard.readText();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Write plain text to the system clipboard without WebView permission prompts. */
export async function writeSystemClipboardText(text: string): Promise<boolean> {
  if (isTauri()) return writeTauriClipboardText(text);

  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Write image bytes to the system clipboard as a pasteable bitmap. */
export async function writeSystemClipboardImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<boolean> {
  const decoded =
    (await decodeBytesToRgba(bytes, mimeType)) ??
    (mimeType ? await decodeBytesToRgba(bytes, "") : null);
  if (!decoded) return false;

  if (isTauri()) {
    if (await writeTauriClipboardRgba(decoded.rgba, decoded.width, decoded.height)) {
      return true;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height),
    0,
    0,
  );
  const blob = await canvasToPngBlob(canvas);
  return blob ? writeWebClipboardPngBlob(blob) : false;
}

/** Write a rendered <img> to the system clipboard as a pasteable bitmap. */
export async function writeSystemClipboardImageElement(img: HTMLImageElement): Promise<boolean> {
  try {
    const rasterized = rasterizeImageElement(img);
    if (!rasterized) return false;

    if (isTauri()) {
      if (await writeTauriClipboardRgba(rasterized.rgba, rasterized.width, rasterized.height)) {
        return true;
      }
    }

    const blob = await canvasToPngBlob(rasterized.canvas);
    return blob ? writeWebClipboardPngBlob(blob) : false;
  } catch {
    return false;
  }
}
