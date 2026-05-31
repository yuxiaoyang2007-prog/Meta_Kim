import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("decision patterns include risk-to-skill binding for PR and issue triage", async () => {
  const catalog = await readJson("config/governance/decision-pattern-catalog.json");
  const pattern = catalog.stagePatterns.find((item) => item.id === "thinking-risk-skill-binding");

  assert.ok(pattern, "missing thinking-risk-skill-binding pattern");
  for (const output of ["riskType", "primarySkill", "secondarySkill", "failureCostTieBreak", "nextExecutableGate"]) {
    assert.ok(pattern.outputs.includes(output), `${output} is not recorded`);
  }
  assert.ok(pattern.decisionRules.some((rule) => rule.includes("runtime/setup/install/sync")));
  assert.ok(pattern.decisionRules.some((rule) => rule.includes("hook, dispatch, state, validator")));
  assert.ok(pattern.rejects.some((item) => item.includes("four skills treated as equal priority")));
});

test("decision patterns require adversarial cross-validation before public closure", async () => {
  const catalog = await readJson("config/governance/decision-pattern-catalog.json");
  const pattern = catalog.stagePatterns.find((item) => item.id === "review-adversarial-cross-validation");

  assert.ok(pattern, "missing review-adversarial-cross-validation pattern");
  for (const output of ["evidenceSnapshotAt", "sourceStateMatrix", "counterEvidence", "contradictionLog", "falsificationChecks", "replayCommands"]) {
    assert.ok(pattern.outputs.includes(output), `${output} is not recorded`);
  }
  assert.ok(pattern.minimumChecks.some((check) => check.includes("current-state recheck")));
  assert.ok(pattern.minimumChecks.some((check) => check.includes("counterevidence")));
  assert.ok(pattern.rejects.some((item) => item.includes("stale open PR state")));
  assert.match(pattern.verification, /independent reviewer/i);
  assert.match(pattern.verification, /replay/i);
});

test("meta-theory exposes a decision cross-validation gate", () => {
  const text = readFileSync("canonical/skills/meta-theory/SKILL.md", "utf8");

  assert.match(text, /## Decision Cross-Validation Gate/);
  for (const term of ["evidence snapshot time", "source state matrix", "counterevidence", "contradiction log", "falsification checks", "replay commands"]) {
    assert.match(text, new RegExp(term, "i"), `${term} missing from meta-theory gate`);
  }
  assert.match(text, /runtime\/setup\/install\/sync changes bind to cross-runtime contract design/);
  assert.match(text, /hook\/dispatch\/state\/validator changes bind to state-machine failure modeling/);
});
