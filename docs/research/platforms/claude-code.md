# Claude Code - Platform Research

## Official Documentation

- Primary docs: https://docs.anthropic.com/en/docs/claude-code
- Skills reference: https://docs.anthropic.com/en/docs/claude-code/skills
- Hooks reference: https://docs.anthropic.com/en/docs/claude-code/hooks

## Skill System

### Format

- Standard: **AgentSkills open standard** (`SKILL.md` with YAML frontmatter)
- Frontmatter fields: `name`, `description` (required)
- Body: Markdown with structured sections (instructions, checklists, etc.)
- Progressive disclosure: metadata loaded first, full SKILL.md loaded when skill is chosen

### Path Conventions

| Scope | Path |
|-------|------|
| Global skills | `~/.claude/skills/<skill-id>/SKILL.md` |
| Project skills | `.claude/skills/<skill-id>/SKILL.md` |
| User-level settings | `~/.claude/settings.json` |
| Project-level settings | `.claude/settings.json` |

### Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| Basic SKILL.md | Y | Full support |
| `allowed-tools` | Y | Restrict which tools a skill can use |
| `context: fork` | Y | Unique to Claude Code - skill runs in a separate context |
| Hooks | Y | Pre/Post tool execution, Stop event |
| Plugins | Y | Official marketplace (`claude plugin install`) |

### Hooks System

Claude Code has the most comprehensive hook system among all target platforms:

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

Hooks are configured in `.claude/settings.json` under the `hooks` key.

### Plugin System

Claude Code supports an official plugin marketplace:

```bash
claude plugin install <plugin-spec>
claude plugins list --json
```

Plugin specs follow the format: `name@registry`

## Unique Capabilities

- **context: fork**: Only Claude Code supports running skills in a separate context
- **Hooks**: Claude Code has the richest native hook script surface; Codex, Cursor, and OpenClaw have different hook models documented in their platform notes and the distribution matrix
- **Plugins**: Official marketplace for distributing skill bundles
- **Multi-format support**: Both SKILL.md (directory) and standalone Markdown files

## Data Sources

- Anthropic official documentation
- mintlify.com/vercel-labs/skills (AgentSkills CLI reference)
- Repository: anthropics/skills

## Research Date

2026-04-13
