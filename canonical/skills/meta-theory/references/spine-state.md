# Spine State

The canonical spine is:

Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution.

## Required Outputs

- Critical: `surfaceRequest`, `realProductProblem`, `realIntent`, `userPainValue`, `successCriteria`, `undecidedUserChoices`, `nonGoals`, `blockingUnknowns`, `noQuotaClarification`.
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
