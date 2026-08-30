---
name: desktop-release
description: >-
  Package a Chestnut Editor Windows NSIS installer, write the bilingual changelog,
  commit/push, then create a GitHub tag and (pre-)release with the installer attached.
  Use when the user says 出包, 发版, 出版本, release, tag, pre-release, 安装包, or bump
  v0.x.0.
---

# Chestnut 桌面版发版

在**仓库根目录**执行。参考上一版：`v0.8.0-CHANGELOG.md` 与 GitHub tag `v0.8.0`。

## 用户必须先确认

用 AskQuestion（或对话）确认，**不要默认**：

1. **版本号**（如 `0.9.0`）→ tag 为 `v0.9.0`
2. **GitHub 类型**：`pre-release`（预发布）或正式 `release`

未指定类型时先问；v0.8.0 起 GitHub 上为 Pre-release。

## 流程清单

```
- [ ] 1. 升版本（含顶栏 logo 旁 vX.Y.Z）
- [ ] 2. 写根目录 vX.Y.Z-CHANGELOG.md
- [ ] 3. MSVC 打 NSIS 安装包
- [ ] 4. commit（含 changelog + 版本号 + skill 若有改）
- [ ] 5. pnpm test:data-safety → 通过才 push main
- [ ] 6. annotated tag vX.Y.Z → push tag
- [ ] 7. 系统 Edge 打开 GitHub，登录态不够则让用户登录
- [ ] 8. 创建 GitHub Release（标题/描述按 v0.8.0），上传安装包
```

## 1. 升版本

同步改这些文件（字符串 `0.8.0` → 目标版本，**不要**改 Cargo.lock 里无关 crate 的 `0.8.0`）：

| 文件 | 字段 |
|------|------|
| `package.json` | `version` |
| `apps/desktop/package.json` | `version` |
| `apps/desktop/src-tauri/tauri.conf.json` | `version` |
| `apps/desktop/src-tauri/Cargo.toml` | `[package] version` |
| `apps/desktop/src-tauri/Cargo.lock` | 仅 `name = "chestnut-desktop"` 的 `version` |
| `packages/ui/src/app-version.ts` | `CHESTNUT_APP_VERSION`（顶栏显示 `v{该值}`） |

构建时 Cargo 可能再写 `Cargo.lock`，以构建后为准。

## 2. 更新文档

新建 `vX.Y.Z-CHANGELOG.md`，**对照 `v0.8.0-CHANGELOG.md`**：

- 标题：`# Chestnut Editor vX.Y.Z`
- **简体中文在前、English 在后**，用 `---` 分隔
- 一段产品简介 +「无需专有数据库 / 不依赖云端」
- `### 下载` 表：安装包名、Win10+ x64、WebView2、默认库 `~/.chestnut`
- **构建产物**路径（MSVC target）
- `### vX.Y.Z 新内容` / `### What's New`：按主题分组，写用户能感知的能力，不要堆 commit hash
- `### 从 v{上一小版本}.x 升级`：无迁移则写「无需迁移知识库」

安装包文件名：`Chestnut_X.Y.Z_x64-setup.exe`

构建产物：

`apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Chestnut_X.Y.Z_x64-setup.exe`

内容来源：`git log <上一发版 commit>..HEAD`（不要用可能错位的旧 tag；本地 `v0.8.0` 曾指到发版 commit 之前）。

## 3. 出安装包

与 [start-desktop](../start-desktop/SKILL.md) 相同：必须 **vcvars64 + `-t x86_64-pc-windows-msvc`**。

```powershell
cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat`" && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cd /d <repo-root> && pnpm build:desktop"
```

首次或失败可改 `pnpm build:desktop:win64`（会先 clean）。成功标志：上述 NSIS `setup.exe` 存在且体积合理（约 20–40 MB）。

## 4. Commit

用户已说发版/出包即视为要求提交。排除 `.idea/`、`.tmp/`、`tsconfig.tsbuildinfo`、密钥。

```powershell
git add package.json apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tauri.conf.json packages/ui/src/app-version.ts vX.Y.Z-CHANGELOG.md
git commit -m "Release vX.Y.Z: bump version and add changelog."
```

## 5. Push（门禁）

按 [git-sync](../git-sync/SKILL.md) + [data-loss-safety](../data-loss-safety/SKILL.md)：

```powershell
pnpm test:data-safety
git fetch origin
git pull origin main
git push origin main
```

失败则停止，**不要** `--no-verify`。对话里展示 core/ui 用例数。

## 6. Git tag

Annotated tag，与历史一致：`v0.8.0`、`v0.7.0`… 打在**刚推送的发版 commit**上。

```powershell
git tag -a vX.Y.Z -m "Chestnut Editor vX.Y.Z"
git push origin vX.Y.Z
```

不要 force 已有 tag。

## 7–8. GitHub Release（系统 Edge）

仓库：`https://github.com/nine-waited/ChestnutEditor`

**必须用系统 Microsoft Edge**（用户配置文件，可保存登录），不要用 Cursor 内嵌浏览器凑合。

```powershell
Start-Process msedge "https://github.com/nine-waited/ChestnutEditor"
```

若出现登录页：停下来让用户在 Edge 里登录，确认能打开仓库后再继续。

### 发布元数据（对齐 v0.8.0）

| 项 | 值 |
|----|-----|
| Tag | `vX.Y.Z` |
| 标题 | `Chestnut Editor VX.Y.Z (Windows x64)`（注意 **V** 大写） |
| 描述 | `vX.Y.Z-CHANGELOG.md` 全文 |
| 类型 | 用户选的 pre-release 或 Latest release |
| 资产 | `Chestnut_X.Y.Z_x64-setup.exe` |

### 用 GitHub CLI 上传（登录也走 Edge）

本机常无 `gh`。需要时：

```powershell
winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
```

然后把 Edge 设为本次浏览器，并登录：

```powershell
$env:BROWSER = "msedge"
gh auth login --hostname github.com --git-protocol https --web
```

设备码流程若打开了 Edge：让用户在已登录的 GitHub 会话里授权。`gh auth status` 成功后再发：

```powershell
# 预发布（默认，与 v0.8.0 相同）
gh release create vX.Y.Z "<installer-path>" --repo nine-waited/ChestnutEditor --title "Chestnut Editor VX.Y.Z (Windows x64)" --notes-file "vX.Y.Z-CHANGELOG.md" --prerelease

# 正式版：去掉 --prerelease，可加 --latest
```

上传完成后打开：

`https://github.com/nine-waited/ChestnutEditor/releases/tag/vX.Y.Z`

核对：Pre-release 标记、描述=更新文档、安装包可下载。

### CLI 不可用时的网页兜底

Edge 打开：

`https://github.com/nine-waited/ChestnutEditor/releases/new?tag=vX.Y.Z`

指导用户：标题按上表、描述粘贴 changelog、勾选 **Set as a pre-release**（若选了预发布）、Attach 安装包、Publish。Agent 尽量用 `gh` 自动完成，避免让用户手传大文件。

## 不要做的事

- 不要把安装包、`target/` 提交进 git
- 不要改无关 crate 版本
- 不要在 data-safety 失败时 push
- 不要 `git push --force` 到 `main` 或覆盖远程 tag
- 不要把 GitHub token 写入仓库或 skill
- 不要用 Chromium 一次性 profile 代替系统 Edge（登录态丢了）

## 完成后告诉用户

- 版本与顶栏 `vX.Y.Z`
- 安装包绝对路径与大约体积
- commit / tag / GitHub Release URL
- pre-release 还是正式版
