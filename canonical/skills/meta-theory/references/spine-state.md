# Spine State

The canonical spine is:

Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution.

## Required Outputs

- Critical: `surfaceRequest`, `realProductProblem`, `realIntent`, `userPainValue`, `successCriteria`, `intentFrameAssessment`, `undecidedUserChoices`, `nonGoals`, `blockingUnknowns`, `noQuotaClarification`.
- Fetch: `evidence`, `decisionImpactMap`, `capabilityDiscovery`, `capabilityGap`, `contradictionLog`.
- Thinking: `designFrame`, `workType`, `expertLens`, `minimalFixPath`, `tenXPathShift`, `chosenRationale`, `omittedTenXWithReason`, `consideredLanes`, `omittedLanesWithReason`, `workerTaskPackets`, `dependencyPolicy`.
- Execution: `workerResultPackets`, `fileCompletionList`, `workerExecutionEvidence`.
- Review: `reviewPacket`.
- Meta-Review: standard checks on `reviewPacket`.
- Verification: `verificationPacket`.
- Evolution: `evolutionWritebackPacket`.
- User-facing closure: `whyChanged`, `whatChanged`, `userImpact`, `verificationEvidence`, `remainingLimits`.

## Hidden Skeleton

- `stageState`: current spine stage.
- `controlState`: normal, skip, interrupt, override, iteration, intentional_silence.
- `gateState`: pending, pass, fail, rework, blocked.
- `surfaceState`: silent, notice, decision.

Protocol packets live in `config/contracts/workflow-contract.json`.


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
