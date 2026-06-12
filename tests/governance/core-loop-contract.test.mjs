import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CORE_LOOP = JSON.parse(readFileSync("config/contracts/core-loop-contract.json", "utf8"));

const EXPECTED_STAGES = [
  "Critical",
  "Fetch",
  "Thinking",
  "Execution",
  "Review",
  "Meta-Review",
  "Verification",
  "Evolution",
];

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

test("core-loop contract binds the default governed execution path", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(CORE_LOOP.contractId, "meta-kim-core-loop-contract");
  assert.equal(CORE_LOOP.defaultEntry.contractIsDefaultPath, true);
  assert.equal(
    CORE_LOOP.defaultEntry.entryScript,
    "scripts/run-meta-theory-governed-execution.mjs",
  );
  assert.equal(CORE_LOOP.defaultEntry.packageScript, "meta:theory:run");
  assert.equal(
    packageJson.scripts["meta:theory:run"],
    "node scripts/run-meta-theory-governed-execution.mjs",
  );
  assert.deepEqual(
    CORE_LOOP.stages.map((stage) => stage.stage),
    EXPECTED_STAGES,
  );
});

test("core-loop stages have IO, skip, gate, and blocking policy", () => {
  for (const stage of CORE_LOOP.stages) {
    for (const field of [
      "requiredInputs",
      "requiredOutputs",
      "skipConditions",
      "gateConditions",
      "blockingGates",
      "warningGates",
      "defaultOwner",
    ]) {
      assert.ok(Object.hasOwn(stage, field), `${stage.stage} missing ${field}`);
    }
    assert.ok(stage.requiredInputs.length > 0, `${stage.stage} needs inputs`);
    assert.ok(stage.requiredOutputs.length > 0, `${stage.stage} needs outputs`);
    assert.ok(stage.skipConditions.length > 0, `${stage.stage} needs skip conditions`);
    assert.ok(stage.gateConditions.length > 0, `${stage.stage} needs gate conditions`);
  }

  const byStage = Object.fromEntries(CORE_LOOP.stages.map((stage) => [stage.stage, stage]));
  assert.ok(byStage.Critical.requiredOutputs.includes("intentPacket.realIntent"));
  assert.ok(byStage.Critical.requiredOutputs.includes("intentPacket.noQuotaClarification"));
  assert.ok(byStage.Fetch.requiredOutputs.includes("fetchPacket.capabilityDiscovery.searchLog"));
  assert.ok(byStage.Fetch.requiredOutputs.includes("fetchPacket.capabilityDiscovery.capabilityInventory"));
  assert.ok(byStage.Thinking.requiredOutputs.includes("thinkingPacket.workerTaskPackets"));
  assert.ok(byStage.Thinking.requiredOutputs.includes("thinkingPacket.verificationOwner"));
  assert.ok(byStage.Review.requiredOutputs.includes("reviewPacket.upstreamQuality"));
  assert.ok(byStage["Meta-Review"].requiredOutputs.includes("metaReviewPacket.publicReadyGateCheck"));
  assert.ok(byStage.Verification.blockingGates.includes("public_ready_without_verification"));
  assert.ok(byStage.Evolution.requiredOutputs.includes("evolutionWritebackPacket.noneWithReason"));
});

test("capability discovery is multi-type and verification is a fuse", () => {
  for (const source of [
    "canonical/agents",
    "runtime agent mirrors",
    "Codex custom agents",
    "Claude Code agents",
    "Cursor agents and rules",
    "OpenClaw workspaces, skills, and config",
    "repo skills",
    "user/admin/system skills when discoverable",
    "tools, scripts, and package commands",
    "MCP servers and config",
    "hooks",
    "runtime capability matrix",
    "OS compatibility matrix",
    "config/capability-index",
    "global capability inventory",
    "Graphify/project map",
    "previous run state and learned evolution records",
  ]) {
    assert.ok(
      CORE_LOOP.capabilityDiscovery.minimumSources.includes(source),
      `missing source ${source}`,
    );
  }

  for (const field of [
    "id",
    "providerType",
    "sourcePath",
    "runtimeSupport",
    "riskLevel",
    "ownerBoundary",
    "canExecute",
    "canReview",
    "canVerify",
    "canCreateOrUpgrade",
    "missingDependencies",
    "confidence",
    "reason",
  ]) {
    assert.ok(
      CORE_LOOP.capabilityDiscovery.inventoryRecordRequiredFields.includes(field),
      `missing inventory field ${field}`,
    );
  }

  assert.equal(CORE_LOOP.verificationPolicy.notEveryStepInterceptor, true);
  assert.equal(CORE_LOOP.verificationPolicy.hooksAreLastResortFuse, true);
  assert.equal(CORE_LOOP.publicReadyClaim.requiresVerificationEvidence, true);
  assert.ok(CORE_LOOP.publicReadyClaim.blocksOn.includes("runtime smoke mislabeled as live"));
});

test("governed execution emits a coreLoop artifact summary", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-meta-theory-governed-execution.mjs",
      "--task",
      "需要一个稳定的脚本整理 release summary JSON，不需要新长期 agent。",
      "--run-id",
      "core-loop-contract-test",
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const artifact = JSON.parse(
    readFileSync(".meta-kim/state/default/governed-executions/core-loop-contract-test.json", "utf8"),
  );
  assert.equal(artifact.coreLoop.contractRef, "config/contracts/core-loop-contract.json");
  assert.deepEqual(artifact.coreLoop.spine, EXPECTED_STAGES);
  for (const packetName of [
    "requestRecord",
    "intentPacket",
    "fetchPacket",
    "capabilityInventory",
    "thinkingPacket",
    "dispatchBoard",
    "workerTaskPackets",
    "executionResult",
    "reviewPacket",
    "metaReviewPacket",
    "verificationResult",
    "evolutionWritebackDecision",
    "evolutionWritebackPacket",
    "dynamicWorkflowDecisionRecord",
    "publicReadyDecision",
  ]) {
    assert.notEqual(artifact[packetName], undefined, `top-level ${packetName} must exist`);
  }
  for (const stage of CORE_LOOP.stages) {
    for (const outputPath of stage.requiredOutputs) {
      assert.notEqual(
        getPath(artifact.coreLoop, outputPath),
        undefined,
        `${stage.stage} required output ${outputPath} must exist in coreLoop artifact`,
      );
    }
  }
  assert.ok(artifact.coreLoop.intentPacket.realIntent);
  assert.ok(artifact.coreLoop.fetchPacket.capabilityDiscovery.capabilityInventory.length > 250);
  const providerTypes = new Set(
    artifact.coreLoop.fetchPacket.capabilityDiscovery.capabilityInventory.map(
      (record) => record.providerType,
    ),
  );
  for (const providerType of [
    "agent",
    "skill",
    "script",
    "tool",
    "MCP",
    "hook",
    "runtime",
    "OS",
    "memory",
    "graph",
    "external",
  ]) {
    assert.ok(providerTypes.has(providerType), `coreLoop inventory missing ${providerType}`);
  }
  for (const field of CORE_LOOP.capabilityDiscovery.inventoryRecordRequiredFields) {
    assert.ok(
      Object.hasOwn(artifact.coreLoop.capabilityInventory[0], field),
      `capability record missing ${field}`,
    );
  }
  assert.ok(
    artifact.coreLoop.capabilityGapPacket || artifact.coreLoop.capabilityReady,
    "coreLoop must record either capabilityGapPacket or capabilityReady",
  );
  if (artifact.coreLoop.capabilityGapPacket) {
    assert.ok(artifact.coreLoop.capabilityGapPacket.decisionOptions.length >= 5);
  } else {
    for (const field of ["owner", "weapon", "reviewOwner", "metaReviewOwner", "verificationOwner"]) {
      assert.ok(artifact.coreLoop.capabilityReady[field], `capabilityReady missing ${field}`);
    }
  }
  const dynamicCards = new Set(
    artifact.coreLoop.dynamicWorkflowDecisionRecord.cards.map((card) => card.label),
  );
  for (const label of [
    "Clarify",
    "Shrink scope",
    "Options",
    "Execute",
    "Verify",
    "Fix",
    "Rollback",
    "Risk",
    "Nudge",
    "Pause",
  ]) {
    assert.ok(dynamicCards.has(label), `dynamic workflow missing ${label}`);
  }
  assert.ok(artifact.coreLoop.thinkingPacket.workerTaskPackets.length > 0);
  assert.equal(artifact.coreLoop.executionResult.mainThreadRole, "scope_delegate_review_synthesize");
  assert.equal(artifact.coreLoop.executionResult.actualWorkerExecution, true);
  assert.ok(artifact.coreLoop.executionResult.workerExecutionEvidence.length > 0);
  assert.ok(
    artifact.coreLoop.executionResult.workerExecutionEvidence.every(
      (item) => item.externalAgentSpawned === false,
    ),
  );
  assert.ok(
    artifact.coreLoop.executionResult.workerExecutionEvidence.some(
      (item) => item.liveWorkerExecution === true,
    ),
  );
  assert.equal(artifact.coreLoop.executionResult.mergeResult.liveExecutionMerged, true);
  assert.equal(artifact.coreLoop.reviewPacket.upstreamQuality.critical, true);
  assert.equal(artifact.coreLoop.reviewPacket.protocolCompliance.executionEvidenceLayerIsHonest, true);
  assert.equal(artifact.coreLoop.metaReviewPacket.reviewStandardChecked, true);
  assert.match(artifact.coreLoop.metaReviewPacket.biasCheck.overclaimCheck, /blocked|pass/);
  assert.equal(artifact.coreLoop.verificationResult.notEveryStepInterceptor, true);
  assert.ok(artifact.coreLoop.verificationResult.remainingRisk.length > 0);
  assert.ok(["writeback", "candidate-writeback", "none-with-reason"].includes(
    artifact.coreLoop.evolutionWritebackDecision.decision,
  ));
  assert.ok(Array.isArray(artifact.coreLoop.evolutionWritebackPacket.writebacks));
  assert.ok(artifact.coreLoop.scarPacket.preventionRule);
  assert.equal(artifact.coreLoop.publicReadyDecision.publicReady, false);
  assert.ok(artifact.coreLoop.publicReadyDecision.blockedBy.length > 0);
});

test("core-loop release strict fixture validates with workflow run validator", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/validate-run-artifact.mjs",
      "tests/fixtures/run-artifacts/valid-core-loop-release-run.json",
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.ok(output.validatedPackets.includes("workerTaskPacket"));
  assert.ok(output.validatedPackets.includes("evolutionWritebackPacket"));
});
