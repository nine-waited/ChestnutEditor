# DS-007 分屏同 MD 单 writer

- **级别**: P0
- **前置**: split；两侧打开同一 md
- **步骤**: 检查 `viewOnly`；再 `setMarkdownViewOnly` 交替
- **期望**: 任意时刻至多一个 leaf 非 viewOnly
- **禁止**: 两侧均可编辑
- **对应自动化**: `packages/core/src/workspace/store.data-safety.test.ts`
