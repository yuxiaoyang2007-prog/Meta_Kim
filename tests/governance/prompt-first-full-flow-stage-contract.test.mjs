import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("prompt-first full-flow stage contract validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prompt-first-full-flow-stage-contract.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  if (result.stdout.trim().startsWith("{")) {
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "pass");
    assert.equal(summary.validationStatus, "private_evidence_not_attached");
    assert.equal(summary.requiredForPublicValidation, false);
  } else {
    assert.match(result.stdout, /prompt-first full-flow stage contract valid: 9 stages/);
  }
});
