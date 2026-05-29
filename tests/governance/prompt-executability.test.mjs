import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("prompt executability validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prompt-executability.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
