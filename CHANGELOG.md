# Changelog

> 🇨🇳 [中文版](./CHANGELOG.zh-CN.md) | English version

This file is the reader-facing release history for Meta_Kim.

The changelog explains what changed and why it matters. It intentionally avoids long internal task ledgers, low-signal backlog ids, and implementation trivia. When exact evidence is needed, use the repository history, tests, generated reports, and PRD artifacts.

## [Unreleased]

## [2.8.32] - 2026-06-15

### Changed

- **Codex Meta-Theory Fan-Out** - Made explicit `/meta-theory` and complex governed work fan-out eligible when there are multiple safe worker lanes, so Codex should plan real parallel work instead of silently falling back to one main-thread executor.
- **Runtime Capacity Sizing** - Replaced the stale fixed five-agent wave cap with runtime capacity detection from Codex config and the official default, while still proving DAG dependencies, collision boundaries, workspace isolation, and external-write safety before fan-out.
- **Invocation Truth Evidence** - Tightened run evidence so live subagents are reported as `invoked` only with host spawn evidence; unavailable host dispatch is reported as `unavailable`, single-lane work as `not_required`, and provider selection can no longer masquerade as execution.

### Verification

- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.31] - 2026-06-14

### Added

- **Agent Teams Playbook Gate** - Added the P-110 support gate and `agentTeamsPlaybookPacket` so the default governed route selects `agent-teams-playbook` for two or more independent executable worker lanes, proves DAG/collision/workspace/external-write safety, sizes waves by runtime agent capacity, and records `not_required` for single-lane work.
- **Capability Invocation Truth Layer** - Added explicit `agent_teams_playbook` truth states so selected providers, live subagent calls, MCP calls, skills, commands, hooks, and local workers cannot be relabeled as each other.
- **Product Experience Validator** - Added a PRD/product validator that checks the three core goals plus support gates, including LangGraph-style run packets, Dynamic Workflow coverage, user-visible run surfaces, capability invocation truth, and the agent-teams adapter.

### Changed

- **Codex Meta-Theory Runtime** - Tightened the Codex `/meta-theory` adapter and meta-conductor prompt so `agent-teams-playbook` is selected only for real parallel worker lanes, not for every non-trivial task.
- **Dependency Registry** - Promoted `agent-teams-playbook` from an external reference to an installed skill candidate with compatibility validation and a no-overclaim boundary.
- **Release Smoke Coverage** - Extended release smoke to include the `agent-teams-playbook` integration test.

### Verification

- `npm run meta:deps:compat`
- `npm run meta:prd:product-experience:validate`
- `npm run meta:prd:default-execution:validate`
- `npm run meta:prompt:validate`
- `npm run meta:graphify:check`
- `npm run meta:release:smoke`
- Codex live probe created reviewer subagent `019ec274-15a4-7603-9986-335dad22c699` from thread `019ec26d-8837-77b2-95c8-1361bcb91128`; the `wait_agent` return was interrupted, so full review-return closure remains partial evidence.

## [2.8.30] - 2026-06-13

### Changed

- **Primary Install Defaults** - Changed direct-Enter install/update defaults to Claude Code + Codex while keeping OpenClaw and Cursor available through explicit all-runtime or `--targets` selection.
- **Fetch Research Quality Gate** - Internalized ECC-style deep research as a Meta_Kim-native Fetch contract with source-quality ladders, key-source deep reading, claim attribution, cross-checking, and original synthesis boundaries.
- **Compatibility Candidate Framework** - Added a source-backed primitive-surface framework for Qoder CLI, Trae, Kiro, Windsurf / Devin Desktop Cascade, Cline, Roo Code, and Continue while keeping them as candidate probes instead of formal runtime projections.
- **Compatibility Evidence Boundary** - Split GitHub completion from all-tool compatibility evidence so generated reports keep Cursor in the compatibility follow-up lane, separate from primary release decisions.

### Verification

- `npm run meta:sync`
- `npm run meta:release:smoke`
- `git diff --check`
- `node setup.mjs --update --lang zh --targets claude,codex --project-dir <dir>...`

## [2.8.29] - 2026-06-13

### Added

- **Native Choice Surface Guard** - Added regression coverage that prevents Codex and Claude Code branch-changing decisions from being completed by chat-card or artifact-only fallbacks.
- **Run Status Surface** - Added localized run-status envelopes and commands so governed runs can expose reader-facing progress without leaking internal packet names.

### Changed

- **Codex and Claude Code No-Downgrade Rule** - Required Codex to use `request_user_input` and Claude Code to use `AskUserQuestion` or deferred `AskUserQuestion` for required execution decisions; unavailable or empty native surfaces now block before Execution instead of degrading silently.
- **Runtime Mirror Mapping** - Synced the canonical meta-theory skill, meta agents, runtime references, and project-local runtime mirrors across Claude Code, Codex, Cursor, and OpenClaw.

### Verification

- `npm run meta:sync`
- `npm run meta:governance:validate`
- `npm run meta:prompt:validate`
- `npm run meta:check:runtimes`
- `npm run meta:test:meta-theory`
- `git diff --check`

## [2.8.28] - 2026-06-13

### Added

- **Default Governed Execution Evidence** - Added validators and run artifact packets proving the default Meta-Theory path emits governance agent results, Conductor consumption evidence, worker results, and worker execution evidence without relabeling structural boards as live runtime proof.
- **Research-to-Native Productization** - Added source-backed productization contracts for research adoption, MCP/provider maturity, trace/eval control, AG-UI-style stage events, performance/cost budgets, and context engineering.
- **Smooth Capability Discovery Guard** - Added a PRD validator that keeps agents, skills, scripts, MCP, tools, hooks, runtimes, memory, graph, and external providers as first-class discovery categories while allowing safe `no_expansion_needed` cases.
- **Runtime Priority Contract** - Added a machine-readable contract and validator that keep Claude Code and Codex as primary prompt-first runtimes while preserving OpenClaw and Cursor as compatibility targets only.

### Changed

- **Framework Prompt Architecture** - Prompt assets are now validated across layered system/project/agent/skill/contract/runtime-adapter/eval surfaces, with review dimensions, regression fixtures, and context-sprawl budget rules.
- **Governance Verification** - `meta:verify:governance` now includes default execution, asset sedimentation, research-native, framework prompt architecture, smooth capability discovery, and runtime priority validators.
- **Single PRD Source** - The local-private PRD now records P-067, P-068 through P-084, P-085, and P-092 as locally tested while keeping Cursor native live evidence in the compatibility follow-up lane.

### Verification

- `npm run meta:prd:smooth-capability:validate`
- `npm run meta:prd:runtime-priority:validate`
- `node scripts/run-node-tests.mjs "tests/meta-theory/29-capability-gap-complete-product-prd.test.mjs"`
- `npm run meta:verify:governance`
- `npm run meta:release:smoke`
- `git diff --check`
- `npm run meta:github:gap`

## [2.8.27] - 2026-06-13

### Added

- **Prompt-First Live Acceptance** - Added a PRD-linked live acceptance contract and runner that proves the same framework prompt through Claude Code and Codex before the prompt-first flow can be called complete.
- **Source-Backed PRD Gates** - Added PRD source-map and dossier validators for product discovery, prompt/runtime, MCP/tools/providers, security, evaluation/observability, and architecture/release categories.

### Changed

- **Abstract Prompt Capability Validation** - `meta:prompt:validate` and governance verification now cover abstract capability families such as capability discovery, prompt intake optimization, planning continuity, runtime-native surfaces, MCP/providers, memory/graph, safety hooks, release evidence, and i18n.
- **Prompt-First Release Evidence** - Governance verification now includes prompt-first stage contracts, live acceptance fixtures, source-map validation, PRD category dossiers, and public docs image-asset boundaries.
- **Codex Live Runner Stability** - The Codex live acceptance runner now sends the prompt through stdin with `codex exec -`, avoiding Windows `.cmd` multiline prompt stalls while preserving real Codex execution evidence.

### Verification

- `npm run meta:prd:prompt-first-live:run`
- `npm run meta:prd:prompt-first-live:validate`
- `npm run meta:verify:governance`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.26] - 2026-06-12

### Fixed

- **Meta-Theory Deep Fetch Entry** - Project/repo/codebase understanding and commercialization strategy prompts now enter the governed Fetch path instead of falling through to shallow fast-path answers.
- **Cross-Runtime Entry Parity** - Added Claude Code `/meta-theory` command projection support, Cursor's native always-on dispatch rule, and OpenClaw HEARTBEAT/SOUL project-understanding requirements so Claude, Codex, Cursor, and OpenClaw all route through the same governed entry contract.
- **Run Artifact Evidence** - `meta:theory:run` now records project overview, maintainer contract, command inventory, Graphify, MCP, capability-index, machine-contract, and external-research capability source classes for project-understanding runs.

### Verification

- `node --test tests/meta-theory/47-meta-theory-entry-classifier.test.mjs`
- `node --test tests/setup/sync-runtimes-manifest.test.mjs`
- `node --test tests/governance/core-loop-contract.test.mjs`
- `npm run meta:sync`
- `npm run meta:check`
- `git diff --check`

## [2.8.25] - 2026-06-12

### Fixed

- **Claude Code Global Hook Cleanup** - Global Meta_Kim sync now validates the Claude Code `settings.json` hook commands, not only the `~/.claude/hooks/meta-kim/` package directory. This catches stale global Meta_Kim hook registrations that point at removed scripts and cause Claude Code `MODULE_NOT_FOUND` Stop hook errors.
- **Installed-User Recovery Path** - Running the normal setup/update path now cleans stale global Meta_Kim hook entries and leaves only the currently managed global hook command, so existing installations recover without hand-editing Claude settings.

### Verification

- `npm run meta:check:global:release`
- `npm run meta:test:setup`
- `npm run meta:verify:governance`
- `npm run meta:check`
- `git diff --check`

## [2.8.24] - 2026-06-12

### Changed

- **Runtime Safety Hardening Contract** - Added a release-grade governance contract that binds the five recent repair lanes into one validator: host config merge safety, cross-runtime HookPrompt protocol modeling, deletion/refactor residue sweep, runtime evidence templates, and install/update status semantics.
- **Install Status Semantics** - Install and update messages now have machine-readable status classes (`success`, `skipped`, `manual`, `failed`) with next-action semantics, so user-facing setup output can distinguish expected skips, manual host steps, and real failures.
- **HookPrompt Bad-Input Regression Coverage** - Added regression fixtures for markdown fences, delegated prompts, and internal-goal filtering, and verified Codex/Cursor adapters keep optimized prompt content in model-visible fields without reusing UI notices as policy.

### Verification

- Added `npm run meta:runtime:safety:validate` to `meta:verify:governance`.
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

### Changed

- **Run-Scoped Worker Execution** - `meta:theory:run` now executes bounded worker task packets through a local run-scoped worker executor instead of stopping at structural dispatch readiness. The main thread still scopes, delegates, reviews, and synthesizes; no extra external agent is spawned.

### Verification

- Adds governance coverage that requires worker execution evidence while preserving the public-ready release gate.

## [2.8.22] - 2026-06-12

### Changed

- **Core Loop Release Evidence Closure** - Completed the PDR release checklist and final release evidence for the governed execution repair so the shipped tag includes commit, tag, push, and GitHub Release proof.

### Verification

- Reused the `2.8.21` core-loop implementation evidence and reran the local release checks for the final `2.8.22` patch release.

## [2.8.21] - 2026-06-12

### Changed

- **Core Loop Governed Execution Repair** - Meta_Kim now has a compact machine contract for the default eight-stage governed path, covering Critical, Fetch, Thinking, Execution, Review, Meta-Review, Verification, and Evolution with explicit IO, skip, gate, blocking, warning, public-ready, and writeback policy.
- **Default Run Artifact Closure** - `meta:theory:run` now emits top-level request, intent, fetch, capability inventory, gap/ready, thinking, dispatch, worker task, execution, review, meta-review, verification, evolution, dynamic workflow, and public-ready packets for durable natural-language work.
- **Capability Discovery Bus Integration** - The default run now uses the unified capability inventory bus instead of a skill-only or coarse summary. Inventory records cover agents, skills, scripts/tools, MCP, hooks, runtime, OS, memory, graph, and external dependency candidates with shared provider fields.
- **Release Governance Gates** - Full release verification now includes governance validators and governance tests, including strict workflow fixture validation, PDR evidence mapping, and script registry cleanup-candidate protection.

### Verification

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

### Changed

- **Project Hook Ownership Rationalization** - Project runtime exports now keep project-specific hooks focused on Meta_Kim behavior, such as graph context, capability-first dispatch, and meta-theory activation. Global personal or reusable hooks, including prompt optimization, memory lifecycle helpers, planning helpers, and generic dangerous-command guards, are kept in the global runtime homes instead of being duplicated into every project.
- **Global Hook Sync Coverage** - Global sync and release checks now compare the selected global hook files explicitly, while project sync removes stale global-only hook adapters from generated Codex and Cursor project folders. This keeps dependency-owned hooks updateable from their source projects and prevents duplicated prompt/context injection.
- **Codex MCP Config Merge Normalization** - Codex MCP config merging was tightened so ECC-managed servers are normalized consistently while user-owned config remains preserved.

### Verification

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

### Changed

- **Apache-2.0 License With NOTICE Attribution** - Meta_Kim's main project license changed from MIT to Apache License 2.0, with a root `NOTICE` file that carries the recommended attribution. Commercial use remains allowed, while redistributions of Meta_Kim or substantial portions of it must keep the Apache license text and NOTICE attribution. Earlier releases remain governed by the license that shipped with those releases.
- **Automated Multi-Project Runtime Updates** - `setup.mjs` can now refresh project-level runtime files across multiple explicit or saved project directories, including `--project-dir` for scriptable targets, `--save-project-dirs` to remember a script-provided list, and `--all-projects` for saved local targets.
- **Saved Project Directory Manager** - The update wizard now lets users manage a saved project directory list, enter multiple directories in one semicolon/comma-separated line, update all saved projects from the menu, and rerun saved targets with `--all-projects`.
- **Project Config Protection During Batch Updates** - Multi-project runtime exports preserve and merge existing local `settings`, MCP, and hook configs instead of blindly replacing them. Local-only state such as `.claude/settings.local.json`, Codex project config, and OpenClaw workspace state is not exported.

### Verification

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

### Fixed

- **Codex Planning Stop Hook Advisory Mode** - Codex planning-with-files Stop hooks no longer turn ordinary progress reminders into blocking continuations. This prevents completed answers from being folded into Codex App's processed section just because a stale or advisory plan reminder fired at the end of the turn.
- **Zero-Phase Plan Handling** - Codex planning hook adapters now ignore `0/0` phase counts instead of treating them as incomplete work. Mixed `**Status:**` and inline `[status]` phase formats are counted consistently with the shell and PowerShell hooks.

### Changed

- **Change Readiness Contract** - Runtime, hook, setup, sync, provider, deletion, and release PRs now have a reusable checklist for host-state impact matrices, hook/prompt protocol flow, deletion residue sweeps, and evidence budgets.
- **Execution Mode Classes** - `executionMode` values are now explicitly mapped into `real_execution`, `read_only_sidecar`, and `approval_gate` classes so validators and reviews can reason about execution semantics instead of raw task counts.

### Verification

- `node --check scripts/install-global-skills-all-runtimes.mjs`
- `node --check scripts/validate-project.mjs`
- `node --check scripts/validate-run-artifact.mjs`
- `node --test tests/setup/release-docs-semantics.test.mjs tests/setup/install-cross-platform.test.mjs`
- `node --test tests/meta-theory/09-run-artifact-validator.test.mjs tests/meta-theory/31-capability-gap-orchestration.test.mjs tests/meta-theory/33-capability-gap-orchestration-quality.test.mjs`
- `node scripts/validate-provider-capabilities.mjs --strict-global-hooks --json`
- `npm --registry=https://registry.npmjs.org audit --audit-level=high`
- `npm run meta:verify:all`
- Codex planning Stop hook smoke on this Windows host: `0/0` phase plans emit no block; normal incomplete plans emit `systemMessage`, not `decision:block`.
- Installed-user hook merge smoke: after reinstalling `planning-with-files`, Codex keeps both `user_prompt_submit.py` and `hookprompt-adapter.mjs`; Cursor keeps `beforeSubmitPrompt` with `hookprompt-adapter.mjs`.

## [2.8.17] - 2026-06-11

### Fixed

- **Real Execution Mode For Orchestration** - Worker task packets now declare `executionMode`, so Meta_Kim can distinguish real execution workers from approval gates and read-only Fetch/Review sidecars. Parallel groups can no longer pass quality gates when they contain only sidecars or approval steps.
- **Capability Gap Board Validation** - Capability-gap orchestration reports now carry execution mode through the worker packet, task board, review checks, validation summary, and run-artifact validator. This makes fake parallelism visible and testable.
- **ECC Plugin Update Path** - Claude plugin update mode now calls `claude plugin update ecc@ecc` when an installed ECC plugin record exists, and refreshes the plugin manager record after a successful update instead of relying on stale local metadata.
- **Graphify Python Discovery** - Graphify setup and runtime checks now try Homebrew and Linuxbrew Python paths after normal `python3` / `python` launchers, improving macOS and Linux setup reliability when Python is installed outside PATH.

### Verification

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

### Fixed

- **Automatic Post-Copy Graphify Initialization** - Copied project-level Meta_Kim folders no longer require users to remember `node meta-kim-post-copy.mjs`. On the first `meta-theory` activation, Meta_Kim now starts the post-copy bootstrap automatically from the final project root.
- **Non-Blocking First Trigger** - The generated `meta-kim-post-copy.mjs` now supports `--auto` and `--auto-worker`. The hook launches a detached background worker, records one-time state in `.meta-kim/state/default/post-copy-init.json`, and keeps the meta-theory startup path responsive even when Graphify dependency installation or graph generation takes longer.
- **Runtime Hook Coverage** - Claude Code and Codex Skill activation now call the same shared spine hook, and Cursor prompt hooks can bootstrap explicit `meta-theory` prompts through the same path. The hook also honors `META_KIM_POST_COPY_AUTO=off` for explicit opt-out.
- **Regression Coverage** - Setup tests now lock the automatic bootstrap contract, Cursor prompt hook ordering, and the copy-ready Graphify post-copy behavior.

### Verification

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

### Fixed

- **Copy-Ready Graphify Initialization** - Project-level folders generated by quick setup or install/update export now include `meta-kim-post-copy.mjs`. After copying the generated folder contents from a staging location, such as Desktop, into any project root, run `node meta-kim-post-copy.mjs` there to initialize Graphify for the final project.
- **Staging Directory Boundary** - Meta_Kim no longer treats the generated staging folder as the final Graphify root. This avoids creating or copying stale `graphify-out/` data for the wrong project while preserving per-project Graphify setup.
- **Post-Copy Contract Coverage** - Setup tests now lock the copy-ready contract: exports write the bootstrap after runtime files are copied, the bootstrap resolves its own directory as the project root, and install/update exports do not silently build Graphify in the staging directory.

### Verification

- `node --check setup.mjs`
- `node --test tests/setup/graphify-wiring-contract.test.mjs`
- `node --test tests/setup/install-cross-platform.test.mjs tests/setup/setup-update-default-flow.test.mjs tests/setup/i18n.test.mjs`
- `npm run meta:test:setup`
- `npm run meta:graphify:rebuild`
- `npm run meta:graphify:check`
- `git diff --check`

## [2.8.14] - 2026-06-10

### Fixed

- **Localized Install And Update Notices** - Install/update output for ECC, Graphify, Codex config preservation, native plugin handoff, marketplace checks, and loopback proxy handling now goes through Meta_Kim's shared i18n layer instead of hardcoded English strings. Chinese, Japanese, and Korean users now see localized status lines for expected skips and manual host-plugin steps.
- **ECC Upstream Version Tracking** - ECC native installs now use `ecc-universal@latest` instead of the older `2.0.0-rc.1` release candidate in the runtime manifest, docs, compatibility evidence, and setup tests.
- **Less Misleading Plugin Handoff Output** - Expected host limitations are now reported as skipped/manual steps instead of warning-like failures. Cursor and Codex native plugin messages now explain the manual host-plugin path without implying that the skill fallback failed.
- **Graphify Skip Output Consistency** - Already-wired Graphify guide sections now report localized skip notices, and the old `[SKIP] graphify ...` line was aligned with Meta_Kim's normal skipped-state output.
- **HookPrompt Markdown-Safe Output** - The upstream HookPrompt dependency now wraps raw user input and the optimized full prompt in fenced code blocks, so attachment headings such as `# Files mentioned by the user:` no longer render as oversized Markdown headings in the middle of Codex output.

### Verification

- `node --check .claude/hooks/user-prompt-submit.js; node --check .codex/hooks/user-prompt-submit.js; node --check test-hook.js` in `D:/KimProject/HookPrompt`
- `node test-hook.js` in `D:/KimProject/HookPrompt`
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
