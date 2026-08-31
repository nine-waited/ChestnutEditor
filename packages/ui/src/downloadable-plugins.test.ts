import { describe, expect, it } from "vitest";
import {
  DOWNLOADABLE_PLUGINS,
  PLUGIN_DOWNLOAD_BYTES,
  PLUGIN_DOWNLOAD_URL,
  isDownloadablePluginId,
} from "./downloadable-plugins.js";

describe("downloadable plugins", () => {
  it("offers Chestnut Cat as an optional GitHub download", () => {
    expect(DOWNLOADABLE_PLUGINS.map((item) => item.id)).toEqual(["chestnut-cat"]);
    expect(isDownloadablePluginId("chestnut-cat")).toBe(true);
    expect(isDownloadablePluginId("hello-world")).toBe(false);
    expect(PLUGIN_DOWNLOAD_BYTES["chestnut-cat"]).toBe(19_135_103);
    expect(PLUGIN_DOWNLOAD_URL).toBe(
      "https://github.com/nine-waited/ChestnutCat/releases/download/v1.0.0/chestnut-cat-1.0.0.zip",
    );
  });
});
