# Scripts Inventory

This directory is intentionally large because Meta_Kim exposes most maintenance and product checks as small CLI entrypoints. Do not prune scripts by filename count alone.

## Current Shape

- Top-level `.mjs` scripts: 95
- MCP server scripts: 1 (`scripts/mcp/meta-runtime-server.mjs`)
- Direct `package.json` entries: 105
- Referenced helper scripts: 21
- Cleanup candidates with no current external reference evidence: 3

## Core Loop And Discovery Bus

- Default governed execution entry: `npm run meta:theory:run` (`scripts/run-meta-theory-governed-execution.mjs`).
- Machine contract: `config/contracts/core-loop-contract.json`.
- Strict run artifact validator: `npm run meta:validate:run -- <artifact.json>` for full workflow-contract artifacts.
- Local capability discovery bus: `npm run meta:capabilities:index` (`scripts/build-capability-inventory.mjs`), which writes `.meta-kim/state/default/capability-inventory.json` with unified provider records across agents, skills, scripts, commands/tools, MCP, hooks, runtime, OS, memory, graph, and external dependency candidates.

## Main Buckets

| Bucket | What It Does | Examples | Keep Rule |
|---|---|---|---|
| Core engines | Capability-gap decisions, governed execution, routing, state, and tests | `capability-gap-mvp.mjs`, `run-meta-theory-governed-execution.mjs`, `select-execution-route.mjs`, `sqlite-runtime.mjs`, `run-node-tests.mjs` | Keep. These are behavior roots or test roots. |
| Product/report generators | Produce PRD-backed evidence reports, panels, bundles, and replay artifacts | `generate-*-report.mjs`, `run-product-reviewer-replay.mjs`, `run-complex-capability-gap-inputs.mjs` | Keep while their package script or meta-theory test exists. |
| Runtime evidence | Probe or evaluate Claude, Codex, Cursor, OpenClaw, OS, graphify, and live shards | `eval-meta-agents.mjs`, `probe-runtime-capabilities.mjs`, `generate-runtime-live-shard-matrix.mjs`, `graphify-cli.mjs` | Keep. These protect anti-overclaim release boundaries. |
| Sync/install/release | Install, sync projections, uninstall, migrate, check dependencies, and update global targets | `sync-runtimes.mjs`, `install-global-skills-all-runtimes.mjs`, `postinstall-check.mjs`, `uninstall.mjs` | Keep unless the package script and tests are removed together. |
| Validators | Validate project, runtime, provider, prompt, route, run artifact, and governance contracts | `validate-*.mjs`, `score-capability-candidates.mjs` | Keep. Validators are release and safety gates. |
| Doctor/status utilities | Human-facing diagnostics, status, compaction, migration, and next-iteration prompts | `doctor-*.mjs`, `footprint.mjs`, `write-compaction.mjs`, `prompt-next-iteration.mjs` | Keep if exposed in `package.json`; otherwise inspect before cleanup. |
| Shared helpers | Imported by package entries, tests, hooks, or setup flows | `governance-lib.mjs`, `meta-kim-local-state.mjs`, `runtime-hook-mapping.mjs`, `node-spawn-config.mjs` | Keep when referenced by imports, tests, config, or hooks. |

## Cleanup Candidates

These had no current external reference evidence in the 2026-06-05 inventory pass:

- `scripts/agent-health-report.mjs`
- `scripts/check-release-notes-consistency.mjs`
- `scripts/meta-kim-aggregate.mjs`

Treat them as **cleanup candidates**, not automatic deletes. Before removing one, check changelog history, release notes, and whether it was intended as a manual one-off CLI.

## Why There Are Many Report Scripts

The `generate-*` and `run-*` scripts are mostly one CLI per product acceptance lane. That made tests and evidence easy to audit, but it made the directory harder to scan.

If consolidation is desired, prefer adding a thin dispatcher such as:

```text
scripts/meta-product-report.mjs <trend|warden|runtime-probe|bundle|research|feedback>
```

Then keep old package script names as aliases during one release cycle so tests and users do not break.

## Do Not Delete Yet

Do not delete these groups without a deeper call-chain review:

- any script referenced by `package.json`
- any script referenced from `tests/`
- any script imported by another script using a relative import
- `sync-runtimes.mjs` and projection-related helpers
- runtime/live evidence scripts
- validators and setup/install scripts
- report generators still named in PRD or test evidence
