import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("strict run artifact fixture validates userGoalDone separately from command pass", () => {
  const result = spawnSync(process.execPath, [
    "scripts/validate-intent-amplification.mjs",
    "--strict",
    "--input",
    "tests/fixtures/run-artifacts/valid-strict-governance-run.json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
