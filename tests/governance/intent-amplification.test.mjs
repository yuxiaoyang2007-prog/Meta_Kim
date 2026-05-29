import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("intent acceptance blocks public-ready without score, path, and first action signals", async () => {
  const contract = await readJson("config/governance/intent-amplification-contract.json");
  assert.ok(contract.pathCandidates.length >= 2);
  assert.ok(contract.publicReadyRequires.includes("intentAmplificationScore>=90"));
  assert.ok(contract.publicReadyRequires.includes("verificationEvidence"));
  assert.ok(Object.hasOwn(contract.firstAction, "passSignal"));
  assert.ok(Object.hasOwn(contract.firstAction, "killSignal"));
  assert.equal(contract.userGoalDone, false);
  assert.ok(contract.scoreBands.some((band) => band.max === 89 && /not_public_ready/.test(band.status)));
});
