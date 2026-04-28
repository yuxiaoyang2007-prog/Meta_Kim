# Research Index

Platform and dependency research for Meta_Kim cross-runtime skill distribution.

## Directory Structure

```
docs/research/
├── README.md                    (this file)
├── distribution-matrix.md       (distribution decision matrix + code review)
├── platforms/                   (per-platform capability research)
│   ├── claude-code.md
│   ├── codex.md
│   ├── openclaw.md
│   └── cursor.md
└── dependencies/                (per-skill dependency research)
    ├── agent-teams-playbook.md
    ├── findskill.md
    ├── hookprompt.md
    ├── superpowers.md
    ├── everything-claude-code.md
    ├── planning-with-files.md
    ├── cli-anything.md
    ├── gstack.md
    └── skill-creator.md
```

## Research Methodology

Three-stage deep research conducted on 2026-04-13:

1. **Stage 1 - Platform Research**: Official documentation analysis for each target platform's skill system, format requirements, path conventions, and capability boundaries.

2. **Stage 2 - Dependency Research**: GitHub README and repository analysis for each of the 9 third-party skill dependencies declared in `config/skills.json`, covering content type, cross-platform compatibility, subdir structure, and special requirements.

3. **Stage 3 - Distribution Matrix**: Cross-referencing Stage 1 and Stage 2 findings to produce a per-skill-per-platform distribution decision with rationale, plus a code review of all related configuration files.

## Key Findings Summary

- All 9 projects use SKILL.md standard format (AgentSkills open standard) - no format conversion needed
- `hookprompt` is correctly claude-only (depends on Claude-specific hooks system)
- `superpowers` uses dual-channel install (Claude plugin marketplace + git clone for others)
- 3 projects require sparse checkout from subdirectories (everything-claude-code, planning-with-files, skill-creator)
- `findskill` has platform-specific subdir selection (windows vs original)
- All current configuration in `config/skills.json` is directionally correct

## Capability Reference Matrix

| Agent | Global Path | Basic Skills | allowed-tools | context:fork | Hooks |
|-------|-------------|-------------|---------------|-------------|-------|
| Claude Code | `~/.claude/skills/` | Y | Y | Y | Y |
| Codex | `~/.codex/skills/` | Y | Y | N | N |
| OpenClaw | `~/.openclaw/skills/` | Y | Y | N | Y |
| Cursor | `~/.cursor/skills/` | Y | Y | N | Y |
