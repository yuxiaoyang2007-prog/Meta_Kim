import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("dependency compatibility validator passes", () => {
  spawnSync(process.execPath, ["scripts/discover-dependency-capabilities.mjs"], { encoding: "utf8" });
  const result = spawnSync(process.execPath, ["scripts/validate-dependency-compatibility.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
