# 更新日志

> 🇺🇸 [English](./CHANGELOG.md) | 中文版

所有 Meta_Kim 的重要变更都会记录在此。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
发布新版本时，请在顶部（旧版本之前）添加新的 **`## [版本号] - YYYY-MM-DD`** 部分。

## [2.0.42] - 2026-05-22

### 新增

- **中文完整架构图** — 新增中文为主的详细架构文档，覆盖 canonical 源、运行时投影、8 阶段主干、11 阶段业务流、隐藏治理包、三层记忆、Graphify、安装/更新流程和各运行时能力边界。
- **MCP 记忆召回回归测试** — 新增 setup 测试，确保泛提示也能召回最近的高信号项目记忆，并覆盖长 checkpoint 中被埋住的 MCP Memory Service 细节。

### 变更

- **第三层记忆召回策略** — Codex、Cursor、OpenClaw 和 Claude hooks 现在使用多路查询、最近项目兜底、高信号记忆优先、主题级去重和关键词居中摘录，不再只依赖一次项目名搜索。
- **MCP 记忆健康处理** — Runtime hooks 现在会检查 `/api/health`，在本地端点安全时尝试后台启动 `memory server --http`，失败时注入节流状态提示，避免跨会话召回静默失效。
- **近期修复汇总** — 本版本汇总近期已推送修复：Codex request-user-input 默认启用、Codex warning suppression、跨运行时 memory hook 输出、meta-theory choice surface、Claude 插件 skill 残留清理，以及 Graphify 使用说明。

### 修复

- **服务健康但召回弱** — 修复 `http://localhost:8000` 健康时，agent 仍然只有在 prompt 明确写端口或 MCP Memory Service 才能想起第三层记忆的问题。
- **长 checkpoint 截断** — 召回内容现在围绕 `8000`、`MCP Memory Service`、`third layer`、跨会话召回等高信号词摘录，不再只截取开头。
- **重复 checkpoint 噪声** — stop/session checkpoint 会按主题级去重，避免旧的重复 MCP 启动记录淹没当前项目记忆。

## [2.0.41] - 2026-05-21

### 修复

- **按语言来源渲染状态通知** — 运行状态通知现在优先使用 runtime/tool 已选择的输出语言，其次使用用户明确选择的输出语言，最后才用用户最新输入语言兜底。
- **去除固定语言通知外壳** — 默认 notice 模板不再放固定中文或英文示例，并新增测试拒绝任何单一语言默认状态壳。

## [2.0.40] - 2026-05-21

### 新增

- **公开元运行状态 envelope** — meta-theory 运行现在会写入跨运行时的 `active-run.json` 和每轮 `status.json`，用户可以看到元治理是否已触发、当前阶段、进度、下一步和阻塞。
- **运行状态 CLI** — 新增 `npm run meta:run-status`，用于读取当前公开元治理状态，并支持本地化的未运行输出。
- **运行状态测试** — 新增状态 envelope 合同、跨平台状态文件写入、本地化状态文本和 notice 模板规则测试。

### 变更

- **阶段通知** — 将偏协议的阶段示例改为简短公开状态提示，默认隐藏 `Preflight`、fallback surface 名称、packet id 和 protocol trace。
- **运行时镜像** — 已同步项目和全局 Claude Code、Codex、OpenClaw、Cursor 的 meta-theory mirror，带上状态 envelope 行为。

### 修复

- **状态语言匹配** — 公开状态标签和阶段说明现在会跟随用户选择或推断出的语言，同时保留 `Critical`、`Fetch` 等 canonical 阶段名为英文。

## [2.0.39] - 2026-05-20

### 新增

- **研究能力预检** — `contentEvidencePacket` 现在要求 `researchCapabilityDiscovery`，证据 owner 必须先证明当前 runtime 实际可用的检索能力，再进入深度研究或用户选项框架。
- **Run artifact 研究发现校验** — `validate-run-artifact` 现在会校验研究能力预检，并拒绝缺少发现证据的 artifact。

### 变更

- **基于能力证据的研究路由** — Conductor、Artisan、Scout、Prism 现在按实际检索能力（`web_search`、`url_fetch`、`docs_lookup`、MCP/plugin/search/用户提供来源）路由研究，而不是按宿主外形猜测。
- **运行时研究 fixtures** — 有效和无效 run artifact 现在都包含明确的检索能力发现证据。

### 修复

- **platformSurface 漂移** — 明确拒绝 `platformSurface` 作为研究能力信号，避免用 `desktop/cli/web/ide` 这类猜测驱动跨运行时搜索决策。

## [2.0.38] - 2026-05-20

### 新增

- **抽象元技能包合同** — 元 Agent 可以长期固定拥有 `meta-theory`、`agent-teams-playbook`、`findskill`、`superpowers`、`ecc` 这些元技能包，但具体子技能只允许在每次运行时按需求选择。
- **能力索引继承测试** — 新增 setup 测试，锁定 canonical 能力索引、schema、validator 和运行时镜像中的元技能包合同。
- **发布/安装业务流** — 在业务流合同中补充 runtime package、install、release 相关执行通道。

### 变更

- **元 Agent 能力槽** — 更新 9 个 canonical 元 Agent，让长期身份记录抽象能力槽，而不是永久绑定具体子技能。
- **运行时能力发现** — `discover:global` 现在会稳定生成抽象能力槽、元技能包、run-only 技能选择和长期身份策略，不会在刷新时丢字段。
- **Graphify 治理** — 强化 graphify wiring 检查，让代码图谱新鲜度继续进入发布验证链路。

### 修复

- **具体技能持久化** — 防止把 provider 子技能等具体运行时选择写入长期元 Agent 身份。
- **全局同步漂移** — 刷新 Claude Code、Codex、OpenClaw、Cursor 的全局目录版 meta-theory skill，让安装和更新能拿到当前多文件技能布局。

## [2.0.37] - 2026-05-20

### 变更

- **角色族显示名** — 统一用户可见的 worker 标签粒度，并将单次运行的具体范围记录到实例和分片元数据。
- **Run artifact fixtures** — 对齐示例 artifact 与角色族命名策略。

### 修复

- **Node ESM postinstall** — 修复 `scripts/postinstall-check.mjs`，避免 npm install 因 `ReferenceError: require is not defined in ES module scope` 失败。
- **Postinstall 覆盖** — 新增 setup 测试，在 Node 下运行 postinstall checker，防止 ESM/CommonJS 回归。

## [2.0.36] - 2026-05-20

### 新增

- **业务流蓝图门禁** — 增加派发前蓝图步骤，根据请求目标推导本次任务的业务通道，并记录覆盖决策。
- **业务可读 Agent 角色** — 分离用户可见角色名和运行时昵称，并支持同一 Agent 多实例分片执行，要求明确隔离、冲突和合并规则。
- **Run artifact 验证 fixtures** — 增加同 owner 分片执行、重叠分片拒绝等正反例。

### 变更

- **能力优先编排** — 每个业务通道都必须记录全局 agent/skill 搜索证据、选定 owner、选择理由和覆盖状态，再创建 worker packet。
- **Owner 缺口处理** — 现有 owner 复用、owner 升级和新 owner 创建现在都必须成为显式 `agentBlueprintPacket` 决策。
- **Run index ownership** — owner 查询覆盖治理 owner、执行 owner agent 和业务角色名。

### 修复

- **MCP agent 清单** — `meta-runtime-server` self-test 现在暴露全部 9 个元 Agent，包括 `meta-chrysalis`。
- **静态合同漂移** — 项目验证现在检查 blueprint packets、角色字段、dispatch envelope 字段和 worker shard 字段。
- **跨运行时文档** — 运行时能力矩阵记录 Claude、Codex、OpenClaw、Cursor 的蓝图和角色命名一致性。

## [2.0.35] - 2026-05-20

### 变更

- **meta-theory 确认流程** — 明确 Critical 阶段只处理阻断 Fetch 的早期澄清；主要用户选择统一发生在 Fetch + Thinking 之后、Execution 之前。
- **产品化决策卡** — 扩展 decision 模板，要求每个执行前问题都有 3-4 个选项，并用非技术语言说明预期结果、优势和劣势。
- **9-agent 文档一致性** — 更新 Codex、README 和测试文案，把 `meta-chrysalis` 纳入完整 meta agent 阵列。

### 修复

- **Hook 分层** — 删除重复的 Claude 专用 `skip-reminder.mjs` 源文件，让 Claude 同步使用 shared hook 与 shared i18n 依赖。
- **安装包内容** — 收紧 npm `files` 白名单，避免打包本地 `scripts/.meta-kim` 状态，并忽略已移除的 `package-lock.json`。
- **Evolution contract 路径** — 将 scar 写回目标指向实际存在的 `config/contracts/scar-protocol.md`。
- **Setup 计数** — 将硬编码 8-agent 安装提示改为使用 canonical agent 数量。

## [2.0.34] - 2026-05-20

### 新增

- **meta-chrysalis 智能体** — 新增专家智能体，负责 Evolution writeback 编排，自动化从 spine evolution artifacts 到 canonical source updates 的流程，包含 Five Criteria 验证和递归防护。
- **Evolution Writeback Gate** — 新增 `scripts/evolution-writeback-gate.mjs`，包含 Five Criteria 验证、PRIN-ST 合规检查、循环依赖检测和阈值游戏防护。
- **Evolution 信号检测** — 新增 `scripts/detect-evolution-signals.mjs`，从提交历史和运行时行为中自动发现可复用模式和 agent 漂移。
- **Meta-Kim 聚合** — 新增 `scripts/meta-kim-aggregate.mjs`，用于跨运行时情报收集和模式综合。
- **Hook i18n 支持** — 新增 `canonical/runtime-assets/shared/hooks/hook-i18n.mjs`，支持 4 种语言（en、zh-CN、ja-JP、ko-KR）的用户消息。
- **Skip reminder hook** — 新增 `canonical/runtime-assets/shared/hooks/skip-reminder.mjs` 和 `claude/hooks/skip-reminder.mjs`，实现跨运行时的统一 hook 跳过通知。
- **用户交互模板** — 新增 `canonical/templates/user-interaction/` 目录，包含 decision、batch-decision 和 notice 模板，用于运行时无关的用户交互模式。
- **postinstall 检查** — 新增 `scripts/postinstall-check.mjs`，在 npm install 后提供 i18n 能力索引发现提示。
- **单元测试** — 新增 `tests/unit/skip-reminder.test.mjs`，包含 17 个测试用例。

### 变更

- **meta-theory Clarity Gate** — 从 Critical 阶段确认重新设计为 Fetch 后统一确认，包含 4+ 问题、每问题 3-4 选项，在保持质量的同时减少中断。
- **全部 9 个 meta 智能体** — 更新 SOUL.md 文件，明确 evolution writeback 边界和职责范围。
- **Workflow contract** — 增强 `config/contracts/workflow-contract.json`，添加 evolutionWritebackPacket 和 capabilityGapPacket schema。
- **能力索引** — 扩展 `config/capability-index/meta-kim-capabilities.json`，添加 evolution 相关能力。
- **Runtime sync** — 增强 `scripts/sync-runtimes.mjs`，添加 --reverse 模式用于 runtime-to-canonical evolution 反馈和改进的 hook 依赖管理。

### 修复

- **i18n 合规** — 修复 hooks 中的硬编码英文字符串，改用翻译函数。
- **PRIN-ST 违规** — 用 SKIP_DECISION 常量和配置驱动值替换 magic strings。
- **关键词检测** — 用正则词边界改进 SIMPLE_KEYWORDS，减少误报。

## [2.0.32] - 2026-05-19

### 新增

- **运行时 hook 映射契约** — 新增 `scripts/runtime-hook-mapping.mjs`，集中管理 Claude/Codex/OpenClaw/Cursor 的 hook 能力映射、命令 quoting 与 HookPrompt adapter 生成。
- **HookPrompt Codex/Cursor adapter 路径** — HookPrompt 现在声明运行时无关的 prompt 优化能力，并通过 Codex `UserPromptSubmit` adapter、Cursor `beforeSubmitPrompt` adapter 安装，而不是把 Claude hook 文件假装成直接可移植。
- **Hook 映射校验** — `meta:validate` 现在会检查 Codex 和 Cursor hook 输出路径、HookPrompt 平台支持和跨平台 hook 命令 quoting。
- **共享 hooks 源文件** — 新增 `canonical/runtime-assets/shared/hooks/` 目录，包含可移植源文件：
  - `activate-meta-theory-spine.mjs`: spine 自动触发实现
  - `spine-state.mjs`: spine 状态管理工具
  - `utils.mjs`: 共享 hooks 工具函数
- **Codex Skill hook 支持** — 更新 `scripts/sync-runtimes.mjs`，为 Codex 运行时配置 Skill hook，实现跨平台 spine 自动触发。
- **SHARED_HOOK_FILES 别名** — 在 `scripts/runtime-sync-check.mjs` 新增 `SHARED_HOOK_FILES` 导出，`CLAUDE_HOOK_FILES` 作为向后兼容别名。
- **MCP Memory hook 自动修复** — Hook 安装脚本现在会自动检测并修复无效的 Python 路径。使用 `scripts/install-mcp-memory-hooks.mjs --force` 可强制更新。

### 变更

- **Cursor hook 口径** — Cursor 作为 lowerCamel 原生 hook runtime 映射，使用 `.cursor/hooks.json` 和 `.cursor/hooks/` 承载 memory、graphify 与 HookPrompt adapter hooks。
- **Codex hook 口径** — Codex 现在明确为受信任的项目/用户 hook runtime，使用 `.codex/hooks.json` 承载 graphify、memory、meta-theory spine 与 HookPrompt adapter hooks。
- **settings.json Skill hook** — PreToolUse matcher 现在指向共享的 `activate-meta-theory-spine.mjs`，实现 meta-theory skill 激活时自动初始化 spine state。
- **能力索引更新** — 在 `config/capability-index/meta-kim-capabilities.json` 添加 spine 相关能力。

### 移除

- **package-lock.json** — 删除（项目使用 pnpm，依赖 `pnpm-lock.yaml`）。

## [2.0.30] - 2026-05-15

### 变更

- **项目本地 MCP 配置** — 在 Meta_Kim 源仓库内同步时，`meta-kim-runtime` 现在会渲染为绝对路径。普通项目复制配置时，不再从 runtime sync 继承这个只适合源仓库使用的 MCP。
- **Claude 插件安装标识** — Everything Claude Code 的安装标识从过时的 `ecc@everything-claude-code` 更新为上游当前的 `ecc@ecc`。
- **MCP Memory Service 端口策略** — 移除旧的 `8888` 回退/迁移说明，公开文档统一使用上游默认端口 `8000`。
- **发布元数据** — `package.json` 和 `package-lock.json` 同步到 `2.0.30`。

### 修复

- **`meta-kim-runtime` 人话提醒** — `setup.mjs --check` 和项目校验现在会明确说明：`meta-kim-runtime` 是 Meta_Kim 源仓库里的辅助查询 MCP。普通项目手动复制配置后，如果这个 MCP 报路径错误，可以删除该 MCP block，不影响 agents 从 `.claude/agents/`、`.codex/agents/`、`.cursor/agents/` 或 `openclaw/workspaces/` 被发现。
- **Python MCP 命令选择** — MCP Memory Service 注册现在会保留实际检测到的 Python 启动器，不再在不合适的机器上回退为裸 `python`。
- **无本地密钥的运行时 smoke 校验** — Claude smoke 校验现在会在 `claude agents` 被声明但实际不可用时回退检查 `.claude/agents/`；OpenClaw smoke 校验在本机未配置 `auth.json` 时也能做模板/workspace 结构校验。

## [2.0.29] - 2026-05-15

### 新增

- **Meta-theory dispatch 自动激活 hook** — 新增 `activate-meta-theory-spine.mjs` PreToolUse hook，检测 `Skill("meta-theory")` 激活时自动初始化 spine state。激活后 `enforce-agent-dispatch.mjs` 阻止执行工具（Write/Edit/Bash）直到 agents 被 dispatch。三层强制执行：hook（系统层）+ 规则文件（所有运行时）+ SKILL.md 门控（协议层）。
- **DISPATCH IS MANDATORY 门控** — 在 `canonical/skills/meta-theory/SKILL.md` 新增顶层门控节，5 条硬规则：主线程仅做调度、>3 句执行层输出触发 STOP、"简单任务"不是借口、hook 在系统层强制、拿不准就 dispatch。
- **CLAUDE.md dispatch 硬规则** — 新增 "Meta-Theory Dispatch is Non-Negotiable" 节，覆盖全部 5 种 Type（A/B/C/D/E），明确每种 Type 的 dispatch 目标。
- **AGENTS.md dispatch 硬规则** — 在 Codex 入口新增 "DISPATCH IS MANDATORY — NON-NEGOTIABLE GATE" 节，4 条硬规则含 `spawn_agent` 不可用时的降级路径处理。
- **Codex 命令 dispatch 门控** — 更新 `canonical/runtime-assets/codex/commands/meta-theory.md`，加入强制 dispatch 规则和阻塞原因记录。
- **Cursor dispatch 规则文件** — 新增 `.cursor/rules/meta-theory-dispatch.mdc`，alwaysApply=true，覆盖全部 5 种 Type 的平台特定 dispatch 指引。

### 变更

- **settings.json hook 注册** — PreToolUse matcher 新增 `Skill`，指向 `activate-meta-theory-spine.mjs`，实现 meta-theory skill 激活时自动初始化 spine state。

## [2.0.28] - 2026-05-15

### 新增

- **planning-with-files 强制集成 (Step 3.7)** — 在 `dev-governance.md` 新增 Step 3.7: Planning Files Supplement，要求在 Stage 3（Thinking）强制创建 `task_plan.md`、`findings.md`、`progress.md`，与协议产物并行（补充而非替代）。Conductor 为唯一写入者，后续每个阶段完成后更新。已验证 Claude Code、Codex、OpenClaw、Cursor 四平台兼容。
- **Fetch Step 1.5 — 全局能力搜索** — Fetch 阶段现可搜索 `capability-search-index.tsv`（1056 条记录）进行跨仓库 agent/skill 发现，避免静默降级为通用 agent。
- **Fetch Step 1.6 — Skill 协同发现** — Skills 现在与 agents 一同在 Fetch 阶段搜索，不再延迟到 Evolution 阶段。发现的 skills 通过 `recommendedSkills` 字段绑定到 `workerTaskPackets`。
- **最小分解规则 (Step 3.6)** — 涉及 >1 文件或 >1 能力维度的任务必须产出 >=2 个 `workerTaskPackets`。单包分解在分解验收门被拒绝。
- **Evolution 回写检查清单** — 6 项强制检查：模式已记录、治理缺口已关闭、agent 定义已更新、skill 关联已验证、canonical 已同步、run index 已更新。
- **capabilityGapPacket (Fetch Step 5)** — 无匹配 agent 时，强制 3 步协议：产出 `capabilityGapPacket`、获取用户确认、记录缺口解决方案。静默降级为通用 agent 现为治理违规。
- **capability-search-index.tsv** — 新增 grep 友好的 TSV 索引（1056 条，334KB），由 `discover-global-capabilities.mjs` 生成，支持快速跨仓库能力查询。
- **Canonical hook 源文件** — `enforce-agent-dispatch.mjs`、`spine-state.mjs`、`stop-spine-cleanup.mjs` 现纳入 `canonical/runtime-assets/claude/hooks/` 源码管理。

### 变更

- **SKILL.md 跨平台规划** — 从 1 行提及升级为 5 条硬性规则，明确补充语义，Stage 3 强制执行，仅 `queryBypass: true` 时可跳过。
- **SKILL.md 阶段表格** — Stages 3–8 增加明确的 `progress.md`/`findings.md`/`task_plan.md` 更新提示（遵循 Step 3.7）。
- **enforce-agent-dispatch.mjs hook** — `isPlanningFile()` 现同时检查 Bash `command` 字符串和 `extractFilePath()`，允许在 Thinking 阶段通过 Bash 创建规划文件。
- **discover-global-capabilities.mjs** — 重构为提取 markdown 标题作为搜索关键词；同时生成 `capability-search-index.tsv` 和 JSON 索引。
- **AGENTS.md（Codex 入口）** — 在 Hidden Skeleton 章节新增规划文件强制段，提升 Codex/Cursor/OpenClaw 平台感知。

### 修复

- **Hook 阻止 Thinking 阶段创建规划文件** — `isPlanningFile()` 仅检查 `extractFilePath()`，对 Write/Edit 有效但对 Bash 工具无效。现同时检查 `toolInput.command` 字符串。
- **dev-governance.md 缺失 planning-with-files 引用** — 之前零引用。Step 3.7 填补此缺口。

## [2.0.27] - 2026-05-14

### 变更

- **SKILL.md 重构 (v3.0.0)** — 将 `canonical/skills/meta-theory/SKILL.md` 从 587 行精简至 307 行（减少 48%），同时完整保留所有决策逻辑、执行步骤、条件触发和边界。主要结构调整：
  - 合并 3 个重复的分发区块为统一的 Dispatch Rules 模块
  - 新增 Architecture Type Pre-judgment 区段，区分 Meta 架构与技术架构
  - 新增 DISPATCH SELF-CHECK 区段（>3 句话越限阈值）
  - 新增 Protocol-first Dispatch 规则（Stage 4 开始前必须产出 runHeader、dispatchBoard、workerTaskPackets）
  - 新增 Option Exploration (MANDATORY) 要求 Stage 3 至少探索 2 条方案路径并产出 Decision Record
  - 新增 evolutionWritebackPlan 文档
  - Type A-E 区段显式标注各自的 mandatory agents（meta-prism、meta-genesis 等）
  - 将 Design Principles 细节推至 `references/meta-theory.md`（SKILL.md 保留摘要）

### 新增

- **eval-contract.md** — 验证契约文件 `canonical/skills/meta-theory/evals/eval-contract.md`，包含决策逻辑、执行步骤、条件/触发器、边界检查清单及 5 个测试 prompt。

### 测试

- 全部 207 项 setup 测试通过。
- 全部 782 项 meta-theory 测试通过（初始因缺少测试期望字符串导致 18 项失败，已全部修复）。
- `meta:validate` 18/18 通过。

## [2.0.26] - 2026-05-14

### 新增

- **meta-theory SKILL.md 可测量分发阈值** — HARD DISPATCH RULE 区域增加了可计数的触发标准（读取 3+ 文件、产出 20+ 行代码、跨模块范围、任何文件修改），让分发决策基于客观指标而非主观的"看着简单"判断。语言平台中立，适用于所有运行时（Claude Code、Codex、OpenClaw、Cursor）。
- **subagent-context hook 子 agent 边界执行** — SubagentStart hook 现在注入一条治理规则：如果被派发的子 agent 发现任务范围超出其分配边界，必须上报而不是自行扩展。Claude Code 专属；其他运行时有各自的等价机制。
- **README 使用路径表** — 中英文 README 新增清晰的使用路径对照表，显示各运行时上下文下（仓库内 vs. 其他项目、Claude Code vs. Codex vs. OpenClaw vs. Cursor）哪些能力自动生效、哪些需要显式触发。
- **Stop hook 记忆保存反馈** — `stop-memory-save.mjs` 现在在成功保存时写一行 stderr 确认信息（`[meta-kim] Session memory saved (N chars, N tags)`），让用户可以看到治理闭环已执行。

### 修复

- **全局 skill 目录结构缺失** — 运行 `meta:sync:global` 现在能正确同步完整的 `meta-theory/` 目录结构（不再仅同步旧版扁平 `meta-theory.md`）到所有四个运行时主目录，修复了在 Meta_Kim 仓库外 `/meta-theory` 只能加载部分 skill 的问题。

### 测试

- 全部 207 项 setup 测试通过（包括之前失败的 `install-plugin-bundles` 测试）。
- 全部 782 项 meta-theory 测试通过。
- `meta:validate` 18/18 通过。`meta:check:global` 10/10 全绿。

## [2.0.25] - 2026-05-11

### 修复

- **Claude hook 命令跨平台兼容性** — Claude 全局与仓库级 hook 命令生成现在统一输出正斜杠路径，避免 Windows 路径（如 `C:\Users\...`）在 bash 类 shell 执行时被转义破坏。
- **Windows 下 MCP Memory Python hook 启动** — MCP Memory hook 安装器现在优先选择明确的 Python 可执行文件，跳过 WindowsApps 的 Python 占位 shim，并写出更稳的跨 shell Python hook 命令。

### 测试

- 新增 setup 回归测试，覆盖 Claude hook 正斜杠路径生成与 WindowsApps Python shim 规避。
- 发布前已验证定向 setup 测试与完整项目校验。

## [2.0.24] - 2026-05-11

### 修复

- **Windows 下 MCP Memory Service 静默开机启动** — Windows 开机自启现在只在 Startup 中保留静默 VBS launcher，将命令 wrapper 移到 `~/.meta-kim/`，并在更新时删除旧版会弹出终端窗口的 `mcp-memory-start.cmd`。
- **跨平台 MCP Memory 启动健康检查** — Windows、macOS、Linux 的开机启动 wrapper 会在启动后轮询 `http://127.0.0.1:8000/api/health`，如果 60 秒内未进入 healthy 状态，就向用户显示可见失败提示。
- **启动失败提示国际化** — MCP Memory 开机启动失败提示现在使用 setup i18n 文案，覆盖英文、中文、日文、韩文，不再硬编码英文。
- **发布元数据漂移** — 同步 `package-lock.json` 中的包版本号。

### 测试

- 新增 setup 回归测试，覆盖 Windows 静默迁移、跨平台健康检查 wrapper、用户可见失败提示，以及基于 i18n 的 MCP Memory 启动提示文案。
- 更新有效 cross-project run artifact fixture，补齐 `verifySteps`，使其符合当前 run validator 合约。

## [2.0.23] - 2026-05-05

### 新增

- **吸收 Karpathy 原子级执行模式** — 从 `forrestchang/andrej-karpathy-skills` 项目中提取四个高信号模式，融入 Meta_Kim 治理骨架：
  - **`verifySteps` 字段** 加入 `workerTaskPacket`（workflow-contract）：原子级步骤验证清单（`[步骤] → verify: [检查条件]` 格式），用于 Verification 阶段逐条检查，取代主观的"看着做完了"判断。
  - **简洁性 Push-Back 规则** 加入 Critical 阶段（dev-governance）：agent 在执行复杂方案前必须主动提出更简单的替代方案；自检标准："资深工程师会说太复杂吗？"
  - **精准变更卫生约束** 加入 Execution 阶段（dev-governance）：四条约束 — 只改该改的、只清理自己造成的孤立代码、每行变更必须可追溯到用户需求、存在更简方案时主动 push back。
  - **Agent 自检模式（"The Test" 模式）** 加入 Evolution 阶段（dev-governance）：每个 agent 的 SOUL 应包含简洁可检查的自检声明，Review 和 Meta-Review 阶段将其作为显式验证标准。

### 变更

- 更新 `valid-run.json` fixture，在示例 `workerTaskPacket` 中加入 `verifySteps` 字段。

## [2.0.22] - 2026-05-01

### 修复

- **MCP Memory Service API 兼容性** — Claude、Codex、Cursor、OpenClaw 的 memory hooks 现在使用 `POST /api/search` + `n_results` 查询记忆，并且只写入受支持的 `memory_type: "observation"`。
- **Memory hook 升级清理** — 删除旧的 event-to-memory-type 映射代码，并清理生成的 bytecode cache 残留，避免已安装过的环境继续保留旧 hook 行为。

### 测试

- 新增 setup 测试与项目校验闸门，禁止 legacy memory search endpoint、legacy memory type 和兼容字段残留回归。
- 发布前已验证 runtime sync、hook syntax、MCP memory hook 定向测试、Graphify health，以及完整 `npm run meta:check`。

## [2.0.20] - 2026-04-30

### 修复

- **footprint diff 准确性** — `footprint --diff` 现在使用真实文件系统存在性判断 manifest 路径是否缺失，不再把 manifest 里的子文件和扫描器汇总的目录项做精确字符串比较。目录与子文件会被视为同一覆盖关系，避免真实存在的 runtime skill 文件被误报 missing。
- **project/global manifest 对比** — `--scope=both` 现在会同时读取 project 与 global install manifest，不再只比较其中一侧。
- **sync manifest 刷新** — runtime sync 与 global meta-theory sync 会替换自己上次写入的 manifest 记录，并且即使文件已经最新也重新登记受管理路径，避免旧 source 路径长期残留。

### 测试

- 新增 manifest recorder 的 source replacement 回归测试，并于 2026-04-30 使用 `npm run meta:verify:all` 完成发布级验证。

## [2.0.19] - 2026-04-28

### 修复

- **跨运行时 MCP Memory 持久化** — `install-mcp-memory-hooks.mjs` 现在除 Claude Code 外，也会为 Codex、Cursor、OpenClaw 安装 MCP Memory 生命周期钩子。Codex 写入 `~/.codex/hooks.json` 的 SessionStart / UserPromptSubmit / Stop；Cursor 写入 `~/.cursor/hooks.json` 的 beforeSubmitPrompt / stop；OpenClaw 写入 `~/.openclaw/hooks/mcp-memory-service` managed hook。
- **MCP Memory Service API 对齐** — Claude 的 SessionStart 记忆查询改用上游 `POST /api/memories/search`，同时兼容旧的 `results[].memory` 返回结构。跨运行时保存钩子使用 `POST /api/memories`，并按上游建议带上 `X-Agent-ID` 和 `conversation_id`。
- **MCP Memory 端点兼容性** — 跨运行时记忆 hook 现在同时支持 `http://` 和 `https://` 形式的 `MCP_MEMORY_URL`。
- **记忆服务健康检查表述** — 安装器不再在当前 shell 无法访问 `localhost:8000`、但 `memory.exe` 正在运行时直接误报服务 down；现在会区分“不可响应”和“当前 shell 无法验证但进程存在”。

## [2.0.18] - 2026-04-28

### 修复

- **Codex `/meta-theory` agent team 执行** — `/meta-theory` 现在明确授权 Codex 使用 sub-agent delegation；非简单任务先应用 `agent-teams-playbook`，再把能力匹配后的执行计划转换成 Codex `spawn_agent` 调用，避免复杂任务只在主线程里做完。
- **quick deploy 根目录入口文件** — `setup.mjs` 现在会在 Claude 部署时复制 `CLAUDE.md`，在 Codex、OpenClaw、Cursor 部署时复制 `AGENTS.md`。`all` 模式下 `AGENTS.md` 只复制一次，避免冗余操作，同时保留各运行时需要的项目入口。
- **planning hook 阶段统计** — planning-with-files 的 shell / PowerShell stop 与 check 脚本现在会跨运行时打补丁，Codex adapter 模板也会同时识别 `## Phase` 和 `### Phase`，避免重新安装后 Stop hook 误报 `7/0 phases done`。
- **Claude Code smoke 验证** — `eval-meta-agents` 现在兼容不再提供 `agents` 子命令的 Claude Code 版本，改为直接校验 `.claude/agents/*.md`。Windows CLI 解析也会优先使用 npm 风格的 `~/.local/claude.cmd`，再考虑 native `~/.local/bin/claude.exe`。

### 测试

- 新增 setup 测试，覆盖 quick deploy 入口文件、Codex planning hook 阶段解析、Claude smoke fallback。
- 已于 2026-04-28 使用 `npm run meta:verify:all` 完成发布级验证。

## [2.0.17] - 2026-04-27

### 新增

- **Codex `/meta-theory` 命令投影** — 新增 canonical Codex 命令源 `canonical/runtime-assets/codex/commands/meta-theory.md`，并补齐项目级 / 全局同步，让 Codex 能从 `.codex/commands/` 和 `~/.codex/commands/` 加载 `/meta-theory`。

### 修复

- **Codex 命令验证与打包** — `config/sync.json`、`scripts/meta-kim-sync-config.mjs`、`scripts/sync-runtimes.mjs`、`scripts/sync-global-meta-theory.mjs`、`scripts/validate-project.mjs` 和 setup 测试现在把 Codex commands 作为一等运行时资产处理。同步修正 `.gitignore` 根目录锚定，避免 canonical Codex runtime assets 被误忽略。
- **OpenClaw skill 根目录接线** — 已核对 OpenClaw 已安装 CLI 的实际加载逻辑，并在 `canonical/runtime-assets/openclaw/openclaw.template.json` 通过 `skills.load.extraDirs` 接入 `__REPO_ROOT__\\openclaw\\skills`，让生成配置能加载仓库内 OpenClaw skills，而不是错误假定它们位于用户级 managed skills 目录。
- **Cursor agent / skill 路径对齐** — 已核对 Cursor 内置 `create-subagent` / `create-skill` 指南，并把 Cursor agent 生成改为在 `.cursor/agents/*.md` 写入 YAML frontmatter。Cursor 文档现在区分项目 skills（`.cursor/skills/<skill>/SKILL.md`）、用户 skills（`~/.cursor/skills/`）、内置 skills（`~/.cursor/skills-cursor/`）和用户 agents（`~/.cursor/agents/`）。
- **全局能力发现根目录** — `scripts/discover-global-capabilities.mjs` 现在扫描真实的 OpenClaw / Cursor 用户根目录：OpenClaw `~/.openclaw/skills` 加 `~/.agents/skills`，Cursor `~/.cursor/agents`、`~/.cursor/skills` 和 `~/.cursor/skills-cursor`。

### 变更

- **运行时文档刷新** — 更新 `AGENTS.md`、`CLAUDE.md`、`README.md`、`README.zh-CN.md`、`docs/runtime-capability-matrix.md` 和 research 文档，使其匹配已验证的 Codex、OpenClaw、Cursor 运行时位置与命令 / skill 行为。
- **OpenClaw 评估配置占位符递归替换** — `scripts/eval-meta-agents.mjs` 现在会递归替换生成配置对象里的 `__REPO_ROOT__`，不再只处理 agent workspace 路径。

## [2.0.16] - 2026-04-26

### 修复

- **四端 skill 清理** — `install-global-skills-all-runtimes.mjs` 四个关键修复：
  - `legacyNames` 支持 — 新增 manifest 字段用于删除旧 skill 目录（如 `find-skills` → `findskill`）。`cleanupLegacySkillNames()` 在安装前运行，清理过期的符号链接和目录。
  - `.disabled/ 残留清理` — 新增 `cleanupDisabledSkillResidue()`（单 skill）和 `sweepStaleDisabledDirs()`（全局清扫），当活跃版本存在时删除 `.disabled/{skillId}/`。捕获 manifest 外部署的 skill 残留（如通过 sync:runtimes 部署的 meta-theory）。
  - `loadSkillsManifest()` 字段传播 bug — `hookSubdirs`、`hookConfigFiles` 和 `fallbackContentDir` 从未从 manifest 复制到运行时 spec 对象。由于这个预存 bug，hooks 从未被部署。修复方式是为这三个字段添加展开运算符。
  - `deployHookSubdirs/deployHookConfigFiles` 目标路径 bug — 两个函数接收的是 `targetDir`（skills 根目录）但当作 `runtimeHome` 使用，导致 hooks 部署到错误路径。修改函数签名直接接收 `runtimeHome` 并更新所有 4 个调用点。

### 新增

- **hookprompt hook 部署机制** — hookprompt 现在作为 hook 系统正确安装，而非 skill clone：
  - 新增 `hookExtraFiles` manifest 字段 — 部署额外文件到 hooks 旁（如 `prompt-optimizer-meta.md` 到 `~/.claude/`）。
  - 新增 `hookSettingsMerge` manifest 字段 — 在 `settings.json` 中注册 hook 命令，路径指向已部署的 hook 脚本。
  - 安装脚本新增 `deployHookExtraFiles()` 和 `mergeHookSettings()` 函数。
  - `skills-manifest.schema.json` 新增三个字段的 schema 定义。
  - hookprompt manifest 条目现在包含 Claude 平台的 `hookSubdirs`、`hookExtraFiles` 和 `hookSettingsMerge`。

### 变更

- **i18n 新增** — 在 `meta-kim-i18n.mjs` 中为所有 4 种语言（en、zh-CN、ja-JP、ko-KR）添加 `warnLegacyNameRemoved` 和 `warnDisabledResidueRemoved` key。

## [2.0.15] - 2026-04-21

### 新增

- **stop-memory-save hook**: 新增 Stop hook (`stop-memory-save.mjs`)，在会话结束时将摘要写入 MCP Memory Service，实现跨会话连续性，无需手动干预。现在共有 10 个 hook 接入 `doctor:governance` 和 `validate:run`。
- **tests/setup/check-sync.test.mjs**: 预期 hook 数量从 9 更新为 10（新增 stop-memory-save）。
- **scripts/runtime-sync-check.mjs、doctor-governance.mjs、footprint.mjs、claude-settings-merge.mjs**: 在 hook 文件/命令列表中添加了 `stop-memory-save.mjs`。
- **`mirror` 作为业务工作流的第 11 个阶段** — `config/contracts/workflow-contract.json` 早已把 `mirror`（镜像发布 / Mirror Publish）声明为 `evolve` 之后的终态阶段；本次发布补齐所有依赖测试和文档，使三方同步到 11 阶段契约。同步后状态：`phases.length = 11`、`terminalPhases.length = 7`、`labels.{zh-CN,en-US}` 各有 11 条，`tests/meta-theory/07-contract-compliance.test.mjs` 与 `tests/meta-theory/12-ten-step-workflow.test.mjs` 不再 flaky。

### 修复

- **四端 hooks 纠正** — 四个平台（Claude Code、Codex、OpenClaw、Cursor）均有原生 hooks 系统。此前文档错误标注仅 Claude Code 有 hooks。Codex 支持 `hooks.json`（5 个事件，v0.117.0+），OpenClaw 支持 Plugin SDK hooks（28 个），Cursor 支持 `hooks.json`（4 个事件）。已更新 `runtime-capability-matrix.md`、`runtime-coverage-audit.md`、`distribution-matrix.md` 及四语言 README。
- **PWF hook 联合部署** — `install-global-skills-all-runtimes.mjs` 现在自动部署 planning-with-files 生命周期 hooks 到 Codex（`.codex/hooks/` + `hooks.json`）和 Cursor（`.cursor/hooks/` + `hooks.json`）。
- **Superpowers 稀疏回退** — 新增 `fallbackContentDir` 逻辑，当平台子目录（`.codex/`、`.cursor/`）内容过少时自动回退到 `skills/` 主内容目录。
- **`install-plugin-bundles` dry-run 状态串味** — `scripts/install-global-skills-all-runtimes.mjs`（1576–1583 行）在 `--dry-run` 模式下也会走"目录已存在就跳过"的幂等短路，导致 `obra/superpowers` 之类插件包的 sparse-checkout 预览命令在目标目录已缓存的机器上永远不会打印。单行 patch 加 `!dryRun &&`，让 dry-run 永远展示命令，真实执行的幂等性保持不变。修复 `tests/setup/install-plugin-bundles.test.mjs` 的 3 个历史失败（`Codex .codex/`、`Cursor .cursor/`、`OpenClaw skills/`）。

### 变更

- **11 阶段契约同步到测试和顶层文档**：`tests/meta-theory/07-contract-compliance.test.mjs`、`tests/meta-theory/12-ten-step-workflow.test.mjs`、`AGENTS.md`、`CLAUDE.md`、`canonical/agents/meta-conductor.md`、`canonical/skills/meta-theory/references/dev-governance.md`、`canonical/skills/meta-theory/references/ten-step-governance.md`。计数升级（`10 → 11`、终态 `6 → 7`），阶段数组末尾追加 `mirror`，zh-CN / en-US labels 各加一条 `镜像发布` / `Mirror Publish`。
- **discover-global-capabilities.mjs** — 新增 Cursor 平台扫描（skills + plugins）。
- **README 跨平台映射** — 在四语言 README（EN/ZH/JA/KO）中为 Codex、OpenClaw、Cursor 条目补充 hooks 说明。

### 已知问题

- `README.md` / `README.zh-CN.md` / `README.ja-JP.md` / `README.ko-KR.md` 正文和 Mermaid 图里仍在用 `mirror` 之前的 10 阶段叙述；四语 README 同步推迟到后续版本处理。
- 新克隆仓库首次跑 `meta:verify:all` 前必须先运行 `npm run meta:sync:global`，否则 `meta:check:global` 会在缺失 `~/.codex/skills/meta-theory/`（以及 `.cursor` / `.openclaw`）目录时硬失败。把这点写进 Getting Started 前置条件的任务已入队。

## [2.0.14] - 2026-04-20

### 新增

- **MCP Memory SessionEnd 自动保存 + 分层注入 (L1/L2/L3)**：两个互补的进度追踪机制，实现跨会话连续性。
  - **`scripts/install-mcp-memory-hooks.mjs`** — 扩展处理 Stop hook (`stop-save-progress.mjs`) 和 commands 目录 (`save-progress/`)。现在同时注册 SessionStart 和 Stop hook 到 `settings.json`。Stop hook 通过正则表达式从会话记录中自动提取已完成/待办任务，并持久化到 `.claude/project-task-state.json`。
  - **`canonical/runtime-assets/claude/hooks/stop-save-progress.mjs`** — Node.js Stop hook，读取会话记录，提取任务关键词（完成/搞定/新增/修复等），调用 `mcp_memory_global.py --mode save`。每次 Claude Code 会话结束后运行，始终退出 0。
  - **`canonical/runtime-assets/claude/memory-hooks/mcp_memory_global.py`** — 升级分层注入：
    - L1 紧凑：仅任务状态（约120字符）— 始终显示
    - L2 过滤：项目记忆（相关性 > 0.55，约400字符）— 上下文触发
    - L3 完整：最近记忆（约800字符）— 按需获取 via `--mode query-memories`
  - **`canonical/runtime-assets/claude/commands/save-progress/SKILL.md`** — 手动保存命令 (`/save-progress`)。允许用户精确控制时显式保存任务状态。
  - **中文友好限制**：`MIN_RELEVANCE=0.55`（针对中文嵌入模型下调），`MAX_LEN_COMPACT=120`，`MAX_LEN_L2=400`，`MAX_LEN_L3=800`。

### 修复

- **`scripts/install-mcp-memory-hooks.mjs` async + `fs` 导入 bug** — `copyCommandsDir()` 使用了 `fs.readdir()` 但导入的是同步 `fs` 模块，导致 "fs is not defined" 错误。通过从 `node:fs/promises` 导入 `readdir` 修复。同时修复了 `registered is not defined` 错误，正确捕获 `registerSessionStartHook()` 和 `registerStopHook()` 的返回值。

## [2.0.13] - 2026-04-20

### 新增

- **Layer 3 auto-start on setup**：运行 `node setup.mjs` 后自动在后台启动 MCP Memory Service（HTTP 模式），然后验证 `http://localhost:8000` 的健康端点。启动成功后创建平台特定的启动项（Windows 启动脚本 / macOS LaunchAgent / Linux XDG autostart）。整个过程非阻塞 — 失败时打印手动说明而不是中止安装。每种语言新增5个 i18n key（en / zh-CN / ja-JP / ko-KR）：`mcpMemoryAutoStarting`、`mcpMemoryAutoStarted`、`mcpMemoryAutoStartFailed`、`mcpMemoryAutoStartManual`、`mcpMemoryAutoStartBoot`。

- **Install Manifest Phase 4 — manifest驱动的卸载**：`scripts/uninstall.mjs` 现在优先使用安装清单而非文件系统扫描启发式。
  - 新增 `manifestEntryToFinding(entry)` 适配器，将 schema-v1 manifest 条目映射到 `planActions` 已消费的结构。
  - 新增 `findingsFromManifest({ scope, repoRoot })` 读取全局和/或项目清单。
  - `planActions()` 新增 `useManifest` 参数和 `--no-manifest` CLI 标志。
  - MSG 表格新增 `sourceManifest` / `sourceScan` 字符串（4种语言）。
  - 单元测试：`tests/setup/uninstall-manifest.test.mjs` 新增14个测试。

- **Install Manifest Phase 3 — 安装前预览 (MVP)**：`setup.mjs` 新增 `showExistingFootprint()`，在用户确认安装前显示磁盘上的现有 Meta_Kim 文件。
  - `scripts/sync-runtimes.mjs` 新增 `--json` 输出格式。
  - 3个新 i18n key：en / zh-CN / ja-JP / ko-KR（`footprintTitle`、`footprintFirstInstall`、`footprintRefreshNote`）。

- **Install Manifest Phase 2 — sync recorder 接入**：`sync-global-meta-theory.mjs` 和 `sync-runtimes.mjs` 现在将每次写入记录到安装清单。
  - `openRecorder()` 和 `recordSafe()` 包装器。
  - 15个新单元测试：`tests/setup/sync-runtimes-manifest.test.mjs`。

- **Install footprint + uninstaller (Phase 1)**：三个新脚本让用户完全了解 Meta_Kim 写入系统的内容并可逆。
  - **`scripts/install-manifest.mjs`** — Schema v1 + 9个分类（A–I）
  - **`scripts/footprint.mjs`** — `npm run meta:status` / `:json` / `:diff`
  - **`scripts/uninstall.mjs`** — `npm run meta:uninstall` / `:yes` / `:deep`

### 计划中

- **Install Manifest Phase 2 剩余部分** — `install-global-skills-all-runtimes.mjs` 和 `claude-settings-merge.mjs` 仍需接入 `openRecorder()` / `record()`。
- **Install Manifest Phase 3 后续** — 将"之前 footprint"升级为真正的 diff。
- **Install Manifest Phase 4 后续** — 将 `pip-package`、`mcp-server`、`git-hook` 建模为原生卸载操作。

### 修复

- **`scripts/claude-settings-merge.mjs` hookCommandNode 双转义问题** — Windows 路径双重 JSON 编码问题已修复。
- **MCP Memory Service 默认端口修正为 `8000`**。更新了 `mcp_memory_global.py`、`config.template.json`、`install-mcp-memory-hooks.mjs`、`setup.mjs` 和所有4个 README 文件。
- **`setup.mjs` `runMcpMemoryHookInstaller` i18n + 进度 UX** — 内存 hook 安装步骤的国际化修复。
- **`scripts/install-mcp-memory-hooks.mjs` 控制台输出左对齐** — 移除了多余的缩进。
- **`scripts/sync-runtimes.mjs` 缺少 canonical 警告国际化** — 新增 en / zh-CN / ja-JP / ko-KR 翻译。

## [2.0.12] - 2026-04-18

### 新增

- **Third-party Dependencies README 章节**：所有4个 README（EN/zh-CN/ja-JP/ko-KR）新增第三方依赖章节，在 License 之前。
- **MCP Memory Service 默认端口修正**：统一为官方 `8000`。

### 修复

- **MCP Memory Service 健康检查** — 修正10处硬编码端口问题。

## [2.0.11] - 2026-04-17

### 新增

- **setup.mjs MCP Memory Service i18n + 进度 UX** — 内存 hook 安装步骤的国际化修复。

## [2.0.10] - 2026-04-16

### 新增

- **`--scope project|global|both`** 在 `setup.mjs --update` 和 `sync:runtimes` 中一致工作。
- **共享 i18n 模块** (`scripts/meta-kim-i18n.mjs`) 统一所有安装/更新字符串（4种语言）。
- **Plugin 预检查**：`install-global-skills-all-runtimes.mjs` 使用 `claude plugins list --json` 检测已安装插件。

### 修复

- `sync-runtimes.mjs` Codex 路径修正：`.claude/` → `.codex/`。
- graphify Windows 命令：`graphify` → `python -m graphify`。
- `--update` 模式现在提示选择安装范围（project/global/both）。
- `.gitignore` 正确忽略衍生目录。

## [1.4.0] - 2026-04-10

### 新增

- **`canonical/` 规范源码层**：运行时中性设计 + repo 追踪的 sync 清单 (`config/sync.json`) + 三个运行时配置（Claude、Codex、OpenClaw）。
- **本地激活配置** via `.meta-kim/local.overrides.json`。
- **`--targets` 支持** across `setup.mjs`、`sync:runtimes`、`sync:global:meta-theory`、`deps:install:all-runtimes`。
- **`--scope` 支持**：`--scope project` 写入 repo 本地目录，`--scope global` 写入运行时主目录。

### 变更

- `.claude/` 不再被视为规范源码层；Claude、Codex、OpenClaw 现在是对等的运行时投射。
- `setup.mjs` 现在保存机器本地运行时选择。
- 验证、MCP 运行时加载、迁移暂存和 meta-theory 测试现在从 `canonical/` 读取。

## [1.3.0] - 2026-04-10

### 新增

- **运行时 `dispatchEnvelopePacket` 治理**：非查询运行的所有权验证。
- **Repo 本地状态布局** under `.meta-kim/state/{profile}/`。
- **Operator 命令**：`index:runs`、`query:runs`、`rebuild:run-index`、`migrate:meta-kim`。

### 变更

- `discover:global` 现在优先重建 `.claude/capability-index/meta-kim-capabilities.json`。
- `doctor:governance` 现在报告跨层健康状态。
- 同步所有运行时治理文档到新的 run-index / dispatch-envelope / compaction 模型。

### 修复

- 填充 `README.ja-JP.md` 和 `README.ko-KR.md` 中之前缺失的 README 更新。

## [1.2.3] - 2026-04-04

### 文档

- **README（全部4种语言）**：移除 `<div align="center">` 包裹 fenced Mermaid 代码块，让 **Cursor** 能渲染图表；表格保留 `div` 居中。

## [1.2.2] - 2026-04-03

### 文档

- 对齐 **README.ja-JP.md** 和 **README.ko-KR.md** 与 **README.md** / **README.zh-CN.md**：共享锚点、工作流图、运行时/八智能体小图。
- 修复 **Mermaid** 布局：`flowchart TB` 改为 stacked `flowchart LR`。
- 所有4个 README 表格用 `<div align="center">` 包裹。
- **仓库结构**：ASCII tree 改为 path | description 表格。
- **JA/KO**：新增两层层工作流词汇表、`npx … meta-kim` 行。
- 文档 **Meta_Kim** (`node setup.mjs`) 为 **KimYx0207/findskill** 的规范安装路径。
- **`npx` 一次性入口**：`npx github:KimYx0207/Meta_Kim meta-kim`。

### 新增

- **Graphify** 可选集成：压缩代码知识图谱，`graphify:*` npm 脚本，Fetch 阶段自动检测钩子，所有语言 README 章节。

### 修复

- 统一 **findskill** 命名。
- 安装 **planning-with-files** from `skills/planning-with-files/`。
- 安装 **findskill** 根据平台选择目录。

### 变更

- 扩展 `config/contracts/workflow-contract.json` 形式化卡片治理。
- 新增 `scripts/validate-run-artifact.mjs`。
- 同步 README 到新的卡片/发牌人/沉默/总结模型。
- 对齐 `package.json` 与最新发布版本。

## [1.2.1] - 2026-04-02

### 变更

- 恢复两个根 README 文件为更完整的项目形态。
- 中文 README 以 `元` 概念重新为中心。
- 同步 `README.md`、`README.zh-CN.md`、`AGENTS.md`、`CLAUDE.md` 与当前项目设计。

### 新增

- `.claude/skills/meta-theory/references/dev-governance.md` 中的规范所有权优先治理规则。
- 显式能力差距解决阶梯。
- 协议优先调度要求。
- 并行性要求。
- Evolution 回写规则。

### 同步

- 同步强化的规范 `meta-theory` skill 和 `dev-governance` 参考到 Codex 镜像、OpenClaw 镜像、共享 skills、workspace packs。

## [1.2.0] - 2026-03-28

### 变更

- 重命名私有 `meta/` 目录为 `docs/`。
- 同步所有 README 和文档文件。
- 移除过时的 `factory/` 引用。
- 添加 `config/contracts/` 到仓库树文档。
- 修复 `README.zh-CN.md` 中的重复步骤编号。
- 移除 `CLAUDE.md` 中的硬编码全局能力计数。
- 添加 `.claude/capability-index/` 到 `.gitignore`。
- 清理 `docs/runtime-capability-matrix.md` 中的本地 Windows 路径。

## [1.1.0] - 2026-03-27

### 新增

- 智能体版本控制（每个智能体的 YAML frontmatter `version` 字段）。
- 改进 CLI 输出 UX。

### 修复

- 强制单源 meta 工作流验证。
- 强制 OpenClaw 智能体注册检查。
- 强化 meta 运行时发现和 OpenClaw 智能体注册指导。

## [1.0.0] - 2026-03-22

### 新增

- 公开开源发布面。
- 8个旗舰专业 meta-agent 配置（`meta-warden` 到 `meta-scout`）。
- 跨运行时同步工具：`sync:runtimes`、`validate`、`eval:agents`。
- 全局能力发现 via `discover:global`。
- OpenClaw workspace 系列。
- Codex 智能体镜像在 `.codex/agents/*.toml`。
- 共享 skill 镜像层。
- 智能体健康报告脚本。
- MIT 许可证。

### 变更

- 将发布文档折叠到根 README 文件。
- 为开源发布精简 foundry 输出。
- 确定初始公开发布面。

## [0.5.0] - 2026-03-21

### 新增

- 跨运行时覆盖审计。
- 运行时能力矩阵。
- 仓库地图。
- Claude Code、OpenClaw、Codex 便携式运行时包。
- OpenClaw bootstrap 和本地认证资源。
- 运行时评估脚本。
- 运行时指南中文翻译。
- 论文参考和 DOI。

### 修复

- Bootstrap OpenClaw 本地认证。
- 强化跨运行时智能体和 skill 便携性。

## [0.1.0] - 2026-03-17

### 新增

- 初始项目结构作为 Claude Code 项目。
- 将 skills 转换为 agents 并合并 SPEC 内容到智能体定义。
- Meta_Kim 架构基线快照。
