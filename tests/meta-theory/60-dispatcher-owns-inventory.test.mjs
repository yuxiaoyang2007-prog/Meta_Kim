import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const skill = readFileSync(
  resolve(repoRoot, "canonical/skills/meta-theory/SKILL.md"),
  "utf8",
);
const devGovernance = readFileSync(
  resolve(
    repoRoot,
    "canonical/skills/meta-theory/references/dev-governance.md",
  ),
  "utf8",
);

test("60 — SKILL.md names the dispatcher as the single owner of capabilityInventory", () => {
  // Main-flow step, not a hook.
  assert.match(
    skill,
    /dispatcher[\s\S]{0,200}capabilityInventory/,
    "SKILL.md must say the dispatcher writes the capabilityInventory",
  );
  assert.match(
    skill,
    /main-flow step, not a hook/,
    "SKILL.md must explicitly mark this as a main-flow step, not a hook",
  );
});

test("60 — hook count under .claude/hooks/ is unchanged from baseline (no new fuses added)", () => {
  // Baseline: this session added ZERO new hooks. Test guards the invariant.
  const hooksDir = resolve(repoRoot, "canonical/runtime-assets/claude/hooks");
  const hooks = readdirSync(hooksDir).filter((f) => f.endsWith(".mjs"));
  // The exact list of hook files in canonical/runtime-assets/claude/hooks/ as
  // of HEAD=fd0a596c (this session adds ZERO new hook files; this list is
  // the baseline snapshot).
  const expected = [
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "block-dangerous-bash.mjs",
    "ecc-permission-cache-wrapper.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "meta-kim-memory-save.mjs",
    "post-console-log-warn.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "stop-compaction.mjs",
    "stop-completion-guard.mjs",
    "stop-console-log-audit.mjs",
    "stop-memory-save.mjs",
    "stop-save-progress.mjs",
    "stop-spine-cleanup.mjs",
    "subagent-context.mjs",
    "utils.mjs",
  ];
  for (const f of expected) {
    assert.ok(
      hooks.includes(f),
      `expected hook present: ${f}`,
    );
  }
  // Guard against accidental new-hook drift in the same session.
  assert.ok(
    hooks.length === expected.length,
    `hook count drifted: actual=${hooks.length} expected=${expected.length}; ` +
      `actual=[${hooks.join(", ")}]`,
  );
});
