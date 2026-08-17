# DS-011 writeBinary × suppress 边界

- **级别**: P0
- **前置**: 删除 `.md` 或图片文件
- **步骤**: 删 md 后 `writeBinary`；删 png 后 `writeBinary` 恢复
- **期望**: 删笔记后 binary 写回也被 suppress；删图片不 suppress，允许 undo 恢复
- **禁止**: keep-alive 用 binary 复活已删笔记；或挡掉图片 undo
