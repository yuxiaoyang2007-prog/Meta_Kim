import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("foundational capability preservation validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-foundational-capabilities.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("foundational provider requirement uses meta-skill-creator", () => {
  const source = readFileSync("scripts/validate-foundational-capabilities.mjs", "utf8");
  const requiredSkillsBlock = source.match(/const REQUIRED_SKILLS = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.match(requiredSkillsBlock, /"meta-skill-creator"/);
  assert.doesNotMatch(requiredSkillsBlock, /"skill-creator"/);
});
