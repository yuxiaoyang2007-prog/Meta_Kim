import test from "node:test";
import assert from "node:assert/strict";
import policy from "../../config/governance/hook-progression-policy.json" with { type: "json" };

test("warning policy requires all public-ready warning classes", () => {
  for (const warningClass of ["BLOCKING_WARNING", "FIXABLE_WARNING", "ENVIRONMENT_WARNING", "EXPECTED_WARNING", "DEPRECATED_WARNING", "NOISE_WARNING"]) {
    assert(policy.warningClasses.includes(warningClass), warningClass);
  }
  assert.equal(policy.warningClassificationRequired, true);
  assert(policy.publicReadyGate.blocksWhen.includes("hookWarningUnclassified"));
});
