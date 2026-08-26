# Plugin Guide

## Install a plugin

1. Create `.chestnut/plugins/my-plugin/` in your vault
2. Add `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "main": "main.js",
  "minAppVersion": "0.1.0"
}
```

3. Add `main.js` exporting `onLoad` / `onUnload`
4. Enable in **Settings → Plugins**

## PluginApi surface

| API | Purpose |
|-----|---------|
| `commands` | Register command palette entries |
| `workspace` | Open files, graph, settings |
| `vault` | Read/write markdown, list files |
| `metadataCache` | Backlinks, tags, file cache |
| `stats` | Today's Markdown input units and vault totals |
| `getResourceUrl` | Resolve a file under this plugin's vault folder |
| `events` | `file-open`, `file-save`, `file-create`, `file-delete`, `writing-stats`, etc. |
| `statusBar` | Status bar items |
| `loadData` / `saveData` | Persist plugin state in `.chestnut/plugins/{id}/data.json` |
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
