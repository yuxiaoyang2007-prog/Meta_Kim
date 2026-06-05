#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildCapabilityGapOrchestration } from "./run-capability-gap-orchestration.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "complex-capability-gap-inputs.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "complex-capability-gap-inputs");

const REQUIRED_TRAIT_COVERAGE = [
  "research-first",
  "multi-capability",
  "approval-blocked",
  "worker-task-only",
  "create-agent",
  "create-script",
  "mcp-provider",
  "same-type-repeat",
  "multi-runtime",
  "reviewer-feedback",
];

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function countDecisions(report) {
  return Object.fromEntries(
    Object.entries(report.decisionCounts).filter(([, count]) => count > 0),
  );
}

function validateCase(testCase, report) {
  const decisions = countDecisions(report);
  const allTasksHaveOwners = report.workerTaskPackets.every(
    (packet) =>
      packet.owner &&
      packet.mergeOwner === "meta-conductor" &&
      packet.parallelGroup &&
      packet.roleInstanceId &&
      packet.shardScope,
  );
  const inventoryCovered =
    report.fetchEvidence.capabilityInventory.length >= 10 &&
    report.fetchEvidence.capabilityInventory.every((item) => item.checkedBeforeThinking);
  const researchGateOk = testCase.requiredTraits.includes("research-first")
    ? report.fetchEvidence.researchCapabilityDiscovery.researchRequired === true &&
      report.fetchEvidence.deepResearchPlan.stageGate === "must_complete_before_thinking"
    : true;
  const noFakeParallelism =
    new Set(report.workerTaskPackets.map((packet) => packet.roleInstanceId)).size ===
    report.workerTaskPackets.length;

  return {
    status:
      report.status === "pass" &&
      allTasksHaveOwners &&
      inventoryCovered &&
      researchGateOk &&
      noFakeParallelism
        ? "pass"
        : "fail",
    decisions,
    allTasksHaveOwners,
    inventoryCovered,
    researchGateOk,
    noFakeParallelism,
    workerTaskCount: report.workerTaskPackets.length,
    groupedGapCount: report.groupedGaps.length,
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Complex Capability Gap Input Replay",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- cases: ${report.summary.caseCount}`,
    `- passRate: ${report.summary.passRate}`,
    "",
    "| Case | Status | Decisions | Traits |",
    "|---|---|---|---|",
    ...report.results.map(
      (item) =>
        `| ${item.id} | ${item.validation.status} | ${Object.keys(item.validation.decisions).join(", ")} | ${item.requiredTraits.join(", ")} |`,
    ),
    "",
    "## Trait Coverage",
    "",
    ...Object.entries(report.summary.traitCoverage).map(
      ([trait, count]) => `- ${trait}: ${count}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const results = scenario.cases.map((testCase) => {
    const orchestration = buildCapabilityGapOrchestration(testCase.input);
    return {
      id: testCase.id,
      input: testCase.input,
      requiredTraits: testCase.requiredTraits,
      validation: validateCase(testCase, orchestration),
      orchestrationTaskBoardPacket: orchestration.orchestrationTaskBoardPacket,
      decisionCounts: orchestration.decisionCounts,
    };
  });
  const traitCoverage = Object.fromEntries(
    REQUIRED_TRAIT_COVERAGE.map((trait) => [
      trait,
      results.filter((item) => item.requiredTraits.includes(trait)).length,
    ]),
  );
  const passed = results.filter((item) => item.validation.status === "pass").length;
  const report = {
    schemaVersion: "complex-capability-gap-input-replay-v0.1",
    generatedAt: new Date().toISOString(),
    scenario: relativeToRepo(SCENARIO_PATH),
    status:
      passed === results.length &&
      Object.values(traitCoverage).every((count) => count > 0)
        ? "pass"
        : "fail",
    summary: {
      caseCount: results.length,
      passed,
      passRate: results.length === 0 ? 0 : passed / results.length,
      traitCoverage,
      requiredTraitCoverage: REQUIRED_TRAIT_COVERAGE,
    },
    results,
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
        caseCount: report.summary.caseCount,
        passRate: report.summary.passRate,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
