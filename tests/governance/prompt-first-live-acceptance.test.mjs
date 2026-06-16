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
const liveContractPath = path.join(
  repoRoot,
  "config",
  "contracts",
  "prompt-first-live-acceptance-contract.json",
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

  for (const runtime of ["claude_code", "codex"]) {
    const payload = artifact.runtimeResults[runtime];
    assert.equal(payload.reviewPacket.depthStrategy.evidenceQualityChecked, true);
    assert.equal(payload.reviewPacket.depthStrategy.counterEvidenceChecked, true);
    assert.equal(payload.reviewPacket.depthStrategy.decisionImpactChecked, true);
    assert.equal(payload.reviewPacket.depthStrategy.falsificationChecked, true);
    assert.deepEqual(payload.reviewPacket.depthStrategy.upstreamStageTrace, [
      "critical",
      "fetch",
      "thinking",
      "execution",
    ]);
    assert.equal(payload.metaReviewPacket.reviewDepthAudit.shallowPacketPassRejected, true);
    assert.equal(payload.metaReviewPacket.reviewDepthAudit.adversarialCoverageChecked, true);
    assert.equal(payload.evolutionWritebackPacket.strategy.reusablePatternAssessed, true);
    assert.equal(payload.evolutionWritebackPacket.strategy.writebackTargetAssessed, true);
    assert.equal(payload.evolutionWritebackPacket.strategy.scarNeedAssessed, true);
    assert.equal(
      payload.evolutionWritebackPacket.strategy.nextRunReuseKey,
      "prompt-first-live-depth-gate",
    );
  }
});

test("prompt-first live normalization does not synthesize Review Meta-Review or Evolution pass packets", () => {
  const stdout = execFileSync(
    process.execPath,
    [scriptPath, "--self-test-strict-live-normalization"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.match(stdout, /strict live normalization self-test passed/);
});

test("prompt-first live contract requires deep Review Meta-Review and Evolution strategy", () => {
  const contract = JSON.parse(fs.readFileSync(liveContractPath, "utf8"));
  assert.ok(contract.depthQuality, "live acceptance contract must define depthQuality");
  assert.deepEqual(contract.depthQuality.reviewPacket.requiredUpstreamStageTrace, [
    "critical",
    "fetch",
    "thinking",
    "execution",
  ]);
  for (const field of [
    "evidenceQualityChecked",
    "counterEvidenceChecked",
    "decisionImpactChecked",
    "falsificationChecked",
  ]) {
    assert.ok(contract.depthQuality.reviewPacket.requiredDepthStrategyFields.includes(field));
  }
  for (const field of [
    "shallowPacketPassRejected",
    "adversarialCoverageChecked",
    "reviewBlindSpotChecked",
    "publicReadyEvidenceSeparated",
  ]) {
    assert.ok(contract.depthQuality.metaReviewPacket.requiredReviewDepthAuditFields.includes(field));
  }
  assert.ok(
    contract.depthQuality.evolutionWritebackPacket.requiredStrategyFields.includes(
      "nextRunReuseKey",
    ),
  );
});
