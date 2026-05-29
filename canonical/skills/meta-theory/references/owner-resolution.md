# Owner Resolution

Capability-first dispatch order:

1. canonical capability index
2. runtime mirror indexes
3. local runtime inventory
4. available skills and tools
5. external discovery when allowed

## Ladder

existing owner -> owner upgrade -> create owner -> `capabilityGapPacket`.

Do not use temporary fallback owners. Do not persist concrete child skills into long-term agent identity; keep concrete skill selection run-scoped.

## Agent Teams Playbook

Use `agent-teams-playbook` after Thinking and before Execution only when there are 2+ independent parallel worker lanes. It advises parallelization; it does not replace Critical, Fetch, Thinking, owner selection, or verification planning.

## Use when

Use when a task needs owner, weapon, dependency, runtime, OS, or verification routing before Execution.

## Required inputs

- `intentPacket`
- `fetchPacket.capabilityDiscovery`
- weapon registry
- dependency registry
- runtime and OS matrices

## Do

- `meta-conductor` searches owner candidates in canonical index, runtime mirrors, local inventory, installed skills/tools, then external discovery.
- `meta-artisan` matches weapon and invocation path.
- `meta-scout` labels dependency evidence and support confidence.
- Output owner + weapon + dependency + runtime + OS + verification owner.

## Do not

- Do not use `general-purpose`, runtime nickname, or governance agent as implementation owner.
- Do not route reference-only or missing-invocation dependencies into execution.
- Do not delete low-score dependencies.

## Required packet

`ownerResolutionPacket`: `candidateOwners`, `candidateWeapons`, `candidateDependencies`, `runtimeFilterResult`, `osFilterResult`, `rankedRoutes`, `recommendedRoute`, `blockedReasons`, `capabilityGapPacket`.

## Pass

- `recommendedRoute.score >= 85`.
- owner, weapon, runtime, OS, verificationOwner, and verificationMethod are non-empty.
- callable dependency has invocationPath and verificationMethod.

## Fail

- owner missing, weapon missing, verificationOwner missing, fake owner, runtime alias owner, or governance agent implementation route.

## Block

Block Execution if runtime or OS is unsupported, dependency is reference-only, or no rollback/verification path exists.

## Return to stage

Return to Thinking for route gaps. Return to Fetch when support evidence or dependency status is unknown and route-changing.

## Verification

Run `npm run meta:route:validate` and inspect `npm run meta:capabilities:route -- --task "<task>" --runtime <runtime> --os <os> --json`.

## Writeback

Write repeated missing owner/weapon/dependency patterns to `config/capability-index/*` or `capabilityGapPacket` with `nextRunReuseKey`.

## Preserve

Preserve skills, WebSearch/browser/research, shell, filesystem, apply_patch, MCP, memory, graph, hooks, commands, runtime tools, and runtime-native abilities.
