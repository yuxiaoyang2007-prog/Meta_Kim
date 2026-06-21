# Codex Runtime Adapter

In Codex, `/meta-theory` is user-visible authorization to use available subagent/delegation tools when the task has multiple independent worker lanes. A prompt that explicitly asks for subagents, parallel agents, one-agent-per-point review, or `/meta-theory` may satisfy Codex's explicit subagent trigger; a hidden governance-only inference does not. Only claim delegation when a real tool was called successfully.

Codex must not self-degrade to "single-thread dispatcher" merely because it is running in Codex App. If `spawn_agent` / subagent tooling is exposed, Thinking may select it after Fetch evidence and the dispatcher must show which temporary workers were spawned. If the tool is absent or fails, record `subagentCapabilityStatus=unavailable` and a concrete `degradationReason`.

Codex Execution is capability-wide, not agent-only. When Thinking selects a capability family, the dispatcher must either call the real Codex-exposed surface or record a partial/blocking state:

- subagents/custom agents through the host `spawn_agent` / multi-agent surface when exposed and authorized
- skills by applying the selected skill instructions and recording the skill evidence reference
- MCP tools through the active MCP tool call surface
- commands/scripts through the selected shell or package-script command with fresh output
- runtime tools such as `apply_patch`, browser, Playwright, data widgets, or other loaded tool surfaces
- prompt/rule providers as `applied`, not as external tool calls

`runtimeInvocationPlanPacket` records the selected executable families, the real invocation evidence, and missing families. `hostInvocationRequestPacket` is the adapter handoff: for each missing selected family it states the Codex action to run, the worker task refs if relevant, and the exact trusted evidence fields to return. The Node runner must not treat the request as proof; only the active Codex host or a trusted host adapter can execute `spawn_agent`, skill activation, MCP calls, slash commands, or runtime tools and then pass `hostInvocationEvidenceTrusted=true` with fresh evidence. `capabilityInvocationTruthPacket.realInvocationCoverage.status` must be `pass` for product-experience pass. `selected_not_invoked` is valid truth, but it is never completion evidence.

## Honest Subagent Contract

If `spawn_agent` / `Agent` equivalent is unavailable:

- do not pretend agents ran
- record the blocked reason
- continue only for read-only degraded analysis or ask before degraded executable work

If `spawn_agent` is available and the user explicitly authorized subagents:

- use it for independent, bounded worker or review lanes after Thinking creates `workerTaskPackets`
- keep each worker's write scope disjoint when it edits files
- size fan-out from Codex host/config capacity such as `[agents].max_threads`, current runtime capacity, task DAG, and collision boundaries instead of a fixed Meta_Kim cap
- show the dispatch board before or alongside dispatch
- distinguish temporary `runtimeInstanceAlias` from durable `roleDisplayName` and `ownerAgent`
- do not describe the temporary subagent prompt as the created/iterated project agent

`agent-teams-playbook` is the Codex fan-out adapter after Thinking, not a substitute for Thinking. Select it when there are 2+ executable `workerTaskPackets` with proven DAG, collision, workspace-isolation, and external-write safety; record `not_required` for single-lane work and partial/degraded for unsafe fan-out. A selected playbook provider is `agent_teams_playbook=selected_not_invoked` until a live Skill/Agent Team/spawn_agent call is actually attached as host evidence. Meta_Kim must not set its own maximum lower than Codex host/config capacity.

## Codex Durable Agent Projection

Codex project-retained agents use `.codex/agents/<agent>.toml` with a stable `name`, `description`, and `developer_instructions`. When `GapDecision.decision=create_agent` or the user asks to iterate an agent, Codex must produce or update a durable project-local agent candidate for this TOML surface after Warden/user approval. Temporary `spawn_agent` workers only execute the factory/review tasks; they do not satisfy the durable agent deliverable.

For cross-tool compatibility, every durable project-agent candidate must include:

- formal tool projection targets from `config/sync.json` and `config/runtime-compatibility-catalog.json`
- abstract loadout slots instead of concrete one-run skill/command choices
- no Windows absolute paths, current file lists, tickets, `todayTask`, `scopeFiles`, `deliverableLink`, or `verifySteps` in identity

Durable Codex agent completion is a four-step lifecycle, not a file write:

1. Generate a reviewed project-agent definition candidate.
2. Apply Warden-approved writeback to `.codex/agents/<agent>.toml` or the configured projection target.
3. Reload or restart the Codex host so it discovers the agent definition, then attach `durable_agent` evidence with `evidenceKind=host_discovery_reload`.
4. Invoke that durable agent through Codex and attach `durable_agent` evidence with `evidenceKind=durable_agent_live_invocation`.

Until steps 3 and 4 are attached, `durableAgentLifecyclePacket.status` remains partial even if the file exists.

Other formal tool projections follow `config/sync.json` and `config/runtime-compatibility-catalog.json`; keep `needs_probe`, `partial`, or `reference_only` statuses as evidence instead of promoting them by wording.

## Choice Surfaces

Use native `request_user_input` only when exposed, and only with a payload accepted by the active host schema. Use the active runtime-native maximum meaningful option count; Meta_Kim must not impose a lower product cap. In current Codex App schemas this may be 1-3 questions with 2-3 mutually exclusive choices per question; treat that as observed host capacity, not a permanent Meta_Kim limit. If a future or different Codex host exposes more options, use that larger maximum. Codex is a primary Meta_Kim runtime, so required branch-changing decisions must not be downgraded to a chat decision card.

If `request_user_input` is unavailable, returns API 400, returns empty, or is rejected by the host, record `nativeChoiceSurfaceBlocked` with the concrete reason, stop before Execution, and return to Critical or Thinking. Do not continue with a localized markdown decision card as acceptance evidence.

Trigger proof rule: when `request_user_input` is present in the active Codex tool set and `choiceSurfaceState` is `critical_clarification_allowed` or `execution_confirmation_allowed`, the assistant must call `request_user_input` in the current chat turn before Execution. A `cardPlanPacket`, CLI `conversationNotice`, markdown report, hook warning, or generated artifact only records that a choice is needed; it is not evidence that a native Codex choice surface was shown. Completion proof is the returned `request_user_input` answer, or a blocking `nativeChoiceSurfaceBlocked` record when the native surface cannot run.

False native choice claim guard: do not announce "I used the Codex choice panel", "the choice panel did not return", "the popup failed", or equivalent localized wording unless a `request_user_input` call returned or a `nativeChoiceSurfaceBlocked` record exists. The only valid pre-call text is a short notice that the run is about to ask through the Codex choice surface, immediately followed by the tool call. If the tool is absent, record the blocked state; do not invent an empty response.

## Visible Status Boundary

Codex `UserPromptSubmit` hook output and `hookSpecificOutput.additionalContext` are model/developer context, not the primary product surface. `systemMessage` can appear as a UI warning or event-stream warning, but it is not a governed progress notice. For Codex App, the reliable user-visible status surface is normal assistant chat text, or a captured CLI stdout notice only when the CLI command is explicitly invoked and its stdout is shown to the user. A hook warning, hidden developer context, markdown report, or JSON artifact does not satisfy `conversationNoticeEmitted`.

Therefore every governed Codex run must render localized chat notices for run start, route selected before Execution, blocker/degraded state when present, and closure. Use `request_user_input` only for branch-changing decisions; do not turn routine status into a popup.

Visible Decision cards need at least two meaningful options and a recommended default. Critical clarification can appear before Fetch when the user's wording is too ambiguous to collect the right evidence. Notices can stay concise.

Native structured panel content: treat each `request_user_input.questions[]` item as a compact decision panel, not a plain yes/no prompt. The `header` stays short and user-language friendly, the `question` text preserves the semantic panel sections "AI understanding", "AI additions", "Capability route", and "Candidate paths" when those sections affect the choice, and each option `description` must preserve expected result, advantage, disadvantage/risk, and verification impact. Mark the recommended option in its label with "(Recommended)" when required by the active Codex host. If the semantic decision frame has more viable options than the active schema accepts, render the strongest host-maximum set and record omitted alternatives in the Thinking notes; never retry a rejected oversized payload unchanged.

Fetch/content evidence must precede Thinking/pre-decision option framing. Targeted read-only baseline verification such as existing test or validator runs belongs to Fetch when it changes the route; it does not belong to Critical. Once the run starts collecting repo evidence through Fetch-class inspection, the spine should progress into Fetch even if no planning file has been written yet. At the transition from Thinking to Execution, present one Decision only when the answer changes scope, owner, risk, or acceptance. After Thinking completes, BEFORE any Execution, ask the user only if the route branches. DO NOT ask confirmation during Critical/Fetch/Thinking/Review just to satisfy a ritual.

Read-only status is not a choice-surface skip reason by itself. `queryBypass` says the run is a pure query / inspection path with no mutation, durable artifact, execution dispatch, or handoff; it does not prove that user choice is unnecessary. If a read-only analysis still has materially different routes, scopes, risks, owners, or acceptance standards, ask. If there is no branch-changing choice, record `no_branching_choice` or an explicit auto-proceed rationale instead of citing read-only status.

Critical clarification is separate from execution confirmation: ask early when the user's expression fails the intent completeness framework, not because the model believes it knows the true human intent. Required dimensions are outcome, audience/value, success criteria, scope, constraints/permissions/safety, evidence freshness, and output format. If a missing or conflicting dimension changes route, scope, risk, acceptance, owner, permission, or non-goal, set `choiceSurfaceState = critical_clarification_allowed` and ask before Fetch, Thinking, or Execution. Subjective quality or non-measurable adjective requests such as "good", "bad", "beautiful", "ugly", "doesn't look good", "smooth", "not smooth", "professional", "premium", "advanced", "clean", "simple", "fast", "slow", "hard to use", "feels off", or localized equivalents require Critical clarification when the target, quality dimension, acceptance standard, or allowed scope is unclear. Ask later before executing a dispatch plan only when the plan has meaningful branches.

Decision cards include: AI understanding, AI additions, Capability route, Candidate paths.

Possible question dimensions:

1. Scope Confirmation - ask only when included work changes delivery.
   - Option A: Touch only requested files; expected result is a narrow fix; benefit is low risk; disadvantage is less cleanup.
   - Option B: Include nearby contract text; expected result is clearer rules; advantage is less ambiguity; risk is larger review.
   - Option C: Apply runtime mirror sync; expected result is consistent installs; benefit is less drift; trade-off is longer validation.
   - Option D: Modify only canonical source; expected result is smaller diff; advantage is safer review; disadvantage is delayed mirrors.
2. Evidence Confirmation - ask only when verification depth changes release confidence.
   - Option A: Run targeted tests; expected result is fast feedback; benefit is speed; risk is missed integration failure.
   - Option B: Run full verification; expected result is stronger confidence; advantage is release-grade evidence; cost is time.
   - Option C: Require screenshot/log artifact; expected result is auditable proof; benefit is reviewer confidence; disadvantage is extra setup.
   - Option D: Record accepted risk; expected result is honest closure; advantage is no false pass; risk is unresolved work.
3. Route Confirmation - ask only when owner or architecture changes.
   - Option A: Reuse existing owner; expected result is minimal governance change; benefit is stability; risk is imperfect fit.
   - Option B: Upgrade owner contract; expected result is clearer responsibility; advantage is durable fit; cost is larger review.
   - Option C: Create owner via Type B; expected result is exact capability; benefit is clean boundary; disadvantage is governance overhead.
   - Option D: Block with capabilityGapPacket; expected result is no fake owner; advantage is honesty; trade-off is no immediate execution.

There is no question quota. Each visible question must change an execution branch. Do not add filler options to satisfy a count. Options must be understandable to non-technical users. Wait for user response before proceeding to Execution.

## Codex Multi-Option Choice Surface Rule

For every required confirmation or decision surface in Codex, use `default_mode_request_user_input` and `request_user_input`. Do not show a `Preflight` block unless the user explicitly asks for debug, audit, protocol, or governance trace output. Always show the maximum viable options accepted by the active host schema, include an explicit output-language choice when language is unresolved, use the latest input language, and render Option A placeholders as resolved user-facing language instead of hardcoding any single human language. If `request_user_input` is unavailable, block instead of treating a chat card as an accepted Codex decision. Claude Code native question tool remains unchanged.

Choice Surface Gate states: `not_allowed`, `critical_clarification_allowed`, `execution_confirmation_allowed`, `completed`. FORBIDDEN: premature choice surface for test a popup / interactive box / popup_test_request. Critical -> Fetch -> Thinking must happen before execution confirmation. If the intent frame is missing or conflicting and the missing answer changes route, scope, risk, acceptance, owner, permission, or non-goal, ask Critical clarification and must not present execution options. `contentEvidencePacket` precedes `preDecisionOptionFrame`. No candidate paths means no execution confirmation; no Fetch evidence means Thinking is not complete; no Thinking result means no pre-Execution confirmation.

Before detailed orchestration, close unresolved questions, list candidate solution paths, set `solutionChoiceState`, and only then finalize dispatch into `workerTaskPackets`.

Respect user choices (after questioning). Base the analysis on the user's actual selections, not on what the model "thinks is better". If there is significant risk, return to Thinking with Option A as the user's original choice and Option B as the suggested adjustment. Do not unilaterally override their selection.

## Query Bypass

`queryBypass: true` means pure read-only query. It does not allow mutation, install, write, delete, or state-changing shell commands.

`queryBypass` is not a general substitute for a pre-execution decision. It applies only when there is no execution branch to choose. When branch-changing options exist, use the Codex choice surface even if the evidence gathering itself is read-only.

## Hook progression

Codex hooks are the last fuse after preflight. Current Codex documentation describes project hooks as trusted lifecycle guardrails loaded from hook/config layers, including managed/plugin/project sources and Windows-specific command variants. Do not treat them as an exhaustive all-tool policy engine.

Before mutation, Conductor must confirm the route has the key behavior minimum: real intent, success criteria, Fetch evidence, capability discovery, selected owner, owner loadout across agent/skill/command/MCP/tool/abstract prompt, runtime/OS not known-unsupported, memory strategy, and Review standard. Hook output that blocks an action must name `returnToStage`, `repairOwner`, `repairAction`, `allowedNextAction`, and `forbiddenRetry`. Detailed rollback, dependency, warning, writeback, and verification-owner fields are public-ready/validator gates unless their absence makes the action unsafe.

`hookRepairMode` starts on the second same-reason block. It reads the hook output, fixes the missing packet or stage design, and retries only with a changed action. The same blocked action must not be retried unchanged. A third same-hook block stops Execution, emits `hookFailurePacket`, and blocks public-ready.

`hookBlockRate` is measured as hook blocks divided by attempted mutating actions. `hookBlockRate <= 5%` is acceptable, `>5%` requires Evolution review, and `>15%` blocks public-ready. Read-only Fetch, repo search, dependency discovery, capability scan, targeted baseline test runs, and validator dry runs must not be blocked by Hook progression policy.


## Use when

Use when Codex runtime, sandbox, approval, hooks, subagents, and choice behavior affects route, owner, risk, acceptance, verification, public-ready, or evolution writeback.

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
