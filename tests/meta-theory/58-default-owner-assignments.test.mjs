import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const doc = readFileSync(
  resolve(repoRoot, "canonical/skills/meta-theory/references/dev-governance.md"),
  "utf8",
);
const contract = JSON.parse(readFileSync(
  resolve(repoRoot, "config/contracts/core-loop-contract.json"),
  "utf8",
));

test("58 — every stage has one contract-owned merge authority", () => {
  for (const stage of contract.stages) {
    assert.ok(stage.parallelPolicy?.mergeAuthority, `${stage.stage} needs a merge authority`);
    assert.equal(stage.parallelPolicy.nextStageRequiresMerge, true);
  }
});

test("58 — human guidance names all stages and their unique authorities", () => {
  const section = doc.split("## Ordered Stage Barriers And Maximal Safe Internal Parallelism")[1]
    ?.split("### Adaptive capability discovery inside Fetch")[0] ?? "";
  for (const stage of contract.stages) {
    assert.match(section, new RegExp(`\\| ${stage.stage.replace("-", "-")} \\|`, "u"));
  }
  assert.match(section, /Unique stage authority/iu);
});

test("58 — discovered professional owners remain required", () => {
  assert.match(doc, /general-purpose.*not a silent fallback/iu);
  assert.match(doc, /Selected owners must come from discoverable evidence/iu);
});

test("58 — no fixed-wave or whole-stage strict-serial authority remains", () => {
  assert.doesNotMatch(doc, /^###\s+Wave\s+[1-4]/mu);
  assert.doesNotMatch(doc, /^###\s+Stage\s+0/mu);
  assert.doesNotMatch(doc, /remain strict-serial|严格串行/iu);
});
