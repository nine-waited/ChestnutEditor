---
name: data-loss-safety
description: >-
  Chestnut Editor data-loss prevention gate. Use before every git push, when the user
  asks to push/sync/发布/验证防丢失/回归保存/发版前检查, or when changing vault write, flush,
  discard, view-only, unsaved notes, note reload, or split markdown twin logic.
  Runs pnpm test:data-safety and blocks push on failure.
---

# 数据防丢失门禁（push / 发版前必跑）

权威场景目录：[`docs/testing/data-safety/catalog.md`](../../../docs/testing/data-safety/catalog.md)

## 何时必须使用

在以下任一情况，**先完成本 Skill，再允许 `git push` 或宣称发版就绪**：

- 用户要求 push / 同步 / 发布 / 上传代码 / 验证防丢失 / 回归保存 / 发版前检查
- 正在执行 [git-sync](../git-sync/SKILL.md) 的 Push 步骤
- 改动涉及：`VaultService`、`discardPendingWrite`、`suppressWrites`、`unsaved-notes`、`note-reload*`、分屏同 MD / `viewOnly`

## 强制步骤（不可跳过）

1. 打开 [`docs/testing/data-safety/catalog.md`](../../../docs/testing/data-safety/catalog.md)，按 **P0 → P1** 对照清单。
2. 在仓库根目录跑自动化：

```powershell
cd <repo-root>
pnpm test:data-safety
```

- **退出码非 0 → 禁止 push / 发版**。向用户报告失败用例，先修再推。
- **退出码 0** → 可继续 push / 同步。

Git 侧：`.githooks/pre-push` 在任意 `git push` 时再次执行同一命令；`pnpm install` 会安装该 hook。**不要**用 `--no-verify` 绕过，除非用户明确要求。

可选全量回归：

```powershell
pnpm test
```

3. **仅 Skill / 发版冒烟**（catalog 未自动化的桌面路径）：启动桌面版后按步骤操作，并核对 **真实 vault 文件内容**（不要只看 UI 徽章）。当前 P0 均有自动化；发版仍建议一条冒烟：新建笔记 → 输入 → 等 autosave 或 Ctrl+S → 结束进程 → 重开核对磁盘。

## 场景目录（P0）

| ID | 要点 |
|----|------|
| DS-001 | interval dirty 依赖 unsaved + 关 Tab 确认 |
| DS-002 | realtime 本地未写盘且磁盘未变时刷新前 flush |
| DS-003 | 仅查看侧不得清 path dirty |
| DS-004 | 切换仅查看保持单 writer + flush |
| DS-005 | `flushNoteWriters` 调用已注册 flusher |
| DS-006 | 删除后 `suppressWrites` 阻止写回 |
| DS-007 | 分屏同 MD 至多一份可编辑 |
| DS-008 | 确认丢弃刷新时不得 flush |
| DS-009 | 删除后 `clearPathsForDelete` 清空 leaf |
| DS-010 | rename/move 取消 pending，旧 path 不重建 |
| DS-011 | 删 md 挡 writeBinary；删图允许 undo 恢复 |
| DS-012 | 刷新不得用旧缓冲覆盖磁盘上的外部保存 |
| DS-013 | 外部改盘后 autosave 不得覆盖；干净缓冲跟随磁盘 |

## Agent 行为约束

1. **不要**在 `test:data-safety` 失败时用 `--no-verify`、跳过测试或强推。
2. **不要**只跑无关包测试冒充门禁；必须跑根脚本 `pnpm test:data-safety`。
3. 若用户只要 pull、不要 push，可跳过本门禁。
4. 改动上述写路径后，优先补/改 `*.data-safety.test.ts` 或 `packages/ui/src/data-safety.test.ts`，并更新 catalog 若新增场景。
5. **不要**用本 Skill 代替单元测试；Skill 只编排清单与补手工洞。

## 输出给用户（必须可见，不要只写「通过」）

在对话里**展示门禁进度**，不要把结果压成一句带过。至少包含：

1. **开始**：写明正在跑 `pnpm test:data-safety`（push 前门禁）
2. **进度**：分别报告 `@chestnut/core` 与 `@chestnut/ui` 的通过/失败（文件数、用例数；失败则贴失败用例名）
3. **结论**：门禁通过 → 才继续 push；失败 → 停止并说明如何修
4. **报告字段**：通过 / 失败 / 未覆盖 / 建议补测的 ID
5. **Push 后**：一句确认已推送（含 commit / 分支）

示例（通过时）：

```
门禁 pnpm test:data-safety
- core: N files / M tests passed
- ui: N files / M tests passed
通过：DS-001 … DS-013
失败：无
未覆盖：无（P0 均有自动化）
建议补测：无
门禁通过，开始 push …
已推送到 origin/main（abc1234）
```
