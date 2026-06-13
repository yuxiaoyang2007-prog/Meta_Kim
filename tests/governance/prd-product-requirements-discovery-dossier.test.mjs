import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("PRD product requirements discovery dossier validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prd-product-requirements-discovery-dossier.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /P-095 dossier_ready/);
});
