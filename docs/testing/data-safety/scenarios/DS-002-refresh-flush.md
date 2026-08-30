# DS-002 刷新前 flush（非丢弃）

- **级别**: P0
- **前置**: 可写侧有 flusher；非 interval-dirty（或 realtime）
- **步骤**: `requestRefreshMarkdownTab` 在干净/realtime 路径
- **期望**: 先调用 flusher，再 discardPending + reload
- **禁止**: 未 flush 就丢掉 debounce 缓冲
- **对应自动化**: `packages/ui/src/data-safety.test.ts`（`note-reload-plan`）+ `packages/core/src/vault/vault-service.data-safety.test.ts`（discard / debounce / immediate write）
