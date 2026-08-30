# DS-003 仅查看不得清 dirty

- **级别**: P0
- **前置**: path 已 dirty
- **步骤**: 模拟仅查看侧「不得写 unsaved」契约——可写侧 set dirty 后，clear 只能由可写侧或显式 refresh/toggle 发起
- **期望**: dirty 保持到 clearNoteUnsaved / 可写侧清理
- **禁止**: 无关调用清 dirty（回归：仅查看 mount effect）
- **对应自动化**: `packages/ui/src/data-safety.test.ts`（`unsaved-notes`）；NotePane 以 `if (viewOnly) return` 约束，Skill 发版时点验仅查看 Tab 无实心点
