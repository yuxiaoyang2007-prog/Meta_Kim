#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const CONTRACT_PATH = path.join(REPO_ROOT, "config", "contracts", "worker-task-output-contract.json");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "worker-task-output-replay.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "worker-task-output");

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function missingFields(result, requiredFields) {
  return requiredFields.filter((field) => !hasValue(result[field]));
}

function missingEvidence(result, requiredEvidence) {
  const evidenceRefs = Array.isArray(result.evidenceRefs) ? result.evidenceRefs : [];
  return requiredEvidence.filter((evidence) => !evidenceRefs.includes(evidence));
}

function evaluateSample(contract, sample) {
  const workerType = sample.taskPacket?.workerType ?? sample.result?.workerType;
  const typeContract = contract.workerTypes[workerType];
  const findings = [];
  if (!typeContract) {
    findings.push({
      check: "schema",
      reason: "unknown_worker_type",
      detail: workerType ?? "missing",
    });
  }

  const forbiddenOwnerModes = contract.ownerBoundary.forbiddenOwnerModes ?? [];
  const ownerBoundaryFailed =
    sample.taskPacket?.owner !== sample.result?.owner ||
    forbiddenOwnerModes.includes(sample.result?.ownerMode) ||
    forbiddenOwnerModes.includes(sample.result?.owner);
  if (ownerBoundaryFailed) {
    findings.push({
      check: "ownerBoundary",
      reason: contract.ownerBoundary.failureClass,
      detail: `${sample.result?.owner ?? "missing"} does not match ${sample.taskPacket?.owner ?? "missing"}`,
    });
  }

  const schemaMissing = typeContract ? missingFields(sample.result, typeContract.requiredFields) : [];
  if (schemaMissing.length > 0) {
    findings.push({
      check: "schema",
      reason: typeContract.failureClass,
      missing: schemaMissing,
    });
  }

  const evidenceMissing = typeContract ? missingEvidence(sample.result, typeContract.requiredEvidence) : [];
  if (evidenceMissing.length > 0) {
    findings.push({
      check: "evidence",
      reason: typeContract.failureClass,
      missing: evidenceMissing,
    });
  }

  let action = "accept";
  let returnToStage = "not_applicable";
  let retryCount = 0;
  let maxRetries = typeContract?.maxRetries ?? 0;
  if (ownerBoundaryFailed) {
    action = contract.retryPolicy.ownerBoundaryAction;
    returnToStage = contract.ownerBoundary.returnToStage;
  } else if (evidenceMissing.length > 0 && schemaMissing.length === 0) {
    action = contract.retryPolicy.missingEvidenceAction;
    returnToStage = typeContract.returnToStage;
    retryCount = Math.min(1, maxRetries);
  } else if (schemaMissing.length > 0) {
    action = contract.retryPolicy.schemaMismatchAction;
    returnToStage = typeContract.returnToStage;
  }

  const reviewAcceptance = {
    schemaStatus: schemaMissing.length === 0 ? "pass" : "fail",
    ownerBoundaryStatus: ownerBoundaryFailed ? "fail" : "pass",
    requiredEvidenceStatus: evidenceMissing.length === 0 ? "pass" : "fail",
    reviewAcceptanceCriteriaStatus:
      typeContract?.reviewAcceptanceCriteria?.length > 0 ? "pass" : "fail",
    acceptedByReview: action === "accept",
  };

  return {
    id: sample.id,
    workerType,
    taskPacketId: sample.taskPacket?.taskPacketId,
    owner: sample.result?.owner,
    expectedAction: sample.expectedAction,
    action,
    returnToStage,
    retryCount,
    maxRetries,
    findings,
    reviewAcceptance,
    status:
      action === sample.expectedAction &&
      (!sample.expectedReturnToStage || returnToStage === sample.expectedReturnToStage)
        ? "pass"
        : "fail",
  };
}

function buildMarkdown(report) {
  const lines = [
    "# WorkerTask Output Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- schemaTypesCovered: ${report.summary.schemaTypesCovered}`,
    `- acceptedCount: ${report.summary.acceptedCount}`,
    `- retryCount: ${report.summary.retryCount}`,
    `- returnToStageCount: ${report.summary.returnToStageCount}`,
    `- blockedCount: ${report.summary.blockedCount}`,
    "",
    "## Samples",
    "",
    "| Sample | Worker Type | Status | Action | Return To Stage | Findings | Review Accepted |",
    "|---|---|---|---|---|---:|---|",
    ...report.samples.map(
      (sample) =>
        `| ${sample.id} | ${sample.workerType} | ${sample.status} | ${sample.action} | ${sample.returnToStage} | ${sample.findings.length} | ${sample.reviewAcceptance.acceptedByReview ? "yes" : "no"} |`,
    ),
    "",
    "## Checks",
    "",
    "- Six worker output schemas are covered: research, implementation, review, verification, writeback, and deliverable.",
    "- Missing evidence produces retry with returnToStage.",
    "- Owner boundary violations produce blocked.",
    "- Schema mismatch produces return_to_stage.",
    "- Review accepts only outputs with schema, owner boundary, evidence, and criteria pass.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const samples = scenario.samples.map((sample) => evaluateSample(contract, sample));
  const workerTypes = new Set(samples.map((sample) => sample.workerType));
  const summary = {
    schemaTypesCovered: workerTypes.size,
    sampleCount: samples.length,
    passCount: samples.filter((sample) => sample.status === "pass").length,
    acceptedCount: samples.filter((sample) => sample.action === "accept").length,
    retryCount: samples.filter((sample) => sample.action === "retry").length,
    returnToStageCount: samples.filter((sample) => sample.action === "return_to_stage").length,
    blockedCount: samples.filter((sample) => sample.action === "blocked").length,
    reviewRejectedCount: samples.filter((sample) => !sample.reviewAcceptance.acceptedByReview).length,
    actionsCovered: [...new Set(samples.map((sample) => sample.action))].sort(),
  };
  const status =
    contract.schemaVersion === "worker-task-output-contract-v0.1" &&
    summary.schemaTypesCovered >= 6 &&
    summary.sampleCount >= 9 &&
    summary.passCount === samples.length &&
    summary.acceptedCount >= 6 &&
    summary.retryCount >= 1 &&
    summary.returnToStageCount >= 1 &&
    summary.blockedCount >= 1 &&
    summary.reviewRejectedCount >= 3
      ? "pass"
      : "fail";
  const report = {
    schemaVersion: "worker-task-output-report-v0.1",
    generatedAt: new Date().toISOString(),
    contract: relativeToRepo(CONTRACT_PATH),
    scenario: relativeToRepo(SCENARIO_PATH),
    status,
    summary,
    samples,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        schemaTypesCovered: report.summary.schemaTypesCovered,
        sampleCount: report.summary.sampleCount,
        retryCount: report.summary.retryCount,
        returnToStageCount: report.summary.returnToStageCount,
        blockedCount: report.summary.blockedCount,
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
