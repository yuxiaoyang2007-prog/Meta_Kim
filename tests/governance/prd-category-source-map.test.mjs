import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("PRD major-category source map validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-prd-category-source-map.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PRD category source map valid/);
});
