# DS-012 刷新不得覆盖外部保存

- **级别**: P0
- **前置**: Chestnut 已打开笔记且缓冲等于上次保存（界面上已保存）；其他编辑器改同一文件并已写盘
- **步骤**: 在 Chestnut 点击刷新
- **期望**: **不** flush / 不把内存旧内容写回磁盘；discardPending 后从磁盘重载外部版本
- **禁止**: 用 Chestnut 未更新的缓冲覆盖磁盘，导致其他编辑器的保存失效
- **对应自动化**: `packages/ui/src/data-safety.test.ts`（`note-reload-plan` `reload-no-flush` + snapshot）
