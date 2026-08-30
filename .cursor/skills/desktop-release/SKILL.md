---
name: desktop-release
description: >-
  Package a Chestnut Editor Windows NSIS installer, write the bilingual changelog,
  commit/push, then create or replace a GitHub tag and (pre-)release with the
  installer. Use when the user says 出包, 发版, 出版本, release, tag, pre-release,
  安装包, 替换安装包, or bump v0.x.0.
---

# Chestnut 桌面版发版

在**仓库根目录**执行。对照上一版 changelog（如 `v0.9.0-CHANGELOG.md`）与 GitHub tag 标题。

## 用户必须先确认

用 AskQuestion（或对话）确认，**不要默认**：

1. **版本号**（如 `0.9.0`）→ tag 为 `v0.9.0`
2. **GitHub 类型**：`pre-release`（预发布）或正式 `release`
3. 若该 tag **已存在**且用户要换包：走「替换已发布安装包」，不要另开一套新版本（除非用户要升号）

未指定类型时先问；v0.8.0 起 GitHub 上为 Pre-release。

## 流程清单

```
- [ ] 1. 升版本（含顶栏 logo 旁 vX.Y.Z）
- [ ] 2. 写根目录 vX.Y.Z-CHANGELOG.md
- [ ] 3. 先修会挡住 `tsc -b` 的类型错误，再 MSVC 打 NSIS
- [ ] 4. 核对安装包体积（约 28 MB；>40 MB 则停）
- [ ] 5. commit（changelog + 版本号 + 为出包修的 TS）
- [ ] 6. pnpm test:data-safety → 通过才 push main（注意代理）
- [ ] 7. annotated tag 打在刚推送的发版 commit 上 → push tag
- [ ] 8. 系统 Edge + gh（设备码）登录 GitHub
- [ ] 9. 创建或替换 GitHub Release，上传安装包，用 API 核对字节数
```

## 1. 升版本

同步改这些文件（**不要**改 Cargo.lock 里无关 crate 的同号版本，例如别的包也叫 `0.8.0`）：

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

新建 `vX.Y.Z-CHANGELOG.md`，**对照最近一版**（中文在前）：

- 标题：`# Chestnut Editor vX.Y.Z`
- **简体中文在前、English 在后**，用 `---` 分隔
- 一段产品简介 +「无需专有数据库 / 不依赖云端」
- `### 下载` 表：安装包名、Win10+ x64、WebView2、默认库 `~/.chestnut`
- **构建产物**路径（MSVC target，见下）
- `### vX.Y.Z 新内容` / `### What's New`：按主题分组，写用户能感知的能力，不要堆 commit hash
- `### 从 v{上一小版本}.x 升级`：无迁移则写「无需迁移知识库」

安装包文件名：`Chestnut_X.Y.Z_x64-setup.exe`

构建产物（**不是** `target/release/bundle/`）：

`apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Chestnut_X.Y.Z_x64-setup.exe`

内容来源：`git log <上一发版 commit>..HEAD`。  
**不要**盲信本地旧 tag：`v0.8.0` 曾指到发版 commit 之前。用「Release vX.Y.Z」那次 commit，或 `gh release view` 对上的 SHA。

## 3. 出安装包

与 [start-desktop](../start-desktop/SKILL.md) 相同：必须 **vcvars64 + `-t x86_64-pc-windows-msvc`**。

`pnpm build:desktop` 会先跑 `tsc -b && vite build`。类型错误会在 Rust 之前失败（v0.9.0 曾卡在 `markdown-table-ops.ts` 的 `Node | null`）。**修类型后再打**，修动可并进发版 commit。

```powershell
cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat`" && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cd /d <repo-root> && pnpm build:desktop"
```

PowerShell 里不要用 `&&`（除非在 `cmd /c` 内）。首次或失败可改 `pnpm build:desktop:win64`（会先 clean）。

### 体积门禁（必做）

打完立刻量体积。正常 **约 28–30 MB**（v0.8.0 ≈ 28.4，去掉桌宠后的 v0.9.0 ≈ 28.5）。

| 现象 | 原因 | 处理 |
|------|------|------|
| ≈ **47 MB** | `apps/desktop/public/chestnut-cat/` 被 Vite 拷进 `dist`（表情 PNG 约 18×1 MB，NSIS 压不动） | **禁止上传**。桌宠只放 `examples/plugins/chestnut-cat/`，用 `api.getResourceUrl` 加载；用户 zip 安装 |
| `dist/chestnut-cat` 仍在 | public 没清干净或旧 dist | 删 public 下大资源后重打 |
| `dist/assets` 里大量 `.woff2`（约 22 MB 未压） | 前端字体，0.8.0 起就有 | 可压进 28 MB 包，不是 47 MB 主因 |

**不要**把大图、桌宠、示例插件资源放进 `apps/desktop/public/`（Vite 会打进安装包）。

## 4. Commit

用户已说发版/出包/替换安装包即视为要求提交。排除 `.idea/`、`.tmp/`、`tsconfig.tsbuildinfo`、密钥、安装包本身、`target/`。

```powershell
git add package.json apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tauri.conf.json packages/ui/src/app-version.ts vX.Y.Z-CHANGELOG.md
git commit -m "Release vX.Y.Z: bump version and add changelog."
```

PowerShell 用 `-m "单行"`，不要 bash heredoc。

## 5. Push（门禁 + 代理）

按 [git-sync](../git-sync/SKILL.md) + [data-loss-safety](../data-loss-safety/SKILL.md)：

```powershell
pnpm test:data-safety
```

对话里展示 core/ui 文件数与用例数。失败则停止，**不要** `--no-verify`。

本机 `git config http.proxy` 常是 `http://127.0.0.1:7890`。**Clash 没开时 git/gh 会立刻失败**；Watt Toolkit 有时能让**直连** GitHub 成功。

**不要改 git config。** 本次命令覆盖即可：

```powershell
git -c http.proxy= -c https.proxy= fetch origin
git -c http.proxy= -c https.proxy= pull origin main
git -c http.proxy= -c https.proxy= push origin main
```

`gh` 同样清掉代理环境变量（不要写进仓库）：

```powershell
$env:HTTP_PROXY = ""; $env:HTTPS_PROXY = ""; $env:http_proxy = ""; $env:https_proxy = ""
```

直连也超时：让用户打开 Watt Toolkit / 代理后再试。

## 6. Git tag

Annotated tag（`v0.9.0`、`v0.8.0`…）打在**刚推送的发版 commit**上。

```powershell
git tag -a vX.Y.Z -m "Chestnut Editor vX.Y.Z"
git -c http.proxy= -c https.proxy= push origin vX.Y.Z
```

新建版本：**不要** force 已有 tag。用户明确说「替换」已发布包时，才走下面替换流程。

## 7–8. GitHub Release（系统 Edge + gh）

仓库：`https://github.com/nine-waited/ChestnutEditor`

**必须用系统 Microsoft Edge**（用户配置文件），不要用 Cursor 内嵌浏览器。

### 发布元数据（对齐 v0.8.0 / v0.9.0）

| 项 | 值 |
|----|-----|
| Tag | `vX.Y.Z` |
| 标题 | `Chestnut Editor VX.Y.Z (Windows x64)`（注意 **V** 大写） |
| 描述 | `vX.Y.Z-CHANGELOG.md` 全文 |
| 类型 | 用户选的 pre-release 或 Latest release |
| 资产 | `Chestnut_X.Y.Z_x64-setup.exe` |

### 安装 / 登录 gh

本机常无 `gh`：

```powershell
winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
```

装完**刷新 PATH**（新开的 shell 才有 `gh.exe`，典型路径 `C:\Program Files\GitHub CLI\gh.exe`）。

登录走设备码 + Edge（把代码**立刻发给用户**，旧码作废）：

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:BROWSER = "msedge"
$env:HTTP_PROXY = ""; $env:HTTPS_PROXY = ""; $env:http_proxy = ""; $env:https_proxy = ""
Start-Process msedge "https://github.com/login/device"
"Y" | gh auth login --hostname github.com --git-protocol https --web
```

终端出现 `First copy your one-time code: XXXX-XXXX` 后：**停下来把新码发给用户**。不要用上一轮的码。授权成功：`Logged in as nine-waited`。

OAuth `access_token` 超时：多半是代理/墙；清代理重试，或等用户开 Watt Toolkit。`gh auth status` 成功后再发 Release。

**不要**把 token 写进对话摘要、仓库或 skill。

### 创建

```powershell
# 预发布（与 v0.8.0 / v0.9.0 相同）
gh release create vX.Y.Z "<installer-path>" --repo nine-waited/ChestnutEditor --title "Chestnut Editor VX.Y.Z (Windows x64)" --notes-file "vX.Y.Z-CHANGELOG.md" --prerelease

# 正式版：去掉 --prerelease，可加 --latest
```

### 替换已发布安装包（用户说「替换」）

在**新安装包已打好、体积合格、相关代码已 push 到 main** 之后：

```powershell
git tag -f -a vX.Y.Z -m "Chestnut Editor vX.Y.Z"
git -c http.proxy= -c https.proxy= push origin vX.Y.Z --force
gh release upload vX.Y.Z "<installer-path>" --repo nine-waited/ChestnutEditor --clobber
gh api repos/nine-waited/ChestnutEditor/releases/tags/vX.Y.Z --jq ".assets[] | {name, size}"
```

- `--force` **只用于该版本 tag**，**禁止** force push `main`
- `--clobber` 覆盖同名 exe；用 `size` 确认是新体积（例如 29853083 ≈ 28.5 MB，而不是 47 MB）

### 核对

打开 `https://github.com/nine-waited/ChestnutEditor/releases/tag/vX.Y.Z`：

- Pre-release 标记与用户选择一致
- 描述 = 更新文档全文
- 安装包可下载且体积对得上

网页兜底：`https://github.com/nine-waited/ChestnutEditor/releases/new?tag=vX.Y.Z`（尽量用 `gh`，避免手传大文件）。

## 不要做的事

- 不要把安装包、`target/`、`dist/` 提交进 git
- 不要把桌宠/大 PNG 放进 `apps/desktop/public/`
- 不要改无关 crate 版本
- 不要在 data-safety 失败时 push
- 不要 `git push --force` 到 `main`
- 不要在用户未要求替换时 force 远程 tag
- 不要把 GitHub token 写入仓库或 skill
- 不要用一次性 Chromium profile 代替系统 Edge
- 不要改 `git config` 里的 proxy；用 `-c http.proxy=` 覆盖

## 完成后告诉用户

- 版本与顶栏 `vX.Y.Z`
- 安装包绝对路径与大约体积（以及是否已排除桌宠）
- commit / tag / GitHub Release URL
- pre-release 还是正式版
- 若刚替换过包：GitHub 资源的新 `size`
