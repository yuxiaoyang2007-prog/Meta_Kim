import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("each governance action has trigger/action/owner/weapon/result/correct/wrong/done", async () => {
  const map = await readJson("config/governance/trigger-action-map.json");
  for (const action of map.actions) {
    for (const field of ["triggerCondition", "governanceOwner", "executionAction", "requiredWeapons", "outputPacket", "correctIf", "wrongIf", "doneIf"]) {
      assert.ok(action[field], `${action.id} missing ${field}`);
    }
  }
});
