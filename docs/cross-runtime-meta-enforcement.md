# Cross-Runtime Meta Governance Enforcement Matrix

> **Task origin**: A cross-runtime audit found that mechanical governance enforcement was strongest in Claude Code while other runtimes depended more heavily on prompt discipline.
>
> **Purpose**: document the enforcement ceiling for each runtime, avoid false "all four runtimes are identical" claims, and record the implemented projection sources.
>
> **Status update (capability-first v3, 2026-05-25)**: Claude Code, Codex, and Cursor v1.7+ now use the same-source `enforce-agent-dispatch.mjs` hook projection. The default `META_KIM_CAPABILITY_GATE=progressive` is a grace mode; set it to `block` for immediate hard denial. OpenClaw exposes a plugin `before_tool_call` upgrade path, but the current Meta_Kim template has not installed an OpenClaw plugin enforcement adapter. Current OpenClaw enforcement therefore remains declarative through `HEARTBEAT.md` and `SOUL.md`.

## Capability Assessment

| Runtime | Hook config file | PreToolUse-like event | Tool interception / deny | Current mechanism | Projection method |
| --- | --- | --- | --- | --- | --- |
| **Claude Code** | `.claude/settings.json` | `PreToolUse` native Claude schema | Yes: `{hookSpecificOutput.permissionDecision: "deny"}` is interpreted by the host | `.claude/hooks/enforce-agent-dispatch.mjs` from `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`; includes capability-first, node-binding, and meta-readonly gates | direct hook projection through `sync-runtimes.mjs` |
| **Codex** | `.codex/hooks.json` | `PreToolUse` | Yes for supported tool handlers; same-source hook switches payload schema with `META_KIM_HOOK_RUNTIME=codex`; matcher covers `Bash|apply_patch|Edit|Write|MultiEdit|NotebookEdit|Agent|spawn_agent` | `.codex/hooks/enforce-agent-dispatch.mjs` plus `executionBlock=true` in the 9 meta-agent prompts | hook projection + agent prompt declaration |
| **Cursor** | `.cursor/hooks.json` | `preToolUse` lowerCamel event | Yes in Cursor v1.7+: exit code 2 + stderr or stdout JSON `{"permission":"deny",...}` | same-source hook with `META_KIM_HOOK_RUNTIME=cursor`; `failClosed: true`; `.cursor/rules/meta-enforcement.mdc` as backup | hook projection + MDC always-apply backup |
| **OpenClaw** | `openclaw/openclaw.template.json` + Plugin SDK hooks | plugin path can provide `before_tool_call`; current template does not wire it | Not currently implemented in Meta_Kim; file-based internal hooks are lifecycle hooks, not tool-level blockers | workspace `HEARTBEAT.md` hard refusal prose + `executionBlock=true` in all SOUL files | declarative downgrade with a plugin-enforcement upgrade path |

## Runtime Enforcement Layers

| Runtime | Enforcement layer | Hook file | Behavior | Environment override |
| --- | --- | --- | --- | --- |
| Claude Code | hook path; progressive by default | `.claude/hooks/enforce-agent-dispatch.mjs` | in `execution / review / meta_review / verification / evolution`, dispatch without `fetchRecord.capabilitySearchPerformed === true` warns or denies based on effective mode; `critical / fetch / thinking` allow governance discovery only, and execution-intent dispatch requires design-time readiness | `META_KIM_CAPABILITY_GATE=progressive|block|warn|off` |
| Codex CLI | hook path; progressive by default | `.codex/hooks/enforce-agent-dispatch.mjs` | same rule set; covers `Agent` and Codex-native `spawn_agent`; uses Codex-compatible deny payload | same |
| Cursor v1.7+ | hook path; progressive by default | `.cursor/hooks/enforce-agent-dispatch.mjs` | same rule set; `failClosed: true` and Cursor deny JSON / exit code 2 | same |
| OpenClaw | current template: hard prose only | no plugin adapter yet | workspace `HEARTBEAT.md` + all SOUL files state hard refusal; depends on agent compliance until plugin adapter exists | not applicable; use `npm run meta:eval:agents:live` for sampling |

## Projection Sources

| File | Type | Purpose | Status |
| --- | --- | --- | --- |
| `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` | hook implementation | shared mechanical gate source for Claude / Codex / Cursor | existing; now includes capability-first, node-binding, design-readiness, and meta-readonly gates |
| `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc` | Cursor MDC rule | Cursor always-apply declarative backup when hook support is unavailable | existing; text says hook-first, MDC-as-safety-net |
| `.codex/hooks/enforce-agent-dispatch.mjs` | hook projection | Codex mechanical gate from the same source | maintained by `sync-runtimes.mjs` |
| `.cursor/hooks/enforce-agent-dispatch.mjs` | hook projection | Cursor mechanical gate from the same source | maintained by `sync-runtimes.mjs` |
| `scripts/runtime-hook-mapping.mjs` | hook registration | maps the same hook to each runtime's PreToolUse surface | Codex and Cursor entries are explicit |
| `.codex/agents/meta-*.toml` | TOML prompt block | Codex declarative backup with `executionBlock=true` | existing for all 9 agents |
| `openclaw/workspaces/meta-*/SOUL.md` + `HEARTBEAT.md` | SOUL / heartbeat prompt | OpenClaw declarative refusal layer | existing; plugin adapter still missing |

## Enforcement Tiers

```text
L1 Mechanical Block
  Claude Code: PreToolUse -> host-native deny payload
  Codex CLI: PreToolUse -> same-source hook with runtime payload switch
  Cursor v1.7+: preToolUse -> exit code 2 / deny JSON, failClosed
  Shared: capability-first gate + design-readiness gate + meta-readonly gate

L2 Declarative + Always-Apply Backup
  Codex/Cursor agent prompt blocks with executionBlock=true
  Cursor MDC rules as hook failure backup

L3 Declarative Only
  OpenClaw workspace HEARTBEAT.md + SOUL.md prompt blocks
  No current Meta_Kim plugin adapter, so tool-level interception is not guaranteed
```

## Runtime Commitments And Limits

### Claude Code

- Wrongly dispatching a meta agent to execute work can be hard-denied by the hook.
- If spine state is active, direct Write/Edit/Bash before required dispatch can be denied.
- In post-Thinking stages, agent dispatch without capability search evidence can be denied by the capability-first gate.

### Codex

- Codex receives the same-source hook projection through `.codex/hooks/`.
- The matcher includes `Bash|apply_patch|Edit|Write|MultiEdit|NotebookEdit|Agent|spawn_agent`.
- All meta-agent TOML files also declare `executionBlock=true` as a declarative backup.
- Some host/tool combinations may expose fewer hookable tool handlers than Claude Code. Treat `meta:eval:agents:live` as the runtime acceptance check.
- `META_KIM_HOOK_RUNTIME` is an optional override. The hook normally detects `.codex`, `.cursor`, or `.claude` from `process.argv[1]`.

### Cursor

- Cursor v1.7+ supports preToolUse denial through exit code 2 and JSON/stderr output.
- The same-source hook is projected to `.cursor/hooks/`.
- `failClosed: true` means hook crashes default to denial.
- Older Cursor versions downgrade to always-apply rule discipline.

### OpenClaw

- All 9 workspaces declare `executionBlock=true`.
- Current template does not install plugin-level `before_tool_call` enforcement.
- File-based internal hooks are lifecycle automation and must not be described as tool-level interception.
- A future plugin adapter should wrap the same readiness/capability gate; until then OpenClaw remains declarative.

## Environment Variables

| Variable | Values | Default | Purpose |
| --- | --- | --- | --- |
| `META_KIM_META_ENFORCEMENT_MODE` | `warn` / `block` / `progressive` | `progressive` | controls the meta-* readonly boundary. `warn` logs only, `block` denies, `progressive` starts as warn and becomes block after the grace window |
| `META_KIM_META_ENFORCEMENT_GRACE_DAYS` | non-negative integer | `7` | grace days for progressive meta-readonly enforcement |
| `META_KIM_CAPABILITY_GATE` | `progressive` / `block` / `warn` / `off` | `progressive` | controls capability-first and design-readiness gates |
| `META_KIM_HOOK_RUNTIME` | `claude` / `codex` / `cursor` | auto-detected | explicit runtime override for deny payload schema |

Use defaults for new installs and routine use. Set `META_KIM_CAPABILITY_GATE=block` in CI or strict enforcement environments. Use `warn` only for rollout/debugging and `off` only for short-term troubleshooting.

## Cross-OS Compatibility

Historical audit covered the platform matrix below, but this document's latest change was revalidated locally on Windows/Codex. Before a release, rerun `npm run meta:sync`, `npm run meta:check:runtimes`, and `npm run meta:validate` on target OSes or CI:

| OS | Expected status |
| --- | --- |
| Windows 10/11 | supported; use `.cmd` / PowerShell execution paths where needed |
| macOS | supported; POSIX paths |
| Linux | supported; POSIX paths |

Hook scripts use ES modules and Node built-ins only. `sync-runtimes.mjs` is intended to behave consistently across all three OS families.

## Known Gaps

1. **OpenClaw mechanical interception**: OpenClaw plugin layer can expose `before_tool_call`, but Meta_Kim has not installed that adapter yet. File-based internal hooks cannot replace tool-level interception.
2. **Codex `apply_patch` variance**: some versions or host surfaces may treat `apply_patch` differently from other tool handlers. The project mitigates this by matching multiple edit/write tools and requires live runtime acceptance for strong claims.
3. **Older Cursor versions**: below v1.7, preToolUse denial is not guaranteed, so Cursor downgrades to always-apply declarative rules.

## If Four-Way Mechanical Parity Is Required Later

External conditions still needed:

1. OpenClaw plugin enforcement adapter wired into Meta_Kim.
2. Continued verification that Codex exposes all required tool handlers to PreToolUse.
3. Cursor host version requirement pinned or detected before claiming hard enforcement.

Until then, the repository commitment is: Claude / Codex / Cursor v1.7+ mechanical path, OpenClaw declarative path with a plugin upgrade route. Do not claim total four-runtime mechanical equivalence in README, `CLAUDE.md`, or `AGENTS.md`.

## Maintenance Checklist

After changing this matrix or any runtime governance enforcement:

1. Edit canonical source first, usually under `canonical/runtime-assets/<runtime>/...`.
2. Run `npm run meta:sync`.
3. Run `npm run discover:global`.
4. Run `npm run meta:sync:global` when installed global folders must be updated.
5. Run `npm run meta:check`.
6. Run `npm run meta:check:global`.
7. Run `npm run meta:validate`.
8. State in PR notes whether enforcement tiering changed.

## References

- `docs/runtime-capability-matrix.md` - full runtime capability comparison
- `docs/runtime-coverage-audit.md` - coverage and host-limit audit
- `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` - capability-first, node-binding, design-readiness, and meta-readonly gates
- `scripts/runtime-hook-mapping.mjs` - Codex and Cursor hook registration
- `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc` - Cursor declarative backup
- `canonical/agents/meta-*.md` - 9 meta-agent sources with `executionBlock=true`
