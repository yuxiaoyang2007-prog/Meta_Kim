import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("foundational capability preservation validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-foundational-capabilities.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
