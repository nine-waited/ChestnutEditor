# Plugin Guide

## Install a plugin

1. Pack a `.zip` that contains `manifest.json` at the root (or one folder deep) plus `main.js` and any assets.
2. In **Settings → Plugins**, drop the zip. Chestnut Editor unpacks it to `{installDir}/plugins/{id}/` (next to the app executable), not the notes vault.
3. Select the plugin in the list to load it; click again to unload.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "main": "main.js",
  "minAppVersion": "0.1.0"
}
```

`main.js` should export `onLoad` / `onUnload`. Load assets with `api.getResourceUrl("widget.css")` (and the same for JS, images, audio).

## PluginApi surface

| API | Purpose |
|-----|---------|
| `commands` | Register command palette entries |
| `workspace` | Open files, graph, settings |
| `vault` | Read/write markdown, list files |
| `metadataCache` | Backlinks, tags, file cache |
| `stats` | Today's Markdown input units and vault totals |
| `getResourceUrl` | Resolve a file under `{installDir}/plugins/{id}/` |
| `events` | `file-open`, `file-save`, `file-create`, `file-delete`, `writing-stats`, etc. |
| `statusBar` | Status bar items |
| `loadData` / `saveData` | Persist plugin state in `{installDir}/plugins/{id}/data.json` |
| `addSettingsTab` | Settings UI tab |
| `log` | Prefixed console logging |

## Example

See [examples/plugins/hello-world](../examples/plugins/hello-world/).

## TypeScript

For editor hints, reference `@chestnut/plugin-sdk` types in JSDoc:

```js
/** @type {import('@chestnut/plugin-sdk').PluginExports} */
export const onLoad = (api) => { ... };
```

## Experimental

Plugin API is **v0.1 experimental**. Breaking changes may occur until v1.0; use `minAppVersion` in manifest.
