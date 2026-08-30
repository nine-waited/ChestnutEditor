# DS-005 打开副本前 flush 注册表

- **级别**: P0
- **前置**: 可写 leaf 已 `registerNoteFlusher`
- **步骤**: `flushNoteWriters(path)`
- **期望**: 已注册 flusher 被 await
- **禁止**: 无注册时静默成功即可；有注册未调用则失败
- **对应自动化**: `packages/ui/src/data-safety.test.ts`（`flushNoteWriters`）
