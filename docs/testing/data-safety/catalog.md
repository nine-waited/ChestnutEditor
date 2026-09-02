# 数据防丢失场景总表

| ID | 级别 | 标题 | 自动化 |
|----|------|------|--------|
| DS-001 | P0 | interval dirty 关闭流程依赖 unsaved 标记 | `packages/ui/src/data-safety.test.ts`（`unsaved-notes` + `tab-close-plan`） |
| DS-002 | P0 | 有本地未写盘编辑且磁盘未变时，刷新前必须 flush | `note-reload-plan` + `VaultService` debounce / discard |
| DS-003 | P0 | 仅查看侧不得清除 path 级 dirty | `unsaved-notes` 契约；NotePane `viewOnly` 提前 return |
| DS-004 | P0 | 切换仅查看前 flush，且仅一份可写 | `WorkspaceStore` + `flushNoteWriters` |
| DS-005 | P0 | 打开同文件副本前可写侧应能 flush | `flushNoteWriters` 注册表 |
| DS-006 | P0 | 删除笔记后 suppressWrites 阻止写回 | `VaultService` + `InMemoryVaultAdapter` |
| DS-007 | P0 | 分屏同 MD 至多一份可编辑 | `store.data-safety.test.ts`（twin / 退出分屏 / 非 MD 互斥） |
| DS-008 | P0 | 确认丢弃刷新时不得 flush | `note-reload-plan` |
| DS-009 | P0 | 删除后清空 leaf path | `WorkspaceStore.clearPathsForDelete` |
| DS-010 | P0 | rename/move 取消 pending write | `VaultService` |
| DS-011 | P0 | writeBinary × suppress 边界 | `VaultService` |
| DS-012 | P0 | 刷新不得用 Chestnut 旧缓冲覆盖磁盘上的外部保存 | `note-reload-plan` reload-no-flush |
| DS-013 | P0 | 外部改盘后自动保存不得覆盖；干净缓冲应跟随磁盘 | `VaultService` write guard + `planExternalDiskSync` |

命令：

```powershell
pnpm test:data-safety
```

详细步骤见 `scenarios/DS-*.md`。本期无「仅 Skill」P0；发版冒烟（新建 → 输入 → 等 autosave/Ctrl+S → 杀进程 → 重开对磁盘）由 Skill 指导手工核对。
