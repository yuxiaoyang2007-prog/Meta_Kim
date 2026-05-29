import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("route selector emits complete route or gap", () => {
  spawnSync(process.execPath, ["scripts/build-capability-inventory.mjs"], { encoding: "utf8" });
  spawnSync(process.execPath, ["scripts/discover-dependency-capabilities.mjs"], { encoding: "utf8" });
  const result = spawnSync(process.execPath, ["scripts/select-execution-route.mjs", "--task", "fuzzy product monetization task", "--runtime", "codex", "--os", "windows", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert(output.recommendedRoute || output.capabilityGapPacket);
  if (output.recommendedRoute?.score >= 85) {
    for (const field of ["owner", "weapon", "runtime", "os", "verificationOwner", "verificationMethod"]) assert(output.recommendedRoute[field], field);
  }
});
