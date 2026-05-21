# Meta_Kim for Codex

This file is the Codex entrypoint for maintaining Meta_Kim. Read it as the resident operating guide for this repository, not as a marketing overview.

## Fast Read

If you only keep five rules in mind:

- Meta_Kim is one cross-runtime governance system. Claude Code, Codex, OpenClaw, and Cursor are projections of the same canonical layer.
- `meta-warden` is the normal public front door. Other meta agents are backstage specialists.
- Dispatch is capability-first: describe the capability, search agents / skills / tools / capability indexes, then choose the best owner.
- Long-term behavior lives in `canonical/`, `config/contracts/`, and `config/capability-index/`. Runtime trees are projections unless explicitly documented otherwise.
- User-visible worker names must be coarse business role-family names such as `前端`, `后端`, `测试`, `frontend`, `backend`, or `test`, not scoped work items or host-generated personal nicknames.

## Codex Output Rules

- On Windows, do not output raw Windows paths in normal Markdown text. Wrap paths in backticks and prefer forward slashes, for example `D:/KimProject/Meta_Kim`.
- Do not paste full diffs or patches into chat after GitHub submit.
- After GitHub submit, report only the branch name, commit hash, PR URL when present, and a short summary.

## What This Repository Is

Do not read Meta_Kim as a folder full of unrelated prompt files.

Read it as:

**a cross-runtime architecture pack for intent amplification, governed through small replaceable meta units and projected into multiple AI runtimes.**

In this repo, `meta` means the smallest governable unit that supports intent amplification. A valid meta unit:

- owns one clear responsibility class
- states what it refuses, not only what it does
- can be reviewed on its own
- can be replaced or rolled back
- does not silently absorb unrelated responsibilities

## Source Of Truth

Edit these for durable behavior:

- `canonical/agents/*.md`
- `canonical/skills/meta-theory/SKILL.md`
- `canonical/skills/meta-theory/references/*.md`
- `canonical/runtime-assets/*`
- `config/contracts/`
- `config/capability-index/`

Treat these as generated mirrors or runtime adapters unless the task explicitly targets runtime wiring:

- `.claude/agents/*.md`
- `.claude/skills/meta-theory/`
- `.claude/hooks/`
- `.claude/settings.json`
- `.mcp.json`
- `.claude/capability-index/`
- `.codex/agents/*.toml`
- `.codex/skills/`
- `.codex/capability-index/`
- `.cursor/agents/*.md`
- `.cursor/skills/meta-theory/`
- `.cursor/mcp.json`
- `.cursor/capability-index/`
- `openclaw/skills/`
- `openclaw/workspaces/*`
- `openclaw/capability-index/`
- `openclaw/openclaw.template.json`

After changing canonical sources, sync projections instead of hand-forking runtime copies.

## Codex Runtime Map

When this repository is opened in Codex:

- `AGENTS.md` is this resident project guide.
- `.codex/agents/*.toml` contains Codex custom-agent mirrors for the Meta_Kim team.
- `.codex/skills/meta-theory/` is the Codex project skill mirror.
- `.codex/hooks.json` and `.codex/hooks/` carry Codex-compatible project hook wiring.
- `codex/config.toml.example` is generated from `canonical/runtime-assets/codex/config.toml.example`.

Cursor parity is maintained through `.cursor/agents/*.md`, `.cursor/skills/meta-theory/`, `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/mcp.json`, and `.cursor/capability-index/`.

## Capability-First Dispatch

Meta_Kim does not start with "call agent X". It starts with "what capability is needed?"

Use this order:

```text
Need capability
-> Search repo canonical capability index
-> Search runtime mirror indexes
-> Search local runtime inventory
-> Search available skills and tools
-> Choose the best owner by boundary fit
-> Dispatch with explicit scope, deliverable, review owner, and verification owner
```

Capability-index fetch order:

```text
config/capability-index/
-> .claude/.codex/.cursor/openclaw capability-index mirrors
-> .meta-kim/state/{profile}/capability-index/
-> explicit fallback
```

Hardcoding a specific agent name before discovery is a shortcut, not the canonical method.

## Meta-Theory Activation

When `/meta-theory`, `meta-theory`, `meta theory`, `run meta theory`, `execute meta theory`, `元理论`, or an explicit `meta-theory` skill mention appears, treat it as a governance-mode request.

Codex must first run:

```text
Critical -> Fetch -> Thinking
```

That means:

- clarify blockers before dispatch when the request is ambiguous
- perform capability discovery before naming execution owners
- enumerate at least two viable solution paths for non-trivial work
- decide ownership, sequencing, parallel groups, merge owner, review owner, and verification owner before execution
- dispatch execution work to agents or skills instead of collapsing all work into the main thread

For Codex, explicit meta-theory activation is also explicit permission to use subagents. The main thread scopes, delegates, reviews, and synthesizes; it does not become the all-purpose executor for complex work.

## Business Flow Before Execution

For executable work, plan the business flow before writing code or changing files. A web app, for example, may need separate lanes for:

- product direction
- UX flow
- UI system
- frontend
- backend
- database
- auth / security
- motion / interaction polish
- tests / QA
- release / install path
- feedback and evolution

Not every task needs every lane, but omitted lanes should be intentional. The business-flow blueprint should explain:

- what capability is needed
- which existing agent / skill / tool was found
- whether an owner is reused, upgraded, or newly created
- which lanes can run in parallel
- who merges the outputs
- how the result will be reviewed and verified

## Agent Display Names

Separate these three names:

- `ownerAgent`: the real governance or execution owner, for example `meta-conductor` or `frontend-developer`
- `roleDisplayName`: the short user-visible business role family, for example `前端`, `后端`, `测试`, `frontend`, `backend`, or `test`
- `runtimeInstanceAlias`: the host runtime's incidental nickname, if any

Rules:

- Do not show host-generated personal names as the primary agent name.
- Prefer short role names over long task descriptions.
- Do not put concrete work items into `roleDisplayName`; put shard or task scope in `roleInstanceId`, `shardScope`, `parallelGroup`, `dependsOn`, `mergeOwner`, and collision boundaries.
- If the same owner runs multiple parallel instances, keep the same coarse `roleDisplayName` and separate instances with `roleInstanceId`.

## Eight-Stage Spine

Meta_Kim's execution backbone is:

```text
Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution
```

The 11-phase business workflow is separate:

```text
direction -> planning -> execution -> review -> meta_review -> revision -> verify -> summary -> feedback -> evolve -> mirror
```

The relationship is simple:

- the 8-stage spine governs execution logic
- the business workflow governs run packaging and deliverable closure
- business phases do not rename or replace the spine

## Hidden Governance Packets

A governed run should leave enough structure to audit what happened. Important packets include:

- `taskClassification`
- `cardPlanPacket`
- `businessFlowBlueprintPacket`
- `agentBlueprintPacket`
- `dispatchEnvelopePacket`
- `workerTaskPacket`
- `reviewPacket`
- `revisionResponses`
- `verificationResults`
- `summaryPacket`
- `evolutionWritebackPacket`

Do not claim a run is public-ready unless verification passed, summary closure exists, a single primary deliverable was maintained, and the deliverable chain is closed.

## Planning Files

When `planning-with-files` is installed and the task is not a pure query, create persistent planning state at Stage 3:

- `task_plan.md`
- `findings.md`
- `progress.md`

These files supplement protocol packets. They do not replace `businessFlowBlueprintPacket`, `dispatchEnvelopePacket`, or verification evidence. The Conductor or the main thread acting as Conductor is the sole writer.

## The Nine Meta Agents

- `meta-warden`: coordination, arbitration, final synthesis, Warden gate
- `meta-conductor`: workflow, stage sequencing, business-flow blueprint, rhythm control
- `meta-genesis`: `SOUL.md`, identity, persona, prompt architecture
- `meta-artisan`: skill / MCP / tool fit, capability loadout
- `meta-sentinel`: safety boundaries, permissions, hooks, rollback
- `meta-librarian`: memory, continuity, context policy
- `meta-prism`: quality review, drift detection, anti-slop review
- `meta-scout`: external capability discovery and evaluation
- `meta-chrysalis`: evolution signal aggregation and writeback coordination through Warden's gate

Meta agents govern. They do not become generic implementation workers when a better execution specialist exists.

## Correct Execution Shape

Anti-pattern:

```text
User: build a notification system
Assistant: immediately edits ten files as one undifferentiated worker
```

Correct pattern:

```text
User: build a notification system
Assistant:
1. Critical: clarify material ambiguity
2. Fetch: discover existing capabilities
3. Thinking: map lanes, owners, dependencies, and merge plan
4. Execution: dispatch bounded work to the right agents / skills
5. Review: inspect outputs against quality and boundaries
6. Meta-Review: verify the review standard when risk is high
7. Verification: run fresh checks
8. Evolution: record reusable patterns or decide no writeback
```

## Graphify

This repository has a knowledge graph under `graphify-out/`.

Rules:

- For broad architecture or codebase questions, start with `graphify-out/GRAPH_REPORT.md` when present.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Use graph queries or subgraph extraction when available for focused relationships.
- Dirty `graphify-out/` files can be expected after hooks or incremental updates; dirty graph files are not a reason to skip graph context.
- `npm run meta:graphify:check` and `npm run meta:validate` compare the graph's built commit with current `git rev-parse HEAD` and fail when `GRAPH_REPORT.md` is stale.
- After modifying code files, run `npm run meta:graphify:rebuild` to keep the graph current across Windows, macOS, and Linux.

## Maintenance Loop

After changing canonical behavior, contracts, hooks, or runtime-facing docs:

1. `npm run meta:sync`
2. `npm run discover:global`
3. `npm run meta:check`
4. `npm run meta:check:global`
5. `npm run meta:verify:all` before release or after larger changes

Use these supporting commands as needed:

- `npm run meta:validate`
- `npm run meta:check:runtimes`
- `npm run meta:doctor:governance`
- `npm run meta:eval:agents`
- `npm run meta:eval:agents:live`
- `npm run meta:validate:run -- <artifact.json>`
- `npm run meta:index:runs -- <artifact-dir-or-file>`
- `npm run meta:query:runs -- --owner <agent>`
- `npm run migrate:meta-kim -- <source-dir> --apply`
- `npm run meta:graphify:check`
- `npm run meta:graphify:rebuild`
- `npm run meta:deps:install`
- `npm run meta:deps:install:all-runtimes`
- `npm run meta:deps:update`
- `npm run meta:deps:update:all-runtimes`
- `npm run meta:sync:global`
- `npm run prompt:next-iteration`

`npm run meta:verify:all` runs runtime sync checks, project validation, graphify health, global sync checks, smoke-level runtime acceptance, setup tests, and meta-theory tests.

## Install And Packaging Notes

- Node must satisfy the `package.json` engine requirement.
- `package.json` uses a `files` whitelist so GitHub / npm tarballs include the full `canonical/` tree.
- `node setup.mjs` installs selected platform projections and graphify wiring idempotently.
- Runtime target selection has two layers: repo defaults in `config/sync.json`, machine-active targets in `.meta-kim/local.overrides.json`.
- MCP Memory Service uses port `8000`.
- `stop-memory-save.mjs` saves session summaries to the MCP Memory Service on session end.

## Reading Order

For maintainers:

1. `README.md` or `README.zh-CN.md`
2. `AGENTS.md`
3. `CLAUDE.md` when touching Claude Code behavior
4. `docs/runtime-capability-matrix.md` when changing cross-runtime trigger, hook, review, verification, stop, or writeback behavior
5. `canonical/skills/meta-theory/references/dev-governance.md` for the long-form governed execution contract
