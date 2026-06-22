# Changelog

> 🇨🇳 [中文版](./CHANGELOG.zh-CN.md) | English version

This file is the reader-facing release history for Meta_Kim.

The changelog explains the user-facing problem or risk each release solved, what changed to solve it, and why the change matters. It intentionally avoids long internal task ledgers, low-signal backlog ids, and implementation trivia. When exact evidence is needed, use the repository history, tests, generated reports, and PRD artifacts.

## [2.8.49] - 2026-06-21

### Solved Problem

Codex could fail on macOS before Meta_Kim even started when the user-level `config.toml` had a malformed TOML array above `[features]`. The host error pointed at `multi_agent = true`, which made a valid Codex feature flag look wrong even though the real issue was an unclosed or comma-broken array above it.

Meta_Kim's global sync and dependency install paths also edited Codex config through line-based merges, so they needed a guard that refuses to merge into a structurally unsafe config and explains the local repair.

### Changed

- **Codex Config Merge Guard** - Codex config merge now rejects unclosed TOML arrays or inline tables before writing feature flags, App native controls, or add-only dependency config.
- **Human-Readable Diagnosis** - The error now points to the line that is still inside an unclosed TOML container, reports the opener line/column, and shows the correct `[features]` placement for `multi_agent = true`.
- **Global Check Visibility** - `meta:check:global` now reports invalid Codex `config.toml` separately instead of reducing the problem to a missing `default_mode_request_user_input` feature.
- **Regression Coverage** - Setup tests reproduce the screenshot-style `notify = [` plus `multi_agent = true` failure and keep valid multiline TOML arrays accepted.

### Verification

- `node --check scripts/codex-config-merge.mjs`
- `node --check scripts/sync-global-meta-theory.mjs`
- `node --test tests/setup/codex-config-merge.test.mjs`
- Temporary Codex home `sync-global-meta-theory.mjs --check --targets codex` invalid-config reproduction
- `npm run meta:test:setup`
- `npm run meta:check`
- `npm run meta:check:global`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.48] - 2026-06-21

### Solved Problem

Graphify guidance could still push agents toward broad `GRAPH_REPORT.md` or graph context use, which made large projects feel too heavy and blurred the boundary between a graph navigation hint and source-backed evidence. A stale global Codex hook could also keep emitting the old short Graphify hint even after the canonical source had been updated.

Global-only installs could also show false red sync failures on macOS because `setup.mjs --check` still required project-local runtime projection files for every supported runtime instead of respecting the active global targets.

### Changed

- **Graphify Query-First Policy** - Meta-theory now treats Graphify as a navigation capability, not a context dump. Focused work should use `graphify query`, `graphify path`, or `graphify explain` to find candidate anchors.
- **Source Verification Boundary** - Graphify results are now explicitly candidate file anchors only; route-changing claims must be verified against source files, with targeted repository search as the fallback for stale, generic, or polluted graph results.
- **Hook Context Slimming** - Claude subagent and Graphify hooks now forbid injecting full `graph.json`, full `GRAPH_REPORT.md`, or broad graph dumps into worker context.
- **Sync Template Alignment** - Codex runtime sync and setup templates now carry the same query-first wording, preventing project or global sync from restoring the old guidance.
- **Global-Only Setup Check** - Setup check/update paths now respect `projectProjectionMode=global_only`; repo-local projection checks are skipped in global-only mode, and project-scope validation checks only selected active targets.
- **Global Hook Refresh** - The global Claude and Codex `meta-kim` hooks were refreshed with `--with-global-hooks` so the active runtime hint matches the canonical policy.
- **Documentation And Regression Coverage** - README/CLAUDE surfaces now describe Graphify as query/path/explain slices plus source verification, and setup tests reject the old compressed-context wording.

### Verification

- `node --test tests/setup/sync-runtimes-manifest.test.mjs`
- `node --test tests/setup/graphify-wiring-contract.test.mjs`
- `node --test tests/setup/setup-update-default-flow.test.mjs`
- `npm run meta:sync`
- `npm run meta:validate`
- `node scripts/graphify-cli.mjs rebuild --force`
- `npm run meta:graphify:check`
- `npm run discover:global`
- `npm run meta:check`
- `npm run meta:sync:global -- --with-global-hooks`
- `npm run meta:check:global -- --with-global-hooks`
- `npm run meta:release:smoke`
- Runtime Codex `rg` hook probe emitted the new query-first/source-verification Graphify hint.
- `git diff --check`

## [2.8.47] - 2026-06-21

### Solved Problem

The governed execution CLI and smoke-test path could stall or crash in Codex/Windows hosts that block nested Node child processes. That made fuzzy-instruction acceptance look broken even when the route selector and Node tests were valid.

The product-experience gate also still treated structural native-choice support as a pass. A run could prove worker packets and selected providers, but it could still over-read `selected_not_invoked`, a CLI child process, or a markdown/card artifact as real host invocation or native choice evidence.

### Changed

- **Route Selector Host Fallback** - Governed execution now falls back to an in-process route selector when `spawnSync(process.execPath, ...)` is blocked, while keeping the normal CLI path unchanged for unrestricted hosts.
- **Compact Selector Output** - Added a runner-compact selector mode so governed runs avoid oversized route payloads but still preserve selected providers, worker lanes, and owner discovery counts.
- **Eight-Stage Visible Progress** - Conversation notices and stage operation plans now surface Critical, Fetch, Thinking, Execution, Review, Meta-Review, Verification, and Evolution instead of stopping at Review.
- **Capability Smoke Host Fallback** - Capability-discovery smoke now uses the same in-process selector fallback and reports spawn errors honestly instead of writing undefined output.
- **Node Test Wrapper Fallback** - The shared Node test wrapper now has a narrow worker-backed fallback for local repo scripts when child-process execution is unavailable.
- **Trusted Host Invocation Evidence** - Governed execution now accepts trusted host evidence through CLI/env only when it includes a real family, state, provider or surface, accepted evidence kind, and non-empty evidence ref; `hostInvocationRequestPacket` must be pass before the artifact can be pass.
- **Native Choice Evidence Gate** - P-106 no longer defaults to pass from structural card evidence. Branch-changing Codex/Claude choices now stay `needs-host-invocation` until trusted `request_user_input` / `AskUserQuestion` evidence is attached.
- **No Forged Native Choice Shortcut** - `select-execution-route` no longer accepts plain `completed` / `confirmed` strings as trusted native choice proof; structured evidence now needs a native surface and evidence reference.
- **Honest Validator Summary** - The default governed-execution validator now reports `validationStatus` separately from `governedExecutionStatus`, so a valid partial run is no longer summarized as a top-level pass.

### Verification

- `node --check scripts/run-meta-theory-governed-execution.mjs scripts/select-execution-route.mjs scripts/run-capability-discovery-smoke.mjs scripts/run-node-tests.mjs scripts/meta-kim-i18n.mjs`
- `node scripts/run-meta-theory-governed-execution.mjs --task "帮我把这个系统弄得更顺、更能自动处理复杂任务，并让我看见它怎么判断、怎么分工、怎么推进、怎么验收。" --run-id codex-goal-fuzzy-acceptance --state-dir .meta-kim/state/codex-goal-fuzzy --db .meta-kim/state/codex-goal-fuzzy/runs.sqlite --emit-conversation-notice --emit-card-dealing-summary`
- `node scripts/validate-run-artifact.mjs .meta-kim/state/codex-goal-fuzzy/codex-goal-fuzzy-acceptance.json`
- `node --test --test-concurrency=1 tests/meta-theory/*.test.mjs`
- `npm run meta:test:integration`
- `node --test tests/meta-theory/32-meta-theory-four-product-targets.test.mjs`
- `node --test tests/governance/core-loop-contract.test.mjs tests/meta-theory/34-run-deliverables.test.mjs tests/governance/capability-routing.test.mjs`
- `npm run meta:prd:default-execution:validate`
- `npm run meta:prd:product-experience:validate`
- clean host-acceptance process via `Start-Process node scripts/run-meta-theory-governed-execution.mjs`, using current Codex `spawn_agent` and `request_user_input` evidence; result artifact status `pass`, `hostInvocationRequest=pass`, `realInvocationCoverage=pass`, `nativeChoiceGate=pass`, `productExperience=product_experience_pass`
- `npm run meta:release:smoke`
- `npm run meta:verify:all`
- `node scripts/graphify-cli.mjs rebuild --force`
- `npm run meta:graphify:check`
- `git diff --check`
- Release boundary retained: full verification, validators, graphify check, and clean host evidence support this patch release; all-runtime native live proof remains a separate release-grade target.

## [2.8.46] - 2026-06-21

### Solved Problem

This release fixes the boundary that made interrupted Claude Code runs look like they could continue an active Meta_Kim run when the runtime spine had already stopped. HookPrompt remains the first prompt-intake and intent-amplification layer, but its model-visible context can no longer be mistaken for Fetch, Thinking, worker, execution, verification, or public-ready evidence.

### Changed

- **HookPrompt Evidence Boundary** - Documented HookPrompt as prompt-intake context only in the meta-theory skill, abstract capability contract, and runtime safety contract; it may clarify intent, but it cannot advance stages or satisfy governance evidence.
- **HookPrompt JSONL Transcript Safety** - Stop hooks now strip HookPrompt display segments without swallowing later real transcript content when Claude stores the prompt display as a one-line JSONL record with escaped newlines.
- **Public Readiness State Split** - Separated runtime `surfaceState` (`silent` / `notice` / `decision`) from Warden-owned `publicReadinessState` (`debug-surface` / `internal-ready` / `public-ready`) so UI interaction mode can no longer masquerade as release readiness.
- **Dynamic Workflow Lane Truth** - Route-selected worker lanes now feed the business-flow blueprint directly, preserve omitted lanes with reasons, and use `meta-conductor` as the merge owner for orchestration synthesis.
- **Invocation Truth Public-Ready Gate** - Run artifact validation now rejects public-ready claims when selected executable capabilities are only selected, unavailable, blocked, missing host evidence, or inconsistent between top-level packets and `coreLoop`.
- **LangGraph-Style Runtime Boundary** - Product evidence now identifies the graph work as a LangGraph-style structural control graph without adding or claiming a real LangGraph runtime dependency.
- **Global-Only Capability Inventory** - Capability discovery can now use cached global runtime inventory in `global_only` projection mode while preserving project config records as reference-only.
- **Inactive Run Continuation Boundary** - `active-run.json` and status envelopes now expose `deactivatedAt`, `deactivationReason`, and `continuationBoundary` so `session_stop` histories are visible without being treated as active managed runs.
- **Claude Runtime Session-Stop Repair** - Claude spine activation now reads inactive spine state before starting a new observed run, records the previous stopped run when the user asks to continue, and refuses to claim the old run is still active.
- **Continuation Wording Parity** - Shared and Claude activation hooks now recognize the same broad continuation wording such as `current run`, `same run`, `当前 run`, and `同一个 run`.
- **Stop Hook Transcript Filtering** - Stop compaction and progress hooks strip HookPrompt foreground display blocks before transcript heuristics, preventing prompt-optimization text from producing false stage progress, findings, or continuation handoffs.
- **Stop Cleanup Path Safety** - `stop-spine-cleanup` now reuses the repo-local state resolver before deleting completed spine state, so an unsafe `META_KIM_SPINE_STATE_DIR` cannot delete files outside `.meta-kim/state`.
- **Local Continuity Wording** - Stop compaction and project task state now mark handoffs as `local_continuity_only` with `mustNotClaimActiveRun`, replacing misleading "Resume from X stage" language.
- **Status CLI Honesty** - `meta-run-status` reports inactive `session_stop` reason and continuation boundary instead of collapsing stopped runs into a generic inactive line.
- **Release Metadata Alignment** - Bumped the package metadata to `2.8.46` so the source tree, tag, and GitHub release point at the same version.

### Verification

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
- Public-ready boundary retained: HookPrompt prompt-intake context is not runtime invocation, verification, or release-grade all-runtime live evidence.

## [2.8.45] - 2026-06-20

### Solved Problem

This release closes the gap between Meta_Kim's Dynamic Workflow / LangGraph-style governed execution claims and the evidence users can inspect. The default release surface now records the latest hook self-lock repair, keeps private project manuals outside the open-source source set, and ships with a full-pass governed execution artifact that proves capability discovery, worker fan-out, host invocation truth, and verification without upgrading the claim to release-grade live all-runtime readiness.

### Changed

- **Dynamic Workflow Evidence Closure** - Verified the governed execution artifact at `C:/Users/Kim/AppData/Local/Temp/meta-kim-host-full-db9a8dd9aa5c43418aba89f7b210bd57/artifacts/goalpro-codex-host-full-proof.json`, including `fetchPacket`, `capabilityInventory`, `capabilityRoute`, `dynamicWorkflowRuntimePacket`, `langGraphRunPacket`, `workerTaskPackets`, `workerResultPackets`, and `verificationPacket`.
- **Host Invocation Truth** - Confirmed real Codex host evidence for `spawn_agent_result`, `agent_team_result`, and `skill_application`, plus fresh local probes for MCP, command/script, and runtime-tool families; `realInvocationCoverage.missingFamilies` is empty in the artifact.
- **Hook Self-Lock Repair** - The Fetch-stage dispatch gate can now repair its own constrained `fetchRecord` state without opening business-file mutation before capability discovery and execution clearance exist.
- **Open-Source Source Boundary** - Removed private manual documents from the public source tree and kept README references aligned with the supported public documentation surface.
- **Release Metadata Alignment** - Bumped the package metadata to `2.8.45` so the source tree, tag, and GitHub release point at the same version.

### Verification

- `npm run meta:validate:run -- C:/Users/Kim/AppData/Local/Temp/meta-kim-host-full-db9a8dd9aa5c43418aba89f7b210bd57/artifacts/goalpro-codex-host-full-proof.json`
- `npm run meta:test:meta-theory`
- `npm run meta:release:smoke`
- `git diff --check`
- Public-ready boundary retained: `publicReadyDecision.publicReady = false` because release-grade live all-runtime evidence is not attached.

## [2.8.44] - 2026-06-19

### Solved Problem

This release closes the install/update gap between canonical Meta_Kim sources, global hook packages, and project runtime projections. Fresh users and existing projects now get the same governed `meta-theory` behavior without copying reusable global assets into project mirrors, and source-repository health checks no longer misread intentionally absent generated runtime folders as stale installs.

### Changed

- **Canonical Runtime Source Projection** - `meta-theory` runtime smoke checks now fall back to canonical source assets when generated project mirrors are absent, while still failing materialized runtime mirrors that are broken or incomplete.
- **Global Hook Dependency Closure** - Global Claude hook scripts now resolve shared helpers from the packaged `hooks/meta-kim/` directory instead of importing missing project-local shared paths.
- **Fetch Self-Lock Repair Path** - Fetch-stage hook enforcement now allows a constrained repair-only `fetchRecord` write to `spine-state.json`, while keeping business-file mutation blocked until real capability discovery and execution clearance exist.
- **Install And Update Scope Alignment** - Setup/update paths keep global installs global, bootstrap project mirrors only from canonical sources, and avoid treating the Meta_Kim source repository as a special-case install target.
- **11-Phase User Visibility** - Governed run reports now keep the user-facing business phase focused on feedback/acceptance when runtime verification remains blocked, so users can see the next human action without losing blocker evidence.
- **Product Bundle Bootstrap** - Product delivery bundle generation now shares one run id and state directory between the governed run and deliverable generation, eliminating the missing-run failure in clean smoke tests.
- **First-Class Memory Discovery** - Canonical memory hooks are now represented as stable `memory` providers in the default capability inventory, so clean-state governed runs no longer depend on pre-existing local state files to prove memory capability coverage.
- **Source Repository Health Wording** - Runtime health checks distinguish source-repository self-checks from installed-user mirrors, avoiding misleading stale-mirror messages for empty generated folders.

### Verification

- `npm run meta:verify:all`
- `npm run meta:release:smoke`
- `npm run meta:prd:smooth-capability:validate`
- `npm run meta:prd:stage-runtime-control:validate`
- `node --test tests/meta-theory/11-eight-stage-spine.test.mjs`
- `node --test tests/meta-theory/32-meta-theory-four-product-targets.test.mjs`
- `node --test tests/meta-theory/43-product-delivery-bundle.test.mjs`
- `node --test tests/meta-theory/49-business-phase-visibility.test.mjs`
- isolated setup/hooks worker: `130 pass / 0 fail`
- runtime health worker: `meta:public-assets:validate`, `meta:check:runtimes`, hook sync tests, and stale projection simulation
- `git diff --check`

## [2.8.43] - 2026-06-19

### Solved Problem

This release addresses governed runs that could look complete in hidden hook context or generated artifacts while the user still lacked visible progress, native choice proof, or a real capability route. It also tightens setup/update cleanup so project-local residue from older installs can be removed without deleting user-owned files.

### Changed

- **Visible Governed Run Notices** - Added a host-visible notice contract and runtime guidance so Codex and Claude Code must render important run-start, route, blocker, and closure updates in normal assistant chat, while native choice surfaces stay reserved for branch-changing decisions.
- **Autonomous Capability Discovery** - Expanded route selection so natural-language durable work scans project/runtime/global skills, commands, MCP providers, hooks, scripts, and runtime tools before Thinking binds owners, instead of relying on users to name agents, skills, or protocol stages.
- **Native Choice Evidence Gate** - Strengthened subjective or route-changing work so Codex `request_user_input` and Claude `AskUserQuestion` evidence is tracked before execution, with structural reports no longer standing in for a real native choice.
- **Project Cleanup And Bootstrap Safety** - Added setup cleanup paths for redundant Meta_Kim project assets, managed-block handling for `AGENTS.md` / `CLAUDE.md`, Codex `.agents/skills` projection coverage, and regression tests that preserve unknown local skills and tracked files.
- **Global Hook And Memory Alignment** - Preserved HookPrompt ordering ahead of Meta_Kim spine hooks, added Codex global HookPrompt adapter sync, accepted healthy global Claude hooks in doctor checks, and taught MCP memory checks to find hooks under `hooks/meta-kim/`.

### Verification

- `npm run meta:verify:all`
- `npm run meta:release:smoke`
- `npm run meta:check`
- `npm run meta:doctor:governance`
- `npm run meta:check:global:release`
- `node --test tests/setup/claude-settings-merge.test.mjs tests/setup/lazy-project-bootstrap.test.mjs tests/setup/doctor-governance.test.mjs tests/setup/mcp-memory-hooks.test.mjs`
- `node scripts/validate-capability-routing.mjs`
- `git diff --check`

## [2.8.42] - 2026-06-18

### Solved Problem

This release addresses confusion between global reusable installs and project-local generated state. A global `meta-theory` install can now be verified end to end without copying the reusable Codex skill into every project, while project cache and Graphify outputs remain project-local.

### Changed

- **Codex Global Hook Registration** - Global sync now copies Meta_Kim hook scripts to `~/.codex/hooks/meta-kim/` and merges the prompt-entry spine hook into `~/.codex/hooks.json` with package-root evidence, preserving user hooks and replacing only Meta_Kim-managed entries.
- **Project Cache Verification** - Added `npm run meta:project-cache:verify`, including `--real-global`, to prove global hooks generate `.meta-kim/state/default/post-copy-init.json`, `graphify-out/graph.json`, and `graphify-out/GRAPH_REPORT.md` in the current project without copying `.agents/skills/meta-theory/`.
- **Install Scope Matrix** - Extended install scope verification so global/default, global all-formal, project default, and project all-formal cases prove their expected files and absence of unexpected writes.
- **Formal Projection Wording** - Updated README wording so OpenClaw and Cursor are non-default formal projections, not a compatibility layer, while candidate probes remain separate.

### Verification

- `node scripts/sync-global-meta-theory.mjs --check --targets claude,codex,cursor,openclaw --with-global-hooks`
- `npm run meta:project-cache:verify -- --real-global`
- `npm run meta:project-cache:verify`
- `npm run meta:install-scope:verify`
- `node --test tests/setup/sync-global-hooks-policy.test.mjs tests/setup/install-scope-matrix.test.mjs`
- `node scripts/validate-runtime-safety-contract.mjs`
- `git diff --check`

## [2.8.41] - 2026-06-16

### Solved Problem

This release addresses the gap between "Meta_Kim selected a capability" and "the host actually invoked it." Users can now see which Claude Code or Codex action is still required, which evidence counts, and why long-lived agents are not complete until the host reloads and invokes them.

### Changed

- **Host Invocation Request Contract** - Added `hostInvocationRequestPacket` so selected Agent, Skill, MCP, command/script, runtime-tool, and `agent-teams-playbook` families expose the exact Claude Code or Codex host action still required instead of hiding missing live calls behind partial reports.
- **Trusted Evidence Boundary** - Tightened governed execution so host requests, CLI/env claims, markdown reports, and app-visible badges remain non-proof until a trusted host adapter returns fresh evidence with accepted state, provider/surface, evidence kind, and evidence ref.
- **Durable Agent Lifecycle Proof** - Added `durableAgentLifecyclePacket` so long-lived agents must pass definition candidate, Warden approval/writeback, host reload/discovery, and live invocation proof before completion is claimed.
- **Runtime Adapter Guidance** - Updated Claude Code and Codex references to distinguish runner handoff, real host provider calls, and durable project agent discovery for future adapter implementations.
- **Product Evidence Propagation** - Extended run reports, product delivery bundles, validators, and support gates to carry host invocation requests and durable-agent lifecycle status.

### Verification

- `node --test tests/governance/core-loop-contract.test.mjs tests/meta-theory/32-meta-theory-four-product-targets.test.mjs tests/meta-theory/34-run-deliverables.test.mjs tests/meta-theory/43-product-delivery-bundle.test.mjs`
- `npm run meta:test:meta-theory`
- `npm run meta:check`
- `git diff --check`

## [2.8.40] - 2026-06-16

### Solved Problem

This release addresses the stale-project problem where global Meta_Kim could be updated, but an opened project still failed to discover the new governance entry path. Prompt-entry activation now explains why governance starts and probes project readiness before writing anything.

### Changed

- **Prompt-Entry Governance Activation** - Claude Code and Codex project prompt entries now run the meta-theory spine hook, so natural-language durable work and `critical/fetch/thinking/review` wording can trigger governance before execution instead of relying only on explicit skill activation.
- **Global Claude Project Readiness Detection** - Claude Code global hooks now install the prompt-entry bootstrap hook package with package-root evidence, allowing stale or unbootstrapped projects to receive a concise project readiness reason before any bootstrap write.
- **Project Bootstrap Safety Boundary** - Project bootstrap remains dry-run first and confirmation-gated; stale or equivalent projects surface `status`, active targets, reason, and the native choice requirement without silently applying project files.
- **Spine Deadlock Breaker** - Spine-state writes are now allowed even when Fetch is waiting for `fetchRecord`, preventing prompt-entry smoke runs from locking maintainers out of the state file needed to record Fetch evidence.
- **Global Capability Evidence Refresh** - Refreshed global capability discovery after installing the new hook package; the inventory now includes the Meta_Kim global prompt-entry hook alongside agents, skills, commands, MCP servers/tools, plugins, and runtime hooks.

### Verification

- `node --test tests/setup/graphify-wiring-contract.test.mjs tests/meta-theory/11-eight-stage-spine.test.mjs tests/setup/sync-runtimes-manifest.test.mjs tests/setup/sync-global-hooks-policy.test.mjs tests/meta-theory/47-meta-theory-entry-classifier.test.mjs tests/governance/capability-routing.test.mjs`
- `node --check canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs`
- `node --check canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`
- `npm run meta:sync`
- `npm run meta:sync:global -- --with-global-hooks`
- `npm run discover:global`
- Claude Code global `UserPromptSubmit` smoke in `D:/KimProject/游戏策划案`
- Codex project `UserPromptSubmit` smoke in `D:/KimProject/Meta_Kim`

## [2.8.39] - 2026-06-16

### Solved Problem

This release addresses the problem that card dealing existed in the contract but was not visibly or measurably triggered for users. Card decisions now have scores, evidence, counterfactual checks, and concise user-facing reasons.

### Changed

- **Card Dealing Accuracy Standard** - Upgraded `cardPlanPacket` to v0.2 so every card records a deal/suppress/defer/skip/interrupt/escalate decision with an 80-point standard, quantitative signals, evidence refs, and falsification checks.
- **User-Visible Card Trigger Reason** - Added a concise run-start and report line explaining why card dealing triggered, how many cards activated, and whether the minimum score passed.
- **Contract-Backed Card Proof** - Made `dealStandard` a required `cardPlanPacket` field, aligned generated card shells/sources/silence/control decisions with the workflow contract, and refreshed validator fixtures.
- **Deep Research-Style Card Review** - Bound each card decision to decision impact and counterfactual checks, so unused cards suppress with evidence instead of lingering as vague defers.
- **Global Discovery Readiness** - Synced the updated meta-theory skill into project and global runtime homes, then refreshed the global capability inventory for Claude Code, Codex, OpenClaw, and Cursor.

### Verification

- `node --test tests/meta-theory/14-card-deck-complete.test.mjs tests/meta-theory/34-run-deliverables.test.mjs tests/meta-theory/12-ten-step-workflow.test.mjs tests/meta-theory/07-contract-compliance.test.mjs`
- `node scripts/run-meta-theory-governed-execution.mjs --task "帮我做个小红书营销自动发布器" --run-id card-proof --emit-conversation-notice`
- `npm run meta:check`
- `npm run meta:test:meta-theory`
- `npm run discover:global`
- `npm run meta:sync:global`
- `npm run meta:check:global`
- `npm run meta:release:smoke`

## [2.8.38] - 2026-06-16

### Solved Problem

This release addresses the problem that the 11-phase business workflow could look complete just because all phase names appeared. Each phase now needs evidence, a score, and a trigger/skip/block/wait decision before coverage can pass.

### Changed

- **11-Phase Trigger Standard** - Upgraded `businessPhasePlanPacket` to v0.2 so every phase records a trigger/skip/block/wait decision, score, evidence refs, quantitative signals, and falsification checks instead of passing because eleven phase names were listed.
- **Business Workflow Coverage Truth** - Replaced the old phase-count-only coverage string with contract-aligned `complete` / `incomplete` judgment plus `coverageDetail`, so "recorded" and "accurately triggered" are no longer conflated.
- **Concise Start Reason** - Added a run-start user-facing explanation for why the 8-stage spine and 11-phase workflow triggered, kept short and evidence-backed rather than exposing internal packets.
- **Deep Research-Style Phase Proof** - Bound phase decisions to key signals, counterfactual checks, and decision evidence; accurate skips such as Revision and pending Feedback are now explicitly represented.
- **Report Visibility** - Added trigger state, trigger score, and start-reason visibility to the user-readable meta-theory report and CLI conversation notice.

### Verification

- `node --test tests/meta-theory/34-run-deliverables.test.mjs`
- `node --test tests/meta-theory/12-ten-step-workflow.test.mjs tests/meta-theory/09-run-artifact-validator.test.mjs`
- `npm run meta:check`
- `npm run meta:test:meta-theory`
- `npm run discover:global`
- `npm run meta:check:global`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.37] - 2026-06-16

### Solved Problem

This release addresses shallow Review, Meta-Review, and Evolution passes. Runs must now prove evidence quality, blind-spot checks, reusable-learning decisions, and public-ready boundaries instead of passing because packets merely exist.

### Changed

- **Deep Review Gates** - Upgraded prompt-first live acceptance so Review must prove evidence quality, counterevidence, decision impact, falsification checks, and upstream stage trace instead of passing on packet presence alone.
- **Meta-Review Depth Audit** - Added a mechanical depth audit that rejects shallow packet-only Review, checks adversarial coverage and blind spots, and keeps public-ready evidence separate from live/runtime proof.
- **Evolution Strategy Evidence** - Required Evolution to show reusable-pattern, writeback-target, scar-need, and next-run reuse-key assessment before a `none-with-reason` writeback decision can pass.
- **Strict Live Acceptance Regression** - Added regression coverage so missing or shallow Review / Meta-Review / Evolution packets fail strict live normalization rather than being filled by fallback data.

### Verification

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

### Solved Problem

This release addresses the tendency to create or route to new execution agents before checking existing professional capabilities. Meta_Kim now searches global and project providers first, treats worker tasks as run-scoped work orders, and refreshes local capability inventory after installs or updates.

### Changed

- **Professional Provider-First Routing** - Made governed routes prefer existing global/project professional providers before creating or upgrading execution agents, with explicit coverage for agents, skills, commands, MCP providers/tools, runtime tools, hooks, plugins, memory/graph providers, and dependency providers.
- **WorkerTask Identity Boundary** - Clarified and validated that `workerTaskPacket` is a run-scoped work order for a selected owner/loadout, not a temporary small agent, subagent definition, or durable provider identity.
- **Automatic Global Capability Refresh** - Updated setup/update and global dependency install/update flows to refresh the local global capability inventory automatically after runtime homes change, while keeping machine-specific inventory out of GitHub source.
- **Capability Gap Evidence** - Added `fetch.global_professional_providers_checked` evidence and regression coverage so `create_agent` decisions must prove existing professional providers were checked first.
- **Setup Regression Coverage** - Added release tests for automatic global inventory refresh and fixed the project-deploy protected JSON merge test to match the current planning/write split.

### Verification

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

### Solved Problem

This release addresses deep research that collected sources without turning them into better decisions. Fetch now targets key information, iterates queries and reads, records stop conditions, and blocks weak or unverified claims from shaping Thinking.

### Changed

- **Decision-Grade Deep Research** - Upgraded Fetch evidence from source collection to key-information targeting, iterative query/read/update logs, explicit stop conditions, and decision-update rules before Thinking.
- **Claim Evidence Cards** - Added `claimEvidenceCards` and stricter run-artifact validation so route-changing claims must cite resolvable evidence refs, counterevidence, confidence, falsification status, and decision impact.
- **Research Execution Proof** - Extended live research execution packets with query iteration counts, evidence-gap closure, confidence-before/after updates, and falsification attempts, keeping blocked evidence out of Thinking.
- **Canonical Governance Alignment** - Updated Scout, Conductor, Prism, and the meta-theory dispatcher so deep research quality is enforced by role responsibilities, generated packets, validators, fixtures, and regression tests rather than prompt wording alone.

### Verification

- `node scripts/run-node-tests.mjs "tests/meta-theory/02-clarity-gate.test.mjs" "tests/meta-theory/37-research-preparation-layer.test.mjs" "tests/meta-theory/44-research-execution-and-innovation.test.mjs" "tests/meta-theory/09-run-artifact-validator.test.mjs"`
- `npm run meta:check`
- `npm run meta:release:smoke`
- `node scripts/run-node-tests.mjs "tests/meta-theory/09-run-artifact-validator.test.mjs"`
- `git diff --check`

## [2.8.34] - 2026-06-16

### Solved Problem

This release addresses install/update confusion between global reusable capabilities, project projections, and open-source package contents. Defaults, platform tiers, and package boundaries now make clear what is installed, what is generated locally, and what is only a compatibility probe.

### Changed

- **Install Scope Boundary** - Restored the default install/update model to "global reusable capabilities + current project projection", now explicitly target-selected: the Enter default projects Claude Code + Codex, while Cursor and OpenClaw project files appear only when those formal projection compatibility targets are selected.
- **Open-Source Runtime Projection Boundary** - Added a release validator that keeps generated runtime projection directories such as `.codex/`, `.agents/`, `.claude/`, `.cursor/`, and `openclaw/` out of GitHub source and package files, while documenting that Codex adapter/business-role TOML files are local host projections rather than governance agents.
- **Platform Compatibility Tiers** - Made the install contract and verification output distinguish formal projections, dependency-owned targets, and candidate probes, while public docs avoid repeating upstream dependency install matrices as Meta_Kim support claims.
- **Public Platform Wording** - Updated README badges, platform tables, and cross-platform mapping copy so default formal projections, explicit formal compatibility projections, and candidate compatibility probes are visible separately; refreshed Qoder official doc links and added Cline's official Skills primitive to the catalog.
- **Project Governance UX** - Updated the PRD, setup, and README copy so global skills are reusable discovery entrypoints, project governance requires dry-run bootstrap confirmation, and `AGENTS.md` is described as platform-specific context rather than a universal Codex/Cursor/OpenClaw entrypoint.
- **Install Scope Verification** - Added `npm run meta:install-scope:verify` to exercise temp global homes and temp project bootstraps, then report global-layer and project-layer surfaces by platform.

## [2.8.33] - 2026-06-15

### Solved Problem

This release addresses the burden of manually keeping global Meta_Kim and each project-level runtime projection in sync. Project bootstrap now dry-runs, shows the source chain, preserves user files, and only applies project writes after confirmation.

### Added

- **Global-First Project Bootstrap** - Added `meta-kim project bootstrap` and `npm run meta:project:bootstrap` so a global Meta_Kim install can dry-run and apply project-level Claude Code / Codex projections without asking users to manually maintain both global and project state.
- **First-Trigger Bootstrap Probe** - Extended the meta-theory activation hook to run a dry-run project bootstrap probe on first meta-theory activation and save source-chain evidence without silently applying project files.
- **Lazy Bootstrap Acceptance Tests** - Added fixture coverage for empty projects, existing user config, stale manifests, read-only failures, managed-block replacement, protected JSON merge, backup manifests, and `.codex/config.toml` never-touch behavior.

### Changed

- **Project Source Chain Evidence** - Project bootstrap plans now expose the installed package root, canonical roots, `config/sync.json`, generated runtime mirrors, target project, file actions, merge policies, and skipped files before any write.
- **Runtime Choice Surfaces** - Updated Claude Code and Codex choice-surface contracts to preserve structured decision-panel semantics while using the active host schema's maximum meaningful option count instead of a Meta_Kim hard cap.
- **Capability Routing** - Moved capability discovery to canonical/index-first routing and prevented Codex and Claude Code routes from binding the other runtime's project agent adapters as callable execution owners.

### Verification

- `npm run meta:check`
- `npm run meta:test:setup`
- `npm run meta:test:governance`
- `npm run meta:runtime:safety:validate`
- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.32] - 2026-06-15

### Solved Problem

This release addresses Codex governed work silently collapsing into a single main-thread executor. Complex work now becomes fan-out eligible when safe, while unavailable host dispatch and selected-but-not-invoked providers stay visible as partial evidence.

### Changed

- **Codex Meta-Theory Fan-Out** - Made explicit `/meta-theory` and complex governed work fan-out eligible when there are multiple safe worker lanes, so Codex should plan real parallel work instead of silently falling back to one main-thread executor.
- **Runtime Capacity Sizing** - Replaced the stale fixed five-agent wave cap with runtime capacity detection from Codex config and the official default, while still proving DAG dependencies, collision boundaries, workspace isolation, and external-write safety before fan-out.
- **Invocation Truth Evidence** - Tightened run evidence so live subagents are reported as `invoked` only with host spawn evidence; unavailable host dispatch is reported as `unavailable`, single-lane work as `not_required`, and provider selection can no longer masquerade as execution.

### Verification

- `npm run meta:release:smoke`
- `git diff --check`

## [2.8.31] - 2026-06-14

### Solved Problem

This release addresses the missing bridge between dynamic workflow planning and real parallel execution. Meta_Kim now selects the agent-teams playbook only when multiple safe executable lanes exist and keeps provider selection, subagent calls, MCP calls, skills, commands, hooks, and local workers distinct.

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

### Solved Problem

This release addresses overbroad runtime support claims and research that was too easy to accept at face value. The release separates primary install defaults from compatibility probes, and turns deep research into a Fetch contract with source-quality and synthesis rules.

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

### Solved Problem

This release addresses branch-changing decisions being faked by chat text or artifact fallbacks. Codex and Claude Code must use their native choice surfaces for required decisions, and governed runs expose progress without leaking packet jargon.

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

### Solved Problem

This release addresses the risk that default governed execution looked complete while evidence layers were mixed together. Product validators now check core goals, default execution evidence, research-to-native adoption, runtime priority, and capability discovery without overclaiming live proof.

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

### Solved Problem

This release addresses planning that could name many lanes without proving which owners, dependencies, and verifications were actually ready. The orchestration contract now requires a usable board, explicit dependency policy, and reviewable handoff before execution.

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

### Solved Problem

This release addresses drift between local/private PRD status, public-facing docs, and current implementation evidence. Remaining product work is now tracked through clearer dossiers, validators, and public-safe status language.

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

### Solved Problem

This release addresses repeated confusion over which product goals were complete, partial, or blocked. The product-experience checklist now ties completion claims to concrete evidence instead of broad status language.

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

### Solved Problem

This release addresses release-readiness misses in host config, hook protocol, deletion residue, and evidence reporting. The checklist and PR template now force maintainers to state source of truth, host-state impact, cleanup scope, and evidence budget before merge.

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

### Solved Problem

This release addresses stale graph and package-boundary assumptions before release. The release path now keeps Graphify and open-source package boundaries visible as explicit checks.

### Changed

- **Run-Scoped Worker Execution** - `meta:theory:run` now executes bounded worker task packets through a local run-scoped worker executor instead of stopping at structural dispatch readiness. The main thread still scopes, delegates, reviews, and synthesizes; no extra external agent is spawned.

### Verification

- Adds governance coverage that requires worker execution evidence while preserving the public-ready release gate.

## [2.8.22] - 2026-06-12

### Solved Problem

This release addresses runtime projection drift that could make generated files diverge from canonical Meta_Kim behavior. Sync coverage and runtime checks now make projection gaps easier to catch before release.

### Changed

- **Core Loop Release Evidence Closure** - Completed the PDR release checklist and final release evidence for the governed execution repair so the shipped tag includes commit, tag, push, and GitHub Release proof.

### Verification

- Reused the `2.8.21` core-loop implementation evidence and reran the local release checks for the final `2.8.22` patch release.

## [2.8.21] - 2026-06-12

### Solved Problem

This release addresses weak capability-gap decisions that jumped from "we need something" to "create an agent." Capability gaps now compare skills, scripts, MCP providers, runtime tools, and existing agents before durable creation is allowed.

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

### Solved Problem

This release addresses the risk that Meta_Kim could report governance progress without proving the user-facing deliverable chain was closed. Run reports and product bundles now carry clearer completion, warning, and remaining-action evidence.

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

### Solved Problem

This release addresses unclear release closure when GitHub completion, runtime compatibility, and local verification were mixed into one "done" claim. Completion and compatibility evidence now stay separated so each blocker has an owner and next action.

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

### Solved Problem

This release addresses brittle live/runtime evidence where timeout, skipped, and partial results could be confused with release-grade success. Runtime probes now classify evidence more strictly and preserve recovery paths.

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

### Solved Problem

This release addresses generated report and product-surface clutter that made governed runs harder to inspect. Reports were consolidated around the evidence users need for decisions, review, and follow-up.

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

### Solved Problem

This release addresses copied-project installs where generated files existed but the target project was not actually initialized. The post-copy flow now initializes Graphify in the final project root and avoids treating temporary export folders as real projects.

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

### Solved Problem

This release addresses copy-ready project setup failing after users move generated files into a real project. The bootstrap script now runs from the copied destination and keeps Graphify setup tied to the final project directory.

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

### Solved Problem

This release addresses install/update output that looked like failures or English-only internals instead of actionable user status. Notices are localized, expected manual host-plugin steps are labeled honestly, and HookPrompt output no longer breaks Markdown rendering.

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

### Solved Problem

This release addresses ECC installs overwriting Codex App user configuration and breaking native controls. Meta_Kim now preserves the user config as the base, merges ECC additions add-only, and restores Browser, Chrome, and Computer Use plugin settings.

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

### Solved Problem

This release addresses HookPrompt appearing to run in Codex while the optimized prompt did not reliably reach model context. Codex now uses the model-visible `additionalContext` envelope, while UI notices remain separate.

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

### Solved Problem

This release addresses global hooks becoming too heavy or too runtime-specific. Meta_Kim now separates safe global reusable hooks from stronger project-scoped governance hooks and validates HookPrompt provider mapping by runtime.

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

### Solved Problem

This release addresses natural-language durable work being forced through fixed checklists or requiring users to know protocol words. Meta_Kim now derives task-specific lanes, checks local baseline evidence, and shows human-readable progress.

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

### Solved Problem

This release addresses reports and platform claims that were technically correct but hard for users to interpret. Tool support levels, durable-agent boundaries, and runtime target sources are now described in plainer terms.

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

### Solved Problem

This release addresses capability discovery that was too narrow and too tool-name driven. Fetch now records project/global inventories across supported projections before Thinking chooses owners or loadouts.

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

### Solved Problem

This release addresses capability-gap handling as a loose script task instead of a complete product workflow. Gaps now have decision contracts, replay evidence, user-facing deliverables, runtime evidence hardening, and report hygiene.

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

### Solved Problem

This release addresses release checks being either too slow for small wording changes or too weak for runtime/security work. Release modes now distinguish fast routine checks from stricter release-grade evidence.

### Added

- **Release modes** - Low-risk prompt, documentation, and governance wording changes now use a fast release path. Install, runtime, hook, provider, dependency, package, security, and live-evidence work still require the stricter release-grade path.
- **Execution-demand proof** - Release-grade work must prove the Fetch -> Thinking route selects owner, agent provider, skill provider, MCP provider, command/runtime tool, and verification path before mutation or release.
- **Live evidence classification** - Structural smoke, warnings, skipped/needs-auth states, and true runtime live passes are now separated.

## [2.8.4] - 2026-06-02

### Solved Problem

This release addresses execution routes that could proceed without proving owner, provider, tool, and verification readiness. Capability smoke and OpenClaw live sharding now make real route readiness testable.

### Added

- **Capability discovery smoke** - Added a smoke command that proves a real execution demand can naturally select owner, provider, tool, and verification path.
- **OpenClaw live sharding** - Long Claude/OpenClaw live checks can be split by agent for recovery and diagnosis.

### Fixed

- **Execution routing** - Engineering execution routes now bind real owner/provider/verification evidence before Execution.
- **OpenClaw live evaluation** - OpenClaw checks inherit the configured provider/model surface and recover better from nested JSON and session output.
- **OpenClaw auth hydration** - Local OpenClaw auth can reuse an existing usable meta-agent auth source without overwriting working files.

## [2.8.3] - 2026-06-02

### Solved Problem

This release addresses provider discovery being scattered across tools, hooks, skills, plugins, MCP, memory, and graph surfaces. The provider registry gives those surfaces a shared lifecycle and validation model.

### Added

- **Capability Provider Contract** - Added a provider registry and lifecycle model for runtime-native tools, skills, agents, hooks, commands, rules, plugins, MCP servers, dependency projects, memory, and graph providers.
- **Provider validator** - Added validation for provider/runtime/OS/install-layer gaps, including strict global Codex hook checks.

### Fixed

- **Codex HookPrompt chain** - The global Codex prompt hook now preserves existing planning hooks while ensuring HookPrompt output reaches model context.
- **Plugin visibility** - Plugin and plugin-bundle providers are represented in the capability index and provider registry.

## [2.8.2] - 2026-06-02

### Solved Problem

This release addresses runtime support claims that were hard to compare or too easy to overstate. Compatibility data now records sync behavior, native-surface claims, package targets, and candidate probes separately.

### Changed

- **Runtime compatibility catalog** - Runtime support data was normalized into a catalog with sync behavior, native surface claims, and package targets.
- **Candidate runtime handling** - Non-primary tools such as opencode, Qwen, Zed, Gemini, CodeBuddy, Antigravity, JoyCode, and Qoder are tracked honestly as install targets or candidate probes rather than overstated full projections.

## [2.8.1] - 2026-06-02

### Solved Problem

This release addresses public docs that did not clearly separate supported, compatible, and candidate runtime states. README and runtime-facing docs now make those states easier to explain and verify.

### Changed

- **Public runtime support wording** - README and runtime-facing docs were aligned so supported, compatible, and candidate states are easier to distinguish.
- **Projection sync clarity** - Project-local and global sync behavior became easier to explain and verify.

## [2.8.0] - 2026-06-01

### Solved Problem

This release addresses tool-name routing that could ignore provider readiness, runtime support, OS support, dependencies, and verification ownership. Meta_Kim shifted toward provider-first governance with release evidence built into the normal flow.

### Added

- **Provider-first governance** - Meta_Kim shifted from tool-name routing toward provider and capability routing.
- **Runtime and OS evidence gates** - Execution routes now check runtime support, OS support, dependency state, owner, weapon, and verification path before acting.
- **Install and release evidence** - Setup, sync, runtime, provider, and release checks became part of the normal release story.

## [2.7.0] - 2026-06-01

### Solved Problem

This release addresses governed work starting from agent names instead of capability needs. Capability-first routing, owner/loadout evidence, and runtime alignment became the default shape for execution.

### Added

- **Capability route governance** - Introduced capability-first execution routing, owner/loadout evidence, and provider discovery as the default shape for governed work.
- **Runtime alignment** - Claude Code, Codex, OpenClaw, and Cursor projections were aligned around canonical source data while preserving honest runtime limitations.

## [2.6.x] - 2026-05-29 to 2026-05-30

### Solved Problem

This release band addresses governance outputs that were difficult to audit after the run. Reports, status envelopes, research preparation, capability inventory, and global discovery became more visible and source-backed.

### Added

- **Governed execution reports** - Added richer run reports, status envelopes, and public-facing evidence surfaces.
- **Research and capability preparation** - Added source-backed research preparation, retrieval capability discovery, and multi-type capability inventory.
- **Global capability discovery** - Added broader scans for installed agents, skills, hooks, commands, MCP config, plugins, and runtime mirrors.

## [2.5.x] - 2026-05-28

### Solved Problem

This release band addresses decisions that lacked shared gates for runtime, OS, dependency, weapon, trigger, intent, and choice-surface evidence. The decision engine and architecture docs made those checks explicit.

### Added

- **Governance decision engine** - Added runtime capability, OS compatibility, dependency capability, weapon routing, trigger-action policy, intent amplification, choice surfaces, dynamic lens selection, and decision-pattern contracts.
- **User-facing architecture docs** - Expanded documentation around runtime capability, dependency discovery, owner/weapon routing, and choice surfaces.

## [2.4.x] - 2026-05-27 to 2026-05-28

### Solved Problem

This release band addresses research and integration work influencing route design without enough retrieval or contract evidence. Research capability evidence, integration packets, unknown-field handling, and run-status output were added.

### Added

- **Research route hardening** - Research work now requires retrieval capability evidence before it can influence route design.
- **Interface integration contracts** - Third-party and internal API integration work gained explicit contract packets, unknown-field handling, evidence refs, and review gates.
- **Run status surface** - Added localized run-status output for public governance state.

## [2.3.x] - 2026-05-26

### Solved Problem

This release band addresses workers claiming tests, command success, or silent success without structured proof. Execution evidence and validation schema structure were tightened.

### Added

- **Evidence integrity contracts** - Worker claims about tests and command success now need structured execution evidence.
- **Silent-success handling** - Commands that succeed without output are represented by exit-code evidence rather than fabricated placeholder text.
- **Validation contract structure** - Validation rules were moved toward reusable schemas and runners.

## [2.2.x] - 2026-05-25

### Solved Problem

This release band addresses governance vocabulary and agent creation being too loose for durable execution. Workflow packets, naming policy, dispatch evidence, agent factory rules, and sub-agent boundaries were made explicit.

### Added

- **Workflow contract expansion** - Added packet vocabulary, naming policy, dimension definitions, dispatch evidence, and business-flow tests.
- **Agent factory governance** - Project-local execution agent creation now requires capability gap evidence, governance participation, and review before durable files are written.
- **Sub-agent boundary rules** - Meta agents govern, review, and route; they do not become generic implementation workers.

### Fixed

- **Worker write-completion honesty** - Workers with declared file scope must report each promised file as completed, skipped, or failed.
- **Historical release-note accuracy** - Earlier low-level release-note mistakes were corrected, then folded into this reader-facing format.

## [2.1.x] - 2026-05-23 to 2026-05-24

### Solved Problem

This release band addresses ambiguous work entering orchestration before the user choice and public-ready boundary were clear. Critical, Fetch, verification, summary closure, and deliverable-chain gates became more explicit.

### Added

- **Choice and confirmation flow** - Critical and Fetch gained clearer gates for ambiguity, candidate paths, and user confirmation before detailed orchestration.
- **Public-ready gates** - Verification, summary closure, and deliverable-chain closure became explicit requirements before claiming completion.

## [2.0.x] - 2026-04-11 to 2026-05-23

### Solved Problem

This release band addresses the need for a reusable cross-runtime governance architecture rather than scattered prompts and one-off runtime files. Meta_Kim 2.x established the core spine, projections, memory, Graphify, setup/update, packaging, and governance-agent foundation.

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
