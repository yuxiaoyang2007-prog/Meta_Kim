# Cursor - Platform Research

## Official Documentation

- Primary site: https://docs.cursor.com
- Agent Skills support confirmed via Skills CLI reference
- Cursor IDE by Anysphere

## Skill System

### Format

- Standard: **AgentSkills open standard** (`SKILL.md` with YAML frontmatter)
- Cursor adopted the AgentSkills standard, confirmed by:
  - Cursor built-in `create-skill` skill documents `~/.cursor/skills/` and `.cursor/skills/`
  - Multiple third-party projects (gstack, superpowers, everything-claude-code) explicitly list Cursor support

### Path Conventions

| Scope | Path |
|-------|------|
| Global skills | `~/.cursor/skills/<skill-id>/SKILL.md` |
| Project skills | `.cursor/skills/<skill-id>/SKILL.md` |
| Agent definitions | `.cursor/agents/*.md` |
| User agent definitions | `~/.cursor/agents/*.md` |
| MCP config | `.cursor/mcp.json` |

Note: `.agents/skills/` may exist as a portable AgentSkills mirror for other runtimes, but Cursor's own built-in `create-skill` guidance names `.cursor/skills/` for project skills and `~/.cursor/skills/` for personal skills.

### Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| Basic SKILL.md | Y | Full AgentSkills support |
| `allowed-tools` | Y | Tool restriction per skill |
| `context: fork` | N | Not supported |
| Hooks | Y | `.cursor/hooks.json` (userPromptSubmit, preToolUse, postToolUse, stop); some bugs reported |
| Plugins | Y | Reuses Claude Code marketplace infrastructure (`~/.cursor/plugins/`) |

### Agent Format

Cursor agents use Markdown files with YAML frontmatter:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
---

You are a code reviewer...
```

This matches Cursor's built-in `create-subagent` guidance. It differs from Codex's TOML custom-agent format.

### Evidence of Cursor Skill Support

1. **Cursor built-in `create-skill` skill**: Documents `~/.cursor/skills/skill-name/` and `.cursor/skills/skill-name/`
2. **gstack** (garrytan/gstack): Documentation explicitly mentions `~/.cursor/skills/gstack-*/` as install path
3. **superpowers** (obra/superpowers): Lists Cursor in supported platforms
4. **everything-claude-code** (affaan-m): Lists Cursor in supported platforms
5. **planning-with-files** (OthmanAdi): 16+ platforms including Cursor
6. **Cursor built-in `create-subagent` skill**: Documents `.cursor/agents/` and `~/.cursor/agents/` with required `name` and `description` frontmatter

### Plugin System

Cursor supports plugins via Claude Code marketplace infrastructure:

- `~/.cursor/plugins/installed.json` — lists installed plugins (e.g., `superpowers@superpowers-marketplace`)
- `~/.cursor/plugins/marketplaces.json` — configured marketplace sources (`claude-plugins-official`, `anthropic-agent-skills`, `superpowers-marketplace`)
- Plugin installation follows the same `name@registry` format as Claude Code

### Differences from Claude Code

- Hooks system via `.cursor/hooks.json` (userPromptSubmit, preToolUse, postToolUse, stop)
- No context:fork capability
- Plugin system reuses Claude Code marketplace (not a separate ecosystem)
- Agent format is Markdown with YAML frontmatter
- Project skill path is `.cursor/skills/`
- Global skill install path is `~/.cursor/skills/`
- Global agent path exists as `~/.cursor/agents/`, but project `.cursor/agents/` has higher priority

## Data Sources

- Cursor built-in `create-skill` and `create-subagent` skills in `~/.cursor/skills-cursor/`
- gstack README (explicit `~/.cursor/skills/` mention)
- superpowers README (lists Cursor support)
- everything-claude-code README (lists Cursor support)
- Multiple ecosystem projects confirming Cursor AgentSkills adoption

## Research Date

2026-04-13
