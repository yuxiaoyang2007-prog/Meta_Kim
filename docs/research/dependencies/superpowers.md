# superpowers - Dependency Research

## Repository

- **Owner**: obra
- **Repo**: https://github.com/obra/superpowers
- **Install ID**: `superpowers`

## Content

Comprehensive development methodology framework. Provides structured workflows, patterns, and best practices for AI-assisted software development. Includes skill invocation protocols, code review frameworks, and development discipline enforcement.

## Format

- **Standard**: SKILL.md (AgentSkills open standard)
- **Structure**: Root-level SKILL.md with supporting files
- **Subdir**: None (full repo clone)

## Cross-Platform Compatibility

| Platform | Compatible | Notes |
|----------|-----------|-------|
| Claude Code | Y | Primary target + official plugin |
| Codex | Y | Explicitly supported |
| OpenClaw | Y | Explicitly supported |
| Cursor | Y | Explicitly supported |
| OpenCode | Y | Listed in README |
| Gemini | Y | Listed in README |
| Copilot | Y | Listed in README |

README explicitly lists: Claude Code, Cursor, Codex, OpenCode, Gemini, Copilot.

## Distribution Configuration

```json
{
  "id": "superpowers",
  "repo": "obra/superpowers",
  "claudePlugin": "superpowers@superpowers-marketplace",
  "codexPlugin": "superpowers",
  "cursorPlugin": "superpowers",
  "targets": ["claude", "codex", "openclaw", "cursor"]
}
```

## Install Method

- **Claude Code**: Dual-channel
  1. `claude plugin install superpowers@superpowers-marketplace` (marketplace plugin)
  2. `git clone --depth 1` to `~/.claude/skills/superpowers/` (skill dir)
- **Codex**: native Codex plugin UI or `/plugins`; legacy `~/.codex/skills/superpowers/` fallback is removed on update
- **Cursor**: native Cursor `/add-plugin superpowers`; legacy `~/.cursor/skills/superpowers/` fallback is removed on update
- **OpenClaw and other non-native platforms**: `git clone --depth 1` / skill fallback
- Plugin install is detected and skipped if already installed (checks `claude plugins list --json`)

## Special Notes

- **Dual-channel distribution** is unique to superpowers among the 9 dependencies
- The `claudePlugin` field in `config/skills.json` triggers the plugin install path
- The `codexPlugin` and `cursorPlugin` fields prevent Meta_Kim from presenting a copied skill directory as a native plugin install
- Install script uses `CLAUDE_PLUGIN_SPECS` array to manage plugin installs
- Install script has Windows-specific `.cmd` vs `.exe` probing logic for Claude CLI

## Data Source

- GitHub README: full content analysis
- obra/superpowers repository
- `config/skills.json` manifest analysis

Research date: 2026-04-13
