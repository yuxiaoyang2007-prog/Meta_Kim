# hookprompt - Dependency Research

## Repository

- **Owner**: KimYx0207
- **Repo**: https://github.com/KimYx0207/HookPrompt
- **Install ID**: `hookprompt`

## Content

Claude Code Hook system optimization tool. Enhances prompt quality and behavior through Claude Code's hook infrastructure. Configures hooks in `.claude/hooks/` and `.claude/settings.json` to intercept and optimize prompts.

## Format

- **Standard**: Claude Code-specific (hooks + settings)
- **Structure**: Root-level files in the repository
- **Subdir**: None

## Cross-Platform Compatibility

| Platform | Compatible | Notes |
|----------|-----------|-------|
| Claude Code | **Y** | Uses `.claude/hooks/` + `.claude/settings.json` |
| Codex | **Y, via adapter** | Meta_Kim adapts HookPrompt output into Codex `UserPromptSubmit` hooks |
| OpenClaw | **N / degraded** | HookPrompt itself only implements Claude Code hook format; OpenClaw is skipped |
| Cursor | **Y, via adapter** | Meta_Kim adapts HookPrompt output into Cursor `beforeSubmitPrompt` hooks |

## Distribution Configuration

```json
{
  "id": "hookprompt",
  "repo": "${skillOwner}/HookPrompt",
  "targets": ["claude"]
}
```

HookPrompt is native to Claude Code. Codex and Cursor are distributed through Meta_Kim adapters; OpenClaw remains skipped because HookPrompt does not publish an OpenClaw hook format.

## Install Method

- **Claude Code**: native hook install through `git clone --depth 1`
- **Codex**: adapter install into Codex `UserPromptSubmit`
- **Cursor**: adapter install into Cursor `beforeSubmitPrompt`
- **OpenClaw**: automatically skipped / degraded

## Special Notes

- Depends on Claude Code's hook system (`PreToolUse`, `PostToolUse`, `Stop`) for native use
- Writes to `.claude/hooks/` directory and modifies `.claude/settings.json`
- Part of the KimYx0207 skill ecosystem (same owner as Meta_Kim)
- Cross-runtime support is adapter-based for Codex and Cursor, not schema-compatible native reuse

## Data Source

- GitHub README analysis
- `config/skills.json` manifest analysis
- Install script code analysis

Research date: 2026-04-13
