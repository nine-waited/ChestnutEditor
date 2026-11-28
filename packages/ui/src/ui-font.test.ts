import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_FONT,
  customUiFont,
  customUiFontFamily,
  customUiFontFileId,
  getUiFontStack,
  isCustomUiFont,
  isDownloadableUiFont,
  resolveUiFont,
} from "./ui-font.js";

describe("custom UI fonts", () => {
  it("round-trips the imported file id and survives persistence", () => {
    const font = customUiFont("My Font (2).ttf");
    expect(isCustomUiFont(font)).toBe(true);
    expect(customUiFontFileId(font)).toBe("My Font (2).ttf");
    expect(resolveUiFont(font)).toBe(font);
    expect(isCustomUiFont("custom:")).toBe(false);
  });

  it("uses a quote-free family with a YaHei fallback", () => {
    const font = customUiFont('we"ird\\name.ttf');
    const family = customUiFontFamily(font);
    expect(family).toMatch(/^Chestnut Custom [0-9a-f]+$/);
    expect(customUiFontFamily(customUiFont("other.ttf"))).not.toBe(family);
    expect(getUiFontStack(font)).toBe(`"${family}", "Microsoft YaHei", "微软雅黑", sans-serif`);
  });
});

describe("resolveUiFont", () => {
  it("keeps Microsoft YaHei and drops removed handwriting fonts", () => {
    expect(resolveUiFont("microsoft-yahei")).toBe("microsoft-yahei");
    expect(resolveUiFont("xiaolai")).toBe(DEFAULT_UI_FONT);
    expect(resolveUiFont("yozai")).toBe(DEFAULT_UI_FONT);
    expect(resolveUiFont("unknown")).toBe(DEFAULT_UI_FONT);
  });
});

describe("isDownloadableUiFont", () => {
  it("marks handwriting fonts as optional downloads", () => {
    expect(isDownloadableUiFont("xiaolai")).toBe(true);
    expect(isDownloadableUiFont("yozai")).toBe(true);
    expect(isDownloadableUiFont("microsoft-yahei")).toBe(false);
  });
});
