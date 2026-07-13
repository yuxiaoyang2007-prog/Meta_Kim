---
name: meta-theory
description: Run the Meta_Kim meta-theory governance dispatcher
args: <request>
---

Use the Meta_Kim `meta-theory` skill for this request:

$ARGUMENTS

Resolve the skill from the first available directory skill root:

1. `~/.codex/skills/meta-theory/SKILL.md`
2. `.agents/skills/meta-theory/SKILL.md`

Follow the skill's clarity, capability-discovery, dispatch, review, verification, and evolution discipline. If a required runtime capability is missing, state the missing capability and the exact checked path instead of guessing.

Default product runtime path:

For explicit `/meta-theory` governed execution, the first operational step is to create the auditable run artifact and a user-visible notice from the installed Meta_Kim package root:

```bash
node "__META_KIM_PACKAGE_ROOT__/scripts/run-meta-theory-governed-execution.mjs" --runtime codex --emit-conversation-notice "$ARGUMENTS"
```

If this command file has not been rendered by global sync and the placeholder is still present, fall back only when the current project is the Meta_Kim source checkout or provides the package script:

```bash
npm run meta:theory:run:notice -- --runtime codex "$ARGUMENTS"
```

Relay every localized stderr progress snapshot into normal assistant chat at its natural transition point, without shortening away owner, result, risk, verification, or next-action guidance. Treat stdout as the single final machine-readable JSON summary; read its returned report path and include that path in the chat closure. Use `node "__META_KIM_PACKAGE_ROOT__/scripts/run-meta-theory-governed-execution.mjs" --read latest` from the rendered package root, or `npm run meta:theory:report -- latest` in the source checkout, to reopen the user-readable report when more detail is needed. This is the default artifact path for `/meta-theory` governed execution: Warden entry gate -> Conductor orchestration -> CapabilityGap decisions -> workerTaskPackets -> runtime projection evidence -> Warden writeback decision -> visible run report. The `:notice` fallback keeps `--emit-conversation-notice` inside `package.json` because some Windows/npm paths strip forwarded flags. Keep the user request as the first positional argument; do not switch to `--task` unless calling the Node script directly.

Codex execution rule:

**HOST-NATIVE FAN-OUT PREFERRED.** The main thread is the dispatcher, never the executor. Use Codex's native `spawn_agent` directly to fan out independent worker lanes — the governed runner only records evidence, discovers capabilities, and suggests lanes; it does not enforce dispatch.

- This `/meta-theory` invocation authorizes safe native fan-out when Thinking proves 2+ independent lanes and collision/workspace/external-write safety. Direct parallel-agent wording and structured governance-chain requests are strong activation examples, not exclusive gates; native choice remains reserved for branch-changing decisions.
- Use the active Codex host's top-level native `spawn_agent` with `task_name`, `message`, and `fork_turns`. Derive `task_name` from the worker `roleInstanceId`/`taskPacketId`, normalized to lowercase letters, digits, and underscores. Put the selected `ownerAgent`, owner source, capability/loadout, bounded scope, output contract, and merge owner in `message`.
- Default `fork_turns` to `none` when the bounded worker message is complete. Use `all` or a positive integer string only when the worker genuinely needs parent-turn context. Do not pass `agent_type` or `fork_context`.
- Use `agent-teams-playbook` after Thinking and before Execution when the plan has 2+ executable worker lanes whose DAG dependencies, collision boundaries, workspace isolation, and external-write policy prove safe fan-out; record `not_required` for fewer lanes and partial/degraded for unsafe fan-out. Resolve it from the first available skill root (`~/.codex/skills/agent-teams-playbook/SKILL.md`, `.agents/skills/agent-teams-playbook/SKILL.md`, or a configured dependency root). Treat it as a selected fan-out adapter unless a live Skill/Agent Team/spawn_agent tool call is attached.
- When authorization exists, use the active Codex host's real top-level `spawn_agent` tool and record the exact tool name, task name, returned agent/task id, and worker mapping in host invocation evidence. Do not discover or fall back to a legacy namespaced spawn API. The main thread clarifies, routes, verifies, and synthesizes; it must not do multi-agent execution work by itself.
- If authorization or a callable subagent tool is missing after discovery, record the checked tool names and blocked/degraded reason; do not silently continue as main-thread execution or claim live fan-out.

## Prompt Acceptance

This command adapter binds `governance-orchestration`, `capability-discovery-and-retrieval`, `runtime-native-surfaces`, `execution-tools-and-commands`, `safety-hooks-and-permissions`, and `verification-eval-and-release`. It is the Codex runtime entry surface for the shared Meta_Kim dispatcher, not the canonical governance source.

## Required inputs

- User request from `$ARGUMENTS`.
- The project `meta-theory` skill from a configured skill root.
- Codex agent delegation authorization and capability, or an explicit blocked/degraded reason when unavailable.
- Rendered installed Meta_Kim package root, or source-checkout `package.json` with `meta:theory:run:notice` for auditable artifact generation.

## Pass

- The command resolves the shared skill, records capability discovery, runs the governed artifact path from the rendered installed package root or `meta:theory:run:notice` fallback, relays the localized stderr progress snapshots plus the final stdout JSON report path, and dispatches via the active subagent tool for execution-layer analysis when available.
- If no callable subagent tool is available, it reports the exact checked capability and does not continue as if agent dispatch happened.
- Governed execution that needs an artifact uses the rendered `node "__META_KIM_PACKAGE_ROOT__/scripts/run-meta-theory-governed-execution.mjs" --emit-conversation-notice "$ARGUMENTS"` command, or `npm run meta:theory:run:notice -- "$ARGUMENTS"` only as a source-checkout fallback, then reopens the report by runId or `latest`.

## Fail

- The main thread writes a long execution-layer answer while this command required delegation and no blocked reason was recorded.
- A run artifact, worker result, or verification result is claimed without evidence.
- Runtime-specific Codex fields are copied into Claude Code, Cursor, or OpenClaw prompts.

## Block

Block execution when the skill cannot be resolved, no callable subagent tool is available for required delegation, the rendered package-root runner and fallback package script are both unavailable, or safety hooks deny a mutation. The blocked response must name the checked path, checked tool name, or missing capability.

## Return to stage

Return to Fetch when skill roots, capability indexes, package scripts, MCP config, or provider state are missing. Return to Thinking when dispatch owner/loadout is unresolved.

## Verification

Run `npm run meta:prompt:validate` after editing this command adapter. For runtime behavior, verify Codex run artifacts, worker result packets, and fresh command output instead of prompt text alone.

## Preserve

Preserve Codex native agents, skills, hooks, MCP, shell, filesystem, apply_patch, sandbox, approvals, memory, graph, and runtime config. Meta_Kim may route and guard these abilities but must not replace or hide them.
