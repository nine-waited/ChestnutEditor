import { describe, expect, it } from "vitest";
import { DEFAULT_UI_FONT, isDownloadableUiFont, resolveUiFont } from "./ui-font.js";

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
