#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "runtime-probe-playbook");

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

const variants = [
  {
    runtime: "cursor",
    environment: "windows_native",
    probeCommand: "where cursor-agent && cursor-agent --version",
    expectedFailureClass: "native_harness_missing",
    expectedOutput: "version string or command-not-found",
    remainingAction: "Install or expose Cursor Agent CLI before P-024 can pass.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "cursor",
    environment: "wsl",
    probeCommand: "wsl -e sh -lc 'command -v cursor-agent && cursor-agent --version'",
    expectedFailureClass: "native_harness_missing",
    expectedOutput: "version string or command-not-found",
    remainingAction: "Install official Windows WSL cursor-agent and rerun native live.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "cursor",
    environment: "ide_subcommand",
    probeCommand: "cursor agent --help",
    expectedFailureClass: "output_format_missing",
    expectedOutput: "help text that lists print/json output support",
    remainingAction: "Only accept as live if print mode and JSON output are available.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "cursor",
    environment: "success_fixture",
    probeCommand: "$env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE='1'; node scripts/eval-meta-agents.mjs --runtime=cursor --live",
    expectedFailureClass: "pass",
    expectedOutput: "summary.passed includes cursor",
    remainingAction: "Fixture proves harness branch only; do not claim P-024 release pass.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "codex",
    environment: "live_cli",
    probeCommand: "node scripts/eval-meta-agents.mjs --runtime=codex --live",
    expectedFailureClass: "pass",
    expectedOutput: "orchestrationTaskBoardPacket and workerTaskPackets",
    remainingAction: "Rerun before release when Codex runtime changes.",
    releaseGradeCandidate: true,
  },
  {
    runtime: "codex",
    environment: "timeout_fixture",
    probeCommand: "$env:META_KIM_CODEX_LIVE_TIMEOUT_FIXTURE='1'; node scripts/eval-meta-agents.mjs --runtime=codex --live",
    expectedFailureClass: "pass",
    expectedOutput: "recoveredFromTimeout = true",
    remainingAction: "Use as recovery evidence, not as replacement for fresh live pass.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "claude",
    environment: "all_meta_agents",
    probeCommand: "node scripts/eval-meta-agents.mjs --runtime=claude --live --agent=meta-warden,meta-conductor,meta-genesis,meta-artisan,meta-sentinel,meta-librarian,meta-prism,meta-scout,meta-chrysalis",
    expectedFailureClass: "pass",
    expectedOutput: "9/9 agentResults ok",
    remainingAction: "Split into shards if batch cost or timeout rises.",
    releaseGradeCandidate: true,
  },
  {
    runtime: "claude",
    environment: "auth_missing",
    probeCommand: "node scripts/eval-meta-agents.mjs --runtime=claude --live",
    expectedFailureClass: "auth_missing",
    expectedOutput: "auth or CLI unavailable diagnostic",
    remainingAction: "Configure auth before claiming live pass.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "openclaw",
    environment: "single_agent_shards",
    probeCommand: "node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=<meta-agent>",
    expectedFailureClass: "pass",
    expectedOutput: "summary.passed includes openclaw for each shard",
    remainingAction: "Keep shard evidence when batch mode is unstable.",
    releaseGradeCandidate: true,
  },
  {
    runtime: "openclaw",
    environment: "batch_timeout",
    probeCommand: "node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=meta-warden,meta-conductor,meta-genesis,meta-artisan,meta-sentinel,meta-librarian,meta-prism,meta-scout,meta-chrysalis",
    expectedFailureClass: "timeout",
    expectedOutput: "timeout or live_incomplete diagnostic",
    remainingAction: "Use P-032 retry policy and shard fallback before release claim.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "all",
    environment: "path_missing",
    probeCommand: "command -v <runtime-cli> || where <runtime-cli>",
    expectedFailureClass: "runtime_unavailable",
    expectedOutput: "CLI path or not-found diagnostic",
    remainingAction: "Install CLI or record unsupported-with-reason.",
    releaseGradeCandidate: false,
  },
  {
    runtime: "all",
    environment: "output_format_missing",
    probeCommand: "<runtime-cli> --help",
    expectedFailureClass: "tool_unsupported",
    expectedOutput: "missing JSON or machine-readable output option",
    remainingAction: "Do not parse prose as release-grade machine evidence.",
    releaseGradeCandidate: false,
  },
];

function buildMarkdown(report) {
  const lines = [
    "# Runtime Probe Playbook",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- variantCount: ${report.summary.variantCount}`,
    `- releaseGradeCandidateCount: ${report.summary.releaseGradeCandidateCount}`,
    "",
    "| Runtime | Environment | Expected class | Release-grade candidate | Remaining action |",
    "|---|---|---|---|---|",
    ...report.variants.map(
      (row) =>
        `| ${row.runtime} | ${row.environment} | ${row.expectedFailureClass} | ${row.releaseGradeCandidate ? "yes" : "no"} | ${row.remainingAction.replaceAll("|", "\\|")} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const requiredEnvironments = [
    "windows_native",
    "wsl",
    "ide_subcommand",
    "path_missing",
    "auth_missing",
    "output_format_missing",
  ];
  const coveredEnvironments = new Set(variants.map((variant) => variant.environment));
  const missingEnvironments = requiredEnvironments.filter((item) => !coveredEnvironments.has(item));
  const report = {
    schemaVersion: "runtime-probe-playbook-v0.1",
    generatedAt: new Date().toISOString(),
    status:
      variants.length >= 12 &&
      missingEnvironments.length === 0 &&
      variants.some((item) => item.runtime === "cursor" && item.releaseGradeCandidate === false) &&
      variants.every((item) => item.probeCommand && item.expectedFailureClass && item.remainingAction)
        ? "pass"
        : "fail",
    summary: {
      variantCount: variants.length,
      runtimeCount: new Set(variants.map((variant) => variant.runtime)).size,
      releaseGradeCandidateCount: variants.filter((variant) => variant.releaseGradeCandidate).length,
      missingEnvironments,
      cursorNativeStillBlocked: true,
      githubCompleteClaimed: false,
    },
    variants,
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
        variantCount: report.summary.variantCount,
        missingEnvironments: report.summary.missingEnvironments,
        cursorNativeStillBlocked: report.summary.cursorNativeStillBlocked,
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
