# 数据防丢失场景总表

| ID | 级别 | 标题 | 自动化 |
|----|------|------|--------|
| DS-001 | P0 | interval dirty 关闭流程依赖 unsaved 标记 | `unsaved-notes` + `tab-close-plan` |
| DS-002 | P0 | realtime / 干净刷新前必须 flush | `note-reload-plan` + `VaultService` debounce |
| DS-003 | P0 | 仅查看侧不得清除 path 级 dirty | `unsaved-notes` 契约（文档约束 NotePane） |
| DS-004 | P0 | 切换仅查看前 flush，且仅一份可写 | `WorkspaceStore` + `note-reload` flusher |
| DS-005 | P0 | 打开同文件副本前可写侧应能 flush | `flushNoteWriters` 注册表 |
| DS-006 | P0 | 删除笔记后 suppressWrites 阻止写回 | `VaultService` |
| DS-007 | P0 | 分屏同 MD 至多一份可编辑 | `WorkspaceStore`（含 twin / 退出分屏 / 非 MD 互斥） |
| DS-008 | P0 | 确认丢弃刷新时不得 flush | `note-reload-plan` |
| DS-009 | P0 | 删除后清空 leaf path | `WorkspaceStore.clearPathsForDelete` |
| DS-010 | P0 | rename/move 取消 pending write | `VaultService` |
| DS-011 | P0 | writeBinary × suppress 边界 | `VaultService` |

详细步骤见 `scenarios/DS-*.md`。
