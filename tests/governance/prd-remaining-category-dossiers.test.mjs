import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("PRD remaining category dossier validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prd-remaining-category-dossiers.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  if (result.stdout.trim().startsWith("{")) {
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "pass");
    assert.equal(summary.validationStatus, "private_evidence_not_attached");
    assert.equal(summary.requiredForPublicValidation, false);
  } else {
    assert.match(result.stdout, /P-096, P-097, P-098, P-099, P-100 dossier_ready/);
  }
});
