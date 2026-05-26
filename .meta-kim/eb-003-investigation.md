# EB-003 Investigation — ECC GateGuard Fact-Batching

**Status**: Investigation complete. Plugin edit NOT performed. User decision required.

**Date**: 2026-05-25
**Closes**: Partial — investigation only, no remediation applied
**Tracking**: Carry-forward to v2.3.0 OR earlier patch if user selects an option

## Context

ECC GateGuard (Fact-Forcing Gate) requires 4-fact prelude before every Edit/Write/Bash on tracked files. During v2.2.4 and v2.2.5 runs, this caused operational drag. v2.2.2 review flagged this as EB-003.

User correctly pointed out during v2.2.5 setup that EB-003 IS reachable because ECC is a Claude Code installed plugin.

## Investigation Evidence

**Plugin location**: `C:\Users\Kim\.claude\plugins\marketplaces\ecc\scripts\hooks\gateguard-fact-force.js` (also under `~/.claude/plugins/cache/ecc/ecc/2.0.0-rc.1/scripts/hooks/`)

**Plugin version**: ECC v2.0.0-rc.1

**Header note (lines 18-21)**: "Full package with config support: pip install gateguard-ai". The JS version distributed with ECC has NO native batching config.

**Key env vars**: `GATEGUARD_STATE_DIR`, `ECC_DISABLED_HOOKS`, `ECC_GATEGUARD`

**Hook IDs**: `pre:edit-write:gateguard-fact-force`, `pre:bash:gateguard-fact-force`

**Constants** (lines 38-40):
- `SESSION_TIMEOUT_MS = 30 * 60 * 1000` (30 min)
- `READ_HEARTBEAT_MS = 60 * 1000` (60 sec)

**Upstream**: https://github.com/zunoworks/gateguard

## Decision Options

### Option A — `pip install gateguard-ai`
Install Python package which may have native batching config. Pro: legitimate path. Con: introduces Python dependency for a Claude Code plugin; need to verify JS↔Python interop.

### Option B — Disable via `ECC_DISABLED_HOOKS`
Set env var `ECC_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force,pre:bash:gateguard-fact-force`. Pro: immediate relief. Con: loses fact-forcing protection — runs vulnerable to fabrication chains.

### Option C — Fork ECC, upstream PR
Implement batching in JS hook, submit PR. Pro: long-term correct. Con: cross-org coordination cost.

### Option D — Meta_Kim wrapper hook
Build Meta_Kim-side hook mediating PreToolUse → ECC GateGuard with batching. Pro: zero ECC change. Con: more hook complexity.

## Recommendation

Defer decision to user. v2.2.5 records investigation. NO plugin edit applied. NO env var change applied.

## References

- EB-003 origin: v2.2.2 review evolution backlog
- Plugin header: `~/.claude/plugins/cache/ecc/ecc/2.0.0-rc.1/scripts/hooks/gateguard-fact-force.js:18-21`
