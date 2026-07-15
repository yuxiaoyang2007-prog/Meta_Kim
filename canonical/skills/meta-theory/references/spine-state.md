# Spine State

The canonical spine is:

Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution.

## Critical-Fetch Intent Loop

Critical and Fetch may form a bounded loop to translate wishful user input into structured intent:

1. Critical: initial intent translation (low-confidence dimensions marked).
2. Fetch: read project context to fill low-confidence gaps.
3. Critical (return): update intent with context-enriched understanding.
4. If uncertain dimensions remain and loop budget allows, repeat step 2-3.
5. Present IntentCard for user confirmation.
6. Lock intent, proceed to formal Fetch -> Thinking.

Loop control fields:
- `criticalFetchLoopCount`: number of Critical-Fetch round trips completed (starts at 0).
- `criticalFetchLoopMax`: hard upper bound, default 3.
- `intentCard`: the Intent Confirmation Card presented to the user.
- `intentConfirmationState`: `pending` | `confirmed` | `corrected` | `skipped`.
- `intentConfirmationTimestamp`: when the user confirmed or corrected.
- `intentCorrectionPayload`: user's correction text when `corrected`.

Pass condition for exiting the loop: `intentConfirmationState` is `confirmed` or `skipped` (with allowed skip reason), AND all Critical required outputs are filled.

Adaptive termination: the dispatcher may exit the loop early when all intent dimensions reach high confidence, even if loop budget remains. Record `earlyExitReason` when this happens.

## Plan-Challenge State

Plan challenge is an optional state overlay on Critical, Fetch, Thinking, and Review; it is not another stage. It activates from explicit user challenge intent, actionable irreversible/high-cost or permission-sensitive side-effect intent, or a material contradiction backed by trusted Fetch/Thinking evidence. Clear low-risk reversible work remains inactive; risky vocabulary by itself is not an activation signal.

Minimum state:

- `planChallengeState.active`: whether a valid trigger exists.
- `planChallengeState.phase`: `inactive` | `awaiting_user_answer` | `awaiting_understanding_confirmation` | `awaiting_execution_authorization` | `ready_for_execution` | `execution_denied` | `stopped_by_user`.
- `planChallengeState.triggerReasons`: explicit user request, actionable material risk, or trusted evidence contradiction.
- `currentHighestImpactQuestion`: the one unresolved user decision eligible to appear this turn, or `null`.
- `questionDecisionImpact`: which outcome, scope, route, risk, authorization, or acceptance boundary the answer changes.
- `recommendedAnswer`: evidence-supported default plus reason, trade-off, uncertainty, or `null` for preference-only decisions.
- `resolvedDecisions`: decisions already answered or accepted; they cannot be re-asked without new invalidating evidence.
- `invalidatedQuestions`: pending questions closed because a prior answer made them irrelevant.
- `challengeControl`: `continue` | `accept_recommendation` | `skip` | `summarize_stop`; the last control covers both visible summarize-now and stop actions.
- `challengeStopReason`: `user_requested_summary_stop` after `summarize_stop`, otherwise `null`.
- `sharedUnderstandingConfirmed`: derived boolean backed by `sharedUnderstandingEvidenceRefs`; a caller-provided boolean is never confirmation evidence.
- `executionAuthorization`: trusted authorization evidence with exact scope, or `not_required`, `not_requested`, or `denied`.
- `executionAllowed`: the single fail-closed scoped gate consumed by every side-effecting path.

`sharedUnderstandingConfirmed=true` never implies authorization or `executionAllowed=true`. Require authorization only when the next step mutates files or state, installs globally, publishes, deploys, deletes, pays, changes permissions, writes externally, or causes another side effect. Trusted authorization needs non-empty evidence, binding `planChallengeAuthorizationBinding(sideEffectActions)`, and scope actions covering all of them. Explicit denial enters `execution_denied`, keeps execution blocked, and does not ask again. `executionAllowed=true` only when the challenge is inactive under the existing governed route, or active at `ready_for_execution`; all other active phases keep it false. Canonical writeback and project copy consume this same exact-scope gate, and non-ready execution remains candidate/read-only. A read-only session closes after its chat summary without an authorization prompt. Fetch must resolve discoverable facts before selecting a question.

State promotion is fail-closed. Without a trusted current-host user answer or authorization event, the corresponding phase remains awaiting user decision. The runner emits `pendingUserChoice` with `required_not_invoked` for host handling and does not claim a popup. A response applies only with `trusted=true`, binding `plan-challenge-response:<questionId>`, and non-empty evidence references. Caller-authored JSON, flags, environment variables, booleans, unbound answer/status objects, authorization objects, or invalidation fields cannot answer a question, confirm understanding, authorize execution, or invalidate a dependency. Caller-requested invalidation is always ignored; only the governed dependency/answer resolver invalidates questions. `summarize_stop` system-invalidates all remaining open questions and sets phase `stopped_by_user` plus stop reason `user_requested_summary_stop`.

For the public governed runner, serialized `trusted` or `historical` fields are still caller data. Only a host-owned verifier callback capability may return one current-run decision; the runner ignores serialized history, understanding confirmation, and authorization for mutation. To continue across turns, `previousPlanChallengeRunId` must resolve inside the same governed output directory to a validator-passing prior artifact with the same task fingerprint and a non-terminal pending phase. The current callback must bind that exact `continuationRunId`; the runner restores the prior ledger, applies at most one decision valid for the current phase, writes a new run artifact, and never overwrites the previous run. No signature or public key is implied. Without that host capability the honest result remains pending, while the conversation host can continue the user-visible decision flow directly.

Visible closure always includes confirmed decisions, unresolved risks, and next step in chat. Questions, controls, pending state, stop reason, and outcome use the resolved `zh-CN`, `en-US`, `ja-JP`, or `ko-KR` locale without cross-locale Chinese leakage. A separate durable human-readable record is allowed only for a long-lived, hard-to-reverse decision.

## Required Outputs

- Critical: `surfaceRequest`, `realProductProblem`, `realIntent`, `userPainValue`, `successCriteria`, `intentFrameAssessment`, `undecidedUserChoices`, `nonGoals`, `blockingUnknowns`, `noQuotaClarification`, `intentCard`, `intentConfirmationState`.
- Fetch: `evidence`, `decisionImpactMap`, `capabilityDiscovery`, `capabilityGap`, `contradictionLog`.
- Thinking: `designFrame`, `workType`, `expertLens`, `minimalFixPath`, `tenXPathShift`, `chosenRationale`, `omittedTenXWithReason`, `consideredLanes`, `omittedLanesWithReason`, `workerTaskPackets`, `dependencyPolicy`.
- Execution: `workerResultPackets`, `fileCompletionList`, `workerExecutionEvidence`.
- Review: `reviewPacket`.
- Meta-Review: standard checks on `reviewPacket`.
- Verification: `verificationPacket`.
- Evolution: `evolutionWritebackPacket`.
- User-facing closure: `whyChanged`, `whatChanged`, `userImpact`, `verificationEvidence`, `remainingLimits`; when plan challenge ran, also show confirmed decisions, unresolved risks, and next step directly in chat.

## Hidden Skeleton

- `stageState`: current spine stage.
- `controlState`: normal, skip, interrupt, override, iteration, intentional_silence, degraded.
- `gateState`: pending, pass, fail, rework, blocked.
- `surfaceState`: silent, notice, decision.

These hidden state values are runtime-state fields. Public readiness is recorded separately in summary and public surface packets; do not overload `surfaceState` with `internal-ready` or `public-ready`.

Protocol packets live in `config/contracts/workflow-contract.json`.

## Degraded Mode Pass Conditions

When `controlState=degraded`:
- Fetch pass requires `capabilityDiscovery.searchLog` with checked sources and results (even empty).
- Thinking pass requires `capabilityGapPacket` with `currentAgentsChecked` and `degradationReason`.
- Review pass requires `degradedFlag: true` and `reviewerRole: "main-thread-degraded"`.
- Verification pass requires `degradedFlag: true` and `humanAcceptanceRequired: true`.
- `surfaceState` may be `silent` or `notice` but cannot become a public-ready claim. Summary and public surface packets must stay internal-only; `public-ready` is forbidden in degraded mode.


## Use when

Use when stage state, packet transitions, and gate readiness affects route, owner, risk, acceptance, verification, public-ready, or evolution writeback.

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
