# DS-013 外部编辑后不得被 autosave 覆盖

- **级别**: P0
- **前置**: Chestnut 已打开并保存笔记；其他编辑器改同一文件并写盘
- **步骤**: Chestnut 触发实时/间隔自动保存，或磁盘 watcher 收到变更
- **期望**: 不得把 Chestnut 旧缓冲写回磁盘；若本地无未保存编辑，编辑器应重载磁盘新内容
- **禁止**: 用内存旧稿覆盖 VS Code 等外部保存
- **对应自动化**: `packages/core/src/vault/vault-service.data-safety.test.ts`（write skip）+ `planExternalDiskSync`
