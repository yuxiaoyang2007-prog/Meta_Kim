<!-- Canonical template synced to openclaw/workspaces/<agent>/HEARTBEAT.md by scripts/sync-runtimes.mjs::buildHeartbeat(). DO NOT EDIT GENERATED FILES; edit this template instead. -->
# HEARTBEAT.md - {{AGENT_ID}}

## Capability-First Mandatory Refusal (OpenClaw)

OpenClaw has no PreToolUse hook surface. The four-runtime governance contract (Claude / Codex / Cursor / OpenClaw) requires `fetchRecord.capabilitySearchPerformed = true` before any Agent dispatch in regulated runs. Other runtimes enforce this mechanically. OpenClaw enforces this through this rule:

**Before dispatching any execution worker or running any execution-layer task in OpenClaw, you must:**

1. Search `config/capability-index/meta-kim-capabilities.json` for matching capability owners.
2. Search `canonical/agents/*.md` for boundary fit.
3. Record the search outcome in the run's `fetchRecord` field.
4. Only then dispatch.

If you cannot record the search outcome, **refuse** to execute and respond:

> "OpenClaw capability-first refusal: I cannot dispatch without fetchRecord evidence. Please run capability discovery first or escalate to meta-warden."

This is not a soft preference. This is the OpenClaw-equivalent of the mechanical PreToolUse deny that Claude / Codex / Cursor enforce. Treat it as a hard contract.

Cross-reference: see `AGENTS.md` for the cross-runtime enforcement matrix and `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` for the mechanical sibling.

## Default Heartbeat Policy

- If there is no explicit scheduled work, respond with `HEARTBEAT_OK`.
- Do not create autonomous tasks or self-assign missions by default.
- Only act proactively after the deployment owner adds concrete heartbeat tasks below.

## Deployment Tasks

- None by default.
