# Contributing to Meta_Kim

Meta_Kim is a cross-runtime governance system. Contributions should preserve the
canonical source layer, keep runtime projections generated, and separate local
validation from live runtime proof.

## Before You Change Files

1. Read `AGENTS.md` and the relevant canonical source under `canonical/`,
   `config/contracts/`, or `config/capability-index/`.
2. Run `git status --short` and inspect any target file before editing.
3. If the change touches runtime behavior, inspect
   `config/runtime-capability-matrix.json` and
   `config/os-compatibility-matrix.json`.
4. Treat `graphify-out/` as navigation only. Verify route-changing claims
   against source files.

## Source Of Truth

Durable behavior belongs in:

- `canonical/agents/`
- `canonical/skills/meta-theory/`
- `canonical/runtime-assets/`
- `config/contracts/`
- `config/capability-index/`

Runtime folders such as `.claude/`, `.codex/`, `.agents/`, `.cursor/`,
`openclaw/`, `.mcp.json`, and `codex/` are generated mirrors or local runtime
adapters unless a task explicitly targets runtime wiring. After canonical
changes, run projection sync instead of hand-editing mirrors.

## Development Checks

For routine prompt, docs, changelog, and narrow governance changes:

```sh
npm run meta:sync
npm run discover:global
npm run meta:check
npm run meta:check:global
npm run meta:release:smoke
git diff --check
```

For changes that touch install/update behavior, hooks, runtime matrices,
provider registries, dependency compatibility, MCP wiring, or release-grade
claims, also run the relevant governance and setup checks. `npm run
meta:verify:all` is the broad local verification suite, but it may require
all-runtime and global-hook evidence that is not available on every machine.

## Evidence Rules

Keep these proof layers separate in PRs and issue comments:

- structural or schema checks
- local command checks
- governed runtime artifact checks
- live host or app evidence
- user-visible output evidence
- public-ready or release-ready evidence

Do not claim a native choice surface, subagent dispatch, cross-session recall,
or public release readiness unless the corresponding runtime evidence exists.

## Pull Requests

Use the pull request template. Include:

- intent and non-goals
- files changed
- verification commands and results
- remaining risks or unverified layers
- whether graphify was used only for navigation or rebuilt after source changes

## Security

Report vulnerabilities through the process in `SECURITY.md`. Do not open public
issues with exploit details or credentials.
