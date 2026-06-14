# 更新日志

> 🇺🇸 [English](./CHANGELOG.md) | 中文版

这是 Meta_Kim 面向读者的更新说明。

更新说明只解释“改了什么、为什么重要”。过细的内部任务编号、低价值 backlog id 和实现流水账不放在这里；需要精确证据时，请看 Git 历史、测试、生成报告和 PRD 产物。

## [Unreleased]

## [2.8.31] - 2026-06-14

### 新增

- **Agent Teams Playbook 门禁** - 新增 P-110 支撑门和 `agentTeamsPlaybookPacket`，让默认治理路线在出现两条及以上独立可执行 worker lane 时选中 `agent-teams-playbook`，按最多 5 个 agent 分 wave；单 lane 任务记录为 `not_required`。
- **能力调用真实性层** - 新增 `agent_teams_playbook` 调用状态，避免把 selected provider、live subagent 调用、MCP、skill、command、hook 或本地 worker 互相冒充。
- **产品体验 Validator** - 新增 PRD/product validator，覆盖三大核心目标和支撑门，包括 LangGraph-style run packet、Dynamic Workflow 覆盖、用户可见运行面、能力调用真实性和 agent-teams 适配。

### 变更

- **Codex Meta-Theory Runtime** - 收紧 Codex `/meta-theory` 适配器和 meta-conductor prompt：`agent-teams-playbook` 只在真实并行 worker lane 中选中，不会套到所有非平凡任务上。
- **依赖登记** - 将 `agent-teams-playbook` 从 external reference 提升为 installed skill candidate，并加入兼容验证与不得越级宣称 live 调用的边界。
- **发布 Smoke 覆盖** - `meta:release:smoke` 现在包含 `agent-teams-playbook` 集成测试。

### 验证

- `npm run meta:deps:compat`
- `npm run meta:prd:product-experience:validate`
- `npm run meta:prd:default-execution:validate`
- `npm run meta:prompt:validate`
- `npm run meta:graphify:check`
- `npm run meta:release:smoke`
- Codex live probe 从线程 `019ec26d-8837-77b2-95c8-1361bcb91128` 创建 reviewer 子智能体 `019ec274-15a4-7603-9986-335dad22c699`；`wait_agent` 回流被中断，因此完整 Review 回流闭环仍只算 partial 证据。

## [2.8.30] - 2026-06-13

### 变更

- **主链安装默认项** - 将安装/更新时直接回车的默认目标改为 Claude Code + Codex，同时保留 OpenClaw、Cursor 的显式 all-runtime 或 `--targets` 选择路径。
- **Fetch 研究质量门** - 将 ECC 式 deep research 抽象内化为 Meta_Kim 原生 Fetch 合同，加入来源质量阶梯、关键来源深读、声明归因、交叉验证和原创综合边界。
- **兼容候选框架** - 基于官方资料新增 Qoder CLI、Trae、Kiro、Windsurf / Devin Desktop Cascade、Cline、Roo Code、Continue 的原始能力表面框架，同时保持 candidate probe，不升级为正式工具端投影。
- **兼容证据边界** - 将 GitHub 主完成判断与全工具端兼容证据拆开，Cursor 在 local-private PRD 与生成报告中保留为兼容后续项，并与主发布判断分离。

### 验证

- `npm run meta:sync`
- `npm run meta:release:smoke`
- `git diff --check`
- `node setup.mjs --update --lang zh --targets claude,codex --project-dir <dir>...`

## [2.8.29] - 2026-06-13

### 新增

- **原生选择面守卫** - 新增回归测试，防止 Codex 和 Claude Code 的关键分支决策被聊天卡片或纯 artifact fallback 冒充完成。
- **运行状态面** - 新增本地化 run-status envelope 和命令，让治理运行能展示用户可读进度，同时不泄漏内部 packet 名称。

### 变更

- **Codex 与 Claude Code 不降级规则** - Codex 必须用 `request_user_input`，Claude Code 必须用 `AskUserQuestion` 或 deferred `AskUserQuestion` 完成必需执行决策；原生交互面不可用或返回空时，会在 Execution 前阻断，而不是静默降级。
- **Runtime 镜像映射** - 已把 canonical meta-theory skill、meta agents、runtime references 和项目内 runtime mirrors 同步到 Claude Code、Codex、Cursor、OpenClaw。

### 验证

- `npm run meta:sync`
- `npm run meta:governance:validate`
- `npm run meta:prompt:validate`
- `npm run meta:check:runtimes`
- `npm run meta:test:meta-theory`
- `git diff --check`

## [2.8.28] - 2026-06-13

### 新增

- **默认治理执行证据** - 新增 validators 和 run artifact packets，证明默认 Meta-Theory 路径会产出治理 agent result、Conductor consumption evidence、worker result 和 worker execution evidence，同时不会把结构化 board 冒充成 live runtime 证据。
- **Research-to-native 产品化** - 新增来源化产品合同，覆盖研究采纳矩阵、MCP/provider 成熟度、trace/eval 控制、AG-UI 风格阶段事件、performance/cost budget 和 context engineering。
- **顺滑能力发现守卫** - 新增 PRD validator，把 agent、skill、script、MCP、tools、hook、runtime、memory、graph、external provider 都保留为一等发现类别，同时允许安全的 `no_expansion_needed`。
- **Runtime 优先级合同** - 新增机器可读合同和 validator，固定 Claude Code 与 Codex 为 prompt-first 主链路，OpenClaw 与 Cursor 只作为兼容目标保留。

### 变更

- **框架型 Prompt 架构** - Prompt 资产现在按 system/project/agent/skill/contract/runtime-adapter/eval 分层验收，并加入 review dimensions、regression fixtures 和 context-sprawl budget 规则。
- **治理验证链路** - `meta:verify:governance` 现在纳入 default execution、asset sedimentation、research-native、framework prompt architecture、smooth capability discovery 和 runtime priority validators。
- **唯一 PRD 源** - local-private PRD 现在把 P-067、P-068 到 P-084、P-085、P-092 标为本地已测通，同时把 Cursor native live 证据保留在兼容后续项中。

### 验证

- `npm run meta:prd:smooth-capability:validate`
- `npm run meta:prd:runtime-priority:validate`
- `node scripts/run-node-tests.mjs "tests/meta-theory/29-capability-gap-complete-product-prd.test.mjs"`
- `npm run meta:verify:governance`
- `npm run meta:release:smoke`
- `git diff --check`
- `npm run meta:github:gap`

## [2.8.27] - 2026-06-13

### 新增

- **Prompt-first 实机验收** - 新增和 PRD 绑定的 live acceptance contract 与 runner，要求同一套框架型 prompt 在 Claude Code 和 Codex 上都跑通，才能声明 prompt-first 全流程完成。
- **PRD 来源化门禁** - 新增 PRD source-map 与分类 dossier validators，覆盖产品发现、prompt/runtime、MCP/tools/providers、安全、评测/可观测性、架构/发布等大类。

### 变更

- **抽象 Prompt 能力验收** - `meta:prompt:validate` 和治理验证现在会覆盖能力发现、prompt intake 优化、planning 连续性、runtime 原生能力、MCP/provider、memory/graph、安全 hook、发布证据和 i18n 等抽象能力族。
- **Prompt-first 发布证据收口** - 治理验证现在纳入 prompt-first stage contract、live acceptance fixture、source-map 校验、PRD 分类 dossier，以及 public docs 图片资产边界。
- **Codex 实机 runner 稳定性** - Codex live acceptance runner 现在通过 `codex exec -` 从 stdin 传入 prompt，避免 Windows `.cmd` 多行 prompt 卡住，同时保留真实 Codex 执行证据。

### 验证

- `npm run meta:prd:prompt-first-live:run`
- `npm run meta:prd:prompt-first-live:validate`
- `npm run meta:verify:governance`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.26] - 2026-06-12

### 修复

- **Meta-Theory 深度 Fetch 入口** - 项目/仓库/代码库理解、商业化发展和策略类问题现在会进入治理化 Fetch 路径，不再落到浅层 fast path 回答。
- **跨运行时入口对齐** - 新增 Claude Code `/meta-theory` command 投影支持、Cursor 原生 always-on dispatch rule、OpenClaw HEARTBEAT/SOUL 项目理解契约，让 Claude、Codex、Cursor、OpenClaw 都走同一条治理入口约束。
- **Run artifact 证据补齐** - `meta:theory:run` 现在会为项目理解类运行记录项目概览、维护契约、命令库存、Graphify、MCP、能力索引、机器契约和外部检索能力等 Fetch source class。

### 验证

- `node --test tests/meta-theory/47-meta-theory-entry-classifier.test.mjs`
- `node --test tests/setup/sync-runtimes-manifest.test.mjs`
- `node --test tests/governance/core-loop-contract.test.mjs`
- `npm run meta:sync`
- `npm run meta:check`
- `git diff --check`

## [2.8.25] - 2026-06-12

### 修复

- **Claude Code 全局 Hook 清理** - 全局 Meta_Kim 同步现在会校验 Claude Code `settings.json` 里的 hook 命令，不再只检查 `~/.claude/hooks/meta-kim/` 包目录。这样可以抓到指向已删除脚本的旧全局 Meta_Kim hook 注册，避免 Claude Code 在 Stop 阶段反复报 `MODULE_NOT_FOUND`。
- **已安装用户恢复路径** - 正常 setup/update 路径现在会清理旧的全局 Meta_Kim hook 条目，只保留当前被管理的全局 hook 命令；已有安装不需要手工改 Claude settings 也能恢复。

### 验证

- `npm run meta:check:global:release`
- `npm run meta:test:setup`
- `npm run meta:verify:governance`
- `npm run meta:check`
- `git diff --check`

## [2.8.24] - 2026-06-12

### 变更

- **Runtime Safety 治理契约** - 新增发布级治理契约，把近期 5 条修复线收进同一个 validator：宿主配置安全合并、跨 runtime HookPrompt 协议建模、删除/重构残留清扫、runtime evidence 模板、安装/更新状态语义。
- **安装状态语义固定** - 安装和更新文案现在有机器可读状态类：`success`、`skipped`、`manual`、`failed`，并绑定用户下一步动作，避免把预期跳过、手工步骤和真实失败混在一起。
- **HookPrompt 坏输入回归** - 新增 markdown fence、delegated prompt、internal-goal filter 三类回归样本，并验证 Codex / Cursor adapter 会把优化内容放进模型可见字段，不把 UI 提示误当成策略决策。

### 验证

- 新增 `npm run meta:runtime:safety:validate`，并接入 `meta:verify:governance`。
- `npm run meta:verify:governance`
- `npm run meta:test:setup`
- `npm run meta:sync`
- `npm run discover:global`
- `npm run meta:check`
- `npm run meta:validate`
- `npm run meta:release:smoke`
- `npm run meta:setup:check`
- `npm run meta:validate:run -- tests/fixtures/run-artifacts/valid-core-loop-release-run.json`
- `npm run meta:graphify:rebuild`
- `npm run meta:verify:all`
- `git diff --check`

## [2.8.23] - 2026-06-12

### 变更

- **Run-scoped Worker 实机执行** - `meta:theory:run` 现在会通过本地 run-scoped worker executor 执行 bounded worker task packets，不再停在结构化调度就绪。主线程仍然只负责 scope、dispatch、review 和 synthesize；不会额外派外部 Agent。

### 验证

- 增加 governance 覆盖，要求 worker execution evidence，同时继续保留 public-ready 发布门禁。

## [2.8.22] - 2026-06-12

### 变更

- **核心治理线路发布证据收口** - 补齐 PDR 发布清单和最终发布证据，让最终 tag 内包含 commit、tag、push 和 GitHub Release 证明。

### 验证

- 复用 `2.8.21` 的核心治理线路实现证据，并为最终 `2.8.22` patch 发布重新运行本地发布检查。

## [2.8.21] - 2026-06-12

### 变更

- **核心治理线路修复** - Meta_Kim 现在有了默认 8 阶段治理路径的机器契约，覆盖 Critical、Fetch、Thinking、Execution、Review、Meta-Review、Verification、Evolution 的输入输出、跳过条件、门禁、阻断、警告、public-ready 和写回策略。
- **默认运行产物闭合** - `meta:theory:run` 现在会为普通自然语言 durable task 输出顶层 request、intent、fetch、能力库存、gap/ready、thinking、dispatch、worker task、execution、review、meta-review、verification、evolution、dynamic workflow 和 public-ready 包。
- **能力发现总线接入默认入口** - 默认 run 不再只带 skill 或粗粒度摘要，而是接入统一 capability inventory bus。能力记录覆盖 agent、skill、script/tool、MCP、hook、runtime、OS、memory、graph 和外部依赖候选，并使用统一 provider 字段。
- **发布治理门禁补齐** - 完整发布验证现在会包含 governance validators 和 governance tests，覆盖 strict workflow fixture、PDR 证据映射，以及脚本 registry 的 cleanup candidate 保护。

### 验证

- `npm run meta:sync`
- `npm run discover:global`
- `npm run meta:check`
- `npm run meta:validate`
- `npm run meta:release:smoke`
- `npm run meta:verify:governance`
- `npm run meta:graphify:rebuild`
- `npm run meta:check:global:release`
- `npm run meta:verify:all`
- `npm run meta:validate:run -- tests/fixtures/run-artifacts/valid-core-loop-release-run.json`
- `git diff --check`

## [2.8.20] - 2026-06-11

### 变更

- **项目 Hook 归属合理化** - 项目级运行时导出现在只保留和 Meta_Kim 项目行为强相关的 hook，例如图谱上下文、能力优先调度和 meta-theory 激活。提示词优化、记忆生命周期、planning 辅助、通用危险命令拦截这类个人通用 hook，统一留在全局运行时目录，不再重复投影到每个项目。
- **全局 Hook 同步覆盖补齐** - 全局同步和发布检查现在会明确比对被管理的全局 hook 文件；项目同步会清理 Codex / Cursor 项目目录里残留的全局专属 hook adapter。这样依赖项目自己的 hook 可以继续从源项目更新，也避免同一份提示词或上下文被重复注入。
- **Codex MCP 配置合并规范化** - Codex MCP 配置合并逻辑进一步收紧，ECC 管理的 server 会按统一命名和结构归一化，同时继续保留用户自己的配置。

### 验证

- `npm run meta:release:smoke`
- `npm run meta:check`
- `npm run meta:check:global:release`
- `npm run meta:test:setup`
- `node scripts/validate-provider-capabilities.mjs`
- `node scripts/validate-foundational-capabilities.mjs`
- `node scripts/validate-hook-progression.mjs`
- `npm run meta:graphify:check`
- `git diff --check`

## [2.8.19] - 2026-06-11

### 变更

- **Apache-2.0 + NOTICE 署名声明** - Meta_Kim 主项目许可证从 MIT 调整为 Apache License 2.0，并新增根目录 `NOTICE` 文件承载推荐署名。商业使用仍然允许；分发 Meta_Kim 或其实质性部分时，需要保留 Apache 许可证文本和 NOTICE 署名声明。此前已经发布的版本仍按各自发布时附带的许可证适用。
- **多项目运行时自动更新** - `setup.mjs` 现在可以一次刷新多个显式传入或已保存项目目录里的项目级运行时文件，支持用 `--project-dir` 传入脚本化目标、用 `--save-project-dirs` 保存脚本传入列表，也支持用 `--all-projects` 复用本机保存的目标列表。
- **已保存项目目录管理器** - 更新向导现在支持管理已保存项目目录列表，可在一行里用分号或逗号输入多个目录，从菜单里更新全部已保存项目，也可用 `--all-projects` 复用。
- **批量更新时保护项目配置** - 多项目运行时导出会保留并合并已有本地 `settings`、MCP 和 hook 配置，不再直接替换；`.claude/settings.local.json`、Codex 项目配置、OpenClaw workspace 状态等本地状态不会被导出。

### 验证

- `node --check setup.mjs`
- `node --test tests/setup/project-deploy-protection.test.mjs tests/setup/setup-update-default-flow.test.mjs tests/setup/i18n.test.mjs`
- `npm run meta:test:setup`
- `npm run meta:sync`
- `npm run meta:check`
- `npm run meta:verify:all`
- `npm --registry=https://registry.npmjs.org audit --audit-level=high`
- `npm run meta:graphify:check`
- `git diff --check`

## [2.8.18] - 2026-06-11

### 修复

- **Codex Planning Stop Hook 改为提示模式** - Codex 的 planning-with-files Stop hook 不再把普通进度提醒转成强制继续执行。这样回答已经完成时，不会因为结尾触发旧计划提醒，就把关键答案折叠进 Codex App 的“已处理”区域。
- **零 Phase 计划不再误判未完成** - Codex planning hook adapter 遇到 `0/0` phase 计数时会安静跳过，不再当成未完成任务；混合 `**Status:**` 与 inline `[status]` 的计划格式，也会与 shell / PowerShell hook 一样稳定计数。

### 变更

- **变更准备合同** - 运行时、hook、setup、sync、provider、删除和发布类 PR 现在有可复用检查清单，覆盖宿主状态影响矩阵、hook/prompt 协议流、删除残留清扫和证据预算。
- **执行模式分类** - `executionMode` 现在会明确映射到 `real_execution`、`read_only_sidecar`、`approval_gate` 三类。验证器和 Review 可以按语义类别判断执行是否真实发生，而不是只看任务节点数量。

### 验证

- `node --check scripts/install-global-skills-all-runtimes.mjs`
- `node --check scripts/validate-project.mjs`
- `node --check scripts/validate-run-artifact.mjs`
- `node --test tests/setup/release-docs-semantics.test.mjs tests/setup/install-cross-platform.test.mjs`
- `node --test tests/meta-theory/09-run-artifact-validator.test.mjs tests/meta-theory/31-capability-gap-orchestration.test.mjs tests/meta-theory/33-capability-gap-orchestration-quality.test.mjs`
- `node scripts/validate-provider-capabilities.mjs --strict-global-hooks --json`
- `npm --registry=https://registry.npmjs.org audit --audit-level=high`
- `npm run meta:verify:all`
- 本机 Windows Codex planning Stop hook smoke：`0/0` phase 计划不再 block；普通未完成计划只返回 `systemMessage`，不返回 `decision:block`。
- 已安装用户路径 hook 合并 smoke：重新安装 `planning-with-files` 后，Codex 同时保留 `user_prompt_submit.py` 和 `hookprompt-adapter.mjs`；Cursor 的 `beforeSubmitPrompt` 仍保留 `hookprompt-adapter.mjs`。

## [2.8.17] - 2026-06-11

### 修复

- **编排任务有真实执行模式** - `workerTaskPacket` 现在会声明 `executionMode`，Meta_Kim 可以区分真正执行 worker、审批门禁，以及只读 Fetch/Review sidecar。只包含 sidecar 或审批步骤的并行组，不能再通过质量门。
- **Capability Gap 编排验证更严格** - Capability-gap 报告现在会把 execution mode 贯穿到 worker packet、任务板、Review 检查、验证摘要和 run artifact validator。这样“看起来并行、实际没执行”的假并行会被直接暴露并拦下。
- **ECC 插件更新路径修正** - Claude plugin update 模式在发现已有 ECC 插件记录时，会调用 `claude plugin update ecc@ecc`；更新成功后重新读取插件管理器记录，避免沿用旧路径或旧 SHA。
- **Graphify Python 发现更稳** - Graphify setup 和 runtime 检查会在普通 `python3` / `python` 之后继续尝试 Homebrew 和 Linuxbrew Python 路径。macOS / Linux 用户即使 Python 没放进 PATH，也更容易完成 Graphify 初始化。

### 验证

- `node --test tests/meta-theory/09-run-artifact-validator.test.mjs`
- `node --test tests/meta-theory/31-capability-gap-orchestration.test.mjs tests/meta-theory/33-capability-gap-orchestration-quality.test.mjs`
- `node --test tests/setup/graphify-runtime.test.mjs tests/setup/graphify-wiring-contract.test.mjs tests/setup/install-cross-platform.test.mjs tests/setup/install-plugin-bundles.test.mjs`
- `node --test tests/integration/agent-teams-playbook-integration.test.mjs tests/meta-theory/39-orchestration-dag-report.test.mjs tests/meta-theory/40-orchestration-scheduler-report.test.mjs`
- `npm run meta:gap:validate-board`
- `npm run meta:gap:complex-inputs`
- `npm run meta:gap:codex-real-test`
- `npm run meta:test:setup`
- `npm run meta:test:meta-theory`
- `npm run meta:check`
- `npm run meta:graphify:rebuild`
- `npm run meta:graphify:check`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.16] - 2026-06-10

### 修复

- **复制后自动初始化 Graphify** - 复制到任意项目根目录的 Meta_Kim 项目级文件夹，不再要求用户记住并手动运行 `node meta-kim-post-copy.mjs`。首次触发 `meta-theory` 时，Meta_Kim 会从最终项目根目录自动启动 post-copy bootstrap。
- **首次触发不阻塞** - 生成的 `meta-kim-post-copy.mjs` 现在支持 `--auto` 和 `--auto-worker`。hook 只启动一个分离的后台 worker，把一次性状态写入 `.meta-kim/state/default/post-copy-init.json`；即使 Graphify 依赖安装或建图耗时较长，也不会卡住 meta-theory 启动路径。
- **运行时 hook 覆盖补齐** - Claude Code 和 Codex 的 Skill 激活会调用同一个 shared spine hook；Cursor 的 prompt hook 也能在显式 `meta-theory` 输入时走同一路径自动 bootstrap。需要显式关闭时，可以设置 `META_KIM_POST_COPY_AUTO=off`。
- **回归测试覆盖** - setup 测试现在锁定自动 bootstrap 契约、Cursor prompt hook 顺序，以及复制后 Graphify 初始化行为。

### 验证

- `npm run meta:test:setup`
- `npm run meta:graphify:rebuild`
- `npm run meta:release:smoke`
- `npm run meta:graphify:check`
- `git diff --check`
- `node --check setup.mjs`
- `node --check canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs`
- `node --check scripts/runtime-hook-mapping.mjs`
- `node --check scripts/sync-runtimes.mjs`

## [2.8.15] - 2026-06-10

### 修复

- **可复制目录的 Graphify 初始化** - quick setup 或 install/update 导出的项目级文件夹现在会包含 `meta-kim-post-copy.mjs`。当你先把生成目录放在桌面等临时位置，再把其中全部内容复制到任意项目根目录后，在最终项目里运行 `node meta-kim-post-copy.mjs` 即可为该项目初始化 Graphify。
- **临时目录边界更清楚** - Meta_Kim 不再把桌面这类生成/暂存目录误当成最终 Graphify root。这样不会为错误目录生成或复制过期的 `graphify-out/`，Graphify 仍然按最终项目逐个初始化。
- **复制后契约测试覆盖** - setup 测试现在会锁定 copy-ready 契约：运行时文件复制完成后才写入 bootstrap；bootstrap 用自身所在目录作为项目根；install/update 导出不会悄悄在暂存目录里构建 Graphify。

### 验证

- `node --check setup.mjs`
- `node --test tests/setup/graphify-wiring-contract.test.mjs`
- `node --test tests/setup/install-cross-platform.test.mjs tests/setup/setup-update-default-flow.test.mjs tests/setup/i18n.test.mjs`
- `npm run meta:test:setup`
- `npm run meta:graphify:rebuild`
- `npm run meta:graphify:check`
- `git diff --check`

## [2.8.14] - 2026-06-10

### 修复

- **安装和更新提示本地化** - ECC、Graphify、Codex 配置保护、原生插件交接、插件市场检查和回环代理处理等安装/更新输出，现在统一走 Meta_Kim shared i18n，不再散落硬编码英文。中文、日文、韩文用户会看到本地化的跳过状态和手动宿主插件步骤。
- **ECC 上游版本跟随** - ECC 原生安装现在使用 `ecc-universal@latest`，不再使用旧的 `2.0.0-rc.1` release candidate；运行时清单、文档、兼容性证据和 setup 测试都已同步。
- **插件交接提示不再误导** - 宿主限制导致的预期手动步骤现在显示为跳过/手动处理，不再像失败警告。Codex 和 Cursor 原生插件提示会说明应走宿主插件入口，而不是暗示技能目录回退失败。
- **Graphify 跳过状态一致** - 已经存在 Graphify 指南章节时，Graphify install 会输出本地化跳过提示；旧的 `[SKIP] graphify ...` 也统一成 Meta_Kim 的跳过状态输出。
- **HookPrompt Markdown 安全输出** - 上游 HookPrompt 依赖现在会把用户原始输入和优化后的完整提示词都放进 fenced code block；因此 `# Files mentioned by the user:` 这类附件标题不再会在 Codex 中间输出里被渲染成超大 Markdown 标题。

### 验证

- `node --check .claude/hooks/user-prompt-submit.js; node --check .codex/hooks/user-prompt-submit.js; node --check test-hook.js`（在 `D:/KimProject/HookPrompt`）
- `node test-hook.js`（在 `D:/KimProject/HookPrompt`）
- `node scripts/install-global-skills-all-runtimes.mjs --dry-run --update --skills ecc,superpowers --targets claude,codex,cursor --lang zh-CN`
- `node --test tests/setup/install-plugin-bundles.test.mjs tests/setup/graphify-wiring-contract.test.mjs tests/setup/install-cross-platform.test.mjs`
- `npm run meta:test:setup`
- `npm run meta:capabilities:smoke`
- `npm run meta:check`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `npm run meta:graphify:rebuild`
- `npm run meta:graphify:check`
- `git diff --check`

## [2.8.13] - 2026-06-10

### 修复

- **Codex App 原生控制保护** - Meta_Kim 现在会在运行 ECC Codex home installer 前保护用户已有的 `~/.codex/config.toml`。这次问题是因为发现 ECC 的 Codex 安装路径会把它自己的 reference `config.toml` 覆盖到用户的 Codex App 配置上，进而导致 Codex 的 Computer Use 和 Chrome 插件连接失效。
- **ECC 配置合并安全性** - ECC upstream installer 运行后，Meta_Kim 会用用户原始 Codex 配置作为最终基底，只把 ECC 新增项 add-only 合进去，再恢复 Codex App 的 Browser、Chrome 和 Computer Use 原生插件配置。这样不会丢用户已有的 MCP servers、hooks、agents、projects、profiles 和其它全局 Codex 设置。
- **Windows Codex App 恢复** - Windows 安装路径现在会修复 Codex App 原生控制面：保持 `windows.sandbox = "unelevated"`，启用 `features.js_repl`，移除失效的 `.codex/.tmp/bundled-marketplaces/openai-bundled` marketplace source，并在存在时保留 Computer Use notification helper。

### 验证

- `node --test tests/setup/codex-config-merge.test.mjs`
- `node --test tests/setup/install-plugin-bundles.test.mjs`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `npm run meta:graphify:rebuild`
- `git diff --check`

## [2.8.12] - 2026-06-10

### 修复

- **Codex HookPrompt 模型上下文** - Codex 的 HookPrompt adapter 现在输出 `hookSpecificOutput.additionalContext`，不再把优化结果包成 `systemMessage`。这修复了“hook 确实执行了、界面或日志能看到，但模型没有稳定吃到优化提示词”的问题。
- **Codex 记忆上下文** - Meta_Kim shared memory hook 在 Codex 里也改用和 Claude Code 一样的模型可见上下文包；Cursor 继续使用自己的 `prompt` 包，UI 提示仍保持独立。

### 变更

- **HookPrompt 依赖路径** - Meta_Kim 会优先查找 HookPrompt 源项目提供的 Codex adapter，再回退到 Claude hook 实现，和依赖项目的新结构对齐。

### 验证

- `node test-hook.js`（在 `D:/KimProject/HookPrompt`）
- `node --test tests/setup/sync-runtimes-manifest.test.mjs tests/setup/mcp-memory-hooks.test.mjs`
- `node scripts/install-global-skills-all-runtimes.mjs --update --skills hookprompt --targets codex`
- `codex exec --dangerously-bypass-hook-trust --skip-git-repo-check --sandbox read-only --cd D:/KimProject/课程素材 "帮我做个小红书营销自动发布器，先别改文件，先说你理解到什么"`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.11] - 2026-06-09

### 变更

- **全局和项目级 Hook 策略** - Meta_Kim 现在明确区分项目级治理 hook 和全局可复用 hook。派工强校验、Graphify 上下文、meta-theory spine 这类强治理能力默认留在项目级；全局安装只放记忆保存、HookPrompt、OpenClaw memory bridge 这类安全可复用入口。

### 修复

- **Cursor 全局 HookPrompt** - Cursor 全局 `beforeSubmitPrompt` 现在会注册 HookPrompt adapter，和 Codex 全局 `UserPromptSubmit` 的策略对齐；严格 provider 验证也会同时检查 Codex 和 Cursor。
- **Hook 能力清单** - provider registry 现在把 Codex 和 Cursor 的 HookPrompt adapter 分开建模，项目投影和全局安装会按各自 runtime 与 hook 事件验证。

### 验证

- `node scripts/install-global-skills-all-runtimes.mjs --skills hookprompt --targets cursor`
- `node scripts/validate-provider-capabilities.mjs --strict-global-hooks --json`
- `node --test tests/setup/install-cross-platform.test.mjs`
- `node --test tests/governance/provider-capabilities.test.mjs`

## [2.8.10] - 2026-06-09

### 新增

- **Dynamic Workflow** - 自然语言产品需求现在会展开成当前任务真正需要的执行通道，而不是套固定清单。比如“小红书营销自动发布器”会选择产品、研究、内容、UX、前端、后端、数据、集成、安全、测试、运维；“本地待办看板”只选择更小的必要集合。
- **Project Agent Profiles** - 动态通道会先合成本次运行固定的项目 agent profile，再进入执行。profile 记录项目范围、角色族、能力装载、记忆策略、证据规则和晋升策略；一次性 worker 不再被误认为持久项目 agent。
- **Evidence Policy** - 研究、集成、安全、运维通道会明确声明是否必须查询当前外部证据。平台规则、API、供应商能力、合规、安全、发布路径、第三方可行性等判断，必须有来源支撑后才能锁定路线。
- **Local Baseline Comparison** - 每个被选中的通道都要先和本地真实情况对比：canonical agents / skills、contracts、capability indexes、runtime mirrors、package scripts、MCP 配置、OS/runtime 矩阵和项目记忆。
- **Graphify Agent Equipment** - 项目 agent profile 现在把 Graphify 当成导航和子图切片能力，而不是整图上下文注入。运行时优先复用已有图谱产物，只给 worker 注入相关切片，关键判断仍回到源文件验证，修改后再重建图谱。
- **Conversation Notice** - 普通自然语言请求进入治理流程时，会输出本地化的人话状态提示，让用户知道现在发生了什么、下一步做什么，而不需要懂 packet 名或命令语法。

### 修复

- **自然语言入口** - 持久性人类请求不再要求用户说出 `meta-theory`、`Critical` 或 `Fetch` 这类协议词。产品构建类请求会自动进入治理路线，纯只读问题仍走轻量路径。
- **OpenClaw 和 Cursor 贡献证据门** - OpenClaw 或 Cursor 相关改造必须先在对应工具端完成严格自测并提供证据，审查通过后才能合并。
- **编排输出可读性** - 编排摘要现在能看见 project agent id、固定的 capability profile、是否需要外部证据、是否需要本地基线对比。

### 验证

- `node --test tests/meta-theory/31-capability-gap-orchestration.test.mjs`
- `node --test tests/meta-theory/34-run-deliverables.test.mjs`
- `npm run meta:sync`
- `npm run meta:release:smoke`
- `npm run meta:graphify:rebuild`
- `git diff --check`

## [2.8.8] - 2026-06-09

### 变更

- **工具端报告文案** - 公开报告保留协议标签，但配上人能看懂的说明。
- **工具端支持口径** - Claude Code 和 Codex 说明为完整支持；OpenClaw 和 Cursor 说明为正式兼容投影，并要求更严格的贡献证据。
- **持久 agent 边界** - 临时 subagent 是 factory 或 review worker，不等于被创建出来的项目 agent。
- **工具端来源** - 报告里的工具端目标来自 runtime compatibility 数据，不再写死名称。

### 验证

- `npm run meta:sync`
- `npm run meta:check`
- `npm run meta:providers:validate`
- `npm run meta:hook:validate`
- `npm run meta:route:validate`
- `npm run meta:runtime:validate`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.7] - 2026-06-09

### 变更

- **跨工具端 Fetch 发现** - Claude Code、Codex、Cursor、OpenClaw 在 Thinking 前都要记录项目和全局能力库存证据。
- **Provider 扫描对齐** - 全局发现覆盖 settings、hooks、skills、prompts、rules、MCP config、package scripts 和 workspace agents。
- **运行时 skill 投影稳定性** - runtime sync 保留跨工具端 Fetch checklist，不再把路径错误改写成其它工具端的投影路径。

### 验证

- `npm run meta:sync`
- `npm run meta:route:validate`
- `npm run meta:capabilities:smoke`
- `npm run meta:check:runtimes`
- `npm run meta:test:meta-theory`
- `git diff --check`

## [2.8.6] - 2026-06-05

### 新增

- **Capability Gap 产品化** - Capability Gap 不再只是脚本能力，而是带决策合约、输出合约、真实输入回放、编排板校验和验收门的产品流程。
- **Run 交付物** - 治理运行增加用户可见交付物、趋势面板、审批面板、GitHub 差距报告、验证包、研究报告、能力浏览器、DAG/调度报告、worker 输出报告和产品交付 bundle。
- **Runtime 证据加固** - 增加 live shard matrix、Cursor live boundary contract、OpenClaw batch stability evidence、Codex timeout recovery evidence 和复杂回放场景。
- **项目文件盘点技能** - 增加项目内可复用的同组文件盘点 skill。

### 修复

- **Hook 同步可移植** - 项目 Claude hook 命令保持 repo 相对路径，全局 hook 继续使用 slash-normalized absolute commands。
- **生成报告卫生** - 生成报告移出 tracked docs 路径，并移除风险较高的跨项目批量更新器。
- **PRD 闭环对齐** - complete-product guard 跟随当前完成状态，不再盯着过期的 unfinished markers。

### 验证

- `npm run meta:sync`
- `npm run discover:global`
- `npm run meta:check:global`
- `npm run meta:check`
- `npm run meta:graphify:rebuild`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `git diff --check`

## [2.8.5] - 2026-06-03

### 新增

- **发布模式** - 低风险 prompt、文档、治理文案改动走快速发布路径；安装、runtime、hook、provider、dependency、package、安全和 live evidence 相关工作仍走更严格的 release-grade 路径。
- **执行需求证明** - release-grade 工作必须在修改或发布前证明 Fetch -> Thinking 路线已经选择 owner、agent provider、skill provider、MCP provider、command/runtime tool 和 verification path。
- **Live 证据分类** - structural smoke、warning、skipped/needs-auth 和真实 runtime live pass 被明确区分。

## [2.8.4] - 2026-06-02

### 新增

- **能力发现 smoke** - 增加 smoke 命令，用来证明真实执行需求可以自然选择 owner、provider、tool 和 verification path。
- **OpenClaw live 分片** - Claude/OpenClaw 长时间 live 检查可以按 agent 分片，便于恢复和定位问题。

### 修复

- **执行路由** - 工程执行进入 Execution 前必须先绑定真实 owner / provider / verification 证据。
- **OpenClaw live evaluation** - OpenClaw 检查继承配置好的 provider/model 表面，并能更稳地恢复嵌套 JSON 和 session 输出。
- **OpenClaw auth hydration** - 本地 OpenClaw auth 可以复用已有可用的 meta-agent auth 来源，同时不覆盖已经能用的文件。

## [2.8.3] - 2026-06-02

### 新增

- **Capability Provider Contract** - 增加 provider registry 和生命周期模型，用于管理 runtime-native tools、skills、agents、hooks、commands、rules、plugins、MCP servers、dependency projects、memory 和 graph providers。
- **Provider validator** - 增加 provider/runtime/OS/install-layer 缺口校验，并支持严格检查全局 Codex hook。

### 修复

- **Codex HookPrompt 链路** - 全局 Codex prompt hook 保留原有 planning hooks，同时确保 HookPrompt 输出进入模型上下文。
- **Plugin 可见性** - plugin 和 plugin-bundle provider 进入 capability index 与 provider registry。

## [2.8.2] - 2026-06-02

### 变更

- **Runtime compatibility catalog** - runtime 支持数据归一到兼容性目录，覆盖 sync 行为、原生能力声明和 package targets。
- **候选工具端处理** - opencode、Qwen、Zed、Gemini、CodeBuddy、Antigravity、JoyCode、Qoder 等被诚实记录为安装目标或候选 probe，不再夸大成完整投影。

## [2.8.1] - 2026-06-02

### 变更

- **公开支持口径** - README 和 runtime-facing docs 对齐 supported、compatible、candidate 状态。
- **投影同步说明** - 项目本地和全局 sync 行为更容易解释和验证。

## [2.8.0] - 2026-06-01

### 新增

- **Provider-first governance** - Meta_Kim 从工具名路由转向 provider 和 capability 路由。
- **Runtime 和 OS 证据门** - 执行路线在行动前检查 runtime 支持、OS 支持、依赖状态、owner、weapon 和 verification path。
- **安装与发布证据** - setup、sync、runtime、provider 和 release 检查进入常规发布叙事。

## [2.7.0] - 2026-06-01

### 新增

- **能力路由治理** - 引入 capability-first execution routing、owner/loadout evidence 和 provider discovery，作为治理工作的默认形态。
- **工具端对齐** - Claude Code、Codex、OpenClaw、Cursor 围绕 canonical source 对齐，同时保留真实 runtime 限制。

## [2.6.x] - 2026-05-29 至 2026-05-30

### 新增

- **治理执行报告** - 增加更完整的 run report、status envelope 和公开证据表面。
- **研究和能力准备** - 增加 source-backed research preparation、retrieval capability discovery 和 multi-type capability inventory。
- **全局能力发现** - 扩大扫描 installed agents、skills、hooks、commands、MCP config、plugins 和 runtime mirrors。

## [2.5.x] - 2026-05-28

### 新增

- **治理决策引擎** - 增加 runtime capability、OS compatibility、dependency capability、weapon routing、trigger-action policy、intent amplification、choice surfaces、dynamic lens selection 和 decision-pattern contracts。
- **面向用户的架构文档** - 扩展 runtime capability、dependency discovery、owner/weapon routing 和 choice surfaces 说明。

## [2.4.x] - 2026-05-27 至 2026-05-28

### 新增

- **研究路线加固** - 研究工作必须先证明 retrieval capability，才能影响 route design。
- **接口集成合约** - 第三方和内部 API 集成获得明确 contract packets、未知字段处理、evidence refs 和 review gates。
- **运行状态表面** - 增加本地化 run-status 输出。

## [2.3.x] - 2026-05-26

### 新增

- **证据完整性合约** - worker 关于测试和命令成功的声明必须有结构化 execution evidence。
- **静默成功处理** - 无输出但成功的命令用 exit-code evidence 表达，不再制造占位文本。
- **Validation contract 结构** - validation rules 迁移为更可复用的 schema 和 runner。

## [2.2.x] - 2026-05-25

### 新增

- **Workflow contract 扩展** - 增加 packet 词汇、命名策略、维度定义、dispatch evidence 和 business-flow tests。
- **Agent factory 治理** - 项目本地 execution agent 创建必须有 capability gap evidence、治理参与和 review，才能写持久文件。
- **Sub-agent 边界规则** - Meta agents 负责治理、审查和路由，不再扮演通用实现 worker。

### 修复

- **Worker 写入完成诚实性** - 有文件范围承诺的 worker 必须逐文件报告 completed、skipped 或 failed。
- **历史更新说明准确性** - 早期低层级 release-note 错误已修正，并折叠进当前可读格式。

## [2.1.x] - 2026-05-23 至 2026-05-24

### 新增

- **选择和确认流程** - Critical 和 Fetch 对模糊需求、候选路径、用户确认有了更清晰的准入门。
- **Public-ready gates** - 声称完成前，必须满足 verification、summary closure 和 deliverable-chain closure。

## [2.0.x] - 2026-04-11 至 2026-05-23

### 新增

- **Meta_Kim 2.x 架构** - 建立 8-stage spine、11-phase business workflow、hidden governance packets、runtime projections、memory layers、Graphify support、setup/update flow 和 capability boundaries。
- **跨工具端投影系统** - canonical sources 可以投影到 Claude Code、Codex、Cursor 和 OpenClaw 文件。
- **安装与打包基础** - 增加 setup、sync、status、package whitelist、runtime asset projection、local overrides、project/global install modes。
- **Meta agent 团队** - 引入 Warden、Conductor、Genesis、Artisan、Sentinel、Librarian、Prism、Scout、Chrysalis 等治理 agent。

### 修复

- **README 和架构表达** - 文档反复收紧，解释 8-stage execution spine、business workflow、contracts、gates 和 runtime projections 的关系。
- **Runtime mirror drift** - sync checks 和 validation 降低 canonical sources 与 runtime projections 的漂移。

## [1.x] - 2026-03-22 至 2026-04-11

### 新增

- **早期治理模型** - 建立早期 meta-agent architecture、workflow vocabulary 和 reusable governance concepts，后来演进为 Meta_Kim 2.x。
- **早期文档和示例** - 增加第一批公开 README、图示和更新说明。

## [0.x] - 2026-03-17 至 2026-03-21

### 新增

- **项目种子** - 创建仓库和第一批实验性 Meta_Kim workflow assets。
