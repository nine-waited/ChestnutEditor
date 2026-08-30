# DS-001 interval dirty 与 unsaved / 关 Tab

- **级别**: P0
- **前置**: 保存模式 = interval；笔记有未保存缓冲
- **步骤**: `setNoteUnsaved(path, true)`；关 Tab 走 `leavesNeedingCloseConfirm`
- **期望**: `isNoteUnsaved` 为 true；interval+dirty 的 md/excalidraw 需确认；realtime 不需确认
- **禁止**: 仅查看挂载清掉 dirty；未确认就关 dirty Tab
- **对应自动化**: `packages/ui/src/data-safety.test.ts`（`unsaved-notes` + `tab-close-plan`）
