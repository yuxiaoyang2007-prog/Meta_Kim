# Development Governance Flow - Compact Index

This file is the compatibility anchor for Type C development governance. Detailed rules are split across sibling references:

- `path-selection.md`
- `spine-state.md`
- `runtime-codex.md`
- `owner-resolution.md`
- `verification-evidence.md`
- `planning-files.md`
- `evolution-writeback.md`

## Invocation Principle

Meta-theory starts with capability-first routing, not hardcoded names. The main thread coordinates. Execution work is delegated to the selected owner, skill, command, MCP capability, runtime tool, or worker.

Meta agents govern:

- Fetch sub-agent returns evidence, not final decisions.
- Thinking sub-agent returns plans and packets, not patches.
- Review sub-agent verifies quality and evidence.
- Execution workers produce the deliverable.

## Task Classes And No-Agent Exception

`taskClass` categories:

- `Q`: pure query / read-only explanation.
- `A`: analysis with durable reasoning or review.
- `P`: plan / proposal / architecture route.
- `S`: strategy / governance / multi-run direction.

No-agent exception applies only when all four are false: no file/code/config change, no external side effect, no durable artifact, and no handoff.

## Capability Discovery And Owner Resolution

Fetch-first pattern: Search -> Match -> Invoke.

Discovery order:

1. local repo evidence
2. canonical capability index
3. runtime mirror indexes
4. local runtime inventory
5. external search
6. specialist ecosystem
7. owner-resolution decision

Owner-resolution branches: existing owner, upgrade existing owner, create owner, or capability gap. Temporary fallback owner is forbidden. Missing capability blocks, returns to Thinking, or queues a `capabilityGapPacket` for Scout.

Default execution route proof: for a real execution demand, the route must naturally resolve the full provider chain before mutation. Evidence must name the selected execution owner, the checked execution-agent sources, the agent creation capability or reason no creation is needed, the selected skill and checked skill sources, the skill creation capability or reason no creation is needed, the MCP provider or no-impact reason, the command/runtime tool, and the verification owner plus verification method. This proof belongs to Fetch and Thinking, not to a validator after Execution.

Autonomous discovery proof: natural-language durable work must carry an `autonomousCapabilityDiscovery` record before Execution. It proves that capability discovery was triggered by entry classification and Fetch/Thinking policy, not by the user explicitly reminding the system to search agents, skills, MCP, commands, tools, or stage names. A vague product request with no stage words must still search project runtime inventory, global runtime inventory, global skills, MCP/provider configs, package scripts, runtime tools, and verification owners, then build the same candidate lanes as an explicit `critical/fetch/thinking/review` request when the intent is otherwise equivalent.

Reportable provider references must be cross-runtime and machine-portable: use repo-relative refs, runtime ids, or home-relative refs such as `~/.codex`, `~/.claude`, `~/.cursor`, `~/.openclaw`, and `~/.agents`. Do not emit local absolute home paths in route reports.

Change facts before mutation: for any non-trivial, new-file, data-file, runtime-facing, or hook-gated file change, Fetch reads the current content of every target file and creates `fileChangeFactCard` before Execution. It records target files, the consumer/caller/distribution path, same-purpose overlap search and reuse decision, data fields/structure/date formats with redacted or synthetic examples when relevant, and the current user instruction verbatim. Thinking binds those facts into `workerTaskPackets` so Execution writes files because they have a delivery contract and current-file context, not because the worker needed somewhere to put output.

Step 1.7 Business-flow capability matrix: for executable deliverables, Fetch expands the work into product, UX, UI, frontend, backend, database, auth/security, motion, accessibility, browser QA, performance, release, install, feedback, and evolution lanes. Each lane records needed capability, owner candidates, dependency, and omission reason. Interface Integration Contract Layer adds `interfaceIntegrationContractPacket` for `third_party_integration` and internal integration work: interface_contract, provider_adapter, permission, contract_test, observability, rollout_rollback, blocking_unknown, and auth/signature evidence.

User-visible agent naming: `roleDisplayName` is a short business role such as frontend, backend, test, review, analysis, verify, or docs. Runtime nicknames and random personal aliases belong only in `runtimeInstanceAlias`. Put shard detail in `roleInstanceId` or `shardScope`, not the visible role name.

Parallelism rule: the same owner may run multiple instances only with shardKey, shardScope, workspaceIsolation, artifactNamespace, collisionPolicy, shared `parallelGroup`, and one `mergeOwner`. Missing shard or merge evidence is fake parallelism.

## Stage 0 — Global-First Discovery Pre-Dispatch Checklist

A dispatch is invalid unless the dispatcher (main thread or conductor) can show **evidence** that it ran a global-first owner discovery **before** the Wave 1 fan-out. "I remember the name" is not evidence. The discovery must produce a `capabilityInventory` recorded in the `dispatchEnvelopePacket`; without it, Wave 1 cannot start.

The discovery is run as **Stage 0**, before the 4-Stage Parallel Fan-out Protocol below. A run that skips Stage 0 is fake-parallel and must be rejected by Meta-Review.

### Stage 0 steps (in this order)

1. **Read capability indexes.** Read every file under `config/capability-index/` (`meta-kim-capabilities.json`, `provider-registry.json`, `weapon-registry.json`, `dependency-project-registry.json`) and record the registered provider types, weapons, and dependency projects relevant to the current task. Skip a source only with a recorded `no-impact` reason.
2. **Scan canonical sources.** Walk `canonical/agents/`, `canonical/skills/`, `canonical/runtime-assets/` and record the 9 meta agents + every canonical skill + every runtime asset. Note the canonical owner for each capability family.
3. **Scan global runtime homes.** For each host that this run will touch (Claude Code, Codex, Cursor, OpenClaw), list the global assets under `~/.claude/agents/`, `~/.claude/skills/`, `~/.codex/agents/`, `~/.codex/skills/`, `~/.cursor/agents/`, `~/.cursor/skills/`, `~/.openclaw/workspaces/`, `~/.openclaw/skills/`, `~/.agents/skills/`. Note specialists that could be alternative owners.
4. **Scan runtime package providers.** Read `package.json` `scripts` block and record the candidate `meta:*` and `discover:*` commands that could be invoked as tools. Note commands that the host exposes directly.
5. **Scan MCP and hook config.** Read `.mcp.json`, `.codex/config.toml` mcp section, `.cursor/mcp.json`, runtime hook registries. Note which MCP servers and hooks are available as providers.
6. **Match owner.** Only now: for the current Wave's stage and role, pick the owner from the inventory. The owner must be one of the candidate names that appeared in steps 1-5. If no candidate fits, return to Critical with `capabilityGapPacket`; do not fall back to `general-purpose` or any hardcoded name.
7. **Record the inventory.** Write `dispatchEnvelopePacket.capabilityInventory` containing the scanned sources, the candidate set per stage, the selected owner, and the rejected candidates with reasons.

### What the inventory must look like

`dispatchEnvelopePacket.capabilityInventory` is a structured record (machine-readable JSON or a fenced code block in markdown). The minimum fields:

- `scannedAt`: ISO timestamp of when the discovery ran.
- `sources`: array of `{ path, status, hitCount }` for every source actually scanned (steps 1-5).
- `candidates`: array of `{ stage, owner, source, reason }` covering every wave that will dispatch.
- `selected`: for each wave, the chosen owner plus a one-line reason and at least one `rejected` alternative with its reason.
- `gap`: a free-text field; if the discovery could not find a matching owner, this field contains the `capabilityGapPacket` describing the gap, and Execution is blocked until the gap is closed.

### Hard rules

- **Stage 0 is mandatory.** A `dispatchEnvelopePacket` without `capabilityInventory` is not a valid dispatch. Review must reject it.
- **No hardcoded owner names.** The selected owner in step 6 must come from the inventory. A dispatcher that writes `meta-scout` without first proving `meta-scout` appears in the candidate set is a protocol violation.
- **No silent general-purpose fallback.** If step 6 cannot find a matching owner, the run must return to Critical with `capabilityGapPacket` and surface the gap to the user. Silently falling back to `general-purpose` is forbidden, even for Wave 3 workers, unless the Wave-3 row of the Default Owner Assignments table is the explicit default for that role.
- **Inventory must be auditable.** Every `sources[i].path` listed in the inventory must be a real file or directory the host can read; Review may grep any of them to confirm the inventory is not a fabrication.
- **Skipping a source requires a reason.** If the dispatcher does not read `config/capability-index/provider-registry.json`, the inventory must record `sources[i].status: "skipped"` with `sources[i].reason` explaining why. An empty reason is a protocol violation.

## 4-Stage Parallel Fan-out Protocol

The canonical 8-stage spine (`Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution`) is the routing order. The **governance stages** (Critical, Fetch, Thinking, Review) have an internal DAG that allows safe parallelism when their evidence, decisions, and reviews are independent. The 4-Stage Parallel Fan-out Protocol wires them into four waves, each with explicit parallel lanes and a named merge owner. The dispatching convention is **Wave N: scope**, not **Stage N: pass/fail**.

This protocol is referenced from `SKILL.md` § **Global-First Owner Discovery** and § **Parallelism Boundaries**; both are read together. The hooks `enforce-agent-dispatch.mjs` and `activate-meta-theory-spine.mjs` enforce the spine but never block the safe intra-wave fan-out described here.

### Wave 1 — Critical + Fetch (intent lock + evidence fan-out)

- **Critical** runs on the main thread. It locks the actual user intent, the success criteria, the non-goals, the permissions, the Architecture Type, and the boundaries. It is intentionally single-threaded because every later wave depends on a stable intent lock.
- **Fetch** runs in parallel with Critical's evidence-need surface. Inside a single run, Fetch fans out the capability-discovery sources from `SKILL.md` § **Global-First Owner Discovery** (canonical assets, capability indexes, global runtime homes, package scripts, MCP configs, external discovery) across 1-6 parallel readers when the route is visibly complex.
- **main-thread merge**: the main thread holds the intent lock and merges the Fetch fan-out into a single `fetchPacket` + `capabilityDiscovery.searchLog`. No subagent may write the intent lock.

### Wave 2 — Thinking + Planning (owner match + dispatch envelope)

- **Thinking** maps the needed capabilities to owner candidates, dependencies, runtimes, and OS support. It runs on the main thread or under `meta-conductor` orchestration.
- **Plan** (the `dispatchEnvelopePacket`, `dispatchBoard`, and `workerTaskPackets`) is produced in parallel: candidate paths are explored in parallel, owner matching is parallel across the candidate shortlist, and dependency / runtime / OS eligibility checks run in parallel.
- **mergeOwner**: the main thread. `meta-conductor` may co-orchestrate, but the dispatch envelope is closed by a single mergeOwner with full DAG and `parallelGroup` evidence.

### Wave 3 — Execution (bounded fan-out)

- **Execution** dispatches `workerTaskPackets` in parallel. Each packet must carry `shardKey`, `shardScope`, `workspaceIsolation`, `artifactNamespace`, `collisionPolicy`, shared `parallelGroup`, and one `mergeOwner`. Missing shard or merge evidence is fake parallelism. All packets sharing a `parallelGroup` MUST be dispatched as concurrent Task/Agent tool calls in a single assistant message — splitting them across messages fails Meta-Review as fake parallelism.
- **mergeOwner** is the single authority that resolves collisions and produces the final deliverable chain. The main thread may also be the mergeOwner, but only when it has not also held the worker role for the same packet.

### Wave 4 — Review + Meta-Review (skeptic fan-out + Warden gate)

- **Review** fans out across the `meta-prism` lenses (factual reviewer, senior engineer, security expert, consistency reviewer, redundancy checker) in parallel. Each lens produces a separate `reviewLensPacket`; the main `reviewPacket` is the merge.
- **Meta-Review** is a single-point authority on `meta-warden`. The Warden gate cannot be parallelized; it inspects the Review standard itself, not the deliverables.
- **Verification** and **Evolution** remain strict-serial after Meta-Review. The Warden gate and the Verification stage are the only authorities that can close a run.

### Default Owner Assignments

These assignments are the **default** for any run that triggers the Fan-out Trigger below. They are not optional defaults; deviating requires a recorded `no_branching_choice` or an explicit user override. A dispatch that uses a different subagent type than the one named here must record why in `dispatchEnvelopePacket`.

| Wave | Stage / role | Default subagent type | Reason |
|------|--------------|------------------------|--------|
| 1 | Fetch — capability discovery across 1-6 readers | `meta-scout` | External + cross-runtime capability scanning is `meta-scout`'s stated boundary. |
| 1 | Fetch — graph + memory navigation | `meta-librarian` | Memory + graph + continuity is `meta-librarian`'s boundary. |
| 2 | Thinking — owner match + dispatch envelope | `meta-conductor` | Business-flow blueprint, stage sequencing, and dispatch envelope are `meta-conductor`'s boundary. |
| 2 | Thinking — capability loadout (skills, MCP, commands) | `meta-artisan` | Skill / MCP / tool fit is `meta-artisan`'s boundary. |
| 3 | Execution — worker task | runtime-discovered professional owner | Bind each run-scoped worker packet to an existing global/project execution owner whose capability contract fits the lane. A runtime worker instance is not permission to invent a `general-purpose` owner. |
| 4 | Review — adversarial correctness | `meta-prism` (lens: correctness) | Quality review and drift detection are `meta-prism`'s boundary. |
| 4 | Review — adversarial security | `meta-prism` (lens: security) | Same boundary; different lens. |
| 4 | Review — adversarial completeness | `meta-prism` (lens: completeness) | Same boundary; different lens. |
| 4 | Meta-Review — gate approval | `meta-warden` | Coordination, arbitration, final synthesis, and the public-ready gate are `meta-warden`'s boundary. |
| 8 | Evolution — writeback coordination | `meta-chrysalis` | Evolution signal aggregation and writeback coordination through Warden's gate are `meta-chrysalis`'s boundary. |

**History note** — early runs of this protocol (v2.8.62 and earlier) defaulted every Wave-3 worker to `general-purpose` because the owner table did not exist. Wave 4 review was also done by `general-purpose` instead of `meta-prism` three-lens fan-out, and Meta-Review was done by the main thread instead of `meta-warden`. From v2.8.63 onward named governance roles became the default; the current contract also requires Wave-3 packets to bind a runtime-discovered professional owner instead of reviving the old generic fallback.

### Wave Hard Rules

- The 8-stage ordering is preserved. Parallelism exists **inside** a wave, not **across** waves.
- No wave may skip the main-thread intent lock. Critical, the Fetch merge, the Thinking merge, and the Review merge are single-point.
- Meta-Review, Verification, and Evolution are strict-serial. Warden is the only Meta-Review authority; Verification produces fresh evidence; Evolution writeback requires Warden approval.
- A Wave-3 fan-out that lacks `parallelGroup` + `mergeOwner` + `collisionPolicy` is fake parallelism and must be rejected by Review, not silently serialized.
- The `agent-teams-playbook` skill is the recommended execution pattern for Wave 3; it is selected only when the DAG and collision policy prove safe.
- **A dispatch that picks `general-purpose` as an execution owner is a protocol violation.** Review must return to Thinking and bind a runtime-discovered professional owner or emit a real capability gap.

### Fan-out Trigger

The protocol activates when any of these signals appear:

- explicit `/meta-theory`, `meta-theory`, `元理论`, natural-language governed execution, `critical and fetch thinking and review`, `Critical Thinking -> Fetch -> Deep Thinking -> Review`, "并行", "多个 agent", "review + fix + verify"
- 2+ independent files, runtimes, platforms, capability families, or verification lanes
- cross-runtime behavior, release/update/sync, hook/security/sandbox, or repeated same-type failure work
- user feedback that the current Meta_Kim route is slow, serial, missing agents, or repeatedly corrected

A run that does not trigger fan-out still walks the 8-stage spine in order, just without intra-wave parallelism.

## Complexity Routing

Simple routing: non-explicit, low-risk 1-file work may compress execution to Execution -> Review -> Verification -> Evolution after the dispatcher has established that no Critical, Fetch, or Thinking decision would change route, scope, risk, owner, permissions, non-goals, or acceptance. Explicit `meta-theory` activation and governed work still enter through Critical -> Fetch -> Thinking before Execution; simple routing is not a bypass for governance entry.

Medium routing: 2-5 files -> full 8-stage spine.

Complex routing: >5 files, cross-system dependency, cross-module dependency, multi-team work, install/release risk, or security-sensitive changes upgrade to 8-stage + 11-phase business workflow.

Security-sensitive changes trigger upgrade. Cross-system dependency triggers upgrade. The file scope threshold is 5 files; 6 files is complex.

Legacy 10-stage wording is not the current routing model.

## Core 8-Stage Spine

The current spine is:

Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution.

## STAGE 4: Execution

Execution dispatches from Thinking artifacts: `agentBlueprintPacket`, `dispatchEnvelopePacket`, `dispatchBoard`, and `workerTaskPackets` when they are available. Hooks enforce only the key behavior minimum: intent, Fetch evidence, capability discovery, selected owner, owner loadout, runtime/OS not known-unsupported, memory strategy, and Review standard. Selected capabilities may be agents, skills, commands, MCP capabilities, runtime tools, abstract prompts, or file-set capabilities. Execution is multi-agent when the task has independent lanes.

Stage transitions:

- Critical -> Fetch after intent, scope, non-goals, permissions, and task classification are clear. When user input is wishful or ambiguous, Critical and Fetch form a bounded loop: Critical does initial intent translation, Fetch reads project context to fill gaps, then Critical updates the intent with context-enriched understanding. The loop repeats adaptively up to `criticalFetchLoopMax` (default 3). Exit requires an IntentCard confirmation by the user (or an allowed skip with recorded reason). See `spine-state.md` Critical-Fetch Intent Loop for full field definitions.
- Fetch -> Thinking after decision-grade evidence, capability discovery, and contradictions are recorded.
- Thinking -> Execution after option exploration or `no_branching_choice`, owner/loadout selection, memory strategy, and enough dispatch evidence to execute. Full packet shape is validated by validators and Review; hooks must not block merely because optional fields are absent.
- Review -> Meta-Review -> Verification when risk or review quality needs a standard check.
- Evolution is final and cannot precede Verification.

Hidden skeleton:

- `stageState`: Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution
- `controlState`: `normal`, `skip`, `interrupt`, `override`, `iteration`, `intentional_silence`, `degraded`
- `gateState`: `pending`, `pass`, `fail`, `rework`, `blocked`
- `surfaceState`: `silent`, `notice`, `decision`

Skip / interrupt / override must return to the main chain. `controlState=skip` skips a stage only with a recorded reason; interrupt pauses the stage; iteration re-enters the stage after failed verification. `intentional_silence` means no card because intervention has no clear gain. Public readiness is not `surfaceState`; it lives in summary/public surface packets and remains blocked until verification and Warden gates close.

## Degraded Mode

When Agent dispatch is unavailable or no matching owner exists after capability discovery, the spine enters `controlState=degraded`:

- Fetch must still run discovery and record `capabilityDiscovery.searchLog`. Skipping discovery is forbidden even in degraded mode.
- Thinking must still resolve owners and record `capabilityGapPacket`. If no owner matches, `degradationReason` explains why.
- Review: read the relevant meta-agent definition (e.g. `meta-prism` for review criteria), apply the same checklist, record `reviewPacket` with `degradedFlag: true` and `reviewerRole: "main-thread-degraded"`.
- Meta-Review: same pattern as Review, reading `meta-warden` criteria.
- Verification: run verifySteps with `degradedFlag: true`, add `humanAcceptanceRequired: true` when no independent verification owner exists.
- `surfaceState` may be `silent` or `notice` but cannot become a public-ready claim. Summary/public surface packets must remain internal-only; claiming `public-ready` in degraded mode is forbidden.
- The dispatcher may self-execute in degraded mode only with explicit `degradationReason` and `degradedFlag: true` recorded before mutation.

## User Interaction Policy

Decision vs Notice bifurcation:

- Decision asks the user to choose because outcome, scope, owner, risk, or acceptance changes.
- Notice reports state without asking.

Non-trivial execution needs one consolidated Decision after Fetch and Thinking, unless the skip is `trivial`, `no_branching_choice`, or `explicit_auto_proceed` with rationale. Read-only/queryBypass is a safety and path-classification boundary; it is not enough by itself to skip a choice surface when branch-changing options exist.

Codex visible multi-option choice rule: visible Decisions include at least two options and a recommended default.

### Risk-Adaptive Plan Challenge

Plan challenge is an interaction overlay across Critical, Fetch, Thinking, and Review. It does not alter the eight-stage spine or create another approval layer.

Activation:

- explicit user intent such as `反证`, `帮我挑刺`, `压力测试`, or `方案拷问`
- an irreversible or high-cost action with concrete mutation or side-effect intent
- a permission-sensitive side effect the user is asking the run to perform
- a material contradiction recorded by trusted Fetch or Thinking evidence that changes outcome, scope, route, risk, authorization, or acceptance

Suppress it for clear, low-risk, reversible work unless the user explicitly requests it. A low-risk read-only sentence does not activate automatic challenge merely because it mentions deployment, deletion, credentials, payment, permissions, production, or another risky domain. Automatic activation requires actionable mutation/side-effect intent or trusted contradiction evidence, and begins with a short notice explaining that concrete signal rather than an internal packet dump.

Question selection is impact-first. Fetch resolves discoverable facts. Critical, Thinking, or Review asks only the highest-impact unresolved user decision for that turn. A valid question must identify what changes if the answer differs; otherwise suppress it. Do not bundle unrelated questions, repeat an answered question, or keep questioning to meet a count. If an answer invalidates dependent questions, close them without showing them.

When evidence supports one route, show a recommended answer, reason, material trade-off, and uncertainty. Preference-only questions may present a neutral comparison instead. Expose five user actions in the resolved language when they are actionable: continue questioning, accept the recommendation, skip this question, summarize now, and stop. Record them as `continue`, `accept_recommendation`, `skip`, or `summarize_stop`; summary and stop share `summarize_stop` because both close the questioning immediately. Understanding and authorization phases must not show question-only controls that cannot change their state; their bound response field remains visible and `summarize_stop` remains available. That control records `stopReason=user_requested_summary_stop`, system-invalidates every remaining open question, and carries unresolved risks into the visible closure. Controls are trusted user decisions, not implicit prose guesses.

Until the current runtime returns trusted user-decision evidence, the challenge remains `awaiting_user_answer`, `awaiting_understanding_confirmation`, or `awaiting_execution_authorization` as applicable. The runner emits `pendingUserChoice` for the host adapter with `required_not_invoked`; this records a required user decision, not a claimed popup. A generated card, assistant message, caller-authored JSON, CLI flag, environment variable, or report cannot mark a question answered or claim that a popup appeared. Compatibility chat may display the question, but it remains pending rather than native-choice completion.

The public runner treats all serialized response, history, understanding, and authorization parameters as untrusted. It may consume at most one current-run decision only through a host-owned verifier callback capability; serialized `trusted=true` and `historical=true` fields alone have no authority. Cross-turn continuation loads the prior artifact only from the same governed output directory, validates it, requires the same task fingerprint and a still-pending phase, and requires the current host callback to bind `continuationRunId` to that exact prior run. The runner then restores the validated decision ledger and stamps only the current phase-appropriate answer, understanding confirmation, authorization/denial, or control. It never overwrites the prior artifact or replays caller-supplied history. This is a process-capability boundary, not a signature/public-key claim: if the current host does not expose a verifier adapter, keep the run pending and let the conversation host own the next decision.

Keep understanding and action authority separate:

- `sharedUnderstandingConfirmed`: a derived boolean backed by trusted understanding evidence bound to `plan-challenge-understanding-confirmation`.
- `executionAuthorization`: trusted evidence of the user-authorized scope, or an explicit denial/not-required state.
- `executionAllowed`: the single fail-closed gate consumed by every file/state mutation, global install, publish, deploy, deletion, payment, permission change, external write, or other side effect.

Understanding never promotes authorization or `executionAllowed`. A single native choice surface may collect understanding and authorization only when it labels them as separate decisions and returns trusted evidence for each. Understanding confirmation itself requires trusted evidence bound to `plan-challenge-understanding-confirmation`; a naked boolean is ignored. A question response applies only when it is trusted, carries binding `plan-challenge-response:<questionId>`, records its selected-question sequence, and has non-empty evidence references. Caller-supplied booleans, status strings, unbound answers, authorization objects, or invalidation flags are untrusted input and cannot authorize execution, answer a decision, or invalidate a dependent question. Question invalidation comes only from the governed dependency resolver after a trusted answer/control transition. Explicit authorization denial is terminal for the run: show the denial summary, keep `executionAllowed=false`, and do not ask for authorization again.

Do not ask for execution authorization merely to finish a read-only challenge session. When the next step has no side effect, authorization is `not_required` and the session closes after the chat summary without another acceptance step. Trusted authorization requires non-empty evidence, binding `planChallengeAuthorizationBinding(sideEffectActions)`, and scope actions covering every requested action. `executionAllowed` is true for an inactive challenge using the existing governed route, or for an active challenge only at `ready_for_execution`; all other active phases keep it false. Canonical writeback and project-copy mutation consume that same gate, while non-ready routes remain candidate/read-only. No capability-specific flag may bypass it.

Closure is chat-first: confirmed decisions, unresolved risks, and the next action must be visible in the conversation. Render the question, controls, pending state, and outcome in the resolved `zh-CN`, `en-US`, `ja-JP`, or `ko-KR` locale without falling back to Chinese copy in another locale. Create a separate human-readable decision file only when the decision is long-lived and hard to reverse. Routine and reversible decisions do not justify another artifact or acceptance step.

## Interactive Execution Communication

During multi-stage work, the dispatcher must communicate at natural transition points — not only at the pre-decision gate. This "communicate while working" pattern is mandatory for non-trivial tasks.

Report triggers:
- Fetch complete: brief evidence summary + route impact.
- Thinking complete: chosen path + trade-offs + why alternatives were rejected.
- Each Execution phase complete: what was done + what remains + any blockers.
- Review findings that change scope: surface immediately as a Decision card.
- Route-changing discovery mid-execution: pause and inform before continuing.

Each report is a compact notice (max 3 bullets). If a discovery changes scope, owner, or risk, upgrade to a Decision requiring user input. The user should never need to ask "what's happening?" during a non-trivial run.

For governed runs that activate the 11-phase business workflow, user-visible status must include all phase states (`done`, `skipped`, `blocked`, `pending`), a plain reason for each state, and the current blocked or pending phase. The JSON artifact and validator pass are evidence layers; they do not prove the user saw the workflow state unless a localized conversation notice or readable report exposes it.

## Fetch And Thinking Boundary

Fetch collects evidence and capability candidates. It does not finalize execution owners.

Thinking selects owners, expert lenses, dependencies, and worker work orders. `candidateTaskShape` may sketch lanes, but it is not `dispatchEnvelopePacket`, `dispatchBoard`, or `workerTaskPackets`.

Option Exploration is mandatory for non-trivial work: at least 2 solution paths, Pros / Cons, rejected alternatives, and a Decision Record.

## Protocol-First Dispatch Artifacts

Stage 4 may not start before:

- `runHeader`
- `taskClassification`
- `fetchPacket`
- `contentEvidencePacket`
- `fileChangeFactCard` when file mutation is planned
- `preDecisionOptionFrame`
- `dispatchEnvelopePacket`
- `dispatchBoard`
- `orchestrationTaskBoardPacket`
- `workerTaskPackets`

Protocol-first dispatch requires capability binding, allowed/blocked capabilities, review owner, verification owner, dependencies, `parallelGroup`, `mergeOwner`, and file collision policy.

## Planning Files Supplement

When planning files are enabled at Stage 3, create or update:

- `task_plan.md`
- `findings.md`
- `progress.md`

They supplement packets. They do not replace `businessFlowBlueprintPacket`, `dispatchEnvelopePacket`, `workerTaskPackets`, or verification evidence.

## Execution

Dispatch from Thinking artifacts and selected capabilities. Execution may be parallel or sequential based on dependencies. `agent-teams-playbook` is selected only after Thinking and before Execution when there are 2+ executable worker lanes whose DAG dependencies, collision boundaries, workspace isolation, and external-write policy prove safe fan-out; fewer than 2 lanes record `not_required`, and unsafe fan-out records partial/degraded. Selection proves bounded fan-out planning, not a live Skill/Agent Team/spawn_agent call without attached host evidence.

Surgical hygiene: touch only files required by the task, remove only unused code caused by the change, and preserve unrelated user changes.

If a write-time hook blocks with a request for file facts, return to Fetch/Thinking, present the `fileChangeFactCard` in user-facing language, and retry the same operation. Do not disable the hook, invent fake callers, or retry unchanged without the facts.

## Review

Review validates owner coverage, protocol compliance, quality, security where selected, UX where selected, and AI-slop risks in agent/system definitions.

Reviewers must be able to perform read-only inspection and allowed validation commands. A review that cannot inspect evidence is not a real review.

Review must also check that each new or changed file has a recorded target, consumer/distribution path, overlap decision, and data-shape note where relevant.

## Verification

Verification uses fresh evidence, not "I tested it" claims. For every "verified" claim, answer:

- who tested it
- what command/check ran
- what output, screenshot, log, or artifact records the result
- what happens on failure

`workerExecutionEvidence` binds to `verifySteps` by `verifyStepRef`; `json-output` must be parseable JSON. `verificationPacket.fixEvidence` is structured and links finding, action, verifier, evidence refs, result artifact, result, and failure disposition.

`accepted_risk` can close only with `riskOwner`, `riskReason`, and `expiryOrRevisitTrigger`; public-ready must stay false unless the release gate explicitly permits that risk.

Insufficient evidence -> mark `INSUFFICIENT_EVIDENCE`, return to Verification, or reopen Review.

Live evidence classification:

- `structural_smoke`: config, schema, projection, matrix, or startup checks. Useful, but not live.
- `ui_warning_or_system_message`: visible warning, prompt injection surface, or UI/systemMessage output. Useful, but not live unless the runtime proves it entered model/tool context and affected the invocation artifact.
- `skipped_or_needs_auth`: honest incomplete state with blocker and retry path. Never a pass.
- `runtime_live_pass`: a real target-runtime invocation produced a recoverable assistant/tool artifact and passed runtime-specific scoring.

Do not combine categories to imply a stronger category. If Claude, Codex, or OpenClaw live is requested, each declared target must be either `runtime_live_pass` or explicitly incomplete; structural smoke cannot substitute for live.

## Rollback Protocol

Rollback is not failure.

Rollback decision flow: Verification FAIL -> count affected file count -> decide rollback level -> record action -> re-enter the correct stage.

Levels:

- file-level rollback: 1 file rollback, targeted revert; `git checkout` may be a human-approved option.
- sub-task rollback: 2-3 files rollback or sub-task revert.
- partial rollback: mixed success/failure; keep success and rollback fail when dependency boundaries allow it.
- full rollback: >3 files rollback, cross-module rollback, cross-contamination >3 files, or `git stash` full safety path.

Full rollback re-enters Stage 1 Critical for scope and risk reset, then may return to Stage 3 Thinking to re-decompose.

## Silence And Card Overload

Forced silence triggers at >=3 consecutive high-density push rounds. Use Pause for digestion when attention budget is exceeded. Overload rule silence is deliberate, not inaction.

Iteration cards have `max_iterations` (default 3). If `max_iterations` is exceeded, escalate to Warden instead of looping. The `interrupt_trigger` mechanism preempts the current queue only when a recorded trigger condition is satisfied.

Undefined behavior defaults to silence/pause and escalates to Warden.

## Summary And Public Display

Public display requires verified run, summary closure, single primary deliverable, closed deliverable chain, and consolidated deliverable. Do not show public-ready when verification is incomplete.

Release/publication closure has three assurance tiers. Routine low-risk patch/minor releases use the maintainer smoke path: projection sync, default capability-discovery smoke, meta-theory tests, whitespace diff check, changelog/release notes, commit, tag, push, and publish. Standard full releases use `meta:verify:all` when the change touches install/update, global sync, hooks, runtime matrix, provider registry, dependency compatibility, runtime probes, package contents, security-sensitive behavior, or the user asks for full verification. Standard closure records all-runtime update scope, project sync evidence, global sync evidence, global hooks evidence when hooks are in scope, runtime matrix validation, provider registry validation, dependency compatibility, runtime evaluation/probe evidence or blocker, real execution-demand route proof, changelog/release-note readiness, security audit evidence, and Warden approval; a complete passing run permits commit, tag, push, and publication. Optional highest-assurance `meta:verify:live-certified` appends private-attested external-observer exact-binding clean-room evidence for declared live targets. Missing that external signature blocks the `live-certified` label only, not a separately passing standard release.

## Evolution

Evolution receives `verificationPacket` results and produces `evolutionWritebackPacket`. Warden approves; Chrysalis coordinates; target specialist performs writeback. No durable lesson means `writebackDecision: none`.

## What It Is Not

It is not a shortcut to hardcoded agents, a license for governance agents to implement product work, a way to skip evidence, or a way to convert a failed verification into a release claim.


## Use when

Use when full development governance and cross-runtime execution flow affects route, owner, risk, acceptance, verification, public-ready, or evolution writeback.

## Required inputs

- Latest user request and `intentPacket`
- `fetchPacket` evidence that changes decision
- runtime and OS targets when tools or dependencies are involved
- relevant config, registry, script, or artifact path

## Do

- Assign an owner for each action.
- Produce a checkable packet or artifact.
- Bind pass/fail to evidence, threshold, or command output.
- Preserve existing foundational and native runtime capabilities.

## Do not

- Do not delete skills, dependencies, web/browser/research, shell, filesystem, apply_patch, MCP, memory, graph, hooks, scripts, runtime tools, or native platform abilities.
- Do not use vague advice without trigger, output, evidence, and writeback.
- Do not route reference-only or unknown dependencies into execution.

## Required packet

`referenceContractPacket`: `referenceId`, `trigger`, `requiredInputs`, `actions`, `outputs`, `passCriteria`, `failCriteria`, `blockConditions`, `returnStage`, `verification`, `writebackTarget`.

## Pass

- At least one action has owner, input, output, and verification.
- Pass criteria include numeric threshold, required field list, command, artifact, or human acceptance record.
- Unsupported, unknown, or partial capability is marked rather than removed.

## Fail

- Instruction is only theory or roleplay.
- No block condition exists for missing evidence, unsupported runtime/OS, fake owner, or missing verification.
- Public-ready can be claimed without userGoalDone and evidence.

## Block

Block Execution when owner, weapon, dependency eligibility, runtime support, OS support, verification owner, or rollback boundary is missing. Block public-ready when verification evidence, intent acceptance, writebackDecision, or high/critical closure is missing.

## Return to stage

Return to Critical for intent gaps, Fetch for evidence/support gaps, Thinking for route gaps, Execution for missing artifact, Review for open findings, Verification for missing proof, and Evolution for missing writeback.

## Verification

Run the most specific validator for this reference plus `npm run meta:prompt:validate`. Use command/log/artifact/human acceptance evidence, not a narrative claim.

## Writeback

Write durable improvements to canonical references, governance configs, capability indexes, validators, tests, or scars. If no durable change exists, record `none-with-reason`.

## Preserve

Preserve Skills, WebSearch/browser/research, filesystem, shell, apply_patch, MCP, memory, Graphify, graph, hooks, commands, rules, agents, subagents, approval, sandbox, runtime tools, package scripts, setup, sync, install, uninstall, status, doctor, validators, and runtime projections.
