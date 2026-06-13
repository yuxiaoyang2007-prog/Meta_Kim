import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("PRD remaining category dossier validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prd-remaining-category-dossiers.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /P-096, P-097, P-098, P-099, P-100 dossier_ready/);
});
