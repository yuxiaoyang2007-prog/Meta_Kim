# OpenClaw - Platform Research

## Official Documentation

- Repository: https://github.com/openclaw/openclaw
- OpenClaw is an open-source AI agent orchestration platform

## Skill System

### Format

- Standard: **AgentSkills open standard** (`SKILL.md` with YAML frontmatter)
- Also supports single-file Markdown skill format (e.g., `meta-theory.md`)
- Progressive disclosure: metadata scanned, full content loaded on demand

### Path Conventions

| Scope | Path |
|-------|------|
| Global skills | `~/.openclaw/skills/<skill-id>/SKILL.md` |
| Personal shared skills | `~/.agents/skills/<skill-id>/SKILL.md` |
| Workspace skills | `<workspace>/skills/<skill-id>/SKILL.md` |
| Extra configured skills | `skills.load.extraDirs[]` in `openclaw.json` |
| Meta_Kim repo extra skills | `openclaw/skills/<skill-id>/SKILL.md` via `openclaw/openclaw.template.json` `skills.load.extraDirs` |
| Workspace config | `openclaw/workspaces/<agent-id>/` |
| Template config | `openclaw/openclaw.template.json` |

### Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| Basic SKILL.md | Y | Full support |
| `allowed-tools` | Y | Tool restriction per skill |
| `context: fork` | N | Not supported |
| Hooks | Y | Plugin SDK 28 hooks (agent lifecycle, tool execution, message flow, subagent coordination, gateway lifecycle) |
| Plugins | N | No marketplace |
| Workspaces | Y | Multi-agent workspace isolation |

### Workspace Model

OpenClaw has a unique workspace model where each agent gets its own workspace directory containing:

- `BOOT.md` / `BOOTSTRAP.md` - Startup instructions
- `IDENTITY.md` - Agent identity
- `SOUL.md` - Agent behavior boundaries
- `TOOLS.md` - Available tools and teammates
- `AGENTS.md` - Team directory
- `MEMORY.md` - Persistent memory
- `HEARTBEAT.md` - Scheduled task policy
- `USER.md` - User profile context

### Shared Skills Layer

OpenClaw loads skills from managed `~/.openclaw/skills/`, personal `~/.agents/skills/`, `<workspace>/skills/`, and configured `skills.load.extraDirs[]`. Meta_Kim keeps one repo-local copy at `openclaw/skills/` and registers it through the generated OpenClaw template instead of duplicating the skill under every workspace.

### Differences from Claude Code

- Has OpenClaw internal/plugin hooks, not Claude Code hook files
- No context:fork capability
- Plugin support exists in OpenClaw; do not assume Claude marketplace compatibility
- Has workspace-per-agent model (unique to OpenClaw)
- Uses `skills.load.extraDirs[]` for repo-local shared skill deduplication
- Supports both SKILL.md directory format and single-file Markdown format

## Data Sources

- OpenClaw CLI 2026.4.15 (`openclaw skills list --json`, `openclaw skills info`)
- OpenClaw installed runtime source (`skills-Cwx5TftI.js`) showing managed, personal, project, workspace, and extra skill roots
- mintlify.com/vercel-labs/skills (AgentSkills standard)
- Meta_Kim project integration code

## Research Date

2026-04-27
