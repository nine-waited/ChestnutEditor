/** @type {import('@chestnut/plugin-sdk').PluginExports} */
let pet;
let unsubStats = () => {};
let cssLink;

function publicBase() {
  return new URL("chestnut-cat/", document.baseURI).href.replace(/\/$/, "");
}

export async function onLoad(api) {
  cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = publicBase() + "/widget.css?v=20260827d";
  cssLink.dataset.chestnutCat = "css";
  document.head.appendChild(cssLink);

  const mod = await import(/* @vite-ignore */ publicBase() + "/widget.js?v=20260827d");
  pet = mod.mountChestnutPet({
    host: document.body,
    assetBase: publicBase(),
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
