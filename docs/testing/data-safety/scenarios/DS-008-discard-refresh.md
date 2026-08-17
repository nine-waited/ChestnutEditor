# DS-008 丢弃刷新不 flush

- **级别**: P0
- **前置**: interval + unsaved；用户确认丢弃
- **步骤**: `requestRefreshMarkdownTab` 走 discard 分支
- **期望**: flusher **不被**调用；仍 discardPending + reload
- **禁止**: 确认丢弃后仍把缓冲写回磁盘
