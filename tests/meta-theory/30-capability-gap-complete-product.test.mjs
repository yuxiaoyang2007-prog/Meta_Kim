import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COMPLETE_PRODUCT_INPUTS,
  runCapabilityGapCompleteProduct,
} from "../../scripts/run-capability-gap-complete-product.mjs";

const sourceLeakPattern = new RegExp(
  [
    "gst" + "ack",
    "gbr" + "ain",
    "wsh" + "obson",
    "Anth" + "ropic",
    "skill-" + "creator",
    "[A-Z]:[\\\\/]",
    "Users[\\\\/]Kim",
  ].join("|"),
  "i"
);

describe("30 — Capability Gap complete product MVP", () => {
  test("runs the complete-product entry with 12 real inputs, graph, feedback, analytics, and acceptance", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-complete-product-"));
    try {
      const jsonPath = path.join(tempDir, "complete-product.json");
      const markdownPath = path.join(tempDir, "complete-product.md");
      const dbPath = path.join(tempDir, "complete-product.sqlite");
      const report = await runCapabilityGapCompleteProduct({
        jsonPath,
        markdownPath,
        dbPath,
      });

      assert.equal(report.status, "pass");
      assert.equal(report.summary.inputs, 12);
      assert.equal(report.summary.decisionsCovered, 6);
      assert.equal(report.summary.scorecardsPassed, 12);
      assert.equal(report.summary.naturalInferenceWithoutExpectedDecision, true);
      assert.equal(report.summary.frPassRate, 1);
      assert.equal(report.summary.quantitativePassRate, 1);
      assert.deepEqual(
        report.productArtifacts.map((artifact) => artifact.gapDecision.decision),
        COMPLETE_PRODUCT_INPUTS.map((item) => item.expectedDecision)
      );

      for (const id of [
        "R-001",
        "R-002",
        "R-003",
        "R-004",
        "R-005",
        "R-006",
        "R-007",
        "R-008",
        "R-009",
        "R-010",
        "R-011",
      ]) {
        const check = report.requirementChecks.find((item) => item.id === id);
        assert.ok(check, `${id} check missing`);
        assert.equal(check.passed, true, `${id} must pass`);
        assert.ok(check.owner, `${id} must name owner`);
        assert.ok(check.returnToStage, `${id} must name returnToStage`);
      }

      for (const scorecard of report.scorecards) {
        assert.equal(scorecard.status, "pass");
        for (const dimension of [
          "completeness",
          "boundary_fit",
          "verification_readiness",
          "least_privilege",
          "reuse_or_run_scope_fit",
        ]) {
          assert.equal(scorecard.dimensions[dimension], true, `${dimension} must pass`);
        }
      }

      assert.equal(report.graphValidation.status, "pass");
      assert.equal(report.graphValidation.conditionalEdgeCount, 6);
      assert.equal(report.graphValidation.branchExecutionCoverage, 6);
      assert.equal(report.graphValidation.databaseAsPlannerCount, 0);
      assert.equal(report.graphValidation.directCanonicalWriteFromGraphNode, 0);
      assert.equal(report.governedExecutionEvidence.status, "partial");
      assert.equal(
        report.governedExecutionEvidence.defaultRuntimePath.entry,
        "meta:theory:run"
      );
      assert.equal(report.governedExecutionEvidence.runtimeProjectionEvidence.results.length, 4);
      assert.equal(
        report.governedExecutionEvidence.approvedWriteback.status,
        "approved-for-writeback"
      );
      assert.equal(report.governedExecutionEvidence.noRealCanonicalPollution, true);

      assert.equal(report.feedbackReplay.cases.length, 6);
      assert.equal(report.feedbackReplay.reductionPercent, 30);
      assert.equal(
        report.feedbackReplay.correctionInfluence.decisionChangedByCorrection,
        true
      );
      assert.notEqual(
        report.feedbackReplay.correctionInfluence.baselineDecision,
        report.feedbackReplay.correctionInfluence.correctedDecision
      );
      assert.equal(report.feedbackReplay.correctionInfluence.correctedDecision, "create_skill");
      assert.ok(
        report.feedbackReplay.correctionInfluence.replayedUserCorrections.length > 0
      );
      assert.ok(
        report.feedbackReplay.promotionCandidates.some(
          (item) =>
            item.repeatCount >= 3 &&
            item.status === "promotion_review_candidate" &&
            item.noAutomaticCanonicalWrite === true
        )
      );

      assert.equal(report.analytics.source, "RunStateStore");
      assert.equal(report.analytics.metricCount, 6);
      assert.equal(report.analytics.decisionDistribution.length, 6);
      assert.ok(report.analytics.userCorrectionDistribution.length >= 2);
      assert.ok(report.analytics.candidateAcceptance.length >= 2);
      assert.ok(report.analytics.repeatKeyTopList.length > 0);
      assert.ok(report.analytics.ownerFailureRate.length > 0);
      assert.ok(
        report.analytics.ownerFailureRate.every(
          (item) => typeof item.failureRate === "number"
        )
      );

      assert.equal(report.aiReadableStandards.status, "pass");
      assert.equal(report.aiReadableStandards.audience, "external product reviewer and AI reviewer");
      assert.deepEqual(
        report.aiReadableStandards.standards.map((standard) => standard.id),
        ["design", "execution", "acceptance", "feedback", "deliverables"]
      );
      for (const standard of report.aiReadableStandards.standards) {
        assert.equal(standard.status, "pass", `${standard.id} standard must pass`);
        assert.ok(standard.plainLanguageQuestion);
        assert.ok(standard.passStandard);
        assert.ok(standard.failStandard);
        assert.ok(standard.requiredEvidence.length > 0);
      }

      const r006 = report.requirementChecks.find((item) => item.id === "R-006");
      assert.match(r006.evidence, /auditableChecks=true/);
      assert.doesNotMatch(r006.evidence, /本命令输出 status/);

      for (const artifact of report.productArtifacts) {
        for (const field of [
          "criticalSummary",
          "fetchEvidence",
          "gapDecision",
          "decisionOutput",
          "reviewResult",
          "verificationResult",
          "feedbackPlaceholder",
          "evolutionDecision",
        ]) {
          assert.ok(artifact[field], `artifact missing ${field}`);
        }
      }

      assert.doesNotMatch(JSON.stringify(report), sourceLeakPattern);

      const markdown = await readFile(markdownPath, "utf8");
      assert.match(markdown, /Capability Gap Complete Product MVP Report/);
      assert.match(markdown, /R-006/);
      assert.match(markdown, /R-011/);
      assert.match(markdown, /AI 可读标准/);
      assert.match(markdown, /设计标准/);
      assert.match(markdown, /执行标准/);
      assert.match(markdown, /验收标准/);
      assert.match(markdown, /反馈标准/);
      assert.match(markdown, /交付内容标准/);
      assert.match(markdown, /Analytics/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("runs a single natural-language product entry without fixture expectedDecision", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-single-product-"));
    try {
      const jsonPath = path.join(tempDir, "single-product.json");
      const markdownPath = path.join(tempDir, "single-product.md");
      const dbPath = path.join(tempDir, "single-product.sqlite");
      const report = await runCapabilityGapCompleteProduct({
        jsonPath,
        markdownPath,
        dbPath,
        task: "这个任务需要把重复出现的 PRD review standard 沉淀成可复用 skill candidate。",
      });

      assert.equal(report.status, "pass");
      assert.equal(report.summary.mode, "single_task_entry");
      assert.equal(report.summary.inputs, 1);
      assert.equal(report.summary.decisionsCovered, 1);
      assert.equal(report.summary.naturalInferenceWithoutExpectedDecision, true);
      assert.equal(report.productArtifacts[0].gapDecision.decision, "create_skill");
      assert.equal(report.graphValidation.branchExecutionCoverage, 1);
      assert.equal(report.summary.frPassRate, 1);
      assert.equal(report.summary.quantitativePassRate, 1);
      assert.equal(report.aiReadableStandards.status, "pass");

      for (const targetPath of [jsonPath, markdownPath, dbPath]) {
        const file = await stat(targetPath);
        assert.ok(file.size > 0, `${targetPath} should be written`);
      }

      const markdown = await readFile(markdownPath, "utf8");
      assert.match(markdown, /Capability Gap Complete Product MVP Report/);
      assert.doesNotMatch(JSON.stringify(report), sourceLeakPattern);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
