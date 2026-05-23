# Development governance flow — full specification (Type C)

> Detailed operating spec for Type C (Development Governance Flow).
> The Type C section in `SKILL.md` is the entry summary; this file contains the full procedure.
> For the theory source, see `canonical/skills/meta-theory/references/meta-theory.md`.
> Read this file when executing Type C — Development Governance Flow.

## 1. AGENT INVOCATION PRINCIPLE (Non-Negotiable)

**Skill is the orchestration layer — never hardcode specific agent names.** At every stage where an agent is needed, follow the Fetch-first pattern:

```
Need an agent for X → Search who declares "Own X" → Call the best match
```

**Invocation decision pattern** (applies to every agent call, every stage):

| Step | Action |
|------|--------|
| 1. Search | Read `config/capability-index/meta-kim-capabilities.json`, then the runtime mirror, then `.meta-kim/state/{profile}/capability-index/global-capabilities.json` |
| 2. Match | Score each agent's "Own" boundary against needed capability (3=perfect / 1-2=partial / 0=none) |
| 3. Invoke | 3 → invoke directly / 1-2 → invoke + note gaps / 0 → capability gap detected |

**⚠️ Iron Rule**: Do NOT write `call code-reviewer` or `call meta-prism` as hardcoded steps. Describe the **capability needed**; let the executor discover **who provides it** at runtime via the Search-Match-Invoke pattern.

### Meta-Agent vs Execution-Agent Layer (CRITICAL)

Meta_Kim distinguishes between two agent layers. **Confusing these layers is a governance violation.**

| Layer | Purpose | Examples | When to Use |
|-------|---------|----------|-------------|
| **Meta-Agents** (`layer='meta'`) | Governance: coordination, orchestration, review, synthesis | `meta-warden`, `meta-prism`, `meta-conductor`, `meta-genesis`, `meta-artisan`, `meta-sentinel`, `meta-librarian`, `meta-scout`, `meta-chrysalis` | **Open-source Meta_Kim durable owners** for Critical, Fetch, Thinking, and Review. They own orchestration, owner resolution, run-scoped skill matching, review, synthesis, and evolution gates. |
| **Execution agents / capabilities** | Global agents, project-local agents, skills, tools, and commands discovered for the current run | `frontend-developer`, `code-reviewer`, `matchedSkills`, `candidateSkills`, tool names, command evidence | In the Meta_Kim repository itself they are **not** durable public-repo owners. In user projects they may be used directly from the global registry, or copied into the project only when modification is required. |

**⛔ FORBIDDEN PATTERNS**:
- ❌ Persisting `frontend-developer`, `auth-specialist`, `backend-developer`, or similar non-meta names as `ownerAgent` in public Meta_Kim artifacts
- ❌ Treating "ignored execution agents" as silently accepted owners. They must be converted to run-scoped capability evidence or rejected with `capabilityGapPacket`
- ❌ Binding concrete skills or commands into long-term meta-agent identity instead of recording them in `matchedSkills`
- ❌ Copying a usable global agent into a user project without modification need. Direct global reuse must stay direct.
- "I'm a meta-* agent in sub-agent context, so I can run Bash/Edit/Write freely" — **NO**. The dispatch model restricts meta-* identity everywhere.
- "Review needs me to run typecheck/test, that's not 'execution'" — **only via the L2 read-only Bash whitelist**. Anything that mutates the working tree is execution.

**How to identify layers**:
- Meta-agents: `id` starts with `meta-` in `config/capability-index/meta-kim-capabilities.json`, OR agent's SOUL.md has `⚠️ GOVERNANCE LAYER AGENT` warning box
- Execution-like capabilities: global agents, project-local agents, tools, commands, and skills found during Fetch. In the Meta_Kim repo they are capability evidence, not durable owners. In user projects they may become execution owners under the global-reuse/project-local-copy rules.

**Fetch-first discipline**:
1. Search `config/capability-index/meta-kim-capabilities.json` → check `layer` field
2. Search runtime mirrors → check `layer` field
3. Search `.meta-kim/state/{profile}/capability-index/global-capabilities.json` → check `layer` field
4. If no `layer` field, assume `execution` for non-`meta-` prefixed agents, `meta` for `meta-` prefixed

**Detection & enforcement**:
- The `enforce-agent-dispatch.mjs` hook will warn if a meta-agent is dispatched during execution stage for execution work
- Capability index schema (`config/contracts/capability-index.schema.json`) defines the `layer` and `executionBlock` fields
- Each meta-agent SOUL.md has a prominent warning box at the top

### Agent Ownership Rule

Every **executable** task must have an explicit **agent owner**.

Only a **pure Q / Query** may bypass agent ownership and be answered directly. A task is **not** a pure query if it does any of the following:
- modifies files / code / configuration
- triggers commands, network calls, or other external side effects
- produces a durable artifact for later handoff, review, or verification
- is expected to feed Evolution writeback into agent / skill / contract assets

Rule of thumb:

```
Pure question → may answer directly
Anything executable / handoff-able → must have an agent owner
```

### Capability Gap Resolution Ladder

When Fetch does not find a clean owner, resolve the gap in this order:

1. **Existing global or project-local execution owner fully fits** → use it directly. If it is global, set `ownerSource = global_reuse` and `agentCopyPolicy = use_global_directly`; do not copy it into the project.
2. **Existing global owner partially fits but needs project-specific change** → copy it into the user project first, set `ownerSource = project_local`, `agentCopyPolicy = copy_to_project_for_modification`, and `ownerResolution = upgrade_existing_owner`, then upgrade it under Genesis/Artisan/Sentinel/Prism review.
3. **No execution owner exists for a recurring user-project need** → create a project-local owner after Warden approves the `capabilityGapPacket`; set `ownerSource = project_local`, `agentCopyPolicy = create_project_local_agent`, and `ownerResolution = create_owner_first`.
4. **Meta_Kim repository governance gap** → upgrade/create only governance meta ownership; do not persist a non-meta execution agent in Meta_Kim itself.

**No-owner execution is illegal.** In Meta_Kim repository maintenance, a temporary non-meta fallback is illegal as durable state. In user projects, execution owners may be direct global agents or project-local agents, but global agents are copied locally only when modification is required. A project-local role with `ownerResolution = reuse_existing_owner` must use `agentCopyPolicy = already_project_local`; `copy_to_project_for_modification` is reserved for upgrade work, and `create_project_local_agent` is reserved for new execution-agent creation.

When Step 2 is chosen, the governed run must explicitly record the factory lane:

- `capabilityGapPacket`
- `orchestrationTaskBoardPacket`
- governance owner card for Meta_Kim repository governance gaps, or `executionAgentCard` only when a user-project execution agent must be created or upgraded

### Protocol-First Rule

Before Stage 4 starts, Thinking must produce explicit protocol artifacts for the run:
- `runHeader`
- `taskClassification`
- `contentEvidencePacket`
- `fetchPacket`
- `preDecisionOptionFrame`
- `cardPlanPacket`
- `dispatchEnvelopePacket`
- `orchestrationTaskBoardPacket`
- `dispatchBoard`
- `workerTaskPackets`
- `resultMergePlan`
- `reviewPacketPlan`
- `verificationPacketPlan`
- `summaryPacketPlan`
- `evolutionWritebackPlan`

If these protocol artifacts do not exist, the run is not ready for Execution.

Pre-decision artifacts are distinct from dispatch artifacts:

- `contentEvidencePacket` is Fetch evidence: what content was read or verified before choices were offered.
- `preDecisionOptionFrame` is Thinking evidence: candidate orchestration paths, candidate owners, trade-offs, recommended default, and whether user choice is required.
- `dispatchEnvelopePacket`, `dispatchBoard`, and `workerTaskPackets` are post-decision artifacts. They may not be finalized until the user chooses through a runtime question tool / native choice / fallback, or an allowed skip is recorded.

For `governanceFlow` in `complex_dev` or `meta_analysis`, the machine-validated JSON artifact must also include **`intentPacket`** (`trueUserIntent`, `successCriteria`, `nonGoals`, `intentPacketVersion: v1`) and **`intentGatePacket`** (`ambiguitiesResolved`, `requiresUserChoice`, `defaultAssumptions`, `pendingUserChoices`, `userLanguage`, `languageSource`, `nativeChoiceSurface`, `intentGatePacketVersion: v1`; if `requiresUserChoice` is true, include non-empty `pendingUserChoices[]`; if skipped, include the recorded skip reason from `preDecisionOptionFrame.choiceGateSkip`) before Execution — see `config/contracts/workflow-contract.json` (`protocols.intentPacket`, `protocols.intentGatePacket`, `runDiscipline.protocolFirst.intentPacketRequiredWhenGovernanceFlows` / `intentGatePacketRequiredWhenGovernanceFlows`).

If `taskClassification.upgradeReasons` includes `owner_creation_required`, the artifact must also include **`capabilityGapPacket`** before Execution. In Meta_Kim repository maintenance the resolution must upgrade or create governance ownership only. In user-project use, `create_execution_agent` / `upgrade_execution_agent` are valid only when direct global reuse is insufficient; a usable global agent must not be copied.

---

## 1B. Multi-iteration closure (until gates pass)

When work is not done after one pass (open review findings, `verificationPacket.verified !== true`, or `npm run meta:validate:run` fails), treat the run like a **Ralph-style loop** without inventing new stage names:

1. **Execution / Revision** — address the highest-severity open findings; update code or docs as needed.
2. **Review** — refresh `reviewPacket` and finding `closeState` transitions (`open` → `fixed_pending_verify` as appropriate).
3. **Verification** — refresh `revisionResponses`, `verificationResults`, and `closeFindings` until every finding is `verified_closed` or `accepted_risk`.
4. **Summary** — align `summaryPacket` with `config/contracts/workflow-contract.json` `runDiscipline.publicDisplayRequires` before setting `publicReady=true`.
5. **Validate** — run `npm run meta:validate:run -- <artifact.json>`; if it fails, run `npm run prompt:next-iteration -- <artifact.json>` and feed the printed checklist back into the orchestrator.

Stop when `validate:run` passes **or** the user explicitly accepts risk with documented `accepted_risk` and honest `publicReady=false`.

**Session recovery (API / compact / tool failure):** Check `.meta-kim/state/{profile}/run-index.sqlite` first for the latest validated governed run, then load the governed artifact as the source of truth. After an interrupted session, reload at minimum: `runHeader`, `taskClassification`, `intentPacket`, `intentGatePacket` (when required), `cardPlanPacket`, `dispatchEnvelopePacket`, `orchestrationTaskBoardPacket`, `capabilityGapPacket` / `executionAgentCard` (when applicable), `dispatchBoard`, `workerTaskPackets` / `workerResultPackets`, `reviewPacket`, `verificationPacket`, `summaryPacket`, `evolutionWritebackPacket`. If a local `compactionPacket` exists, use it only as continuity aid; it never replaces the governed artifact. Re-run `npm run meta:validate:run -- <artifact.json>` before claiming closure. The same packet list is printed by `npm run prompt:next-iteration -- <artifact.json>` under **Minimal context reload**.

Optional **soft todo gate** (off by default): set `META_KIM_SOFT_PUBLIC_READY_GATES=1` when running `validate:run`. If `summaryPacket.publicReady` is true, no `workerTaskPacket` may have `taskTodoState: "open"`. Omit `taskTodoState` if not tracking todos. See `config/contracts/workflow-contract.json` → `runDiscipline.runArtifactValidation.softPublicReadyTodoGate`.

Optional **soft comment-review gate**: set `META_KIM_SOFT_COMMENT_REVIEW=1` when running `validate:run`. If `summaryPacket.publicReady` is true, `summaryPacket.commentReviewAcknowledged` must be `true`. See `runDiscipline.runArtifactValidation.softCommentReviewGate`.

Optional Claude **Stop hook** (project default off): `META_KIM_STOP_COMPLETION_GUARD=hint` logs a stderr reminder when the last assistant message claims completion without governance cues; `=block` returns `{"decision":"block",...}` so the model continues. See `.claude/hooks/stop-completion-guard.mjs`.

**Governance doctor:** `npm run meta:doctor:governance` checks contract readability, Claude hook command set, `npm run meta:check:runtimes`, and `meta:validate:run` on the sample fixture — use before release or when mirrors drift.

---

## 2. CORE 8-STAGE EXECUTION SPINE (Detailed)

| Stage | Name | Key Question |
|-------|------|-------------|
| 1 | **Critical** | What is the task? Is it clear? |
| 2 | **Fetch** | Who can do this? |
| 3 | **Thinking** | How should we approach it? |
| 4 | **Execution** | Delegate to agents |
| 5 | **Review** | Is the result correct? |
| 6 | **Meta-Review** | Are the review standards themselves sound? |
| 7 | **Verification** | Did the fixes actually solve the issues? |
| 8 | **Evolution** | What structural learning should carry forward? |

### Hidden Skeleton State Model

The 8-stage spine is the **human-readable orchestration surface**. Underneath it, Meta_Kim may maintain a **hidden state skeleton** so the run stays governable without turning the system into a visible bureaucracy:

| State Layer | Example Values | Primary Owner | Why it exists |
|-------------|----------------|---------------|---------------|
| `stageState` | `Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution` | Conductor | Canonical stage progression |
| `controlState` | `normal / skip / interrupt / intentional-silence / iteration` | Conductor | Modify stage dealing without inventing new pseudo-stages |
| `gateState` | `planning-open / planning-passed / review-open / verification-open / verification-closed / synthesis-ready` | Warden + Prism | Separate stage completion from gate clearance |
| `surfaceState` | `debug-surface / internal-ready / public-ready` | Warden | Prevent dirty runs from being presented as completed/public |
| `capabilityState` | `covered / partial / gap / escalated` | Scout + Artisan | Keep Fetch results explicit instead of hand-wavy |
| `agentInvocationState` | `idle / discovered / matched / dispatched / returned / escalated` | meta-theory skill | Track whether the skill delegates to agents or attempts work directly — enforce the dispatcher role |

**Rule**: this is an **invisible skeleton only**. The user-facing workflow still speaks in stage language and concrete deliverables. State labels exist to support gates, skips, interrupts, and evolution logging — not to become a second product interface.

### User Language Rule

Stage names remain canonical English protocol labels (`Critical`, `Fetch`, `Thinking`, `Review`, etc.). All user-facing text around those labels follows this priority: first the runtime/tool selected output language when the host has already chosen one, then the user's explicit output-language choice, then the user's latest input language when no stronger language source exists. Do not hardcode Chinese, English, or any single language into option labels, clarifying questions, confirmation cards, or summaries. Record the language decision in `intentGatePacket.userLanguage`, `intentGatePacket.languageSource`, `cardDecision.userLanguage`, and `deliveryShell.languageSource`.

### User Interaction Policy

**Decision vs Notice Bifurcation**:

- **Notice (no popup)**: Informational updates, stage transitions, progress reports. Output directly to conversation, no response required. See `canonical/templates/user-interaction/notice-template.md`
- **Decision (popup)**: Use the runtime's native confirmation mechanism when multiple viable options exist. Each option must include 4 dimensions. See `canonical/templates/user-interaction/decision-template.md`

**Run status envelope**: every governed run must maintain a public status envelope in `.meta-kim/state/{profile}/active-run.json` and `.meta-kim/state/{profile}/runs/{runId}/status.json`. This envelope is the cross-runtime answer to "has meta started, how far is it, which stage is current, what is next, and is it blocked?" It is written by the runtime spine-state adapter using Node path APIs so Windows, macOS, Linux, Claude Code, Codex, Cursor, and OpenClaw all share the same state shape. The public notice reads from this envelope and must not expose `Preflight`, `nativeChoiceSurface`, `conversation_fallback`, packet ids, or protocol traces unless the user explicitly asks for debug/audit/protocol output.

The public status renderer follows the same language rule as all other user-facing meta-theory text: runtime/tool selected output language first, explicit output-language choice second, and latest user input language only as fallback. The envelope may carry runtime-provided `publicLabels` and a resolved `stagePurpose`; canonical stage names remain English. Fixed labels in any single human language are forbidden as the default public notice shell.

Default public notice shape:

```text
{localizedActiveLabel}: {Current Stage} ({stageIndex}/{stageTotal}, {percent}%)

{localizedCompletedLabel}: {completed stages or localized none}
{localizedCurrentLabel}: {plain-language stage purpose}
{localizedNextLabel}: {next stage or localized none}
{localizedBlockedLabel}: {blocker or localized none}
```

**Non-trivial execution rule**: For non-trivial executable work, Decision is the default after Fetch and pre-decision Thinking unless the user explicitly chose auto-proceed, the task is trivial, or `queryBypass: true` applies. Skips must be recorded as `choiceGateSkip`; silent skips fail Review.

**Codex visible multi-option choice rule**: In Codex, every user-visible `meta-theory` confirmation or decision surface must include a short multi-option choice card with at least two options and a recommended default. This applies to user-facing Decisions; Notices and summaries may stay concise unless they ask the user to choose. It is a presentation rule only: it does not turn every Notice into a popup, does not override `queryBypass`, and does not replace `preDecisionOptionFrame` or the formal Decision gate. The choice card must follow the runtime/tool selected output language first, then the user's explicit output-language choice, then the user's latest input language when no stronger language source exists, while required protocol identifiers such as `Critical` and `Fetch` stay canonical. If only one practical path exists, include the rejected alternative and the reason it was rejected. Claude Code native question tool behavior remains unchanged.

**Public/debug surface boundary**: Normal users should see the clean choice card, not the audit packet. Hide `Preflight`, `nativeChoiceSurface`, `conversation_fallback`, `Multi-Option Snapshot`, packet ids, and runtime plumbing by default. Show those fields only when the user explicitly asks for debug, audit, protocol, or governance trace output. If fallback behavior is relevant to expectation setting, explain it in plain language, for example: "This is a chat confirmation card, not a popup."

**Codex native surface boundary**: Codex's official `default_mode_request_user_input` feature flag enables `request_user_input` in Default mode; Meta_Kim's Codex config should set `[features] default_mode_request_user_input = true` so Codex can expose the native interaction surface when the active host supports it. Do not claim Codex produced a popup unless `request_user_input` was available and actually invoked. Codex exec and repository hook adapters cannot create native UI by themselves; they must use a localized `conversation_fallback` chat card and label it as a chat card, not a popup.

**Choice Surface Gate**: Before any runtime question tool, native choice, `request_user_input`, or `conversation_fallback`, record `choiceSurfaceState` as one of `not_allowed`, `critical_clarification_allowed`, `execution_confirmation_allowed`, or `completed`.

- `not_allowed` is the default before Critical classification. No visible choice surface may appear.
- `critical_clarification_allowed` applies only during Critical and only when Fetch cannot proceed safely. The question may clarify intent, scope, permission, safety, or language. It must not present execution options.
- `execution_confirmation_allowed` applies only after Fetch has produced `contentEvidencePacket` and Thinking has produced `preDecisionOptionFrame`, and before Execution begins. This is the normal consolidated execution confirmation.
- `completed` means the user has answered or an allowed skip has been recorded; do not ask again unless scope materially changes.

Popup or interaction testing is a requirement to route through the normal flow, not permission to skip to a native choice surface. If no evidence-backed candidate paths exist, the execution confirmation is premature. If Fetch evidence is missing, Thinking is incomplete. If Thinking is incomplete, pre-Execution confirmation is forbidden.

**Decision Triggers** (from `config/contracts/workflow-contract.json` → `userInteractionPolicy`):

1. `non_trivial_executable_decision`: executable work is not trivial and no explicit auto-proceed exists
2. `multiple_viable_solutions`: ≥2 solutions with clear trade-offs
3. `product_direction_required`: Business clarification needed
4. `security_or_rollback_risk`: Explicit acknowledgment required

**Option Quality Standard** (4-dimension rule):

| Dimension | Required |
|-----------|----------|
| `what_changes` | ✅ Specific scope of modification |
| `problem_solved` | ✅ Corresponding requirement or pain point |
| `advantages` | ✅ Why choose this approach |
| `disadvantages` | ✅ Costs or risks |

The decision context must cite `contentEvidencePacket` and `preDecisionOptionFrame`: what was inspected or searched, what remains uncertain, which paths are viable, and why the recommended path is best.

**Batch Decision Mode**:

When multiple independent questions exist, use `canonical/templates/user-interaction/batch-decision-template.md`. Detect dependencies:

- **Linear**: Later questions depend on earlier choices → sequential format
- **Parallel**: Independent decisions → batch list format

**Templates Reference**:

| Template | Path | When to Use |
|----------|------|-------------|
| Notice | `canonical/templates/user-interaction/notice-template.md` | Stage transitions, progress updates |
| Decision | `canonical/templates/user-interaction/decision-template.md` | Multiple viable options with trade-offs |
| Batch Decision | `canonical/templates/user-interaction/batch-decision-template.md` | Multiple independent questions |

### Card Governance Model

Meta_Kim no longer treats **dealing cards** as just a metaphor. In engineering terms:

- **dealer primary owner**: `meta-conductor`
- **dealer escalation owner**: `meta-warden`
- **interrupt signal sources**: `meta-sentinel`, `meta-prism`, `user`, `system`

This is intentionally **not** a new agent. It is a protocol role layered on top of Conductor/Warden so the system gains one explicit decision chain:

1. **Whether to deal**: `cardDecision`
2. **Deal to whom**: `cardAudience`
3. **When to deal**: `cardTiming`
4. **Which delivery shell**: `deliveryShell`

### Card Decision Objects

Every real run may emit card decisions through a `cardPlanPacket`. Each card records:

- `cardId`
- `cardType`
- `cardIntent`
- `cardDecision`
- `cardAudience`
- `cardTiming`
- `cardShell`
- `cardPriority`
- `cardReason`
- `cardSource`
- `cardSuppressed`
- `suppressionReason`
- `deliveryShellId`
- `choiceSurface`
- `userLanguage`

Card families:

| Card family | Meaning |
|------------|---------|
| `info` | information / clarification / status |
| `action` | route to execution, review, repair, rollback |
| `risk` | governance or safety intervention |
| `silence` | intentional no-card / defer / quiet-hold |
| `default` | preferred next move or default path |
| `upgrade` | escalation, handoff, or governance raise |

### Silence / No-Card Rule

Silence is a first-class decision, not a missing action.

Default principle:

```text
If there is no clear evidence that interruption is better,
prefer no-card / defer / intentional silence.
```

Run artifacts must therefore model:
- `noInterventionPreferred`
- `silenceDecision`
- `interruptionJustified`
- `deferUntil`
- `reasonForSilence`

### Skip / Interrupt / Override Rule

Meta_Kim distinguishes:

- **skip**: current step is intentionally not dealt because it is already known / already in context / not applicable
- **interrupt**: a risk or urgent governance signal temporarily inserts a card ahead of the default queue
- **override**: governance rules change the default path (for example, public display blocked until verification closes)
- **escalation_insert**: Warden / Sentinel / Prism inserts a governance owner into the chain

Every such move must emit a `controlDecision` with:
- `decisionType`
- `skipReason`
- `interruptReason`
- `overrideReason`
- `insertedGovernanceOwner`
- `emergencyGovernanceTriggered`
- `returnsToStage`
- `rejoinCondition`

---

## STAGE 1: Critical Analysis (Detailed)

### Task Classification Routing

Meta_Kim now uses a **two-layer classifier** so trigger decisions are reviewable instead of intuitive:

| Layer | Field | Allowed values | Purpose |
|-------|-------|----------------|---------|
| Intent layer | `taskClass` | `Q / A / P / S` | Preserve the canonical query / action / planning / strategic split |
| Runtime layer | `requestClass` | `query / execute / plan / strategy` | Explain what kind of ask the runtime saw |
| Governance layer | `governanceFlow` | `query / simple_exec / complex_dev / meta_analysis / proposal_review / rhythm` | Decide which execution path and gate set must run |

**Classification output fields**:
- `taskClass`
- `requestClass`
- `queryScope` (`current_project` | `all_projects`)
- `projectRef` (e.g., `project-abc123def456`)
- `registryStatus` (`known` | `prompt_join` | `joined` | `skipped`)
- `crossProjectReason` (required when `queryScope` = `all_projects`)
- `governanceFlow`
- `triggerReasons[]`
- `upgradeReasons[]`
- `bypassReasons[]`
- `ownerRequired`
- `decisionSource`
- `classifierVersion`

### Canonical Mapping

| `taskClass` | `requestClass` | Default `governanceFlow` | Default handling |
|-------------|----------------|--------------------------|------------------|
| `Q` | `query` | `query` | Direct answer only when pure-query conditions all hold |
| `A` | `execute` | `simple_exec` or `complex_dev` | Requires explicit owner; classify complexity before execution |
| `P` | `plan` | `complex_dev` or `proposal_review` | Plan first, then produce owner-routable packets |
| `S` | `strategy` | `meta_analysis` or `rhythm` | Warden / Conductor-led governance path |

### Trigger / Upgrade / Bypass Reasons

Record concrete reasons, not vibes:

- `triggerReasons`: `multi_file`, `cross_module`, `external_side_effect`, `durable_artifact`, `owner_missing`, `cross_runtime_sync`, `security_sensitive`, `verification_required`, `writeback_candidate`, `user_explicit_review`
- `upgradeReasons`: `cross_system_scope`, `review_or_verify_required`, `owner_creation_required`, `parallel_merge_required`, `business_workflow_upgrade`, `security_gate_required`
- `bypassReasons`: `pure_query`, `read_only_explanation`, `existing_verified_artifact_reuse`

### No-Agent Exception (strict)

The only valid no-agent path is:

```text
taskClass = Q
AND requestClass = query
AND governanceFlow = query
AND no file/code/config change
AND no external side effect
AND no durable artifact/handoff packet required
```

If any one of those conditions fails, the task must be treated as `A`, `P`, or `S`, and therefore must have an agent owner.

### Skip-Level Self-Reflection Gate

> Core question: **Should I be doing this, or should I dispatch it?**

Self-check list:
- [ ] Is the current role an implementation capability inside the Meta_Kim repository itself? (Yes → keep a governance meta owner and record the concrete capability as run-scoped `matchedSkills`; do not persist a non-meta owner in public Meta_Kim)
- [ ] Does the task involve writing code / modifying files? (Yes → must delegate to Execution Layer; meta-theory does not execute directly)
- [ ] Am I "conveniently" making decisions for the Execution Layer? (Yes → only provide constraints; let the Execution Layer judge implementation details autonomously)
- [ ] Did the previous round also do a similar task? (Yes → check if a Skip-Level pattern is forming, record Scars)

Skip-Level determination:
```
IF self-check has ≥1 hit AND taskClass = A
  → Mark as "should-dispatch task"
  → Assemble task package (context + constraints + deliverables)
  → Hand to Conductor for orchestration → dispatch to Execution Layer
  → Record Scars (if Skip-Level indeed occurred)
```

### Escalation Signals (pre-emptive)

> Unlike Skip-Level detection (which catches violations after the fact), Escalation Signals let the **dispatched agent itself** recognize it cannot handle the task — before wasting effort.

When dispatching to an agent, include this instruction in the task package:

```
If you detect any of these signals, STOP and report back immediately:
- Task exceeds your declared "Own" boundary
- Multiple failed attempts (>2) on the same sub-problem
- Cross-system dependencies you cannot trace from your context
- Security-sensitive changes requiring specialized review
- Irreversible operations (database migrations, production deploys)
```

Agent escalation response format:
```json
{
  "escalation": true,
  "reason": "why this exceeds my capability",
  "suggestedCapability": "what kind of agent/skill is needed instead",
  "workCompletedSoFar": "what I did manage to do before hitting the wall"
}
```

On receiving an escalation signal: re-enter Fetch (Stage 2) to find a more capable agent.

### Clarity Gate

| State | Condition | Action |
|-------|-----------|--------|
| **Confirmed** | User specified file paths OR ≥2 deliverables OR said "just do this" | → Stage 2 |
| **Probed** | Needs scope or priority clarification | → Follow-up Probe (max 2 rounds) |
| **Assumed** | Still vague after 2 rounds | Record assumptions, mark `clarity: "assumed"`, → Stage 2 |

Blocking Critical clarification is allowed only when Fetch cannot proceed safely. For non-trivial non-query work, do not ask runtime question tool, native choice, or fallback option questions during Critical merely because multiple paths might exist. First collect Fetch/content evidence, then build the Thinking-stage `preDecisionOptionFrame`, then ask one consolidated choice before Execution.

**Follow-up Probe Strategy**:
- Round 1: Ask about **scope** — "Which scenarios need support? Which can be deferred?"
- Round 2: Ask about **priorities** — "If time is tight, which parts can be cut?"
- Early Exit: Round 1 already specifies file paths OR ≥2 deliverables → skip Round 2

### Simplicity Push-Back Rule

Before proceeding from Critical to Fetch, check:

- If a simpler approach exists than what the user described, **state it explicitly and recommend it** — do not silently execute a complex plan when a simple one would do.
- No abstractions for single-use code, no error handling for impossible scenarios, no "flexibility" that wasn't requested.
- Self-test: "Would a senior engineer say this is overcomplicated?" If yes, simplify before dispatching.

### Complexity Routing

| File Changes | Complexity | Executed Path | Upgrade to 11-phase business workflow? |
|-------------|-----------|---------------|-------------------|
| 1 file, pure logic/style/comments | Simple | Execution → Review → Verification → Evolution (4 stages, still owner-driven) | No — 8-stage is the minimum; even these 4 stages suffice |
| 2-5 files, 1 module | Medium | Full 8-stage spine | No — 8-stage is the complete executable chain for medium complexity |
| >5 files OR cross-system OR multi-team | Complex | Full 8-stage spine, with escalation gates | **Yes** — upgrade to the full 11-phase business workflow when: (a) >5 files, (b) cross-system dependencies detected, (c) multi-team handoff required, (d) security-sensitive changes, or (e) business-workflow revision/summary/feedback/mirror phases are needed per the run contract |

**Upgrade Trigger Conditions** (any one is sufficient):
- File scope > 5 files
- Cross-system dependency detected (Stage 3 Thinking identifies shared components across module boundaries)
- Multi-team handoff required (business department + meta department coordination)
- Security-sensitive or permission-critical changes
- Business run contract explicitly requires the 11-phase business workflow (direction/planning/execution/review/meta-review/revision/verification/summary/feedback/evolution/mirror)

**Note**: The 8-stage spine is the **minimum executable chain** regardless of complexity. The 11-phase business workflow is an **upgrade layer** for complex scenarios — the 8 stages still run, and the business workflow adds direction refinement, summary, feedback, evolution, and mirror phases around the executable spine.

### Critical Stage Output

```json
{
  "taskClass": "A",
  "requestClass": "execute",
  "queryScope": "current_project",
  "projectRef": "project-abc123def456",
  "registryStatus": "known",
  "crossProjectReason": null,
  "governanceFlow": "complex_dev",
  "triggerReasons": ["multi_file", "durable_artifact"],
  "upgradeReasons": ["review_or_verify_required"],
  "bypassReasons": [],
  "requiresAgentOwner": true,
  "ownerRequired": true,
  "ownerPolicy": "reuse_existing_owner | upgrade_existing_owner | create_owner_first",
  "decisionSource": "classifier-v2",
  "classifierVersion": "v2",
  "skipLevel": "should-dispatch",
  "complexity": "medium",
  "clarity": "confirmed",
  "understanding": "one-sentence description of the task as understood",
  "scope": {
    "mustHave": ["item1", "item2"],
    "deferLater": ["item3"]
  }
}
```

---

## STAGE 2: Fetch — Discover Available Agents (Detailed)

**Purpose**: Search for agents / skills whose "Own" boundary matches the capability needed.

**⚠️ Execute all Fetch steps in order — no skipping.**

**Step 0.5 — Project Graph Context** (auto-detection, runs before Step 1):
```
CHECK: Does graphify-out/graph.json exist in the target project root?
  IF YES →
    - Verify freshness: compare graph.json mtime against git log last commit
    - If stale → run `graphify --update` (incremental, SHA256 cache)
    - Load graph metadata: node count, edge count, confidence distribution
    - Quality gate: if AMBIGUOUS nodes > 30% OR total nodes < 10 → mark as low-quality, agents use direct Read as primary
    - Record graphContext in Fetch output for downstream stages
  IF NO →
    - For Meta_Kim itself: fail the governance run and require `npm run meta:graphify:check` / graph rebuild before execution.
    - For external target projects: record graph absence in Fetch output and decide whether graph generation is required for the task.
```

**Step 1 — Local agent scan**:
```
Glob: .claude/agents/*.md
Read each file, verify it has `name:` YAML frontmatter (valid = registered agent)
Extract each agent's "Own / Do Not Touch" boundaries
Score match: does "Own" cover the needed capability?
```

**Step 1.5 — Global capability search** (fast keyword match via search index):
```
IF capability not found in local scan:
  Grep the capability-search-index.tsv in .meta-kim/state/{profile}/capability-index/
  Search by keyword (e.g., "review|audit", "debug|error", "frontend|ui")
  TSV format: type <tab> key <tab> name <tab> description <tab> trigger <tab> section_headings
  Each matching line identifies a candidate agent/skill with its platform and ID
  Score match from description and keywords
```

**Step 1.6 — Skill co-discovery** (run alongside agent search, NOT deferred to Evolution):
```
Using the SAME capability keywords from Step 1–1.5:
  Grep capability-search-index.tsv filtering for type=skills
  Collect matching providers, package IDs, concrete skill IDs, commands, and descriptions
  Record candidates in capabilitySearchResult per sub-task:
    {
      "subTaskId": "task-001",
      "capabilitySlot": "code quality review",
      "candidateProviders": ["superpowers", "ecc"],
      "candidateSkills": ["coding-standards", "code-security"],
      "candidateCommands": [],
      "source": "search-index"
    }
  Select concrete run-scoped entries only after scoring:
    { "subTaskId": "task-001", "selectedSkill": { "provider": "superpowers", "skillId": "coding-standards", "selectionScope": "run_scoped" } }
  ALSO check matched agent's YAML frontmatter for abstract capability slots or provider compatibility
    (pre-populated by previous Evolution runs — gives faster lookup without binding concrete skills)
  Merge both sources: search-index discovery + agent's abstract slots/provider compatibility
```

**Why Step 1.6 runs during Fetch, not Evolution**: The first run must already know which skills to use. Evolution only caches the discovery for faster future runs. Skill ignorance on first run = agent does worse work for no reason.

### Skill Binding Model (Fetch-time only)

Long-term agent identity may inherit only:

- abstract capability slots, such as `test generation`, `browser QA`, `security review`, or `planning discipline`
- meta-skill package providers, such as `superpowers` or `ecc`
- provider compatibility rules, such as required runtime, permission class, or expected artifact shape

Long-term agent identity must not inherit:

- concrete sub-skill IDs selected for one run
- shell commands selected for one run
- plugin sub-capabilities selected for one run
- prompts that force one provider's fixed tactic as the agent's permanent method

`superpowers` and `ecc` are capability providers / meta-skill package providers, not fixed playbooks. `findskill` is a runtime-local capability search entrypoint during Fetch, not a durable skill binding. A concrete sub-skill, command, or plugin sub-capability is valid only when written as a run-scoped selection in `capabilitySearchResult`, `selectedSkill`, `businessFlowBlueprintPacket`, `agentBlueprintPacket`, `workerTaskPacket`, or another current-run artifact.

Review and Evolution must reject any agent creation or agent iteration that copies a run-scoped `selectedSkill` into durable identity. Evolution may update an agent with a new abstract capability slot or provider compatibility rule, but not with the specific skill/command that happened to win one Fetch.

**Step 1.7 — Business-flow capability matrix** (run before final owner selection):

For executable deliverables, infer the likely `deliverableType` and expand it into business lanes before dispatching. The system must not only route the most obvious technical role; selected lanes should be justified by the current outcome, scope, and constraints.

| Deliverable type | Example dimensions to consider before omission |
|---|---|
| `web_app` / `dashboard` | product, UX, UI, frontend, backend/API, database/data, auth/security, motion, accessibility, test automation, browser QA, performance, release, feedback, evolution |
| `landing_page` | product offer, UX, UI, visual assets, frontend, motion, accessibility, SEO/analytics, browser QA, performance, release |
| `api_service` | internal interface contract, third-party integration contract, API contract, backend, database, auth/security, contract tests, observability/fallback, performance, docs, release |
| `internal_api_integration` | producer, consumer, schema/version compatibility, request/response field ledger, error model, contract tests, rollout/rollback |
| `third_party_integration` | provider facts, official docs/SDK/sandbox evidence, auth/signature, idempotency, callback/webhook, rate limits, timeout/retry, error model, observability/fallback, human approval |
| `data_pipeline` | data source, schema, transform, storage, observability, quality tests, privacy/security, release |
| `custom` | infer lanes from the user's outcome and justify omissions |

Each lane becomes a capability slot with:

```json
{
  "businessPhase": "planning | execution | review | verify | feedback | evolve | mirror",
  "spineStage": "Fetch | Thinking | Execution | Review | Verification | Evolution",
  "capabilityNeed": "frontend implementation",
  "capabilitySearchQuery": "frontend implementation owner + relevant skills",
  "capabilitySearchResult": {
    "capabilitySlot": "frontend implementation",
    "candidateProviders": ["superpowers", "ecc"],
    "candidateSkills": [],
    "candidateCommands": [],
    "searchEntrypoints": ["capability-index", "findskill"],
    "bindingPolicy": "run_scoped_selection_only"
  },
  "ownerLayer": "execution",
  "candidateOwners": [],
  "candidateSkills": [],
  "selectedSkill": null,
  "selectedOwner": null,
  "selectionReason": "why this owner best covers the lane",
  "coverageStatus": "covered | partial | missing | omitted_with_reason",
  "toolsOrMcp": [],
  "parallelPolicy": "single | shardable | same-agent-multi-instance | exclusive",
  "dependsOn": [],
  "mergeOwner": "short business role name",
  "gapAction": "reuse_existing_owner | upgrade_existing_owner | create_owner_first",
  "validation": []
}
```

The Fetch record must show which lanes were selected for this run, which lanes were explicitly omitted, and why. Each required or optional lane must preserve the global scan evidence (`capabilitySearchQuery`, `candidateOwners`, `candidateSkills`, `selectedOwner`, `selectionReason`, `coverageStatus`) so Review can tell whether the owner was selected capability-first. Omitted lanes without reasons fail the Review stage, but Review must not require every example dimension to appear in every run.

### Interface Integration Contract Layer

If the run touches an internal service boundary or a third-party provider, Fetch and Thinking must treat the interface contract as a first-class deliverable, not as implementation detail. Add `internal_interface_boundary` or `third_party_integration` to `taskClassification.triggerReasons` and produce `interfaceIntegrationContractPacket` before Stage 4 Execution.

Internal interface work must identify the producer, consumer, schema or contract artifact, versioning / breaking-change policy, request fields, response fields, error model, and consumer contract tests.

Third-party integration work must identify the provider, official evidence sources, SDK/API version, auth or signature policy reference, sandbox/prod distinction, rate limits, timeout/retry behavior, idempotency key, callback/webhook semantics, error-code mapping, data retention, observability, fallback, and rollback plan.

Field handling must use an evidence-backed field ledger:

- internal canonical field
- outbound provider field
- inbound provider field
- view binding field
- transformation rule
- error code
- state transition
- auth/signature parameter

Unknowns are not "maybe missing" prose. Classify each item as `confirmed`, `needs_verification`, `blocking_unknown`, or `assumption_with_rollback`. A `blocking_unknown` cannot enter public-ready completion; if implementation discovers a new blocking unknown, return to Thinking instead of patching guesses into code.

This layer does not parse OpenAPI automatically, store provider secrets, or make the model a source of truth. Facts must come from code, schema, official docs, SDK, Postman/curl samples, sandbox responses, production logs, provider confirmation, or human owner confirmation. Use references such as `authPolicyRef` or `secretRef`; never write real token values, API keys, passwords, or provider account credentials into a run artifact.

**Step 2 — Capability index search** (if no perfect local match):
```
IF config/capability-index/meta-kim-capabilities.json is missing OR stale
  → run npm run discover:global first

IF discover:global lists few skills/agents but the task needs Meta_Kim third-party skills (install-deps list)
  AND ~/.codex/skills or ~/.openclaw/skills are empty on this machine
  → operator should run npm run meta:deps:install:all-runtimes (or npm run meta:deps:install for Claude-only), then npm run discover:global again

Read config/capability-index/meta-kim-capabilities.json first
Then read the current runtime mirror
Then read .meta-kim/state/{profile}/capability-index/global-capabilities.json
Search for agents/skills declaring the needed capability
Score match

IF globalProjectRegistry is available (~/.meta-kim/global/project-registry.sqlite)
  → check whether other registered projects have relevant capabilities
  → record globalRegistryHits in fetchPacket
  → respect cross_project_readonly memory mode when using external project context
```

**Step 2.5 — Research Validation (conditional — MANDATORY when triggered)**

**Trigger condition** — activate when ANY of:
- `taskClassification.governanceFlow` is `meta_analysis`, `proposal_review`, or `complex_dev` involving external claims
- Task involves library/framework behavior, API compatibility, version-specific features, or deprecation notices
- Task requires verifying best practices, security advisories, or factual accuracy against external sources
- User explicitly requests research, verification, or fact-checking

**Execution**:

1. **Identify capability need**: Determine what information retrieval capabilities the task requires (e.g., "web search", "content fetch", "documentation lookup")

2. **Produce `researchCapabilityDiscovery`**: Search the current environment's actual tool inventory sources for tools that match the identified capability descriptors. Tool availability differs across runtimes (Claude Code, Codex, OpenClaw, Cursor) and user configurations (MCP servers, plugins) — use capability descriptors, not hardcoded tool names. Available tools might include built-in search tools, MCP-based search services, runtime-specific extensions, user-supplied sources, or only local project evidence. Record:
   - `runtimeContext.os` and `runtimeContext.runtimeFamily` only when known from the current run
   - `toolInventorySources` checked (`active_tools`, `deferred_tools`, `mcp`, `plugins`, `skills`, `commands`, `capability_index`, or `user_instruction`)
   - `availableRetrievalCapabilities[]` with descriptor, provider kind, status, proof, and limitations
   - `selectedResearchPath.mode` as `external_web`, `mixed`, `local_only`, `user_fallback`, or `blocked`
   - `capabilityGaps[]` with impact and handoff owner when a required retrieval capability is absent
   - `validatedBy: "meta-conductor"`

Do not record host-form-factor guesses such as `platformSurface`; they are not reliable capability evidence. Research proceeds from observed retrieval capability proof, not from whether the host looks like a CLI, desktop, web, IDE, plugin, or remote environment.

**Deep Research Requirement for the evidence owner**:

The evidence owner is not a keyword searcher. They must produce decision-grade research that can change the option frame. Deep research means:

- **Research plan**: state the core questions, source categories to inspect, and what evidence would change the recommendation.
- **Source breadth**: inspect local project evidence first, then external sources when the task depends on current facts, public APIs, ecosystem best practices, security, or version behavior.
- **Source quality**: prioritize primary sources, official docs, source repositories, changelogs, standards, issue trackers, and high-signal community evidence; mark weaker sources as lower confidence.
- **Cross-checking**: verify important claims against at least 2 independent sources or explain why only one authoritative source exists.
- **Contradictions and counterexamples**: record conflicting evidence, edge cases, and reasons a tempting option may fail.
- **Assumption ledger**: separate verified facts from assumptions, defaults, and open uncertainties.
- **Decision impact**: map each material finding to candidate options, user questions, risks, or rejected paths.
- **Traceability**: every option in `preDecisionOptionFrame` must cite the `contentEvidencePacket` findings that support it.

3. **Execute searches across ≥5 distinct source categories**:
   - Official vendor/standard documentation
   - Community knowledge bases (Q&A forums, discussion boards)
   - Source code repositories and changelogs
   - Technical articles, blogs, and tutorials
   - Specification documents, RFCs, or standards bodies
   - Additional categories as relevant to the domain

4. **Cross-reference findings**: Verify key claims against ≥2 independent sources. Flag any contradictions explicitly.

5. **Record in fetchPacket**:
```json
{
  "contentEvidencePacket": {
    "evidenceScope": "local_project | external_research | mixed",
    "researchCapabilityDiscovery": {
      "requiredCapabilities": ["web_search", "content_fetch", "documentation_lookup"],
      "runtimeContext": {
        "os": "windows | macos | linux | unknown",
        "runtimeFamily": "claude-code | codex | openclaw | cursor | other | unknown"
      },
      "toolInventorySources": ["active_tools", "mcp", "plugins", "capability_index"],
      "availableRetrievalCapabilities": [
        {
          "capability": "web_search | url_fetch | browser_open | docs_lookup | mcp_search | plugin_search | local_only | user_supplied_sources",
          "providerKind": "native_tool | mcp | plugin | skill | command | capability_index | user_supplied | none",
          "status": "available | partial | unavailable | blocked | unknown",
          "proof": "observed runtime/tool inventory evidence",
          "limitations": []
        }
      ],
      "selectedResearchPath": {
        "mode": "external_web | mixed | local_only | user_fallback | blocked",
        "reason": "why this path is valid for this run"
      },
      "capabilityGaps": [
        { "gap": "missing retrieval capability", "impact": "what cannot be verified", "handoff": "meta-scout | user | none" }
      ],
      "validatedBy": "meta-conductor"
    },
    "deepResearchPlan": {
      "questions": ["what must be true to choose the best path"],
      "sourceCategoriesPlanned": ["local-code", "official-docs", "source-repos"],
      "decisionImpactCriteria": ["what evidence would change the recommendation"]
    },
    "localSourcesRead": ["local files, graph nodes, capability index entries, docs, or external sources"],
    "contentFindings": [
      { "claim": "constraint or uncertainty that shapes viable options", "evidence": "source pointer", "confidence": "high | medium | low" }
    ],
    "capabilityEvidence": ["owner/skill matches from Fetch"],
    "sourceCategoryCoverage": ["local-code", "capability-index", "official-docs"],
    "crossReferenceMatrix": [
      { "claim": "material claim", "sources": ["source-a", "source-b"], "consistent": true }
    ],
    "contradictionLog": [
      { "claim": "conflicting claim", "conflict": "what disagrees", "resolution": "accepted | rejected | unresolved" }
    ],
    "assumptionLedger": [
      { "assumption": "default used when evidence is incomplete", "risk": "impact if false" }
    ],
    "decisionImpactMap": [
      { "finding": "contentFindings[0]", "impacts": ["candidateOptions.A", "question.scope"] }
    ],
    "researchRequired": true,
    "researchSkipReason": "none",
    "evidenceLaneValidatedBy": "meta-conductor"
  },
  "researchSources": [
    { "category": "official-docs", "summary": "...", "confidence": "high" },
    { "category": "community-qa", "summary": "...", "confidence": "medium" },
    { "category": "source-repos", "summary": "...", "confidence": "high" },
    { "category": "technical-articles", "summary": "...", "confidence": "medium" },
    { "category": "standards-specs", "summary": "...", "confidence": "high" }
  ],
  "researchCrossReferences": [
    { "claim": "...", "sources": ["source-a", "source-b"], "consistent": true }
  ]
}
```

**Research capability gate**: IF research is required and `contentEvidencePacket.researchCapabilityDiscovery` is missing, lacks checked inventory sources, lacks retrieval capability proof, uses `platformSurface`, or selects `external_web` / `mixed` without an available or partial external retrieval capability → BLOCK advancement to Thinking. If external verification is mandatory and `selectedResearchPath.mode` is `blocked`, surface the blocker or ask the user for a fallback source/path.

**Gate**: IF `researchSources` has entries from <5 distinct categories AND research is required → BLOCK advancement to Thinking. Complete research across ≥5 source categories first.

**Deep research gate**: IF research is required and the evidence owner does not provide `deepResearchPlan`, `sourceCategoryCoverage`, `crossReferenceMatrix`, `contradictionLog`, `assumptionLedger`, and `decisionImpactMap` → BLOCK advancement to `preDecisionOptionFrame`. A source list without decision impact is not deep research.

**Pre-decision gate**: IF non-trivial executable work lacks a `contentEvidencePacket` with inspected sources, constraints, and uncertainties → BLOCK advancement to runtime question surfaces and finalized orchestration. Build evidence first.

**Skip condition**: NOT required when `governanceFlow = query`, task scope is entirely local to project files (no external claims to verify), or user explicitly says "skip research" / "local only". Record skip reason in `fetchRecord.researchSkipReason`.

**Degradation path**: IF no required retrieval capability is available in the current runtime, record `researchRequired: true`, `researchValidationPerformed: false`, `selectedResearchPath.mode: "blocked"` or `"user_fallback"`, and a concrete capability gap / block reason. Inform the user or request user-supplied sources when external verification is mandatory. Do NOT silently proceed as if research was performed.

**Step 2.6 — Content Evidence Packet (mandatory before user choice for non-trivial non-query work)**

Before any runtime question tool, native choice, or conversation fallback that asks the user to choose an execution path, Fetch must emit:

```json
{
  "contentEvidencePacket": {
    "evidenceScope": "local_project | external_research | mixed",
    "researchCapabilityDiscovery": {
      "requiredCapabilities": ["local_only"],
      "runtimeContext": {
        "os": "windows | macos | linux | unknown",
        "runtimeFamily": "claude-code | codex | openclaw | cursor | other | unknown"
      },
      "toolInventorySources": ["capability_index", "user_instruction"],
      "availableRetrievalCapabilities": [
        {
          "capability": "local_only",
          "providerKind": "capability_index",
          "status": "available",
          "proof": "task is local-project only or user explicitly requested local-only",
          "limitations": ["no external freshness validation"]
        }
      ],
      "selectedResearchPath": {
        "mode": "local_only",
        "reason": "external research is not required for this run"
      },
      "capabilityGaps": [],
      "validatedBy": "meta-conductor"
    },
    "deepResearchPlan": {
      "questions": ["what must be true to choose the best path"],
      "sourceCategoriesPlanned": ["local files, graph nodes, capability indexes, or contracts"],
      "decisionImpactCriteria": ["what evidence would change the recommendation"]
    },
    "localSourcesRead": ["files, graph nodes, capability indexes, or contracts read"],
    "contentFindings": [
      { "claim": "what the content shows", "evidence": "source pointer", "confidence": "high | medium | low" }
    ],
    "capabilityEvidence": ["owner/skill matches from Fetch"],
    "sourceCategoryCoverage": ["local-code", "graph", "capability-index"],
    "crossReferenceMatrix": [
      { "claim": "material local claim", "sources": ["source-a", "source-b"], "consistent": true }
    ],
    "contradictionLog": [],
    "assumptionLedger": [
      { "assumption": "local-only evidence is sufficient", "risk": "external drift may be missed" }
    ],
    "decisionImpactMap": [
      { "finding": "contentFindings[0]", "impacts": ["candidateOptions.A"] }
    ],
    "researchRequired": false,
    "researchSkipReason": "local_project_only | pure_query | explicit_local_only | trivial",
    "evidenceLaneValidatedBy": "meta-conductor"
  }
}
```

Skip is allowed only for `trivial`, `pure_query` / `queryBypass`, or explicit user auto-proceed / local-only instructions. The skip reason must be recorded here and copied into the later `preDecisionOptionFrame.choiceGateSkip`.

**Step 3 — External skill discovery** (if the local + indexed baseline still has no perfect match):
```
Invoke the **findskill** skill
Search the Skills.sh ecosystem for the missing capability
Record what was searched and what was found
```

**Step 4 — Specialist ecosystem fallback** (if the external search still finds no clean winner):
```
Search known specialist ecosystems already integrated by Meta_Kim:
- everything-claude-code agents
- gstack specialist skills
- other globally installed runtime-native agents / skills from the capability index
```

**Step 5 — Owner resolution branch** (if no match found):

**Step 5a — Output `capabilityGapPacket` (mandatory):**
```json
{
  "capabilityGapPacket": {
    "gapCapability": "[capability description]",
    "gapType": "durable | recurring | project-specific | one-off",
    "searchedSources": ["local-agents", "capability-index", "global-registry", "findskill", "specialist-ecosystem"],
    "bestPartialMatch": null,
    "resolutionAction": "pending_user_confirmation",
    "userConfirmationRequired": true
  }
}
```

**Step 5b — User confirmation gate:**
```
IF gap is durable / recurring / project-specific
  → route to Warden-approved governance owner upgrade or governance meta-agent creation
  → Genesis/Artisan/Sentinel/Librarian/Prism participate as required
ELSE (gap is one-off / emergency)
  → keep the selected governance meta owner
  → record missing or partial run-scoped matchedSkills
  → block or defer with capabilityGapPacket; do not persist a generalPurpose owner
```

**Step 5c — Record gap resolution in `fetchPacket`:**
```json
{
  "gapResolution": {
    "userAsked": true,
    "userResponse": "approved | declined | one-off-auto",
    "resolutionPath": "governance-owner-upgrade | governance-owner-create | run-scoped-skill-gap",
    "evolutionFollowUpRequired": true
  }
}
```

### Match Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 3 | Perfect match — "Own" covers exactly what is needed | Invoke directly |
| 2 | Partial match — covers most, some gaps | Invoke + note gaps |
| 1 | Weak match — tangentially related | Invoke + note significant gaps |
| 0 | No match | Capability gap detected → Step 5 owner-resolution branch |

### Owner Resolution Rules

| Situation | Resolution |
|----------|------------|
| Existing governance meta owner covers the orchestration node | `ownerResolution = reuse_existing_owner`; use that `meta-*` owner and record implementation capability in run-scoped `matchedSkills` |
| Existing governance owner partially covers the work but needs a durable boundary update | `ownerResolution = upgrade_existing_owner`; emit `capabilityGapPacket`, then update the governance owner boundary / contract through Warden-approved writeback |
| No governance owner covers a recurring public-repo governance need | `ownerResolution = create_owner_first`; create or compose a governance meta owner only after Warden approval |
| Implementation capability exists only as a concrete skill/tool/external worker | Keep the governance owner; record concrete capability as `matchedSkills` with `skillSelectionScope = run_scoped` |

Temporary non-meta ownership is **not allowed** in public Meta_Kim durable artifacts. In user projects, non-meta execution ownership is allowed only as direct global reuse or justified project-local creation/upgrade under governance review.

### Tier-Aware Routing

> Not all tasks need Opus-level agents. Match task complexity to agent weight to optimize context consumption and speed.

After scoring candidates, apply tier preference:

| Task Complexity | Preferred Tier | Rationale |
|----------------|---------------|-----------|
| Simple (1 file, pure logic) | Lightweight agent (e.g., `model: "haiku"`) | Fast, cheap, sufficient |
| Medium (2-5 files) | Standard agent (default model) | Balanced |
| Complex (>5 files, cross-layer) | Full-weight agent (e.g., `model: "opus"`) | Deep reasoning needed |

Tier selection rule:
```
IF complexity = "simple" AND candidate has lightweight variant
  → Prefer the lightweight variant (saves context, faster)
ELSE
  → Use the default agent as matched
```

This is a **preference**, not a hard rule — if the lightweight agent escalates (see Escalation Signals), re-dispatch to the full-weight version.

### Fetch Stage Output

```json
{
  "capabilityNeeded": "code quality review",
  "graphContext": {
    "available": false,
    "suggestedForProjectsWithMoreThan": 20,
    "path": null,
    "nodeCount": null,
    "edgeCount": null,
    "confidenceDistribution": null,
    "quality": null
  },
  "fetchPacket": {
    "projectsChecked": ["current_project"],
    "projectLocalSources": [".claude/agents", ".claude/skills"],
    "globalRegistryHits": [],
    "capabilityMatches": [
      { "name": "code-reviewer", "source": "global", "score": 3, "matchReason": "Own covers code quality review" }
    ],
    "capabilityGaps": [],
    "graphSources": [],
    "knowledgeSources": []
  },
  "searchTrail": [
    "local-agents",
    "global-capability-index",
    "global-project-registry",
    "findskill",
    "specialist-ecosystem"
  ],
  "candidates": [
    { "name": "code-reviewer", "source": "global", "score": 3, "matchReason": "Own covers code quality review" }
  ],
  "selected": { "name": "code-reviewer", "score": 3 },
  "capabilityGap": null,
  "ownerMode": "reuse_existing_owner",
  "createOwnerRecommended": false,
  "temporaryOwnerJustification": null,
  "fallbackUsed": false
}
```

---

## STAGE 3: Thinking — Plan the Approach (Detailed)

**Purpose**: Explore solution paths, identify risks, decompose into sub-tasks. This stage bridges Fetch and Execution.

### Step 1: Option Exploration
Analyze at least 2 possible solution paths:

| Path | Approach | Pros | Cons |
|------|----------|------|------|
| A | [approach description] | [reasons] | [reasons] |
| B | [alternative approach] | [reasons] | [reasons] |

### Step 1.5: Pre-decision Option Frame

Before invoking a runtime question tool, native choice, or conversation fallback for a non-trivial non-query run, Thinking must package the options as candidate orchestration, not final dispatch:

```json
{
  "preDecisionOptionFrame": {
    "builtFromContentEvidence": true,
    "contentEvidenceRefs": ["contentEvidencePacket.contentFindings[0]"],
    "candidateOptions": [
      {
        "optionId": "A",
        "whatChanges": "candidate scope",
        "problemSolved": "requirement or pain point",
        "expectedResult": "what the user gets",
        "advantages": ["why choose it"],
        "disadvantages": ["cost or risk"],
        "candidateOwners": ["capability-matched owners from Fetch"],
        "candidateTaskShape": ["candidate lanes or task packets, not finalized workerTaskPackets"]
      }
    ],
    "recommendedDefault": "A",
    "requiresUserChoice": true,
    "nativeChoiceSurface": "runtime_question_tool | request_user_input | native_choice | conversation_fallback",
    "choiceGateSkip": null,
    "reviewOwner": "meta-prism"
  }
}
```

`candidateTaskShape` may describe likely lanes, dependencies, and owner candidates. It must not be treated as `dispatchEnvelopePacket`, `dispatchBoard`, or `workerTaskPackets`; those are finalized only after the user choice or a valid skip. Valid skips are limited to trivial work, pure read-only/queryBypass, or explicit auto-proceed, and must record `skipReason`, `skipSource`, and `skipSafetyRationale` in `choiceGateSkip`.

### Respect user choices (after questioning)

After a native question tool, `request_user_input`, native choice surface, or `conversation_fallback` collects user answers, the post-choice analysis must close around the user's actual selections:

- Base the analysis on the user's actual selections, not on what the model "thinks is better".
- If a user choice carries significant risk, identify it in `Thinking` with specific evidence and trade-off reasoning.
- If the system wants to recommend a different direction, the next action must present exactly two clear paths:
  - **Option A**: Execute based on the user's original choice.
  - **Option B**: Execute based on the suggested adjustment.
- Do not unilaterally override their selection, silently rewrite the dispatch direction, or treat the recommended default as more authoritative than the user's answer.

This is an autonomy boundary: the system may inform, warn, and offer a safer adjustment, but the user owns the final path unless the selected path is blocked by safety, permissions, or impossible constraints.

### Step 2: Risk Identification

| Signal | Type | Mitigation |
|--------|------|------------|
| Shared component modification | Risk Card | Notify user before proceeding |
| Auth/permission logic involved | Risk Card | Surface immediately |
| >3 files affected | Cross-contamination risk | Mark for Review |
| No matching agent found | Capability gap | Record + suggest Type B |

### Step 3: Decision Gate

For non-trivial executable work, invoke a runtime question tool, native choice, or conversation fallback after `preDecisionOptionFrame` is complete. Proceed without that decision only when:

- the user explicitly requested auto-proceed / "just do it" / "不需要确认"
- the run is a pure query with `queryBypass: true`
- the task is trivial and low risk

When skipped, record `choiceGateSkip` in both `preDecisionOptionFrame.choiceGateSkip` and `intentGatePacket.defaultAssumptions`.

### Step 4: Post-decision Task Decomposition

Break Stage 1's task into independent sub-tasks:

```json
{
  "subTasks": [
    {
      "id": 1,
      "description": "what specifically to do",
      "owner": "short business role display name",
      "ownerAgent": "agent type from Stage 2",
      "businessRoleId": "frontend",
      "roleDisplayName": "frontend",
      "roleInstanceId": "frontend#home-page",
      "runtimeInstanceAlias": "optional host nickname only",
      "ownerMode": "reuse_existing_owner | upgrade_existing_owner | create_owner_first",
      "parallel": true,
      "parallelGroup": "group-a",
      "dependsOn": [],
      "mergeOwner": "agent responsible for consolidation",
      "taskPacketId": "task-001",
      "shardKey": "route | component-area | file-scope | test-suite | data-domain",
      "shardScope": ["specific files, routes, modules, or test suite"],
      "workspaceIsolation": "same_workspace_readonly_overlap | isolated_worktree | file_lock_required",
      "artifactNamespace": "frontend",
      "collisionPolicy": "no_overlap | merge_by_owner | lock_required",
      "fileScope": ["file-or-module-a", "file-or-module-b"],
      "constraints": ["boundary1", "dependency1"],
      "capabilitySearchResult": {
        "capabilitySlot": "frontend implementation",
        "candidateProviders": ["superpowers", "ecc"],
        "candidateSkills": ["skill-id-1", "skill-id-2"],
        "candidateCommands": [],
        "searchEntrypoints": ["capability-index", "findskill"],
        "bindingPolicy": "run_scoped_selection_only"
      },
      "selectedSkill": {
        "provider": "superpowers",
        "skillId": "skill-id-1",
        "command": null,
        "selectionReason": "best ROI for this task after Fetch",
        "selectionScope": "run_scoped"
      }
    }
  ]
}
```

`capabilitySearchResult` and `selectedSkill` come from Fetch Step 1.6. They are run-scoped and may be included in the dispatch prompt for this execution only. Do not copy `selectedSkill.skillId`, `selectedSkill.command`, or any plugin sub-capability into the agent's durable SOUL, identity, boundary, or permanent recommended skill list. Durable agent updates may mention only abstract capability slots and provider compatibility.

`dispatchEnvelopePacket`, `dispatchBoard`, and `workerTaskPackets` are finalized only after the user decision or allowed skip is recorded. If these artifacts are finalized before `preDecisionOptionFrame` and `userDecisionPacket` / `choiceGateSkip`, Review must fail the run.

**Short business role naming rule**: The user-facing `owner` / `roleDisplayName` must name the coarse role family, not the platform nickname, a long task sentence, or a concrete work item. Use names such as `frontend`, `backend`, `test`, `database`, or `security`. Put feature, page, installation, shard, or work-item scope in `roleInstanceId`, `shardScope`, `assignedResponsibilitySlice`, or the worker task text. Random personal aliases assigned by the host runtime are stored only in `runtimeInstanceAlias`; they must not appear as the primary role name in the task board or final summary.

**Same-agent multi-instance rule**: The same `ownerAgent` can appear in multiple packets when the work is shardable. This is valid only when each packet has a distinct `roleInstanceId`, `shardKey`, non-overlapping or locked `shardScope`, explicit `workspaceIsolation`, a unique `artifactNamespace`, an explicit `collisionPolicy`, and one unified `mergeOwner` for the parallel group. Without those fields, repeated ownerAgent entries are treated as fake parallelism and fail the decomposition gate.

### Step 4.5: Protocol-First Dispatch Artifacts

After the decision gate closes, Thinking must lock down the execution protocol before any `Agent` tool invocation begins:

```json
{
  "taskClassification": {
    "taskClass": "A",
    "requestClass": "execute",
    "queryScope": "current_project",
    "projectRef": "project-abc123def456",
    "registryStatus": "known",
    "crossProjectReason": null,
    "governanceFlow": "complex_dev",
    "triggerReasons": ["multi_file", "durable_artifact"],
    "upgradeReasons": ["review_or_verify_required"],
    "bypassReasons": [],
    "ownerRequired": true,
    "decisionSource": "classifier-v2",
    "classifierVersion": "v2"
  },
  "contentEvidencePacket": {
    "evidenceScope": "local_project",
    "localSourcesRead": [],
    "contentFindings": [],
    "capabilityEvidence": [],
    "researchRequired": false,
    "researchSkipReason": "local_project_only",
    "evidenceLaneValidatedBy": "meta-conductor"
  },
  "preDecisionOptionFrame": {
    "builtFromContentEvidence": true,
    "candidateOptions": [],
    "requiresUserChoice": true,
    "nativeChoiceSurface": "conversation_fallback",
    "choiceGateSkip": null,
    "reviewOwner": "meta-prism"
  },
  "runHeader": {
    "department": "team or department",
    "primaryDeliverable": "single deliverable name",
    "audience": "who the result is for",
    "freshnessRequirement": "freshness rule",
    "visualPolicy": "visual strategy",
    "handoffPlan": "how the chain closes"
  },
    "cardPlanPacket": {
    "dealerOwner": "meta-conductor",
    "dealerMode": "conductor-primary-warden-escalation",
    "cards": [
      {
        "cardId": "card-001",
        "cardType": "action",
        "cardIntent": "execute",
        "cardDecision": "deal",
        "cardAudience": "owner",
        "cardTiming": "next_stage",
        "cardShell": "agent_dispatch",
        "cardPriority": 8,
        "cardReason": "work is ready for owner execution",
        "cardSource": "meta-conductor",
        "cardSuppressed": false,
        "suppressionReason": "",
        "deliveryShellId": "shell-tech-detail",
        "choiceSurface": "conversation_fallback",
        "userLanguage": "match_latest_user_message"
      }
    ],
    "deliveryShells": [
      {
        "deliveryShellId": "shell-tech-detail",
        "shellType": "technical_detail",
        "presentationMode": "direct",
        "exposureLevel": "internal",
        "interventionForm": "agent_dispatch",
        "audience": "developer-owner",
        "contentBoundary": "implementation packet only",
        "userLanguage": "match_latest_user_message",
        "languageSource": "latest_user_message_or_explicit_preference"
      }
    ],
    "silenceDecision": {
      "silenceDecision": "defer",
      "noInterventionPreferred": true,
      "interruptionJustified": false,
      "deferUntil": "verification-complete",
      "reasonForSilence": "no additional push is better while verification is pending"
    },
    "controlDecisions": [
      {
        "decisionId": "ctl-001",
        "decisionType": "interrupt",
        "skipReason": "",
        "interruptReason": "security_risk",
        "overrideReason": "",
        "insertedGovernanceOwner": "meta-sentinel",
        "emergencyGovernanceTriggered": true,
        "returnsToStage": "verification",
        "rejoinCondition": "critical risk reviewed"
      }
    ],
    "defaultShellId": "shell-tech-detail"
  },
  "dispatchBoard": {
    "boardId": "dispatch-001",
    "goal": "one sentence goal",
    "ownerResolution": "reuse_existing_owner | upgrade_existing_owner | create_owner_first"
  },
  "businessFlowBlueprintPacket": {
    "deliverableType": "web_app",
    "requiredLanes": [
      {
        "laneId": "lane-frontend",
        "businessLane": "frontend",
        "capabilityNeed": "frontend implementation",
        "capabilitySearchQuery": "frontend implementation owner + UI skills",
        "candidateOwners": ["meta-conductor", "meta-artisan"],
        "candidateSkills": ["browser", "react-best-practices"],
        "selectedOwner": "meta-conductor",
        "selectionReason": "Conductor owns orchestration while concrete frontend implementation is represented as run-scoped matchedSkills",
        "coverageStatus": "covered"
      }
    ],
    "optionalLanes": [
      {
        "laneId": "lane-motion",
        "businessLane": "motion",
        "capabilityNeed": "interaction animation",
        "capabilitySearchQuery": "motion interaction owner",
        "candidateOwners": [],
        "candidateSkills": [],
        "selectedOwner": null,
        "selectionReason": "No motion requirement in user outcome",
        "coverageStatus": "omitted_with_reason"
      }
    ],
    "omittedLanes": [{ "lane": "database", "reason": "static-only site with no persisted user data" }],
    "laneDependencies": [{ "from": "ux", "to": "frontend", "type": "handoff" }],
    "coverageJudgment": "complete | incomplete | intentionally_reduced",
    "blueprintSource": "canonical_template | inferred | user_supplied",
    "blueprintVersion": "v1"
  },
  "agentBlueprintPacket": {
    "roles": [
      {
        "businessRoleId": "frontend",
        "roleDisplayName": "frontend",
        "ownerAgent": "meta-conductor",
        "capabilityNeed": "frontend implementation",
        "assignedResponsibilitySlice": "Implement the home route UI from the UX and UI handoff",
        "ownerResponsibilityDelta": "Reuse existing frontend implementation boundary; narrow it to home route files",
        "agentIterationPlan": "Dispatch with exact route scope, run-scoped selectedSkill entries, shard rules, and verification steps",
        "ownerResolution": "reuse_existing_owner",
        "matchedSkills": [
          {
            "matchId": "skill-match-frontend-001",
            "capabilitySlot": "frontend implementation",
            "providerId": "superpowers",
            "skillId": "test-driven-development",
            "toolOrCommand": null,
            "source": "capability-index",
            "roiScore": 4,
            "selectionReason": "Best run-scoped implementation discipline; not persisted into durable identity",
            "selectionScope": "run_scoped",
            "persistencePolicy": "do_not_persist_to_agent_identity",
            "fallback": "Return to Thinking and emit capabilityGapPacket"
          }
        ],
        "skillSelectionScope": "run_scoped",
        "governanceStageNodes": [
          { "stage": "Fetch", "ownerAgent": "meta-artisan", "responsibility": "skill/tool matching" },
          { "stage": "Thinking", "ownerAgent": "meta-conductor", "responsibility": "role sequencing" },
          { "stage": "Review", "ownerAgent": "meta-prism", "responsibility": "quality and contract review" }
        ],
        "abstractCapabilitySlots": ["frontend implementation", "browser QA handoff"],
        "providerCompatibility": ["superpowers", "ecc"],
        "durableSkillBindingPolicy": "abstract_slots_and_providers_only",
        "minInstances": 1,
        "maxInstances": 3,
        "parallelizable": true,
        "handoffInputs": ["ux-flow", "ui-spec"],
        "handoffOutputs": ["implemented route"]
      }
    ],
    "roleCoverageGate": "pass | fail",
    "missingRoles": [],
    "duplicateRolePolicy": "allow_instances_when_sharded",
    "namingPolicy": {
      "roleDisplayNameRequired": true,
      "businessSemanticNamesOnly": true,
      "shortRoleNamesRequired": true,
      "runtimeNicknamesAreAliasesOnly": true
    }
  },
  "workerTaskPackets": [
    {
      "packetId": "task-001",
      "owner": "meta-conductor",
      "ownerAgent": "meta-conductor",
      "businessRoleId": "frontend",
      "roleDisplayName": "frontend",
      "roleInstanceId": "frontend#home-page",
      "runtimeInstanceAlias": "optional host nickname only",
      "ownerMode": "reuse_existing_owner",
      "dependsOn": [],
      "parallelGroup": "group-a",
      "mergeOwner": "meta-warden",
      "shardKey": "route",
      "shardScope": ["home"],
      "workspaceIsolation": "same_workspace_readonly_overlap",
      "artifactNamespace": "frontend",
      "collisionPolicy": "no_overlap",
      "deliverableLink": "how this packet connects back to the primary deliverable",
      "capabilitySearchResult": {
        "capabilitySlot": "frontend implementation",
        "candidateProviders": ["superpowers", "ecc"],
        "candidateSkills": ["skill-id-1", "skill-id-2"],
        "candidateCommands": [],
        "searchEntrypoints": ["capability-index", "findskill"],
        "bindingPolicy": "run_scoped_selection_only"
      },
      "selectedSkill": {
        "provider": "superpowers",
        "skillId": "skill-id-1",
        "command": null,
        "selectionReason": "best ROI for this task after Fetch",
        "selectionScope": "run_scoped"
      }
    }
  ],
  "resultMergePlan": {
    "mergeOwner": "agent responsible for consolidation",
    "consolidationArtifact": "single deliverable artifact"
  }
}
```

If `agentBlueprintPacket.roleCoverageGate` is `fail`, `missingRoles` is non-empty, or any role has `ownerResolution` of `upgrade_existing_owner` or `create_owner_first`, Thinking must emit a `capabilityGapPacket` and require an approved governance-owner decision before any Stage 4 dispatch. The role may not be replaced with a generic or non-meta worker in public Meta_Kim.

Independent work that can be parallelized must be marked with the same `parallelGroup`. Any task that has no declared `owner`, `ownerAgent`, `businessRoleId`, `roleDisplayName`, `roleInstanceId`, `dependsOn`, `shardKey`, `shardScope`, `workspaceIsolation`, `artifactNamespace`, `collisionPolicy`, and `mergeOwner` is not ready for Execution.

### Step 3.6: Decomposition Acceptance Gate

Before proceeding to Step 4, the plan must pass this gate:

| Check | Condition | Fail Action |
|-------|-----------|-------------|
| **Multi-file / multi-capability** | Task spans >1 file OR >1 capability dimension | MUST produce >= 2 `workerTaskPackets` |
| **Single-Packet Anti-Pattern** | Only 1 packet produced for a multi-file / multi-capability task | REJECT — re-decompose or justify why a single packet is genuinely sufficient (single-file, single-capability, pure logic change) |
| **Business-flow coverage** | `businessFlowBlueprintPacket` covers expected lanes or documents omitted lanes with reasons | REJECT — add missing lanes or omission reasons |
| **Short business role names** | `roleDisplayName` uses a coarse role-family form (`frontend`, `backend`, `test`); runtime nicknames and scoped work items are aliases or instance scope only | REJECT — replace personal/random names, scoped work items, or long task descriptions with coarse business role names |
| **Role responsibility assignment** | Every `agentBlueprintPacket.roles[]` entry declares `ownerSource`, `agentCopyPolicy`, `assignedResponsibilitySlice`, `ownerResponsibilityDelta`, `agentIterationPlan`, `ownerResolution`, `matchedSkills`, `skillSelectionScope`, and `governanceStageNodes`; direct global reuse is not copied, project-local copy requires upgrade intent, and new execution agents require `create_project_local_agent` | REJECT — fill the role source, copy policy, iteration, and skill-match fields before worker packets |
| **Role coverage gap** | Failed `roleCoverageGate`, non-empty `missingRoles`, or `ownerResolution = upgrade_existing_owner | create_owner_first` has `capabilityGapPacket` and approved governance-owner decision | REJECT — upgrade/create governance owner or block the run |
| **Same-agent multi-instance** | Repeated `ownerAgent` entries have unique `roleInstanceId`, shard scope, artifact namespace, isolation/collision policy, and one merge owner | REJECT — add shard/merge rules or make the work sequential |
| **Packet completeness** | Every packet has non-empty `owner`, `ownerAgent`, `businessRoleId`, `roleDisplayName`, `roleInstanceId`, `dependsOn` (or explicit `[]`), `parallelGroup`, `mergeOwner`, `shardKey`, `shardScope` | REJECT — fill missing fields |

Single-packet justification is only valid when ALL of: (1) exactly 1 file, (2) exactly 1 capability dimension, (3) no cross-module impact, (4) no durable artifact handoff.

Output:
```json
{
  "decompositionGate": {
    "packetCount": 2,
    "multiFileOrMultiCapability": true,
    "singlePacketJustification": null,
    "gateResult": "PASS"
  }
}
```

### Step 3.7: Planning Files Supplement (Mandatory)

**This step is SUPPLEMENT, not replacement.** It does NOT replace any protocol artifacts from Steps 3–3.6. It creates persistent planning files alongside the dispatch protocol for human visibility and cross-session continuity.

When `planning-with-files` skill is installed, invoke it first (`/planning-with-files` via Skill tool) and let its templates drive file creation. When not installed, create files manually using the templates below.

**Files to create** (in project root, NOT in skill directory):

| File | Purpose | Source Data |
|------|---------|-------------|
| `task_plan.md` | Phase roadmap, decisions, errors | Stages 1–3 scope, decomposition, protocol artifacts |
| `findings.md` | Research, discoveries, technical decisions | Fetch results, capability matches, skill discoveries |
| `progress.md` | Session log, test results, error log | All stage actions as they complete |

**Creation rules:**

1. `task_plan.md` — Populate Goal from Stage 1 scope; Phases from Step 3 decomposition (each `workerTaskPacket` = one phase); Key Questions from Clarity Gate; Decisions from option exploration.
2. `findings.md` — Populate Requirements from user request; Research Findings from Fetch Stage 2 results; Technical Decisions from Step 3 option exploration; Resources from capability index matches.
3. `progress.md` — Create session header; log Stages 1–3 actions as Phase 1 entries.

**Update rules (supplement throughout the run):**

- After Stage 4 (Execution): update `progress.md` with agent outputs, files created/modified, test results.
- After Stage 5 (Review): update `progress.md` with review findings; update `findings.md` with issues discovered.
- After Stage 6 (Meta-Review): update `task_plan.md` phase statuses.
- After Stage 7 (Verification): update `progress.md` with verification results.
- After Stage 8 (Evolution): mark all phases complete in `task_plan.md`; log evolution writebacks in `findings.md`.

**Conductor is the sole writer.** No other agent writes planning files. Sub-agents return results; Conductor (or the dispatcher thread acting as Conductor) persists them.

**Skip condition:** Only skip when `queryBypass: true` (pure query, no file modifications). For all Type A/B/C/D/E runs with execution, this step is MANDATORY.

### Step 4: `cardDeck` (stage-card rhythm) + delivery plan

Thinking must translate the plan into a **`cardDeck`** — the canonical Stage 3 artifact for stage-card rhythm (sequencing / lanes — not legacy “Planning / Guidance / Direction” card names). Each entry is one **stage-card intent** (priority, lane, skip/interrupt hooks). Conductor owns concrete dealing on the dispatch board; Thinking outputs `cardDeck` constraints and decomposition only.

```json
{
  "cardDeck": [
    {
      "stage": "Thinking",
      "priority": 8,
      "laneIntent": "decompose-and-surface-risks",
      "skipCondition": "task is simple and already decomposed",
      "interruptTrigger": "security-risk or scope-drift"
    }
  ],
  "deliveryShellPlan": [
    {
      "audience": "user",
      "channel": "conversation",
      "shell": "structured-status"
    }
  ],
  "interruptChannels": [
    { "source": "sentinel", "severity": "critical", "action": "pause and front-load interrupt" },
    { "source": "prism", "severity": "high", "action": "insert before next execution stage" }
  ]
}
```

### Step 6: Decision Record

```json
{
  "selected": "A",
  "reason": "why this path was chosen over alternatives",
  "rejectedOptions": [{ "path": "B", "reason": "why not chosen" }],
  "risks": [{ "type": "shared-component", "mitigation": "notify user" }]
}
```

### Thinking Stage Output Contract

```json
{
  "contentEvidencePacket": {},
  "preDecisionOptionFrame": {},
  "userDecisionPacket": {},
  "choiceGateSkip": null,
  "subTasks": [],
  "taskClassification": {},
  "runHeader": {},
  "cardPlanPacket": {},
  "dispatchBoard": {},
  "workerTaskPackets": [],
  "resultMergePlan": {},
  "cardDeck": [],
  "deliveryShellPlan": [],
  "interruptChannels": [],
  "reviewPlan": ["code-quality", "security"],
  "reviewPacketPlan": ["owner-coverage", "protocol-compliance", "quality-findings", "finding-closure-model"],
  "metaReviewGate": "complexity=complex OR abnormal review confidence",
  "verificationGate": "all failed assertions must be re-run with fresh evidence",
  "verificationPacketPlan": ["fixEvidence", "revisionResponses", "verificationResults", "closeFindings", "regressionGuard"],
  "summaryPacketPlan": ["verifyPassed", "summaryClosed", "deliverableChainClosed", "publicReady"],
  "evolutionWritebackPlan": ["writebackDecision", "agent-boundary", "skill", "contract", "scar"],
  "evolutionFocus": ["pattern reuse", "boundary drift", "process bottlenecks"]
}
```

---

## STAGE 4: Execution — Delegate to Agents (Detailed)

**⚠️ Core Rule: meta-theory does NOT write code directly.**

**Orchestration**: Conductor's task board drives execution. In public Meta_Kim, sub-tasks are mapped to governance meta owners plus run-scoped skills/tools discovered via Fetch-first pattern, not hardcoded by non-meta agent name. Conductor orchestrates; concrete implementation capability is evidence in `matchedSkills`, not a durable public owner.

### Step 1: Invoke selected agents from Stage 2

For each sub-task from Stage 3, invoke the matched agent:
```
Agent(
  subagent_type="<selected agent from Stage 2>",
  prompt="""
  Packet: [workerTaskPacket JSON]
  Task: [sub-task description]
  Constraints: [boundaries from Stage 3]
  Deliverable: [expected output format]
  Graph context: [IF graphContext.available, include compressed subgraph relevant to this task's fileScope — node topology, dependency edges, confidence notes for AMBIGUOUS nodes. Graph context tells WHERE things are; for HOW they work, always Read the actual source files.]
  """
)
```

### Step 2: Parallel/Sequential Decision
- No dependency edges + non-overlapping file scopes → **must run in parallel**
- Shared files, explicit dependency edges, or shared consolidation step → **sequential**
- Every parallel lane must declare a `parallelGroup`
- Every parallel group must declare one `mergeOwner`

### Step 2.5: Execute in stage order

Execution must respect the Stage 3 **`cardDeck`** (stage-card sequence / control interrupts — delegated to Conductor for actual dealing):
- Run stages in agreed order unless a control interrupt (silence / skip / risk) is active
- Insert intentional silence when the overload rule is hit
- Use the selected Delivery Shell when reporting progress or handing off results

### Step 3: Result Aggregation
- Which files were modified
- Any conflicts to resolve
- Any sub-task failures → handle via fault protocol
- Every result returns through a `WorkerResultPacket`, not free-form orphan output

### Surgical Change Hygiene (Karpathy-inspired)

Every public governed execution lane must obey these constraints:

- **Touch only what you must.** Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style, even if you'd do it differently.
- **Clean up only your own mess.** If your changes make imports/variables/functions unused, remove them. Do NOT remove pre-existing dead code unless explicitly asked — mention it instead.
- **Traceability test:** Every changed line must trace directly to the user's request. If a line cannot be traced, it should not be in the diff.
- **Push back when warranted:** If a simpler approach exists than the one planned, say so before executing.

---

## STAGE 5: Review — Validate the Result (Detailed)

**Trigger**: Stage 4 produced code changes or any durable execution artifact. If Stage 4 produced neither, skip to Stage 6.

**⚠️ The executor does not self-review. Follow the Agent Invocation Principle.**

### Step 1: Skip-Level Retrospective

Check: Did anyone (including myself) do work that should have been dispatched?
- [ ] Who wrote this round's code? (If meta-theory used Edit/Write directly → Skip-Level)
- [ ] Were required agents skipped?
- [ ] Was Stage 1's skip-level result respected?

Skip-Level handling:
```
IF Skip-Level detected → Record Scar → Assess impact → IF impact occurred → re-verify with agent
```

### Step 1.5: Owner Coverage + Protocol Compliance Review

Before content quality review begins, check the execution contract itself:
- [ ] For non-trivial non-query work, did `contentEvidencePacket` exist before runtime question tool / native choice / fallback?
- [ ] Did `preDecisionOptionFrame` present evidence-backed options before user choice?
- [ ] If the choice gate was skipped, was `choiceGateSkip` limited to trivial, pure read-only/queryBypass, or explicit auto-proceed with rationale?
- [ ] Were `dispatchEnvelopePacket`, `dispatchBoard`, and `workerTaskPackets` finalized only after user choice or valid skip?
- [ ] Did every executable sub-task have an explicit owner?
- [ ] If temporary fallback owner was used, is the justification explicit?
- [ ] Do all `WorkerResultPackets` map back to the `dispatchBoard` and primary deliverable?
- [ ] Is there a declared `mergeOwner` for every parallel group?
- [ ] Did the run maintain one consolidated deliverable rather than drifting into detached outputs?

If any answer is no, the Review packet must record **protocol non-compliance** even if the implementation quality looks good.

**Review 阶段的 meta-prism 边界**:
- ✅ 允许：Read / Grep / Glob / WebFetch / WebSearch / Bash (只读白名单子集，如 `pnpm typecheck`、`cargo check --no-deps`、`git status`、`git log`、`ls`、`cat`、`find`)
- ❌ 禁止：Edit / Write / NotebookEdit / MCP-write / Bash 中包含 `install / build / push / rm / curl POST / --force / npm publish` 等副作用命令
- 如发现质量问题需修复代码 → 必须 dispatch 到执行 worker，meta-prism 不亲自 patch

### Step 1.6: Interface Integration Contract Review

When `interfaceIntegrationContractPacket` is present or required, Review must verify the interface gate before normal code quality:

- **Source-of-truth gate**: every field, enum, error code, state transition, and auth/signature parameter cites evidence.
- **Contract diff gate**: internal API changes declare before/after compatibility and consumer impact.
- **Signature/auth gate**: signing order, encoding, timestamp/nonce, secret reference, replay protection, callback verification, and auth failure behavior are explicit.
- **Idempotency gate**: idempotency key, duplicate request semantics, duplicate callback handling, timeout retry behavior, and storage/locking strategy are explicit.
- **Callback/webhook gate**: verification, duplicate, out-of-order, delayed, rollback, ACK timing, retry, dead-letter, and compensation behavior are explicit.
- **Error model gate**: third-party raw errors are mapped to internal standard errors, retry class, alerting severity, and user-facing boundary.
- **State machine gate**: payment/order/logistics/auth flows reject illegal transitions and document final consistency or compensation paths.
- **Sandbox/contract test gate**: success, auth failure, rate limit, timeout, missing field, provider 5xx, and duplicate request/callback scenarios are covered.
- **Security/secrets gate**: secrets stay out of source, logs, frontend, fixtures, and artifacts; environment separation is explicit.
- **Human owner approval gate**: business semantics, money/order state, SLA, and error-code mappings are approved by the responsible owner.

Missing required gates or any remaining `blocking_unknown` fail Review even when the implementation compiles.

### Step 2: Quality Review (dynamic, Fetch-first)

Following the **Agent Invocation Principle** (Search → Match → Invoke):
```
→ Search: who declares "Own: code quality review"?
→ Match: score candidates
→ Invoke: selected agent
```

When invoking a code quality agent, specify these check dimensions:
- **Type safety**: any / implicit any / type assertions
- **Error handling**: try/catch coverage and fallback strategy
- **Permission boundaries**: which external APIs / file systems / network requests were called
- **Code reuse**: duplicate logic, DRY detection

### Step 3: Security Scan (dynamic, Fetch-first)

```
→ Search: who declares "Own: security analysis"?
→ Match: score candidates
→ Invoke: selected agent
```

When invoking a security agent, specify these check dimensions:
- **Hardcoded secrets**: API key / token / password
- **Unvalidated input**: parameter validation
- **Injection risks**: SQL injection / XSS

### Step 4: UX Review (for UI-related changes)

If files involve UI/components:
- Accessibility (keyboard navigation focus-visible, aria-label, aria-live)
- Loading states (skeleton screens vs pure spinners)
- Responsiveness (mobile breakpoints)

### Step 5: AI-Slop Detection (optional — for agent/system definitions)

```
→ Search: who declares "Own: quality forensics, AI-Slop detection"?
→ Invoke if found
```

### Review Stage Output

```json
{
  "skipLevelDetected": false,
  "skipLevelScar": null,
  "ownerCoverage": "PASS",
  "protocolCompliance": "PASS",
  "qualityGate": "FAIL",
  "revisionNeeded": true,
  "revisionRound": 1,
  "sourceProjects": ["project-abc123def456"],
  "crossProjectContaminationCheck": "pass",
  "temporaryOwnerFollowUp": [],
  "reviews": [
    { "type": "code-quality", "agent": "code-reviewer", "result": "PASS", "issues": [] },
    { "type": "security", "agent": "security-reviewer", "result": "FAIL", "issues": ["hardcoded API key in config.ts"] }
  ],
  "findings": [
    {
      "findingId": "rev-001",
      "severity": "high",
      "owner": "security-reviewer",
      "sourceProject": "project-abc123def456",
      "summary": "hardcoded API key in config.ts",
      "requiredAction": "remove secret and load from secure runtime config",
      "fixArtifact": "src/config.ts",
      "verifiedBy": "meta-prism",
      "closeState": "open"
    }
  ]
}
```

Every non-pass issue must become a **review finding object**. Free-form issue lists are insufficient once revision and verification start.

**Quality Gate rules — Auto-Fix Loop**:

```
Round 1: Review agent reports issues
  → Auto-dispatch fix to the original governance owner with issue list and run-scoped matchedSkills as constraints
  → Re-run Review on the fixed output
Round 2: If still FAIL → auto-fix again with accumulated context
  → Re-run Review
Round 3: If still FAIL → STOP, notify user for manual decision
  → Include: all 3 rounds of issues, what was tried, what remains unfixed
```

Key difference from simple "max 2 rounds": the fix is **automatic** — the Review agent dispatches the fix back to the responsible governance owner without waiting for user input. Only escalate to user after 3 failed auto-fix attempts.

---

## STAGE 6: Meta-Review — Review the Review Standards (Detailed)

**Trigger**: Complex tasks, abnormal pass rates, or when the user explicitly asks for stricter governance.

Meta-Review does **not** re-review the implementation itself. It reviews whether Stage 5's review criteria were strong enough:

| Check Dimension | Question | Fail Action |
|----------------|----------|-------------|
| Assertion coverage | Did the review cover all critical dimensions? | Add missing assertions and re-run review |
| Assertion strength | Could a clearly wrong result still pass? | Tighten weak assertions and re-run review |
| Criteria consistency | Did standards drift materially from comparable past runs? | Record drift and request Warden arbitration |

**Trigger heuristics**:
- Review pass rate > 0.9 but output still looks suspect
- Review pass rate < 0.3 but output looks materially sound
- Security-sensitive or cross-layer changes

---

## STAGE 7: Verification — Confirm the Fixes (Detailed)

**Trigger**: Stage 5 or Stage 6 produced revision work.

Verification is an independent re-check using fresh evidence, not a trust-based acknowledgment:

| Check | Method |
|------|--------|
| Issue closure | Re-run the assertion that originally failed |
| Regression guard | Confirm the fix did not break an adjacent path |
| Fresh evidence | Cite current files / outputs / logs, not memory of what changed |

**Verification output**:
```json
{
  "verified": true,
  "remainingIssues": [],
  "evidence": ["current file or runtime evidence"],
  "fixEvidence": ["commit diff, file path, or test output showing the fix landed"],
  "revisionResponses": [
    {
      "findingId": "rev-001",
      "actionId": "fix-001",
      "owner": "execution-owner",
      "responseType": "code-change",
      "status": "applied",
      "fixArtifact": "src/config.ts",
      "responseSummary": "removed hardcoded key and switched to env lookup"
    }
  ],
  "verificationResults": [
    {
      "findingId": "rev-001",
      "verifiedBy": "meta-prism",
      "result": "pass",
      "evidence": ["src/config.ts now reads process.env.API_KEY"],
      "closeState": "verified_closed"
    }
  ],
  "closeFindings": ["rev-001"]
}
```

If verification fails, route back to Execution with the accumulated issue list.

**Closure rule**:
- `review finding -> revision response -> verification result -> closeFindings`
- Missing any link means the finding stays open
- `closeFindings` may only contain finding ids that have a matching verification result with fresh evidence

### Rollback Protocol

When verification reveals that fixes caused more damage than they solved, or when risk exceeds the original task scope, invoke the rollback protocol:

| Rollback Level | Trigger | Action |
|---------------|---------|--------|
| **File-level** | Single file regression detected | Restore the specific file from last known good state (`git checkout HEAD~1 -- <file>`) |
| **Sub-task level** | One sub-task's changes broke adjacent paths | Revert only that sub-task's file set; re-run Review on remaining changes |
| **Full rollback** | Cross-contamination across >3 files; original task assumptions invalidated | `git stash` all uncommitted changes; return to Stage 1 Critical with a revised scope |
| **Partial rollback** | Some sub-tasks succeeded, others failed | Keep successful sub-tasks; rollback failed ones; re-enter Stage 3 Thinking to re-decompose the failed portion |

**Rollback Decision Flow**:
```
Verification FAIL
  → Count affected files
  → IF 1 file: File-level rollback → Re-run Stage 4 for that file only
  → IF 2-3 files in same sub-task: Sub-task level rollback
  → IF >3 files OR cross-module: Notify user → Full or Partial rollback (user decides)
```

**Iron Rule**: Rollback is not failure. Rollback is the system demonstrating it knows when to stop making things worse. A system without rollback capability is a system that can only move forward into disaster.

### Summary / Public Display Packet

The 8-stage spine has no separate “summary stage”, but business runs still need a structured closure object before anything becomes display-ready.

```json
{
  "verifyPassed": true,
  "summaryClosed": true,
  "singleDeliverableMaintained": true,
  "deliverableChainClosed": true,
  "consolidatedDeliverablePresent": true,
  "publicReady": true,
  "sourceProjects": ["project-abc123def456"],
  "deliveryShellsUsed": ["shell-tech-detail"],
  "blockedBy": []
}
```

Rules:
- `publicReady = true` only when all public-display conditions are true
- if any gate is false, `blockedBy` must explain why
- summary closure is the public shell of the verified run, not a replacement for verification

---

## STAGE 8: Evolution — Extract Learnings (Detailed)

Use the **5+1 evolution model** after every task: the canonical 5 structural dimensions, plus Scars codification as an always-on overlay.

| Dimension | What to Detect | Amplification Action |
|-----------|---------------|---------------------|
| Pattern reuse | Can this solution become a reusable pattern? | Extract as new skill/agent |
| Agent boundaries | Do boundaries need adjustment? | Trigger split/merge |
| Rhythm optimization | Can interaction path be shorter? | Tighten stage or control-card trigger conditions (Conductor-owned dealing) |
| Process bottlenecks | Which step is slowest/error-prone? | Adjust orchestration |
| Capability coverage | Any new gaps discovered? | Trigger Scout or Type B |
| **Scars codification** | Skip-Level/Boundary Violation/Process Gap? | Record structured Scar → prevention rule |

### Agent Self-Test ("The Test" Pattern)

Every agent (governance meta-agent and execution agent) should include a **self-test** in its SOUL definition — a concise, checkable statement that defines when the agent is working correctly:

```markdown
## The Test
[this agent] is working correctly when:
- [specific, observable condition 1]
- [specific, observable condition 2]
```

Review (Stage 5) and Meta-Review (Stage 6) use each agent's self-test as an explicit verification checklist, replacing subjective "looks OK" judgments with structured pass/fail criteria. This pattern is inspired by Karpathy's Goal-Driven Execution principle — transforming qualitative standards into declarative, verifiable goals.

### Amplification Operations

| Dimension | Detection | Action |
|-----------|-----------|--------|
| Pattern reuse | Reusable pattern found | → Extract as skill/template → register |
| Agent boundaries | Boundaries unreasonable | → Trigger split/merge |
| Rhythm optimization | Interaction path redundant | → Update stage/control triggers (via Conductor) |
| Process bottlenecks | Bottleneck found | → Adjust stage-card priority / sequencing (Conductor) |
| Capability coverage | Gap discovered | → Scout or Type B |
| Scars | Issue detected | → Record Scar → update Critical checklist |

### Owner Writeback Rule

Every completed run must ask:

1. Did an existing owner prove sufficient?
2. Did a temporary fallback owner reveal a recurring capability gap?
3. Should an agent boundary, SOUL, skill loadout, or workflow contract be updated?

If the run used a temporary owner more than once for the same capability family, Evolution should default to **Type B or owner-boundary adjustment**, not repeated temporary fallback.

### Scars Structured Recording

```yaml
scar:
  id: "{date}-{type}-{short-desc}"
  type: overstep | boundary-violation | process-gap | false-positive
  triggered_by: "{context}"
  what_happened: "one sentence"
  root_cause: "why (not surface reason)"
  impact: none | degraded | recovered | critical
  prevention_rule: "specific rule for next time"
```

### Evolution Writeback Packet

```json
{
  "ownerAssessment": "keep-existing | adjust-boundary | create-owner | retire-temporary-fallback",
  "writebackDecision": "writeback | none",
  "decisionReason": "why a writeback is required, or why none is acceptable for this run",
  "writebacks": [
    { "target": "canonical/agents/<agent>.md", "reason": "boundary drift" },
    { "target": "canonical/skills/<skill>/SKILL.md", "reason": "reusable execution pattern" },
    { "target": "config/contracts/workflow-contract.json", "reason": "protocol or gate refinement" }
  ],
  "scarIds": ["2026-04-02-overstep-example"],
  "syncRequired": true
}
```

**Rule**: Evolution may not silently disappear. Every run must emit either:
- `writebackDecision = "writeback"` with concrete targets, or
- `writebackDecision = "none"` with a concrete `decisionReason`

### Evolution Writeback Checklist (mandatory before marking Evolution complete)

Before marking Evolution complete, walk through this checklist and record the result for every item:

```json
{
  "evolutionWritebackChecklist": {
    "agentBoundaryEdit": { "needed": false, "targets": [], "reason": "no boundary issues found" },
    "skillCreateOrUpdate": { "needed": false, "targets": [], "reason": "no reusable pattern discovered" },
    "capabilityIndexUpdate": { "needed": false, "targets": [], "reason": "no coverage gap found" },
    "contractRefinement": { "needed": false, "targets": [], "reason": "no gate or protocol refinement needed" },
    "scarRecord": { "needed": false, "scarIds": [], "reason": "no violation detected" },
    "syncRequired": { "needed": false, "reason": "no canonical files modified" }
  }
}
```

Each item must be explicitly addressed — omitting an item is equivalent to an unstated assumption, which violates the Explicitness design principle.

### Evolution Artifacts Storage

Evolution outputs must be persisted to specific locations — not left floating in conversation context:

| Artifact Type | Storage Location | Lifecycle |
|--------------|-----------------|-----------|
| **Agent Boundary / CT / DR Adjustments** | `canonical/agents/{agent}.md` (direct edit) | Immediate; primary evolution target — triggers `npm run meta:sync` |
| **New Skills** (extracted) | `canonical/skills/{skill-name}/SKILL.md` | Permanent; created via skill-creator, validated via Type D Review |
| **Rhythm Optimizations** | Recorded in `config/contracts/workflow-contract.json` or Conductor's card-deck defaults | Immediate; affects next run's dispatch board |
| **Capability Gap Records** | `config/capability-index/` or the owning `canonical/agents/{agent}.md` | Until resolved; Scout monitors and closes when filled |

**Evolution Rule — Direct Over Indirect**: The agent definition IS the memory. When a gap is discovered, edit the specific agent's SOUL.md directly. Do NOT route through a middle abstraction layer. memory/ is Claude Code's session memory — not Meta_Kim's evolution mechanism.

**Storage Rule**: If an evolution artifact has no defined storage location, it does not count as "captured". The 5+1 model's amplification actions are only complete when the artifact is written to disk and indexed.

### Public Display Discipline

External-ready output is a **gate state**, not a storytelling choice. Before any run is treated as publicly complete, all of these must hold:

- `verifyPassed`
- `summaryClosed`
- `singleDeliverableMaintained`
- `deliverableChainClosed`
- `consolidatedDeliverablePresent`

If any one of these is false, the run may produce internal notes, but it must not be framed as the final public deliverable.

---

## STAGE SPINE VS CONTROL CARDS

**8-stage spine** (always the backbone): Critical → Fetch → Thinking → Execution → Review → Meta-Review → Verification → Evolution. Business workflow **phase names** in `config/contracts/workflow-contract.json` (e.g. `direction`, `planning`, `execution`) are a separate vocabulary for department runs — do not relabel spine stages as “Guidance / Direction / Planning cards.”

**Control / overlay cards** (rhythm and safety — Conductor deals; not a second spine):

| Card | Trigger Condition | Action |
|------|-------------------|--------|
| Scope Contraction | Repository too large / duplicate filenames / branching history | Ask which target to change, then proceed |
| Risk | Shared components / auth / global interfaces / hot multi-editor areas | Surface; may trigger interrupt path |
| Suggestion | User hesitates; interruption costly | Low-cost forward plan or intentional silence |
| Silence | ≥3 consecutive high-density push rounds | Pause for digestion |
| Skip | Attention cost > benefit | Simplify or defer |
| Interrupt | Emergency or Sentinel-critical | Prioritize and reorder |
| Iteration | Acceptance not closed within agreed rounds | Loop with explicit gate; max 3 iterations, then escalate to Warden |
| **Rollback** | Risk exceeded original scope OR impact scope expanded beyond acceptance | Revert to last stable state; re-enter Stage 3 Thinking to re-decompose |

**Card naming note**: English names are canonical in this repository. Use `canonical/skills/meta-theory/references/meta-theory.md` as the theory source and align wording with your audience and locale.

Spine coverage reference (what each stage is for — not separate “card” names):

| Spine stage | Role |
|-------------|------|
| Critical | Clarity, classification, skip-level checks |
| Fetch | Capability discovery (Search–Match–Invoke) |
| Thinking | Options, risks, decomposition |
| Execution | Delegated work |
| Review | Result validation (Fetch-first reviewers) |
| Meta-Review | Review-of-review when triggered |
| Verification | Fresh-evidence re-check after revisions |
| Evolution | Learnings and scars |

---

## "WHAT IT IS NOT" GUARDRAILS

- Meta ≠ role naming: calling something "frontend agent" doesn't make it a meta; naming without clear boundaries is just packaging
- Meta ≠ Omnipotent Executor Meta: stuffing all responsibilities into one agent isn't strength; clear division of labor is maturity
- Organizational Mirror ≠ metadata/ORM: it's not a technical term — it's an architectural design method for collaboration relationships between metas, responsibility boundaries, and who takes the field first
- Meta ≠ framework complexity: simple scenarios don't need meta decomposition; direct execution is more efficient — meta is a governance tool, not decoration
- Meta ≠ once-and-for-all: meta boundaries need to be adjusted as the system evolves; they aren't defined once and never changed
