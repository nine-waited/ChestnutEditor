# DS-006 删除后禁止写回

- **级别**: P0
- **前置**: 已 mount；写入 note.md 后 deletePath
- **步骤**: delete 后再 write / debounce write
- **期望**: `isWriteSuppressed`；磁盘文件不再被 recreate
- **禁止**: 保活 autosave 复活已删笔记
