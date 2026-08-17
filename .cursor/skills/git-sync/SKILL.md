---
name: git-sync
description: >-
  Bidirectional Git sync (pull + push) for the Chestnut Editor repo on GitHub. Use when the
  user asks to sync, pull, push, upload/download code, 同步, 拉取, 推送, or work
  with https://github.com/nine-waited/ChestnutEditor.git. Before every push, run
  data-loss-safety (pnpm test:data-safety); do not push if it fails.
---

# Chestnut Git 双向同步

在 **仓库根目录**（含 `package.json`，建议目录名 `chestnut/`）执行所有 Git 命令。

## 仓库约定

| 项 | 值 |
|---|---|
| 远程名 | `origin` |
| 远程 URL | `https://github.com/nine-waited/ChestnutEditor.git` |
| 主分支 | `main` |
| 作者（仅用户明确要求时配置） | `Nineee999` / `906992927@qq.com` |

首次克隆：

```powershell
git clone https://github.com/nine-waited/ChestnutEditor.git -b main
```

## 安全规则（必须遵守）

1. **不要**修改 `git config`（含 `--global`），除非用户明确要求。
2. **不要**创建 commit，除非用户明确要求提交或推送/同步时包含本地改动。
3. **不要**使用 `git push --force` 到 `main`，除非用户明确要求并知晓会覆盖远程历史。
4. **不要**提交密钥：`.env`、token、私钥等（已在 `.gitignore`）。
5. **不要**使用 `git commit --amend` / `rebase -i` 等交互式命令。
6. PowerShell 用 `;` 链接命令，**不要**用 `bash` 的 `&&` 或 heredoc 写 commit message。

## 同步前检查（并行执行）

```powershell
cd <repo-root>
git status
git remote -v
git branch -vv
git fetch origin
git status -sb
git log -3 --oneline
```

根据结果判断：

- 本地有未提交改动 → 见「提交本地改动」
- `behind origin/main` → 先 pull
- `ahead origin/main` → 可 push（pull 后再 push 更安全）
- `diverged` → pull 合并或 rebase，解决冲突后再 push

## 双向同步（默认流程）

用户说「同步」「双向同步」「pull 和 push」时，按顺序执行：

```
1. 同步前检查
2. 若有未提交改动且用户要一并上传 → 提交本地改动
3. Pull 远程 main
4. 若有冲突 → 解决冲突并提交 merge
5. pnpm test:data-safety（失败则禁止 push）
6. Push 到 origin main
7. 同步后验证
```

### 1. Pull

```powershell
git pull origin main
```

若提示 unrelated histories（首次合并两个独立仓库）：

```powershell
git pull origin main --allow-unrelated-histories --no-edit
```

若用户偏好线性历史且未产生冲突风险，可改用：

```powershell
git pull --rebase origin main
```

`rebase` 失败时：**不要** force，改用 `git rebase --abort` 后走 merge pull。

### 2. 解决冲突

1. `git status` 列出 `both modified` 文件
2. 打开文件，去掉 `<<<<<<<` / `=======` / `>>>>>>>` 标记
3. 保留正确内容（Chestnut 项目文档优先保留完整 `README.md`）
4. `git add <file>` → `git commit -m "Merge remote main and resolve conflicts."`

常见冲突：`README.md`（远程常为简短占位，本地为完整项目说明）。

### 3. Push（前必跑防丢失门禁）

**每次 push 前必须先执行** [data-loss-safety](../data-loss-safety/SKILL.md)：

```powershell
pnpm test:data-safety
```

失败则**停止**，修测试后再推。通过后：

```powershell
git push -u origin main
```

若远程拒绝（non-fast-forward）：

```powershell
git pull origin main
# 解决冲突后再次 pnpm test:data-safety，再
git push origin main
```

### 4. 同步后验证

```powershell
git status
git log -3 --oneline
git rev-parse HEAD origin/main
```

`HEAD` 与 `origin/main` 应指向同一提交；工作区应 clean。

## 仅 Pull

```powershell
cd <repo-root>
git fetch origin
git pull origin main
```

有冲突按「解决冲突」处理；**不要**自动 push。

## 仅 Push

```powershell
cd <repo-root>
git status
git fetch origin
pnpm test:data-safety
```

- **`pnpm test:data-safety` 失败 → 禁止 push**（见 [data-loss-safety](../data-loss-safety/SKILL.md)）
- 若有未提交改动：先问用户是否提交，或仅 push 已有 commit
- 若 behind remote：先 `git pull origin main`，再 push
- 然后：

```powershell
git push origin main
```

## 提交本地改动

仅在用户要求提交/推送/同步包含本地修改时执行。

1. 并行查看状态与 diff：

```powershell
git status
git diff
git diff --cached
git log -3 --oneline
```

2. 暂存（排除 `.env` 等敏感文件）：

```powershell
git add <paths>
```

3. 提交（PowerShell 单行 message）：

```powershell
git commit -m "简短说明做了什么以及为什么。"
```

4. pre-commit hook 失败：**不要** amend；修问题后**新建** commit。

## 远程未配置时

```powershell
git remote add origin https://github.com/nine-waited/ChestnutEditor.git
git branch -M main
git push -u origin main
```

本地分支不是 `main` 时，先 `git branch -M main` 再推送。

## 认证失败

GitCode HTTPS 推送可能需要账号密码或 **私人令牌（PAT）**。

- 在终端提示输入凭据时，告知用户在本地完成认证
- **不要**把 token 写入仓库、Skill 或 commit
- 可建议用户在 GitCode 生成 PAT，用户名填 GitCode 账号，密码填 PAT

## 输出给用户

同步完成后简要报告：

- 拉取/推送是否成功
- 新增 merge commit 或冲突处理摘要
- 当前 `main` 与 `origin/main` 是否一致
- 若失败：错误原因与下一步（认证、冲突、需用户确认 force 等）

## 更多场景

见 [reference.md](reference.md)：stash、撤销误操作、仅同步特定文件等。
