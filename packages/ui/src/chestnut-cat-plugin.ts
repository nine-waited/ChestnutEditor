export const CHESTNUT_CAT_PLUGIN_ID = "chestnut-cat";

const MANIFEST = {
  id: CHESTNUT_CAT_PLUGIN_ID,
  name: "Chestnut Cat",
  version: "0.1.0",
  description: "Board-corner cat pet that shows today's Markdown writing stats",
  author: "Chestnut",
  main: "main.js",
  minAppVersion: "0.1.0",
};

const MAIN_JS = `/** @type {import('@chestnut/plugin-sdk').PluginExports} */
let pet;
let unsubStats = () => {};
let cssLink;

function publicBase() {
  return new URL("chestnut-cat/", document.baseURI).href.replace(/\\/$/, "");
}

export async function onLoad(api) {
  cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = publicBase() + "/widget.css";
  cssLink.dataset.chestnutCat = "css";
  document.head.appendChild(cssLink);

  const mod = await import(/* @vite-ignore */ publicBase() + "/widget.js");
  const snap = api.stats.getSnapshot();
  pet = mod.mountChestnutPet({
    host: document.body,
    assetBase: publicBase(),
    stats: snap,
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
`;

export async function ensureChestnutCatPlugin(adapter: {
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
  write: (path: string, content: string) => Promise<void>;
}): Promise<boolean> {
  const dir = `.chestnut/plugins/${CHESTNUT_CAT_PLUGIN_ID}`;
  const manifestPath = `${dir}/manifest.json`;
  const existed = await adapter.exists(manifestPath);
  await adapter.mkdir(dir);
  await adapter.write(manifestPath, JSON.stringify(MANIFEST, null, 2) + "\n");
  await adapter.write(`${dir}/main.js`, MAIN_JS);
  return !existed;
}
