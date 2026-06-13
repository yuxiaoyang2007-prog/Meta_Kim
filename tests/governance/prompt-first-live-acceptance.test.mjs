import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "run-prompt-first-full-flow-live-acceptance.mjs",
);
const artifactPath = path.join(
  repoRoot,
  ".meta-kim",
  "state",
  "default",
  "prompt-first-full-flow-live-acceptance",
  "latest.fixture.json",
);

test("prompt-first live acceptance fixture validates without claiming live pass", () => {
  const stdout = execFileSync(
    process.execPath,
    [scriptPath, "--fixture"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.match(stdout, /prompt-first full-flow fixture acceptance valid/);
  assert.match(stdout, /P-087=fixture_pass_not_live/);
  assert.match(stdout, /P-088=fixture_pass_not_live/);
  assert.match(stdout, /compatibilitySmoke=openclaw:passed,cursor:passed/);
  assert.match(stdout, /latest\.fixture\.json/);

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(artifact.mode, "fixture");
  assert.deepEqual(artifact.compatibilitySmokeRuntimes, ["openclaw", "cursor"]);
  assert.equal(artifact.compatibilitySmokeResults.openclaw.evidenceKind, "compatibility_smoke_pass");
  assert.equal(artifact.compatibilitySmokeResults.cursor.evidenceKind, "compatibility_smoke_pass");
  assert.equal(artifact.compatibilitySmokePacket.status, "pass");
  assert.equal(artifact.compatibilitySmokePacket.primaryLiveClaimAllowed, false);
  assert.equal(artifact.summary.fixtureModeCannotClaimLivePass, true);
  assert.equal(artifact.summary.primaryRuntimePerfection, false);
  assert.equal(artifact.prdTaskStatuses["P-089"], "pass");
  assert.equal(artifact.prdTaskStatuses["P-090"], "pass");
  assert.equal(artifact.prdTaskStatuses["P-091"], "pass");
});
