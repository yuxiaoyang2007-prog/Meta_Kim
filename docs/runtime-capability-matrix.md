# Meta_Kim Runtime Capability Matrix

Meta_Kim integrates Claude Code, Codex, OpenClaw, and Cursor, but these hosts are not the same product. The project must not pretend that all runtime surfaces are isomorphic.

The correct model is:

- one canonical agent source
- one canonical skill / meta-theory source
- one contract source
- one capability-index source
- native entrypoints for each runtime
- explicit downgrade notes when no 1:1 host surface exists
- runtime directories as mirrors / projections only

## Core Capability Mapping

| Capability | Claude Code | Codex | OpenClaw | Cursor | Meta_Kim implementation |
| --- | --- | --- | --- | --- | --- |
| Theory / skill entry | `.claude/skills/meta-theory/` runtime mirror | `.agents/skills/meta-theory/` project skill + `.codex/skills/meta-theory/` compatibility mirror | `openclaw/skills/meta-theory/` + workspace mirror | `.cursor/skills/meta-theory/` runtime mirror | Synced to each runtime by the project governance layer |
| Role / agent entry | `.claude/agents/*.md` + `~/.claude/agents/*.md` | `.codex/agents/*.toml` + `~/.codex/agents/*.toml` | `openclaw/workspaces/<agent>/` + `~/.openclaw/agents/` | `.cursor/agents/*.md` + `~/.cursor/agents/*.md` with project-level priority | Synced by project governance; global capabilities are integrated through discovery |
| Agent file format | Markdown + YAML frontmatter | TOML with `name`, `description`, `developer_instructions`, and optional `nickname_candidates` | workspace file group + template JSON | Markdown + YAML frontmatter + rules/context | Codex TOML fields must not leak into other runtimes |
| Subagent / multi-agent | Native subagents | Native custom agents / subagents | Native multi-agent + agent-to-agent | Native Cursor agent rules | The 9 meta agents are mapped across all four runtimes; global agents are called as needed |
| Skill | `.claude/skills/<name>/SKILL.md` + `~/.claude/skills/` | `.agents/skills/<name>/SKILL.md` project skill + `.codex/skills/<name>/SKILL.md` compatibility mirror + `~/.codex/skills/` | `<workspace>/skills/` + `skills.load.extraDirs[]` + `~/.openclaw/skills/` | `.cursor/skills/<name>/SKILL.md` + `~/.cursor/skills/` | Project skills are mirrored into runtime-specific locations |
| Hook / guard | `.claude/settings.json` hooks + `~/.claude/hooks/` | `.codex/hooks.json` trusted project/user hooks | Plugin SDK hooks + bundled/internal hooks | `.cursor/hooks.json` lowerCamel lifecycle hooks + `~/.cursor/hooks/` | Hook capability maps to each runtime's native surface; missing official surfaces are explicitly downgraded |
| Memory | SessionStart + Stop MCP Memory hooks | SessionStart / UserPromptSubmit / Stop MCP Memory hooks | `MEMORY.md` + `session-memory` + MCP Memory managed hook | beforeSubmitPrompt / stop MCP Memory hooks | Meta memory strategy is sourced from canonical runtime assets |
| Capability index | `.claude/capability-index/` mirror | `.codex/capability-index/` mirror | `openclaw/capability-index/` mirror | `.cursor/capability-index/` mirror | Project index mirrors to runtimes; global discovery writes local inventory |

## Capability Index And Global Discovery

Meta_Kim supports cross-platform global capability discovery:

```bash
# Show current global capability counts
npm run discover:global

# Show detailed inventory
npm run discover:global -- --json
```

Discovery covers:

- **Claude Code**: `~/.claude/agents/`, `~/.claude/skills/`, `~/.claude/hooks/`, `~/.claude/plugins/`, `~/.claude/commands/`
- **OpenClaw**: agents / skills / hooks / commands under `~/.openclaw/`
- **Codex**: agents / skills / commands under `~/.codex/`
- **Cursor**: `~/.cursor/skills/`, `~/.cursor/plugins/`, `~/.cursor/agents/`
- repository-level capability-index mirrors plus the local inventory at `.meta-kim/state/{profile}/capability-index/global-capabilities.json`

The Fetch-stage capability-index order is:

1. repo canonical: `config/capability-index/`
2. runtime mirrors: `.claude/capability-index/`, `.codex/capability-index/`, `.cursor/capability-index/`, `openclaw/capability-index/`
3. local inventory: `.meta-kim/state/{profile}/capability-index/global-capabilities.json`
4. fallback: explicitly record the miss, then route to general execution or capability creation

Discovered capability types:

- **Agents**: reusable specialists such as `ai-engineer`, `backend-architect`, or `code-reviewer`
- **Skills**: triggerable capabilities such as `agent-browser`, `planning-with-files`, or `claudeception`
- **Hooks**: PreToolUse / PostToolUse / UserPromptSubmit / SessionStart hooks
- **Plugins**: Claude Code plugins such as LSP servers or tool extensions
- **Commands**: slash commands such as `commit`, `debug`, or `test-driven-development`

To get current counts, run `npm run discover:global`. It prints a summary like:

```text
Global Capability Summary
Claude Code (~/.claude)
   agents: [current count]
   skills: [current count]
   hooks: [current count]
   plugins: [current count]
   commands: [current count]
```

The meta architecture's Fetch stage includes repository canonical sources, runtime mirrors, global capabilities, and local inventory before platform-specific invocation. For example, Claude Code uses `subagent_type`, while OpenClaw uses its workspace/session mechanism.

Typical examples:

- user asks for "review code" -> match `everything-claude-code:code-reviewer`
- user asks for planning -> match the `planning-with-files` skill
- user asks to commit code -> match the `commit` command

## Source Locations

- Agent source: `canonical/agents/*.md`
- Skill / meta-theory source: `canonical/skills/meta-theory/SKILL.md` and `canonical/skills/meta-theory/references/*.md`
- Contract source: `config/contracts/`
- Capability-index source: `config/capability-index/`

## Derived Artifacts / Runtime Mirrors

- Claude Code runtime projection: `.claude/agents/`, `.claude/skills/meta-theory/`, `.claude/hooks/`, `.claude/settings.json`, `.claude/capability-index/`
- Codex custom agents: `.codex/agents/*.toml`; `worker.toml` / `explorer.toml` are generic fallback adapters, while `frontend.toml`, `backend.toml`, `test.toml`, `review.toml`, `analysis.toml`, `verify.toml`, and `docs.toml` are business-role adapters for hosts that honor `nickname_candidates` and named custom agents. If Codex Desktop or a tool-backed session still shows `Popper`, `Zeno`, or another host nickname, Meta_Kim records it as `runtimeInstanceAlias`; it does not count as a project-level `roleDisplayName`.
- Codex project skill: `.agents/skills/meta-theory/SKILL.md`
- Codex compatibility skill mirror: `.codex/skills/meta-theory/SKILL.md`
- Codex slash command: `.codex/commands/meta-theory.md` / `~/.codex/commands/meta-theory.md`
- Codex capability mirror: `.codex/capability-index/`
- OpenClaw workspaces: `openclaw/workspaces/*`
- OpenClaw installable skill: `openclaw/skills/meta-theory/SKILL.md`
- OpenClaw config: `openclaw/openclaw.template.json`
- OpenClaw capability mirror: `openclaw/capability-index/`
- Cursor runtime projection: `.cursor/agents/`, `.cursor/skills/meta-theory/`, `.cursor/mcp.json`, `.cursor/capability-index/`

## Standard Update Flow

After changing a canonical agent, shared skill, workflow contract, or capability index:

1. Edit the source-of-truth file first.
2. Run `npm run meta:sync`.
3. Run `npm run discover:global`.
4. Run `npm run meta:sync:global` when global installation folders must receive the updated assets.
5. Run `npm run meta:check`.
6. Run `npm run meta:check:global`.
7. Run `npm run meta:eval:agents` for no-LLM runtime smoke.
8. Run `npm run meta:eval:agents:live` when prompt-backed runtime acceptance is required.
9. Update `README.md`, `CLAUDE.md`, and `AGENTS.md` when the runtime contract changes.

## Behavior Parity Matrix

This table defines minimum behavior constraints, not surface-level uniformity.

| Parity item | Claude Code | Codex | OpenClaw | Cursor | Required invariant |
| --- | --- | --- | --- | --- | --- |
| trigger parity | Triggered through canonical skill + hook / prompt discipline | Triggered through project instructions + custom agents / runtime adapter | Triggered through workspace boot + hooks | Triggered through project rules + agent rules | All runtimes must produce `taskClassification` before choosing `query / simple_exec / complex_dev / meta_analysis / proposal_review / rhythm` |
| card parity | Thinking + protocol packets decide cards | Project skill / agents / adapters decide cards | Workspace / agent flow decides cards | Project skill / agent rules decide cards | All runtimes must produce equivalent `cardPlanPacket` and explicitly record dealer, card, delivery shell, and suppression reason |
| blueprint / role naming parity | Hooks can block dispatch lacking `businessFlowBlueprintPacket` / `agentBlueprintPacket`, lane scans, or proper role naming | Primarily enforced through conversation preflight, project instructions, and validator fallback; missing fields cannot become public-ready | Primarily enforced through workspace conversation gate, agent flow, and validator fallback; dispatch pauses on missing fields | Primarily enforced through Custom Modes / agent rules, conversation gate, and validator fallback | Every lane records `capabilitySearchQuery`, `candidateOwners`, `matchedCapabilities`, `capabilityBindings`, `selectedOwner`, `selectionReason`, and `coverageStatus`; user-visible role names are English business role families; runtime nicknames stay in `runtimeInstanceAlias`; role gaps or create/upgrade paths require `capabilityGapPacket` / `executionAgentCard` |
| silence parity | Warden/Conductor use gate + prompt discipline | Adapter / validator controls no-card and defer | Workspace / runtime gate controls silence | Project rules control silence | All runtimes must support `noInterventionPreferred`, `silenceDecision`, and `reasonForSilence`; non-interruption cannot mean omission |
| control-decision parity | skip / interrupt / override driven by hook + governance owner | driven by validator / adapter / agent decision | driven by runtime hooks + governance owner | driven by agent rules | All runtimes must record `skipReason`, `interruptReason`, `overrideReason`, and `insertedGovernanceOwner`, plus how the run returns to the spine |
| shell parity | Claude output adapts to audience shell | Codex output adapts to audience shell | OpenClaw output adapts to audience shell | Cursor output adapts to audience shell | All runtimes distinguish the intent core from `deliveryShell`; the same core can use different shells |
| language parity | User-facing text follows runtime/tool selected output language, then explicit user choice, then latest user input; canonical stage labels such as `Critical / Fetch / Thinking / Review` remain English | Same; Codex uses a same-language confirmation card when native choice is unavailable | Same; fallback is declared when native choice is unavailable | Same; Custom Modes / mode picker text follows the same priority | User-facing options must not hardcode a single locale; `intentGatePacket`, `cardDecision`, and `deliveryShell` record language source |
| native choice parity | Prefer Claude Code native hook / prompt surface | Prefer Codex `request_user_input` when listed; config should set `[features] default_mode_request_user_input = true` | Prefer OpenClaw native agent / workspace choice mechanism | Prefer Cursor Custom Modes / mode picker | When no native popup exists, record `conversation_fallback`; do not pretend all runtimes share the same popup |
| hook parity | `.claude/settings.json` native hooks | `.codex/hooks.json` native hooks with same-source `enforce-agent-dispatch.mjs` projection | Plugin SDK hooks + `openclaw.template.json` internal hooks | `.cursor/hooks.json` native hooks with same-source `enforce-agent-dispatch.mjs` projection and `failClosed: true` | Dangerous command blocking, context injection, and pre-completion audits use each platform's capability; event names and config formats need not be isomorphic. Capability-first and meta-readonly gates are mechanically projected in Claude / Codex / Cursor; current OpenClaw remains declarative until a plugin enforcement adapter is installed |
| review parity | specialist + Warden/Prism review | custom agent / subagent review | agent-to-agent / local workspace review | agent rules review | Review always produces `reviewPacket.findings[]`, never just PASS/FAIL |
| verification parity | verification hook + agent recheck | script / subagent recheck | workspace verification flow | agent rules recheck | Verify consumes `revisionResponses` and `verificationResults`, then explicitly closes findings |
| stop condition parity | hook / gate blocks public-ready | validator / adapter blocks public-ready | hook / runtime gate blocks public-ready | hook / agent rules block public-ready | A run cannot be final public-ready without `verifyPassed`, `summaryClosed`, and a closed deliverable chain |
| writeback parity | write canonical assets directly | write canonical then sync mirrors | write canonical then sync workspace mirrors | write canonical then sync mirrors | Evolution must produce `writebackDecision = writeback|none`; silent omission is forbidden |
| run artifact parity | can produce and validate real run packets | can produce and validate real run packets | can produce and validate real run packets | can produce and validate real run packets | All runtimes use the same `validate-run-artifact` chain rather than static field checks only |

## Drift Detection

README files can explain the model, but they cannot guarantee parity. Drift control depends on:

- canonical sources fixed at `canonical/agents/*.md`, `canonical/skills/meta-theory/`, `config/contracts/`, and `config/capability-index/`
- `npm run meta:sync` generating Claude Code / Codex / OpenClaw / Cursor mirrors
- `npm run discover:global` refreshing local/global capability inventory and repository capability-index mirrors
- `npm run meta:sync:global` updating the installation folders configured for global runtime use
- `npm run meta:check` verifying runtime mirrors, sync coverage, and project validity
- `npm run meta:check:global` verifying global installation mirrors
- `npm run meta:eval:agents` for lightweight runtime smoke
- `npm run meta:eval:agents:live` for real prompt-backed runtime acceptance

If a runtime can only be described as equivalent in README text, but validator and smoke/live acceptance cannot prove it, it is not truly equivalent.
