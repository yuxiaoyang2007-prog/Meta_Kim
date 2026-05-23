# 跨运行时 Meta 治理强制力矩阵

> **任务来源**：Worker B 跨运行时审计发现治理强制力只在 Claude Code 一端有"机械拦截"层；其余三端只有 prompt 自律。
>
> **本文件目的**：明确每个运行时能做到的强制力上限，避免对"四端一致"产生不实承诺；同时记录已实施的投影源。

## 一、能力评估表

| 运行时 | hook 配置文件 | PreToolUse-类事件 | 是否支持工具拦截 (deny) | 当前已用机制 | 投影方式建议 |
|--------|--------------|------------------|----------------------|-----------|----------|
| **Claude Code** | `.claude/settings.json` | `PreToolUse` (Claude schema 原生) | **是**：`{hookSpecificOutput.permissionDecision: "deny"}` 协议被 Host 强制解释 | `.claude/hooks/enforce-agent-dispatch.mjs`（canonical 源 `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`） | hook 直投：canonical → sync → `.claude/hooks/` |
| **Codex** | `.codex/hooks.json` | `PreToolUse`（同名但 schema **不**兼容 Claude） | **未公开**：Codex v0.117.0+ 引入 hooks，但 `docs/research/platforms/codex.md` 已声明"event names and contracts are not schema-compatible with Claude Code"。无证据表明 Host 解释 `permissionDecision: deny`。当前 `.codex/hooks/graphify-context.mjs` 仅用 `console.log` 注入上下文 | meta agent 自律声明（frontmatter `executionBlock=true` + `> NOT FOR DIRECT EXECUTION`，9 个 meta agent 全覆盖） | **仅声明性**：依赖 `.codex/agents/*.toml` 中的 prompt block。本任务**不**新增 Codex hook 投影（避免假动作） |
| **Cursor** | `.cursor/hooks.json` | `preToolUse`（lowerCamel，schema 与 Claude **不**兼容） | **未公开**：现有 `.cursor/hooks/graphify-context.mjs` 输出 `{prompt: ...}` 做上下文注入，无 deny 协议证据 | meta agent 自律声明 + `.cursor/rules/meta-theory-dispatch.mdc`（alwaysApply 规则） | **声明性 + alwaysApply rule**：新增 canonical rule 源 `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc`（本任务实施） |
| **OpenClaw** | `openclaw/openclaw.template.json` + Plugin SDK hooks | **无** PreToolUse 概念 | **不支持**：OpenClaw hook 是 lifecycle events（`command:new`/`command:reset`/`command:stop`/`session:compact:after`），无工具级拦截 | meta agent 自律声明（9 个 SOUL.md 全覆盖） | **仅声明性**：依赖 workspace SOUL.md 中的 `executionBlock` 声明 |

## 二、本任务实际落地的投影源

| 文件 | 类型 | 作用 | 是否新增 |
|------|------|------|--------|
| `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` | Hook 实施 | Claude Code 机械拦截层 | 已存在（E3 Worker 域） |
| `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc` | Cursor MDC 规则 | Cursor 端 alwaysApply 声明，强化 meta agent 不得直接执行 | **本任务新增** |
| `.codex/agents/meta-*.toml` 中的 `> GOVERNANCE LAYER AGENT — NOT FOR DIRECT EXECUTION` block | TOML prompt 段 | Codex 端声明性约束 | 已存在（9 agent 全覆盖，frontmatter `executionBlock=true`） |
| `openclaw/workspaces/meta-*/SOUL.md` 中的同 block | SOUL prompt 段 | OpenClaw 端声明性约束 | 已存在（9 workspace 全覆盖） |

## 三、强制力分层（按能力上限）

```
┌────────────────────────────────────────────────────────────┐
│  L1 机械拦截 (Mechanical Block)                              │
│  - 仅 Claude Code:                                          │
│    PreToolUse hook → permissionDecision: "deny"             │
│    Host 强制返回，工具不执行                                  │
├────────────────────────────────────────────────────────────┤
│  L2 声明 + alwaysApply 规则 (Declarative + Always-Apply)     │
│  - Cursor:                                                  │
│    .cursor/rules/*.mdc with alwaysApply: true               │
│    每次会话自动注入 prompt，不能机械阻断但可强力引导            │
├────────────────────────────────────────────────────────────┤
│  L3 仅声明 (Declarative Only)                                │
│  - Codex: .codex/agents/*.toml prompt 段                    │
│  - OpenClaw: workspace SOUL.md prompt 段                     │
│  - 依赖 agent 自律：读到声明 → 拒绝违规 → 提示 dispatch        │
│  - **无机械保障**：若模型选择忽略，本运行时**无法拦截**           │
└────────────────────────────────────────────────────────────┘
```

## 四、用户预期管理（必须明示）

### 4.1 Claude Code 上的承诺
- meta agent 被错误派去做执行工作时，hook **强制** deny，事故无法静默发生
- 如果 spine state 已激活，未派 agent 直接 Write/Edit/Bash 也会被 deny

### 4.2 Codex 上的承诺与限制
- **承诺**：每个 meta agent TOML 显式声明 `executionBlock=true`，模型读到时应拒绝
- **限制**：若模型仍选择执行，Codex Host **无机械拦截手段**。事故可能复发，但有审计痕迹（agent prompt 声明明确，事后可追责）
- **缓解**：用户可在 Codex 侧定期跑 `npm run meta:eval:agents:live` 抽样检测违规

### 4.3 Cursor 上的承诺与限制
- **承诺**：`.cursor/rules/meta-theory-dispatch.mdc`（已有）+ `.cursor/rules/meta-enforcement.mdc`（本任务新增）双 alwaysApply 强声明，每次都注入 prompt
- **限制**：仍是 prompt 层约束，非机械拦截。事故概率比 Codex 低（因为 alwaysApply 比 frontmatter 更频繁触达），但不为 0

### 4.4 OpenClaw 上的承诺与限制
- **承诺**：9 个 workspace 的 SOUL.md 全部声明 `executionBlock=true`
- **限制**：OpenClaw 完全无工具级拦截机制；事故可能复发；建议结合 `agent-to-agent` 派发链 + `MEMORY.md` 审计弥补

## 五、若未来需要"四端一致机械拦截"

需要等以下三个外部条件之一成立：
1. **Codex 官方公开** `permissionDecision: deny` 协议或等价语义
2. **Cursor 官方公开** preToolUse 的工具拦截输出格式
3. **OpenClaw 引入** 工具级 PreToolUse hook（目前 lifecycle 模型不支持）

在那之前，本仓库的承诺顶格为"Claude Code 机械拦截 + 其余三端声明性约束"。**禁止在 README 或 CLAUDE.md 中宣称"四端 hook 完全一致"**。

## 六、维护清单

修改本矩阵或任一运行时的治理强制力后：

1. 改 canonical 源（`canonical/runtime-assets/<runtime>/...`）
2. 改完 cursor rule 后运行 `npm run meta:sync`，确保投影到 `.cursor/rules/`
3. 运行 `npm run meta:validate`
4. 在 PR 描述中明示"是否改变强制力分层"
5. 如分层变化，本文件第三节图必须同步更新

## 七、参考

- `docs/runtime-capability-matrix.md` —— 全运行时能力对比（hook parity 行已说明事件名不同构）
- `docs/runtime-coverage-audit.md` —— Worker B 的全栈审计
- `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` —— Claude 端机械拦截实施
- `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc` —— Cursor 端 alwaysApply 声明（本任务）
- `canonical/agents/meta-*.md` —— 9 个 meta agent 主源，frontmatter `executionBlock=true` 同步到四端
