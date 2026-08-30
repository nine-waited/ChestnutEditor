export type UiFont = "microsoft-yahei" | "yozai" | "xiaolai";

export const UI_FONTS: Array<{ value: UiFont; labelKey: string }> = [
  { value: "microsoft-yahei", labelKey: "settings.fontMicrosoftYaHei" },
  { value: "xiaolai", labelKey: "settings.fontXiaolai" },
  { value: "yozai", labelKey: "settings.fontYozai" },
];

export const DOWNLOADABLE_UI_FONTS: UiFont[] = ["xiaolai", "yozai"];

/** CSS family names used in @font-face after a handwriting font is downloaded. */
export const UI_FONT_FAMILIES: Record<Exclude<UiFont, "microsoft-yahei">, string> = {
  yozai: "Yozai",
  xiaolai: "Xiaolai",
};

/** CSS `font-family` stacks; downloaded fonts include system fallbacks. */
export const UI_FONT_STACKS: Record<UiFont, string> = {
  "microsoft-yahei": '"Microsoft YaHei", "微软雅黑", sans-serif',
  yozai: '"Yozai", "悠哉字体", "悠哉", "Microsoft YaHei", "微软雅黑", sans-serif',
  xiaolai: '"Xiaolai", "Xiaolai SC", "小赖字体", "小赖", "Microsoft YaHei", "微软雅黑", sans-serif',
};

export const DEFAULT_UI_FONT: UiFont = "microsoft-yahei";

const loadedFontFaces = new Map<UiFont, FontFace>();
const loadingFontFaces = new Map<UiFont, Promise<void>>();

export function isDownloadableUiFont(value: string): value is Exclude<UiFont, "microsoft-yahei"> {
  return value === "xiaolai" || value === "yozai";
}

export function resolveUiFont(value: unknown): UiFont {
  if (typeof value === "string" && value in UI_FONT_STACKS) {
    return value as UiFont;
  }
  return DEFAULT_UI_FONT;
}

export function applyUiFont(font: UiFont): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--boke-font", UI_FONT_STACKS[font]);
  document.documentElement.dataset.uiFont = font;
  if (isDownloadableUiFont(font)) {
    void loadDownloadedFontFace(font).catch(() => {});
  }
}

export function getUiFontStack(font: UiFont): string {
  return UI_FONT_STACKS[font];
}

export async function loadDownloadedFontFace(font: UiFont): Promise<void> {
  if (!isDownloadableUiFont(font) || typeof document === "undefined") return;
  if (loadedFontFaces.has(font)) return;
  const pending = loadingFontFaces.get(font);
  if (pending) return pending;
  const task = (async () => {
    const { isTauri } = await import("@chestnut/storage-adapters");
    if (!isTauri()) return;
    const { uiFontAssetUrl } = await import("./ui-font-desktop.js");
    const url = await uiFontAssetUrl(font);
    const family = UI_FONT_FAMILIES[font];
    const face = new FontFace(family, `url("${url}") format("truetype")`);
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
  if (!isDownloadableUiFont(saved)) return saved;
  const { listInstalledUiFonts } = await import("./ui-font-desktop.js");
  const installed = await listInstalledUiFonts();
  if (!installed.includes(saved)) return DEFAULT_UI_FONT;
  try {
    await loadDownloadedFontFace(saved);
  } catch {
    return DEFAULT_UI_FONT;
  }
  return saved;
}
