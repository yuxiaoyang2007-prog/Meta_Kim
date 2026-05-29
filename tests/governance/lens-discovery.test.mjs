import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("lens seeds are fallback data and selector returns 3-7 impactful lenses", async () => {
  const catalog = await readJson("config/governance/lens-seed-catalog.json");
  assert.ok(catalog.seeds.length >= 30);
  assert.equal(catalog.seedOnlyDefault, true);

  const result = spawnSync(process.execPath, [
    "scripts/select-lenses.mjs",
    "--taskShape",
    "strategy_product_decision",
    "--realIntent",
    "choose product monetization path",
    "--json"
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.ok(output.selectedLenses.length >= 3);
  assert.ok(output.selectedLenses.length <= 7);
  for (const lens of output.selectedLenses) {
    assert.ok(lens.outputImpact.length, `${lens.id} missing outputImpact`);
  }
  assert.ok(output.omittedLenses.length > 0);
});
