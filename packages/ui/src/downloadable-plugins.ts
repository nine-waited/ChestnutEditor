export const DOWNLOADABLE_PLUGIN_IDS = ["chestnut-cat"] as const;

export type DownloadablePluginId = (typeof DOWNLOADABLE_PLUGIN_IDS)[number];

export const DOWNLOADABLE_PLUGINS: Array<{
  id: DownloadablePluginId;
  nameKey: string;
  descKey: string;
}> = [{ id: "chestnut-cat", nameKey: "settings.pluginChestnutCat", descKey: "settings.pluginChestnutCatHint" }];

export const PLUGIN_DOWNLOAD_BYTES: Record<DownloadablePluginId, number> = {
  "chestnut-cat": 19_135_103,
};

export const PLUGIN_DOWNLOAD_URL =
  "https://github.com/nine-waited/ChestnutCat/releases/download/v1.0.0/chestnut-cat-1.0.0.zip";

export function isDownloadablePluginId(id: string): id is DownloadablePluginId {
  return (DOWNLOADABLE_PLUGIN_IDS as readonly string[]).includes(id);
}
