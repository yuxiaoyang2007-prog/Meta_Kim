#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runMetaTheoryGovernedExecution } from "./run-meta-theory-governed-execution.mjs";

const MULTI_CAPABILITY_TASK = [
  "同一套 PRD review standard 需要 skill。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。"
].join("\n");

const REQUIRED_GOVERNANCE_AGENTS = [
  "meta-warden",
  "meta-conductor",
  "meta-scout",
  "meta-artisan",
  "meta-sentinel",
  "meta-librarian",
  "meta-prism",
  "meta-genesis",
  "meta-chrysalis"
];

const FORBIDDEN_EXECUTION_EVIDENCE_KINDS = new Set([
  "smoke",
  "projection_smoke",
  "config_only",
  "schema_only",
  "board_only"
]);

function assertPacketArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length > 0, `${label} must not be empty`);
}

function validateGovernanceEvidence(report) {
  assertPacketArray(report.coreLoop.governanceAgentResultPackets, "coreLoop.governanceAgentResultPackets");
  assert.deepEqual(
    report.defaultRuntimePath.governanceAgentResultPackets.map((packet) => packet.packetId),
    report.coreLoop.governanceAgentResultPackets.map((packet) => packet.packetId),
    "defaultRuntimePath must expose the same governance packets as coreLoop"
  );

  const packetsByAgent = new Map(
    report.coreLoop.governanceAgentResultPackets.map((packet) => [packet.agent, packet])
  );
  for (const agent of REQUIRED_GOVERNANCE_AGENTS) {
    assert.ok(packetsByAgent.has(agent), `missing governance result packet for ${agent}`);
  }

  for (const packet of report.coreLoop.governanceAgentResultPackets) {
    assert.ok(packet.packetId, `${packet.agent} missing packetId`);
    assert.ok(packet.stage, `${packet.agent} missing stage`);
    assert.ok(packet.resultKind, `${packet.agent} missing resultKind`);
    assert.ok(packet.artifactRef, `${packet.agent} missing artifactRef`);
    assert.ok(packet.resultSummary, `${packet.agent} missing resultSummary`);
    assert.equal(packet.nativeRuntimeAgent, false, `${packet.agent} must not overclaim native runtime agent execution`);
    assert.equal(packet.externalAgentSpawned, false, `${packet.agent} must not overclaim external agent spawn`);
  }

  assert.equal(report.coreLoop.conductorConsumptionEvidence.status, "pass");
  assert.equal(report.defaultRuntimePath.conductorConsumptionEvidence.status, "pass");
  assert.ok(
    report.coreLoop.conductorConsumptionEvidence.consumedPacketRefs.length >= 5,
    "Conductor must consume multiple real governance packets before board synthesis"
  );
  assert.equal(
    report.coreLoop.executionResult.mergeResult.governanceResultsConsumed,
    true
  );
  assert.ok(
    report.coreLoop.thinkingPacket.governanceInputsConsumed.length >= 5,
    "Thinking must record consumed governance inputs"
  );
}

function validateWorkerExecutionEvidence(report) {
  assertPacketArray(report.coreLoop.executionResult.workerResultPackets, "workerResultPackets");
  assertPacketArray(report.coreLoop.executionResult.workerExecutionEvidence, "workerExecutionEvidence");
  assert.deepEqual(
    report.defaultRuntimePath.workerResultPackets.map((packet) => packet.taskPacketId),
    report.coreLoop.executionResult.workerResultPackets.map((packet) => packet.taskPacketId),
    "defaultRuntimePath must expose worker result packets"
  );
  assert.equal(
    report.coreLoop.executionResult.workerResultPackets.length,
    report.coreLoop.thinkingPacket.workerTaskPackets.length,
    "every worker task must have a worker result packet"
  );
  assert.equal(report.coreLoop.executionResult.actualWorkerExecution, true);
  assert.equal(report.coreLoop.executionResult.mergeResult.liveExecutionMerged, true);

  const taskById = new Map(
    report.coreLoop.thinkingPacket.workerTaskPackets.map((packet) => [packet.taskPacketId, packet])
  );
  for (const [index, resultPacket] of report.coreLoop.executionResult.workerResultPackets.entries()) {
    const taskPacket = taskById.get(resultPacket.taskPacketId);
    assert.ok(taskPacket, `worker result ${resultPacket.taskPacketId} must match a task packet`);
    assert.equal(resultPacket.status, "executed");
    assert.equal(resultPacket.evidenceKind, "local_worker_execution");
    assert.equal(resultPacket.output.externalWritePerformed, false);
    assertPacketArray(
      resultPacket.workerExecutionEvidence,
      `workerResultPackets[${index}].workerExecutionEvidence`
    );
    assert.equal(
      resultPacket.workerExecutionEvidence.length,
      taskPacket.verifySteps.length,
      "nested worker evidence must cover every verify step exactly once"
    );
    for (const evidence of resultPacket.workerExecutionEvidence) {
      assert.equal(evidence.status, "verified");
      assert.equal(evidence.exitCode, 0);
      assert.ok(evidence.commandRanAt);
      assert.ok(taskPacket.verifySteps.some((step) => step.id === evidence.verifyStepRef));
      assert.ok(
        !FORBIDDEN_EXECUTION_EVIDENCE_KINDS.has(evidence.evidenceKind),
        `worker evidence kind ${evidence.evidenceKind} is not execution evidence`
      );
    }
  }

  assert.equal(report.coreLoop.reviewPacket.protocolCompliance.workerTaskPacketsPresent, true);
  assert.equal(report.coreLoop.reviewPacket.protocolCompliance.governanceAgentResultPacketsPresent, true);
  assert.equal(report.coreLoop.reviewPacket.protocolCompliance.conductorConsumptionEvidencePresent, true);
  assert.equal(report.coreLoop.reviewPacket.protocolCompliance.executionEvidenceLayerIsHonest, true);
  assert.equal(report.coreLoop.verificationResult.workerEvidence.workerResultPackets, 4);
  assert.equal(report.coreLoop.verificationResult.workerEvidence.workerExecutionEvidence, 4);
  assert.equal(report.coreLoop.verificationResult.workerEvidence.nestedWorkerExecutionEvidence, 4);
  assert.equal(report.coreLoop.publicReadyDecision.publicReady, false);
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-default-evidence-"));
  try {
    const report = await runMetaTheoryGovernedExecution({
      task: MULTI_CAPABILITY_TASK,
      runId: "validate-default-governed-execution-evidence",
      stateDir: tempDir,
      dbPath: path.join(tempDir, "runs.sqlite")
    });

    assert.equal(report.status, "pass");
    assert.equal(report.defaultRuntimePath.status, "pass");
    validateGovernanceEvidence(report);
    validateWorkerExecutionEvidence(report);

    process.stdout.write(
      `${JSON.stringify({
        status: "pass",
        governanceAgentResultPackets: report.coreLoop.governanceAgentResultPackets.length,
        consumedGovernancePackets: report.coreLoop.conductorConsumptionEvidence.consumedPacketRefs.length,
        workerResultPackets: report.coreLoop.executionResult.workerResultPackets.length,
        workerExecutionEvidence: report.coreLoop.executionResult.workerExecutionEvidence.length
      }, null, 2)}\n`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
