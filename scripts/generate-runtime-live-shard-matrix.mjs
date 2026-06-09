#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getReportLabelsForPath } from "./meta-kim-i18n.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "runtime-live-shard-matrix");
const CANONICAL_AGENTS_DIR = path.join(REPO_ROOT, "canonical", "agents");

const META_AGENT_IDS = [
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

async function canonicalMetaAgentIds() {
  const files = await fs.readdir(CANONICAL_AGENTS_DIR);
  const ids = files
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""))
    .filter((id) => META_AGENT_IDS.includes(id))
    .sort((a, b) => META_AGENT_IDS.indexOf(a) - META_AGENT_IDS.indexOf(b));
  return ids.length > 0 ? ids : META_AGENT_IDS;
}

function runtimeRows(agentIds) {
  const shardArg = agentIds.join(",");
  return [
    {
      runtime: "claude",
      shardGroup: "all-meta-agents",
      command: `node scripts/eval-meta-agents.mjs --runtime=claude --live --agent=${shardArg}`,
      timeoutMs: 120000,
      expectedEvidenceKind: "live",
      expectedFailureClass: "pass",
      releaseGradeCandidate: true,
      artifact: "report.claude",
      remainingAction: "No Claude shard action when the all-meta-agents live pass remains current.",
      notes: "Can be split by --agent=<single meta agent> when batch stability or cost requires shards.",
    },
    {
      runtime: "codex",
      shardGroup: "single-governed-route",
      command: "node scripts/eval-meta-agents.mjs --runtime=codex --live",
      timeoutMs: 120000,
      expectedEvidenceKind: "live",
      expectedFailureClass: "pass",
      releaseGradeCandidate: true,
      artifact: "report.codex",
      remainingAction: "Use the timeout recovery fixture only as fallback evidence, not as a replacement for fresh live pass.",
      notes: "Codex validates Warden -> Conductor -> orchestrationTaskBoardPacket -> workerTaskPackets.",
    },
    {
      runtime: "openclaw",
      shardGroup: "single-meta-agent-shards",
      command: agentIds
        .map((agentId) => `node scripts/eval-meta-agents.mjs --runtime=openclaw --live --agent=${agentId}`)
        .join(" && "),
      timeoutMs: 120000,
      expectedEvidenceKind: "live",
      expectedFailureClass: "pass",
      releaseGradeCandidate: true,
      artifact: "report.openclaw",
      remainingAction: "Keep single-agent shard evidence until batch live timeout is separately stabilized.",
      notes: "Batch mode has timed out before; matrix preserves per-agent shard commands instead of overclaiming batch pass.",
    },
    {
      runtime: "cursor",
      shardGroup: "native-live-or-blocked",
      command: "node scripts/eval-meta-agents.mjs --runtime=cursor --live",
      fixtureCommand:
        "$env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE='1'; node scripts/eval-meta-agents.mjs --runtime=cursor --live; Remove-Item Env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE -ErrorAction SilentlyContinue",
      timeoutMs: 120000,
      expectedEvidenceKind: "unsupported",
      expectedFailureClass: "native_harness_missing",
      releaseGradeCandidate: false,
      artifact: "report.cursor",
      remainingAction:
        "Install or expose Cursor Agent CLI (`cursor-agent`) on the host or official Windows WSL path before claiming native live pass.",
      notes: "Success fixture proves the pass branch only; P-024 remains blocked until real Cursor Agent CLI returns governed JSON.",
    },
  ];
}

function buildMarkdown(report, outputPath) {
  const labels = getReportLabelsForPath(outputPath);
  const toolList = labels.toolList(labels.toolNames);
  const lines = [
    `# ${labels.runtimeLiveShardMatrixTitle(toolList)}`,
    "",
    `- ${labels.generatedAt}: ${report.generatedAt}`,
    `- ${labels.source}: ${report.source}`,
    `- ${labels.releaseGradeComplete}: ${report.summary.releaseGrade}`,
    "",
    `| ${labels.tool} | ${labels.shardGroup} | ${labels.expectedClass} | ${labels.releaseGradeCandidate} | ${labels.remainingAction} |`,
    "|---|---|---|---|---|",
    ...report.records.map(
      (row) =>
        `| ${row.runtime} | ${row.shardGroup} | ${row.expectedFailureClass} | ${labels.boolean(row.releaseGradeCandidate)} | ${row.remainingAction.replaceAll("|", "\\|")} |`,
    ),
    "",
    `## ${labels.commands}`,
    "",
    ...report.records.flatMap((row) => [
      `### ${row.runtime}`,
      "",
      `\`${row.command}\``,
      ...(row.fixtureCommand ? ["", `${labels.fixtureOnly}: \`${row.fixtureCommand}\``] : []),
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const agentIds = await canonicalMetaAgentIds();
  const records = runtimeRows(agentIds);
  const report = {
    schemaVersion: "runtime-live-shard-matrix-v0.1",
    generatedAt: new Date().toISOString(),
    source: "docs/ai-native-capability-gap-mvp-prd.zh-CN.md#P-033",
    agentIds,
    records,
    summary: {
      runtimeCount: records.length,
      shardRows: records.length,
      releaseGrade: records.every((row) => row.releaseGradeCandidate),
      blockedRuntimes: records
        .filter((row) => !row.releaseGradeCandidate)
        .map((row) => row.runtime),
      reportReadable: true,
    },
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report, mdPath));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        runtimeCount: report.summary.runtimeCount,
        blockedRuntimes: report.summary.blockedRuntimes,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
