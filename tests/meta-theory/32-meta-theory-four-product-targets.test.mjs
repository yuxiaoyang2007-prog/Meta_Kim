import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  readGovernedExecutionRun,
  runMetaTheoryGovernedExecution,
} from "../../scripts/run-meta-theory-governed-execution.mjs";
import { getReportLabels } from "../../scripts/meta-kim-i18n.mjs";

const multiGapTask = [
  "同一套 PRD review standard 需要 skill。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。",
].join("\n");

describe("32 — Meta-theory three product goals and support gates", () => {
  test("T-001 runs the default governed orchestration runtime path", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-governed-run-"));
    try {
      const report = await runMetaTheoryGovernedExecution({
        task: multiGapTask,
        runId: "test-run-default",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });

      assert.equal(report.status, "pass");
      assert.equal(report.defaultRuntimePath.status, "pass");
      assert.equal(report.defaultRuntimePath.entry, "meta:theory:run");
      assert.deepEqual(report.defaultRuntimePath.triggerChain, [
        "meta-theory-skill-adapter",
        "meta-warden-entry-gate",
        "meta-conductor-orchestration",
        "capability-gap-decision-kernel",
      ]);
      assert.equal(
        report.defaultRuntimePath.orchestrationTaskBoardPacket.synthesisOwner,
        "meta-conductor"
      );
      assert.equal(report.defaultRuntimePath.workerTaskPackets.length, 4);
      assert.equal(report.defaultRuntimePath.governanceAgentResultPackets.length, 9);
      assert.equal(report.defaultRuntimePath.conductorConsumptionEvidence.status, "pass");
      assert.ok(
        report.defaultRuntimePath.conductorConsumptionEvidence.consumedPacketRefs.length >= 5
      );
      assert.equal(report.defaultRuntimePath.workerResultPackets.length, 4);
      assert.equal(report.defaultRuntimePath.workerExecutionEvidence.length, 4);
      assert.equal(report.defaultRuntimePath.traceEvalControlPlane.stageTiming.length, 8);
      assert.equal(report.defaultRuntimePath.agUiStageEvents.eventCount, 8);
      assert.ok(report.defaultRuntimePath.performanceCostBudget.highUsePaths.length >= 6);
      assert.equal(report.defaultRuntimePath.contextEngineeringBudget.status, "pass");
      assert.equal(report.defaultRuntimePath.langGraphRunPacket.status, "pass");
      assert.equal(report.defaultRuntimePath.peerAgentMeshPacket.status, "pass");
      assert.equal(report.defaultRuntimePath.agentTeamsPlaybookPacket.status, "pass");
      assert.equal(report.defaultRuntimePath.agentTeamsPlaybookPacket.selected, true);
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.fanoutSafetyPacket.safeForParallelFanout,
        true
      );
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.independentLanesProven,
        true
      );
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.parallelWaveExists,
        true
      );
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.dagAndCollisionSafe,
        true
      );
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.waveSizeWithinRuntimeCapacity,
        true
      );
      assert.equal(
        report.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.noArbitraryMetaKimCap,
        true
      );
      assert.equal(report.defaultRuntimePath.capabilityInvocationTruthPacket.status, "pass");
      const invocationByFamily = new Map(
        report.defaultRuntimePath.capabilityInvocationTruthPacket.rows.map((row) => [
          row.family,
          row,
        ])
      );
      assert.equal(report.defaultRuntimePath.runtimeSubagentInvocationPacket.status, "unavailable");
      assert.equal(invocationByFamily.get("agent_subagent").state, "unavailable");
      assert.equal(invocationByFamily.get("app_visible_subagent").state, "not_required");
      assert.equal(invocationByFamily.get("worker_task").state, "invoked");
      assert.equal(invocationByFamily.get("prompt_rule").state, "applied");
      assert.equal(invocationByFamily.get("agent_teams_playbook").state, "selected_not_invoked");
      assert.equal(report.defaultRuntimePath.capabilityInvocationProbePacket.status, "not_run");
      assert.ok(
        ["selected_not_invoked", "discovered_not_selected", "not_required"].includes(
          invocationByFamily.get("mcp").state
        )
      );
      assert.ok(["pass", "partial"].includes(report.defaultRuntimePath.visibleMetaTheorySurfacePacket.status));
      assert.equal(report.defaultRuntimePath.visibleMetaTheorySurfacePacket.capabilityInventory.notSkillOnly, true);
      assert.equal(
        report.defaultRuntimePath.visibleMetaTheorySurfacePacket.capabilityInvocationTruth.status,
        "pass"
      );
      assert.equal(
        report.defaultRuntimePath.visibleMetaTheorySurfacePacket.dynamicWorkflow.status,
        report.defaultRuntimePath.dynamicWorkflowRuntimePacket.status
      );
      assert.equal(report.defaultRuntimePath.visibleMetaTheorySurfacePacket.peerAgentMesh.status, "pass");
      assert.equal(report.defaultRuntimePath.visibleMetaTheorySurfacePacket.langGraph.status, "pass");
      assert.ok(["pass", "partial"].includes(report.defaultRuntimePath.userPerceptionPacket.status));
      assert.deepEqual(
        report.defaultRuntimePath.productExperiencePacket.goals.map((goal) => goal.id),
        ["P-102", "P-103", "P-104"]
      );
      assert.deepEqual(
        report.defaultRuntimePath.productExperiencePacket.supportGates.map((gate) => gate.id),
        ["P-105", "P-106", "P-107", "P-108", "P-109", "P-110"]
      );
      assert.equal(report.defaultRuntimePath.productExperiencePacket.noOverclaimGate.status, "pass");
      assert.equal(
        report.defaultRuntimePath.productExperiencePacket.nativeChoiceSurfaceGate.liveRuntimeBoundary.status,
        "not_claimed_by_structural_runner"
      );
      assert.equal(
        report.defaultRuntimePath.productExperiencePacket.repeatFailureDesignGate.actionOnSecondOccurrence,
        "bottom_design_failure_return_to_critical_fetch_thinking"
      );
      assert.equal(report.defaultRuntimePath.productExperiencePacket.generalizationGate.status, "pass");
      assert.equal(
        report.defaultRuntimePath.productExperiencePacket.capabilityInvocationTruthGate.status,
        "partial"
      );
      assert.equal(
        report.defaultRuntimePath.productExperiencePacket.agentTeamsPlaybookGate.status,
        "pass"
      );
      assert.equal(report.coreLoop.executionResult.actualWorkerExecution, true);
      assert.equal(report.coreLoop.traceEvalControlPlane.coverage.coverageStatus, "pass");
      assert.equal(report.coreLoop.agUiStageEvents.events.every((event) => event.packetDumpPrevented === true), true);
      assert.equal(report.coreLoop.performanceCostBudget.acceptance.externalPaidWorkRequiresApproval, true);
      assert.equal(report.coreLoop.contextEngineeringBudget.budgetRules.fixedVariableContextSeparated, true);
      assert.equal(
        report.coreLoop.executionResult.mergeResult.governanceResultsConsumed,
        true
      );
      assert.ok(
        report.coreLoop.executionResult.workerResultPackets.every(
          (packet) =>
            packet.status === "executed" &&
            packet.workerExecutionEvidence.length === 1 &&
            packet.workerExecutionEvidence[0].status === "verified"
        )
      );
      assert.equal(
        report.coreLoop.reviewPacket.protocolCompliance.governanceAgentResultPacketsPresent,
        true
      );
      assert.equal(
        report.coreLoop.reviewPacket.protocolCompliance.conductorConsumptionEvidencePresent,
        true
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("T-002 records Claude, Codex, Cursor, and OpenClaw projection smoke evidence", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-runtime-smoke-"));
    try {
      const report = await runMetaTheoryGovernedExecution({
        task: multiGapTask,
        runId: "test-run-runtime-smoke",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const runtimes = report.runtimeProjectionEvidence.results;

      assert.equal(report.runtimeProjectionEvidence.status, "pass");
      assert.deepEqual(
        runtimes.map((item) => item.runtime).sort(),
        ["claude", "codex", "cursor", "openclaw"]
      );
      for (const runtime of runtimes) {
        assert.equal(runtime.status, "smoke_pass", `${runtime.runtime} should pass smoke`);
        assert.equal(runtime.evidenceKind, "smoke");
        assert.equal(runtime.failureClass, "projection_only");
        assert.equal(runtime.naturalRoute, true);
        assert.ok(runtime.runtimeEntry, `${runtime.runtime} must record entry`);
        assert.ok(runtime.command, `${runtime.runtime} must record command`);
        assert.ok(runtime.remainingAction, `${runtime.runtime} must record remaining action`);
        assert.ok(runtime.orchestrationBoard, `${runtime.runtime} must bind board`);
        assert.equal(runtime.workerTaskPackets, 4);
        assert.equal(runtime.verificationOwner, "verify");
        assert.ok(runtime.runtimeDifference);
      }
      assert.equal(report.runtimeProjectionEvidence.releaseGrade, false);
      assert.equal(report.runtimeEvidencePacket.releaseGrade, false);
      assert.equal(report.runtimeEvidencePacket.failureClasses.cursor, "projection_only");
      assert.equal(
        report.runtimeEvidencePacket.records.filter(
          (item) => item.failureClass === "projection_only"
        ).length,
        4
      );
      assert.equal(report.analytics.runtimeEvidenceDistribution.length, 4);
      assert.deepEqual(
        report.analytics.runtimeEvidenceDistribution.map((item) => item.failureClass).sort(),
        ["projection_only", "projection_only", "projection_only", "projection_only"]
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("T-003 distinguishes candidate_only from Warden approved writeback and can apply to a temp canonical root", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-writeback-"));
    try {
      const canonicalRoot = path.join(tempDir, "canonical");
      const candidateOnly = await runMetaTheoryGovernedExecution({
        task: "同一套 PRD review standard 需要 skill。",
        runId: "test-run-candidate-only",
        stateDir: path.join(tempDir, "candidate"),
        dbPath: path.join(tempDir, "candidate.sqlite"),
        canonicalRoot,
      });
      assert.equal(candidateOnly.wardenWritebackFlow.status, "candidate_only");
      assert.equal(candidateOnly.wardenWritebackFlow.approvalRequired, true);
      assert.equal(candidateOnly.wardenWritebackFlow.approvalValidation.ok, false);
      assert.ok(candidateOnly.wardenWritebackFlow.approvalRequest);
      assert.equal(candidateOnly.wardenWritebackFlow.dryRun.canonicalWrites, 0);
      assert.equal(candidateOnly.wardenWritebackFlow.candidates[0].writebackDecision, "candidate_only");
      assert.equal(candidateOnly.wardenWritebackFlow.candidates[0].applyStatus, "planned");
      assert.equal(candidateOnly.wardenWritebackFlow.candidates[0].dryRunArtifact.canonicalWrites, 0);

      const approvalPacket = {
        schemaVersion: "warden-approval-v0.1",
        approvalId: "warden-approved-test-evidence",
        approver: "meta-warden",
        approvedAt: "2026-06-04T00:00:00.000Z",
        scope: "temp canonical writeback test",
        targets: [
          `canonical/${candidateOnly.wardenWritebackFlow.candidates[0].targetRelativeToCanonical}`,
        ],
        diffSummary: "Create one skill candidate in temp canonical root.",
        rollbackPlan: "Remove the generated temp canonical file.",
      };

      const approved = await runMetaTheoryGovernedExecution({
        task: "同一套 PRD review standard 需要 skill。",
        runId: "test-run-approved-writeback",
        stateDir: path.join(tempDir, "approved"),
        dbPath: path.join(tempDir, "approved.sqlite"),
        canonicalRoot,
        approvalPacket,
        applyWriteback: true,
      });
      const candidate = approved.wardenWritebackFlow.candidates[0];
      assert.equal(approved.wardenWritebackFlow.status, "approved-for-writeback");
      assert.equal(approved.wardenWritebackFlow.approvalValidation.ok, true);
      assert.equal(candidate.writebackDecision, "approved-for-writeback");
      assert.equal(candidate.applyStatus, "created");
      assert.equal(candidate.dryRunArtifact.canonicalWrites, 1);
      assert.equal(candidate.verificationResult.status, "pass");
      assert.match(candidate.diffSummary, /^Created /);

      const targetPath = path.join(
        tempDir,
        "canonical",
        candidate.targetRelativeToCanonical
      );
      const written = await readFile(targetPath, "utf8");
      assert.match(written, /Generated by the Warden-approved Capability Gap writeback flow/);
      assert.match(written, /approvalEvidence: warden-approved-test-evidence/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("T-004 renders and reads a user-readable run report by runId", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-run-report-"));
    try {
      const report = await runMetaTheoryGovernedExecution({
        task: multiGapTask,
        runId: "test-run-readable-report",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const readBack = await readGovernedExecutionRun({
        runId: report.runId,
        stateDir: tempDir,
      });

      assert.equal(readBack.artifact.runId, "test-run-readable-report");
      assert.equal(readBack.artifact.runReport.status, "pass");
      assert.equal(readBack.artifact.runReportPanelContract.status, "partial");
      assert.equal(
        readBack.artifact.runReportPanelContract.capabilityInvocationTruth.callableInvocationCoverage
          .status,
        "not_run",
      );
      assert.equal(
        readBack.artifact.runReportPanelContract.schemaVersion,
        "run-report-panel-contract-v0.1"
      );
      assert.equal(
        readBack.artifact.runReportPanelContract.decisionSummary.runId,
        "test-run-readable-report"
      );
      assert.ok(
        readBack.artifact.runReportPanelContract.ownerHandoff.length > 0
      );
      assert.ok(
        readBack.artifact.runReportPanelContract.runtimeEvidence.length >= 4
      );
      assert.equal(
        readBack.artifact.runReportPanelContract.approvalRequest.dryRunCanonicalWrites,
        0
      );
      assert.deepEqual(
        readBack.artifact.runReportPanelContract.aiReadableRubric.map((item) => item.id),
        ["design", "execution", "acceptance", "feedback", "deliverables"]
      );
      assert.equal(
        readBack.artifact.runReportPanelContract.deliverables.panelContract,
        "artifact.runReportPanelContract"
      );
      const labels = getReportLabels("zh-CN");
      const sectionLabels = labels.sections;
      const toolList = labels.toolList(labels.toolNames);
      for (const section of [
        sectionLabels.decisionSummary,
        sectionLabels.whyDecision,
        sectionLabels.ownerHandoff,
        sectionLabels.toolEvidenceFull(toolList),
        "三目标产品验收",
        sectionLabels.capabilityUpgrade,
        sectionLabels.wardenApproval,
        sectionLabels.verificationStatus,
      ]) {
        assert.match(readBack.markdown, new RegExp(section));
        assert.ok(readBack.artifact.runReport.sections.includes(section));
      }
      await stat(readBack.paths.json);
      await stat(readBack.paths.markdown);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("T-005 validates the three product goals and support gates", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/validate-product-experience-core-goals.mjs"],
      { encoding: "utf8", timeout: 120_000 }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "pass");
    assert.equal(output.evidenceTier, "product_experience_pass");
    assert.deepEqual(output.goals.map((goal) => goal.id), ["P-102", "P-103", "P-104"]);
    assert.deepEqual(output.supportGates.map((gate) => gate.id), ["P-105", "P-106", "P-107", "P-108", "P-109", "P-110"]);
    assert.equal(output.nativeChoiceSurface, "not_claimed_by_structural_runner");
    assert.equal(output.repeatFailureDesign, "bottom_design_failure_return_to_critical_fetch_thinking");
    assert.equal(output.generalizationGate, "pass");
    assert.ok(output.langGraph.nodes >= 8);
    assert.ok(output.langGraph.edges >= 7);
    assert.equal(output.dynamicWorkflow.skill, true);
    assert.equal(output.dynamicWorkflow.mcp, true);
    assert.equal(output.dynamicWorkflow.command, true);
    assert.equal(output.dynamicWorkflow.tools, true);
    assert.equal(output.dynamicWorkflow.hooks, true);
    assert.ok(output.peers > 0);
    assert.equal(output.capabilityInvocationTruth.status, "pass");
    assert.equal(output.capabilityInvocationTruth.states.invoked >= 1, true);
    assert.equal(output.capabilityInvocationTruth.appVisibleSubagentState, "not_required");
    assert.equal(output.capabilityInvocationTruth.callableInvocationCoverage.status, "pass");
    assert.equal(output.capabilityInvocationTruth.agentTeamsPlaybookState, "selected_not_invoked");
    assert.equal(output.agentTeamsPlaybook.status, "pass");
    assert.equal(output.agentTeamsPlaybook.selected, true);
    assert.equal(output.visibleMetaTheorySurface, "pass");
    assert.ok(output.userPerceptionCues >= 6);
  });

  test("CLI accepts natural language task text and reports the runId", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-governed-cli-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-meta-theory-governed-execution.mjs",
          "--task",
          "同一套 PRD review standard 需要 skill。",
          "--run-id",
          "test-run-cli",
          "--state-dir",
          tempDir,
          "--db",
          path.join(tempDir, "runs.sqlite"),
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "pass");
      assert.equal(summary.runId, "test-run-cli");
      assert.match(summary.report, /test-run-cli\.zh-CN\.md$/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI accepts npm-style stripped positional arguments", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-governed-cli-positional-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-meta-theory-governed-execution.mjs",
          "同一套 PRD review standard 需要 skill。",
          "test-run-cli-positional",
          tempDir,
          path.join(tempDir, "runs.sqlite"),
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "pass");
      assert.equal(summary.runId, "test-run-cli-positional");
      assert.match(summary.report, /test-run-cli-positional\.zh-CN\.md$/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
