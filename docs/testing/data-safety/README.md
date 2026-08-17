# 数据防丢失验证

Chestnut 以 **vault 磁盘文件** 为真相。本目录维护防丢失场景；自动化测试与 Cursor Skill 共用同一 catalog。

## 怎么跑

```powershell
cd <repo-root>
pnpm test:data-safety
```

**每次 `git push` 前必须通过**（见 `.cursor/skills/data-loss-safety` 与 `git-sync`）。

## 严重级别

| 级别 | 含义 |
|------|------|
| P0 | 可导致用户内容丢失或错误覆盖磁盘 |
| P1 | 脏标记 / 仅查看配对错误，间接提高丢数据风险 |
| P2 | UX 一致性（圆点、徽章），不直接丢盘 |

## 场景文件

见 [catalog.md](./catalog.md) 与 [scenarios/](./scenarios/)。
