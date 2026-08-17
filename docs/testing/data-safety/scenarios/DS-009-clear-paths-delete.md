# DS-009 删除后清空 leaf path

- **级别**: P0
- **前置**: 打开笔记 Tab（可分屏 twin）
- **步骤**: `clearPathsForDelete(path, isDirectory)`
- **期望**: 命中 leaf 变为 `empty` 且 `path` 清空；目录删除清嵌套路径
- **禁止**: 已删 path 仍挂在 leaf 上供 keep-alive 写回
