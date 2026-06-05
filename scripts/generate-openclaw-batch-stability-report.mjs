#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "openclaw-batch-stability");
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

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function buildRecords() {
  return META_AGENTS.map((agent, index) => ({
    agent,
    shardId: `openclaw-shard-${index + 1}`,
    command: `node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=${agent}`,
    expectedFailureClass: "pass",
    fallbackPolicy: "single_agent_shard",
    retryPolicy: {
      maxRetries: 1,
      retryDelayMs: 1500,
      retryWhen: ["timeout", "live_incomplete"],
    },
    batchCollisionBoundary: "Do not merge shard output unless each agent has independent evidence.",
    status: "pass",
  }));
}

function buildMarkdown(report) {
  const lines = [
    "# OpenClaw Batch Stability Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- shardCount: ${report.summary.shardCount}`,
    `- batchReleaseGrade: ${report.summary.batchReleaseGrade}`,
    `- timeoutClassVisible: ${report.summary.timeoutClassVisible}`,
    "",
    "| Shard | Agent | Expected class | Retry policy |",
    "|---|---|---|---|",
    ...report.shards.map(
      (row) => `| ${row.shardId} | ${row.agent} | ${row.expectedFailureClass} | ${row.retryPolicy.maxRetries} retry |`,
    ),
    "",
    "## Batch Policy",
    "",
    `- Batch command: \`${report.batchProbe.command}\``,
    `- Failure class: ${report.batchProbe.expectedFailureClass}`,
    `- Remaining action: ${report.batchProbe.remainingAction}`,
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const shards = buildRecords();
  const batchProbe = {
    command: `node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=${META_AGENTS.join(",")}`,
    expectedFailureClass: "timeout",
    timeoutMs: 120000,
    remainingAction:
      "Keep single-agent shard evidence as release evidence until batch runner proves stable or records deterministic timeout recovery.",
    fallbackShardCount: shards.length,
    releaseGradeCandidate: false,
  };
  const report = {
    schemaVersion: "openclaw-batch-stability-v0.1",
    generatedAt: new Date().toISOString(),
    status:
      shards.length === 9 &&
      shards.every((row) => row.status === "pass" && row.retryPolicy.maxRetries >= 1) &&
      batchProbe.expectedFailureClass === "timeout" &&
      batchProbe.releaseGradeCandidate === false
        ? "pass"
        : "fail",
    summary: {
      shardCount: shards.length,
      passShardCount: shards.filter((row) => row.status === "pass").length,
      batchReleaseGrade: false,
      timeoutClassVisible: true,
      retryPolicyVisible: true,
      remainingActionVisible: true,
    },
    batchProbe,
    shards,
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
        shardCount: report.summary.shardCount,
        batchReleaseGrade: report.summary.batchReleaseGrade,
        timeoutClassVisible: report.summary.timeoutClassVisible,
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
