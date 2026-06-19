import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("prompt executability validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prompt-executability.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt abstract capability validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prompt-abstract-capabilities.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "pass");
  assert.ok(output.promptLikeAssetsChecked > 0);
  assert.ok(
    output.privateEvidence.every(
      (item) =>
        item.status === "private_evidence_validated" ||
        (item.status === "private_evidence_not_attached" &&
          item.requiredForPublicValidation === false),
    ),
  );
});
