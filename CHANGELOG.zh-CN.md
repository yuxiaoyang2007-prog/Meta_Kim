# 更新日志

> 🇺🇸 [English](./CHANGELOG.md) | 中文版

这是 Meta_Kim 面向读者的更新说明。

更新说明只解释“改了什么、为什么重要”。过细的内部任务编号、低价值 backlog id 和实现流水账不放在这里；需要精确证据时，请看 Git 历史、测试、生成报告和 PRD 产物。

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
