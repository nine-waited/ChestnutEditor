# Architecture

## Overview

Chestnut is a pnpm monorepo: **Tauri desktop app** + shared TypeScript packages. v0.1 focuses on local folder access and configurable cloud storage via REST API.

```mermaid
flowchart LR
  Desktop[apps/desktop] --> UI[packages/ui]
  UI --> Core[packages/core]
  UI --> Adapters[packages/storage-adapters]
  Core --> SDK[packages/plugin-sdk]
  Adapters --> Core
  Cloud[server FastAPI] -.-> Adapters
```

## Vault layout

```
my-vault/
├── notes/*.md
├── attachments/*
├── .chestnut/
│   ├── plugins/{id}/manifest.json + main.js
│   └── themes/*.css
└── .obsidian/   (read-only compat, optional)
```

## Storage adapters

| Adapter | Runtime | Use case |
|---------|---------|----------|
| `TauriFsAdapter` | Desktop | Local folder — primary path |
| `RemoteRestAdapter` | Desktop | Cloud vault via REST API |

Both implement `VaultAdapter` in `packages/core/src/vault/types.ts`.

## Metadata pipeline

1. On vault mount → `VaultService.reindex()` reads all `.md` files
2. `parseMarkdownFile()` extracts frontmatter, wikilinks, embeds, tags, headings
3. `MetadataCache` maintains backlink index and graph edges
4. `SearchIndex` (MiniSearch) indexes title + body + tags

## Plugin host

Plugins are ES modules loaded from `{installDir}/plugins/{id}/main.js` (imported as a zip, not stored in the notes vault). They receive a whitelisted `PluginApi` (no raw `fs` / `require`).

Lifecycle: `onLoad(api)` → register commands / status bar → `onUnload(api)` on disable.

## Security model

- Desktop plugins: API whitelist only
- Cloud server: Bearer token, path traversal checks (see `server/main.py`)
- Tauri: native folder picker, scoped to user-selected root

## Blog publish

Notes with `publish: true` in frontmatter are listed in the Publish panel. Export generates concatenated HTML pages + RSS XML for static hosting.
