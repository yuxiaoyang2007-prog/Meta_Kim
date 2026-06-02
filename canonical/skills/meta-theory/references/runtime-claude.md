# Claude Code Runtime Adapter

Use this reference when Meta_Kim runs inside Claude Code and the route depends on native questions, subagents, skills, slash commands, prompts, hooks, or MCP tools.

## Native Question Surface

Claude Code exposes the native `AskUserQuestion` tool (added v2.0.21) for branch-changing user decisions. It renders an interactive Ink popup with 2–4 selectable options and waits for the user's choice before continuing.

Known limitation: PreToolUse hooks strip `AskUserQuestion` return data (GitHub issue #12031). Meta_Kim hooks whitelist `AskUserQuestion` to bypass this by not intercepting it. If the native tool is unavailable or returns empty, fall back to `conversation_fallback` with a localized chat decision card.

Use `AskUserQuestion` in exactly these cases:

- Critical clarification: only when the missing answer changes deliverable, scope, permission, safety, owner, capability, acceptance, or non-goal, and Fetch cannot safely proceed.
- Execution confirmation: only after Fetch evidence and Thinking option framing are complete, when the selected route branches by scope, owner, capability, risk, verification depth, or public-ready acceptance.

Every `AskUserQuestion` payload must use `questions` with two to four meaningful options. Each option states what changes, what problem it solves, expected result, advantage, disadvantage or risk, and verification impact. No filler questions and no question quota.

## Dispatch-Not-Execute In Claude Code

In Claude Code, governed Execution is real only when the main thread invokes actual providers selected during Thinking. The main thread scopes, dispatches, reviews, and synthesizes; it must not directly edit, write, or run implementation commands as the worker for non-trivial executable work.

Before the first mutation, Thinking must produce a dispatch plan that binds each execution lane to:

- `ownerAgent`: the selected agent or provider owner
- `weapon`: the concrete tool surface, such as `Agent`, `Skill`, slash `Command`, prompt/rule provider, MCP tool, shell script, or runtime tool
- `capabilityBindings`: the specific agent, skill, command, prompt, MCP tool, or script found during Fetch
- `verificationOwner`: the role that will verify the result

Execution must then call the selected provider surface:

- Use `Agent` / Task tool for implementation lanes that have a matching Claude subagent.
- Use `Skill` when a Claude skill is the chosen capability provider.
- Use slash `Command` or project script only when command discovery selected that command as the weapon.
- Use prompt/rule providers only when Fetch found them and Thinking bound them to the lane.
- Use MCP tools only when the MCP inventory proves the tool is available and safe for the lane.

If no real provider is callable, do not self-execute to "keep moving". Return to Thinking with `capabilityGapPacket`, or enter degraded mode with explicit `degradationReason`, `humanAcceptanceRequired`, and `surfaceState=internal-ready`.

## Use when

- The user expects a Claude Code popup or native decision surface.
- A governed task would otherwise be implemented by the main thread.
- The route depends on Claude Code subagents, skills, commands, prompts, hooks, or MCP tools.

## Required inputs

- `intentPacket.realIntent` locked in Critical stage.
- `fetchPacket.capabilityMatches` with at least one scored candidate.
- `dispatchEnvelopePacket.ownerAgent` resolved during Thinking.
- `workerTaskPackets[].taskPacketId` and `roleInstanceId` for each execution lane.
- `capabilityBindings` mapping each lane to a callable Claude Code provider (Agent, Skill, Command, prompt, MCP).

## Do

- Use `AskUserQuestion` for required branch-changing choices when available.
- Prefer real Agent / Skill / Command / prompt / MCP dispatch over main-thread execution.
- Record unavailable providers as evidence, not as permission to fake delegation.
- Cite `workerTaskPackets[].taskPacketId` in every Agent dispatch prompt.
- Fall back to `conversation_fallback` with a localized decision card when `AskUserQuestion` is unavailable or returns empty.

## Do not

- Do not call a chat decision card a popup.
- Do not ask during Critical, Fetch, Thinking, or Review just to satisfy a ritual.
- Do not let the main thread become the implementation worker for non-trivial governed execution.
- Do not self-execute when Thinking assigned a different owner without recording `degradationReason`.

## Required packet

- `dispatchEnvelopePacket` with `ownerAgent`, `weapon`, `capabilityBindings`, and `verificationOwner`.
- `workerResultPackets[].workerExecutionEvidence` from each dispatched provider.
- For `AskUserQuestion`: `choiceSurfaceState` must be `completed` before Execution; `preDecisionOptionFrame.candidatePaths` must list at least two options.

## Pass criteria

- Every dispatched provider returned a result matching its declared output schema.
- `AskUserQuestion` returned a non-empty answer, or `conversation_fallback` was used with recorded reason.
- `workerResultPackets[].schemaValidationAttempts[].passed === true` for each lane.
- The main thread did not directly edit, write, or run implementation commands.

## Fail criteria

- Main thread directly executed implementation work without dispatching a provider.
- `AskUserQuestion` returned empty and no `conversation_fallback` fallback was recorded.
- `workerTaskPackets` missing `taskPacketId` or `roleInstanceId`.
- `capabilityBindings` missing or referencing a provider not found during Fetch.

## Block conditions

- `AskUserQuestion` called during Critical or Fetch stage (only allowed after Thinking option framing).
- Agent dispatch in execution stage without `capabilitySearchPerformed === true` in spine state.
- `choiceSurfaceState` not `completed` when Execution attempts mutation tools.
- PreToolUse hook strips `AskUserQuestion` return data (workaround: hook bypasses `AskUserQuestion` at line ~900 of `enforce-agent-dispatch.mjs`).

## Return to stage

- Missing `fetchPacket.capabilityMatches` → return to Fetch.
- Missing `dispatchEnvelopePacket` or `capabilityBindings` → return to Thinking.
- Empty `AskUserQuestion` response → record `choiceSurfaceFallback=hook_strip`, return to Thinking or use `conversation_fallback`.
- Provider dispatch fails → return to Thinking with `capabilityGapPacket`.

## Verification

- Confirm each Agent dispatch prompt cites a `workerTaskPackets[].taskPacketId`.
- Confirm `AskUserQuestion` popup appeared by checking the returned answer is non-empty, or `conversation_fallback` reason is recorded.
- Run `npm run meta:test:meta-theory` to verify all 8-stage spine tests pass with the Claude Code adapter loaded.
- Check `enforce-agent-dispatch.mjs` whitelists `AskUserQuestion` to avoid issue #12031.

## Writeback

- If `AskUserQuestion` behavior changes in a Claude Code update, update this reference and the hook whitelist.
- If a new provider surface is added to Claude Code (e.g., a native multi-select), add it to `capabilityBindings` options and update `runtimeNativeChoiceSurfaces.claude` in `workflow-contract.json`.
- Hook compatibility scars go to `canonical/runtime-assets/claude/hooks/` with regression test.

## Preserve

- Claude Code's native `AskUserQuestion` tool must not be replaced with a Meta_Kim equivalent.
- Claude Code's permission system (allow/deny) must not be bypassed by governance.
- Claude Code's built-in Skills, WebSearch, browser, filesystem, shell, MCP, and memory tools must remain callable; governance may add boundaries but must not remove them.
- The `enforce-agent-dispatch.mjs` whitelist for `AskUserQuestion` must not be removed without confirming issue #12031 is resolved upstream.
