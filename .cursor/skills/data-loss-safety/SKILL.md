---
name: data-loss-safety
description: >-
  Chestnut Editor data-loss prevention gate. Use before every git push, when the user
  asks to push/sync/发布, or when changing vault write, flush, discard, view-only,
  unsaved notes, note reload, or split markdown twin logic. Runs pnpm test:data-safety
  and blocks push on failure.
---

# 数据防丢失门禁（push 前必跑）

## 何时必须使用

在以下任一情况，**先完成本 Skill，再允许 `git push`**：

- 用户要求 push / 同步 / 发布 / 上传代码
- 正在执行 [git-sync](../git-sync/SKILL.md) 的 Push 步骤
- 改动涉及：`VaultService` 写盘、`discardPendingWrite`、`suppressWrites`、`unsaved-notes`、`note-reload*`、分屏同 MD / `viewOnly`

## 强制步骤（不可跳过）

在仓库根目录执行：

```powershell
cd <repo-root>
pnpm test:data-safety
```

- **退出码非 0 → 禁止 push**。向用户报告失败用例，先修再推。
- **退出码 0** → 可继续 push / 同步。

可选全量回归：

```powershell
pnpm test
```

## 场景目录

权威列表：[`docs/testing/data-safety/catalog.md`](../../../docs/testing/data-safety/catalog.md)

| ID | 要点 |
|----|------|
| DS-001 | interval dirty 依赖 unsaved 标记 |
| DS-002 | 非丢弃刷新前必须 flush |
| DS-003 | 仅查看侧不得清 path dirty |
| DS-004 | 切换仅查看保持单 writer + flush |
| DS-005 | `flushNoteWriters` 调用已注册 flusher |
| DS-006 | 删除后 `suppressWrites` 阻止写回 |
| DS-007 | 分屏同 MD 至多一份可编辑 |
| DS-008 | 确认丢弃刷新时不得 flush |

## Agent 行为约束

1. **不要**在 `test:data-safety` 失败时用 `--no-verify`、跳过测试或强推。
2. **不要**只跑无关包测试冒充门禁；必须跑根脚本 `pnpm test:data-safety`。
3. 若用户只要 pull、不要 push，可跳过本门禁。
4. 改动上述写路径后，优先补/改 `*.data-safety.test.ts` 或 `packages/ui/src/data-safety.test.ts`，并更新 catalog 若新增场景。

## 输出给用户

简要报告：

- `pnpm test:data-safety` 通过或失败
- 失败时：失败文件/用例名与下一步
- 通过后：是否已继续 push
