import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("weapons have support, trigger, risk, verification, and owners", async () => {
  const registry = await readJson("config/capability-index/weapon-registry.json");
  for (const weapon of registry.weapons) {
    for (const field of ["runtimeSupport", "osSupport", "howToTrigger", "risk", "verification"]) {
      assert.ok(weapon[field], `${weapon.id} missing ${field}`);
    }
    assert.ok(weapon.ownerCandidates?.length, `${weapon.id} has no owner`);
    if (weapon.risk.canMutateFiles || weapon.risk.canExecuteShell) {
      assert.ok(weapon.verification.command || weapon.verification.artifact, `${weapon.id} execution weapon has no verification`);
    }
  }
  assert.ok(registry.weapons.some((weapon) => weapon.id === "meta-kim-decision-patterns"));
});
