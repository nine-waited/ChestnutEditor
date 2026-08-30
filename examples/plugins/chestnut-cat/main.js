/** @type {import('@chestnut/plugin-sdk').PluginExports} */
let pet;
let unsubStats = () => {};
let cssLink;

export async function onLoad(api) {
  cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = await api.getResourceUrl("widget.css");
  cssLink.dataset.chestnutCat = "css";
  document.head.appendChild(cssLink);

  const mod = await import(/* @vite-ignore */ await api.getResourceUrl("widget.js"));
  pet = mod.mountChestnutPet({
    host: document.body,
    getAssetUrl: (rel) => api.getResourceUrl(rel),
    stats: api.stats.getSnapshot(),
  });
  unsubStats = api.events.on("writing-stats", (data) => {
    pet?.setStats?.(data);
  });
  api.log("Chestnut Cat loaded");
}

export async function onUnload() {
  unsubStats();
  pet?.destroy?.();
  pet = undefined;
  cssLink?.remove();
}
