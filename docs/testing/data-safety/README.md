# 数据防丢失验证

Chestnut 以 **vault 磁盘文件** 为真相。本目录维护防丢失场景；自动化测试与 Cursor Skill 共用同一 catalog。

## 怎么跑

```powershell
cd <repo-root>
pnpm test:data-safety
```

全量 `pnpm test`（`pnpm -r test`）也会跑到 L1/L2 用例（`*.data-safety.test.ts` 与 `packages/ui/src/data-safety.test.ts`）。

**每次 `git push` 必跑**：`.githooks/pre-push` 会执行 `pnpm test:data-safety`，失败则拒绝推送（`pnpm install` / `prepare` 会把 `core.hooksPath` 指到 `.githooks`）。Agent 走 `git-sync` 时同样先跑该套件。勿用 `--no-verify` 跳过，除非用户明确要求。

## 严重级别

| 级别 | 含义 |
|------|------|
| P0 | 可导致用户内容丢失或错误覆盖磁盘 |
| P1 | 脏标记 / 仅查看配对错误，间接提高丢数据风险 |
| P2 | UX 一致性（圆点、徽章），不直接丢盘 |

## 三层结构

| 层 | 职责 | 落地 |
|----|------|------|
| L1 契约 | Vault 写盘语义、分屏单 writer | `@chestnut/core` `*.data-safety.test.ts` + `InMemoryVaultAdapter` |
| L2 场景 | 刷新 / unsaved / flush 注册表 | `@chestnut/ui` `src/data-safety.test.ts` |
| L3 Skill | push / 发版前编排清单；失败禁止 push | `.cursor/skills/data-loss-safety` |

第一期不做完整 Tauri/WebView E2E。Skill 仅编排与补洞，不替代自动化。

## 场景文件

每个 `scenarios/DS-*.md` 固定字段：ID 标题、级别、前置、步骤、期望磁盘/状态、禁止发生、对应自动化。

见 [catalog.md](./catalog.md) 与 [scenarios/](./scenarios/)。
