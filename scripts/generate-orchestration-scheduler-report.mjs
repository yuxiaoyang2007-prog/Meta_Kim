#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReportContext } from "./report-context.mjs";

const reportContext = createReportContext();
const REPO_ROOT = reportContext.repoRoot;
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "orchestration-dependency-cases.json",
);
const OUTPUT_DIR = reportContext.resolveStatePath("orchestration-scheduler");

const relativeToRepo = reportContext.relativeToRepo;

function mermaidId(value) {
  return String(value).replace(/[^a-zA-Z0-9_]/g, "_");
}

function normalizeTask(task) {
  return {
    ...task,
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    estimatedMinutes: Number.isFinite(task.estimatedMinutes) ? task.estimatedMinutes : 10,
    blocked: task.blocked === true,
    blockedWaitReason: task.blockedWaitReason ?? null,
  };
}

function detectCycles(nodes) {
  const nodeById = new Map(nodes.map((node) => [node.taskPacketId, node]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(node, stack) {
    if (visiting.has(node.taskPacketId)) {
      const cycleStart = stack.indexOf(node.taskPacketId);
      cycles.push([...stack.slice(cycleStart), node.taskPacketId]);
      return;
    }
    if (visited.has(node.taskPacketId)) return;
    visiting.add(node.taskPacketId);
    for (const dependency of node.dependsOn) {
      const dependencyNode = nodeById.get(dependency);
      if (dependencyNode) visit(dependencyNode, [...stack, dependency]);
    }
    visiting.delete(node.taskPacketId);
    visited.add(node.taskPacketId);
  }

  for (const node of nodes) {
    visit(node, [node.taskPacketId]);
  }
  return cycles;
}

function buildEdges(nodes) {
  const nodeById = new Map(nodes.map((node) => [node.taskPacketId, node]));
  return nodes.flatMap((node) =>
    node.dependsOn.map((dependency) => {
      const fromNode = nodeById.get(dependency);
      return {
        from: dependency,
        to: node.taskPacketId,
        valid: Boolean(fromNode),
        fromBlocked: fromNode?.blocked === true,
        toBlocked: node.blocked === true,
      };
    }),
  );
}

function scheduleNodes(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.taskPacketId, node]));
  const incoming = new Map(nodes.map((node) => [node.taskPacketId, node.dependsOn.length]));
  const outgoing = new Map(nodes.map((node) => [node.taskPacketId, []]));
  for (const edge of edges) {
    if (!edge.valid) continue;
    outgoing.get(edge.from)?.push(edge.to);
  }

  const ready = nodes
    .filter((node) => incoming.get(node.taskPacketId) === 0)
    .map((node) => node.taskPacketId);
  const ordered = [];
  while (ready.length > 0) {
    const current = ready.shift();
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      incoming.set(next, incoming.get(next) - 1);
      if (incoming.get(next) === 0) ready.push(next);
    }
  }

  const timings = new Map();
  const predecessor = new Map();
  for (const taskId of ordered) {
    const node = nodeById.get(taskId);
    const dependencyTimings = node.dependsOn
      .map((dependency) => timings.get(dependency))
      .filter(Boolean);
    const blockedByDependency = node.dependsOn.some((dependency) => nodeById.get(dependency)?.blocked);
    const start = dependencyTimings.length
      ? Math.max(...dependencyTimings.map((timing) => timing.finish))
      : 0;
    const bestDependency = dependencyTimings.find((timing) => timing.finish === start);
    if (bestDependency) predecessor.set(taskId, bestDependency.taskPacketId);
    timings.set(taskId, {
      taskPacketId: taskId,
      start,
      finish: node.blocked || blockedByDependency ? start : start + node.estimatedMinutes,
      blocked: node.blocked || blockedByDependency,
      blockedWaitReason: node.blocked
        ? node.blockedWaitReason ?? "blocked_node"
        : blockedByDependency
          ? "blocked_dependency"
          : null,
    });
  }

  const runnableTimings = [...timings.values()].filter((timing) => !timing.blocked);
  const criticalEnd = runnableTimings.reduce(
    (max, timing) => (timing.finish > max.finish ? timing : max),
    { finish: 0, taskPacketId: null },
  );
  const criticalPath = [];
  let cursor = criticalEnd.taskPacketId;
  while (cursor) {
    criticalPath.unshift(cursor);
    cursor = predecessor.get(cursor);
  }

  const layerByStart = new Map();
  for (const timing of timings.values()) {
    const key = String(timing.start);
    if (!layerByStart.has(key)) layerByStart.set(key, []);
    layerByStart.get(key).push(timing.taskPacketId);
  }
  const layers = [...layerByStart.entries()]
    .map(([start, taskIds]) => ({ start: Number(start), taskIds }))
    .sort((a, b) => a.start - b.start);

  const totalWorkMinutes = nodes
    .filter((node) => !node.blocked)
    .reduce((sum, node) => sum + node.estimatedMinutes, 0);
  const maxLayerWidth = layers.reduce((max, layer) => Math.max(max, layer.taskIds.length), 1);
  const criticalPathMinutes = criticalEnd.finish;
  const parallelUtilization =
    criticalPathMinutes > 0
      ? Number((totalWorkMinutes / (criticalPathMinutes * maxLayerWidth)).toFixed(2))
      : 0;

  return {
    ordered,
    timings: [...timings.values()],
    layers,
    criticalPath,
    criticalPathMinutes,
    totalWorkMinutes,
    maxLayerWidth,
    parallelUtilization,
    serialBottleneck: criticalPath[criticalPath.length - 1] ?? null,
    blockedWaitReason:
      [...timings.values()].find((timing) => timing.blocked)?.blockedWaitReason ?? null,
  };
}

function buildMermaid(nodes, edges, schedule) {
  const lines = [
    "flowchart TD",
    ...nodes.map((node) => {
      const timing = schedule.timings.find((entry) => entry.taskPacketId === node.taskPacketId);
      const label = `${node.roleDisplayName}:${node.roleInstanceId}\\n${node.parallelGroup}\\n${timing?.start ?? 0}-${timing?.finish ?? 0}m`;
      const suffix = node.blocked ? ":::blocked" : "";
      return `  ${mermaidId(node.taskPacketId)}["${label}"]${suffix}`;
    }),
    ...edges
      .filter((edge) => edge.valid)
      .map((edge) => `  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`),
  ];
  if (nodes.some((node) => node.blocked)) {
    lines.push("  classDef blocked fill:#f8d7da,stroke:#842029,color:#842029");
  }
  return lines.join("\n");
}

function analyzeCase(testCase) {
  const nodes = testCase.tasks.map(normalizeTask);
  const edges = buildEdges(nodes);
  const orphanDependencies = edges.filter((edge) => !edge.valid);
  const cycles = detectCycles(nodes);
  const blockedDependencyViolations = edges.filter(
    (edge) => edge.valid && edge.fromBlocked && !edge.toBlocked,
  );
  const missingFieldFindings = [];
  for (const node of nodes) {
    for (const field of [
      "taskPacketId",
      "owner",
      "roleDisplayName",
      "roleInstanceId",
      "parallelGroup",
      "mergeOwner",
      "shardScope",
    ]) {
      if (!node[field]) {
        missingFieldFindings.push({ taskPacketId: node.taskPacketId ?? "unknown", field });
      }
    }
    if (!Array.isArray(node.dependsOn)) {
      missingFieldFindings.push({ taskPacketId: node.taskPacketId ?? "unknown", field: "dependsOn" });
    }
  }

  const schedule = scheduleNodes(nodes, edges);
  const status =
    nodes.length > 0 &&
    missingFieldFindings.length === 0 &&
    orphanDependencies.length === 0 &&
    cycles.length === 0 &&
    blockedDependencyViolations.length === 0
      ? "pass"
      : "fail";

  return {
    caseId: testCase.id,
    description: testCase.description,
    status,
    nodeCount: nodes.length,
    edgeCount: edges.filter((edge) => edge.valid).length,
    nodes,
    edges,
    orphanDependencies,
    cycles,
    blockedDependencyViolations,
    missingFieldFindings,
    schedule,
    mermaid: buildMermaid(nodes, edges, schedule),
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Orchestration Scheduler Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- caseCount: ${report.summary.caseCount}`,
    `- casesWithDependencies: ${report.summary.casesWithDependencies}`,
    `- totalEdges: ${report.summary.totalEdges}`,
    `- cycleCount: ${report.summary.cycleCount}`,
    `- orphanDependencyCount: ${report.summary.orphanDependencyCount}`,
    `- blockedDependencyViolationCount: ${report.summary.blockedDependencyViolationCount}`,
    "",
    "## Cases",
    "",
    "| Case | Status | Nodes | Edges | Critical Path | Critical Minutes | Parallel Utilization | Blocked Wait |",
    "|---|---|---:|---:|---|---:|---:|---|",
    ...report.cases.map(
      (testCase) =>
        `| ${testCase.caseId} | ${testCase.status} | ${testCase.nodeCount} | ${testCase.edgeCount} | ${testCase.schedule.criticalPath.join(" -> ") || "none"} | ${testCase.schedule.criticalPathMinutes} | ${testCase.schedule.parallelUtilization} | ${testCase.schedule.blockedWaitReason ?? "none"} |`,
    ),
    "",
    "## Mermaid Preview",
    "",
    "```mermaid",
    report.cases[0]?.mermaid ?? "flowchart TD",
    "```",
    "",
    "## Checks",
    "",
    "- At least five DAG cases are simulated.",
    "- At least three cases have non-empty dependsOn edges.",
    "- orphanDependencies and cycleCount must stay 0.",
    "- Blocked nodes must stay visible and must not unlock downstream pass edges.",
    "- Every case records criticalPath, parallelUtilization, serialBottleneck, and blockedWaitReason.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const cases = scenario.cases.map(analyzeCase);
  const summary = {
    caseCount: cases.length,
    passCount: cases.filter((testCase) => testCase.status === "pass").length,
    casesWithDependencies: cases.filter((testCase) => testCase.edgeCount > 0).length,
    totalEdges: cases.reduce((sum, testCase) => sum + testCase.edgeCount, 0),
    cycleCount: cases.reduce((sum, testCase) => sum + testCase.cycles.length, 0),
    orphanDependencyCount: cases.reduce(
      (sum, testCase) => sum + testCase.orphanDependencies.length,
      0,
    ),
    blockedDependencyViolationCount: cases.reduce(
      (sum, testCase) => sum + testCase.blockedDependencyViolations.length,
      0,
    ),
    blockedCaseCount: cases.filter((testCase) => testCase.schedule.blockedWaitReason).length,
    requiredScheduleFields: [
      "criticalPath",
      "parallelUtilization",
      "serialBottleneck",
      "blockedWaitReason",
    ],
  };
  const status =
    summary.caseCount >= 5 &&
    summary.casesWithDependencies >= 3 &&
    summary.totalEdges >= 7 &&
    summary.cycleCount === 0 &&
    summary.orphanDependencyCount === 0 &&
    summary.blockedDependencyViolationCount === 0 &&
    summary.blockedCaseCount >= 1 &&
    cases.every((testCase) => testCase.status === "pass" && testCase.schedule.criticalPath.length > 0)
      ? "pass"
      : "fail";
  const report = {
    schemaVersion: "orchestration-scheduler-report-v0.1",
    generatedAt: new Date().toISOString(),
    scenario: relativeToRepo(SCENARIO_PATH),
    status,
    summary,
    cases,
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
        caseCount: report.summary.caseCount,
        casesWithDependencies: report.summary.casesWithDependencies,
        totalEdges: report.summary.totalEdges,
        cycleCount: report.summary.cycleCount,
        orphanDependencyCount: report.summary.orphanDependencyCount,
        blockedDependencyViolationCount: report.summary.blockedDependencyViolationCount,
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
