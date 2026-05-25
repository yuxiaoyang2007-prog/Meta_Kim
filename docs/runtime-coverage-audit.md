# Meta_Kim Runtime Coverage Audit

This document answers two questions:

1. Which runtime capability surfaces does Meta_Kim currently cover?
2. Which surfaces belong to the host product itself and cannot be fully controlled by repository files?

## Audit Scope

Coverage here means capability surfaces that directly affect work execution and can be controlled by repository assets:

- role entrypoints
- subagents / custom agents
- skills
- MCP
- hooks / guards
- workspace boot and memory
- multi-agent routing
- sandbox / approval configuration entrypoints
- local verification and smoke checks

These host-level surfaces are intentionally excluded from "repository-coverable" scope:

- login, authorization, OAuth, and API key lifecycle
- desktop UI, chat-history sidebar, and notifications
- each vendor product's cloud-side state
- whether the CLI binary itself is installed on the machine

## Summary

### Covered

- Claude Code project-level `subagents + skills + hooks + MCP`
- Codex repository-level `AGENTS.md + custom agents + project skills + MCP config + sandbox/approval config example`
- OpenClaw `workspace family + skill + bundled hooks + boot + memory + local auth bootstrap + agent-to-agent`
- Cursor project-level `agents + skills + MCP config`

### Not Claimable As Full Repository Coverage

- Claude Code, Codex, OpenClaw, and Cursor account systems, desktop UI, and cloud-side state
- OpenClaw hook enablement still depends on the host OpenClaw CLI/gateway version
- Codex and Claude final tool surfaces still depend on host session parameters, approval policy, and runtime environment

## Capability Surface Audit

| Surface | Claude Code | Codex | OpenClaw | Cursor | Meta_Kim status |
| --- | --- | --- | --- | --- | --- |
| Theory / skill entry | `.claude/skills/meta-theory/` mirror | `.agents/skills/meta-theory/` project skill + `.codex/skills/meta-theory/` compatibility mirror | `openclaw/skills/meta-theory/` + workspace mirror | `.cursor/skills/meta-theory/` mirror | Covered through project-governed sync |
| Role entry | `CLAUDE.md` + `.claude/agents/` | `AGENTS.md` + `.codex/agents/` | `workspaces/<agent>/SOUL.md`, etc. | `.cursor/agents/*.md` project-level files | Covered |
| Subagents / custom agents | Native subagents | Native custom agents / subagents | Native multi-agent workspace | Native Cursor agent rules | Covered |
| Project skill | `.claude/skills/` | `.agents/skills/` + compatibility `.codex/skills/` | workspace skill + installable skill | `.cursor/skills/` | Covered |
| Compatibility skill mirror | Not needed | `.codex/skills/` runtime mirror | `openclaw/skills/` mirror | `.cursor/skills/` runtime mirror + `~/.cursor/skills/` global | Covered |
| MCP | `.mcp.json` | `config.toml` example | shared MCP server | `.cursor/mcp.json` | Covered |
| Hooks / guards | `.claude/settings.json` hooks | `.codex/hooks.json` trusted project/user hooks | Plugin SDK hooks + bundled/internal hooks | `.cursor/hooks.json` lowerCamel lifecycle hooks | Covered, but not 1:1 isomorphic |
| Boot files | `CLAUDE.md` / agent prompt | `AGENTS.md` / custom agent prompt | `BOOT.md` / `BOOTSTRAP.md` / `IDENTITY.md` | `.cursorrules` / agent prompt | Covered |
| Memory entry | SessionStart + Stop MCP Memory hooks | SessionStart / UserPromptSubmit / Stop MCP Memory hooks | `MEMORY.md` + `session-memory` + MCP Memory managed hook | beforeSubmitPrompt / stop MCP Memory hooks | Covered |
| Multi-agent routing | Claude native delegation | Codex subagents | OpenClaw agent-to-agent | Cursor native agent delegation | Covered |
| Capability index | `.claude/capability-index/` mirror | `.codex/capability-index/` mirror | `openclaw/capability-index/` mirror | `.cursor/capability-index/` mirror | Covered; Fetch order is repo source -> mirror -> local inventory -> fallback |
| Sandbox / approval | Claude native permission / tool control | `sandbox_mode` / `approval_policy` | host gateway and tool constraints | Cursor native approval | Covered as repository configuration entrypoints |
| Local verification | `claude agents` + schema eval | `codex exec --json` smoke | `openclaw config validate` + local agent smoke | `.cursor/agents/` existence check | Covered |

## Repository Locations

Canonical:

- `canonical/agents/*.md`
- `canonical/skills/meta-theory/SKILL.md`
- `canonical/skills/meta-theory/references/*.md`
- `config/contracts/`
- `config/capability-index/`

Claude Code:

- `CLAUDE.md`
- `.claude/agents/*.md`
- `.claude/skills/meta-theory/SKILL.md`
- `.claude/settings.json`
- `.claude/capability-index/`
- `.mcp.json`

Codex:

- `AGENTS.md`
- `.codex/agents/*.toml`
- `.agents/skills/meta-theory/SKILL.md`
- `.codex/skills/meta-theory/SKILL.md`
- `.codex/capability-index/`
- `codex/config.toml.example`

OpenClaw:

- `openclaw/openclaw.template.json`
- `openclaw/workspaces/*/BOOT.md`
- `openclaw/workspaces/*/BOOTSTRAP.md`
- `openclaw/workspaces/*/MEMORY.md`
- `openclaw/workspaces/*/memory/README.md`
- `openclaw/workspaces/*/SOUL.md`
- `openclaw/workspaces/*/AGENTS.md`
- `openclaw/workspaces/*/TOOLS.md`
- `openclaw/workspaces/*/skills/meta-theory/SKILL.md`
- `openclaw/capability-index/`

Cursor:

- `.cursor/agents/*.md`
- `.cursor/skills/meta-theory/SKILL.md`
- `.cursor/mcp.json`
- `.cursor/capability-index/`

Runtime locations are mirrors / projections. Long-term behavior, theory, contracts, and capability-index changes should land in canonical/config sources first, then sync to runtime directories.

## Final Judgment

If the standard is "all work-capable meta-architecture surfaces must live in the repository," the current version is covered.

If the standard is "all host-product features across all vendors must be 100% equivalent," the target is impossible for any repository because account systems, cloud state, and desktop surfaces are host-owned.

Meta_Kim's correct scope is:

- keep every repository-coverable capability surface in the repository
- explicitly mark host surfaces that cannot be made isomorphic
- continuously verify with `sync + validate + eval`
