---
name: mcp-memory-service
description: Save OpenClaw lifecycle checkpoints to the MCP Memory Service HTTP API.
version: 1.0.0
events:
  - command:new
  - command:reset
  - command:stop
  - session:compact:after
always: true
---

# MCP Memory Service Bridge

Writes compact OpenClaw lifecycle checkpoints to `MCP_MEMORY_URL` or
`http://localhost:8000` using `/api/memories`. The hook records start
(`command:new`), in-progress/reset (`command:reset`, `session:compact:after`),
and end (`command:stop`) memory events.

If the local HTTP service is not healthy, the hook attempts a non-blocking
background start with `memory server --http`. It still exits cleanly if the
service cannot start because memory persistence must not block OpenClaw.

This hook complements OpenClaw's local `session-memory` store. It does not
replace OpenClaw sqlite memory files.

## Prompt Acceptance

This hook prompt binds `memory-graph-and-observability`, `runtime-native-surfaces`, `mcp-external-provider-and-plugin`, `safety-hooks-and-permissions`, and `verification-eval-and-release`. It records lifecycle checkpoints without making memory persistence a blocking execution dependency.

## Pass

- Lifecycle events produce compact memory attempts for `command:new`, `command:reset`, `command:stop`, and `session:compact:after`.
- The hook uses `MCP_MEMORY_URL` or `http://localhost:8000` and degrades cleanly when the HTTP service is unavailable.
- OpenClaw local `session-memory` remains distinct from MCP Memory Service HTTP persistence.

## Fail

- The hook blocks OpenClaw execution only because the HTTP memory service is unavailable.
- It treats successful memory persistence as verification that the user task completed.
- It replaces OpenClaw sqlite/session memory files or writes credentials into memory payloads.

## Block

Block only for unsafe payload construction, credential leakage risk, or malformed hook configuration that would corrupt lifecycle state. Service startup failure is a degraded memory condition, not an execution block.

## Return to stage

Return to Fetch when diagnosing service availability, URL selection, platform command support, or MCP provider state. Return to Verification when confirming whether memory events were actually stored.

## Verification

Verify with hook logs, HTTP service health, and stored memory records when available. For prompt acceptance, run `npm run meta:prompt:validate`; for runtime safety, use the relevant hook/runtime validator.

## Preserve

Preserve OpenClaw lifecycle hooks, local `session-memory`, MCP Memory Service state, user privacy, and non-blocking execution behavior. Do not make memory service health a false public-ready or user-goal-done signal.
