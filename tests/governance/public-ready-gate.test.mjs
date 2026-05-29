import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("strict intent validator blocks public-ready without evidence", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meta-kim-public-"));
  const file = path.join(dir, "run.json");
  writeFileSync(file, JSON.stringify({
    realIntent: "ship governance upgrade",
    subject: "Meta_Kim",
    currentState: "partial",
    targetState: "verified",
    successCriteria: ["verified"],
    evidence: { confirmed: [], userProvided: [], inference: [], unconfirmed: [] },
    pathCandidates: [{ id: "a", score: 90 }, { id: "b", score: 70 }],
    selectedPath: "a",
    whyThisPath: "higher score",
    firstAction: { actor: "test", input: "x", action: "y", output: "z", passSignal: "pass", killSignal: "kill", timebox: "1m" },
    doneCondition: "verify by command",
    intentAmplificationScore: 95,
    publicReadyScore: 95,
    userGoalDone: true,
    publicReady: true,
    writebackDecision: "writeback",
    routeScore: 90,
    verificationEvidence: []
  }));
  const result = spawnSync(process.execPath, ["scripts/validate-intent-amplification.mjs", "--strict", "--input", file], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  rmSync(dir, { recursive: true, force: true });
});
