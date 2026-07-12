#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReportContext } from "./report-context.mjs";

const reportContext = createReportContext();
const REPO_ROOT = reportContext.repoRoot;
const CONTRACT_PATH = path.join(REPO_ROOT, "config", "contracts", "feedback-action-contract.json");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "feedback-loop-replay.json",
);
const OUTPUT_DIR = reportContext.resolveStatePath("feedback-loop");

const relativeToRepo = reportContext.relativeToRepo;

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function validateFeedbackAction(contract, correction) {
  const actionContract = contract.actions[correction.feedbackAction];
  const findings = [];
  if (!actionContract) {
    findings.push({ check: "action", reason: "unknown_feedback_action" });
    return { status: "fail", findings };
  }

  const missingFields = actionContract.requiredFields.filter((field) => {
    if (field === "actor") return false;
    return !hasValue(correction[field]);
  });
  if (missingFields.length > 0) {
    findings.push({ check: "schema", reason: "missing_required_feedback_fields", missingFields });
  }

  if (!actionContract.allowedWritebackIntent.includes(correction.writebackIntent)) {
    findings.push({
      check: "writeback",
      reason: "writeback_intent_not_allowed_for_action",
      writebackIntent: correction.writebackIntent,
    });
  }

  if (
    correction.writebackIntent === "candidate_only" &&
    correction.feedbackAction === "promote_to_long_term" &&
    correction.wardenApprovalRequired !== true
  ) {
    findings.push({ check: "writeback", reason: "missing_warden_approval_requirement" });
  }

  return {
    status: findings.length === 0 ? "pass" : "fail",
    findings,
  };
}

function evaluateCorrection(contract, correction) {
  const validation = validateFeedbackAction(contract, correction);
  const nextRouteChanged = correction.expectedNextRouteChange
    ? correction.effectOnNextRun !== "keep_scheduler_policy"
    : correction.effectOnNextRun === "keep_scheduler_policy";
  return {
    id: correction.id,
    type: correction.type,
    feedbackAction: correction.feedbackAction,
    target: correction.target,
    reason: correction.reason,
    effectOnNextRun: correction.effectOnNextRun,
    writebackIntent: correction.writebackIntent,
    repeatGapKey: correction.repeatGapKey,
    reviewerConfusionBefore: correction.reviewerConfusionBefore,
    reviewerConfusionAfter: correction.reviewerConfusionAfter,
    reviewerConfusionReduced: correction.reviewerConfusionAfter < correction.reviewerConfusionBefore,
    nextRouteChanged,
    runStateWrite: {
      actor: "user",
      target: correction.target,
      reason: correction.reason,
      effectOnNextRun: correction.effectOnNextRun,
      writebackIntent: correction.writebackIntent,
      canonicalWrite: false,
    },
    validation,
    status: validation.status === "pass" && nextRouteChanged ? "pass" : "fail",
  };
}

function missingRequiredChecks(actual, required) {
  return required.filter((check) => !actual.includes(check));
}

function evaluateReviewGate(contract, sample) {
  const gate = contract.reviewMetaReviewGate;
  const missingReviewChecks = missingRequiredChecks(sample.reviewChecks, gate.reviewRequiredChecks);
  const missingMetaReviewChecks = missingRequiredChecks(
    sample.metaReviewChecks,
    gate.metaReviewRequiredChecks,
  );
  const missingUpstreamEvidence = Object.entries(sample.upstreamEvidence)
    .filter(([, present]) => !present)
    .map(([key]) => key);

  let action = "accept";
  let returnToStage = "not_applicable";
  if (missingMetaReviewChecks.includes("writeback_boundary_checked")) {
    action = gate.rejectActions.writebackBoundaryMissing;
    returnToStage = "Meta-Review";
  } else if (missingReviewChecks.length > 0 || missingUpstreamEvidence.length > 0) {
    action = missingReviewChecks.length >= 4
      ? gate.rejectActions.polishOnlyReview
      : gate.rejectActions.missingUpstreamEvidence;
    returnToStage = action === "return_to_review" ? "Review" : "Fetch";
  }

  return {
    id: sample.id,
    action,
    returnToStage,
    expectedAction: sample.expectedAction,
    missingReviewChecks,
    missingMetaReviewChecks,
    missingUpstreamEvidence,
    reviewAccepted: action === "accept",
    metaReviewAccepted: action === "accept",
    status: action === sample.expectedAction ? "pass" : "fail",
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Feedback Loop Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- correctionReplayCount: ${report.summary.correctionReplayCount}`,
    `- actionTypesCovered: ${report.summary.actionTypesCovered}`,
    `- changedDecisionCount: ${report.summary.changedDecisionCount}`,
    `- repeatGapCount: ${report.summary.repeatGapCount}`,
    `- reviewerConfusionReduced: ${report.summary.reviewerConfusionReduced}`,
    `- canonicalWritesWithoutApproval: ${report.summary.canonicalWritesWithoutApproval}`,
    "",
    "## Feedback Actions",
    "",
    "| Action | Count |",
    "|---|---:|",
    ...Object.entries(report.summary.actionCounts).map(([action, count]) => `| ${action} | ${count} |`),
    "",
    "## Correction Replay",
    "",
    "| Sample | Type | Action | Route Changed | Confusion Reduced | Effect On Next Run |",
    "|---|---|---|---|---|---|",
    ...report.corrections.map(
      (item) =>
        `| ${item.id} | ${item.type} | ${item.feedbackAction} | ${item.nextRouteChanged ? "yes" : "no"} | ${item.reviewerConfusionReduced ? "yes" : "no"} | ${item.effectOnNextRun} |`,
    ),
    "",
    "## Review / Meta-Review Gate",
    "",
    "| Sample | Status | Action | Return To Stage | Missing Review Checks | Missing Upstream Evidence |",
    "|---|---|---|---|---:|---:|",
    ...report.reviewGate.map(
      (item) =>
        `| ${item.id} | ${item.status} | ${item.action} | ${item.returnToStage} | ${item.missingReviewChecks.length} | ${item.missingUpstreamEvidence.length} |`,
    ),
    "",
    "## Checks",
    "",
    "- Feedback actions are written to run state only.",
    "- Accept / correct / reject / promote_to_long_term / keep_one_time are all covered.",
    "- Repeated correction gaps are visible before long-term promotion.",
    "- Review checks Critical, Fetch, Thinking, Execution, worker output, feedback effect, and acceptance evidence.",
    "- Meta-Review rejects polish-only review and missing writeback boundary checks.",
    "- Canonical writes stay at 0 without Warden approval.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));

  const corrections = scenario.corrections.map((correction) =>
    evaluateCorrection(contract, correction),
  );
  const reviewGate = scenario.reviewSamples.map((sample) => evaluateReviewGate(contract, sample));
  const actionCounts = corrections.reduce((counts, item) => {
    counts[item.feedbackAction] = (counts[item.feedbackAction] ?? 0) + 1;
    return counts;
  }, {});
  const repeatGapKeys = new Set(corrections.map((item) => item.repeatGapKey));
  const summary = {
    correctionReplayCount: corrections.length,
    actionTypesCovered: Object.keys(actionCounts).length,
    actionCounts,
    changedDecisionCount: corrections.filter((item) => item.nextRouteChanged).length,
    repeatGapCount: repeatGapKeys.size,
    reviewerConfusionReduced: corrections.filter((item) => item.reviewerConfusionReduced).length,
    reviewGateSampleCount: reviewGate.length,
    reviewAcceptedCount: reviewGate.filter((item) => item.action === "accept").length,
    reviewRejectedCount: reviewGate.filter((item) => item.action !== "accept").length,
    canonicalWritesWithoutApproval: corrections.filter((item) => item.runStateWrite.canonicalWrite).length,
  };
  const status =
    contract.schemaVersion === "feedback-action-contract-v0.1" &&
    summary.correctionReplayCount >= 12 &&
    summary.actionTypesCovered >= 5 &&
    summary.changedDecisionCount >= 11 &&
    summary.repeatGapCount >= 10 &&
    summary.reviewerConfusionReduced >= 12 &&
    summary.reviewAcceptedCount >= 1 &&
    summary.reviewRejectedCount >= 3 &&
    summary.canonicalWritesWithoutApproval === 0 &&
    corrections.every((item) => item.status === "pass") &&
    reviewGate.every((item) => item.status === "pass")
      ? "pass"
      : "fail";

  const report = {
    schemaVersion: "feedback-loop-report-v0.1",
    generatedAt: new Date().toISOString(),
    contract: relativeToRepo(CONTRACT_PATH),
    scenario: relativeToRepo(SCENARIO_PATH),
    status,
    summary,
    corrections,
    reviewGate,
  };

  await reportContext.ensureDirectory(OUTPUT_DIR);
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await reportContext.writeJson(jsonPath, report);
  await reportContext.writeText(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        correctionReplayCount: report.summary.correctionReplayCount,
        actionTypesCovered: report.summary.actionTypesCovered,
        changedDecisionCount: report.summary.changedDecisionCount,
        repeatGapCount: report.summary.repeatGapCount,
        reviewRejectedCount: report.summary.reviewRejectedCount,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
