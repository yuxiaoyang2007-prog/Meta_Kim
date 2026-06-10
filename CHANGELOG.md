# Changelog

> 🇨🇳 [中文版](./CHANGELOG.zh-CN.md) | English version

This file is the reader-facing release history for Meta_Kim.

The changelog explains what changed and why it matters. It intentionally avoids long internal task ledgers, low-signal backlog ids, and implementation trivia. When exact evidence is needed, use the repository history, tests, generated reports, and PRD artifacts.

## [2.8.13] - 2026-06-10

### Fixed

- **Codex App Native Controls Protection** - Meta_Kim now protects a user's existing `~/.codex/config.toml` before running the ECC Codex home installer. The issue was discovered because ECC's Codex install path can copy its reference `config.toml` over the user's Codex App configuration, which can break the Codex Computer Use and Chrome plugin links.
- **ECC Config Merge Safety** - After the upstream ECC installer runs, Meta_Kim restores the user's original Codex config as the base, merges ECC additions add-only, and then restores the Codex App Browser, Chrome, and Computer Use native plugin settings. This avoids losing user MCP servers, hooks, agents, projects, profiles, and other global Codex settings.
- **Windows Codex App Recovery** - Windows installs now repair the Codex App native control surface by keeping `windows.sandbox = "unelevated"`, enabling `features.js_repl`, removing stale `.codex/.tmp/bundled-marketplaces/openai-bundled` marketplace sources, and preserving the Computer Use notification helper when it exists.

### Verification

- `node --test tests/setup/codex-config-merge.test.mjs`
- `node --test tests/setup/install-plugin-bundles.test.mjs`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `npm run meta:graphify:rebuild`
- `git diff --check`

## [2.8.12] - 2026-06-10

### Fixed

- **Codex HookPrompt Model Context** - Codex HookPrompt adapters now emit `hookSpecificOutput.additionalContext` instead of `systemMessage`. This fixes the case where HookPrompt ran and produced visible hook output, but the optimized prompt was not reliably injected into the model context.
- **Codex Memory Context** - Shared Meta_Kim memory hooks now use the same model-visible context envelope on Codex as Claude Code, while Cursor keeps its `prompt` envelope and UI-only notices remain separate.

### Changed

- **HookPrompt Dependency Path** - Meta_Kim now looks for HookPrompt's Codex adapter before falling back to the Claude hook implementation, matching the upstream dependency layout.

### Verification

- `node test-hook.js` in `D:/KimProject/HookPrompt`
- `node --test tests/setup/sync-runtimes-manifest.test.mjs tests/setup/mcp-memory-hooks.test.mjs`
- `node scripts/install-global-skills-all-runtimes.mjs --update --skills hookprompt --targets codex`
- `codex exec --dangerously-bypass-hook-trust --skip-git-repo-check --sandbox read-only --cd D:/KimProject/课程素材 "帮我做个小红书营销自动发布器，先别改文件，先说你理解到什么"`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.11] - 2026-06-09

### Changed

- **Global and Project Hook Strategy** - Meta_Kim now separates project-level governance hooks from global reusable hooks. Strong governance hooks such as dispatch enforcement, Graphify context, and meta-theory spine stay project-scoped by default, while global installs focus on safe reusable entry points such as memory save, HookPrompt, and the OpenClaw memory bridge.

### Fixed

- **Cursor HookPrompt Global Install** - Cursor global `beforeSubmitPrompt` now receives the HookPrompt adapter just like Codex global `UserPromptSubmit`, and strict provider validation checks both runtimes.
- **Hook Capability Inventory** - The provider registry now models Codex and Cursor HookPrompt adapters separately, so project projection and global install evidence are checked against the right runtime and hook event.

### Verification

- `node scripts/install-global-skills-all-runtimes.mjs --skills hookprompt --targets cursor`
- `node scripts/validate-provider-capabilities.mjs --strict-global-hooks --json`
- `node --test tests/setup/install-cross-platform.test.mjs`
- `node --test tests/governance/provider-capabilities.test.mjs`

## [2.8.10] - 2026-06-09

### Added

- **Dynamic Workflow** - Natural product requests now expand into task-specific execution lanes instead of a fixed checklist. For example, a Xiaohongshu automation request can select product, research, content, UX, frontend, backend, data, integration, security, test, and ops lanes, while a local todo board selects only the smaller set it actually needs.
- **Project Agent Profiles** - Dynamic lanes synthesize run-pinned project agent profiles before execution. The profile records the project scope, role family, capability loadout, memory strategy, evidence rules, and promotion policy; one-run workers stay separate from durable project agents.
- **Evidence Policy** - Research, integration, security, and ops lanes now declare when current external evidence is required. Claims about platform rules, APIs, provider capability, compliance, security, release paths, or third-party feasibility must be source-backed before the route is locked.
- **Local Baseline Comparison** - Every selected lane must compare against the local project reality before dispatch: canonical agents and skills, contracts, capability indexes, runtime mirrors, package scripts, MCP config, OS/runtime matrices, and project memory.
- **Graphify Agent Equipment** - Project agent profiles now treat Graphify as a navigation and subgraph-slicing capability, not as a full-context dump. Runs use existing graph artifacts when present, inject only worker-relevant slices, verify claims against source files, and rebuild the graph after mutations.
- **Conversation Notice** - Governed runs now emit localized, human-readable notices for ordinary requests so users can see what is happening without knowing packet names or command syntax.

### Fixed

- **Natural-language entry** - Durable human requests no longer require words like `meta-theory`, `Critical`, or `Fetch`. Product-building requests enter the governed path automatically, while pure read-only questions stay lightweight.
- **OpenClaw and Cursor contribution gate** - OpenClaw or Cursor changes now require strict tool-side self-test evidence before merge.
- **Orchestration output clarity** - The orchestration summary now exposes project agent ids, pinned capability profiles, external evidence requirements, and local baseline requirements in a way maintainers can inspect.

### Verification

- `node --test tests/meta-theory/31-capability-gap-orchestration.test.mjs`
- `node --test tests/meta-theory/34-run-deliverables.test.mjs`
- `npm run meta:sync`
- `npm run meta:release:smoke`
- `npm run meta:graphify:rebuild`
- `git diff --check`

## [2.8.8] - 2026-06-09

### Changed

- **Tool-facing report language** - Public meta-theory reports kept the protocol labels but paired them with plain-language explanations.
- **Runtime target honesty** - Claude Code and Codex are described as fully supported. OpenClaw and Cursor are described as formal compatible projections with stricter contribution evidence requirements.
- **Durable agent boundary** - Temporary subagents are described as factory or review workers, not as the project agents being created.
- **Tool target source** - Reported tool targets now come from runtime compatibility data instead of hardcoded names.

### Verification

- `npm run meta:sync`
- `npm run meta:check`
- `npm run meta:providers:validate`
- `npm run meta:hook:validate`
- `npm run meta:route:validate`
- `npm run meta:runtime:validate`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.7] - 2026-06-09

### Changed

- **Cross-tool Fetch discovery** - Fetch now records explicit project and global capability inventory evidence before Thinking across Claude Code, Codex, Cursor, and OpenClaw.
- **Provider scanning parity** - Global discovery covers settings, hooks, skills, prompts, rules, MCP config, package scripts, and workspace agents across the supported tool projections.
- **Runtime skill projection stability** - Runtime sync preserves cross-tool Fetch checklist wording instead of rewriting paths into the wrong projection.

### Verification

- `npm run meta:sync`
- `npm run meta:route:validate`
- `npm run meta:capabilities:smoke`
- `npm run meta:check:runtimes`
- `npm run meta:test:meta-theory`
- `git diff --check`

## [2.8.6] - 2026-06-05

### Added

- **Capability Gap productization** - Capability Gap handling became a product workflow with decision contracts, output contracts, real-input replay, orchestration board validation, and acceptance gates.
- **Run deliverables** - Governed runs gained user-visible deliverables, trend panels, approval panels, GitHub gap reports, verification packets, research reports, capability browsers, DAG/scheduler reports, worker output reports, and product delivery bundles.
- **Runtime evidence hardening** - Runtime checks gained live shard matrices, Cursor live boundary contracts, OpenClaw batch stability evidence, Codex timeout recovery evidence, and complex replay scenarios.
- **Reusable project-file inventory skill** - Added the project-local inventory skill for repeated same-set file analysis.

### Fixed

- **Portable hook sync** - Project Claude hook commands remain repo-relative while global hooks keep slash-normalized absolute commands.
- **Stale report hygiene** - Generated reports moved out of tracked docs paths, and risky cross-project batch updating was removed.
- **PRD closure alignment** - The complete-product guard now tracks the current completed backlog instead of stale unfinished markers.

### Verification

- `npm run meta:sync`
- `npm run discover:global`
- `npm run meta:check:global`
- `npm run meta:check`
- `npm run meta:graphify:rebuild`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `git diff --check`

## [2.8.5] - 2026-06-03

### Added

- **Release modes** - Low-risk prompt, documentation, and governance wording changes now use a fast release path. Install, runtime, hook, provider, dependency, package, security, and live-evidence work still require the stricter release-grade path.
- **Execution-demand proof** - Release-grade work must prove the Fetch -> Thinking route selects owner, agent provider, skill provider, MCP provider, command/runtime tool, and verification path before mutation or release.
- **Live evidence classification** - Structural smoke, warnings, skipped/needs-auth states, and true runtime live passes are now separated.

## [2.8.4] - 2026-06-02

### Added

- **Capability discovery smoke** - Added a smoke command that proves a real execution demand can naturally select owner, provider, tool, and verification path.
- **OpenClaw live sharding** - Long Claude/OpenClaw live checks can be split by agent for recovery and diagnosis.

### Fixed

- **Execution routing** - Engineering execution routes now bind real owner/provider/verification evidence before Execution.
- **OpenClaw live evaluation** - OpenClaw checks inherit the configured provider/model surface and recover better from nested JSON and session output.
- **OpenClaw auth hydration** - Local OpenClaw auth can reuse an existing usable meta-agent auth source without overwriting working files.

## [2.8.3] - 2026-06-02

### Added

- **Capability Provider Contract** - Added a provider registry and lifecycle model for runtime-native tools, skills, agents, hooks, commands, rules, plugins, MCP servers, dependency projects, memory, and graph providers.
- **Provider validator** - Added validation for provider/runtime/OS/install-layer gaps, including strict global Codex hook checks.

### Fixed

- **Codex HookPrompt chain** - The global Codex prompt hook now preserves existing planning hooks while ensuring HookPrompt output reaches model context.
- **Plugin visibility** - Plugin and plugin-bundle providers are represented in the capability index and provider registry.

## [2.8.2] - 2026-06-02

### Changed

- **Runtime compatibility catalog** - Runtime support data was normalized into a catalog with sync behavior, native surface claims, and package targets.
- **Candidate runtime handling** - Non-primary tools such as opencode, Qwen, Zed, Gemini, CodeBuddy, Antigravity, JoyCode, and Qoder are tracked honestly as install targets or candidate probes rather than overstated full projections.

## [2.8.1] - 2026-06-02

### Changed

- **Public runtime support wording** - README and runtime-facing docs were aligned so supported, compatible, and candidate states are easier to distinguish.
- **Projection sync clarity** - Project-local and global sync behavior became easier to explain and verify.

## [2.8.0] - 2026-06-01

### Added

- **Provider-first governance** - Meta_Kim shifted from tool-name routing toward provider and capability routing.
- **Runtime and OS evidence gates** - Execution routes now check runtime support, OS support, dependency state, owner, weapon, and verification path before acting.
- **Install and release evidence** - Setup, sync, runtime, provider, and release checks became part of the normal release story.

## [2.7.0] - 2026-06-01

### Added

- **Capability route governance** - Introduced capability-first execution routing, owner/loadout evidence, and provider discovery as the default shape for governed work.
- **Runtime alignment** - Claude Code, Codex, OpenClaw, and Cursor projections were aligned around canonical source data while preserving honest runtime limitations.

## [2.6.x] - 2026-05-29 to 2026-05-30

### Added

- **Governed execution reports** - Added richer run reports, status envelopes, and public-facing evidence surfaces.
- **Research and capability preparation** - Added source-backed research preparation, retrieval capability discovery, and multi-type capability inventory.
- **Global capability discovery** - Added broader scans for installed agents, skills, hooks, commands, MCP config, plugins, and runtime mirrors.

## [2.5.x] - 2026-05-28

### Added

- **Governance decision engine** - Added runtime capability, OS compatibility, dependency capability, weapon routing, trigger-action policy, intent amplification, choice surfaces, dynamic lens selection, and decision-pattern contracts.
- **User-facing architecture docs** - Expanded documentation around runtime capability, dependency discovery, owner/weapon routing, and choice surfaces.

## [2.4.x] - 2026-05-27 to 2026-05-28

### Added

- **Research route hardening** - Research work now requires retrieval capability evidence before it can influence route design.
- **Interface integration contracts** - Third-party and internal API integration work gained explicit contract packets, unknown-field handling, evidence refs, and review gates.
- **Run status surface** - Added localized run-status output for public governance state.

## [2.3.x] - 2026-05-26

### Added

- **Evidence integrity contracts** - Worker claims about tests and command success now need structured execution evidence.
- **Silent-success handling** - Commands that succeed without output are represented by exit-code evidence rather than fabricated placeholder text.
- **Validation contract structure** - Validation rules were moved toward reusable schemas and runners.

## [2.2.x] - 2026-05-25

### Added

- **Workflow contract expansion** - Added packet vocabulary, naming policy, dimension definitions, dispatch evidence, and business-flow tests.
- **Agent factory governance** - Project-local execution agent creation now requires capability gap evidence, governance participation, and review before durable files are written.
- **Sub-agent boundary rules** - Meta agents govern, review, and route; they do not become generic implementation workers.

### Fixed

- **Worker write-completion honesty** - Workers with declared file scope must report each promised file as completed, skipped, or failed.
- **Historical release-note accuracy** - Earlier low-level release-note mistakes were corrected, then folded into this reader-facing format.

## [2.1.x] - 2026-05-23 to 2026-05-24

### Added

- **Choice and confirmation flow** - Critical and Fetch gained clearer gates for ambiguity, candidate paths, and user confirmation before detailed orchestration.
- **Public-ready gates** - Verification, summary closure, and deliverable-chain closure became explicit requirements before claiming completion.

## [2.0.x] - 2026-04-11 to 2026-05-23

### Added

- **Meta_Kim 2.x architecture** - Established the 8-stage spine, 11-phase business workflow, hidden governance packets, runtime projections, memory layers, Graphify support, setup/update flow, and capability boundaries.
- **Cross-runtime projection system** - Canonical sources can project into Claude Code, Codex, Cursor, and OpenClaw files.
- **Install and packaging foundation** - Added setup, sync, status, package whitelist, runtime asset projection, local overrides, and project/global install modes.
- **Meta agent team** - Introduced the governance agents such as Warden, Conductor, Genesis, Artisan, Sentinel, Librarian, Prism, Scout, and Chrysalis.

### Fixed

- **README and architecture clarity** - Documentation was repeatedly tightened so the project explains the difference between the 8-stage execution spine, the business workflow, contracts, gates, and runtime projections.
- **Runtime mirror drift** - Sync checks and validation reduced drift between canonical sources and projected runtime files.

## [1.x] - 2026-03-22 to 2026-04-11

### Added

- **Initial governance model** - Established the early meta-agent architecture, workflow vocabulary, and reusable governance concepts that became Meta_Kim 2.x.
- **Early documentation and examples** - Added first public README material, diagrams, and release notes.

## [0.x] - 2026-03-17 to 2026-03-21

### Added

- **Project seed** - Started the repository and first experimental Meta_Kim workflow assets.
