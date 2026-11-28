export type BuiltinUiFont = "microsoft-yahei" | "yozai" | "xiaolai";
/** Imported TTF/OTF; the suffix is the file name under the app's custom fonts dir. */
export type CustomUiFont = `custom:${string}`;
export type UiFont = BuiltinUiFont | CustomUiFont;

export const UI_FONTS: Array<{ value: BuiltinUiFont; labelKey: string }> = [
  { value: "microsoft-yahei", labelKey: "settings.fontMicrosoftYaHei" },
];

export const DOWNLOADABLE_UI_FONTS: BuiltinUiFont[] = ["xiaolai", "yozai"];

/** CSS family names used in @font-face after a handwriting font is downloaded. */
export const UI_FONT_FAMILIES: Record<Exclude<BuiltinUiFont, "microsoft-yahei">, string> = {
  yozai: "Yozai",
  xiaolai: "Xiaolai",
};

const FALLBACK_STACK = '"Microsoft YaHei", "微软雅黑", sans-serif';

/** CSS `font-family` stacks; downloaded fonts include system fallbacks. */
export const UI_FONT_STACKS: Record<BuiltinUiFont, string> = {
  "microsoft-yahei": FALLBACK_STACK,
  yozai: `"Yozai", "悠哉字体", "悠哉", ${FALLBACK_STACK}`,
  xiaolai: `"Xiaolai", "Xiaolai SC", "小赖字体", "小赖", ${FALLBACK_STACK}`,
};

export const DEFAULT_UI_FONT: UiFont = "microsoft-yahei";

const CUSTOM_PREFIX = "custom:";

const loadedFontFaces = new Map<UiFont, FontFace>();
const loadingFontFaces = new Map<UiFont, Promise<void>>();

export function isDownloadableUiFont(value: string): value is Exclude<BuiltinUiFont, "microsoft-yahei"> {
  return value === "xiaolai" || value === "yozai";
}

export function isCustomUiFont(value: unknown): value is CustomUiFont {
  return typeof value === "string" && value.startsWith(CUSTOM_PREFIX) && value.length > CUSTOM_PREFIX.length;
}

export function customUiFont(fileId: string): CustomUiFont {
  return `${CUSTOM_PREFIX}${fileId}`;
}

export function customUiFontFileId(font: CustomUiFont): string {
  return font.slice(CUSTOM_PREFIX.length);
}

/** Stable, quote-free family name so arbitrary file names never break the CSS stack. */
export function customUiFontFamily(font: CustomUiFont): string {
  let hash = 0x811c9dc5;
  for (const ch of customUiFontFileId(font)) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `Chestnut Custom ${hash.toString(16)}`;
}

export function resolveUiFont(value: unknown): UiFont {
  if (value === "microsoft-yahei" || isCustomUiFont(value)) return value;
  return DEFAULT_UI_FONT;
}

export function applyUiFont(font: UiFont): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--chestnut-font", getUiFontStack(font));
  document.documentElement.dataset.uiFont = font;
  if (isDownloadableUiFont(font) || isCustomUiFont(font)) {
    void loadDownloadedFontFace(font).catch(() => {});
  }
}

export function getUiFontStack(font: UiFont): string {
  if (isCustomUiFont(font)) return `"${customUiFontFamily(font)}", ${FALLBACK_STACK}`;
  return UI_FONT_STACKS[font];
}

export async function loadDownloadedFontFace(font: UiFont): Promise<void> {
  const custom = isCustomUiFont(font);
  if ((!custom && !isDownloadableUiFont(font)) || typeof document === "undefined") return;
  if (loadedFontFaces.has(font)) return;
  const pending = loadingFontFaces.get(font);
  if (pending) return pending;
  const task = (async () => {
    const { isTauri } = await import("@chestnut/storage-adapters");
    if (!isTauri()) return;
    const desktop = await import("./ui-font-desktop.js");
    const face = custom
      ? new FontFace(
          customUiFontFamily(font),
          `url("${await desktop.customUiFontAssetUrl(customUiFontFileId(font))}")`,
        )
      : new FontFace(
          UI_FONT_FAMILIES[font as Exclude<BuiltinUiFont, "microsoft-yahei">],
          `url("${await desktop.uiFontAssetUrl(font)}") format("truetype")`,
        );
    await face.load();
    document.fonts.add(face);
    loadedFontFaces.set(font, face);
  })();
  loadingFontFaces.set(font, task);
  try {
    await task;
  } finally {
    loadingFontFaces.delete(font);
  }
}

export function unloadDownloadedFontFace(font: UiFont): void {
  const face = loadedFontFaces.get(font);
  if (!face || typeof document === "undefined") return;
  document.fonts.delete(face);
  loadedFontFaces.delete(font);
}

export async function resolvePersistedUiFont(saved: UiFont): Promise<UiFont> {
  if (isCustomUiFont(saved)) {
    const { listCustomUiFonts } = await import("./ui-font-desktop.js");
    const fonts = await listCustomUiFonts();
    if (!fonts.some((item) => item.id === customUiFontFileId(saved))) return DEFAULT_UI_FONT;
  } else if (isDownloadableUiFont(saved)) {
    const { listInstalledUiFonts } = await import("./ui-font-desktop.js");
    const installed = await listInstalledUiFonts();
    if (!installed.includes(saved)) return DEFAULT_UI_FONT;
  } else {
    return saved;
  }
  try {
    await loadDownloadedFontFace(saved);
  } catch {
    return DEFAULT_UI_FONT;
  }
  return saved;
}
