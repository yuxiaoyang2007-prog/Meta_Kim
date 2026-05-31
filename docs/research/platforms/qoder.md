# Qoder CLI - Platform Research

## Official Documentation

- Skills: https://docs.qoder.com/en/cli/Skills.md
- Subagents: https://docs.qoder.com/en/cli/subagent.md
- Hooks: https://docs.qoder.com/en/cli/hooks.md
- MCP servers: https://docs.qoder.com/en/cli/mcp-servers.md
- Docs index: https://docs.qoder.com/llms.txt

## Decision Status

Qoder is a `candidate_probe`, not a formal Meta_Kim runtime projection.

Evidence supports a generic adapter path because Qoder documents skills,
subagents, hooks, and MCP surfaces. Evidence does not support direct promotion:
Meta_Kim has no Qoder runtime profile, no projection layout, no generated target
paths, no sync tests, and ECC's current installer help does not list `qoder`.

## Skill System

### Format

- A Qoder Skill is a folder containing `SKILL.md`.
- `SKILL.md` uses YAML frontmatter.
- Required frontmatter fields are `name` and `description`.
- `/skills reload` refreshes the skill catalog.
- `/skills` lists available skills.

### Path Conventions

| Scope | Path |
|-------|------|
| User skills | `~/.qoder/skills/{skill-name}/SKILL.md` |
| Project skills | `.qoder/skills/{skill-name}/SKILL.md` |
| User agents | `~/.qoder/agents/<agentName>.md` |
| Project agents | `.qoder/agents/<agentName>.md` |
| User settings | `~/.qoder/settings.json` |
| Project settings | `.qoder/settings.json` |
| Project local settings | `.qoder/settings.local.json` |

## Agent System

Qoder subagents are specialized AI agents with separate context, system prompts,
and tool permissions. Agent definitions are Markdown files with YAML
frontmatter. `name` and `description` are required; `tools` is optional.

Meta_Kim should map canonical agents to Qoder only after a projection design
chooses whether Qoder agent files are durable projections or generated shims.
Until then, Qoder agent support remains generic compatibility evidence.

## Hooks

Qoder hook configuration lives in settings JSON files:

- `~/.qoder/settings.json`
- `.qoder/settings.json`
- `.qoder/settings.local.json`

Documented events include `SessionStart`, `SessionEnd`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`,
`SubagentStart`, `SubagentStop`, `PreCompact`, `Notification`, and
`PermissionRequest`.

Exit code 2 blocks for supported hook events. This is compatible with a future
Meta_Kim enforcement adapter, but it is not enough to claim full projection
support before runtime payload schemas and tests exist.

## MCP

Qoder documents `qodercli mcp add`, `qodercli mcp list`, `qodercli mcp remove`,
and `/mcp reload`.

MCP configuration can be stored in:

- `~/.qoder/settings.json`
- `.qoder/settings.local.json`
- `.mcp.json`

## Current Meta_Kim Policy

- Add Qoder to the runtime compatibility catalog as `candidate_probe`.
- Allow Qoder home path resolution through `META_KIM_QODER_HOME`, `QODER_HOME`,
  or `~/.qoder` for future probes.
- Do not add Qoder to `config/sync.json` until it has a runtime profile,
  projection layout, generated target paths, sync tests, and install policy.
- Do not add Qoder to ECC targets while `ecc install --help` omits it.

## Research Date

2026-05-30
