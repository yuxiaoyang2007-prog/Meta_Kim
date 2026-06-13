import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("public docs image assets are available without exposing private docs", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-public-doc-assets.mjs"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /public docs image assets valid/);
});
