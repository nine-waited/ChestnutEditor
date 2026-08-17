# DS-001 interval dirty 与 unsaved 标记

- **级别**: P0
- **前置**: 保存模式 = interval；笔记有未保存缓冲
- **步骤**: `setNoteUnsaved(path, true)`；仅查看侧逻辑不得调用 `setNoteUnsaved(path, false)`
- **期望**: `isNoteUnsaved(path)` 仍为 true，关闭确认可出现
- **禁止**: 仅查看挂载清掉 dirty
