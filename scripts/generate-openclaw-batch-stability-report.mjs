#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { createReportContext } from "./report-context.mjs";

const reportContext = createReportContext();
const OUTPUT_DIR = reportContext.resolveStatePath("openclaw-batch-stability");
const META_AGENTS = [
  "meta-warden",
  "meta-conductor",
  "meta-genesis",
  "meta-artisan",
  "meta-sentinel",
  "meta-librarian",
  "meta-prism",
  "meta-scout",
  "meta-chrysalis",
];

function buildRecords() {
  return META_AGENTS.map((agent, index) => ({
    agent,
    shardId: `openclaw-shard-${index + 1}`,
    command: `node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=${agent}`,
    expectedOutcome: "pass",
    fallbackPolicy: "single_agent_shard",
    retryPolicy: {
      maxRetries: 1,
      retryDelayMs: 1500,
      retryWhen: ["timeout", "live_incomplete"],
    },
    batchCollisionBoundary: "Do not merge shard output unless each agent has independent evidence.",
    evidenceStatus: "not_run",
  }));
}

function buildMarkdown(report) {
  const lines = [
    "# OpenClaw Batch Stability Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- generationStatus: ${report.generationStatus}`,
    `- evidenceStatus: ${report.evidenceStatus}`,
    `- shardCount: ${report.summary.shardCount}`,
    `- batchReleaseGrade: ${report.summary.batchReleaseGrade}`,
    `- timeoutClassVisible: ${report.summary.timeoutClassVisible}`,
    "",
    "| Shard | Agent | Expected outcome | Evidence | Retry policy |",
    "|---|---|---|---|---|",
    ...report.shards.map(
      (row) => `| ${row.shardId} | ${row.agent} | ${row.expectedOutcome} | ${row.evidenceStatus} | ${row.retryPolicy.maxRetries} retry |`,
    ),
    "",
    "## Batch Policy",
    "",
    `- Batch command: \`${report.batchProbe.command}\``,
    `- Failure class: ${report.batchProbe.expectedFailureClass}`,
    `- Observed failure class: ${report.batchProbe.observedFailureClass ?? "not_run"}`,
    `- Remaining action: ${report.batchProbe.remainingAction}`,
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const shards = buildRecords();
  const batchProbe = {
    command: `node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=${META_AGENTS.join(",")}`,
    expectedFailureClass: "timeout",
    observedFailureClass: null,
    evidenceStatus: "not_run",
    timeoutMs: 120000,
    remainingAction:
      "Keep single-agent shard evidence as release evidence until batch runner proves stable or records deterministic timeout recovery.",
    fallbackShardCount: shards.length,
    releaseGradeCandidate: false,
  };
  const report = {
    schemaVersion: "openclaw-batch-stability-v0.2",
    generatedAt: new Date().toISOString(),
    generationStatus:
      shards.length === 9 &&
      shards.every((row) => row.evidenceStatus === "not_run" && row.retryPolicy.maxRetries >= 1) &&
      batchProbe.expectedFailureClass === "timeout" &&
      batchProbe.releaseGradeCandidate === false
        ? "pass"
        : "fail",
    evidenceStatus: "not_run",
    summary: {
      shardCount: shards.length,
      passShardCount: 0,
      notRunShardCount: shards.filter((row) => row.evidenceStatus === "not_run").length,
      batchReleaseGrade: false,
      timeoutClassVisible: true,
      retryPolicyVisible: true,
      remainingActionVisible: true,
    },
    batchProbe,
    shards,
  };

  await reportContext.ensureDirectory(OUTPUT_DIR);
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await reportContext.writeJson(jsonPath, report);
  await reportContext.writeText(mdPath, buildMarkdown(report));
  process.stdout.write(
    `${JSON.stringify(
      {
        generationOk: report.generationStatus === "pass",
        evidenceStatus: report.evidenceStatus,
        runtimeEvidencePassed: false,
        report: reportContext.relativeToRepo(jsonPath),
        markdown: reportContext.relativeToRepo(mdPath),
        shardCount: report.summary.shardCount,
        batchReleaseGrade: report.summary.batchReleaseGrade,
        timeoutClassVisible: report.summary.timeoutClassVisible,
      },
      null,
      2,
    )}\n`,
  );
  if (report.generationStatus !== "pass") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
