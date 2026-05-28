# Changelog

> 🇨🇳 [中文版](./CHANGELOG.zh-CN.md) | English version

All notable changes to Meta_Kim are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
When you tag a release, add a new **`## [version] - YYYY-MM-DD`** section at the top (above older entries) and list changes there.

## [2.4.2] - 2026-05-28

### Fixed

- **Planning files 8-stage coverage** — Updated `planning-files.md` to cover the full spine (Critical → Fetch → Thinking → Execution → Review → Meta-Review → Verification → Evolution) instead of only Stage 3. Each stage now has explicit planning file update responsibilities.
- **SKILL.md reference alignment** — Updated planning-files reference description to reflect 8-stage coverage.

### Changed

- Version bump: 2.4.1 → 2.4.2.

## [2.4.1] - 2026-05-28

### Fixed

- **Meta-theory delivery trust** — Slimmed `/meta-theory` into a progressive dispatcher, split large operational details into references, and aligned Critical / Fetch / Thinking / Review so visible stage feedback is compact, human-readable, follows the resolved user-facing language, and pairs internal packet field names with human labels when shown.
- **Verification evidence hardening** — Bound `verifySteps[].id` to `workerExecutionEvidence[].verifyStepRef`, parse `json-output` evidence as JSON, structure `fixEvidence`, require accepted-risk ownership/revisit data, and prevent skipped worker evidence from claiming verified or public-ready status.
- **Cross-runtime prompt/rules alignment** — Updated Conductor, Artisan, Cursor rules, and runtime prompts so agent-team playbooks only run for 2+ independent parallel lanes, capability discovery is runtime-aware, and generated Cursor prompts avoid duplicate headers/warnings.
- **Release documentation cleanup** — Corrected stale references to removed runtime-matrix docs, updated ECC repository references to `affaan-m/ECC`, and synchronized package metadata for the new release.

### Changed

- Version bump: 2.4.0 -> 2.4.1.
- Added clearer maintainer paths for rules and scripts so users can find the active sources instead of guessing from generated mirrors.

## [2.4.0] - 2026-05-27

### Fixed

- **ECC install policy corrected** — ECC now points at `affaan-m/ECC` and `ecc@ecc`, uses ECC's native CLI `core` profile for home targets (`codex`, `opencode`, `qwen`), removes legacy `everything-claude-code` fallback directories, and warns project-local targets (`cursor`, `zed`, `gemini`, `codebuddy`, `antigravity`, `joycode`) to run ECC from each project root instead of installing into an npm cache or `skills/` fallback. Codex currently receives the upstream `refactor-cleaner` agent, while `/refactor-clean` remains unavailable there because upstream ECC excludes `commands-core` from its Codex target.
- **H-001** — README.md badge links already use https:// (verified, no fix needed)
- **M-002** — MCP Memory Service endpoints use MCP_MEMORY_URL env (verified, no fix needed)
- **M-003** — Version inconsistency - unified to 2.4.0

### Changed

- Version bump: 2.3.2 → 2.4.0
- Updated CHANGELOG.zh-CN.md with corresponding changes

## [2.3.2] - 2026-05-26

### Fixed

- **DOC-001 (MEDIUM) — Data structure contract documentation gap** — Added "Data Structure Contract" section to `SKILL.md` explaining each stage's required output fields, Choice Surface State lifecycle, and validation hooks.
- **DOC-002 (LOW) — State management ownership unclear** — Added "State Management Responsibilities" section to `meta-warden.md` and "Choice Surface State Management" section to `meta-conductor.md`.

## [2.3.1] - 2026-05-26

### Fixed

- EB-002 (HIGH) + HOOK-INFRA-001 (LOW) — read_only_verifier capability slot in spine-state.mjs + dispatchChain auto-append in recordDispatch + read_only_verifier gate in enforce-agent-dispatch.mjs.
- EB-004 (LOW) — preDecisionOptionFrame nesting normalization (warn-only validator + migration helper + canonical-location docs).

### Added

- `scripts/migrate-spine-state-eb004.mjs` migration helper.
- 21-prefix read-only verifier command whitelist.
- `dispatchChain[stage]_supplementary[]` audit field.

### Changed

- `STAGE_META_AGENT_MAP` schema extended (additive, backward-compatible).
- `recordDispatch` signature now accepts `toolInput`.
- Version 2.3.0.1 → 2.3.1.

## [2.3.0.1] - 2026-05-26

### Changed

- Renamed `canonical/runtime-assets/claude/hooks/ecc-batching-wrapper.mjs` → `canonical/runtime-assets/claude/hooks/ecc-permission-cache-wrapper.mjs` (closes W2 F1 finding).
- Docstring aligned with actual permission-cache behavior.
- No behavioral change.

## [2.3.0] - 2026-05-26

### Fixed

- **Item 1 — ECC plugin install failure on macOS (NEW)** — `config/skills.json` defensive spec changed from `ecc@ecc` to `everything-claude-code@ecc` so the install survives the upstream affaan-m/everything-claude-code → ecc plugin rename across legacy + current marketplace caches. `scripts/install-global-skills-all-runtimes.mjs` gains a marketplace refresh loop (`claude plugin marketplace update <id>`) between marketplace registration and plugin install so stale caches get refreshed before resolution. Source-of-truth: local cache evidence at `C:/Users/Kim/.claude/plugins/marketplaces/ecc/.claude-plugin/marketplace.json` (current HEAD, plugin name=ecc, version 2.0.0-rc.1) vs `.../marketplaces/everything-claude-code/.claude-plugin/marketplace.json` (legacy, plugin name=everything-claude-code). The defensive spec works against both states.
- **EB-008 (HIGH) — workerExecutionEvidence silent-success semantics** — `config/contracts/workflow-contract.json::workerExecutionEvidenceField` adds `successMarkerFormat` enum (`stdout-text` | `exit-code-only` | `json-output`) plus `exitCode` and `commandRanAt` properties. Silent-success commands (`node --check`, `tsc --noEmit`) may now record empty `actualOutput` only when `successMarkerFormat="exit-code-only"` AND `exitCode=0` AND `commandRanAt` set. Closes v2.2.5 `accepted_risk` (W1 honestly disclosed exit codes; placeholder pressure pattern `EXIT_OK\n` retired). `canonical/agents/meta-prism.md::Decision Rule 16` extended in parallel (silent-success extension v2.3.0).
- **EB-009 (LOW) — release notes claim retracted (dogfood)** — v2.2.5 release notes claimed `validate-project.mjs:15 loadRuntimeProfiles` was unused. Re-verification shows it is actively called at `validate-project.mjs:2808` inside `validateSyncConfiguration()` plus `scripts/meta-kim-sync-config.mjs:271,333`. Import is REQUIRED. v2.2.5 release notes + CHANGELOG entries gained retraction blockquote/sub-bullets across English + Chinese mirrors. No code prune.
- **EB-010 (MEDIUM) — sibling schema style normalized** — `config/contracts/workflow-contract.json::workerExecutionEvidenceField` reshaped from heterogeneous `fieldType`/`itemSchema`/top-level `enforcement` layout to standard JSON Schema `type`/`items`/`properties` with `_meta` sidecar. Sibling style now matches `verifyStepsField` and `fileCompletionListField`. `_meta.closes` lists `[EB-005, EB-008, EB-010]`.

### Added

- **EB-003 (MEDIUM) — Meta_Kim ECC batching wrapper hook (Option D, user-selected)** — `canonical/runtime-assets/claude/hooks/ecc-permission-cache-wrapper.mjs` (NEW) implements PreToolUse session+file cache key (SHA256(session_id || file_path)) with 5-minute TTL scoped to `os.tmpdir()`. Idempotent + non-fatal cache write failure. Hook not yet wired into `.claude/settings.json` (canonical only); v2.3.x decides registration. See findings: F1 below (`EB-011` backlog).

### Changed

- `package.json` — version `2.2.5 → 2.3.0`.
- Runtime mirrors re-synced (`.claude/`, `.codex/`, `.cursor/`, `openclaw/`) via `npm run meta:sync`.

### Verification

| Check | Result | Marker |
|---|---|---|
| `npm run meta:check` (after meta:sync) | **20/20 pass** | `stdout-text` |
| W2 (Prism) review | qualityGate=pass; 0 HIGH/MEDIUM, 3 LOW → backlog | n/a |
| W3 (Warden) meta-review + verification | pass; Rule 16/17 dogfood honored | n/a |
| Cross-file consistency (`Rule 16` ↔ `successMarkerFormat` enum) | matched enum names + conditions | grep diff |

### Carry-forward to v2.3.1

- **EB-002 (HIGH)** — `read_only_verifier` capability slot. **Spec not yet drafted.** Bug nature confirmed first-hand in v2.3.0 (W2 + W3 reviewer subagents both blocked by `enforce-agent-dispatch.mjs` from running `git diff` / `npm run meta:check` in review/meta_review stages). Requires `spine-state.mjs` changes (frozen). v2.3.1 RFC must define: acceptance criteria, allowed command whitelist, scope contract, test plan.
- **EB-004 (LOW)** — `preDecisionOptionFrame` nesting normalization. **Spec not yet drafted.** Bug surfaced in v2.3.0 (`choiceSurfaceState` had to be set BOTH at spine top-level AND inside `preDecisionOptionFrame` to satisfy the hook's `state.choiceSurfaceState` lookup — confusing field placement). Requires `spine-state.mjs` changes. v2.3.1 RFC must define: canonical field location, migration plan, validator gate.
- **EB-011 (LOW, new in v2.3.0)** — `ecc-permission-cache-wrapper.mjs` docstring claims "batch the related ECC plugin install side-effects" but implementation only writes a per-(session,file) cache marker + returns `permissionDecision=allow` on cache hits (does not suppress/defer tool calls). v2.3.x decision: rename to `ecc-permission-cache-wrapper.mjs` OR strengthen behavior to actually deny/skip duplicate side-effecting calls within TTL.
- **Hook infra bug (new finding, v2.3.0)** — Agent dispatches in `review` / `meta_review` / `verification` stages do not auto-append `ownerAgent` to `dispatchChain.<stage>`. Main thread must hand-edit spine state to record the dispatch. Tracked alongside EB-002 (same root cause: read-only reviewer cannot run verify commands; same fix surface: `spine-state.mjs`).

## [2.2.5] - 2026-05-25

### Fixed

- **EB-005 (HIGH) — Worker verification claim evidence contract** — Workers reporting test pass counts must include `workerExecutionEvidence` entries. Closes v2.2.2/v2.2.3 historical fabrication. See `config/contracts/workflow-contract.json::workerTaskPacket.workerExecutionEvidenceField`. Reviewer gate in `canonical/agents/meta-prism.md::Decision Rule 16` (self-applying per Rule 17).
- **EB-006 (MEDIUM) — Localized trigger exceptions extracted to config** — `scripts/validate-project.mjs::isAllowedLocalizedTriggerLine` no longer hardcodes the v2.2.4 allowlist. Moved to `config/contracts/localized-trigger-exceptions.json` per PRIN-03/04. Backwards-compatible fallback if config missing.
- **EB-007 (LOW) — Narrow-Amendment Protocol documented** — `canonical/skills/meta-theory/references/dev-governance.md` defines the 4-boundary protocol (A: validator/config layer only; B: ≤1 file; C: no worker-facing schema change; D: post-hoc governance record).

### Added

- `config/contracts/localized-trigger-exceptions.json` — config consumed by `validate-project.mjs`
- `.meta-kim/eb-003-investigation.md` — investigation note for ECC GateGuard fact-batching; 4 user decision options; no plugin edit applied

### Changed

- `canonical/agents/meta-prism.md` — Workflow step 5 substep + Decision Rules 16-17
- `config/contracts/workflow-contract.json` — `workerExecutionEvidenceField` added
- `scripts/validate-project.mjs` — `isAllowedLocalizedTriggerLine` config-driven with backwards-compat

### Carry-forward to v2.3.0

- EB-002 (HIGH): `read_only_verifier` capability slot (requires `spine-state.mjs`, frozen)
- EB-004 (LOW): `preDecisionOptionFrame` nesting normalization (requires `spine-state.mjs`, frozen)
- EB-003 (MEDIUM): user decision required on options A-D
- **EB-008 (HIGH, surfaced by v2.2.5 W2 review)**: `workerExecutionEvidence.actualOutput` ambiguity for silent-success commands (e.g., `node --check`, `JSON.parse`). Schema needs `successMarkerFormat` clarification field. v2.2.5 accepts the first-application drift as `accepted_risk` per W2 ruling (alternative was punishing rule self-application on day 1).
- **EB-009 (LOW, surfaced by v2.2.5 W2 review)**: `scripts/validate-project.mjs:15` imports `loadRuntimeProfiles` not referenced by the new `loadLocalizedTriggerExceptions` path. Pre-existing condition; verify and prune if unused.
  - **v2.3.0 retraction:** Claim was incorrect — `validate-project.mjs:2808` actively uses `loadRuntimeProfiles` inside `validateSyncConfiguration()`. Import is required. EB-009 closed as docs-only correction.
- **EB-010 (MEDIUM, surfaced by v2.2.5 W2 review)**: Sibling schema style heterogeneity in `protocols.workerTaskPacket.*` — `verifyStepsField` / `fileCompletionListField` / `workerExecutionEvidenceField` use mixed conventions (`type: "array"` vs `fieldType: "array"`). Normalize.
- Validator-level enforcement of `workerExecutionEvidenceField` (currently narrative-tier + Rule 16)

## [2.2.4] - 2026-05-25

### Fixed (v2.2.2 review evolution backlog closure)

- **EB-001 — Worker per-file write-completion contract** — `config/contracts/workflow-contract.json` adds optional `fileCompletionListField` to `workerTaskPacket`, requiring workers with declared `scopeFiles` to report explicit per-file status (`completed` / `skipped` / `failed` + `skipReason`). `canonical/agents/meta-conductor.md` documents the narrative tier of this contract. Closes the v2.2.2 → NEW-H1 root cause where a worker silently dropped one of the planned target files (CHANGELOG was modified instead of `progress-v2.2.0.md`). Validator enforcement deferred to v2.3.0 R8.
- **NEW-M1 — CHANGELOG narrative accuracy** — The [2.2.2] section's release notes (`.release-notes-v2.2.2.md:71`) under-counted modified files at "9 files" by not including the 4 runtime mirror sync targets (`.claude/`, `.codex/`, `.cursor/`, `openclaw/`). Actual scope was ~13 files. Historical accuracy note added to [2.2.2] section below.
- **NEW-L2 — Release-notes consistency verifier** — `scripts/check-release-notes-consistency.mjs` (new) validates that `.release-notes-vX.Y.Z.md` files exist for each CHANGELOG section since v2.2.2 OR are documented as folded-into-README per `CHANGELOG.md:1184`. Opt-in (`node scripts/check-release-notes-consistency.mjs`); not a mandatory CI gate until v2.2.5+.

### Notes

- **NEW-L1 (capability-index timestamp drift)** — Already addressed by commit `bd70538f` in v2.1.3 (`Stable capability-index regeneration`). No residual gap found in v2.2.4 audit; closure tracked here for completeness.
- **EB-002/003/004** — Explicitly carry-forward to v2.3.0 (require spine-state.mjs changes or out-of-repo work).

### Verification

- `npm run meta:check` → **20/20 pass** (unchanged from v2.2.3; no code touched).
- `npm run meta:test:meta-theory` → **796/796 pass** (unchanged from v2.2.3).
- Production hooks (`spine-state.mjs`, `enforce-agent-dispatch.mjs`) untouched since v2.2.0 Warden freeze.

### Architecture Notes

v2.2.4 is a docs/contract patch closing the v2.2.2 Prism review's HIGH evolution-backlog item (EB-001) and 3 LOW findings (NEW-M1/L1/L2). No production hooks, PoC modules, or test fixtures modified. v2.3.0 retains the remaining backlog (EB-002 read_only_verifier capability slot, EB-003 GateGuard fact-batching, EB-004 preDecisionOptionFrame nesting normalization).

## [2.2.3] - 2026-05-25

### Fixed (v2.2.2 meta-prism review NEW-H1)

- **H2 closure lived in CHANGELOG, not in `progress-v2.2.0.md`** — the original Prism v2.2.0 review H2 finding pointed at the progress doc. The v2.2.2 commit (`c51cbcac`) added the Q4 data-vs-enforcement deferral language to `CHANGELOG.md` but never modified `progress-v2.2.0.md` itself. v2.2.3 closes that gap by appending the "Q4 Status Clarification" subsection to the canonical progress doc, with explicit closure history linking back to v2.2.2 NEW-H1.

### Verification

- `git diff v2.2.1..v2.2.2 -- canonical/runtime-assets/shared/hooks/spine-state.mjs canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` → **empty** (frozen-scope assertion independently confirmed; v2.2.2 NEW-M3 closed).
- `git show --stat c51cbcac -- progress-v2.2.0.md` → **empty** (confirms v2.2.2 did not touch the file; NEW-H1 evidence).
- `node --test tests/poc-design-gate/*.test.mjs` → 59/59 pass (unchanged from v2.2.2; no code modules touched).
- `npm run meta:check` → 20/20 pass.
- `npm run meta:test:meta-theory` → 796/796 pass.

### Architecture Notes

v2.2.3 is a documentation-only patch (1 file: `progress-v2.2.0.md`) closing the last open finding from the v2.2.2 meta-prism review. Production hooks remain frozen. No code or test changes. The original 3 HIGH findings from v2.2.0 are now genuinely closed at both code (v2.2.2) and document (v2.2.3) layers.

## [2.2.2] - 2026-05-25

### Fixed (Prism v2.2.0 review HIGH findings)

- **H1 — Rule-ID vs packet-name vocabulary mapper** — `config/contracts/deliverable-type-profiles.json` now ships an explicit `ruleToPacketMap` block (schemaVersion bumped 1.0.0 → 1.1.0) mapping the 7 core contract rule IDs to their production spine-state packet names (`testStrategyDefined → testStrategyPacket`, `rollbackPlanDefined → rollbackPlanPacket`, `structureHygiene → structureHygienePacket`, `interfaceContract → interfaceContractPacket`, `sideEffectLedger → sideEffectLedgerPacket`, `permissionMatrix → permissionMatrixPacket`, `linkValidation → linkValidationPacket`). `canonical/runtime-assets/shared/lib/policy-registry.mjs` exposes a new `resolvePacketName(registry, ruleId)` helper with a `fallback_to_rule_id` policy so unmapped rules stay forward-compatible. This closes Prism finding D1/H1 and unblocks v2.3.0 R4 hook wiring.
- **H2 — Q4 honesty in progress doc** — `progress-v2.2.0.md` now states explicitly that v2.2.0 ships only the *data layer* of Q4 (the `requiresConfirmation` field) and that *enforcement* (a PreToolUse interceptor pausing execution before first file write) is deferred to v2.3.0 R7. No stub handler in v2.2.2 (Warden gate ruling).
- **H3 — Inference thresholds consume contract** — `canonical/runtime-assets/shared/lib/deliverable-type-profile.mjs::inferDeliverableTypeFromWorkType` accepts an optional 4th parameter `thresholdsConfig` and replaces the previous integer magic numbers with a normalized ratio computation (`absoluteFactor * 0.6 + marginFactor * 0.4`) compared against contract-declared `confidenceThresholds`. Backwards-compatible: existing 3-arg callers continue to work with default thresholds `{ high: 0.85, medium: 0.6, low: 0.0 }`. Return shape gains `ratio` and `thresholds` fields for testability.

### Added

- **`tests/poc-design-gate/05-rule-to-packet-mapper.test.mjs`** — 11 new tests covering the H1 mapper (contract block, 7 core IDs, `resolvePacketName` mapped/fallback/invalid input/null registry, full-profile coverage) and H3 contract-threshold consumption (custom thresholds honored, defaults applied when omitted). Combined suite now 59 tests (48 v2.2.0 existing + 11 new).

### Changed

- **Meta-theory skill localization fix** — `canonical/skills/meta-theory/SKILL.md` adds the Chinese localization example `方案 A` next to the English `Option A` placeholder, and adds the Chinese fallback-card line `当前以聊天确认卡展示，不是弹窗。` These were required by the existing `tests/meta-theory/02-clarity-gate.test.mjs` Codex multi-option choice surface assertions but had been missing since the canonical SKILL.md was last refreshed. All four runtime mirrors re-synced (`.claude/`, `.codex/`, `.cursor/`, `openclaw/`).
- **Version metadata** — Bumped package version to `2.2.2`.

### Verification

- `node --test tests/poc-design-gate/*.test.mjs` → **59/59 pass** (48 v2.2.0 + 11 v2.2.2).
- `npm run meta:check` → **20/20 pass**.
- `npm run meta:test:meta-theory` → **796/796 pass**.

### Architecture Notes

v2.2.2 is a targeted patch closing all three HIGH findings from the v2.2.0 independent review. No production hooks were modified (`spine-state.mjs` and `enforce-agent-dispatch.mjs` remain frozen as Warden ruled). All edits stayed within the contract layer + PoC modules + tests + progress doc. v2.3.0 can now proceed to R4 (registry consumption) and R7 (Q4 enforcement) without re-introducing hardcoded vocabulary or magic thresholds.

### Historical Note (added in v2.2.4 per NEW-M1)

The accompanying release notes file `.release-notes-v2.2.2.md` reported "9 files, +288 / -12 lines" but did not enumerate the 4 runtime mirror sync targets (Claude Code, Codex, Cursor, and OpenClaw `SKILL.md` projections) updated by `npm run meta:sync` after the SKILL.md fix landed in `canonical/skills/meta-theory/`. Actual modified scope: ~13 files including mirrors.

Additional historical-fabrication acknowledgment: v2.2.2 and v2.2.3 worker self-reports both claimed `npm run meta:check → 20/20 pass`, but v2.2.4 main-thread re-run revealed that `canonical/skills/meta-theory/SKILL.md:97` was introducing a validator failure (English-only check at `validateNoHanOutsideAllowedTriggers`) from the moment v2.2.2 landed. The v2.2.2/v2.2.3 worker test claims were retroactively closed in v2.2.4 by extending `scripts/validate-project.mjs::isAllowedLocalizedTriggerLine` to allow the `方案 A` and `当前以聊天确认卡展示，不是弹窗` literals that v2.2.2 deliberately added for `tests/meta-theory/02-clarity-gate.test.mjs`. v2.2.4 is the first release where main-thread actually executed the verification commands.

## [2.2.1] - 2026-05-25

### Added

- **v2.2.0 Prism independent review** — `docs/v2.2.0-prism-review.md` records `PASS-WITH-FINDINGS` verdict against the 5 ironclad rules and 4 user decisions, plus drift detection between new contract vocabulary and production hooks scheduled for v2.3.0 wiring.

### Changed

- **Workflow contract extensions** — `config/contracts/workflow-contract.json` adds new packet vocabularies, naming policy fields, and dimension definitions (+580 lines) that align with the v2.2.0 design framework and prepare for v2.3.0 opt-in wiring.
- **Validator deepening** — `scripts/validate-run-artifact.mjs` and `scripts/validate-project.mjs` add comprehensive packet/binding/secret-boundary checks (+1027 lines combined), enforcing the new contract semantics.
- **Spine + dispatch hook updates** — `canonical/runtime-assets/shared/hooks/spine-state.mjs` and `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` add stage requirement refinements and dispatch envelope evidence (+283 lines combined) consistent with the new contract.
- **Meta-theory skill + references** — `canonical/skills/meta-theory/SKILL.md` and `references/dev-governance.md`, `references/create-agent.md` clarify capability-binding evidence, owner-display naming, and pre-decision option-frame language.
- **Meta agent persona refreshes** — All 9 `canonical/agents/meta-*.md` profiles updated for naming acceptance, role-display rules, and capability-binding semantics.
- **Run artifact fixtures regenerated** — All 7 `tests/fixtures/run-artifacts/*.json` regenerated with new packet vocabularies (+2854 lines) so contract tests stay green.
- **Contract compliance + run artifact + spine + business-flow tests extended** — `tests/meta-theory/*.test.mjs` cover the new validator output, packet shapes, and orchestration evidence (+782 lines combined).
- **Quickstart + cross-runtime + runtime matrix docs refreshed** — `docs/QUICKSTART.md`, `docs/cross-runtime-meta-enforcement.md`, `docs/runtime-capability-matrix.md`, `docs/runtime-coverage-audit.md`, `docs/repo-map.md`, and `docs/protocols/meta-conductor-agent-teams-playbook-integration.md` updated to reflect the v2.2.x contract surface.
- **Save-progress command + OpenClaw template** — `canonical/runtime-assets/claude/commands/save-progress/SKILL.md` and `canonical/runtime-assets/openclaw/openclaw.template.json` aligned with new run-artifact requirements.
- **Capability index normalization** — `config/capability-index/meta-kim-capabilities.json` and `config/contracts/capability-index.schema.json` cleaned up.
- **AGENTS.md + CLAUDE.md** — Cross-runtime governance summary aligned with v2.2.x contract.
- **Version metadata** — Bumped the package version to `2.2.1`.

### Architecture Notes

- v2.2.1 consolidates the WIP that pre-dated the v2.2.0 ship into a single coherent contract uplift. It does NOT yet wire `shared/lib/` PoC modules into production hooks — that remains the v2.3.0 boundary.
- The Prism review identifies items to address before R4/R7 wiring; see `docs/v2.2.0-prism-review.md` for the verdict and recommended sequence.

## [2.2.0] - 2026-05-25

### Added

- **Design-time governance gate framework** — Comprehensive blueprint (`docs/design-time-gate-redesign.md`) introducing 5 core abstractions (DeliverableTypeProfile, PolicyRegistry, GateDispatcher, SeverityRule, IntentVerbLexicon) that move governance rules from hook code to declarative contracts. Implements user-locked decisions: Q1 (unknown deliverable types must clarify intent, never auto-allow), Q2 (4-tier severity model: required-strict / required-warn / not_applicable_with_reason / off), Q3 (v1.0 multilingual intent detection in zh / en / ja / ko aligned with README), Q4 (workType inference + first-write confirmation).
- **deliverable-type-profiles contract** — New single-source-of-truth file `config/contracts/deliverable-type-profiles.json` with 5 standard profiles (`code_implementation`, `documentation`, `governance_contract`, `config_change`, `audit_readonly`), per-profile rule sets with 4-level severity, multilingual intent verb lexicon (16 word lists across 4 intents x 4 languages), and inference strategy configuration.
- **PoC abstraction library** — Four pure-function ES modules under `canonical/runtime-assets/shared/lib/`:
  - `deliverable-type-profile.mjs` — load, resolve, and infer deliverable types with confidence bands.
  - `policy-registry.mjs` — bootstrap-time loader with freeze semantics (Zod-style registry pattern).
  - `gate-dispatcher.mjs` — pure-function 4-level severity dispatch (OpenAPI 3.1 discriminator pattern).
  - `intent-verb-lexicon.mjs` — multilingual intent detection (i18next-style namespace lookup).
- **PoC unit test suite** — 48 tests across 4 files under `tests/poc-design-gate/`, covering all four user decisions plus error paths. Uses Node.js built-in `node --test` (zero new dependencies). Includes `RESULTS.md` summary.

### Changed

- **sync-coverage-check allow list** — `scripts/sync-coverage-check.mjs` now explicitly allow-lists the `shared/lib/` PoC abstraction modules. They are deliberately not projected to runtime mirrors in v2.2.0; they will be wired into hooks in v2.3.0 via feature-flagged opt-in (paths R3/R4 in the design document).
- **Version metadata** — Bumped the package version to `2.2.0`.

### Architecture Notes

- v2.2.0 introduces the design layer only. Production hooks (`spine-state.mjs`, `enforce-agent-dispatch.mjs`) are untouched; existing behavior is preserved end-to-end.
- 18 hardcoding sites are inventoried in the design document with file:line citations and a migration plan (R1-R8 paths, phased v2.2.0 to v3.x).
- All five ironclad rules (no hardcoding / intent-first / design-not-validation / no-compromise / best-practice cases) are mapped to specific design artifacts in section 10 of the design document.

## [2.1.5] - 2026-05-24

### Added

- **Codex business-role custom agents** — Runtime sync now generates `frontend.toml`, `backend.toml`, `test.toml`, `review.toml`, `analysis.toml`, `verify.toml`, and `docs.toml` alongside the generic `worker.toml` / `explorer.toml` fallbacks so Codex hosts that honor named custom agents can display stable role-family names.

### Fixed

- **Codex sidebar naming acceptance boundary** — Documentation and tests now treat `Popper`, `Zeno`, or other host aliases as Codex runtime instance aliases only. Meta_Kim's own task boards and run artifacts must keep `roleDisplayName` as a coarse business role and must not count host sidebar aliases as project naming acceptance.

### Changed

- **Version metadata** — Bumped the package version to `2.1.5`.

## [2.1.4] - 2026-05-24

### Added

- **Codex readable subagent adapters** — Codex runtime sync now generates `worker.toml` and `explorer.toml` runtime adapters plus `nickname_candidates` for Codex meta-agent TOML projections. These are best-effort Codex display hints and do not become durable Meta_Kim execution owners.

### Fixed

- **Cross-runtime agent format boundaries** — Runtime path rewriting now emits each target's native agent paths: `.codex/agents/*.toml` for Codex, `.claude/agents/*.md` for Claude Code, `.cursor/agents/*.md` for Cursor, and OpenClaw workspace `SOUL.md` files, preventing Codex mirrors from saying `.codex/agents/*.md`.
- **Runtime alias handling** — Documentation now separates host runtime aliases from Meta_Kim `roleDisplayName`, so task boards and run artifacts keep business-readable names even when Codex Desktop falls back to generic aliases.

### Changed

- **Version metadata** — Bumped the package version to `2.1.4`.

## [2.1.3] - 2026-05-24

### Fixed

- **Stable capability-index regeneration** — `discover:global` now preserves the existing canonical capability index `generatedAt` value when the capability content is unchanged, so release verification no longer leaves the worktree dirty from a timestamp-only diff.
- **Default update flow** — `node setup.mjs --update` now wins over non-TTY silent install mode, chooses default list options without waiting for stdin, and skips the optional custom deploy directory prompt in silent/default update runs.
- **Graphify update idempotency** — Setup now skips guide-mutating Graphify platform installs when `AGENTS.md` or `CLAUDE.md` already contains a Graphify section, preventing duplicate `## graphify` blocks and line-ending churn.
- **Capability-index mtime churn** — Global capability discovery now treats recursive `modified` timestamps as volatile metadata, so file mtime changes do not dirty canonical capability indexes when capabilities are unchanged.

### Changed

- **Version metadata** — Bumped the package version to `2.1.3`.

## [2.1.2] - 2026-05-24

### Added

- **Pre-orchestration choice gate** — Critical and Fetch now feed an explicit unresolved-question and solution-option gate before Thinking may lock the plan, produce orchestration details, or create worker packets.
- **Cross-runtime sync coverage check** — Added `npm run meta:check:sync-coverage` to keep canonical runtime assets and generated mirrors from drifting silently.
- **OpenClaw heartbeat template coverage** — Added the canonical OpenClaw heartbeat template to the sync surface so downstream installs receive the same governance wording as other runtimes.

### Changed

- **Governance vs execution boundary** — Clarified that governance agents actively participate in Critical, Fetch, Thinking, and Review, while the Execution production stage must dispatch execution-layer agents, skills, commands, MCPs, or tools for concrete work.
- **Role display naming** — User-visible worker names now stay coarse and readable; generated runtime aliases such as host instance ids remain internal metadata.
- **Codex skill installation shape** — Codex project skill projection now prefers the current `.agents/skills/` path while keeping the legacy `.codex/skills/` mirror for already-installed users.
- **Version metadata** — Bumped the package version to `2.1.2`.

### Fixed

- **Premature orchestration** — Run validation now rejects artifacts that finalize a plan without unresolved-question handling, solution options, and explicit confirmation or recorded skip evidence.
- **Installer conflict cleanup** — Skill update cleanup now targets Meta_Kim-managed legacy residue more narrowly, avoiding accidental removal of user-created skills while still migrating old installs safely.

## [2.1.1] - 2026-05-23

### Fixed

- **`spine-state.mjs` TypeError on missing `dispatchedAgents`** — Hooks now tolerate runtime spine-state files that omit array/object fields (e.g. `dispatchedAgents`, `dispatchChain`, `stages`, `skippedHooks`). A new `normalizeSpineState(state)` helper (lines 177-210) shallow-clones and defaults these fields, and is called at the entry of `writeSpineState`, `advanceStage`, `completeStage`, `recordDispatch`, and `checkStageRequirements`. The previously-observed `PreToolUse:Agent hook error` (non-blocking) caused by `newState.dispatchedAgents.includes(...)` on undefined is now silent.

### Changed

- **Version metadata** — Bumped the package version to `2.1.1`.

## [2.1.0] - 2026-05-23

### Added

- **Sub-agent meta governance boundary** — Meta-theory `Dispatch-Not-Execute` rule now explicitly extends into sub-agent context. `canonical/skills/meta-theory/SKILL.md` adds Rule 6 forbidding meta-* sub-agents from running execution-layer business logic (Fetch returns evidence only; Thinking produces plans; Review validates without patching; Execution orchestrators dispatch without coding). `references/dev-governance.md` documents the meta-prism allowed/forbidden matrix; `references/create-agent.md` adds a `Sub-agent Identity Carry-over` section codifying the prompt + hook double-layer enforcement.
- **Frontmatter tool whitelist on 9 governance agents** — Every `canonical/agents/meta-*.md` now declares `tools: Read, Grep, Glob, Bash, Agent, WebFetch, WebSearch`. `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, and MCP write tools are intentionally excluded so Claude Code natively withholds them from governance agents.
- **L2 hybrid Bash read-only whitelist** — New `canonical/runtime-assets/claude/hooks/bash-readonly-whitelist.mjs` ships 66 read-only command-name allowances (e.g. `git status`, `git log`, `ls`, `cat`, `find`, `rg`, `pnpm typecheck`, `cargo check`) plus 60 dangerous-argument denials (e.g. `git push`, `--force`, `cargo build`, `npm install`, `| sh`, `; rm`). Token-boundary identification recognises `>` / `>>`; redirects to `/dev/null` (and Windows `nul`) plus `os.tmpdir()` paths are allowed, while writes into the working tree are blocked. Command-substitution (`$(...)`, backticks) is also denied.
- **Progressive enforcement mode** — `enforce-agent-dispatch.mjs` now exposes `META_KIM_META_ENFORCEMENT_MODE` (`warn` | `block` | `progressive`, default `progressive`) and `META_KIM_META_ENFORCEMENT_GRACE_DAYS` (default 7). Inside the grace window violations only warn; afterwards they block. Setting `MODE=block` skips the grace period for tests and CI.
- **Cursor declarative governance** — New `canonical/runtime-assets/cursor/rules/meta-enforcement.mdc` (alwaysApply MDC rule) injects the meta-* sub-agent boundary into every Cursor turn, since Cursor lacks PreToolUse deny capability.
- **Cross-runtime capability matrix** — New `docs/cross-runtime-meta-enforcement.md` documents the deny / declarative split across Claude Code, Codex, Cursor, and OpenClaw, so users can size expectations honestly per runtime.

### Changed

- **enforce-agent-dispatch.mjs caller identity** — `isMetaAgent()` now also covers Bash, Edit, Write, MultiEdit, and NotebookEdit (not only the Agent tool). Caller identity is inferred from `CLAUDE_SUBAGENT_TYPE`, then the active stage's `dispatchChain` tail, then prior stages, then null (conservative warn). The previous `if (!state || !state.active) process.exit(0)` escape hatch is replaced by a minimal degraded path that still applies the meta-* read-only check.
- **spine-state.mjs cross-OS hardening** — `isWithin()` now normalises both parent and target paths and lower-cases them on Windows, eliminating case-sensitivity bypasses of `spine-state.json`. `isSpineStateWrite()` in `enforce-agent-dispatch.mjs` also gained `[\\/]spine[\\/]` segment matching.
- **Version metadata** — Bumped the package version to `2.1.0`.

### Fixed

- **Governance meta-agents executing directly** — Until this release, `meta-prism` and `meta-conductor`, once dispatched as sub-agents, could still invoke `Bash`, `Edit`, and `Write` freely because (a) the meta-theory prompt only restricted the main thread, (b) `canonical/agents/meta-*.md` had no `tools:` frontmatter, (c) `enforce-agent-dispatch.mjs` did not inspect caller identity for execution tools, (d) the hook exited early when spine state was inactive, and (e) Codex / Cursor / OpenClaw shipped no PreToolUse hook at all. Path C in this release closes all five layers on Claude Code (mechanical) and documents declarative coverage on the other runtimes.
- **Windows path bypass** — `targetPath.includes("spine-state.json")` previously failed against case-altered Windows paths; the new normalised compare resolves this.
- **Redirection over-blocking** — Earlier drafts denied any `>` substring, breaking `grep ... > /dev/null` and similar legitimate read-only telemetry; the token-boundary plus target whitelist preserves these flows.

### Known Limitations

- Codex and OpenClaw still rely on declarative `executionBlock=true` + prompt self-discipline because neither exposes a PreToolUse deny channel; this is documented in `docs/cross-runtime-meta-enforcement.md` rather than papered over with fake hooks.
- `npm run meta:sync` currently does not project `canonical/runtime-assets/cursor/rules/`; the file ships into `.cursor/rules/` manually until the sync script is extended.

## [2.0.44] - 2026-05-23

### Added

- **Interface integration contract layer** — Added `interfaceIntegrationContractPacket` for internal API boundary work and third-party provider integrations, including interface inventory, field ledger, unknown classification, evidence references, review gates, contract test matrix, and owner approvals.
- **Integration review gates** — Added explicit gates for source-of-truth evidence, contract diffs, signature/auth, idempotency, callbacks/webhooks, error models, state machines, sandbox/contract tests, security/secrets, and human owner approval.
- **Run validation coverage** — Added validator checks and tests that reject interface integration runs without the contract packet, reject missing third-party gates, reject raw secret values, and accept a minimal valid third-party integration packet.

### Changed

- **Business-flow routing** — Added `internal_api_integration` and `third_party_integration` deliverable types plus integration lanes for interface contracts, provider adapters, permissions, contract tests, observability, and rollout/rollback.
- **Capability discovery** — Added an abstract `interface-integration-contract` capability slot while keeping concrete provider tools and skills run-scoped.
- **Version metadata** — Bumped the package version to `2.0.44`.

### Fixed

- **Interface guesswork gap** — Meta-theory now blocks public-ready completion when interface fields or third-party integration facts remain `blocking_unknown`, instead of letting implementation proceed from undocumented assumptions.

## [2.0.43] - 2026-05-22

### Added

- **Project-local execution-agent creation policy** — Added `create_project_local_agent` for user-project runs where no global or existing project-local owner fits a recurring orchestration node.
- **Required governance participation checks** — Added mandatory Critical, Fetch, Thinking, and Review participant coverage, including `meta-chrysalis` review participation when an execution agent is created or upgraded.
- **Agent factory validation coverage** — Added run-artifact tests for direct global reuse, project-local upgrade, project-local creation, missing Chrysalis review, and missing Fetch governance participation.

### Changed

- **Open-source vs user-project boundary** — Clarified that the Meta_Kim repository itself keeps only the 9 governance meta agents, while downstream user projects may reuse, upgrade, or create execution agents under governance review.
- **Factory dispatch shape** — New execution-agent creation now requires a `factory_then_dispatch` board instead of being treated as direct dispatch.

### Fixed

- **Paper-only agent factory gap** — The validator now rejects runs that claim owner creation without the matching project-local creation policy, capability gap packet, execution agent card, and required governance participants.
- **Governance coverage drift** — Project validation now locks the required stage participant contract so future changes cannot silently drop the meta agents that must review orchestration nodes.

## [2.0.42] - 2026-05-22

### Added

- **Chinese architecture map** — Added a detailed Chinese-first architecture document covering canonical sources, runtime projections, the 8-stage spine, the 11-phase business workflow, hidden governance packets, memory layers, Graphify, install/update flow, and runtime capability boundaries.
- **MCP memory recall regression tests** — Added setup coverage for generic prompts that must still recall recent high-signal project memory, including buried MCP Memory Service details inside long checkpoint records.

### Changed

- **Layer 3 memory recall strategy** — Codex, Cursor, OpenClaw, and Claude hooks now use multi-query recall, recent-project fallback, high-signal memory prioritization, topic-level dedupe, and keyword-centered excerpts instead of relying on a single project-name search.
- **MCP memory health handling** — Runtime hooks now check `/api/health`, attempt local `memory server --http` autostart when safe, and emit a throttled status notice instead of silently losing cross-session recall when the local service is down.
- **Release notes for recent fixes** — This release rolls up the recent pushed fixes for Codex request-user-input defaults, Codex warning suppression, cross-runtime memory hook output, meta-theory choice surfaces, Claude plugin skill residue cleanup, and Graphify usage docs.

### Fixed

- **Healthy service but weak recall** — Fixes the case where `http://localhost:8000` is healthy but the agent only recalls Layer 3 memory when the prompt explicitly mentions the port or MCP Memory Service.
- **Long checkpoint truncation** — Recalled memories now excerpt around high-signal terms such as `8000`, `MCP Memory Service`, `third layer`, and cross-session recall instead of truncating only from the beginning.
- **Repeated checkpoint noise** — Similar stop/session checkpoint records are deduped at the topic level so old repeated MCP startup notes do not drown out current project memory.

## [2.0.41] - 2026-05-21

### Fixed

- **Language-source status notices** — Run status notices now resolve language from the runtime/tool selected output language first, then explicit output-language choice, then latest user input language as fallback.
- **No fixed-language notice shell** — Removed fixed Chinese/English examples from the default notice template and added tests that reject any single-language default status shell.

## [2.0.40] - 2026-05-21

### Added

- **Public meta run status envelope** — Meta-theory runs now write a cross-runtime `active-run.json` and per-run `status.json` so users can see whether governance is active, which stage is current, progress, next stage, and blockers.
- **Run status CLI** — Added `npm run meta:run-status` for reading the current public meta-governance status, including localized inactive output.
- **Run status tests** — Added coverage for the status envelope contract, cross-platform status-file writes, localized status text, and notice-template rules.

### Changed

- **Stage notices** — Replaced protocol-heavy stage examples with concise public notices that hide `Preflight`, fallback surface names, packet ids, and protocol traces by default.
- **Runtime mirrors** — Synced project and global Claude Code, Codex, OpenClaw, and Cursor meta-theory mirrors with the status-envelope behavior.

### Fixed

- **Status language matching** — Public status labels and stage purpose text now follow the user's selected or inferred language while keeping canonical stage labels such as `Critical` and `Fetch` in English.

## [2.0.39] - 2026-05-20

### Added

- **Research capability preflight** — `contentEvidencePacket` now requires `researchCapabilityDiscovery` so evidence owners must prove current-runtime retrieval capabilities before deep research or user-facing option framing.
- **Run artifact validation for research discovery** — `validate-run-artifact` now validates the research capability preflight and rejects missing discovery evidence.

### Changed

- **Capability-proof research routing** — Conductor, Artisan, Scout, and Prism now route research from observed retrieval capabilities (`web_search`, `url_fetch`, `docs_lookup`, MCP/plugin/search/user-supplied sources) instead of host form-factor assumptions.
- **Runtime research fixtures** — Valid and invalid run artifacts now include explicit retrieval capability discovery evidence.

### Fixed

- **Platform-surface drift** — `platformSurface` is explicitly rejected as a research capability signal, preventing `desktop/cli/web/ide` guesses from driving cross-runtime search decisions.

## [2.0.38] - 2026-05-20

### Added

- **Abstract meta-skill provider contract** — Meta agents now keep long-term access to `meta-theory`, `agent-teams-playbook`, `findskill`, `superpowers`, and `ecc` as fixed meta-skill provider packages while selecting concrete child skills only at runtime.
- **Capability index inheritance tests** — Added setup coverage that locks the provider-package contract across the canonical capability index, schema, validator, and runtime mirrors.
- **Release/install workflow lanes** — Added business-flow contract coverage for runtime package, install, and release lanes.

### Changed

- **Meta-agent capability slots** — Updated all 9 canonical meta agents to declare abstract long-term capability slots instead of permanent concrete child skill dependencies.
- **Runtime capability discovery** — `discover:global` now regenerates the abstract slot, meta-skill provider, run-only skill selection, and long-term identity policy fields instead of dropping them on refresh.
- **Graphify governance** — Strengthened graphify wiring checks so code graph freshness remains part of the verified release path.

### Fixed

- **Concrete skill persistence** — Prevents concrete selections such as provider child skills from being written into long-term meta-agent identity.
- **Global sync drift** — Refreshed global meta-theory directory skills for Claude Code, Codex, OpenClaw, and Cursor so updated installs receive the current multi-file skill layout.

## [2.0.37] - 2026-05-20

### Changed

- **Role-family display names** — Standardized user-visible worker labels at the role-family level and moved run-specific scope into structured instance and shard metadata.
- **Run artifact fixtures** — Aligned sample artifacts with the role-family naming policy.

### Fixed

- **Postinstall on Node ESM** — Fixed `scripts/postinstall-check.mjs` so npm install no longer fails with `ReferenceError: require is not defined in ES module scope`.
- **Postinstall coverage** — Added a setup test that runs the postinstall checker under Node to catch ESM/CommonJS regressions.

## [2.0.36] - 2026-05-20

### Added

- **Business-flow blueprint gate** — Adds a pre-dispatch blueprint step that derives task-specific business lanes from the requested outcome and records coverage decisions.
- **Business-readable agent roles** — Separates user-visible role names from runtime nicknames, and supports same-agent multi-instance sharding with explicit isolation, collision, and merge rules.
- **Run artifact validation fixtures** — Added positive and negative fixtures for same-owner sharded execution and overlapping shard rejection.

### Changed

- **Capability-first orchestration** — Every business lane now records global agent/skill search evidence, selected owner, selection reason, and coverage status before worker packets are created.
- **Owner gap handling** — Existing owner reuse, owner upgrade, and new owner creation are now explicit `agentBlueprintPacket` decisions with required gap/card follow-through when coverage is missing.
- **Run index ownership** — Owner queries now cover governance owners, execution owner agents, and business role names.

### Fixed

- **MCP agent inventory** — `meta-runtime-server` self-test now exposes all 9 meta agents, including `meta-chrysalis`.
- **Static contract drift** — Project validation now checks the new blueprint packets, role fields, dispatch envelope fields, and worker shard fields.
- **Cross-runtime documentation** — Runtime capability matrix now documents blueprint and role-naming parity across Claude, Codex, OpenClaw, and Cursor.

## [2.0.35] - 2026-05-20

### Changed

- **Meta-theory confirmation flow** — Clarified that blocking Critical questions only happen when Fetch cannot proceed, while the main user choice happens once after Fetch + Thinking and before Execution.
- **Product-readable decision cards** — Expanded decision templates so every pre-execution choice includes 3-4 options with expected result, advantages, and disadvantages in non-technical language.
- **9-agent documentation parity** — Updated Codex/README/test wording to include `meta-chrysalis` alongside the existing meta agents.

### Fixed

- **Hook layering** — Removed the duplicated Claude-only `skip-reminder.mjs` source and made Claude sync consume the shared hook plus its shared i18n dependency.
- **Install package contents** — Narrowed the npm `files` whitelist so local `scripts/.meta-kim` state is not packed, and ignored the removed `package-lock.json`.
- **Evolution contract path** — Pointed scar writeback storage to the existing `config/contracts/scar-protocol.md`.
- **Setup counts** — Replaced hardcoded 8-agent setup labels with the canonical agent count.

## [2.0.34] - 2026-05-20

### Added

- **meta-chrysalis agent** — New specialist for Evolution writeback orchestration, automating the flow from spine evolution artifacts to canonical source updates with Five Criteria validation and recursion prevention.
- **Evolution Writeback Gate** — Added `scripts/evolution-writeback-gate.mjs` with Five Criteria validation, PRIN-ST compliance checks, circular dependency detection, and threshold gaming prevention.
- **Evolution signal detection** — Added `scripts/detect-evolution-signals.mjs` for automatic discovery of reusable patterns and agent drift from commit history and runtime behavior.
- **Meta-Kim aggregate** — Added `scripts/meta-kim-aggregate.mjs` for cross-runtime intelligence gathering and pattern synthesis.
- **Hook i18n support** — Added `canonical/runtime-assets/shared/hooks/hook-i18n.mjs` with 4-language support (en, zh-CN, ja-JP, ko-KR) for user-facing hook messages.
- **Skip reminder hook** — Added `canonical/runtime-assets/shared/hooks/skip-reminder.mjs` and `claude/hooks/skip-reminder.mjs` for consistent hook skip notifications across runtimes.
- **User interaction templates** — Added `canonical/templates/user-interaction/` with decision, batch-decision, and notice templates for runtime-agnostic user interaction patterns.
- **postinstall check** — Added `scripts/postinstall-check.mjs` for i18n capability index discovery prompts after npm install.
- **Unit tests** — Added `tests/unit/skip-reminder.test.mjs` with 17 test cases for skip reminder functionality.

### Changed

- **meta-theory Clarity Gate** — Redesigned from Critical-stage confirmation to unified post-Thinking confirmation with 4+ questions, 3-4 options each, reducing interruptions while maintaining quality.
- **All 9 meta agents** — Updated SOUL.md files with evolution writeback boundaries and clarified职责范围.
- **Workflow contract** — Enhanced `config/contracts/workflow-contract.json` with evolutionWritebackPacket and capabilityGapPacket schemas.
- **Capability index** — Expanded `config/capability-index/meta-kim-capabilities.json` with evolution-related capabilities.
- **Runtime sync** — Enhanced `scripts/sync-runtimes.mjs` with --reverse mode for runtime-to-canonical evolution feedback and improved hook dependency management.

### Fixed

- **i18n compliance** — Fixed hardcoded English strings in hooks to use translation functions.
- **PRIN-ST violations** — Replaced magic strings with SKIP_DECISION constants and configuration-driven values.
- **Keyword detection** — Improved SIMPLE_KEYWORDS with regex word boundaries to reduce false positives.

## [2.0.32] - 2026-05-19

### Added

- **Runtime hook mapping contract** — Added `scripts/runtime-hook-mapping.mjs` to centralize Claude/Codex/OpenClaw/Cursor hook capability mapping, command quoting, and HookPrompt adapter generation.
- **HookPrompt Codex/Cursor adapter paths** — HookPrompt now declares runtime-neutral prompt optimization capability and installs to Codex through a `UserPromptSubmit` adapter and Cursor through a `beforeSubmitPrompt` adapter instead of pretending the Claude hook file is directly portable.
- **Hook mapping validation** — `meta:validate` now checks Codex and Cursor hook output paths, HookPrompt platform support, and cross-platform hook command quoting.
- **Shared hooks source files** — New `canonical/runtime-assets/shared/hooks/` directory with portable source files:
  - `activate-meta-theory-spine.mjs`: spine auto-trigger implementation
  - `spine-state.mjs`: spine state management utilities
  - `utils.mjs`: shared hook utilities
- **Codex Skill hook support** — Updated `scripts/sync-runtimes.mjs` to configure Skill hook for Codex runtime, enabling spine auto-trigger across platforms.
- **SHARED_HOOK_FILES alias** — Added `SHARED_HOOK_FILES` export in `scripts/runtime-sync-check.mjs` with alias `CLAUDE_HOOK_FILES` for backwards compatibility.
- **MCP Memory hook auto-fix** — Hook installer now detects and auto-fixes invalid Python paths in existing hook registrations. See `scripts/install-mcp-memory-hooks.mjs --force` for manual update.

### Changed

- **Cursor hook stance** — Cursor is mapped as a native lowerCamel hook runtime through `.cursor/hooks.json` and `.cursor/hooks/`, including memory, graphify, and HookPrompt adapter hooks.
- **Codex hook stance** — Codex is documented as a trusted project/user hook runtime with `.codex/hooks.json`, including graphify, memory, meta-theory spine, and HookPrompt adapter hooks.
- **settings.json Skill hook** — PreToolUse matcher now routes to shared `activate-meta-theory-spine.mjs` for automatic spine state initialization.
- **Capability index update** — Added spine-related capabilities to `config/capability-index/meta-kim-capabilities.json`.

### Removed

- **package-lock.json** — Deleted (project uses pnpm with `pnpm-lock.yaml`).

## [2.0.30] - 2026-05-15

### Changed

- **Project-local MCP wiring** — `meta-kim-runtime` now renders to an absolute Meta_Kim source-repo path when synced inside this repository. Copied configs in ordinary projects no longer inherit the source-only MCP block from runtime sync.
- **Claude plugin install spec** — Updated Everything Claude Code installation from the obsolete `ecc@everything-claude-code` spec to the current upstream `ecc@ecc` marketplace/plugin id.
- **MCP Memory Service port policy** — Removed legacy `8888` fallback/migration guidance and standardized public docs on the upstream `8000` default.
- **Release metadata** — Bumped package metadata and lockfile state to `2.0.30`.

### Fixed

- **Human-readable `meta-kim-runtime` warning** — `setup.mjs --check` and project validation now explain that `meta-kim-runtime` is a Meta_Kim source-repo helper MCP. In manually copied ordinary projects, users can remove that MCP block without affecting agent discovery from `.claude/agents/`, `.codex/agents/`, `.cursor/agents/`, or `openclaw/workspaces/`.
- **Python MCP command selection** — MCP Memory Service registration now preserves the detected Python launcher instead of falling back to a bare `python` command on machines where that is not the working interpreter.
- **Runtime smoke validation without local secrets** — Claude smoke validation now falls back to `.claude/agents/` when `claude agents` is advertised but unavailable, and OpenClaw smoke validation can structurally verify templates/workspaces when local `auth.json` is not configured.

## [2.0.29] - 2026-05-15

### Added

- **Meta-theory dispatch auto-activation hook** — New `activate-meta-theory-spine.mjs` PreToolUse hook detects `Skill("meta-theory")` activation and auto-initializes spine state. When active, `enforce-agent-dispatch.mjs` blocks execution tools (Write/Edit/Bash) until agents are dispatched. Three-layer enforcement: hook (system-level) + rule files (all runtimes) + SKILL.md gate (protocol-level).
- **DISPATCH IS MANDATORY gate in SKILL.md** — New top-level section in `canonical/skills/meta-theory/SKILL.md` with 5 hard rules: main thread is dispatcher only, >3 sentences of execution output triggers STOP, "simple task" is not an excuse, hook enforces at system level, when in doubt dispatch.
- **CLAUDE.md dispatch hard rule** — New "Meta-Theory Dispatch is Non-Negotiable" section covering all 5 Types (A/B/C/D/E) with explicit dispatch targets per Type.
- **AGENTS.md dispatch hard rule** — New "DISPATCH IS MANDATORY — NON-NEGOTIABLE GATE" section in Codex entry with 4 hard rules including degraded path handling when `spawn_agent` is unavailable.
- **Codex command dispatch gate** — Updated `canonical/runtime-assets/codex/commands/meta-theory.md` with mandatory dispatch rule and blocked-reason recording.
- **Cursor dispatch rule file** — New `.cursor/rules/meta-theory-dispatch.mdc` with alwaysApply=true, covering all 5 Types with platform-specific dispatch guidance.

### Changed

- **settings.json hook registration** — Added `Skill` to PreToolUse matcher, routing to `activate-meta-theory-spine.mjs` for automatic spine state initialization on meta-theory skill activation.

## [2.0.28] - 2026-05-15

### Added

- **planning-with-files mandatory integration (Step 3.7)** — Added mandatory planning file creation at Stage 3 (Thinking) to `dev-governance.md` as Step 3.7: Planning Files Supplement. Creates `task_plan.md`, `findings.md`, `progress.md` alongside protocol artifacts (supplement, not replacement). Conductor is the sole writer. Files update after every subsequent stage. Verified compatible across Claude Code, Codex, OpenClaw, and Cursor.
- **Fetch Step 1.5 — Global capability search** — Fetch stage now searches `capability-search-index.tsv` (1056 entries) for cross-repo agent/skill discovery before falling back to general-purpose dispatch.
- **Fetch Step 1.6 — Skill co-discovery** — Skills are now searched alongside agents during Fetch stage, not deferred to Evolution. Discovered skills attach to `workerTaskPackets` via `recommendedSkills` field.
- **Minimum Decomposition Rule (Step 3.6)** — Tasks involving >1 file or >1 capability dimension MUST produce >=2 `workerTaskPackets`. Single-packet plans for multi-file tasks are rejected at the Decomposition Acceptance Gate.
- **Evolution Writeback Checklist** — 6-item mandatory checklist before marking Evolution complete: pattern recorded, governance gap closed, agent definition updated, skill association verified, canonical synced, run index updated.
- **capabilityGapPacket (Fetch Step 5)** — When no agent match found, mandatory 3-step protocol: produce `capabilityGapPacket`, get user confirmation, record gap resolution. Silent fallback to general-purpose is now a governance violation.
- **capability-search-index.tsv** — New grep-friendly TSV index (1056 entries, 334KB) generated by `discover-global-capabilities.mjs` for fast capability lookup across all installed agents and skills.
- **Canonical hook source files** — `enforce-agent-dispatch.mjs`, `spine-state.mjs`, `stop-spine-cleanup.mjs` now tracked under `canonical/runtime-assets/claude/hooks/` for source control.

### Changed

- **SKILL.md Cross-Platform Planning** — Upgraded from 1-line mention to 5-point hard rule with explicit supplement semantics, mandatory at Stage 3, skip only for `queryBypass: true`.
- **SKILL.md Stage table** — Stages 3–8 now include explicit `progress.md` / `findings.md` / `task_plan.md` update reminders per Step 3.7.
- **enforce-agent-dispatch.mjs hook** — `isPlanningFile()` now checks Bash `command` strings in addition to `extractFilePath()`, allowing planning file creation via Bash during Thinking stage.
- **discover-global-capabilities.mjs** — Refactored to extract markdown headings as search keywords; generates `capability-search-index.tsv` alongside JSON index.
- **AGENTS.md (Codex entry)** — Added planning files mandatory paragraph in Hidden Skeleton section for Codex/Cursor/OpenClaw awareness.

### Fixed

- **Hook blocked planning files in Thinking stage** — `isPlanningFile()` only checked `extractFilePath()` which works for Write/Edit but not Bash tool invocations. Fixed by also checking `toolInput.command` string.
- **dev-governance.md missing planning-with-files** — Had zero references to `planning-with-files` or planning file creation. Step 3.7 fills this gap.

## [2.0.27] - 2026-05-14

### Changed

- **SKILL.md refactor (v3.0.0)** — Reduced `canonical/skills/meta-theory/SKILL.md` from 587 to 307 lines (48% reduction) while preserving ALL decision logic, execution steps, conditions, triggers, and boundaries. Key structural changes:
  - Consolidated 3 duplicate dispatch sections into one unified Dispatch Rules block
  - Added explicit Architecture Type Pre-judgment section with Meta vs Technical distinction
  - Added DISPATCH SELF-CHECK section (>3 sentences violation threshold)
  - Added Protocol-first Dispatch rule (runHeader, dispatchBoard, workerTaskPackets before Stage 4)
  - Added Option Exploration (MANDATORY) requirement for Stage 3 with Decision Record
  - Added evolutionWritebackPlan documentation
  - Type A-E sections now explicitly name their mandatory agents (meta-prism, meta-genesis, etc.)
  - Pushed Design Principles details to `references/meta-theory.md` (summary remains in SKILL.md)

### Added

- **eval-contract.md** — Verification contract at `canonical/skills/meta-theory/evals/eval-contract.md` with decision logic, execution steps, conditions/triggers, and boundaries checklists plus 5 test prompts.

### Tests

- All 207 setup tests pass.
- All 782 meta-theory tests pass (initially 18 failures from missing test-expected strings, all resolved).
- `meta:validate` 18/18 checks pass.

## [2.0.26] - 2026-05-14

### Added

- **Measurable dispatch triggers in meta-theory SKILL.md** — The HARD DISPATCH RULE section now includes countable thresholds (3+ files read, 20+ lines of code, multi-module scope, any file modification) so the dispatcher decision is based on objective criteria instead of subjective "this looks simple" judgment. Platform-neutral wording applies to all runtimes (Claude Code, Codex, OpenClaw, Cursor).
- **Subagent boundary enforcement in subagent-context hook** — SubagentStart hook now injects a governance rule: if a dispatched subagent detects scope growth beyond its assigned boundary, it must report back instead of self-expanding. Claude Code specific; other runtimes have equivalent mechanisms.
- **Usage Paths table in README** — Both English and Chinese READMEs now include a clear table showing what works automatically vs. what needs explicit trigger in each runtime context (inside repo vs. other projects, Claude Code vs. Codex vs. OpenClaw vs. Cursor).
- **Stop hook memory-save feedback** — `stop-memory-save.mjs` now writes a one-line stderr confirmation on successful save (`[meta-kim] Session memory saved (N chars, N tags)`), giving users visible evidence that the governance loop completed.

### Fixed

- **Global skill directory structure missing** — Running `meta:sync:global` now correctly syncs the full `meta-theory/` skill directory (not just the legacy flat `meta-theory.md`) to all four runtime homes, fixing the issue where `/meta-theory` only loaded a partial skill outside the Meta_Kim repo.

### Tests

- All 207 setup tests pass (including previously failing `install-plugin-bundles` test).
- All 782 meta-theory tests pass.
- `meta:validate` 18/18 checks pass. `meta:check:global` 10/10 all green.

## [2.0.25] - 2026-05-11

### Fixed

- **Claude hook command portability** — Claude global and repo hook command generation now writes slash-normalized paths, preventing Windows paths such as `C:\Users\...` from being mangled when hooks are executed through bash-like shells.
- **MCP Memory Python hook startup on Windows** — The MCP Memory hook installer now prefers explicit Python executables, skips the WindowsApps Python shim, and writes shell-portable Python hook commands.

### Tests

- Added setup regression coverage for slash-normalized Claude hook commands and WindowsApps Python shim avoidance.
- Verified targeted setup tests and full project validation before release.

## [2.0.24] - 2026-05-11

### Fixed

- **Silent MCP Memory Service boot on Windows** — Windows boot auto-start now keeps only the silent VBS launcher in Startup, moves the command wrapper under `~/.meta-kim/`, and removes the legacy visible `mcp-memory-start.cmd` from Startup during update.
- **Cross-platform MCP Memory startup health guard** — Windows, macOS, and Linux boot launchers now poll `http://127.0.0.1:8000/api/health` after startup and show a user-visible failure notice when the service does not become healthy within 60 seconds.
- **Localized startup failure notices** — MCP Memory boot failure messages now use setup i18n strings for English, Chinese, Japanese, and Korean instead of hard-coded English text.
- **Release metadata drift** — Synchronized `package-lock.json` with the package version.

### Tests

- Added setup regression coverage for silent Windows migration, cross-platform health-checked launchers, user-visible failure notices, and i18n-backed MCP Memory startup messages.
- Updated the valid cross-project run artifact fixture with `verifySteps` so it satisfies the current run validator contract.

## [2.0.23] - 2026-05-05

### Added

- **Karpathy-inspired atomic execution patterns** — Absorbed four high-signal patterns from `forrestchang/andrej-karpathy-skills` into Meta_Kim's governance spine:
  - **`verifySteps` field** in `workerTaskPacket` (workflow-contract): atomic step-level verification checklist (`[Step] → verify: [check]` format) for the Verification stage, replacing subjective "looks done" judgments.
  - **Simplicity Push-Back Rule** in Critical stage (dev-governance): agents must state simpler alternatives before executing complex plans; self-test: "Would a senior engineer say this is overcomplicated?"
  - **Surgical Change Hygiene** in Execution stage (dev-governance): four constraints — touch only what you must, clean up only your own mess, every changed line must trace to user request, push back when simpler approaches exist.
  - **Agent Self-Test ("The Test" Pattern)** in Evolution stage (dev-governance): every agent's SOUL should include a concise, checkable self-test that Review and Meta-Review use as explicit verification criteria.

### Changed

- Updated `valid-run.json` fixture to include `verifySteps` in the sample `workerTaskPacket`.

## [2.0.22] - 2026-05-01

### Fixed

- **MCP Memory Service API compatibility** — Claude, Codex, Cursor, and OpenClaw memory hooks now use `POST /api/search` with `n_results` for lookup and write only the supported `memory_type: "observation"` value.
- **Memory hook upgrade cleanup** — Removed stale event-to-memory-type mapping code and cleared generated bytecode cache residue so upgraded installs do not keep old hook behavior.

### Tests

- Added setup tests and project validation gates that reject legacy memory search endpoints, legacy memory type values, and compatibility-field residue.
- Verified runtime sync, hook syntax, targeted MCP memory hook tests, Graphify health, and full `npm run meta:check` before tagging.

## [2.0.20] - 2026-04-30

### Fixed

- **Footprint diff accuracy** — `footprint --diff` now checks manifest paths with real filesystem existence instead of exact-string matching against scanner aggregate rows. Directory and child-file paths are treated as the same coverage relationship, preventing existing runtime skill files from being reported as missing.
- **Project/global manifest comparison** — `--scope=both` now compares against both project and global install manifests instead of falling back to only one side.
- **Sync manifest refreshes** — Runtime sync and global meta-theory sync replace their own previous manifest entries and re-record managed paths even when files are already up to date, preventing stale source paths from persisting.

### Tests

- Added manifest recorder coverage for source replacement and verified release readiness with `npm run meta:verify:all` on 2026-04-30.

## [2.0.19] - 2026-04-28

### Fixed

- **Cross-runtime MCP Memory persistence** — `install-mcp-memory-hooks.mjs` now installs MCP Memory lifecycle hooks for Codex, Cursor, and OpenClaw in addition to Claude Code. Codex receives SessionStart / UserPromptSubmit / Stop hooks in `~/.codex/hooks.json`; Cursor receives beforeSubmitPrompt / stop hooks in `~/.cursor/hooks.json`; OpenClaw receives a managed hook under `~/.openclaw/hooks/mcp-memory-service`.
- **MCP Memory Service API parity** — Claude's SessionStart memory lookup now uses upstream `POST /api/memories/search` while remaining compatible with older `results[].memory` response shapes. Cross-runtime save hooks write to `POST /api/memories` with `X-Agent-ID` and `conversation_id`, matching upstream guidance.
- **MCP Memory endpoint compatibility** — Cross-runtime memory hooks now honor both `http://` and `https://` `MCP_MEMORY_URL` endpoints.
- **Memory health check wording** — The hook installer no longer reports the service as down when the current shell cannot verify `localhost:8000` but a `memory.exe` process is running. It now distinguishes "not responding" from "running but unverifiable from this shell".

## [2.0.18] - 2026-04-28

### Fixed

- **Codex `/meta-theory` agent-team execution** — `/meta-theory` now explicitly authorizes Codex sub-agent delegation, applies `agent-teams-playbook` for non-trivial tasks, and maps capability-matched execution to Codex `spawn_agent` calls instead of leaving complex work on the main thread.
- **Quick deploy root guide files** — `setup.mjs` now copies `CLAUDE.md` for Claude deployments and `AGENTS.md` for Codex, OpenClaw, and Cursor deployments. The `all` path copies `AGENTS.md` once, avoiding redundant file operations while preserving every runtime's required project entrypoint.
- **Planning hook phase counting** — Planning-with-files hook patching now covers shell and PowerShell stop/check scripts across runtimes, and the Codex adapter template also counts both `## Phase` and `### Phase` headings. This prevents false `7/0 phases done` stop-hook reports after reinstall.
- **Claude Code smoke validation** — `eval-meta-agents` now handles Claude Code versions that no longer expose an `agents` subcommand by validating `.claude/agents/*.md` directly. Windows CLI resolution also prefers the npm-style `~/.local/claude.cmd` shim before the native `~/.local/bin/claude.exe` binary.

### Tests

- Added setup tests for quick-deploy guide-file coverage, Codex planning hook phase parsing, and Claude smoke fallback behavior.
- Verified release readiness with `npm run meta:verify:all` on 2026-04-28.

## [2.0.17] - 2026-04-27

### Added

- **Codex `/meta-theory` command projection** — Added canonical Codex command source at `canonical/runtime-assets/codex/commands/meta-theory.md`, plus project/global sync support so Codex can load `/meta-theory` from `.codex/commands/` and `~/.codex/commands/`.

### Fixed

- **Codex command validation and packaging** — `config/sync.json`, `scripts/meta-kim-sync-config.mjs`, `scripts/sync-runtimes.mjs`, `scripts/sync-global-meta-theory.mjs`, `scripts/validate-project.mjs`, and setup tests now treat Codex commands as a first-class runtime asset. `.gitignore` root anchoring was corrected so canonical Codex runtime assets are not accidentally ignored.
- **OpenClaw skill-root wiring** — Verified OpenClaw's installed CLI behavior and wired the project projection through `skills.load.extraDirs` in `canonical/runtime-assets/openclaw/openclaw.template.json`, using `__REPO_ROOT__\\openclaw\\skills` so generated configs can load repo-local OpenClaw skills without pretending they live in the managed user skill directory.
- **Cursor agent and skill path parity** — Verified Cursor's built-in `create-subagent` / `create-skill` guidance and updated Cursor agent generation to emit YAML frontmatter under `.cursor/agents/*.md`. Cursor docs now distinguish project skills (`.cursor/skills/<skill>/SKILL.md`), user skills (`~/.cursor/skills/`), internal built-ins (`~/.cursor/skills-cursor/`), and user agents (`~/.cursor/agents/`).
- **Global capability discovery roots** — `scripts/discover-global-capabilities.mjs` now scans the real OpenClaw and Cursor user roots: OpenClaw `~/.openclaw/skills` plus `~/.agents/skills`, Cursor `~/.cursor/agents`, `~/.cursor/skills`, and `~/.cursor/skills-cursor`.

### Changed

- **Runtime documentation refreshed** — Updated `AGENTS.md`, `CLAUDE.md`, `README.md`, `README.zh-CN.md`, `docs/runtime-capability-matrix.md`, and research docs to match the verified Codex, OpenClaw, and Cursor runtime locations and command/skill behavior.
- **OpenClaw evaluation hydration** — `scripts/eval-meta-agents.mjs` now recursively hydrates `__REPO_ROOT__` placeholders in generated OpenClaw config objects, not only the agent workspace path.

## [2.0.16] - 2026-04-26

### Fixed

- **Skill cleanup across platforms** — Four critical fixes to `install-global-skills-all-runtimes.mjs`:
  - `legacyNames` support — Added manifest field to remove old skill directories (e.g. `find-skills` → `findskill`). `cleanupLegacySkillNames()` runs before install to clean stale symlinks and directories.
  - `.disabled/ residue cleanup` — Added `cleanupDisabledSkillResidue()` (per-skill) and `sweepStaleDisabledDirs()` (general sweep) to remove `.disabled/{skillId}/` when the active version exists. Catches residue from skills deployed outside the manifest (e.g. meta-theory via sync:runtimes).
  - `loadSkillsManifest()` field propagation bug — `hookSubdirs`, `hookConfigFiles`, and `fallbackContentDir` were never copied from manifest to runtime spec objects. Hooks were never deployed because of this pre-existing bug. Fixed by adding spread operators for these three fields.
  - `deployHookSubdirs/deployHookConfigFiles` destination path bug — Both functions received `targetDir` (skills root) but used it as `runtimeHome`, causing hooks to deploy to wrong paths. Changed function signature to receive `runtimeHome` directly and updated all 4 call sites.

### Added

- **hookprompt hook deployment mechanism** — hookprompt is now properly installed as a hook system rather than a skill clone:
  - New `hookExtraFiles` manifest field — Deploys extra files alongside hooks (e.g. `prompt-optimizer-meta.md` to `~/.claude/`).
  - New `hookSettingsMerge` manifest field — Registers hook commands in `settings.json` with correct paths to deployed hook scripts.
  - New `deployHookExtraFiles()` and `mergeHookSettings()` functions in install script.
  - Updated `skills-manifest.schema.json` with schema definitions for all three new fields.
  - hookprompt manifest entry now includes `hookSubdirs`, `hookExtraFiles`, and `hookSettingsMerge` for Claude platform.

### Changed

- **i18n additions** — Added `warnLegacyNameRemoved` and `warnDisabledResidueRemoved` keys to all 4 languages (en, zh-CN, ja-JP, ko-KP) in `meta-kim-i18n.mjs`.

## [2.0.15] - 2026-04-21

### Added

- **stop-memory-save hook**: New Stop hook (`stop-memory-save.mjs`) writes session summaries to MCP Memory Service on session end. Enables cross-session continuity without manual intervention. All 10 hooks now wired in `doctor:governance` and `validate:run` expectations.
- **tests/setup/check-sync.test.mjs**: Updated expected hook count from 9 to 10 (stop-memory-save added).
- **scripts/runtime-sync-check.mjs, doctor-governance.mjs, footprint.mjs, claude-settings-merge.mjs**: Added `stop-memory-save.mjs` to hook file/command lists.
- **`mirror` as the 11th business workflow phase** — `config/contracts/workflow-contract.json` already declared `mirror` (Mirror Publish / 镜像发布) as a terminal phase appended after `evolve`; this release closes the gap by syncing every dependent test and doc to the 11-phase contract. Post-sync state: `phases.length = 11`, `terminalPhases.length = 7`, `labels.{zh-CN,en-US}` each have 11 entries, and `tests/meta-theory/07-contract-compliance.test.mjs` + `tests/meta-theory/12-ten-step-workflow.test.mjs` pass without flakiness.

### Fixed

- **4-runtime hooks correction** — All four platforms (Claude Code, Codex, OpenClaw, Cursor) have native hooks systems. Previous docs incorrectly stated only Claude Code had hooks. Codex has `hooks.json` (5 events since v0.117.0), OpenClaw has Plugin SDK hooks (28 hooks), and Cursor has `hooks.json` (4 events). Updated `runtime-capability-matrix.md`, `runtime-coverage-audit.md`, `distribution-matrix.md`, and all 4 README language variants.
- **PWF hook co-deployment** — `install-global-skills-all-runtimes.mjs` now deploys planning-with-files lifecycle hooks to Codex (`.codex/hooks/` + `hooks.json`) and Cursor (`.cursor/hooks/` + `hooks.json`) via new `deployHookSubdirs()` and `deployHookConfigFiles()` helpers.
- **Superpowers sparse fallback** — Added `fallbackContentDir` logic to detect when platform-specific subdirs (`.codex/`, `.cursor/`) are too sparse and fall back to the main `skills/` content directory.
- **`install-plugin-bundles` dry-run flakiness** — `scripts/install-global-skills-all-runtimes.mjs` (line 1576–1583) was short-circuiting the "already exists" branch even under `--dry-run`, so the sparse-checkout preview for plugin-bundle specs like `obra/superpowers` would never print on machines that had the target directory cached. Added a single-line `!dryRun &&` guard so dry-run always prints the intended command (the idempotent skip still applies to real installs). Restores 3 previously-failing tests in `tests/setup/install-plugin-bundles.test.mjs` (`Codex .codex/`, `Cursor .cursor/`, `OpenClaw skills/`).

### Changed

- **11-phase contract synced across tests + top-level docs**: `tests/meta-theory/07-contract-compliance.test.mjs`, `tests/meta-theory/12-ten-step-workflow.test.mjs`, `AGENTS.md`, `CLAUDE.md`, `canonical/agents/meta-conductor.md`, `canonical/skills/meta-theory/references/dev-governance.md`, `canonical/skills/meta-theory/references/ten-step-governance.md`. Counts updated (`10 → 11`, `6 → 7` terminal), phase lists append `mirror`, zh-CN/en-US labels extended with `镜像发布` / `Mirror Publish`.
- **discover-global-capabilities.mjs** — Added Cursor platform scanning (skills + plugins).
- **README cross-platform mapping** — Added hooks to Codex, OpenClaw, and Cursor entries in all 4 language READMEs (EN/ZH/JA/KO).

### Known Issues

- `README.md` / `README.zh-CN.md` / `README.ja-JP.md` / `README.ko-KR.md` still describe the pre-`mirror` 10-stage workflow in prose and Mermaid diagrams; a multi-language README sync is deferred to a follow-up release.
- Callers that first-run `meta:verify:all` on a fresh clone must run `npm run meta:sync:global` beforehand, otherwise `meta:check:global` hard-fails on the missing `~/.codex/skills/meta-theory/` (and `.cursor` / `.openclaw`) directories. Documenting this as a Getting Started prerequisite is queued.

## [2.0.14] - 2026-04-20

### Added

- **MCP Memory SessionEnd auto-save + Layered injection (L1/L2/L3)**: Two complementary progress-tracking mechanisms for cross-session continuity.
  - **`scripts/install-mcp-memory-hooks.mjs`** — Extended to handle Stop hook (`stop-save-progress.mjs`) and commands directory (`save-progress/`). Now registers both SessionStart and Stop hooks in `settings.json`. Stop hook auto-extracts completed/remaining tasks from session transcript via regex patterns and persists to `.claude/project-task-state.json`.
  - **`canonical/runtime-assets/claude/hooks/stop-save-progress.mjs`** — Node.js Stop hook that reads session transcript, extracts task keywords (完成/搞定/新增/修复 etc.), and calls `mcp_memory_global.py --mode save`. Runs after every Claude Code session, exits 0 always.
  - **`canonical/runtime-assets/claude/memory-hooks/mcp_memory_global.py`** — Upgraded with layered injection:
    - L1 compact: task state only (~120 chars) — always shown
    - L2 filtered: project memories with relevance > 0.55 (~400 chars) — context-triggered
    - L3 full: recent memories (~800 chars) — on demand via `--mode query-memories`
  - **`canonical/runtime-assets/claude/commands/save-progress/SKILL.md`** — Manual save command (`/save-progress`). Allows explicit task state persistence when user wants precise control.
  - **Chinese-friendly limits**: `MIN_RELEVANCE=0.55` (lowered for Chinese embedding models), `MAX_LEN_COMPACT=120`, `MAX_LEN_L2=400`, `MAX_LEN_L3=800`.

### Fixed

- **`scripts/install-mcp-memory-hooks.mjs` async + `fs` import bug** — `copyCommandsDir()` used `fs.readdir()` but imported sync `fs` module, causing "fs is not defined" error. Fixed by importing `readdir` from `node:fs/promises`. Also fixed `registered is not defined` error by properly capturing return values from `registerSessionStartHook()` and `registerStopHook()`.

## [2.0.13] - 2026-04-20

### Added

- **Layer 3 auto-start on setup**: `node setup.mjs` now automatically starts the MCP Memory Service (HTTP mode) in the background after installation, then verifies the health endpoint at `http://localhost:8000`. If the server starts successfully, a platform-specific boot auto-start entry is created (Windows Startup VBS / macOS LaunchAgent / Linux XDG autostart). The entire sequence is non-blocking — failures print manual instructions instead of aborting setup. Five new i18n keys added per language (en / zh-CN / ja-JP / ko-KR): `mcpMemoryAutoStarting`, `mcpMemoryAutoStarted`, `mcpMemoryAutoStartFailed`, `mcpMemoryAutoStartManual`, `mcpMemoryAutoStartBoot`.

- **Install Manifest Phase 4 — manifest-driven uninstall**: `scripts/uninstall.mjs` now prefers the install manifest over the filesystem-scan heuristic, so teardown follows the exact set of entries Meta_Kim actually wrote (rather than a path-pattern guess).
  - New `manifestEntryToFinding(entry)` adapter maps a schema-v1 manifest entry onto the scan-finding shape that `planActions` already consumes. Entries with `kind` of `pip-package` / `mcp-server` / `git-hook` return `null` — they need dedicated actions the pipeline does not model yet, so only `file` / `dir` / `settings-merge` entries reach `planActions`.
  - New `findingsFromManifest({ scope, repoRoot })` reads the global and/or project manifest and returns adapted findings. Read failures are swallowed — a corrupt or missing manifest never blocks uninstall.
  - `planActions()` now accepts `useManifest` (default `true`) and returns `{ actions, source }`. When `useManifest` is true and at least one actionable entry exists, manifest drives the plan; otherwise `collectFindings` is the fallback.
  - New `--no-manifest` CLI flag forces the scan fallback (useful for verifying parity, or after a manifest goes stale).
  - `CATEGORIES.D` and `CATEGORIES.H` plan builders now derive `recursive` from `f.kind === "dir"` so manifest file entries get accurate `remove file` output instead of the previous (harmless but misleading) `remove directory` description.
  - MSG tables add `sourceManifest` / `sourceScan` strings in en / zh-CN / ja-JP / ko-KR; the dry-run header now states which source the current run used.
  - Unit coverage: `tests/setup/uninstall-manifest.test.mjs` adds 14 tests for `manifestEntryToFinding` + `findingsFromManifest`, bringing the install-manifest test suite to 48 tests total.

- **Install Manifest Phase 3 — pre-install preview (MVP)**: users now see what Meta_Kim has on disk *before* they confirm a fresh install, so they can catch "I didn't mean to overwrite those" moments.
  - **`scripts/sync-runtimes.mjs`** gains `--json` (pair with `--check`). When both flags are passed, stdout emits `{ scope, targets, total, byCategory, byAction, staleFiles }` — a structured diff of every file sync-runtimes is about to create or update. The existing human-readable `--check` path is preserved unchanged when `--json` is absent, so CI contracts keep working.
  - **`setup.mjs`** gains `showExistingFootprint(installScope)`, invoked inside `runInstall()` immediately after `showInstallOverview()` and before `askYesNo(confirmStartInstall)`. It reads the global and project manifests via dynamic import and prints per-scope entry counts broken down by category (A..I). When no manifest exists, it prints `First install on this machine` instead of crashing.
  - Three new i18n keys added per language (en / zh-CN / ja-JP / ko-KR): `footprintTitle`, `footprintFirstInstall`, `footprintRefreshNote`.
  - A later iteration can upgrade this from "previous footprint" to a real diff by spawning `sync-runtimes --check --json` and merging its output against the existing manifest; the JSON schema above is the forward-compatible hook for that.

- **Install Manifest Phase 2 — sync recorder wiring**: `sync-global-meta-theory.mjs` and `sync-runtimes.mjs` now record every write to the install manifest, turning the manifest from a passive schema into the canonical source of truth for what Meta_Kim has put on disk.
  - **`scripts/sync-global-meta-theory.mjs`** opens `openRecorder({ scope: "global" })` at the start of `runSync()` and flushes at the end. Every canonical skill directory sync (per-runtime), the global hooks dir + each hook file inside it, and the `~/.claude/settings.json` merge are recorded as Category A / B / C entries. `copyCanonicalSkill` gained a `targetId` argument so each skill dir is tagged with the right `{targetId}-global-skill` purpose.
  - **`scripts/sync-runtimes.mjs`** opens `openRecorder({ scope: "project" })` in `main()` when `--scope` includes `project` and `--check` is not set. `writeGeneratedFile` routes every successful write through a new `inferProjectCategory()` helper that maps the path to Category D (skills), E (hooks), F (agents), or G (settings/MCP) across `.claude`, `.codex`, `.cursor`, `openclaw`, and `.agents`. Unknown paths stay unrecorded rather than polluting the manifest. A CLI guard was added around the top-level `await main()` so the module is safe to import from unit tests without triggering a real sync.
  - **Recorder isolation contract**: both scripts wrap all recorder calls in a `recordSafe()` helper so a manifest write failure never breaks the underlying sync.
  - **Unit coverage**: `tests/setup/sync-runtimes-manifest.test.mjs` adds 15 unit tests for `inferProjectCategory` / `inferProjectPurpose`, bringing the install-manifest test suite to 34 tests total.

- **Install footprint + uninstaller (Phase 1 of Install Manifest project)**: Three new scripts give users full visibility and reversibility over what Meta_Kim writes to their system.
  - **`scripts/install-manifest.mjs`** — Schema v1 plus helpers (`readManifest`, `writeManifest`, `record`, `removeByPath`, `validate`, `listByCategory`, `manifestPathFor`). Two manifest files: `~/.meta-kim/install-manifest.json` (global) and `<repo>/.meta-kim/install-manifest.json` (project). Nine categories (A–I) cover global skills, global hooks, global settings merges, project skills/hooks/agents/settings, local state, and shared dependencies. Phase 2 now wires `sync-global-meta-theory.mjs` and `sync-runtimes.mjs` into this API; `install-global-skills-all-runtimes.mjs` and `claude-settings-merge.mjs` are still pending.
  - **`scripts/footprint.mjs` + `npm run meta:status` / `:json` / `:diff`** — Tree/JSON/diff views of everything Meta_Kim has installed on the current machine. Prefers manifest data when present; falls back to deterministic filesystem scan of runtime homes (`~/.claude`, `~/.codex`, `~/.claw`, `~/.cursor`) and the current repository. Identifies Meta_Kim–managed hook entries inside `~/.claude/settings.json` (including double-backslash-escaped Windows paths written by older sync runs — see Fixed below). 4 languages (en/zh/ja/ko) with auto-detection via `--lang`, `METAKIM_LANG`, `LANG`.
  - **`scripts/uninstall.mjs` + `npm run meta:uninstall` / `:yes` / `:deep`** — Dry-run by default, refuses to delete without `--yes`. Supports `--scope=global|project|both` (default `both`), `--deep` (also `pip uninstall` graphifyy/mcp-memory-service and remove `.git/hooks/post-{commit,checkout}` written by graphify), `--purge-project-agents` (normally kept because they are repo-owned source files). Automatically backs up `~/.claude/settings.json` to a timestamped file before stripping Meta_Kim-managed hook entries, and never touches unrelated hook blocks.

### Planned

- **Install Manifest Phase 2 remainder** — `install-global-skills-all-runtimes.mjs` and `claude-settings-merge.mjs` still need to call `openRecorder()` / `record()` on their own write paths so every install surface contributes to the manifest.
- **Install Manifest Phase 3 follow-up** — replace the "previous footprint" preview with a real planned-vs-existing diff by spawning `sync-runtimes --check --json` from `setup.mjs` and merging its output against the on-disk manifest.
- **Install Manifest Phase 4 follow-up** — model `pip-package`, `mcp-server`, and `git-hook` entry kinds as first-class uninstall actions (currently they are filtered out by the manifest-source adapter and only the filesystem scan can clean them up, via `--deep`). Also add an empty-directory sweep after file-granular manifest teardown so parent dirs like `.claude/skills/meta-theory/references/` do not get left behind when every child file is deleted individually. A version-aware upgrade path (detect schema or version drift and migrate) belongs here too.

### Fixed

- **`scripts/claude-settings-merge.mjs` hookCommandNode double-escape (was Known Issue in Phase 1)** — `hookCommandNode(absScriptPath)` previously produced Windows paths that were double-JSON-encoded when serialized back to `settings.json` (observed as `\\\\` on disk), and the matchers `isGlobalMetaKimManagedHookCommand` / `isRepoMetaKimHookCommand` only checked the single-backslash form so they silently missed the double-escaped entries. Fixed at the source in 37d84fde: `hookCommandNode` now writes a single-escaped path and the matchers tolerate both single- and double-backslash forms. The local normalizing matcher that Phase 1 shipped inside `footprint.mjs` + `uninstall.mjs` is retained as a defense-in-depth layer for legacy on-disk settings written by older sync runs.

- **MCP Memory Service default port corrected to `8000`** — Meta_Kim now uses the upstream default port consistently. Updated:
  - `canonical/runtime-assets/claude/memory-hooks/mcp_memory_global.py` — `MCP_MEMORY_URL` env-var default
  - `canonical/runtime-assets/claude/memory-hooks/config.template.json` — `memoryService.http.endpoint`
  - `scripts/install-mcp-memory-hooks.mjs` — header comment, `checkServerHealth()` URL, install/check success/warn messages (5 occurrences)
  - `setup.mjs` — 4 i18n locale strings for the `mcpMemoryServerStartHint` guidance
  - `README.md`, `README.zh-CN.md`, `README.ja-JP.md`, `README.ko-KR.md` — "start server" instruction

- **`setup.mjs` `runMcpMemoryHookInstaller` i18n + progress UX** — the memory-hook installer step previously (a) printed four hard-coded English strings bypassing the per-locale `t.*` system and (b) used `stdio: "inherit"` to pipe the Python child process's raw stdout directly to the terminal, producing ~10s of silent no-feedback time and breaking the 4-language install experience. Fixed: function is now `async`, wrapped in `withProgress(t.mcpMemoryHookInstalling, …)` so users see a clean per-locale label with the existing dim arrow marker; child `stdio` is now `["ignore", "pipe", "pipe"]` so stdout is captured silently; on non-zero exit the captured `stderr` is surfaced in dim style under `t.mcpMemoryHookWarnings` so the underlying Python error is still discoverable. The single call site (`installMcpMemoryServiceStep`) now `await`s the installer. Three new i18n keys added per language (en / zh-CN / ja-JP / ko-KR): `mcpMemoryHookInstalling`, `mcpMemoryHookInstalled`, `mcpMemoryHookWarnings`.

- **`scripts/install-mcp-memory-hooks.mjs` console output left-aligned** — the script's `info`/`ok`/`warn`/`fail` helpers previously prefixed every line with 2 spaces of indentation, which made the standalone invocation (when run directly outside of `setup.mjs`, or when stderr is surfaced by the new pipe handler above) look like nested sub-output of nothing. Indent removed so every status line sits flush with column 0.

- **`scripts/sync-runtimes.mjs` missing-canonical warning i18n'd** — `tryReadCanonical(filePath)` previously printed `[sync-runtimes] Skipping missing canonical file: …` in hard-coded English whenever a canonical source file was absent (which is the typical failure mode when `npx` serves a stale cached tarball that predates a new `canonical/runtime-assets/*` addition). Now routed through `t.canonicalMissingWarn(filePath)` with en / zh-CN / ja-JP / ko-KR translations added to `scripts/meta-kim-i18n.mjs` so the warning stays legible in every locale.

- **`package.json` explicit `files` whitelist for `npm pack` / `npx` tarballs** — the previous publication relied on npm's default file-selection rules (pack everything not ignored), which silently omitted `canonical/runtime-assets/openclaw/openclaw.template.json` and `canonical/runtime-assets/codex/config.toml.example` from the `npx --yes github:KimYx0207/Meta_Kim` cached tarball on some Node / npm combinations. Added an explicit `files` array covering `canonical/`, `scripts/`, `bin/`, `config/`, `docs/`, `setup.mjs`, `install-deps.sh`, `CHANGELOG.md`, `README*.md`, `LICENSE`, `AGENTS.md`, `CLAUDE.md` so every release of the package includes the complete canonical source. Version intentionally *not* bumped in this commit — the 2.0.13 bump is reserved for the maintainer's next tagged release.

### Added

- **scripts/doctor-hooks.mjs + `npm run meta:doctor:hooks` / `:fix`**: New scanner for `~/.claude/settings.json` (and optionally the repo's `.claude/settings.json` via `--all`). Identifies hook entries whose `command` path references a non-existent file ("zombie hooks" — typically left behind by copying `settings.json` between machines with different usernames or OSes) and lists them for review. `--fix` writes a timestamped backup (`settings.json.backup-<ISO>`) and removes only the zombie entries, preserving every live hook block. Supports `--lang` (en/zh/ja/ko, auto-detected from `METAKIM_LANG`/`LANG`), `--silent` (CI mode with zombie-count exit code), `--project` (only project-level settings), `--all` (both user-level and project-level).

### Migration Notes

- Users on a new machine should run `node setup.mjs` then `npm run meta:sync:global` — do **not** copy `~/.claude/settings.json` between machines (hook `command` values are absolute paths and will not resolve under a different username or OS). `npm run meta:doctor:hooks` detects and `:fix` cleans up after an accidental copy.

- **`npx` stale-tarball cache**: if `npx --yes github:KimYx0207/Meta_Kim meta-kim` warns about missing canonical files (e.g. `openclaw.template.json`, `codex/config.toml.example`) during `sync:runtimes`, your local npx cache is holding a pre-`files`-whitelist tarball. Clear it with `npm cache clean --force` (or `rm -rf ~/.npm/_npx`) and re-run the command to pull a fresh tarball that includes the complete `canonical/` tree.

## [2.0.12] - 2026-04-18

### Changed

- **SKILL.md agent name consistency**: Updated Type A, B, and D sections to use full agent names (`meta-prism`, `meta-warden`, `meta-genesis`, `meta-artisan`, `meta-scout`, `meta-sentinel`, `meta-librarian`) in section headings and body text. Previously only role names (Prism, Warden, Genesis) appeared in plain text, causing the 03-agent-dispatch.test.mjs agent-mapping tests to fail. All 773 meta-theory tests now pass.

### Changed

- **hooks DRY refactor**: Created `canonical/runtime-assets/claude/hooks/utils.mjs` — shared module exporting `readJsonFromStdin`, `readJsonFromStdinSync`, and `extractFilePath`. 6 hooks (`block-dangerous-bash`, `post-console-log-warn`, `post-format`, `post-typecheck`, `pre-git-push-confirm`, `subagent-context`) now import from `./utils.mjs` instead of duplicating the function inline. Eliminates 63 lines of duplicate code across the hooks layer.

### Fixed

- **graphify DRY gap**: `scripts/hooks-utils.mjs` removed — shared utilities correctly placed inside the hooks directory so sync can propagate them. All hooks now use `./utils.mjs` (canonical: `canonical/runtime-assets/claude/hooks/utils.mjs`).

## [2.0.8] - 2026-04-18

### Changed

- **package.json: unify npm script naming**: All npm scripts now use `meta:` prefix (`sync:runtimes` → `meta:sync`, `validate` → `meta:validate`, `check:runtimes` → `meta:check:runtimes`, `index:runs` → `meta:index:runs`, etc.) for consistent discoverability.

- **runtime-capability-matrix.md**: Updated script name references to match new `meta:` prefix.

- **doctor-governance.mjs**: Updated `validate:run` reference to `meta:validate:run`.

- **validate-project.mjs**: Updated script name assertions and added checks for `meta:sync`/`meta:validate` presence.

- **setup.mjs**: Enhanced `npmFailed` and `skillFailed` error messages with actionable troubleshooting hints (network, permission, version mismatch).

- **tests/meta-theory/00-capability-discovery.test.mjs**: Updated test assertions to expect new `meta:` prefixed script names.

- **tests/setup/check-sync.test.mjs**: Updated expected hook count from 8 to 9 (stop-compaction guard added).

### Added

- **install-global-skills-all-runtimes.mjs: GitHub API plugin version detection**: Added `fetchLatestPluginVersion()` that reads `.claude-plugin/marketplace.json` from GitHub to detect the latest plugin version. Compares against `installed_plugins.json` (v2 format under `plugins/` subdirectory) and only reinstalls when a newer version is available. Falls back to parsing `installPath` directory name when GitHub is unreachable.

- **meta-kim-i18n.mjs**: Added three new i18n keys: `labelUpToDate`, `labelCannotCheckGitHub`, `labelUsingLocalRecord` (EN/ZH/JP/KR).

- **docs/QUICKSTART.md**: Chinese quickstart guide for new users.

- **scripts/doctor-interactive.mjs**: Interactive doctor menu providing unified entry point for health checks.

## [2.0.10] - 2026-04-18

### Fixed

- **graphifyy: respect active venv before pip install**: If `VIRTUAL_ENV` is set, resolve the venv's Python directly (`Scripts/python.exe` / `bin/python`) instead of probing the system PATH. This lets users who activate a venv manually before running `setup.mjs` have `graphifyy` installed into their venv instead of the system Python.

## [2.0.9] - 2026-04-18

### Fixed

- **install-skills: multi-runtime empty sections root cause**: `installSkillsToMultipleRuntimes` Phase 2 called `deployStagedSkill` with an empty `stagedPath` when a skill already existed at the first runtime (stage optimization skipped clone). Since `deployStagedSkill` returns `false` silently on empty path, all skill sections showed headers but no content. Fixed by checking `stagedPath` existence before deploying — falls through to direct install branch so "⊘ 已存在" output is always printed.

- **install-skills: `--skills ""` filtering all skills**: `parseSkillsArg` returned `[]` instead of `null` for `--skills ""` (empty string), causing `applySkillsIdFilter` to filter ALL skills out of `SKILL_REPOS`. Fixed by moving the length check to after `filter(Boolean)`. Also updated `install-global-skills-all-runtimes.mjs` to skip filtering when `skillsArg` is empty.

- **doctor-interactive.mjs: non-interactive TTY crash**: `@inquirer/prompts` `select()` crashes with "User force closed the prompt" in non-TTY environments (Claude Code bash, CI). Fixed by detecting TTY before invoking the menu — non-interactive mode auto-runs `runFullDiagnostic()`.

- **doctor-interactive.mjs: "npm run run" spurious prefix**: All npm script calls in switch cases had an extra `"run"` entry in the args array, generating `npm run run meta:doctor:governance`. Fixed by removing all spurious `"run"` prefixes.

- **install-global-skills-all-runtimes.mjs: Mac plugin marketplace registration**: On Mac/Linux, `claude plugin install superpowers@superpowers-marketplace` and `everything-claude-code@everything-claude-code` failed with "Plugin not found in marketplace" because these marketplaces are not pre-registered on fresh installs (unlike Windows which has them by default). Fixed by adding auto-registration logic: before each plugin install, probes `claude plugin marketplace list --json` and calls `claude plugin marketplace add <GitHub-url>` for any missing marketplace. Registry map: `superpowers-marketplace` → `obra/superpowers-marketplace`, `everything-claude-code` → `affaan-m/everything-claude-code`.

- **docs: corrected superpowers marketplace identifier**: Research docs listed `superpowers@claude-plugins-official` (wrong) instead of `superpowers@superpowers-marketplace` (correct). Fixed in `docs/research/dependencies/superpowers.md` and `docs/research/distribution-matrix.md`.

### Added

- **setup.mjs: `--log-file` tee for debug capture**: Added optional `--log-file <path>` to `install-global-skills-all-runtimes.mjs` — replaces `process.stdout/stderr.write` with a tee that mirrors all output to both terminal and the specified log file. setup.mjs auto-generates `~/.cache/meta-kim-setup/install-YYYYMMDD-HHMMSS.log` (code commented out by default, ready for re-enable during future debug sessions).

## [2.0.8] - 2026-04-17

### Fixed

- **skills.json: superpowers plugin version**: Fixed `superpowers` from `superpowers@claude-plugins-official` (wrong, lacks per-skill discovery) to `superpowers@superpowers-marketplace` (correct, 14 skills discoverable). Resolves [Issue #4](https://github.com/KimYx0207/Meta_Kim/issues/4).

- **skills.json: everything-claude-code install method**: Fixed `everything-claude-code` from `subdir: "skills"` (wrong, not a subdir of its repo) to `claudePlugin: "everything-claude-code@everything-claude-code"` (plugin marketplace, correct).

- **schema: installMethod field**: Added `installMethod` enum to `skills-manifest.schema.json`: `pluginMarketplace`, `gitClone`, `gitCloneInstallScript`, `subdirExtraction`, `manual`. Documents how each of the 9 dependency skills is installed across platforms.

- **schema: opencode target**: Added `opencode` to targets enum — `superpowers` and `everything-claude-code` now declare full cross-platform support (claude, codex, openclaw, cursor, opencode).

- **skills.json: installMethod coverage**: All 9 skills now carry explicit `installMethod`: superpowers/ecc/cli-anything → `pluginMarketplace`; agent-teams-playbook/gstack → `gitCloneInstallScript`; findskill/planning-with-files/skill-creator → `subdirExtraction`; hookprompt → `manual`.

- **setup.mjs multi-runtime redundant download fix**: Added Phase 0 pre-check in `installSkillsToMultipleRuntimes` to detect skills already deployed at target runtimes. Updated `stageSkillClone` and `stageSkillFromSubdir` to accept optional `preExistingPath` and skip git clone when skill already exists. Eliminates wasteful downloads on every `setup.mjs` run (without `--update`) for already-installed skills. Backward compatible: `--update` mode, single-runtime path, and CLI interface unchanged.

- **sanitizer: skip quarantine for third-party plugin docs**: Added `shouldSkipDocsSkillDoc()` to `install-skill-sanitizer.mjs` — skips quarantine for `docs/{locale}/skills/*.md` files in third-party plugin repos (e.g. ecc's example skills under `docs/zh-CN/skills/`). Suppresses the noisy "隔离托管安装中的无效 SKILL.md" warnings that appear on every `setup.mjs` run. Only quarantines files that would actually be discovered as skills.

### Added

- **meta-conductor Stage 4 agent-team-playbook integration**: Pipeline Mode integration with `agent-teams-playbook` v4.5. Conductor now invokes the playbook at Stage 4 (Execution) to obtain orchestration decisions (scenario selection, team blueprint, collaboration mode), parses the natural language output, and converts `teamBlueprint` to `workerTaskPackets` for dispatch board execution. Strict mode: parsing failures throw `ParseError` immediately (no silent defaults). Error codes: `SCENARIO_MISSING`, `BLUEPRINT_EMPTY`, `BLUEPRINT_COLUMN_MISMATCH`, `DISPATCH_BOARD_MISSING`.

- **Integration protocol document**: `docs/protocols/meta-conductor-agent-teams-playbook-integration.md` defines the full integration architecture, invocation format, expected output patterns, parsing strategy, error handling, and field mapping table.

- **Integration test**: `tests/integration/agent-teams-playbook-integration.test.mjs` validates the complete pipeline (6/6 tests passing): scenario parsing, team blueprint parsing, collaboration mode parsing, workerTaskPackets conversion, strict mode error handling, and end-to-end integration flow.

### Changed

- **meta-conductor version**: Bumped from v1.1.0 to v1.2.0. Added `agent-team-playbook Pipeline Mode integration (Stage 4 Execution)` to `own` field in agent frontmatter.

## [2.0.7] - 2026-04-16

### Added

- **stop-compaction hook**: New Stop hook (`stop-compaction.mjs`) auto-writes a compaction packet on session end when 8-stage spine markers are detected. SessionStart `subagent-context.mjs` reads the packet and injects pending stage/findings as priority context on resume. Compaction is now **enforced via hooks**, not convention. Canonical source (`.claude/hooks/`), global sync (`~/.claude/hooks/meta-kim/`), and all mirror configurations are kept in sync. All 9 hooks wired in `doctor:governance` and `validate:run` expectations.

- **doctor scripts**: `scripts/write-compaction.mjs` and `scripts/write-migration.mjs` are maintainer helpers for testing the compaction enforcement chain and migration tracking respectively.

### Changed

- **graphify (install + docs + tests)**: `setup.mjs` optional Python step and `npm run meta:graphify:install` now **idempotently** run `python -m graphify claude install` and `python -m graphify hook install` even when `graphifyy` is already installed via pip (fixes silent skip of git hooks). `scripts/graphify-cli.mjs` `install`/`update` appends `hook install`. `install-global-skills-all-runtimes.mjs` runs the same wiring when pip reports graphify already present. **Docs** (`CLAUDE.md`, `README.md` / `README.zh-CN.md` / `README.ja-JP.md` / `README.ko-KR.md`, `AGENTS.md`): separate **data refresh** (hooks/commands) vs **Fetch Step 0.5** (model behavior) vs **Claude subagent hint** (no embedding); Codex/OpenClaw/Cursor consumption via synced `dev-governance.md` and optional `graphify codex|claw install` in target repos. **Hook** [`canonical/runtime-assets/claude/hooks/subagent-context.mjs`](canonical/runtime-assets/claude/hooks/subagent-context.mjs): prefer `graphify-out/GRAPH_REPORT.md` when present. **Tests**: [`tests/setup/graphify-wiring-contract.test.mjs`](tests/setup/graphify-wiring-contract.test.mjs) locks the contract.

- **Documentation (CLAUDE.md)**: Clarified generated/runtime wiring vs canonical edit targets; Cursor as fourth runtime projection; expanded maintenance commands (`check`, `check:global:meta-theory`, `deps:update`, `graphify:install`, `prompt:next-iteration`, etc.); graphify working-directory notes.

### Fixed

- **Runtime configs — no hardcoded model**: OpenClaw template, Codex `config.toml.example`, `validate-project.mjs`, `discover-global-capabilities.mjs`, and `eval-meta-agents.mjs` no longer inject or validate a default model; CLIs own model selection.

- **CLI / i18n**: `setup.mjs` log alignment and progress output; `sync-runtimes.mjs` incremental/`--check` messages use `meta-kim-i18n` with `zh`/`ja`/`ko` LANG aliases.

### Added

- **Skills manifest / install**: `pluginHookCompat` and `installRoot` schema; `planning-with-files` canonical layout under `skills/` with plugins junction for upstream Stop hooks; Cursor target labels in i18n; sanitizer stops rewriting planning-with-files hook paths.

### Chore

- **install**: Suppress noisy stdout from git proxy detection while still applying proxy env.

## [2.0.6] - 2026-04-15

### Changed

- **planning-with-files install path**: Global install deploys the canonical tree to `skills/planning-with-files` under each runtime home and adds `plugins/planning-with-files` → `skills/planning-with-files` (`pluginHookCompat` in `config/skills.json`) so upstream Stop-hook paths resolve without rewriting `SKILL.md`. Manifest schema adds optional `pluginHookCompat` (boolean) and optional `installRoot` (`skills` | `plugins`) for rare primary-in-plugins layouts.

### Added

- **Principle enforcement via 3 execution lanes (PRIN-01~05)**: Added mandatory principle compliance checks across the meta-agent governance chain to close the gap between "principles defined" and "principles enforced":
  - `meta-prism`: New **Principle Violation Assertions (PRIN-01~05)** section — Configurable, Single Source, Layering, Decoupling, i18n enforced as mandatory check dimensions equivalent to AI-Slop detection; missing = review incomplete, no evidence = FAIL
  - `meta-genesis`: New **7th stress-test category (Principle Violation Detection)** with PRIN-ST-01~05 sub-tests; Iron Rule blocks SOUL.md delivery on any principle failure
  - `meta-warden`: New **Principle Compliance Gate** in Quality Gate checklist — principle violations are governance findings (not quality notes), cannot be accepted-risk, must fix or reject

## [2.0.5] - 2026-04-15

### Added

- **Dual-end Warden architecture (Type A/B/C/D/E routing)**: meta-theory SKILL.md now explicitly models Warden as BOTH entry gate (clarification + solution enumeration via brainstorming) AND exit gate (quality gate + final synthesis) for ALL dispatch types. Conductor now orchestrates ALL types, not just Type C.
- **findskill dependency for all 8 meta agents**: Added `findskill` discovery step to Dependency Skill Invocations of all 8 canonical agents (warden, conductor, genesis, artisan, scout, sentinel, librarian, prism). Artisan and Scout already had findskill; others are new.
- **superpowers/brainstorming for Warden entry gate**: Warden now uses `superpowers/brainstorming` at the entry gate for solution enumeration (≥2 approaches before dispatch).
- **Hook path auto-fix during install**: `install-skill-sanitizer.mjs` can scan installed skill SKILL.md files for known broken hook command paths and patch them in-place (curated list; optional `silent` per pattern). Dry-run supported.

### Changed

- **meta-theory SKILL.md Type Routing table**: Rewrote the routing table with clear entry/exit gate separation. Each Type (A/B/C/D/E) now shows Warden entry role, Conductor orchestration, execution steps, and Warden exit role.
- **meta-theory SKILL.md Type A/B/C/D/E detail sections**: Added Entry Gate (Warden) / Orchestration (Conductor) / Execution / Exit Gate (Warden) structure to all five Type sections.
- **sync-runtimes.mjs cross-runtime path substitution**: Added `applyRuntimePaths()` function that substitutes canonical/ paths to runtime-specific paths (`.claude/`, `.codex/`, `openclaw/`, `.cursor/`) during sync. OpenClaw agent references use workspace-per-agent format (`openclaw/workspaces/{workspace}/AGENTS.md#`).
- **canonical/meta-theory/SKILL.md canonical paths**: All `.claude/` path references in the canonical SKILL.md replaced with `canonical/` format, enabling correct cross-runtime sync.
- **discover-global-capabilities.mjs hook scanning scope**: Reverted Phase 2 hook extraction from third-party skill SKILL.md YAML frontmatter. Capability index now only records physical hook script files under the hooks directory. Third-party skill hook commands (including broken ones) are excluded from Meta_Kim's governance scope.

## [2.0.4] - 2026-04-15

- **README Layer 3 correction**: Fixed false "All three layers activate automatically" claim. Layer 1 requires Claude Code runtime, Layer 2 is auto-installed by setup.mjs, Layer 3 requires manual server startup. All 4 languages (EN/ZH/JA/KO) synchronized.
- **setup.mjs Layer 3 install**: Added Step 4.6 for MCP Memory Service (mcp-memory-service) installation — pip install, .mcp.json registration, i18n strings across all 4 languages.
- **install-mcp-memory-hooks.mjs**: New script to install Claude Code SessionStart hooks for MCP Memory Service — verifies server health, registers hooks, warns if server not running.

### Changed

- **README Layer 3 description**: Expanded activation details with tool-specific instructions (Claude Code auto-hooks vs. Codex/OpenClaw/Cursor manual setup), explicit server startup command, and hook registration notes.

## [2.0.3] - 2026-04-14

### Changed

- **README overhaul**: Removed "BETA VERSION" banner, streamlined language, clarified Meta_Kim's governance mission
- **Remove shared-skills/ projection layer**: Deprecated `shared-skills/` directory removed from `sync-runtimes.mjs`, `AGENTS.md`, `CLAUDE.md`, and `sync.json` — runtime projections now target only `.claude/`, `openclaw/skills/`, `.codex/skills/`, and `.agents/skills/meta-theory/`
- **install-error-classifier**: Expanded TLS/SSL error patterns (`ssl_read`, `ssl_connect`, `ssl_error_syscall`, `openssl/ssl`) and added proxy network error detection for partial clone failures (`index-pack failed`, `file write error`, `pack-objects died`, `connection was reset`)
- **graphify-runtime**: Added `checkNetworkx()` function enforcing `networkx >= 3.4` (required for `louvain_communities(max_level=...)`)
- **skills-manifest schema**: Added `defaultSelected` boolean field to control which repos are pre-selected in dependency multi-select
- **cli-anything skill**: Set `defaultSelected: false` — opt-in install only
- **.gitignore**: Added `pnpm-lock.yaml` and `graphify-out/`

## [2.0.2] - 2026-04-14

### Fixed

- **Windows `EBUSY` on skill staging cleanup**: `deployStagedSkill` no longer fails the whole global install when deleting a sibling `*.staged-*` folder hits `resource busy or locked` (Defender/indexer/transient handles). Uses `rmDirWithRetry` + `rmDirBestEffortLocked` with short backoff; lock errors log `warnStagingLocked` instead of aborting after a successful deploy.
- **Proxy detection UX overhaul**: `setup.mjs` now asks user to confirm detected proxy (default = yes, Enter to accept). Previously auto-detected and applied system proxy silently, which caused TLS failures.
- **Proxy auto-detection removed from install script**: `install-global-skills-all-runtimes.mjs` no longer auto-detects system proxy — only respects `--proxy` flag, `META_KIM_GIT_PROXY` env, or user's explicit choice from setup.mjs.
- **"loopback proxy stripped" false positive**: Fixed — strip logic now checks `META_KIM_GIT_PROXY` env var, so configured proxies are not stripped.
- **git subprocess proxy propagation**: `spawnSync` and `spawn` in `runGit()`/`runGitAsync()` now pass `env: process.env`, so proxy env vars actually reach git.
- **Staging directory EBUSY crashes**: `cleanupStaleStagingDirs()` now catches Windows lock errors and skips locked directories with a warning instead of crashing.
- **False-positive SKILL.md quarantine**: `listSkillFiles()` in `install-skill-sanitizer.mjs` now skips `openclaw/`, `cursor/`, `codex/`, and `openclaw/skills/` subdirectories — these contain legitimate cross-platform sub-skills (e.g. gstack's own OpenClaw skills) and are not invalid nested garbage.
- **`os.platform()` typo**: Fixed to `os.platform()` in `install-global-skills-all-runtimes.mjs`.
- **`sleepSyncMs` for Windows**: Replaced `spawnSync("sleep", ...)` with PowerShell `Start-Sleep` on Windows; POSIX `sleep` on others; last-resort busy-wait as fallback.

### Changed

- **`askProxyConfig()` default = yes**: When a proxy is detected, the prompt now defaults to using it (`[Y/n]`). User can still opt out by typing `n`.
- **Git fallback strategy**: `runGit()` and `runGitAsync()` now try direct connection first, then fall back to proxy if network fails. If user has no proxy configured, direct succeeds and proxy is never attempted.
- **`i18n` proxy keys**: Added `proxyDetectedPrompt`, `proxySkip`, `proxySkipDeclined`, `proxySaved`, `proxyFallbackProxy`, `proxyFallbackProxySuccess` across all 4 languages (en, zh-CN, ja-JP, ko-KR).
- **Concurrency limiting**: `MAX_CONCURRENT_CLONES = 3` limits parallel git clones to prevent system resource exhaustion.

## [2.0.1] - 2026-04-13

### Added

- **Git retry with skillLabel**: `runGit()` in `install-global-skills-all-runtimes.mjs` auto-retries TLS/proxy failures up to 3 times with increasing delays (2s/4s/6s), and retry messages now identify the exact skill name instead of raw git args.
- **setup.mjs full i18n migration**: All hardcoded English strings in `setup.mjs` replaced with `t.*()` calls across 4 languages (en, zh-CN, ja-JP, ko-KR) — 19 new i18n keys added.
- **warnGitRetry i18n key** added to `meta-kim-i18n.mjs` for all 4 languages.
- **Skill sanitizer script** (`scripts/install-skill-sanitizer.mjs`): detects and quarantines invalid nested `SKILL.md` files inside managed installs.
- **Research docs** (`docs/research/`): dependency analysis, platform profiles, and distribution matrix for third-party skills.
- **install-error-classifier** enhancements: `parseGitHubRepoUrl`, `buildGitHubTarballUrl`, expanded TLS/proxy classification.

### Changed

- `resolveRuntimeHomeDir()` extracted from `install-global-skills-all-runtimes.mjs` into `meta-kim-sync-config.mjs` for shared use.
- Legacy subdir install detection and repair now runs automatically during skill install/update.
- Archive extraction on Windows uses relative path + `cwd` to avoid tar misinterpreting `C:\path` as a remote host.

### Fixed

- **repoPath undefined crash** in `meta-kim-local-state.mjs`: `ensureProfileState()` used undeclared `repoPath` variable; now correctly uses `repoRoot` constant.
- **Retry message confusion**: `git -C` showed instead of skill name in retry warnings — all 5 `runGit` call sites now pass explicit `skillLabel`.
- **Windows tar path bug**: archive fallback extraction failed with `Cannot connect to C: resolve failed` on Windows due to colon in absolute path.

## [2.0.0] - 2026-04-11

### Added

- **Configurable multi-platform framework**: Meta_Kim now supports mapping to any runtime platform via `config/sync.json` manifests — add a new `generatedTargets` entry and a corresponding profile, and `sync-runtimes.mjs` projects to it automatically. No hardcoded platform list.
- **Cursor as a fourth runtime target**: `.cursor/agents/*.md`, `.cursor/skills/meta-theory/`, `.cursor/mcp.json`. Cursor agents use plain Markdown (no YAML frontmatter) for compatibility with Cursor's agent system.
- `runtimes/cursor.profile.json` with Cursor-specific projection and activation config.
- `--targets cursor` support in all sync/setup commands.
- **Enhanced agent principles**: all 8 canonical agents (`meta-warden` through `meta-scout`) updated with strengthened capability-first dispatch, explicit ownership boundaries, and cross-runtime awareness including Cursor.
- **Shared i18n module** (`scripts/meta-kim-i18n.mjs`) unifies all install/update strings across 4 languages.
- **Setup UI overhaul**: `setup.mjs` now features a branded ASCII art banner with gold gradient, streamlined headings (`▸` style), and compact status output.
- **X/Twitter contact** (`https://x.com/KimYx0207`) in banner and `config/skills.json` author links.
- Plugin pre-check in `install-global-skills-all-runtimes.mjs`: uses `claude plugins list --json` to detect already-installed plugins.

### Changed

- `installPythonTools()` and `install-global-skills-all-runtimes.mjs` now use `pip show graphifyy` for reliable detection with suppressed verbose output.
- `sync-global-meta-theory.mjs` and `meta-kim-sync-config.mjs` updated with cursor runtime spec support.
- `--scope project|global|both` now works consistently across `setup.mjs --update` and `sync:runtimes`.
- `meta-theory` skill version bumped to 2.0.0.

### Fixed

- **Graphify verbose output**: pip install no longer prints 20+ "Requirement already satisfied" lines when already installed.
- `sync-global-meta-theory.mjs` crash on cursor target (`Cannot read properties of undefined`) — cursor was missing from `runtimeSpecs` dict.
- `sync-runtimes.mjs` Codex paths corrected: `.claude/` → `.codex/` for all codex-*-Dir variables.

## [1.5.0] - 2026-04-11

### Added

- **Framework extensibility via `config/sync.json`**: Any platform can be added by editing the manifest — no hardcoded platform list. The sync system is now truly runtime-agnostic: add a new `generatedTargets` entry and a corresponding profile, and `sync-runtimes.mjs` projects to it automatically.
- `shared-skills/` sync block added to `sync-runtimes.mjs`: mirrors `meta-theory.md` and `references/` alongside OpenClaw projections, enabling a portable shared skill layer.
- `--scope project|global|both` now works consistently across `setup.mjs --update` and `sync:runtimes`: `project` writes to repo-local dirs, `global` writes directly to runtime homes, `both` writes to both.
- Shared i18n module (`scripts/meta-kim-i18n.mjs`) unifies all install/update strings across 4 languages, replacing scattered hardcoded English in `setup.mjs` and `install-global-skills-all-runtimes.mjs`.
- Plugin pre-check in `install-global-skills-all-runtimes.mjs`: uses `claude plugins list --json` to detect already-installed plugins before installing, preventing repeated re-install.

### Fixed

- `sync-runtimes.mjs` Codex paths corrected: `.claude/` → `.codex/` for all codex-*-Dir variables.
- graphify command on Windows: bare `graphify` replaced with `python -m graphify` in both scripts.
- `--update` mode now prompts for install scope (project/global/both) like install mode, instead of hardcoding `project`.
- `.gitignore` now correctly ignores derived directories at directory level: `.codex/`, `codex/`, `shared-skills/`, `.meta-kim/`, and `openclaw/workspaces/*/.openclaw/`.

## [1.4.0] - 2026-04-10

### Added

- Runtime-neutral canonical source layer under `canonical/`, plus repo-tracked sync manifest (`config/sync.json`) and three runtime profiles for Claude, Codex, and OpenClaw.
- Local activation configuration via `.meta-kim/local.overrides.json`, with explicit separation between repo `supportedTargets` / `defaultTargets` and machine-level `activeTargets`.
- `--targets` support across `setup.mjs`, `sync:runtimes`, `sync:global:meta-theory`, and `deps:install:all-runtimes`, so local activation can be multi-selected without shrinking the repo support surface.
- `--scope` support for `sync:runtimes`: `--scope project` writes to repo-local dirs (default), `--scope global` writes directly to `~/.claude/`, `~/.codex/`, `~/.openclaw/`, with safety assertions to prevent writes outside configured runtime homes.

### Changed

- `.claude/` is no longer treated as the canonical source layer; Claude, Codex, and OpenClaw are now peer runtime projections generated from `canonical/`.
- `setup.mjs` now saves machine-local active runtime selection and uses it for local activation, while repo projection sync still follows repo-supported targets.
- Validation, MCP runtime loading, migration staging, and meta-theory tests now read canonical agents / skill sources from `canonical/` instead of assuming `.claude/` is the source of truth.
- `validate` now guards the canonical kernel and runtime-asset templates only; projection freshness stays in `check:runtimes`, so repo correctness no longer depends on generated mirrors or repo-local OpenClaw config.
- OpenClaw evaluation now uses an ephemeral config outside the tracked repo surface, and the legacy `openclaw/openclaw.local.json` plus `sync:global:meta-theory:codex-active` path have been removed from the public project model.

## [1.3.0] - 2026-04-10

### Added

- Runtime-level `dispatchEnvelopePacket` governance for non-query runs, plus validator coverage for owner, capability boundary, memory mode, and review / verification ownership.
- Repo-local state layout under `.meta-kim/state/{profile}/`, including `run-index.sqlite`, local `compactionPacket` continuity state, and profile collision safeguards.
- Operator commands `index:runs`, `query:runs`, `rebuild:run-index`, and `migrate:meta-kim` for governed-run retrieval and staged migration from older prompt-pack / single-agent repos.

### Changed

- `discover:global` now rebuilds `.claude/capability-index/meta-kim-capabilities.json` first and keeps `global-capabilities.json` as a compatibility mirror.
- `doctor:governance` now reports layered health across canonical contracts, mirror parity, runtime hooks, and local profile / run-index state.
- Sync all runtime-facing governance docs to the new run-index / dispatch-envelope / compaction model, including `.claude/agents/*.md`, `CLAUDE.md`, `AGENTS.md`, and all four README language variants.

### Fixed

- Fill the previously missing README updates in `README.ja-JP.md` and `README.ko-KR.md` so the multilingual docs now cover the new capability index, local run index, migration helper, and layered governance doctor flow.

## [1.2.3] - 2026-04-04

### Documentation

- **README (all four languages)**: remove `<div align="center">` wrappers around fenced Mermaid code blocks so **Cursor** (and similar previews) can render diagrams instead of **Unable to render rich display**; keep `div` centering for Markdown **tables** only. Repo-wide pass: `README.md` 9 blocks, `README.zh-CN.md` 9, `README.ja-JP.md` / `README.ko-KR.md` 8 each.

## [1.2.2] - 2026-04-03

### Documentation

- Align **README.ja-JP.md** and **README.ko-KR.md** with **README.md** / **README.zh-CN.md**: shared anchors (`#complex-spine-*`, `#meta-kim-diagram-two-layers-*`, `#task-routing-*`), workflow maps, runtime / eight-agent mini diagrams, and links to English canonical sections where detail stays in `README.md`.
- Fix **Mermaid** layout: `flowchart TB` with two horizontal `subgraph` blocks often renders **side-by-side**; replace with **stacked `flowchart LR`** pairs for the eight-stage spine (rows 1–4 / 5–8) and for spine vs 10-phase business workflow.
- Wrap Markdown **tables** in `<div align="center">` across all four READMEs so GitHub / VS Code previews center consistently (including stage tables with `Critical`, Hooks, Commands, etc.).
- **Repository structure**: replace ASCII tree with **path | description** tables in `README.md`, `README.ja-JP.md`, and `README.ko-KR.md` (match `README.zh-CN.md` granularity); add `codex/`, `docs/`, `shared-skills/`, `CHANGELOG.md` rows where missing.
- **JA/KO**: add the **two-layer workflow vocabulary** table (8-stage spine vs 10-phase business contract); add **`npx … meta-kim`** row to Quick Start usage tables; link abbreviated npm script lists to **`README.md#commands`** for the full command reference.
- Document **Meta_Kim** (`node setup.mjs`) as the preferred install path for **KimYx0207/findskill**; four README languages plus `CLAUDE.md` state that **in-repo naming uses `findskill` only** (aligned with the Claude global skill path).
- **`npx` one-shot entry**: `npx github:KimYx0207/Meta_Kim meta-kim` documented as equivalent to `node setup.mjs` with per-locale `--check` examples.

### Added

- **Graphify** optional integration: compressed code knowledge graphs for target projects (subgraph extraction, up to ~71× token reduction), `graphify:*` npm scripts, Fetch-stage auto-detection hooks, README sections in all languages.

### Fixed

- Unify **findskill** naming across this repository: remove mixed **`find-skills`** wording in `meta-scout` / `meta-artisan` (`.claude`, `.codex`, OpenClaw SOUL), all `dev-governance` mirrors, and `docs/zh-CN/agents`, so prompts match the installed skill directory.
- Install **planning-with-files** from `skills/planning-with-files/` (sparse/subdir copy) in `install-deps.sh`, `setup.mjs`, and `install-global-skills-all-runtimes.mjs` so `~/.claude/skills/planning-with-files/SKILL.md` exists and Claude Code can load the skill and its frontmatter hooks. Whole-repo clone left SKILL only nested, so the skill was invisible.
- Install **findskill** from `windows/` on Windows and `original/` elsewhere (`KimYx0207/findskill` keeps no top-level `SKILL.md`). Same three install entrypoints updated.

### Changed

- Extend `config/contracts/workflow-contract.json` again to formalize card governance: `cardPlanPacket`, `cardDecision`, `deliveryShell`, `silenceDecision`, `controlDecision`, `summaryPacket`, explicit dealer ownership, and run-artifact validation policy.
- Add `scripts/validate-run-artifact.mjs` plus run-artifact fixtures/tests so Meta_Kim now validates real packet chains instead of only schema presence.
- Sync `README.md`, `README.zh-CN.md`, `CLAUDE.md`, and `AGENTS.md` to the new card/dealer/silence/summary/run-validator model; these doc changes now map to concrete contract and script additions instead of standalone wording.
- Align `package.json` with the latest released changelog version and stop public-facing docs from treating internal narrative notes and `docs/repo-map.md` as required public entry points.
- Clarify in both README files that `docs/` is internal-only and remove any public requirement to read `docs/runtime-capability-matrix.md`.
- Harden `config/contracts/workflow-contract.json` from documentation-only governance toward runtime-checkable governance: add `taskClassification`, finding-level closure rules, explicit `writebackDecision`, and hard public-display gate semantics.
- Extend `scripts/validate-project.mjs` and `tests/meta-theory/07-contract-compliance.test.mjs` to enforce the new task-classification, finding-closure, evolution-decision, and runtime-parity requirements.
- Expand `docs/runtime-capability-matrix.md` with a behavior parity matrix covering trigger parity, hook parity, review parity, verification parity, stop condition parity, and writeback parity.
- Sync `README.md`, `README.zh-CN.md`, `CLAUDE.md`, and `AGENTS.md` to the hardened governance model so the public docs match the canonical runtime contract.
- Re-scope `eval:agents` into a lightweight no-LLM runtime smoke pass by default, and add `eval:agents:live` plus `verify:all:live` for explicit prompt-backed runtime acceptance.
- Harden `scripts/eval-meta-agents.mjs` with cross-platform process-tree cleanup, runtime filtering, and progress logging so interrupted or timed-out runtime checks do not leave orphaned child processes behind.
- Sync `README.md`, `README.zh-CN.md`, `CLAUDE.md`, and `AGENTS.md` to the new smoke-vs-live evaluation split so maintenance guidance matches the actual scripts.
- Rewrite `README.zh-CN.md` into a newcomer-friendly Chinese guide with clearer quick start, runtime roles, maintenance flow, and FAQ.
- Rewrite `README.md` with matching English onboarding, clearer canonical-vs-derived asset guidance, and a simpler command reference.
- Expand both README files to restore key Meta_Kim design concepts: 8-stage spine vs. business workflow, hidden state skeleton, public-display gates, rollback protocol, and Evolution storage.
- Restore the original Mermaid flowcharts in both README files: method chain, 8-stage spine, iron-rules relation, and system flow.
- Rework `AGENTS.md` into a Codex-specific guide that keeps the dispatch-before-execution rule but removes cross-runtime ambiguity.
- Rework `CLAUDE.md` into a clearer Claude Code guide centered on canonical sources, hooks, and the sub-agent dispatch execution rule.
- Expand `AGENTS.md` and `CLAUDE.md` to restore capability-first dispatch, workflow-contract layering, hidden skeleton, and display-gate discipline.
- Normalize explanations for `deps:install`, `discover:global`, `probe:clis`, `eval:agents`, and `verify:all`.
- Strengthen the canonical governance sources to make agent ownership explicit: only pure `Q / Query` may bypass agents, every executable task must have an owner, capability gaps now resolve through existing owner / Type B creation / temporary fallback owner.
- Add protocol-first dispatch requirements across the canonical sources: `runHeader`, `dispatchBoard`, `workerTaskPacket`, `workerResultPacket`, `reviewPacket`, `verificationPacket`, and `evolutionWritebackPacket`.
- Require explicit dependency / parallel-group / merge-owner planning so independent work must parallelize instead of drifting into unnecessary serial execution.
- Tighten Review and Evolution rules so protocol compliance and owner coverage are reviewed, and durable learnings must write back into agents, skills, or workflow contracts.
- Sync both README files to the stronger canonical rules: pure-query bypass only, owner-first execution, protocol-first dispatch, explicit parallel planning, and Evolution writeback to capability assets.
- Add a workflow relation map to both README files so the real project paths are easier to distinguish: pure-query bypass, simple owner-driven shortcut, Type C 8-stage spine, 10-step governance upgrade, meta 3-phase flow, and Type D review flow.
- Clarify the README concept layer in both languages: engineering is a governed domain of meta, but meta should orchestrate execution owners rather than pretending to be a single omnipotent engineer.
- Clarify the README architecture stance in both languages: Meta_Kim still keeps a chain-like spine, but now overlays it with hidden states, event controls, owner protocols, and parallel orchestration rather than remaining a pure linear flow.
- Move the “capability assets reduce repeated token cost over time” explanation into the early README sections in both languages so the long-term economic logic of the system is visible immediately.
- Harden the core method Mermaid diagram in both README files to use GitHub-friendly quoted labels, avoiding render failures around `Meta (元)` and other spaced node text.

## [1.2.1] - 2026-04-02

### Changed

- Restore the two root README files to a more complete project-facing shape instead of the earlier over-compressed onboarding rewrite.
- Re-center the Chinese README on the `元` concept, preserving the original branding, concept explanation, contact block, support links, payment QR codes, and Mermaid diagrams.
- Bring `README.md`, `README.zh-CN.md`, `AGENTS.md`, and `CLAUDE.md` back into alignment with the current project design rather than leaving them as lighter onboarding-only summaries.
- Make the canonical governance sources explicit in documentation: `canonical/` plus `config/contracts/workflow-contract.json`.

### Added

- Owner-first governance rules in the meta-theory references: only pure `Q / Query` may bypass agents; every executable task must have an explicit owner.
- Explicit capability-gap resolution ladder: existing owner -> Type B owner creation/composition -> temporary `generalPurpose` owner with required justification and Evolution follow-up.
- Protocol-first dispatch requirements: `runHeader`, `dispatchBoard`, `workerTaskPacket`, `workerResultPacket`, `reviewPacket`, `verificationPacket`, and `evolutionWritebackPacket`.
- Parallelism requirements in the canonical sources: independent work must declare `dependsOn`, `parallelGroup`, and `mergeOwner` instead of defaulting to unnecessary serial execution.
- Evolution writeback rules that require each run to evaluate whether the current owner should be kept, adjusted, created, or retired.

### Synced

- Synced the strengthened `meta-theory` skill and `dev-governance` reference into Codex mirrors, OpenClaw mirrors, shared skills, and workspace packs via `npm run meta:sync`.
- Synced the stronger owner-first / protocol-first / parallelism rules back into both public README files so outward-facing docs match the canonical project rules.

## [1.2.0] - 2026-03-28

### Changed

- Rename private `meta/` directory to `docs/` and update all path references across 15+ files.
- Sync `README.md`, `README.zh-CN.md`, `CLAUDE.md`, and `AGENTS.md` to the current project state.
- Remove stale `factory/` references from public documentation.
- Add `config/contracts/` to the repository trees documented in the README files.
- Fix duplicate step numbering in `README.zh-CN.md`.
- Remove hardcoded global capability counts from `CLAUDE.md`.
- Add `.claude/capability-index/` to `.gitignore`.
- Sanitize local Windows paths in `docs/runtime-capability-matrix.md`.

## [1.1.0] - 2026-03-27

### Added

- Agent versioning with a per-agent `version` field in YAML frontmatter.
- Improved CLI output UX for health reports and validation.

### Fixed

- Enforce single-source meta workflow validation.
- Enforce live agent registry checks in OpenClaw prompts.
- Harden meta runtime discovery and OpenClaw agent registry guidance.

## [1.0.0] - 2026-03-22

### Added

- Public open-source release surface.
- 8 flagship specialist meta-agent profiles (`meta-warden` through `meta-scout`).
- Cross-runtime sync tooling: `sync:runtimes`, `validate`, `eval:agents`.
- Global capability discovery via `discover:global`.
- OpenClaw workspace family with full `SOUL.md`, `BOOT.md`, and related files.
- Codex agent mirrors in `.codex/agents/*.toml`.
- Shared skill mirror layer in `shared-skills/`.
- Agent health report script at `scripts/agent-health-report.mjs`.
- MIT license.

### Changed

- Collapse release docs into the root README files.
- Streamline foundry outputs for the open-source release.
- Finalize the initial public release surface.

## [0.5.0] - 2026-03-21

### Added

- Cross-runtime coverage audit in `docs/runtime-coverage-audit.md`.
- Runtime capability matrix in `docs/runtime-capability-matrix.md`.
- Repository map in `docs/repo-map.md`.
- Portable runtime packs for Claude Code, OpenClaw, and Codex.
- OpenClaw bootstrap and local auth assets.
- Runtime evaluation scripts.
- Chinese translations for runtime guides.
- Paper reference and DOI: `10.5281/zenodo.18957649`.

### Fixed

- Bootstrap OpenClaw local auth for meta agents.
- Harden cross-runtime agent and skill portability.

## [0.1.0] - 2026-03-17

### Added

- Initial project structure as a Claude Code project.
- Convert skills to agents and merge SPEC content into agent definitions.
- Baseline snapshot of the Meta_Kim architecture.
