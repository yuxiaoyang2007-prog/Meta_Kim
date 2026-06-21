# 更新日志

> 🇺🇸 [English](./CHANGELOG.md) | 中文版

这是 Meta_Kim 面向读者的更新说明。

更新说明先解释本次解决的用户痛点或风险，再说明为了解决它改了什么、为什么重要。过细的内部任务编号、低价值 backlog id 和实现流水账不放在这里；需要精确证据时，请看 Git 历史、测试、生成报告和 PRD 产物。

## [Unreleased]

## [2.8.46] - 2026-06-21

### 解决的问题

本次发布修复 Claude Code 会话中断后的续跑边界：当 runtime spine 已经 `session_stop`，后续再说“继续当前 active run”不能再被误读成真的 active governed run。HookPrompt 仍然保持首屏意图增强层，但它的 model-visible context 不再能冒充 Fetch、Thinking、worker、Execution、Verification 或 public-ready 证据。

### 变更

- **HookPrompt 证据边界** - 在 meta-theory skill、抽象能力契约和 runtime safety contract 中明确 HookPrompt 只是 prompt-intake context；它可以澄清意图，但不能推进阶段或满足治理证据。
- **HookPrompt JSONL Transcript 安全** - Stop hooks 现在会只剥离 HookPrompt 展示片段；当 Claude 把前台提示展示写成一行 escaped newline JSONL 时，不会吞掉后面的真实 transcript 内容。
- **Public Readiness 状态拆分** - 将 runtime `surfaceState`（`silent` / `notice` / `decision`）和 Warden 拥有的 `publicReadinessState`（`debug-surface` / `internal-ready` / `public-ready`）分离，避免交互展示状态冒充发布就绪。
- **Dynamic Workflow lane 证据闭环** - Route 选中的 worker lanes 现在直接进入 business-flow blueprint，保留 omitted lanes with reasons，并由 `meta-conductor` 作为编排 synthesis 的 merge owner。
- **Invocation Truth Public-Ready 硬门** - Run artifact validator 现在会拒绝 selected executable capability 只被选中、不可用、被阻断、缺 host evidence，或 top-level packet 与 `coreLoop` 不一致时的 public-ready 声明。
- **LangGraph-style Runtime 边界** - 产品证据现在明确这是 LangGraph-style 结构控制图，不新增也不声称真实 LangGraph runtime dependency。
- **Global-only 能力清单** - Capability discovery 在 `global_only` 投影模式下可读取缓存的全局 runtime inventory，同时继续把项目配置记录保持为 reference-only。
- **Inactive Run 续跑边界** - `active-run.json` 与 status envelope 现在公开 `deactivatedAt`、`deactivationReason` 和 `continuationBoundary`，让 `session_stop` 历史可见，但不会被当成 active managed run。
- **Claude Runtime Session-Stop 修复** - Claude spine activation 会先读取 inactive spine state；当用户要求继续时，创建新的 observed run，并记录前一个已停止 run 的边界，而不是声称旧 run 仍然 active。
- **Continuation 文案识别对齐** - Shared 与 Claude activation hooks 现在识别同一组宽口径续跑说法，例如 `current run`、`same run`、`当前 run`、`同一个 run`。
- **Stop Hook Transcript 过滤** - Stop compaction 和 progress hook 在 transcript 启发式判断前会剥离 HookPrompt 前台展示块，避免提示词优化文本制造假的阶段进度、finding 或续跑 handoff。
- **Stop Cleanup 路径安全** - `stop-spine-cleanup` 删除 completed spine state 前会复用 repo-local state resolver，非法 `META_KIM_SPINE_STATE_DIR` 不能删除 `.meta-kim/state` 之外的文件。
- **Local Continuity 文案降权** - Stop compaction 和 project task state 现在把交接标记为 `local_continuity_only` 并写入 `mustNotClaimActiveRun`，替换容易误导的 “Resume from X stage” 说法。
- **状态 CLI 诚实输出** - `meta-run-status` 对 inactive `session_stop` 会输出 reason 和 continuation boundary，而不是只折叠成一行笼统 inactive。
- **发布元数据对齐** - 将包元数据提升到 `2.8.46`，确保 source tree、tag 和 GitHub Release 指向同一版本。

### 验证

- `node --check canonical/runtime-assets/claude/hooks/stop-compaction.mjs canonical/runtime-assets/claude/hooks/stop-save-progress.mjs canonical/runtime-assets/claude/hooks/activate-meta-theory-spine.mjs canonical/runtime-assets/claude/hooks/spine-state.mjs canonical/runtime-assets/shared/hooks/spine-state.mjs scripts/meta-run-status.mjs`
- `node --test tests/meta-theory/20-run-status-envelope.test.mjs`
- `node --test tests/meta-theory/09-run-artifact-validator.test.mjs`
- `node --test tests/meta-theory/32-meta-theory-four-product-targets.test.mjs`
- `node --test tests/meta-theory/11-eight-stage-spine.test.mjs`
- `node --test tests/governance/runtime-safety-contract.test.mjs`
- `node --test tests/governance/capability-inventory-bus.test.mjs`
- `node --test tests/setup/mcp-memory-hooks.test.mjs`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- Public-ready 边界保持诚实：HookPrompt prompt-intake context 不是 runtime invocation、Verification 或 release-grade all-runtime live evidence。

## [2.8.45] - 2026-06-20

### 解决的问题

本次发布补上 Meta_Kim 的 Dynamic Workflow / LangGraph-style governed execution 声明与用户可检查证据之间的断层。默认发布面现在记录最新的 hook 自锁修复，确保私有项目 manual 不进入开源 source 集合，并附带一份 full-pass governed execution artifact，用来证明能力发现、worker fan-out、host invocation truth 与 Verification 已经跑通；同时不把它越级说成 release-grade live all-runtime ready。

### 变更

- **Dynamic Workflow 证据闭环** - 复测 `C:/Users/Kim/AppData/Local/Temp/meta-kim-host-full-db9a8dd9aa5c43418aba89f7b210bd57/artifacts/goalpro-codex-host-full-proof.json`，确认其中包含 `fetchPacket`、`capabilityInventory`、`capabilityRoute`、`dynamicWorkflowRuntimePacket`、`langGraphRunPacket`、`workerTaskPackets`、`workerResultPackets` 与 `verificationPacket`。
- **Host Invocation Truth** - 确认真实 Codex host 证据覆盖 `spawn_agent_result`、`agent_team_result` 与 `skill_application`，并有 MCP、command/script、runtime-tool 三类 fresh local probes；artifact 中 `realInvocationCoverage.missingFamilies` 为空。
- **Hook 自锁修复** - Fetch 阶段 dispatch gate 现在可以受限修复自己的 `fetchRecord` 状态，同时在能力发现和 execution clearance 前仍然阻止业务文件写入。
- **开源 Source 边界** - 从公开 source 树移除私有 manual 文档，并让 README 引用保持在受支持的公开文档面上。
- **发布元数据对齐** - 将包元数据提升到 `2.8.45`，确保 source tree、tag 和 GitHub Release 指向同一版本。

### 验证

- `npm run meta:validate:run -- C:/Users/Kim/AppData/Local/Temp/meta-kim-host-full-db9a8dd9aa5c43418aba89f7b210bd57/artifacts/goalpro-codex-host-full-proof.json`
- `npm run meta:test:meta-theory`
- `npm run meta:release:smoke`
- `git diff --check`
- Public-ready 边界保持诚实：`publicReadyDecision.publicReady = false`，因为本次没有附带 release-grade live all-runtime evidence。

## [2.8.44] - 2026-06-19

### 解决的问题

本次发布补上 canonical 源、全局 hook 包和项目 runtime 投影之间的安装/更新断层。新用户和已有项目现在会拿到一致的 governed `meta-theory` 行为；可复用的全局资产不会被误复制进项目镜像；源仓库自检也不会再把预期为空的生成目录误报成安装镜像过期。

### 变更

- **Canonical Runtime Source Projection** - `meta-theory` runtime smoke 检查在项目镜像尚未生成时会回退检查 canonical 源资产；但如果 runtime 镜像已经 materialized 且内容坏掉，仍然会判为不完整。
- **全局 Hook 依赖闭环** - Claude 全局 hook 脚本现在从打包后的 `hooks/meta-kim/` 目录解析 shared helper，不再导入缺失的项目本地 shared 路径。
- **Fetch 自锁维修路径** - Fetch 阶段的 hook enforcement 现在允许受限的 repair-only `fetchRecord` 写入 `spine-state.json`；但在完成真实能力发现和执行放行前，业务文件写入仍会被拦住。
- **安装与更新范围对齐** - setup/update 路径保持全局安装只写全局、项目 bootstrap 只从 canonical 源生成项目镜像，并取消对 Meta_Kim 源仓库的特殊处理。
- **11 阶段用户可见性** - governed run 报告在 runtime verification 仍然 blocked 时，会把用户可见 business phase 保持在 feedback / acceptance 等待点，同时保留 blocker 证据。
- **产品交付包 Bootstrap** - product delivery bundle 生成现在让 governed run 和 deliverable generation 共用同一个 run id 与 state dir，修复 clean smoke 中找不到 governed run 的失败。
- **一等 Memory 能力发现** - canonical memory hooks 现在会作为稳定的 `memory` provider 进入默认 capability inventory；干净 state 下的 governed run 不再依赖已有本地状态文件来证明 memory 能力覆盖。
- **源仓库健康检查口径** - runtime health 检查区分源仓库自检和用户安装态镜像，避免对空生成目录输出误导性的 stale-mirror 文案。

### 验证

- `npm run meta:verify:all`
- `npm run meta:release:smoke`
- `npm run meta:prd:smooth-capability:validate`
- `npm run meta:prd:stage-runtime-control:validate`
- `node --test tests/meta-theory/11-eight-stage-spine.test.mjs`
- `node --test tests/meta-theory/32-meta-theory-four-product-targets.test.mjs`
- `node --test tests/meta-theory/43-product-delivery-bundle.test.mjs`
- `node --test tests/meta-theory/49-business-phase-visibility.test.mjs`
- 隔离 setup/hooks worker：`130 pass / 0 fail`
- runtime health worker：`meta:public-assets:validate`、`meta:check:runtimes`、hook sync tests、stale projection simulation
- `git diff --check`

## [2.8.43] - 2026-06-19

### 解决的问题

本次发布解决的是 governed run 看似已经在 hook context 或生成报告里完成，但用户仍然看不到清晰进度、没有原生选择证据、也没有真实能力路线的问题。同时收紧 setup/update 清理路径，让旧安装留下的项目级 Meta_Kim 残留可以被安全移除，而不会删掉用户自己的文件。

### 变更

- **用户可见治理进度** - 新增 host-visible notice contract 和 runtime 指南，要求 Codex 与 Claude Code 在普通 assistant chat 中显示 run start、route、blocker、closure 等关键进度；原生选择面板只用于会改变路线的决策。
- **自动能力发现** - 扩展 route selection：自然语言 durable work 会先扫描项目/runtime/全局 skills、commands、MCP providers、hooks、scripts、runtime tools，再由 Thinking 绑定 owner；不再要求用户先说出 agent、skill 或协议阶段。
- **原生选择证据门** - 对主观质量或路线会变化的任务，跟踪 Codex `request_user_input` 与 Claude `AskUserQuestion` 证据后才允许执行；结构化报告不能再冒充真实原生选择。
- **项目清理与 Bootstrap 安全** - 新增 setup cleanup 路径，用于清理冗余 Meta_Kim 项目资产；`AGENTS.md` / `CLAUDE.md` 改为 managed block 合并；补齐 Codex `.agents/skills` 项目投影覆盖，并增加保护未知本地 skill 与 git-tracked 文件的回归测试。
- **全局 Hook 与记忆对齐** - 保持 HookPrompt 在 Meta_Kim spine hook 之前运行，新增 Codex 全局 HookPrompt adapter 同步；doctor 检查接受健康的 Claude 全局 hook；MCP memory 检查能识别 `hooks/meta-kim/` 下的 hook。

### 验证

- `npm run meta:verify:all`
- `npm run meta:release:smoke`
- `npm run meta:check`
- `npm run meta:doctor:governance`
- `npm run meta:check:global:release`
- `node --test tests/setup/claude-settings-merge.test.mjs tests/setup/lazy-project-bootstrap.test.mjs tests/setup/doctor-governance.test.mjs tests/setup/mcp-memory-hooks.test.mjs`
- `node scripts/validate-capability-routing.mjs`
- `git diff --check`

## [2.8.42] - 2026-06-18

### 解决的问题

本次发布解决的是全局可复用安装和项目本地生成状态被混在一起的问题。现在可以端到端验证全局 `meta-theory` 安装，而不把通用 Codex skill 复制进每个项目；项目缓存和 Graphify 输出仍然只落在当前项目。

### 变更

- **Codex 全局 Hook 注册** - 全局同步现在会把 Meta_Kim hook 脚本复制到 `~/.codex/hooks/meta-kim/`，并把 prompt-entry spine hook 合并进 `~/.codex/hooks.json`，带 package-root 证据；用户自己的 hook 会保留，只替换 Meta_Kim 管理项。
- **项目缓存验证** - 新增 `npm run meta:project-cache:verify`，并支持 `--real-global`，用于证明全局 hook 会在当前项目生成 `.meta-kim/state/default/post-copy-init.json`、`graphify-out/graph.json`、`graphify-out/GRAPH_REPORT.md`，且不会复制 `.agents/skills/meta-theory/`。
- **安装范围矩阵** - 扩展安装范围验证，覆盖全局默认、全局全正式目标、项目默认、项目全正式目标，并证明预期文件存在、非预期写入不存在。
- **正式投影口径** - README 现在把 OpenClaw 和 Cursor 说明为非默认但正式投影，不再放进兼容层；候选 probe 仍然保持分层。

### 验证

- `node scripts/sync-global-meta-theory.mjs --check --targets claude,codex,cursor,openclaw --with-global-hooks`
- `npm run meta:project-cache:verify -- --real-global`
- `npm run meta:project-cache:verify`
- `npm run meta:install-scope:verify`
- `node --test tests/setup/sync-global-hooks-policy.test.mjs tests/setup/install-scope-matrix.test.mjs`
- `node scripts/validate-runtime-safety-contract.mjs`
- `git diff --check`

## [2.8.41] - 2026-06-16

### 解决的问题

本次解决的是“Meta_Kim 选中了能力”与“宿主真的调用了能力”之间看不见的断层。现在用户能看到 Claude Code 或 Codex 还需要执行什么动作、什么证据才算数，以及长期 Agent 为什么必须等宿主 reload 并真实调用后才算完成。

### 变更

- **宿主调用请求契约** - 新增 `hostInvocationRequestPacket`；当 Agent、Skill、MCP、command/script、runtime tool、`agent-teams-playbook` 被选中但还没有 live 调用证据时，会明确列出 Claude Code 或 Codex 宿主下一步必须执行的动作，不再把缺失调用藏在 partial 报告里。
- **可信证据边界** - 收紧 governed execution：host request、CLI/env claim、markdown report、app 可见 badge 都不能当执行证明；只有 trusted host adapter 返回带 state、provider/surface、evidence kind、evidence ref 的新鲜证据才能计入通过。
- **长期 Agent 生命周期证明** - 新增 `durableAgentLifecyclePacket`；长期智能体必须经过 definition candidate、Warden approval/writeback、host reload/discovery、live invocation proof 四关，才能宣称完成。
- **Runtime Adapter 指南** - 更新 Claude Code 和 Codex runtime reference，区分 runner handoff、真实宿主 provider 调用、长期项目 agent 发现机制，为后续 adapter 实现留出清晰接口。
- **产品证据贯通** - 扩展 run report、product delivery bundle、validators 和 support gates，使宿主调用请求和长期 agent 生命周期状态进入产品验收证据链。

### 验证

- `node --test tests/governance/core-loop-contract.test.mjs tests/meta-theory/32-meta-theory-four-product-targets.test.mjs tests/meta-theory/34-run-deliverables.test.mjs tests/meta-theory/43-product-delivery-bundle.test.mjs`
- `npm run meta:test:meta-theory`
- `npm run meta:check`
- `git diff --check`

## [2.8.40] - 2026-06-16

### 解决的问题

本次解决的是全局 Meta_Kim 已更新，但打开的项目仍发现不了新治理入口的问题。Prompt 入口现在会说明为什么启动治理，并在写入任何项目文件前先探测项目就绪状态。

### 变更

- **Prompt 入口治理激活** - Claude Code 和 Codex 的项目级 prompt 入口现在会运行 meta-theory spine hook；自然语言 durable work 和 `critical/fetch/thinking/review` 说法可以在执行前触发治理，不再只依赖显式 Skill 激活。
- **Claude 全局项目就绪检测** - Claude Code 全局 hooks 现在会安装 prompt-entry bootstrap hook package，并带 package-root 证据；旧项目或未 bootstrap 项目会先收到精简的项目就绪原因，再决定是否应用项目文件。
- **项目 Bootstrap 安全边界** - Project bootstrap 仍然坚持 dry-run first 和确认门；stale 或 equivalent 项目只显示 `status`、active targets、reason 和 native choice 要求，不会静默写入。
- **Spine 死锁解除** - 即使 Fetch 正在等待 `fetchRecord`，spine-state 写入也会放行，避免 prompt-entry 实机测试后维护者无法写入 Fetch 证据或关闭运行态。
- **全局能力证据刷新** - 安装新的 hook package 后刷新全局能力发现；库存现在能看到 Meta_Kim 全局 prompt-entry hook，以及 agents、skills、commands、MCP servers/tools、plugins 和 runtime hooks。

### 验证

- `node --test tests/setup/graphify-wiring-contract.test.mjs tests/meta-theory/11-eight-stage-spine.test.mjs tests/setup/sync-runtimes-manifest.test.mjs tests/setup/sync-global-hooks-policy.test.mjs tests/meta-theory/47-meta-theory-entry-classifier.test.mjs tests/governance/capability-routing.test.mjs`
- `node --check canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs`
- `node --check canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`
- `npm run meta:sync`
- `npm run meta:sync:global -- --with-global-hooks`
- `npm run discover:global`
- 在 `D:/KimProject/游戏策划案` 中执行 Claude Code 全局 `UserPromptSubmit` 实机 smoke
- 在 `D:/KimProject/Meta_Kim` 中执行 Codex 项目 `UserPromptSubmit` 实机 smoke

## [2.8.39] - 2026-06-16

### 解决的问题

本次解决的是“发牌写在契约里，但用户看不到也证明不了它触发”的问题。发牌决策现在有评分、证据、反事实检查和精简的用户可见理由。

### 变更

- **发牌准确性标准** - 将 `cardPlanPacket` 升级到 v0.2；每张牌都必须记录 deal/suppress/defer/skip/interrupt/escalate 决策，并带 80 分标准、量化信号、证据引用和反证检查。
- **用户可见发牌原因** - 在 run-start 和报告里新增精简说明：为什么触发发牌、多少张牌进入节奏控制、最低分是否通过。
- **契约化发牌证明** - 将 `dealStandard` 设为 `cardPlanPacket` 必填字段，对齐生成的 card shell/source/silence/control decision，并刷新 validator fixtures。
- **Deep Research 风格发牌审查** - 每张牌的判断都绑定决策影响和反事实检查；不需要的牌会带证据 suppress，不再只是模糊 defer。
- **全局发现就绪** - 已把更新后的 meta-theory skill 同步到项目和全局 runtime home，并刷新 Claude Code、Codex、OpenClaw、Cursor 的全局能力库存。

### 验证

- `node --test tests/meta-theory/14-card-deck-complete.test.mjs tests/meta-theory/34-run-deliverables.test.mjs tests/meta-theory/12-ten-step-workflow.test.mjs tests/meta-theory/07-contract-compliance.test.mjs`
- `node scripts/run-meta-theory-governed-execution.mjs --task "帮我做个小红书营销自动发布器" --run-id card-proof --emit-conversation-notice`
- `npm run meta:check`
- `npm run meta:test:meta-theory`
- `npm run discover:global`
- `npm run meta:sync:global`
- `npm run meta:check:global`
- `npm run meta:release:smoke`

## [2.8.38] - 2026-06-16

### 解决的问题

本次解决的是 11 阶段业务流因为列出阶段名就看似完成的问题。每个阶段现在都要有证据、评分，以及 trigger/skip/block/wait 的明确判断。

### 变更

- **11 阶段触发标准** - 将 `businessPhasePlanPacket` 升级到 v0.2；每个阶段都必须记录 trigger/skip/block/wait 决策、评分、证据引用、量化信号和反证检查，不再因为列出 11 个阶段名就通过。
- **业务流覆盖真实性** - 用契约对齐的 `complete` / `incomplete` 判断和 `coverageDetail` 替换旧的 phase-count-only 字符串，避免把“已记录”和“准确触发”混在一起。
- **精简开场原因** - 新增 run-start 用户可读说明，解释为什么触发 8 阶段 spine 和 11 阶段业务流；说明保持短句，并绑定证据，不倾倒内部 packet。
- **Deep Research 风格阶段证据** - 阶段判断现在绑定关键信号、反事实检查和决策证据；例如 Revision 的准确跳过、Feedback 的外部等待会被明确表示。
- **报告可见性** - 用户可读 meta-theory 报告和 CLI conversation notice 现在会显示触发状态、触发评分和开场原因。

### 验证

- `node --test tests/meta-theory/34-run-deliverables.test.mjs`
- `node --test tests/meta-theory/12-ten-step-workflow.test.mjs tests/meta-theory/09-run-artifact-validator.test.mjs`
- `npm run meta:check`
- `npm run meta:test:meta-theory`
- `npm run discover:global`
- `npm run meta:check:global`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.37] - 2026-06-16

### 解决的问题

本次解决的是 Review、Meta-Review、Evolution 浅层通过的问题。运行现在必须证明证据质量、盲区检查、可复用学习判断和 public-ready 边界，而不是只靠 packet 存在就通过。

### 变更

- **深度 Review 门禁** - Prompt-first live acceptance 现在要求 Review 证明已检查证据质量、反证、决策影响、可证伪性和上游阶段链路，不再只靠 packet 存在就通过。
- **Meta-Review 深度审计** - 新增机械化深度审计：拒绝浅层 packet-only Review，检查对抗覆盖和审查盲区，并把 public-ready 证据与 live/runtime 证据分开。
- **Evolution 策略证据** - Evolution 的 `none-with-reason` 现在必须证明已判断可复用模式、写回目标、scar 需求和下次复用 key。
- **Strict Live Acceptance 回归** - 新增回归覆盖，确保缺失或浅层 Review / Meta-Review / Evolution packet 会失败，而不是被 fallback 数据补成通过。

### 验证

- `node --test tests/governance/prompt-first-live-acceptance.test.mjs`
- `node --test tests/governance/decision-cross-validation.test.mjs tests/governance/prompt-first-live-acceptance.test.mjs`
- `npm run meta:check`
- `npm run meta:test:meta-theory`
- `npm run meta:sync`
- `npm run discover:global`
- `npm run meta:check:global`
- `npm run meta:prd:prompt-first-live:validate`
- `git diff --check`

## [2.8.36] - 2026-06-16

### 解决的问题

本次解决的是还没查已有专业能力就新建或路由到执行 Agent 的问题。Meta_Kim 现在先查全局和项目 provider，把 worker task 限定为单次工作单，并在安装或更新后刷新本地能力库存。

### 变更

- **专业 Provider 优先路由** - 治理路线现在必须先查已有的全局/项目专业 provider，再考虑创建或升级 execution agent；覆盖 agents、skills、commands、MCP providers/tools、runtime tools、hooks、plugins、memory/graph providers 和 dependency providers。
- **WorkerTask 身份边界** - 明确并验证 `workerTaskPacket` 只是绑定到已选 owner/loadout 的单次运行工作单，不是临时小 agent、subagent definition 或长期 provider 身份。
- **全局能力库存自动刷新** - 安装/更新和全局依赖安装/更新流程会在 runtime home 变化后自动刷新本地 global capability inventory，同时仍然不把机器私有库存提交到 GitHub 源码。
- **能力缺口证据** - 新增 `fetch.global_professional_providers_checked` 证据和回归覆盖，要求 `create_agent` 决策先证明已有专业 provider 已经查过且不足。
- **Setup 回归覆盖** - 新增自动刷新全局库存的发布测试，并修正 project deploy 保护式 JSON merge 测试，使其匹配当前“先规划、再写入”的实现结构。

### 验证

- `npm run meta:release:smoke`
- `npm run meta:test:setup`
- `npm run meta:validate`
- `npm run discover:global`
- `npm run meta:gap:real-input-replay`
- `npm run meta:prd:smooth-capability:validate`
- `npm run meta:runtime:validate`
- `npm run meta:graphify:rebuild`
- `git diff --check`

## [2.8.35] - 2026-06-16

### 解决的问题

本次解决的是 deep research 只收集来源、没有真正改善决策的问题。Fetch 现在会锁定关键信息、迭代查询和阅读、记录停止条件，并阻止弱证据或未验证声明进入 Thinking。

### 变更

- **决策级 Deep Research** - 将 Fetch 证据从“收集来源”升级为“锁定关键信息目标、记录多轮 query/read/update、声明停止条件、写入决策更新规则”，再进入 Thinking。
- **Claim Evidence Cards** - 新增 `claimEvidenceCards` 和更严格的 run artifact 校验；会改变路线的 claim 必须绑定可解析 evidence refs、反证记录、置信度、falsification 状态和决策影响。
- **研究执行证据** - 扩展 live research execution packet，记录 query 迭代次数、证据 gap 是否关闭、confidence 前后变化和反证尝试，避免 blocked evidence 被带入 Thinking。
- **Canonical 治理对齐** - 更新 Scout、Conductor、Prism 和 meta-theory dispatcher，让 deep research 质量由角色责任、生成 packet、validator、fixtures 和回归测试共同约束，而不是只靠提示词描述。

### 验证

- `node scripts/run-node-tests.mjs "tests/meta-theory/02-clarity-gate.test.mjs" "tests/meta-theory/37-research-preparation-layer.test.mjs" "tests/meta-theory/44-research-execution-and-innovation.test.mjs" "tests/meta-theory/09-run-artifact-validator.test.mjs"`
- `npm run meta:check`
- `npm run meta:release:smoke`
- `node scripts/run-node-tests.mjs "tests/meta-theory/09-run-artifact-validator.test.mjs"`
- `git diff --check`

## [2.8.34] - 2026-06-16

### 解决的问题

本次解决的是安装/更新时混淆全局通用能力、项目投影和开源包内容的问题。默认目标、平台分层和包边界现在会明确说明什么被安装、什么只是本地生成、什么只是兼容候选 probe。

### 变更

- **安装范围边界** - 恢复并明确默认安装/更新模型：全局通用能力 + 当前项目投影，并修正为按目标平台选择落地；默认回车只投影 Claude Code + Codex，Cursor / OpenClaw 只有作为“正式投影兼容目标”被显式选择时才生成项目文件。
- **开源 runtime 投影边界** - 新增发布验证器，确保 `.codex/`、`.agents/`、`.claude/`、`.cursor/`、`openclaw/` 等生成的 runtime projection 不进入 GitHub source 或 package files，并明确 Codex adapter / business-role TOML 只是本地宿主投影，不是治理 agent 源码。
- **平台兼容分层** - 安装契约和验证输出现在会区分正式投影、依赖项目目标和候选 probe；公开文档不再重复上游依赖项目的安装矩阵，也不把它写成 Meta_Kim 支持承诺。
- **公开平台口径** - 更新 README 徽章、平台支持表和跨平台映射说明，让默认正式投影、显式正式兼容投影、候选兼容 probe 分开可见；同步刷新 Qoder 官方文档链接，并把 Cline 官方 Skills primitive 纳入 catalog。
- **项目治理体验** - 更新 PRD、setup 与 README 文案：全局 skill 只是可复用的发现入口，其他目录必须先 dry-run 项目 bootstrap 并确认后才允许写入项目文件；`AGENTS.md` 只按平台特性作为上下文资产描述，不再被写成 Codex/Cursor/OpenClaw 的统一入口。
- **安装范围验证** - 新增 `npm run meta:install-scope:verify`，用临时全局 home 和临时项目 bootstrap 实测各平台项目投影边界，并输出全局层 / 项目层分类结果。

## [2.8.33] - 2026-06-15

### 解决的问题

本次解决的是用户需要手动维护全局 Meta_Kim 和每个项目运行时投影的问题。项目 bootstrap 现在先 dry-run、展示来源链、保留用户文件，并且只在确认后写入项目。

### 新增

- **全局优先项目懒初始化** - 新增 `meta-kim project bootstrap` 和 `npm run meta:project:bootstrap`，让全局安装的 Meta_Kim 可以先 dry-run 再 apply 项目级 Claude Code / Codex 投影，用户不需要手动维护全局和项目两套状态。
- **首次触发 Bootstrap 探针** - 扩展 meta-theory activation hook：首次触发 meta-theory 时会运行项目 bootstrap dry-run probe，并保存 source-chain 证据，但不会静默写入项目文件。
- **懒初始化验收测试** - 新增空项目、已有用户配置、旧 manifest、只读失败、managed block 替换、保护式 JSON merge、备份 manifest、`.codex/config.toml` 永不触碰等场景覆盖。

### 变更

- **项目级来源链证据** - 项目 bootstrap plan 现在会在任何写入前暴露 installed package root、canonical roots、`config/sync.json`、生成的 runtime mirrors、目标项目、文件动作、merge policy 和 skipped files。
- **运行时原生选择面** - 更新 Claude Code 和 Codex 的 choice-surface 合同，保留结构化决策面板语义，并使用当前 host schema 的最大有意义选项数，不再使用 Meta_Kim 自己的硬编码上限。
- **能力路由** - 能力发现改为 canonical/index-first 路由，并防止 Codex 和 Claude Code 把对方 runtime 的 project agent adapter 误当作可调用执行 owner。

### 验证

- `npm run meta:check`
- `npm run meta:test:setup`
- `npm run meta:test:governance`
- `npm run meta:runtime:safety:validate`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.32] - 2026-06-15

### 解决的问题

本次解决的是 Codex 治理工作静默退回主线程单干的问题。复杂工作在安全时会进入 fan-out；宿主派发不可用、provider 被选中但没调用，都会作为 partial 证据展示。

### 变更

- **Codex Meta-Theory 并行编排** - 显式 `/meta-theory` 和复杂治理任务在存在多条安全 worker lane 时，会进入 fan-out eligible 路线，避免 Codex 静默退回主线程单干。
- **运行时容量分 wave** - 移除旧的固定 5 个 agent 上限，改为读取 Codex 配置和官方默认容量，同时在 fan-out 前证明 DAG 依赖、冲突边界、workspace 隔离和 external-write 安全。
- **能力调用真实性证据** - 收紧运行证据：只有存在 host spawn 证据时才把 live subagent 标为 `invoked`；host 不可用标为 `unavailable`，单 lane 标为 `not_required`，不能再把 provider 选中冒充为真实执行。

### 验证

- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.31] - 2026-06-14

### 解决的问题

本次解决的是动态工作流规划和真实并行执行之间缺少桥的问题。Meta_Kim 只在存在多条安全可执行 lane 时选择 agent-teams playbook，并区分 provider 选择、subagent 调用、MCP、skill、command、hook 和本地 worker。

### 新增

- **Agent Teams Playbook 门禁** - 新增 P-110 支撑门和 `agentTeamsPlaybookPacket`，让默认治理路线在出现两条及以上独立可执行 worker lane 时选中 `agent-teams-playbook`，先证明 DAG/冲突/workspace/external-write 安全，再按 runtime agent capacity 分 wave；单 lane 任务记录为 `not_required`。
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

### 解决的问题

本次解决的是运行时支持口径过宽、研究结论太容易被接受的问题。发布说明把主安装默认项与兼容 probe 分开，并把 deep research 变成带来源质量和综合规则的 Fetch 合同。

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

### 解决的问题

本次解决的是关键分支决策被聊天文字或 artifact fallback 冒充完成的问题。Codex 和 Claude Code 的必需决策必须走原生选择面，同时治理运行能展示用户可读进度。

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

### 解决的问题

本次解决的是默认治理执行看似完成、但证据层级混在一起的问题。产品 validator 现在检查核心目标、默认执行证据、research-to-native 采纳、运行时优先级和能力发现，同时避免把结构证据说成 live proof。

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

### 解决的问题

本次解决的是规划能列很多 lane，却证明不了 owner、依赖和验证是否就绪的问题。编排合同现在要求可用看板、明确依赖策略和可审查交接，之后才能执行。

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

### 解决的问题

本次解决的是 local/private PRD 状态、公开文档和实现证据漂移的问题。剩余产品工作现在用更清晰的 dossier、validator 和公开安全的状态语言跟踪。

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

### 解决的问题

本次解决的是产品目标到底完成、部分完成还是阻塞反复混淆的问题。产品体验清单现在把完成声明绑定到具体证据，而不是宽泛状态词。

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

### 解决的问题

本次解决的是 host config、hook 协议、删除残留和证据表达经常在发布前漏检的问题。Checklist 和 PR 模板现在要求写清 source of truth、host-state 影响、清扫范围和证据预算。

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

### 解决的问题

本次解决的是发布前容易沿用过期图谱或包边界假设的问题。发布路径现在把 Graphify 和开源包边界作为显式检查项。

### 变更

- **Run-scoped Worker 实机执行** - `meta:theory:run` 现在会通过本地 run-scoped worker executor 执行 bounded worker task packets，不再停在结构化调度就绪。主线程仍然只负责 scope、dispatch、review 和 synthesize；不会额外派外部 Agent。

### 验证

- 增加 governance 覆盖，要求 worker execution evidence，同时继续保留 public-ready 发布门禁。

## [2.8.22] - 2026-06-12

### 解决的问题

本次解决的是生成的 runtime projection 可能偏离 canonical Meta_Kim 行为的问题。同步覆盖和 runtime 检查现在能在发布前更容易抓到投影差距。

### 变更

- **核心治理线路发布证据收口** - 补齐 PDR 发布清单和最终发布证据，让最终 tag 内包含 commit、tag、push 和 GitHub Release 证明。

### 验证

- 复用 `2.8.21` 的核心治理线路实现证据，并为最终 `2.8.22` patch 发布重新运行本地发布检查。

## [2.8.21] - 2026-06-12

### 解决的问题

本次解决的是能力缺口判断从“需要能力”直接跳到“创建 Agent”的问题。现在 capability gap 会先比较 skill、script、MCP provider、runtime tool 和已有 Agent，再允许持久创建。

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

### 解决的问题

本次解决的是 Meta_Kim 可以报告治理进度，却证明不了用户可见交付链闭合的问题。Run report 和 product bundle 现在带更清楚的完成、警告和剩余动作证据。

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

### 解决的问题

本次解决的是 GitHub 完成、运行时兼容和本地验证被混成一个 done 结论的问题。完成证据和兼容证据现在分开，每个 blocker 都有 owner 和下一步。

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

### 解决的问题

本次解决的是 live/runtime evidence 中 timeout、skipped、partial 结果容易被误当 release-grade 成功的问题。Runtime probe 现在更严格分类证据，并保留恢复路径。

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

### 解决的问题

本次解决的是生成报告和产品表面太散，导致治理运行难以检查的问题。报告现在围绕决策、审查和后续行动需要的证据收束。

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

### 解决的问题

本次解决的是复制出来的项目文件存在，但目标项目并没有真正初始化的问题。Post-copy 流程现在在最终项目根目录初始化 Graphify，并避免把临时导出目录当成真实项目。

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

### 解决的问题

本次解决的是用户把生成文件移动到真实项目后，copy-ready 设置失效的问题。Bootstrap 脚本现在从复制后的目标目录运行，并把 Graphify 设置绑定到最终项目目录。

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

### 解决的问题

本次解决的是安装/更新输出像失败或英文内部日志，而不是可执行用户状态的问题。提示现在本地化，预期的宿主插件手动步骤会诚实标记，HookPrompt 输出也不会破坏 Markdown 渲染。

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

### 解决的问题

本次解决的是 ECC 安装覆盖 Codex App 用户配置、导致原生控制能力断开的风险。Meta_Kim 现在以用户配置为基底，只 add-only 合入 ECC，并恢复 Browser、Chrome、Computer Use 插件设置。

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

### 解决的问题

本次解决的是 HookPrompt 在 Codex 看起来运行了，但优化提示词没有稳定进入模型上下文的问题。Codex 现在使用模型可见的 `additionalContext` 包，UI 提示继续独立。

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

### 解决的问题

本次解决的是全局 hook 过重或过度绑定特定 runtime 的问题。Meta_Kim 现在区分安全的全局可复用 hook 和更强的项目级治理 hook，并按 runtime 验证 HookPrompt provider 映射。

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

### 解决的问题

本次解决的是自然语言持久任务被迫套固定清单，或要求用户懂协议词的问题。Meta_Kim 现在按任务生成必要 lane，检查本地基线证据，并显示人能看懂的进度。

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

### 解决的问题

本次解决的是报告和平台声明技术上没错、但用户难以理解的问题。工具支持等级、持久 Agent 边界和 runtime 目标来源现在用更朴素的方式表达。

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

### 解决的问题

本次解决的是能力发现太窄、太依赖工具名的问题。Fetch 现在会在 Thinking 选择 owner/loadout 前记录各支持投影的项目和全局库存。

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

### 解决的问题

本次解决的是 capability gap 只像松散脚本任务，而不像完整产品流程的问题。缺口现在有决策合同、回放证据、用户可见交付物、runtime 证据加固和报告卫生。

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

### 解决的问题

本次解决的是小文案改动发布检查太重、runtime/security 工作检查又太弱的问题。发布模式现在区分快速常规检查和更严格的 release-grade evidence。

### 新增

- **发布模式** - 低风险 prompt、文档、治理文案改动走快速发布路径；安装、runtime、hook、provider、dependency、package、安全和 live evidence 相关工作仍走更严格的 release-grade 路径。
- **执行需求证明** - release-grade 工作必须在修改或发布前证明 Fetch -> Thinking 路线已经选择 owner、agent provider、skill provider、MCP provider、command/runtime tool 和 verification path。
- **Live 证据分类** - structural smoke、warning、skipped/needs-auth 和真实 runtime live pass 被明确区分。

## [2.8.4] - 2026-06-02

### 解决的问题

本次解决的是执行路线可能在没有证明 owner、provider、tool、verification 就绪前就推进的问题。Capability smoke 和 OpenClaw live 分片让真实路线就绪变得可测试。

### 新增

- **能力发现 smoke** - 增加 smoke 命令，用来证明真实执行需求可以自然选择 owner、provider、tool 和 verification path。
- **OpenClaw live 分片** - Claude/OpenClaw 长时间 live 检查可以按 agent 分片，便于恢复和定位问题。

### 修复

- **执行路由** - 工程执行进入 Execution 前必须先绑定真实 owner / provider / verification 证据。
- **OpenClaw live evaluation** - OpenClaw 检查继承配置好的 provider/model 表面，并能更稳地恢复嵌套 JSON 和 session 输出。
- **OpenClaw auth hydration** - 本地 OpenClaw auth 可以复用已有可用的 meta-agent auth 来源，同时不覆盖已经能用的文件。

## [2.8.3] - 2026-06-02

### 解决的问题

本次解决的是 provider discovery 散落在 tools、hooks、skills、plugins、MCP、memory、graph 表面的问题。Provider registry 给这些表面统一生命周期和验证模型。

### 新增

- **Capability Provider Contract** - 增加 provider registry 和生命周期模型，用于管理 runtime-native tools、skills、agents、hooks、commands、rules、plugins、MCP servers、dependency projects、memory 和 graph providers。
- **Provider validator** - 增加 provider/runtime/OS/install-layer 缺口校验，并支持严格检查全局 Codex hook。

### 修复

- **Codex HookPrompt 链路** - 全局 Codex prompt hook 保留原有 planning hooks，同时确保 HookPrompt 输出进入模型上下文。
- **Plugin 可见性** - plugin 和 plugin-bundle provider 进入 capability index 与 provider registry。

## [2.8.2] - 2026-06-02

### 解决的问题

本次解决的是 runtime 支持声明难比较、也容易夸大的问题。兼容性数据现在把 sync 行为、原生表面声明、package targets 和候选 probe 分开记录。

### 变更

- **Runtime compatibility catalog** - runtime 支持数据归一到兼容性目录，覆盖 sync 行为、原生能力声明和 package targets。
- **候选工具端处理** - opencode、Qwen、Zed、Gemini、CodeBuddy、Antigravity、JoyCode、Qoder 等被诚实记录为安装目标或候选 probe，不再夸大成完整投影。

## [2.8.1] - 2026-06-02

### 解决的问题

本次解决的是公开文档没有清楚区分 supported、compatible、candidate runtime 状态的问题。README 和 runtime 文档现在更容易解释和验证这些状态。

### 变更

- **公开支持口径** - README 和 runtime-facing docs 对齐 supported、compatible、candidate 状态。
- **投影同步说明** - 项目本地和全局 sync 行为更容易解释和验证。

## [2.8.0] - 2026-06-01

### 解决的问题

本次解决的是按工具名路由会忽略 provider 就绪、runtime 支持、OS 支持、依赖和验证 owner 的问题。Meta_Kim 转向 provider-first governance，并把发布证据纳入常规流程。

### 新增

- **Provider-first governance** - Meta_Kim 从工具名路由转向 provider 和 capability 路由。
- **Runtime 和 OS 证据门** - 执行路线在行动前检查 runtime 支持、OS 支持、依赖状态、owner、weapon 和 verification path。
- **安装与发布证据** - setup、sync、runtime、provider 和 release 检查进入常规发布叙事。

## [2.7.0] - 2026-06-01

### 解决的问题

本次解决的是治理工作从 Agent 名字开始，而不是从能力需求开始的问题。Capability-first routing、owner/loadout evidence 和 runtime alignment 成为默认执行形态。

### 新增

- **能力路由治理** - 引入 capability-first execution routing、owner/loadout evidence 和 provider discovery，作为治理工作的默认形态。
- **工具端对齐** - Claude Code、Codex、OpenClaw、Cursor 围绕 canonical source 对齐，同时保留真实 runtime 限制。

## [2.6.x] - 2026-05-29 至 2026-05-30

### 解决的问题

这一组版本解决的是治理运行结束后难以审计的问题。报告、status envelope、研究准备、能力库存和全局发现变得更可见、更有来源。

### 新增

- **治理执行报告** - 增加更完整的 run report、status envelope 和公开证据表面。
- **研究和能力准备** - 增加 source-backed research preparation、retrieval capability discovery 和 multi-type capability inventory。
- **全局能力发现** - 扩大扫描 installed agents、skills、hooks、commands、MCP config、plugins 和 runtime mirrors。

## [2.5.x] - 2026-05-28

### 解决的问题

这一组版本解决的是决策缺少 runtime、OS、dependency、weapon、trigger、intent 和 choice-surface 共同门禁的问题。决策引擎和架构文档把这些检查显式化。

### 新增

- **治理决策引擎** - 增加 runtime capability、OS compatibility、dependency capability、weapon routing、trigger-action policy、intent amplification、choice surfaces、dynamic lens selection 和 decision-pattern contracts。
- **面向用户的架构文档** - 扩展 runtime capability、dependency discovery、owner/weapon routing 和 choice surfaces 说明。

## [2.4.x] - 2026-05-27 至 2026-05-28

### 解决的问题

这一组版本解决的是研究和接口集成工作在缺少检索或合同证据时就影响路线设计的问题。新增研究能力证据、集成 packet、未知字段处理和运行状态输出。

### 新增

- **研究路线加固** - 研究工作必须先证明 retrieval capability，才能影响 route design。
- **接口集成合约** - 第三方和内部 API 集成获得明确 contract packets、未知字段处理、evidence refs 和 review gates。
- **运行状态表面** - 增加本地化 run-status 输出。

## [2.3.x] - 2026-05-26

### 解决的问题

这一组版本解决的是 worker 声称测试、命令成功或静默成功时缺少结构化证明的问题。执行证据和验证 schema 结构被收紧。

### 新增

- **证据完整性合约** - worker 关于测试和命令成功的声明必须有结构化 execution evidence。
- **静默成功处理** - 无输出但成功的命令用 exit-code evidence 表达，不再制造占位文本。
- **Validation contract 结构** - validation rules 迁移为更可复用的 schema 和 runner。

## [2.2.x] - 2026-05-25

### 解决的问题

这一组版本解决的是治理词汇和 Agent 创建规则太松，难以支撑持久执行的问题。Workflow packets、命名策略、dispatch evidence、agent factory 规则和 sub-agent 边界被显式化。

### 新增

- **Workflow contract 扩展** - 增加 packet 词汇、命名策略、维度定义、dispatch evidence 和 business-flow tests。
- **Agent factory 治理** - 项目本地 execution agent 创建必须有 capability gap evidence、治理参与和 review，才能写持久文件。
- **Sub-agent 边界规则** - Meta agents 负责治理、审查和路由，不再扮演通用实现 worker。

### 修复

- **Worker 写入完成诚实性** - 有文件范围承诺的 worker 必须逐文件报告 completed、skipped 或 failed。
- **历史更新说明准确性** - 早期低层级 release-note 错误已修正，并折叠进当前可读格式。

## [2.1.x] - 2026-05-23 至 2026-05-24

### 解决的问题

这一组版本解决的是模糊任务在用户选择和 public-ready 边界未清楚前就进入编排的问题。Critical、Fetch、Verification、summary closure 和 deliverable-chain gate 变得更明确。

### 新增

- **选择和确认流程** - Critical 和 Fetch 对模糊需求、候选路径、用户确认有了更清晰的准入门。
- **Public-ready gates** - 声称完成前，必须满足 verification、summary closure 和 deliverable-chain closure。

## [2.0.x] - 2026-04-11 至 2026-05-23

### 解决的问题

这一组版本解决的是需要一套可复用跨工具端治理架构，而不是散落 prompt 和一次性 runtime 文件的问题。Meta_Kim 2.x 建立了核心 spine、投影、记忆、Graphify、setup/update、打包和治理 Agent 基础。

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
