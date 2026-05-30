---
name: meta-theory
version: 3.0.0
author: KimYx0207
user-invocable: true
trigger: "元理论|执行元理论|跑元理论|meta theory|run meta theory|execute meta theory|meta-theory|agent governance|intent amplification|governance|治理|重构|多文件|跨模块|debug|fix|验证|verification"
tools:
  - shell
  - filesystem
  - browser
  - memory
description: |
  Meta_Kim executable governance dispatcher. It classifies the run, loads only needed references, preserves foundational capabilities and runtime-native abilities, routes owner + weapon + dependency + runtime + OS + verification, and closes only with evidence, intent acceptance, and writeback decision.
---

# Meta-Theory Dispatcher

## Purpose

Run Meta_Kim as an executable governance system, not a theory essay. The main thread locks intent, gathers evidence, chooses route, delegates bounded work, reviews, verifies, and synthesizes. It must not become a generic implementation worker for non-trivial work.

## Trigger

Activate when the user calls `/meta-theory`, names meta-theory, asks for governance, multi-file execution, agent design, capability discovery, runtime/platform compatibility, public-ready validation, complex debugging, or durable evolution writeback.

## Path classification

- `fast_path`: read-only query, no mutation, no durable artifact. Output may be direct, but evidence claims still need source.
- `standard_path`: ordinary executable work. Use the 8-stage spine and capability-first route.
- `regulated_path`: governance, security, runtime, dependency, release, public-ready, or cross-platform work. Require full spine, Review, Meta-Review, Verification, and Evolution.

## Canonical spine

Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution.

You are the DISPATCHER, not the executor. Use Agent tool / `Agent(...)` dispatch only after Fetch evidence and Thinking owner resolution prove the route.

Fetch-first capability matching principle: Fetch gathers evidence, then Thinking performs capability match, never hardcoded agent-name matching. Gate 1: Clarity Check blocks unclear intent before Fetch. Gate 2: Dispatch-Not-Execute blocks self-execution and requires a named owner, weapon, and verification owner.

## Architecture Type Pre-judgment

Important: Architecture Type Distinction. Meta Architecture means agent governance, collaboration relationships, and responsibility boundaries. Project Technical Architecture means code organization, tech stack, and design patterns; redirect that lane to an architect or backend-architect capability when the needed owner is technical implementation rather than Meta_Kim governance.

## Dynamic Flow Selection

- Type A: prompt/reference/contract hardening.
- Type B: agent/skill/owner creation or upgrade.
- Type C: external capability, tool, MCP, dependency, or web evidence discovery.
- Type D: review, verification, rollback, public-ready, or warning closure.
- Type E: orchestration, planning files, business-flow, and cross-runtime release.

## Stage map

| # | Stage | Action |
|---|---|---|
| 1 | Critical | clarify intent first, lock user pain, value, success criteria, non-goals, permissions, and Architecture Type |
| 2 | Fetch | gather online/web and local evidence, confirm the problem, extract material claims, and list candidate solutions with sources |
| 3 | Thinking | determine needed execution capabilities across agents, skills, commands, MCP capabilities, and tools; match existing capabilities; create or upgrade only for gaps; plan DAG/parallel/serial lanes with `mergeOwner` |
| 4 | Execution | run multi-agent work using skills, commands, MCP capabilities, and tools from Thinking artifacts |
| 5 | Review | meta-prism checks upstream Critical, Fetch, Thinking, and result quality |
| 6 | Meta-Review | meta-warden verifies Review standard and public-ready gate |
| 7 | Verification | run real tests with fresh evidence and `verificationPacket.fixEvidence` |
| 8 | Evolution | after Warden approval, directly edit the target agent definition or SOUL.md for meta-agent lessons; execution-agent gaps use `capabilityGapPacket` + Type B pipeline |

## Type A: Prompt / Reference / Contract Hardening

Dispatch to `meta-prism` for prompt executability review and `meta-warden` for final gate. The main thread is not the executor. Use Agent tool dispatch when the task has more than a direct query or >3 sentences of change. Output: reviewed contract diff, `workerResultPackets[].fileCompletionList`, workerExecutionEvidence, and verification evidence.

## Type B: Agent / Skill / Owner Creation Or Upgrade

Dispatch to `meta-genesis` for identity/prompt architecture, `meta-artisan` for capability loadout, then `meta-prism` and `meta-warden` for review. Optional: `meta-sentinel`, `meta-librarian`, `meta-conductor`. Existing owner wins; owner upgrade or project-local creation is allowed only when Fetch proves a gap. Execution-agent evolution uses this Type B pipeline, not direct edit.

## Type C: External Capability / Tool / Dependency Discovery

Fetch scans local capability index, runtime mirrors, local runtime inventory, MCP, package scripts, installed skills, global capabilities, `findskill`, external capability discovery, specialist ecosystem search such as everything-claude-code, and `meta-scout` external evidence. Optional owners: `meta-prism`, `meta-sentinel`, `meta-scout`. Use Agent tool dispatch only after Thinking binds an owner; the DISPATCHER does not execute discovery side effects. If no callable owner exists, return to Thinking with `capabilityGapPacket`; do not use temporary fallback.

## Type D: Review / Verification / Rollback / Public-Ready

Dispatch to `meta-prism` and `meta-warden`; optional `meta-scout`, `meta-sentinel`, `meta-chrysalis`. Stage 4 owner prohibition: never dispatch Type: general-purpose, runtime alias, or governance agent as implementation worker. Public-ready requires verification evidence, userGoalDone, warning classification, and Warden gate.

## Type E: Orchestration / Business Flow / Release

Dispatch to `meta-conductor` for business-flow blueprint and parallel lane orchestration, then `meta-warden` for synthesis. Thinking to Execution may use `agent-teams-playbook` only when there are 2+ independent parallel worker lanes / two or more parallel worker lane candidates. Independent sub-tasks must be parallelized when safe; avoid fake parallelism.

## Dispatch Self-Check

Before Stage 4, record Protocol-first Dispatch: `runHeader`, `dispatchBoard`, `businessFlowBlueprintPacket`, `agentBlueprintPacket`, and `workerTaskPackets`. Stage 4 may not start before protocol artifacts are ready. `agentInvocationState`: `idle -> discovered -> matched -> dispatched -> returned/escalated`. `workerTaskPackets` must include `dependsOn`, `parallelGroup`, and `mergeOwner`. Option Exploration is MANDATORY in Stage 3: compare ≥2 solution paths with Pros / Cons or Decision Record and rejected alternatives. Apply Skip-Level Self-Reflection Gate and Escalation Signals before dispatch.

## Fetch Evidence Inventory

Research -> Inventory -> Thinking Handoff. Thinking determines needed execution capabilities, then match existing capabilities, then create or upgrade only for gaps. Fetch material claims include version, price, third-party, platform, and tool assertions. If current facts matter, set `contentEvidencePacket.researchRequired = true`, run `researchCapabilityDiscovery`, and prefer `web_search`, `url_fetch`, `docs_lookup`, or `browser_open`. If research is blocked, return `blocked` with `user_fallback` rather than guessing. Run Command discovery by package.json script scan and npm run inventory. Apply DRY conflict detection: overlap detect, duplicate reject, and keep one owner per capability. Skill selection ROI = (Task Coverage x Usage Frequency) / (Context Cost + Learning Curve).

## Warden Entry Gate

`/meta-theory` enters through `meta-warden` entry gate, then `meta-conductor` owns the evidence lane and sequencing, `meta-scout` owns external evidence, and `meta-prism` audits Critical, Fetch, and Thinking quality before output polish. All meta agents are dispatch targets: `meta-warden`, `meta-conductor`, `meta-scout`, `meta-artisan`, `meta-genesis`, `meta-sentinel`, `meta-librarian`, `meta-prism`, `meta-chrysalis`.

## Product Reasoning Contract

Translate the surface request into the real product problem. Compare minimal fix against ten-x path challenge and path shift. Final user-facing closure states chosen rationale, why changed / why change, what changed, where changed, user impact, and verification.

## Human-Readable Stage Feedback

Stage updates must be compact, human, and in the resolved user language. Record internally with packet field name / internal keys and debug traces, but show human label and human-readable label in user-facing output. Mention Critical, Fetch, Thinking, Review only when the stage status matters. Keep token use low and avoid dumping raw packet fields unless the user asks for debug.

Public status surface uses `runStatusEnvelope`, `publicLabels`, `.meta-kim/state/{profile}/active-run.json`, and `.meta-kim/state/{profile}/runs/{runId}/status.json`. Apply runtime/tool selected output language first, then latest input language. Do not hardcode labels. The public notice must not expose internal protocol fields such as `Preflight` or `conversation_fallback` unless debug is requested.

## Business-flow capability matrix

Fetch expands executable deliverables into a Business-flow capability matrix covering product, UX, UI, frontend, backend, database, motion, accessibility, browser QA, performance, feedback, and evolution lanes. Thinking selects owners, dependencies, and merge owner per lane.

## Evolution target map

| Gap type | Evolution target |
|---|---|
| prompt gap | canonical skill or reference contract |
| agent boundary gap | target agent definition / SOUL.md |
| capability gap | `capabilityGapPacket` then Type B owner upgrade |
| dependency gap | dependency registry and compatibility validator |
| runtime/OS gap | runtime matrix or OS matrix |
| warning/hook scar | validator, hook policy, regression test |

## Stage packet table

| Stage | Required packet | Pass condition |
|---|---|---|
| Critical | `intentPacket`, `taskClassification` | outcome, success criteria, non-goals, permissions, blocking unknowns recorded |
| Fetch | `fetchPacket`, `foundationalCapabilityPreservationPacket`, `dependencyCapabilityAuditPacket` | evidence changes route/risk/owner/verification or records no-impact |
| Thinking | `dispatchBoard`, `workerTaskPackets`, `routeScoreBreakdown` | selected route has owner + weapon + dependency policy + runtime + OS + verification owner |
| Execution | `workerResultPackets`, `workerExecutionEvidence` | bounded tasks produce declared artifacts and evidence |
| Review | `reviewPacket.findings` | upstream Critical/Fetch/Thinking and output quality are reproducibly checked |
| Meta-Review | review-standard checks on `reviewPacket` | Review catches native/foundational/dependency/intent/public-ready/evolution risks |
| Verification | `verificationPacket`, `verificationEvidence` | fresh commands/logs/artifacts/human acceptance bind claims |
| Evolution | `evolutionWritebackPacket`, `scarPacket` | writeback or `none-with-reason` with next-run reuse key |

## Required Fetch config

Before Execution, inspect the relevant local source of truth:

- `config/runtime-capability-matrix.json` for Claude Code, Codex, Cursor, OpenClaw support.
- `config/os-compatibility-matrix.json` for macOS, Windows, Linux, WSL2 support.
- `config/capability-index/weapon-registry.json` for weapons.
- `config/capability-index/dependency-project-registry.json` and `.meta-kim/state/default/dependency-capability-index.json` for dependencies.
- `config/skills.json`, runtime projections, MCP configs, hooks, package scripts, Graphify, Memory, and repository search for foundational capabilities.

## Native ability preservation

Governance may add trigger, evidence, trust review, approval, sandbox, fallback, verification, and risk boundaries. It must not delete, downgrade, or replace runtime-native abilities for Claude Code, Codex, Cursor, or OpenClaw. Unknown or partial native abilities stay `unknown` or `partial` until verified; they are not removed.

## Foundational capability preservation

Do not delete or hide existing Skills, WebSearch, web search, browser, online research, fetch, filesystem, shell, command, apply_patch, edit, MCP, memory, Graphify, graph, hooks, scripts, validators, commands, rules, agents, subagents, approval, sandbox, permission mode, runtime tools, setup, uninstall, status, doctor, sync, install, or verification capability. If a capability is risky or unavailable, mark `needs_probe`, `unknown`, `partial`, `requires_approval`, `requires_trust_review`, `reference_only`, or `not_for_execution_route`.

## Dependency compatibility

Dependencies are retained and routed by state, not deleted by score.

- score `<50`: `blocked_for_execution`, evidence/reference only, generate upgrade/probe suggestion.
- score `50-69`: `needs_upgrade_or_probe`, no automatic execution.
- score `70-84`: `confirm_or_fetch_more`, requires user confirmation or more evidence.
- score `>=85`: eligible only with invocation path, verification method, owner, weapon, runtime support, OS support, and verification owner.

`Kim_Decision` is a decision protocol candidate, not a code executor. Discover it through `META_KIM_DEP_ROOTS`, sibling repo scan, installed skill paths, registry, or external reference. Never hardcode a personal path. Valid states: `local_inspected_protocol`, `installed_skill_candidate`, `external_reference`, `internalized_pattern`, `blocked`, `not_for_code_execution`, `eligible_for_decision_route`, `needs_probe`.

## Execution gate

Execution may start only when all are true:

- `realIntent`, success criteria, non-goals, and blocking unknowns are recorded.
- Fetch evidence and capability discovery are complete enough for the chosen path.
- Route score is `>=85`, or a branch-changing user choice accepts a `70-84` route.
- Owner is not `general-purpose`, not a runtime alias, and not a governance agent acting as implementation worker.
- Weapon is callable and compatible with target runtime and OS.
- Dependency is not `reference_only`, not `external_reference`, not missing invocation path, and not missing verification method when used for execution.
- Verification owner, verification method, rollback/risk boundary, and expected evidence are known.

## Review gate

Review must check upstream chain before output polish:

- Critical locked the right user outcome and success criteria.
- Fetch evidence changed or justified the route.
- Thinking selected owner + weapon + dependency + runtime + OS + verification.
- Execution evidence is reproducible.
- No foundational capability or runtime-native ability was deleted or downgraded.
- No reference-only dependency entered execution.

## Verification gate

Do not claim verified unless a command, log, artifact, or human acceptance record supports the claim. Command pass is not `userGoalDone`. Template validation is not strict run validation.

## Evolution gate

Every run ends with `writebackDecision = writeback` or `none-with-reason`. Durable failures require a scar with `failurePattern`, `preventionRule`, `test`, and `nextRunReuseKey`. Evolution writeback needs Warden approval; Chrysalis coordinates; target owners update their own sources.

## Reference loading

Load only references needed for the run:

- `path-selection.md`: route scoring and path bands.
- `owner-resolution.md`: owner + weapon + dependency route.
- `runtime-codex.md`: Codex-specific sandbox, approval, subagent, hook, and choice behavior.
- `verification-evidence.md`: verified claim and public-ready evidence.
- `intent-amplification.md`: real intent, first action, pass/kill, userGoalDone.
- `evolution-writeback.md`: writeback, scars, reuse keys.
- `rhythm-orchestration.md`: choice/card timing.
- `planning-files.md`: `task_plan.md`, `findings.md`, `progress.md`.
- `create-agent.md`: new/changed owner design.
- `spine-state.md`: stage state and packet transitions.
- `dev-governance.md`: full-flow compact index.
- `ten-step-governance.md`: business workflow compatibility.
- `meta-theory.md`: background only; do not load as execution contract unless theory terms are disputed.

## User-facing compact output rule

Use the user's language. For Chinese input, output Chinese stage summaries. Each visible stage summary should be at most three bullets unless final reporting requires more.

## No fake owner

Reject `general-purpose`, temporary fallback, runtime nickname, missing owner, or governance agent as implementation worker. Return to Thinking with a `capabilityGapPacket`.

## No general-purpose fallback

Compatibility fallback may preserve runtime usability. Governance fallback may not hide missing intent, owner, weapon, dependency, evidence, or verification. Missing governance readiness blocks or returns to the responsible stage.

## No public-ready without userGoalDone

`public-ready` requires `intentAmplificationScore >= 90`, `publicReadyScore >= 90`, `userGoalDone = true`, verification evidence, no unresolved high/critical findings, and writeback decision.

## No deletion of foundational capabilities

Prompt cleanup may delete vague language only. It may not remove Skills, WebSearch, browser, research, filesystem, shell, apply_patch, MCP, memory, graph, Graphify, hooks, scripts, commands, runtime tools, validators, setup, sync, install, uninstall, or projections.

## No removal of runtime native abilities

Meta_Kim adds boundaries around Claude Code, Codex, Cursor, and OpenClaw native abilities. It must not replace native UI, approval, sandbox, hooks, skills, agents, commands, MCP, or rules with fake Meta_Kim equivalents.

## No dependency deletion due to low score

Low-score, unknown, partial, uninstalled, external, high-risk, or reference-only dependencies stay registered. They may be blocked from execution, marked for probe, downgraded to evidence/reference, or assigned upgrade suggestions.

## No Hook loop

Hooks are last-resort fuses, not the main governance engine. Execution must pass preflight before mutation: intent, evidence, capability discovery, runtime, OS, owner, weapon, dependency route eligibility, verification owner, rollback path, warning classification, and reserved writeback decision. A Hook block must include `returnToStage`, `repairOwner`, `repairAction`, `allowedNextAction`, and `forbiddenRetry`. The same Hook reason may block once; the second same-reason block enters `hookRepairMode`; a third same-hook block stops Execution and creates `hookFailurePacket`. Never retry the same blocked action unchanged.

## Real testing and warning classification

Script validation is necessary but not sufficient. Public-ready requires real route fixtures, strict run artifact validation, dependency discovery output, runtime/OS probe output, and warning review. Warnings must be classified as `BLOCKING_WARNING`, `FIXABLE_WARNING`, `ENVIRONMENT_WARNING`, `EXPECTED_WARNING`, `DEPRECATED_WARNING`, or `NOISE_WARNING`. Unclassified warnings, unresolved Hook blocks, unresolved high/critical findings, missing verification evidence, or missing `userGoalDone` keep `publicReady=false`.
