# Chestnut Editor

**Chestnut Editor — a desktop app for local Markdown and Excalidraw files.**

English · [中文（简体）](README.md)

Repository: [github.com/nine-waited/ChestnutEditor](https://github.com/nine-waited/ChestnutEditor)

---

Chestnut Editor is a **Tauri 2** desktop app that reads and writes plain files in a folder you choose. Your vault is just files on disk — no proprietary database, no cloud requirement. Package scope is `@chestnut/*`; vault config lives under `.chestnut/`.

## Core design

1. Images in Markdown notes are managed automatically in a **same-name `_pic` folder**. The `_pic` directory and in-note image paths follow the note when you rename or move it.
2. Exported files are collected under a **`target` folder**, shown at the bottom of the file tree.
3. **Soft pin** (logical pin — does not move real files) keeps important notes and drawings easy to find.
4. **Double-tap Shift** for quick file open; **Ctrl+Shift+F** for full-text search with keyword matching.
5. Image actions inside Markdown are visual and more approachable.
6. More font choices for a more personal look and reading experience.

## Screenshot

![Chestnut Editor desktop UI](https://cdn.jsdelivr.net/gh/nine-waited/ChestnutEditor@main/docs/images/desktop-ui.png)

## For developers

### Monorepo layout

```
ChestnutEditor/
├── apps/desktop              # Tauri 2 shell (@chestnut/desktop)
├── packages/
│   ├── core                  # Vault service, metadata, search (@chestnut/core)
│   ├── ui                    # React UI (@chestnut/ui)
│   ├── storage-adapters      # Local filesystem adapter (@chestnut/storage-adapters)
│   └── plugin-sdk            # Plugin API types (@chestnut/plugin-sdk)
├── examples/sample-vault/    # Sample vault for local testing
└── docs/                     # Architecture and plugins
```

See [docs/architecture.md](docs/architecture.md) for vault layout, metadata pipeline, and plugins.

### Prerequisites

| Requirement | Notes |
|-------------|--------|
| Node.js 20+ | Required |
| pnpm 9+ | `packageManager` is pinned in root `package.json` |
| Rust (rustup) | For Tauri native build |
| Windows: MSVC Build Tools | **Desktop development with C++** workload; builds target `x86_64-pc-windows-msvc` |
| [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) | Platform-specific details |

On Windows, enable **Developer Mode** and consider disabling Smart App Control if Rust build scripts are blocked.

### Setup and development

```bash
git clone https://github.com/nine-waited/ChestnutEditor.git
cd ChestnutEditor
pnpm install
pnpm dev
```

- `pnpm dev` runs `tauri dev` with MSVC target (port **1420** for embedded Vite; not a standalone web app).
- First launch opens **`~/.chestnut`** (created if missing).
- Sample vault: point the toolbar path to `examples/sample-vault`.

Other root scripts:

| Script | Purpose |
|--------|---------|
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run package tests |
| `pnpm build:desktop` | Tauri release build (x64 MSVC) |
| `pnpm build:desktop:win64` | Clean desktop build cache, then release build |
| `pnpm clean:desktop` | Remove desktop build artifacts |

**Windows installer (x64 NSIS):**

```bash
pnpm build:desktop:win64
```

Output: `apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Chestnut_*-setup.exe`

### Desktop app icons

In-app toolbar shows the **Chestnut** text brand. Window, taskbar, and installer icons come from bundled PNG artwork.

When icon source changes:

```bash
cd apps/desktop
pnpm tauri icon public/app-icon-source.png
# Windows PowerShell — refresh web favicon:
Copy-Item src-tauri/icons/128x128.png public/favicon.png -Force
```

Source: `apps/desktop/public/app-icon-source.png` (1024×1024). Details: [apps/desktop/src-tauri/icons/README.md](apps/desktop/src-tauri/icons/README.md).

### Vault conventions (contributors)

| Item | Convention |
|------|------------|
| Default vault path | `~/.chestnut` on first desktop launch |
| App config inside vault | `.chestnut/` (plugins, themes) |
| Notes / drawings | `.md`, `.excalidraw` |
| Pasted note images | `{NoteName}_pic/` beside the note |
| Deletes | Moved to system Recycle Bin (desktop) |

**In-vault welcome docs (not this file):** on vault mount, the app creates missing `README_en.md` and `README_cn.md` at the vault root (`packages/ui/src/default-readme.ts`). Those are end-user onboarding inside the vault; this repository README is for developers.

### Internationalization

- Repository README: Chinese by default (`README.md`); English at [README.en.md](README.en.md).
- App UI: **English** and **简体中文** (Settings → language).
- Message catalog: `packages/ui/src/i18n/messages.ts`.
- Vault welcome READMEs are bilingual as above.

### Plugin development

See [docs/plugin-guide.md](docs/plugin-guide.md). Plugins load from `.chestnut/plugins/{id}/` as ES modules with a whitelisted API.

---

## Features (current)

**Vault and file tree**

- Editable vault path in toolbar; folder picker; copy path
- Resizable, collapsible file sidebar (drag boundary; double-click tab to toggle)
- Create, rename, delete; delete to Recycle Bin
- Drag-and-drop move with ghost preview; drop outside tree moves to vault root
- Reveal active file in tree; collapse all folders
- Context menu: export Markdown as PDF, bulk tab close, and more

**Markdown**

- Live preview (Milkdown) and source mode (CodeMirror)
- `[[wikilinks]]`, `![[embeds]]`, `#tags`, YAML frontmatter
- Outline panel; inline title bar renames the note file
- Paste or drag images; stored in `{note}_pic/`
- Live image selection, caption editing, optional `_pic` cleanup
- Image lightbox (toolbar or double-click); image viewer from tree or note
- Export to PDF with in-app viewer and progress dialog

**Excalidraw**

- Open and edit `.excalidraw` in-app; auto-save to vault file

**Appearance and settings**

- Light / dark theme (Markdown + Excalidraw); preference persisted
- Font picker: Microsoft YaHei (default), Xiaolai, Yozai handwriting fonts; OFL-licensed

**Navigation**

- Quick open (`Shift+Shift` default), full-text search (`Ctrl+Shift+F` default)
- Customizable shortcuts; tab bar with scroll and context actions
- `Ctrl+S` saves current note or drawing immediately

Auto-save debounce: Markdown ~400 ms, Excalidraw ~600 ms.

## Interface overview

| Area | Description |
|------|-------------|
| **Top toolbar** | Vault path (editable), **Chestnut** brand, quick open, search, settings |
| **Left sidebar** | New note / Excalidraw / folder; file tree |
| **Editor (center)** | Tabs; Live / Source for Markdown; title bar |
| **Outline (right)** | Heading TOC; click to jump |
| **Status bar** | App status (e.g. Ready) |

## Keyboard shortcuts

| Action | Default |
|--------|---------|
| Quick open | `Shift+Shift` |
| Full-text search | `Ctrl+Shift+F` |
| Save | `Ctrl+S` |

## License

MIT — see [LICENSE](LICENSE).
