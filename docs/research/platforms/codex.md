# Codex - Platform Research

## Official Documentation

- Codex CLI: https://github.com/openai/codex (OpenAI's CLI agent)
- Subagents reference: https://developers.openai.com/codex/subagents
- Config reference: https://developers.openai.com/codex/config-reference
- Agent Skills standard: https://github.com/vercel-labs/skills

## Skill System

### Format

- Standard: **AgentSkills open standard** (`SKILL.md` with YAML frontmatter)
- Codex supports the same universal SKILL.md format as Claude Code
- Progressive disclosure: metadata scanned, full content loaded on demand

### Path Conventions

| Scope | Path |
|-------|------|
| Global skills | `~/.codex/skills/<skill-id>/SKILL.md` |
| Project skills | `.agents/skills/<skill-id>/SKILL.md` |
| Agent config | `.codex/agents/*.toml` |
| User-level config | `~/.codex/config.toml` |

Note: The `.agents/skills/` project-level path is a **universal path** shared by Codex, Cursor, Cline, GitHub Copilot, and Gemini CLI.

### Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| Basic SKILL.md | Y | Full support |
| `allowed-tools` | Y | Tool restriction per skill |
| `context: fork` | N | Not supported |
| Hooks | Y | `.codex/hooks.json` (SessionStart, SessionStop, UserPromptSubmit, PreToolUse, PostToolUse); v0.117.0+ |
| Plugins | N | No marketplace |

### Agent Configuration

Codex uses TOML format for agent definitions:

```toml
name = "agent-id"
description = "Agent description"
nickname_candidates = ["Readable Name", "Short Name"]
developer_instructions = """
Full agent instructions here
"""
```

`nickname_candidates` are Codex-only display hints. Keep them ASCII alphanumeric with spaces, hyphens, or underscores. They must not be copied into Claude Code, Cursor, or OpenClaw projections.

Meta_Kim generates two adapter layers:

- `worker.toml` and `explorer.toml` cover the generic built-in roles that Codex often exposes in tool-backed sessions.
- `frontend.toml`, `backend.toml`, `test.toml`, `review.toml`, `analysis.toml`, `verify.toml`, and `docs.toml` provide coarse business-role custom agents for Codex hosts that honor named custom agents.

These files are best-effort readability shims, not canonical durable Meta_Kim execution owners.

### Known Host Limitation

OpenAI Codex GitHub issues have reported cases where project named subagents or `.codex/agents/*.toml` config are not loaded in some CLI/Desktop/tool-backed sessions, causing the host to fall back to generic runtime aliases. Meta_Kim therefore treats Codex nicknames as best-effort only and still records host aliases only as `runtimeInstanceAlias`.

Meta_Kim treats Codex subagents and project hooks as partial host capabilities: use them only when the user explicitly requests multi-agent/subagent work or a governed task truly needs delegation, and require trust review before relying on project hook behavior. Durable run artifacts must bind to business role names and verified capability evidence, not incidental Codex instance aliases.

Codex Desktop sidebar naming is not a Meta_Kim release gate unless the host actually honors project `.codex/agents/*.toml`. A screenshot that still shows `Popper (worker)` or `Zeno (explorer)` after sync means the host is using runtime instance aliases; task boards and run artifacts must still show `roleDisplayName` such as `frontend`, `backend`, `test`, `review`, `analysis`, `verify`, or `docs`.

### Differences from Claude Code

- Hooks are available through `.codex/hooks.json`; event names and contracts are not schema-compatible with Claude Code hooks
- No context:fork capability
- No plugin marketplace
- Uses TOML for agent config (Claude and Cursor use Markdown with frontmatter; OpenClaw uses workspaces)
- Shares `.agents/skills/` universal project path with Cursor and others

## Data Sources

- OpenAI Codex CLI repository
- mintlify.com/vercel-labs/skills (AgentSkills standard)
- Skills CLI listing 40+ supported agents

## Research Date

2026-04-13
