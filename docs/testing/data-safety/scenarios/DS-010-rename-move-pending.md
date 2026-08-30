# DS-010 rename/move 取消 pending write

- **级别**: P0
- **前置**: 笔记有未落盘 debounce 写
- **步骤**: `renameFile` 或 `moveFileToDir` 后推进 timer
- **期望**: 旧 path 不被 pending timer 重建；新 path 保留 rename/move 时磁盘内容
- **禁止**: 改名/移动后旧文件被 stale buffer 写回
- **对应自动化**: `packages/core/src/vault/vault-service.data-safety.test.ts`
