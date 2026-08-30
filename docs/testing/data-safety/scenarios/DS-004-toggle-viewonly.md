# DS-004 切换仅查看

- **级别**: P0
- **前置**: 分屏两侧同 path MD
- **步骤**: `setMarkdownViewOnly`；`requestToggleMarkdownViewOnly` 先 flush
- **期望**: 恰好一侧 `viewOnly`；toggle 路径调用 flusher
- **禁止**: 两侧同时可写
- **对应自动化**: `packages/core/src/workspace/store.data-safety.test.ts` + `packages/ui/src/data-safety.test.ts`（多 leaf flusher）
