---
name: meta-theory
description: Run the Meta_Kim meta-theory governance dispatcher
args: <request>
---

Use the Meta_Kim `meta-theory` skill for this request:

$ARGUMENTS

Resolve the skill from the first available directory skill root:

1. `~/.codex/skills/meta-theory/SKILL.md`
2. `.codex/skills/meta-theory/SKILL.md`

Follow the skill's clarity, capability-discovery, dispatch, review, verification, and evolution discipline. If a required runtime capability is missing, state the missing capability and the exact checked path instead of guessing.

Codex execution rule:

- This `/meta-theory` invocation is explicit user authorization to use Codex sub-agent delegation and parallel agent work.
- For any non-trivial task, first apply `agent-teams-playbook` from the first available skill root (`~/.codex/skills/agent-teams-playbook/SKILL.md`, `.codex/skills/agent-teams-playbook/SKILL.md`) to choose the orchestration scenario and team blueprint.
- Then use Codex `spawn_agent` with capability-matched Meta_Kim agents. The main thread clarifies, routes, verifies, and synthesizes; it must not do multi-agent execution work by itself.
