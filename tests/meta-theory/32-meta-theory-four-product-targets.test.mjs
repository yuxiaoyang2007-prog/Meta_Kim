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

describe("32 — Meta-theory four product targets", () => {
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
      assert.equal(readBack.artifact.runReportPanelContract.status, "pass");
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
